const express = require('express');
const { queryOne, queryAll, execute } = require('./dbHelper');
const { authMiddleware, requireAdmin, clearTokenInvalidationCache } = require('./middleware');
const { clearServiceFeeRateCache } = require('./pointsService');

const router = express.Router();

/**
 * 获取所有系统配置（公开接口，用户可访问）
 * GET /api/system-configs
 */
router.get('/', authMiddleware, async (req, res) => {
  try {
    const configs = await queryAll(
      'SELECT id, config_key, config_name, config_type, config_value, description, is_active FROM system_configs WHERE is_active = 1 ORDER BY config_key'
    );
    res.json({ configs });
  } catch (error) {
    console.error('[SystemConfig] 获取配置失败:', error);
    res.status(500).json({ message: '获取系统配置失败' });
  }
});

/**
 * 根据key获取单个配置（公开接口）
 * GET /api/system-configs/:key
 */
router.get('/:key', authMiddleware, async (req, res) => {
  const { key } = req.params;

  try {
    const config = await queryOne(
      'SELECT id, config_key, config_name, config_type, config_value, description, is_active FROM system_configs WHERE config_key = ? AND is_active = 1',
      [key]
    );

    if (!config) {
      return res.status(404).json({ message: '配置不存在' });
    }

    res.json(config);
  } catch (error) {
    console.error('[SystemConfig] 获取配置失败:', error);
    res.status(500).json({ message: '获取系统配置失败' });
  }
});

// ========== 管理员接口 ==========

/**
 * 获取所有系统配置（管理员）
 * GET /api/system-configs/admin/all
 */
router.get('/admin/all', authMiddleware, requireAdmin, async (req, res) => {
  try {
    const configs = await queryAll(
      'SELECT * FROM system_configs ORDER BY config_key'
    );
    res.json({ configs });
  } catch (error) {
    console.error('[SystemConfig] 获取配置失败:', error);
    res.status(500).json({ message: '获取系统配置失败' });
  }
});

/**
 * 创建系统配置（管理员）
 * POST /api/system-configs/admin
 */
