/**
 * 批量分镜提示词优化处理器
 * 逐个优化指定脚本下所有分镜的描述文字（并发池模式）
 *
 * 逻辑：
 * 1. 查询 scriptId 下所有分镜
 * 2. 过滤出有描述内容的分镜
 * 3. 以并发池模式优化每个分镜描述（调用文本模型）
 * 4. 将优化结果写回 prompt_template
 *
 * input:  { scriptId, textModel, maxConcurrency }
 * output: { total, completed, skipped, failed, results[] }
 */

const { queryAll, queryOne, execute } = require('../../../dbHelper');
const { callAIModel, getTextModels } = require('../../../aiModelService');
const { withAIBillingContext } = require('../../../aiBillingContext');
const { runPool } = require('../../utils/concurrencyPool');

// ============================================================
// 单个分镜提示词优化核心逻辑（从 optimizePrompt.js 提取）
// ============================================================
async function optimizeSinglePrompt({ storyboard, allStoryboards, currentIdx, modelName }) {
  const prompt = storyboard.prompt_template;
  if (!prompt || !prompt.trim()) return null;

  const totalCount = allStoryboards.length;

  // 构建分镜上下文摘要（前后各3个分镜）
  const contextRange = 3;
  const contextStart = Math.max(0, currentIdx - contextRange);
  const contextEnd = Math.min(totalCount, currentIdx + contextRange + 1);
  const contextStoryboards = allStoryboards.slice(contextStart, contextEnd);

  let storyboardContext = '';
  for (const sb of contextStoryboards) {
    const desc = sb.prompt_template || sb.spatial_description || '(空)';
    const isCurrent = sb.id === storyboard.id;
    const marker = isCurrent ? ' 👈 [当前分镜]' : '';
    const truncated = desc.length > 150 ? desc.slice(0, 150) + '...' : desc;
    storyboardContext += `  分镜 #${sb.idx + 1}: ${truncated}${marker}\n`;
  }

  // 提取视觉风格
  let visualStyle = '';
  let perspectiveInstruction = '';
  // 拍摄视角（项目级配置，注入到 system prompt 强制 AI 遵守；第一人称项目禁止第三人称镜头）
  try {
    const { getNarrativePerspective } = require('../../../utils/getProjectStyle');
    const perspective = await getNarrativePerspective(storyboard.project_id);
    perspectiveInstruction = perspective.promptInstruction || '';
  } catch (e) {
    // 读取失败不影响优化本身
  }
  try {
    const settings = typeof storyboard.settings_json === 'string'
      ? JSON.parse(storyboard.settings_json || '{}')
      : (storyboard.settings_json || {});
    visualStyle = settings.visualStylePrompt || settings.visual_style_prompt || '';
    const visualStyleLabel = settings.visualStyle || '';

    // 判断真人/动漫
    const isLiveAction = ['写实电影', '时尚摄影', '纪实风格', '电影感剧情'].includes(visualStyleLabel) ||
      /写实|电影|摄影|纪实|realistic|cinematic|photography/i.test(visualStyle);

    const optimizationPrinciples = isLiveAction
      ? `【真人实拍优化原则】
1. 先通读剧本，理解故事全貌、人物关系和情节走向
2. 确认当前分镜在故事中的时间线位置和情感基调
3. 对照前后分镜，确保角色状态、场景、情绪的连贯性
4. 如果发现当前描述与剧本内容或前后分镜有矛盾，修正使其一致

【镜头语言优化 - 真人实拍核心要素】
• 镜头：明确镜头类型（定焦/变焦/微距/长焦/广角），说明镜头选择对画面的影响
• 光圈：标注光圈值（f/1.4-f/22），描述景深效果
• 焦距：说明焦距范围（广角14-35mm/标准50mm/长焦85-200mm）
• 快门：快门速度对运动模糊的影响
• 景深：明确焦点位置和景深范围
• 帧率：拍摄帧率选择（24fps电影感/30fps标准/60fps高帧率）
• 运镜：运镜方式（推/拉/摇/移/跟/升降/环绕/手持稳定/肩扛呼吸感）
• 曝光：曝光控制（高调/低调/正常），光比关系
• 色彩：色温设定（暖调/冷调/中性），色彩风格

【情绪叠加理论 - 真人表情核心】
真人面部表情极少是单一情绪，而是多种情绪的百分比混合。你必须运用感情叠加理论来描述角色表情：
• 分析剧情上下文，将角色当前情绪分解为2-4种基础情绪的权重组合
• 基础情绪谱：joy、sadness、anger、fear、surprise、disgust、contempt、trust
• 描述要求：先用百分比标注情绪配方，再翻译为具体的面部微表情
• 避免扁平化的单一表情词

【环境与氛围】
• 自然光：黄金时刻/蓝调时刻/正午硬光/阴天柔光
• 人工光：主光位置、辅光比例、轮廓光、眼神光
• 场景氛围：烟雾/雨丝/光斑/尘土等环境元素

【材质质感描述 - 真人实拍核心】
你必须为画面中的关键元素添加专业的材质质感描述，增强真实感和细节丰富度：
• 皮肤质感：根据角色年龄、性别、情绪状态描述皮肤纹理（细腻光滑/粗糙晒伤/毛孔可见/皱纹沟壑/油光/干裂），关注光线对皮肤质感的影响（侧光凸显纹理、柔光弱化纹理）
• 服装面料：明确面料类型与视觉特征（丝绸→光泽流淌、垂坠感；棉麻→哑光、自然褶皱；皮革→反光高光、纹理沟槽；毛料→蓬松纤维、漫反射；雪纺→半透明、轻柔飘逸），描述面料在光线下的表现
• 环境材质：描述场景中主要材质的质感特征（金属→镜面反射/拉丝纹理/氧化锈蚀；木材→木纹肌理/光滑漆面/粗糙原木；石材→颗粒感/抛光面/风化裂纹；玻璃→透明折射/磨砂漫射/反光倒影）
• 物品表面：标注表面处理工艺（哑光/光泽/半光泽）和质感细节（纹理走向、磨损痕迹、指纹、水渍、灰尘覆盖）
• 融合要求：材质描述必须自然融入画面描述，不可孤立罗列；材质选择必须符合场景逻辑（如古代场景不用塑料质感、战场不用光洁如新）、符合视觉风格（真人实拍追求物理真实的材质还原）`
      : `【动漫动画优化原则】
1. 先通读剧本，理解故事全貌、人物关系和情节走向
2. 确认当前分镜在故事中的时间线位置和情感基调
3. 对照前后分镜，确保角色状态、场景、情绪的连贯性
4. 保持造型一致性，角色外观特征不得突变

【画面构成优化 - 动漫动画核心要素】
• 构图：画面分割（三分法/黄金分割/对称/对角线），视觉重心位置
• 机位：机位高度（平视/俯视/仰视/虫视/鸟视）
• 透视：透视类型（一点/两点/三点/空气透视），空间纵深感
• 景别：画面范围（远景/全景/中景/近景/特写/大特写）
• 动态表现：运动轨迹、速度线、变形夸张、弹性运动
• 色指定：主色调、配色方案、色彩情绪
• 造型一致性：角色设计特征保持，表情变化规律

【材质质感描述 - 动漫动画核心】
你必须为画面中的关键元素添加符合动漫风格的材质质感描述，增强画面细节丰富度：
• 皮肤质感：根据角色设定描述皮肤表现风格（赛璐璐→平面均匀色块、无纹理；半写实→柔和渐变、隐约毛孔；厚涂→笔触可见、肌理丰富），动漫皮肤通常追求光洁感，用高光和阴影暗示体积
• 服装面料：用色块和线条表现面料特征（丝绸→高光色带、流畅曲线；棉麻→柔和色块、少高光；皮革→锐利高光、深色阴影；毛料→柔和边缘、暖色漫反射），动漫中面料质感主要通过色彩处理手法体现而非照片级写实
• 环境材质：用动画表现手法描述场景材质（金属→锐利高光线、冷色反光；木材→暖色调、木纹用线条暗示；石材→粗颗粒网点、灰色调；玻璃→透明色层叠加、折射变形），注意与角色风格统一
• 物品表面：用渲染风格标注质感（平涂→无质感变化；渐变→柔和过渡暗示曲面；网点→印刷质感），注意日式动画与美式动画的质感表现差异
• 融合要求：材质描述必须自然融入画面描述，与整体动画风格一致（如赛璐璐风格不描述毛孔纹理、厚涂风格不描述色块边界）；材质选择符合场景世界观逻辑`;

    const scriptContent = storyboard.script_content || '';
    const scriptSection = scriptContent
      ? `\n【剧本全文】\n${scriptContent.length > 3000 ? scriptContent.slice(0, 3000) + '\n...(剧本过长，已截断)' : scriptContent}\n`
      : '';

    const systemPrompt = `你是一个专业的分镜描述优化专家。你需要先理解整个剧本的内容和脉络，明确当前分镜在故事中的位置，然后再优化当前分镜的描述。

【项目】${storyboard.project_name || '未命名'}${storyboard.script_title ? `\n【剧本标题】${storyboard.script_title}` : ''}${scriptSection}\n【分镜上下文】共 ${totalCount} 个分镜，当前为第 ${currentIdx + 1} 个：
${storyboardContext}${visualStyle ? `\n【视觉风格】${visualStyle}` : ''}${perspectiveInstruction ? `\n${perspectiveInstruction}` : ''}\n【风格类型】${isLiveAction ? '真人实拍' : '动漫动画'}\n
你的任务：优化标记为"当前分镜"的描述内容。

${optimizationPrinciples}

【输出要求 - 正向提示词】
• 描述越详细画面效果越好，请充分发挥专业能力，用丰富的细节描述画面
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

    // 注意：WorkflowExecutor 已经在外层设置了完整的 billing context（含 userId、projectId 等），
    // 此处只覆盖 resourceRefs 以追踪具体分镜，其余字段自动从外层继承。
    const response = await withAIBillingContext(
      { resourceRefs: { storyboardId: storyboard.id } },
      () => callAIModel(modelName, {
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: prompt }
        ],
        maxTokens: 4096,
        temperature: 0.7
      })
    );

    let optimized = '';
    let negativePrompt = '';
    if (typeof response === 'string') optimized = response;
    else if (response?.content) optimized = response.content;
    else if (response?.text) optimized = response.text;
    else if (response?.message) optimized = response.message;

    if (!optimized) return null;

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
    }

    return { optimized, negativePrompt };
  } catch (e) {
    console.error(`[BatchPromptOptimize] 分镜 #${currentIdx + 1} 优化失败:`, e.message);
    throw e;
  }
}

