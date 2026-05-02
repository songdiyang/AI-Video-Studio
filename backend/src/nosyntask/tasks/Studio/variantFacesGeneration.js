/**
 * 环境变体8方位场景图生成任务
 * 生成水平6张 + 天顶1张 + 地面1张 = 8张场景图
 * 方位定义：
 *   front(0°), right(60°), back(120°), left(180°),
 *   right_front(240°), left_front(300°), top(天顶), bottom(地面)
 *
 * input: {
 *   environmentId, variantId, environmentName, description,
 *   timeOfDay, weather, lighting, mood,
 *   imageModel, textModel
 * }
 *
 * output: {
 *   faces: { front, right, back, left, right_front, left_front, top, bottom },
 *   variantId, environmentId
 * }
 */

const handleImageGeneration = require('../base/imageGeneration');
const handleBaseTextModelCall = require('../base/baseTextModelCall');
const { execute, queryOne } = require('../../../dbHelper');
const { requireVisualStyle } = require('../../../utils/getProjectStyle');
const { downloadAndStore } = require('../../../utils/fileStorage');

// 8方位定义：key, 角度, 中文描述, 英文方位描述
const FACE_DEFS = [
  { key: 'front',        angle: 0,   label: '前方(0°)',     desc: 'front view, facing north, 0° azimuth' },
  { key: 'right',        angle: 60,  label: '右方(60°)',    desc: 'right side view, 60° azimuth, slightly rotated clockwise from front' },
  { key: 'back',         angle: 120, label: '后方(120°)',   desc: 'back view, 120° azimuth, rotated clockwise from front' },
  { key: 'left',         angle: 180, label: '左方(180°)',   desc: 'left side view, 180° azimuth, opposite direction from front' },
  { key: 'right_front',  angle: 240, label: '右前方(240°)', desc: 'right-front diagonal view, 240° azimuth, between front and right' },
  { key: 'left_front',   angle: 300, label: '左前方(300°)', desc: 'left-front diagonal view, 300° azimuth, between front and left' },
  { key: 'top',          angle: -1,  label: '天顶(上)',     desc: 'top-down zenith view, looking straight up at the sky/canopy' },
  { key: 'bottom',       angle: -2,  label: '地面(下)',     desc: 'bottom nadir view, looking straight down at the ground/floor' },
];

/**
 * 生成某方位的英文提示词
 */
async function generateFacePrompt(envName, description, timeOfDay, weather, lighting, mood, style, faceDef, textModel) {
  const isTopBottom = faceDef.key === 'top' || faceDef.key === 'bottom';

  const prompt = `你是一个专业的二次元漫剧场景图提示词专家。

任务：为环境的一个特定视角方向生成英文 AI 绘图提示词，用于生成该方向的场景图。

硬性要求：
1. 输出英文逗号分隔关键词，不要任何中文
2. 开头包含：anime background, cinematic scene view, ${isTopBottom ? (faceDef.key === 'top' ? 'zenith top-down view, looking straight up' : 'nadir bottom-down view, looking straight down') : `${faceDef.desc}`}, high detail, anime drama style
3. 强制排除人物：no people, no characters, no figures, uninhabited
4. 强制排除建筑：no buildings, no architecture, no artificial structures
5. 相邻方位必须有 ≥30% 视觉重叠，描述时需涵盖视角边缘的延续场景
6. 所有方位的光照、色温、曝光、风格必须完全一致（同环境同一时刻）
7. 重点描述：自然景观、光照、天气效果、材质纹理
8. 长度 80～120 英文单词
9. 直接输出 prompt，不要解释

环境信息：
环境名称：${envName || '未命名环境'}
环境描述：${description || '无'}
时间段：${timeOfDay || '白天'}
天气：${weather || '晴天'}
光照：${lighting || '自然光'}
氛围：${mood || '无'}
当前视角：${faceDef.label} — ${faceDef.desc}
风格要求：${style || '二次元漫剧风'}（需融入 anime drama style）

请直接输出英文 prompt：`;

  const response = await handleBaseTextModelCall({ prompt, textModel, temperature: 0.6 });
  const content = (response.content || '').trim();
  if (!content) throw new Error(`方位 ${faceDef.label} 提示词生成失败：AI 返回为空`);
  return content;
}

async function handleVariantFacesGeneration(inputParams, onProgress) {
  const {
    environmentId,
    variantId,
    environmentName,
    description,
    timeOfDay,
    weather,
    lighting,
    mood,
    imageModel,
    textModel
  } = inputParams;

  if (!variantId) throw new Error('缺少必要参数：variantId');
  if (!imageModel) throw new Error('imageModel 参数是必需的');

  const env = await queryOne('SELECT project_id FROM environments WHERE id = ?', [environmentId]);
  const style = await requireVisualStyle(env?.project_id).catch(() => null);

  console.log('[VariantFacesGen] 开始生成8方位场景图:', { environmentId, variantId, imageModel });

  // 标记生成中
  await execute(
    "UPDATE environment_variants SET generation_status = 'generating' WHERE id = ?",
    [variantId]
  );

  const faces = {};
  const totalFaces = FACE_DEFS.length;

  try {
    for (let i = 0; i < totalFaces; i++) {
      const faceDef = FACE_DEFS[i];
      const faceProgress = Math.floor((i / totalFaces) * 100);

      if (onProgress) onProgress(faceProgress);

      console.log(`[VariantFacesGen] 生成方位 ${i + 1}/${totalFaces}: ${faceDef.label}`);

      // 步骤1：生成该方位的提示词
      const facePrompt = await generateFacePrompt(
        environmentName, description, timeOfDay, weather, lighting, mood,
        style, faceDef, textModel
      );

      // 步骤2：调用图像模型 — 4096x4096
      const imageResult = await handleImageGeneration({
        prompt: facePrompt,
        imageModel,
        aspectRatio: '1:1',
        width: 4096,
        height: 4096
      });

      // 步骤3：持久化
      const rawUrl = imageResult.image_url;
      const storagePath = `images/environments/${environmentId}/variants/${variantId}/faces/${faceDef.key}`;
      const persistedUrl = await downloadAndStore(rawUrl, storagePath, { fallbackExt: '.png' });

      faces[faceDef.key] = persistedUrl;
      console.log(`[VariantFacesGen] 方位 ${faceDef.label} 完成: ${persistedUrl.substring(0, 80)}...`);

      // 逐步回写 faces 到数据库（每生成一张就保存，防止中途失败丢失）
      await execute(
        'UPDATE environment_variants SET faces = ? WHERE id = ?',
        [JSON.stringify(faces), variantId]
      );
    }

    if (onProgress) onProgress(95);

    // 全部完成，更新状态
    await execute(
      "UPDATE environment_variants SET generation_status = 'completed', faces = ? WHERE id = ?",
      [JSON.stringify(faces), variantId]
    );

    if (onProgress) onProgress(100);
    console.log('[VariantFacesGen] 8方位场景图全部生成完成:', { variantId, faces: Object.keys(faces) });

    return { faces, variantId, environmentId };
  } catch (err) {
    // 如果有部分成功，保留已生成的 faces
    if (Object.keys(faces).length > 0) {
      await execute(
        "UPDATE environment_variants SET generation_status = 'failed', faces = ? WHERE id = ?",
        [JSON.stringify(faces), variantId]
      ).catch(() => {});
    } else {
      await execute(
        "UPDATE environment_variants SET generation_status = 'failed' WHERE id = ?",
        [variantId]
      ).catch(() => {});
    }
    throw err;
  }
}

module.exports = handleVariantFacesGeneration;