router.post('/admin', authMiddleware, requireAdmin, async (req, res) => {
  const { config_key, config_name, config_type, config_value, description, is_active } = req.body;

  if (!config_key || !config_name || !config_type || !config_value) {
    return res.status(400).json({ message: '缺少必需字段' });
  }

  try {
    // 检查key是否已存在
    const existing = await queryOne(
      'SELECT id FROM system_configs WHERE config_key = ?',
      [config_key]
    );

    if (existing) {
      return res.status(409).json({ message: '配置键已存在' });
    }

    const result = await execute(
      `INSERT INTO system_configs (config_key, config_name, config_type, config_value, description, is_active)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        config_key,
        config_name,
        config_type,
        JSON.stringify(config_value),
        description || '',
        is_active !== undefined ? is_active : 1
      ]
    );

    const id = result.insertId;
    const config = await queryOne('SELECT * FROM system_configs WHERE id = ?', [id]);

    res.json({ message: '配置创建成功', config });
  } catch (error) {
    console.error('[SystemConfig] 创建配置失败:', error);
    res.status(500).json({ message: '创建系统配置失败' });
  }
});

/**
 * 更新系统配置（管理员）
 * PUT /api/system-configs/admin/:id
 */
router.put('/admin/:id', authMiddleware, requireAdmin, async (req, res) => {
  const { id } = req.params;
  const { config_name, config_type, config_value, description, is_active } = req.body;

  try {
    const existing = await queryOne('SELECT id FROM system_configs WHERE id = ?', [id]);
    if (!existing) {
      return res.status(404).json({ message: '配置不存在' });
    }

    const updates = [];
    const values = [];

    if (config_name !== undefined) {
      updates.push('config_name = ?');
      values.push(config_name);
    }
    if (config_type !== undefined) {
      updates.push('config_type = ?');
      values.push(config_type);
    }
    if (config_value !== undefined) {
      updates.push('config_value = ?');
      values.push(JSON.stringify(config_value));
    }
    if (description !== undefined) {
      updates.push('description = ?');
      values.push(description);
    }
    if (is_active !== undefined) {
      updates.push('is_active = ?');
      values.push(is_active);
    }

    if (updates.length === 0) {
      return res.status(400).json({ message: '没有需要更新的字段' });
    }

    values.push(id);
    await execute(
      `UPDATE system_configs SET ${updates.join(', ')} WHERE id = ?`,
      values
    );

    const config = await queryOne('SELECT * FROM system_configs WHERE id = ?', [id]);

    // 如果更新的是服务费率，清除缓存使新值立即生效
    if (config && config.config_key === 'service_fee_rate') {
      clearServiceFeeRateCache();
      console.log('[SystemConfig] 服务费率缓存已清除，新值立即生效');
    }

    res.json({ message: '配置更新成功', config });
  } catch (error) {
    console.error('[SystemConfig] 更新配置失败:', error);
    res.status(500).json({ message: '更新系统配置失败' });
  }
});

/**
 * 删除系统配置（管理员）
 * DELETE /api/system-configs/admin/:id
 */
router.delete('/admin/:id', authMiddleware, requireAdmin, async (req, res) => {
  const { id } = req.params;

  try {
    const existing = await queryOne('SELECT id FROM system_configs WHERE id = ?', [id]);
    if (!existing) {
      return res.status(404).json({ message: '配置不存在' });
    }

    await execute('DELETE FROM system_configs WHERE id = ?', [id]);
    res.json({ message: '配置删除成功' });
  } catch (error) {
    console.error('[SystemConfig] 删除配置失败:', error);
    res.status(500).json({ message: '删除系统配置失败' });
  }
});

/**
 * 踢出所有在线用户（管理员除外）并禁止登录
 * POST /api/system-configs/admin/kick-all
 */
router.post('/admin/kick-all', authMiddleware, requireAdmin, async (req, res) => {
  try {
    const now = Math.floor(Date.now() / 1000); // Unix 秒级时间戳

    // 1. 设置 token_invalidated_before，使所有已签发的非管理员令牌失效
    const existing = await queryOne(
      "SELECT id FROM system_configs WHERE config_key = 'token_invalidated_before'"
    );
    if (existing) {
      await execute(
        'UPDATE system_configs SET config_value = ?, is_active = 1 WHERE id = ?',
        [JSON.stringify(now), existing.id]
      );
    } else {
      await execute(
        `INSERT INTO system_configs (config_key, config_name, config_type, config_value, description, is_active)
         VALUES (?, ?, ?, ?, ?, 1)`,
        ['token_invalidated_before', '令牌失效时间戳', 'number', JSON.stringify(now), '早于此时间签发的非管理员令牌将被拒绝']
      );
    }

    // 2. 同时禁止登录
    const loginConfig = await queryOne(
      "SELECT id FROM system_configs WHERE config_key = 'enable_login'"
    );
    if (loginConfig) {
      await execute(
        'UPDATE system_configs SET config_value = ?, is_active = 1 WHERE id = ?',
        [JSON.stringify(false), loginConfig.id]
      );
    } else {
      await execute(
        `INSERT INTO system_configs (config_key, config_name, config_type, config_value, description, is_active)
         VALUES (?, ?, ?, ?, ?, 1)`,
        ['enable_login', '允许登录', 'boolean', JSON.stringify(false), '控制非管理员用户是否可以登录']
      );
    }

    // 3. 清除缓存使新设置立即生效
    clearTokenInvalidationCache();

    console.log(`[Admin] 管理员 ${req.user.email} 踢出所有在线用户并禁止登录，时间戳: ${now}`);
    res.json({ success: true, message: '已踢出所有在线用户并禁止登录', invalidatedBefore: now });
  } catch (error) {
    console.error('[SystemConfig] 踢出用户失败:', error);
    res.status(500).json({ message: '操作失败' });
  }
});

module.exports = router;
