/**
 * 环境（Environment）CRUD + 图片生成路由
 *   GET    /                  ?projectId=  列出当前用户某项目下所有环境
 *   GET    /:id               获取单个环境
 *   POST   /                  新建环境 { projectId, name, description?, timeOfDay?, weather?, lighting?, mood? }
 *   PATCH  /:id               更新环境
 *   DELETE /:id               删除（FK ON DELETE SET NULL 自动清理 studios.environment_id）
 *   POST   /:id/generate-image  启动氛围参考图生成
 */
const express = require('express');
const { generationStartService, sendGenerationError } = require('../../modules/generation');
const { authMiddleware } = require('../../middleware');
const { queryOne, queryAll, execute } = require('../../dbHelper');

const router = express.Router();

async function ensureOwned(id, userId) {
  const row = await queryOne(
    'SELECT * FROM environments WHERE id = ? AND user_id = ?',
    [id, userId]
  );
  return row || null;
}

// GET /
router.get('/', authMiddleware, async (req, res) => {
  const userId = req.user.id;
  const projectId = Number(req.query.projectId) || null;
  try {
    const clauses = ['user_id = ?'];
    const values = [userId];
    if (projectId) {
      clauses.push('project_id = ?');
      values.push(projectId);
    }
    const rows = await queryAll(
      `SELECT id, user_id, project_id, name, description, time_of_day, weather,
              lighting, mood, image_url, generation_prompt, generation_status,
              sort_order, created_at, updated_at
       FROM environments
       WHERE ${clauses.join(' AND ')}
       ORDER BY sort_order ASC, id DESC`,
      values
    );
    res.json({ environments: rows });
  } catch (err) {
    console.error('[Environments][list]', err);
    res.status(500).json({ message: '查询环境失败' });
  }
});

// GET /:id
router.get('/:id', authMiddleware, async (req, res) => {
  const userId = req.user.id;
  const id = Number(req.params.id);
  try {
    const env = await ensureOwned(id, userId);
    if (!env) return res.status(404).json({ message: '环境不存在或无权访问' });
    res.json({ environment: env });
  } catch (err) {
    console.error('[Environments][get]', err);
    res.status(500).json({ message: '查询环境失败' });
  }
});

// POST /
router.post('/', authMiddleware, async (req, res) => {
  const userId = req.user.id;
  const {
    projectId,
    name,
    description,
    timeOfDay,
    weather,
    lighting,
    mood,
    sortOrder
  } = req.body || {};

  if (!projectId) return res.status(400).json({ message: 'projectId 必填' });
  if (!name || !String(name).trim()) return res.status(400).json({ message: 'name 必填' });

  try {
    const proj = await queryOne(
      'SELECT id FROM projects WHERE id = ? AND user_id = ?',
      [projectId, userId]
    );
    if (!proj) return res.status(404).json({ message: '项目不存在或无权访问' });

    const result = await execute(
      `INSERT INTO environments
         (user_id, project_id, name, description, time_of_day, weather, lighting, mood,
          generation_status, sort_order)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?)`,
      [
        userId,
        projectId,
        String(name).trim(),
        description ? String(description) : null,
        timeOfDay ? String(timeOfDay) : null,
        weather ? String(weather) : null,
        lighting ? String(lighting) : null,
        mood ? String(mood) : null,
        Number(sortOrder) || 0
      ]
    );
    const created = await queryOne('SELECT * FROM environments WHERE id = ?', [result.insertId]);
    res.json({ message: '创建成功', environment: created });
  } catch (err) {
    console.error('[Environments][create]', err);
    res.status(500).json({ message: '创建环境失败' });
  }
});

// PATCH /:id
router.patch('/:id', authMiddleware, async (req, res) => {
  const userId = req.user.id;
  const id = Number(req.params.id);
  try {
    const env = await ensureOwned(id, userId);
    if (!env) return res.status(404).json({ message: '环境不存在或无权访问' });

    const fields = [];
    const values = [];
    const mapping = {
      name: 'name',
      description: 'description',
      timeOfDay: 'time_of_day',
      weather: 'weather',
      lighting: 'lighting',
      mood: 'mood',
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
    if (req.body?.generationStatus !== undefined &&
        ['pending', 'generating', 'completed', 'failed'].includes(req.body.generationStatus)) {
      fields.push('generation_status = ?');
      values.push(req.body.generationStatus);
    }
    if (!fields.length) return res.json({ message: '无更新', environment: env });

    fields.push('updated_at = CURRENT_TIMESTAMP');
    values.push(id);
    await execute(`UPDATE environments SET ${fields.join(', ')} WHERE id = ?`, values);
    const updated = await queryOne('SELECT * FROM environments WHERE id = ?', [id]);
    res.json({ message: '更新成功', environment: updated });
  } catch (err) {
    console.error('[Environments][patch]', err);
    res.status(500).json({ message: '更新环境失败' });
  }
});

// DELETE /:id
router.delete('/:id', authMiddleware, async (req, res) => {
  const userId = req.user.id;
  const id = Number(req.params.id);
  try {
    const env = await ensureOwned(id, userId);
    if (!env) return res.status(404).json({ message: '环境不存在或无权访问' });
    await execute('DELETE FROM environments WHERE id = ?', [id]);
    res.json({ message: '删除成功' });
  } catch (err) {
    console.error('[Environments][delete]', err);
    res.status(500).json({ message: '删除环境失败' });
  }
});

// POST /:id/generate-image  body: { imageModel, textModel? }
router.post('/:id/generate-image', authMiddleware, async (req, res) => {
  const userId = req.user.id;
  const id = Number(req.params.id);
  try {
    const result = await generationStartService.start({
      operationKey: 'environment_image_generate',
      rawInput: {
        environmentId: id,
        ...req.body
      },
      actor: { userId }
    });
    res.json(result.response || {
      message: '环境氛围图生成已启动',
      jobId: result.jobId,
      environmentId: id,
      status: 'generating'
    });
  } catch (err) {
    sendGenerationError(res, err, '启动环境图生成失败', '[GenerateEnvironment]');
  }
});

module.exports = router;
