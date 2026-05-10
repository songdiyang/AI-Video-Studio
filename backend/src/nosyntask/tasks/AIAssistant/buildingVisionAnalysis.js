/**
 * AI 助手 - 建筑图片视觉分析包装器
 *
 * 根据 buildingId 自动获取建筑的结构图（外景/内景），
 * 调用多模态视觉模型分析建筑特征。
 *
 * 输入:  { buildingId, textModel }
 * 输出:  { visualDescription, characters, scene, composition, objects } | null
 */
const handleVisionFrameAnalysis = require('../StoryBoard/visionFrameAnalysis');
const { queryOne } = require('../../../dbHelper');

async function handleBuildingVisionAnalysis(params, onProgress) {
  const { buildingId, textModel } = params;

  if (!buildingId) throw new Error('缺少必要参数: buildingId');

  const building = await queryOne(
    `SELECT name, description, exterior_image_url, interior_image_url, image_url,
            structure_type, interior_exterior
     FROM buildings WHERE id = ?`,
    [buildingId]
  );

  if (!building) throw new Error(`建筑 ${buildingId} 不存在`);

  const imageUrls = [
    building.exterior_image_url,
    building.interior_image_url,
    building.image_url
  ].filter(Boolean);

  if (imageUrls.length === 0) {
    return {
      visualDescription: `建筑「${building.name || '未命名'}」尚未生成结构图，无法进行视觉分析。请先生成建筑图片。`,
      characters: [],
      scene: {},
      composition: {},
      objects: []
    };
  }

  const descParts = [
    `建筑名称：${building.name || '未命名'}`,
    building.description ? `描述：${building.description}` : '',
    building.structure_type ? `结构类型：${building.structure_type}` : '',
    building.interior_exterior ? `视图类型：${building.interior_exterior}` : ''
  ].filter(Boolean);

  console.log(`[BuildingVisionAnalysis] 分析建筑 ${buildingId}: ${imageUrls.length} 张图片`);

  return handleVisionFrameAnalysis({
    imageUrls,
    description: descParts.join('。'),
    textModel
  }, onProgress);
}

module.exports = handleBuildingVisionAnalysis;
