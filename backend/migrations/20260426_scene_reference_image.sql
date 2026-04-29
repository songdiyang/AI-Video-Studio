-- 场景参考图字段：用户可上传一张参考图，在场景图片生成时作为风格/构图参考
ALTER TABLE scenes ADD COLUMN reference_image_url VARCHAR(1024) DEFAULT NULL AFTER sketch_url;
