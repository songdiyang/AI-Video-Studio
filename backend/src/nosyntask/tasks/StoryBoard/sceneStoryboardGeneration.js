/**
 * 单场景分镜生成处理器
 * 针对单个场景生成分镜，支持场景间的连贯性
 * 
 * input:  { sceneContent, sceneName, sceneNumber, totalScenes, previousSceneContext, scriptTitle, textModel, think }
 * output: { scenes, characters, locations, count, totalDuration, tokens, provider }
 */

const handleBaseTextModelCall = require('../base/baseTextModelCall');
const { filterNonCharacters } = require('../../../utils/characterFilter');
const { stripThinkTags, extractCodeBlock, extractJSON, stripInvisible } = require('../../../utils/washBody');

// 目标时长范围（秒）- 单场景
const MIN_SCENE_DURATION = 15;  // 单场景最少15秒
const MAX_SCENE_DURATION = 60;  // 单场景最多60秒
const DEFAULT_SHOT_DURATION = 2; // 默认单个分镜时长

/**
 * 从分镜描述中提取角色名称（严格模式）
 */
function extractCharactersFromDescription(description, knownCharacters = new Set()) {
  if (!description) return [];
  
  const extracted = new Set();
  
  // 只从已知角色列表中精确匹配，不再使用模糊匹配
  for (const char of knownCharacters) {
    if (char && char.length >= 2 && description.includes(char)) {
      extracted.add(char);
    }
  }
  
  return Array.from(extracted);
}

/**
 * 检查是否为常见非人名词汇
 */
function isCommonWord(word) {
  const commonWords = new Set([
    '然后', '之后', '之前', '不过', '如果', '虽然', '但是', '因为', '所以',
    '已经', '正在', '还是', '一个', '这个', '那个', '什么', '我们', '他们', '她们',
    '这里', '那里', '哪里', '时候', '地方', '事情', '东西', '问题', '结果',
    '开始', '结束', '继续', '一边', '同时', '首先', '接着', '随后', '最后',
    '表情', '动作', '场景', '画面', '镜头', '角度', '光线', '背景', '前景',
    '特写', '远景', '近景', '中景', '全景', '仰拍', '仰拍', '左侧', '右侧',
    '清晨', '晚上', '上午', '下午', '教室', '客厅', '黑板', '窗户',
    '学生', '同学', '老师', '高考', '考试', '纸条', '广播',
    '抬头', '低头', '转身', '站起', '坐下', '快速', '慢慢', '突然',
    '无聊', '焦虑', '担心', '距离', '还有', '似乎', '流声',
  ]);
  return commonWords.has(word);
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
  
  // 时长过短，增加每个分镜的时长
  if (totalDuration < MIN_SCENE_DURATION) {
    const scaleFactor = MIN_SCENE_DURATION / totalDuration;
    scenes = scenes.map(s => ({
      ...s,
      duration: Math.round((s.duration || DEFAULT_SHOT_DURATION) * scaleFactor)
    }));
    totalDuration = scenes.reduce((sum, s) => sum + s.duration, 0);
  }
  
  // 时长过长，减少每个分镜的时长
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
  
  scenes = scenes.map((scene, idx) => {
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

async function handleSceneStoryboardGeneration(inputParams, onProgress) {
  const { 
    sceneContent, 
    sceneName, 
    sceneNumber, 
    totalScenes,
    previousSceneContext,
    scriptTitle, 
    textModel: modelName, 
    think 
  } = inputParams;

  if (!sceneContent || sceneContent.trim() === '') {
    throw new Error('场景内容为空，无法生成分镜');
  }

  if (!modelName) {
    throw new Error('textModel 参数是必需的');
  }

  if (onProgress) onProgress(10);

  // 构建上下文信息
  let contextInfo = '';
  if (previousSceneContext) {
    contextInfo = `
【上一场景结束状态】
${previousSceneContext}
请确保本场景的开始与上一场景自然衔接。
`;
  }

  const fullPrompt = `你是一个分镜师，将场景内容转化为分镜。

**任务**：将【${sceneName}】（第${sceneNumber}/${totalScenes}场景）转化为分镜镜头

**核心原则：忠实于场景内容**
- 严格按照场景内容生成分镜，不添加场景中没有的情节、对话或角色
- 描述简洁明了，避免过度艺术加工
- 专注于场景内容的视觉化呈现
${contextInfo}
**时长目标**：本场景所有分镜的 duration 总和应在 15-60 秒之间

**输出格式**：严格 JSON 数组，不要添加其他文字

---

【场景内容】
${sceneContent}

---

【分镜转化要求】

1. **对话识别**：每句对白独立一个镜头，说话人用近景/特写
2. **角色识别**：准确记录每个分镜中出现的角色，characters 数组必须完整
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
- cameraMovement: 镜头运动（"static"/"push"/"pull"/"pan"/"tilt"/"track"/"dolly"/"zoom"/"orbit"/"dolly_zoom"/"crane"/"handheld"/"steadicam"/"whip_pan"）

只输出 JSON 数组，不要其他内容。`;

  const result = await handleBaseTextModelCall({
    prompt: fullPrompt,
    textModel: modelName,
    maxTokens: 4096,
    temperature: 0.3,
    think
  }, onProgress);

  if (onProgress) onProgress(80);

  // 解析 AI 返回的 JSON
  let scenes = [];
  try {
    let jsonStr = stripThinkTags(result.content);
    jsonStr = extractCodeBlock(jsonStr);
    jsonStr = stripInvisible(jsonStr).trim();

    try {
      scenes = JSON.parse(jsonStr);
      console.log(`[SceneStoryboard] 场景${sceneNumber} 直接解析成功，共 ${scenes.length} 个分镜`);
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
    console.error(`[SceneStoryboard] 场景${sceneNumber} 解析失败:`, parseError);
    throw new Error('分镜解析失败: ' + parseError.message);
  }

  if (!Array.isArray(scenes) || scenes.length === 0) {
    throw new Error('AI 未返回有效的分镜数据');
  }

  // 后处理
  scenes = postProcessScenes(scenes);
  const { scenes: adjustedScenes, totalDuration } = adjustSceneDurations(scenes);
  scenes = adjustedScenes;

  if (onProgress) onProgress(100);

  // 收集角色和场景
  const allCharacters = [...new Set(scenes.flatMap(s => s.characters || []))];
  const allLocations = [...new Set(scenes.map(s => s.location).filter(Boolean))];

  // 获取最后一个分镜的结束状态，用于传递给下一场景
  const lastSceneEndState = scenes.length > 0 
    ? scenes[scenes.length - 1].endState || scenes[scenes.length - 1].description
    : '';

  console.log(`[SceneStoryboard] 场景${sceneNumber}(${sceneName}) 完成: ${scenes.length}个分镜, ${totalDuration}秒`);

  return {
    scenes,
    characters: allCharacters,
    locations: allLocations,
    count: scenes.length,
    totalDuration,
    lastSceneEndState,
    sceneNumber,
    sceneName,
    tokens: result.tokens || 0,
    provider: result._model?.provider || 'unknown'
  };
}

module.exports = handleSceneStoryboardGeneration;
