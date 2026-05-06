/**
 * 扩展市场 API 路由
 * 支持扩展的浏览、搜索、安装、管理和运行时加载
 */

const express = require('express');
const { queryOne, queryAll, execute } = require('./dbHelper');
const { authMiddleware } = require('./middleware');

const router = express.Router();

// ========== 公开 API：扩展市场 ==========

// GET /api/extensions - 扩展列表（支持搜索、分类、排序）
router.get('/extensions', async (req, res) => {
  try {
    const { q, category, sort = 'download', page = 1, limit = 20 } = req.query;
    const offset = (Math.max(1, parseInt(page)) - 1) * Math.min(100, parseInt(limit) || 20);
    const pageSize = Math.min(100, parseInt(limit) || 20);

    let where = "WHERE status = 'approved' AND is_active = 1";
    const params = [];

    if (category) {
      where += " AND category = ?";
      params.push(category);
    }
    if (q) {
      where += " AND (name LIKE ? OR display_name LIKE ? OR description LIKE ?)";
      const like = `%${q}%`;
      params.push(like, like, like);
    }

    // 排序
    let orderBy = 'ORDER BY download_count DESC';
    if (sort === 'newest') orderBy = 'ORDER BY created_at DESC';
    else if (sort === 'rating') orderBy = 'ORDER BY rating DESC';
    else if (sort === 'name') orderBy = 'ORDER BY display_name ASC';

    const countResult = await queryOne(`SELECT COUNT(*) as total FROM extensions ${where}`, params);
    const total = countResult?.total || 0;

    const extensions = await queryAll(
      `SELECT id, name, display_name, description, version, author, category, icon_url, download_count, rating, created_at, updated_at
       FROM extensions ${where} ${orderBy} LIMIT ? OFFSET ?`,
      [...params, pageSize, offset]
    );

    res.json({ extensions, total, page: parseInt(page), limit: pageSize });
  } catch (error) {
    console.error('[Extensions] List error:', error);
    res.status(500).json({ message: '获取扩展列表失败' });
  }
});

// GET /api/extensions/categories - 分类列表
router.get('/extensions/categories', async (req, res) => {
  try {
    const rows = await queryAll(
      `SELECT category, COUNT(*) as count FROM extensions WHERE status = 'approved' AND is_active = 1 GROUP BY category ORDER BY count DESC`
    );
    res.json({ categories: rows });
  } catch (error) {
    console.error('[Extensions] Categories error:', error);
    res.status(500).json({ message: '获取分类列表失败' });
  }
});

// GET /api/extensions/:id - 扩展详情
router.get('/extensions/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const ext = await queryOne(
      `SELECT id, name, display_name, description, version, author, author_id, category, icon_url, readme, manifest_json, source_url, download_count, rating, status, created_at, updated_at
       FROM extensions WHERE id = ? AND status = 'approved' AND is_active = 1`,
      [id]
    );
    if (!ext) {
      return res.status(404).json({ message: '扩展不存在' });
    }
    // 解析 manifest_json
    if (ext.manifest_json) {
      try { ext.manifest = JSON.parse(ext.manifest_json); } catch { ext.manifest = null; }
      delete ext.manifest_json;
    }
    res.json(ext);
  } catch (error) {
    console.error('[Extensions] Detail error:', error);
    res.status(500).json({ message: '获取扩展详情失败' });
  }
});

// GET /api/extensions/:id/versions - 版本历史
router.get('/extensions/:id/versions', async (req, res) => {
  try {
    const { id } = req.params;
    const versions = await queryAll(
      `SELECT id, version, changelog, created_at FROM extension_versions WHERE extension_id = ? ORDER BY created_at DESC`,
      [id]
    );
    res.json({ versions });
  } catch (error) {
    console.error('[Extensions] Versions error:', error);
    res.status(500).json({ message: '获取版本历史失败' });
  }
});

// ========== 需登录 API：用户扩展管理 ==========

// GET /api/user/extensions - 获取用户已安装扩展
router.get('/user/extensions', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.userId;
    const rows = await queryAll(
      `SELECT ue.id, ue.extension_id, ue.installed_version, ue.is_enabled, ue.settings_json, ue.installed_at, ue.updated_at,
              e.name, e.display_name, e.description, e.version as latest_version, e.author, e.category, e.icon_url, e.manifest_json
       FROM user_extensions ue
       JOIN extensions e ON ue.extension_id = e.id
       WHERE ue.user_id = ? AND e.is_active = 1
       ORDER BY ue.installed_at DESC`,
      [userId]
    );
    const extensions = rows.map(row => {
      let manifest = null;
      if (row.manifest_json) {
        try { manifest = JSON.parse(row.manifest_json); } catch { /* ignore */ }
      }
      let settings = null;
      if (row.settings_json) {
        try { settings = JSON.parse(row.settings_json); } catch { /* ignore */ }
      }
      return { ...row, manifest, settings, manifest_json: undefined, settings_json: undefined };
    });
    res.json({ extensions });
  } catch (error) {
    console.error('[Extensions] User extensions error:', error);
    res.status(500).json({ message: '获取已安装扩展失败' });
  }
});

