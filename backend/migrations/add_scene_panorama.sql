ALTER TABLE scenes ADD COLUMN panorama_image_url VARCHAR(1024) DEFAULT NULL COMMENT '360x180 等距柱状全景图 URL（2:1 长图，球体内壁贴图用）' AFTER reference_image_url;
