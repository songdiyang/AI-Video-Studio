-- 项目邀请表
CREATE TABLE IF NOT EXISTS project_invites (
  id INT AUTO_INCREMENT PRIMARY KEY,
  project_id INT NOT NULL COMMENT '项目 ID',
  invite_code VARCHAR(32) UNIQUE NOT NULL COMMENT '邀请码',
  created_by INT NOT NULL COMMENT '创建者用户 ID',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  expires_at DATETIME NOT NULL COMMENT '过期时间',
  is_active TINYINT(1) DEFAULT 1 COMMENT '是否激活',
  INDEX idx_invite_code (invite_code),
  INDEX idx_project_id (project_id),
  INDEX idx_expires_at (expires_at),
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 团队项目加入申请表
CREATE TABLE IF NOT EXISTS team_project_join_requests (
  id INT AUTO_INCREMENT PRIMARY KEY,
  project_id INT NOT NULL COMMENT '项目 ID',
  user_id INT NOT NULL COMMENT '申请用户 ID',
  invite_code VARCHAR(32) NOT NULL COMMENT '使用的邀请码',
  status ENUM('pending', 'approved', 'rejected') DEFAULT 'pending' COMMENT '审批状态',
  reviewed_by INT DEFAULT NULL COMMENT '审批人用户 ID',
  reviewed_at DATETIME DEFAULT NULL COMMENT '审批时间',
  review_comment TEXT COMMENT '审批意见',
  requested_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_project_id (project_id),
  INDEX idx_user_id (user_id),
  INDEX idx_status (status),
  INDEX idx_invite_code (invite_code),
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (reviewed_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 团队项目成员表
CREATE TABLE IF NOT EXISTS team_project_members (
  id INT AUTO_INCREMENT PRIMARY KEY,
  project_id INT NOT NULL COMMENT '项目 ID',
  user_id INT NOT NULL COMMENT '用户 ID',
  role ENUM('viewer', 'editor', 'admin') DEFAULT 'viewer' COMMENT '角色',
  joined_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uk_project_user (project_id, user_id),
  INDEX idx_project_id (project_id),
  INDEX idx_user_id (user_id),
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
