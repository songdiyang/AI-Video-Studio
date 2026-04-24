/**
 * 批量分镜图片提示词优化处理器
 * 逐个优化指定脚本下所有分镜的描述文字（并发池模式），针对静态图像生成
 *
 * 逻辑：
 * 1. 查询 scriptId 下所有分镜
 * 2. 过滤出有描述内容的分镜
 * 3. 以并发池模式优化每个分镜描述（调用文本模型），生成适合图片模型的提示词
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
// 单个分镜图片提示词优化核心逻辑
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
      ? `【真人实拍图片优化原则】
1. 先通读剧本，理解故事全貌、人物关系和情节走向
2. 确认当前分镜在故事中的时间线位置和情感基调
3. 对照前后分镜，确保角色状态、场景、情绪的连贯性
4. 如果发现当前描述与剧本内容或前后分镜有矛盾，修正使其一致

【静态图像构图优化 - 真人实拍核心要素】
• 构图：明确画面分割方式（三分法/黄金分割/对称/对角线/引导线/框架式构图），视觉重心位置
• 透视：透视类型（一点透视/两点透视/三点透视/空气透视），空间纵深感表现
• 景别：画面范围（远景/全景/中景/近景/特写/大特写），叙事功能与画面信息量
• 焦点：视觉焦点位置，引导观众视线的元素，虚实对比层次
• 镜头：镜头类型（定焦/变焦/微距/长焦/广角），说明镜头选择对画面透视和压缩感的影响
• 光圈：标注光圈值（f/1.4-f/22），描述景深效果（大光圈浅景深虚化背景/小光圈深景深全清晰）
• 焦距：说明焦距范围（广角14-35mm/标准50mm/长焦85-200mm），影响空间透视和人物比例
• 快门：快门速度对动态冻结效果的影响（高速快门凝固瞬间/慢门呈现流动感）
• 景深：明确焦点位置和景深范围，前景/中景/背景的虚实关系
• 曝光：曝光控制（高调/低调/正常），光比关系，明暗层次，高光与暗部细节
• 色彩：色温设定（暖调/冷调/中性），色彩风格，色彩对比与饱和度

【情绪叠加理论 - 真人表情核心】
真人面部表情极少是单一情绪，而是多种情绪的百分比混合：
• 分析剧情上下文，将角色当前情绪分解为2-4种基础情绪的权重组合
• 基础情绪谱：joy、sadness、anger、fear、surprise、disgust、contempt、trust
• 描述要求：先用百分比标注情绪配方，再翻译为具体的面部微表情（眉毛、眼睛、嘴角、肌肉张力）
• 避免扁平化的单一表情词，改用复合微表情描述

【光影与环境氛围】
• 自然光：黄金时刻/蓝调时刻/正午硬光/阴天柔光/侧光勾勒轮廓
• 人工光：主光位置、辅光比例、轮廓光、眼神光、背景光
• 光质描述：硬光/柔光/体积光（光束、丁达尔效应）
• 场景氛围：烟雾/雨丝/光斑/尘土/雾气等环境元素的空间分布

【材质质感描述 - 静态图像核心】
你必须为画面中的关键元素添加专业的材质质感描述：
• 皮肤质感：根据角色年龄、性别、情绪状态描述皮肤纹理，关注光线对皮肤质感的影响
• 服装面料：明确面料类型与视觉特征，描述面料在光线下的表现
• 环境材质：描述场景中主要材质的质感特征（金属/木材/石材/玻璃）
• 物品表面：标注表面处理工艺和质感细节
• 融合要求：材质描述必须自然融入画面描述，不可孤立罗列`
      : `【动漫动画图片优化原则】
1. 先通读剧本，理解故事全貌、人物关系和情节走向
2. 确认当前分镜在故事中的时间线位置和情感基调
3. 对照前后分镜，确保角色状态、场景、情绪的连贯性
4. 保持造型一致性，角色外观特征不得突变

【静态画面构成优化 - 动漫插画核心要素】
• 构图：画面分割（三分法/黄金分割/对称/对角线/引导线），视觉重心位置，画面平衡感
• 机位：机位高度（平视/俯视/仰视/虫视/鸟视），与被摄体的距离关系
• 透视：透视类型（一点透视/两点透视/三点透视/空气透视），空间纵深感
• 景别：画面范围（远景/全景/中景/近景/特写/大特写），叙事功能
• 焦点：视觉焦点位置，引导观众视线的元素
• 虚实：前景虚化/背景虚化/移焦效果，层次分明，主体突出
• 色指定：主色调、配色方案、色彩情绪、色彩对比关系
• 造型一致性：角色设计特征保持，表情变化规律，不同角度造型统一

【材质质感描述 - 动漫插画核心】
你必须为画面中的关键元素添加符合动漫风格的材质质感描述：
• 皮肤质感：根据角色设定描述皮肤表现风格（赛璐璐/半写实/厚涂）
• 服装面料：用色块和线条表现面料特征
• 环境材质：用动画表现手法描述场景材质
• 物品表面：用渲染风格标注质感
• 融合要求：材质描述必须自然融入画面描述，与整体动画风格一致`;

    const scriptContent = storyboard.script_content || '';
    const scriptSection = scriptContent
      ? `\n【剧本全文】\n${scriptContent.length > 3000 ? scriptContent.slice(0, 3000) + '\n...(剧本过长，已截断)' : scriptContent}\n`
      : '';

    const systemPrompt = `你是一个专业的分镜描述优化专家，专门为静态图像生成模型优化提示词。

【项目】${storyboard.project_name || '未命名'}${storyboard.script_title ? `\n【剧本标题】${storyboard.script_title}` : ''}${scriptSection}\n【分镜上下文】共 ${totalCount} 个分镜，当前为第 ${currentIdx + 1} 个：
${storyboardContext}${visualStyle ? `\n【视觉风格】${visualStyle}` : ''}${perspectiveInstruction ? `\n${perspectiveInstruction}` : ''}\n【风格类型】${isLiveAction ? '真人实拍' : '动漫动画'}\n【输出目标】静态图像生成（图片模型）

你的任务：优化标记为"当前分镜"的描述内容。

${optimizationPrinciples}

【输出要求 - 正向提示词】
• 描述越详细画面效果越好，请充分发挥专业能力，用丰富的细节描述画面
• 重点描述静态视觉元素：构图、光影、色彩、景深、材质质感、细节层次
• 不要包含任何与运动、时间变化、帧率、运镜相关的描述
• 描述要有画面感和电影感

【输出要求 - 反向提示词（Negative Prompt）】
你必须同时生成反向提示词，用于排除画面中不应该出现的内容：
• 排除与当前场景、角色、情绪无关的视觉元素
• 排除与视觉风格冲突的表现形式
• 排除常见画面缺陷（低质量、模糊、变形、多余肢体、水印、文字、签名）
• 排除与当前情绪氛围不符的元素
• 反向提示词用中文描述，词语间用英文逗号分隔

【输出格式】
严格按以下 JSON 格式输出，不要添加任何其他内容：
{"positive": "优化后的正向提示词", "negative": "反向提示词，中文描述，英文逗号分隔"}`;

    // 注意：WorkflowExecutor 已经在外层设置了完整的 billing context
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
    console.error(`[BatchImagePromptOptimize] 分镜 #${currentIdx + 1} 优化失败:`, e.message);
    throw e;
  }
}

// ============================================================
// 主处理器
// ============================================================
async function handleBatchImagePromptOptimization(inputParams, onProgress) {
  const { scriptId, textModel: requestedModel, maxConcurrency = 3 } = inputParams;

  if (!scriptId) throw new Error('缺少必要参数: scriptId');

  console.log(`[BatchImagePromptOptimize] 开始批量图片优化，scriptId=${scriptId}`);
  if (onProgress) onProgress(5);

  // 1. 确定文本模型
  let modelName = requestedModel;
  if (!modelName) {
    const textModels = await getTextModels();
    if (textModels.length === 0) throw new Error('没有可用的文本模型');
    modelName = textModels[0].name;
  }

  // 2. 查询所有分镜（含项目、剧本信息）
  const allStoryboards = await queryAll(
    `SELECT s.id, s.script_id, s.idx, s.prompt_template, s.spatial_description,
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

  // 3. 过滤需要优化的分镜（有描述内容的）
  const targetStoryboards = allStoryboards.filter(s => s.prompt_template && s.prompt_template.trim());
  const skippedCount = allStoryboards.length - targetStoryboards.length;

  if (targetStoryboards.length === 0) {
    return { total: allStoryboards.length, completed: 0, skipped: skippedCount, failed: 0, results: [] };
  }

  console.log(`[BatchImagePromptOptimize] 共 ${allStoryboards.length} 个分镜，${targetStoryboards.length} 个需优化，${skippedCount} 个跳过`);
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
        console.log(`[BatchImagePromptOptimize] 分镜 #${sb.idx + 1} 优化完成: ${sb.prompt_template.length}字 -> ${optimizedText.length}字, negative=${negativePromptText.length}字`);
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

  console.log(`[BatchImagePromptOptimize] 完成: ${completed} 成功, ${failed} 失败, ${skippedCount} 跳过`);
  return {
    total: allStoryboards.length,
    completed,
    skipped: skippedCount,
    failed,
    results: resultList
  };
}

module.exports = handleBatchImagePromptOptimization;
