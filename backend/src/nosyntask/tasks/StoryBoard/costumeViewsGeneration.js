/**
 * 服装设定图生成任务
 * 基于无角色的通用白色 mannequin（人台）+ 服装描述，生成一张 16:9 服装设定图
 * 跨角色复用：一套服装设定图可被多个角色引用
 *
 * input: {
 *   costumeId: number,
 *   projectId: number,
 *   imageModel: string,
 *   textModel?: string,
 *   aspectRatio?: string
 * }
 *
 * output: {
 *   costumeId,
 *   imageUrl
 * }
 */

const handleImageGeneration = require('../base/imageGeneration');
const { execute, queryOne } = require('../../../dbHelper');
const { downloadAndStore } = require('../../../utils/fileStorage');
const { requireVisualStyle } = require('../../../utils/getProjectStyle');

// 通用服装人台（白色简单人形 mannequin），刻意避开任何角色身份
// 要求：无表情、无个性、无面部特征，像商城人体模特一样纯粹展示服装
const MANNEQUIN_BODY = {
  male: 'male mannequin body, completely blank expressionless face, no eyes no mouth no nose no eyebrows, smooth featureless face like a store display mannequin, average male proportions, plain white skin tone, simple generic human form, no distinct personality or character identity, T-pose neutral standing, clean empty background',
  female: 'female mannequin body, completely blank expressionless face, no eyes no mouth no nose no eyebrows, smooth featureless face like a store display mannequin, average female proportions, plain white skin tone, simple generic human form, no distinct personality or character identity, T-pose neutral standing, clean empty background',
  unisex: 'androgynous mannequin body, completely blank expressionless face, no eyes no mouth no nose no eyebrows, smooth featureless face like a store display mannequin, average proportions, plain white skin tone, simple generic human form, no distinct personality or character identity, T-pose neutral standing, clean empty background'
};

function buildCostumePrompt(style, outfitDesc, gender) {
  const mannequin = MANNEQUIN_BODY[gender] || MANNEQUIN_BODY.unisex;
  const styleKeywords = style || 'anime style';
  return `costume design reference sheet, three-view turnaround of a standalone costume/outfit displayed on three identical generic mannequins arranged horizontally in a single wide 16:9 image, ${mannequin}, left mannequin shows front view, center mannequin shows side profile view, right mannequin shows back view, all three mannequins are wearing the exact same outfit: ${outfitDesc}, the outfit must be fully visible and clear on every view, preserve all costume details fabric texture color pattern trim buttons seams accessories attached to the outfit, arms slightly away from body to fully reveal the outfit, ${styleKeywords}, clean solid light gray background, even soft studio lighting, no dramatic shadow, no extra props, no weapons, no held items, neutral pose, completely blank face with no expression no eyes no mouth no facial features, smooth mannequin face, professional costume turnaround reference sheet, highly detailed, consistent design across all three angles, crisp line art feel`;
}

async function handleCostumeViewsGeneration(inputParams, onProgress) {
  const { costumeId, projectId, imageModel, aspectRatio } = inputParams;

  if (!costumeId) throw new Error('costumeId 参数必需');
  if (!imageModel) throw new Error('imageModel 参数必需');

  // 加载服装信息
  const costume = await queryOne('SELECT * FROM costumes WHERE id = ?', [costumeId]);
  if (!costume) throw new Error('服装不存在');

  const outfitDesc = costume.outfit_prompt || costume.description || costume.name;
  if (!outfitDesc) throw new Error('服装缺少描述或提示词，无法生成设定图');

  const gender = costume.gender || 'unisex';
  const style = await requireVisualStyle(projectId || costume.project_id);

  console.log('[CostumeViews] 开始生成服装设定图', {
    costumeId, name: costume.name, gender, imageModel
  });

  if (onProgress) onProgress(5);

  // 标记生成中
  await execute(
    `UPDATE costumes SET generation_status = 'generating', updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
    [costumeId]
  );

  const ts = Date.now();
  const storageBase = `images/costumes/${costumeId}`;

  try {
    // 生成单张 16:9 服装设定图
    const prompt = buildCostumePrompt(style, outfitDesc, gender);
    const genParams = {
      prompt,
      imageModel,
      aspectRatio: aspectRatio || '16:9'
    };
    const r = await handleImageGeneration(genParams);

    if (onProgress) onProgress(70);

    // 持久化到存储
    const persistedUrl = await downloadAndStore(
      r.image_url,
      `${storageBase}/design_${ts}`,
      { fallbackExt: '.png' }
    );

    if (onProgress) onProgress(90);

    // 入库
    await execute(
      `UPDATE costumes SET
        image_url = ?,
        generation_status = 'completed',
        generation_prompt = ?,
        updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [persistedUrl, prompt, costumeId]
    );

    if (onProgress) onProgress(100);
    console.log('[CostumeViews] ✅ 服装设定图生成完成', { costumeId });

    return {
      costumeId,
      imageUrl: persistedUrl
    };
  } catch (err) {
    console.error('[CostumeViews] 生成失败:', err.message);
    await execute(
      `UPDATE costumes SET generation_status = 'failed', updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
      [costumeId]
    );
    throw err;
  }
}

module.exports = handleCostumeViewsGeneration;
