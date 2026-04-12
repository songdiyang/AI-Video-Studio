-- 为角色表添加概念分解图独立的生成状态字段
ALTER TABLE characters
  ADD COLUMN concept_generation_status VARCHAR(20) DEFAULT NULL COMMENT '概念分解图生成状态';

-- 如果 concept_image_url 列不存在则添加
-- ALTER TABLE characters ADD COLUMN concept_image_url TEXT COMMENT '概念分解图URL';
