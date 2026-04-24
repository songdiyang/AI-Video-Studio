-- 为分镜表添加视频首尾帧提示词字段
-- 用于分别描述从首帧到中间帧、从中间帧到尾帧的动态过程

-- 检查并添加 video_start_prompt 字段
SET @column_exists = (
  SELECT COUNT(*) 
  FROM INFORMATION_SCHEMA.COLUMNS 
  WHERE TABLE_SCHEMA = 'nanostory' 
    AND TABLE_NAME = 'storyboards' 
    AND COLUMN_NAME = 'video_start_prompt'
);

SET @sql = IF(@column_exists = 0,
  'ALTER TABLE storyboards ADD COLUMN video_start_prompt TEXT COMMENT ''视频首帧提示词：描述从首帧到中间帧的动态过程''',
  'SELECT ''Column video_start_prompt already exists'' AS message'
);

PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- 检查并添加 video_end_prompt 字段
SET @column_exists = (
  SELECT COUNT(*) 
  FROM INFORMATION_SCHEMA.COLUMNS 
  WHERE TABLE_SCHEMA = 'nanostory' 
    AND TABLE_NAME = 'storyboards' 
    AND COLUMN_NAME = 'video_end_prompt'
);

SET @sql = IF(@column_exists = 0,
  'ALTER TABLE storyboards ADD COLUMN video_end_prompt TEXT COMMENT ''视频尾帧提示词：描述从中间帧到尾帧的动态过程''',
  'SELECT ''Column video_end_prompt already exists'' AS message'
);

PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
