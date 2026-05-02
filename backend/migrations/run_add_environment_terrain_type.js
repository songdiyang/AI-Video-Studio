/**
 * run_add_environment_terrain_type.js
 * 执行环境地貌类型字段迁移
 * 
 * 用法：node backend/migrations/run_add_environment_terrain_type.js
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const mysql = require('mysql2/promise');

async function runMigration() {
  const conn = await mysql.createConnection({
    host: process.env.MYSQL_HOST || '127.0.0.1',
    port: parseInt(process.env.MYSQL_PORT) || 3306,
    user: process.env.MYSQL_USER,
    password: process.env.MYSQL_PASSWORD,
    database: process.env.MYSQL_DATABASE
  });

  try {
    console.log('[Migration] 添加 environments.terrain_type 字段...');
    
    // 检查字段是否已存在
    const [cols] = await conn.execute(`SHOW COLUMNS FROM environments LIKE 'terrain_type'`);
    if (cols.length > 0) {
      console.log('[Migration] terrain_type 字段已存在，跳过');
      return;
    }
    
    // 添加字段
    await conn.execute(`
      ALTER TABLE environments 
      ADD COLUMN terrain_type VARCHAR(512) DEFAULT NULL 
      COMMENT '地貌类型，逗号分隔，如：草地,溪流,森林'
    `);
    
    console.log('[Migration] terrain_type 字段添加成功');
  } catch (err) {
    console.error('[Migration] 添加 terrain_type 字段失败:', err.message);
    throw err;
  } finally {
    await conn.end();
  }
}

module.exports = runMigration;

// 支持直接执行
if (require.main === module) {
  runMigration()
    .then(() => {
      console.log('[Migration] 环境地貌类型迁移完成');
      process.exit(0);
    })
    .catch((err) => {
      console.error('[Migration] 失败:', err);
      process.exit(1);
    });
}
