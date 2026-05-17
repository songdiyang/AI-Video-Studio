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
const { execute, queryOne, queryAll } = require('../../../dbHelper');
const { requireVisualStyle, getBodyProportion } = require('../../../utils/getProjectStyle');
const { downloadAndStore, uploadBuffer, resolveToInternalUrl } = require('../../../utils/fileStorage');
const { assertUpdated, assertPersistedFields } = require('./persistenceGuard');
const composeCharacterSheet = require('../../../utils/composeCharacterSheet');

/**
 * 有参考图时，构建简化提示词（让参考图主导角色外貌，提示词仅指定风格+视角）
 * 跳过 LLM 翻译，直接输出英文关键词，节省成本且避免文字描述与参考图冲突
 *
 * 当传入状态属性（outfit/hairstyle/accessories/ageStage）时：
 *   - 参考图一般是白膜设定图（裸熊 / 白色占位装），不能让 AI 原样复刻服装
 *   - 仅保留参考图的脸部、发色、体型、肤色等身份特征
 *   - 服装/发型/配饰必须按状态属性覆盖重绘
 * 否则保持原行为（完整复刻参考图）。
 */
function buildReferenceGuidedPrompt(view, style, characterName, options = {}) {
  const { outfit = '', hairstyle = '', accessories = '', ageStage = '', heldProps = '', hasCostumeRef = false } = options;
  const viewConfig = {
    front: 'front view, eye-level shot, facing directly at the camera, standing upright with relaxed natural posture, arms at sides, feet shoulder-width apart, looking straight ahead',
    side: 'side view, profile shot, turned 90 degrees to the right, full body, standing upright, showing full side profile silhouette, arms naturally at sides',
    back: 'back view, rear shot, facing completely away from the camera, standing upright, showing back of head, hair, and clothing details'
  };
  const viewAngle = viewConfig[view] || viewConfig.front;
  const styleKeywords = style || 'anime style';

  // 收集状态级别外貌属性（服装/发型/配饰/年龄阶段/手持道具）
  const stateAttrs = [];
  if (outfit) stateAttrs.push(`wearing ${outfit}`);
  if (hairstyle) stateAttrs.push(`hairstyle: ${hairstyle}`);
  if (accessories) stateAttrs.push(`accessories: ${accessories}`);
  if (ageStage) stateAttrs.push(`age stage: ${ageStage}`);
  if (heldProps) stateAttrs.push(`holding/carrying: ${heldProps}`);
  const hasStateAttrs = stateAttrs.length > 0;

  if (hasStateAttrs) {
    if (hasCostumeRef) {
      // ★ 有服装设定图参考：以服装图纸为主导，文字描述仅作为补充
      // 第一张参考图=白膜（身份锚），第二张参考图=服装设定图（服装锚）
      const supplementaryAttrs = [];
      if (hairstyle) supplementaryAttrs.push(`hairstyle: ${hairstyle}`);
      if (accessories) supplementaryAttrs.push(`accessories: ${accessories}`);
      if (ageStage) supplementaryAttrs.push(`age stage: ${ageStage}`);
      if (heldProps) supplementaryAttrs.push(`holding/carrying: ${heldProps}`);
      const supplementary = supplementaryAttrs.length > 0
        ? `, additional details: ${supplementaryAttrs.join(', ')}`
        : '';
      return `match the character face and body identity from the base model reference image exactly, preserve all facial features face shape eye shape eye color skin tone body proportions from base model reference, keep the same character identity, CRITICAL: the costume reference image shows the EXACT outfit this character must wear, copy the clothing design precisely including style silhouette color fabric texture pattern decoration details buttons collars sleeves pants shoes from the costume reference image, the costume reference is the PRIMARY authority for clothing${supplementary}, character design reference sheet style, ${styleKeywords}, single character, solo, one person, full body, ${viewAngle}, simple clean background, even soft lighting, neutral natural expression`;
    }
    // ★ 无服装设定图参考：参考图仅用于锁定身份，服装按文字描述生成
    const outfitEmphasis = outfit
      ? `, the character MUST clearly be wearing: ${outfit} (this overrides any clothing in the reference image)`
      : '';
    const hairEmphasis = hairstyle
      ? `, the hairstyle MUST be: ${hairstyle} (overrides hairstyle in the reference image)`
      : '';
    return `match the character face and body identity from the reference image exactly, preserve all facial features face shape eye shape eye color skin tone body proportions from reference image, keep the same character identity, IMPORTANT: the reference image is only a base model placeholder with plain white tank top and white shorts, do NOT copy the clothing from the reference image, instead apply the following state appearance: ${stateAttrs.join(', ')}${outfitEmphasis}${hairEmphasis}, character design reference sheet style, ${styleKeywords}, single character, solo, one person, full body, ${viewAngle}, simple clean background, even soft lighting, neutral natural expression`;
  }

  // 简化提示词：参考图匹配指令放最前面（Seedream 对前面的 token 给予更高权重）
  // 逐项列出需要保留的外貌特征，强化保真度
  return `match the character appearance in the reference image exactly, preserve all facial features face shape eye shape eye color hair style hair color skin tone body proportions from reference, keep identical clothing outfit style color fabric pattern accessories jewelry headwear footwear from reference image, character design reference sheet style, ${styleKeywords}, single character, solo, one person, full body, ${viewAngle}, simple clean background, even soft lighting, neutral natural expression`;
}

