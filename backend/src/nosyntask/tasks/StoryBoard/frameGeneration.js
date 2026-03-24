/**
 * 分镜首尾帧生成处理器（动作镜头）
 *
 * 流程：
 * 1. 查询分镜数据，获取角色列表和场景名称
 * 2. 查询所有角色的三视图 URL + 场景图 URL，拼接为 imageUrls 参考数组（支持多角色）
 * 3. 如果有上一镜头尾帧（prevEndFrameUrl），加入参考图列表以保持连续性
 * 4. 调用文本模型，根据镜头描述 + 上一镜头上下文生成首帧提示词
 * 5. 以 imageUrls + 首帧提示词 调用图片模型生成首帧，保存到数据库
 * 6. 调用文本模型，根据镜头描述生成尾帧提示词
 * 7. 以 [首帧] + 尾帧提示词 调用图片模型生成尾帧，保存到数据库
 *
 * input:  { storyboardId, prompt, imageModel, textModel, aspectRatio, prevEndFrameUrl, prevDescription, isFirstScene }
 * output: { startFrame, endFrame, model, startPrompt, endPrompt }
 */

const { submitAndPoll } = require('../pollUtils');
const { execute, queryOne, queryAll } = require('../../../dbHelper');
const { downloadAndStore } = require('../../../utils/fileStorage');
const handleBaseTextModelCall = require('../base/baseTextModelCall');
const { requireVisualStyle } = require('../../../utils/getProjectStyle');
const { generateUpdatedSceneImage } = require('./sceneRefUtils');
const { selectReferenceImages } = require('./referenceImageSelector');
const { collectCandidateImages, appendContextCandidates } = require('./collectCandidateImages');
const { traced, trace } = require('../../engine/generationTrace');
const { assertUpdated, assertPersistedFields } = require('./persistenceGuard');
const { resolveMediaUrl } = require('../base/mediaResultResolver');

/**
 * 生成单张图片（通过 submitAndPoll 自动处理同步/异步）
 */
const generateSingleImage = traced('图片生成', async function _generateSingleImage(modelName, prompt, aspectRatio, logTag, imageUrls) {
  const submitParams = {
    prompt,
    aspectRatio
  };

  if (imageUrls && imageUrls.length > 0) {
    submitParams.imageUrls = imageUrls;
  }

  const result = await submitAndPoll(modelName, submitParams, {
    intervalMs: 3000,
    maxDurationMs: 300000,
    logTag: logTag || 'FrameGen'
  });

  const resolution = resolveMediaUrl(result, 'image');
  console.log(`[${logTag || 'FrameGen'}] 返回字段诊断:`, {
    modelName,
    mappedKeys: result && typeof result === 'object' ? Object.keys(result) : [],
    queryKeys: result?._queryResult && typeof result._queryResult === 'object' ? Object.keys(result._queryResult) : [],
    rawQueryKeys: result?._rawQueryResult && typeof result._rawQueryResult === 'object' ? Object.keys(result._rawQueryResult) : [],
    submitKeys: result?._submitResult && typeof result._submitResult === 'object' ? Object.keys(result._submitResult) : [],
    selectedUrl: resolution.mediaUrl,
    resolvedFrom: resolution.resolvedFrom,
    urlCandidates: resolution.candidates,
    aspectRatio: aspectRatio || null
  });

  if (!resolution.mediaUrl) {
    throw new Error('任务成功但未找到图片 URL，请检查 response_mapping / query_success_mapping 配置');
  }
  return resolution.mediaUrl;
}, {
  extractInput: (modelName, prompt, w, h, logTag, urls) => ({ model: modelName, logTag, refCount: urls?.length || 0, prompt: prompt?.substring(0, 100) }),
  extractOutput: (url) => ({ imageUrl: url })
});

// collectReferenceImages 已提取到 collectCandidateImages.js 共享模块

