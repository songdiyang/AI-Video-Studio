// 一次性迁移执行器：20260426_storyboards_episode_number.sql
// 使用与 run_storyboards_script_optional.js 相同的安全拆分策略（剔除 -- 注释行后按分号分段）
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

  const sqlPath = path.join(__dirname, '20260426_storyboards_episode_number.sql');
  const sql = fs.readFileSync(sqlPath, 'utf8');

  try {
    console.log('[migrate] 开始执行 20260426_storyboards_episode_number.sql');

    // 幂等：若列已存在则跳过 ADD COLUMN
    const [cols] = await conn.query(
      "SHOW COLUMNS FROM storyboards LIKE 'episode_number'"
    );
    const columnExists = Array.isArray(cols) && cols.length > 0;

    const segments = [];
    let buf = '';
    for (const line of sql.split('\n')) {
      if (line.trim().startsWith('--')) continue; // 剔除注释
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

      // 跳过已经存在的列
      if (columnExists && /ADD COLUMN\s+episode_number/i.test(stmt)) {
        console.log('[migrate] 列 episode_number 已存在，跳过 ADD COLUMN');
        continue;
      }

      // 跳过已存在的索引
      if (/CREATE INDEX\s+idx_project_episode/i.test(stmt)) {
        try {
          const [idx] = await conn.query(
            "SHOW INDEX FROM storyboards WHERE Key_name = 'idx_project_episode'"
          );
          if (Array.isArray(idx) && idx.length > 0) {
            console.log('[migrate] 索引 idx_project_episode 已存在，跳过');
            continue;
          }
        } catch (_) { /* 忽略，继续执行 CREATE INDEX */ }
      }

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
