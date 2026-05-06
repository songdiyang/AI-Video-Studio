const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { queryOne, execute } = require('./dbHelper');
const { JWT_SECRET, validateAdminAccessRequest } = require('./middleware');
const { logAdminLogin } = require('./adminLogService');

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

// 邮箱格式验证
function validateEmail(email) {
  if (!email || email.length < 5) {
    return { valid: false, message: '请输入有效的邮箱地址' };
  }
  if (email.length > 255) {
    return { valid: false, message: '邮箱地址过长' };
  }
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    return { valid: false, message: '邮箱格式不正确' };
  }
  return { valid: true };
}

// 判断输入是否为邮箱格式
function isEmailFormat(input) {
  return input && input.includes('@');
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

  // 兼容旧的 email 参数名，实际存储为 username 或邮箱
  const username = String(email).trim();

  // 根据输入格式选择验证方式
  if (isEmailFormat(username)) {
    const emailValidation = validateEmail(username);
    if (!emailValidation.valid) {
      return res.status(400).json({ message: emailValidation.message });
    }
  } else {
    // 验证用户名格式
    const usernameValidation = validateUsername(username);
    if (!usernameValidation.valid) {
      return res.status(400).json({ message: usernameValidation.message });
    }
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
      requiresAdminAccess: row?.role === 'admin' || row?.role === 'ops'
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
  let username = String(email).trim();

  // 检测并纠正中文/全角标点（防止用户输入中文句号等混淆字符）
  const cjkReplacements = { '。': '.', '，': ',', '；': ';', '：': ':', '！': '!', '？': '?', '（': '(', '）': ')', '＠': '@', '＿': '_', '－': '-' };
  let cjkFixed = [];
  for (const [cjk, ascii] of Object.entries(cjkReplacements)) {
    if (username.includes(cjk)) {
      cjkFixed.push(`"${cjk}" → "${ascii}"`);
      username = username.replaceAll(cjk, ascii);
    }
  }
  if (cjkFixed.length > 0) {
    console.log(`[Auth] 自动修正邮箱中文标点: ${cjkFixed.join(', ')}`);
  }

  // 邮箱格式校验
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(username)) {
    return res.status(400).json({ message: '请输入有效的邮箱地址', reason: 'invalid_email' });
  }

  try {
    const row = await queryOne('SELECT id, password_hash, role FROM users WHERE email = ?', [username]);

    // 非管理员/运维用户检查登录开关
    if (row && row.role !== 'admin' && row.role !== 'ops') {
      try {
        const loginConfig = await queryOne(
          "SELECT config_value FROM system_configs WHERE config_key = 'enable_login' AND is_active = 1"
        );
        if (loginConfig) {
          const loginEnabled = JSON.parse(loginConfig.config_value);
          if (loginEnabled !== true) {
            return res.status(403).json({ message: '系统维护中，暂时禁止登录，请稍后再试' });
          }
        }
      } catch (e) {
        // 配置读取失败不阻断登录
      }
    }

    if (!row) {
      return res.status(401).json({ message: '用户名或密码错误' });
    }

    const isValid = bcrypt.compareSync(password, row.password_hash);
    if (!isValid) {
      return res.status(401).json({ message: '用户名或密码错误' });
    }

    const token = jwt.sign({ userId: row.id, email: username, role: row.role }, JWT_SECRET, { expiresIn: '7d' });

    // 记录登录IP及地理位置
    const loginIp = req.ip || req.connection?.remoteAddress || '';
    execute('UPDATE users SET last_login_ip = ?, last_active_at = NOW() WHERE id = ?', [loginIp, row.id]).catch(() => {});

    // 异步解析 IP 地理位置
    const { getLocationByIp } = require('./utils/ipLocation');
    getLocationByIp(loginIp).then(location => {
      if (location) {
        execute('UPDATE users SET last_login_location = ? WHERE id = ?', [location, row.id]).catch(() => {});
      }
    }).catch(() => {});

    // 如果是管理员或运维登录，记录操作日志
    if (row.role === 'admin' || row.role === 'ops') {
      logAdminLogin(row.id, loginIp, req.headers?.['user-agent'] || '').catch(() => {});
    }

    return res.json({
      token,
      user: { id: row.id, email: username, role: row.role }
    });
  } catch (err) {
    console.error('DB error in login:', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

// 管理员/运维登录（强制校验后台访问密钥）
router.post('/admin-login', async (req, res) => {
  const { email, password, adminAccessKey } = req.body;

  if (!email || !password) {
    return res.status(400).json({ message: 'Username and password are required' });
  }

  let username = String(email).trim();

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(username)) {
    return res.status(400).json({ message: '请输入有效的邮箱地址', reason: 'invalid_email' });
  }

  try {
    const row = await queryOne('SELECT id, password_hash, role FROM users WHERE email = ?', [username]);

    if (!row) {
      return res.status(401).json({ message: '用户名或密码错误' });
    }

    // 仅允许 admin 和 ops 角色通过此接口登录
    if (row.role !== 'admin' && row.role !== 'ops') {
      return res.status(403).json({ message: '权限不足，仅管理员或运维可访问' });
    }

    const isValid = bcrypt.compareSync(password, row.password_hash);
    if (!isValid) {
      return res.status(401).json({ message: '用户名或密码错误' });
    }

    // 强制校验后台访问密钥
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

    const token = jwt.sign({ userId: row.id, email: username, role: row.role }, JWT_SECRET, { expiresIn: '7d' });

    const loginIp = req.ip || req.connection?.remoteAddress || '';
    execute('UPDATE users SET last_login_ip = ?, last_active_at = NOW() WHERE id = ?', [loginIp, row.id]).catch(() => {});

    // 异步解析 IP 地理位置
    const { getLocationByIp } = require('./utils/ipLocation');
    getLocationByIp(loginIp).then(location => {
      if (location) {
        execute('UPDATE users SET last_login_location = ? WHERE id = ?', [location, row.id]).catch(() => {});
      }
    }).catch(() => {});

    logAdminLogin(row.id, loginIp, req.headers?.['user-agent'] || '').catch(() => {});

    return res.json({
      token,
      user: { id: row.id, email: username, role: row.role }
    });
  } catch (err) {
    console.error('DB error in admin login:', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

// 修改密码（需验证旧密码）
router.put('/change-password', async (req, res) => {
  const authHeader = req.headers['authorization'];
  if (!authHeader) {
    return res.status(401).json({ message: '未登录' });
  }

  const [scheme, token] = authHeader.split(' ');
  if (scheme !== 'Bearer' || !token) {
    return res.status(401).json({ message: '无效的认证信息' });
  }

  let userId;
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    userId = payload.userId;
  } catch (e) {
    return res.status(401).json({ message: '登录已过期，请重新登录' });
  }

  const { oldPassword, newPassword } = req.body;
  if (!oldPassword || !newPassword) {
    return res.status(400).json({ message: '请输入旧密码和新密码' });
  }

  const validation = validatePassword(newPassword);
  if (!validation.valid) {
    return res.status(400).json({ message: validation.message });
  }

  try {
    const row = await queryOne('SELECT id, password_hash FROM users WHERE id = ?', [userId]);
    if (!row) {
      return res.status(404).json({ message: '用户不存在' });
    }

    const isValid = bcrypt.compareSync(oldPassword, row.password_hash);
    if (!isValid) {
      return res.status(400).json({ message: '旧密码不正确' });
    }

    const newHash = bcrypt.hashSync(newPassword, 10);
    await execute('UPDATE users SET password_hash = ? WHERE id = ?', [newHash, userId]);
    return res.json({ message: '密码修改成功' });
  } catch (err) {
    console.error('Change password error:', err);
    return res.status(500).json({ message: '密码修改失败，请稍后重试' });
  }
});

// 获取密码提示
router.get('/password-hint', async (req, res) => {
  const authHeader = req.headers['authorization'];
  if (!authHeader) {
    return res.status(401).json({ message: '未登录' });
  }

  const [scheme, token] = authHeader.split(' ');
  if (scheme !== 'Bearer' || !token) {
    return res.status(401).json({ message: '无效的认证信息' });
  }

  try {
    const payload = jwt.verify(token, JWT_SECRET);
    const row = await queryOne('SELECT password_hint FROM users WHERE id = ?', [payload.userId]);
    return res.json({ hint: row?.password_hint || '' });
  } catch (e) {
    return res.status(401).json({ message: '登录已过期，请重新登录' });
  }
});

// 设置密码提示
router.put('/password-hint', async (req, res) => {
  const authHeader = req.headers['authorization'];
  if (!authHeader) {
    return res.status(401).json({ message: '未登录' });
  }

  const [scheme, token] = authHeader.split(' ');
  if (scheme !== 'Bearer' || !token) {
    return res.status(401).json({ message: '无效的认证信息' });
  }

  try {
    const payload = jwt.verify(token, JWT_SECRET);
    const { hint } = req.body;

    if (hint !== undefined && hint !== null && hint.length > 255) {
      return res.status(400).json({ message: '密码提示不能超过 255 个字符' });
    }

    await execute('UPDATE users SET password_hint = ? WHERE id = ?', [hint || null, payload.userId]);
    return res.json({ message: '密码提示已更新' });
  } catch (e) {
    return res.status(401).json({ message: '登录已过期，请重新登录' });
  }
});

module.exports = router;
