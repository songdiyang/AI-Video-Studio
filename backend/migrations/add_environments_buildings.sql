-- =========================================================
-- add_environments_buildings.sql
-- 场景概念重构：environments + buildings 独立资产
-- studios 绑定 environment(1:1) 与 buildings(1:N)
-- 破坏性清理旧 storyboards/scenes 数据（用户已确认）
-- =========================================================

-- 1) environments: 环境主表（项目级复用，不跨项目）
CREATE TABLE IF NOT EXISTS environments (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL COMMENT '所属用户',
  project_id INT NOT NULL COMMENT '所属项目',
  name VARCHAR(128) NOT NULL COMMENT '环境名称，如：傍晚海边、夏日午后',
  description TEXT DEFAULT NULL COMMENT '整体氛围/描述',
  time_of_day VARCHAR(64) DEFAULT NULL COMMENT '时段：黎明/上午/正午/傍晚/夜晚/深夜',
  weather VARCHAR(64) DEFAULT NULL COMMENT '天气：晴/雨/雪/雾/多云',
  lighting VARCHAR(128) DEFAULT NULL COMMENT '光照描述：暖色夕阳侧光 / 冷色月光顶光',
  mood VARCHAR(128) DEFAULT NULL COMMENT '情绪基调',
  image_url VARCHAR(1024) DEFAULT NULL COMMENT '氛围参考图',
  generation_prompt TEXT DEFAULT NULL,
  generation_status ENUM('pending','generating','completed','failed') NOT NULL DEFAULT 'pending',
  sort_order INT DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
  INDEX idx_user_project (user_id, project_id),
  INDEX idx_status (generation_status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='环境资产库';

-- 2) buildings: 建筑主表（项目级）
CREATE TABLE IF NOT EXISTS buildings (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL COMMENT '所属用户',
  project_id INT NOT NULL COMMENT '所属项目',
  name VARCHAR(128) NOT NULL COMMENT '建筑名称，如：海边木屋、校园教学楼',
  description TEXT DEFAULT NULL COMMENT '建筑风格/材质/结构描述',
  interior_exterior ENUM('interior','exterior','both') NOT NULL DEFAULT 'exterior' COMMENT '室内/室外/兼具',
  structure_type VARCHAR(128) DEFAULT NULL COMMENT '结构类型：木屋/石塔/摩天楼/街道/森林',
  image_url VARCHAR(1024) DEFAULT NULL COMMENT '建筑结构图',
  generation_prompt TEXT DEFAULT NULL,
  generation_status ENUM('pending','generating','completed','failed') NOT NULL DEFAULT 'pending',
  sort_order INT DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
  INDEX idx_user_project (user_id, project_id),
  INDEX idx_status (generation_status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='建筑资产库';

-- 3) studios 加 environment_id 外键（1:1）
ALTER TABLE studios ADD COLUMN environment_id INT DEFAULT NULL AFTER project_id;
ALTER TABLE studios ADD INDEX idx_env (environment_id);
ALTER TABLE studios ADD CONSTRAINT fk_studios_env
  FOREIGN KEY (environment_id) REFERENCES environments(id) ON DELETE SET NULL;

-- 4) studio_building_links: 场景-建筑 1:N
CREATE TABLE IF NOT EXISTS studio_building_links (
  id INT AUTO_INCREMENT PRIMARY KEY,
  studio_id INT NOT NULL,
  building_id INT NOT NULL,
  sort_order INT DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (studio_id) REFERENCES studios(id) ON DELETE CASCADE,
  FOREIGN KEY (building_id) REFERENCES buildings(id) ON DELETE CASCADE,
  UNIQUE KEY uk_studio_building (studio_id, building_id),
  INDEX idx_studio (studio_id),
  INDEX idx_building (building_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='场景-建筑关联';

-- 5) 破坏性清理（用户已确认）
DELETE FROM storyboard_scenes;
DELETE FROM storyboards;
DELETE FROM scene_element_links;
DELETE FROM scenes;

-- 6) storyboard_scenes 加 studio_id（scene_id 允许 NULL，保留 DDL 兼容）
ALTER TABLE storyboard_scenes MODIFY COLUMN scene_id INT NULL;
ALTER TABLE storyboard_scenes ADD COLUMN studio_id INT NULL AFTER scene_id;
ALTER TABLE storyboard_scenes ADD INDEX idx_studio_id (studio_id);
ALTER TABLE storyboard_scenes ADD CONSTRAINT fk_sb_scenes_studio
  FOREIGN KEY (studio_id) REFERENCES studios(id) ON DELETE CASCADE;
