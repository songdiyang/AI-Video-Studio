/**
 * 单条分镜提示词优化处理器
 * 优化指定分镜的描述文字（AI 优化按钮触发）
 *
 * 逻辑：
 * 1. 查询分镜及所属项目、剧本信息
 * 2. 获取上下文分镜、角色、场景信息
 * 3. 调用文本模型优化提示词（含反向提示词）
 * 4. 返回优化结果（不写回数据库，由前端保存）
 *
 * input:  { storyboardId, prompt, textModel }
 * output: { optimized, negativePrompt, model, originalLength, optimizedLength }
 */

const { queryOne, queryAll } = require('../../../dbHelper');
const { callAIModel, getTextModels } = require('../../../aiModelService');
const { withAIBillingContext } = require('../../../aiBillingContext');

async function handleSinglePromptOptimization(inputParams, onProgress) {
  const { storyboardId, prompt, textModel: requestedModel } = inputParams;

  if (!storyboardId) throw new Error('缺少必要参数: storyboardId');
  if (!prompt || !prompt.trim()) throw new Error('输入内容不能为空');

  if (onProgress) onProgress(5);

  // 1. 查询分镜及所属项目、剧本
  const storyboard = await queryOne(
    `SELECT s.id, s.script_id, s.idx, sc.project_id, sc.content AS script_content,
            sc.title AS script_title, p.settings_json, p.name AS project_name
     FROM storyboards s
     JOIN scripts sc ON s.script_id = sc.id
     JOIN projects p ON sc.project_id = p.id
     WHERE s.id = ?`,
    [storyboardId]
  );

  if (!storyboard) throw new Error('分镜不存在');

  if (onProgress) onProgress(10);

  // 2. 获取当前分镜的角色和场景信息
  let currentCharacters = [];
  let currentLocation = '';
  try {
    const storyboardDetail = await queryOne(
      'SELECT variables_json FROM storyboards WHERE id = ?',
      [storyboardId]
    );
    if (storyboardDetail && storyboardDetail.variables_json) {
      const vars = typeof storyboardDetail.variables_json === 'string'
        ? JSON.parse(storyboardDetail.variables_json)
        : storyboardDetail.variables_json;
      currentCharacters = vars.characters || [];
      currentLocation = vars.location || '';
    }
  } catch (e) { /* 忽略 */ }

  if (onProgress) onProgress(15);

  // 3. 获取同一剧本下的所有分镜描述（建立上下文关系）
  const allStoryboards = await queryAll(
    `SELECT id, idx, prompt_template, spatial_description
     FROM storyboards
     WHERE script_id = ?
     ORDER BY idx ASC`,
    [storyboard.script_id]
  );

  // 找到当前分镜在序列中的位置
  const currentIdx = allStoryboards.findIndex(sb => sb.id === parseInt(storyboardId));
  const totalCount = allStoryboards.length;

  // 构建分镜上下文摘要（前后各3个分镜）
  const contextRange = 3;
  const contextStart = Math.max(0, currentIdx - contextRange);
  const contextEnd = Math.min(totalCount, currentIdx + contextRange + 1);
  const contextStoryboards = allStoryboards.slice(contextStart, contextEnd);

  let storyboardContext = '';
  for (const sb of contextStoryboards) {
    const desc = sb.prompt_template || sb.spatial_description || '(空)';
    const isCurrent = sb.id === parseInt(storyboardId);
    const marker = isCurrent ? ' 👈 [当前分镜]' : '';
    const truncated = desc.length > 150 ? desc.slice(0, 150) + '...' : desc;
    storyboardContext += `  分镜 #${sb.idx + 1}: ${truncated}${marker}\n`;
  }

  // 4. 确定使用的文本模型
  let modelName = requestedModel;
  if (!modelName) {
    const textModels = await getTextModels();
    if (textModels.length === 0) throw new Error('没有可用的文本模型');
    modelName = textModels[0].name;
  }

  if (onProgress) onProgress(25);

  // 5. 提取视觉风格和拍摄视角
  let visualStyle = '';
  let visualStyleLabel = '';
  let perspectiveInstruction = '';
  try {
    const settings = typeof storyboard.settings_json === 'string'
      ? JSON.parse(storyboard.settings_json || '{}')
      : (storyboard.settings_json || {});
    visualStyle = settings.visualStylePrompt || settings.visual_style_prompt || '';
    visualStyleLabel = settings.visualStyle || '';
    // 拍摄视角
    const { getNarrativePerspective } = require('../../../utils/getProjectStyle');
    const perspective = await getNarrativePerspective(storyboard.project_id);
    perspectiveInstruction = perspective.promptInstruction || '';
  } catch (e) {
    // 忽略
  }

  // 6. 判断风格类型（真人/动漫）
  const liveActionStyles = ['写实电影', '时尚摄影', '纪实风格', '电影感剧情'];
  const isLiveAction = liveActionStyles.includes(visualStyleLabel) ||
                      visualStyle.includes('写实') ||
                      visualStyle.includes('电影') ||
                      visualStyle.includes('摄影') ||
                      visualStyle.includes('纪实') ||
                      visualStyle.toLowerCase().includes('realistic') ||
                      visualStyle.toLowerCase().includes('cinematic') ||
                      visualStyle.toLowerCase().includes('photography');

  // 7. 构建角色和场景上下文
  let characterContext = '';
  if (currentCharacters.length > 0) {
    characterContext = `\n【当前分镜角色】${currentCharacters.join('、')}`;
    try {
      const charNames = currentCharacters.map(n => `'${n.replace(/'/g, "''")}'`).join(',');
      const charDetails = await queryAll(
        `SELECT name, appearance FROM characters WHERE project_id = ? AND name IN (${charNames})`,
        [storyboard.project_id]
      );
      if (charDetails.length > 0) {
        characterContext += '\n角色外貌特征：';
        for (const cd of charDetails) {
          characterContext += `\n  - ${cd.name}：${(cd.appearance || '未设置').slice(0, 200)}`;
        }
      }
    } catch (e) { /* 忽略 */ }
  }
  if (currentLocation) {
    characterContext += `\n【当前分镜场景】${currentLocation}`;
  }

  if (onProgress) onProgress(35);

  // 8. 构建系统提示词
  const scriptContent = storyboard.script_content || '';
  const scriptSection = scriptContent
    ? `\n【剧本全文】\n${scriptContent.length > 3000 ? scriptContent.slice(0, 3000) + '\n...(剧本过长，已截断)' : scriptContent}\n`
    : '';

  const optimizationPrinciples = isLiveAction
    ? `【真人实拍优化原则】
1. 先通读剧本，理解故事全貌、人物关系和情节走向
2. 确认当前分镜在故事中的时间线位置和情感基调
3. 对照前后分镜，确保角色状态、场景、情绪的连贯性
4. 如果发现当前描述与剧本内容或前后分镜有矛盾，修正使其一致

【镜头语言优化 - 真人实拍核心要素】
• 镜头：明确镜头类型（定焦/变焦/微距/长焦/广角），说明镜头选择对画面的影响
• 光圈：标注光圈值（f/1.4-f/22），描述景深效果（大光圈浅景深虚化背景/小光圈深景深全清晰）
• 焦距：说明焦距范围（广角14-35mm/标准50mm/长焦85-200mm），影响空间透视和人物比例
• 快门：快门速度对运动模糊的影响（高速快门凝固动作/慢门呈现动态）
• 景深：明确焦点位置和景深范围，前景/中景/背景的虚实关系
• 帧率：拍摄帧率选择（24fps电影感/30fps标准/60fps高帧率慢动作）
• 运镜：运镜方式（推/拉/摇/移/跟/升降/环绕/手持稳定/肩扛呼吸感），说明运镜节奏和动机
• 曝光：曝光控制（高调/低调/正常），光比关系，明暗层次
• 色彩：色温设定（暖调/冷调/中性），色彩风格（日系清新/美剧暖黄/北欧冷调/胶片感）

【情绪叠加理论 - 真人表情核心】
真人面部表情极少是单一情绪，而是多种情绪的百分比混合。你必须运用感情叠加理论来描述角色表情：
• 分析剧情上下文，将角色当前情绪分解为2-4种基础情绪的权重组合
• 基础情绪谱：joy（喜悦）、sadness（悲伤）、anger（愤怒）、fear（恐惧）、surprise（惊讶）、disgust（厌恶）、contempt（轻蔑）、trust（信任）
• 描述要求：先用百分比标注情绪配方，再翻译为具体的面部微表情（眉毛、眼睛、嘴角、肌肉张力）
• 避免扁平化的单一表情词（如"sad face"），改用复合微表情描述

【环境与氛围】
• 自然光：黄金时刻/蓝调时刻/正午硬光/阴天柔光
• 人工光：主光位置、辅光比例、轮廓光、眼神光
• 场景氛围：烟雾/雨丝/光斑/尘土等环境元素

【材质质感描述 - 真人实拍核心】
你必须为画面中的关键元素添加专业的材质质感描述，增强真实感和细节丰富度：
• 皮肤质感：根据角色年龄、性别、情绪状态描述皮肤纹理（细腻光滑/粗糙晒伤/毛孔可见/皱纹沟壑/油光/干裂），关注光线对皮肤质感的影响
• 服装面料：明确面料类型与视觉特征（丝绸→光泽流淌、垂坠感；棉麻→哑光、自然褶皱；皮革→反光高光、纹理沟槽；毛料→蓬松纤维、漫反射；雪纺→半透明、轻柔飘逸）
• 环境材质：描述场景中主要材质的质感特征（金属→镜面反射/拉丝纹理/氧化锈蚀；木材→木纹肌理/光滑漆面/粗糙原木；石材→颗粒感/抛光面/风化裂纹；玻璃→透明折射/磨砂漫射/反光倒影）
• 融合要求：材质描述必须自然融入画面描述，不可孤立罗列`
    : `【动漫动画优化原则】
1. 先通读剧本，理解故事全貌、人物关系和情节走向
2. 确认当前分镜在故事中的时间线位置和情感基调
3. 对照前后分镜，确保角色状态、场景、情绪的连贯性
4. 如果发现当前描述与剧本内容或前后分镜有矛盾，修正使其一致
5. 保持造型一致性，角色外观特征不得突变

【画面构成优化 - 动漫动画核心要素】
• 构图：画面分割（三分法/黄金分割/对称/对角线），视觉重心位置
• 机位：机位高度（平视/俯视/仰视/虫视/鸟视），与被摄体的距离关系
• 透视：透视类型（一点透视/两点透视/三点透视/空气透视），空间纵深感
• 景别：画面范围（远景/全景/中景/近景/特写/大特写），叙事功能
• 焦点：视觉焦点位置，引导观众视线的元素
• 虚实：前景虚化/背景虚化/移焦效果，层次分明

【动画制作优化 - 动画技术要素】
• 张数：关键帧张数估算，动作密度（单拍/双拍/三拍）
• 动态表现：运动轨迹、速度线、变形夸张、弹性运动
• 时间节奏：快节奏/慢节奏/停顿/节奏变化点
• 分层：前景层/中景层/背景层/特效层，便于后期合成

【材质质感描述 - 动漫动画核心】
你必须为画面中的关键元素添加符合动漫风格的材质质感描述，增强画面细节丰富度：
• 皮肤质感：根据角色设定描述皮肤表现风格（赛璐璐→平面均匀色块、无纹理；半写实→柔和渐变、隐约毛孔；厚涂→笔触可见、肌理丰富）
• 服装面料：用色块和线条表现面料特征（丝绸→高光色带、流畅曲线；棉麻→柔和色块、少高光；皮革→锐利高光、深色阴影）
• 环境材质：用动画表现手法描述场景材质（金属→锐利高光线、冷色反光；木材→暖色调、木纹用线条暗示；石材→粗颗粒网点、灰色调）
• 融合要求：材质描述必须自然融入画面描述，与整体动画风格一致`;

  const systemPrompt = `你是一个专业的分镜描述优化专家。你需要先理解整个剧本的内容和脉络，明确当前分镜在故事中的位置，然后再优化当前分镜的描述。

【项目】${storyboard.project_name || '未命名'}${storyboard.script_title ? `\n【剧本标题】${storyboard.script_title}` : ''}${scriptSection}\n【分镜上下文】共 ${totalCount} 个分镜，当前为第 ${currentIdx + 1} 个：
${storyboardContext}${characterContext}${visualStyle ? `\n【视觉风格】${visualStyle}` : ''}${perspectiveInstruction ? `\n${perspectiveInstruction}` : ''}\n【风格类型】${isLiveAction ? '真人实拍' : '动漫动画'}\n
你的任务：优化标记为"当前分镜"的描述内容。

${optimizationPrinciples}

【输出要求 - 正向提示词】
• 描述越详细画面效果越好，请充分发挥专业能力，用丰富的细节描述画面
• 如果当前分镜指定了角色，确保角色名称和外貌特征准确融入描述中，不能遗漏任何角色
• 如果当前分镜指定了场景，确保场景环境描述自然融入画面描述中
• 描述要有画面感和电影感，让读者能清晰想象出画面

【输出要求 - 反向提示词（Negative Prompt）】
你必须同时生成反向提示词，用于排除画面中不应该出现的内容。参考以下信息：
1. 项目视觉风格：${visualStyle || '未指定'}，排除与该风格冲突的元素
2. 分镜正向提示词的内容范围：只描述画面应有的内容，排除所有不应该出现的多余元素
反向提示词生成规则：
• 排除与当前场景、角色、情绪无关的视觉元素
• 排除与视觉风格冲突的表现形式（如动漫风格排除"写实、真人、照片"，写实风格排除"卡通、动漫、插画"）
• 排除常见画面缺陷（低质量、模糊、变形、多余肢体、水印、文字、签名）
• 排除与当前情绪氛围不符的元素（如悲伤场景排除"微笑、明亮"）
• 反向提示词用中文描述，词语间用英文逗号分隔

【输出格式】
严格按以下 JSON 格式输出，不要添加任何其他内容：
{"positive": "优化后的正向提示词", "negative": "反向提示词，中文描述，英文逗号分隔"}`;

  if (onProgress) onProgress(50);

  // 9. 调用 AI 模型
  // 注意：WorkflowExecutor 已经在外层设置了完整的 billing context（含 userId、projectId 等），
  // 此处只覆盖 resourceRefs 以追踪具体分镜，其余字段自动从外层继承。
  const response = await withAIBillingContext(
    { resourceRefs: { storyboardId } },
    () => callAIModel(modelName, {
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: prompt }
      ],
      maxTokens: 4096,
      temperature: 0.7
    })
  );

  if (onProgress) onProgress(85);

  // 10. 提取优化后的文本
  let optimized = '';
  let negativePrompt = '';
  if (typeof response === 'string') {
    optimized = response;
  } else if (response?.content) {
    optimized = response.content;
  } else if (response?.text) {
    optimized = response.text;
  } else if (response?.message) {
    optimized = response.message;
  }

  if (!optimized) throw new Error('AI 模型返回内容为空');

  // 清理：去除可能的引号包裹和多余空白
  optimized = optimized.replace(/^["'""]+|["'""]+$/g, '').trim();

  // 尝试解析 JSON 格式（包含正向+反向提示词）
  try {
    const jsonMatch = optimized.match(/\{[\s\S]*"positive"[\s\S]*"negative"[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      if (parsed.positive) optimized = parsed.positive.trim();
      if (parsed.negative) negativePrompt = parsed.negative.trim();
    }
  } catch (parseErr) {
    // JSON 解析失败，使用整段作为正向提示词
    console.log('[SinglePromptOptimize] JSON解析失败，使用整段作为正向提示词');
  }

  if (onProgress) onProgress(100);

  console.log(`[SinglePromptOptimize] storyboardId=${storyboardId}, model=${modelName}, context=${totalCount}scenes, input=${prompt.length}chars -> output=${optimized.length}chars, negative=${negativePrompt.length}chars`);

  return {
    optimized,
    negativePrompt,
    model: modelName,
    originalLength: prompt.length,
    optimizedLength: optimized.length
  };
}

module.exports = handleSinglePromptOptimization;
