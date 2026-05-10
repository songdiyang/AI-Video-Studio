/**
 * AI 助手 - 影棚图片视觉分析包装器
 *
 * 根据 studioId 自动获取影棚的九宫组装图，
 * 调用多模态视觉模型分析影棚整体布局和视觉特征。
 *
 * 输入:  { studioId, textModel }
 * 输出:  { visualDescription, characters, scene, composition, objects } | null
 */
const handleVisionFrameAnalysis = require('../StoryBoard/visionFrameAnalysis');
const { queryOne } = require('../../../dbHelper');

async function handleStudioVisionAnalysis(params, onProgress) {
  const { studioId, textModel } = params;

  if (!studioId) throw new Error('缺少必要参数: studioId');

  const studio = await queryOne(
    `SELECT s.name, s.description, s.nine_grid_image_url,
            e.name AS env_name, e.description AS env_description
     FROM studios s
     LEFT JOIN environments e ON e.id = s.environment_id
     WHERE s.id = ?`,
    [studioId]
  );

  if (!studio) throw new Error(`影棚 ${studioId} 不存在`);

  const imageUrls = [studio.nine_grid_image_url].filter(Boolean);

  if (imageUrls.length === 0) {
    return {
      visualDescription: `影棚「${studio.name || '未命名'}」尚未生成九宫组装图，无法进行视觉分析。请先生成影棚九宫图。`,
      characters: [],
      scene: {},
      composition: {},
      objects: []
    };
  }

  const descParts = [
    `影棚名称：${studio.name || '未命名'}`,
    studio.description ? `描述：${studio.description}` : '',
    studio.env_name ? `关联环境：${studio.env_name}` : ''
  ].filter(Boolean);

  console.log(`[StudioVisionAnalysis] 分析影棚 ${studioId}: ${imageUrls.length} 张图片`);

  return handleVisionFrameAnalysis({
    imageUrls,
    description: descParts.join('。'),
    textModel
  }, onProgress);
}

module.exports = handleStudioVisionAnalysis;
