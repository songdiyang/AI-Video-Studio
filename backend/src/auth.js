const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { queryOne, execute } = require('./dbHelper');
const { JWT_SECRET, validateAdminAccessRequest } = require('./middleware');

const router = express.Router();

// 密码强度验证
function validatePassword(password) {
  if (!password || password.length < 6) {
    return { valid: false, message: '密码至少需要 6 个字符' };
  }
  if (password.length > 128) {
    return { valid: false, message: '密码过长' };
  }
  return { valid: true };
}

// 用户名验证
function validateUsername(username) {
  if (!username || username.length < 3) {
    return { valid: false, message: '用户名至少需要 3 个字符' };
  }
  if (username.length > 20) {
    return { valid: false, message: '用户名最多 20 个字符' };
  }
  // 只允许字母、数字、下划线
  const usernameRegex = /^[a-zA-Z0-9_]+$/;
  if (!usernameRegex.test(username)) {
    return { valid: false, message: '用户名只能包含字母、数字和下划线' };
  }
  return { valid: true };
}

// 公开接口：获取注册功能是否开放（无需认证）
router.get('/registration-status', async (req, res) => {
  try {
    const config = await queryOne(
      "SELECT config_value FROM system_configs WHERE config_key = 'enable_registration' AND is_active = 1"
    );
    // 默认开放注册（当配置不存在时）
    let enabled = true;
    if (config) {
      try {
        enabled = JSON.parse(config.config_value) === true;
      } catch {
        enabled = true;
      }
    }
    return res.json({ enabled });
  } catch (err) {
    console.error('获取注册状态失败:', err);
    // 出错时默认开放注册
    return res.json({ enabled: true });
  }
});

router.post('/register', async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ message: 'Username and password are required' });
  }

  // 检查注册功能是否开放
  try {
    const regConfig = await queryOne(
      "SELECT config_value FROM system_configs WHERE config_key = 'enable_registration' AND is_active = 1"
    );
    if (regConfig) {
      const enabled = JSON.parse(regConfig.config_value);
      if (enabled !== true) {
        return res.status(403).json({ message: '注册功能已关闭，请联系管理员' });
      }
    }
  } catch (e) {
    // 配置读取失败不阻断注册
  }

  // 兼容旧的 email 参数名，实际存储为 username
  const username = String(email).trim();

  // 验证用户名格式
  const usernameValidation = validateUsername(username);
  if (!usernameValidation.valid) {
    return res.status(400).json({ message: usernameValidation.message });
  }

  // 验证密码强度
  const passwordValidation = validatePassword(password);
  if (!passwordValidation.valid) {
    return res.status(400).json({ message: passwordValidation.message });
  }

  try {
    const existing = await queryOne('SELECT id FROM users WHERE email = ?', [username]);

    if (existing) {
      return res.status(409).json({ message: '用户名已被注册' });
    }

    const passwordHash = bcrypt.hashSync(password, 10);

    const result = await execute('INSERT INTO users (email, password_hash, role) VALUES (?, ?, ?)', [username, passwordHash, 'user']);
    const userId = result.insertId;

    const token = jwt.sign({ userId, email: username, role: 'user' }, JWT_SECRET, { expiresIn: '7d' });
    return res.json({
      token,
      user: { id: userId, email: username, role: 'user' }
    });
  } catch (err) {
    console.error('DB error in register:', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

router.post('/login-requirements', async (req, res) => {
  const username = String(req.body?.email || '').trim();

  if (!username) {
    return res.json({ requiresAdminAccess: false });
  }

  try {
    const row = await queryOne('SELECT role FROM users WHERE email = ?', [username]);
    return res.json({
      requiresAdminAccess: row?.role === 'admin'
    });
  } catch (err) {
    console.error('DB error in login requirements:', err);
    return res.status(500).json({
      message: '获取登录要求失败',
      reason: 'lookup_failed'
    });
  }
});

router.post('/login', async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ message: 'Username and password are required' });
  }

  // 兼容旧的 email 参数名，实际查询 username
  const username = String(email).trim();

  try {
    const row = await queryOne('SELECT id, password_hash, role FROM users WHERE email = ?', [username]);

    if (!row) {
      return res.status(401).json({ message: '用户名或密码错误' });
    }

    const isValid = bcrypt.compareSync(password, row.password_hash);
    if (!isValid) {
      return res.status(401).json({ message: '用户名或密码错误' });
    }

    if (row.role === 'admin') {
      const adminAccessCheck = validateAdminAccessRequest(req);
      if (!adminAccessCheck.ok) {
        const status = adminAccessCheck.reason === 'unconfigured' ? 503 : 401;
        const message = adminAccessCheck.reason === 'unconfigured'
          ? adminAccessCheck.message
          : '用户名、密码或后台访问密钥错误';

        return res.status(status).json({
          message,
          reason: adminAccessCheck.reason,
          requiresAdminAccess: true
        });
      }
    }

    const token = jwt.sign({ userId: row.id, email: username, role: row.role }, JWT_SECRET, { expiresIn: '7d' });
    return res.json({
      token,
      user: { id: row.id, email: username, role: row.role }
    });
  } catch (err) {
    console.error('DB error in login:', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

module.exports = router;
