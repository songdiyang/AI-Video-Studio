const express = require('express');
const { queryOne, queryAll, execute } = require('../../dbHelper');
const { authMiddleware } = require('../../middleware');
const { getEffectiveProjectRole } = require('../../middleware/collaborationAuth');

const router = express.Router();

// 注册场景图片生成路由
require('./generateImage')(router);
require('./generatePanorama')(router);
require('./cutFromPanorama')(router);
require('./elementLinks')(router);

// 注册场景图片提示词生成/优化路由
require('./generateImagePrompt')(router);

// 注册场景草图路由
require('./sceneSketch')(router);

// 注册场景 AI 草稿生成路由
require('./aiGenerate')(router);

// 注册场景参考图路由
require('./sceneReferenceImage')(router);

// 获取所有场景
router.get('/', authMiddleware, async (req, res) => {
  const userId = req.user.id;

  try {
    const scenes = await queryAll(
      `SELECT s.*, p.name AS project_name, st.name AS studio_name
       FROM scenes s 
       LEFT JOIN projects p ON s.project_id = p.id 
       LEFT JOIN studios st ON st.id = s.studio_id
       WHERE s.user_id = ? 
       ORDER BY s.created_at DESC`,
      [userId]
    );

    res.json({ scenes });
  } catch (error) {
    console.error('[Scenes List]', error);
    res.status(500).json({ message: '获取场景列表失败' });
  }
});

// 获取项目的所有场景
// 支持可选的 scriptId 参数：/project/:projectId?scriptId=123
// 如果不传 scriptId，返回项目下所有场景；如果传了，只返回该剧本的场景
router.get('/project/:projectId', authMiddleware, async (req, res) => {
  const userId = req.user.id;
  const { projectId } = req.params;
  const { scriptId } = req.query;

  try {
    // 验证项目权限（支持团队成员访问）
    const role = await getEffectiveProjectRole(userId, projectId);
    if (!role) {
      return res.status(403).json({ message: '无权访问该项目' });
    }

    let sql = `SELECT DISTINCT s.*,
                      COALESCE(spb.binding_type, CASE WHEN s.project_id = ? THEN 'owner' ELSE NULL END) AS binding_type,
                      st.name AS studio_name
               FROM scenes s
               LEFT JOIN scene_project_bindings spb ON spb.scene_id = s.id AND spb.project_id = ?
               LEFT JOIN studios st ON st.id = s.studio_id
               WHERE (s.project_id = ? OR spb.project_id = ?)`;
    const params = [projectId, projectId, projectId, projectId];

    // 如果提供了 scriptId，添加过滤条件
    if (scriptId) {
      sql += ' AND s.script_id = ?';
      params.push(scriptId);
    }

    sql += ' ORDER BY s.created_at DESC';

    const scenes = await queryAll(sql, params);

    console.log('[Scenes by Project] 项目', projectId, 'scriptId:', scriptId || 'all', '共有', scenes.length, '个场景');
    res.json({ scenes });
  } catch (error) {
    console.error('[Scenes by Project]', error);
    res.status(500).json({ message: '获取项目场景失败' });
  }
});

// 获取单个场景
router.get('/:id', authMiddleware, async (req, res) => {
  const userId = req.user.id;
  const { id } = req.params;

  try {
    const scene = await queryOne(
      'SELECT * FROM scenes WHERE id = ?',
      [id]
    );

    if (!scene) {
      return res.status(404).json({ message: '场景不存在' });
    }

    // 通过场景关联的项目检查权限
    if (scene.project_id) {
      const role = await getEffectiveProjectRole(userId, scene.project_id);
      if (!role) {
        return res.status(403).json({ message: '无权访问该场景' });
      }
    } else if (scene.user_id !== userId) {
      return res.status(403).json({ message: '无权访问该场景' });
    }

    res.json(scene);
  } catch (error) {
    console.error('[Scene Detail]', error);
    res.status(500).json({ message: '获取场景失败' });
  }
});

