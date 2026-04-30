/**
 * 服装三视图生成任务
 * 基于无角色的通用白色 mannequin（人台）+ 服装描述，生成服装的正/侧/背三视图
 * 跨角色复用：一套服装三视图可被多个角色引用
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
 *   frontViewUrl, sideViewUrl, backViewUrl, imageUrl
 * }
 */

const handleImageGeneration = require('../base/imageGeneration');
const { execute, queryOne } = require('../../../dbHelper');
const { downloadAndStore, resolveToInternalUrl } = require('../../../utils/fileStorage');
const { requireVisualStyle } = require('../../../utils/getProjectStyle');

// 通用服装人台（白色简单人形 mannequin），刻意避开任何角色身份
const MANNEQUIN_BODY = {
  male: 'male mannequin body, neutral facial features, average male proportions, plain white skin tone, simple generic human form, no distinct personality or character identity, T-pose neutral standing, clean empty background',
  female: 'female mannequin body, neutral facial features, average female proportions, plain white skin tone, simple generic human form, no distinct personality or character identity, T-pose neutral standing, clean empty background',
  unisex: 'androgynous mannequin body, neutral facial features, average proportions, plain white skin tone, simple generic human form, no distinct personality or character identity, T-pose neutral standing, clean empty background'
};

const VIEW_CFG = {
  front: 'front view, eye-level shot, full body, facing camera, arms slightly away from body to fully reveal the outfit, costume fully visible',
  side: 'side view, profile shot, full body, 90 degrees right profile, showing outfit silhouette and side details',
  back: 'back view, rear shot, full body, facing completely away, showing the back of the outfit in full detail'
};

function buildCostumePrompt(view, style, outfitDesc, gender) {
  const mannequin = MANNEQUIN_BODY[gender] || MANNEQUIN_BODY.unisex;
  const viewAngle = VIEW_CFG[view] || VIEW_CFG.front;
  const styleKeywords = style || 'anime style';
  return `product reference sheet of a standalone costume/outfit displayed on a generic mannequin, ${mannequin}, the mannequin is wearing: ${outfitDesc}, the outfit must be fully visible and clear, preserve all costume details fabric texture color pattern trim buttons seams accessories attached to the outfit, ${viewAngle}, ${styleKeywords}, clean solid light gray background, even soft studio lighting, no dramatic shadow, no extra props, no weapons, no held items, neutral pose, professional costume turnaround reference sheet`;
}

async function handleCostumeViewsGeneration(inputParams, onProgress) {
  const { costumeId, projectId, imageModel, aspectRatio } = inputParams;

  if (!costumeId) throw new Error('costumeId 参数必需');
  if (!imageModel) throw new Error('imageModel 参数必需');

  // 加载服装信息
  const costume = await queryOne('SELECT * FROM costumes WHERE id = ?', [costumeId]);
  if (!costume) throw new Error('服装不存在');

  const outfitDesc = costume.outfit_prompt || costume.description || costume.name;
  if (!outfitDesc) throw new Error('服装缺少描述或提示词，无法生成三视图');

  const gender = costume.gender || 'unisex';
  const style = await requireVisualStyle(projectId || costume.project_id);

  console.log('[CostumeViews] 开始生成服装三视图', {
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
  const views = ['front', 'side', 'back'];

  try {
    // 并行生成三视图
    const results = await Promise.all(
      views.map(async (view) => {
        const prompt = buildCostumePrompt(view, style, outfitDesc, gender);
        const genParams = {
          prompt,
          imageModel,
          aspectRatio: aspectRatio || '2:3'
        };
        const r = await handleImageGeneration(genParams);
        return { view, imageUrl: r.image_url, prompt };
      })
    );

    if (onProgress) onProgress(70);

    // 持久化到存储
    const persisted = await Promise.all(
      results.map(async ({ view, imageUrl, prompt }) => {
        const persistedUrl = await downloadAndStore(
          imageUrl,
          `${storageBase}/${view}_${ts}`,
          { fallbackExt: '.png' }
        );
        return { view, persistedUrl, prompt };
      })
    );

    if (onProgress) onProgress(90);

    // 入库
    const urlMap = {};
    let firstPrompt = '';
    for (const { view, persistedUrl, prompt } of persisted) {
      urlMap[`${view}_view_url`] = persistedUrl;
      if (!firstPrompt) firstPrompt = prompt;
    }
    const mainImage = urlMap.front_view_url || null;
    await execute(
      `UPDATE costumes SET
        front_view_url = ?, side_view_url = ?, back_view_url = ?,
        image_url = COALESCE(?, image_url),
        generation_status = 'completed',
        generation_prompt = ?,
        updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [urlMap.front_view_url, urlMap.side_view_url, urlMap.back_view_url, mainImage, firstPrompt, costumeId]
    );

    if (onProgress) onProgress(100);
    console.log('[CostumeViews] ✅ 服装三视图生成完成', { costumeId });

    return {
      costumeId,
      frontViewUrl: urlMap.front_view_url,
      sideViewUrl: urlMap.side_view_url,
      backViewUrl: urlMap.back_view_url,
      imageUrl: mainImage
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
