/**
 * 迁移：为 users 表添加 last_login_location 字段
 * 用法：node migrations/run_add_last_login_location.js
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const mysql = require('mysql2/promise');

async function migrate() {
  const conn = await mysql.createConnection({
    host: process.env.MYSQL_HOST || '127.0.0.1',
    port: parseInt(process.env.MYSQL_PORT || '3306'),
    user: process.env.MYSQL_USER || 'root',
    password: process.env.MYSQL_PASSWORD || '',
    database: process.env.MYSQL_DATABASE || 'nanostory',
  });

  try {
    // 检查字段是否已存在
    const [cols] = await conn.query(
      "SHOW COLUMNS FROM users WHERE Field = 'last_login_location'"
    );

    if (cols.length === 0) {
      await conn.query(
        "ALTER TABLE users ADD COLUMN last_login_location VARCHAR(100) DEFAULT NULL COMMENT '最后登录地点（省份/城市）' AFTER last_login_ip"
      );
      console.log('[Migrate] ✅ 已添加 last_login_location 字段');
    } else {
      console.log('[Migrate] ⏭ last_login_location 字段已存在，跳过');
    }
  } catch (error) {
    console.error('[Migrate] ❌ 迁移失败:', error.message);
    process.exit(1);
  } finally {
    await conn.end();
  }
}

migrate();
