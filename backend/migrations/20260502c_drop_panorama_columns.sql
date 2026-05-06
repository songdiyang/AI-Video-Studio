-- 迁移：移除全景图字段（环境全景 + 场景全景系统已整体下线）
-- 影响列：
--   environments.panorama_image_url
--   environment_variants.panorama_image_url
--   scenes.panorama_image_url
ALTER TABLE environments DROP COLUMN panorama_image_url;
ALTER TABLE environment_variants DROP COLUMN panorama_image_url;
ALTER TABLE scenes DROP COLUMN panorama_image_url;
