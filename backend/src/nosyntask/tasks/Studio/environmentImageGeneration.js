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
    generationPrompt,
    mode: rawMode,
    existingImageUrl,
    existingBackImageUrl
  } = inputParams;

  if (!environmentId) throw new Error('缺少必要参数：environmentId');
  if (!imageModel) throw new Error('imageModel 参数是必需的');

  // 生成模式：front=仅正面，back=仅背面，both=正+背
  const mode = (rawMode === 'front' || rawMode === 'back') ? rawMode : 'both';

  const hasExistingFront = !!existingImageUrl;
  const hasExistingBack = !!existingBackImageUrl;

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
      await execute(
        'UPDATE environments SET generation_prompt = ? WHERE id = ?',
        [finalPrompt, environmentId]
      );
    }

    if (!finalPrompt) {
      finalPrompt = `empty scene, no people, no characters, uninhabited, ${environmentName || ''}, ${description || ''}, ${timeOfDay || 'daytime'} ${weather || 'clear'} weather, ${lighting || 'natural light'}, ${mood || ''} atmosphere, anime style, high quality, detailed, cinematic`;
    }

    const reversePromptPrefix = 'reverse angle view, 180 degree opposite direction, same location from opposite side, same art style, same color palette, same lighting, consistent environment, ';
    const withReverse = (base) => reversePromptPrefix + base.replace(/^empty scene[^,]*,\s*/i, 'empty scene, no people, no characters, uninhabited, ');

    console.log(`[EnvironmentImageGen] mode=${mode}, hasFront=${hasExistingFront}, hasBack=${hasExistingBack}, prompt: ${finalPrompt.substring(0, 120)}...`);
    if (onProgress) onProgress(15);

    let persistedFrontUrl = null;
    let persistedBackUrl = null;

    // 工具函数：调用图像生成 + 持久化
    const genAndStore = async (prompt, refImageUrl, progressStart, progressRange) => {
      const callArgs = {
        prompt,
        imageModel,
        aspectRatio: '1:1',
        width: 1024,
        height: 1024
      };
      if (refImageUrl) callArgs.imageUrl = refImageUrl;
      const result = await handleImageGeneration(
        callArgs,
        (p) => onProgress && onProgress(progressStart + p * (progressRange / 100))
      );
      return downloadAndStore(
        result.image_url,
        `images/environments/${environmentId}`,
        { fallbackExt: '.png' }
      ).then(url => `${url}?t=${Date.now()}`);  // 破缓存
    };

    // —— front：生成正面图 ——
    // 若已有背面图，以背面图作为 i2i 参考（反向视角）生成正面；否则直接 t2i
    if (mode === 'front') {
      const refUrl = hasExistingBack ? existingBackImageUrl : null;
      const prompt = refUrl ? withReverse(finalPrompt) : finalPrompt;
      persistedFrontUrl = await genAndStore(prompt, refUrl, 15, 75);
      await execute("UPDATE environments SET image_url = ? WHERE id = ?", [persistedFrontUrl, environmentId]);
      if (onProgress) onProgress(95);
    }

    // —— back：生成背面图 ——
    // 有正面 → i2i 参考生成背面
    // 无正面 → 先 t2i 生成正面落库，再以正面参考生成背面
    if (mode === 'back') {
      let refForBack = existingImageUrl;
      if (!hasExistingFront) {
        // 先生成正面
        persistedFrontUrl = await genAndStore(finalPrompt, null, 15, 35);
        await execute("UPDATE environments SET image_url = ? WHERE id = ?", [persistedFrontUrl, environmentId]);
        refForBack = persistedFrontUrl;
        if (onProgress) onProgress(55);
      }
      persistedBackUrl = await genAndStore(withReverse(finalPrompt), refForBack, hasExistingFront ? 15 : 55, hasExistingFront ? 75 : 35);
      await execute("UPDATE environments SET image_back_url = ? WHERE id = ?", [persistedBackUrl, environmentId]);
      if (onProgress) onProgress(95);
    }

    // —— both：先生成正面，再以正面参考生成背面（背面失败非致命）——
    if (mode === 'both') {
      persistedFrontUrl = await genAndStore(finalPrompt, null, 15, 40);
      await execute("UPDATE environments SET image_url = ? WHERE id = ?", [persistedFrontUrl, environmentId]);
      if (onProgress) onProgress(55);

      try {
        persistedBackUrl = await genAndStore(withReverse(finalPrompt), persistedFrontUrl, 55, 35);
        await execute("UPDATE environments SET image_back_url = ? WHERE id = ?", [persistedBackUrl, environmentId]);
      } catch (backErr) {
        console.warn(`[EnvironmentImageGen] 背面图生成失败（非致命，保留正面图）:`, backErr.message);
      }
    }

    // 结束：标记 completed
    await execute(
      "UPDATE environments SET generation_status = 'completed' WHERE id = ?",
      [environmentId]
    );

    if (onProgress) onProgress(100);
    console.log(`[EnvironmentImageGen] 完成: envId=${environmentId}, mode=${mode}, front=${persistedFrontUrl ? 'yes' : 'skip'}, back=${persistedBackUrl ? 'yes' : 'skip'}`);

    return {
      imageUrl: persistedFrontUrl,
      imageBackUrl: persistedBackUrl,
      environmentId,
      mode
    };
  } catch (err) {
    await execute(
      "UPDATE environments SET generation_status = 'failed' WHERE id = ?",
      [environmentId]
    ).catch(() => {});
    throw err;
  }
}

module.exports = handleEnvironmentImageGeneration;
