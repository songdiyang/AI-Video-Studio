/**
 * 迁移脚本：创建 system_configs 表
 * 运行方式: node backend/migrations/run_system_configs.js
 */
require('dotenv').config({ path: require('path').resolve(__dirname, '..', '.env') });
const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');

async function run() {
  const connection = await mysql.createConnection({
    host: process.env.MYSQL_HOST || 'localhost',
    port: parseInt(process.env.MYSQL_PORT || '3306', 10),
    user: process.env.MYSQL_USER || 'root',
    password: process.env.MYSQL_PASSWORD || '',
    database: process.env.MYSQL_DATABASE || 'nanostory',
    multipleStatements: true
  });

  try {
    const sql = fs.readFileSync(path.join(__dirname, 'add_system_configs.sql'), 'utf8');
    await connection.query(sql);
    console.log('✅ system_configs 表创建成功，默认配置已插入');
  } catch (err) {
    console.error('❌ 迁移失败:', err.message);
    process.exit(1);
  } finally {
    await connection.end();
  }
}

run();
