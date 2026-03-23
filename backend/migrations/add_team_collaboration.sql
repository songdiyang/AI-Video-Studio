-- 团队协作功能数据库迁移
-- 幂等设计：使用 CREATE TABLE IF NOT EXISTS
-- 执行日期：2026-03-23

-- =============================================
-- 1. teams - 团队基本信息表
-- =============================================
CREATE TABLE IF NOT EXISTS teams (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  avatar_url VARCHAR(500),
  owner_id INT NOT NULL,
  invite_code VARCHAR(32) UNIQUE,
  invite_code_expires_at DATETIME,
  max_members INT DEFAULT 10,
  is_active TINYINT(1) DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_owner_id (owner_id),
  INDEX idx_invite_code (invite_code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =============================================
-- 2. team_members - 团队成员表
-- =============================================
CREATE TABLE IF NOT EXISTS team_members (
  id INT AUTO_INCREMENT PRIMARY KEY,
  team_id INT NOT NULL,
  user_id INT NOT NULL,
  role ENUM('viewer','editor','admin','owner') DEFAULT 'viewer',
  joined_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  invited_by INT,
  FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (invited_by) REFERENCES users(id) ON DELETE SET NULL,
  UNIQUE KEY unique_team_user (team_id, user_id),
  INDEX idx_team_id (team_id),
  INDEX idx_user_id (user_id),
  INDEX idx_role (role)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =============================================
-- 3. project_collaborators - 项目协作者表
-- =============================================
CREATE TABLE IF NOT EXISTS project_collaborators (
  id INT AUTO_INCREMENT PRIMARY KEY,
  project_id INT NOT NULL,
  user_id INT NOT NULL,
  role ENUM('viewer','editor','admin') DEFAULT 'viewer',
  added_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  added_by INT,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (added_by) REFERENCES users(id) ON DELETE SET NULL,
  UNIQUE KEY unique_project_user (project_id, user_id),
  INDEX idx_project_id (project_id),
  INDEX idx_user_id (user_id),
  INDEX idx_role (role)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =============================================
-- 4. collaboration_invites - 邀请记录表
-- =============================================
CREATE TABLE IF NOT EXISTS collaboration_invites (
  id INT AUTO_INCREMENT PRIMARY KEY,
  invite_code VARCHAR(64) UNIQUE NOT NULL,
  invite_type ENUM('team','project') NOT NULL,
  target_id INT NOT NULL,
  role ENUM('viewer','editor','admin') DEFAULT 'viewer',
  created_by INT NOT NULL,
  max_uses INT DEFAULT 1,
  used_count INT DEFAULT 0,
  expires_at DATETIME,
  is_active TINYINT(1) DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_invite_code (invite_code),
  INDEX idx_invite_type (invite_type),
  INDEX idx_target_id (target_id),
  INDEX idx_expires_at (expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =============================================
-- 5. 修改 projects 表添加 team_id 字段
-- =============================================
-- 检查列是否存在，如不存在则添加
SET @column_exists = (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS 
  WHERE TABLE_SCHEMA = DATABASE() 
  AND TABLE_NAME = 'projects' 
  AND COLUMN_NAME = 'team_id'
);

SET @add_column_sql = IF(@column_exists = 0, 
  'ALTER TABLE projects ADD COLUMN team_id INT DEFAULT NULL AFTER user_id',
  'SELECT "Column team_id already exists"'
);
PREPARE stmt FROM @add_column_sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- 添加外键约束（如果不存在）
SET @fk_exists = (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS 
  WHERE TABLE_SCHEMA = DATABASE() 
  AND TABLE_NAME = 'projects' 
  AND CONSTRAINT_NAME = 'fk_projects_team_id'
);

SET @add_fk_sql = IF(@fk_exists = 0 AND @column_exists = 0, 
  'ALTER TABLE projects ADD CONSTRAINT fk_projects_team_id FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE SET NULL',
  'SELECT "Foreign key already exists or column was already present"'
);
PREPARE stmt FROM @add_fk_sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- 添加索引（如果不存在）
SET @idx_exists = (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS 
  WHERE TABLE_SCHEMA = DATABASE() 
  AND TABLE_NAME = 'projects' 
  AND INDEX_NAME = 'idx_team_id'
);

SET @add_idx_sql = IF(@idx_exists = 0, 
  'ALTER TABLE projects ADD INDEX idx_team_id (team_id)',
  'SELECT "Index idx_team_id already exists"'
);
PREPARE stmt FROM @add_idx_sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
