-- 团队加入申请表迁移
-- 幂等设计：使用 CREATE TABLE IF NOT EXISTS
-- 执行日期：2026-03-31

CREATE TABLE IF NOT EXISTS team_join_requests (
  id INT AUTO_INCREMENT PRIMARY KEY,
  team_id INT NOT NULL,
  user_id INT NOT NULL,
  invite_code VARCHAR(64) DEFAULT NULL COMMENT '关联的邀请码（可为空，表示通过邀请码主动申请）',
  status ENUM('pending','approved','rejected') DEFAULT 'pending' COMMENT '审核状态',
  reviewed_by INT DEFAULT NULL COMMENT '审核人用户ID',
  reviewed_at DATETIME DEFAULT NULL COMMENT '审核时间',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (reviewed_by) REFERENCES users(id) ON DELETE SET NULL,
  INDEX idx_team_status (team_id, status),
  INDEX idx_user_id (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
