const express = require('express');
const { queryOne, queryAll, execute } = require('../../dbHelper');
const { authMiddleware } = require('../../middleware');

const router = express.Router();

// 注册场景图片生成路由
require('./generateImage')(router);

// 注册场景草图路由
require('./sceneSketch')(router);

// 获取所有场景
router.get('/', authMiddleware, async (req, res) => {
  const userId = req.user.id;

  try {
    const scenes = await queryAll(
      `SELECT s.*, p.name AS project_name 
       FROM scenes s 
       LEFT JOIN projects p ON s.project_id = p.id 
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
    let sql = 'SELECT * FROM scenes WHERE project_id = ? AND user_id = ?';
    const params = [projectId, userId];

    // 如果提供了 scriptId，添加过滤条件
    if (scriptId) {
      sql += ' AND script_id = ?';
      params.push(scriptId);
    }

    sql += ' ORDER BY created_at DESC';

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
      'SELECT * FROM scenes WHERE id = ? AND user_id = ?',
      [id, userId]
    );

    if (!scene) {
      return res.status(404).json({ message: '场景不存在' });
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
  const { name, description, environment, lighting, mood, image_url, tags, spatial_layout, camera_defaults } = req.body;

  if (!name) {
    return res.status(400).json({ message: '场景名称不能为空' });
  }

  // 序列化空间布局和摄像机默认参数为JSON字符串
  const spatialLayoutJson = spatial_layout ? (typeof spatial_layout === 'string' ? spatial_layout : JSON.stringify(spatial_layout)) : null;
  const cameraDefaultsJson = camera_defaults ? (typeof camera_defaults === 'string' ? camera_defaults : JSON.stringify(camera_defaults)) : null;

  try {
    const result = await execute(
      `INSERT INTO scenes (user_id, name, description, environment, lighting, mood, image_url, tags, spatial_layout, camera_defaults) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [userId, name, description || '', environment || '', lighting || '', mood || '', image_url || '', tags || '', spatialLayoutJson, cameraDefaultsJson]
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
  const { name, description, environment, lighting, mood, image_url, tags, spatial_layout, camera_defaults } = req.body;

  try {
    const existing = await queryOne(
      'SELECT * FROM scenes WHERE id = ? AND user_id = ?',
      [id, userId]
    );

    if (!existing) {
      return res.status(404).json({ message: '场景不存在' });
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
       SET name = ?, description = ?, environment = ?, lighting = ?, mood = ?, image_url = ?, tags = ?, spatial_layout = ?, camera_defaults = ?, updated_at = CURRENT_TIMESTAMP
       WHERE id = ? AND user_id = ?`,
      [name || existing.name, description || existing.description, environment || existing.environment,
       lighting || existing.lighting, mood || existing.mood, image_url || existing.image_url, tags || existing.tags, spatialLayoutJson, cameraDefaultsJson, id, userId]
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
      'SELECT * FROM scenes WHERE id = ? AND user_id = ?',
      [id, userId]
    );

    if (!existing) {
      return res.status(404).json({ message: '场景不存在' });
    }

    await execute('DELETE FROM scenes WHERE id = ? AND user_id = ?', [id, userId]);

    res.json({ message: '场景删除成功' });
  } catch (error) {
    console.error('[Scene Delete]', error);
    res.status(500).json({ message: '删除场景失败' });
  }
});

module.exports = router;