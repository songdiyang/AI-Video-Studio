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
const { callAIModel, getTextModels, getMultimodalModels } = require('../../../aiModelService');
const { withAIBillingContext } = require('../../../aiBillingContext');
const { analyzeActionAmplitude } = require('./analyzeActionType'); // 新增：动作类型分析器
const handleVisionFrameAnalysis = require('./visionFrameAnalysis'); // 多模态视觉分析

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

  // 2. 获取当前分镜的角色、场景信息和帧图片URL
  let currentCharacters = [];
  let currentLocation = '';
  let firstFrameUrl = null;
  let lastFrameUrl = null;
  try {
    const storyboardDetail = await queryOne(
      'SELECT variables_json, first_frame_url, last_frame_url FROM storyboards WHERE id = ?',
      [storyboardId]
    );
    if (storyboardDetail && storyboardDetail.variables_json) {
      const vars = typeof storyboardDetail.variables_json === 'string'
        ? JSON.parse(storyboardDetail.variables_json)
        : storyboardDetail.variables_json;
      currentCharacters = vars.characters || [];
      currentLocation = vars.location || '';
    }
    firstFrameUrl = storyboardDetail?.first_frame_url || null;
    lastFrameUrl = storyboardDetail?.last_frame_url || null;
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

  // 4. 确定使用的文本模型和多模态模型
  let modelName = requestedModel;
  if (!modelName) {
    const textModels = await getTextModels();
    if (textModels.length === 0) throw new Error('没有可用的文本模型');
    modelName = textModels[0].name;
  }

  // 4.5. 【新增】多模态视觉分析：分析首帧/尾帧图片
  let visualAnalysis = null;
  const frameUrls = [];
  if (firstFrameUrl) frameUrls.push(firstFrameUrl);
  if (lastFrameUrl) frameUrls.push(lastFrameUrl);

  if (frameUrls.length > 0) {
    // 优先使用 textModel（如果它支持 vision），否则自动选择第一个多模态模型
    let visionModel = modelName;
    const multimodalModels = await getMultimodalModels();
    if (multimodalModels.length > 0) {
      // 检查当前模型是否支持 vision
      const visionKeywords = ['vision', 'multimodal', 'vl', '4o', 'opus', 'gemini', 'pro-vision', 'seed', 'doubao-seed', 'glm-4v'];
      const nameLower = modelName.toLowerCase();
      const isVisionCapable = visionKeywords.some(k => nameLower.includes(k));
      if (!isVisionCapable) {
        visionModel = multimodalModels[0].name;
      }
    }

    console.log(`[VideoPromptOptimization] 开始视觉分析，图片数: ${frameUrls.length}, 模型: ${visionModel}`);
    try {
      visualAnalysis = await handleVisionFrameAnalysis({
        imageUrls: frameUrls,
        description: prompt,
        textModel: visionModel
      });
      if (visualAnalysis) {
        console.log(`[VideoPromptOptimization] 视觉分析完成，角色数: ${visualAnalysis.characters?.length || 0}, 元素数: ${visualAnalysis.detailedElements?.length || 0}`);
      }
    } catch (visionErr) {
      console.warn('[VideoPromptOptimization] 视觉分析失败，降级到纯文本:', visionErr.message);
    }
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

  // 7. 构建角色和场景上下文（使用白膜+服装分层 + 激活状态）
  // 【重要改进】：用简短外貌描述替代角色名字，因为视频模型无法识别角色名字
  let characterContext = '';
  let characterVisualIdentifiers = []; // 用于视频提示词的视觉标识符列表
  
  if (currentCharacters.length > 0) {
    characterContext = `\n【当前分镜角色】${currentCharacters.join('、')}`;
    try {
      const charNames = currentCharacters.map(n => `'${n.replace(/'/g, "''")}'`).join(',');
      const charDetails = await queryAll(
        `SELECT c.name, c.appearance, c.base_appearance, c.outfit_appearance, c.description,
                cs.name AS active_state_name, cs.outfit AS active_outfit, cs.hairstyle AS active_hairstyle, cs.accessories AS active_accessories, cs.age_stage AS active_age_stage
         FROM characters c
         LEFT JOIN character_states cs ON cs.character_id = c.id AND cs.is_active = 1 AND cs.is_base_model = 0
         WHERE c.project_id = ? AND c.name IN (${charNames})`,
        [storyboard.project_id]
      );
      if (charDetails.length > 0) {
        characterContext += '\n角色外貌特征（白膜体貌+服装状态）：';
        for (const cd of charDetails) {
          const parts = [];
          if (cd.base_appearance) parts.push(cd.base_appearance);
          const outfitDesc = cd.active_outfit || cd.outfit_appearance;
          if (outfitDesc) parts.push(outfitDesc);
          if (cd.active_hairstyle) parts.push(`发型: ${cd.active_hairstyle}`);
          if (cd.active_accessories) parts.push(`配饰: ${cd.active_accessories}`);
          if (cd.active_age_stage) parts.push(`年龄: ${cd.active_age_stage}`);
          const fullAppearance = parts.length > 0 ? parts.join('；') : cd.appearance;
          characterContext += `\n  - ${cd.name}：${(fullAppearance || '未设置').slice(0, 300)}${cd.active_state_name ? `（状态: ${cd.active_state_name}）` : ''}`;
          
          // 提取简短的视觉标识符（20-30字），用于视频提示词中区分角色
          const shortDesc = (fullAppearance || cd.description || '').slice(0, 50).replace(/\n/g, ' ');
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
  // 不注入剧本全文，仅使用分镜上下文和角色信息，避免提示词过长导致超时

  // 【新增】格式化视觉分析结果为文本，注入系统提示词
  function formatVisualAnalysisForPrompt(analysis) {
    if (!analysis) return '';
    const parts = [];

    // 画面整体描述
    if (analysis.visualDescription) {
      parts.push(`【画面整体描述】${analysis.visualDescription}`);
    }

    // 详细元素
    if (analysis.detailedElements && analysis.detailedElements.length > 0) {
      parts.push('【画面中的视觉元素】');
      for (const el of analysis.detailedElements) {
        const attrs = [];
        if (el.position) attrs.push(`位置: ${el.position}`);
        if (el.size) attrs.push(`大小: ${el.size}`);
        if (el.material) attrs.push(`材质: ${el.material}`);
        if (el.state) attrs.push(`状态: ${el.state}`);
        if (el.motionPotential) attrs.push(`运动潜力: ${el.motionPotential}`);
        parts.push(`  - ${el.name || '未知元素'} (${el.type || '未知类型'})${attrs.length > 0 ? '：' + attrs.join('，') : ''}`);
      }
    }

    // 运动分析
    if (analysis.motionAnalysis) {
      const ma = analysis.motionAnalysis;
      if (ma.characterMotions && ma.characterMotions.length > 0) {
        parts.push('【角色运动分析】');
        for (const cm of ma.characterMotions) {
          parts.push(`  - ${cm.name || '角色'}: 当前姿态「${cm.currentPose || '未知'}」，建议运动「${cm.suggestedMotion || '无'}」`);
          if (cm.possibleActions && cm.possibleActions.length > 0) {
            parts.push(`    可能动作: ${cm.possibleActions.join('、')}`);
          }
          if (cm.physicalConstraints) {
            parts.push(`    物理限制: ${cm.physicalConstraints}`);
          }
        }
      }
      if (ma.objectInteractions && ma.objectInteractions.length > 0) {
        parts.push('【物体互动分析】');
        for (const oi of ma.objectInteractions) {
          parts.push(`  - ${oi.objects?.join(' 与 ') || '物体'}: ${oi.interactionType || ''} ${oi.interactionDynamics || ''}`);
        }
      }
      if (ma.cameraMovementPotential) {
        parts.push(`【推荐摄像机运动】${ma.cameraMovementPotential}`);
      }
      if (ma.dynamicComposition) {
        parts.push(`【动态构图建议】${ma.dynamicComposition}`);
      }
      if (ma.lightingDynamics) {
        parts.push(`【光影动态潜力】${ma.lightingDynamics}`);
      }
    }

    return parts.join('\n');
  }

  const visualAnalysisSection = formatVisualAnalysisForPrompt(visualAnalysis);

  const optimizationPrinciples = isLiveAction
    ? `【真人实拍视频优化原则】
1. 先理解剧本，明确当前分镜在故事中的位置和情感基调
2. 对照前后分镜，确保角色状态、场景、情绪的连贯性
3. 用角色外貌描述替代角色名字（视频模型无法识别名字）

【基于视觉分析的运动描述要求】
根据上述【画面视觉分析】结果，生成精准的运动描述：
• 角色运动：每个角色的具体运动轨迹（起点→路径→终点）、速度变化、身体各部位动作细节
• 物体运动：场景中物体的运动方式（滚动/滑动/漂浮/坠落等）、受力和反作用力表现
• 元素互动：角色与物体、角色与角色、物体与环境之间的物理互动
• 摄像机运动：推/拉/摇/移/跟/升降/环绕的具体参数（速度、幅度、焦点变化）
• 时间节奏：运动在时间轴上的加速/减速/停顿/突变节点
• 光影动态：光源移动、阴影变化、反射折射随运动的演变
• 必须尊重物理限制：坐姿角色不能突然站立奔跑，手持物品限制手臂运动范围

【视频提示词核心要素】
• 构图与景别：初始构图方式、景别范围、视觉重心
• 运镜指令：推/拉/摇/移/跟/升降/环绕等相机运动方式
• 运动描述：主体运动轨迹、速度、幅度，完整动作过程（起始→过程→结束）
• 光影氛围：光源类型、色温、光线方向、动态光影变化
• 时间叙事：镜头开始状态→中间变化→结束状态的完整时间线
• 材质质感：皮肤、服装、环境材质的关键特征
• 情绪表达：角色情绪通过面部微表情和肢体语言体现
• 一致性约束：角色外貌、服装、光照、场景在多帧间保持连贯`
    : `【动漫动画视频优化原则】
1. 先理解剧本，明确当前分镜在故事中的位置和情感基调
2. 对照前后分镜，确保角色状态、场景、情绪的连贯性
3. 保持造型一致性，角色外观特征在多帧间不得突变
4. 用角色外貌描述替代角色名字

【基于视觉分析的运动描述要求】
根据上述【画面视觉分析】结果，生成精准的运动描述：
• 角色运动：每个角色的具体运动轨迹（起点→路径→终点）、速度变化、身体各部位动作细节
• 物体运动：场景中物体的运动方式（滚动/滑动/漂浮/坠落等）、受力和反作用力表现
• 元素互动：角色与物体、角色与角色、物体与环境之间的物理互动
• 摄像机运动：推/拉/摇/移/跟/升降/环绕的具体参数（速度、幅度、焦点变化）
• 时间节奏：运动在时间轴上的加速/减速/停顿/突变节点
• 光影动态：光源移动、阴影变化、反射折射随运动的演变
• 必须尊重物理限制：角色运动要符合其当前姿态和环境的物理约束

【视频提示词核心要素】
• 构图与景别：画面分割方式、景别范围、视觉重心
• 运镜指令：推/拉/摇/移/跟/升降/环绕等相机运动
• 运动描述：主体运动轨迹、速度、幅度，完整动作过程
• 光影氛围：光源类型、色温、光线方向
• 时间叙事：镜头开始→中间变化→结束状态的完整时间线
• 材质质感：符合动漫风格的皮肤、服装、环境材质描述
• 情绪表达：角色情绪通过面部表情和肢体语言体现
• 一致性约束：角色比例、造型、光照、场景在多帧间保持连贯`;

  const systemPrompt = `你是一个专业的视频提示词优化专家，为动态视频生成模型（Seedance/Kling/Runway等）优化提示词。

【项目】${storyboard.project_name || '未命名'}${storyboard.script_title ? `\n【剧本标题】${storyboard.script_title}` : ''}\n【分镜上下文】共 ${totalCount} 个分镜，当前为第 ${currentIdx + 1} 个：
${storyboardContext}${characterContext}${visualStyle ? `\n【视觉风格】${visualStyle}` : ''}${perspectiveInstruction ? `\n${perspectiveInstruction}` : ''}\n【风格类型】${isLiveAction ? '真人实拍' : '动漫动画'}

${videoPromptStrategy}

**角色标识方式：**
视频模型无法识别角色名字，必须用简短外貌描述区分角色。
角色视觉标识符：
${characterVisualIdentifiers.map(c => `- "${c.name}" → "${c.visualId}"`).join('\n')}
提示词中完全用视觉标识符替代角色名字。

${visualAnalysisSection ? `\n【画面视觉分析】\n${visualAnalysisSection}\n` : ''}

${optimizationPrinciples}

${!actionAnalysis.useEndFrame ? `
【输出要求 - 视频提示词】
生成一个完整的视频提示词，描述从开始到结束的动态过程：
• 使用角色视觉标识符（外貌描述）而非名字
• 包含起始状态、动作过程、结束状态
• 让模型自由控制动作节奏${actionAnalysis.actionLevel === 'empty_shot' ? '\n• **空镜头约束**：不能描述任何人物/生物，只能描述场景环境、自然元素、无机物和运镜' : ''}
` : `
【输出要求 - 视频首帧提示词 videoStartPrompt】
描述起始状态和动作开始，使用角色视觉标识符。

【输出要求 - 视频尾帧提示词 videoEndPrompt】
描述结束状态和最终姿态，使用角色视觉标识符。
`}

【输出要求 - 反向提示词】
排除与当前场景/风格冲突的元素、常见画面缺陷、视频专属缺陷（抖动/跳帧/闪烁/撕裂）。
用中文描述，英文逗号分隔。

【输出格式】
严格按以下 JSON 格式输出，不要添加任何其他内容：
${!actionAnalysis.useEndFrame ? 
`{"videoPrompt": "完整视频提示词", "negative": "反向提示词"}` :
`{"videoStartPrompt": "首帧提示词", "videoEndPrompt": "尾帧提示词", "negative": "反向提示词"}`
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
