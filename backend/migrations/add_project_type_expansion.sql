-- ==============================================
-- 项目类型扩展迁移脚本
-- 将现有的 video/comic 类型扩展为更细分的项目类型
-- 新类型：comic_drama(漫剧), manga(漫画), short_video(短视频), novel(小说)
-- ==============================================

-- 1. 修改 projects 表的 type 字段注释，说明新的类型值
ALTER TABLE projects 
MODIFY COLUMN type VARCHAR(50) DEFAULT 'comic_drama' 
COMMENT '项目类型：comic_drama=漫剧, manga=漫画, short_video=短视频, novel=小说';

-- 2. 数据迁移：将现有的 video 类型映射为 short_video
UPDATE projects SET type = 'short_video' WHERE type = 'video';

-- 3. 数据迁移：将现有的 comic 类型映射为 comic_drama（保持漫剧作为默认）
UPDATE projects SET type = 'comic_drama' WHERE type = 'comic';

-- 4. 更新索引（如果需要优化查询性能）
-- 索引已经在原表上存在，无需重建

-- 5. 添加项目类型配置表（可选，用于存储每种类型的工作台配置）
CREATE TABLE IF NOT EXISTS project_type_configs (
  id INT AUTO_INCREMENT PRIMARY KEY,
  type_code VARCHAR(50) NOT NULL UNIQUE COMMENT '类型代码：comic_drama, manga, short_video, novel',
  type_name VARCHAR(100) NOT NULL COMMENT '类型名称',
  type_name_en VARCHAR(100) NOT NULL COMMENT '类型英文名称',
  description TEXT COMMENT '类型描述',
  icon VARCHAR(50) DEFAULT NULL COMMENT '图标名称',
  color VARCHAR(100) DEFAULT NULL COMMENT '主题色渐变',
  workbench_tabs JSON NOT NULL COMMENT '工作台标签页配置',
  is_active BOOLEAN DEFAULT TRUE COMMENT '是否启用',
  sort_order INT DEFAULT 0 COMMENT '排序顺序',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_type_code (type_code),
  INDEX idx_is_active (is_active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 6. 插入默认的项目类型配置
INSERT INTO project_type_configs (type_code, type_name, type_name_en, description, icon, color, workbench_tabs, sort_order) VALUES
(
  'comic_drama',
  '漫剧',
  'Comic Drama',
  '基于剧本创作分镜动画的项目类型，适合制作动态漫画、有声漫画等',
  'Film',
  'from-violet-500 to-purple-600',
  '[{"key":"script","label":"剧本生成","icon":"FileText"},{"key":"storyboard","label":"分镜设计","icon":"Film"},{"key":"composition","label":"视频合成","icon":"Clapperboard"}]',
  1
),
(
  'manga',
  '漫画',
  'Manga',
  '传统漫画/条漫创作项目类型，支持分页布局和绘图工具',
  'BookImage',
  'from-orange-500 to-red-600',
  '[{"key":"script","label":"剧本/脚本","icon":"FileText"},{"key":"layout","label":"页面布局","icon":"LayoutGrid"},{"key":"drawing","label":"绘图工具","icon":"Paintbrush"}]',
  2
),
(
  'short_video',
  '短视频',
  'Short Video',
  '短视频创作项目类型，专注于视频剪辑和特效制作',
  'Video',
  'from-cyan-500 to-blue-600',
  '[{"key":"script","label":"视频脚本","icon":"FileText"},{"key":"timeline","label":"时间轴编辑","icon":"Clock"},{"key":"effects","label":"特效添加","icon":"Sparkles"}]',
  3
),
(
  'novel',
  '小说',
  'Novel',
  '小说/网文创作项目类型，提供大纲规划和章节管理功能',
  'BookOpen',
  'from-emerald-500 to-teal-600',
  '[{"key":"outline","label":"大纲规划","icon":"Network"},{"key":"chapters","label":"章节管理","icon":"List"},{"key":"editor","label":"文本编辑","icon":"PenTool"}]',
  4
)
ON DUPLICATE KEY UPDATE
  type_name = VALUES(type_name),
  type_name_en = VALUES(type_name_en),
  description = VALUES(description),
  icon = VALUES(icon),
  color = VALUES(color),
  workbench_tabs = VALUES(workbench_tabs),
  sort_order = VALUES(sort_order);

-- 7. 为小说类型创建章节表
CREATE TABLE IF NOT EXISTS novel_chapters (
  id INT AUTO_INCREMENT PRIMARY KEY,
  project_id INT NOT NULL COMMENT '所属项目ID',
  user_id INT NOT NULL COMMENT '用户ID',
  chapter_number INT NOT NULL COMMENT '章节序号',
  title VARCHAR(255) NOT NULL COMMENT '章节标题',
  content LONGTEXT COMMENT '章节内容',
  word_count INT DEFAULT 0 COMMENT '字数统计',
  status ENUM('draft', 'completed', 'published') DEFAULT 'draft' COMMENT '章节状态',
  notes TEXT COMMENT '章节备注',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  UNIQUE KEY uk_project_chapter (project_id, chapter_number),
  INDEX idx_project_id (project_id),
  INDEX idx_user_id (user_id),
  INDEX idx_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 8. 为小说类型创建大纲表
CREATE TABLE IF NOT EXISTS novel_outlines (
  id INT AUTO_INCREMENT PRIMARY KEY,
  project_id INT NOT NULL COMMENT '所属项目ID',
  user_id INT NOT NULL COMMENT '用户ID',
  outline_type ENUM('main', 'character', 'plot', 'world') DEFAULT 'main' COMMENT '大纲类型：main=主线, character=角色线, plot=情节点, world=世界观',
  title VARCHAR(255) NOT NULL COMMENT '大纲标题',
  content TEXT COMMENT '大纲内容',
  parent_id INT DEFAULT NULL COMMENT '父级大纲ID（用于嵌套结构）',
  sort_order INT DEFAULT 0 COMMENT '排序顺序',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (parent_id) REFERENCES novel_outlines(id) ON DELETE SET NULL,
  INDEX idx_project_id (project_id),
  INDEX idx_user_id (user_id),
  INDEX idx_parent_id (parent_id),
  INDEX idx_outline_type (outline_type)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 9. 为漫画类型创建页面表
CREATE TABLE IF NOT EXISTS manga_pages (
  id INT AUTO_INCREMENT PRIMARY KEY,
  project_id INT NOT NULL COMMENT '所属项目ID',
  user_id INT NOT NULL COMMENT '用户ID',
  episode_number INT DEFAULT 1 COMMENT '话数/集数',
  page_number INT NOT NULL COMMENT '页码',
  layout_type VARCHAR(50) DEFAULT 'single' COMMENT '布局类型：single=单格, grid_2x2=四格, vertical=竖条, custom=自定义',
  layout_data JSON COMMENT '布局数据（分格位置、大小等）',
  image_url TEXT COMMENT '页面图片URL',
  thumbnail_url TEXT COMMENT '缩略图URL',
  panels_data JSON COMMENT '分格内容数据',
  status ENUM('draft', 'sketch', 'lineart', 'colored', 'completed') DEFAULT 'draft' COMMENT '页面状态',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  UNIQUE KEY uk_project_episode_page (project_id, episode_number, page_number),
  INDEX idx_project_id (project_id),
  INDEX idx_user_id (user_id),
  INDEX idx_episode_number (episode_number),
  INDEX idx_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 10. 为短视频创建特效配置表
CREATE TABLE IF NOT EXISTS video_effects (
  id INT AUTO_INCREMENT PRIMARY KEY,
  project_id INT NOT NULL COMMENT '所属项目ID',
  user_id INT NOT NULL COMMENT '用户ID',
  effect_type ENUM('transition', 'filter', 'sticker', 'text_overlay') NOT NULL COMMENT '特效类型',
  effect_name VARCHAR(100) NOT NULL COMMENT '特效名称',
  effect_config JSON NOT NULL COMMENT '特效配置参数',
  start_time DECIMAL(10, 3) DEFAULT NULL COMMENT '开始时间（秒）',
  end_time DECIMAL(10, 3) DEFAULT NULL COMMENT '结束时间（秒）',
  layer_order INT DEFAULT 0 COMMENT '图层顺序',
  is_active BOOLEAN DEFAULT TRUE COMMENT '是否启用',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_project_id (project_id),
  INDEX idx_user_id (user_id),
  INDEX idx_effect_type (effect_type)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
