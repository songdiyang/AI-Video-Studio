/**
 * 场景 - 元素关联路由（挂在 /api/scenes 下）
 *   GET    /:id/elements           列出场景关联的所有元素（含元素详情）
 *   POST   /:id/elements           为场景追加关联元素 body: { elementId, positionHint?, sortOrder? }
 *   PATCH  /:id/elements/:elementId 更新关联 position_hint / sort_order
 *   DELETE /:id/elements/:elementId 解除关联
 *   POST   /:id/extract-elements   使用 AI 从场景描述抽取元素清单（异步启动 workflow）
 *   POST   /:id/generate-all-elements  批量启动场景内未生成元素的独立生成（逐个）
 */
const { generationStartService, sendGenerationError } = require('../../modules/generation');
const { authMiddleware } = require('../../middleware');
const { queryOne, queryAll, execute } = require('../../dbHelper');

async function ensureScene(sceneId, userId) {
  const scene = await queryOne(
    'SELECT * FROM scenes WHERE id = ? AND user_id = ?',
    [sceneId, userId]
  );
  if (!scene) {
    const err = new Error('场景不存在或无权访问');
    err.statusCode = 404;
    throw err;
  }
  return scene;
}

async function ensureElementOwned(elementId, userId) {
  const el = await queryOne(
    'SELECT * FROM scene_elements WHERE id = ? AND user_id = ?',
    [elementId, userId]
  );
  if (!el) {
    const err = new Error('场景元素不存在或无权访问');
    err.statusCode = 404;
    throw err;
  }
  return el;
}

module.exports = (router) => {
  // GET /:id/elements
  router.get('/:id/elements', authMiddleware, async (req, res) => {
    const userId = req.user.id;
    const sceneId = Number(req.params.id);
    try {
      await ensureScene(sceneId, userId);
      const rows = await queryAll(
        `SELECT l.id AS link_id, l.position_hint, l.sort_order,
                e.id, e.name, e.category, e.description, e.image_url,
                e.generation_status, e.generation_prompt, e.project_id
         FROM scene_element_links l
         JOIN scene_elements e ON e.id = l.element_id
         WHERE l.scene_id = ?
         ORDER BY l.sort_order ASC, l.id ASC`,
        [sceneId]
      );
      res.json({ elements: rows });
    } catch (err) {
      res.status(err.statusCode || 500).json({ message: err.message || '查询场景元素失败' });
    }
  });

  // POST /:id/elements  {elementId, positionHint?, sortOrder?}
  router.post('/:id/elements', authMiddleware, async (req, res) => {
    const userId = req.user.id;
    const sceneId = Number(req.params.id);
    const elementId = Number(req.body?.elementId);
    const positionHint = (req.body?.positionHint || '').toString().trim();
    const sortOrder = Number.isFinite(Number(req.body?.sortOrder)) ? Number(req.body.sortOrder) : 0;
    try {
      const scene = await ensureScene(sceneId, userId);
      const element = await ensureElementOwned(elementId, userId);
      if (element.project_id !== scene.project_id) {
        return res.status(400).json({ message: '元素与场景不属于同一项目，无法关联' });
      }

      const existing = await queryOne(
        'SELECT id FROM scene_element_links WHERE scene_id = ? AND element_id = ?',
        [sceneId, elementId]
      );
      if (existing) {
        return res.status(409).json({ message: '该元素已关联到该场景' });
      }

      const result = await execute(
        `INSERT INTO scene_element_links (scene_id, element_id, position_hint, sort_order)
         VALUES (?, ?, ?, ?)`,
        [sceneId, elementId, positionHint, sortOrder]
      );
      res.json({ message: '关联成功', linkId: result.insertId });
    } catch (err) {
      res.status(err.statusCode || 500).json({ message: err.message || '关联场景元素失败' });
    }
  });

  // PATCH /:id/elements/:elementId
  router.patch('/:id/elements/:elementId', authMiddleware, async (req, res) => {
    const userId = req.user.id;
    const sceneId = Number(req.params.id);
    const elementId = Number(req.params.elementId);
    try {
      await ensureScene(sceneId, userId);
      await ensureElementOwned(elementId, userId);
      const link = await queryOne(
        'SELECT id FROM scene_element_links WHERE scene_id = ? AND element_id = ?',
        [sceneId, elementId]
      );
      if (!link) return res.status(404).json({ message: '关联不存在' });

      const fields = [];
      const values = [];
      if (req.body?.positionHint !== undefined) {
        fields.push('position_hint = ?');
        values.push(String(req.body.positionHint || ''));
      }
      if (req.body?.sortOrder !== undefined) {
        fields.push('sort_order = ?');
        values.push(Number(req.body.sortOrder) || 0);
      }
      if (!fields.length) return res.json({ message: '无更新' });
      values.push(link.id);
      await execute(`UPDATE scene_element_links SET ${fields.join(', ')} WHERE id = ?`, values);
      res.json({ message: '更新成功' });
    } catch (err) {
      res.status(err.statusCode || 500).json({ message: err.message || '更新关联失败' });
    }
  });

  // DELETE /:id/elements/:elementId
  router.delete('/:id/elements/:elementId', authMiddleware, async (req, res) => {
    const userId = req.user.id;
    const sceneId = Number(req.params.id);
    const elementId = Number(req.params.elementId);
    try {
      await ensureScene(sceneId, userId);
      await execute(
        'DELETE FROM scene_element_links WHERE scene_id = ? AND element_id = ?',
        [sceneId, elementId]
      );
      res.json({ message: '关联已解除' });
    } catch (err) {
      res.status(err.statusCode || 500).json({ message: err.message || '解除关联失败' });
    }
  });

  // POST /:id/extract-elements    body: { textModel }
  router.post('/:id/extract-elements', authMiddleware, async (req, res) => {
    const userId = req.user.id;
    const sceneId = Number(req.params.id);
    try {
      const result = await generationStartService.start({
        operationKey: 'scene_elements_extract',
        rawInput: {
          sceneId,
          ...req.body
        },
        actor: { userId }
      });
      res.json(result.response || {
        message: '场景元素抽取已启动',
        jobId: result.jobId,
        sceneId,
        status: 'generating'
      });
    } catch (err) {
      sendGenerationError(res, err, '启动场景元素抽取失败', '[ExtractSceneElements]');
    }
  });
};
