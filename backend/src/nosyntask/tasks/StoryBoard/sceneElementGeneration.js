/**
 * 场景元素图片生成任务
 * 根据元素信息生成独立的元素立绘（干净背景），用于后续多图合成全景
 *
 * input: {
 *   elementId, elementName, elementDescription, elementCategory,
 *   imageModel, textModel
 * }
 *
 * output: { elementId, imageUrl, prompt }
 */

const handleImageGeneration = require('../base/imageGeneration');
const handleBaseTextModelCall = require('../base/baseTextModelCall');
const { execute, queryOne } = require('../../../dbHelper');
const { downloadAndStore } = require('../../../utils/fileStorage');

async function generateElementPrompt(name, description, category, textModel) {
  const catHint = category === 'building'
    ? 'architectural structure, building facade, man-made construction'
    : 'natural scenery, environmental object, landscape feature';

  const fullPrompt = `你是漫剧美术提示词专家，负责把一个场景元素写成独立立绘 prompt，供 AI 生成干净的参考图。

元素：${name}
类别：${category === 'building' ? '建筑' : '场景'}
描述：${description || '无'}

输出要求（严格）：
1. 输出英文逗号分隔关键词，不要任何中文、不要解释
2. 开头固定包含：anime style, single isolated ${category === 'building' ? 'building' : 'scenery'} element, clean neutral background, centered composition, ${catHint}, no characters, no people, no figures, consistent lighting
3. 重点刻画：外观、材质、比例、风格细节
4. 结尾固定包含：delicate lineart, ultra detailed, production-ready reference sheet, 8k quality
5. 长度 60~120 英文单词
6. 除开头/结尾的固定否定词外，不要再输出其他否定词

直接输出英文 prompt：`;

  const response = await handleBaseTextModelCall({
    prompt: fullPrompt,
    textModel,
    temperature: 0.6
  });
  const content = (response.content || '').trim();
  if (!content) throw new Error('元素 prompt 生成失败：AI 返回为空');
  return content;
}

async function handleSceneElementGeneration(inputParams, onProgress) {
  const {
    elementId,
    elementName,
    elementDescription,
    elementCategory,
    imageModel,
    textModel
  } = inputParams;

  if (!elementId) throw new Error('缺少必要参数：elementId');
  if (!imageModel) throw new Error('imageModel 参数是必需的');

  // 标记生成中
  await execute(
    "UPDATE scene_elements SET generation_status = 'generating' WHERE id = ?",
    [elementId]
  );

  if (onProgress) onProgress(5);

  try {
    let finalPrompt;
    if (textModel) {
      finalPrompt = await generateElementPrompt(
        elementName, elementDescription, elementCategory, textModel
      );
    } else {
      // 无 textModel 时，用简单英文拼接回退
      const catHint = elementCategory === 'building' ? 'building' : 'scenery';
      finalPrompt = `anime style, single isolated ${catHint} element, clean neutral background, centered composition, ${elementName || ''}, ${elementDescription || ''}, no characters, no people, consistent lighting, ultra detailed, 8k quality`;
    }

    if (onProgress) onProgress(20);

    const imageResult = await handleImageGeneration({
      prompt: finalPrompt,
      imageModel,
      aspectRatio: '1:1',
      width: 1024,
      height: 1024
    }, (p) => onProgress && onProgress(20 + p * 0.6));

    const rawUrl = imageResult.image_url;

    const persistedUrl = await downloadAndStore(
      rawUrl,
      `images/scene_elements/${elementId}`,
      { fallbackExt: '.png' }
    );

    if (onProgress) onProgress(92);

    await execute(
      `UPDATE scene_elements
         SET image_url = ?, generation_prompt = ?, generation_status = 'completed',
             updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [persistedUrl, finalPrompt, elementId]
    );

    if (onProgress) onProgress(100);

    return {
      elementId,
      imageUrl: persistedUrl,
      prompt: finalPrompt,
      imageModel
    };
  } catch (err) {
    await execute(
      "UPDATE scene_elements SET generation_status = 'failed' WHERE id = ?",
      [elementId]
    ).catch(() => {});
    throw err;
  }
}

module.exports = handleSceneElementGeneration;