/**
 * 调用文本模型生成帧提示词
 * @param {object} opts
 * @param {string} opts.textModel
 * @param {string} opts.description - 分镜描述
 * @param {string} opts.frameType - 'start' | 'end'
 * @param {object|null} opts.characterInfo - { name, appearance, description, personality }
 * @param {object|null} opts.sceneInfo - { name, description, environment, lighting, mood }
 * @param {string} opts.shotType
 * @param {string} opts.emotion
 * @param {string} opts.prevDescription
 * @param {string} opts.visualStyle
 * @param {string} [opts.startFrameDesc] - 分镜阶段生成的首帧描述
 * @param {string} [opts.endFrameDesc] - 分镜阶段生成的尾帧描述
 * @param {string} [opts.dialogue] - 角色对白（用于表情/嘴型参考）
 * @param {string} [opts.prevEndState] - 上一镜头的 endState（用于首帧起始状态约束）
 * @param {string} [opts.endState] - 当前镜头的 endState（用于尾帧目标状态）
 * @param {object} [opts.directorParams] - 导演参数（光线、镜头、氛围）
 */
const generateFramePrompt = traced('生成帧提示词', async function _generateFramePrompt(opts) {
  const { textModel, description, frameType, characterInfo, sceneInfo, shotType, emotion, prevDescription, visualStyle, startFrameDesc, endFrameDesc, dialogue, prevEndState, endState, sceneState, environmentChange, directorParams, spatialDescription } = opts;

  // 角色信息：有角色时提供详细外貌，无角色时明确排除
  let charBlock;
  let charConstraint;
  if (characterInfo) {
    // 支持多角色：characterInfo 可能是对象（单角色）或数组（多角色）
    const characters = Array.isArray(characterInfo) ? characterInfo : [characterInfo];

    if (characters.length === 1) {
      // 单角色
      const char = characters[0];
      charBlock = `【角色信息】
角色名称: ${char.name}
外貌特征: ${char.appearance}
角色描述: ${char.description}
（已提供角色参考图，角色的发型、发色、瞳色、服装款式和颜色、体型比例、配饰必须与参考图一致。但角色的姿势、位置、朝向、表情以文字描述和上一镜头结束状态为准，不要从角色立绘中复制姿态。）`;
      charConstraint = `- 角色外貌、服装、发型必须与参考图完全一致，不得自行创造角色形象
- 严禁出现参考图中不存在的额外人物
- 角色身体结构必须正常：头部在肩膀上方，四肢正常连接，禁止畸变`;
    } else {
      // 多角色
      const charInfoText = characters.map(char =>
        `角色名称: ${char.name}
外貌特征: ${char.appearance}
角色描述: ${char.description}`
      ).join('\n\n');

      charBlock = `【角色信息（多角色场景）】
${charInfoText}
（已提供所有角色的参考图，每个角色的发型、发色、瞳色、服装款式和颜色、体型比例、配饰必须与各自的参考图一致。但角色的姿势、位置、朝向、表情以文字描述和上一镜头结束状态为准，不要从角色立绘中复制姿态。）`;
      charConstraint = `- 每个角色的外貌、服装、发型必须与各自的参考图完全一致，不得自行创造角色形象
- 严禁出现参考图中不存在的额外人物
- 所有角色的身体结构必须正常：头部在肩膀上方，四肢正常连接，禁止畸变
- 注意区分不同角色，避免混淆`;
    }
  } else {
    charBlock = '【无角色镜头】这个镜头没有任何角色参与';
    charConstraint = `- 画面中绝对不能出现任何人物、人影或人形轮廓
- 仅描述场景环境、自然元素、物体`;
  }

  // 场景信息
  // 场景约束根据 sceneState + frameType 动态调整
  let sceneConstraint = '（已提供场景参考图，画面的色调、光照、氛围必须与参考图一致。注意：参考图展示的是场景全貌，当前镜头可能仅展示场景的某个视角方向）';
  if (sceneState === 'modified') {
    if (frameType === 'start') {
      sceneConstraint = `（⚠️ 本镜头环境即将发生变化：${environmentChange || 'unknown change'}。不要参考原始场景图的物品状态，以上一镜头尾帧为基准，呈现变化发生前/发生中的状态）`;
    } else {
      sceneConstraint = `（⚠️ 本镜头环境已经发生了不可逆变化：${environmentChange || 'unknown change'}。尾帧必须呈现变化完成后的最终结果。严禁恢复到变化前的原始状态——参考图中的首帧展示的是变化前/中的瞬间，不要复制首帧的环境状态，要展示变化的最终结果）`;
    }
  } else if (sceneState === 'inherit') {
    sceneConstraint = `（已提供更新后的场景参考图，场景已发生过变化：${environmentChange || ''}。画面必须保持这些变化，不要恢复到原始状态）`;
  }
  const sceneBlock = sceneInfo
    ? `【场景信息】
场景名称: ${sceneInfo.name}
场景描述: ${sceneInfo.description}
环境: ${sceneInfo.environment}
光照: ${sceneInfo.lighting}
氛围: ${sceneInfo.mood}
${sceneInfo.spatialLayout ? `【场景空间布局】
- 前景: ${sceneInfo.spatialLayout.foreground || '无'}
- 中景: ${sceneInfo.spatialLayout.midground || '无'}
- 背景: ${sceneInfo.spatialLayout.background || '无'}
${sceneInfo.spatialLayout.depthNotes ? `- 纵深备注: ${sceneInfo.spatialLayout.depthNotes}` : ''}` : ''}
${sceneInfo.cameraDefaults ? `【场景默认摄像机】
- 角度: ${sceneInfo.cameraDefaults.angle || '平视'}
- 距离: ${sceneInfo.cameraDefaults.distance || '中景'}
- 高度: ${sceneInfo.cameraDefaults.height || '水平'}
- 运动: ${sceneInfo.cameraDefaults.movement || '固定'}` : ''}
${sceneConstraint}`
    : '';

  const shotInfo = shotType ? `镜头类型: ${shotType}` : '';
  const emotionInfo = emotion ? `情绪/氛围: ${emotion}` : '';
  const styleInfo = visualStyle ? `视觉风格: ${visualStyle}` : '';

  // 首尾帧文字描述（分镜阶段 AI 生成的）
  const frameDescBlock = frameType === 'start'
    ? (startFrameDesc ? `【首帧参考描述】${startFrameDesc}` : '')
    : (endFrameDesc ? `【尾帧参考描述】${endFrameDesc}` : '');

  // 对白信息（帮助 AI 理解角色表情和嘴型）
  const dialogueBlock = dialogue ? `【角色对白】"${dialogue}"（请根据对白内容调整角色的面部表情和嘴型状态）` : '';

  // 上一镜头结束状态（首帧必须与此衔接）
  const prevEndStateBlock = (frameType === 'start' && prevEndState)
    ? `【上一镜头结束状态 - 必须衔接】\n${prevEndState}\n（严格衔接要求：\n① 角色姿势、位置、朝向必须与上述状态完全一致，不得出现不可接受的跳变\n② 光线/时间必须与上述【时空】描述一致：如上一镜头是深夜就不能变成白天，黄昏就不能变成正午\n③ 如果上一镜头有持续性环境效果（篝火、风雪等），当前画面必须保持一致）`
    : '';

  // 当前镜头结束状态（尾帧的目标状态）
  let endStateBlock = '';
  if (frameType === 'end' && endState) {
    const envWarning = (sceneState === 'modified' && environmentChange)
      ? `\n⚠️ 本镜头发生了环境变化「${environmentChange}」，尾帧必须体现变化后的环境结果，严禁画面恢复到变化前的状态。`
      : '';
    endStateBlock = `【本镜头目标结束状态 - 尾帧必须精确呈现】\n${endState}${envWarning}\n（尾帧是动作完成后的最终画面，所有环境变化、角色姿态都必须是完成态，不是过程态）`;
  }

  // 每帧只描述一个冻结瞬间，不提及另一帧的存在
  let frameHint;
  if (frameType === 'start') {
    frameHint = `【画面定格要求】
请描述一个完全静止的瞬间画面（frozen moment），如同按下暂停键截取的一帧：
- 从分镜描述中提取动作发生之前的静止状态
- 明确角色此刻的姿势、位置、朝向、表情
- 只描述这一个瞬间的画面，不要暗示任何即将发生的动作或运动趋势
- 例如：分镜描述"角色从椅子上站起来走向门口" → 提示词只描述"角色正坐在椅子上，双手自然放在扶手上，目光平视前方"`;
  } else {
    frameHint = `【画面定格要求】
请描述一个完全静止的瞬间画面（frozen moment），如同按下暂停键截取的一帧：
- 从分镜描述中提取动作完成之后的静止状态
- 明确角色此刻的姿势、位置、朝向、表情
- 只描述这一个瞬间的画面，不要回顾任何之前的动作过程
- 例如：分镜描述"角色从椅子上站起来走向门口" → 提示词只描述"角色站在门口，右手搭在门把手上，身体面向门外，表情平静"

【关于参考图的说明】
参考图用于提取角色外貌（发型、服装、体型）和场景环境信息，确保画面中的角色和场景与参考图一致。
不要复制或拼接参考图的构图，只参考其中的视觉元素。`;
  }

  const prevContext = (frameType === 'start' && prevDescription)
    ? `上一个镜头描述：${prevDescription}\n注意：当前画面需要自然衍接上一个镜头的结束状态，保持角色、场景、光线的连续性。`
    : '';

  // 摄像机空间推理（反打镜头感知）— 仅首帧需要（尾帧无需与上一镜头衔接视角）
  let cameraPositionBlock = '';
  if (frameType === 'start' && prevEndState && characterInfo) {
    cameraPositionBlock = `【摄像机位置与背景推理 - 非常重要】
你必须根据角色朝向和镜头类型推导摄像机位置，从而确定正确的背景内容：
① 从【上一镜头结束状态】中提取角色的朝向（面朝X方向，背对Y方向）
② 当前镜头的景别和描述决定了摄像机在角色的哪一侧：
   - 正面特写/正面中景 → 摄像机在角色正面（X方向）
   - 背面镜头 → 摄像机在角色背后（Y方向）
   - 侧面镜头 → 摄像机在角色侧面
③ 画面背景 = 摄像机正对方向的远处 = 角色身后的方向。即：
   - 正面拍角色 → 背景是角色背后（Y方向）的场景元素
   - 背面拍角色 → 背景是角色面朝（X方向）的场景元素
④ 【关键】角色面朝的物体（如佛像、窗户）在正面拍时位于摄像机身后，不应出现在画面背景中。请在提示词中用具体描述替代笼统场景名（如 "background shows the wooden temple doors and dim corridor" 而不是 "temple interior"），并用否定词排除不应出现的元素（如 "the Buddha statue is behind the camera, NOT visible in frame"）
⑤ 光线方向：如果上一镜头光线从画面左侧打来，180°反打后光线应从画面右侧打来（因为摄像机转了180°，光源相对位置镜像翻转）`;
  }

  // 导演参数块（如果有）
  let directorBlock = '';
  if (directorParams) {
    const lighting = directorParams.lighting || {};
    const camera = directorParams.camera || {};
    const atmosphere = directorParams.atmosphere || {};
    
    const lightingParts = [];
    if (lighting.direction) lightingParts.push(`光线方向: ${lighting.direction}`);
    if (lighting.quality) lightingParts.push(`光线质量: ${lighting.quality}`);
    if (lighting.color) lightingParts.push(`光线色彩: ${lighting.color}`);
    if (lighting.intensity) lightingParts.push(`光线强度: ${lighting.intensity}`);
    
    const cameraParts = [];
    if (camera.focalLength) cameraParts.push(`焦距: ${camera.focalLength}`);
    if (camera.movement && camera.movement !== 'static') cameraParts.push(`镜头运动: ${camera.movement}`);
    if (camera.depthOfField) cameraParts.push(`景深: ${camera.depthOfField}`);
    if (camera.composition) cameraParts.push(`构图: ${camera.composition}`);
    if (camera.angle) cameraParts.push(`拍摄角度: ${camera.angle}`);
    
    const atmosphereParts = [];
    if (atmosphere.mood) atmosphereParts.push(`氛围: ${atmosphere.mood}`);
    if (atmosphere.texture) atmosphereParts.push(`质感: ${atmosphere.texture}`);
    if (atmosphere.colorGrade) atmosphereParts.push(`调色: ${atmosphere.colorGrade}`);
    if (atmosphere.visualStyle) atmosphereParts.push(`视觉风格: ${atmosphere.visualStyle}`);
    
    const allParts = [];
    if (lightingParts.length > 0) allParts.push(`光线: ${lightingParts.join('、')}`);
    if (cameraParts.length > 0) allParts.push(`镜头: ${cameraParts.join('、')}`);
    if (atmosphereParts.length > 0) allParts.push(`氛围: ${atmosphereParts.join('、')}`);
    
    if (allParts.length > 0) {
      directorBlock = `【导演参数 - 必须严格遵循】\n${allParts.join('\n')}\n（这些是导演明确指定的画面效果，必须在提示词中体现）`;
    }
    
    if (directorParams.customNotes) {
      directorBlock += `\n【导演备注】${directorParams.customNotes}`;
    }
  }

  // 分镜空间描述块（如果有）
  let spatialDescBlock = '';
  if (spatialDescription) {
    const parts = [];
    if (spatialDescription.characterPositions && spatialDescription.characterPositions.length > 0) {
      const posDesc = spatialDescription.characterPositions.map(cp => 
        `${cp.name}: ${cp.position}${cp.depth ? `(深度层:${cp.depth})` : ''}${cp.facing ? `, ${cp.facing}` : ''}`
      ).join('; ');
      parts.push(`角色位置: ${posDesc}`);
    }
    if (spatialDescription.cameraAngle) parts.push(`摄像机角度: ${spatialDescription.cameraAngle}`);
    if (spatialDescription.spatialRelationship) parts.push(`空间关系: ${spatialDescription.spatialRelationship}`);
    if (spatialDescription.environmentDepth) parts.push(`环境纵深: ${spatialDescription.environmentDepth}`);
    if (parts.length > 0) {
      spatialDescBlock = `【分镜空间布局 - 必须遵循】
${parts.join('\n')}
（以上空间位置信息必须在提示词中准确体现，确保角色的位置关系和摄像机角度符合描述）`;
    }
  }

  const extraInfo = [charBlock, sceneBlock, spatialDescBlock, shotInfo, emotionInfo, styleInfo, frameDescBlock, dialogueBlock, prevEndStateBlock, cameraPositionBlock, endStateBlock, directorBlock, charConstraint, prevContext].filter(Boolean).join('\n');

  const promptRequest = `你是一个专业的图片生成提示词专家。你的任务是描述一个完全静止的画面瞬间。

【核心规则】
- 你要生成的提示词描述的是一张静态图片，不是动画、不是视频、不是分镜对比
- 画面中只有一个场景、一个视角、一个时间点
- 绝对不能在提示词中出现以下概念：before/after、transition、sequence、comparison、split、side by side、multiple panels、diptych、collage
- 不要使用暗示运动过程的动词（如 rising, turning, reaching），只用描述静止姿态的词（如 seated, standing, holding）

【内容安全规则 - 必须遵守】
- 所有内容必须健康、正面、适合全年龄观看
- 避免任何可能被误判为敏感的描述：
  * 不要过度描述身体部位或姿态细节
  * 避免使用可能引起歧义的词汇（如 exposed, revealing, intimate, seductive 等）
  * 人物表情和动作应自然、得体
  * 服装描述应简洁，避免过度细节
- 场景应积极向上，避免暴力、恐怖、阴暗等元素
- 如果原始描述包含可能敏感的内容，请用更中性、安全的方式改写

请根据以下信息，生成这个${frameType === 'start' ? '瞬间' : '瞬间'}的图片提示词：

分镜描述：${description}
${extraInfo}
${frameHint}

要求：
1. 【最重要】提取分镜描述中动作${frameType === 'start' ? '发生前' : '完成后'}的一个静止姿态，用静态语言描述
2. 明确描述角色此刻的具体姿势（seated/standing/crouching/lying 等）、肢体位置、身体朝向
3. 【细节保留】角色的每一个外貌细节都必须原样写入提示词：发色、发型、瞳色、服装款式、服装颜色、配饰等，不得省略或概括。例如"黑色双马尾、红色水手服、蓝色百褶裙"必须逐项写出，不能简化为"a girl in school uniform"
4. 【细节保留】场景中从当前摄像机角度可见的环境细节都必须写入提示词：建筑结构、物品摆设、光源方向、色调等。摄像机背后的元素不应出现在描述中
5. 镜头类型决定构图（如特写聚焦面部，远景展示全貌）
6. 如果有上一镜头信息，确保画面与上一镜头自然衔接
7. 如果有视觉风格要求，提示词必须体现该风格特征
8. 严格遵守角色约束：有角色时与参考图一致，无角色时绝对不能出现人物
9. 【内容安全】确保所有描述健康、正面，避免任何可能触发内容审核的词汇或概念
10. 提示词开头必须加 "single image, single scene, one unified viewpoint,"，末尾必须加 ", one single frame, NOT split screen, NOT side by side, NOT comparison, NOT multiple panels"
11. 【禁止文字/字幕】画面中绝对不能出现任何文字、字幕、标题、水印。提示词中必须包含 "no text, no subtitles, no captions, no watermark, no letters, no words" 约束
12. 只输出英文提示词，不要其他解释

提示词：`;

  const result = await handleBaseTextModelCall({
    prompt: promptRequest,
    textModel,
    temperature: 0.7
  });

  return result.content || description;
}, {
  extractInput: (opts) => ({ frameType: opts.frameType, sceneState: opts.sceneState, hasCharacter: !!opts.characterInfo, hasPrevEndState: !!opts.prevEndState }),
  extractOutput: (prompt) => ({ prompt: typeof prompt === 'string' ? prompt.substring(0, 150) : '' })
});

