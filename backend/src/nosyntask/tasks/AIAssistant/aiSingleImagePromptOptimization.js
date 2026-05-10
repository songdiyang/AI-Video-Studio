/**
 * AI 助手 - 单分镜图片提示词优化包装器（多模态视觉版）
 *
 * 为 AI 助手提供无需传入 prompt 参数的简化接口。
 *
 * 输入:  { storyboardId, multimodalModel }
 * 输出:  { optimized, negativePrompt, model, originalLength, optimizedLength }
 */
const handleSingleImagePromptOptimization = require('../StoryBoard/singleImagePromptOptimization');
const { queryOne } = require('../../../dbHelper');

async function handleAISingleImagePromptOptimization(params, onProgress) {
  const { storyboardId, multimodalModel } = params;

  if (!storyboardId) throw new Error('缺少必要参数: storyboardId');

  const storyboard = await queryOne(
    `SELECT s.description, s.first_frame_prompt, s.last_frame_prompt,
            sc.content AS script_content
     FROM storyboards s
     LEFT JOIN scripts sc ON s.script_id = sc.id
     WHERE s.id = ?`,
    [storyboardId]
  );

  if (!storyboard) throw new Error(`分镜 ${storyboardId} 不存在`);

  const prompt = storyboard.first_frame_prompt
    || storyboard.last_frame_prompt
    || storyboard.description
    || storyboard.script_content
    || '';

  if (!prompt || !prompt.trim()) {
    return {
      optimized: prompt,
      negativePrompt: '',
      model: multimodalModel || '默认模型',
      originalLength: 0,
      optimizedLength: 0,
      _note: '该分镜没有可优化的提示词内容，请先生成分镜文本或提示词。'
    };
  }

  console.log(`[AISingleImagePromptOpt] 优化分镜 ${storyboardId} 图片提示词, 长度=${prompt.length}`);

  return handleSingleImagePromptOptimization({
    storyboardId,
    prompt,
    multimodalModel
  }, onProgress);
}

module.exports = handleAISingleImagePromptOptimization;
