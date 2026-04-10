/**
 * 迁移脚本: 添加 AI 限流配置表
 * 
 * 支持按用户角色配置不同的并发限制参数
 */
const mysql = require('mysql2/promise');
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

async function runMigration() {
  const connection = await mysql.createConnection({
    host: process.env.MYSQL_HOST,
    port: parseInt(process.env.MYSQL_PORT) || 3306,
    user: process.env.MYSQL_USER,
    password: process.env.MYSQL_PASSWORD,
    database: process.env.MYSQL_DATABASE
  });

  try {
    console.log('========================================');
    console.log('执行迁移: 添加 AI 限流配置表');
    console.log('========================================\n');

    // 1. 创建 rate_limit_configs 表
    console.log('1. 创建 rate_limit_configs 表...');
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS rate_limit_configs (
        id INT AUTO_INCREMENT PRIMARY KEY,
        role VARCHAR(50) NOT NULL COMMENT '用户角色：user/admin/vip 等',
        max_concurrent_text INT DEFAULT 10 COMMENT '文本模型最大并发数',
        max_concurrent_image INT DEFAULT 5 COMMENT '图片模型最大并发数',
        max_concurrent_video INT DEFAULT 3 COMMENT '视频模型最大并发数',
        timeout_seconds INT DEFAULT 300 COMMENT '等待超时时间(秒)',
        retry_delay_ms INT DEFAULT 60000 COMMENT '429重试延迟(毫秒)',
        max_retries INT DEFAULT 3 COMMENT '最大重试次数',
        description VARCHAR(255) DEFAULT NULL COMMENT '配置描述',
        is_active TINYINT(1) DEFAULT 1 COMMENT '是否启用',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY unique_role (role)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci 
      COMMENT='AI 调用限流配置表（按角色）'
    `);
    console.log('    ✓ rate_limit_configs 表已创建');

    // 2. 插入默认配置
    console.log('\n2. 插入默认限流配置...');

    // 默认配置 - 普通用户
    await connection.execute(`
      INSERT IGNORE INTO rate_limit_configs 
        (role, max_concurrent_text, max_concurrent_image, max_concurrent_video, 
         timeout_seconds, retry_delay_ms, max_retries, description, is_active)
      VALUES 
        ('user', 5, 3, 1, 300, 60000, 3, '普通用户默认限流配置', 1)
    `);
    console.log('    ✓ 普通用户(user)配置已添加');

    // 管理员配置 - 更高限额
    await connection.execute(`
      INSERT IGNORE INTO rate_limit_configs 
        (role, max_concurrent_text, max_concurrent_image, max_concurrent_video, 
         timeout_seconds, retry_delay_ms, max_retries, description, is_active)
      VALUES 
        ('admin', 20, 10, 5, 600, 30000, 5, '管理员高限额配置', 1)
    `);
    console.log('    ✓ 管理员(admin)配置已添加');

    // VIP 配置
    await connection.execute(`
      INSERT IGNORE INTO rate_limit_configs 
        (role, max_concurrent_text, max_concurrent_image, max_concurrent_video, 
         timeout_seconds, retry_delay_ms, max_retries, description, is_active)
      VALUES 
        ('vip', 10, 6, 3, 450, 45000, 4, 'VIP用户限流配置', 1)
    `);
    console.log('    ✓ VIP用户(vip)配置已添加');

    // 全局默认配置 (fallback)
    await connection.execute(`
      INSERT IGNORE INTO rate_limit_configs 
        (role, max_concurrent_text, max_concurrent_image, max_concurrent_video, 
         timeout_seconds, retry_delay_ms, max_retries, description, is_active)
      VALUES 
        ('default', 10, 5, 3, 300, 60000, 3, '全局默认配置（当角色无匹配时使用）', 1)
    `);
    console.log('    ✓ 全局默认(default)配置已添加');

    console.log('\n========================================');
    console.log('迁移完成!');
    console.log('========================================');
  } catch (err) {
    console.error('\n迁移失败:', err);
    process.exit(1);
  } finally {
    await connection.end();
  }
}

runMigration();
