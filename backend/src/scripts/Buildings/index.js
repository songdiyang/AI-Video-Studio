/**
 * 建筑（Building）CRUD + 图片生成路由
 *   GET    /                  ?projectId=  列出当前用户某项目下所有建筑
 *   GET    /:id               获取单个建筑
 *   POST   /                  新建建筑 { projectId, name, description?, interiorExterior?, structureType? }
 *   PATCH  /:id               更新建筑
 *   DELETE /:id               删除（级联删除 studio_building_links）
 *   POST   /:id/generate-image  启动建筑结构图生成
 */
const express = require('express');
const { generationStartService, sendGenerationError } = require('../../modules/generation');
const { authMiddleware } = require('../../middleware');
const { queryOne, queryAll, execute } = require('../../dbHelper');

const router = express.Router();

async function ensureOwned(id, userId) {
  const row = await queryOne(
    'SELECT * FROM buildings WHERE id = ? AND user_id = ?',
    [id, userId]
  );
  return row || null;
}

// GET /
router.get('/', authMiddleware, async (req, res) => {
  const userId = req.user.id;
  const projectId = Number(req.query.projectId) || null;
  const interiorExterior = req.query.interiorExterior ? String(req.query.interiorExterior) : null;
  try {
    const clauses = ['user_id = ?'];
    const values = [userId];
    if (projectId) {
      clauses.push('project_id = ?');
      values.push(projectId);
    }
    if (interiorExterior && ['interior', 'exterior', 'both'].includes(interiorExterior)) {
      clauses.push('interior_exterior = ?');
      values.push(interiorExterior);
    }
    const rows = await queryAll(
      `SELECT id, user_id, project_id, name, description, interior_exterior,
              structure_type, image_url, generation_prompt, generation_status,
              sort_order, created_at, updated_at
       FROM buildings
       WHERE ${clauses.join(' AND ')}
       ORDER BY sort_order ASC, id DESC`,
      values
    );
    res.json({ buildings: rows });
  } catch (err) {
    console.error('[Buildings][list]', err);
    res.status(500).json({ message: '查询建筑失败' });
  }
});

// GET /:id
router.get('/:id', authMiddleware, async (req, res) => {
  const userId = req.user.id;
  const id = Number(req.params.id);
  try {
    const b = await ensureOwned(id, userId);
    if (!b) return res.status(404).json({ message: '建筑不存在或无权访问' });
    res.json({ building: b });
  } catch (err) {
    console.error('[Buildings][get]', err);
    res.status(500).json({ message: '查询建筑失败' });
  }
});

// POST /
router.post('/', authMiddleware, async (req, res) => {
  const userId = req.user.id;
  const {
    projectId,
    name,
    description,
    interiorExterior,
    structureType,
    sortOrder
  } = req.body || {};

  if (!projectId) return res.status(400).json({ message: 'projectId 必填' });
  if (!name || !String(name).trim()) return res.status(400).json({ message: 'name 必填' });
  const ie = ['interior', 'exterior', 'both'].includes(interiorExterior) ? interiorExterior : 'exterior';

  try {
    const proj = await queryOne(
      'SELECT id FROM projects WHERE id = ? AND user_id = ?',
      [projectId, userId]
    );
    if (!proj) return res.status(404).json({ message: '项目不存在或无权访问' });

    const result = await execute(
      `INSERT INTO buildings
         (user_id, project_id, name, description, interior_exterior, structure_type,
          generation_status, sort_order)
       VALUES (?, ?, ?, ?, ?, ?, 'pending', ?)`,
      [
        userId,
        projectId,
        String(name).trim(),
        description ? String(description) : null,
        ie,
        structureType ? String(structureType) : null,
        Number(sortOrder) || 0
      ]
    );
    const created = await queryOne('SELECT * FROM buildings WHERE id = ?', [result.insertId]);
    res.json({ message: '创建成功', building: created });
  } catch (err) {
    console.error('[Buildings][create]', err);
    res.status(500).json({ message: '创建建筑失败' });
  }
});

// PATCH /:id
router.patch('/:id', authMiddleware, async (req, res) => {
  const userId = req.user.id;
  const id = Number(req.params.id);
  try {
    const b = await ensureOwned(id, userId);
    if (!b) return res.status(404).json({ message: '建筑不存在或无权访问' });

    const fields = [];
    const values = [];
    const mapping = {
      name: 'name',
      description: 'description',
      structureType: 'structure_type',
      imageUrl: 'image_url',
      generationPrompt: 'generation_prompt',
      sortOrder: 'sort_order'
    };
    for (const [k, col] of Object.entries(mapping)) {
      if (req.body?.[k] !== undefined) {
        fields.push(`${col} = ?`);
        if (k === 'sortOrder') values.push(Number(req.body[k]) || 0);
        else if (req.body[k] === null) values.push(null);
        else values.push(String(req.body[k]));
      }
    }
    if (req.body?.interiorExterior !== undefined &&
        ['interior', 'exterior', 'both'].includes(req.body.interiorExterior)) {
      fields.push('interior_exterior = ?');
      values.push(req.body.interiorExterior);
    }
    if (req.body?.generationStatus !== undefined &&
        ['pending', 'generating', 'completed', 'failed'].includes(req.body.generationStatus)) {
      fields.push('generation_status = ?');
      values.push(req.body.generationStatus);
    }
    if (!fields.length) return res.json({ message: '无更新', building: b });

    fields.push('updated_at = CURRENT_TIMESTAMP');
    values.push(id);
    await execute(`UPDATE buildings SET ${fields.join(', ')} WHERE id = ?`, values);
    const updated = await queryOne('SELECT * FROM buildings WHERE id = ?', [id]);
    res.json({ message: '更新成功', building: updated });
  } catch (err) {
    console.error('[Buildings][patch]', err);
    res.status(500).json({ message: '更新建筑失败' });
  }
});

// DELETE /:id
router.delete('/:id', authMiddleware, async (req, res) => {
  const userId = req.user.id;
  const id = Number(req.params.id);
  try {
    const b = await ensureOwned(id, userId);
    if (!b) return res.status(404).json({ message: '建筑不存在或无权访问' });
    await execute('DELETE FROM buildings WHERE id = ?', [id]);
    res.json({ message: '删除成功' });
  } catch (err) {
    console.error('[Buildings][delete]', err);
    res.status(500).json({ message: '删除建筑失败' });
  }
});

// POST /:id/generate-image  body: { imageModel, textModel? }
router.post('/:id/generate-image', authMiddleware, async (req, res) => {
  const userId = req.user.id;
  const id = Number(req.params.id);
  try {
    const result = await generationStartService.start({
      operationKey: 'building_image_generate',
      rawInput: {
        buildingId: id,
        ...req.body
      },
      actor: { userId }
    });
    res.json(result.response || {
      message: '建筑结构图生成已启动',
      jobId: result.jobId,
      buildingId: id,
      status: 'generating'
    });
  } catch (err) {
    sendGenerationError(res, err, '启动建筑图生成失败', '[GenerateBuilding]');
  }
});

module.exports = router;
