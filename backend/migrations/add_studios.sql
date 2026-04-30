-- 影棚（Studio）：多场景 + 多元素的地点聚合
CREATE TABLE IF NOT EXISTS studios (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  project_id INT NOT NULL,
  name VARCHAR(128) NOT NULL,
  description TEXT DEFAULT NULL,
  cover_image_url VARCHAR(1024) DEFAULT NULL,
  sort_order INT DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
  INDEX idx_user_project (user_id, project_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='影棚（场景与元素的地点聚合）';

-- scenes 表新增 studio_id（可空，向后兼容）
ALTER TABLE scenes ADD COLUMN studio_id INT DEFAULT NULL AFTER project_id;
ALTER TABLE scenes ADD INDEX idx_studio (studio_id);
ALTER TABLE scenes ADD CONSTRAINT fk_scenes_studio
  FOREIGN KEY (studio_id) REFERENCES studios(id) ON DELETE SET NULL;

-- 影棚↔场景元素 多对多（元素可跨影棚复用）
CREATE TABLE IF NOT EXISTS studio_element_links (
  id INT AUTO_INCREMENT PRIMARY KEY,
  studio_id INT NOT NULL,
  element_id INT NOT NULL,
  sort_order INT DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (studio_id) REFERENCES studios(id) ON DELETE CASCADE,
  FOREIGN KEY (element_id) REFERENCES scene_elements(id) ON DELETE CASCADE,
  UNIQUE KEY uniq_studio_element (studio_id, element_id),
  INDEX idx_studio (studio_id),
  INDEX idx_element (element_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='影棚-场景元素关联';
