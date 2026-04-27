/**
 * 角色白膜/服装分层架构改造迁移
 * 在 characters 表添加 base_appearance 和 outfit_appearance 字段
 * 
 * 运行方式: node backend/migrations/run_base_outfit_appearance.js
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
    console.log('开始执行角色白膜/服装分层迁移...\n');
    
    const alterations = [
      { column: 'base_appearance', definition: "TEXT DEFAULT NULL COMMENT '白膜体貌描述（不含服装的身体特征）'" },
      { column: 'outfit_appearance', definition: "TEXT DEFAULT NULL COMMENT '服装外貌描述（服装、配饰等可更换装饰）'" }
    ];
    
    for (const { column, definition } of alterations) {
      const [rows] = await connection.query(
        `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS 
         WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'characters' AND COLUMN_NAME = ?`,
        [dbName, column]
      );
      
      if (rows.length > 0) {
        console.log(`  - 字段 characters.${column} 已存在，跳过`);
      } else {
        await connection.query(`ALTER TABLE characters ADD COLUMN ${column} ${definition}`);
        console.log(`  ✓ 已添加字段: characters.${column}`);
      }
    }
    
    console.log('\n✅ 角色白膜/服装分层迁移完成');
  } catch (error) {
    console.error('❌ 迁移失败:', error.message);
    throw error;
  } finally {
    connection.release();
    await pool.end();
  }
}

runMigration().catch(err => {
  console.error(err);
  process.exit(1);
});
