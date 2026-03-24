/**
 * 角色三视图生成任务
 * 生成角色的正面、侧面、背面三视图
 * 
 * input: {
 *   characterId: number,
 *   characterName: string,
 *   appearance: string,
 *   personality: string,
 *   description: string,
 *   style: string,
 *   imageModel: string,
 *   aspectRatio: string
 * }
 * 
 * output: {
 *   frontViewUrl: string,
 *   sideViewUrl: string,
 *   backViewUrl: string,
 *   imageUrl: string (same as frontViewUrl)
 * }
 */

const handleImageGeneration = require('../base/imageGeneration');
const handleBaseTextModelCall = require('../base/baseTextModelCall');
const { execute } = require('../../../dbHelper');
const { requireVisualStyle } = require('../../../utils/getProjectStyle');
const { downloadAndStore } = require('../../../utils/fileStorage');
const { assertUpdated, assertPersistedFields } = require('./persistenceGuard');

/**
 * 使用 AI 生成视图提示词
 */
async function generateViewPrompt(view, characterName, appearance, description, style, textModel) {
  const viewConfig = {
    front: {
      desc: '正面视图',
      pose: 'facing directly at the camera, standing upright with relaxed natural posture, arms at sides, feet shoulder-width apart, looking straight ahead, clear face and full body visible',
      angle: 'front view, eye-level shot'
    },
    side: {
      desc: '侧面视图',
      pose: 'turned 90 degrees to the right, standing upright, showing full side profile silhouette, arms naturally at sides',
      angle: 'side view, profile shot'
    },
    back: {
      desc: '背面视图',
      pose: 'facing completely away from the camera, standing upright, showing back of head, hair, and clothing details',
      angle: 'back view, rear shot'
    }
  };

  const cfg = viewConfig[view] || viewConfig.front;

  console.log(`[CharacterViews] 使用 AI 生成${cfg.desc}提示词...`);

  // 侧面/背面时强调与正面图严格一致
  const isNonFront = view !== 'front';
  const consistencyBlock = isNonFront
    ? `
8. 【最关键 - 一致性约束】这是与正面图同一角色的${cfg.desc}，你会收到正面图作为参考。以下每一项都必须与正面图完全一致，不得有任何改动：
   - 发型和发色：必须与正面图完全相同（如正面是短发/平头，${view === 'back' ? '背面也必须是短发/平头，绝对不能变成长发' : '侧面也必须是短发/平头'}）
   - 服装款式：必须与正面图完全相同（如正面穿战袍，${view === 'back' ? '背面也必须是同一件战袍' : '侧面也必须是同一件战袍'}，不能变成其他衣服）
   - 服装细节：袖子状态（挽起/放下）、领口、腰带、配饰等必须一致
   - 体型和肤色：必须一致
   - 提示词中必须逐项重复正面图的外貌特征描述，确保每个细节都被包含`
    : '';

  const fullPrompt = `你是一个专业的角色设计图提示词专家。你的任务是生成用于 AI 绘图的单个角色参考图提示词。

核心要求（必须严格遵守）：
1. 提示词必须用英文输出，逗号分隔的关键词格式
2. 【最重要】画面中只能有一个角色，绝对不能出现多个人物、多个角度、多个姿势。禁止使用 "character sheet"、"reference sheet"、"turnaround"、"multiple views"、"multiple poses" 等会导致多人物的关键词
3. 必须包含：single character, solo, one person, pure white background, solid white background, full body, standing pose, even soft lighting
4. 必须包含角色的完整外貌特征（服装、发型、体型、配饰、肤色等），越详细越好。每一个服装细节都必须逐项写出：衣服的款式、颜色、材质、层次（内衣/外衣/披风/盔甲等）、领口样式、袖口样式、腰带、鞋子等
5. 绝对不要加入任何场景、背景元素、故事情节、地面阴影、其他人物
6. 保持中性自然表情，不要加入夸张情绪
7. 长度控制在 80-150 个单词${consistencyBlock}

---

请为以下角色生成「${cfg.desc}」的提示词（画面中只有这一个角色）：

角色名称：${characterName || '未命名角色'}
外貌特征：${appearance || '无'}
角色描述：${description || '无'}
风格要求：${style || '动漫风格'}
视角要求：${cfg.angle}, ${cfg.pose}
${isNonFront ? '\n【再次强调】提示词中必须完整重复上面的「外貌特征」中的每一个细节（发型、发色、服装款式、服装细节、配饰等），只是视角从正面变为' + cfg.desc + '。不要省略任何外貌描述，不要自行想象或修改任何服装/发型细节。' : ''}
请直接输出英文提示词，不要包含任何解释。`;

  // 调用基础文本模型（侧面/背面降低 temperature 减少发挥空间，严格跟随正面特征）
  const response = await handleBaseTextModelCall({
    prompt: fullPrompt,
    textModel: textModel,
    maxTokens: 2048,
    temperature: isNonFront ? 0.3 : 0.7
  });

  console.log(`[CharacterViews] baseTextModelCall 响应:`, JSON.stringify(response).substring(0, 500));

  // 提取生成的提示词
  // 注意：response 可能是 { content: "..." } 或直接是字符串
  let prompt = '';
  
  if (typeof response === 'string') {
    prompt = response;
  } else if (response && response.content) {
    prompt = response.content;
  } else if (response && response.text) {
    prompt = response.text;
  } else if (response && response.message) {
    prompt = response.message;
  } else if (response && response.taskId) {
    // 如果返回的是 taskId，说明调用了错误的模型（图片模型而非文本模型）
    throw new Error(`错误：调用了图片生成模型而非文本模型。请检查模型配置。响应: ${JSON.stringify(response).substring(0, 200)}`);
  }
  
  if (!prompt) {
    console.error(`[CharacterViews] 无法提取提示词，完整响应:`, JSON.stringify(response));
    throw new Error(`AI 响应中没有内容。响应类型: ${typeof response}, 响应: ${JSON.stringify(response).substring(0, 200)}`);
  }

  // 清理提示词
  prompt = String(prompt)
    .replace(/^["']|["']$/g, '') // 移除首尾引号
    .replace(/\n+/g, ', ') // 将换行替换为逗号
    .replace(/,\s*,/g, ',') // 移除重复逗号
    .trim();

  console.log(`[CharacterViews] ✅ ${cfg.desc}提示词生成完成:`, prompt.substring(0, 100) + '...');

  return prompt;
}

/**
 * 主处理函数
 */
async function handleCharacterViewsGeneration(inputParams, onProgress) {
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
    aspectRatio,
    width = 1920,
    height = 2880
  } = inputParams;


  // 项目视觉风格（必填，未设置则报错）
  const style = await requireVisualStyle(projectId);

  console.log('[CharacterViews] 开始生成三视图:', {
    characterId,
    characterName,
    imageModel,
    textModel,
    aspectRatio: aspectRatio || null,
    width,
    height,
    style: style.substring(0, 60) + (style.length > 60 ? '...' : '')
  });

  console.log('[CharacterViews] 工作流输入参数:', {
    characterId,
    projectId,
    imageModel,
    textModel,
    aspectRatio: aspectRatio || null,
    width,
    height,
    hasAppearance: !!appearance,
    hasDescription: !!description
  });

  if (!imageModel) {
    throw new Error('imageModel 参数是必需的');
  }

  console.log('[CharacterViews] 使用的模型:', {
    imageModel,
    textModel
  });

  if (onProgress) onProgress(5);

  // 生成正面视图
  console.log('[CharacterViews] 生成正面视图...');
  const frontPrompt = await generateViewPrompt('front', characterName, appearance, description, style, textModel);
  const frontResult = await handleImageGeneration({
    prompt: frontPrompt,
    imageModel: imageModel,
    aspectRatio,
    width,
    height
  }, (progress) => {
    if (onProgress) onProgress(5 + progress * 0.2); // 5% -> 25%
  });
  const frontViewUrl = frontResult.image_url;
  console.log('[CharacterViews] ✅ 正面视图生成完成');

  // 持久化正面视图到 MinIO
  const persistedFrontUrl = await downloadAndStore(
    frontViewUrl,
    `images/characters/${characterId}/front_view`,
    { fallbackExt: '.png' }
  );

  // 立即保存正面视图到数据库
  if (characterId && persistedFrontUrl) {
    const updateResult = await execute(
      'UPDATE characters SET front_view_url = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      [persistedFrontUrl, characterId]
    );
    assertUpdated(updateResult, '[CharacterViews] 正面视图');
    await assertPersistedFields({
      table: 'characters',
      id: characterId,
      fields: ['front_view_url'],
      label: '[CharacterViews] 正面视图'
    });
    console.log('[CharacterViews] ✅ 正面视图已保存到数据库');
  }

  if (onProgress) onProgress(30);

  // 收集参考图片 URL（用于保持角色一致性）
  const referenceUrls = [];
  if (persistedFrontUrl) {
    referenceUrls.push(persistedFrontUrl);
    console.log('[CharacterViews] 正面视图将作为参考图传递给后续生成');
  }

  // 生成侧面视图（带正面参考图）
  console.log('[CharacterViews] 生成侧面视图...');
  const sidePrompt = await generateViewPrompt('side', characterName, appearance, description, style, textModel);
  const sideGenParams = {
    prompt: sidePrompt,
    imageModel: imageModel,
    aspectRatio,
    width,
    height
  };
  console.log('[CharacterViews] 侧面视图图片模型参数:', {
    imageModel,
    aspectRatio: aspectRatio || null,
    width,
    height,
    referenceCount: referenceUrls.length
  });
  if (referenceUrls.length > 0) {
    sideGenParams.imageUrls = referenceUrls;
    console.log('[CharacterViews] 侧面视图参考图:', referenceUrls);
  }
  const sideResult = await handleImageGeneration(sideGenParams, (progress) => {
    if (onProgress) onProgress(30 + progress * 0.25); // 30% -> 55%
  });
  const sideViewUrl = sideResult.image_url;
  console.log('[CharacterViews] ✅ 侧面视图生成完成');

  // 持久化侧面视图到 MinIO
  const persistedSideUrl = await downloadAndStore(
    sideViewUrl,
    `images/characters/${characterId}/side_view`,
    { fallbackExt: '.png' }
  );

  // 立即保存侧面视图到数据库
  if (characterId && persistedSideUrl) {
    const updateResult = await execute(
      'UPDATE characters SET side_view_url = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      [persistedSideUrl, characterId]
    );
    assertUpdated(updateResult, '[CharacterViews] 侧面视图');
    await assertPersistedFields({
      table: 'characters',
      id: characterId,
      fields: ['side_view_url'],
      label: '[CharacterViews] 侧面视图'
    });
    console.log('[CharacterViews] ✅ 侧面视图已保存到数据库');
  }

  if (onProgress) onProgress(60);

  // 累加侧面视图到参考图
  if (persistedSideUrl) {
    referenceUrls.push(persistedSideUrl);
  }

  // 生成背面视图（带正面+侧面参考图）
  console.log('[CharacterViews] 生成背面视图...');
  const backPrompt = await generateViewPrompt('back', characterName, appearance, description, style, textModel);
  const backGenParams = {
    prompt: backPrompt,
    imageModel: imageModel,
    aspectRatio,
    width,
    height
  };
  console.log('[CharacterViews] 背面视图图片模型参数:', {
    imageModel,
    aspectRatio: aspectRatio || null,
    width,
    height,
    referenceCount: referenceUrls.length
  });
  if (referenceUrls.length > 0) {
    backGenParams.imageUrls = referenceUrls;
    console.log('[CharacterViews] 背面视图参考图:', referenceUrls);
  }
  const backResult = await handleImageGeneration(backGenParams, (progress) => {
    if (onProgress) onProgress(60 + progress * 0.25); // 60% -> 85%
  });
  const backViewUrl = backResult.image_url;
  console.log('[CharacterViews] ✅ 背面视图生成完成');

  // 持久化背面视图到 MinIO
  const persistedBackUrl = await downloadAndStore(
    backViewUrl,
    `images/characters/${characterId}/back_view`,
    { fallbackExt: '.png' }
  );

  // 立即保存背面视图到数据库
  if (characterId && persistedBackUrl) {
    const updateResult = await execute(
      'UPDATE characters SET back_view_url = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      [persistedBackUrl, characterId]
    );
    assertUpdated(updateResult, '[CharacterViews] 背面视图');
    await assertPersistedFields({
      table: 'characters',
      id: characterId,
      fields: ['back_view_url'],
      label: '[CharacterViews] 背面视图'
    });
    console.log('[CharacterViews] ✅ 背面视图已保存到数据库');
  }

  if (onProgress) onProgress(90);

  // 将正面视图同时保存为主图片 (image_url)，并标记生成完成
  if (characterId && persistedFrontUrl) {
    const updateResult = await execute(
      `UPDATE characters 
       SET image_url = ?, generation_status = 'completed', updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [persistedFrontUrl, characterId]
    );
    assertUpdated(updateResult, '[CharacterViews] 主图');
    await assertPersistedFields({
      table: 'characters',
      id: characterId,
      fields: ['image_url'],
      label: '[CharacterViews] 主图'
    });
    console.log('[CharacterViews] ✅ 正面视图已保存为主图片 (image_url)');
  }

  if (onProgress) onProgress(95);

  if (onProgress) onProgress(100);

  const finalResult = {
    frontViewUrl: persistedFrontUrl,
    sideViewUrl: persistedSideUrl,
    backViewUrl: persistedBackUrl,
    imageUrl: persistedFrontUrl, // 主图片使用正面视图
    imageModel,
    textModel,
    aspectRatio: aspectRatio || null
  };

  console.log('[CharacterViews] ✅ 三视图生成完成');

  return finalResult;
}

module.exports = handleCharacterViewsGeneration;