// 白膜模式：标准化基础着装提示词（白色背心 + 白色短裤，类似游戏建模 T-pose 白模）
// 目的：避免裸体（合规 + 模型质量），且统一中性着装以免干扰后续服装叠加判断
const BASE_MODEL_BODY = {
  male: 'male character wearing plain pure white sleeveless tank top and plain pure white short shorts, standardized base model outfit, no logos no patterns no text no prints, no accessories, no jewelry, no equipment, no footwear, bare arms and legs visible, clean body silhouette, natural skin tone, game engine base mesh style',
  female: 'female character wearing plain pure white sleeveless tank top and plain pure white short shorts, standardized base model outfit, no logos no patterns no text no prints, no accessories, no jewelry, no equipment, no footwear, bare arms and legs visible, clean body silhouette, natural skin tone, game engine base mesh style',
  unknown: 'character wearing plain pure white sleeveless tank top and plain pure white short shorts, standardized base model outfit, no logos no patterns no text no prints, no accessories, no jewelry, no equipment, no footwear, bare arms and legs visible, clean body silhouette, natural skin tone, game engine base mesh style'
};

/**
 * 白膜模式专用：有参考图时的提示词构建
 * 核心策略：
 *   1. 严格保留参考图的脸部特征和发型（最高优先级）
 *   2. 身体为裸体基础形态（BASE_MODEL_BODY）
 *   3. 注入用户填写的身体元素（纹身/疤痕/胎记等）
 * 与通用 buildReferenceGuidedPrompt 的区别：去掉了服装/配饰保留指令
 */
function buildBaseModelReferencePrompt(view, style, characterName, options = {}) {
  const { gender = 'unknown', bodyElements = '' } = options;
  const viewConfig = {
    front: 'front view, eye-level shot, facing directly at the camera, standing upright with relaxed natural posture, arms at sides, feet shoulder-width apart, looking straight ahead',
    side: 'side view, profile shot, turned 90 degrees to the right, full body, standing upright, showing full side profile silhouette, arms naturally at sides',
    back: 'back view, rear shot, facing completely away from the camera, standing upright, showing back of head and hair details'
  };
  const viewAngle = viewConfig[view] || viewConfig.front;
  const styleKeywords = style || 'anime style';
  const bodyPrompt = BASE_MODEL_BODY[gender] || BASE_MODEL_BODY.unknown;
  const bodyElementsPrompt = bodyElements
    ? `, body markings and features: ${bodyElements}`
    : '';

  // 脸部+发型严格保留 → 裸体基础形态 → 身体元素 → 视角+风格
  return `match the character face and hairstyle from the reference image exactly, preserve all facial features face shape eye shape eye color hair style hair color hair length from reference, keep identical face proportions jawline nose shape lip shape eyebrow shape from reference image, ${bodyPrompt}${bodyElementsPrompt}, character design reference sheet style, ${styleKeywords}, single character, solo, one person, full body, ${viewAngle}, simple clean background, even soft lighting, neutral natural expression`;
}

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
 * @param {string} options.bodyElements - 身体元素描述（纹身/疤痕/胎记等，白膜专用）
 * @param {string} options.heldProps - 手持/携带道具描述（状态级别，白膜不使用）
 */
