const mysql = require('mysql2/promise');

let pool = null;

function getPool() {
  if (!pool) throw new Error('Database not initialized');
  return pool;
}

// 可重试的错误码
const RETRYABLE_ERROR_CODES = [
  'PROTOCOL_CONNECTION_LOST',
  'ER_CON_COUNT_ERROR',
  'ECONNREFUSED',
  'ETIMEDOUT',
  'ECONNRESET',
  'ER_LOCK_DEADLOCK',
  'ER_LOCK_WAIT_TIMEOUT'
];

/**
 * 判断是否为可重试的数据库错误
 * @param {Error} error 
 * @returns {boolean}
 */
function isRetryableError(error) {
  return RETRYABLE_ERROR_CODES.includes(error.code);
}

/**
 * 带重试的查询函数
 * @param {string} sql - SQL 语句
 * @param {Array} params - 参数
 * @param {number} maxRetries - 最大重试次数
 * @returns {Promise<Array>}
 */
async function queryWithRetry(sql, params = [], maxRetries = 2) {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await pool.query(sql, params);
    } catch (error) {
      const isLastAttempt = attempt === maxRetries;
      const isRetryable = isRetryableError(error);
      
      if (isLastAttempt || !isRetryable) {
        throw error;
      }
      
      const delay = 1000 * (attempt + 1); // 递增延迟：1s, 2s
      console.warn(`[DB] Query retry ${attempt + 1}/${maxRetries} after ${delay}ms:`, error.code);
      await new Promise(r => setTimeout(r, delay));
    }
  }
}

/**
 * 带重试的执行函数（用于 INSERT/UPDATE/DELETE）
 * @param {string} sql - SQL 语句
 * @param {Array} params - 参数
 * @param {number} maxRetries - 最大重试次数
 * @returns {Promise<object>}
 */
async function executeWithRetry(sql, params = [], maxRetries = 2) {
  return queryWithRetry(sql, params, maxRetries);
}

async function initializeDatabase() {
  const host = process.env.MYSQL_HOST || '127.0.0.1';
  const port = Number(process.env.MYSQL_PORT || 3306);
  const user = process.env.MYSQL_USER || 'root';
  const password = process.env.MYSQL_PASSWORD || '';
  const database = process.env.MYSQL_DATABASE || 'nanostory';

  pool = mysql.createPool({
    host,
    port,
    user,
    password,
    database,
    waitForConnections: true,
    // 性能优化：增加连接池大小
    connectionLimit: 20,        // 从10增加到20
    queueLimit: 0,
    namedPlaceholders: false,
    timezone: '+08:00',
    // 防止连接超时
    connectTimeout: 60000,
    // 启用保活机制
    enableKeepAlive: true,
    keepAliveInitialDelay: 0,
    // 连接池空闲管理
    maxIdle: 10,
    idleTimeout: 60000          // 从30000增加到60000（1分钟）
  });

  // 定时心跳，防止连接因空闲被服务器断开
  setInterval(async () => {
    try {
      await pool.query('SELECT 1');
    } catch (e) {
      console.warn('[DB] Heartbeat failed, pool will auto-reconnect:', e.message);
    }
  }, 20000);

  await pool.query('SELECT 1');

  console.log('[DB] MySQL pool initialized successfully (connectionLimit=20, idleTimeout=60s)');
  return pool;
}

async function closeDatabase() {
  if (pool) {
    await pool.end();
    pool = null;
  }
}

/**
 * 获取连接池状态（用于监控）
 * @returns {object}
 */
function getPoolStats() {
  if (!pool) return null;
  const poolInternal = pool.pool;
  return {
    // 空闲连接数
    idle: poolInternal._freeConnections?.length || 0,
    // 使用中的连接数
    active: poolInternal._allConnections?.length - (poolInternal._freeConnections?.length || 0),
    // 等待队列长度
    waiting: poolInternal._connectionQueue?.length || 0
  };
}

module.exports = {
  initializeDatabase,
  getPool,
  closeDatabase,
  queryWithRetry,
  executeWithRetry,
  isRetryableError,
  getPoolStats
};