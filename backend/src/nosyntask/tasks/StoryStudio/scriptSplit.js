/**
 * 剧本拆集处理器（将长文本按高潮点拆分为多集）
 *
 * 流程：
 * 1. 接收用户原始长文本 + 每集分钟数
 * 2. 调用文本模型分析全文，识别高潮/转折/悬念
 * 3. 在自然拆分点切分文本（不增删改任何原文）
 * 4. 返回拆分结果数组
 *
 * input:  { rawText, minutesPerEpisode, textModel, projectId }
 * output: { episodes: [{ episodeNumber, title, content, charCount, estimatedMinutes }] }
 */

const handleBaseTextModelCall = require('../base/baseTextModelCall');

// 每个分镜约5秒，每分镜约50字（经验值）
const CHARS_PER_SHOT = 50;
const SECONDS_PER_SHOT = 5;

/**
 * 计算每集目标字符数范围
 */
function getTargetCharRange(minutesPerEpisode) {
  const targetShots = (minutesPerEpisode * 60) / SECONDS_PER_SHOT;
  const targetChars = targetShots * CHARS_PER_SHOT;
  // 允许 ±2 分钟浮动
  const minChars = ((minutesPerEpisode - 2) * 60 / SECONDS_PER_SHOT) * CHARS_PER_SHOT;
  const maxChars = ((minutesPerEpisode + 2) * 60 / SECONDS_PER_SHOT) * CHARS_PER_SHOT;
  return { targetChars: Math.round(targetChars), minChars: Math.max(1, Math.round(minChars)), maxChars: Math.round(maxChars) };
}

/**
 * 从 AI 响应中提取 JSON 数组
 */
function extractJsonArray(text) {
  // 尝试直接解析
  try {
    const parsed = JSON.parse(text);
    if (Array.isArray(parsed)) return parsed;
  } catch (_) {}

  // 尝试从 markdown 代码块中提取
  const codeBlockMatch = text.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
  if (codeBlockMatch) {
    try {
      const parsed = JSON.parse(codeBlockMatch[1]);
      if (Array.isArray(parsed)) return parsed;
    } catch (_) {}
  }

  // 尝试找到第一个 [ 和最后一个 ]
  const firstBracket = text.indexOf('[');
  const lastBracket = text.lastIndexOf(']');
  if (firstBracket !== -1 && lastBracket !== -1 && lastBracket > firstBracket) {
    try {
      const parsed = JSON.parse(text.substring(firstBracket, lastBracket + 1));
      if (Array.isArray(parsed)) return parsed;
    } catch (_) {}
  }

  return null;
}

/**
 * 用 marker 在原文中定位拆分点
 */
function findMarkerInText(rawText, marker, searchFrom) {
  if (!marker) return -1;
  // 清理 marker：去掉首尾空白和省略号
  const cleanMarker = marker.replace(/[…。…\s]+$/g, '').replace(/^\s+/g, '');
  const pos = rawText.indexOf(cleanMarker, searchFrom);
  return pos;
}

