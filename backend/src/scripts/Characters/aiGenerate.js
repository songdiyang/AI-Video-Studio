/**
 * AI 智能生成角色 - 草稿预览 + 确认提交两阶段接口
 *
 * 流程：
 *  1. POST /api/characters/ai-generate-draft  → AI 出草稿（不入库）
 *  2. 前端展示弹窗，用户编辑 / 勾选 / 选模型
 *  3. POST /api/characters/ai-generate-commit → 按依赖顺序落库 + 启动白膜三视图
 *  4. 白膜 workflow 完成后由 handler 自动串画风版默认服装状态（见 characterViewsGeneration.js 末尾）
 */
const { queryOne, execute, queryAll } = require('../../dbHelper');
const { authMiddleware } = require('../../middleware');
const { getEffectiveProjectRole } = require('../../middleware/collaborationAuth');
const { getVisualStylePrompt } = require('../../utils/getProjectStyle');
const { generationStartService, sendGenerationError } = require('../../modules/generation');
const handleBaseTextModelCall = require('../../nosyntask/tasks/base/baseTextModelCall');
const { withAIBillingContext } = require('../../aiBillingContext');
const { stripThinkTags, extractCodeBlock, extractJSON, stripInvisible, safeParseJSON } = require('../../utils/washBody');

const WRITABLE_ROLES = new Set(['owner', 'admin', 'editor']);
const AI_CALL_TIMEOUT = parseInt(process.env.CHARACTER_AI_GENERATE_TIMEOUT, 10) || 60000;

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

async function getDefaultImageModel() {
  const m = await queryOne(
    "SELECT name FROM ai_model_configs WHERE category = 'IMAGE' AND is_active = 1 ORDER BY id ASC LIMIT 1"
  );
  return m?.name;
}

/**
 * 构建单角色 AI 草稿生成提示词
 * 强制 AI 按"白膜体貌 + 服装装饰"两层返回
 */
function buildDraftPrompt(userDescription, visualStyleHint) {
  return `你是一个专业的角色设定助手。根据用户描述，生成一个完整的角色设定草稿，严格分为「白膜体貌」和「服装装饰」两层。

【用户描述】
${userDescription || '(无额外描述，请合理发挥)'}
${visualStyleHint ? `\n【项目视觉风格要求】${visualStyleHint}\n请确保生成的服装/发型/配饰与该视觉风格/时代背景一致。\n` : ''}

**输出要求 - 严格 JSON 对象格式：**

\`\`\`json
{
  "name": "角色中文名",
  "gender": "male | female | unknown",
  "base_appearance": "白膜体貌描述（只能包含永久身体特征）",
  "outfit_appearance": "服装装饰描述（服装款式/颜色/材质、配饰、鞋子等可更换穿戴物品）",
  "personality": "性格描述",
  "description": "角色简介（背景、身份、职业、故事定位等）"
}
\`\`\`

**关键约束：**

1. base_appearance（白膜体貌 - 不可更换的身体特征）：
   - 必须描述：年龄段、性别、身高体型、肤色、发型发色、瞳色、脸型五官
   - 必须描述：永久身体标记（疤痕、胎记、纹身等）
   - 【绝对禁止】不能包含任何服装、配饰、装备、鞋子、帽子等可更换物品

2. outfit_appearance（服装装饰 - 可更换的穿戴物品）：
   - 必须明确描述服装款式、颜色、材质、层次（内衣/外衣/披风等）
   - 必须描述鞋子、配饰、发饰、腰带、包袋等
   - 【绝对禁止】不能包含身体特征（皮肤/发色/体型等）

3. 只输出 JSON 对象，不要添加说明文字`;
}

/**
 * 解析 AI 返回的草稿 JSON
 */
