-- =========================================================
-- add_environment_terrain_type.sql
-- 为环境资产添加地貌类型字段
-- 用于识别环境中的草地、沙地、溪流等自然地貌
-- =========================================================

-- 添加 terrain_type 字段到 environments 表
ALTER TABLE environments 
ADD COLUMN terrain_type VARCHAR(512) DEFAULT NULL 
COMMENT '地貌类型，逗号分隔，如：草地,溪流,森林';
