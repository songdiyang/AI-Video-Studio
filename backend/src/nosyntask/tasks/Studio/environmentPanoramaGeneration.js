/**
 * 环境全景图 + 环境参考图 生成任务（双图生成）
 * 
 * 影棚全景图（panorama_image_url）：equirectangular 360°×180° 等距柱状全景图
 *   包含环境 + 关联建筑的全部信息，用于前端 Three.js 球体内壁贴图
 * 
 * 环境参考图（image_url）：常规比例场景图
 *   包含环境 + 关联建筑的全部信息，用于快速预览
 *
 * input: {
 *   environmentId: number,
 *   environmentName: string,
 *   description: string,
 *   timeOfDay: string,
 *   weather: string,
 *   lighting: string,
 *   mood: string,
 *   imageModel: string,
 *   textModel: string
 * }
 *
 * output: {
 *   panoramaUrl: string,
 *   imageUrl: string,
 *   environmentId: number
 * }
 */

const handleImageGeneration = require('../base/imageGeneration');
const handleBaseTextModelCall = require('../base/baseTextModelCall');
const { execute, queryOne, queryAll } = require('../../../dbHelper');
const { requireVisualStyle } = require('../../../utils/getProjectStyle');
const { downloadAndStore } = require('../../../utils/fileStorage');
const { trace } = require('../../engine/generationTrace');

/**
 * 查询环境关联的建筑（通过影棚 studio_environment_links + studio_building_links）
 */
async function getLinkedBuildings(environmentId) {
  const buildings = await queryAll(
    `SELECT DISTINCT b.id, b.name, b.description
     FROM studio_environment_links sel
     JOIN studio_building_links sbl ON sel.studio_id = sbl.studio_id
     JOIN buildings b ON b.id = sbl.building_id
     WHERE sel.environment_id = ?`,
    [environmentId]
  );
  return buildings || [];
}

/**
 * 拼接建筑描述文本，用于提示词
 */
function buildBuildingSummary(buildings) {
  if (!buildings || buildings.length === 0) return '';
  return buildings.map(b => `${b.name}${b.description ? '（' + b.description + '）' : ''}`).join('、');
}

/**
 * AI 生成影棚 equirectangular 全景提示词（包含建筑）
 */
async function generateStudioPanoramaPrompt(envName, description, timeOfDay, weather, lighting, mood, buildingSummary, style, textModelName) {
  const buildingSection = buildingSummary
    ? `\n关联建筑/结构：${buildingSummary}\n\n要求：必须在全景场景中合理呈现上述建筑/结构，建筑应与环境自然融合，成为场景的重要组成部分。建筑的位置、比例和风格应与描述一致。`
    : '\n关联建筑/结构：无\n';

  const fullPrompt = `你是一个专精二次元漫剧 equirectangular（等距柱状投影）360°全景图 prompt 的 AI 绘图提示词专家。

任务：根据环境和建筑信息生成一段英文 equirectangular 漫剧全景提示词，用于 AI 图像模型生成可漫游的漫剧风格影棚全景图。

硬性要求：
1. 输出英文逗号分隔关键词，不要任何中文
2. 开头必须依次包含（按顺序拼接）：anime background, 360° panoramic equirectangular projection, 2:1 aspect ratio, seamless full scene, no border, complete environment with structures, unified lighting, fixed perspective, consistent scenery with architecture, delicate details, anime drama style, high definition, ultra detailed, cinematic atmosphere
3. 强制排除人物：必须包含 empty scene without repeated characters, no people, no characters, no figures, uninhabited
4. 场景中必须包含建筑/结构物，建筑与环境融为一体，形成完整的影棚场景
5. 重点描述：自然景观 + 建筑/结构物的组合场景、地平线、光照氛围、天气效果、材质纹理、4方相接无缝的连续空间（左右边缘必须能无缝拼接）
6. 必须强调：consistent perspective, stable ground plane, coherent horizon line, natural landscape with architectural structures
7. 长度 120～200 英文单词
8. 除指定的排除人物词外，不要输出其他否定词（避免 without / not / no，但 no people 等人物排除词除外）
9. 直接输出 prompt，不要解释、不要 markdown 包裹

环境信息：
环境名称：${envName || '未命名环境'}
环境描述：${description || '无'}
时间段：${timeOfDay || '白天'}
天气：${weather || '晴天'}
光照：${lighting || '自然光'}
氛围：${mood || '无'}
风格要求：${style || '二次元漫剧风'}（需融入 anime drama style）
${buildingSection}
请直接输出英文 prompt：`;

  const response = await handleBaseTextModelCall({
    prompt: fullPrompt,
    textModel: textModelName,
    temperature: 0.6
  });

  const content = (response.content || '').trim();
  if (!content) {
    throw new Error('影棚全景图提示词生成失败：AI 返回为空');
  }
  return content;
}

