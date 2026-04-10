/**
 * 角色状态分类标签功能迁移脚本
 * 添加 state_category 和 tags 字段
 * 
 * 运行方式: node backend/migrations/run_add_state_category_tags.js
 */

const mysql = require('mysql2/promise');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

async function runMigration() {
  const pool = mysql.createPool({
    host: process.env.MYSQL_HOST || process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.MYSQL_PORT || '3306'),
    user: process.env.MYSQL_USER || process.env.DB_USER || 'root',
    password: process.env.MYSQL_PASSWORD || process.env.DB_PASSWORD || '',
    database: process.env.MYSQL_DATABASE || process.env.DB_NAME || 'nanostory',
    waitForConnections: true,
    connectionLimit: 1
  });

  const connection = await pool.getConnection();
  const dbName = process.env.MYSQL_DATABASE || process.env.DB_NAME || 'nanostory';
  
  try {
    console.log('开始执行角色状态分类标签迁移...\n');
    
    // 定义要添加的字段
    const alterations = [
      { 
        column: 'state_category', 
        definition: "VARCHAR(50) DEFAULT 'daily' COMMENT '状态分类:daily/costume/time/effect'" 
      },
      { 
        column: 'tags', 
        definition: "TEXT COMMENT '状态标签JSON数组'" 
      }
    ];
    
    for (const { column, definition } of alterations) {
      try {
        // 检查字段是否存在
        const [rows] = await connection.query(
          `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS 
           WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'character_states' AND COLUMN_NAME = ?`,
          [dbName, column]
        );
        
        if (rows.length === 0) {
          await connection.query(
            `ALTER TABLE character_states ADD COLUMN ${column} ${definition}`
          );
          console.log(`  ✓ 已添加字段: ${column}`);
        } else {
          console.log(`  - 字段已存在: ${column}`);
        }
      } catch (err) {
        if (err.code === 'ER_DUP_FIELDNAME') {
          console.log(`  - 字段已存在: ${column}`);
        } else {
          throw err;
        }
      }
    }
    
    // 添加分类索引
    try {
      const [indexes] = await connection.query(
        `SHOW INDEX FROM character_states WHERE Key_name = 'idx_character_states_category'`
      );
      if (indexes.length === 0) {
        await connection.query(
          `CREATE INDEX idx_character_states_category ON character_states(character_id, state_category)`
        );
        console.log('  ✓ 已添加索引: idx_character_states_category');
      } else {
        console.log('  - 索引已存在: idx_character_states_category');
      }
    } catch (err) {
      if (err.code !== 'ER_DUP_KEYNAME') {
        console.warn('  ! 创建索引失败:', err.message);
      }
    }
    
    // 将白膜状态的分类设为 daily（如果之前未设置）
    try {
      const [result] = await connection.query(
        `UPDATE character_states SET state_category = 'daily' WHERE is_base_model = 1 AND (state_category IS NULL OR state_category = 'daily')`
      );
      console.log(`  ✓ 已更新 ${result.affectedRows} 条白膜状态的分类为 daily`);
    } catch (err) {
      console.warn('  ! 更新白膜状态分类失败:', err.message);
    }
    
    console.log('\n✓ 角色状态分类标签迁移完成!');
    
  } catch (error) {
    console.error('迁移失败:', error);
    process.exit(1);
  } finally {
    connection.release();
    await pool.end();
  }
}

runMigration();
