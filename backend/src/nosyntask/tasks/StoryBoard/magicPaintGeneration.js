/**
 * 魔术空间涂改帧生成处理器
 *
 * 流程：
 * 1. 接收前端传来的合成图URL + 掩膜图URL + 原始帧图URL + 颜色指令
 * 2. 根据颜色指令构建中文提示词
 * 3. 尝试调用 Seedream inpainting API（带 mask_image 参数）
 * 4. 如不支持 mask，降级为图生图模式（用合成图做 img2img）
 * 5. 持久化到 MinIO 并更新数据库
 *
 * input:  { storyboardId, compositeImageUrl, maskImageUrl, sourceImageUrl,
 *           colorInstructions[], imageModel, textModel, aspectRatio }
 * output: { firstFrameUrl, lastFrameUrl, promptUsed, model }
 */

const { execute, queryOne } = require('../../../dbHelper');
const { downloadAndStore } = require('../../../utils/fileStorage');
const imageGeneration = require('../base/imageGeneration');
const { traced, trace } = require('../../engine/generationTrace');
const { saveFrameHistory, getNextVersionNumber, generateBatchId } = require('./saveFrameHistory');
const { assertUpdated, assertPersistedFields } = require('./persistenceGuard');

/**
 * 根据颜色指令构建中文提示词
 * @param {Array<{color: string, label: string, colorName: string}>} colorInstructions
 * @param {string} desc - 分镜原始描述
 * @returns {string} 提示词
 */
function buildPaintPrompt(colorInstructions, desc) {
  const instructionLines = colorInstructions
    .filter(ci => ci.label && ci.label.trim())
    .map(ci => `${ci.colorName}色涂抹区域：${ci.label.trim()}`)
    .join('\n');

  let prompt = `【魔术空间涂改指令】\n${instructionLines}\n`;
  prompt += `\n重要规则：\n`;
  prompt += `- 严格按照上述颜色指令修改对应区域\n`;
  prompt += `- 未涂抹区域严格保持原样，不做任何修改\n`;
  prompt += `- 保持原有画风、光照和色彩一致性\n`;
  prompt += `- 确保修改后场景自然合理\n`;

  if (desc) {
    prompt += `\n原始场景描述：${desc}\n`;
  }

  prompt += `no text, no subtitles, no captions, no watermark, no letters, no words`;
  return prompt;
}

