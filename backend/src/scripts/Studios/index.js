/**
 * 场景（Studio）CRUD 与环境/建筑/元素关联路由
 *   GET    /                       ?projectId=  列出当前用户某项目下所有场景
 *   GET    /:id                    详情（含 environment + buildings[] + elements[] 聚合）
 *   POST   /                       { projectId, name, description?, coverImageUrl? }
 *   PATCH  /:id                    { name?, description?, coverImageUrl?, sortOrder? }
 *   DELETE /:id                    删除场景
 *   POST   /:id/environment        设置场景环境 { environmentId }
 *   DELETE /:id/environment        移除场景环境
 *   POST   /:id/buildings/:buildingId    关联建筑
 *   DELETE /:id/buildings/:buildingId    解除关联
 *   POST   /:id/elements/:elementId      关联元素（保留兼容）
 *   DELETE /:id/elements/:elementId      解除关联（保留兼容）
 */
const express = require('express');
const { authMiddleware } = require('../../middleware');
const { queryOne, queryAll, execute } = require('../../dbHelper');
const { generationStartService, sendGenerationError } = require('../../modules/generation');

const router = express.Router();

async function ensureOwned(id, userId) {
  const row = await queryOne(
    'SELECT * FROM studios WHERE id = ? AND user_id = ?',
    [id, userId]
  );
  return row || null;
}

// GET /
router.get('/', authMiddleware, async (req, res) => {
  const userId = req.user.id;
  const projectId = Number(req.query.projectId) || null;
  try {
    const clauses = ['s.user_id = ?'];
    const values = [userId];
    if (projectId) {
      clauses.push('s.project_id = ?');
      values.push(projectId);
    }
    const rows = await queryAll(
      `SELECT s.id, s.user_id, s.project_id, s.name, s.description, s.cover_image_url,
              s.sort_order, s.environment_id, s.created_at, s.updated_at,
              e.name AS environment_name, e.image_url AS environment_image_url,
              e.panorama_image_url AS environment_panorama_image_url,
              (SELECT COUNT(*) FROM scenes sc WHERE sc.studio_id = s.id) AS scene_count,
              (SELECT COUNT(*) FROM studio_element_links l WHERE l.studio_id = s.id) AS element_count
       FROM studios s
       LEFT JOIN environments e ON e.id = s.environment_id
       WHERE ${clauses.join(' AND ')}
       ORDER BY s.sort_order ASC, s.id DESC`,
      values
    );

    // 批量聚合每个 studio 的建筑摘要
    const studioIds = rows.map((r) => r.id);
    let buildingsByStudio = new Map();
    if (studioIds.length > 0) {
      const placeholders = studioIds.map(() => '?').join(',');
      const links = await queryAll(
        `SELECT l.studio_id, b.id, b.name, b.image_url
         FROM studio_building_links l
         JOIN buildings b ON b.id = l.building_id
         WHERE l.studio_id IN (${placeholders})
         ORDER BY l.sort_order ASC, l.id ASC`,
        studioIds
      );
      for (const link of links) {
        if (!buildingsByStudio.has(link.studio_id)) buildingsByStudio.set(link.studio_id, []);
        buildingsByStudio.get(link.studio_id).push({ id: link.id, name: link.name, image_url: link.image_url });
      }
    }
    const studios = rows.map((r) => ({
      ...r,
      environment: r.environment_id
        ? { id: r.environment_id, name: r.environment_name, image_url: r.environment_image_url, panorama_image_url: r.environment_panorama_image_url }
        : null,
      buildings: buildingsByStudio.get(r.id) || [],
    }));
    res.json({ studios });
  } catch (err) {
    console.error('[Studios][list]', err);
    res.status(500).json({ message: '查询影棚失败' });
  }
});

