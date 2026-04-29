/**
 * 场景元素（影棚元素资产）CRUD + 生成路由
 *   GET    /                  列出当前用户某项目下所有元素 ?projectId=&category=
 *   GET    /:id               获取单个元素
 *   POST   /                  新建元素 { projectId, name, category, description? }
 *   PATCH  /:id               更新元素信息
 *   DELETE /:id               删除元素（级联解除关联）
 *   POST   /:id/generate      启动 workflow 生成元素图
 */
const express = require('express');
const { generationStartService, sendGenerationError } = require('../../modules/generation');
const { authMiddleware } = require('../../middleware');
const { queryOne, queryAll, execute } = require('../../dbHelper');

const router = express.Router();

async function ensureOwned(id, userId) {
  const el = await queryOne(
    'SELECT * FROM scene_elements WHERE id = ? AND user_id = ?',
    [id, userId]
  );
  if (!el) return null;
  return el;
}

// GET /  ?projectId=&category=
router.get('/', authMiddleware, async (req, res) => {
  const userId = req.user.id;
  const projectId = Number(req.query.projectId) || null;
  const category = req.query.category ? String(req.query.category) : null;
  try {
    const clauses = ['user_id = ?'];
    const values = [userId];
    if (projectId) {
      clauses.push('project_id = ?');
      values.push(projectId);
    }
    if (category && ['building', 'scenery'].includes(category)) {
      clauses.push('category = ?');
      values.push(category);
    }
    const rows = await queryAll(
      `SELECT id, user_id, project_id, category, name, description, image_url,
              generation_prompt, generation_status, sort_order, created_at, updated_at
       FROM scene_elements
       WHERE ${clauses.join(' AND ')}
       ORDER BY sort_order ASC, id DESC`,
      values
    );
    res.json({ elements: rows });
  } catch (err) {
    console.error('[SceneElements][list]', err);
    res.status(500).json({ message: '查询场景元素失败' });
  }
});

// GET /:id
router.get('/:id', authMiddleware, async (req, res) => {
  const userId = req.user.id;
  const id = Number(req.params.id);
  try {
    const el = await ensureOwned(id, userId);
    if (!el) return res.status(404).json({ message: '场景元素不存在或无权访问' });
    res.json({ element: el });
  } catch (err) {
    console.error('[SceneElements][get]', err);
    res.status(500).json({ message: '查询场景元素失败' });
  }
});

// POST /
router.post('/', authMiddleware, async (req, res) => {
  const userId = req.user.id;
  const {
    projectId,
    name,
    category,
    description,
    sortOrder
  } = req.body || {};

  if (!projectId) return res.status(400).json({ message: 'projectId 必填' });
  if (!name || !String(name).trim()) return res.status(400).json({ message: 'name 必填' });
  const cat = category === 'building' ? 'building' : 'scenery';

  try {
    const proj = await queryOne(
      'SELECT id FROM projects WHERE id = ? AND user_id = ?',
      [projectId, userId]
    );
    if (!proj) return res.status(404).json({ message: '项目不存在或无权访问' });

    const result = await execute(
      `INSERT INTO scene_elements
         (user_id, project_id, category, name, description, generation_status, sort_order)
       VALUES (?, ?, ?, ?, ?, 'pending', ?)`,
      [userId, projectId, cat, String(name).trim(), description ? String(description) : null, Number(sortOrder) || 0]
    );
    const created = await queryOne(
      'SELECT * FROM scene_elements WHERE id = ?', [result.insertId]
    );
    res.json({ message: '创建成功', element: created });
  } catch (err) {
    console.error('[SceneElements][create]', err);
    res.status(500).json({ message: '创建场景元素失败' });
  }
});

// PATCH /:id
router.patch('/:id', authMiddleware, async (req, res) => {
  const userId = req.user.id;
  const id = Number(req.params.id);
  try {
    const el = await ensureOwned(id, userId);
    if (!el) return res.status(404).json({ message: '场景元素不存在或无权访问' });

    const fields = [];
    const values = [];
    if (req.body?.name !== undefined) {
      fields.push('name = ?');
      values.push(String(req.body.name).trim());
    }
    if (req.body?.category !== undefined) {
      const c = req.body.category === 'building' ? 'building' : 'scenery';
      fields.push('category = ?');
      values.push(c);
    }
    if (req.body?.description !== undefined) {
      fields.push('description = ?');
      values.push(req.body.description === null ? null : String(req.body.description));
    }
    if (req.body?.sortOrder !== undefined) {
      fields.push('sort_order = ?');
      values.push(Number(req.body.sortOrder) || 0);
    }
    if (req.body?.imageUrl !== undefined) {
      fields.push('image_url = ?');
      values.push(req.body.imageUrl || null);
    }
    if (req.body?.generationStatus !== undefined &&
        ['pending', 'generating', 'completed', 'failed'].includes(req.body.generationStatus)) {
      fields.push('generation_status = ?');
      values.push(req.body.generationStatus);
    }
    if (!fields.length) return res.json({ message: '无更新' });

    fields.push('updated_at = CURRENT_TIMESTAMP');
    values.push(id);
    await execute(`UPDATE scene_elements SET ${fields.join(', ')} WHERE id = ?`, values);
    const updated = await queryOne('SELECT * FROM scene_elements WHERE id = ?', [id]);
    res.json({ message: '更新成功', element: updated });
  } catch (err) {
    console.error('[SceneElements][patch]', err);
    res.status(500).json({ message: '更新场景元素失败' });
  }
});

// DELETE /:id
router.delete('/:id', authMiddleware, async (req, res) => {
  const userId = req.user.id;
  const id = Number(req.params.id);
  try {
    const el = await ensureOwned(id, userId);
    if (!el) return res.status(404).json({ message: '场景元素不存在或无权访问' });
    await execute('DELETE FROM scene_elements WHERE id = ?', [id]);
    res.json({ message: '删除成功' });
  } catch (err) {
    console.error('[SceneElements][delete]', err);
    res.status(500).json({ message: '删除场景元素失败' });
  }
});

// POST /:id/generate  body: { imageModel, textModel? }
router.post('/:id/generate', authMiddleware, async (req, res) => {
  const userId = req.user.id;
  const id = Number(req.params.id);
  try {
    const result = await generationStartService.start({
      operationKey: 'scene_element_generate',
      rawInput: {
        elementId: id,
        ...req.body
      },
      actor: { userId }
    });
    res.json(result.response || {
      message: '元素图片生成已启动',
      jobId: result.jobId,
      elementId: id,
      status: 'generating'
    });
  } catch (err) {
    sendGenerationError(res, err, '启动元素图片生成失败', '[GenerateSceneElement]');
  }
});

module.exports = router;
