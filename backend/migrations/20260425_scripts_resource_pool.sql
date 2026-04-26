-- 2026-04-25: 剧本资源化改造
-- ────────────────────────────────────────────────────────────────
-- 背景：
--   原模型：scripts 必填 project_id，且 (project_id, episode_number) 联合唯一，
--           导致剧本严格隶属某项目，无法作为独立"资源"跨项目使用。
--
--   新模型：剧本升级为独立资源，可以：
--     - 作为"个人剧本"存在（project_id = NULL，只在资源库可见）
--     - 作为"项目剧本"存在（project_id = X，团队协作可见）
--     - 通过 bind 接口从个人剧本深拷贝到项目（副本 source_script_id 指向原始）
--
-- 迁移内容：
--   1) 删除 (project_id, episode_number) 联合唯一约束
--   2) project_id 改为可空（NULL = 个人剧本池）
--   3) 外键改为 ON DELETE SET NULL（项目删除不再连带删除剧本）
--   4) 新增 source_script_id 记录副本血缘

-- 步骤 1：删除 (project_id, episode_number) 联合唯一约束（如果存在）
SET @idx_exists := (
  SELECT COUNT(*)
    FROM information_schema.STATISTICS
   WHERE TABLE_SCHEMA = DATABASE()
     AND TABLE_NAME = 'scripts'
     AND INDEX_NAME = 'uk_project_episode'
);

SET @sql := IF(@idx_exists > 0,
  'ALTER TABLE scripts DROP INDEX uk_project_episode',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- 步骤 2：动态删除 scripts 表上指向 projects(id) 的外键（不同环境名称可能不同）
SET @fk_name := (
  SELECT CONSTRAINT_NAME
    FROM information_schema.KEY_COLUMN_USAGE
   WHERE TABLE_SCHEMA = DATABASE()
     AND TABLE_NAME = 'scripts'
     AND COLUMN_NAME = 'project_id'
     AND REFERENCED_TABLE_NAME = 'projects'
   LIMIT 1
);

SET @sql := IF(@fk_name IS NOT NULL,
  CONCAT('ALTER TABLE scripts DROP FOREIGN KEY ', @fk_name),
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- 步骤 3：project_id 改为可空
ALTER TABLE scripts MODIFY COLUMN project_id INT NULL COMMENT '所属项目ID（NULL = 个人剧本池）';

-- 步骤 4：重新添加外键（ON DELETE SET NULL：项目删除后剧本降级为"个人剧本"）
ALTER TABLE scripts
  ADD CONSTRAINT scripts_ibfk_project
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE SET NULL;

-- 步骤 5：新增 source_script_id 字段（记录副本血缘，仅原作者可见）
SET @col_exists := (
  SELECT COUNT(*)
    FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE()
     AND TABLE_NAME = 'scripts'
     AND COLUMN_NAME = 'source_script_id'
);

SET @sql := IF(@col_exists = 0,
  'ALTER TABLE scripts ADD COLUMN source_script_id INT NULL COMMENT ''副本的原始剧本ID（绑定到项目时深拷贝留痕）'' AFTER project_id',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- 步骤 6：为 source_script_id 添加外键（原始剧本被删除时副本的 source_script_id 变 NULL）
SET @src_fk_exists := (
  SELECT COUNT(*)
    FROM information_schema.KEY_COLUMN_USAGE
   WHERE TABLE_SCHEMA = DATABASE()
     AND TABLE_NAME = 'scripts'
     AND COLUMN_NAME = 'source_script_id'
     AND REFERENCED_TABLE_NAME = 'scripts'
);

SET @sql := IF(@src_fk_exists = 0,
  'ALTER TABLE scripts ADD CONSTRAINT scripts_ibfk_source FOREIGN KEY (source_script_id) REFERENCES scripts(id) ON DELETE SET NULL',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- 步骤 7：为 source_script_id 加索引（查询副本血缘时使用）
SET @src_idx_exists := (
  SELECT COUNT(*)
    FROM information_schema.STATISTICS
   WHERE TABLE_SCHEMA = DATABASE()
     AND TABLE_NAME = 'scripts'
     AND INDEX_NAME = 'idx_source_script_id'
);

SET @sql := IF(@src_idx_exists = 0,
  'ALTER TABLE scripts ADD INDEX idx_source_script_id (source_script_id)',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
