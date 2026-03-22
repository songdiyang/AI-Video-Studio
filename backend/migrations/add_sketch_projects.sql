-- 独立草图项目表
-- 用于存储与分镜无关的独立草图/绘画项目

CREATE TABLE IF NOT EXISTS sketch_projects (
  id INT PRIMARY KEY AUTO_INCREMENT,
  user_id INT NOT NULL,
  project_id INT NOT NULL,
  title VARCHAR(255) NOT NULL DEFAULT '未命名草图',
  description TEXT,
  thumbnail_url VARCHAR(512),
  sketch_url VARCHAR(512),
  excalidraw_data LONGTEXT,
  tags JSON,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
  INDEX idx_sketch_projects_user_project (user_id, project_id),
  INDEX idx_sketch_projects_updated (updated_at DESC)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='独立草图项目表';
