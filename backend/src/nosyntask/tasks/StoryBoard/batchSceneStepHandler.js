/**
 * 批量分镜 - 单场景步骤处理器
 * 
 * 从 batchStoryboardGeneration.js 中提取的单场景生成逻辑，
 * 用于动态步骤模式下每个场景独立生成分镜。
 * 
 * input:  { sceneContent, sceneName, sceneNumber, totalScenes, scriptTitle, textModel, think }
 * output: { scenes, totalDuration, lastSceneEndState, tokens }
 */

const handleBaseTextModelCall = require('../base/baseTextModelCall');
const { filterNonCharacters } = require('../../../utils/characterFilter');
const { stripThinkTags, extractCodeBlock, extractJSON, stripInvisible } = require('../../../utils/washBody');
const { getBatchSceneDurationConfig } = require('../../../durationConfigService');
const { queryAll } = require('../../../dbHelper');

// 默认值（当数据库配置不可用时回退使用）
const DEFAULT_MIN_SCENE_DURATION = 15;
const DEFAULT_MAX_SCENE_DURATION = 60;
const DEFAULT_SHOT_DURATION = 2;
const DEFAULT_TOLERANCE = 2;

/**
 * 从分镜描述中提取角色名称（严格模式）
 */
function extractCharactersFromDescription(description, knownCharacters = new Set()) {
  if (!description) return [];
  const extracted = new Set();
  for (const char of knownCharacters) {
    if (char && char.length >= 2 && description.includes(char)) {
      extracted.add(char);
    }
  }
  return Array.from(extracted);
}

/**
 * 分镜时长校验与调整
 * @param {Array} scenes 分镜数组
 * @param {number} minDuration 最小总时长
 * @param {number} maxDuration 最大总时长
 * @param {number} tolerance 偏差容忍值（秒）
 * @returns {{ scenes: Array, totalDuration: number, adjusted: boolean, needsRegeneration: boolean }}
 */
function adjustSceneDurations(scenes, minDuration, maxDuration, tolerance = 2) {
  if (!scenes || scenes.length === 0) return { scenes: [], totalDuration: 0, adjusted: false, needsRegeneration: false };
  
  let totalDuration = scenes.reduce((sum, s) => sum + (s.duration || DEFAULT_SHOT_DURATION), 0);
  console.log('[BatchSceneStep] 原始总时长:', totalDuration, '秒, 允许范围:', minDuration, '-', maxDuration, '秒, 容忍偏差:', tolerance, '秒');
  
  if (totalDuration >= minDuration && totalDuration <= maxDuration) {
    console.log('[BatchSceneStep] 时长在合理范围内，无需调整');
    return { scenes, totalDuration, adjusted: false, needsRegeneration: false };
  }
  
  let deviation = 0;
  if (totalDuration < minDuration) {
    deviation = minDuration - totalDuration;
  } else if (totalDuration > maxDuration) {
    deviation = totalDuration - maxDuration;
  }
  
  console.log('[BatchSceneStep] 时长偏差:', deviation, '秒');
  
  if (deviation > tolerance) {
    console.log('[BatchSceneStep] 时长严重超出范围（偏差', deviation, '秒 > 容忍值', tolerance, '秒），需要重新生成');
    return { scenes, totalDuration, adjusted: false, needsRegeneration: true };
  }
  
  console.log('[BatchSceneStep] 偏差在容忍范围内，执行比例缩放调整');
  
  let targetDuration = totalDuration < minDuration ? minDuration : maxDuration;
  const scaleFactor = targetDuration / totalDuration;
  scenes = scenes.map(s => ({
    ...s,
    duration: Math.max(1, Math.round((s.duration || DEFAULT_SHOT_DURATION) * scaleFactor))
  }));
  
  totalDuration = scenes.reduce((sum, s) => sum + s.duration, 0);
  
  const diff = targetDuration - totalDuration;
  if (diff !== 0 && scenes.length > 0) {
    let maxIdx = 0;
    let maxDur = scenes[0].duration;
    for (let i = 1; i < scenes.length; i++) {
      if (scenes[i].duration > maxDur) {
        maxDur = scenes[i].duration;
        maxIdx = i;
      }
    }
    const newDur = scenes[maxIdx].duration + diff;
    if (newDur >= 1) {
      scenes[maxIdx] = { ...scenes[maxIdx], duration: newDur };
      totalDuration = targetDuration;
    }
  }
  
  console.log('[BatchSceneStep] 比例缩放调整后总时长:', totalDuration, '秒');
  return { scenes, totalDuration, adjusted: true, needsRegeneration: false };
}

