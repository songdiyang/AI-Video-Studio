/**
 * 管理员工号 + 积分调整日志
 * 
 * 1. users 表添加 employee_id（管理员工号，随机生成，不可修改）
 * 2. 创建 points_adjustment_log 表（积分调整记录）
 * 3. internal_mail 表 mail_type 添加 'points_change' 值
 */

require('dotenv').config();
const db = require('../src/db');

async function migrate() {
  console.log('[Migration] 开始: 管理员工号 + 积分调整日志...');

  await db.initializeDatabase();
  const pool = db.getPool();
  const { queryOne, queryAll, execute } = require('../src/dbHelper');

  // 1. 添加 employee_id 字段
  try {
    await execute(`
      ALTER TABLE users ADD COLUMN employee_id VARCHAR(20) DEFAULT NULL COMMENT '管理员工号（随机生成，不可修改）' AFTER role
    `);
    console.log('[Migration] users.employee_id 字段已添加');
  } catch (err) {
    if (err.message.includes('Duplicate column')) {
      console.log('[Migration] users.employee_id 字段已存在，跳过');
    } else {
      throw err;
    }
  }

  // 2. 为现有管理员生成随机工号
  const admins = await queryAll("SELECT id FROM users WHERE role = 'admin' AND employee_id IS NULL");
  for (const admin of admins) {
    const employeeId = 'ADM-' + Math.random().toString(36).substring(2, 8).toUpperCase();
    await execute('UPDATE users SET employee_id = ? WHERE id = ?', [employeeId, admin.id]);
    console.log(`[Migration] 管理员 ID=${admin.id} 工号已生成: ${employeeId}`);
  }

  // 3. 创建积分调整日志表
  try {
    await execute(`
      CREATE TABLE IF NOT EXISTS points_adjustment_log (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NOT NULL COMMENT '被调整的用户ID',
        admin_id INT NOT NULL COMMENT '操作管理员ID',
        admin_employee_id VARCHAR(20) DEFAULT NULL COMMENT '操作人工号',
        adjustment_type ENUM('add', 'subtract') NOT NULL COMMENT '调整类型：增加/减少',
        amount INT NOT NULL COMMENT '调整积分数',
        balance_before INT NOT NULL COMMENT '调整前余额',
        balance_after INT NOT NULL COMMENT '调整后余额',
        reason TEXT COMMENT '调整原因（站内信内容）',
        mail_id INT DEFAULT NULL COMMENT '关联的站内信ID',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_user (user_id),
        INDEX idx_admin (admin_id),
        INDEX idx_created (created_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    console.log('[Migration] points_adjustment_log 表已创建');
  } catch (err) {
    if (err.message.includes('already exists')) {
      console.log('[Migration] points_adjustment_log 表已存在，跳过');
    } else {
      throw err;
    }
  }

  // 4. 修改 internal_mail 的 mail_type 枚举添加 points_change
  try {
    await execute(`
      ALTER TABLE internal_mail MODIFY COLUMN mail_type 
      ENUM('reply', 'announce', 'system', 'task', 'points_change') 
      DEFAULT 'system' COMMENT '邮件类型'
    `);
    console.log('[Migration] internal_mail.mail_type 已添加 points_change');
  } catch (err) {
    console.warn('[Migration] internal_mail.mail_type 修改失败（可能已包含）:', err.message);
  }

  console.log('[Migration] 完成: 管理员工号 + 积分调整日志');
}

migrate().then(() => process.exit(0)).catch(err => {
  console.error('[Migration] 失败:', err);
  process.exit(1);
});
