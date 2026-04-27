/**
 * 角色状态按项目画风的渲染缓存 API
 *
 * 数据表：character_state_styled_images
 * 缓存键：(state_id, project_id)；style_fingerprint = md5(visualStylePrompt)
 *
 * 端点：
 * - GET    /api/characters/:id/states/:stateId/styled?projectId=X  读取画风图缓存
 * - POST   /api/characters/:id/states/:stateId/styled              上传/覆盖画风图 URL（upsert）
 * - POST   /api/characters/:id/states/:stateId/styled/generate     触发基于白膜+项目画风的画风图生成（占位，实际生成由 T3 后续任务链接入）
 * - DELETE /api/characters/:id/states/:stateId/styled?projectId=X  清除画风图缓存
 */
const crypto = require('crypto');
const { queryOne, queryAll, execute } = require('../../dbHelper');
const { authMiddleware } = require('../../middleware');
const { getVisualStylePrompt } = require('../../utils/getProjectStyle');
const { checkBaseModelReady } = require('./states');
const { generationStartService, sendGenerationError } = require('../../modules/generation');

/**
 * 计算项目画风指纹：md5(visualStylePrompt)
 * 画风变动时指纹不同 → 缓存视为失效
 */
function computeStyleFingerprint(visualStylePrompt) {
  const raw = (visualStylePrompt || '').trim();
  return crypto.createHash('md5').update(raw).digest('hex');
}

/**
 * 校验角色归属与可见性
 * 规则：角色必须存在，且（角色 user_id=当前用户 OR 项目与用户有关联）—— 简化版暂用 user_id
 */
async function requireCharacterOwned(userId, characterId) {
  const character = await queryOne(
    'SELECT id, user_id, project_id FROM characters WHERE id = ?',
    [characterId]
  );
  if (!character) {
    return { error: { status: 404, message: '角色不存在' } };
  }
  if (character.user_id !== userId) {
    return { error: { status: 403, message: '无权访问该角色' } };
  }
  return { character };
}

