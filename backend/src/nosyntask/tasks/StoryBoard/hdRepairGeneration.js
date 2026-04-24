/**
 * 高清修复帧生成处理器
 *
 * 流程：
 * 1. 获取当前分镜的首帧/尾帧图片 URL
 * 2. 以原图为参考，使用图片模型以高分辨率重新生成（图生图，低 strength 保持一致性）
 * 3. 持久化到 MinIO 并更新数据库
 *
 * input:  { storyboardId, imageModel, textModel, aspectRatio, targetFrame? }
 * output: { firstFrameUrl, lastFrameUrl, promptUsed, model }
 */

const { execute, queryOne } = require('../../../dbHelper');
const { downloadAndStore } = require('../../../utils/fileStorage');
const imageGeneration = require('../base/imageGeneration');
const { traced, trace } = require('../../engine/generationTrace');
const { saveFrameHistory, getNextVersionNumber, generateBatchId } = require('./saveFrameHistory');
const { assertUpdated, assertPersistedFields } = require('./persistenceGuard');

async function handleHdRepairGeneration(inputParams, onProgress) {
  const {
    storyboardId,
    imageModel: modelName,
    textModel,
    aspectRatio,
    targetFrame = 'first'  // 修复目标：'first' 或 'last'
  } = inputParams;

  if (!storyboardId) {
    throw new Error('缺少必要参数: storyboardId');
  }

  if (!modelName) {
    throw new Error('imageModel 参数是必需的');
  }

  console.log('[HdRepairGen] 开始高清修复，storyboardId:', storyboardId, 'target:', targetFrame);
  if (onProgress) onProgress(5);

  // 1. 查询分镜数据及所属项目风格
  const storyboard = await queryOne(
    `SELECT s.*, p.settings_json
     FROM storyboards s
     JOIN scripts sc ON s.script_id = sc.id
     JOIN projects p ON sc.project_id = p.id
     WHERE s.id = ?`,
    [storyboardId]
  );
  if (!storyboard) {
    throw new Error(`分镜 ${storyboardId} 不存在`);
  }

  // 判断项目风格类型（真人实拍 / 动漫动画）
  let isLiveAction = false;
  try {
    const settings = storyboard.settings_json ? JSON.parse(storyboard.settings_json) : {};
    isLiveAction = settings.isLiveAction || false;
  } catch (e) { /* 忽略 */ }

  trace('查询分镜数据', { storyboardId, idx: storyboard.idx, targetFrame, isLiveAction });

  // 2. 获取待修复的帧图 URL
  const sourceFrameUrl = targetFrame === 'last'
    ? (storyboard.last_frame_url || storyboard.first_frame_url)
    : (storyboard.first_frame_url || storyboard.last_frame_url);

  if (!sourceFrameUrl) {
    throw new Error('当前分镜没有可修复的帧图，请先生成图片');
  }

  console.log('[HdRepairGen] 源帧图 URL:', sourceFrameUrl);

  // 3. 构建高清修复专用提示词（不参考当前分镜描述，使用专门优化的高清修复策略）
  if (onProgress) onProgress(15);

  // 高清修复专用提示词：不依赖原始分镜描述，专注于画质增强指令
  // 配合图生图（strength 0.35）参考原图，模型会自动理解画面内容
  const hdPromptLiveAction = `masterpiece, best quality, ultra highres, 8K UHD, photorealistic, extremely detailed, sharp focus, professional photography, DSLR quality. Preserve all original composition, characters, poses, and scene elements exactly. Enhance fine skin texture, fabric weave details, environmental material textures, subtle lighting variations, shadow depth and gradation, micro-details and surface imperfections. Natural lifelike colors, accurate skin tones, realistic depth of field, film grain texture, cinematic atmosphere, volumetric lighting, lens flare authenticity.`;

  const hdPromptAnime = `masterpiece, best quality, ultra highres, 8K UHD, extremely detailed anime illustration, sharp crisp clean lines, vibrant saturated colors, smooth clean shading, professional illustration quality. Preserve all original character designs, poses, expressions, and scene composition exactly. Enhance line art precision and consistency, color depth and richness, detail density in hair and clothing, rendering quality, background detail level. No compression artifacts, no color banding, no pixelation, no JPEG noise, clean digital art.`;

  let promptUsed = isLiveAction ? hdPromptLiveAction : hdPromptAnime;

  // 可选：如有文本模型，让其在专用提示词基础上做小幅优化（不依赖原始描述）
  if (textModel) {
    try {
      const baseTextModelCall = require('../base/baseTextModelCall');
      const result = await baseTextModelCall({
        prompt: `你是一个图片高清修复专家。请对以下高清修复专用提示词进行小幅优化，使其更加自然流畅，但不要改变其核心画质增强意图。

当前提示词：${promptUsed}

要求：
1. 保持画质增强的核心词汇不变（8K UHD, extremely detailed, sharp focus 等）
2. 保持"保留原图内容不变、仅增强画质"的意图
3. 可适当调整语序使其更自然，但不要删减关键画质增强词
4. 只输出优化后的英文提示词，不要其他解释

优化后的高清修复提示词：`,
        textModel,
        temperature: 0.3
      });
      if (result.content) {
        promptUsed = result.content;
        console.log('[HdRepairGen] AI 微调提示词完成');
      }
    } catch (err) {
      console.warn('[HdRepairGen] AI 微调提示词失败，使用默认高清修复提示词:', err.message);
    }
  }

  trace('高清修复提示词', { promptUsed, isLiveAction });
  console.log(`\x1b[32m[HdRepairGen] 最终提示词: ${promptUsed}\x1b[0m`);

  // 4. 以原图为参考，高分辨率重生成
  if (onProgress) onProgress(40);
  console.log('[HdRepairGen] 调用图片模型高清修复...');

  const imageResult = await imageGeneration({
    prompt: promptUsed,
    imageModel: modelName,
    aspectRatio,
    resolution: '2k',  // 高清修复默认使用 2k 分辨率
    imageUrls: [sourceFrameUrl],
    strength: 0.35,  // 低 strength 保持与原图一致性，仅增强细节
    negative_prompt: storyboard.negative_prompt || null,
    textModel
  });

  const frameUrl = imageResult.image_url;
  trace('高清修复完成', { url: frameUrl, model: modelName });

  // 5. 持久化到 MinIO
  if (onProgress) onProgress(80);

  const versionNum = await getNextVersionNumber(storyboardId, 'first');
  const persistedUrl = await downloadAndStore(
    frameUrl,
    `images/frames/${storyboardId}/first_frame_v${versionNum}_hd`,
    { fallbackExt: '.png' }
  );
  console.log('[HdRepairGen] 帧已持久化:', persistedUrl);

  // 6. 更新数据库
  if (onProgress) onProgress(90);

  const updateResult = await execute(
    'UPDATE storyboards SET first_frame_url = ?, last_frame_url = ? WHERE id = ?',
    [persistedUrl, persistedUrl, storyboardId]
  );
  assertUpdated(updateResult, '[HdRepairGen] 高清修复帧');
  await assertPersistedFields({
    table: 'storyboards',
    id: storyboardId,
    fields: ['first_frame_url', 'last_frame_url'],
    label: '[HdRepairGen] 高清修复帧'
  });

  // 保存帧历史
  const batchId = generateBatchId();
  try {
    const genParams = {
      model: modelName,
      aspectRatio,
      resolution: '2k',
      strength: 0.35,
      type: 'hd_repair'
    };
    const ver = await saveFrameHistory(storyboardId, 'first', persistedUrl, promptUsed, genParams, batchId);
    await saveFrameHistory(storyboardId, 'last', persistedUrl, promptUsed, genParams, batchId);
    console.log(`[HdRepairGen] 帧历史版本已保存 (v${ver}), batchId:`, batchId);
  } catch (e) {
    console.warn('[HdRepairGen] 保存帧历史版本失败:', e.message);
  }

  if (onProgress) onProgress(100);
  console.log('[HdRepairGen] 高清修复完成');

  return {
    firstFrameUrl: persistedUrl,
    lastFrameUrl: persistedUrl,
    startFrame: persistedUrl,
    endFrame: persistedUrl,
    imageUrl: persistedUrl,
    promptUsed,
    model: imageResult.model || modelName
  };
}

module.exports = handleHdRepairGeneration;
