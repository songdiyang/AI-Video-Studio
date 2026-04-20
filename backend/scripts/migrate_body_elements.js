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
    const [cols] = await pool.query("SHOW COLUMNS FROM character_states LIKE 'body_elements'");
    if (cols.length > 0) {
      console.log('body_elements 字段已存在，跳过迁移');
    } else {
      await pool.query(
        "ALTER TABLE character_states ADD COLUMN body_elements TEXT DEFAULT NULL COMMENT '身体元素描述（纹身、疤痕、胎记等永久性身体标记）' AFTER accessories"
      );
      console.log('迁移成功: body_elements 字段已添加到 character_states 表');
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