/**
 * AI 生成环境参考图提示词（包含建筑，常规比例）
 */
async function generateEnvironmentImagePrompt(envName, description, timeOfDay, weather, lighting, mood, buildingSummary, style, textModelName) {
  const buildingSection = buildingSummary
    ? `\n关联建筑/结构：${buildingSummary}\n\n要求：必须在场景中合理呈现上述建筑/结构，建筑应与环境自然融合。`
    : '';

  const fullPrompt = `你是一个专业的图片生成提示词专家。请根据以下环境和建筑信息生成高质量的场景参考图提示词（用于 AI 绘图工具）。

要求：
1. 提示词必须用英文输出
2. 使用逗号分隔的关键词格式
3. 包含：场景环境、建筑结构、光照效果、氛围、构图、画质描述
4. 长度控制在 80-120 个单词
5. 重点描述环境细节、建筑结构、光影效果、氛围营造
6. 严格禁止出现任何人物、角色、人影、剪影
7. 在提示词开头加上 "empty scene, no people, no characters, uninhabited,"
8. 场景中必须包含建筑/结构物，建筑与环境融为一体

环境名称：${envName || '未命名'}
环境描述：${description || '无'}
时间段：${timeOfDay || '白天'}
天气：${weather || '晴天'}
光照：${lighting || '自然光'}
氛围：${mood || '无'}
视觉风格：${style || '二次元漫剧风'}
${buildingSection}
请直接输出英文提示词，不要包含任何解释或其他内容。`;

  const response = await handleBaseTextModelCall({
    prompt: fullPrompt,
    textModel: textModelName,
    temperature: 0.7
  });

  let text = '';
  if (typeof response === 'string') text = response;
  else if (response?.content) text = response.content;
  else if (response?.text) text = response.text;
  else if (response?.message) text = response.message;

  if (!text) throw new Error('AI 响应为空，环境参考图提示词生成失败');

  text = text.trim();
  if ((text.startsWith('"') && text.endsWith('"')) || (text.startsWith("'") && text.endsWith("'"))) {
    text = text.slice(1, -1);
  }
  text = text.replace(/\n/g, ' ').replace(/\s+/g, ' ').trim();

  return text;
}