// GET /:id
router.get('/:id', authMiddleware, async (req, res) => {
  const userId = req.user.id;
  const id = Number(req.params.id);
  try {
    const studio = await ensureOwned(id, userId);
    if (!studio) return res.status(404).json({ message: '影棚不存在或无权访问' });

    const environment = studio.environment_id
      ? await queryOne(
          `SELECT id, name, description, time_of_day, weather, lighting, mood,
                  image_url, generation_status
           FROM environments
           WHERE id = ? AND user_id = ?`,
          [studio.environment_id, userId]
        )
      : null;
    const buildings = await queryAll(
      `SELECT b.id, b.name, b.description, b.interior_exterior, b.structure_type,
              b.image_url, b.generation_status, l.sort_order
       FROM studio_building_links l
       JOIN buildings b ON b.id = l.building_id
       WHERE l.studio_id = ?
       ORDER BY l.sort_order ASC, l.id ASC`,
      [id]
    );
    const elements = await queryAll(
      `SELECT e.id, e.name, e.category, e.description, e.image_url, e.generation_status,
              l.sort_order
       FROM studio_element_links l
       JOIN scene_elements e ON e.id = l.element_id
       WHERE l.studio_id = ?
       ORDER BY l.sort_order ASC, l.id ASC`,
      [id]
    );
    res.json({ studio, environment, buildings, elements });
  } catch (err) {
    console.error('[Studios][get]', err);
    res.status(500).json({ message: '查询影棚详情失败' });
  }
});

