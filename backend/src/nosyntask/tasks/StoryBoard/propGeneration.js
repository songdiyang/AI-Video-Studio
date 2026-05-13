/**
 * 道具设定图生成任务
 * 基于道具描述直接生成 16:9 单张道具设定图（参考服装设定图模式）
 *
 * input: {
 *   propId: number,
 *   projectId: number,
 *   imageModel: string,
 *   textModel?: string,
 *   aspectRatio?: string
 * }
 *
 * output: {
 *   propId,
 *   imageUrl,
 *   prompt
 * }
 */

const handleImageGeneration = require('../base/imageGeneration');
const { execute, queryOne } = require('../../../dbHelper');
const { downloadAndStore } = require('../../../utils/fileStorage');
const { requireVisualStyle } = require('../../../utils/getProjectStyle');

function buildPropPrompt(style, propName, propDesc, propCategory, styleConfig) {
  const styleKeywords = style || 'anime style';

  // 解析样式配置
  const configParts = [];
  if (styleConfig) {
    const sc = typeof styleConfig === 'string' ? JSON.parse(styleConfig) : styleConfig;
    if (sc.material) configParts.push(`made of ${sc.material}`);
    if (sc.primaryColor) configParts.push(`primary color ${sc.primaryColor}`);
    if (sc.secondaryColor) configParts.push(`accent color ${sc.secondaryColor}`);
    if (sc.texture) configParts.push(`${sc.texture} texture`);
    if (sc.size) configParts.push(`size: ${sc.size}`);
    if (sc.condition) configParts.push(`${sc.condition} condition`);
    if (sc.details) configParts.push(sc.details);
  }
  const configDesc = configParts.length > 0 ? configParts.join(', ') : '';

  const baseDesc = propDesc || propName;
  const categoryHint = propCategory ? `${propCategory}, ` : '';

  return `prop design reference sheet, a standalone ${categoryHint}item displayed on clean light gray background, ${baseDesc}, ${configDesc}, shown from multiple angles in a single wide 16:9 image, left: front view showing full face of the item, center: side profile view showing thickness and silhouette, right: back view / detail view, consistent design across all angles, ${styleKeywords}, product photography, studio lighting, even soft light, no dramatic shadow, highly detailed, crisp line art feel`;
}

/**
 * 构建道具三视角独立提示词
 * 用于生成正面/侧面/背面的独立视角图
 */
function buildPropViewPrompts(style, propName, propDesc, propCategory, styleConfig) {
  const styleKeywords = style || 'anime style';

  // 解析样式配置
  const configParts = [];
  if (styleConfig) {
    const sc = typeof styleConfig === 'string' ? JSON.parse(styleConfig) : styleConfig;
    if (sc.material) configParts.push(`made of ${sc.material}`);
    if (sc.primaryColor) configParts.push(`primary color ${sc.primaryColor}`);
    if (sc.secondaryColor) configParts.push(`accent color ${sc.secondaryColor}`);
    if (sc.texture) configParts.push(`${sc.texture} texture`);
    if (sc.size) configParts.push(`size: ${sc.size}`);
    if (sc.condition) configParts.push(`${sc.condition} condition`);
    if (sc.details) configParts.push(sc.details);
  }
  const configDesc = configParts.length > 0 ? configParts.join(', ') : '';

  const baseDesc = propDesc || propName;
  const categoryHint = propCategory ? `${propCategory}, ` : '';

  return {
    front: `prop design front view, a standalone ${categoryHint}item, ${baseDesc}, ${configDesc}, front-facing view showing full face and front details of the item, centered composition, clean light gray background, ${styleKeywords}, product photography, studio lighting, even soft light, highly detailed`,
    side: `prop design side view, a standalone ${categoryHint}item, ${baseDesc}, ${configDesc}, side profile view showing thickness, silhouette and side details of the item, centered composition, clean light gray background, ${styleKeywords}, product photography, studio lighting, even soft light, highly detailed`,
    back: `prop design back view, a standalone ${categoryHint}item, ${baseDesc}, ${configDesc}, back view showing rear details and back surface of the item, centered composition, clean light gray background, ${styleKeywords}, product photography, studio lighting, even soft light, highly detailed`
  };
}

