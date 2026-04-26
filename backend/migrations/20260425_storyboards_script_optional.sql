-- 2026-04-25: 允许 storyboards.script_id 为 NULL，支持"自由分镜"（不绑定剧本）。
-- 说明：
--   1) 原先 storyboards.script_id 必填且 ON DELETE CASCADE，强制分镜必须归属某剧本。
--   2) 本次改造让 AI 智能分镜成为"增强"，用户可直接在空项目里自由添加分镜。
--   3) 保留项目归属（project_id），仅解耦 script 依赖。
--
-- 迁移内容：
--   - 查询并删除现有外键（不同环境约束名可能不同）
--   - 将 script_id 改为 NULL 允许
--   - 重新添加外键 FOREIGN KEY (script_id) REFERENCES scripts(id) ON DELETE SET NULL

-- 步骤 1：动态删除 storyboards 表上指向 scripts(id) 的外键
SET @fk_name := (
  SELECT CONSTRAINT_NAME
    FROM information_schema.KEY_COLUMN_USAGE
   WHERE TABLE_SCHEMA = DATABASE()
     AND TABLE_NAME = 'storyboards'
     AND COLUMN_NAME = 'script_id'
     AND REFERENCED_TABLE_NAME = 'scripts'
   LIMIT 1
);

SET @sql := IF(@fk_name IS NOT NULL,
  CONCAT('ALTER TABLE storyboards DROP FOREIGN KEY ', @fk_name),
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- 步骤 2：将 script_id 改为可空
ALTER TABLE storyboards MODIFY COLUMN script_id INT NULL;

-- 步骤 3：重新添加外键（ON DELETE SET NULL：剧本被删后分镜变为"自由分镜"，不再连带删除）
ALTER TABLE storyboards
  ADD CONSTRAINT storyboards_ibfk_script
  FOREIGN KEY (script_id) REFERENCES scripts(id) ON DELETE SET NULL;
