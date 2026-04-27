-- ============================================================
-- 角色/场景一对多项目绑定 + 按项目画风渲染缓存 + 当前装配槽
-- Date: 2026-04-26
-- 说明：
-- 1. 新增 character_project_bindings / scene_project_bindings 多对多绑定表
-- 2. 新增 character_state_styled_images / scene_styled_images 画风图缓存表
-- 3. 为 characters 增加当前装配字段（active_costume_state_id / active_expression_state_id）
-- 4. 回填：将既有 characters.project_id / scenes.project_id 以 owner 身份写入绑定表
-- ============================================================

-- 1. 角色-项目绑定表（多对多）
CREATE TABLE IF NOT EXISTS character_project_bindings (
  id INT AUTO_INCREMENT PRIMARY KEY,
  character_id INT NOT NULL,
  project_id INT NOT NULL,
  binding_type ENUM('owner', 'reference') DEFAULT 'reference' COMMENT 'owner=主项目可编辑, reference=引用项目只读',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_char_proj (character_id, project_id),
  KEY idx_project (project_id),
  KEY idx_character (character_id),
  CONSTRAINT fk_cpb_character FOREIGN KEY (character_id) REFERENCES characters(id) ON DELETE CASCADE,
  CONSTRAINT fk_cpb_project FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='角色-项目多对多绑定';

-- 2. 场景-项目绑定表（多对多）
CREATE TABLE IF NOT EXISTS scene_project_bindings (
  id INT AUTO_INCREMENT PRIMARY KEY,
  scene_id INT NOT NULL,
  project_id INT NOT NULL,
  binding_type ENUM('owner', 'reference') DEFAULT 'reference' COMMENT 'owner=主项目可编辑, reference=引用项目只读',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_scene_proj (scene_id, project_id),
  KEY idx_project (project_id),
  KEY idx_scene (scene_id),
  CONSTRAINT fk_spb_scene FOREIGN KEY (scene_id) REFERENCES scenes(id) ON DELETE CASCADE,
  CONSTRAINT fk_spb_project FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='场景-项目多对多绑定';

-- 3. 角色状态按项目画风的渲染缓存
CREATE TABLE IF NOT EXISTS character_state_styled_images (
  id INT AUTO_INCREMENT PRIMARY KEY,
  state_id INT NOT NULL COMMENT 'character_states.id',
  project_id INT NOT NULL,
  style_fingerprint VARCHAR(64) COMMENT 'md5(visualStylePrompt)，画风变动后失效',
  front_view_url TEXT,
  side_view_url TEXT,
  back_view_url TEXT,
  generation_status VARCHAR(20) DEFAULT 'idle' COMMENT 'idle/generating/completed/failed',
  generation_error TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_state_proj (state_id, project_id),
  KEY idx_state (state_id),
  KEY idx_project (project_id),
  CONSTRAINT fk_cssi_state FOREIGN KEY (state_id) REFERENCES character_states(id) ON DELETE CASCADE,
  CONSTRAINT fk_cssi_project FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='角色状态按项目画风渲染缓存';

-- 4. 场景按项目画风的渲染缓存
CREATE TABLE IF NOT EXISTS scene_styled_images (
  id INT AUTO_INCREMENT PRIMARY KEY,
  scene_id INT NOT NULL,
  project_id INT NOT NULL,
  style_fingerprint VARCHAR(64),
  image_url TEXT,
  reverse_image_url TEXT,
  generation_status VARCHAR(20) DEFAULT 'idle',
  generation_error TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_scene_proj (scene_id, project_id),
  KEY idx_scene (scene_id),
  KEY idx_project (project_id),
  CONSTRAINT fk_ssi_scene FOREIGN KEY (scene_id) REFERENCES scenes(id) ON DELETE CASCADE,
  CONSTRAINT fk_ssi_project FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='场景按项目画风渲染缓存';

-- 5. 回填既有数据到绑定表（以原 project_id 作为 owner）
INSERT IGNORE INTO character_project_bindings (character_id, project_id, binding_type, created_at)
SELECT id, project_id, 'owner', COALESCE(created_at, CURRENT_TIMESTAMP)
FROM characters
WHERE project_id IS NOT NULL;

INSERT IGNORE INTO scene_project_bindings (scene_id, project_id, binding_type, created_at)
SELECT id, project_id, 'owner', COALESCE(created_at, CURRENT_TIMESTAMP)
FROM scenes
WHERE project_id IS NOT NULL;