// GET /api/user/extensions/active - 获取当前用户启用的扩展清单（前端启动时调用）
router.get('/user/extensions/active', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.userId;
    const rows = await queryAll(
      `SELECT e.id, e.name, e.display_name, e.version, e.manifest_json, ue.settings_json, ue.installed_version
       FROM user_extensions ue
       JOIN extensions e ON ue.extension_id = e.id
       WHERE ue.user_id = ? AND ue.is_enabled = 1 AND e.status = 'approved' AND e.is_active = 1`,
      [userId]
    );
    const extensions = rows.map(row => {
      let manifest = null;
      if (row.manifest_json) {
        try { manifest = JSON.parse(row.manifest_json); } catch { /* ignore */ }
      }
      let settings = null;
      if (row.settings_json) {
        try { settings = JSON.parse(row.settings_json); } catch { /* ignore */ }
      }
      return { ...row, manifest, settings, manifest_json: undefined, settings_json: undefined };
    });
    res.json({ extensions });
  } catch (error) {
    console.error('[Extensions] Active extensions error:', error);
    res.status(500).json({ message: '获取活跃扩展失败' });
  }
});

// POST /api/user/extensions/:id/install - 安装扩展
router.post('/user/extensions/:id/install', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.userId;
    const extensionId = parseInt(req.params.id);

    const ext = await queryOne(
      `SELECT id, version FROM extensions WHERE id = ? AND status = 'approved' AND is_active = 1`,
      [extensionId]
    );
    if (!ext) {
      return res.status(404).json({ message: '扩展不存在或未通过审核' });
    }

    // 检查是否已安装
    const existing = await queryOne(
      `SELECT id FROM user_extensions WHERE user_id = ? AND extension_id = ?`,
      [userId, extensionId]
    );
    if (existing) {
      return res.status(409).json({ message: '扩展已安装' });
    }

    await execute(
      `INSERT INTO user_extensions (user_id, extension_id, installed_version) VALUES (?, ?, ?)`,
      [userId, extensionId, ext.version]
    );

    // 增加下载计数
    await execute(`UPDATE extensions SET download_count = download_count + 1 WHERE id = ?`, [extensionId]);

    res.json({ message: '安装成功', extension_id: extensionId, version: ext.version });
  } catch (error) {
    console.error('[Extensions] Install error:', error);
    res.status(500).json({ message: '安装扩展失败' });
  }
});

// DELETE /api/user/extensions/:id - 卸载扩展
router.delete('/user/extensions/:id', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.userId;
    const extensionId = parseInt(req.params.id);

    const result = await execute(
      `DELETE FROM user_extensions WHERE user_id = ? AND extension_id = ?`,
      [userId, extensionId]
    );
    if (result.affectedRows === 0) {
      return res.status(404).json({ message: '扩展未安装' });
    }
    res.json({ message: '卸载成功' });
  } catch (error) {
    console.error('[Extensions] Uninstall error:', error);
    res.status(500).json({ message: '卸载扩展失败' });
  }
});

// PATCH /api/user/extensions/:id/enable - 启用/禁用扩展
router.patch('/user/extensions/:id/enable', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.userId;
    const extensionId = parseInt(req.params.id);
    const { is_enabled } = req.body;

    const result = await execute(
      `UPDATE user_extensions SET is_enabled = ? WHERE user_id = ? AND extension_id = ?`,
      [is_enabled ? 1 : 0, userId, extensionId]
    );
    if (result.affectedRows === 0) {
      return res.status(404).json({ message: '扩展未安装' });
    }
    res.json({ message: is_enabled ? '扩展已启用' : '扩展已禁用', is_enabled: !!is_enabled });
  } catch (error) {
    console.error('[Extensions] Toggle error:', error);
    res.status(500).json({ message: '操作失败' });
  }
});

// PUT /api/user/extensions/:id/settings - 更新扩展配置
router.put('/user/extensions/:id/settings', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.userId;
    const extensionId = parseInt(req.params.id);
    const settings = JSON.stringify(req.body.settings || {});

    const result = await execute(
      `UPDATE user_extensions SET settings_json = ? WHERE user_id = ? AND extension_id = ?`,
      [settings, userId, extensionId]
    );
    if (result.affectedRows === 0) {
      return res.status(404).json({ message: '扩展未安装' });
    }
    res.json({ message: '配置已更新' });
  } catch (error) {
    console.error('[Extensions] Settings error:', error);
    res.status(500).json({ message: '更新配置失败' });
  }
});

