/**
 * 建筑结构图生成任务
 * 根据建筑信息（名称、描述、室内/室外、结构类型）生成建筑图片
 * 
 * input: {
 *   buildingId: number,
 *   buildingName: string,
 *   description: string,
 *   interiorExterior: string,
 *   structureType: string,
 *   imageModel: string,
 *   textModel: string,
 *   generationPrompt?: string (已有提示词时直接使用)
 * }
 * 
 * output: {
 *   imageUrl: string,
 *   buildingId: number
 * }
 */

const handleImageGeneration = require('../base/imageGeneration');
const handleBaseTextModelCall = require('../base/baseTextModelCall');
const { execute, queryOne } = require('../../../dbHelper');
const { requireVisualStyle } = require('../../../utils/getProjectStyle');
const { downloadAndStore } = require('../../../utils/fileStorage');

/**
 * AI 生成建筑图片提示词
 */
async function generateBuildingPrompt(buildingName, description, interiorExterior, structureType, style, textModel) {
  const ieLabel = interiorExterior === 'interior' ? '室内' : interiorExterior === 'both' ? '室内+室外' : '室外';
  const prompt = `你是一个专业的图片生成提示词专家。请根据以下建筑信息生成高质量的建筑图片提示词（用于 AI 绘图工具）。

要求：
1. 提示词必须用英文输出
2. 使用逗号分隔的关键词格式
3. 包含：建筑外观/结构、材质细节、光照、画质描述
4. 长度控制在 60-100 个单词
5. 重点描述建筑的形状、材质、风格特征
6. 严格禁止出现任何人物、角色、人影
7. 在提示词开头加上 "single isolated building, no people, no characters,"

建筑名称：${buildingName || '未命名'}
建筑描述：${description || '无'}
室内/室外：${ieLabel}
结构类型：${structureType || '无'}
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

  if (!text) throw new Error('AI 响应为空，建筑提示词生成失败');

  text = text.trim();
  if ((text.startsWith('"') && text.endsWith('"')) || (text.startsWith("'") && text.endsWith("'"))) {
    text = text.slice(1, -1);
  }
  text = text.replace(/\n/g, ' ').replace(/\s+/g, ' ').trim();

  return text;
}

async function handleBuildingImageGeneration(inputParams, onProgress) {
  const {
    buildingId,
    buildingName,
    description,
    interiorExterior,
    structureType,
    imageModel,
    textModel,
    generationPrompt
  } = inputParams;

  if (!buildingId) throw new Error('缺少必要参数：buildingId');
  if (!imageModel) throw new Error('imageModel 参数是必需的');

  // 标记生成中
  await execute(
    "UPDATE buildings SET generation_status = 'generating' WHERE id = ?",
    [buildingId]
  );

  if (onProgress) onProgress(5);

  try {
    // 获取项目视觉风格
    const building = await queryOne('SELECT project_id FROM buildings WHERE id = ?', [buildingId]);
    const style = await requireVisualStyle(building?.project_id).catch(() => null);

    // 步骤1：生成或使用已有提示词
    let finalPrompt = generationPrompt;
    if (!finalPrompt && textModel) {
      finalPrompt = await generateBuildingPrompt(
        buildingName, description, interiorExterior, structureType, style, textModel
      );
      // 回写提示词到数据库
      await execute(
        'UPDATE buildings SET generation_prompt = ? WHERE id = ?',
        [finalPrompt, buildingId]
      );
    }

    if (!finalPrompt) {
      const ieHint = interiorExterior === 'interior' ? 'interior view' : 'exterior view';
      finalPrompt = `single isolated building, no people, no characters, ${buildingName || ''}, ${description || ''}, ${ieHint}, ${structureType || ''}, anime style, high quality, detailed, architectural, cinematic lighting`;
    }

    console.log(`[BuildingImageGen] 提示词: ${finalPrompt.substring(0, 150)}...`);
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
      `images/buildings/${buildingId}`,
      { fallbackExt: '.png' }
    );

    if (onProgress) onProgress(92);

    // 更新数据库
    await execute(
      "UPDATE buildings SET image_url = ?, generation_status = 'completed' WHERE id = ?",
      [persistedUrl, buildingId]
    );

    if (onProgress) onProgress(100);
    console.log(`[BuildingImageGen] 建筑图片生成完成: buildingId=${buildingId}`);

    return {
      imageUrl: persistedUrl,
      buildingId
    };
  } catch (err) {
    // 标记失败
    await execute(
      "UPDATE buildings SET generation_status = 'failed' WHERE id = ?",
      [buildingId]
    ).catch(() => {});
    throw err;
  }
}

module.exports = handleBuildingImageGeneration;
