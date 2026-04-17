/**
 * 草图转图片处理器（核心处理器）
 *
 * 流程：
 * 1. 根据 storyboardId 从数据库查询分镜完整数据（包含 variables_json、关联的角色和场景）
 * 2. 调用 collectCandidateImages.js 收集角色三视图和场景参考图
 * 3. 调用 referenceImageSelector.js AI 选择参考图（如果该功能可用）
 * 4. 构建生成参数：
 *    - prompt: 从 variables_json 或分镜描述构建
 *    - sketch_url: processedSketchUrl（控制图）
 *    - sketch_type: 决定使用哪种 ControlNet
 *    - control_strength: 控制强度
 *    - imageUrls: 选中的参考图数组
 * 5. 调用 aiModelService 发起生成请求
 * 6. 将生成结果存入 storyboards.first_frame_url
 * 7. 返回结果数据
 *
 * input:  { storyboardId, processedSketchUrl, sketchType, prompt, controlStrength, imageUrls, imageModel, textModel, aspectRatio }
 * output: { firstFrameUrl, lastFrameUrl, imageUrl, promptUsed, model, sketchType }
 */

const { execute, queryOne, queryAll } = require('../../../dbHelper');
const { downloadAndStore } = require('../../../utils/fileStorage');
const baseTextModelCall = require('../base/baseTextModelCall');
const imageGeneration = require('../base/imageGeneration');
const { requireVisualStyle } = require('../../../utils/getProjectStyle');
const { selectReferenceImages } = require('./referenceImageSelector');
const { collectCandidateImages, appendContextCandidates } = require('./collectCandidateImages');
const { traced, trace } = require('../../engine/generationTrace');
const { assertUpdated, assertPersistedFields } = require('./persistenceGuard');
const { saveFrameHistory, getNextVersionNumber, generateBatchId } = require('./saveFrameHistory');

/**
 * 草图转图片主函数
 */
