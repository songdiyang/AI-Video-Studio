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
const { execute, queryOne } = require('../../../dbHelper');
const { requireVisualStyle } = require('../../../utils/getProjectStyle');
const { downloadAndStore, uploadBuffer } = require('../../../utils/fileStorage');
const { assertUpdated, assertPersistedFields } = require('./persistenceGuard');
const composeCharacterSheet = require('../../../utils/composeCharacterSheet');

// 白膜模式：基础人体形态提示词（不包含任何服装/装饰/装备）
const BASE_MODEL_BODY = {
  male: 'nude male body, bare skin, no clothing, no accessories, no equipment, anatomical reference, clean body silhouette, natural skin tone, muscular anatomy visible',
  female: 'nude female body, bare skin, no clothing, no accessories, no equipment, anatomical reference, clean body silhouette, natural skin tone, body anatomy visible',
  unknown: 'nude body, bare skin, no clothing, no accessories, no equipment, anatomical reference, clean body silhouette, natural skin tone'
};

/**
 * 使用 AI 生成视图提示词
 * @param {string} view - 视图类型: front, side, back
 * @param {string} characterName - 角色名称
 * @param {string} appearance - 外貌特征
 * @param {string} description - 描述
 * @param {string} style - 风格
 * @param {string} textModel - 文本模型
 * @param {object} options - 额外选项
 * @param {boolean} options.isBaseModel - 是否为白膜模式
 * @param {string} options.gender - 性别: male, female, unknown
 * @param {string} options.outfit - 服装描述（状态级别）
 * @param {string} options.hairstyle - 发型描述（状态级别）
 * @param {string} options.accessories - 配饰描述（状态级别）
 * @param {string} options.ageStage - 年龄阶段（状态级别）
 */
