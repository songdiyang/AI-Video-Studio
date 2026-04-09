-- 摄像机与打光参数迁移
-- 为 storyboards 表添加专业摄像机和打光效果字段

ALTER TABLE storyboards 
  ADD COLUMN IF NOT EXISTS focal_length VARCHAR(32) DEFAULT NULL COMMENT '焦距类型：ultra_wide=超广角(14-24mm), wide=广角(24-35mm), standard=标准(35-50mm), portrait=人像(85-135mm), telephoto=长焦(200mm+), macro=微距',
  ADD COLUMN IF NOT EXISTS focal_length_mm SMALLINT DEFAULT NULL COMMENT '具体焦距mm值（如24, 35, 50, 85, 135, 200）',
  ADD COLUMN IF NOT EXISTS camera_distance VARCHAR(32) DEFAULT NULL COMMENT '摄像机距离：extreme_close=极近, close=近距, medium=中距, far=远距, extreme_far=极远',
  ADD COLUMN IF NOT EXISTS lighting_direction VARCHAR(32) DEFAULT NULL COMMENT '光线方向：front=正面光, side=侧面光, back=背光, top=顶光, bottom=底光, rim=轮廓光, three_point=三点布光, natural=自然光',
  ADD COLUMN IF NOT EXISTS lighting_quality VARCHAR(32) DEFAULT NULL COMMENT '光线质量：hard=硬光, soft=软光, diffused=散射光, specular=镜面反射光, ambient=环境光, dappled=斑驳光',
  ADD COLUMN IF NOT EXISTS lighting_color VARCHAR(32) DEFAULT NULL COMMENT '光线色温：warm=暖色调, cool=冷色调, neutral=中性, golden_hour=黄金时段, blue_hour=蓝调时刻, moonlight=月光, neon=霓虹, mixed=混合',
  ADD COLUMN IF NOT EXISTS lighting_intensity VARCHAR(32) DEFAULT NULL COMMENT '光线对比度：high_key=高调, low_key=低调, high_contrast=高对比, low_contrast=低对比, silhouette=剪影',
  ADD COLUMN IF NOT EXISTS lighting_source VARCHAR(32) DEFAULT NULL COMMENT '光源类型：natural_daylight=自然日光, overcast=阴天, golden_hour=黄金时段, blue_hour=蓝调, moonlight=月光, led=LED灯, spotlight=聚光灯, softbox=柔光箱, practical=实用光源, mixed=混合';

-- 为现有数据做迁移：从旧 lens_type 字段推断新 focal_length
UPDATE storyboards SET focal_length = 'wide', focal_length_mm = 28 WHERE lens_type = 'wide' AND focal_length IS NULL;
UPDATE storyboards SET focal_length = 'standard', focal_length_mm = 50 WHERE lens_type = 'standard' AND focal_length IS NULL;
UPDATE storyboards SET focal_length = 'telephoto', focal_length_mm = 200 WHERE lens_type = 'telephoto' AND focal_length IS NULL;
UPDATE storyboards SET focal_length = 'macro', focal_length_mm = 100 WHERE lens_type = 'macro' AND focal_length IS NULL;
UPDATE storyboards SET focal_length = 'ultra_wide', focal_length_mm = 18 WHERE lens_type = 'fisheye' AND focal_length IS NULL;

-- 为现有数据做迁移：从旧 lighting_mood 字段推断新 lighting_intensity
UPDATE storyboards SET lighting_intensity = 'high_key' WHERE lighting_mood = 'high_key' AND lighting_intensity IS NULL;
UPDATE storyboards SET lighting_intensity = 'low_key' WHERE lighting_mood = 'low_key' AND lighting_intensity IS NULL;
UPDATE storyboards SET lighting_intensity = 'high_contrast' WHERE lighting_mood = 'chiaroscuro' AND lighting_intensity IS NULL;
UPDATE storyboards SET lighting_intensity = 'silhouette' WHERE lighting_mood = 'silhouette' AND lighting_intensity IS NULL;
UPDATE storyboards SET lighting_intensity = 'low_key' WHERE lighting_mood = 'backlit' AND lighting_intensity IS NULL;