async function handleFrameGeneration(inputParams, onProgress) {
  const { storyboardId, prompt, imageModel: modelName, textModel, aspectRatio, prevEndFrameUrl, prevDescription, prevEndState: inputPrevEndState, isFirstScene, sceneState: inputSceneState, environmentChange: inputEnvironmentChange, activeSceneUrl, regenerateTarget } = inputParams;

  if (!storyboardId) {
    throw new Error('缺少必要参数: storyboardId');
  }
  if (!modelName) {
    throw new Error('imageModel 参数是必需的');
  }

  console.log('[FrameGen] 开始生成首尾帧，storyboardId:', storyboardId);
  if (onProgress) onProgress(5);

  // 1. 查询分镜数据
  const storyboard = await queryOne(
    'SELECT * FROM storyboards WHERE id = ?',
    [storyboardId]
  );
  if (!storyboard) {
    throw new Error(`分镜 ${storyboardId} 不存在`);
  }

  // 项目视觉风格（必填，未设置则报错）
  const visualStyle = await requireVisualStyle(storyboard.project_id);

  let variables = {};
  try {
    variables = typeof storyboard.variables_json === 'string'
      ? JSON.parse(storyboard.variables_json || '{}')
      : (storyboard.variables_json || {});
  } catch (e) {
    variables = {};
  }

  const description = prompt || storyboard.prompt_template || '';
  
  // 解析分镜空间描述
  let spatialDescription = null;
  if (storyboard.spatial_description) {
    try {
      spatialDescription = typeof storyboard.spatial_description === 'string' 
        ? JSON.parse(storyboard.spatial_description) 
        : storyboard.spatial_description;
    } catch (e) {
      console.warn('[FrameGen] 解析 spatial_description 失败:', e.message);
    }
  }
  
  trace('查询分镜数据', { storyboardId, idx: storyboard.idx, sceneState: inputSceneState || variables.scene_state, hasAction: variables.hasAction, location: variables.location, hasSpatialDesc: !!spatialDescription });

  // 2. 收集候选参考图（角色三视图 + 场景图）
  if (onProgress) onProgress(10);
  const { candidateImages, characterName, characterInfo, location, sceneInfo } = await collectCandidateImages(storyboard, variables);

  // 场景状态（优先用调用方传入，否则从 variables_json 读取）
  const sceneState = inputSceneState || variables.scene_state || 'normal';
  const environmentChange = inputEnvironmentChange || variables.environment_change || 'none';

  // 2.3~2.5 追加上下文候选图（更新版空镜 + 上一镜头尾帧）
  const { prevShotData, resolvedPrevEndState, resolvedPrevDescription, resolvedIsFirstScene } = await appendContextCandidates({
    candidateImages, storyboard, variables, location,
    activeSceneUrl, prevEndFrameUrl: prevEndFrameUrl, prevDescription,
    prevEndState: inputPrevEndState, isFirstScene
  });

  // === 智能帧生成：检测已有帧，支持只生成缺失的帧 ===
  // regenerateTarget: 'first' | 'last' | 'both' | undefined
  // - 'first': 只生成首帧（保留已有尾帧）
  // - 'last': 只生成尾帧（保留已有首帧）
  // - 'both' / undefined: 自动检测，都生成
  const existingFirstFrame = storyboard.first_frame_url;
  const existingLastFrame = storyboard.last_frame_url;

  let needGenerateFirst = true;
  let needGenerateLast = true;

  if (regenerateTarget === 'first') {
    needGenerateLast = false;
    console.log('[FrameGen] 仅生成首帧（保留已有尾帧）');
  } else if (regenerateTarget === 'last') {
    needGenerateFirst = false;
    console.log('[FrameGen] 仅生成尾帧（保留已有首帧）');
  } else if (!regenerateTarget || regenerateTarget === 'both') {
    // 自动检测：如果一帧存在另一帧缺失，只生成缺失的
    if (existingFirstFrame && !existingLastFrame) {
      needGenerateFirst = false;
      console.log('[FrameGen] 自动检测：首帧已存在，仅生成尾帧');
    } else if (!existingFirstFrame && existingLastFrame) {
      needGenerateLast = false;
      console.log('[FrameGen] 自动检测：尾帧已存在，仅生成首帧');
    }
  }

  trace('帧生成策略', { needGenerateFirst, needGenerateLast, existingFirstFrame: !!existingFirstFrame, existingLastFrame: !!existingLastFrame, regenerateTarget });

  let persistedStartFrame = existingFirstFrame;
  let persistedEndFrame = existingLastFrame;
  let startPrompt = '';
  let endPrompt = '';

  // === 生成首帧（如果需要） ===
  if (needGenerateFirst) {
    // 2.8 AI 选择首帧参考图
    if (onProgress) onProgress(13);
    const startCandidates = [...candidateImages];
    // 如果尾帧已存在，加入作为参考
    if (existingLastFrame && !needGenerateLast) {
      startCandidates.push({ id: 'existing_last_frame', label: '本镜头尾帧（已保留）', url: existingLastFrame, description: '本镜头已有的尾帧画面，展示动作结束后的状态。首帧应展示动作开始前的状态，与尾帧保持角色、场景、风格的一致性' });
    }
    const currentShotData = { prompt_template: description, variables_json: variables, first_frame_url: null, last_frame_url: existingLastFrame };
    const startRefResult = await selectReferenceImages({
      textModel,
      frameType: 'start',
      currentShot: currentShotData,
      prevShot: prevShotData,
      availableImages: startCandidates
    });
    console.log('[FrameGen] AI 选择首帧参考图:', startRefResult.selectedUrls.length, '张 |', startRefResult.reasoning);

    // 3. 生成首帧提示词
    if (onProgress) onProgress(15);
    startPrompt = description;
    if (textModel) {
      console.log('[FrameGen] 使用文本模型生成首帧提示词...');
      startPrompt = await generateFramePrompt({ textModel, description, frameType: 'start', characterInfo, sceneInfo, shotType: variables.shotType, emotion: variables.emotion, prevDescription: resolvedPrevDescription || null, visualStyle, startFrameDesc: variables.startFrame, endFrameDesc: variables.endFrame, dialogue: variables.dialogue, prevEndState: resolvedPrevEndState, endState: variables.endState, sceneState, environmentChange, directorParams: variables.directorParams, spatialDescription });
      trace('首帧提示词', { prompt: startPrompt });
      console.log(`\x1b[32m[FrameGen] 首帧提示词: ${startPrompt}\x1b[0m`);
    } else {
      const prevHint = resolvedPrevDescription ? `，承接上一镜头「${resolvedPrevDescription}」的结束状态` : '';
      startPrompt = `${description}，画面开始时刻，动作起始状态${prevHint}`;
      console.log('[FrameGen] 无文本模型，使用拼接提示词');
    }

    // 4. 生成首帧
    if (onProgress) onProgress(25);
    console.log('[FrameGen] 开始生成首帧...');
    const startFrame = await generateSingleImage(modelName, startPrompt, aspectRatio, 'FrameGen-Start', startRefResult.selectedUrls);

    // 持久化首帧到 MinIO
    persistedStartFrame = await downloadAndStore(
      startFrame,
      `images/frames/${storyboardId}/first_frame`,
      { fallbackExt: '.png' }
    );

    // 保存首帧到数据库
    const startUpdateResult = await execute(
      'UPDATE storyboards SET first_frame_url = ? WHERE id = ?',
      [persistedStartFrame, storyboardId]
    );
    assertUpdated(startUpdateResult, '[FrameGen] 首帧');
    await assertPersistedFields({
      table: 'storyboards',
      id: storyboardId,
      fields: ['first_frame_url'],
      label: '[FrameGen] 首帧'
    });
    console.log('[FrameGen] 首帧已保存:', persistedStartFrame);
    trace('首帧持久化完成', { url: persistedStartFrame, promptUsed: startPrompt, refImages: startRefResult.selectedUrls });
  } else {
    console.log('[FrameGen] 跳过首帧生成，使用已有首帧:', existingFirstFrame);
    if (onProgress) onProgress(40);
  }

  // === 生成尾帧（如果需要） ===
  if (needGenerateLast) {
    // 5. 生成尾帧提示词
    if (onProgress) onProgress(50);
    endPrompt = description;
    if (textModel) {
      console.log('[FrameGen] 使用文本模型生成尾帧提示词...');
      endPrompt = await generateFramePrompt({ textModel, description, frameType: 'end', characterInfo, sceneInfo, shotType: variables.shotType, emotion: variables.emotion, prevDescription: null, visualStyle, startFrameDesc: variables.startFrame, endFrameDesc: variables.endFrame, dialogue: variables.dialogue, prevEndState: null, endState: variables.endState, sceneState, environmentChange, directorParams: variables.directorParams, spatialDescription });
      trace('尾帧提示词', { prompt: endPrompt });
      console.log(`\x1b[32m[FrameGen] 尾帧提示词: ${endPrompt}\x1b[0m`);
    } else {
      endPrompt = `${description}，画面结束时刻，动作完成状态，延续前一帧的场景和角色`;
    }

    // 6. AI 选择尾帧参考图（加入首帧作为候选）
    if (onProgress) onProgress(55);
    const endCandidates = [...candidateImages];
    // 用刚生成的或已有的首帧作为参考
    const firstFrameForRef = persistedStartFrame;
    if (firstFrameForRef) {
      endCandidates.push({ id: 'current_start_frame', label: needGenerateFirst ? '本镜头首帧（刚生成）' : '本镜头首帧（已保留）', url: firstFrameForRef, description: '本镜头的首帧画面，展示动作开始前的状态。尾帧应展示动作结束后的状态，与首帧保持角色、场景、风格的一致性' });
    }
    const endRefResult = await selectReferenceImages({
      textModel,
      frameType: 'end',
      currentShot: { prompt_template: description, variables_json: variables, first_frame_url: persistedStartFrame, last_frame_url: null },
      prevShot: prevShotData,
      availableImages: endCandidates
    });
    console.log('[FrameGen] AI 选择尾帧参考图:', endRefResult.selectedUrls.length, '张 |', endRefResult.reasoning);

    // 7. 生成尾帧
    if (onProgress) onProgress(60);
    console.log('[FrameGen] 开始生成尾帧...');
    const endFrame = await generateSingleImage(modelName, endPrompt, aspectRatio, 'FrameGen-End', endRefResult.selectedUrls);

    // 持久化尾帧到 MinIO
    persistedEndFrame = await downloadAndStore(
      endFrame,
      `images/frames/${storyboardId}/last_frame`,
      { fallbackExt: '.png' }
    );

    // 保存尾帧到数据库
    const endUpdateResult = await execute(
      'UPDATE storyboards SET last_frame_url = ? WHERE id = ?',
      [persistedEndFrame, storyboardId]
    );
    assertUpdated(endUpdateResult, '[FrameGen] 尾帧');
    await assertPersistedFields({
      table: 'storyboards',
      id: storyboardId,
      fields: ['last_frame_url'],
      label: '[FrameGen] 尾帧'
    });
    console.log('[FrameGen] 尾帧已保存:', persistedEndFrame);
    trace('尾帧持久化完成', { url: persistedEndFrame, promptUsed: endPrompt, refImages: endRefResult.selectedUrls });
  } else {
    console.log('[FrameGen] 跳过尾帧生成，使用已有尾帧:', existingLastFrame);
    if (onProgress) onProgress(80);
  }

  // modified 镜头：自动生成更新版空镜场景图并存入 DB（供后续 inherit 镜头使用）
  if (sceneState === 'modified' && (variables.location || location)) {
    trace('触发空镜场景图生成', { sceneState, location: variables.location || location, environmentChange });
    try {
      await generateUpdatedSceneImage({
        storyboardId,
        location: variables.location || location,
        environmentChange,
        imageModel: modelName,
        textModel,
        aspectRatio
      });
    } catch (e) {
      console.warn('[FrameGen] 更新版场景图生成失败，不影响帧生成结果:', e.message);
    }
  }

  if (onProgress) onProgress(100);
  console.log('[FrameGen] 首尾帧生成完成', { generated: [needGenerateFirst && 'first', needGenerateLast && 'last'].filter(Boolean).join('+') });

  return {
    startFrame: persistedStartFrame,
    endFrame: persistedEndFrame,
    model: modelName,
    startPrompt,
    endPrompt,
    generatedFrames: { first: needGenerateFirst, last: needGenerateLast }
  };
}

module.exports = handleFrameGeneration;
