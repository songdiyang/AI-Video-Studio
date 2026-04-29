/**
 * 场景全景图生成任务
 * 根据场景信息生成 equirectangular 360°×180° 等距柱状全景图（2:1 长图）
 * 用于前端 Three.js 球体内壁贴图，提供可拖动查看的场景全景体验
 *
 * input: {
 *   sceneId: number,
 *   sceneName: string,
 *   description: string,
 *   environment: string,
 *   lighting: string,
 *   mood: string,
 *   style: string,
 *   imageModel: string,
 *   textModel: string
 * }
 *
 * output: {
 *   panoramaUrl: string,
 *   sceneId: number
 * }
 */

const handleImageGeneration = require('../base/imageGeneration');
const handleBaseTextModelCall = require('../base/baseTextModelCall');
const { execute, queryOne } = require('../../../dbHelper');
const { requireVisualStyle } = require('../../../utils/getProjectStyle');
const { downloadAndStore } = require('../../../utils/fileStorage');
const { trace } = require('../../engine/generationTrace');
const { assertUpdated, assertPersistedFields } = require('./persistenceGuard');

/**
 * 使用 AI 生成 equirectangular 全景提示词
 */
async function generatePanoramaPrompt(sceneName, description, environment, lighting, mood, style, textModelName, elementPositions) {
  const elementsBlock = (Array.isArray(elementPositions) && elementPositions.length > 0)
    ? `\n\n已提供的场景元素参考图（位序与参考图一一对应）：\n` +
      elementPositions.map((el, i) =>
        `  ${i + 1}. ${el.name}（${el.category === 'building' ? '建筑' : '场景'}）：${el.description || ''}，位置：${el.positionHint || '未指定'}`
      ).join('\n') +
      `\n合成规则：统一风格，将上述元素按位置暗示自然融合到 equirectangular 全景中，使用元素参考图保持外观一致（避免跨次不同的房屋/地形/材质漂移）`
    : '';

  const fullPrompt = `你是一个专精二次元漫剧 equirectangular（等距柱状投影）360°全景图 prompt 的 AI 绘图提示词专家。

任务：根据场景信息生成一段英文 equirectangular 漫剧全景提示词，用于 AI 图像模型生成可裁出分镜正反打 A/B 面的统一漫剧风格全景图。

硬性要求：
1. 输出英文逗号分隔关键词，不要任何中文
2. 开头必须依次包含（按顺序拼接）：anime background, 360° panoramic equirectangular projection, 2:1 aspect ratio, seamless full scene, no border, complete environment, unified lighting, fixed perspective, consistent architectural structure, delicate details, anime drama style, high definition, ultra detailed, cinematic atmosphere
3. 强制排除人物：必须包含 empty scene without repeated characters, no people, no characters, no figures, uninhabited
4. 重点描述：建筑结构、空间布局、道具摄设、统一光源、地面材质、氛围色调、4方相接无缝的连续空间（左右边缘必须能无缝拼接）
5. 必须强调下列漫剧分镜适用性：consistent perspective for 180 degree reverse shot cutting, stable ground plane, coherent horizon line, propless layout
6. 长度 120～200 英文单词
7. 除上述指定的排除词外，不要输出其他否定词（避免 without / not / no）
8. 直接输出 prompt，不要解释、不要 markdown 包裹

场景信息：
场景名称：${sceneName || '未命名场景'}
场景描述：${description || '无'}
环境描述：${environment || '无'}
光照描述：${lighting || '无'}
氛围描述：${mood || '无'}
风格要求：${style || '二次元漫剧风'}（需融入 anime drama style）${elementsBlock}

请直接输出英文 prompt：`;

  const response = await handleBaseTextModelCall({
    prompt: fullPrompt,
    textModel: textModelName,
    temperature: 0.6
  });

  const content = (response.content || '').trim();
  if (!content) {
    throw new Error('全景图提示词生成失败：AI 返回为空');
  }
  return content;
}

