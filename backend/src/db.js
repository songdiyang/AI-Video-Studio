const mysql = require('mysql2/promise');

let pool = null;
let readPool = null; // 读写分离：只读连接池

function getPool() {
  if (!pool) throw new Error('Database not initialized');
  return pool;
}

/**
 * 获取只读连接池（有读库时返回读库，否则返回主库）
 */
function getReadPool() {
  return readPool || pool;
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
async function queryWithRetry(sql, params = [], maxRetries = 3) {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await pool.query(sql, params);
    } catch (error) {
      const isLastAttempt = attempt === maxRetries;
      const isRetryable = isRetryableError(error);
      
      if (isLastAttempt || !isRetryable) {
        throw error;
      }
      
      // 指数退避：100ms, 200ms, 400ms
      const delay = 100 * Math.pow(2, attempt);
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
async function executeWithRetry(sql, params = [], maxRetries = 3) {
  return queryWithRetry(sql, params, maxRetries);
}

/**
 * 创建连接池配置
 */
function createPoolConfig(overrides = {}) {
  return {
    host: overrides.host || process.env.MYSQL_HOST || '127.0.0.1',
    port: Number(overrides.port || process.env.MYSQL_PORT || 3306),
    user: overrides.user || process.env.MYSQL_USER || 'root',
    password: overrides.password || process.env.MYSQL_PASSWORD || '',
    database: overrides.database || process.env.MYSQL_DATABASE || 'nanostory',
    waitForConnections: true,
    // 连接池大小：从环境变量读取，默认 50（从原来的 20 扩容）
    connectionLimit: parseInt(overrides.connectionLimit || process.env.DB_POOL_SIZE, 10) || 50,
    queueLimit: 0,
    namedPlaceholders: false,
    timezone: '+08:00',
    // 连接超时
    connectTimeout: 60000,
    // TCP KeepAlive
    enableKeepAlive: true,
    keepAliveInitialDelay: 0,
    // 空闲连接管理
    maxIdle: parseInt(overrides.maxIdle || process.env.DB_MAX_IDLE, 10) || 25,
    idleTimeout: 60000,
    // 字符编码
    charset: 'utf8mb4'
  };
}

async function initializeDatabase() {
  // 主连接池
  const masterConfig = createPoolConfig();
  pool = mysql.createPool(masterConfig);

  // 读写分离：如果配置了只读从库
  if (process.env.MYSQL_READ_HOST) {
    const slaveConfig = createPoolConfig({
      host: process.env.MYSQL_READ_HOST,
      port: process.env.MYSQL_READ_PORT || process.env.MYSQL_PORT
    });
    readPool = mysql.createPool(slaveConfig);
    console.log(`[DB] 读写分离已启用: 从库 ${process.env.MYSQL_READ_HOST}`);
  }

  // 定时心跳，防止连接因空闲被服务器断开
  setInterval(async () => {
    try {
      await pool.query('SELECT 1');
      if (readPool) await readPool.query('SELECT 1');
    } catch (e) {
      console.warn('[DB] Heartbeat failed, pool will auto-reconnect:', e.message);
    }
  }, 20000);

  await pool.query('SELECT 1');

  const poolSize = masterConfig.connectionLimit;
  const maxIdle = masterConfig.maxIdle;
  console.log(`[DB] MySQL pool initialized (connectionLimit=${poolSize}, maxIdle=${maxIdle}, idleTimeout=60s)`);
  return pool;
}

async function closeDatabase() {
  if (pool) {
    await pool.end();
    pool = null;
  }
  if (readPool) {
    await readPool.end();
    readPool = null;
  }
}

/**
 * 获取连接池状态（用于监控告警）
 * @returns {object}
 */
function getPoolStats() {
  if (!pool) return null;
  const poolInternal = pool.pool;

  const idle = poolInternal._freeConnections?.length || 0;
  const total = poolInternal._allConnections?.length || 0;
  const active = total - idle;
  const waiting = poolInternal._connectionQueue?.length || 0;
  const limit = poolInternal.config?.connectionLimit || 0;

  // 利用率计算
  const utilization = limit > 0 ? active / limit : 0;
  const warning = utilization > 0.7;
  const critical = utilization > 0.9;

  const stats = {
    master: {
      idle,
      active,
      waiting,
      total,
      limit,
      utilization: Math.round(utilization * 100) + '%',
      warning,
      critical
    }
  };

  // 从库连接池状态
  if (readPool) {
    const readPoolInternal = readPool.pool;
    const rIdle = readPoolInternal._freeConnections?.length || 0;
    const rTotal = readPoolInternal._allConnections?.length || 0;
    const rActive = rTotal - rIdle;
    const rWaiting = readPoolInternal._connectionQueue?.length || 0;
    const rLimit = readPoolInternal.config?.connectionLimit || 0;
    const rUtil = rLimit > 0 ? rActive / rLimit : 0;

    stats.slave = {
      idle: rIdle,
      active: rActive,
      waiting: rWaiting,
      total: rTotal,
      limit: rLimit,
      utilization: Math.round(rUtil * 100) + '%',
      warning: rUtil > 0.7,
      critical: rUtil > 0.9
    };
  }

  // 告警日志
  if (critical) {
    console.error(`[DB] 连接池严重告警: 利用率 ${stats.master.utilization}, 活跃 ${active}/${limit}`);
  } else if (warning) {
    console.warn(`[DB] 连接池预警: 利用率 ${stats.master.utilization}, 活跃 ${active}/${limit}`);
  }

  return stats;
}

/**
 * 批量插入优化
 * @param {string} table - 表名
 * @param {string[]} columns - 列名数组
 * @param {Array<Array>} rows - 数据行数组
 * @param {number} batchSize - 批大小（默认1000）
 */
async function batchInsert(table, columns, rows, batchSize = 1000) {
  if (rows.length === 0) return { affectedRows: 0 };

  let totalAffected = 0;
  const columnStr = columns.join(', ');
  const placeholder = `(${columns.map(() => '?').join(', ')})`;

  for (let i = 0; i < rows.length; i += batchSize) {
    const batch = rows.slice(i, i + batchSize);
    const placeholders = batch.map(() => placeholder).join(', ');
    const values = batch.flat();

    const sql = `INSERT INTO ${table} (${columnStr}) VALUES ${placeholders}`;
    const [result] = await pool.query(sql, values);
    totalAffected += result.affectedRows;
  }

  return { affectedRows: totalAffected };
}

/**
 * 批量更新优化（使用 CASE WHEN）
 * @param {string} table - 表名
 * @param {string} idColumn - ID列名
 * @param {string} updateColumn - 更新列名
 * @param {Array<{id: any, value: any}>} updates - 更新数据
 * @param {number} batchSize
 */
async function batchUpdate(table, idColumn, updateColumn, updates, batchSize = 500) {
  if (updates.length === 0) return { affectedRows: 0 };

  let totalAffected = 0;

  for (let i = 0; i < updates.length; i += batchSize) {
    const batch = updates.slice(i, i + batchSize);
    const ids = batch.map(u => u.id);
    const whenClauses = batch.map(() => `WHEN ? THEN ?`).join(' ');
    const values = batch.flatMap(u => [u.id, u.value]);

    const sql = `
      UPDATE ${table} 
      SET ${updateColumn} = CASE ${idColumn} ${whenClauses} END 
      WHERE ${idColumn} IN (${ids.map(() => '?').join(',')})
    `;

    const [result] = await pool.query(sql, [...values, ...ids]);
    totalAffected += result.affectedRows;
  }

  return { affectedRows: totalAffected };
}

module.exports = {
  initializeDatabase,
  getPool,
  getReadPool,
  closeDatabase,
  queryWithRetry,
  executeWithRetry,
  isRetryableError,
  getPoolStats,
  batchInsert,
  batchUpdate
};
