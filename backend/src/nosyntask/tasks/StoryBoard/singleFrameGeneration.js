/**
 * 分镜单帧生成处理器（无动作镜头，仅生成首帧）
 *
 * 流程：
 * 1. 查询分镜数据，获取角色列表和场景名称
 * 2. 查询所有角色的三视图 URL + 场景图 URL，拼接为 imageUrls 参考数组（支持多角色）
 * 3. 如果有上一镜头尾帧（prevEndFrameUrl），加入参考图列表以保持连续性
 * 4. 调用文本模型，根据镜头描述 + 上一镜头上下文生成帧提示词
 * 5. 以 imageUrls + 提示词 调用图片模型生成单帧，保存到数据库
 *
 * input:  { storyboardId, description, imageModel, textModel, aspectRatio, prevEndFrameUrl, prevDescription, isFirstScene }
 * output: { firstFrameUrl, promptUsed, model }
 */

const { execute, queryOne, queryAll } = require('../../../dbHelper');
const { downloadAndStore } = require('../../../utils/fileStorage');
const baseTextModelCall = require('../base/baseTextModelCall');
const imageGeneration = require('../base/imageGeneration');
const { requireVisualStyle } = require('../../../utils/getProjectStyle');
const { generateUpdatedSceneImage } = require('./sceneRefUtils');
const { selectReferenceImages } = require('./referenceImageSelector');
const { collectCandidateImages, appendContextCandidates } = require('./collectCandidateImages');
const { traced, trace } = require('../../engine/generationTrace');
const { assertUpdated, assertPersistedFields } = require('./persistenceGuard');
const { saveFrameHistory, getNextVersionNumber } = require('./saveFrameHistory');

// collectReferenceImages 已提取到 collectCandidateImages.js 共享模块

