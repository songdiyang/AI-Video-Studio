-- 分镜帧历史版本表
-- 用于存储首尾帧的历史版本，支持版本回溯和对比

CREATE TABLE IF NOT EXISTS storyboard_frame_history (
  id INT AUTO_INCREMENT PRIMARY KEY,
  storyboard_id INT NOT NULL COMMENT '分镜 ID',
  frame_type ENUM('first', 'last') NOT NULL COMMENT '帧类型：first=首帧，last=尾帧',
  frame_url TEXT NOT NULL COMMENT '帧图片 URL',
  generation_prompt TEXT COMMENT '生成提示词',
  generation_params JSON COMMENT '生成参数（模型、分辨率等）',
  version_number INT NOT NULL COMMENT '版本号（从 1 开始递增）',
  is_current BOOLEAN DEFAULT FALSE COMMENT '是否为当前使用的版本',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  created_by INT DEFAULT NULL COMMENT '创建者用户 ID',
  FOREIGN KEY (storyboard_id) REFERENCES storyboards(id) ON DELETE CASCADE,
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL,
  INDEX idx_storyboard_frame (storyboard_id, frame_type),
  INDEX idx_version (storyboard_id, frame_type, version_number),
  INDEX idx_current (storyboard_id, frame_type, is_current)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='分镜帧历史版本表';

-- 为现有分镜的首尾帧创建初始历史记录（如果表已存在数据则跳过）
-- 注意：这个初始化脚本需要在应用层调用，而不是在 migration 中执行
-- 因为 migration 不应该依赖现有数据
