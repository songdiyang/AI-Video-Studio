-- 导演学高级参数增强
-- 新增蒙太奇类型和主观视角角色字段

ALTER TABLE storyboards
ADD COLUMN IF NOT EXISTS montage_type VARCHAR(32) DEFAULT NULL COMMENT '蒙太奇类型：narrative=叙事, expressive=表现, cross_cutting=交叉, metaphorical=隐喻, accumulative=积累',
ADD COLUMN IF NOT EXISTS pov_character VARCHAR(128) DEFAULT NULL COMMENT '主观视角角色名（当camera_height=pov时生效）';
