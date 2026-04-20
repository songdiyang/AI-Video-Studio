-- 添加 negative_prompt 字段到 storyboards 表
-- 用于存储分镜级别的反向提示词（用户手动输入或AI优化生成）
ALTER TABLE storyboards ADD COLUMN negative_prompt TEXT DEFAULT NULL;
