-- =========================================================
-- add_scene_elements.sql
-- 场景元素沉淀（影棚）：元素主表 + 场景-元素关联表
-- =========================================================

-- 1) scene_elements: 元素主表（项目级复用，建筑/场景 两类）
CREATE TABLE IF NOT EXISTS scene_elements (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL COMMENT '所属用户',
  project_id INT NOT NULL COMMENT '所属项目（不跨项目复用）',
  category ENUM('building', 'scenery') NOT NULL DEFAULT 'scenery' COMMENT '元素类别：建筑/场景',
  name VARCHAR(128) NOT NULL COMMENT '元素名称，如：木屋、栅栏、水池',
  description TEXT DEFAULT NULL COMMENT '外观/风格/材质描述',
  image_url VARCHAR(1024) DEFAULT NULL COMMENT '元素立绘 URL（透明底或干净背景）',
  generation_prompt TEXT DEFAULT NULL COMMENT '生成时使用的 prompt（供重生用）',
  generation_status ENUM('pending', 'generating', 'completed', 'failed') NOT NULL DEFAULT 'pending' COMMENT '生成状态',
  sort_order INT DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
  INDEX idx_user_project (user_id, project_id),
  INDEX idx_project_category (project_id, category),
  INDEX idx_status (generation_status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='场景元素库（影棚）';

-- 2) scene_element_links: 场景-元素多对多
CREATE TABLE IF NOT EXISTS scene_element_links (
  id INT AUTO_INCREMENT PRIMARY KEY,
  scene_id INT NOT NULL,
  element_id INT NOT NULL,
  position_hint VARCHAR(128) DEFAULT NULL COMMENT '空间位置提示：如 前景左侧、中景中央、远景山脚',
  sort_order INT DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (scene_id) REFERENCES scenes(id) ON DELETE CASCADE,
  FOREIGN KEY (element_id) REFERENCES scene_elements(id) ON DELETE CASCADE,
  UNIQUE KEY uniq_scene_element (scene_id, element_id),
  INDEX idx_scene (scene_id),
  INDEX idx_element (element_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='场景-元素关联';