function parseDraftResponse(rawContent) {
  let jsonStr = stripThinkTags(rawContent);
  jsonStr = extractCodeBlock(jsonStr);
  jsonStr = stripInvisible(jsonStr).trim();

  let parsed = safeParseJSON(jsonStr);
  if (parsed === null) {
    const extracted = extractJSON(jsonStr);
    if (extracted) parsed = safeParseJSON(extracted);
  }
  if (!parsed) throw new Error('AI 返回的内容无法解析为 JSON');

  // 如果 AI 返回了数组，取第一个
  if (Array.isArray(parsed)) parsed = parsed[0];
  if (!parsed || !parsed.name) throw new Error('AI 返回的草稿缺少必要字段 name');

  return {
    name: String(parsed.name || '').trim(),
    gender: ['male', 'female', 'unknown'].includes(parsed.gender) ? parsed.gender : 'unknown',
    base_appearance: String(parsed.base_appearance || '').trim(),
    outfit_appearance: String(parsed.outfit_appearance || '').trim(),
    personality: String(parsed.personality || '').trim(),
    description: String(parsed.description || '').trim()
  };
}

module.exports = (router) => {
  /**
   * POST /api/characters/ai-generate-draft
   * 入参: { projectId, userDescription, textModel? }
   * 出参: { draft, projectStyle, estimatedResources, estimatedCredits }
   */
  router.post('/ai-generate-draft', authMiddleware, async (req, res) => {
    const userId = req.user.id;
    const { projectId, userDescription = '', textModel: inputModel } = req.body || {};

    if (!projectId) {
      return res.status(400).json({ message: '缺少 projectId' });
    }
    if (!userDescription || !userDescription.trim()) {
      return res.status(400).json({ message: '请输入角色描述' });
    }

    try {
      // 协作鉴权（owner / admin / editor 可生成）
      const role = await getEffectiveProjectRole(userId, projectId);
      if (!role || !WRITABLE_ROLES.has(role)) {
        return res.status(403).json({ message: '无权在该项目生成角色' });
      }

      const textModel = inputModel || (await getDefaultTextModel());
      if (!textModel) {
        return res.status(400).json({ message: '未配置可用文本模型' });
      }

      // 查项目画风
      const project = await queryOne(
        'SELECT id, name, settings_json FROM projects WHERE id = ?',
        [projectId]
      );
      if (!project) {
        return res.status(404).json({ message: '项目不存在' });
      }
      let settings = {};
      try {
        settings = typeof project.settings_json === 'string'
          ? (project.settings_json ? JSON.parse(project.settings_json) : {})
          : (project.settings_json || {});
      } catch (_) { settings = {}; }
      const visualStylePrompt = await getVisualStylePrompt(projectId);

      // 调用文本模型生成草稿（包裹计费上下文）
      const prompt = buildDraftPrompt(userDescription, visualStylePrompt);
      const response = await withAIBillingContext(
        {
          userId,
          projectId,
          sourceType: 'route',
          operationKey: 'character_ai_generate_draft',
          resourceRefs: { projectId }
        },
        () => withTimeout(
          handleBaseTextModelCall({
            prompt,
            textModel,
            maxTokens: 1500,
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

      const draft = parseDraftResponse(content);

      // 预估资源：1 角色 + （如有服装）1 服装 + 1 白膜状态，白膜完成后再加 1 默认服装状态
      const estimatedResources = {
        character: 1,
        costume: draft.outfit_appearance ? 1 : 0,
        baseState: 1,
        costumeState: 1 // 白膜完成后自动创建
      };

      // 粗略预估：白膜三视图 3 张 + 默认服装状态三视图 3 张 = 约 6 张图片积分
      const estimatedCredits = {
        whiteModel: 3,  // 张
        costumeState: 3, // 张
        totalImages: 6,
        note: '实际消耗以生成时结算为准'
      };

      res.json({
        draft,
        projectStyle: {
          projectId: project.id,
          projectName: project.name,
          visualStyle: settings.visualStyle || '',
          visualStylePrompt: visualStylePrompt || '',
          hasStyle: !!visualStylePrompt
        },
        estimatedResources,
        estimatedCredits
      });
    } catch (error) {
      console.error('[AI Generate Draft]', error);
      res.status(500).json({ message: error.message || 'AI 生成草稿失败' });
    }
  });

  /**
   * POST /api/characters/ai-generate-commit
   * 入参: {
   *   projectId,
   *   draft: { name, gender, base_appearance, outfit_appearance, personality, description },
   *   imageModel, textModel?
   * }
   * 出参: { characterId, costumeId, baseStateId, jobId }
   */
  router.post('/ai-generate-commit', authMiddleware, async (req, res) => {
    const userId = req.user.id;
    const {
      projectId,
      draft,
      imageModel: inputImageModel,
      textModel: inputTextModel
    } = req.body || {};

    if (!projectId) return res.status(400).json({ message: '缺少 projectId' });
    if (!draft || !draft.name) return res.status(400).json({ message: '缺少有效的角色草稿' });

    try {
      const role = await getEffectiveProjectRole(userId, projectId);
      if (!role || !WRITABLE_ROLES.has(role)) {
        return res.status(403).json({ message: '无权在该项目生成角色' });
      }

      const imageModel = inputImageModel || (await getDefaultImageModel());
      const textModel = inputTextModel || (await getDefaultTextModel());
      if (!imageModel) return res.status(400).json({ message: '未配置可用图像模型' });
      if (!textModel) return res.status(400).json({ message: '未配置可用文本模型' });

      const name = String(draft.name || '').trim();
      const gender = ['male', 'female', 'unknown'].includes(draft.gender) ? draft.gender : 'unknown';
      const baseApp = String(draft.base_appearance || '').trim();
      const outfitApp = String(draft.outfit_appearance || '').trim();
      const personality = String(draft.personality || '').trim();
      const description = String(draft.description || '').trim();
      const fullAppearance = [baseApp, outfitApp].filter(Boolean).join('；');

      // --- a. INSERT characters ---
      const charResult = await execute(
        `INSERT INTO characters
          (user_id, project_id, name, description, appearance, base_appearance, outfit_appearance, personality, gender, source)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'ai_generated')`,
        [userId, projectId, name, description, fullAppearance, baseApp, outfitApp, personality, gender]
      );
      const characterId = charResult.insertId;

      // --- b. INSERT costumes（如果有 outfit_appearance）---
      let costumeId = null;
      let costumeJobId = null;
      if (outfitApp) {
        try {
          const costumeResult = await execute(
            `INSERT INTO costumes
              (user_id, project_id, name, description, category, gender, outfit_prompt)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [
              userId,
              projectId,
              `${name}-默认装`,
              `${name} 的默认服装（AI 智能生成时自动创建）`,
              'daily',
              gender === 'unknown' ? 'unisex' : gender,
              outfitApp
            ]
          );
          costumeId = costumeResult.insertId;

          // 创建角色-服装关联（is_equipped=1）
          await execute(
            `INSERT INTO character_costumes (character_id, costume_id, is_equipped) VALUES (?, ?, 1)`,
            [characterId, costumeId]
          );

          // ★ 并行启动服装设定图生成（基于通用 mannequin，不依赖角色白膜）
          try {
            const costumeJob = await generationStartService.start({
              operationKey: 'costume_views_generate',
              rawInput: { costumeId, imageModel, textModel },
              actor: { userId }
            });
            costumeJobId = costumeJob.jobId;
            console.log('[AI Generate Commit] 服装设定图生成已启动 costumeId=%s jobId=%s', costumeId, costumeJobId);
          } catch (viewsErr) {
            console.warn('[AI Generate Commit] 服装设定图启动失败，用户可手动重试:', viewsErr.message);
          }
        } catch (costumeErr) {
          console.warn('[AI Generate Commit] 创建服装资产失败，跳过:', costumeErr.message);
        }
      }

      // --- c. INSERT character_states（白膜状态，关联 costume_id）---
      const baseStateResult = await execute(
        `INSERT INTO character_states
          (character_id, is_base_model, name, description, appearance, gender, costume_id, is_active, generation_status)
         VALUES (?, 1, '基础白膜', '角色基础白膜版本，标准化白色背心+短裤着装，用于后续叠加服装', ?, ?, ?, 1, 'idle')`,
        [characterId, baseApp, gender, costumeId]
      );
      const baseStateId = baseStateResult.insertId;

      // --- d. 启动白膜三视图 workflow ---
      // 白膜完成后，前端根据 jobId 监听完成回调，再主动调用 POST /:id/generate-default-costume-state
      // 来创建默认服装状态 + 启动状态三视图 workflow。
      // 这种前端驱动的串联避免了 handler 内 actor/userId 透传和 schema 校验风险。
      const jobResult = await generationStartService.start({
        operationKey: 'character_views_generate',
        rawInput: {
          characterId,
          imageModel,
          textModel
        },
        actor: { userId }
      });

      res.json({
        message: 'AI 角色已创建，白膜生成已启动',
        characterId,
        costumeId,
        baseStateId,
        jobId: jobResult.jobId,
        costumeJobId,
        followUp: {
          pendingCostumeState: !!costumeId,
          api: costumeId ? `/api/characters/${characterId}/generate-default-costume-state` : null,
          note: costumeId ? '前端监听白膜 jobId 完成后，调用 followUp.api 启动默认服装状态三视图生成' : null
        }
      });
    } catch (error) {
      sendGenerationError(res, error, 'AI 创建角色失败', '[AI Generate Commit]');
    }
  });

  /**
   * POST /api/characters/:id/generate-default-costume-state
   * 白膜三视图完成后，前端主动调用此接口创建"默认服装"状态并启动状态三视图 workflow
   * 入参: { imageModel?, textModel? }
   * 出参: { stateId, jobId }
   */
  router.post('/:id/generate-default-costume-state', authMiddleware, async (req, res) => {
    const userId = req.user.id;
    const characterId = Number(req.params.id);
    const { imageModel: inputImageModel, textModel: inputTextModel } = req.body || {};

    try {
      // 查角色 + 鉴权
      const character = await queryOne(
        'SELECT id, project_id, name, gender, base_appearance, outfit_appearance, front_view_url, side_view_url, back_view_url FROM characters WHERE id = ?',
        [characterId]
      );
      if (!character) {
        return res.status(404).json({ message: '角色不存在' });
      }
      const role = await getEffectiveProjectRole(userId, character.project_id);
      if (!role || !WRITABLE_ROLES.has(role)) {
        return res.status(403).json({ message: '无权在该项目操作角色' });
      }

      // 白膜三视图必须先完成
      if (!character.front_view_url) {
        return res.status(400).json({ message: '白膜正面视图尚未生成，不能启动默认服装状态三视图' });
      }

      // 找到已绑定的服装（is_equipped=1）
      const equipped = await queryOne(
        `SELECT c.id AS costume_id, c.outfit_prompt, c.name AS costume_name
         FROM character_costumes cc
         JOIN costumes c ON c.id = cc.costume_id
         WHERE cc.character_id = ? AND cc.is_equipped = 1
         LIMIT 1`,
        [characterId]
      );
      if (!equipped) {
        return res.status(400).json({ message: '角色未绑定默认服装，无法生成默认服装状态' });
      }

      const imageModel = inputImageModel || (await getDefaultImageModel());
      const textModel = inputTextModel || (await getDefaultTextModel());
      if (!imageModel) return res.status(400).json({ message: '未配置可用图像模型' });

      // 查是否已存在默认服装状态（复用）
      let stateId;
      const existing = await queryOne(
        `SELECT id FROM character_states 
         WHERE character_id = ? AND is_base_model = 0 AND costume_id = ? AND state_category = '"costume"'
         ORDER BY id ASC LIMIT 1`,
        [characterId, equipped.costume_id]
      );

      if (existing) {
        stateId = existing.id;
      } else {
        // 创建默认服装状态
        const fullAppearance = [character.base_appearance, character.outfit_appearance].filter(Boolean).join('；');
        const stateResult = await execute(
          `INSERT INTO character_states
            (character_id, is_base_model, name, description, appearance, outfit, gender, costume_id, is_active, generation_status, state_category)
           VALUES (?, 0, '默认服装', '角色默认服装状态（基于白膜三视图生成）', ?, ?, ?, ?, 0, 'idle', '"costume"')`,
          [characterId, fullAppearance, character.outfit_appearance || '', character.gender || 'unknown', equipped.costume_id]
        );
        stateId = stateResult.insertId;
      }

      // 启动状态三视图 workflow
      const result = await generationStartService.start({
        operationKey: 'character_state_views_generate',
        rawInput: {
          characterId,
          stateId,
          imageModel,
          textModel
        },
        actor: { userId }
      });

      res.json(result.response || {
        message: '默认服装状态三视图生成已启动',
        characterId,
        stateId,
        jobId: result.jobId,
        status: 'generating'
      });
    } catch (error) {
      sendGenerationError(res, error, '启动默认服装状态三视图失败', '[AI Default Costume State]');
    }
  });
};
