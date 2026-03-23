/**
 * 团队协作功能数据库迁移执行脚本
 * 运行: node migrations/run_team_collaboration.js
 */

const mysql = require('mysql2/promise');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

async function runMigration() {
  console.log('[Migration] 开始执行团队协作功能迁移...');

  const connection = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 3306,
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'nanostory',
    multipleStatements: true
  });

  try {
    // 读取 SQL 文件
    const sqlPath = path.join(__dirname, 'add_team_collaboration.sql');
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
          console.log('[Migration] 执行成功:', statement.substring(0, 60) + '...');
        } catch (err) {
          // 忽略"已存在"类型的错误
          if (err.code === 'ER_TABLE_EXISTS_ERROR' || 
              err.code === 'ER_DUP_KEYNAME' ||
              err.code === 'ER_DUP_FIELDNAME') {
            console.log('[Migration] 跳过（已存在）:', statement.substring(0, 60) + '...');
          } else {
            throw err;
          }
        }
      }
    }

    console.log('[Migration] 团队协作功能迁移完成!');

    // 验证表是否创建成功
    const [tables] = await connection.query(`
      SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES 
      WHERE TABLE_SCHEMA = DATABASE() 
      AND TABLE_NAME IN ('teams', 'team_members', 'project_collaborators', 'collaboration_invites')
    `);

    console.log('[Migration] 已创建的表:', tables.map(t => t.TABLE_NAME).join(', '));

    // 检查 projects 表是否有 team_id 列
    const [columns] = await connection.query(`
      SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS 
      WHERE TABLE_SCHEMA = DATABASE() 
      AND TABLE_NAME = 'projects' 
      AND COLUMN_NAME = 'team_id'
    `);

    if (columns.length > 0) {
      console.log('[Migration] projects.team_id 列已添加');
    } else {
      console.log('[Migration] 警告: projects.team_id 列未添加，请手动检查');
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