/**
 * 后处理分镜数据
 */
function postProcessScenes(scenes) {
  if (!scenes || scenes.length === 0) return scenes;
  
  const allKnownCharacters = new Set();
  scenes.forEach(scene => {
    if (Array.isArray(scene.characters)) {
      scene.characters.forEach(c => allKnownCharacters.add(c));
    }
  });
  
  scenes = scenes.map((scene) => {
    const originalChars = new Set(scene.characters || []);
    const textsToCheck = [scene.description, scene.startFrame, scene.endFrame, scene.endState]
      .filter(Boolean).join(' ');
    const extractedChars = extractCharactersFromDescription(textsToCheck, allKnownCharacters);
    const mergedChars = new Set([...originalChars, ...extractedChars]);
    
    return {
      ...scene,
      characters: filterNonCharacters(Array.from(mergedChars)),
      duration: scene.duration || DEFAULT_SHOT_DURATION
    };
  });
  
  return scenes;
}

/**
 * 尝试部分解析 JSON 数组
 */
function tryPartialParse(jsonStr) {
  const scenes = [];
  const arrayStart = jsonStr.indexOf('[');
  if (arrayStart === -1) return scenes;
  
  let content = jsonStr.slice(arrayStart + 1);
  let depth = 0;
  let objectStart = -1;
  let inString = false;
  let escaped = false;
  
  for (let i = 0; i < content.length; i++) {
    const char = content[i];
    
    if (escaped) { escaped = false; continue; }
    if (char === '\\' && inString) { escaped = true; continue; }
    if (char === '"') { inString = !inString; continue; }
    if (inString) continue;
    
    if (char === '{') {
      if (depth === 0) objectStart = i;
      depth++;
    } else if (char === '}') {
      depth--;
      if (depth === 0 && objectStart !== -1) {
        const objectStr = content.slice(objectStart, i + 1);
        try {
          const obj = JSON.parse(objectStr);
          if (obj && typeof obj.order === 'number' && typeof obj.description === 'string') {
            scenes.push(obj);
          }
        } catch (e) { /* ignore */ }
        objectStart = -1;
      }
    }
  }
  
  return scenes;
}

/**
 * 单场景分镜生成处理器
 * 用于批量分镜的动态步骤
 */
