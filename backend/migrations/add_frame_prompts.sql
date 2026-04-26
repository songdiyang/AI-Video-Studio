-- 为分镜表添加图片首帧/尾帧独立提示词字段
-- 目的：
--   1. 图片提示词从「综合版 prompt_template」拆分为「首帧提示词 + 尾帧提示词」
--   2. 让尾帧提示词独立于尾帧图片存在：删除尾帧图不会丢失尾帧提示词
--   3. 彻底隔离视频提示词与图片提示词

-- 检查并添加 first_frame_prompt 字段
SET @column_exists = (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'storyboards'
    AND COLUMN_NAME = 'first_frame_prompt'
);

SET @sql = IF(@column_exists = 0,
  'ALTER TABLE storyboards ADD COLUMN first_frame_prompt TEXT COMMENT ''图片首帧提示词：用于生成首帧图片''',
  'SELECT ''Column first_frame_prompt already exists'' AS message'
);

PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- 检查并添加 last_frame_prompt 字段
SET @column_exists = (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'storyboards'
    AND COLUMN_NAME = 'last_frame_prompt'
);

SET @sql = IF(@column_exists = 0,
  'ALTER TABLE storyboards ADD COLUMN last_frame_prompt TEXT COMMENT ''图片尾帧提示词：用于生成尾帧图片，独立于尾帧图存在''',
  'SELECT ''Column last_frame_prompt already exists'' AS message'
);

PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
