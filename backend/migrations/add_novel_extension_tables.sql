-- ============================================
-- 小说工作台扩展表结构
-- 包含：小说项目配置、人物设定、场景设定、生成历史
-- ============================================

-- 小说项目详细配置表
CREATE TABLE IF NOT EXISTS novel_projects (
  id INT AUTO_INCREMENT PRIMARY KEY,
  project_id INT NOT NULL UNIQUE,
  world_view TEXT COMMENT '世界观设定',
  plot_summary TEXT COMMENT '剧情概要',
  genre VARCHAR(100) COMMENT '小说类型',
  target_word_count INT DEFAULT 100000 COMMENT '目标字数',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 小说人物表
CREATE TABLE IF NOT EXISTS novel_characters (
  id INT AUTO_INCREMENT PRIMARY KEY,
  project_id INT NOT NULL,
  name VARCHAR(100) NOT NULL COMMENT '姓名',
  gender ENUM('male', 'female', 'other', 'unknown') DEFAULT 'unknown' COMMENT '性别',
  age INT COMMENT '年龄',
  personality TEXT COMMENT '性格特点',
  weight DECIMAL(5,2) COMMENT '体重(kg)',
  -- 外貌描述
  appearance_face TEXT COMMENT '长相描述',
  height INT COMMENT '身高(cm)',
  -- 服饰配饰（JSON存储灵活配置）
  outfit JSON COMMENT '服饰配置：{"head": "", "neck": "", "upper_body": "", "lower_body": "", "feet": ""}',
  accessories JSON COMMENT '配饰配置：{"head": "", "neck": "", "upper_body": "", "lower_body": "", "feet": ""}',
  -- 经历
  background_story TEXT COMMENT '个人经历/背景故事',
  role_type ENUM('protagonist', 'supporting', 'antagonist', 'minor') DEFAULT 'supporting' COMMENT '角色类型',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
  INDEX idx_project_id (project_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 小说场景表
CREATE TABLE IF NOT EXISTS novel_scenes (
  id INT AUTO_INCREMENT PRIMARY KEY,
  project_id INT NOT NULL,
  name VARCHAR(200) NOT NULL COMMENT '场景名称',
  location VARCHAR(300) COMMENT '地理位置',
  space_description TEXT COMMENT '空间描述',
  close_up_details JSON COMMENT '局部特写描述数组',
  history TEXT COMMENT '场景经历/历史',
  status VARCHAR(100) COMMENT '场景状态',
  importance ENUM('key', 'normal', 'minor') DEFAULT 'normal' COMMENT '重要程度',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
  INDEX idx_project_id (project_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 章节生成历史记录
CREATE TABLE IF NOT EXISTS novel_chapter_generations (
  id INT AUTO_INCREMENT PRIMARY KEY,
  chapter_id INT NOT NULL,
  project_id INT NOT NULL,
  generation_type ENUM('full', 'continuation', 'revision') DEFAULT 'full' COMMENT '生成类型',
  prompt_text TEXT COMMENT '使用的提示词',
  generated_content TEXT COMMENT '生成的内容',
  summary_for_next TEXT COMMENT '供下一章使用的剧情简述',
  model_name VARCHAR(100) COMMENT '使用的模型',
  tokens_used INT COMMENT '使用的token数',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (chapter_id) REFERENCES novel_chapters(id) ON DELETE CASCADE,
  INDEX idx_chapter_id (chapter_id),
  INDEX idx_project_id (project_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 扩展现有大纲表，添加层级结构支持
ALTER TABLE novel_outlines 
ADD COLUMN parent_id INT NULL COMMENT '父节点ID' AFTER project_id,
ADD COLUMN outline_type ENUM('main', 'character', 'plot', 'world') DEFAULT 'main' COMMENT '大纲类型' AFTER content,
ADD COLUMN sort_order INT DEFAULT 0 COMMENT '排序顺序' AFTER outline_type,
ADD FOREIGN KEY (parent_id) REFERENCES novel_outlines(id) ON DELETE CASCADE,
ADD INDEX idx_parent_id (parent_id),
ADD INDEX idx_outline_type (outline_type);

-- 扩展现有章节表，添加AI生成标记
ALTER TABLE novel_chapters
ADD COLUMN is_ai_generated TINYINT(1) DEFAULT 0 COMMENT '是否AI生成' AFTER status,
ADD COLUMN generation_id INT NULL COMMENT '关联的生成记录ID' AFTER is_ai_generated,
ADD COLUMN summary TEXT NULL COMMENT '本章剧情简述' AFTER generation_id,
ADD INDEX idx_is_ai_generated (is_ai_generated);
