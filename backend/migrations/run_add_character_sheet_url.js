// 迁移脚本：添加 character_sheet_url 字段
require('dotenv').config();
const mysql = require('mysql2/promise');

async function run() {
  const conn = await mysql.createConnection({
    host: process.env.MYSQL_HOST,
    port: process.env.MYSQL_PORT,
    user: process.env.MYSQL_USER,
    password: process.env.MYSQL_PASSWORD,
    database: process.env.MYSQL_DATABASE
  });

  try {
    try {
      await conn.query(`ALTER TABLE characters ADD COLUMN character_sheet_url TEXT COMMENT '角色设定图合成URL（三视图+描述信息）' AFTER back_view_url`);
      console.log('characters.character_sheet_url 列添加成功');
    } catch (e) {
      if (e.code === 'ER_DUP_FIELDNAME') {
        console.log('characters.character_sheet_url 列已存在，跳过');
      } else {
        throw e;
      }
    }

    console.log('迁移完成!');
  } catch (e) {
    console.error('迁移失败:', e.message);
  } finally {
    await conn.end();
  }
}

run();
