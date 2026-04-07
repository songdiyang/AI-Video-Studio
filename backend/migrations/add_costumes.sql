-- ============================================================
-- 服装资源系统迁移
-- ============================================================

-- 1. 服装资源表
-- 存储项目级的服装资源，可被任意角色使用
CREATE TABLE IF NOT EXISTS costumes (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  project_id INT NOT NULL COMMENT '所属项目ID',
  name VARCHAR(255) NOT NULL COMMENT '服装名称',
  description TEXT COMMENT '服装描述',
  category VARCHAR(100) COMMENT '服装分类：日常、战斗、礼服等',
  gender ENUM('male', 'female', 'unisex') DEFAULT 'unisex' COMMENT '适用性别',
  outfit_prompt TEXT COMMENT '服装的AI生成提示词',
  image_url TEXT COMMENT '服装预览图URL',
  front_view_url TEXT COMMENT '正面视图URL',
  side_view_url TEXT COMMENT '侧面视图URL',
  back_view_url TEXT COMMENT '背面视图URL',
  tags TEXT COMMENT '标签（逗号分隔）',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
  INDEX idx_user_id (user_id),
  INDEX idx_project_id (project_id),
  INDEX idx_category (category),
  INDEX idx_gender (gender)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='服装资源表';

-- 2. 角色-服装关联表
-- 记录角色拥有的服装及其穿戴状态
CREATE TABLE IF NOT EXISTS character_costumes (
  id INT AUTO_INCREMENT PRIMARY KEY,
  character_id INT NOT NULL COMMENT '角色ID',
  costume_id INT NOT NULL COMMENT '服装ID',
  is_equipped TINYINT(1) DEFAULT 0 COMMENT '是否当前穿戴',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (character_id) REFERENCES characters(id) ON DELETE CASCADE,
  FOREIGN KEY (costume_id) REFERENCES costumes(id) ON DELETE CASCADE,
  UNIQUE KEY uk_character_costume (character_id, costume_id),
  INDEX idx_character_id (character_id),
  INDEX idx_costume_id (costume_id),
  INDEX idx_is_equipped (is_equipped)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='角色-服装关联表';

-- 3. 为角色状态表增加白膜和服装相关字段
ALTER TABLE character_states 
ADD COLUMN IF NOT EXISTS is_base_model TINYINT(1) DEFAULT 0 COMMENT '是否为基础白膜状态' AFTER character_id,
ADD COLUMN IF NOT EXISTS costume_id INT DEFAULT NULL COMMENT '关联的服装ID' AFTER is_base_model,
ADD COLUMN IF NOT EXISTS gender ENUM('male', 'female', 'unknown') DEFAULT 'unknown' COMMENT '性别' AFTER costume_id;

-- 添加服装外键约束（如果不存在）
-- 注意：MySQL不支持 IF NOT EXISTS 用于外键，需要手动检查
-- ALTER TABLE character_states ADD CONSTRAINT fk_state_costume 
-- FOREIGN KEY (costume_id) REFERENCES costumes(id) ON DELETE SET NULL;

-- 为角色表增加性别字段（用于白膜生成）
ALTER TABLE characters 
ADD COLUMN IF NOT EXISTS gender ENUM('male', 'female', 'unknown') DEFAULT 'unknown' COMMENT '性别（用于白膜生成）' AFTER personality;

-- 为角色状态表创建索引
CREATE INDEX IF NOT EXISTS idx_is_base_model ON character_states(is_base_model);
CREATE INDEX IF NOT EXISTS idx_state_costume_id ON character_states(costume_id);
CREATE INDEX IF NOT EXISTS idx_state_gender ON character_states(gender);

-- 为角色表创建索引
CREATE INDEX IF NOT EXISTS idx_character_gender ON characters(gender);