// ============================================================
// 主处理器
// ============================================================
async function handleBatchPromptOptimization(inputParams, onProgress) {
  const { scriptId, textModel: requestedModel, maxConcurrency = 3 } = inputParams;

  if (!scriptId) throw new Error('缺少必要参数: scriptId');

  console.log(`[BatchPromptOptimize] 开始批量优化，scriptId=${scriptId}`);
  if (onProgress) onProgress(5);

  // 1. 确定文本模型
  let modelName = requestedModel;
  if (!modelName) {
    const textModels = await getTextModels();
    if (textModels.length === 0) throw new Error('没有可用的文本模型');
    modelName = textModels[0].name;
  }

  // 2. 查询所有分镜（含项目、剧本信息、锁定状态）
  const allStoryboards = await queryAll(
    `SELECT s.id, s.script_id, s.idx, s.prompt_template, s.spatial_description, s.is_locked,
            sc.project_id, sc.content AS script_content, sc.title AS script_title,
            p.settings_json, p.name AS project_name
     FROM storyboards s
     JOIN scripts sc ON s.script_id = sc.id
     JOIN projects p ON sc.project_id = p.id
     WHERE s.script_id = ?
     ORDER BY s.idx ASC`,
    [scriptId]
  );

  if (allStoryboards.length === 0) {
    return { total: 0, completed: 0, skipped: 0, failed: 0, results: [] };
  }

  const lockedCount = allStoryboards.filter(s => s.is_locked).length;
  if (lockedCount > 0) {
    console.log(`[BatchPromptOptimize] ${lockedCount}/${allStoryboards.length} 个分镜已锁定，将被跳过`);
  }

  // 3. 过滤需要优化的分镜（有描述内容且未锁定）
  const targetStoryboards = allStoryboards.filter(s => s.prompt_template && s.prompt_template.trim() && !s.is_locked);
  const skippedCount = allStoryboards.length - targetStoryboards.length;

  if (targetStoryboards.length === 0) {
    return { total: allStoryboards.length, completed: 0, skipped: skippedCount, failed: 0, results: [] };
  }

  console.log(`[BatchPromptOptimize] 共 ${allStoryboards.length} 个分镜，${targetStoryboards.length} 个需优化，${skippedCount} 个跳过`);
  if (onProgress) onProgress(10);

  // 4. 构建优化任务池
  const tasks = targetStoryboards.map((sb, i) => {
    const currentIdx = allStoryboards.findIndex(s => s.id === sb.id);
    return async () => {
      const result = await optimizeSinglePrompt({
        storyboard: sb,
        allStoryboards,
        currentIdx,
        modelName
      });

      if (result) {
        const optimizedText = typeof result === 'string' ? result : result.optimized;
        const negativePromptText = typeof result === 'string' ? '' : (result.negativePrompt || '');

        // 写回数据库（同时更新正向和反向提示词）
        if (negativePromptText) {
          await execute(
            'UPDATE storyboards SET prompt_template = ?, negative_prompt = ? WHERE id = ?',
            [optimizedText, negativePromptText, sb.id]
          );
        } else {
          await execute(
            'UPDATE storyboards SET prompt_template = ? WHERE id = ?',
            [optimizedText, sb.id]
          );
        }
        console.log(`[BatchPromptOptimize] 分镜 #${sb.idx + 1} 优化完成: ${sb.prompt_template.length}字 → ${optimizedText.length}字, negative=${negativePromptText.length}字`);
        return { id: sb.id, idx: sb.idx, success: true, originalLength: sb.prompt_template.length, optimizedLength: optimizedText.length, negativePromptLength: negativePromptText.length };
      }
      return { id: sb.id, idx: sb.idx, success: false, reason: 'AI返回为空' };
    };
  });

  // 5. 并发执行（文本模型调用限制并发数为3，避免过载）
  const results = await runPool(tasks, maxConcurrency, (done, total) => {
    if (onProgress) {
      const pct = Math.round(10 + (done / total) * 85);
      onProgress(pct);
    }
  });

  // 6. 汇总结果
  let completed = 0;
  let failed = 0;
  const resultList = [];
  for (const r of results) {
    if (r instanceof Error) {
      failed++;
      resultList.push({ success: false, error: r.message });
    } else if (r?.success) {
      completed++;
      resultList.push(r);
    } else {
      failed++;
      resultList.push(r || { success: false, reason: '未知错误' });
    }
  }

  if (onProgress) onProgress(100);

  console.log(`[BatchPromptOptimize] 完成: ${completed} 成功, ${failed} 失败, ${skippedCount} 跳过`);
  return {
    total: allStoryboards.length,
    completed,
    skipped: skippedCount,
    failed,
    results: resultList
  };
}

module.exports = handleBatchPromptOptimization;
