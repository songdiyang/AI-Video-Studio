// 简化的任务指派迁移脚本
require('dotenv').config();
const mysql = require('mysql2/promise');

async function run() {
  const conn = await mysql.createConnection({
    host: process.env.MYSQL_HOST,
    port: process.env.MYSQL_PORT,
    user: process.env.MYSQL_USER,
    password: process.env.MYSQL_PASSWORD,
    database: process.env.MYSQL_DATABASE
  });

  try {
    // 1. 创建 task_assignments 表
    await conn.query(`
      CREATE TABLE IF NOT EXISTS task_assignments (
        id INT AUTO_INCREMENT PRIMARY KEY,
        team_id INT NOT NULL,
        project_id INT,
        storyboard_id INT,
        assigner_id INT NOT NULL,
        assignee_id INT NOT NULL,
        title VARCHAR(255) NOT NULL,
        description TEXT,
        priority ENUM('low','medium','high','urgent') DEFAULT 'medium',
        deadline DATETIME,
        status ENUM('pending','accepted','in_progress','completed','rejected') DEFAULT 'pending',
        reject_reason TEXT,
        accepted_at DATETIME,
        completed_at DATETIME,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE,
        FOREIGN KEY (assigner_id) REFERENCES users(id),
        FOREIGN KEY (assignee_id) REFERENCES users(id),
        INDEX idx_assignee (assignee_id),
        INDEX idx_assigner (assigner_id),
        INDEX idx_team_status (team_id, status)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    console.log('task_assignments 表创建成功');

    // 2. 添加 related_task_id 列（如果不存在）
    try {
      await conn.query(`ALTER TABLE internal_mail ADD COLUMN related_task_id INT`);
      console.log('internal_mail.related_task_id 列添加成功');
    } catch (e) {
      if (e.code === 'ER_DUP_FIELDNAME') {
        console.log('internal_mail.related_task_id 列已存在，跳过');
      } else {
        throw e;
      }
    }

    // 3. 修改 mail_type 枚举（添加 task 类型）
    try {
      await conn.query(`ALTER TABLE internal_mail MODIFY COLUMN mail_type ENUM('reply','announce','system','task') NOT NULL DEFAULT 'system'`);
      console.log('internal_mail.mail_type 已更新为包含 task');
    } catch (e) {
      console.log('mail_type 修改结果:', e.message);
    }

    console.log('迁移完成!');
  } catch (e) {
    console.error('迁移失败:', e.message);
  } finally {
    await conn.end();
  }
}

run();
