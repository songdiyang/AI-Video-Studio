/**
 * AI 助手 - 分镜图片视觉分析包装器
 *
 * 将 storyboardId 解析为 imageUrls + description，
 * 然后调用 visionFrameAnalysis 进行多模态视觉分析。
 *
 * 输入:  { storyboardId, textModel }
 * 输出:  { visualDescription, characters, scene, composition, objects } | null
 */
const handleVisionFrameAnalysis = require('../StoryBoard/visionFrameAnalysis');
const { queryOne } = require('../../../dbHelper');

async function handleVisionAnalysisWrapper(params, onProgress) {
  const { storyboardId, textModel } = params;

  if (!storyboardId) throw new Error('缺少必要参数: storyboardId');

  const storyboard = await queryOne(
    'SELECT first_frame_url, last_frame_url, description FROM storyboards WHERE id = ?',
    [storyboardId]
  );

  if (!storyboard) throw new Error(`分镜 ${storyboardId} 不存在`);

  const imageUrls = [storyboard.first_frame_url, storyboard.last_frame_url].filter(Boolean);
  if (imageUrls.length === 0) {
    return {
      visualDescription: '该分镜尚未生成图片，无法进行视觉分析。请先生成首帧或尾帧图片。',
      characters: [],
      scene: {},
      composition: {},
      objects: []
    };
  }

  console.log(`[VisionAnalysisWrapper] 分析分镜 ${storyboardId}: ${imageUrls.length} 张图片, 模型=${textModel || '默认'}`);

  return handleVisionFrameAnalysis({
    imageUrls,
    description: storyboard.description || '',
    textModel
  }, onProgress);
}

module.exports = handleVisionAnalysisWrapper;