async function handleBatchSceneStep(inputParams, onProgress) {
  const { 
    sceneContent, 
    sceneName, 
    sceneNumber, 
    totalScenes,
    scriptTitle, 
    textModel: modelName, 
    projectId,
    think,
    referenceScriptContent,
    referenceScriptTitle
  } = inputParams;

  if (!sceneContent || !modelName) {
    throw new Error(`场景 ${sceneNumber} 缺少必要参数`);
  }

  if (onProgress) onProgress(10);

  // 弱绑定的参考剧本上下文
  let referenceSection = '';
  if (referenceScriptContent && String(referenceScriptContent).trim()) {
    const MAX_REF_LENGTH = 1500;
    const refText = String(referenceScriptContent).trim();
    const clipped = refText.length > MAX_REF_LENGTH ? refText.slice(0, MAX_REF_LENGTH) + '\n...(参考剧本过长，已截断)' : refText;
    const refTitle = referenceScriptTitle ? String(referenceScriptTitle) : '参考剧本';
    referenceSection = `\n\n【参考剧本·${refTitle}】\n以下仅供参考（风格、人物关系等），不要把它的情节加入本场分镜。\n${clipped}\n`;
  }

  // 获取时长配置
  let durationConfig;
  try {
    durationConfig = await getBatchSceneDurationConfig();
  } catch (e) {
    console.warn('[BatchSceneStep] 获取时长配置失败，使用默认值:', e.message);
    durationConfig = {
      minDuration: DEFAULT_MIN_SCENE_DURATION,
      maxDuration: DEFAULT_MAX_SCENE_DURATION,
      tolerance: DEFAULT_TOLERANCE
    };
  }

  const minDur = durationConfig.minDuration;
  const maxDur = durationConfig.maxDuration;

  // 查询项目中已有的角色及外观特征
  let characterAppearanceSection = '';
  if (projectId) {
    try {
      const existingChars = await queryAll(
        `SELECT name, appearance, description FROM characters WHERE project_id = ? AND appearance IS NOT NULL AND appearance != ''`,
        [projectId]
      );
      if (existingChars.length > 0) {
        const charLines = existingChars.map(c =>
          `- ${c.name}：${c.appearance}${c.description ? `（${c.description}）` : ''}`
        ).join('\n');
        characterAppearanceSection = `
**【角色外观特征表】**
以下角色有固定外观特征，在 description 中提到角色时须包含其关键外观特征（发型、服装等），而非仅写角色名。characters 数组仍使用角色名。
${charLines}

`;
      }
    } catch (e) {
      console.warn(`[BatchScene ${sceneNumber}] 查询角色外观失败（忽略）:`, e.message);
    }
  }
  // 构建提示词
  const fullPrompt = `你是一个分镜师，将场景内容转化为分镜。

**任务**：将【${sceneName}】（第${sceneNumber}/${totalScenes}场景）转化为分镜镜头

**核心原则：忠实于场景内容**
- 严格按照场景内容生成分镜，不添加场景中没有的情节、对话或角色
- 描述简洁明了，避免过度艺术加工
- 专注于场景内容的视觉化呈现

**时长目标**：本场景所有分镜的 duration 总和应在 ${minDur}-${maxDur} 秒之间

**输出格式**：严格 JSON 数组，不要添加其他文字

---

【场景内容】
${sceneContent}
${referenceSection}
---
${characterAppearanceSection}
【分镜转化要求】

1. **对话识别**：每句对白独立一个镜头，说话人用近景/特写
2. **角色识别（重要）**：characters 数组必须包含 description 中提到的所有角色名，包括有对话的主要角色、只有动作的配角、以及非人类角色（怪物、动物、变异生物等）。不要遗漏任何在画面中出现的具名角色。只填写有具体名字的角色，不要填写泛称群体如"人群"、"路人"等。同一角色在多个分镜中使用相同名字
3. **场景连贯**：${sceneNumber === 1 ? '作为第一个场景，用远景/全景建立环境' : '注意与上一场景的自然过渡'}
4. **表情与动作**：用简单自然的语言描述角色的微表情和细微动作
5. **endState 记录**：简要记录镜头结束时角色的位置、姿势、表情

【输出 JSON 格式】
每个分镜包含：
- order: 分镜序号（从1开始，本场景内的序号）
- shotType: 镜头类型（"特写"/"近景"/"中景"/"全景"/"远景"）
- description: 画面描述（简洁明了）
- hasAction: 是否有动作（true/false）
- startFrame: 动作开始时的画面（仅当hasAction=true时）
- endFrame: 动作结束时的画面（仅当hasAction=true时）
- endState: 镜头结束时的状态
- dialogue: 对白内容（没有则留空）
- dialogues: 结构化对白数组，格式为 [{"character": "角色名", "line": "台词内容"}]，没有对白则为空数组 []
- duration: 时长（秒，一般2-4秒）
- characters: 出场角色数组
- location: 场景地点（如"教室"、"客厅"、"操场"）
- environment: 环境类型（"室内"/"室外"/"自然景观"/"城市街景"/"其他"）
- buildings: 建筑列表（该场景中出现的具体建筑名称数组，如["教学楼", "宿舍楼"]，没有则填空数组[]）
- timeOfDay: 时间段（"白天"/"夜晚"/"正午"/"黄昏"/"黎明"/"深夜"）
- weather: 天气状况（"晴天"/"阴天"/"雨天"/"雪天"/"雾天"/"多云"）
- emotion: 情绪氛围
- cameraMovement: 镜头运动（"static"/"push"/"pull"/"pan"/"tilt"/"track"/"dolly"/"zoom"/"orbit"/"dolly_zoom"/"crane"/"handheld"/"steadicam"/"whip_pan"）

只输出 JSON 数组，不要其他内容。`;

  if (onProgress) onProgress(20);

  const result = await handleBaseTextModelCall({
    prompt: fullPrompt,
    textModel: modelName,
    temperature: 0.3,
    think
  });

  if (onProgress) onProgress(70);

  // 检查是否因 token 限制导致输出为空
  if (!result.content || result.content.trim() === '') {
    if (result.finishReason === 'length') {
      throw new Error('AI 输出被截断（token 限制），请尝试使用更短的场景或关闭 thinking 模式');
    }
    throw new Error('AI 未返回有效内容');
  }

  // 解析 AI 返回的 JSON
  let scenes = [];
  try {
    let jsonStr = stripThinkTags(result.content);
    jsonStr = extractCodeBlock(jsonStr);
    jsonStr = stripInvisible(jsonStr).trim();

    try {
      scenes = JSON.parse(jsonStr);
    } catch (directParseError) {
      const extracted = extractJSON(jsonStr);
      if (extracted) {
        try {
          scenes = JSON.parse(extracted);
        } catch (_) { /* fallback */ }
      }

      if (!Array.isArray(scenes) || scenes.length === 0) {
        try {
          const { jsonrepair } = await import('jsonrepair');
          const repaired = jsonrepair(jsonStr);
          scenes = JSON.parse(repaired);
        } catch (repairLibError) {
          const partialScenes = tryPartialParse(jsonStr);
          if (partialScenes.length >= 1) {
            scenes = partialScenes;
          } else {
            throw new Error('分镜 JSON 解析失败: ' + directParseError.message);
          }
        }
      }
    }
  } catch (parseError) {
    throw new Error('分镜解析失败: ' + parseError.message);
  }

  if (!Array.isArray(scenes) || scenes.length === 0) {
    throw new Error('AI 未返回有效的分镜数据');
  }

  if (onProgress) onProgress(85);

  // 后处理
  scenes = postProcessScenes(scenes);
  
  // 时长校验与调整
  let durationResult = adjustSceneDurations(
    scenes, 
    durationConfig.minDuration, 
    durationConfig.maxDuration, 
    durationConfig.tolerance
  );
  
  // 如果严重超出范围，降级为强制比例缩放
  if (durationResult.needsRegeneration) {
    console.log(`[BatchSceneStep] 场景 ${sceneNumber} 时长严重超出范围，强制比例缩放`);
    durationResult = adjustSceneDurations(
      durationResult.scenes,
      durationConfig.minDuration,
      durationConfig.maxDuration,
      Infinity
    );
  }
  
  scenes = durationResult.scenes;
  const totalDuration = durationResult.totalDuration;

  // 标记场景信息
  scenes = scenes.map(shot => ({
    ...shot,
    sceneNumber,
    sceneName
  }));

  // 获取最后一个分镜的结束状态
  const lastSceneEndState = scenes.length > 0 
    ? scenes[scenes.length - 1].endState || scenes[scenes.length - 1].description
    : '';

  if (onProgress) onProgress(100);

  console.log(`[BatchSceneStep] 场景 ${sceneNumber}(${sceneName}) 完成: ${scenes.length} 个分镜, ${totalDuration}秒`);
  console.log(`[BatchSceneStep] 场景角色汇总:`, [...new Set(scenes.flatMap(s => s.characters || []))]);

  return {
    scenes,
    totalDuration,
    lastSceneEndState,
    sceneNumber,
    sceneName,
    tokens: result.tokens || 0
  };
}

module.exports = handleBatchSceneStep;