async function handlePropViewsGeneration(inputParams, onProgress) {
  const { propId, projectId, imageModel, aspectRatio } = inputParams;

  if (!propId) throw new Error('propId 参数必需');
  if (!imageModel) throw new Error('imageModel 参数必需');

  // 加载道具信息
  const prop = await queryOne('SELECT * FROM props WHERE id = ?', [propId]);
  if (!prop) throw new Error('道具不存在');

  const propName = prop.name;
  const propDesc = prop.description || prop.name;
  const propCategory = prop.category || '';
  const styleConfig = prop.style_config || null;
  const style = await requireVisualStyle(projectId || prop.project_id);

  console.log('[PropViews] 开始生成道具设定图', {
    propId, name: propName, category: propCategory, imageModel
  });

  if (onProgress) onProgress(5);

  // 标记生成中
  await execute(
    `UPDATE props SET generation_status = 'generating', updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
    [propId]
  );

  const ts = Date.now();
  const storageBase = `images/props/${propId}`;

  try {
    // 构建 prompt 并生成 16:9 道具设定图（多视角）
    const prompt = buildPropPrompt(style, propName, propDesc, propCategory, styleConfig);
    const genParams = {
      prompt,
      imageModel,
      aspectRatio: aspectRatio || '16:9'
    };
    const r = await handleImageGeneration(genParams);

    if (onProgress) onProgress(50);

    // 持久化主设定图到存储
    const persistedUrl = await downloadAndStore(
      r.image_url,
      `${storageBase}/design_${ts}`,
      { fallbackExt: '.png' }
    );

    if (onProgress) onProgress(70);

    // 生成三个独立视角图（正面/侧面/背面）
    let frontViewUrl = null;
    let sideViewUrl = null;
    let backViewUrl = null;

    try {
      const viewPrompts = buildPropViewPrompts(style, propName, propDesc, propCategory, styleConfig);

      // 正面图
      const frontR = await handleImageGeneration({
        prompt: viewPrompts.front,
        imageModel,
        aspectRatio: '1:1',
        imageUrl: persistedUrl // 使用主设定图作为参考
      });
      frontViewUrl = await downloadAndStore(
        frontR.image_url,
        `${storageBase}/front_${ts}`,
        { fallbackExt: '.png' }
      );
      if (onProgress) onProgress(80);

      // 侧面图
      const sideR = await handleImageGeneration({
        prompt: viewPrompts.side,
        imageModel,
        aspectRatio: '1:1',
        imageUrl: persistedUrl
      });
      sideViewUrl = await downloadAndStore(
        sideR.image_url,
        `${storageBase}/side_${ts}`,
        { fallbackExt: '.png' }
      );
      if (onProgress) onProgress(90);

      // 背面图
      const backR = await handleImageGeneration({
        prompt: viewPrompts.back,
        imageModel,
        aspectRatio: '1:1',
        imageUrl: persistedUrl
      });
      backViewUrl = await downloadAndStore(
        backR.image_url,
        `${storageBase}/back_${ts}`,
        { fallbackExt: '.png' }
      );
      if (onProgress) onProgress(95);

      console.log('[PropViews] 三视角图生成完成', { propId, frontViewUrl, sideViewUrl, backViewUrl });
    } catch (viewErr) {
      // 三视角生成失败不影响主图
      console.warn('[PropViews] 三视角图生成失败（主图已生成）:', viewErr.message);
    }

    // 入库
    await execute(
      `UPDATE props SET
        image_url = ?,
        front_view_url = ?,
        side_view_url = ?,
        back_view_url = ?,
        generation_status = 'completed',
        generation_prompt = ?,
        updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [persistedUrl, frontViewUrl, sideViewUrl, backViewUrl, prompt, propId]
    );

    if (onProgress) onProgress(100);
    console.log('[PropViews] 道具设定图生成完成', { propId });

    return {
      propId,
      imageUrl: persistedUrl,
      frontViewUrl,
      sideViewUrl,
      backViewUrl,
      prompt
    };
  } catch (err) {
    console.error('[PropViews] 生成失败:', err.message);
    await execute(
      `UPDATE props SET generation_status = 'failed', updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
      [propId]
    );
    throw err;
  }
}

// 保留旧接口兼容
async function handlePropPromptGeneration(inputParams, onProgress) {
  console.warn('[PropGen] handlePropPromptGeneration 已废弃，请使用 prop_views_generation');
  return { prompt: '', propId: inputParams.propId };
}

async function handlePropImageGeneration(inputParams, onProgress) {
  console.warn('[PropGen] handlePropImageGeneration 已废弃，请使用 prop_views_generation');
  return { imageUrl: '', propId: inputParams.propId, prompt: '' };
}

module.exports = {
  handlePropViewsGeneration,
  handlePropPromptGeneration,
  handlePropImageGeneration
};
