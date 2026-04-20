/**
 * 视角调整帧生成处理器（旋转/缩放/扩图）
 *
 * 流程：
 * 1. 接收前端传来的画布合成图URL + 原始帧图URL + 旋转/缩放参数
 * 2. 判断主模式（扩图/聚焦/旋转）并计算图生图 strength
 * 3. 以合成图为参考图 + 提示词调用图片模型生成新帧
 * 4. 持久化到 MinIO 并更新数据库
 *
 * input:  { storyboardId, compositeImageUrl, sourceImageUrl, imageModel, textModel, aspectRatio,
 *           rotationX, rotationY, rotationZ, zoomLevel, mode }
 * output: { firstFrameUrl, lastFrameUrl, promptUsed, model }
 */

const { execute, queryOne } = require('../../../dbHelper');
const { downloadAndStore } = require('../../../utils/fileStorage');
const imageGeneration = require('../base/imageGeneration');
const { traced, trace } = require('../../engine/generationTrace');
const { saveFrameHistory, getNextVersionNumber, generateBatchId } = require('./saveFrameHistory');
const { assertUpdated, assertPersistedFields } = require('./persistenceGuard');

/**
 * 判断主操作模式：扩图 / 聚焦 / 旋转
 * 优先级：有显著旋转 → 旋转，缩放<1 → 扩图，缩放>1 → 聚焦
 */
function detectMode(rotationX, rotationY, rotationZ, zoomLevel, mode) {
  const hasRotation = Math.abs(rotationX) > 10 || Math.abs(rotationY) > 15 || Math.abs(rotationZ) > 10;
  if (hasRotation) return 'rotate';
  if (mode === 'focus' || zoomLevel > 1.1) return 'focus';
  return 'expand';
}

/**
 * 计算图生图 strength：旋转越大越需要"创造力"，strength 越高
 * - expand: strength 0.55（保守，保持中心不变）
 * - focus:  strength 0.50（最保守，仅裁剪放大）
 * - rotate: strength 0.60~0.75（角度越大，需要更多变化）
 */
function calculateStrength(primaryMode, rotationX, rotationY, rotationZ) {
  if (primaryMode === 'expand') return 0.55;
  if (primaryMode === 'focus') return 0.50;

  // 旋转模式：角度越大，需要更多变化
  const maxAngle = Math.max(Math.abs(rotationX), Math.abs(rotationY), Math.abs(rotationZ));
  if (maxAngle > 60) return 0.75;
  if (maxAngle > 30) return 0.68;
  return 0.60;
}