module.exports = (router) => {
  // GET 读取画风图缓存
  router.get('/:id/states/:stateId/styled', authMiddleware, async (req, res) => {
    const userId = req.user.id;
    const { id, stateId } = req.params;
    const projectId = Number(req.query.projectId);

    if (!projectId) {
      return res.status(400).json({ message: '缺少 projectId 参数' });
    }

    try {
      const check = await requireCharacterOwned(userId, id);
      if (check.error) return res.status(check.error.status).json({ message: check.error.message });

      const state = await queryOne(
        'SELECT id, is_base_model FROM character_states WHERE id = ? AND character_id = ?',
        [stateId, id]
      );
      if (!state) return res.status(404).json({ message: '角色状态不存在' });

      const current = await queryOne(
        `SELECT * FROM character_state_styled_images
         WHERE state_id = ? AND project_id = ?`,
        [stateId, projectId]
      );

      // 计算当前项目画风指纹，用于判断是否过期
      const visualStylePrompt = await getVisualStylePrompt(projectId);
      const currentFingerprint = computeStyleFingerprint(visualStylePrompt);

      const stale = current && current.style_fingerprint !== currentFingerprint;

      res.json({
        styled: current || null,
        styleFingerprint: currentFingerprint,
        stale: !!stale,
      });
    } catch (error) {
      console.error('[Styled Images GET]', error);
      res.status(500).json({ message: '读取画风图缓存失败' });
    }
  });

  // POST upsert 画风图 URL（手动上传场景）
  router.post('/:id/states/:stateId/styled', authMiddleware, async (req, res) => {
    const userId = req.user.id;
    const { id, stateId } = req.params;
    const { projectId, front_view_url, side_view_url, back_view_url } = req.body;

    if (!projectId) {
      return res.status(400).json({ message: '缺少 projectId 参数' });
    }

    try {
      const check = await requireCharacterOwned(userId, id);
      if (check.error) return res.status(check.error.status).json({ message: check.error.message });

      const state = await queryOne(
        'SELECT id FROM character_states WHERE id = ? AND character_id = ?',
        [stateId, id]
      );
      if (!state) return res.status(404).json({ message: '角色状态不存在' });

      const visualStylePrompt = await getVisualStylePrompt(projectId);
      const fingerprint = computeStyleFingerprint(visualStylePrompt);

      await execute(
        `INSERT INTO character_state_styled_images
           (state_id, project_id, style_fingerprint, front_view_url, side_view_url, back_view_url, generation_status)
         VALUES (?, ?, ?, ?, ?, ?, 'completed')
         ON DUPLICATE KEY UPDATE
           style_fingerprint = VALUES(style_fingerprint),
           front_view_url = VALUES(front_view_url),
           side_view_url  = VALUES(side_view_url),
           back_view_url  = VALUES(back_view_url),
           generation_status = 'completed',
           generation_error = NULL`,
        [
          stateId,
          projectId,
          fingerprint,
          front_view_url || null,
          side_view_url || null,
          back_view_url || null,
        ]
      );

      const row = await queryOne(
        'SELECT * FROM character_state_styled_images WHERE state_id = ? AND project_id = ?',
        [stateId, projectId]
      );

      res.json({ message: '画风图缓存已更新', styled: row });
    } catch (error) {
      console.error('[Styled Images UPSERT]', error);
      res.status(500).json({ message: '保存画风图缓存失败' });
    }
  });

  // POST 触发生成
  // T3 图像生成任务链：operationKey='character_state_styled_generate'
  // 前置：1) 白膜就绪；2) 项目视觉风格已设置
  // 实际生成由 workflow engine 异步推进，前端通过 GET /styled 轮询 generation_status
  router.post('/:id/states/:stateId/styled/generate', authMiddleware, async (req, res) => {
    const userId = req.user.id;
    const { id, stateId } = req.params;
    const { projectId, imageModel, textModel } = req.body || {};

    if (!projectId) {
      return res.status(400).json({ message: '缺少 projectId 参数' });
    }
    if (!imageModel) {
      return res.status(400).json({ message: '缺少 imageModel 参数' });
    }

    try {
      const check = await requireCharacterOwned(userId, id);
      if (check.error) return res.status(check.error.status).json({ message: check.error.message });

      // 硬强制白膜就绪
      const baseCheck = await checkBaseModelReady(Number(id));
      if (!baseCheck.ready) {
        return res.status(409).json({
          message: baseCheck.reason,
          code: 'BASE_MODEL_NOT_READY',
        });
      }

      const state = await queryOne(
        'SELECT id FROM character_states WHERE id = ? AND character_id = ?',
        [stateId, id]
      );
      if (!state) return res.status(404).json({ message: '角色状态不存在' });

      const visualStylePrompt = await getVisualStylePrompt(projectId);
      if (!visualStylePrompt) {
        return res.status(409).json({
          message: '该项目尚未设置视觉风格，请先在工程设置中选择视觉风格',
          code: 'PROJECT_STYLE_MISSING',
        });
      }
      const fingerprint = computeStyleFingerprint(visualStylePrompt);

      // 先 upsert 为 generating（即使 workflow 预校验失败，handler 也会改成 failed）
      await execute(
        `INSERT INTO character_state_styled_images
           (state_id, project_id, style_fingerprint, generation_status)
         VALUES (?, ?, ?, 'generating')
         ON DUPLICATE KEY UPDATE
           style_fingerprint = VALUES(style_fingerprint),
           generation_status = 'generating',
           generation_error = NULL`,
        [stateId, projectId, fingerprint]
      );

      // 启动实际 workflow
      const result = await generationStartService.start({
        operationKey: 'character_state_styled_generate',
        rawInput: {
          characterId: Number(id),
          stateId: Number(stateId),
          projectId: Number(projectId),
          imageModel,
          textModel: textModel || null,
          styleFingerprint: fingerprint,
        },
        actor: { userId },
      });

      res.json(result.response || {
        message: '画风图生成已启动',
        jobId: result.jobId,
        stateId: Number(stateId),
        projectId: Number(projectId),
        styleFingerprint: fingerprint,
        status: 'generating',
      });
    } catch (error) {
      // 启动失败时重置状态
      await execute(
        `UPDATE character_state_styled_images SET generation_status = 'failed', generation_error = ?
         WHERE state_id = ? AND project_id = ?`,
        [error?.message || '启动失败', stateId, projectId]
      ).catch(() => {});
      sendGenerationError(res, error, '触发画风图生成失败', '[Styled Images Generate]');
    }
  });

  // DELETE 清除缓存
  router.delete('/:id/states/:stateId/styled', authMiddleware, async (req, res) => {
    const userId = req.user.id;
    const { id, stateId } = req.params;
    const projectId = Number(req.query.projectId);

    if (!projectId) {
      return res.status(400).json({ message: '缺少 projectId 参数' });
    }

    try {
      const check = await requireCharacterOwned(userId, id);
      if (check.error) return res.status(check.error.status).json({ message: check.error.message });

      await execute(
        'DELETE FROM character_state_styled_images WHERE state_id = ? AND project_id = ?',
        [stateId, projectId]
      );
      res.json({ message: '画风图缓存已清除' });
    } catch (error) {
      console.error('[Styled Images DELETE]', error);
      res.status(500).json({ message: '清除画风图缓存失败' });
    }
  });
};

module.exports.computeStyleFingerprint = computeStyleFingerprint;