// 创建场景
router.post('/', authMiddleware, async (req, res) => {
  const userId = req.user.id;
  const { name, description, environment, lighting, mood, image_url, tags, spatial_layout, camera_defaults, project_id, script_id, source, reference_image_url } = req.body;

  if (!name) {
    return res.status(400).json({ message: '场景名称不能为空' });
  }

  // 如果指定了项目，验证权限
  if (project_id) {
    const role = await getEffectiveProjectRole(userId, project_id);
    if (!role || role === 'viewer') {
      return res.status(403).json({ message: '无权在该项目中创建场景' });
    }
  }

  // 序列化空间布局和摄像机默认参数为JSON字符串
  const spatialLayoutJson = spatial_layout ? (typeof spatial_layout === 'string' ? spatial_layout : JSON.stringify(spatial_layout)) : null;
  const cameraDefaultsJson = camera_defaults ? (typeof camera_defaults === 'string' ? camera_defaults : JSON.stringify(camera_defaults)) : null;

  try {
    const result = await execute(
      `INSERT INTO scenes (user_id, project_id, script_id, name, description, environment, lighting, mood, image_url, tags, spatial_layout, camera_defaults, source, reference_image_url) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [userId, project_id || null, script_id || null, name, description || '', environment || '', lighting || '', mood || '', image_url || '', tags || '', spatialLayoutJson, cameraDefaultsJson, source || 'manual', reference_image_url || null]
    );

    const id = result.insertId;
    const scene = await queryOne('SELECT * FROM scenes WHERE id = ?', [id]);

    res.json({ message: '场景创建成功', scene });
  } catch (error) {
    console.error('[Scene Create]', error);
    res.status(500).json({ message: '创建场景失败' });
  }
});

// 更新场景
router.put('/:id', authMiddleware, async (req, res) => {
  const userId = req.user.id;
  const { id } = req.params;
  const { name, description, environment, lighting, mood, image_url, tags, spatial_layout, camera_defaults, reference_image_url } = req.body;

  try {
    const existing = await queryOne(
      'SELECT * FROM scenes WHERE id = ?',
      [id]
    );

    if (!existing) {
      return res.status(404).json({ message: '场景不存在' });
    }

    // 检查编辑权限
    let hasAccess = false;
    if (existing.project_id) {
      const role = await getEffectiveProjectRole(userId, existing.project_id);
      hasAccess = role && role !== 'viewer';
    } else {
      hasAccess = existing.user_id === userId;
    }
    if (!hasAccess) {
      return res.status(403).json({ message: '无权编辑该场景' });
    }

    // 序列化空间布局和摄像机默认参数为JSON字符串
    // 注意：使用 undefined 检查以区分"未传递"和"显式传 null 清空"
    let spatialLayoutJson = existing.spatial_layout;
    if (spatial_layout !== undefined) {
      spatialLayoutJson = spatial_layout ? (typeof spatial_layout === 'string' ? spatial_layout : JSON.stringify(spatial_layout)) : null;
    }
    let cameraDefaultsJson = existing.camera_defaults;
    if (camera_defaults !== undefined) {
      cameraDefaultsJson = camera_defaults ? (typeof camera_defaults === 'string' ? camera_defaults : JSON.stringify(camera_defaults)) : null;
    }

    await execute(
      `UPDATE scenes 
       SET name = ?, description = ?, environment = ?, lighting = ?, mood = ?, image_url = ?, tags = ?, spatial_layout = ?, camera_defaults = ?, reference_image_url = ?, updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [name || existing.name, description || existing.description, environment || existing.environment,
       lighting || existing.lighting, mood || existing.mood, image_url || existing.image_url, tags || existing.tags, spatialLayoutJson, cameraDefaultsJson, reference_image_url !== undefined ? (reference_image_url || null) : existing.reference_image_url, id]
    );

    const scene = await queryOne('SELECT * FROM scenes WHERE id = ?', [id]);

    res.json({ message: '场景更新成功', scene });
  } catch (error) {
    console.error('[Scene Update]', error);
    res.status(500).json({ message: '更新场景失败' });
  }
});

// 删除场景
router.delete('/:id', authMiddleware, async (req, res) => {
  const userId = req.user.id;
  const { id } = req.params;

  try {
    const existing = await queryOne(
      'SELECT * FROM scenes WHERE id = ?',
      [id]
    );

    if (!existing) {
      return res.status(404).json({ message: '场景不存在' });
    }

    // 检查删除权限
    let hasAccess = false;
    if (existing.project_id) {
      const role = await getEffectiveProjectRole(userId, existing.project_id);
      hasAccess = role && role !== 'viewer';
    } else {
      hasAccess = existing.user_id === userId;
    }
    if (!hasAccess) {
      return res.status(403).json({ message: '无权删除该场景' });
    }

    await execute('DELETE FROM scenes WHERE id = ?', [id]);

    res.json({ message: '场景删除成功' });
  } catch (error) {
    console.error('[Scene Delete]', error);
    res.status(500).json({ message: '删除场景失败' });
  }
});

