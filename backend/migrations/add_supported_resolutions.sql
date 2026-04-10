-- 添加 supported_resolutions 字段到 ai_model_configs 表
-- 用于存储视频模型支持的分辨率列表 (如 720p, 1080p, 2k, 4k)
ALTER TABLE ai_model_configs ADD COLUMN supported_resolutions TEXT;
