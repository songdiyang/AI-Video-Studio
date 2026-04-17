-- 为帧历史版本表增加批次 ID 和视频 URL 字段
-- 支持按批次分组展示完整版本（首帧+尾帧+视频）

ALTER TABLE storyboard_frame_history 
  ADD COLUMN video_url TEXT DEFAULT NULL COMMENT '视频URL' AFTER frame_url,
  ADD COLUMN batch_id VARCHAR(36) DEFAULT NULL COMMENT '同一次生成的批次ID' AFTER video_url;

CREATE INDEX idx_batch ON storyboard_frame_history(batch_id);
