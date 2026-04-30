-- =========================================================
-- add_studio_states_and_props.sql
-- T8: 场景状态 + 场景道具资源化
--   1) studio_states：场景的时间/天气/光照/氛围快照（对齐 character_states）
--   2) studio_prop_links：场景↔可交互道具多对多
--   3) storyboard_scenes 新增 studio_state_id，分镜绑定到具体状态
-- 破坏性：清空 storyboards/storyboard_scenes（无历史数据有效）
-- =========================================================

-- 1) studio_states: 场景状态快照
CREATE TABLE IF NOT EXISTS studio_states (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL COMMENT '所属用户',
  project_id INT NOT NULL COMMENT '所属项目',
  studio_id INT NOT NULL COMMENT '所属场景',
  name VARCHAR(128) NOT NULL COMMENT '状态名：小明家·雨夜、码头·黄昏',
  description TEXT DEFAULT NULL COMMENT '状态整体描述',
  time_of_day VARCHAR(64) DEFAULT NULL COMMENT '时段：黎明/上午/正午/傍晚/夜晚/深夜',
  weather VARCHAR(64) DEFAULT NULL COMMENT '天气：晴/雨/雪/雾/多云',
  lighting VARCHAR(128) DEFAULT NULL COMMENT '光照描述：暖色夕阳侧光 / 冷色月光顶光',
  mood VARCHAR(128) DEFAULT NULL COMMENT '情绪基调',
  image_url VARCHAR(1024) DEFAULT NULL COMMENT '状态全景图（分镜参考）',
  generation_prompt TEXT DEFAULT NULL,
  generation_status ENUM('pending','generating','completed','failed') NOT NULL DEFAULT 'pending',
  sort_order INT DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
  FOREIGN KEY (studio_id) REFERENCES studios(id) ON DELETE CASCADE,
  INDEX idx_user_project (user_id, project_id),
  INDEX idx_studio (studio_id),
  INDEX idx_status (generation_status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='场景状态快照';

-- 2) studio_prop_links: 场景-可交互道具 M:N
CREATE TABLE IF NOT EXISTS studio_prop_links (
  id INT AUTO_INCREMENT PRIMARY KEY,
  studio_id INT NOT NULL,
  prop_id INT NOT NULL,
  position_hint VARCHAR(128) DEFAULT NULL COMMENT '空间位置提示',
  sort_order INT DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (studio_id) REFERENCES studios(id) ON DELETE CASCADE,
  FOREIGN KEY (prop_id) REFERENCES props(id) ON DELETE CASCADE,
  UNIQUE KEY uk_studio_prop (studio_id, prop_id),
  INDEX idx_studio (studio_id),
  INDEX idx_prop (prop_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='场景-可交互道具关联';

-- 3) storyboard_scenes 加 studio_state_id
ALTER TABLE storyboard_scenes ADD COLUMN studio_state_id INT NULL AFTER studio_id;
ALTER TABLE storyboard_scenes ADD INDEX idx_studio_state (studio_state_id);
ALTER TABLE storyboard_scenes ADD CONSTRAINT fk_sb_scenes_studio_state
  FOREIGN KEY (studio_state_id) REFERENCES studio_states(id) ON DELETE SET NULL;

-- 4) 破坏性清理（T8 重构）
DELETE FROM storyboard_scenes;
DELETE FROM storyboards;
