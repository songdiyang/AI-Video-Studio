-- 添加 description 字段到 storyboards 表
-- 用于存储原始分镜描述（与图片提示词 prompt_template 分离）
-- 图片提示词和视频提示词由 AI 基于分镜描述优化生成
ALTER TABLE storyboards ADD COLUMN description TEXT DEFAULT NULL COMMENT '原始分镜描述';
