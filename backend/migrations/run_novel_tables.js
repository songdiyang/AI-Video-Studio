/**
 * 运行小说表迁移
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');

async function runMigration() {
  const connection = await mysql.createConnection({
    host: process.env.MYSQL_HOST || 'localhost',
    port: process.env.MYSQL_PORT || 3306,
    user: process.env.MYSQL_USER || 'root',
    password: process.env.MYSQL_PASSWORD || '',
    database: process.env.MYSQL_DATABASE || 'nanostory',
    multipleStatements: true
  });

  try {
    console.log('开始执行小说表迁移...');
    
    const sqlPath = path.join(__dirname, 'add_novel_tables.sql');
    const sql = fs.readFileSync(sqlPath, 'utf8');
    
    await connection.query(sql);
    
    console.log('小说表迁移完成！');
    console.log('- novel_outlines 表已创建');
    console.log('- novel_chapters 表已创建');
  } catch (error) {
    console.error('迁移失败:', error.message);
    throw error;
  } finally {
    await connection.end();
  }
}

runMigration().catch(err => {
  console.error(err);
  process.exit(1);
});
