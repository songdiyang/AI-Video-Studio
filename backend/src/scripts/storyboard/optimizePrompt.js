/**
 * 分镜描述优化 API
 * POST /api/storyboards/:storyboardId/optimize-prompt
 * 
 * 先理解剧本全貌和当前分镜在剧本中的位置，再优化分镜描述
 */

const { authMiddleware } = require('../../middleware');
const { callAIModel, getTextModels } = require('../../aiModelService');
const { withAIBillingContext } = require('../../aiBillingContext');
const { queryOne, queryAll } = require('../../dbHelper');

module.exports = (router) => {
  router.post('/:storyboardId/optimize-prompt', authMiddleware, async (req, res) => {
    const userId = req.user.id;
    const { storyboardId } = req.params;
    const { prompt, textModel: requestedModel } = req.body;

    if (!prompt || !prompt.trim()) {
      return res.status(400).json({ message: '输入内容不能为空' });
    }

    try {
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

      if (!storyboard) {
        return res.status(404).json({ message: '分镜不存在' });
      }

      // 2. 获取同一剧本下的所有分镜描述（建立上下文关系）
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

      // 3. 确定使用的文本模型
      let modelName = requestedModel;
      if (!modelName) {
        const textModels = await getTextModels();
        if (textModels.length === 0) {
          return res.status(400).json({ message: '没有可用的文本模型' });
        }
        modelName = textModels[0].name;
      }

      // 4. 提取视觉风格和拍摄视角
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
        const { getNarrativePerspective } = require('../../utils/getProjectStyle');
        const perspective = await getNarrativePerspective(storyboard.project_id);
        perspectiveInstruction = perspective.promptInstruction || '';
      } catch (e) {
        // 忽略
      }

      // 5. 判断风格类型（真人/动漫）
      const liveActionStyles = ['写实电影', '时尚摄影', '纪实风格', '电影感剧情'];
      
      // 判断是真人还是动漫（优先根据视觉风格关键词判断）
      const isLiveAction = liveActionStyles.includes(visualStyleLabel) || 
                          visualStyle.includes('写实') || 
                          visualStyle.includes('电影') ||
                          visualStyle.includes('摄影') ||
                          visualStyle.includes('纪实') ||
                          visualStyle.toLowerCase().includes('realistic') ||
                          visualStyle.toLowerCase().includes('cinematic') ||
                          visualStyle.toLowerCase().includes('photography');
      const styleType = isLiveAction ? 'live_action' : 'anime';

      // 6. 构建系统提示词（包含剧本和分镜上下文）
      const scriptContent = storyboard.script_content || '';
      const scriptSection = scriptContent
        ? `\n【剧本全文】\n${scriptContent.length > 3000 ? scriptContent.slice(0, 3000) + '\n...(剧本过长，已截断)' : scriptContent}\n`
        : '';

      // 根据风格类型选择优化原则
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
• 叠加示例：
  - 苦笑 = 30% sadness + 20% joy + 50% resignation → 嘴角微微上扬但眼神空洞，眉头略皱
  - 强忍泪水的微笑 = 40% sadness + 35% joy + 25% determination → 眼眶泛红但嘴角坚定上扬，眼中有泪光闪烁
  - 惊喜 = 60% joy + 40% surprise → 瞳孔放大，嘴巴微张，眼角上扬的笑纹
  - 不安的期待 = 35% fear + 35% hope + 30% excitement → 微微咬唇，眼神闪烁但明亮，肩膀微耸
• 描述要求：先用百分比标注情绪配方，再翻译为具体的面部微表情（眉毛、眼睛、嘴角、肌肉张力）
• 避免扁平化的单一表情词（如"sad face"），改用复合微表情描述

【环境与氛围】
• 自然光：黄金时刻/蓝调时刻/正午硬光/阴天柔光
• 人工光：主光位置、辅光比例、轮廓光、眼神光
• 场景氛围：烟雾/雨丝/光斑/尘土等环境元素`
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
• 拍摄规格：画幅比例（16:9/4:3/2.35:1），分辨率要求
• 律表：时间分配（帧数/秒数），节奏标注
• 动态表现：运动轨迹、速度线、变形夸张、弹性运动
• 时间节奏：快节奏/慢节奏/停顿/节奏变化点
• 分层：前景层/中景层/背景层/特效层，便于后期合成

【美术表现优化】
• 布光：主光源方向、阴影形状、投影位置
• 影调：高调/低调/中间调，明暗对比强度
• 色指定：主色调、配色方案、色彩情绪
• 造型一致性：角色设计特征保持，表情变化规律
• 运动规律：符合动画十二原则（挤压拉伸/预备动作/跟随动作/慢入慢出等）`;

      const systemPrompt = `你是一个专业的分镜描述优化专家。你需要先理解整个剧本的内容和脉络，明确当前分镜在故事中的位置，然后再优化当前分镜的描述。

【项目】${storyboard.project_name || '未命名'}${storyboard.script_title ? `\n【剧本标题】${storyboard.script_title}` : ''}${scriptSection}\n【分镜上下文】共 ${totalCount} 个分镜，当前为第 ${currentIdx + 1} 个：
${storyboardContext}${visualStyle ? `\n【视觉风格】${visualStyle}` : ''}${perspectiveInstruction ? `\n${perspectiveInstruction}` : ''}\n【风格类型】${isLiveAction ? '真人实拍' : '动漫动画'}\n
你的任务：优化标记为"当前分镜"的描述内容。

${optimizationPrinciples}

【输出要求】
• 保持简洁凝练，不要过度冗长（控制在原文2倍长度以内）
• 只输出优化后的分镜描述，不要输出其他任何内容（不要标注、不要解释、不要前缀）
• 描述要有画面感和电影感，让读者能清晰想象出画面`;

      const response = await withAIBillingContext(
        {
          userId,
          projectId: storyboard.project_id,
          sourceType: 'route',
          operationKey: 'optimize_prompt',
          resourceRefs: { storyboardId }
        },
        () => callAIModel(modelName, {
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: prompt }
          ],
          maxTokens: 1024,
          temperature: 0.7
        })
      );

      // 提取优化后的文本
      let optimized = '';
      if (typeof response === 'string') {
        optimized = response;
      } else if (response?.content) {
        optimized = response.content;
      } else if (response?.text) {
        optimized = response.text;
      } else if (response?.message) {
        optimized = response.message;
      }

      if (!optimized) {
        return res.status(500).json({ message: 'AI 模型返回内容为空' });
      }

      // 清理：去除可能的引号包裹和多余空白
      optimized = optimized.replace(/^["'""]+|["'""]+$/g, '').trim();

      console.log(`[OptimizePrompt] storyboardId=${storyboardId}, model=${modelName}, context=${totalCount}scenes, input=${prompt.length}chars -> output=${optimized.length}chars`);

      res.json({
        optimized,
        model: modelName,
        originalLength: prompt.length,
        optimizedLength: optimized.length
      });
    } catch (error) {
      console.error('[OptimizePrompt]', error);
      res.status(500).json({ message: error.message || '优化失败' });
    }
  });
};
