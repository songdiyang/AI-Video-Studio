-- 统一剧本存储层改造：scripts 表扩展
-- 为自由分镜模式引入隐式剧本概念
-- 执行前请确保已备份数据库

-- 1. 添加 source_type 字段（剧本来源类型）
ALTER TABLE scripts
  ADD COLUMN source_type ENUM(
    'ai_generated',      -- AI 直接生成
    'manual_upload',     -- 人工上传文件
    'manual_create',     -- 人工手动创建
    'implicit'           -- 自由分镜自动创建的隐式剧本
  ) DEFAULT 'manual_create' COMMENT '剧本来源类型' AFTER status;

-- 2. 添加 raw_content 字段（原始上传内容保留）
ALTER TABLE scripts
  ADD COLUMN raw_content TEXT COMMENT '原始上传内容（人工上传时保留原样）' AFTER content;

-- 3. 添加 is_implicit 字段（隐式剧本标记）
ALTER TABLE scripts
  ADD COLUMN is_implicit BOOLEAN DEFAULT FALSE COMMENT '是否为隐式剧本（自由分镜自动生成）' AFTER raw_content;

-- 4. 为隐式剧本查询添加索引
CREATE INDEX idx_scripts_implicit ON scripts (project_id, episode_number, is_implicit);

-- 5. 为剧本库查询添加索引（排除隐式剧本时使用）
CREATE INDEX idx_scripts_source_type ON scripts (source_type, is_implicit);
