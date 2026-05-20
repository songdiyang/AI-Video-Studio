/**
 * 剧本生成处理器（支持连续剧集）
 *
 * 双路径兼容：
 *   - 前端 POST /api/scripts/generate：预创建了 scripts 记录 → 本处理器识别并更新
 *   - AI 助手 Executor 路径：无预创建 → 本处理器自行创建 scripts 记录
 *
 * input:  { title, description, style, length, textModel, projectId, episodeNumber, userId }
 * output: { content, tokens, provider, episodeNumber, scriptId }
 */

const handleBaseTextModelCall = require('../base/baseTextModelCall');
const { queryAll, queryOne, execute } = require('../../../dbHelper');
const { getStoryStyle, getNarrativePerspective } = require('../../../utils/getProjectStyle');

// 根据剧本长度获取场景数量配置
function getSceneConfig(length) {
  const configs = {
    '短篇': { duration: '1~3分钟', minScenes: 1, maxScenes: 3, avgDuration: '30秒~1分钟' },
    '中篇': { duration: '3~5分钟', minScenes: 3, maxScenes: 5, avgDuration: '1~1.5分钟' },
    '长篇': { duration: '5~10分钟', minScenes: 5, maxScenes: 10, avgDuration: '1~2分钟' }
  };
  return configs[length] || configs['短篇'];
}

