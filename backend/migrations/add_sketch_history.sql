-- 草图版本历史迁移脚本
-- 添加草图版本号字段和历史记录表

-- 1. 添加草图版本号字段到 storyboards 表
ALTER TABLE storyboards 
ADD COLUMN IF NOT EXISTS sketch_version INT DEFAULT 1 COMMENT '草图版本号';

-- 2. 创建草图历史记录表
CREATE TABLE IF NOT EXISTS sketch_history (
  id INT AUTO_INCREMENT PRIMARY KEY,
  storyboard_id INT NOT NULL COMMENT '关联的分镜ID',
  version INT NOT NULL DEFAULT 1 COMMENT '版本号',
  sketch_url TEXT COMMENT '草图文件URL',
  sketch_type VARCHAR(32) COMMENT '草图类型：stick_figure/storyboard_sketch/detailed_lineart',
  sketch_data JSON COMMENT 'Excalidraw矢量数据',
  control_strength DECIMAL(3,2) DEFAULT 0.85 COMMENT 'ControlNet控制强度(0.00-1.00)',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  
  INDEX idx_sketch_history_storyboard (storyboard_id),
  INDEX idx_sketch_history_version (storyboard_id, version),
  
  FOREIGN KEY (storyboard_id) REFERENCES storyboards(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='草图版本历史记录表';

-- 3. 为 storyboards 表添加草图查询优化索引
-- 注意：TEXT 类型需要指定前缀长度
CREATE INDEX idx_storyboards_sketch_url ON storyboards(sketch_url(255));
CREATE INDEX idx_storyboards_sketch_type ON storyboards(sketch_type);
