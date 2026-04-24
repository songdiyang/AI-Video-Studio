/**
 * 管理员操作日志服务
 * 提供统一的日志记录和查询功能
 */

const { queryOne, queryAll, execute } = require('./dbHelper');

/**
 * 记录管理员操作日志
 * @param {object} params
 * @param {number} params.adminId - 管理员ID
 * @param {string} params.action - 操作类型 (login/create/update/delete/toggle/export/etc)
 * @param {string} [params.targetType] - 操作对象类型
 * @param {string|number} [params.targetId] - 操作对象ID
 * @param {string} [params.targetName] - 操作对象名称
 * @param {object} [params.details] - 操作详情
 * @param {string} [params.ipAddress] - IP地址
 * @param {string} [params.userAgent] - User-Agent
 */
async function logAdminAction({
  adminId,
  action,
  targetType = null,
  targetId = null,
  targetName = null,
  details = null,
  ipAddress = null,
  userAgent = null
}) {
  try {
    // 获取管理员工号和邮箱
    const admin = await queryOne(
      'SELECT employee_id, email FROM users WHERE id = ?',
      [adminId]
    );

    await execute(
      `INSERT INTO admin_logs
        (admin_id, admin_employee_id, admin_email, action, target_type, target_id, target_name, details, ip_address, user_agent)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        adminId,
        admin?.employee_id || null,
        admin?.email || null,
        action,
        targetType,
        targetId ? String(targetId) : null,
        targetName,
        details ? JSON.stringify(details) : null,
        ipAddress,
        userAgent
      ]
    );
  } catch (err) {
    console.error('[AdminLogService] 记录日志失败:', err);
    // 日志记录失败不应阻断主业务流程
  }
}

/**
 * 从 Express Request 中提取日志所需信息
 * @param {object} req - Express request
 * @param {object} extra - 额外信息
 */
function extractLogContext(req, extra = {}) {
  const adminId = req.user?.userId || req.user?.id;
  if (!adminId) return null;

  return {
    adminId,
    ipAddress: req.ip || req.connection?.remoteAddress || '',
    userAgent: req.headers?.['user-agent'] || '',
    ...extra
  };
}

/**
 * 便捷方法：记录登录日志
 */
async function logAdminLogin(adminId, ipAddress, userAgent) {
  return logAdminAction({
    adminId,
    action: 'login',
    targetType: 'system',
    targetName: '管理员登录',
    ipAddress,
    userAgent
  });
}

/**
 * 查询管理员操作日志
 */
async function getAdminLogs({
  page = 1,
  limit = 20,
  adminId = null,
  action = null,
  targetType = null,
  startDate = null,
  endDate = null,
  search = null
}) {
  const offset = (page - 1) * limit;
  const conditions = [];
  const params = [];

  if (adminId) {
    conditions.push('admin_id = ?');
    params.push(adminId);
  }
  if (action) {
    conditions.push('action = ?');
    params.push(action);
  }
  if (targetType) {
    conditions.push('target_type = ?');
    params.push(targetType);
  }
  if (startDate) {
    conditions.push('created_at >= ?');
    params.push(startDate);
  }
  if (endDate) {
    conditions.push('created_at <= ?');
    params.push(endDate);
  }
  if (search) {
    conditions.push('(admin_email LIKE ? OR target_name LIKE ? OR admin_employee_id LIKE ?)');
    const like = `%${search}%`;
    params.push(like, like, like);
  }

  const whereClause = conditions.length > 0 ? 'WHERE ' + conditions.join(' AND ') : '';

  // 查询总数
  const countResult = await queryOne(
    `SELECT COUNT(*) as total FROM admin_logs ${whereClause}`,
    params
  );
  const total = countResult?.total || 0;

  // 查询列表
  const logs = await queryAll(
    `SELECT id, admin_id, admin_employee_id, admin_email, action, target_type, target_id, target_name,
            details, ip_address, created_at
     FROM admin_logs
     ${whereClause}
     ORDER BY created_at DESC
     LIMIT ? OFFSET ?`,
    [...params, limit, offset]
  );

  // 解析 details JSON
  const parsedLogs = logs.map(log => ({
    ...log,
    details: log.details ? JSON.parse(log.details) : null
  }));

  return {
    logs: parsedLogs,
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) }
  };
}

/**
 * 获取操作类型统计（用于筛选）
 */
async function getAdminLogActions() {
  const rows = await queryAll(
    'SELECT DISTINCT action FROM admin_logs ORDER BY action'
  );
  return rows.map(r => r.action);
}

/**
 * 获取目标类型统计（用于筛选）
 */
async function getAdminLogTargetTypes() {
  const rows = await queryAll(
    'SELECT DISTINCT target_type FROM admin_logs WHERE target_type IS NOT NULL ORDER BY target_type'
  );
  return rows.map(r => r.target_type);
}

module.exports = {
  logAdminAction,
  extractLogContext,
  logAdminLogin,
  getAdminLogs,
  getAdminLogActions,
  getAdminLogTargetTypes
};
