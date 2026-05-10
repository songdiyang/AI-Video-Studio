/**
 * AI 助手 - 单分镜视频提示词优化包装器
 *
 * 为 AI 助手提供无需传入 prompt 参数的简化接口。
 *
 * 输入:  { storyboardId, textModel }
 * 输出:  { videoStartPrompt, videoEndPrompt, negativePrompt, model, originalLength, optimizedLength }
 */
const handleSingleVideoPromptOptimization = require('../StoryBoard/singleVideoPromptOptimization');
const { queryOne } = require('../../../dbHelper');

async function handleAISingleVideoPromptOptimization(params, onProgress) {
  const { storyboardId, textModel } = params;

  if (!storyboardId) throw new Error('缺少必要参数: storyboardId');

  const storyboard = await queryOne(
    `SELECT s.description, s.first_frame_prompt, s.last_frame_prompt, s.video_prompt,
            sc.content AS script_content
     FROM storyboards s
     LEFT JOIN scripts sc ON s.script_id = sc.id
     WHERE s.id = ?`,
    [storyboardId]
  );

  if (!storyboard) throw new Error(`分镜 ${storyboardId} 不存在`);

  const prompt = storyboard.video_prompt
    || storyboard.first_frame_prompt
    || storyboard.last_frame_prompt
    || storyboard.description
    || storyboard.script_content
    || '';

  if (!prompt || !prompt.trim()) {
    return {
      videoStartPrompt: '',
      videoEndPrompt: '',
      negativePrompt: '',
      model: textModel || '默认模型',
      originalLength: 0,
      optimizedLength: 0,
      _note: '该分镜没有可优化的提示词内容，请先生成分镜文本或提示词。'
    };
  }

  console.log(`[AISingleVideoPromptOpt] 优化分镜 ${storyboardId} 视频提示词, 长度=${prompt.length}`);

  return handleSingleVideoPromptOptimization({
    storyboardId,
    prompt,
    textModel
  }, onProgress);
}

module.exports = handleAISingleVideoPromptOptimization;
