// 一次性迁移执行器：20260425_scripts_resource_pool.sql
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');

async function run() {
  const conn = await mysql.createConnection({
    host: process.env.MYSQL_HOST,
    port: process.env.MYSQL_PORT,
    user: process.env.MYSQL_USER,
    password: process.env.MYSQL_PASSWORD,
    database: process.env.MYSQL_DATABASE,
    multipleStatements: true
  });

  const sqlPath = path.join(__dirname, '20260425_scripts_resource_pool.sql');
  const sql = fs.readFileSync(sqlPath, 'utf8');

  try {
    console.log('[migrate] 开始执行 20260425_scripts_resource_pool.sql');

    const segments = [];
    let buf = '';
    for (const line of sql.split('\n')) {
      if (line.trim().startsWith('--')) continue;
      buf += line + '\n';
      if (line.trim().endsWith(';')) {
        const stmt = buf.trim();
        if (stmt) segments.push(stmt);
        buf = '';
      }
    }
    if (buf.trim()) segments.push(buf.trim());

    for (const stmt of segments) {
      if (!stmt) continue;
      console.log('[migrate] SQL >>>', stmt.split('\n')[0], '...');
      await conn.query(stmt);
    }

    console.log('[migrate] 迁移完成 ✓');
  } catch (err) {
    console.error('[migrate] 失败:', err.message);
    process.exitCode = 1;
  } finally {
    await conn.end();
  }
}

run();