// ========== 场景-项目一对多绑定 ==========
async function requireSceneEditable(userId, sceneId) {
  const scene = await queryOne('SELECT * FROM scenes WHERE id = ?', [sceneId]);
  if (!scene) return { error: { status: 404, message: '场景不存在' } };
  let hasAccess = false;
  if (scene.project_id) {
    const role = await getEffectiveProjectRole(userId, scene.project_id);
    hasAccess = role && role !== 'viewer';
  } else {
    hasAccess = scene.user_id === userId;
  }
  if (!hasAccess) return { error: { status: 403, message: '无权操作该场景' } };
  return { scene };
}

// 读取场景绑定的所有项目
router.get('/:id/bindings', authMiddleware, async (req, res) => {
  const userId = req.user.id;
  const { id } = req.params;
  try {
    const check = await requireSceneEditable(userId, id);
    if (check.error) return res.status(check.error.status).json({ message: check.error.message });
    const bindings = await queryAll(
      `SELECT b.project_id, b.binding_type, b.created_at,
              p.title AS project_title, p.type AS project_type
       FROM scene_project_bindings b
       LEFT JOIN projects p ON p.id = b.project_id
       WHERE b.scene_id = ?
       ORDER BY b.binding_type = 'owner' DESC, b.created_at ASC`,
      [id]
    );
    res.json({ sceneId: Number(id), bindings });
  } catch (error) {
    console.error('[Scene Bindings GET]', error);
    res.status(500).json({ message: '获取场景绑定失败' });
  }
});

// 添加绑定
router.post('/:id/bindings', authMiddleware, async (req, res) => {
  const userId = req.user.id;
  const { id } = req.params;
  const { projectId } = req.body || {};
  if (!projectId) return res.status(400).json({ message: '缺少 projectId' });
  try {
    const check = await requireSceneEditable(userId, id);
    if (check.error) return res.status(check.error.status).json({ message: check.error.message });
    const role = await getEffectiveProjectRole(userId, projectId);
    if (!role || role === 'viewer') {
      return res.status(403).json({ message: '无权向该项目添加场景' });
    }
    const exists = await queryOne(
      'SELECT * FROM scene_project_bindings WHERE scene_id = ? AND project_id = ?',
      [id, projectId]
    );
    if (exists) return res.json({ message: '场景已绑定该项目', binding: exists });
    await execute(
      `INSERT INTO scene_project_bindings (scene_id, project_id, binding_type, created_at)
       VALUES (?, ?, 'reference', NOW())`,
      [id, projectId]
    );
    const binding = await queryOne(
      'SELECT * FROM scene_project_bindings WHERE scene_id = ? AND project_id = ?',
      [id, projectId]
    );
    res.status(201).json({ message: '已添加项目绑定', binding });
  } catch (error) {
    console.error('[Scene Bindings POST]', error);
    res.status(500).json({ message: '添加项目绑定失败' });
  }
});

// 解除绑定
router.delete('/:id/bindings/:projectId', authMiddleware, async (req, res) => {
  const userId = req.user.id;
  const { id, projectId } = req.params;
  try {
    const check = await requireSceneEditable(userId, id);
    if (check.error) return res.status(check.error.status).json({ message: check.error.message });
    const binding = await queryOne(
      'SELECT * FROM scene_project_bindings WHERE scene_id = ? AND project_id = ?',
      [id, projectId]
    );
    if (!binding) return res.status(404).json({ message: '绑定不存在' });
    if (binding.binding_type === 'owner') {
      return res.status(400).json({
        message: '不能解除原生项目绑定',
        code: 'CANNOT_UNBIND_OWNER',
      });
    }
    await execute(
      'DELETE FROM scene_project_bindings WHERE scene_id = ? AND project_id = ?',
      [id, projectId]
    );
    res.json({ message: '已解除项目绑定' });
  } catch (error) {
    console.error('[Scene Bindings DELETE]', error);
    res.status(500).json({ message: '解除项目绑定失败' });
  }
});

module.exports = router;