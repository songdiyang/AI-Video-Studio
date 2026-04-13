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
      let perspectiveInstruction = '';
      try {
        const settings = typeof storyboard.settings_json === 'string'
          ? JSON.parse(storyboard.settings_json || '{}')
          : (storyboard.settings_json || {});
        visualStyle = settings.visualStylePrompt || settings.visual_style_prompt || '';
        // 拍摄视角
        const { getNarrativePerspective } = require('../../utils/getProjectStyle');
        const perspective = await getNarrativePerspective(storyboard.project_id);
        perspectiveInstruction = perspective.promptInstruction || '';
      } catch (e) {
        // 忽略
      }

      // 5. 构建系统提示词（包含剧本和分镜上下文）
      const scriptContent = storyboard.script_content || '';
      const scriptSection = scriptContent
        ? `\n【剧本全文】\n${scriptContent.length > 3000 ? scriptContent.slice(0, 3000) + '\n...(剧本过长，已截断)' : scriptContent}\n`
        : '';

      const systemPrompt = `你是一个专业的分镜描述优化专家。你需要先理解整个剧本的内容和脉络，明确当前分镜在故事中的位置，然后再优化当前分镜的描述。

【项目】${storyboard.project_name || '未命名'}
${storyboard.script_title ? `【剧本标题】${storyboard.script_title}` : ''}
${scriptSection}
【分镜上下文】共 ${totalCount} 个分镜，当前为第 ${currentIdx + 1} 个：
${storyboardContext}
${visualStyle ? `【视觉风格】${visualStyle}` : ''}
${perspectiveInstruction ? `${perspectiveInstruction}` : ''}

你的任务：优化标记为"当前分镜"的描述内容。

优化原则：
1. 先通读剧本，理解故事全貌、人物关系和情节走向
2. 确认当前分镜在故事中的时间线位置和情感基调
3. 对照前后分镜，确保角色状态、场景、情绪的连贯性
4. 如果发现当前描述与剧本内容或前后分镜有矛盾，修正使其一致
5. 补充镜头语言细节（景别、角度、光影、运镜等）
6. 增加环境氛围描写（天气、光线、色调等）
7. 细化角色动作和表情描写
8. 使描述更有画面感和电影感
9. 保持简洁凝练，不要过度冗长（控制在原文2倍长度以内）

注意：只输出优化后的分镜描述，不要输出其他任何内容（不要标注、不要解释、不要前缀）。`;

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