async function generateViewPrompt(view, characterName, appearance, description, style, textModel, options = {}) {
  const { isBaseModel = false, gender = 'unknown', outfit, hairstyle, accessories, ageStage } = options;
  
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
  
  // 白膜模式下的基础人体形态提示词
  const baseModelBodyPrompt = isBaseModel ? BASE_MODEL_BODY[gender] || BASE_MODEL_BODY.unknown : '';
  const baseModelNote = isBaseModel 
    ? `\n\n【白膜模式 - 基础人体形态】此角色正在生成基础白膜版本，要求生成纯粹的人体基础形态：
- 身体描述必须为：${baseModelBodyPrompt}
- 绝对不能包含任何服装（衣服、裤子、裙子、鞋子等）
- 绝对不能包含任何装饰品（首饰、帽子、眼镜、发饰等）
- 绝对不能包含任何装备（武器、背包、道具等）
- 保留角色的面部特征（脸型、眼睛、鼻子、嘴巴等）和发型发色
- 保留角色的体型比例（身高、体型、肤色等）
- 只展示人体的基本结构、肌肉轮廓和皮肤
- 此基础形态将作为后续添加服装和装饰的基础参考`
    : '';

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

  // 组装完整的外貌描述：基础外貌 + 状态级别属性（服装/发型/配饰/年龄阶段）
  const stateAppearanceParts = [];
  if (ageStage) stateAppearanceParts.push(`年龄阶段: ${ageStage}`);
  if (outfit) stateAppearanceParts.push(`服装: ${outfit}`);
  if (hairstyle) stateAppearanceParts.push(`发型: ${hairstyle}`);
  if (accessories) stateAppearanceParts.push(`配饰: ${accessories}`);
  const composedAppearance = stateAppearanceParts.length > 0
    ? `${appearance || ''}${appearance ? '；' : ''}${stateAppearanceParts.join('；')}`
    : appearance;

  const clothingRule = isBaseModel
    ? `4. 【白膜模式】角色必须是裸体基础形态，不能包含任何服装、装饰品或装备。只描述人体的基本结构（肤色、体型、肌肉轮廓）和面部/头发特征。必须包含: ${baseModelBodyPrompt}`
    : '4. 必须包含角色的完整外貌特征（服装、发型、体型、配饰、肤色等），越详细越好。每一个服装细节都必须逐项写出：衣服的款式、颜色、材质、层次（内衣/外衣/披风/盔甲等）、领口样式、袖口样式、腰带、鞋子等';

  const fullPrompt = `你是一个专业的角色设计图提示词专家。你的任务是生成用于 AI 绘图的单个角色参考图提示词。

核心要求（必须严格遵守）：
1. 提示词必须用英文输出，逗号分隔的关键词格式
2. 【最重要】画面中只能有一个角色，绝对不能出现多个人物、多个角度、多个姿势。禁止使用 "character sheet"、"reference sheet"、"turnaround"、"multiple views"、"multiple poses" 等会导致多人物的关键词
3. 必须包含：single character, solo, one person, pure white background, solid white background, full body, standing pose, even soft lighting
${clothingRule}
5. 绝对不要加入任何场景、背景元素、故事情节、地面阴影、其他人物
6. 保持中性自然表情，不要加入夸张情绪
7. 长度控制在 80-150 个单词${consistencyBlock}

---

请为以下角色生成「${cfg.desc}」的提示词（画面中只有这一个角色）：

角色名称：${characterName || '未命名角色'}
外貌特征：${composedAppearance || '无'}
角色描述：${description || '无'}
风格要求：${style || '动漫风格'}
视角要求：${cfg.angle}, ${cfg.pose}
${isNonFront ? '\n【再次强调】提示词中必须完整重复上面的「外貌特征」中的每一个细节（发型、发色、服装款式、服装细节、配饰等），只是视角从正面变为' + cfg.desc + '。不要省略任何外貌描述，不要自行想象或修改任何服装/发型细节。' : ''}${baseModelNote}
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
    height = 2880,
    regenerateOnly,   // 可选：补全模式，如 ['side', 'back']
    isBaseModel = false,  // 白膜模式
    gender = 'unknown',   // 性别：male, female, unknown
    // 状态级别外貌属性
    stateId = null,       // 角色状态 ID（为状态生成时传入）
    outfit = '',          // 服装描述
    hairstyle = '',       // 发型描述
    accessories = '',     // 配饰描述
    ageStage = ''         // 年龄阶段
  } = inputParams;


  // 项目视觉风格（必填，未设置则报错）
  const style = await requireVisualStyle(projectId);

  // 查询数据库中已有的三视图 URL，用于补全模式
  let existingViews = { front_view_url: null, side_view_url: null, back_view_url: null };
  if (stateId) {
    // 状态级别：从 character_states 表读取
    const row = await queryOne(
      'SELECT front_view_url, side_view_url, back_view_url FROM character_states WHERE id = ?',
      [stateId]
    );
    if (row) existingViews = row;
  } else if (characterId) {
    // 角色级别：从 characters 表读取
    const row = await queryOne(
      'SELECT front_view_url, side_view_url, back_view_url FROM characters WHERE id = ?',
      [characterId]
    );
    if (row) existingViews = row;
  }

  // 判断每个视图是否需要生成
  const needsGeneration = (viewType) => {
    // 如果指定了 regenerateOnly，只生成列表中的
    if (Array.isArray(regenerateOnly) && regenerateOnly.length > 0) {
      return regenerateOnly.includes(viewType);
    }
    // 否则生成所有缺失的
    const urlMap = { front: 'front_view_url', side: 'side_view_url', back: 'back_view_url' };
    return !existingViews[urlMap[viewType]];
  };

  const needFront = needsGeneration('front');
  const needSide = needsGeneration('side');
  const needBack = needsGeneration('back');

  console.log('[CharacterViews] 开始生成三视图:', {
    characterId,
    characterName,
    stateId: stateId || 'N/A',
    imageModel,
    textModel,
    aspectRatio: aspectRatio || null,
    width,
    height,
    style: style.substring(0, 60) + (style.length > 60 ? '...' : ''),
    regenerateOnly: regenerateOnly || 'all',
    needFront, needSide, needBack,
    existingFront: !!existingViews.front_view_url,
    existingSide: !!existingViews.side_view_url,
    existingBack: !!existingViews.back_view_url,
    isBaseModel,
    gender,
    outfit: outfit || 'N/A',
    hairstyle: hairstyle || 'N/A',
    ageStage: ageStage || 'N/A'
  });

  if (!imageModel) {
    throw new Error('imageModel 参数是必需的');
  }

  console.log('[CharacterViews] 使用的模型:', {
    imageModel,
    textModel
  });

  if (onProgress) onProgress(5);

  // 判断写入目标：状态级别 vs 角色级别
  const isStateGeneration = !!stateId;
  const targetTable = isStateGeneration ? 'character_states' : 'characters';
  const targetId = isStateGeneration ? stateId : characterId;
  const storageBase = isStateGeneration
    ? `images/characters/${characterId}/states/${stateId}`
    : `images/characters/${characterId}`;

  console.log(`[CharacterViews] 生成模式: ${isStateGeneration ? '状态级别(stateId=' + stateId + ')' : '角色级别'}`);

  // === 正面视图 ===
  let persistedFrontUrl = existingViews.front_view_url || null;
  let lastGeneratedPrompt = ''; // 记录最新的英文提示词，用于存储到 generation_prompt
  if (needFront) {
    console.log('[CharacterViews] 生成正面视图...');
    const frontPrompt = await generateViewPrompt('front', characterName, appearance, description, style, textModel, { isBaseModel, gender, outfit, hairstyle, accessories, ageStage });
    lastGeneratedPrompt = frontPrompt; // 保存英文提示词
    const frontResult = await handleImageGeneration({
      prompt: frontPrompt,
      imageModel: imageModel,
      aspectRatio,
      width,
      height
    }, (progress) => {
      if (onProgress) onProgress(5 + progress * 0.2);
    });
    const frontViewUrl = frontResult.image_url;
    console.log('[CharacterViews] ✅ 正面视图生成完成');

    persistedFrontUrl = await downloadAndStore(
      frontViewUrl,
      `${storageBase}/front_view`,
      { fallbackExt: '.png' }
    );

    if (targetId && persistedFrontUrl) {
      const updateResult = await execute(
        `UPDATE ${targetTable} SET front_view_url = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
        [persistedFrontUrl, targetId]
      );
      assertUpdated(updateResult, '[CharacterViews] 正面视图');
      await assertPersistedFields({
        table: targetTable,
        id: targetId,
        fields: ['front_view_url'],
        label: '[CharacterViews] 正面视图'
      });
      console.log(`[CharacterViews] ✅ 正面视图已保存到 ${targetTable}`);
    }
  } else {
    console.log('[CharacterViews] ✅ 正面视图已存在，跳过生成');
  }

  if (onProgress) onProgress(30);

  // 收集参考图片 URL（用于保持角色一致性）
  const referenceUrls = [];
  if (persistedFrontUrl) {
    referenceUrls.push(persistedFrontUrl);
    console.log('[CharacterViews] 正面视图将作为参考图传递给后续生成');
  }

  // === 侧面视图 ===
  let persistedSideUrl = existingViews.side_view_url || null;
  if (needSide) {
    console.log('[CharacterViews] 生成侧面视图...');
    const sidePrompt = await generateViewPrompt('side', characterName, appearance, description, style, textModel, { isBaseModel, gender, outfit, hairstyle, accessories, ageStage });
    const sideGenParams = {
      prompt: sidePrompt,
      imageModel: imageModel,
      aspectRatio,
      width,
      height
    };
    if (referenceUrls.length > 0) {
      sideGenParams.imageUrls = referenceUrls;
      console.log('[CharacterViews] 侧面视图参考图:', referenceUrls);
    }
    const sideResult = await handleImageGeneration(sideGenParams, (progress) => {
      if (onProgress) onProgress(30 + progress * 0.25);
    });
    const sideViewUrl = sideResult.image_url;
    console.log('[CharacterViews] ✅ 侧面视图生成完成');

    persistedSideUrl = await downloadAndStore(
      sideViewUrl,
      `${storageBase}/side_view`,
      { fallbackExt: '.png' }
    );

    if (targetId && persistedSideUrl) {
      const updateResult = await execute(
        `UPDATE ${targetTable} SET side_view_url = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
        [persistedSideUrl, targetId]
      );
      assertUpdated(updateResult, '[CharacterViews] 侧面视图');
      await assertPersistedFields({
        table: targetTable,
        id: targetId,
        fields: ['side_view_url'],
        label: '[CharacterViews] 侧面视图'
      });
      console.log(`[CharacterViews] ✅ 侧面视图已保存到 ${targetTable}`);
    }
  } else {
    console.log('[CharacterViews] ✅ 侧面视图已存在，跳过生成');
  }

  if (onProgress) onProgress(60);

  // 累加侧面视图到参考图
  if (persistedSideUrl) {
    referenceUrls.push(persistedSideUrl);
  }

  // === 背面视图 ===
  let persistedBackUrl = existingViews.back_view_url || null;
  if (needBack) {
    console.log('[CharacterViews] 生成背面视图...');
    const backPrompt = await generateViewPrompt('back', characterName, appearance, description, style, textModel, { isBaseModel, gender, outfit, hairstyle, accessories, ageStage });
    const backGenParams = {
      prompt: backPrompt,
      imageModel: imageModel,
      aspectRatio,
      width,
      height
    };
    if (referenceUrls.length > 0) {
      backGenParams.imageUrls = referenceUrls;
      console.log('[CharacterViews] 背面视图参考图:', referenceUrls);
    }
    const backResult = await handleImageGeneration(backGenParams, (progress) => {
      if (onProgress) onProgress(60 + progress * 0.25);
    });
    const backViewUrl = backResult.image_url;
    console.log('[CharacterViews] ✅ 背面视图生成完成');

    persistedBackUrl = await downloadAndStore(
      backViewUrl,
      `${storageBase}/back_view`,
      { fallbackExt: '.png' }
    );

    if (targetId && persistedBackUrl) {
      const updateResult = await execute(
        `UPDATE ${targetTable} SET back_view_url = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
        [persistedBackUrl, targetId]
      );
      assertUpdated(updateResult, '[CharacterViews] 背面视图');
      await assertPersistedFields({
        table: targetTable,
        id: targetId,
        fields: ['back_view_url'],
        label: '[CharacterViews] 背面视图'
      });
      console.log(`[CharacterViews] ✅ 背面视图已保存到 ${targetTable}`);
    }
  } else {
    console.log('[CharacterViews] ✅ 背面视图已存在，跳过生成');
  }

  if (onProgress) onProgress(85);

  // === 合成角色设定图 ===
  let characterSheetUrl = null;
  try {
    console.log('[CharacterViews] 开始合成角色设定图...');
    const composedAppearance = [appearance, outfit ? `服装: ${outfit}` : '', hairstyle ? `发型: ${hairstyle}` : '', accessories ? `配饰: ${accessories}` : '', ageStage ? `年龄: ${ageStage}` : ''].filter(Boolean).join('；');
    const sheetBuffer = await composeCharacterSheet({
      frontViewUrl: persistedFrontUrl,
      sideViewUrl: persistedSideUrl,
      backViewUrl: persistedBackUrl,
      characterName,
      appearance: composedAppearance || appearance,
      personality,
      description,
      style
    });

    // 上传到 MinIO
    const sheetObjectPath = `${storageBase}/character_sheet.png`;
    characterSheetUrl = await uploadBuffer(sheetBuffer, sheetObjectPath, { contentType: 'image/png' });
    console.log('[CharacterViews] ✅ 角色设定图已上传:', characterSheetUrl);

    // 更新数据库 - 仅角色级别保存 character_sheet_url
    if (!isStateGeneration && characterId && characterSheetUrl) {
      await execute(
        'UPDATE characters SET character_sheet_url = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
        [characterSheetUrl, characterId]
      );
      console.log('[CharacterViews] ✅ 角色设定图 URL 已保存到数据库');
    }
  } catch (sheetErr) {
    // 合成失败不影响三视图的正常流程
    console.error('[CharacterViews] ⚠️ 角色设定图合成失败（不影响三视图）:', sheetErr.message);
  }

  if (onProgress) onProgress(92);

  // 标记生成完成
  if (isStateGeneration) {
    // 状态级别：更新 character_states 的 generation_status 和 image_url
    if (stateId && persistedFrontUrl) {
      const currentState = await queryOne('SELECT image_url FROM character_states WHERE id = ?', [stateId]);
      const shouldUpdateImageUrl = !currentState?.image_url || needFront;
      const updateSql = shouldUpdateImageUrl
        ? `UPDATE character_states SET image_url = ?, generation_status = 'completed', generation_prompt = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`
        : `UPDATE character_states SET generation_status = 'completed', generation_prompt = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`;
      const updateParams = shouldUpdateImageUrl
        ? [persistedFrontUrl, lastGeneratedPrompt || composedAppearance || '', stateId]
        : [lastGeneratedPrompt || composedAppearance || '', stateId];

      const updateResult = await execute(updateSql, updateParams);
      assertUpdated(updateResult, '[CharacterViews] 状态主图');
      console.log('[CharacterViews] ✅ 状态三视图生成完成，generation_status=completed');
    } else if (stateId) {
      await execute(
        `UPDATE character_states SET generation_status = 'completed', updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
        [stateId]
      );
    }
  } else {
    // 角色级别：更新 characters 的 generation_status
    if (characterId && persistedFrontUrl) {
      const currentChar = await queryOne('SELECT image_url FROM characters WHERE id = ?', [characterId]);
      const shouldUpdateImageUrl = !currentChar?.image_url || needFront;
      
      const updateSql = shouldUpdateImageUrl
        ? `UPDATE characters SET image_url = ?, generation_status = 'completed', updated_at = CURRENT_TIMESTAMP WHERE id = ?`
        : `UPDATE characters SET generation_status = 'completed', updated_at = CURRENT_TIMESTAMP WHERE id = ?`;
      const updateParams = shouldUpdateImageUrl
        ? [persistedFrontUrl, characterId]
        : [characterId];

      const updateResult = await execute(updateSql, updateParams);
      assertUpdated(updateResult, '[CharacterViews] 主图');
      if (shouldUpdateImageUrl) {
        await assertPersistedFields({
          table: 'characters',
          id: characterId,
          fields: ['image_url'],
          label: '[CharacterViews] 主图'
        });
        console.log('[CharacterViews] ✅ 正面视图已保存为主图片 (image_url)');
      } else {
        console.log('[CharacterViews] ✅ 保留现有主图片，仅更新生成状态');
      }
    }
  }

  if (onProgress) onProgress(95);

  if (onProgress) onProgress(100);

  const finalResult = {
    frontViewUrl: persistedFrontUrl,
    sideViewUrl: persistedSideUrl,
    backViewUrl: persistedBackUrl,
    imageUrl: persistedFrontUrl, // 主图片使用正面视图
    characterSheetUrl: characterSheetUrl,
    imageModel,
    textModel,
    aspectRatio: aspectRatio || null,
    stateId: stateId || null,
    isStateGeneration
  };

  console.log('[CharacterViews] ✅ 三视图生成完成');

  return finalResult;
}

module.exports = handleCharacterViewsGeneration;
