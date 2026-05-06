/**
 * 系统错误日志服务
 * 用于记录和查询非任务相关的系统错误
 */

const { execute, queryOne } = require('./dbHelper');

// 敏感字段列表，需要脱敏
const SENSITIVE_FIELDS = ['password', 'token', 'apiKey', 'api_key', 'secret', 'authorization'];

/**
 * 对对象进行脱敏处理
 */
function sanitizeObject(obj, depth = 0) {
  if (depth > 5 || !obj || typeof obj !== 'object') return obj;
  
  const sanitized = Array.isArray(obj) ? [] : {};
  for (const [key, value] of Object.entries(obj)) {
    if (SENSITIVE_FIELDS.some(f => key.toLowerCase().includes(f.toLowerCase()))) {
      sanitized[key] = '[REDACTED]';
    } else if (typeof value === 'object' && value !== null) {
      sanitized[key] = sanitizeObject(value, depth + 1);
    } else {
      sanitized[key] = value;
    }
  }
  return sanitized;
}

/**
 * 记录系统错误
 * @param {Object} params - 错误参数
 * @param {string} params.errorType - 错误类型
 * @param {string} params.errorSource - 错误来源
 * @param {string|Error} params.error - 错误对象或错误信息
 * @param {Object} [params.request] - 请求对象（可选）
 * @param {number} [params.userId] - 用户ID（可选）
 * @param {string} [params.userEmail] - 用户邮箱（可选）
 * @param {Object} [params.extraContext] - 额外上下文（可选）
 */
async function logSystemError(params) {
  try {
    const {
      errorType,
      errorSource,
      error,
      request,
      userId,
      userEmail,
      extraContext
    } = params;

    const errorMessage = error instanceof Error ? error.message : String(error);
    const errorStack = error instanceof Error ? error.stack : null;

    // 从请求中提取信息（如果有）
    let requestMethod = null;
    let requestUrl = null;
    let requestBody = null;

    if (request) {
      requestMethod = request.method || null;
      requestUrl = request.originalUrl || request.url || null;
      if (request.body && Object.keys(request.body).length > 0) {
        requestBody = JSON.stringify(sanitizeObject(request.body));
      }
    }

    await execute(`
      INSERT INTO system_error_logs (
        error_type, error_source, error_message, error_stack,
        request_method, request_url, request_body,
        user_id, user_email, extra_context
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      errorType,
      errorSource,
      errorMessage,
      errorStack,
      requestMethod,
      requestUrl,
      requestBody,
      userId || null,
      userEmail || null,
      extraContext ? JSON.stringify(extraContext) : null
    ]);

    console.log(`[SystemErrorLog] 已记录 ${errorType} 错误: ${errorMessage.substring(0, 100)}`);
  } catch (logError) {
    // 记录日志本身失败时，至少打印到控制台
    console.error('[SystemErrorLog] 记录错误失败:', logError);
    console.error('[SystemErrorLog] 原始错误:', params.error);
  }
}

/**
 * 查询系统错误列表（管理员接口）
 */
async function getSystemErrors({ page = 1, limit = 20, errorType = null, isResolved = null, search = null }) {
  const offset = (page - 1) * limit;
  const conditions = ['1=1'];
  const params = [];

  if (errorType) {
    conditions.push('error_type = ?');
    params.push(errorType);
  }

  if (isResolved !== null) {
    conditions.push('is_resolved = ?');
    params.push(isResolved ? 1 : 0);
  }

  if (search && String(search).trim()) {
    const keyword = `%${String(search).trim()}%`;
    conditions.push('(error_message LIKE ? OR error_type LIKE ? OR error_source LIKE ? OR user_email LIKE ? OR request_url LIKE ?)');
    params.push(keyword, keyword, keyword, keyword, keyword);
  }

  const whereClause = conditions.join(' AND ');

  // 获取总数
  const countResult = await queryOne(
    `SELECT COUNT(*) as total FROM system_error_logs WHERE ${whereClause}`,
    params
  );
  const total = parseInt(countResult?.total) || 0;

  // 获取列表
  const errors = await execute(`
    SELECT 
      id, error_type, error_source, error_message, error_stack,
      request_method, request_url, request_body,
      user_id, user_email, extra_context,
      is_resolved, resolved_at, resolved_by, created_at
    FROM system_error_logs
    WHERE ${whereClause}
    ORDER BY created_at DESC
    LIMIT ? OFFSET ?
  `, [...params, limit, offset]);

  return {
    errors: errors.map(e => ({
      ...e,
      request_body: e.request_body ? JSON.parse(e.request_body) : null,
      extra_context: e.extra_context ? JSON.parse(e.extra_context) : null
    })),
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit)
    }
  };
}

/**
 * 更新系统错误解决状态
 */
async function updateSystemErrorStatus(errorId, isResolved, resolvedBy = null) {
  await execute(`
    UPDATE system_error_logs
    SET is_resolved = ?, resolved_at = ?, resolved_by = ?
    WHERE id = ?
  `, [
    isResolved ? 1 : 0,
    isResolved ? new Date() : null,
    isResolved ? resolvedBy : null,
    errorId
  ]);
}

/**
 * 获取系统错误统计
 */
async function getSystemErrorStats() {
  const stats = await execute(`
    SELECT 
      error_type,
      COUNT(*) as total,
      SUM(CASE WHEN is_resolved = 0 THEN 1 ELSE 0 END) as unresolved,
      MAX(created_at) as last_occurred
    FROM system_error_logs
    WHERE created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)
    GROUP BY error_type
  `);

  return stats;
}

module.exports = {
  logSystemError,
  getSystemErrors,
  updateSystemErrorStatus,
  getSystemErrorStats,
  sanitizeObject
};
