/**
 * 环境时间变体（EnvironmentVariant）CRUD + 图片生成路由
 *   GET    /                          ?environmentId=  列出某环境下所有时间变体
 *   POST   /                         新建变体 { environmentId, timeOfDay, weather?, lighting?, mood? }
 *   PATCH  /:id                      更新变体
 *   DELETE /:id                      删除变体
 */
const express = require('express');
const { generationStartService, sendGenerationError } = require('../../modules/generation');
const { authMiddleware } = require('../../middleware');
const { queryOne, queryAll, execute } = require('../../dbHelper');

const router = express.Router();

/**
 * 确保变体属于当前用户（通过 environment → user 间接校验）
 */
async function ensureVariantOwned(variantId, userId) {
  const row = await queryOne(
    `SELECT ev.*, e.user_id AS env_user_id
     FROM environment_variants ev
     JOIN environments e ON e.id = ev.environment_id
     WHERE ev.id = ? AND e.user_id = ?`,
    [variantId, userId]
  );
  return row || null;
}

// GET /  列出某环境下所有变体
router.get('/', authMiddleware, async (req, res) => {
  const userId = req.user.id;
  const environmentId = Number(req.query.environmentId) || null;
  if (!environmentId) {
    return res.status(400).json({ message: 'environmentId 必填' });
  }
  try {
    // 校验环境归属
    const env = await queryOne(
      'SELECT id FROM environments WHERE id = ? AND user_id = ?',
      [environmentId, userId]
    );
    if (!env) return res.status(404).json({ message: '环境不存在或无权访问' });

    const rows = await queryAll(
      `SELECT id, environment_id, time_of_day, weather, lighting, mood,
              image_url, faces, generation_prompt, generation_status,
              sort_order, created_at, updated_at
       FROM environment_variants
       WHERE environment_id = ?
       ORDER BY sort_order ASC, id ASC`,
      [environmentId]
    );
    res.json({ variants: rows });
  } catch (err) {
    console.error('[EnvVariants][list]', err);
    res.status(500).json({ message: '查询环境变体失败' });
  }
});

// POST /  新建变体
router.post('/', authMiddleware, async (req, res) => {
  const userId = req.user.id;
  const { environmentId, timeOfDay, weather, lighting, mood, sortOrder } = req.body || {};
  if (!environmentId) return res.status(400).json({ message: 'environmentId 必填' });
  if (!timeOfDay || !String(timeOfDay).trim()) return res.status(400).json({ message: 'timeOfDay 必填（如：白天/夜晚/黄昏）' });

  try {
    const env = await queryOne(
      'SELECT id FROM environments WHERE id = ? AND user_id = ?',
      [environmentId, userId]
    );
    if (!env) return res.status(404).json({ message: '环境不存在或无权访问' });

    const result = await execute(
      `INSERT INTO environment_variants
         (environment_id, time_of_day, weather, lighting, mood, generation_status, sort_order)
       VALUES (?, ?, ?, ?, ?, 'pending', ?)`,
      [
        environmentId,
        String(timeOfDay).trim(),
        weather ? String(weather) : null,
        lighting ? String(lighting) : null,
        mood ? String(mood) : null,
        Number(sortOrder) || 0
      ]
    );
    const created = await queryOne('SELECT * FROM environment_variants WHERE id = ?', [result.insertId]);
    res.json({ message: '创建成功', variant: created });
  } catch (err) {
    console.error('[EnvVariants][create]', err);
    res.status(500).json({ message: '创建环境变体失败' });
  }
});

// PATCH /:id  更新变体
router.patch('/:id', authMiddleware, async (req, res) => {
  const userId = req.user.id;
  const id = Number(req.params.id);
  try {
    const existing = await ensureVariantOwned(id, userId);
    if (!existing) return res.status(404).json({ message: '变体不存在或无权访问' });

    const fields = [];
    const values = [];
    const mapping = {
      timeOfDay: 'time_of_day',
      weather: 'weather',
      lighting: 'lighting',
      mood: 'mood',
      imageUrl: 'image_url',
      faces: 'faces',
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
    if (!fields.length) return res.json({ message: '无更新', variant: existing });

    fields.push('updated_at = CURRENT_TIMESTAMP');
    values.push(id);
    await execute(`UPDATE environment_variants SET ${fields.join(', ')} WHERE id = ?`, values);
    const updated = await queryOne('SELECT * FROM environment_variants WHERE id = ?', [id]);
    res.json({ message: '更新成功', variant: updated });
  } catch (err) {
    console.error('[EnvVariants][patch]', err);
    res.status(500).json({ message: '更新环境变体失败' });
  }
});

// DELETE /:id  删除变体
router.delete('/:id', authMiddleware, async (req, res) => {
  const userId = req.user.id;
  const id = Number(req.params.id);
  try {
    const existing = await ensureVariantOwned(id, userId);
    if (!existing) return res.status(404).json({ message: '变体不存在或无权访问' });
    await execute('DELETE FROM environment_variants WHERE id = ?', [id]);
    res.json({ message: '删除成功' });
  } catch (err) {
    console.error('[EnvVariants][delete]', err);
    res.status(500).json({ message: '删除环境变体失败' });
  }
});

// POST /:id/generate-faces  为变体启动8方位场景图生成
router.post('/:id/generate-faces', authMiddleware, async (req, res) => {
  const userId = req.user.id;
  const id = Number(req.params.id);
  try {
    const variant = await ensureVariantOwned(id, userId);
    if (!variant) return res.status(404).json({ message: '变体不存在或无权访问' });

    const env = await queryOne(
      'SELECT id, name, description, time_of_day, weather, lighting, mood FROM environments WHERE id = ?',
      [variant.environment_id]
    );
    if (!env) return res.status(404).json({ message: '关联环境不存在' });

    const result = await generationStartService.start({
      operationKey: 'variant_faces_generate',
      rawInput: {
        environmentId: env.id,
        variantId: id,
        imageModel: req.body.imageModel,
        textModel: req.body.textModel
      },
      actor: { userId }
    });
    res.json(result.response || {
      message: '8方位场景图生成已启动',
      jobId: result.jobId,
      variantId: id,
      environmentId: env.id,
      status: 'generating'
    });
  } catch (err) {
    sendGenerationError(res, err, '启动8方位场景图生成失败', '[GenerateVariantFaces]');
  }
});

module.exports = router;
