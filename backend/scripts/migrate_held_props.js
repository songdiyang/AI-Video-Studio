require('dotenv').config();
const mysql = require('mysql2/promise');

async function run() {
  const pool = mysql.createPool({
    host: process.env.MYSQL_HOST || process.env.DB_HOST,
    port: process.env.MYSQL_PORT || process.env.DB_PORT || 3306,
    user: process.env.MYSQL_USER || process.env.DB_USER,
    password: process.env.MYSQL_PASSWORD || process.env.DB_PASSWORD,
    database: process.env.MYSQL_DATABASE || process.env.DB_NAME
  });

  try {
    const [cols] = await pool.query("SHOW COLUMNS FROM character_states LIKE 'held_props'");
    if (cols.length > 0) {
      console.log('held_props 字段已存在，跳过迁移');
    } else {
      await pool.query(
        "ALTER TABLE character_states ADD COLUMN held_props VARCHAR(500) DEFAULT NULL COMMENT '手持道具描述（当前状态下角色持有/携带的道具，如剑、书本、胡萝卜等）' AFTER body_elements"
      );
      console.log('迁移成功: held_props 字段已添加到 character_states 表');
    }
  } catch (e) {
    console.error('迁移失败:', e.message, e.code, e.errno);
    console.error('完整错误:', JSON.stringify(e, null, 2));
    process.exit(1);
  } finally {
    await pool.end();
  }
}

run();
