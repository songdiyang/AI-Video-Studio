-- 添加 video_prompt 字段到 storyboards 表
-- 用于存储分镜级别的视频生成专用提示词（与图片提示词 prompt_template 分离）
ALTER TABLE storyboards ADD COLUMN video_prompt TEXT DEFAULT NULL COMMENT '视频生成专用提示词';
