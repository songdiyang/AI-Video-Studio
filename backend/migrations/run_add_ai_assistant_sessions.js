/**
 * AI 助手多会话迁移脚本
 *
 * 执行：node migrations/run_add_ai_assistant_sessions.js
 */

require('dotenv').config();
const db = require('../src/db');
const fs = require('fs');
const path = require('path');

async function migrate() {
  console.log('开始 AI 助手多会话迁移...\n');

  try {
    await db.initializeDatabase();
    const pool = db.getPool();

    const sqlPath = path.join(__dirname, 'add_ai_assistant_sessions.sql');
    const sql = fs.readFileSync(sqlPath, 'utf-8');

    // 去除 -- 注释（避免拆分后整条语句被注释吃掉）
    const cleanedSql = sql
      .split('\n')
      .map((line) => {
        const idx = line.indexOf('--');
        return idx >= 0 ? line.substring(0, idx) : line;
      })
      .join('\n');

    // 拆分多个语句并逐个执行
    const statements = cleanedSql
      .split(';')
      .map((s) => s.trim())
      .filter((s) => s.length > 0);

    for (const stmt of statements) {
      const clean = stmt.replace(/\n/g, ' ').trim();
      if (!clean) continue;
      try {
        await pool.query(clean);
        console.log('  ✓ 执行:', clean.substring(0, 60) + (clean.length > 60 ? '...' : ''));
      } catch (err) {
        if (err.message && err.message.includes('already exists')) {
          console.log('  - 已存在，跳过');
        } else {
          throw err;
        }
      }
    }

    console.log('\n迁移完成！');
    await db.closeDatabase();
    process.exit(0);
  } catch (error) {
    console.error('迁移失败:', error);
    process.exit(1);
  }
}

migrate();