const handleSketchToImage = traced('草图转图片', async function _handleSketchToImage(inputParams, onProgress) {
  const {
    storyboardId,
    processedSketchUrl,
    sketchType = 'storyboard_sketch',
    prompt: inputPrompt,
    controlStrength = 0.8,
    imageUrls: inputImageUrls,
    imageModel: modelName,
    textModel,
    aspectRatio
  } = inputParams;

  if (!storyboardId) {
    throw new Error('缺少必要参数: storyboardId');
  }

  if (!processedSketchUrl) {
    throw new Error('缺少必要参数: processedSketchUrl（预处理后的草图 URL）');
  }

  if (!modelName) {
    throw new Error('缺少必要参数: imageModel');
  }

  console.log('[SketchToImage] 开始草图转图片，storyboardId:', storyboardId);
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

  const desc = inputPrompt || storyboard.prompt_template || '';
  trace('查询分镜数据', { storyboardId, idx: storyboard.idx, location: variables.location });
  if (onProgress) onProgress(10);

  // 2. 收集候选参考图（角色三视图 + 场景图）
  let candidateImages = [];
  let characterName = null;
  let characterInfo = null;
  let location = variables.location || '';
  let sceneInfo = null;

  try {
    const collected = await collectCandidateImages(storyboard, variables);
    candidateImages = collected.candidateImages;
    characterName = collected.characterName;
    characterInfo = collected.characterInfo;
    location = collected.location;
    sceneInfo = collected.sceneInfo;
    console.log('[SketchToImage] 收集到候选参考图:', candidateImages.length, '张');
  } catch (e) {
    // 如果收集候选图失败（如场景未关联），记录警告但继续执行
    console.warn('[SketchToImage] 收集候选参考图失败，将使用用户提供的参考图:', e.message);
  }
  if (onProgress) onProgress(20);

  // 3. AI 选择参考图（如果有文本模型且有候选图）
  let selectedUrls = inputImageUrls || [];
  let selectionReasoning = '';

  if (textModel && candidateImages.length > 0) {
    try {
      if (onProgress) onProgress(25);
      const refResult = await selectReferenceImages({
        textModel,
        frameType: 'single',  // 草图生成类似单帧
        currentShot: {
          prompt_template: desc,
          variables_json: variables,
          first_frame_url: null,
          last_frame_url: null
        },
        prevShot: null,  // 草图生成通常不考虑上一镜头
        availableImages: candidateImages
      });
      selectedUrls = refResult.selectedUrls;
      selectionReasoning = refResult.reasoning;
      console.log('[SketchToImage] AI 选择参考图:', selectedUrls.length, '张 |', selectionReasoning);
    } catch (e) {
      console.warn('[SketchToImage] AI 参考图选择失败，使用默认策略:', e.message);
      // 回退：使用前 3 张候选图
      selectedUrls = candidateImages.slice(0, 3).map(img => img.url);
    }
  } else if (!selectedUrls || selectedUrls.length === 0) {
    // 没有 AI 选择，也没有用户提供的参考图，使用候选图
    selectedUrls = candidateImages.slice(0, 3).map(img => img.url);
  }
  trace('参考图选择完成', { selectedCount: selectedUrls.length, reasoning: selectionReasoning });
  if (onProgress) onProgress(30);

  // 4. 生成提示词
  let promptUsed = desc;

  if (textModel && desc) {
    console.log('[SketchToImage] 使用文本模型优化提示词...');

    // 构建角色信息块
    let charBlock = '';
    let charConstraint = '';
    if (characterInfo) {
      const characters = Array.isArray(characterInfo) ? characterInfo : [characterInfo];
      if (characters.length === 1) {
        const char = characters[0];
        charBlock = `【角色信息】
角色名称: ${char.name}
外貌特征: ${char.appearance}
角色描述: ${char.description}
（已提供角色参考图，角色的发型、发色、瞳色、服装款式和颜色、体型比例、配饰必须与参考图一致）`;
        charConstraint = `- 角色外貌、服装、发型必须与参考图完全一致
- 严禁出现参考图中不存在的额外人物`;
      } else {
        const charInfoText = characters.map(char =>
          `角色名称: ${char.name}\n外貌特征: ${char.appearance}\n角色描述: ${char.description}`
        ).join('\n\n');
        charBlock = `【角色信息（多角色场景）】\n${charInfoText}`;
        charConstraint = `- 每个角色的外貌、服装、发型必须与各自的参考图完全一致
- 严禁出现参考图中不存在的额外人物`;
      }
    }

    // 构建场景信息块
    const sceneBlock = sceneInfo
      ? `【场景信息】
场景名称: ${sceneInfo.name}
场景描述: ${sceneInfo.description}
环境: ${sceneInfo.environment}
光照: ${sceneInfo.lighting}
氛围: ${sceneInfo.mood}`
      : '';

    const styleInfo = visualStyle ? `视觉风格: ${visualStyle}` : '';
    const shotInfo = variables.shotType ? `镜头类型: ${variables.shotType}` : '';
    let dialogueBlock = '';
    if (variables.dialogues && Array.isArray(variables.dialogues) && variables.dialogues.length > 0) {
      const lines = variables.dialogues.map(d => `${d.character}："${d.line}"`).join('\n');
      dialogueBlock = `【角色对白】\n${lines}`;
    } else if (variables.dialogue) {
      dialogueBlock = `【角色对白】"${variables.dialogue}"`;
    }

    const extraInfo = [charBlock, sceneBlock, styleInfo, shotInfo, dialogueBlock, charConstraint].filter(Boolean).join('\n');

    try {
      const promptGenerationResult = await baseTextModelCall({
        prompt: `你是一个专业的图片生成提示词专家。

请根据以下分镜描述和草图信息，生成一个适合草图转图片的详细提示词：

分镜描述：${desc}
草图类型：${sketchType === 'detailed_lineart' ? '精细线稿（线条清晰、细节丰富）' : '分镜草图（快速草稿、构图参考）'}
${extraInfo}

【草图转图片特殊要求】
1. 提示词要详细描述画面内容、构图、光线、氛围
2. 因为有草图作为构图控制，提示词应更多关注颜色、材质、光影、氛围
3. 角色外貌细节必须详细写入：发色、发型、瞳色、服装款式、服装颜色等
4. 保持草图中的构图和姿势，用提示词补充视觉细节
5. 【禁止文字/字幕】画面中绝对不能出现任何文字、字幕、标题、水印
6. 只输出英文提示词，不要其他解释

提示词：`,
        textModel,
        temperature: 0.7
      });

      promptUsed = promptGenerationResult.content || desc;
      trace('生成优化提示词', { prompt: promptUsed });
      console.log(`\x1b[32m[SketchToImage] 优化后的提示词: ${promptUsed}\x1b[0m`);
    } catch (e) {
      console.warn('[SketchToImage] 提示词优化失败，使用原始描述:', e.message);
    }
  }
  if (onProgress) onProgress(40);

  // 5. 调用图片生成（带草图控制参数）
  console.log('[SketchToImage] 调用图片生成...');

  // 构建生成参数
  // 注意：草图控制参数通过 submitParams 传递给模型
  const generateParams = {
    prompt: promptUsed,
    imageModel: modelName,
    aspectRatio,
    // 草图作为控制图（类似 ControlNet 的 control_image）
    imageUrl: processedSketchUrl,
    // 参考图数组
    imageUrls: selectedUrls.length > 0 ? selectedUrls : undefined
  };

  // 添加草图控制元数据（供模型处理器使用）
  // 这些参数会被传递给支持草图控制的模型
  const submitParams = {
    ...generateParams,
    // 草图控制特有参数
    sketchUrl: processedSketchUrl,
    sketchType: sketchType,
    controlStrength: controlStrength
  };

  if (onProgress) onProgress(50);

  const imageResult = await imageGeneration(submitParams, (progress) => {
    // 映射进度到 50-90 区间
    if (onProgress) {
      const mappedProgress = 50 + Math.floor(progress * 0.4);
      onProgress(Math.min(mappedProgress, 90));
    }
  });

  const generatedUrl = imageResult.image_url;
  trace('图片生成完成', { url: generatedUrl, model: modelName, promptUsed, sketchType, controlStrength });
  console.log('[SketchToImage] 图片生成完成:', generatedUrl);

  // 6. 获取版本号并持久化到 MinIO（带版本号路径，避免覆盖历史版本）
  if (onProgress) onProgress(92);
  const versionNum = await getNextVersionNumber(storyboardId, 'first');
  const persistedUrl = await downloadAndStore(
    generatedUrl,
    `images/frames/${storyboardId}/sketch_frame_v${versionNum}`,
    { fallbackExt: '.png' }
  );

  // 7. 保存到数据库（更新 first_frame_url 和 last_frame_url）
  // 草图生成的结果作为静态帧，首尾帧相同
  if (onProgress) onProgress(95);
  console.log('[SketchToImage] 保存结果到数据库...');

  const updateResult = await execute(
    'UPDATE storyboards SET first_frame_url = ?, last_frame_url = ? WHERE id = ?',
    [persistedUrl, persistedUrl, storyboardId]
  );
  assertUpdated(updateResult, '[SketchToImage] 草图帧');
  await assertPersistedFields({
    table: 'storyboards',
    id: storyboardId,
    fields: ['first_frame_url', 'last_frame_url'],
    label: '[SketchToImage] 草图帧'
  });
  trace('帧持久化完成', { firstFrameUrl: persistedUrl, lastFrameUrl: persistedUrl });

  // 保存到帧历史版本表（草图帧：首尾帧相同）
  const skBatchId = generateBatchId();
  try {
    const genParams = { model: modelName, aspectRatio, sketchType, controlStrength };
    const ver = await saveFrameHistory(storyboardId, 'first', persistedUrl, promptUsed, genParams, skBatchId);
    await saveFrameHistory(storyboardId, 'last', persistedUrl, promptUsed, genParams, skBatchId);
    console.log(`[SketchToImage] 帧历史版本已保存 (v${ver}), batchId:`, skBatchId);
  } catch (e) {
    console.warn('[SketchToImage] 保存帧历史版本失败:', e.message);
  }

  if (onProgress) onProgress(100);
  console.log('[SketchToImage] 草图转图片完成');

  return {
    firstFrameUrl: persistedUrl,
    lastFrameUrl: persistedUrl,
    imageUrl: persistedUrl,
    promptUsed,
    model: imageResult.model || modelName,
    sketchType,
    controlStrength,
    referenceImagesUsed: selectedUrls.length
  };
}, {
  extractInput: (params) => ({
    storyboardId: params.storyboardId,
    sketchType: params.sketchType,
    controlStrength: params.controlStrength,
    imageModel: params.imageModel
  }),
  extractOutput: (r) => ({
    imageUrl: r.imageUrl,
    model: r.model,
    sketchType: r.sketchType,
    refCount: r.referenceImagesUsed
  })
});

module.exports = handleSketchToImage;
