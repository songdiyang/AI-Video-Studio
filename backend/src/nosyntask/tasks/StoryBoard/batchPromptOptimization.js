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

// ============================================================
// 并发池
// ============================================================
async function runPool(tasks, limit, onTaskDone) {
  const results = new Array(tasks.length);
  let nextIndex = 0;
  let doneCount = 0;

  return new Promise((resolve) => {
    function runNext() {
      if (doneCount === tasks.length) {
        return resolve(results);
      }
      while (nextIndex < tasks.length && (nextIndex - doneCount) < limit) {
        const idx = nextIndex++;
        tasks[idx]()
          .then(res => { results[idx] = res; })
          .catch(err => { results[idx] = err; })
          .finally(() => {
            doneCount++;
            if (onTaskDone) onTaskDone(doneCount, tasks.length);
            runNext();
          });
      }
    }
    runNext();
  });
}

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
• 场景氛围：烟雾/雨丝/光斑/尘土等环境元素`
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
• 造型一致性：角色设计特征保持，表情变化规律`;

    const scriptContent = storyboard.script_content || '';
    const scriptSection = scriptContent
      ? `\n【剧本全文】\n${scriptContent.length > 3000 ? scriptContent.slice(0, 3000) + '\n...(剧本过长，已截断)' : scriptContent}\n`
      : '';

    const systemPrompt = `你是一个专业的分镜描述优化专家。你需要先理解整个剧本的内容和脉络，明确当前分镜在故事中的位置，然后再优化当前分镜的描述。

【项目】${storyboard.project_name || '未命名'}${storyboard.script_title ? `\n【剧本标题】${storyboard.script_title}` : ''}${scriptSection}\n【分镜上下文】共 ${totalCount} 个分镜，当前为第 ${currentIdx + 1} 个：
${storyboardContext}${visualStyle ? `\n【视觉风格】${visualStyle}` : ''}${perspectiveInstruction ? `\n${perspectiveInstruction}` : ''}\n【风格类型】${isLiveAction ? '真人实拍' : '动漫动画'}\n
你的任务：优化标记为"当前分镜"的描述内容。

${optimizationPrinciples}

【输出要求】
• 保持简洁凝练，不要过度冗长（控制在原文2倍长度以内）
• 只输出优化后的分镜描述，不要输出其他任何内容（不要标注、不要解释、不要前缀）
• 描述要有画面感和电影感，让读者能清晰想象出画面`;

    // 注意：WorkflowExecutor 已经在外层设置了完整的 billing context（含 userId、projectId 等），
    // 此处只覆盖 resourceRefs 以追踪具体分镜，其余字段自动从外层继承。
    const response = await withAIBillingContext(
      { resourceRefs: { storyboardId: storyboard.id } },
      () => callAIModel(modelName, {
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: prompt }
        ],
        maxTokens: 1024,
        temperature: 0.7
      })
    );

    let optimized = '';
    if (typeof response === 'string') optimized = response;
    else if (response?.content) optimized = response.content;
    else if (response?.text) optimized = response.text;
    else if (response?.message) optimized = response.message;

    if (!optimized) return null;

    optimized = optimized.replace(/^["'""]+|["'""]+$/g, '').trim();
    return optimized;
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

  console.log(`[BatchPromptOptimize] 共 ${allStoryboards.length} 个分镜，${targetStoryboards.length} 个需优化，${skippedCount} 个跳过`);
  if (onProgress) onProgress(10);

  // 4. 构建优化任务池
  const tasks = targetStoryboards.map((sb, i) => {
    const currentIdx = allStoryboards.findIndex(s => s.id === sb.id);
    return async () => {
      const optimized = await optimizeSinglePrompt({
        storyboard: sb,
        allStoryboards,
        currentIdx,
        modelName
      });

      if (optimized) {
        // 写回数据库
        await execute(
          'UPDATE storyboards SET prompt_template = ? WHERE id = ?',
          [optimized, sb.id]
        );
        console.log(`[BatchPromptOptimize] 分镜 #${sb.idx + 1} 优化完成: ${sb.prompt_template.length}字 → ${optimized.length}字`);
        return { id: sb.id, idx: sb.idx, success: true, originalLength: sb.prompt_template.length, optimizedLength: optimized.length };
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
