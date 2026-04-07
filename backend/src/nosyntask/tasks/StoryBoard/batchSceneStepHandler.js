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

// 时长常量
const MIN_SCENE_DURATION = 15;
const MAX_SCENE_DURATION = 60;
const DEFAULT_SHOT_DURATION = 2;

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
 * 调整分镜时长
 */
function adjustSceneDurations(scenes) {
  if (!scenes || scenes.length === 0) return { scenes: [], totalDuration: 0 };
  
  let totalDuration = scenes.reduce((sum, s) => sum + (s.duration || DEFAULT_SHOT_DURATION), 0);
  
  if (totalDuration >= MIN_SCENE_DURATION && totalDuration <= MAX_SCENE_DURATION) {
    return { scenes, totalDuration };
  }
  
  if (totalDuration < MIN_SCENE_DURATION) {
    const scaleFactor = MIN_SCENE_DURATION / totalDuration;
    scenes = scenes.map(s => ({
      ...s,
      duration: Math.round((s.duration || DEFAULT_SHOT_DURATION) * scaleFactor)
    }));
    totalDuration = scenes.reduce((sum, s) => sum + s.duration, 0);
  }
  
  if (totalDuration > MAX_SCENE_DURATION) {
    const scaleFactor = MAX_SCENE_DURATION / totalDuration;
    scenes = scenes.map(s => ({
      ...s,
      duration: Math.max(1, Math.round((s.duration || DEFAULT_SHOT_DURATION) * scaleFactor))
    }));
    totalDuration = scenes.reduce((sum, s) => sum + s.duration, 0);
  }
  
  return { scenes, totalDuration };
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
    think 
  } = inputParams;

  if (!sceneContent || !modelName) {
    throw new Error(`场景 ${sceneNumber} 缺少必要参数`);
  }

  if (onProgress) onProgress(10);

  // 构建提示词
  const fullPrompt = `你是一个分镜师，将场景内容转化为分镜。

**任务**：将【${sceneName}】（第${sceneNumber}/${totalScenes}场景）转化为分镜镜头

**核心原则：忠实于场景内容**
- 严格按照场景内容生成分镜，不添加场景中没有的情节、对话或角色
- 描述简洁明了，避免过度艺术加工
- 专注于场景内容的视觉化呈现

**时长目标**：本场景所有分镜的 duration 总和应在 15-60 秒之间

**输出格式**：严格 JSON 数组，不要添加其他文字

---

【场景内容】
${sceneContent}

---

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
- duration: 时长（秒，一般2-4秒）
- characters: 出场角色数组
- location: 场景地点
- emotion: 情绪氛围
- cameraMovement: 镜头运动（"static"/"push_in"/"pull_out"/"pan_left"/"pan_right"）

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
  const { scenes: adjustedScenes, totalDuration } = adjustSceneDurations(scenes);
  scenes = adjustedScenes;

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