async function handleMagicPaintGeneration(inputParams, onProgress) {
  const {
    storyboardId,
    compositeImageUrl,
    maskImageUrl,
    sourceImageUrl,
    colorInstructions = [],
    imageModel: modelName,
    textModel,
    aspectRatio
  } = inputParams;

  if (!storyboardId) {
    throw new Error('缺少必要参数: storyboardId');
  }

  if (!modelName) {
    throw new Error('imageModel 参数是必需的');
  }

  if (!colorInstructions || colorInstructions.length === 0) {
    throw new Error('缺少颜色指令: colorInstructions');
  }

  console.log('[MagicPaintGen] 开始魔术涂改帧生成，storyboardId:', storyboardId,
    `颜色指令数: ${colorInstructions.length}`);
  if (onProgress) onProgress(5);

  // 1. 查询分镜数据
  const storyboard = await queryOne(
    'SELECT * FROM storyboards WHERE id = ?',
    [storyboardId]
  );
  if (!storyboard) {
    throw new Error(`分镜 ${storyboardId} 不存在`);
  }

  trace('查询分镜数据', { storyboardId, idx: storyboard.idx });

  // 2. 构建涂改提示词
  if (onProgress) onProgress(15);

  const desc = storyboard.prompt_template || storyboard.description || '';
  const promptUsed = buildPaintPrompt(colorInstructions, desc);

  trace('涂改提示词生成', { promptUsed });
  console.log(`\x1b[32m[MagicPaintGen] 最终提示词: ${promptUsed}\x1b[0m`);

  // 3. 收集参考图
  if (onProgress) onProgress(30);

  const imageUrls = [];
  // 优先使用合成图（含涂抹标注）
  if (compositeImageUrl) {
    imageUrls.push(compositeImageUrl);
    console.log('[MagicPaintGen] 使用合成图作为参考');
  }
  // 补充原始帧图作为风格参考
  if (sourceImageUrl && sourceImageUrl !== compositeImageUrl) {
    imageUrls.push(sourceImageUrl);
    console.log('[MagicPaintGen] 补充原始帧图作为风格参考');
  }
  if (imageUrls.length === 0 && storyboard.first_frame_url) {
    imageUrls.push(storyboard.first_frame_url);
    console.log('[MagicPaintGen] 使用现有首帧图作为参考');
  }

  // 4. 调用图片模型生成
  // 优先尝试 inpainting 模式（带 mask），降级为图生图
  if (onProgress) onProgress(50);
  console.log('[MagicPaintGen] 调用图片模型生成...');

  // 图生图 strength：涂改需要较高变化，但也需保持一致性
  const strength = 0.65;

  const imageGenParams = {
    prompt: promptUsed,
    imageModel: modelName,
    aspectRatio,
    imageUrls: imageUrls.length > 0 ? imageUrls : undefined,
    strength,
    // 尝试传递 mask 参数（如果模型支持 inpainting）
    mask_image: maskImageUrl || undefined,
    negative_prompt: storyboard.negative_prompt || null,
    textModel
  };

  console.log('[MagicPaintGen] 图片生成参数:', {
    model: modelName,
    aspectRatio,
    strength,
    refImageCount: imageUrls.length,
    hasMask: !!maskImageUrl,
  });

  let imageResult;
  try {
    imageResult = await imageGeneration(imageGenParams);
  } catch (err) {
    // 如果 mask_image 参数不被支持，降级为不带 mask 的图生图
    if (err.message && (err.message.includes('mask') || err.message.includes('unknown'))) {
      console.warn('[MagicPaintGen] mask 参数不被支持，降级为图生图模式');
      delete imageGenParams.mask_image;
      imageResult = await imageGeneration(imageGenParams);
    } else {
      throw err;
    }
  }

  const frameUrl = imageResult.image_url;
  trace('图片生成完成', { url: frameUrl, model: modelName, strength });

  // 5. 持久化到 MinIO
  if (onProgress) onProgress(80);

  const versionNum = await getNextVersionNumber(storyboardId, 'first');
  const persistedUrl = await downloadAndStore(
    frameUrl,
    `images/frames/${storyboardId}/first_frame_v${versionNum}`,
    { fallbackExt: '.png' }
  );
  console.log('[MagicPaintGen] 帧已持久化:', persistedUrl);

  // 6. 更新数据库
  if (onProgress) onProgress(90);

  const updateResult = await execute(
    'UPDATE storyboards SET first_frame_url = ?, last_frame_url = ? WHERE id = ?',
    [persistedUrl, persistedUrl, storyboardId]
  );
  assertUpdated(updateResult, '[MagicPaintGen] 魔术涂改帧');
  await assertPersistedFields({
    table: 'storyboards',
    id: storyboardId,
    fields: ['first_frame_url', 'last_frame_url'],
    label: '[MagicPaintGen] 魔术涂改帧'
  });

  // 保存帧历史
  const batchId = generateBatchId();
  try {
    const genParams = {
      model: modelName,
      aspectRatio,
      strength,
      colorInstructions,
      type: 'magic_paint'
    };
    const ver = await saveFrameHistory(storyboardId, 'first', persistedUrl, promptUsed, genParams, batchId);
    await saveFrameHistory(storyboardId, 'last', persistedUrl, promptUsed, genParams, batchId);
    console.log(`[MagicPaintGen] 帧历史版本已保存 (v${ver}), batchId:`, batchId);
  } catch (e) {
    console.warn('[MagicPaintGen] 保存帧历史版本失败:', e.message);
  }

  if (onProgress) onProgress(100);
  console.log('[MagicPaintGen] 魔术涂改帧生成完成');

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

module.exports = handleMagicPaintGeneration;
