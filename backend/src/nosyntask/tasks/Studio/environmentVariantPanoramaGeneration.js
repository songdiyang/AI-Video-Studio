/**
 * 环境变体全景图生成任务
 * 与 environmentPanoramaGeneration 逻辑类似，但使用变体的时间/天气参数，
 * 结果保存到 environment_variants 表
 * 影棚全景图包含环境 + 关联建筑的全部信息
 *
 * input: {
 *   environmentId: number,
 *   variantId: number,
 *   environmentName: string,
 *   description: string,
 *   timeOfDay: string,    // 来自变体
 *   weather: string,      // 来自变体
 *   lighting: string,     // 来自变体
 *   mood: string,         // 来自变体
 *   imageModel: string,
 *   textModel: string
 * }
 *
 * output: {
 *   panoramaUrl: string,
 *   variantId: number,
 *   environmentId: number
 * }
 */

const handleImageGeneration = require('../base/imageGeneration');
const handleBaseTextModelCall = require('../base/baseTextModelCall');
const { execute, queryOne, queryAll } = require('../../../dbHelper');
const { requireVisualStyle } = require('../../../utils/getProjectStyle');
const { downloadAndStore } = require('../../../utils/fileStorage');

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
 * AI 生成环境变体 equirectangular 全景提示词（包含建筑）
 */
async function generateEnvVariantPanoramaPrompt(envName, description, timeOfDay, weather, lighting, mood, buildingSummary, style, textModelName) {
  const buildingSection = buildingSummary
    ? `\n关联建筑/结构：${buildingSummary}\n\n要求：必须在全景场景中合理呈现上述建筑/结构，建筑应与环境自然融合，成为场景的重要组成部分。`
    : '\n关联建筑/结构：无\n';

  const fullPrompt = `你是一个专精二次元漫剧 equirectangular（等距柱状投影）360°全景图 prompt 的 AI 绘图提示词专家。

任务：根据环境信息和时间状态，生成一段英文 equirectangular 漫剧全景提示词。

硬性要求：
1. 输出英文逗号分隔关键词，不要任何中文
2. 开头必须依次包含：anime background, 360° panoramic equirectangular projection, 2:1 aspect ratio, seamless full scene, no border, complete environment with structures, unified lighting, fixed perspective, consistent scenery with architecture, delicate details, anime drama style, high definition, ultra detailed, cinematic atmosphere
3. 强制排除人物：必须包含 empty scene without repeated characters, no people, no characters, no figures, uninhabited
4. 场景中必须包含建筑/结构物，建筑与环境融为一体，形成完整的影棚场景
5. 重点描述：自然景观 + 建筑/结构物的组合场景、地平线、光照氛围、天气效果、材质纹理、4方相接无缝的连续空间
6. 必须强调：consistent perspective, stable ground plane, coherent horizon line, natural landscape with architectural structures
7. 长度 120～200 英文单词
8. 除指定的排除人物词外，不要输出其他否定词
9. 直接输出 prompt，不要解释

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
    throw new Error('环境变体全景图提示词生成失败：AI 返回为空');
  }
  return content;
}

async function handleEnvironmentVariantPanoramaGeneration(inputParams, onProgress) {
  const {
    environmentId,
    variantId,
    environmentName,
    description,
    timeOfDay,
    weather,
    lighting,
    mood,
    imageModel: resolvedImageModel,
    textModel: resolvedTextModel
  } = inputParams;

  if (!variantId) throw new Error('缺少必要参数：variantId');
  if (!resolvedImageModel) throw new Error('imageModel 参数是必需的');

  // 获取项目视觉风格
  const env = await queryOne('SELECT project_id FROM environments WHERE id = ?', [environmentId]);
  const style = await requireVisualStyle(env?.project_id).catch(() => null);

  // 查询关联建筑
  const buildings = await getLinkedBuildings(environmentId);
  const buildingSummary = buildBuildingSummary(buildings);

  console.log('[EnvVariantPanoramaGen] 开始生成环境变体全景图:', {
    environmentId, variantId, timeOfDay, imageModel: resolvedImageModel,
    linkedBuildings: buildings.map(b => b.name)
  });

  if (onProgress) onProgress(5);

  // 标记变体生成中
  await execute(
    "UPDATE environment_variants SET generation_status = 'generating' WHERE id = ?",
    [variantId]
  );

  try {
    // 步骤 1：AI 生成全景提示词（包含建筑）
    const panoramaPrompt = await generateEnvVariantPanoramaPrompt(
      environmentName, description, timeOfDay, weather, lighting, mood,
      buildingSummary, style, resolvedTextModel
    );
    console.log(`[EnvVariantPanoramaGen] 变体全景提示词: ${panoramaPrompt.substring(0, 150)}...`);

    // 回写提示词
    await execute(
      'UPDATE environment_variants SET generation_prompt = ? WHERE id = ?',
      [panoramaPrompt, variantId]
    );

    if (onProgress) onProgress(20);

    // 步骤 2：调用图像模型
    const imageResult = await handleImageGeneration({
      prompt: panoramaPrompt,
      imageModel: resolvedImageModel,
      aspectRatio: '2:1',
      width: 2048,
      height: 1024
    }, (progress) => {
      if (onProgress) onProgress(20 + progress * 0.6);
    });

    const rawImageUrl = imageResult.image_url;
    console.log('[EnvVariantPanoramaGen] 变体全景图生成完成:', rawImageUrl);

    if (onProgress) onProgress(85);

    // 步骤 3：持久化
    const persistedUrl = await downloadAndStore(
      rawImageUrl,
      `images/environments/${environmentId}/variants/${variantId}/panorama`,
      { fallbackExt: '.png' }
    );

    if (onProgress) onProgress(92);

    // 步骤 4：保存到 environment_variants 表
    await execute(
      `UPDATE environment_variants
       SET panorama_image_url = ?,
           generation_status = 'completed',
           updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [persistedUrl, variantId]
    );
    console.log('[EnvVariantPanoramaGen] 变体全景图已保存到数据库');

    if (onProgress) onProgress(100);

    return {
      panoramaUrl: persistedUrl,
      variantId,
      environmentId
    };
  } catch (err) {
    await execute(
      "UPDATE environment_variants SET generation_status = 'failed' WHERE id = ?",
      [variantId]
    ).catch(() => {});
    throw err;
  }
}

module.exports = handleEnvironmentVariantPanoramaGeneration;
