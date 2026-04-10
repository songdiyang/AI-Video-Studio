/**
 * 执行系统错误日志表迁移
 */

const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

async function runMigration() {
  const dbConfig = {
    host: process.env.MYSQL_HOST || process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.MYSQL_PORT || '3306'),
    user: process.env.MYSQL_USER || process.env.DB_USER || 'root',
    password: process.env.MYSQL_PASSWORD || process.env.DB_PASSWORD || '',
    database: process.env.MYSQL_DATABASE || process.env.DB_NAME || 'nanostory',
    multipleStatements: true
  };

  console.log('正在连接数据库...');
  const connection = await mysql.createConnection(dbConfig);
  
  try {
    const sqlPath = path.join(__dirname, 'add_system_error_logs.sql');
    const sql = fs.readFileSync(sqlPath, 'utf8');
    
    console.log('执行迁移: add_system_error_logs.sql');
    await connection.query(sql);
    
    console.log('✓ 迁移成功！system_error_logs 表已创建');
  } catch (error) {
    console.error('✗ 迁移失败:', error.message);
    throw error;
  } finally {
    await connection.end();
  }
}

runMigration().catch(err => {
  console.error('迁移脚本执行失败:', err);
  process.exit(1);
});
