/**
 * 角色状态表增强迁移脚本
 * 添加服装、年龄、发型等外观属性字段
 * 
 * 运行方式: node backend/migrations/run_enhance_character_states.js
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
    console.log('开始执行角色状态表增强迁移...\n');
    
    // 定义要添加的字段
    const alterations = [
      { column: 'outfit', definition: "VARCHAR(500) COMMENT '服装描述'" },
      { column: 'age_stage', definition: "VARCHAR(50) COMMENT '年龄阶段:童年/少年/青年/中年/老年'" },
      { column: 'hairstyle', definition: "VARCHAR(200) COMMENT '发型描述'" },
      { column: 'accessories', definition: "TEXT COMMENT '配饰描述JSON'" },
      { column: 'is_active', definition: "TINYINT(1) DEFAULT 0 COMMENT '是否为当前激活状态'" },
      { column: 'generation_prompt', definition: "TEXT COMMENT '生成时使用的提示词'" },
      { column: 'generation_status', definition: "VARCHAR(20) DEFAULT 'idle' COMMENT '生成状态:idle/generating/completed/failed'" }
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
    
    // 添加索引
    try {
      const [indexes] = await connection.query(
        `SHOW INDEX FROM character_states WHERE Key_name = 'idx_character_states_is_active'`
      );
      if (indexes.length === 0) {
        await connection.query(
          `CREATE INDEX idx_character_states_is_active ON character_states(character_id, is_active)`
        );
        console.log('  ✓ 已添加索引: idx_character_states_is_active');
      } else {
        console.log('  - 索引已存在: idx_character_states_is_active');
      }
    } catch (err) {
      if (err.code !== 'ER_DUP_KEYNAME') {
        console.warn('  ! 创建索引失败:', err.message);
      }
    }
    
    console.log('\n✓ 角色状态表增强迁移完成!');
    
  } catch (error) {
    console.error('迁移失败:', error);
    process.exit(1);
  } finally {
    connection.release();
    await pool.end();
  }
}

runMigration();