async function handleScenePanoramaGeneration(inputParams, onProgress) {
  const {
    sceneId,
    sceneName,
    description,
    environment,
    lighting,
    mood,
    style: inputStyle,
    imageModel: resolvedImageModel,
    textModel: resolvedTextModel,
    elementImageUrls,
    elementPositions
  } = inputParams;

  if (!sceneId) throw new Error('缺少必要参数：sceneId');
  if (!resolvedImageModel) throw new Error('imageModel 参数是必需的');
  if (!sceneName && !description && !environment) {
    throw new Error('场景信息不足：至少需要提供场景名称、描述或环境描述之一');
  }

  // 读取 project_id 用于获取项目视觉风格
  const scene = await queryOne('SELECT project_id FROM scenes WHERE id = ?', [sceneId]);
  const projectId = scene?.project_id || null;
  const style = inputStyle || await requireVisualStyle(projectId);

  console.log('[ScenePanoramaGen] 开始生成场景全景图:', {
    sceneId,
    sceneName,
    imageModel: resolvedImageModel,
    textModel: resolvedTextModel,
    elementRefCount: Array.isArray(elementImageUrls) ? elementImageUrls.length : 0
  });

  if (onProgress) onProgress(5);

  const refImageUrls = Array.isArray(elementImageUrls) ? elementImageUrls.filter(Boolean) : [];
  const refPositions = Array.isArray(elementPositions) ? elementPositions : [];

  // 步骤 1：AI 生成 equirectangular 全景提示词
  const panoramaPrompt = await generatePanoramaPrompt(
    sceneName, description, environment, lighting, mood,
    style, resolvedTextModel, refPositions
  );
  console.log(`\x1b[32m[ScenePanoramaGen] 全景提示词: ${panoramaPrompt}\x1b[0m`);
  trace('全景提示词生成完成', { prompt: panoramaPrompt, refCount: refImageUrls.length });

  if (onProgress) onProgress(20);

  // 步骤 2：调用图像模型，强制 2:1 长图（2048 x 1024），注入元素参考图
  const imageParams = {
    prompt: panoramaPrompt,
    imageModel: resolvedImageModel,
    aspectRatio: '2:1',
    width: 2048,
    height: 1024
  };
  if (refImageUrls.length > 0) {
    imageParams.imageUrls = refImageUrls;
  }

  const imageResult = await handleImageGeneration(imageParams, (progress) => {
    if (onProgress) onProgress(20 + progress * 0.6); // 20% -> 80%
  });

  const rawImageUrl = imageResult.image_url;
  console.log('[ScenePanoramaGen] ✅ 全景图生成完成:', rawImageUrl);
  trace('全景图生成完成', { url: rawImageUrl });

  if (onProgress) onProgress(85);

  // 步骤 3：持久化到 MinIO
  const persistedUrl = await downloadAndStore(
    rawImageUrl,
    `images/scenes/${sceneId}/panorama`,
    { fallbackExt: '.png' }
  );

  if (onProgress) onProgress(92);

  // 步骤 4：保存 URL 到数据库
  const updateResult = await execute(
    `UPDATE scenes 
     SET panorama_image_url = ?, 
         updated_at = CURRENT_TIMESTAMP 
     WHERE id = ?`,
    [persistedUrl, sceneId]
  );
  assertUpdated(updateResult, '[ScenePanoramaGen] 场景全景图');
  await assertPersistedFields({
    table: 'scenes',
    id: sceneId,
    fields: ['panorama_image_url'],
    label: '[ScenePanoramaGen] 场景全景图'
  });
  console.log('[ScenePanoramaGen] ✅ 全景图已保存到数据库');
  trace('全景图持久化完成', { url: persistedUrl });

  if (onProgress) onProgress(100);

  return {
    panoramaUrl: persistedUrl,
    sceneId,
    prompt: panoramaPrompt,
    imageModel: resolvedImageModel
  };
}

module.exports = handleScenePanoramaGeneration;