// ========== 扩展发布（需登录，简单实现，后续可加入审核流程） ==========

// POST /api/extensions - 发布扩展
router.post('/extensions', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.userId;
    const { name, display_name, description, version, category, icon_url, readme, manifest, source_url } = req.body;

    if (!name || !display_name || !version) {
      return res.status(400).json({ message: '缺少必要字段：name, display_name, version' });
    }

    // 检查名称是否已存在
    const existing = await queryOne(`SELECT id FROM extensions WHERE name = ?`, [name]);
    if (existing) {
      return res.status(409).json({ message: '扩展标识名已存在' });
    }

    const manifestJson = manifest ? JSON.stringify(manifest) : null;

    const result = await execute(
      `INSERT INTO extensions (name, display_name, description, version, author_id, category, icon_url, readme, manifest_json, source_url, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'approved')`,
      [name, display_name, description || '', version, userId, category || 'other', icon_url || '', readme || '', manifestJson, source_url || '']
    );

    const extensionId = result.insertId;

    // 同时创建版本记录
    await execute(
      `INSERT INTO extension_versions (extension_id, version, changelog, manifest_json) VALUES (?, ?, ?, ?)`,
      [extensionId, version, '初始版本', manifestJson]
    );

    res.status(201).json({ message: '扩展发布成功', id: extensionId });
  } catch (error) {
    console.error('[Extensions] Publish error:', error);
    res.status(500).json({ message: '发布扩展失败' });
  }
});

// PUT /api/extensions/:id - 更新扩展信息
router.put('/extensions/:id', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.userId;
    const extensionId = parseInt(req.params.id);
    const { display_name, description, category, icon_url, readme, source_url } = req.body;

    // 检查权限（仅作者或管理员可更新）
    const ext = await queryOne(`SELECT author_id FROM extensions WHERE id = ?`, [extensionId]);
    if (!ext) {
      return res.status(404).json({ message: '扩展不存在' });
    }
    if (ext.author_id !== userId && req.user.role !== 'admin') {
      return res.status(403).json({ message: '无权限修改此扩展' });
    }

    await execute(
      `UPDATE extensions SET display_name = ?, description = ?, category = ?, icon_url = ?, readme = ?, source_url = ? WHERE id = ?`,
      [display_name, description, category, icon_url, readme, source_url, extensionId]
    );

    res.json({ message: '扩展信息已更新' });
  } catch (error) {
    console.error('[Extensions] Update error:', error);
    res.status(500).json({ message: '更新扩展失败' });
  }
});

// POST /api/extensions/:id/versions - 发布新版本
router.post('/extensions/:id/versions', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.userId;
    const extensionId = parseInt(req.params.id);
    const { version, changelog, manifest, package_url } = req.body;

    if (!version) {
      return res.status(400).json({ message: '缺少版本号' });
    }

    const ext = await queryOne(`SELECT author_id FROM extensions WHERE id = ?`, [extensionId]);
    if (!ext) {
      return res.status(404).json({ message: '扩展不存在' });
    }
    if (ext.author_id !== userId && req.user.role !== 'admin') {
      return res.status(403).json({ message: '无权限发布新版本' });
    }

    const manifestJson = manifest ? JSON.stringify(manifest) : null;

    await execute(
      `INSERT INTO extension_versions (extension_id, version, changelog, package_url, manifest_json) VALUES (?, ?, ?, ?, ?)`,
      [extensionId, version, changelog || '', package_url || '', manifestJson]
    );

    // 更新扩展当前版本
    await execute(
      `UPDATE extensions SET version = ?, manifest_json = ? WHERE id = ?`,
      [version, manifestJson, extensionId]
    );

    res.json({ message: '新版本发布成功' });
  } catch (error) {
    console.error('[Extensions] Version publish error:', error);
    res.status(500).json({ message: '发布新版本失败' });
  }
});

// DELETE /api/extensions/:id - 下架扩展
router.delete('/extensions/:id', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.userId;
    const extensionId = parseInt(req.params.id);

    const ext = await queryOne(`SELECT author_id FROM extensions WHERE id = ?`, [extensionId]);
    if (!ext) {
      return res.status(404).json({ message: '扩展不存在' });
    }
    if (ext.author_id !== userId && req.user.role !== 'admin') {
      return res.status(403).json({ message: '无权限下架此扩展' });
    }

    await execute(`UPDATE extensions SET is_active = 0, status = 'delisted' WHERE id = ?`, [extensionId]);
    res.json({ message: '扩展已下架' });
  } catch (error) {
    console.error('[Extensions] Delist error:', error);
    res.status(500).json({ message: '下架扩展失败' });
  }
});

module.exports = router;
