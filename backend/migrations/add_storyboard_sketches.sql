-- 分镜首尾帧草图功能迁移脚本
-- 添加首帧草图和尾帧草图相关字段，以及草图历史表

-- ============================================
-- 1. 修改 storyboards 表结构
-- ============================================

-- 首帧草图相关字段
ALTER TABLE storyboards 
ADD COLUMN first_sketch_data JSON DEFAULT NULL COMMENT '首帧草图数据（Excalidraw JSON 格式）',
ADD COLUMN first_sketch_version INT DEFAULT 0 COMMENT '首帧草图版本号',
ADD COLUMN first_sketch_updated_at DATETIME DEFAULT NULL COMMENT '首帧草图更新时间';

-- 尾帧草图相关字段  
ALTER TABLE storyboards
ADD COLUMN last_sketch_data JSON DEFAULT NULL COMMENT '尾帧草图数据（Excalidraw JSON 格式）',
ADD COLUMN last_sketch_version INT DEFAULT 0 COMMENT '尾帧草图版本号',
ADD COLUMN last_sketch_updated_at DATETIME DEFAULT NULL COMMENT '尾帧草图更新时间';

-- ============================================
-- 2. 创建草图历史表
-- ============================================

CREATE TABLE IF NOT EXISTS storyboard_sketch_history (
  id INT AUTO_INCREMENT PRIMARY KEY,
  storyboard_id INT NOT NULL COMMENT '分镜ID',
  frame_type ENUM('first', 'last') NOT NULL COMMENT '帧类型：first=首帧, last=尾帧',
  version INT NOT NULL COMMENT '版本号',
  sketch_data JSON NOT NULL COMMENT '草图数据（Excalidraw JSON）',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  FOREIGN KEY (storyboard_id) REFERENCES storyboards(id) ON DELETE CASCADE,
  INDEX idx_storyboard_frame (storyboard_id, frame_type),
  INDEX idx_version (version)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT '分镜草图历史版本表';
