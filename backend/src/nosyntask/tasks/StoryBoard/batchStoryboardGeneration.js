/**
 * 批量分镜生成处理器
 * 将多场景分镜生成整合为单一任务，受控并发处理
 * 
 * 特点：
 * 1. 用户界面只显示一个统一任务
 * 2. 后台按场景分割，受控并发（默认3路并行）
 * 3. 统一进度反馈（如"场景2/5 生成中"）
 * 4. 结果按场景序号排序后一次性保存
 * 
 * input:  { scriptId, projectId, userId, textModel, clearExisting }
 * output: { totalScenes, totalShots, totalDuration, characters, locations }
 */

const handleBaseTextModelCall = require('../base/baseTextModelCall');
const { filterNonCharacters } = require('../../../utils/characterFilter');
const { queryOne, execute } = require('../../../dbHelper');
const { parseScriptScenes } = require('../../../utils/parseScriptScenes');
const { stripThinkTags, extractCodeBlock, extractJSON, stripInvisible } = require('../../../utils/washBody');
const { getBatchSceneDurationConfig } = require('../../../durationConfigService');
const { getNarrativePerspective, getBodyProportion } = require('../../../utils/getProjectStyle');

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
  console.log('[BatchStoryboard] 原始总时长:', totalDuration, '秒, 允许范围:', minDuration, '-', maxDuration, '秒, 容忍偏差:', tolerance, '秒');
  
  if (totalDuration >= minDuration && totalDuration <= maxDuration) {
    console.log('[BatchStoryboard] 时长在合理范围内，无需调整');
    return { scenes, totalDuration, adjusted: false, needsRegeneration: false };
  }
  
  let deviation = 0;
  if (totalDuration < minDuration) {
    deviation = minDuration - totalDuration;
  } else if (totalDuration > maxDuration) {
    deviation = totalDuration - maxDuration;
  }
  
  console.log('[BatchStoryboard] 时长偏差:', deviation, '秒');
  
  if (deviation > tolerance) {
    console.log('[BatchStoryboard] 时长严重超出范围（偏差', deviation, '秒 > 容忍值', tolerance, '秒），需要重新生成');
    return { scenes, totalDuration, adjusted: false, needsRegeneration: true };
  }
  
  console.log('[BatchStoryboard] 偏差在容忍范围内，执行比例缩放调整');
  
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
  
  console.log('[BatchStoryboard] 比例缩放调整后总时长:', totalDuration, '秒');
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

/**
 * 生成单个场景的分镜
 */
async function generateSceneStoryboard(params) {
  const { 
    sceneContent, 
    sceneName, 
    sceneNumber, 
    totalScenes,
    previousSceneContext,
    scriptTitle, 
    textModel: modelName, 
    think,
    durationConfig,
    perspectiveInstruction,
    bodyProportionInstruction
  } = params;

  const minDur = durationConfig ? durationConfig.minDuration : DEFAULT_MIN_SCENE_DURATION;
  const maxDur = durationConfig ? durationConfig.maxDuration : DEFAULT_MAX_SCENE_DURATION;
  const tolerance = durationConfig ? durationConfig.tolerance : DEFAULT_TOLERANCE;

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
${perspectiveInstruction ? `\n${perspectiveInstruction}\n` : ''}\
${bodyProportionInstruction ? `\n${bodyProportionInstruction}\n` : ''}\
${contextInfo}
**时长目标**：本场景所有分镜的 duration 总和应在 ${minDur}-${maxDur} 秒之间

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
    temperature: 0.3,
    think
    // 不设置 maxTokens，由模型自行决定输出长度
  });

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

  // 后处理
  scenes = postProcessScenes(scenes);
  
  // 时长校验与调整
  let durationResult = adjustSceneDurations(scenes, minDur, maxDur, tolerance);
  
  // 如果严重超出范围，降级为强制比例缩放（批量模式不重试AI，避免耗时过长）
  if (durationResult.needsRegeneration) {
    console.log(`[BatchStoryboard] 场景 ${sceneNumber} 时长严重超出范围，强制比例缩放`);
    durationResult = adjustSceneDurations(
      durationResult.scenes, minDur, maxDur, Infinity
    );
  }
  
  scenes = durationResult.scenes;
  const totalDuration = durationResult.totalDuration;

  // 获取最后一个分镜的结束状态
  const lastSceneEndState = scenes.length > 0 
    ? scenes[scenes.length - 1].endState || scenes[scenes.length - 1].description
    : '';

  return {
    scenes,
    totalDuration,
    lastSceneEndState,
    tokens: result.tokens || 0
  };
}

/**
 * 批量分镜生成主处理函数
 */
