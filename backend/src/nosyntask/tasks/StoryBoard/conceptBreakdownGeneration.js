/**
 * 角色概念分解图生成任务
 * 生成角色的全景式深度概念分解图
 * 
 * input: {
 *   characterId: number,
 *   characterName: string,
 *   appearance: string,
 *   personality: string,
 *   description: string,
 *   style: string,
 *   imageModel: string,
 *   textModel: string,
 *   frontViewUrl: string (可选，已有三视图时传入作为参考)
 *   sideViewUrl: string (可选)
 *   backViewUrl: string (可选)
 * }
 * 
 * output: {
 *   conceptImageUrl: string,
 *   conceptPrompt: string
 * }
 */

const handleImageGeneration = require('../base/imageGeneration');
const handleBaseTextModelCall = require('../base/baseTextModelCall');
const { execute, queryOne } = require('../../../dbHelper');
const { requireVisualStyle } = require('../../../utils/getProjectStyle');
const { downloadAndStore } = require('../../../utils/fileStorage');
const { assertUpdated, assertPersistedFields } = require('./persistenceGuard');

/**
 * 生成概念分解图的提示词
 */
async function generateConceptPrompt(characterName, appearance, description, style, textModel) {
  console.log('[ConceptBreakdown] 使用 AI 生成概念分解图提示词...');

  const fullPrompt = `你是一个专业的角色概念设计图提示词专家。你的任务是生成一张全景式角色深度概念分解图（Character Concept Breakdown Sheet）的提示词。

核心要求（必须严格遵守）：
1. 提示词必须用英文输出，逗号分隔的关键词格式
2. 图片比例为 16:9 横向构图
3. 画面布局要求：
   - 中心位置放置角色的全身立绘作为视觉锚点（占画面约40%高度）
   - 在中心立绘周围环绕展示以下元素：
     a. 服装分层拆解（外衣、内衬、配饰等分离展示）
     b. 不同表情（2-3个表情特写）
     c. 核心道具/武器（如有）
     d. 材质特写（服装面料、饰品材质等）
     e. 随身物品
   - 使用手绘风格的箭头或引导线将周边的拆解物品与中心人物的对应部位连接
   - 对角色服装进行拆分展示，并在每个拆解部件旁标注中文说明
4. 必须包含：character concept sheet, character breakdown, outfit breakdown, expression sheet, item showcase, annotation arrows, design reference sheet, white background, clean layout
5. 长度控制在 120-200 个单词
6. 绝对不要加入任何场景背景元素，保持纯白背景

---

请为以下角色生成概念分解图的提示词：

角色名称：${characterName || '未命名角色'}
外貌特征：${appearance || '无'}
角色描述：${description || '无'}
风格要求：${style || '动漫风格'}

请直接输出英文提示词，不要包含任何解释。`;

  const response = await handleBaseTextModelCall({
    prompt: fullPrompt,
    textModel: textModel,
    maxTokens: 2048,
    temperature: 0.7
  });

  let prompt = '';
  if (typeof response === 'string') {
    prompt = response;
  } else if (response && response.content) {
    prompt = response.content;
  } else if (response && response.text) {
    prompt = response.text;
  } else if (response && response.message) {
    prompt = response.message;
  }

  if (!prompt) {
    throw new Error(`AI 响应中没有内容。响应类型: ${typeof response}`);
  }

  // 清理提示词
  prompt = String(prompt)
    .replace(/^["']|["']$/g, '')
    .replace(/\n+/g, ', ')
    .replace(/,\s*,/g, ',')
    .trim();

  console.log('[ConceptBreakdown] ✅ 概念分解图提示词生成完成:', prompt.substring(0, 100) + '...');

  return prompt;
}

/**
 * 主处理函数
 */
async function handleConceptBreakdownGeneration(inputParams, onProgress) {
  const {
    characterId,
    characterName,
    appearance = '',
    personality = '',
    description = '',
    style: inputStyle = '动漫风格',
    projectId,
    imageModel,
    textModel,
    frontViewUrl,
    sideViewUrl,
    backViewUrl
  } = inputParams;

  try {
  // 项目视觉风格
  const style = await requireVisualStyle(projectId);

  console.log('[ConceptBreakdown] 开始生成概念分解图:', {
    characterId,
    characterName,
    imageModel,
    textModel,
    style: style.substring(0, 60),
    hasFrontView: !!frontViewUrl,
    hasSideView: !!sideViewUrl,
    hasBackView: !!backViewUrl
  });

  if (!imageModel) {
    throw new Error('imageModel 参数是必需的');
  }

  if (onProgress) onProgress(5);

  // 生成提示词
  const conceptPrompt = await generateConceptPrompt(characterName, appearance, description, style, textModel);

  if (onProgress) onProgress(30);

  // 收集参考图（已有三视图时传入，保持一致性）
  const referenceUrls = [];
  if (frontViewUrl) referenceUrls.push(frontViewUrl);
  if (sideViewUrl) referenceUrls.push(sideViewUrl);
  if (backViewUrl) referenceUrls.push(backViewUrl);

  // 生成图片 - 16:9 比例
  const genParams = {
    prompt: conceptPrompt,
    imageModel: imageModel,
    width: 1920,
    height: 1088  // 约 16:9
  };

  if (referenceUrls.length > 0) {
    genParams.imageUrls = referenceUrls;
    console.log('[ConceptBreakdown] 参考图:', referenceUrls.length, '张');
  }

  const result = await handleImageGeneration(genParams, (progress) => {
    if (onProgress) onProgress(30 + progress * 0.5);
  });

  const conceptImageUrl = result.image_url;
  console.log('[ConceptBreakdown] ✅ 概念分解图生成完成');

  if (onProgress) onProgress(85);

  // 持久化到 MinIO
  const persistedUrl = await downloadAndStore(
    conceptImageUrl,
    `images/characters/${characterId}/concept_breakdown`,
    { fallbackExt: '.png' }
  );

  if (onProgress) onProgress(92);

  // 保存到数据库
  if (characterId && persistedUrl) {
    const updateResult = await execute(
      'UPDATE characters SET concept_image_url = ?, concept_generation_status = \'completed\', updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      [persistedUrl, characterId]
    );
    assertUpdated(updateResult, '[ConceptBreakdown] 概念分解图');
    console.log('[ConceptBreakdown] ✅ 概念分解图已保存到数据库');
  }

  if (onProgress) onProgress(100);

  const finalResult = {
    conceptImageUrl: persistedUrl,
    conceptPrompt,
    imageModel,
    textModel
  };

  console.log('[ConceptBreakdown] ✅ 概念分解图任务完成');

  return finalResult;

  } catch (error) {
    // 生成失败时更新状态
    if (characterId) {
      try {
        await execute(
          'UPDATE characters SET concept_generation_status = \'failed\', updated_at = CURRENT_TIMESTAMP WHERE id = ?',
          [characterId]
        );
      } catch (dbErr) {
        console.error('[ConceptBreakdown] 更新失败状态异常:', dbErr.message);
      }
    }
    throw error;
  }
}

module.exports = handleConceptBreakdownGeneration;