// POST /
router.post('/', authMiddleware, async (req, res) => {
  const userId = req.user.id;
  const { projectId, name, description, coverImageUrl, sortOrder } = req.body || {};
  if (!projectId) return res.status(400).json({ message: 'projectId 必填' });
  if (!name || !String(name).trim()) return res.status(400).json({ message: 'name 必填' });

  try {
    const proj = await queryOne(
      'SELECT id FROM projects WHERE id = ? AND user_id = ?',
      [projectId, userId]
    );
    if (!proj) return res.status(404).json({ message: '项目不存在或无权访问' });

    const result = await execute(
      `INSERT INTO studios (user_id, project_id, name, description, cover_image_url, sort_order)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        userId,
        projectId,
        String(name).trim(),
        description ? String(description) : null,
        coverImageUrl ? String(coverImageUrl) : null,
        Number(sortOrder) || 0
      ]
    );
    const created = await queryOne('SELECT * FROM studios WHERE id = ?', [result.insertId]);
    res.json({ message: '创建成功', studio: created });
  } catch (err) {
    console.error('[Studios][create]', err);
    res.status(500).json({ message: '创建影棚失败' });
  }
});

// PATCH /:id
router.patch('/:id', authMiddleware, async (req, res) => {
  const userId = req.user.id;
  const id = Number(req.params.id);
  try {
    const studio = await ensureOwned(id, userId);
    if (!studio) return res.status(404).json({ message: '影棚不存在或无权访问' });

    const fields = [];
    const values = [];
    if (req.body?.name !== undefined) {
      const n = String(req.body.name).trim();
      if (!n) return res.status(400).json({ message: 'name 不能为空' });
      fields.push('name = ?');
      values.push(n);
    }
    if (req.body?.description !== undefined) {
      fields.push('description = ?');
      values.push(req.body.description === null ? null : String(req.body.description));
    }
    if (req.body?.coverImageUrl !== undefined) {
      fields.push('cover_image_url = ?');
      values.push(req.body.coverImageUrl || null);
    }
    if (req.body?.sortOrder !== undefined) {
      fields.push('sort_order = ?');
      values.push(Number(req.body.sortOrder) || 0);
    }
    if (!fields.length) return res.json({ message: '无更新', studio });

    fields.push('updated_at = CURRENT_TIMESTAMP');
    values.push(id);
    await execute(`UPDATE studios SET ${fields.join(', ')} WHERE id = ?`, values);
    const updated = await queryOne('SELECT * FROM studios WHERE id = ?', [id]);
    res.json({ message: '更新成功', studio: updated });
  } catch (err) {
    console.error('[Studios][patch]', err);
    res.status(500).json({ message: '更新影棚失败' });
  }
});

// DELETE /:id
router.delete('/:id', authMiddleware, async (req, res) => {
  const userId = req.user.id;
  const id = Number(req.params.id);
  try {
    const studio = await ensureOwned(id, userId);
    if (!studio) return res.status(404).json({ message: '影棚不存在或无权访问' });
    await execute('DELETE FROM studios WHERE id = ?', [id]);
    res.json({ message: '删除成功' });
  } catch (err) {
    console.error('[Studios][delete]', err);
    res.status(500).json({ message: '删除影棚失败' });
  }
});

// POST /:id/environment  设置场景环境
router.post('/:id/environment', authMiddleware, async (req, res) => {
  const userId = req.user.id;
  const id = Number(req.params.id);
  const environmentId = Number(req.body?.environmentId);
  if (!environmentId) return res.status(400).json({ message: 'environmentId 必填' });
  try {
    const studio = await ensureOwned(id, userId);
    if (!studio) return res.status(404).json({ message: '场景不存在或无权访问' });

    const env = await queryOne(
      'SELECT id, project_id FROM environments WHERE id = ? AND user_id = ?',
      [environmentId, userId]
    );
    if (!env) return res.status(404).json({ message: '环境不存在或无权访问' });
    if (env.project_id !== studio.project_id) {
      return res.status(400).json({ message: '环境与场景不属于同一项目' });
    }

    await execute('UPDATE studios SET environment_id = ? WHERE id = ?', [environmentId, id]);
    res.json({ message: '已绑定环境' });
  } catch (err) {
    console.error('[Studios][setEnvironment]', err);
    res.status(500).json({ message: '绑定环境失败' });
  }
});

// DELETE /:id/environment  移除场景环境
router.delete('/:id/environment', authMiddleware, async (req, res) => {
  const userId = req.user.id;
  const id = Number(req.params.id);
  try {
    const studio = await ensureOwned(id, userId);
    if (!studio) return res.status(404).json({ message: '场景不存在或无权访问' });
    await execute('UPDATE studios SET environment_id = NULL WHERE id = ?', [id]);
    res.json({ message: '已移除环境绑定' });
  } catch (err) {
    console.error('[Studios][unsetEnvironment]', err);
    res.status(500).json({ message: '移除环境绑定失败' });
  }
});

// POST /:id/buildings/:buildingId  关联建筑
router.post('/:id/buildings/:buildingId', authMiddleware, async (req, res) => {
  const userId = req.user.id;
  const id = Number(req.params.id);
  const buildingId = Number(req.params.buildingId);
  try {
    const studio = await ensureOwned(id, userId);
    if (!studio) return res.status(404).json({ message: '场景不存在或无权访问' });

    const building = await queryOne(
      'SELECT id, project_id FROM buildings WHERE id = ? AND user_id = ?',
      [buildingId, userId]
    );
    if (!building) return res.status(404).json({ message: '建筑不存在或无权访问' });
    if (building.project_id !== studio.project_id) {
      return res.status(400).json({ message: '建筑与场景不属于同一项目' });
    }

    await execute(
      `INSERT INTO studio_building_links (studio_id, building_id, sort_order)
       VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE sort_order = VALUES(sort_order)`,
      [id, buildingId, Number(req.body?.sortOrder) || 0]
    );
    res.json({ message: '已关联建筑' });
  } catch (err) {
    console.error('[Studios][attachBuilding]', err);
    res.status(500).json({ message: '建筑关联失败' });
  }
});

// DELETE /:id/buildings/:buildingId  解除关联
router.delete('/:id/buildings/:buildingId', authMiddleware, async (req, res) => {
  const userId = req.user.id;
  const id = Number(req.params.id);
  const buildingId = Number(req.params.buildingId);
  try {
    const studio = await ensureOwned(id, userId);
    if (!studio) return res.status(404).json({ message: '场景不存在或无权访问' });
    await execute(
      'DELETE FROM studio_building_links WHERE studio_id = ? AND building_id = ?',
      [id, buildingId]
    );
    res.json({ message: '已解除建筑关联' });
  } catch (err) {
    console.error('[Studios][detachBuilding]', err);
    res.status(500).json({ message: '解除建筑关联失败' });
  }
});

// POST /:id/elements/:elementId
router.post('/:id/elements/:elementId', authMiddleware, async (req, res) => {
  const userId = req.user.id;
  const id = Number(req.params.id);
  const elementId = Number(req.params.elementId);
  try {
    const studio = await ensureOwned(id, userId);
    if (!studio) return res.status(404).json({ message: '影棚不存在或无权访问' });

    const element = await queryOne(
      'SELECT id, project_id FROM scene_elements WHERE id = ? AND user_id = ?',
      [elementId, userId]
    );
    if (!element) return res.status(404).json({ message: '场景元素不存在或无权访问' });
    if (element.project_id !== studio.project_id) {
      return res.status(400).json({ message: '元素与影棚不属于同一项目' });
    }

    await execute(
      `INSERT INTO studio_element_links (studio_id, element_id, sort_order)
       VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE sort_order = VALUES(sort_order)`,
      [id, elementId, Number(req.body?.sortOrder) || 0]
    );
    res.json({ message: '已关联元素' });
  } catch (err) {
    console.error('[Studios][attachElement]', err);
    res.status(500).json({ message: '元素关联失败' });
  }
});

// DELETE /:id/elements/:elementId
router.delete('/:id/elements/:elementId', authMiddleware, async (req, res) => {
  const userId = req.user.id;
  const id = Number(req.params.id);
  const elementId = Number(req.params.elementId);
  try {
    const studio = await ensureOwned(id, userId);
    if (!studio) return res.status(404).json({ message: '影棚不存在或无权访问' });
    await execute(
      'DELETE FROM studio_element_links WHERE studio_id = ? AND element_id = ?',
      [id, elementId]
    );
    res.json({ message: '已解除关联' });
  } catch (err) {
    console.error('[Studios][detachElement]', err);
    res.status(500).json({ message: '解除关联失败' });
  }
});

// POST /:id/props/:propId  关联可交互道具
router.post('/:id/props/:propId', authMiddleware, async (req, res) => {
  const userId = req.user.id;
  const id = Number(req.params.id);
  const propId = Number(req.params.propId);
  try {
    const studio = await ensureOwned(id, userId);
    if (!studio) return res.status(404).json({ message: '场景不存在或无权访问' });

    const prop = await queryOne(
      'SELECT id, project_id FROM props WHERE id = ? AND user_id = ?',
      [propId, userId]
    );
    if (!prop) return res.status(404).json({ message: '道具不存在或无权访问' });
    if (prop.project_id !== studio.project_id) {
      return res.status(400).json({ message: '道具与场景不属于同一项目' });
    }

    await execute(
      `INSERT INTO studio_prop_links (studio_id, prop_id, position_hint, sort_order)
       VALUES (?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE position_hint = VALUES(position_hint), sort_order = VALUES(sort_order)`,
      [id, propId, req.body?.positionHint || null, Number(req.body?.sortOrder) || 0]
    );
    res.json({ message: '已关联道具' });
  } catch (err) {
    console.error('[Studios][attachProp]', err);
    res.status(500).json({ message: '道具关联失败' });
  }
});

// DELETE /:id/props/:propId
router.delete('/:id/props/:propId', authMiddleware, async (req, res) => {
  const userId = req.user.id;
  const id = Number(req.params.id);
  const propId = Number(req.params.propId);
  try {
    const studio = await ensureOwned(id, userId);
    if (!studio) return res.status(404).json({ message: '场景不存在或无权访问' });
    await execute(
      'DELETE FROM studio_prop_links WHERE studio_id = ? AND prop_id = ?',
      [id, propId]
    );
    res.json({ message: '已解除道具关联' });
  } catch (err) {
    console.error('[Studios][detachProp]', err);
    res.status(500).json({ message: '解除道具关联失败' });
  }
});

// POST /extract-components  body: { projectId, scriptId, textModel }
// 阶段1：从剧本拆分环境与建筑
router.post('/extract-components', authMiddleware, async (req, res) => {
  const userId = req.user.id;
  try {
    const result = await generationStartService.start({
      operationKey: 'studio_components_extract',
      rawInput: req.body || {},
      actor: { userId }
    });
    res.json(result.response || {
      message: '已启动从剧本拆分环境与建筑',
      jobId: result.jobId,
      status: 'pending'
    });
  } catch (err) {
    sendGenerationError(res, err, '启动拆分场景组件失败', '[Studios][ExtractComponents]');
  }
});

// POST /compose-from-script  body: { projectId, scriptId, textModel }
// 阶段2：拼接场景（环境 + 建筑 + 元素 → studio）
router.post('/compose-from-script', authMiddleware, async (req, res) => {
  const userId = req.user.id;
  try {
    const result = await generationStartService.start({
      operationKey: 'studio_compose_from_script',
      rawInput: req.body || {},
      actor: { userId }
    });
    res.json(result.response || {
      message: '已启动从剧本拆成场景',
      jobId: result.jobId,
      status: 'pending'
    });
  } catch (err) {
    sendGenerationError(res, err, '启动拼接场景失败', '[Studios][ComposeFromScript]');
  }
});

module.exports = router;
