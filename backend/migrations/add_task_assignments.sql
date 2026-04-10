-- 任务指派功能数据库迁移
-- 创建时间: 2026-04-03

-- 任务指派表
CREATE TABLE IF NOT EXISTS task_assignments (
  id INT AUTO_INCREMENT PRIMARY KEY,
  team_id INT NOT NULL COMMENT '关联团队',
  project_id INT COMMENT '关联项目（可选）',
  storyboard_id INT COMMENT '关联分镜（可选）',
  assigner_id INT NOT NULL COMMENT '指派者（管理员）',
  assignee_id INT NOT NULL COMMENT '接收者（动画师）',
  title VARCHAR(255) NOT NULL COMMENT '任务标题',
  description TEXT COMMENT '任务描述',
  priority ENUM('low','medium','high','urgent') DEFAULT 'medium' COMMENT '优先级',
  deadline DATETIME COMMENT '截止时间',
  status ENUM('pending','accepted','in_progress','completed','rejected') DEFAULT 'pending' COMMENT '任务状态',
  reject_reason TEXT COMMENT '拒绝原因',
  accepted_at DATETIME COMMENT '接收时间',
  completed_at DATETIME COMMENT '完成时间',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE SET NULL,
  FOREIGN KEY (assigner_id) REFERENCES users(id),
  FOREIGN KEY (assignee_id) REFERENCES users(id),
  INDEX idx_assignee (assignee_id),
  INDEX idx_assigner (assigner_id),
  INDEX idx_team_status (team_id, status),
  INDEX idx_deadline (deadline)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='任务指派表';

-- 扩展 internal_mail 表，添加任务关联字段
-- 注意：如果 mail_type 字段已存在，此语句会失败，需要手动处理
ALTER TABLE internal_mail 
  ADD COLUMN IF NOT EXISTS related_task_id INT COMMENT '关联任务ID' AFTER related_feedback_id;

-- 修改 mail_type 枚举类型，添加 task 类型
-- 由于 MySQL 不支持直接修改 ENUM，需要先检查当前类型
-- 如果 mail_type 已经包含 task，则跳过
ALTER TABLE internal_mail 
  MODIFY COLUMN mail_type ENUM('reply','announce','system','task') NOT NULL DEFAULT 'system' COMMENT '消息类型';

-- 添加任务关联索引
ALTER TABLE internal_mail
  ADD INDEX IF NOT EXISTS idx_related_task (related_task_id);
