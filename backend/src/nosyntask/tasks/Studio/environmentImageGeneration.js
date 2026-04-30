/**
 * 环境氛围图生成任务
 * 根据环境信息（名称、描述、时段、天气、光照、氛围）生成氛围参考图
 * 
 * input: {
 *   environmentId: number,
 *   environmentName: string,
 *   description: string,
 *   timeOfDay: string,
 *   weather: string,
 *   lighting: string,
 *   mood: string,
 *   imageModel: string,
 *   textModel: string,
 *   generationPrompt?: string (已有提示词时直接使用，跳过 AI 生成)
 * }
 * 
 * output: {
 *   imageUrl: string,
 *   environmentId: number
 * }
 */

const handleImageGeneration = require('../base/imageGeneration');
const handleBaseTextModelCall = require('../base/baseTextModelCall');
const { execute, queryOne } = require('../../../dbHelper');
const { requireVisualStyle } = require('../../../utils/getProjectStyle');
const { downloadAndStore } = require('../../../utils/fileStorage');

/**
 * AI 生成环境氛围图提示词
 */
async function generateEnvironmentPrompt(envName, description, timeOfDay, weather, lighting, mood, style, textModel) {
  const prompt = `你是一个专业的图片生成提示词专家。请根据以下环境信息生成高质量的环境氛围图提示词（用于 AI 绘图工具）。

要求：
1. 提示词必须用英文输出
2. 使用逗号分隔的关键词格式
3. 包含：场景环境、光照效果、氛围、构图、画质描述
4. 长度控制在 80-120 个单词
5. 重点描述环境细节、光影效果、氛围营造
6. 严格禁止出现任何人物、角色、人影、剪影
7. 在提示词开头加上 "empty scene, no people, no characters, uninhabited,"

环境名称：${envName || '未命名'}
环境描述：${description || '无'}
时间段：${timeOfDay || '白天'}
天气：${weather || '晴天'}
光照：${lighting || '自然光'}
氛围：${mood || '无'}
视觉风格：${style || '写实风格'}

请直接输出英文提示词，不要包含任何解释或其他内容。`;

  const response = await handleBaseTextModelCall({
    prompt,
    textModel,
    temperature: 0.7
  });

  let text = '';
  if (typeof response === 'string') text = response;
  else if (response?.content) text = response.content;
  else if (response?.text) text = response.text;
  else if (response?.message) text = response.message;

  if (!text) throw new Error('AI 响应为空，环境提示词生成失败');

  text = text.trim();
  if ((text.startsWith('"') && text.endsWith('"')) || (text.startsWith("'") && text.endsWith("'"))) {
    text = text.slice(1, -1);
  }
  text = text.replace(/\n/g, ' ').replace(/\s+/g, ' ').trim();

  return text;
}

async function handleEnvironmentImageGeneration(inputParams, onProgress) {
  const {
    environmentId,
    environmentName,
    description,
    timeOfDay,
    weather,
    lighting,
    mood,
    imageModel,
    textModel,
    generationPrompt
  } = inputParams;

  if (!environmentId) throw new Error('缺少必要参数：environmentId');
  if (!imageModel) throw new Error('imageModel 参数是必需的');

  // 标记生成中
  await execute(
    "UPDATE environments SET generation_status = 'generating' WHERE id = ?",
    [environmentId]
  );

  if (onProgress) onProgress(5);

  try {
    // 获取项目视觉风格
    const env = await queryOne('SELECT project_id FROM environments WHERE id = ?', [environmentId]);
    const style = await requireVisualStyle(env?.project_id).catch(() => null);

    // 步骤1：生成或使用已有提示词
    let finalPrompt = generationPrompt;
    if (!finalPrompt && textModel) {
      finalPrompt = await generateEnvironmentPrompt(
        environmentName, description, timeOfDay, weather, lighting, mood, style, textModel
      );
      // 回写提示词到数据库
      await execute(
        'UPDATE environments SET generation_prompt = ? WHERE id = ?',
        [finalPrompt, environmentId]
      );
    }

    if (!finalPrompt) {
      // 无提示词时用简单拼接回退
      finalPrompt = `empty scene, no people, no characters, uninhabited, ${environmentName || ''}, ${description || ''}, ${timeOfDay || 'daytime'} ${weather || 'clear'} weather, ${lighting || 'natural light'}, ${mood || ''} atmosphere, anime style, high quality, detailed, cinematic`;
    }

    console.log(`[EnvironmentImageGen] 提示词: ${finalPrompt.substring(0, 150)}...`);
    if (onProgress) onProgress(20);

    // 步骤2：调用图像模型
    const imageResult = await handleImageGeneration({
      prompt: finalPrompt,
      imageModel,
      aspectRatio: '1:1',
      width: 1024,
      height: 1024
    }, (p) => onProgress && onProgress(20 + p * 0.6));

    const rawUrl = imageResult.image_url;

    // 持久化图片
    const persistedUrl = await downloadAndStore(
      rawUrl,
      `images/environments/${environmentId}`,
      { fallbackExt: '.png' }
    );

    if (onProgress) onProgress(92);

    // 更新数据库
    await execute(
      "UPDATE environments SET image_url = ?, generation_status = 'completed' WHERE id = ?",
      [persistedUrl, environmentId]
    );

    if (onProgress) onProgress(100);
    console.log(`[EnvironmentImageGen] 环境图片生成完成: environmentId=${environmentId}`);

    return {
      imageUrl: persistedUrl,
      environmentId
    };
  } catch (err) {
    // 标记失败
    await execute(
      "UPDATE environments SET generation_status = 'failed' WHERE id = ?",
      [environmentId]
    ).catch(() => {});
    throw err;
  }
}

module.exports = handleEnvironmentImageGeneration;
