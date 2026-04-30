/**
 * 场景状态（StudioStates）CRUD 路由
 *   GET    /                          ?projectId=&studioId=  列表
 *   GET    /:id                       详情
 *   POST   /                          { projectId, studioId, name, description?, timeOfDay?, weather?, lighting?, mood? }
 *   PATCH  /:id                       { name?, description?, timeOfDay?, weather?, lighting?, mood?, imageUrl?, sortOrder? }
 *   DELETE /:id                       删除
 */
const express = require('express');
const { authMiddleware } = require('../../middleware');
const { queryOne, queryAll, execute } = require('../../dbHelper');

const router = express.Router();

async function ensureOwned(id, userId) {
  const row = await queryOne(
    'SELECT * FROM studio_states WHERE id = ? AND user_id = ?',
    [id, userId]
  );
  return row || null;
}

// GET /
router.get('/', authMiddleware, async (req, res) => {
  const userId = req.user.id;
  const projectId = Number(req.query.projectId) || null;
  const studioId = Number(req.query.studioId) || null;
  try {
    const clauses = ['ss.user_id = ?'];
    const values = [userId];
    if (projectId) { clauses.push('ss.project_id = ?'); values.push(projectId); }
    if (studioId)  { clauses.push('ss.studio_id = ?');  values.push(studioId); }
    const rows = await queryAll(
      `SELECT ss.*, s.name AS studio_name
         FROM studio_states ss
         LEFT JOIN studios s ON s.id = ss.studio_id
         WHERE ${clauses.join(' AND ')}
         ORDER BY ss.sort_order ASC, ss.id DESC`,
      values
    );
    res.json({ studioStates: rows });
  } catch (e) {
    console.error('[StudioStates] list error:', e);
    res.status(500).json({ message: e.message || 'Internal error' });
  }
});

// GET /:id
router.get('/:id', authMiddleware, async (req, res) => {
  const userId = req.user.id;
  const id = Number(req.params.id);
  try {
    const row = await ensureOwned(id, userId);
    if (!row) return res.status(404).json({ message: '场景状态不存在' });
    res.json({ studioState: row });
  } catch (e) {
    res.status(500).json({ message: e.message || 'Internal error' });
  }
});

// POST /
router.post('/', authMiddleware, async (req, res) => {
  const userId = req.user.id;
  const {
    projectId, studioId, name,
    description, timeOfDay, weather, lighting, mood, imageUrl
  } = req.body || {};
  if (!projectId || !studioId || !name) {
    return res.status(400).json({ message: '缺少 projectId / studioId / name' });
  }
  try {
    // 确认 studio 归属
    const studio = await queryOne(
      'SELECT id FROM studios WHERE id = ? AND user_id = ?',
      [studioId, userId]
    );
    if (!studio) return res.status(404).json({ message: '场景不存在或无权限' });

    const result = await execute(
      `INSERT INTO studio_states
         (user_id, project_id, studio_id, name, description, time_of_day, weather, lighting, mood, image_url)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [userId, projectId, studioId, name, description || null,
       timeOfDay || null, weather || null, lighting || null, mood || null, imageUrl || null]
    );
    const row = await queryOne('SELECT * FROM studio_states WHERE id = ?', [result.insertId]);
    res.status(201).json({ studioState: row });
  } catch (e) {
    console.error('[StudioStates] create error:', e);
    res.status(500).json({ message: e.message || 'Internal error' });
  }
});

// PATCH /:id
router.patch('/:id', authMiddleware, async (req, res) => {
  const userId = req.user.id;
  const id = Number(req.params.id);
  try {
    const row = await ensureOwned(id, userId);
    if (!row) return res.status(404).json({ message: '场景状态不存在' });

    const fields = [];
    const values = [];
    const map = {
      name: 'name', description: 'description',
      timeOfDay: 'time_of_day', weather: 'weather',
      lighting: 'lighting', mood: 'mood',
      imageUrl: 'image_url', sortOrder: 'sort_order',
      generationStatus: 'generation_status', generationPrompt: 'generation_prompt'
    };
    for (const [key, col] of Object.entries(map)) {
      if (req.body[key] !== undefined) {
        fields.push(`${col} = ?`);
        values.push(req.body[key]);
      }
    }
    if (fields.length === 0) return res.json({ studioState: row });
    values.push(id);
    await execute(`UPDATE studio_states SET ${fields.join(', ')} WHERE id = ?`, values);
    const updated = await queryOne('SELECT * FROM studio_states WHERE id = ?', [id]);
    res.json({ studioState: updated });
  } catch (e) {
    console.error('[StudioStates] patch error:', e);
    res.status(500).json({ message: e.message || 'Internal error' });
  }
});

// DELETE /:id
router.delete('/:id', authMiddleware, async (req, res) => {
  const userId = req.user.id;
  const id = Number(req.params.id);
  try {
    const row = await ensureOwned(id, userId);
    if (!row) return res.status(404).json({ message: '场景状态不存在' });
    await execute('DELETE FROM studio_states WHERE id = ?', [id]);
    res.json({ message: 'deleted' });
  } catch (e) {
    res.status(500).json({ message: e.message || 'Internal error' });
  }
});

module.exports = router;