async function handleScriptSplit(inputParams, onProgress) {
  const { rawText, minutesPerEpisode = 3, textModel: modelName, projectId } = inputParams;

  if (!rawText || rawText.trim().length === 0) {
    throw new Error('缺少必要参数: rawText（用户原始文本）');
  }

  if (!modelName) {
    throw new Error('textModel 参数是必需的');
  }

  console.log('[ScriptSplit] 开始拆集，文本长度:', rawText.length, '字，每集目标:', minutesPerEpisode, '分钟');
  if (onProgress) onProgress(5);

  const { targetChars, minChars, maxChars } = getTargetCharRange(minutesPerEpisode);
  const estimatedEpisodes = Math.max(1, Math.round(rawText.length / targetChars));

  console.log(`[ScriptSplit] 目标: 每集 ${targetChars} 字 (${minChars}~${maxChars})，预估 ${estimatedEpisodes} 集`);

  // Step 1: 调用文本模型分析全文
  if (onProgress) onProgress(15);

  const splitPrompt = `你是一个专业的剧本编辑，任务是将一篇长文本剧本拆分为多集。

## 严格规则（必须遵守）

1. **绝对不能增加、删除、修改用户的任何文字**，拆分后的每集内容拼接起来必须与原文完全一致
2. 拆分点必须选在自然的场景切换、时间跳跃、段落间隙处
3. 每集约 ${minutesPerEpisode} 分钟（约 ${targetChars} 字），可浮动 ±2 分钟（${minChars}~${maxChars} 字）
4. 优先在剧情高潮、转折点、悬念处结束一集，吸引观众继续观看
5. 如果某段情节连贯不可分割，宁可超出字数范围也不要强行拆断

## 用户原文

${rawText}

## 输出要求

请输出一个 JSON 数组，每项包含：
- "episodeNumber": 集号（从1开始）
- "title": 根据本集内容概括的标题（10字以内）
- "startMarker": 本集开头原文的前20个字（用于定位）
- "endMarker": 本集结尾原文的后20个字（用于定位）

只输出 JSON 数组，不要输出其他内容。`;

  const result = await handleBaseTextModelCall({
    prompt: splitPrompt,
    textModel: modelName,
    maxTokens: 4096,
    temperature: 0.3
  }, onProgress);

  if (onProgress) onProgress(60);

  // Step 2: 解析 AI 响应
  const aiSplits = extractJsonArray(result.content);

  if (!aiSplits || aiSplits.length === 0) {
    console.warn('[ScriptSplit] AI 返回的 JSON 解析失败，使用等分降级策略');
    // 降级：等分策略
    return fallbackEqualSplit(rawText, minutesPerEpisode);
  }

  console.log(`[ScriptSplit] AI 返回 ${aiSplits.length} 个拆分点`);

  // Step 3: 用 marker 在原文中定位，提取每集内容
  if (onProgress) onProgress(70);

  const episodes = [];
  let searchFrom = 0;

  for (let i = 0; i < aiSplits.length; i++) {
    const split = aiSplits[i];
    const startMarker = split.startMarker || '';
    const endMarker = split.endMarker || '';

    // 定位本集起始位置
    let startPos = searchFrom;
    if (startMarker) {
      const found = findMarkerInText(rawText, startMarker, searchFrom);
      if (found !== -1) startPos = found;
    }

    // 定位本集结束位置
    let endPos = rawText.length;
    if (i < aiSplits.length - 1 && endMarker) {
      const found = findMarkerInText(rawText, endMarker, startPos);
      if (found !== -1) endPos = found + endMarker.trim().length;
    }

    // 提取本集内容
    const content = rawText.substring(startPos, endPos).trim();

    if (content.length > 0) {
      episodes.push({
        episodeNumber: i + 1,
        title: split.title || `第${i + 1}集`,
        content,
        charCount: content.length,
        estimatedMinutes: Math.round(content.length / CHARS_PER_SHOT * SECONDS_PER_SHOT / 60 * 10) / 10
      });
      searchFrom = endPos;
    }
  }

  // Step 4: 校验拼接完整性
  if (onProgress) onProgress(85);

  const combinedContent = episodes.map(e => e.content).join('');
  const coverageRatio = combinedContent.length / rawText.trim().length;

  if (coverageRatio < 0.8) {
    console.warn(`[ScriptSplit] 拼接覆盖率仅 ${(coverageRatio * 100).toFixed(1)}%，使用等分降级策略`);
    return fallbackEqualSplit(rawText, minutesPerEpisode);
  }

  // 如果覆盖率不完全，把遗漏的尾部内容追加到最后一集
  if (coverageRatio < 1.0 && episodes.length > 0) {
    const lastEnd = rawText.indexOf(episodes[episodes.length - 1].content) + episodes[episodes.length - 1].content.length;
    const remaining = rawText.substring(lastEnd).trim();
    if (remaining.length > 0) {
      episodes[episodes.length - 1].content += '\n' + remaining;
      episodes[episodes.length - 1].charCount = episodes[episodes.length - 1].content.length;
      episodes[episodes.length - 1].estimatedMinutes = Math.round(episodes[episodes.length - 1].charCount / CHARS_PER_SHOT * SECONDS_PER_SHOT / 60 * 10) / 10;
      console.log(`[ScriptSplit] 尾部遗漏 ${remaining.length} 字已追加到第${episodes.length}集`);
    }
  }

  console.log(`[ScriptSplit] 拆集完成: ${episodes.length} 集，覆盖率 ${(coverageRatio * 100).toFixed(1)}%`);

  if (onProgress) onProgress(100);

  return { episodes };
}

/**
 * 降级策略：等分拆集
 */
function fallbackEqualSplit(rawText, minutesPerEpisode) {
  const { targetChars } = getTargetCharRange(minutesPerEpisode);
  const totalLen = rawText.trim().length;
  const episodeCount = Math.max(1, Math.round(totalLen / targetChars));
  const chunkSize = Math.ceil(totalLen / episodeCount);

  const episodes = [];
  for (let i = 0; i < episodeCount; i++) {
    const start = i * chunkSize;
    const end = Math.min(start + chunkSize, totalLen);
    const content = rawText.substring(start, end).trim();

    if (content.length > 0) {
      episodes.push({
        episodeNumber: i + 1,
        title: `第${i + 1}集`,
        content,
        charCount: content.length,
        estimatedMinutes: Math.round(content.length / CHARS_PER_SHOT * SECONDS_PER_SHOT / 60 * 10) / 10
      });
    }
  }

  console.log(`[ScriptSplit] 等分降级: ${episodes.length} 集`);
  return { episodes };
}

module.exports = handleScriptSplit;
