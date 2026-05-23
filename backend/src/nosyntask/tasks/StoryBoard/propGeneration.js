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

/**
 * 构建道具设定图提示词
 *
 * 核心策略：项目视觉风格主导画面风格，道具描述 + 样式配置聚焦道具本身，
 * 布局指令尽量精简，避免与风格冲突。
 */
function buildPropPrompt(style, propName, propDesc, propCategory, styleConfig) {
  const styleKeywords = style || 'anime style';

  // 解析道具样式配置（material / color / texture 等）
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
  const configDesc = configParts.length > 0 ? `, ${configParts.join(', ')}` : '';

  const baseDesc = propDesc || propName;
  const categoryHint = propCategory ? `${propCategory}: ` : '';

  return `prop design reference sheet, ${categoryHint}${baseDesc}${configDesc}, single standalone item on clean light gray background, three-view layout showing front side and back in one wide image, ${styleKeywords}, product photography, studio lighting, highly detailed`;
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

    // 入库（只保存一张设定图，不生成独立视角图）
    await execute(
      `UPDATE props SET
        image_url = ?,
        generation_status = 'completed',
        generation_prompt = ?,
        updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [persistedUrl, prompt, propId]
    );

    if (onProgress) onProgress(100);
    console.log('[PropViews] 道具设定图生成完成', { propId });

    return {
      propId,
      imageUrl: persistedUrl,
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