async function handleCameraFrameGeneration(inputParams, onProgress) {
  const {
    storyboardId,
    compositeImageUrl,
    sourceImageUrl,
    imageModel: modelName,
    textModel,
    aspectRatio,
    rotationX = 0,
    rotationY = 0,
    rotationZ = 0,
    zoomLevel = 1,
    mode = 'expand'
  } = inputParams;

  if (!storyboardId) {
    throw new Error('缺少必要参数: storyboardId');
  }

  if (!modelName) {
    throw new Error('imageModel 参数是必需的');
  }

  console.log('[CameraFrameGen] 开始视角调整帧生成，storyboardId:', storyboardId,
    `rotation=(${rotationX},${rotationY},${rotationZ}) zoom=${zoomLevel} mode=${mode}`);
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

  // 2. 判断主操作模式 + 计算 strength
  const primaryMode = detectMode(rotationX, rotationY, rotationZ, zoomLevel, mode);
  const strength = calculateStrength(primaryMode, rotationX, rotationY, rotationZ);

  console.log(`[CameraFrameGen] 主模式=${primaryMode}, strength=${strength}`);

  // 3. 构建视角提示词
  if (onProgress) onProgress(15);

  const desc = storyboard.prompt_template || storyboard.description || '';
  let promptUsed;

  if (primaryMode === 'expand') {
    // ---- 扩图模式 ----
    promptUsed = `Outpainting: Expand the view while keeping the center content EXACTLY the same. ` +
      `Fill the new edges with content that naturally extends the existing scene. ` +
      `Maintain identical art style, lighting, and color palette. ` +
      `${desc ? `Scene: ${desc}.` : ''} ` +
      `no text, no subtitles, no captions, no watermark, no letters, no words`;

  } else if (primaryMode === 'focus') {
    // ---- 聚焦模式 ----
    promptUsed = `Zoom in to the center area of the image. Enlarge and add detail to the central subject. ` +
      `Maintain identical art style, lighting, and color palette. ` +
      `${desc ? `Scene: ${desc}.` : ''} ` +
      `no text, no subtitles, no captions, no watermark, no letters, no words`;

  } else {
    // ---- 旋转模式：以图片中心为轴点，旋转指定角度 ----
    promptUsed = `Based on the reference image, rotate the camera around the center point of the image: ` +
      `X-axis tilt ${rotationX}° (positive=looking down, negative=looking up), ` +
      `Y-axis pan ${rotationY}° (positive=turning right, negative=turning left), ` +
      `Z-axis roll ${rotationZ}° (positive=clockwise tilt, negative=counterclockwise tilt). ` +
      `Keep all characters, objects, and art style IDENTICAL to the reference image. ` +
      `Only the camera viewpoint changes. ` +
      `${desc ? `Scene: ${desc}.` : ''} ` +
      `no text, no subtitles, no captions, no watermark, no letters, no words`;
  }

  trace('视角提示词生成', { primaryMode, strength, promptUsed });
  console.log(`\x1b[32m[CameraFrameGen] 最终提示词: ${promptUsed}\x1b[0m`);

  // 4. 收集参考图
  if (onProgress) onProgress(40);

  const imageUrls = [];
  // 优先使用前端画布合成图（包含缩放/偏移信息）
  if (compositeImageUrl) {
    imageUrls.push(compositeImageUrl);
    console.log('[CameraFrameGen] 使用画布合成图作为参考');
  }
  // 补充原始帧图作为风格参考（旋转时原始帧比合成图更重要）
  if (primaryMode === 'rotate' && sourceImageUrl && sourceImageUrl !== compositeImageUrl) {
    imageUrls.push(sourceImageUrl);
    console.log('[CameraFrameGen] 旋转模式：补充原始帧图作为风格+内容参考');
  } else if (sourceImageUrl && sourceImageUrl !== compositeImageUrl) {
    imageUrls.push(sourceImageUrl);
    console.log('[CameraFrameGen] 补充原始帧图作为风格参考');
  }
  // 如果没有合成图，使用现有首帧
  if (imageUrls.length === 0 && storyboard.first_frame_url) {
    imageUrls.push(storyboard.first_frame_url);
    console.log('[CameraFrameGen] 使用现有首帧图作为参考');
  }

  // 5. 调用图片模型生成
  if (onProgress) onProgress(50);
  console.log('[CameraFrameGen] 调用图片模型生成...');

  const imageGenParams = {
    prompt: promptUsed,
    imageModel: modelName,
    aspectRatio,
    imageUrls: imageUrls.length > 0 ? imageUrls : undefined,
    strength
  };

  console.log('[CameraFrameGen] 图片生成参数:', { model: modelName, aspectRatio, strength, refImageCount: imageUrls.length });

  const imageResult = await imageGeneration(imageGenParams);

  const frameUrl = imageResult.image_url;
  trace('图片生成完成', { url: frameUrl, model: modelName, strength });

  // 6. 持久化到 MinIO
  if (onProgress) onProgress(80);

  const versionNum = await getNextVersionNumber(storyboardId, 'first');
  const persistedUrl = await downloadAndStore(
    frameUrl,
    `images/frames/${storyboardId}/first_frame_v${versionNum}`,
    { fallbackExt: '.png' }
  );
  console.log('[CameraFrameGen] 帧已持久化:', persistedUrl);

  // 7. 更新数据库
  if (onProgress) onProgress(90);

  const updateResult = await execute(
    'UPDATE storyboards SET first_frame_url = ?, last_frame_url = ? WHERE id = ?',
    [persistedUrl, persistedUrl, storyboardId]
  );
  assertUpdated(updateResult, '[CameraFrameGen] 视角调整帧');
  await assertPersistedFields({
    table: 'storyboards',
    id: storyboardId,
    fields: ['first_frame_url', 'last_frame_url'],
    label: '[CameraFrameGen] 视角调整帧'
  });

  // 保存帧历史
  const batchId = generateBatchId();
  try {
    const genParams = { model: modelName, aspectRatio, rotationX, rotationY, rotationZ, zoomLevel, mode: primaryMode, strength };
    const ver = await saveFrameHistory(storyboardId, 'first', persistedUrl, promptUsed, genParams, batchId);
    await saveFrameHistory(storyboardId, 'last', persistedUrl, promptUsed, genParams, batchId);
    console.log(`[CameraFrameGen] 帧历史版本已保存 (v${ver}), batchId:`, batchId);
  } catch (e) {
    console.warn('[CameraFrameGen] 保存帧历史版本失败:', e.message);
  }

  if (onProgress) onProgress(100);
  console.log('[CameraFrameGen] 视角调整帧生成完成');

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

module.exports = handleCameraFrameGeneration;