async function handleSingleFrameGeneration(inputParams, onProgress) {
  const { storyboardId, description, imageModel: modelName, textModel, aspectRatio, resolution, prevEndFrameUrl, prevDescription, prevEndState: inputPrevEndState, isFirstScene, sceneState: inputSceneState, environmentChange: inputEnvironmentChange, activeSceneUrl, visualStyle: inputVisualStyle } = inputParams;

  if (!storyboardId) {
    throw new Error('缺少必要参数: storyboardId');
  }

  if (!modelName) {
    throw new Error('imageModel 参数是必需的');
  }

  console.log('[SingleFrameGen] 开始生成单帧，storyboardId:', storyboardId);
  if (onProgress) onProgress(5);

  // 1. 查询分镜数据
  const storyboard = await queryOne(
    'SELECT * FROM storyboards WHERE id = ?',
    [storyboardId]
  );
  if (!storyboard) {
    throw new Error(`分镜 ${storyboardId} 不存在`);
  }

  // 项目视觉风格：优先使用传入的预取数据，否则单独查询
  const visualStyle = inputVisualStyle || await requireVisualStyle(storyboard.project_id);
  if (inputVisualStyle) {
    console.log('[SingleFrameGen] 使用预取的视觉风格（跳过DB查询）');
  }

  let variables = {};
  try {
    variables = typeof storyboard.variables_json === 'string'
      ? JSON.parse(storyboard.variables_json || '{}')
      : (storyboard.variables_json || {});
  } catch (e) {
    variables = {};
  }

  const desc = description || storyboard.prompt_template || '';
  
  // 解析分镜空间描述
  let spatialDescription = null;
  if (storyboard.spatial_description) {
    try {
      spatialDescription = typeof storyboard.spatial_description === 'string' 
        ? JSON.parse(storyboard.spatial_description) 
        : storyboard.spatial_description;
    } catch (e) {
      console.warn('[SingleFrameGen] 解析 spatial_description 失败:', e.message);
    }
  }
  
  trace('查询分镜数据', { storyboardId, idx: storyboard.idx, sceneState: inputSceneState || variables.scene_state, location: variables.location, hasSpatialDesc: !!spatialDescription });

  // 2. 收集候选参考图（角色三视图 + 场景图）
  if (onProgress) onProgress(10);
  const { candidateImages, characterName, characterInfo, location, sceneInfo } = await collectCandidateImages(storyboard, variables);

  const sceneState = inputSceneState || variables.scene_state || 'normal';
  const environmentChange = inputEnvironmentChange || variables.environment_change || 'none';

  // 2.3~2.5 追加上下文候选图（更新版空镜 + 上一镜头尾帧）
  const { prevShotData, resolvedPrevEndState, resolvedPrevDescription, resolvedIsFirstScene } = await appendContextCandidates({
    candidateImages, storyboard, variables, location,
    activeSceneUrl, prevEndFrameUrl, prevDescription,
    prevEndState: inputPrevEndState, isFirstScene
  });

  // 2.8 AI 选择参考图
  if (onProgress) onProgress(15);
  const refResult = await selectReferenceImages({
    textModel,
    frameType: 'single',
    currentShot: { prompt_template: desc, variables_json: variables, first_frame_url: null, last_frame_url: null },
    prevShot: prevShotData,
    availableImages: candidateImages
  });
  const imageUrls = refResult.selectedUrls;
  console.log('[SingleFrameGen] AI 选择参考图:', imageUrls.length, '张 |', refResult.reasoning);

  // 3. 生成帧提示词
  if (onProgress) onProgress(20);
  let promptUsed = desc;

  if (textModel) {
    console.log('[SingleFrameGen] 使用文本模型生成帧提示词...');

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
    // 场景约束根据 sceneState 动态调整
    let sceneConstraint = '（已提供场景参考图，画面的色调、光照、氛围必须与参考图一致。注意：参考图展示的是场景全貌，当前镜头可能仅展示场景的某个视角方向）';
    if (sceneState === 'modified') {
      sceneConstraint = `（⚠️ 本镜头环境正在发生变化：${environmentChange || 'unknown change'}。不要参考原始场景图的物品状态，以上一帧尾帧为基准，在此基础上呈现上述变化）`;
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

    const shotInfo = variables.shotType ? `镜头类型: ${variables.shotType}` : '';
    const emotionInfo = variables.emotion ? `情绪/氛围: ${variables.emotion}` : '';
    const styleInfo = visualStyle ? `视觉风格: ${visualStyle}` : '';
    const prevEndStateBlock = resolvedPrevEndState
      ? `【上一镜头结束状态 - 必须衔接】\n${resolvedPrevEndState}\n（严格衔接要求：\n① 角色姿势、位置、朝向必须与上述状态完全一致，不得出现不可接受的跳变\n② 光线/时间必须与上述【时空】描述一致：如上一镜头是深夜就不能变成白天，黄昏就不能变成正午\n③ 如果上一镜头有持续性环境效果（篝火、风雪等），当前画面必须保持一致）`
      : '';
    const prevContext = resolvedPrevDescription
      ? `上一个镜头描述：${resolvedPrevDescription}\n注意：当前画面需要自然衔接上一个镜头的结束状态，保持角色、场景、光线的连续性。`
      : '';
    let dialogueBlock = '';
    if (variables.dialogues && Array.isArray(variables.dialogues) && variables.dialogues.length > 0) {
      const lines = variables.dialogues.map(d => `${d.character}："${d.line}"`).join('\n');
      dialogueBlock = `【角色对白】\n${lines}\n（请根据对白内容调整对应角色的面部表情和嘴型状态，说话中的角色嘴巴应微张）`;
    } else if (variables.dialogue) {
      dialogueBlock = `【角色对白】"${variables.dialogue}"（请根据对白内容调整角色的面部表情和嘴型状态）`;
    }

    // 摄像机空间推理（反打镜头感知）
    let cameraPositionBlock = '';
    if (resolvedPrevEndState && characterInfo) {
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
    if (variables.directorParams) {
      const dp = variables.directorParams;
      const lighting = dp.lighting || {};
      const camera = dp.camera || {};
      const atmosphere = dp.atmosphere || {};
      
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
      
      if (dp.customNotes) {
        directorBlock += `\n【导演备注】${dp.customNotes}`;
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

    const extraInfo = [charBlock, sceneBlock, spatialDescBlock, shotInfo, emotionInfo, styleInfo, prevEndStateBlock, cameraPositionBlock, dialogueBlock, directorBlock, charConstraint, prevContext].filter(Boolean).join('\n');

    const promptGenerationResult = await baseTextModelCall({
      prompt: `你是一个专业的图片生成提示词专家。

请根据以下分镜描述，生成一个适合图片生成的详细提示词：

分镜描述：${desc}
${extraInfo}

【内容安全规则 - 必须遵守】
- 所有内容必须健康、正面、适合全年龄观看
- 避免任何可能被误判为敏感的描述：
  * 不要过度描述身体部位或姿态细节
  * 避免使用可能引起歧义的词汇（如 exposed, revealing, intimate, seductive 等）
  * 人物表情和动作应自然、得体
  * 服装描述应简洁，避免过度细节
- 场景应积极向上，避免暴力、恐怖、阴暗等元素
- 如果原始描述包含可能敏感的内容，请用更中性、安全的方式改写

要求：
1. 提示词要详细描述画面内容、构图、光线、氛围
2. 【细节保留】角色的每一个外貌细节都必须原样写入提示词：发色、发型、瞳色、服装款式、服装颜色、配饰等，不得省略或概括。例如"黑色双马尾、红色水手服、蓝色百褶裙"必须逐项写出，不能简化为"a girl in school uniform"
3. 【细节保留】场景中从当前摄像机角度可见的环境细节都必须写入提示词：建筑结构、物品摆设、光源方向、色调等。摄像机背后的元素不应出现在描述中
4. 镜头类型决定构图（如特写聚焦面部，远景展示全貌）
5. 如果有上一镜头信息，确保画面与上一镜头自然衔接
6. 如果有视觉风格要求，提示词必须体现该风格特征
7. 严格遵守角色约束：有角色时与参考图一致，无角色时绝对不能出现人物
8. 【内容安全】确保所有描述健康、正面，避免任何可能触发内容审核的词汇或概念
9. 【禁止文字/字幕】画面中绝对不能出现任何文字、字幕、标题、水印。提示词中必须包含 "no text, no subtitles, no captions, no watermark, no letters, no words" 约束
10. 只输出英文提示词，不要其他解释

提示词：`,
      textModel,
      temperature: 0.7
    });

    promptUsed = promptGenerationResult.content || desc;
    trace('生成帧提示词', { prompt: promptUsed });
    console.log(`\x1b[32m[SingleFrameGen] 生成的提示词: ${promptUsed}\x1b[0m`);
  } else {
    const prevHint = resolvedPrevDescription ? `，承接上一镜头「${resolvedPrevDescription}」的结束状态` : '';
    promptUsed = `${desc}${prevHint}`;
    console.log('[SingleFrameGen] 无文本模型，使用拼接提示词');
  }

  // 4. 生成首帧图片
  if (onProgress) onProgress(50);
  console.log('[SingleFrameGen] 生成首帧图片...');

  const imageResult = await imageGeneration({
    prompt: promptUsed,
    imageModel: modelName,
    aspectRatio,
    resolution,
    imageUrls: refResult.selectedUrls.length > 0 ? refResult.selectedUrls : undefined
  });

  const firstFrameUrl = imageResult.image_url;
  trace('图片生成完成', { url: firstFrameUrl, model: modelName, promptUsed, refImages: refResult.selectedUrls });
  console.log('[SingleFrameGen] 首帧生成完成:', firstFrameUrl);

  // 获取版本号并持久化首帧到 MinIO（带版本号路径，避免覆盖历史版本）
  const versionNum = await getNextVersionNumber(storyboardId, 'first');
  const persistedUrl = await downloadAndStore(
    firstFrameUrl,
    `images/frames/${storyboardId}/first_frame_v${versionNum}`,
    { fallbackExt: '.png' }
  );

  // 保存到数据库
  // 【首尾帧统一】静态镜头首帧=尾帧，同时设置 last_frame_url 以保证后续镜头参考一致性
  if (onProgress) onProgress(90);
  console.log('[SingleFrameGen] 保存首帧到数据库（静态镜头首尾帧统一）...');

  const updateResult = await execute(
    'UPDATE storyboards SET first_frame_url = ?, last_frame_url = ? WHERE id = ?',
    [persistedUrl, persistedUrl, storyboardId]
  );
  assertUpdated(updateResult, '[SingleFrameGen] 静态镜头首尾帧');
  await assertPersistedFields({
    table: 'storyboards',
    id: storyboardId,
    fields: ['first_frame_url', 'last_frame_url'],
    label: '[SingleFrameGen] 静态镜头首尾帧'
  });
  trace('首尾帧持久化完成（静态镜头）', { firstFrameUrl: persistedUrl, lastFrameUrl: persistedUrl });

  // 保存到帧历史版本表（静态镜头：首尾帧相同，只保存一条 first 类型）
  try {
    const genParams = { model: modelName, aspectRatio, resolution };
    const ver = await saveFrameHistory(storyboardId, 'first', persistedUrl, promptUsed, genParams);
    // 静态镜头的 last 帧也单独保存一条历史，便于用户在尾帧历史中也能看到
    await saveFrameHistory(storyboardId, 'last', persistedUrl, promptUsed, genParams);
    console.log(`[SingleFrameGen] 帧历史版本已保存 (v${ver})`);
  } catch (e) {
    console.warn('[SingleFrameGen] 保存帧历史版本失败:', e.message);
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
      console.warn('[SingleFrameGen] 更新版场景图生成失败，不影响帧生成结果:', e.message);
    }
  }

  if (onProgress) onProgress(100);
  console.log('[SingleFrameGen] 单帧生成完成');

  return {
    firstFrameUrl: persistedUrl,
    lastFrameUrl: persistedUrl, // 静态镜头首尾帧统一
    startFrame: persistedUrl,
    endFrame: persistedUrl,
    imageUrl: persistedUrl,
    promptUsed,
    model: imageResult.model || modelName
  };
}

module.exports = handleSingleFrameGeneration;
