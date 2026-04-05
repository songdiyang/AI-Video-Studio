/**
 * 运行数据库迁移脚本
 * 添加工作流乐观锁版本号（OCC）
 */
const mysql = require('mysql2/promise');
require('dotenv').config();

async function runMigration() {
  const connection = await mysql.createConnection({
    host: process.env.MYSQL_HOST,
    port: parseInt(process.env.MYSQL_PORT) || 3306,
    user: process.env.MYSQL_USER,
    password: process.env.MYSQL_PASSWORD,
    database: process.env.MYSQL_DATABASE
  });

  try {
    console.log('开始执行迁移...');

    // 添加乐观锁版本号字段
    console.log('1. 添加 version 列到 workflow_jobs 表...');
    try {
      await connection.execute(`
        ALTER TABLE workflow_jobs 
        ADD COLUMN version INT DEFAULT 0 COMMENT '乐观锁版本号（OCC）'
      `);
      console.log('   version 列添加成功');
    } catch (err) {
      if (err.code === 'ER_DUP_FIELDNAME') {
        console.log('   version 列已存在，跳过');
      } else {
        throw err;
      }
    }

    console.log('迁移完成!');
  } catch (err) {
    console.error('迁移失败:', err);
    process.exit(1);
  } finally {
    await connection.end();
  }
}

runMigration();
