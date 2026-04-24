/**
 * 管理员操作日志
 *
 * 1. 创建 admin_logs 表（记录所有管理员操作）
 * 2. 确保 users.employee_id 字段存在（用于显示工号）
 */

require('dotenv').config();
const db = require('../src/db');

async function migrate() {
  console.log('[Migration] 开始: 管理员操作日志...');

  await db.initializeDatabase();
  const { queryAll, execute } = require('../src/dbHelper');

  // 1. 确保 users.employee_id 字段存在
  try {
    await execute(`
      ALTER TABLE users ADD COLUMN employee_id VARCHAR(32) DEFAULT NULL COMMENT '管理员工号' AFTER role
    `);
    console.log('[Migration] users.employee_id 字段已添加');
  } catch (err) {
    if (err.message.includes('Duplicate column')) {
      console.log('[Migration] users.employee_id 字段已存在，跳过');
    } else {
      throw err;
    }
  }

  // 2. 为没有工号的管理员生成工号
  const admins = await queryAll("SELECT id FROM users WHERE role = 'admin' AND employee_id IS NULL");
  for (const admin of admins) {
    const employeeId = 'ADM-' + Math.random().toString(36).substring(2, 8).toUpperCase();
    await execute('UPDATE users SET employee_id = ? WHERE id = ?', [employeeId, admin.id]);
    console.log(`[Migration] 管理员 ID=${admin.id} 工号已生成: ${employeeId}`);
  }

  // 3. 创建管理员操作日志表
  try {
    await execute(`
      CREATE TABLE IF NOT EXISTS admin_logs (
        id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        admin_id INT NOT NULL COMMENT '操作管理员ID',
        admin_employee_id VARCHAR(32) DEFAULT NULL COMMENT '操作人工号',
        admin_email VARCHAR(255) DEFAULT NULL COMMENT '操作人邮箱',
        action VARCHAR(64) NOT NULL COMMENT '操作类型: login/create/update/delete/toggle/etc',
        target_type VARCHAR(32) DEFAULT NULL COMMENT '操作对象类型: user/ai_model/rate_limit/subscription/system_config/etc',
        target_id VARCHAR(64) DEFAULT NULL COMMENT '操作对象ID',
        target_name VARCHAR(255) DEFAULT NULL COMMENT '操作对象名称（如用户邮箱、模型名等）',
        details TEXT DEFAULT NULL COMMENT '操作详情(JSON格式)',
        ip_address VARCHAR(45) DEFAULT NULL COMMENT 'IP地址',
        user_agent VARCHAR(255) DEFAULT NULL COMMENT 'User-Agent',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_admin_id (admin_id),
        INDEX idx_action (action),
        INDEX idx_target (target_type, target_id),
        INDEX idx_created_at (created_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='管理员操作日志'
    `);
    console.log('[Migration] admin_logs 表已创建');
  } catch (err) {
    if (err.message.includes('already exists')) {
      console.log('[Migration] admin_logs 表已存在，跳过');
    } else {
      throw err;
    }
  }

  console.log('[Migration] 完成: 管理员操作日志');
}

migrate().then(() => process.exit(0)).catch(err => {
  console.error('[Migration] 失败:', err);
  process.exit(1);
});
