/**
 * 单条分镜视频提示词优化处理器
 * 优化指定分镜的描述文字，专门针对动态视频生成模型（Seedance、Kling、Runway等）
 * 
 * 核心改进：
 * 1. 生成两个独立的视频提示词：video_start_prompt（首帧→中间）和 video_end_prompt（中间→尾帧）
 * 2. 用角色外貌描述替代角色名字（视频模型无法识别名字）
 * 3. 加入时长参数，让模型控制动作节奏
 *
 * 逻辑：
 * 1. 查询分镜及所属项目、剧本信息
 * 2. 获取上下文分镜、角色、场景信息
 * 3. 调用文本模型优化提示词（含反向提示词），针对动态视频特性
 * 4. 返回优化结果（不写回数据库，由前端保存）
 *
 * input:  { storyboardId, prompt, textModel }
 * output: { videoStartPrompt, videoEndPrompt, negativePrompt, model, originalLength, optimizedLength }
 */

const { queryOne, queryAll } = require('../../../dbHelper');
const { callAIModel, getTextModels } = require('../../../aiModelService');
const { withAIBillingContext } = require('../../../aiBillingContext');
const { analyzeActionAmplitude } = require('./analyzeActionType'); // 新增：动作类型分析器

async function handleSingleVideoPromptOptimization(inputParams, onProgress) {
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
  // 【重要改进】：用简短外貌描述替代角色名字，因为视频模型无法识别角色名字
  let characterContext = '';
  let characterVisualIdentifiers = []; // 用于视频提示词的视觉标识符列表
  
  if (currentCharacters.length > 0) {
    characterContext = `\n【当前分镜角色】${currentCharacters.join('、')}`;
    try {
      const charNames = currentCharacters.map(n => `'${n.replace(/'/g, "''")}'`).join(',');
      const charDetails = await queryAll(
        `SELECT name, appearance, description FROM characters WHERE project_id = ? AND name IN (${charNames})`,
        [storyboard.project_id]
      );
      if (charDetails.length > 0) {
        characterContext += '\n角色外貌特征：';
        for (const cd of charDetails) {
          characterContext += `\n  - ${cd.name}：${(cd.appearance || '未设置').slice(0, 200)}`;
          
          // 提取简短的视觉标识符（20-30字），用于视频提示词中区分角色
          const shortDesc = (cd.appearance || cd.description || '').slice(0, 50).replace(/\n/g, ' ');
          characterVisualIdentifiers.push({
            name: cd.name,
            visualId: shortDesc || '未设置外貌描述'
          });
        }
      }
    } catch (e) { /* 忽略 */ }
  }
  if (currentLocation) {
    characterContext += `\n【当前分镜场景】${currentLocation}`;
  }

  if (onProgress) onProgress(35);

  // 8. 【新增】智能分析动作类型，决定是否需要尾帧
  const actionAnalysis = analyzeActionAmplitude(prompt, currentCharacters);
  console.log(`[VideoPromptOptimization] 分镜 ${storyboardId} 动作分析结果:`, actionAnalysis);

  // 根据动作类型调整系统提示词
  let videoPromptStrategy = '';
  if (!actionAnalysis.useEndFrame) {
    // 自由运动模式（大幅度/中幅度/空镜头）
    videoPromptStrategy = `
【视频生成策略】FREE_MOTION（自由运动模式）
当前分镜为${actionAnalysis.actionLevel === 'empty_shot' ? '空镜头' : actionAnalysis.actionLevel === 'large' ? '大幅度动作' : '中幅度动作'}，不设置尾帧限制。
只需生成一个视频提示词，描述完整的动态过程，让视频模型自由发挥动作节奏和过渡。`;
  } else {
    // 强约束模式（小幅度动作）
    videoPromptStrategy = `
【视频生成策略】STRONG_CONSTRAINT（强约束模式）
当前分镜为小幅度动作，需要精确控制结束姿态。
生成两个独立的视频提示词：
• videoStartPrompt：描述起始状态和动作开始
• videoEndPrompt：描述结束状态和最终姿态`;
  }

  // 9. 构建系统提示词（针对动态视频生成优化）
  const scriptContent = storyboard.script_content || '';
  const scriptSection = scriptContent
    ? `\n【剧本全文】\n${scriptContent.length > 3000 ? scriptContent.slice(0, 3000) + '\n...(剧本过长，已截断)' : scriptContent}\n`
    : '';

  const optimizationPrinciples = isLiveAction
    ? `【真人实拍视频优化原则】
1. 先通读剧本，理解故事全貌、人物关系和情节走向
2. 确认当前分镜在故事中的时间线位置和情感基调
3. 对照前后分镜，确保角色状态、场景、情绪的连贯性
4. 如果发现当前描述与剧本内容或前后分镜有矛盾，修正使其一致

【基础画面要素 - 视频同样需要】
视频不是只有动态，每一帧都是独立的静态画面。必须同时描述基础视觉要素：
• 构图：初始画面构图方式（三分法/黄金分割/对称/对角线/引导线/框架式构图），视觉重心位置，运镜过程中构图如何演变
• 透视：初始透视类型（一点透视/两点透视/三点透视/空气透视），空间纵深感，运镜是否改变透视关系
• 景别：初始景别（远景/全景/中景/近景/特写/大特写），叙事功能，运镜过程中景别如何变化
• 焦点：视觉焦点位置，虚实层次（前景虚化/背景虚化），是否涉及跟焦/移焦
• 镜头：镜头类型（定焦/变焦/微距/长焦/广角），变焦过程的视觉变化
• 快门角度：快门角度对运动模糊的影响（180度规则：1/48秒对应24fps产生自然运动模糊，高速快门凝固瞬间，慢门呈现流动感）
• 色彩：色温设定（暖调/冷调/中性），色彩风格，色彩随时间或光源变化的过渡

【动态视频核心要素 - 真人实拍】
• 运动描述：主体运动轨迹、运动速度、动作幅度、加速度变化，描述动作的完整过程（起始姿态→运动过程→结束姿态）
• 运镜指令：相机运动方式（推/拉/摇/移/跟/升降/环绕/手持稳定/肩扛呼吸感），运动速度、起止点、运动动机
• 帧率：拍摄帧率选择（24fps电影感/30fps标准/60fps高帧率慢动作），帧率对运动流畅度的影响
• 时间叙事：镜头开始状态 -> 中间过程变化 -> 结束状态的完整时间线，描述随时间推移的画面变化
• 动态元素：风的吹动（头发、衣摆、树叶）、水流（波纹、飞溅）、粒子飘动（雪花、尘埃）、火焰摇曳、光影随时间变化
• 环境持续性：持续性效果（雨雪、火焰、烟雾）必须在整个视频时长内保持，不得中途消失或突然变化

【帧间一致性约束 - 真人实拍关键】
• 角色一致性：视频中角色外貌、服装、发型在多帧间必须保持连贯，不得突然变化
• 光照连续性：光线方向、强度、色温在视频全程保持一致，除非剧情要求光照变化
• 场景连续性：场景环境、物体位置、背景元素不得突然消失或改变
• 物理合理性：角色动作应符合物理规律，重力、惯性、动量守恒

【情绪叠加理论 - 真人表情动态核心】
真人面部表情极少是单一情绪，而是多种情绪的百分比混合。在视频中，微表情应有细微的动态变化：
• 分析剧情上下文，将角色当前情绪分解为2-4种基础情绪的权重组合
• 基础情绪谱：joy（喜悦）、sadness（悲伤）、anger（愤怒）、fear（恐惧）、surprise（惊讶）、disgust（厌恶）、contempt（轻蔑）、trust（信任）
• 描述要求：先用百分比标注情绪配方，再翻译为具体的面部微表情（眉毛、眼睛、嘴角、肌肉张力）
• 动态要求：视频中微表情应有自然变化（如眼神闪烁、嘴角微颤、眨眼），而非僵硬的静态表情
• 嘴型同步：如有台词，说话角色的嘴型必须与台词同步，未说话的角色嘴唇保持不动

【光影与环境氛围 - 时间维度】
• 自然光：黄金时刻/蓝调时刻/正午硬光/阴天柔光，光线随时间的变化（如日落时色温逐渐变暖）
• 人工光：主光位置、辅光比例、轮廓光、眼神光，光源的稳定性或变化
• 动态光影：移动的光斑、摇曳的树影、闪烁的烛光、透过窗户移动的阳光
• 场景氛围：烟雾的流动、雨丝的飘洒、尘土的飞扬、光斑的闪烁

【材质质感与动态表现 - 真人实拍核心】
你必须为画面中的关键元素添加专业的材质质感描述，增强画面真实感和细节丰富度：
• 皮肤质感：根据角色年龄、性别、情绪状态描述皮肤纹理（细腻光滑/粗糙晒伤/毛孔可见/皱纹沟壑/油光/干裂），关注光线对皮肤质感的影响（侧光凸显纹理、柔光弱化纹理、逆光产生轮廓光），动态中的变化
• 服装面料：明确面料类型与视觉特征（丝绸→光泽流淌、垂坠感；棉麻→哑光、自然褶皱；皮革→反光高光、纹理沟槽；毛料→蓬松纤维、漫反射；雪纺→半透明、轻柔飘逸），面料在运动中的动态表现（丝绸飘动、皮革褶皱变化、棉麻随风摆动），面料在光线下的表现
• 环境材质：描述场景中主要材质的质感特征（金属→镜面反射/拉丝纹理/氧化锈蚀；木材→木纹肌理/光滑漆面/粗糙原木；石材→颗粒感/抛光面/风化裂纹；玻璃→透明折射/磨砂漫射/反光倒影）及动态表现（水面波纹、金属反光晃动、玻璃折射变化）
• 物品表面：标注表面处理工艺（哑光/光泽/半光泽）和质感细节（纹理走向、磨损痕迹、指纹、水渍、灰尘覆盖）
• 融合要求：材质描述必须自然融入画面描述，符合场景逻辑和视觉风格`
    : `【动漫动画视频优化原则】
1. 先通读剧本，理解故事全貌、人物关系和情节走向
2. 确认当前分镜在故事中的时间线位置和情感基调
3. 对照前后分镜，确保角色状态、场景、情绪的连贯性
4. 保持造型一致性，角色外观特征在多帧间不得突变

【基础画面要素 - 视频同样需要】
视频不是只有动态，每一帧都是独立的静态画面。必须同时描述基础视觉要素：
• 构图：初始画面构图方式（三分法/黄金分割/对称/对角线/引导线），视觉重心位置，画面平衡感，运镜过程中构图如何演变
• 机位：机位高度（平视/俯视/仰视/虫视/鸟视），与被摄体的距离关系
• 透视：初始透视类型（一点透视/两点透视/三点透视/空气透视），空间纵深感
• 景别：初始景别（远景/全景/中景/近景/特写/大特写），叙事功能
• 焦点：视觉焦点位置，虚实层次（前景虚化/背景虚化/移焦效果），层次分明，主体突出
• 色指定：主色调、配色方案、色彩情绪、色彩对比关系
• 造型一致性：角色设计特征保持，表情变化规律，不同角度造型统一

【动态视频核心要素 - 动漫动画】
• 运动描述：主体运动轨迹、运动速度、动作幅度、加速度变化，描述动作的完整过程（起始姿态→运动过程→结束姿态）
• 运镜指令：相机运动方式（推/拉/摇/移/跟/升降/环绕），运动速度、起止点
• 张数：关键帧张数估算，动作密度（单拍/双拍/三拍），影响动作流畅度
• 动态表现：运动轨迹、速度线、变形夸张、弹性运动、跟随动作、重叠动作
• 时间节奏：快节奏/慢节奏/停顿/节奏变化点，动作的时间分配
• 时间叙事：镜头开始状态 -> 中间过程变化 -> 结束状态的完整时间线
• 动态元素：风的吹动（头发、衣摆）、水流、粒子效果、火焰、魔法特效的运动
• 环境持续性：持续性效果（雨雪、火焰、烟雾）必须在整个视频时长内保持

【帧间一致性约束 - 动漫动画关键】
• 角色一致性：视频中角色外貌、服装、发型在多帧间必须保持连贯，不得突然变化或崩坏
• 造型稳定：角色比例、五官位置、身体结构在动态中保持稳定
• 光照连续性：光线方向、强度、阴影位置在视频全程保持一致
• 场景连续性：场景环境、物体位置、背景元素不得突然消失或改变

【动画制作优化 - 动画技术要素】
• 分层：前景层/中景层/背景层/特效层，各层独立运动，便于后期合成
• 动作分解：将复杂动作分解为预备动作→主要动作→缓冲动作
• 跟随与重叠：服装、头发等附属物的延迟跟随动作，增强真实感
• 节奏控制：关键帧之间的时间分配，加速/减速曲线

【材质质感与动态表现 - 动漫动画核心】
你必须为画面中的关键元素添加符合动漫风格的材质质感描述，增强画面细节丰富度：
• 皮肤质感：根据角色设定描述皮肤表现风格（赛璐璐→平面均匀色块、无纹理；半写实→柔和渐变、隐约毛孔；厚涂→笔触可见、肌理丰富），动漫皮肤通常追求光洁感，用高光和阴影暗示体积，动态中的高光和阴影变化
• 服装面料：用色块和线条表现面料特征（丝绸→高光色带、流畅曲线；棉麻→柔和色块、少高光；皮革→锐利高光、深色阴影；毛料→柔和边缘、暖色漫反射），面料在运动中的动态（丝绸飘动、斗篷扬起、裙摆摇摆）
• 环境材质：用动画表现手法描述场景材质（金属→锐利高光线、冷色反光；木材→暖色调、木纹用线条暗示；石材→粗颗粒网点、灰色调；玻璃→透明色层叠加、折射变形）及动态变化（水面波纹、树叶摇曳、旗帜飘扬）
• 物品表面：用渲染风格标注质感（平涂→无质感变化；渐变→柔和过渡暗示曲面；网点→印刷质感），注意日式动画与美式动画的质感表现差异
• 特效材质：魔法光效、能量波动、粒子特效的动态表现
• 融合要求：材质描述必须自然融入画面描述，与整体动画风格一致（如赛璐璐风格不描述毛孔纹理、厚涂风格不描述色块边界）；材质选择符合场景世界观逻辑`;

  const systemPrompt = `你是一个专业的分镜描述优化专家，专门为动态视频生成模型（如Seedance、Kling、Runway等）优化提示词。你需要先理解整个剧本的内容和脉络，明确当前分镜在故事中的位置，然后再优化当前分镜的描述。

【项目】${storyboard.project_name || '未命名'}${storyboard.script_title ? `\n【剧本标题】${storyboard.script_title}` : ''}${scriptSection}\n【分镜上下文】共 ${totalCount} 个分镜，当前为第 ${currentIdx + 1} 个：
${storyboardContext}${characterContext}${visualStyle ? `\n【视觉风格】${visualStyle}` : ''}${perspectiveInstruction ? `\n${perspectiveInstruction}` : ''}\n【风格类型】${isLiveAction ? '真人实拍' : '动漫动画'}\n【输出目标】动态视频生成（视频模型）

${videoPromptStrategy}

**【核心改进】角色标识方式：**
视频模型（Seedance/Kling/Runway）**无法识别角色名字**！你必须用**简短的外貌描述**来区分角色。
例如：不要用 "秦战拿起剑"，而要用 "中年男性将军（黑色短发，深色铠甲，面部有刀疤）拿起剑"。
角色视觉标识符列表：
${characterVisualIdentifiers.map(c => `- "${c.name}" → "${c.visualId}"`).join('\n')}
在提示词中**完全用视觉标识符替代角色名字**。

${optimizationPrinciples}

${!actionAnalysis.useEndFrame ? `
【输出要求 - 视频提示词（自由运动模式）】
只需生成一个完整的视频提示词，描述从开始到结束的完整动态过程：
• 描述完整的动作序列和动态过程
• 使用角色视觉标识符（外貌描述）而非名字
• 包含明确的起始状态、动作过程和结束状态
• 让模型自由控制动作节奏和过渡，不要限制时间分配${actionAnalysis.actionLevel === 'empty_shot' ? '\n• **【空镜头关键约束】当前分镜为空镜头/场景过场动画，提示词中绝对不能描述任何人、角色、生物或人形轮廓。只能描述场景环境、自然元素（风、雨、雪、光、烟）、无机物（建筑、兵器、旗帜等）和相机运镜。' : ''}
` : `
【输出要求 - 视频首帧提示词 videoStartPrompt】
这是视频的**起始阶段**：
• 描述起始状态和动作开始
• 使用角色视觉标识符（外貌描述）而非名字
• 包含明确的起始姿态和情绪

【输出要求 - 视频尾帧提示词 videoEndPrompt】
这是视频的**结束阶段**：
• 描述结束状态和最终姿态
• 使用角色视觉标识符（外貌描述）而非名字
• 包含明确的结束姿态和情绪变化
`}

【输出要求 - 反向提示词（Negative Prompt）】
你必须同时生成反向提示词，用于排除视频中不应该出现的内容。参考以下信息：
1. 项目视觉风格：${visualStyle || '未指定'}，排除与该风格冲突的元素
2. 分镜正向提示词的内容范围：只描述画面应有的内容，排除所有不应该出现的多余元素
反向提示词生成规则：
• 排除与当前场景、角色、情绪无关的视觉元素
• 排除与视觉风格冲突的表现形式（如动漫风格排除"写实、真人、照片"，写实风格排除"卡通、动漫、插画"）
• 排除常见画面缺陷（低质量、模糊、变形、多余肢体、水印、文字、签名）
• 排除视频专属缺陷（画面抖动、跳帧、闪烁、画面撕裂、运动不连贯、卡顿、角色突然变形或消失）
• 排除与当前情绪氛围不符的元素（如悲伤场景排除"微笑、明亮"）${actionAnalysis.actionLevel === 'empty_shot' ? '\n• **【空镜头关键约束】当前为空镜头/场景过场动画，反向提示词必须排除：人物、角色、人形、人类轮廓、生物、动物、任何有生命体' : ''}
• 反向提示词用中文描述，词语间用英文逗号分隔

【输出格式】
严格按以下 JSON 格式输出，不要添加任何其他内容：
${!actionAnalysis.useEndFrame ? 
`{"videoPrompt": "完整视频提示词（自由运动模式）", "negative": "反向提示词，中文描述，英文逗号分隔"}` :
`{"videoStartPrompt": "视频首帧提示词（起始状态）", "videoEndPrompt": "视频尾帧提示词（结束状态）", "negative": "反向提示词，中文描述，英文逗号分隔"}`
}`;

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
  let videoPrompt = ''; // 自由运动模式：单个完整提示词
  let videoStartPrompt = ''; // 强约束模式：首帧提示词
  let videoEndPrompt = ''; // 强约束模式：尾帧提示词
  let negativePrompt = '';
  
  if (typeof response === 'string') {
    // 直接使用字符串响应（非 JSON 格式）
    videoPrompt = response;
  } else if (response?.content) {
    videoPrompt = response.content;
  } else if (response?.text) {
    videoPrompt = response.text;
  } else if (response?.message) {
    videoPrompt = response.message;
  }

  if (!videoPrompt) throw new Error('AI 模型返回内容为空');

  // 清理：去除可能的引号包裹和多余空白
  videoPrompt = videoPrompt.replace(/^["'""]+|["'""]+$/g, '').trim();

  // 尝试解析 JSON 格式
  try {
    if (!actionAnalysis.useEndFrame) {
      // 自由运动模式：解析单个 videoPrompt
      const jsonMatch = videoPrompt.match(/\{[\s\S]*"videoPrompt"[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        if (parsed.videoPrompt) videoPrompt = parsed.videoPrompt.trim();
        if (parsed.negative) negativePrompt = parsed.negative.trim();
      }
    } else {
      // 强约束模式：解析 videoStartPrompt 和 videoEndPrompt
      const jsonMatch = videoPrompt.match(/\{[\s\S]*"videoStartPrompt"[\s\S]*"videoEndPrompt"[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        if (parsed.videoStartPrompt) videoStartPrompt = parsed.videoStartPrompt.trim();
        if (parsed.videoEndPrompt) videoEndPrompt = parsed.videoEndPrompt.trim();
        if (parsed.negative) negativePrompt = parsed.negative.trim();
      } else {
        // 兼容旧的 JSON 格式
        const oldJsonMatch = videoPrompt.match(/\{[\s\S]*"positive"[\s\S]*"negative"[\s\S]*\}/);
        if (oldJsonMatch) {
          const parsed = JSON.parse(oldJsonMatch[0]);
          if (parsed.positive) {
            videoStartPrompt = parsed.positive.trim();
            videoEndPrompt = parsed.positive.trim();
          }
          if (parsed.negative) negativePrompt = parsed.negative.trim();
        }
      }
    }
  } catch (e) {
    console.warn('[VideoPromptOptimization] JSON 解析失败，使用原始文本:', e.message);
  }
  if (onProgress) onProgress(100);

  console.log(`[SingleVideoPromptOptimize] storyboardId=${storyboardId}, model=${modelName}, actionLevel=${actionAnalysis.actionLevel}, useEndFrame=${actionAnalysis.useEndFrame}`);
  if (!actionAnalysis.useEndFrame) {
    console.log(`  -> videoPrompt=${videoPrompt.length}chars, negative=${negativePrompt.length}chars`);
  } else {
    console.log(`  -> videoStart=${videoStartPrompt.length}chars, videoEnd=${videoEndPrompt.length}chars, negative=${negativePrompt.length}chars`);
  }

  return {
    videoPrompt: !actionAnalysis.useEndFrame ? videoPrompt : undefined,
    videoStartPrompt: actionAnalysis.useEndFrame ? videoStartPrompt : undefined,
    videoEndPrompt: actionAnalysis.useEndFrame ? videoEndPrompt : undefined,
    negativePrompt,
    model: modelName,
    originalLength: prompt.length,
    actionAnalysis, // 新增：返回动作分析结果
    videoPromptLength: !actionAnalysis.useEndFrame ? videoPrompt.length : undefined,
    videoStartLength: actionAnalysis.useEndFrame ? videoStartPrompt.length : undefined,
    videoEndLength: actionAnalysis.useEndFrame ? videoEndPrompt.length : undefined
  };
}

module.exports = handleSingleVideoPromptOptimization;
