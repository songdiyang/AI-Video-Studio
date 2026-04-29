/**
 * 场景 AI 草稿生成
 *   POST /api/scenes/ai-generate-draft
 *   入参: { projectId, userDescription, textModel? }
 *   出参: { draft: { name, description, environment, lighting, mood }, projectStyle }
 *
 * 轻量草稿模式：只出文案，不入库；前端拿到后可直接走 createScene 完成手动落库。
 */
const { queryOne } = require('../../dbHelper');
const { authMiddleware } = require('../../middleware');
const { getEffectiveProjectRole } = require('../../middleware/collaborationAuth');
const { getVisualStylePrompt } = require('../../utils/getProjectStyle');
const handleBaseTextModelCall = require('../../nosyntask/tasks/base/baseTextModelCall');
const { withAIBillingContext } = require('../../aiBillingContext');
const { stripThinkTags, extractCodeBlock, extractJSON, stripInvisible, safeParseJSON } = require('../../utils/washBody');

const WRITABLE_ROLES = new Set(['owner', 'admin', 'editor']);
const AI_CALL_TIMEOUT = parseInt(process.env.SCENE_AI_GENERATE_TIMEOUT, 10) || 60000;

function withTimeout(promise, ms, errorMessage) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error(errorMessage)), ms))
  ]);
}

async function getDefaultTextModel() {
  const m = await queryOne(
    "SELECT name FROM ai_model_configs WHERE category = 'TEXT' AND is_active = 1 ORDER BY id ASC LIMIT 1"
  );
  return m?.name;
}

function buildScenePrompt(userDescription, visualStyleHint) {
  return `你是一个专业的场景设定助手。根据用户描述，生成一个完整的场景设定草稿。

【用户描述】
${userDescription || '(无额外描述，请合理发挥)'}
${visualStyleHint ? `\n【项目视觉风格要求】${visualStyleHint}\n请确保生成的场景氛围/光线/色彩与该视觉风格一致。\n` : ''}

**输出要求 - 严格 JSON 对象格式：**

\`\`\`json
{
  "name": "场景简称（8 字以内，如：夜晚街道）",
  "description": "场景简介（一两句话概述地点/时代/用途）",
  "environment": "环境描述（地点类型、空间布局、主要物件、材质）",
  "lighting": "光线描述（光源、强度、色温、阴影风格）",
  "mood": "氛围描述（情绪基调、色彩倾向、紧张/宁静/温暖等）"
}
\`\`\`

**关键约束：**
1. name 必须精炼（8 字以内），不能用长句
2. description 用于列表展示，控制在 50 字内
3. environment / lighting / mood 可以详细（每项 50-150 字）
4. 只输出 JSON 对象，不要任何解释文字`;
}

function parseSceneDraft(rawContent) {
  let jsonStr = stripThinkTags(rawContent);
  jsonStr = extractCodeBlock(jsonStr);
  jsonStr = stripInvisible(jsonStr).trim();

  let parsed = safeParseJSON(jsonStr);
  if (parsed === null) {
    const extracted = extractJSON(jsonStr);
    if (extracted) parsed = safeParseJSON(extracted);
  }
  if (!parsed) throw new Error('AI 返回的内容无法解析为 JSON');
  if (Array.isArray(parsed)) parsed = parsed[0];
  if (!parsed || !parsed.name) throw new Error('AI 返回的草稿缺少必要字段 name');

  return {
    name: String(parsed.name || '').trim().slice(0, 60),
    description: String(parsed.description || '').trim(),
    environment: String(parsed.environment || '').trim(),
    lighting: String(parsed.lighting || '').trim(),
    mood: String(parsed.mood || '').trim()
  };
}

module.exports = (router) => {
  router.post('/ai-generate-draft', authMiddleware, async (req, res) => {
    const userId = req.user.id;
    const { projectId, userDescription = '', textModel: inputModel } = req.body || {};

    if (!projectId) return res.status(400).json({ message: '缺少 projectId' });
    if (!userDescription || !userDescription.trim()) {
      return res.status(400).json({ message: '请输入场景描述' });
    }

    try {
      const role = await getEffectiveProjectRole(userId, projectId);
      if (!role || !WRITABLE_ROLES.has(role)) {
        return res.status(403).json({ message: '无权在该项目生成场景' });
      }

      const textModel = inputModel || (await getDefaultTextModel());
      if (!textModel) return res.status(400).json({ message: '未配置可用文本模型' });

      const project = await queryOne('SELECT id, name FROM projects WHERE id = ?', [projectId]);
      if (!project) return res.status(404).json({ message: '项目不存在' });

      const visualStylePrompt = await getVisualStylePrompt(projectId);
      const prompt = buildScenePrompt(userDescription, visualStylePrompt);

      const response = await withAIBillingContext(
        {
          userId,
          projectId,
          sourceType: 'route',
          operationKey: 'scene_ai_generate_draft',
          resourceRefs: { projectId }
        },
        () => withTimeout(
          handleBaseTextModelCall({
            prompt,
            textModel,
            maxTokens: 1200,
            temperature: 0.7
          }),
          AI_CALL_TIMEOUT,
          `AI 调用超时（${Math.round(AI_CALL_TIMEOUT / 1000)}秒）`
        )
      );

      let content = '';
      if (typeof response === 'string') content = response;
      else if (response?.content) content = response.content;
      else if (response?.text) content = response.text;
      else if (response?.message) content = response.message;
      if (!content) throw new Error('AI 返回内容为空');

      const draft = parseSceneDraft(content);

      res.json({
        draft,
        projectStyle: {
          projectId: project.id,
          projectName: project.name,
          visualStylePrompt: visualStylePrompt || '',
          hasStyle: !!visualStylePrompt
        }
      });
    } catch (error) {
      console.error('[Scene AI Generate Draft]', error);
      res.status(500).json({ message: error.message || 'AI 生成场景草稿失败' });
    }
  });
};
