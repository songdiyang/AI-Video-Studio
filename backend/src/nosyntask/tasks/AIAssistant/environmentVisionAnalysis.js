/**
 * AI 助手 - 环境图片视觉分析包装器
 *
 * 根据 environmentId 自动获取环境的氛围图（正反面），
 * 调用多模态视觉模型分析环境场景特征。
 *
 * 输入:  { environmentId, textModel }
 * 输出:  { visualDescription, characters, scene, composition, objects } | null
 */
const handleVisionFrameAnalysis = require('../StoryBoard/visionFrameAnalysis');
const { queryOne } = require('../../../dbHelper');

async function handleEnvironmentVisionAnalysis(params, onProgress) {
  const { environmentId, textModel } = params;

  if (!environmentId) throw new Error('缺少必要参数: environmentId');

  const env = await queryOne(
    `SELECT name, description, image_url, image_back_url, time_of_day, weather, lighting, mood
     FROM environments WHERE id = ?`,
    [environmentId]
  );

  if (!env) throw new Error(`环境 ${environmentId} 不存在`);

  const imageUrls = [env.image_url, env.image_back_url].filter(Boolean);

  if (imageUrls.length === 0) {
    return {
      visualDescription: `环境「${env.name || '未命名'}」尚未生成氛围图，无法进行视觉分析。请先生成环境图片。`,
      characters: [],
      scene: {},
      composition: {},
      objects: []
    };
  }

  const descParts = [
    `环境名称：${env.name || '未命名'}`,
    env.description ? `描述：${env.description}` : '',
    env.time_of_day ? `时间：${env.time_of_day}` : '',
    env.weather ? `天气：${env.weather}` : '',
    env.lighting ? `光照：${env.lighting}` : '',
    env.mood ? `氛围：${env.mood}` : ''
  ].filter(Boolean);

  console.log(`[EnvironmentVisionAnalysis] 分析环境 ${environmentId}: ${imageUrls.length} 张图片`);

  return handleVisionFrameAnalysis({
    imageUrls,
    description: descParts.join('。'),
    textModel
  }, onProgress);
}

module.exports = handleEnvironmentVisionAnalysis;
