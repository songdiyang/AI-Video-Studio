-- 为 storyboards 表添加动作分析相关字段
-- 用于智能判断分镜的动作类型和视频生成策略

-- 添加 action_level 字段（动作级别）
ALTER TABLE storyboards 
ADD COLUMN action_level VARCHAR(20) DEFAULT 'medium' 
COMMENT '动作级别：empty_shot(空镜头), large(大幅度), medium(中幅度), small(小幅度)';

-- 添加 video_strategy 字段（视频生成策略）
ALTER TABLE storyboards 
ADD COLUMN video_strategy VARCHAR(30) DEFAULT 'freeMotion' 
COMMENT '视频生成策略：singlePrompt(统一提示词), freeMotion(自由运动), strongConstraint(强约束)';

-- 添加 use_end_frame 字段（是否使用尾帧）
ALTER TABLE storyboards 
ADD COLUMN use_end_frame TINYINT(1) DEFAULT 0 
COMMENT '是否使用尾帧：0=不需要尾帧, 1=需要尾帧';

-- 添加 action_analysis_reason 字段（分析原因）
ALTER TABLE storyboards 
ADD COLUMN action_analysis_reason TEXT 
COMMENT 'AI动作分析原因说明';

-- 添加索引优化查询性能
CREATE INDEX idx_action_level ON storyboards(action_level);
CREATE INDEX idx_video_strategy ON storyboards(video_strategy);
CREATE INDEX idx_use_end_frame ON storyboards(use_end_frame);