async function generateViewPrompt(view, characterName, appearance, description, style, textModel, options = {}) {
  const { isBaseModel = false, gender = 'unknown', outfit, hairstyle, accessories, ageStage, bodyProportionInstruction, bodyElements, heldProps } = options;
  
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
  const bodyElementsNote = (isBaseModel && bodyElements)
    ? `\n- 【身体元素标记】角色身体上有以下永久性标记，必须在生成的图像中体现：${bodyElements}`
    : '';
  const baseModelNote = isBaseModel 
    ? `\n\n【白膜模式 - 标准化基础着装】此角色正在生成基础白膜版本，类似游戏建模里的 base mesh，穿着统一的标准化占位着装（白色背心 + 白色短裤），以便后续叠加服装和配饰：
- 身体描述必须为：${baseModelBodyPrompt}
- 必须穿着：纯白色无花纹无 logo 的贴身背心（无袖）+ 纯白色短裤，仅此两件
- 严禁穿着任何其他服装（裙子、外套、披风、长裤、裤装、盔甲、战袍等都不行）
- 严禁添加任何装饰品（首饰、帽子、眼镜、发饰、徽章等）
- 严禁添加任何装备（武器、背包、道具、腰带、挂件等）
- 严禁添加鞋子袜子，手臂和腿部必须裸露可见
- 保留角色的面部特征（脸型、眼睛、鼻子、嘴巴等）和发型发色
- 保留角色的体型比例（身高、体型、肤色等）
- 展示人体的基本结构、肌肉轮廓和皮肤${bodyElementsNote}
- 此基础形态将作为后续叠加服装和装饰的纯净基准参考`
    : '';

  // 侧面/背面时强调与正面图严格一致
  const isNonFront = view !== 'front';
  const consistencyBlock = isNonFront
    ? `
9. 【最关键 - 一致性约束】这是与正面图同一角色的${cfg.desc}，你会收到正面图作为参考。以下每一项都必须与正面图完全一致，不得有任何改动：
   - 发型和发色：必须与正面图完全相同（如正面是短发/平头，${view === 'back' ? '背面也必须是短发/平头，绝对不能变成长发' : '侧面也必须是短发/平头'}）
   - 服装款式：必须与正面图完全相同（如正面穿战袍，${view === 'back' ? '背面也必须是同一件战袍' : '侧面也必须是同一件战袍'}，不能变成其他衣服）
   - 服装细节：袖子状态（挽起/放下）、领口、腰带、配饰等必须一致
   - 体型和肤色：必须一致
   - 提示词中必须逐项重复正面图的外貌特征描述，确保每个细节都被包含`
    : '';

  // 组装完整的外貌描述：基础外貌 + 状态级别属性（服装/发型/配饰/年龄阶段/手持道具）
  // ★ 白膜模式：不叠加任何状态量（服装/发型/配饰/年龄/手持道具），白膜只表达永久体貌特征
  const stateAppearanceParts = [];
  if (!isBaseModel) {
    if (ageStage) stateAppearanceParts.push(`年龄阶段: ${ageStage}`);
    if (outfit) stateAppearanceParts.push(`服装: ${outfit}`);
    if (hairstyle) stateAppearanceParts.push(`发型: ${hairstyle}`);
    if (accessories) stateAppearanceParts.push(`配饰: ${accessories}`);
    if (heldProps) stateAppearanceParts.push(`手持道具: ${heldProps}`);
  }
  const composedAppearance = stateAppearanceParts.length > 0
    ? `${appearance || ''}${appearance ? '；' : ''}${stateAppearanceParts.join('；')}`
    : appearance;

  const clothingRule = isBaseModel
    ? `4. 【白膜模式】角色必须穿着统一的标准化白膜着装：纯白色无花纹贴身背心 + 纯白色短裤，类似游戏建模 base mesh。不能包含任何其他服装、装饰品、装备或鞋子。重点描述人体的基本结构（肤色、体型、肌肉轮廓）和面部/头发特征。必须包含: ${baseModelBodyPrompt}`
    : '4. 必须包含角色的完整外貌特征（服装、发型、体型、配饰、肤色等），越详细越好。每一个服装细节都必须逐项写出：衣服的款式、颜色、材质、层次（内衣/外衣/披风/盔甲等）、领口样式、袖口样式、腰带、鞋子等';

  const fullPrompt = `你是一个专业的角色设计图提示词专家。你的任务是生成用于 AI 绘图的单个角色参考图提示词。

核心要求（必须严格遵守）：
1. 提示词必须用英文输出，逗号分隔的关键词格式
2. 【最重要】画面中只能有一个角色，绝对不能出现多个人物、多个角度、多个姿势。禁止使用 "character sheet"、"reference sheet"、"turnaround"、"multiple views"、"multiple poses" 等会导致多人物的关键词
3. 必须包含：single character, solo, one person, simple clean background, full body, standing pose, even soft lighting
4. 【画风一致性 - 最关键】角色的绘制风格（线条画法、上色方式、光影表现、色彩处理、笔触质感）必须严格匹配下方「风格要求」。提示词的前几个关键词必须是风格描述词。例如：水彩风格→必须包含 watercolor, soft edges, hand-painted texture, pastel tones 等水彩特征词；赛璐珞动漫→必须包含 cel-shading, clean lines, anime coloring 等；写实风格→必须包含 photorealistic, natural skin texture 等。绝对不要用通用动漫风格替代指定的画风
${clothingRule}
6. 绝对不要加入任何场景、背景元素、故事情节、地面阴影、其他人物
7. 保持中性自然表情，不要加入夸张情绪
8. 长度控制在 80-150 个单词${consistencyBlock}

---

请为以下角色生成「${cfg.desc}」的提示词（画面中只有这一个角色）：

★ 风格要求（最优先）：${style || '动漫风格'}
${bodyProportionInstruction ? `★ 体型比例要求：${bodyProportionInstruction}` : ''}
角色名称：${characterName || '未命名角色'}
外貌特征：${composedAppearance || '无'}
角色描述：${description || '无'}
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
 * 白膜模式专用：使用 AI 生成角色设定图（三视角 turnaround）的提示词
 * 与 generateViewPrompt 的区别：要求在同一张图上展示正面/侧面/背面三个视角
 */
async function generateDesignSheetPrompt(characterName, appearance, description, style, textModel, options = {}) {
  const { gender = 'unknown', bodyProportionInstruction, bodyElements } = options;
  const bodyPrompt = BASE_MODEL_BODY[gender] || BASE_MODEL_BODY.unknown;
  const bodyElementsNote = bodyElements
    ? `\n- 【身体元素标记】角色身体上有以下永久性标记，必须在生成的图像中体现：${bodyElements}`
    : '';

  const fullPrompt = `你是一个专业的角色设计图提示词专家。你的任务是生成用于 AI 绘图的「角色设定图 / Character Design Reference Sheet」提示词。

核心要求（必须严格遵守）：
1. 提示词必须用英文输出，逗号分隔的关键词格式
2. 【关键】这是一张角色设定图（Character Design Reference Sheet），需要在同一张图上展示同一角色的正面、侧面、背面三个视角的全身立绘，类似游戏角色的 turnaround reference sheet
3. 必须包含：character design reference sheet, turnaround, front view, side view, back view, same character, full body, simple clean white background, professional character sheet layout
4. 【画风一致性】角色的绘制风格必须严格匹配下方「风格要求」。提示词的前几个关键词必须是风格描述词
5. 【白膜模式】角色必须穿着统一的标准化白膜着装：纯白色无花纹贴身背心 + 纯白色短裤，类似游戏建模 base mesh。不能包含任何其他服装、装饰品、装备或鞋子。必须包含: ${bodyPrompt}
6. 绝对不要加入任何场景、背景元素、故事情节
7. 保持中性自然表情
8. 长度控制在 100-180 个单词

---

请为以下角色生成角色设定图的提示词：

★ 风格要求（最优先）：${style || '动漫风格'}
${bodyProportionInstruction ? `★ 体型比例要求：${bodyProportionInstruction}` : ''}
角色名称：${characterName || '未命名角色'}
外貌特征：${appearance || '无'}
角色描述：${description || '无'}${bodyElementsNote}

请直接输出英文提示词，不要包含任何解释。`;

  console.log('[CharacterViews] 使用 AI 生成白膜设定图提示词...');

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
  } else if (response && response.taskId) {
    throw new Error(`错误：调用了图片生成模型而非文本模型。响应: ${JSON.stringify(response).substring(0, 200)}`);
  }

  if (!prompt) {
    console.error('[CharacterViews] 无法提取设定图提示词，完整响应:', JSON.stringify(response));
    throw new Error(`AI 响应中没有内容。响应类型: ${typeof response}`);
  }

  prompt = String(prompt)
    .replace(/^["']|["']$/g, '')
    .replace(/\n+/g, ', ')
    .replace(/,\s*,/g, ',')
    .trim();

  console.log('[CharacterViews] ✅ 白膜设定图提示词生成完成:', prompt.substring(0, 100) + '...');
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
    aspectRatio = '3:4',  // 默认 3:4 竖版比例
    width,
    height,
    regenerateOnly,   // 可选：补全模式，如 ['side', 'back']
    isBaseModel = false,  // 白膜模式
    gender = 'unknown',   // 性别：male, female, unknown
    // 状态级别外貌属性
    stateId = null,       // 角色状态 ID（为状态生成时传入）
    outfit = '',          // 服装描述
    hairstyle = '',       // 发型描述
    accessories = '',     // 配饰描述
    ageStage = '',        // 年龄阶段
    bodyElements = '',     // 身体元素（纹身、疤痕、胎记等，白膜专用）
    heldProps = '',       // 手持/携带道具（非白膜状态下角色手里拿着或携带的物品）
    // 前端自定义提示词（跳过 AI 提示词生成步骤）
    customPromptFront,
    customPromptSide,
    customPromptBack,
    // 生成模式：'design_sheet'（默认，白膜用）| 'three_views'（独立三视图）
    generateMode
  } = inputParams;


  // 项目视觉风格（必填，未设置则报错）
  const style = await requireVisualStyle(projectId);

  // 头身比例（仅动漫类有效）
  const bodyProportion = await getBodyProportion(projectId);
  const bodyProportionInstruction = bodyProportion?.promptInstruction || '';

  // 查询数据库中已有的三视图 URL，用于补全模式
  let existingViews = { front_view_url: null, side_view_url: null, back_view_url: null, use_reference_images: 1 };
  if (stateId) {
    // 状态级别：从 character_states 表读取
    const row = await queryOne(
      'SELECT front_view_url, side_view_url, back_view_url, use_reference_images FROM character_states WHERE id = ?',
      [stateId]
    );
    if (row) existingViews = row;
  } else if (characterId) {
    // 角色级别：从 characters 表读取
    const row = await queryOne(
      'SELECT front_view_url, side_view_url, back_view_url, use_reference_images FROM characters WHERE id = ?',
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

  // 查询状态关联的道具，拼入 heldProps（替代旧 held_props 纯文本字段）
  let effectiveHeldProps = heldProps || '';
  if (stateId && !isBaseModel) {
    const propRows = await queryAll(
      `SELECT p.name, csp.hand_position, csp.usage_mode
       FROM character_state_props csp
       JOIN props p ON csp.prop_id = p.id
       WHERE csp.character_state_id = ?`,
      [stateId]
    );
    if (propRows.length > 0) {
      const propDescs = propRows.map(r => {
        const handMap = { right: '右手', left: '左手', both: '双手', back: '背后', waist: '腰间' };
        const usageMap = { hold: '持握', wear: '佩戴', carry: '背负', ground: '放置' };
        return `${r.name}(${handMap[r.hand_position] || r.hand_position}${usageMap[r.usage_mode] ? '/' + usageMap[r.usage_mode] : ''})`;
      });
      effectiveHeldProps = propDescs.join('，');
      console.log(`[CharacterViews] 状态关联道具: ${effectiveHeldProps}`);
    }
  }

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
    ageStage: ageStage || 'N/A',
    heldProps: effectiveHeldProps || 'N/A'
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
  const ts = Date.now(); // 时间戳用于生成唯一文件名，避免浏览器缓存旧图

  console.log(`[CharacterViews] 生成模式: ${isStateGeneration ? '状态级别(stateId=' + stateId + ')' : '角色级别'}`);

  // === 参考图查询（简化架构：白膜用角色参考图，非白膜只用白膜三视图）===
  let userReferenceUrls = [];
  let hasCostumeRefImage = false;  // 是否有服装设定图作为参考

  if (isBaseModel && characterId) {
    // ★ 白膜生成：直接查询角色级参考图（来自"参考图"Tab）
    const useRefImages = existingViews.use_reference_images !== 0 && existingViews.use_reference_images !== false;
    if (useRefImages) {
      const refImages = await queryAll(
        `SELECT image_url FROM asset_reference_images
         WHERE asset_type = 'character' AND asset_id = ? AND is_enabled = 1
         ORDER BY sort_order ASC`,
        [characterId]
      );
      if (refImages.length > 0) {
        userReferenceUrls = refImages
          .map(r => resolveToInternalUrl(r.image_url))
          .filter(Boolean);
        console.log(`[CharacterViews] ✅ 白膜生成：使用角色级参考图，共 ${userReferenceUrls.length} 张:`, userReferenceUrls);
      } else {
        console.log('[CharacterViews] 白膜生成：角色级无可用参考图');
      }
    } else {
      console.log('[CharacterViews] 白膜生成：参考图未启用');
    }
    // 白膜无参考图时，回退用其他已生成状态图片作为参考
    if (userReferenceUrls.length === 0) {
      const otherStateWithImages = await queryOne(
        `SELECT front_view_url, side_view_url, back_view_url FROM character_states 
         WHERE character_id = ? AND is_base_model = 0 
           AND front_view_url IS NOT NULL AND front_view_url != ''
         ORDER BY is_active DESC, updated_at DESC LIMIT 1`,
        [characterId]
      );
      if (otherStateWithImages) {
        const otherUrls = [otherStateWithImages.front_view_url, otherStateWithImages.side_view_url, otherStateWithImages.back_view_url]
          .filter(Boolean)
          .map(url => resolveToInternalUrl(url))
          .filter(Boolean);
        if (otherUrls.length > 0) {
          userReferenceUrls = otherUrls;
          console.log(`[CharacterViews] ✅ 白膜生成：使用其他状态三视图作为回退参考 (${otherUrls.length} 张):`, otherUrls);
        }
      } else {
        console.log('[CharacterViews] 白膜生成：无其他状态可用作回退参考');
      }
    }
  } else if (!isBaseModel && isStateGeneration && characterId) {
    // ★ 非白膜状态生成：白膜设定图（身份锚）+ 服装设定图（服装锚）
    const refUrls = [];

    // 1) 白膜设定图（优先用 image_url 单张设定图，回退到 front_view_url）
    const baseModelRow = await queryOne(
      `SELECT image_url, front_view_url FROM character_states
       WHERE character_id = ? AND is_base_model = 1`,
      [characterId]
    );
    if (baseModelRow) {
      const baseModelUrl = baseModelRow.image_url || baseModelRow.front_view_url;
      if (baseModelUrl) {
        const designSheetUrl = resolveToInternalUrl(baseModelUrl);
        if (designSheetUrl) {
          refUrls.push(designSheetUrl);
          console.log('[CharacterViews] ✅ 非白膜状态生成：已加白膜设定图:', designSheetUrl);
        }
      } else {
        console.log('[CharacterViews] 非白膜状态生成：白膜状态无 image_url 和 front_view_url');
      }
    } else {
      console.log('[CharacterViews] 非白膜状态生成：未找到白膜状态');
    }

    // 2) 状态关联的 costume 设定图（若有）
    if (stateId) {
      const costumeRow = await queryOne(
        `SELECT c.image_url, c.front_view_url, c.side_view_url, c.back_view_url
         FROM character_states s
         LEFT JOIN costumes c ON s.costume_id = c.id
         WHERE s.id = ?`,
        [stateId]
      );
      if (costumeRow) {
        // 优先使用新的单张设定图
        if (costumeRow.image_url) {
          const costumeMain = resolveToInternalUrl(costumeRow.image_url);
          if (costumeMain) {
            refUrls.push(costumeMain);
            hasCostumeRefImage = true;
            console.log('[CharacterViews] ✅ 非白膜状态生成：已加服装设定图作参考:', costumeMain);
          }
        } else {
          // 兼容老数据：回退到旧的三视图字段
          const costumeUrls = [costumeRow.front_view_url, costumeRow.side_view_url, costumeRow.back_view_url]
            .filter(Boolean)
            .map(url => resolveToInternalUrl(url))
            .filter(Boolean);
          if (costumeUrls.length > 0) {
            refUrls.push(...costumeUrls);
            hasCostumeRefImage = true;
            console.log(`[CharacterViews] ✅ 非白膜状态生成：已加 ${costumeUrls.length} 张服装旧视图作参考`);
          }
        }
      }

      // 3) 状态关联的道具设定图（若有）
      const propRows = await queryAll(
        `SELECT p.image_url, p.name, csp.hand_position, csp.usage_mode
         FROM character_state_props csp
         JOIN props p ON csp.prop_id = p.id
         WHERE csp.character_state_id = ? AND p.image_url IS NOT NULL AND p.image_url != ''`,
        [stateId]
      );
      if (propRows.length > 0) {
        for (const propRow of propRows) {
          const propUrl = resolveToInternalUrl(propRow.image_url);
          if (propUrl) {
            refUrls.push(propUrl);
            console.log(`[CharacterViews] ✅ 非白膜状态生成：已加道具「${propRow.name}」设定图作参考 (${propRow.hand_position}/${propRow.usage_mode})`);
          }
        }
      }

      // 注：道具参考图仅来自 character_state_props 关联表（已叠加道具）
      // 不再使用 held_props 文本字段匹配，避免引入未叠加的道具
    }

    userReferenceUrls = refUrls;
    if (userReferenceUrls.length === 0) {
      console.log('[CharacterViews] 非白膜状态生成：白膜无设定图且服装无图，纯靠提示词生成');
    }
  } else {
    console.log('[CharacterViews] 角色级别生成或无 characterId，跳过参考图查询');
  }

  // 白膜三视图模式下，额外将已有设定图 (image_url) 加入参考
  if (isBaseModel && generateMode === 'three_views' && stateId) {
    const ownState = await queryOne('SELECT image_url FROM character_states WHERE id = ?', [stateId]);
    if (ownState?.image_url) {
      const designSheetUrl = resolveToInternalUrl(ownState.image_url);
      if (designSheetUrl) {
        userReferenceUrls.unshift(designSheetUrl);
        console.log('[CharacterViews] ✅ 白膜三视图模式：将设定图作为首要参考:', designSheetUrl);
      }
    }
  }

  // === 白膜设定图模式：生成单张 AI 角色设定图（含正/侧/背三视角 turnaround）===
  // 仅当白膜模式且未明确要求三视图时走此分支
  if (isBaseModel && generateMode !== 'three_views') {
    console.log('[CharacterViews] ★ 白膜模式：生成单张角色设定图（三视角 turnaround）');

    let designSheetPrompt;
    const hasUserRefs = userReferenceUrls.length > 0;

    if (hasUserRefs) {
      // 有参考图：保留脸部发型，白膜标准着装，三视角设定图
      const bodyPrompt = BASE_MODEL_BODY[gender] || BASE_MODEL_BODY.unknown;
      const bodyElementsPrompt = bodyElements ? `, body markings and features: ${bodyElements}` : '';
      designSheetPrompt = `match the character face and hairstyle from the reference image exactly, preserve all facial features face shape eye shape eye color hair style hair color hair length from reference, keep identical face proportions from reference image, character design reference sheet, three-angle turnaround showing front view side view and back view of the same character on one image, ${bodyPrompt}${bodyElementsPrompt}, ${style || 'anime style'}, full body, simple clean white background, even soft lighting, neutral natural expression, professional character sheet layout`;
      console.log('[CharacterViews] ✅ 白膜设定图：有参考图 → 使用简化提示词（保留脸部发型）');
    } else {
      // 无参考图：使用 AI 根据外貌描述生成详细提示词
      designSheetPrompt = await generateDesignSheetPrompt(characterName, appearance, description, style, textModel, { gender, bodyProportionInstruction, bodyElements });
    }

    if (onProgress) onProgress(10);

    // 生成设定图（横版 16:9，适合三视角排列）
    const sheetGenParams = {
      prompt: designSheetPrompt,
      imageModel: imageModel,
      aspectRatio: '16:9'
    };
    if (hasUserRefs) {
      sheetGenParams.imageUrls = [...userReferenceUrls];
      sheetGenParams.strength = 0.15;
      console.log('[CharacterViews] 白膜设定图使用参考图 (strength=0.15):', userReferenceUrls);
    }

    const sheetResult = await handleImageGeneration(sheetGenParams, (progress) => {
      if (onProgress) onProgress(10 + progress * 0.7);
    });
    const sheetImageUrl = sheetResult.image_url;
    console.log('[CharacterViews] ✅ 白膜角色设定图生成完成');

    // 持久化到存储
    const persistedSheetUrl = await downloadAndStore(
      sheetImageUrl,
      `${storageBase}/design_sheet_${ts}`,
      { fallbackExt: '.png' }
    );

    if (onProgress) onProgress(85);

    // 更新数据库：白膜设定图存入 image_url，不写 front/side/back_view_url
    if (isStateGeneration && stateId && persistedSheetUrl) {
      const updateResult = await execute(
        `UPDATE character_states SET image_url = ?, generation_status = 'completed', generation_prompt = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
        [persistedSheetUrl, designSheetPrompt || '', stateId]
      );
      assertUpdated(updateResult, '[CharacterViews] 白膜设定图(状态)');
      await assertPersistedFields({
        table: 'character_states',
        id: stateId,
        fields: ['image_url'],
        label: '[CharacterViews] 白膜设定图(状态)'
      });
      console.log('[CharacterViews] ✅ 白膜设定图已保存到 character_states.image_url');
    }
    // 同步更新角色级别 image_url + character_sheet_url
    if (characterId && persistedSheetUrl) {
      await execute(
        `UPDATE characters SET image_url = ?, character_sheet_url = ?, generation_status = 'completed', updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
        [persistedSheetUrl, persistedSheetUrl, characterId]
      );
      console.log('[CharacterViews] ✅ 白膜设定图已保存到 characters (image_url + character_sheet_url)');
    }

    if (onProgress) onProgress(100);

    console.log('[CharacterViews] ✅ 白膜设定图生成完成');
    return {
      frontViewUrl: null,
      sideViewUrl: null,
      backViewUrl: null,
      imageUrl: persistedSheetUrl,
      characterSheetUrl: persistedSheetUrl,
      imageModel,
      textModel,
      aspectRatio: '16:9',
      stateId: stateId || null,
      isStateGeneration,
      isDesignSheet: true
    };
  }

  // === 三视图并行生成（直接参考白膜设定图） ===
  let persistedFrontUrl = existingViews.front_view_url || null;
  let persistedSideUrl = existingViews.side_view_url || null;
  let persistedBackUrl = existingViews.back_view_url || null;
  let lastGeneratedPrompt = '';

  const viewsToGenerate = [];
  if (needFront) viewsToGenerate.push({ view: 'front', customPrompt: customPromptFront });
  if (needSide) viewsToGenerate.push({ view: 'side', customPrompt: customPromptSide });
  if (needBack) viewsToGenerate.push({ view: 'back', customPrompt: customPromptBack });

  if (viewsToGenerate.length > 0) {
    const hasUserRefs = userReferenceUrls.length > 0;
    console.log(`[CharacterViews] 开始并行生成 ${viewsToGenerate.length} 个视图${hasUserRefs ? '（参考白膜设定图）' : '（纯描述生成）'}...`);

    // Step 1: 并行构建提示词
    const promptResults = await Promise.all(
      viewsToGenerate.map(async ({ view, customPrompt }) => {
        if (typeof customPrompt === 'string' && customPrompt.trim()) {
          console.log(`[CharacterViews] ${view}视图使用前端自定义提示词`);
          return { view, prompt: customPrompt.trim() };
        }
        if (hasUserRefs) {
          if (isBaseModel) {
            return { view, prompt: buildBaseModelReferencePrompt(view, style, characterName, { gender, bodyElements }) };
          }
          // 非白膜状态：参考图通常是白膜设定图+服装设定图，以服装图纸为主导指导服装生成
          return { view, prompt: buildReferenceGuidedPrompt(view, style, characterName, { isBaseModel, gender, outfit, hairstyle, accessories, ageStage, heldProps: effectiveHeldProps, hasCostumeRef: hasCostumeRefImage }) };
        }
        const prompt = await generateViewPrompt(view, characterName, appearance, description, style, textModel, { isBaseModel, gender, outfit, hairstyle, accessories, ageStage, bodyProportionInstruction, bodyElements, heldProps: effectiveHeldProps });
        return { view, prompt };
      })
    );
    lastGeneratedPrompt = promptResults[0]?.prompt || '';

    if (onProgress) onProgress(10);

    // Step 2: 并行生成图片
    let completedCount = 0;
    const imageResults = await Promise.all(
      promptResults.map(async ({ view, prompt }) => {
        const genParams = { prompt, imageModel, aspectRatio };
        if (width && height) {
          genParams.width = width;
          genParams.height = height;
          delete genParams.aspectRatio;
        }
        if (hasUserRefs) {
          genParams.imageUrls = [...userReferenceUrls];
          // 根据参考图类型动态调整 strength：
          // Seedream 的 strength 是"图生图变化强度"：值越低越忠实于参考图，值越高偏离越大
          // - 白膜+服装设定图：需要忠实复制服装细节，strength 应低 (0.30)
          //   两张参考图（白膜身份锚+服装设定图），低 strength 让 AI 同时忠实于两者
          // - 仅有白膜图：需要在白膜基础上叠加文字描述的服装，strength 偏低 (0.35)
          //   白膜图是角色身份锚点，strength 太高会导致角色脸部体貌偏离白膜
          // - 白膜模式：极低 strength 仅保留脸部特征 (0.20)
          //   白膜三视图有参考图时，只保留脸部发型，服装按文字提示生成
          if (isBaseModel) {
            genParams.strength = 0.20;
          } else if (hasCostumeRefImage) {
            genParams.strength = 0.30;
          } else {
            genParams.strength = 0.35;
          }
          console.log(`[CharacterViews] ${view}视图参考图 (strength=${genParams.strength}):`, userReferenceUrls);
        }
        const result = await handleImageGeneration(genParams);
        completedCount++;
        if (onProgress) onProgress(10 + Math.round((completedCount / viewsToGenerate.length) * 60));
        console.log(`[CharacterViews] ✅ ${view}视图生成完成 (${completedCount}/${viewsToGenerate.length})`);
        return { view, imageUrl: result.image_url, prompt };
      })
    );

    // Step 3: 并行持久化到存储
    const persistResults = await Promise.all(
      imageResults.map(async ({ view, imageUrl, prompt }) => {
        const persistedUrl = await downloadAndStore(
          imageUrl,
          `${storageBase}/${view}_${ts}`,
          { fallbackExt: '.png' }
        );
        return { view, persistedUrl, prompt };
      })
    );

    if (onProgress) onProgress(80);

    // Step 4: 更新数据库 + 同步跟踪变量
    for (const { view, persistedUrl } of persistResults) {
      if (!targetId || !persistedUrl) continue;
      const urlField = `${view}_view_url`;
      const updateResult = await execute(
        `UPDATE ${targetTable} SET ${urlField} = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
        [persistedUrl, targetId]
      );
      assertUpdated(updateResult, `[CharacterViews] ${view}视图`);
      await assertPersistedFields({
        table: targetTable,
        id: targetId,
        fields: [urlField],
        label: `[CharacterViews] ${view}视图`
      });
      console.log(`[CharacterViews] ✅ ${view}视图已保存到 ${targetTable}`);
      if (view === 'front') persistedFrontUrl = persistedUrl;
      else if (view === 'side') persistedSideUrl = persistedUrl;
      else if (view === 'back') persistedBackUrl = persistedUrl;
    }
  } else {
    console.log('[CharacterViews] 所有视图已存在，跳过生成');
  }

  if (onProgress) onProgress(85);

  // === 合成角色设定图 ===
  let characterSheetUrl = null;
  const composedAppearance = [appearance, outfit ? `服装: ${outfit}` : '', hairstyle ? `发型: ${hairstyle}` : '', accessories ? `配饰: ${accessories}` : '', ageStage ? `年龄: ${ageStage}` : ''].filter(Boolean).join('；');
  try {
    console.log('[CharacterViews] 开始合成角色设定图...');
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
    const sheetObjectPath = `${storageBase}/character_sheet_${ts}.png`;
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
module.exports.generateViewPrompt = generateViewPrompt;
