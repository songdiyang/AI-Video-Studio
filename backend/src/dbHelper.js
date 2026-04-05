const { getPool, getReadPool } = require('./db');

async function execute(sql, params = []) {
  const pool = getPool();
  const [result] = await pool.query(sql, params);
  return result;
}

async function queryOne(sql, params = []) {
  const pool = getPool();
  const [rows] = await pool.query(sql, params);
  return rows && rows.length > 0 ? rows[0] : null;
}

async function queryAll(sql, params = []) {
  const pool = getPool();
  const [rows] = await pool.query(sql, params);
  return rows || [];
}

/**
 * 只读查询（有读库时自动路由到从库，减轻主库压力）
 */
async function queryOneRead(sql, params = []) {
  const pool = getReadPool();
  const [rows] = await pool.query(sql, params);
  return rows && rows.length > 0 ? rows[0] : null;
}

/**
 * 只读批量查询（有读库时自动路由到从库）
 */
async function queryAllRead(sql, params = []) {
  const pool = getReadPool();
  const [rows] = await pool.query(sql, params);
  return rows || [];
}

/** @deprecated 使用 result.insertId 替代，在连接池中此函数不安全 */
async function getLastInsertId() {
  const pool = getPool();
  const [result] = await pool.query('SELECT LAST_INSERT_ID() as id');
  return result && result.length > 0 ? result[0].id : null;
}

module.exports = {
  execute,
  queryOne,
  queryAll,
  queryOneRead,
  queryAllRead,
  getLastInsertId
};
