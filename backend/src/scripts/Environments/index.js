/**
 * 环境（Environment）CRUD + 图片生成路由
 *   GET    /                  ?projectId=  列出当前用户某项目下所有环境
 *   GET    /:id               获取单个环境
 *   POST   /                  新建环境 { projectId, name, description?, timeOfDay?, weather?, lighting?, mood?, terrainType? }
 *   PATCH  /:id               更新环境
 *   DELETE /:id               删除（FK ON DELETE SET NULL 自动清理 studios.environment_id）
 *   POST   /:id/generate-image      启动氛围参考图生成
 *   POST   /:id/generate-panorama   启动影棚图生成（全景图+参考图）
 *   DELETE /:id/panorama            清空影棚图 URL（全景图+参考图）
 *   POST   /:id/recognize-terrain   AI识别地貌类型
 *   POST   /recognize-all-terrains 批量识别项目下所有环境的的地貌类型
 */
const express = require('express');
const { generationStartService, sendGenerationError } = require('../../modules/generation');
const { authMiddleware } = require('../../middleware');
const { queryOne, queryAll, execute } = require('../../dbHelper');
const { sanitizeEnvDescription } = require('../../nosyntask/tasks/Studio/environmentDescriptionSanitizer');
const { recognizeTerrainByKeyword, TERRAIN_TYPES } = require('../../nosyntask/tasks/Studio/terrainRecognizer');

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
              lighting, mood, image_url, image_back_url, panorama_image_url, generation_prompt, generation_status,
              terrain_type, sort_order, created_at, updated_at
       FROM environments
       WHERE ${clauses.join(' AND ')}
       ORDER BY sort_order ASC, id DESC`,
      values
    );

    // 为每个环境加载关联的 time variants
    const envIds = rows.map(r => r.id);
    let variantsMap = {};
    if (envIds.length) {
      const variants = await queryAll(
        `SELECT id, environment_id, time_of_day, weather, lighting, mood,
                image_url, panorama_image_url, faces, generation_prompt, generation_status,
                sort_order, created_at, updated_at
         FROM environment_variants
         WHERE environment_id IN (?)
         ORDER BY sort_order ASC, id ASC`,
        [envIds]
      );
      for (const v of variants) {
        if (!variantsMap[v.environment_id]) variantsMap[v.environment_id] = [];
        variantsMap[v.environment_id].push(v);
      }
    }
    const enrichedRows = rows.map(r => ({ ...r, variants: variantsMap[r.id] || [] }));

    res.json({ environments: enrichedRows });
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
      panoramaImageUrl: 'panorama_image_url',
      generationPrompt: 'generation_prompt',
      sortOrder: 'sort_order',
      terrainType: 'terrain_type'
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

// POST /:id/generate-panorama  body: { imageModel, textModel? }
router.post('/:id/generate-panorama', authMiddleware, async (req, res) => {
  const userId = req.user.id;
  const id = Number(req.params.id);
  try {
    const result = await generationStartService.start({
      operationKey: 'environment_panorama_generate',
      rawInput: {
        environmentId: id,
        ...req.body
      },
      actor: { userId }
    });
    res.json(result.response || {
      message: '影棚图生成已启动',
      jobId: result.jobId,
      environmentId: id,
      status: 'generating'
    });
  } catch (err) {
    sendGenerationError(res, err, '启动影棚图生成失败', '[GenerateEnvironmentPanorama]');
  }
});

// DELETE /:id/panorama
router.delete('/:id/panorama', authMiddleware, async (req, res) => {
  const userId = req.user.id;
  const id = Number(req.params.id);
  try {
    const env = await ensureOwned(id, userId);
    if (!env) {
      return res.status(404).json({ message: '环境不存在或无权访问' });
    }
    await execute(
      'UPDATE environments SET panorama_image_url = NULL, image_url = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      [id]
    );
    res.json({ message: '环境影棚图已清除' });
  } catch (err) {
    console.error('[Delete Environment Panorama]', err);
    res.status(500).json({ message: '清除环境影棚图失败' });
  }
});

// POST /sanitize-descriptions  body: { projectId }
// 批量重新清洗某项目下所有环境的描述：剔除角色活动与建筑/人造物描述
router.post('/sanitize-descriptions', authMiddleware, async (req, res) => {
  const userId = req.user.id;
  const projectId = Number(req.body?.projectId) || null;
  if (!projectId) return res.status(400).json({ message: 'projectId 必填' });
  try {
    const proj = await queryOne(
      'SELECT id FROM projects WHERE id = ? AND user_id = ?',
      [projectId, userId]
    );
    if (!proj) return res.status(404).json({ message: '项目不存在或无权访问' });

    // 加载项目下所有建筑，用于剔除环境描述中的建筑名
    const buildings = await queryAll(
      'SELECT name FROM buildings WHERE user_id = ? AND project_id = ?',
      [userId, projectId]
    );
    const buildingNames = buildings.map(b => String(b.name || '').trim()).filter(Boolean);

    const envs = await queryAll(
      'SELECT id, name, description FROM environments WHERE user_id = ? AND project_id = ?',
      [userId, projectId]
    );

    const results = [];
    for (const env of envs) {
      const before = env.description || '';
      const after = sanitizeEnvDescription(before, buildingNames);
      if (after !== before) {
        await execute(
          'UPDATE environments SET description = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
          [after || null, env.id]
        );
      }
      results.push({ id: env.id, name: env.name, before, after, changed: after !== before });
    }

    const changedCount = results.filter(r => r.changed).length;
    res.json({
      message: `已清洗 ${changedCount}/${envs.length} 条环境描述`,
      total: envs.length,
      changed: changedCount,
      results
    });
  } catch (err) {
    console.error('[Environments][sanitize-descriptions]', err);
    res.status(500).json({ message: '清洗环境描述失败' });
  }
});

// POST /:id/sanitize-description  单个环境的描述清洗
router.post('/:id/sanitize-description', authMiddleware, async (req, res) => {
  const userId = req.user.id;
  const id = Number(req.params.id);
  try {
    const env = await ensureOwned(id, userId);
    if (!env) return res.status(404).json({ message: '环境不存在或无权访问' });

    const buildings = await queryAll(
      'SELECT name FROM buildings WHERE user_id = ? AND project_id = ?',
      [userId, env.project_id]
    );
    const buildingNames = buildings.map(b => String(b.name || '').trim()).filter(Boolean);

    const before = env.description || '';
    const after = sanitizeEnvDescription(before, buildingNames);
    if (after !== before) {
      await execute(
        'UPDATE environments SET description = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
        [after || null, id]
      );
    }
    const updated = await queryOne('SELECT * FROM environments WHERE id = ?', [id]);
    res.json({
      message: after === before ? '描述无需清洗' : '已清洗环境描述',
      before,
      after,
      changed: after !== before,
      environment: updated
    });
  } catch (err) {
    console.error('[Environments][sanitize-description]', err);
    res.status(500).json({ message: '清洗环境描述失败' });
  }
});

// POST /:id/recognize-terrain  识别单个环境的地貌类型
router.post('/:id/recognize-terrain', authMiddleware, async (req, res) => {
  const userId = req.user.id;
  const id = Number(req.params.id);
  try {
    const env = await ensureOwned(id, userId);
    if (!env) return res.status(404).json({ message: '环境不存在或无权访问' });

    // 使用关键词识别地貌类型
    const terrainTypes = recognizeTerrainByKeyword(env.description || '');
    const terrainTypeStr = terrainTypes.join(',');

    if (terrainTypes.length > 0) {
      await execute(
        'UPDATE environments SET terrain_type = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
        [terrainTypeStr, id]
      );
    }

    res.json({
      message: terrainTypes.length > 0
        ? `识别到 ${terrainTypes.length} 种地貌类型`
        : '未识别到任何地貌类型',
      environmentId: id,
      terrainTypes,
      availableTypes: TERRAIN_TYPES
    });
  } catch (err) {
    console.error('[Environments][recognize-terrain]', err);
    res.status(500).json({ message: '地貌识别失败' });
  }
});

// POST /recognize-all-terrains  批量识别项目下所有环境的地貌类型
router.post('/recognize-all-terrains', authMiddleware, async (req, res) => {
  const userId = req.user.id;
  const projectId = Number(req.body?.projectId) || null;
  if (!projectId) return res.status(400).json({ message: 'projectId 必填' });
  try {
    const proj = await queryOne(
      'SELECT id FROM projects WHERE id = ? AND user_id = ?',
      [projectId, userId]
    );
    if (!proj) return res.status(404).json({ message: '项目不存在或无权访问' });

    const envs = await queryAll(
      'SELECT id, name, description, terrain_type FROM environments WHERE user_id = ? AND project_id = ?',
      [userId, projectId]
    );

    const results = [];
    for (const env of envs) {
      const terrainTypes = recognizeTerrainByKeyword(env.description || '');
      const terrainTypeStr = terrainTypes.join(',');
      if (terrainTypes.length > 0) {
        await execute(
          'UPDATE environments SET terrain_type = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
          [terrainTypeStr, env.id]
        );
      }
      results.push({
        id: env.id,
        name: env.name,
        terrainTypes,
        changed: terrainTypes.length > 0
      });
    }

    const changedCount = results.filter(r => r.changed).length;
    res.json({
      message: `已识别 ${changedCount}/${envs.length} 个环境的的地貌类型`,
      total: envs.length,
      changed: changedCount,
      results
    });
  } catch (err) {
    console.error('[Environments][recognize-all-terrains]', err);
    res.status(500).json({ message: '批量地貌识别失败' });
  }
});

// GET /terrain-types  获取支持的所有地貌类型列表
router.get('/terrain-types', authMiddleware, async (req, res) => {
  res.json({
    terrainTypes: TERRAIN_TYPES,
    total: TERRAIN_TYPES.length
  });
});

module.exports = router;