async function handleBatchStoryboardGeneration(inputParams, onProgress) {
  const { 
    scriptId, 
    projectId, 
    userId, 
    textModel, 
    clearExisting = true,
    think = true
  } = inputParams;

  if (!scriptId || !projectId) {
    throw new Error('缺少 scriptId 或 projectId');
  }
  if (!textModel) {
    throw new Error('textModel 参数是必需的');
  }

  // 1. 获取剧本内容
  const script = await queryOne(
    'SELECT * FROM scripts WHERE id = ? AND user_id = ?',
    [scriptId, userId]
  );

  if (!script) {
    throw new Error('剧本不存在');
  }
  if (!script.content || script.content.trim() === '') {
    throw new Error('剧本内容为空，无法生成分镜');
  }

  // 2. 解析场景
  const parsedScenes = parseScriptScenes(script.content);
  const totalScenes = parsedScenes.length;

  if (totalScenes === 0) {
    throw new Error('未能从剧本中识别出场景');
  }

  console.log(`[BatchStoryboard] 识别到 ${totalScenes} 个场景，开始处理...`);
  if (onProgress) onProgress(5);

  // 获取时长配置
  let durationConfig;
  try {
    durationConfig = await getBatchSceneDurationConfig();
  } catch (e) {
    console.warn('[BatchStoryboard] 获取时长配置失败，使用默认值:', e.message);
    durationConfig = {
      minDuration: DEFAULT_MIN_SCENE_DURATION,
      maxDuration: DEFAULT_MAX_SCENE_DURATION,
      tolerance: DEFAULT_TOLERANCE
    };
  }

  // 获取拍摄视角设置
  let perspectiveInstruction = '';
  try {
    const perspective = await getNarrativePerspective(projectId);
    perspectiveInstruction = perspective.promptInstruction || '';
  } catch (e) {
    console.warn('[BatchStoryboard] 获取拍摄视角失败:', e.message);
  }

  // 获取头身比例设置
  let bodyProportionInstruction = '';
  try {
    const bodyProportion = await getBodyProportion(projectId);
    bodyProportionInstruction = bodyProportion?.promptInstruction || '';
  } catch (e) {
    console.warn('[BatchStoryboard] 获取头身比例失败:', e.message);
  }

  // 3. 清理旧分镜（如果需要）
  if (clearExisting) {
    await execute('DELETE FROM storyboards WHERE script_id = ?', [scriptId]);
    console.log('[BatchStoryboard] 已清理旧分镜');
  }

  // 4. 受控并发处理场景（默认 3 路并行）
  const CONCURRENCY = Math.min(3, totalScenes);
  const allCharacters = new Set();
  const allLocations = new Set();
  let totalTokens = 0;
  let completedScenes = 0;

  // 构建每个场景的任务描述
  const sceneTasks = parsedScenes.map((scene, i) => ({
    index: i,
    sceneNumber: scene.sceneNumber || (i + 1),
    sceneName: scene.sceneName || `场景${scene.sceneNumber || (i + 1)}`,
    content: scene.content
  }));

  // 用于存放按索引排列的结果
  const sceneResults = new Array(totalScenes).fill(null);

  // 受控并发执行器
  const taskQueue = [...sceneTasks];
  const runWorker = async () => {
    while (taskQueue.length > 0) {
      const task = taskQueue.shift();
      if (!task) break;

      console.log(`[BatchStoryboard] 处理场景 ${task.sceneNumber}/${totalScenes}: ${task.sceneName}`);

      try {
        const result = await generateSceneStoryboard({
          sceneContent: task.content,
          sceneName: task.sceneName,
          sceneNumber: task.sceneNumber,
          totalScenes,
          previousSceneContext: '', // 并行模式不传递上下文，每个场景独立生成
          scriptTitle: script.title || `第${script.episode_number}集`,
          textModel,
          think,
          durationConfig,
          perspectiveInstruction,
          bodyProportionInstruction
        });

        // 为分镜标记场景信息（全局序号在排序后计算）
        sceneResults[task.index] = {
          scenes: result.scenes.map(shot => ({
            ...shot,
            sceneNumber: task.sceneNumber,
            sceneName: task.sceneName
          })),
          tokens: result.tokens || 0
        };

        completedScenes++;
        const progress = 5 + (completedScenes / totalScenes) * 85;
        console.log(`[BatchStoryboard] 场景 ${task.sceneNumber} 完成: ${result.scenes.length} 个分镜 (${completedScenes}/${totalScenes})`);
        if (onProgress) onProgress(Math.round(progress));

      } catch (sceneError) {
        console.error(`[BatchStoryboard] 场景 ${task.sceneNumber} 生成失败:`, sceneError.message);
        throw new Error(`场景 ${task.sceneNumber}(${task.sceneName}) 生成失败: ${sceneError.message}`);
      }
    }
  };

  // 启动 N 个 worker 并发消费任务队列
  const workers = Array.from({ length: CONCURRENCY }, () => runWorker());
  await Promise.all(workers);

  // 按场景顺序合并结果，计算全局序号
  const allStoryboards = [];
  for (const result of sceneResults) {
    if (!result) continue;
    const globalStartIdx = allStoryboards.length;
    result.scenes.forEach((shot, shotIdx) => {
      shot.globalOrder = globalStartIdx + shotIdx + 1;
      allStoryboards.push(shot);
      if (Array.isArray(shot.characters)) {
        shot.characters.forEach(c => allCharacters.add(c));
      }
      if (shot.location) {
        allLocations.add(shot.location);
      }
    });
    totalTokens += result.tokens;
  }

  console.log(`[BatchStoryboard] 所有场景处理完成（${CONCURRENCY}路并发），共 ${allStoryboards.length} 个分镜`);
  if (onProgress) onProgress(92);

  // 5. 批量保存所有分镜到数据库（性能优化：使用批量插入替代循环单条插入）
  let idxOffset = 0;
  if (!clearExisting) {
    const maxIdxRow = await queryOne(
      'SELECT MAX(idx) as maxIdx FROM storyboards WHERE script_id = ?',
      [scriptId]
    );
    idxOffset = (maxIdxRow?.maxIdx ?? -1) + 1;
  }

  // 构建批量插入的值数组
  const batchValues = allStoryboards.map((shot, i) => [
    projectId,
    scriptId,
    idxOffset + i,
    shot.description || '',
    JSON.stringify(shot)
  ]);

  // 执行批量插入（单次网络往返替代 N 次）
  if (batchValues.length > 0) {
    await execute(
      `INSERT INTO storyboards (project_id, script_id, idx, prompt_template, variables_json) VALUES ?`,
      [batchValues]
    );
  }

  console.log(`[BatchStoryboard] 已批量保存 ${allStoryboards.length} 个分镜到数据库`);
  if (onProgress) onProgress(96);

  // 6. 提取场景信息并批量保存（性能优化：使用 INSERT ON DUPLICATE KEY UPDATE）
  let scenesExtracted = 0;
  if (userId) {
    const locationMap = new Map();

    for (const shot of allStoryboards) {
      const loc = shot.location?.trim();
      if (!loc) continue;

      if (!locationMap.has(loc)) {
        locationMap.set(loc, {
          descriptions: [],
          emotions: new Set()
        });
      }
      const data = locationMap.get(loc);
      if (shot.description) data.descriptions.push(shot.description);
      if (shot.emotion) data.emotions.add(shot.emotion);
    }

    // 构建批量 upsert 的值数组
    const sceneValues = [];
    for (const [locName, data] of locationMap.entries()) {
      const envDescription = data.descriptions[0] || '';
      const mood = Array.from(data.emotions).join(', ') || '';
      const environment = `${locName}场景`;
      const lighting = '自然光';
      sceneValues.push([userId, projectId, scriptId, locName, envDescription, mood, environment, lighting, 'auto_extracted']);
    }

    // 执行批量 upsert（单次网络往返替代 2N 次）
    if (sceneValues.length > 0) {
      try {
        await execute(
          `INSERT INTO scenes (user_id, project_id, script_id, name, description, mood, environment, lighting, source)
           VALUES ?
           ON DUPLICATE KEY UPDATE
             description = COALESCE(NULLIF(description, ''), VALUES(description)),
             mood = COALESCE(NULLIF(mood, ''), VALUES(mood)),
             environment = COALESCE(NULLIF(environment, ''), VALUES(environment)),
             lighting = COALESCE(NULLIF(lighting, ''), VALUES(lighting)),
             script_id = VALUES(script_id),
             updated_at = CURRENT_TIMESTAMP`,
          [sceneValues]
        );
        scenesExtracted = sceneValues.length;
      } catch (dbError) {
        console.error('[BatchStoryboard] 批量保存场景失败:', dbError.message);
      }
    }
  }

  if (onProgress) onProgress(98);

  // 7. 建立资源关联
  try {
    const { linkAllForScript } = require('../../../resourceLinks');
    await linkAllForScript(scriptId, projectId);
    console.log('[BatchStoryboard] 资源关联完成');
  } catch (linkError) {
    console.error('[BatchStoryboard] 资源关联失败（不影响分镜）:', linkError.message);
  }

  if (onProgress) onProgress(100);

  // 计算总时长
  const totalDuration = allStoryboards.reduce((sum, s) => sum + (s.duration || DEFAULT_SHOT_DURATION), 0);

  console.log(`[BatchStoryboard] 全部完成: ${totalScenes}个场景, ${allStoryboards.length}个分镜, ${totalDuration}秒`);

  return {
    totalScenes,
    totalShots: allStoryboards.length,
    totalDuration,
    characters: Array.from(allCharacters),
    locations: Array.from(allLocations),
    scenesExtracted,
    tokens: totalTokens
  };
}

module.exports = handleBatchStoryboardGeneration;