async function handleEnvironmentPanoramaGeneration(inputParams, onProgress) {
  const {
    environmentId,
    environmentName,
    description,
    timeOfDay,
    weather,
    lighting,
    mood,
    imageModel: resolvedImageModel,
    textModel: resolvedTextModel
  } = inputParams;

  if (!environmentId) throw new Error('缺少必要参数：environmentId');
  if (!resolvedImageModel) throw new Error('imageModel 参数是必需的');

  // 读取 project_id 用于获取项目视觉风格
  const env = await queryOne('SELECT project_id FROM environments WHERE id = ?', [environmentId]);
  const projectId = env?.project_id || null;
  const style = await requireVisualStyle(projectId).catch(() => null);

  // 查询关联建筑
  const buildings = await getLinkedBuildings(environmentId);
  const buildingSummary = buildBuildingSummary(buildings);

  console.log('[EnvironmentPanoramaGen] 开始生成影棚全景图+环境参考图:', {
    environmentId,
    environmentName,
    linkedBuildings: buildings.map(b => b.name),
    imageModel: resolvedImageModel,
    textModel: resolvedTextModel
  });

  if (onProgress) onProgress(2);

  // ============================================
  // 步骤 1：生成影棚全景图（equirectangular 2:1）
  // ============================================

  const panoramaPrompt = await generateStudioPanoramaPrompt(
    environmentName, description, timeOfDay, weather, lighting, mood,
    buildingSummary, style, resolvedTextModel
  );
  console.log(`\x1b[32m[EnvironmentPanoramaGen] 影棚全景提示词: ${panoramaPrompt}\x1b[0m`);
  trace('影棚全景提示词生成完成', { prompt: panoramaPrompt });

  if (onProgress) onProgress(10);

  const panoramaResult = await handleImageGeneration({
    prompt: panoramaPrompt,
    imageModel: resolvedImageModel,
    aspectRatio: '2:1',
    width: 2048,
    height: 1024
  }, (progress) => {
    if (onProgress) onProgress(10 + progress * 0.35); // 10% -> 45%
  });

  const rawPanoramaUrl = panoramaResult.image_url;
  console.log('[EnvironmentPanoramaGen] 影棚全景图生成完成:', rawPanoramaUrl);
  trace('影棚全景图生成完成', { url: rawPanoramaUrl });

  if (onProgress) onProgress(48);

  // 持久化影棚全景图到 MinIO
  const persistedPanoramaUrl = await downloadAndStore(
    rawPanoramaUrl,
    `images/environments/${environmentId}/panorama`,
    { fallbackExt: '.png' }
  );

  if (onProgress) onProgress(50);

  // ============================================
  // 步骤 2：生成环境参考图（常规比例 1:1）
  // ============================================

  const imagePrompt = await generateEnvironmentImagePrompt(
    environmentName, description, timeOfDay, weather, lighting, mood,
    buildingSummary, style, resolvedTextModel
  );
  console.log(`\x1b[36m[EnvironmentPanoramaGen] 环境参考图提示词: ${imagePrompt}\x1b[0m`);
  trace('环境参考图提示词生成完成', { prompt: imagePrompt });

  if (onProgress) onProgress(55);

  const imageResult = await handleImageGeneration({
    prompt: imagePrompt,
    imageModel: resolvedImageModel,
    aspectRatio: '1:1',
    width: 1024,
    height: 1024
  }, (progress) => {
    if (onProgress) onProgress(55 + progress * 0.35); // 55% -> 90%
  });

  const rawImageUrl = imageResult.image_url;
  console.log('[EnvironmentPanoramaGen] 环境参考图生成完成:', rawImageUrl);
  trace('环境参考图生成完成', { url: rawImageUrl });

  if (onProgress) onProgress(92);

  // 持久化环境参考图到 MinIO
  const persistedImageUrl = await downloadAndStore(
    rawImageUrl,
    `images/environments/${environmentId}/reference`,
    { fallbackExt: '.png' }
  );

  if (onProgress) onProgress(95);

  // ============================================
  // 步骤 3：保存两张图 URL 到数据库
  // ============================================

  await execute(
    `UPDATE environments
     SET panorama_image_url = ?,
         image_url = ?,
         generation_status = 'completed',
         updated_at = CURRENT_TIMESTAMP
     WHERE id = ?`,
    [persistedPanoramaUrl, persistedImageUrl, environmentId]
  );
  console.log('[EnvironmentPanoramaGen] 影棚全景图+环境参考图已保存到数据库');
  trace('环境图片持久化完成', { panoramaUrl: persistedPanoramaUrl, imageUrl: persistedImageUrl });

  if (onProgress) onProgress(100);

  return {
    panoramaUrl: persistedPanoramaUrl,
    imageUrl: persistedImageUrl,
    environmentId,
    panoramaPrompt,
    imagePrompt,
    imageModel: resolvedImageModel
  };
}

module.exports = handleEnvironmentPanoramaGeneration;
