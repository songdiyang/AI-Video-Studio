/**
 * 批量分镜视频提示词优化处理器
 * 逐个优化指定脚本下所有分镜的描述文字（并发池模式），针对动态视频生成
 *
 * 逻辑：
 * 1. 查询 scriptId 下所有分镜
 * 2. 过滤出有描述内容的分镜
 * 3. 以并发池模式优化每个分镜描述（调用文本模型），生成适合视频模型的提示词
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
// 单个分镜视频提示词优化核心逻辑
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
      ? `【真人实拍视频优化原则】
1. 先通读剧本，理解故事全貌、人物关系和情节走向
2. 确认当前分镜在故事中的时间线位置和情感基调
3. 对照前后分镜，确保角色状态、场景、情绪的连贯性
4. 如果发现当前描述与剧本内容或前后分镜有矛盾，修正使其一致

【动态视频核心要素 - 真人实拍】
• 运动描述：主体运动轨迹、运动速度、动作幅度、加速度变化，描述动作的完整过程（起始姿态->运动过程->结束姿态）
• 运镜指令：相机运动方式（推/拉/摇/移/跟/升降/环绕/手持稳定/肩扛呼吸感），运动速度、起止点、运动动机
• 帧率：拍摄帧率选择（24fps电影感/30fps标准/60fps高帧率慢动作）
• 时间叙事：镜头开始状态 -> 中间过程变化 -> 结束状态的完整时间线
• 动态元素：风的吹动、水流、粒子飘动、火焰摇曳、光影随时间变化
• 环境持续性：持续性效果（雨雪、火焰、烟雾）必须在整个视频时长内保持
• 镜头：镜头类型（定焦/变焦/微距/长焦/广角），变焦过程的视觉变化
• 色彩：色温设定，色彩风格，色彩随时间或光源变化的过渡

【帧间一致性约束 - 真人实拍关键】
• 角色一致性：视频中角色外貌、服装、发型在多帧间必须保持连贯
• 光照连续性：光线方向、强度、色温在视频全程保持一致
• 场景连续性：场景环境、物体位置、背景元素不得突然消失或改变
• 物理合理性：角色动作应符合物理规律

【情绪叠加理论 - 真人表情动态核心】
真人面部表情极少是单一情绪，而是多种情绪的百分比混合。在视频中，微表情应有自然变化：
• 分析剧情上下文，将角色当前情绪分解为2-4种基础情绪的权重组合
• 基础情绪谱：joy、sadness、anger、fear、surprise、disgust、contempt、trust
• 动态要求：视频中微表情应有自然变化（眼神闪烁、嘴角微颤、眨眼）
• 嘴型同步：如有台词，说话角色的嘴型必须与台词同步

【光影与环境氛围 - 时间维度】
• 自然光：黄金时刻/蓝调时刻/正午硬光/阴天柔光，光线随时间的变化
• 动态光影：移动的光斑、摇曳的树影、闪烁的烛光、透过窗户移动的阳光
• 场景氛围：烟雾的流动、雨丝的飘洒、尘土的飞扬

【材质质感与动态表现 - 真人实拍核心】
• 皮肤质感：根据角色年龄、性别、情绪状态描述皮肤纹理及动态变化
• 服装面料：面料类型与视觉特征，面料在运动中的动态表现
• 环境材质：场景中主要材质的质感特征及动态表现
• 融合要求：材质描述必须自然融入画面描述`
      : `【动漫动画视频优化原则】
1. 先通读剧本，理解故事全貌、人物关系和情节走向
2. 确认当前分镜在故事中的时间线位置和情感基调
3. 对照前后分镜，确保角色状态、场景、情绪的连贯性
4. 保持造型一致性，角色外观特征在多帧间不得突变

【动态视频核心要素 - 动漫动画】
• 运动描述：主体运动轨迹、运动速度、动作幅度、加速度变化，描述动作的完整过程
• 运镜指令：相机运动方式（推/拉/摇/移/跟/升降/环绕），运动速度、起止点
• 张数：关键帧张数估算，动作密度（单拍/双拍/三拍）
• 动态表现：运动轨迹、速度线、变形夸张、弹性运动、跟随动作、重叠动作
• 时间节奏：快节奏/慢节奏/停顿/节奏变化点，动作的时间分配
• 时间叙事：镜头开始状态 -> 中间过程变化 -> 结束状态的完整时间线
• 动态元素：风的吹动、水流、粒子效果、火焰、魔法特效的运动
• 环境持续性：持续性效果（雨雪、火焰、烟雾）必须在整个视频时长内保持

【帧间一致性约束 - 动漫动画关键】
• 角色一致性：视频中角色外貌、服装、发型在多帧间必须保持连贯
• 造型稳定：角色比例、五官位置、身体结构在动态中保持稳定
• 光照连续性：光线方向、强度、阴影位置在视频全程保持一致
• 场景连续性：场景环境、物体位置、背景元素不得突然消失或改变

【动画制作优化 - 动画技术要素】
• 分层：前景层/中景层/背景层/特效层，各层独立运动
• 动作分解：将复杂动作分解为预备动作->主要动作->缓冲动作
• 跟随与重叠：服装、头发等附属物的延迟跟随动作
• 节奏控制：关键帧之间的时间分配，加速/减速曲线

【材质质感与动态表现 - 动漫动画核心】
• 皮肤质感：根据角色设定描述皮肤表现风格，动态中的高光和阴影变化
• 服装面料：用色块和线条表现面料特征，面料在运动中的动态
• 环境材质：用动画表现手法描述场景材质及动态变化
• 特效材质：魔法光效、能量波动、粒子特效的动态表现
• 融合要求：材质描述必须自然融入画面描述，与整体动画风格一致`;

    const scriptContent = storyboard.script_content || '';
    const scriptSection = scriptContent
      ? `\n【剧本全文】\n${scriptContent.length > 3000 ? scriptContent.slice(0, 3000) + '\n...(剧本过长，已截断)' : scriptContent}\n`
      : '';

    const systemPrompt = `你是一个专业的分镜描述优化专家，专门为动态视频生成模型优化提示词。

【项目】${storyboard.project_name || '未命名'}${storyboard.script_title ? `\n【剧本标题】${storyboard.script_title}` : ''}${scriptSection}\n【分镜上下文】共 ${totalCount} 个分镜，当前为第 ${currentIdx + 1} 个：
${storyboardContext}${visualStyle ? `\n【视觉风格】${visualStyle}` : ''}${perspectiveInstruction ? `\n${perspectiveInstruction}` : ''}\n【风格类型】${isLiveAction ? '真人实拍' : '动漫动画'}\n【输出目标】动态视频生成（视频模型）

你的任务：优化标记为"当前分镜"的描述内容。

${optimizationPrinciples}

【输出要求 - 正向提示词】
• 描述越详细画面效果越好，请充分发挥专业能力，用丰富的细节描述画面
• 重点描述动态视觉元素：运动轨迹、运镜方式、时间变化、帧间一致性、动态元素
• 必须包含时间维度描述：开始状态->过程变化->结束状态的完整叙事链
• 必须强调帧间一致性：角色外貌、服装、光照、场景在视频全程保持连贯
• 描述要有画面感和电影感

【输出要求 - 反向提示词（Negative Prompt）】
你必须同时生成反向提示词，用于排除视频中不应该出现的内容：
• 排除与当前场景、角色、情绪无关的视觉元素
• 排除与视觉风格冲突的表现形式
• 排除常见画面缺陷（低质量、模糊、变形、多余肢体、水印、文字、签名）
• 排除视频专属缺陷（画面抖动、跳帧、闪烁、画面撕裂、运动不连贯、卡顿、角色突然变形或消失）
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
    console.error(`[BatchVideoPromptOptimize] 分镜 #${currentIdx + 1} 优化失败:`, e.message);
    throw e;
  }
}

// ============================================================
// 主处理器
// ============================================================
async function handleBatchVideoPromptOptimization(inputParams, onProgress) {
  const { scriptId, textModel: requestedModel, maxConcurrency = 3 } = inputParams;

  if (!scriptId) throw new Error('缺少必要参数: scriptId');

  console.log(`[BatchVideoPromptOptimize] 开始批量视频优化，scriptId=${scriptId}`);
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
    console.log(`[BatchVideoPromptOptimize] ${lockedCount}/${allStoryboards.length} 个分镜已锁定，将被跳过`);
  }

  // 3. 过滤需要优化的分镜（有描述内容且未锁定）
  const targetStoryboards = allStoryboards.filter(s => s.prompt_template && s.prompt_template.trim() && !s.is_locked);
  const skippedCount = allStoryboards.length - targetStoryboards.length;

  if (targetStoryboards.length === 0) {
    return { total: allStoryboards.length, completed: 0, skipped: skippedCount, failed: 0, results: [] };
  }

  console.log(`[BatchVideoPromptOptimize] 共 ${allStoryboards.length} 个分镜，${targetStoryboards.length} 个需优化，${skippedCount} 个跳过`);
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

        // 写回数据库：视频提示词写入 video_prompt 字段（不覆盖 prompt_template）
        if (negativePromptText) {
          await execute(
            'UPDATE storyboards SET video_prompt = ?, negative_prompt = ? WHERE id = ?',
            [optimizedText, negativePromptText, sb.id]
          );
        } else {
          await execute(
            'UPDATE storyboards SET video_prompt = ? WHERE id = ?',
            [optimizedText, sb.id]
          );
        }
        console.log(`[BatchVideoPromptOptimize] 分镜 #${sb.idx + 1} 优化完成: ${sb.prompt_template.length}字 -> ${optimizedText.length}字, negative=${negativePromptText.length}字`);
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

  console.log(`[BatchVideoPromptOptimize] 完成: ${completed} 成功, ${failed} 失败, ${skippedCount} 跳过`);
  return {
    total: allStoryboards.length,
    completed,
    skipped: skippedCount,
    failed,
    results: resultList
  };
}

module.exports = handleBatchVideoPromptOptimization;
