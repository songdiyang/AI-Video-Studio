const crypto = require('crypto');
const jwt = require('jsonwebtoken');

// 强制要求 JWT_SECRET 环境变量，防止使用默认值
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET || JWT_SECRET === 'dev-secret-change-me') {
  console.error('❌ SECURITY ERROR: JWT_SECRET environment variable is required!');
  console.error('💡 Set it in production: export JWT_SECRET="your-random-secret-key"');
  console.error('⚠️  Using temporary secret for development only...');
  // 开发环境临时使用，但会警告
  if (process.env.NODE_ENV === 'production') {
    throw new Error('JWT_SECRET must be set in production!');
  }
}

const ACTUAL_SECRET = JWT_SECRET || require('crypto').randomBytes(64).toString('hex');
const ADMIN_ACCESS_KEY_HEADER = 'x-admin-access-key';

function getConfiguredAdminAccessKey() {
  return typeof process.env.ADMIN_ACCESS_KEY === 'string'
    ? process.env.ADMIN_ACCESS_KEY.trim()
    : '';
}

function getAdminAccessKeyFromRequest(req) {
  const headerValue = req.headers?.[ADMIN_ACCESS_KEY_HEADER];
  const providedHeaderKey = Array.isArray(headerValue) ? headerValue[0] : headerValue;
  if (typeof providedHeaderKey === 'string' && providedHeaderKey.trim()) {
    return providedHeaderKey.trim();
  }

  const bodyKey = req.body?.adminAccessKey;
  if (typeof bodyKey === 'string' && bodyKey.trim()) {
    return bodyKey.trim();
  }

  return '';
}

function timingSafeStringEqual(left, right) {
  const leftBuffer = Buffer.from(String(left));
  const rightBuffer = Buffer.from(String(right));
  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }
  return crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

function validateAdminAccessRequest(req) {
  const configuredKey = getConfiguredAdminAccessKey();
  if (!configuredKey) {
    return {
      ok: false,
      reason: 'unconfigured',
      status: 503,
      message: '管理员访问策略未配置，请设置 ADMIN_ACCESS_KEY'
    };
  }

  const providedKey = getAdminAccessKeyFromRequest(req);
  if (!providedKey) {
    return {
      ok: false,
      reason: 'missing',
      status: 403,
      message: '缺少后台访问密钥'
    };
  }

  if (!timingSafeStringEqual(providedKey, configuredKey)) {
    return {
      ok: false,
      reason: 'invalid',
      status: 403,
      message: '后台访问密钥无效'
    };
  }

  return { ok: true };
}

const { queryOne, execute } = require('./dbHelper');

// --- 用户活跃时间追踪（内存节流，每用户1分钟最多写一次） ---
const lastActiveCache = new Map(); // userId -> lastUpdateTimestamp
const ACTIVE_UPDATE_INTERVAL = 60000; // 1分钟

function updateLastActive(userId) {
  const now = Date.now();
  const lastUpdate = lastActiveCache.get(userId) || 0;
  if (now - lastUpdate < ACTIVE_UPDATE_INTERVAL) return;
  lastActiveCache.set(userId, now);
  execute('UPDATE users SET last_active_at = NOW() WHERE id = ?', [userId]).catch(() => {});
}

// 缓存 token_invalidated_before 时间戳，避免每次请求查库
let cachedInvalidatedBefore = null;
let cacheExpiry = 0;
const CACHE_TTL = 5000; // 5秒缓存

async function getTokenInvalidatedBefore() {
  const now = Date.now();
  if (cachedInvalidatedBefore !== null && now < cacheExpiry) {
    return cachedInvalidatedBefore;
  }
  try {
    const config = await queryOne(
      "SELECT config_value FROM system_configs WHERE config_key = 'token_invalidated_before' AND is_active = 1"
    );
    if (config) {
      cachedInvalidatedBefore = Number(JSON.parse(config.config_value)) || 0;
    } else {
      cachedInvalidatedBefore = 0;
    }
  } catch (e) {
    cachedInvalidatedBefore = 0;
  }
  cacheExpiry = now + CACHE_TTL;
  return cachedInvalidatedBefore;
}

// 外部调用以清除缓存（踢出用户后立即生效）
function clearTokenInvalidationCache() {
  cachedInvalidatedBefore = null;
  cacheExpiry = 0;
}

function authMiddleware(req, res, next) {
  const authHeader = req.headers['authorization'];
  if (!authHeader) {
    return res.status(401).json({ message: 'Missing Authorization header' });
  }

  const [scheme, token] = authHeader.split(' ');
  if (scheme !== 'Bearer' || !token) {
    return res.status(401).json({ message: 'Invalid Authorization header' });
  }

  try {
    const payload = jwt.verify(token, ACTUAL_SECRET);
    req.user = { 
      userId: payload.userId, 
      id: payload.userId,
      email: payload.email,
      role: payload.role || 'user'
    };

    // 异步更新用户活跃时间（节流，不阻塞请求）
    updateLastActive(payload.userId);

    // 非管理员/运维用户检查令牌是否被全局失效
    if (req.user.role !== 'admin' && req.user.role !== 'ops') {
      const iat = payload.iat || 0;
      getTokenInvalidatedBefore().then(invalidatedBefore => {
        if (invalidatedBefore > 0 && iat < invalidatedBefore) {
          return res.status(401).json({ message: '会话已过期，请重新登录', code: 'SESSION_INVALIDATED' });
        }
        next();
      }).catch(() => next());
    } else {
      next();
    }
  } catch (e) {
    return res.status(401).json({ message: 'Invalid or expired token' });
  }
}

function requireAdmin(req, res, next) {
  if (!req.user || req.user.role !== 'admin') {
    return res.status(403).json({ message: '权限不足，仅管理员可访问' });
  }

  const accessCheck = validateAdminAccessRequest(req);
  if (!accessCheck.ok) {
    return res.status(accessCheck.status).json({ message: accessCheck.message });
  }

  next();
}

/**
 * 允许管理员或运维角色访问的中间件
 * 运维角色拥有有限的管理后台权限
 */
function requireAdminOrOps(req, res, next) {
  if (!req.user || (req.user.role !== 'admin' && req.user.role !== 'ops')) {
    return res.status(403).json({ message: '权限不足，仅管理员或运维可访问' });
  }

  const accessCheck = validateAdminAccessRequest(req);
  if (!accessCheck.ok) {
    return res.status(accessCheck.status).json({ message: accessCheck.message });
  }

  next();
}

/**
 * 检查当前用户是否为运维角色
 */
function isOpsRole(req) {
  return req.user && req.user.role === 'ops';
}

module.exports = {
  authMiddleware,
  requireAdmin,
  requireAdminOrOps,
  isOpsRole,
  validateAdminAccessRequest,
  clearTokenInvalidationCache,
  ADMIN_ACCESS_KEY_HEADER,
  JWT_SECRET: ACTUAL_SECRET
};
