/**
 * 任务指派功能数据库迁移执行脚本
 * 运行: node migrations/run_task_assignments.js
 */

const mysql = require('mysql2/promise');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

async function runMigration() {
  console.log('[Migration] 开始执行任务指派功能迁移...');

  const connection = await mysql.createConnection({
    host: process.env.MYSQL_HOST || process.env.DB_HOST || 'localhost',
    port: process.env.MYSQL_PORT || process.env.DB_PORT || 3306,
    user: process.env.MYSQL_USER || process.env.DB_USER || 'root',
    password: process.env.MYSQL_PASSWORD || process.env.DB_PASSWORD || '',
    database: process.env.MYSQL_DATABASE || process.env.DB_NAME || 'nanostory',
    multipleStatements: true
  });

  try {
    // 读取 SQL 文件
    const sqlPath = path.join(__dirname, 'add_task_assignments.sql');
    const sqlContent = fs.readFileSync(sqlPath, 'utf8');

    // 按语句分割执行（处理存储过程和复杂语句）
    const statements = sqlContent
      .split(/;\s*\n/)
      .map(s => s.trim())
      .filter(s => s.length > 0 && !s.startsWith('--'));

    for (const statement of statements) {
      if (statement.length > 0) {
        try {
          await connection.query(statement);
          console.log('[Migration] 执行成功:', statement.substring(0, 80) + '...');
        } catch (err) {
          // 忽略"已存在"类型的错误
          if (err.code === 'ER_TABLE_EXISTS_ERROR' || 
              err.code === 'ER_DUP_KEYNAME' ||
              err.code === 'ER_DUP_FIELDNAME' ||
              err.code === 'ER_DUP_KEY' ||
              err.message.includes('Duplicate')) {
            console.log('[Migration] 跳过（已存在）:', statement.substring(0, 80) + '...');
          } else {
            throw err;
          }
        }
      }
    }

    console.log('[Migration] 任务指派功能迁移完成!');

    // 验证表是否创建成功
    const [tables] = await connection.query(`
      SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES 
      WHERE TABLE_SCHEMA = DATABASE() 
      AND TABLE_NAME = 'task_assignments'
    `);

    if (tables.length > 0) {
      console.log('[Migration] task_assignments 表已创建');
    } else {
      console.log('[Migration] 警告: task_assignments 表未创建，请手动检查');
    }

    // 检查 internal_mail 表是否有 related_task_id 列
    const [columns] = await connection.query(`
      SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS 
      WHERE TABLE_SCHEMA = DATABASE() 
      AND TABLE_NAME = 'internal_mail' 
      AND COLUMN_NAME = 'related_task_id'
    `);

    if (columns.length > 0) {
      console.log('[Migration] internal_mail.related_task_id 列已添加');
    } else {
      console.log('[Migration] 警告: internal_mail.related_task_id 列未添加，请手动检查');
    }

    // 检查 mail_type 是否包含 task
    const [mailTypeInfo] = await connection.query(`
      SELECT COLUMN_TYPE FROM INFORMATION_SCHEMA.COLUMNS 
      WHERE TABLE_SCHEMA = DATABASE() 
      AND TABLE_NAME = 'internal_mail' 
      AND COLUMN_NAME = 'mail_type'
    `);

    if (mailTypeInfo.length > 0 && mailTypeInfo[0].COLUMN_TYPE.includes('task')) {
      console.log('[Migration] internal_mail.mail_type 已包含 task 类型');
    } else {
      console.log('[Migration] 警告: mail_type 未包含 task 类型，请手动检查');
    }

  } catch (error) {
    console.error('[Migration] 迁移失败:', error.message);
    throw error;
  } finally {
    await connection.end();
  }
}

// 执行迁移
runMigration()
  .then(() => {
    console.log('[Migration] 脚本执行完毕');
    process.exit(0);
  })
  .catch(err => {
    console.error('[Migration] 脚本执行失败:', err);
    process.exit(1);
  });
