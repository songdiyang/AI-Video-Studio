/**
 * 迁移：environment_variants 表
 * 支持同一环境在不同时间状态（白天/夜晚/黄昏等）下生成独立的全景图/氛围图
 *
 * 用法：node backend/migrations/run_add_environment_variants.js
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
    console.log('[Migration] 开始: 创建 environment_variants 表...');

    await conn.execute(`
      CREATE TABLE IF NOT EXISTS environment_variants (
        id INT AUTO_INCREMENT PRIMARY KEY,
        environment_id INT NOT NULL COMMENT '所属环境 ID',
        time_of_day VARCHAR(64) DEFAULT NULL COMMENT '时段：白天/夜晚/黄昏/黎明等',
        weather VARCHAR(64) DEFAULT NULL COMMENT '天气：晴/雨/雪/雾等',
        lighting VARCHAR(128) DEFAULT NULL COMMENT '光照描述',
        mood VARCHAR(128) DEFAULT NULL COMMENT '情绪基调',
        image_url VARCHAR(1024) DEFAULT NULL COMMENT '氛围参考图',
        panorama_image_url VARCHAR(1024) DEFAULT NULL COMMENT '360° 全景图 URL',
        generation_prompt TEXT DEFAULT NULL COMMENT 'AI 生成的提示词',
        generation_status ENUM('pending','generating','completed','failed') NOT NULL DEFAULT 'pending',
        sort_order INT DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (environment_id) REFERENCES environments(id) ON DELETE CASCADE,
        INDEX idx_environment_id (environment_id),
        INDEX idx_status (generation_status)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      COMMENT='环境时间变体：同一环境在不同时间/天气下的图象变体'
    `);

    console.log('   ✓ environment_variants 表创建成功');
  } catch (err) {
    if (err.code === 'ER_TABLE_EXISTS_ERROR') {
      console.log('   - environment_variants 表已存在，跳过');
    } else {
      throw err;
    }
  } finally {
    await conn.end();
  }
}

module.exports = runMigration;

// 支持直接执行
if (require.main === module) {
  runMigration()
    .then(() => {
      console.log('[Migration] environment_variants 迁移完成');
      process.exit(0);
    })
    .catch((err) => {
      console.error('[Migration] 失败:', err);
      process.exit(1);
    });
}