async function handleScriptGeneration(inputParams, onProgress) {
  const { title, description, style, length, textModel: modelName, projectId, episodeNumber, userId } = inputParams;

  if (!modelName) {
    throw new Error('textModel 参数是必需的');
  }
  if (!projectId) {
    throw new Error('projectId 参数是必需的');
  }
  const targetEpisode = episodeNumber || 1;
  const effectiveUserId = userId || 0;

  // ── 预处理：确保 scripts 记录存在（双路径兼容）──
  let scriptId = null;
  const existingScript = await queryOne(
    'SELECT id, status, updated_at FROM scripts WHERE project_id = ? AND episode_number = ?',
    [projectId, targetEpisode]
  );

  if (existingScript) {
    if (existingScript.status === 'generating') {
      // 工作流本身就在执行生成 → 直接复用（前端路由层已做并发防护）
      console.log(`[ScriptGeneration] 复用已有 generating 记录: id=${existingScript.id}`);
      await execute(
        'UPDATE scripts SET title = ?, updated_at = NOW() WHERE id = ?',
        [title || existingScript.title || `第${targetEpisode}集`, existingScript.id]
      );
      scriptId = existingScript.id;
    } else if (existingScript.status === 'draft' || existingScript.status === 'failed') {
      await execute(
        'UPDATE scripts SET status = ?, title = ?, updated_at = NOW() WHERE id = ?',
        ['generating', title || `第${targetEpisode}集`, existingScript.id]
      );
      scriptId = existingScript.id;
    } else if (existingScript.status === 'completed') {
      // 已完成 → 用户要求重新生成，覆盖原有剧本（与前端路由层行为一致）
      console.log(`[ScriptGeneration] 第${targetEpisode}集已完成，覆盖重写`);
      await execute(
        'UPDATE scripts SET status = ?, title = ?, content = ?, updated_at = NOW() WHERE id = ?',
        ['generating', title || `第${targetEpisode}集`, '', existingScript.id]
      );
      scriptId = existingScript.id;
    } else {
      throw new Error(`第${targetEpisode}集已存在（状态：${existingScript.status}），无法生成`);
    }
  } else {
    // 不存在 → 新建记录
    const insResult = await execute(
      'INSERT INTO scripts (user_id, project_id, episode_number, title, content, status) VALUES (?, ?, ?, ?, ?, ?)',
      [effectiveUserId, projectId, targetEpisode, title || `第${targetEpisode}集`, '', 'generating']
    );
    scriptId = insResult.insertId;
    console.log(`[ScriptGeneration] 已创建 scripts 记录: id=${scriptId}, episode=${targetEpisode}`);
  }

  if (onProgress) onProgress(10);

  // === 性能优化：限制前情回顾的长度，避免 prompt 过长 ===
  // 最多只加载最近 3 集的完整内容，更早的集只加载摘要
  const MAX_FULL_EPISODES = 3;
  const MAX_SUMMARY_LENGTH = 500; // 每集摘要最大字符数
  let previousEpisodesContext = '';
  
  if (projectId && targetEpisode > 1) {
    const previousScripts = await queryAll(
      `SELECT episode_number, title, content FROM scripts 
       WHERE project_id = ? AND episode_number < ? AND status = 'completed'
       ORDER BY episode_number ASC`,
      [projectId, targetEpisode]
    );
    
    if (previousScripts.length > 0) {
      previousEpisodesContext = '\n\n【前情回顾 - 请基于以下已有剧情继续创作，保持人物、情节、风格的连贯性】\n';
      
      // 性能优化：分类处理前集内容
      const totalEpisodes = previousScripts.length;
      const fullContentStart = Math.max(0, totalEpisodes - MAX_FULL_EPISODES);
      
      previousScripts.forEach((script, index) => {
        if (index < fullContentStart) {
          // 早期集数：只加载摘要（前 N 个字符）
          const summary = script.content.length > MAX_SUMMARY_LENGTH 
            ? script.content.substring(0, MAX_SUMMARY_LENGTH) + '...（内容已截断）'
            : script.content;
          previousEpisodesContext += `\n--- 第${script.episode_number}集：${script.title} （摘要） ---\n${summary}\n`;
        } else {
          // 最近几集：加载完整内容
          previousEpisodesContext += `\n--- 第${script.episode_number}集：${script.title} ---\n${script.content}\n`;
        }
      });
      
      previousEpisodesContext += '\n【前情回顾结束】\n';
      
      // 日志输出优化信息
      console.log(`[剧本生成] 前情回顾优化: 共${totalEpisodes}集，完整加载${Math.min(totalEpisodes, MAX_FULL_EPISODES)}集，摘要加载${Math.max(0, totalEpisodes - MAX_FULL_EPISODES)}集`);
    }
  }

  if (onProgress) onProgress(20);

  // 查询项目级叙事风格和约束
  const { storyStyle: projectStoryStyle, storyConstraints } = await getStoryStyle(projectId);
  if (!projectStoryStyle) {
    throw new Error('该项目尚未设置叙事风格。请先在「工程设置」中填写叙事风格（如热血少年漫、悬疑推理等），再生成剧本。');
  }
  const effectiveStyle = projectStoryStyle;
  const constraintLine = storyConstraints ? `\n【创作约束】${storyConstraints}` : '';

  // 获取拍摄视角设置
  const { promptInstruction: perspectiveInstruction } = await getNarrativePerspective(projectId);
  const perspectiveLine = perspectiveInstruction ? `\n${perspectiveInstruction}` : '';

  // 获取场景数量配置
  const sceneConfig = getSceneConfig(length);
  const sceneRequirement = `\n\n## 场景数量要求\n
本集剧本时长为 **${sceneConfig.duration}**，请严格控制场景数量：
- 场景数量：${sceneConfig.minScenes}~${sceneConfig.maxScenes} 个场景
- 每个场景平均时长：${sceneConfig.avgDuration}
- 场景之间要有自然的过渡和连接
- 确保整体节奏协调，剧情完整`;

  // 构建用户提示词
  let userPrompt;
  if (targetEpisode === 1) {
    userPrompt = `请根据以下信息创作一个${length || '短篇'}(${sceneConfig.duration})的${effectiveStyle}风格视频剧本（第1集）：
标题：${title || '未命名'}
故事概述：${description || ''}${constraintLine}${perspectiveLine}${sceneRequirement}

要求：
1. 分成 ${sceneConfig.minScenes}~${sceneConfig.maxScenes} 个场景，每个场景独立完整
2. 每个场景包含画面描述和对白
3. 适合视频化呈现
4. 作为第1集，需要做好人物和世界观的铺垫${storyConstraints ? '\n5. 严格遵守创作约束中的限制条件' : ''}`;
  } else {
    userPrompt = `请根据以下信息继续创作视频剧本的第${targetEpisode}集（${sceneConfig.duration}）：
本集标题：${title || `第${targetEpisode}集`}
${previousEpisodesContext}${constraintLine}${perspectiveLine}${sceneRequirement}
${description ? `\n【用户期望的故事走向】\n${description}\n（请参考此走向发展剧情，但必须与前面的剧情保持连贯）\n` : ''}
要求：
1. 【重要】必须延续前面集数的人物设定、剧情发展和叙事风格
2. ${description ? '参考用户提供的故事走向建议，但要确保剧情逻辑自洽' : '根据前集剧情自然发展故事'}
3. 分成 ${sceneConfig.minScenes}~${sceneConfig.maxScenes} 个场景，每个场景独立完整
4. 每个场景包含画面描述和对白
5. 适合视频化呈现
6. 这是第${targetEpisode}集，需要承接前集剧情并推进故事发展
7. 保持角色性格和说话风格的一致性${storyConstraints ? '\n8. 严格遵守创作约束中的限制条件' : ''}`;
  }

  if (onProgress) onProgress(30);

  const fullPrompt = `你是一个专业的视频剧本创作助手，擅长创作连续剧本，能够保持多集之间的剧情连贯性和角色一致性。

## 输出格式要求

请使用以下标准剧本格式输出，确保清晰易读：

1. **场景标题**: 使用 「## 场景X：场景名称」 格式
2. **场景描述**: 用斜体包裹，如 「*场景描述内容*」
3. **角色对白**: 使用 「**角色名**：“对白内容”」 格式
4. **动作指示**: 用圆括号包裹，如 「（角色做了某个动作）」
5. **场景转换**: 用分隔线 「---」 分隔不同场景
6. **空行**: 对白之间保留空行，增强可读性

示例：

## 场景1：客厅

*温暖的客厅，阳光从落地窗洒入，沙发上摆放着几本杂志*

**小明**：“你今天怎么这么早就回来了？”

（小明放下手中的书，抬头看向门口）

**小红**：“公司今天提前下班。”

---

## 场景2：厨房
...

---

${userPrompt}`;

  const result = await handleBaseTextModelCall({
    prompt: fullPrompt,
    textModel: modelName,
    maxTokens: 8192,
    temperature: 0.9
  }, onProgress);

  if (onProgress) onProgress(90);

  // ── 后处理：不再直接写库，由 save-from-workflow 统一回写 ──
  // 工作流引擎只负责生成内容，将结果存入 result_data 供前端回调使用
  console.log(`[ScriptGeneration] 剧本生成完成: scriptId=${scriptId}, tokens=${result.tokens || 0}，等待 save-from-workflow 回写`);

  return {
    content: result.content,
    tokens: result.tokens || 0,
    provider: result._model?.provider || 'unknown',
    modelName,
    episodeNumber: targetEpisode,
    scriptId
  };
}

module.exports = handleScriptGeneration;
