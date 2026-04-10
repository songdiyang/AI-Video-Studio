/**
 * 道具生成处理器
 * 
 * 两步流程：
 *   1. handlePropPromptGeneration - 调用文本模型生成道具描述提示词
 *   2. handlePropImageGeneration - 调用图像模型生成道具图片
 * 
 * 输出：
 *   - prompt: 生成的英文提示词
 *   - imageUrl: 道具图片URL
 */

const handleBaseTextModelCall = require('../base/baseTextModelCall');
const handleBaseImageModelCall = require('../base/imageGeneration');

// 道具提示词生成模板
const PROP_PROMPT_TEMPLATE = `你是一个专业的道具设计师，根据以下信息生成道具的详细英文描述，用于AI图像生成。

【道具信息】
道具名称：{propName}
道具描述：{propDescription}
道具分类：{propCategory}

【样式配置】
{styleConfig}

【输出要求】
生成一段适合 AI 图像生成的英文提示词，描述这个道具的外观细节。

必须包含以下方面：
1. 主体描述：道具的基本形态和用途
2. 材质纹理：材料质感（如金属光泽、木质纹理、塑料质感等）
3. 颜色配色：主色调和辅助色
4. 细节特征：独特的设计元素或装饰
5. 光影表现：反光、阴影、透明度等
6. 拍摄风格：产品摄影风格，白色/简洁背景，专业打光

【格式要求】
- 直接输出英文提示词，不要包含任何解释
- 使用逗号分隔的短语
- 包含以下固定后缀：product photography, studio lighting, white background, high detail, 8k quality

【示例输出】
A vintage brass pocket watch, intricate Roman numerals on ivory dial, ornate engravings on the case, warm golden patina, mechanical gears visible through glass back, soft reflective surface, product photography, studio lighting, white background, high detail, 8k quality`;

/**
 * 格式化样式配置为可读文本
 */
function formatStyleConfig(config) {
  if (!config || typeof config !== 'object') {
    return '无特殊样式要求';
  }

  const styleLabels = {
    material: '材质',
    primaryColor: '主色调',
    secondaryColor: '辅助色',
    texture: '纹理',
    size: '尺寸',
    condition: '状态',
    style: '风格',
    era: '年代',
    details: '细节'
  };

  const parts = [];
  for (const [key, value] of Object.entries(config)) {
    if (value && styleLabels[key]) {
      parts.push(`${styleLabels[key]}：${value}`);
    }
  }

  return parts.length > 0 ? parts.join('\n') : '无特殊样式要求';
}

/**
 * 步骤1：生成道具描述提示词
 * 
 * @param {Object} inputParams
 * @param {number} inputParams.propId - 道具ID
 * @param {string} inputParams.propName - 道具名称
 * @param {string} inputParams.propDescription - 道具描述
 * @param {string} inputParams.propCategory - 道具分类
 * @param {Object} inputParams.propStyleConfig - 样式配置
 * @param {string} inputParams.textModel - 文本模型名称
 * @param {function} onProgress - 进度回调
 * @returns {Promise<{prompt: string}>}
 */
async function handlePropPromptGeneration(inputParams, onProgress) {
  const {
    propId,
    propName,
    propDescription,
    propCategory,
    propStyleConfig,
    textModel
  } = inputParams;

  if (!propName) {
    throw new Error('道具名称不能为空');
  }

  if (!textModel) {
    throw new Error('textModel 参数是必需的');
  }

  console.log('[PropGen] 开始生成道具提示词:', propName);

  // 构建提示词
  const prompt = PROP_PROMPT_TEMPLATE
    .replace('{propName}', propName || '')
    .replace('{propDescription}', propDescription || '无详细描述')
    .replace('{propCategory}', propCategory || '通用道具')
    .replace('{styleConfig}', formatStyleConfig(propStyleConfig));

  if (onProgress) onProgress(10);

  // 调用文本模型
  const result = await handleBaseTextModelCall({
    prompt,
    textModel,
    maxTokens: 1024,
    temperature: 0.7
  }, (p) => onProgress && onProgress(10 + p * 0.8));

  if (onProgress) onProgress(100);

  // 提取生成的提示词（去掉可能的引号和多余空白）
  let generatedPrompt = result.content.trim();
  
  // 如果模型返回了带引号的内容，去除引号
  if (generatedPrompt.startsWith('"') && generatedPrompt.endsWith('"')) {
    generatedPrompt = generatedPrompt.slice(1, -1);
  }
  if (generatedPrompt.startsWith("'") && generatedPrompt.endsWith("'")) {
    generatedPrompt = generatedPrompt.slice(1, -1);
  }

  console.log('[PropGen] 提示词生成完成:', generatedPrompt.substring(0, 100) + '...');

  return {
    prompt: generatedPrompt,
    propId,
    propName,
    tokens: result.tokens || 0
  };
}

/**
 * 步骤2：生成道具图片
 * 
 * @param {Object} inputParams
 * @param {number} inputParams.propId - 道具ID
 * @param {string} inputParams.imageModel - 图像模型名称
 * @param {string} inputParams.aspectRatio - 画面比例
 * @param {function} onProgress - 进度回调
 * @returns {Promise<{imageUrl: string}>}
 */
async function handlePropImageGeneration(inputParams, onProgress) {
  const {
    propId,
    imageModel,
    aspectRatio = '1:1',  // 道具图默认正方形
    prompt  // 从上一步骤获取
  } = inputParams;

  if (!imageModel) {
    throw new Error('imageModel 参数是必需的');
  }

  if (!prompt) {
    throw new Error('prompt 参数是必需的（应由上一步骤提供）');
  }

  console.log('[PropGen] 开始生成道具图片, propId:', propId);

  if (onProgress) onProgress(10);

  // 调用图像模型
  const result = await handleBaseImageModelCall({
    prompt,
    imageModel,
    aspectRatio,
    width: 1024,
    height: 1024
  }, (p) => onProgress && onProgress(10 + p * 0.8));

  if (onProgress) onProgress(100);

  const imageUrl = result.imageUrl || result.url || result.image_url;

  if (!imageUrl) {
    throw new Error('图像模型未返回有效的图片URL');
  }

  console.log('[PropGen] 道具图片生成完成:', imageUrl);

  return {
    imageUrl,
    propId,
    prompt
  };
}

module.exports = {
  handlePropPromptGeneration,
  handlePropImageGeneration
};
