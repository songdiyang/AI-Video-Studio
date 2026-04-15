-- ============================================================
-- 资产参考图启用/禁用功能迁移
-- 添加 is_enabled 字段用于控制参考图是否参与AI生成
-- ============================================================

-- 1. 为 asset_reference_images 表添加 is_enabled 字段
ALTER TABLE asset_reference_images
ADD COLUMN IF NOT EXISTS is_enabled BOOLEAN DEFAULT TRUE COMMENT '是否启用该参考图参与AI生成';

-- 2. 为 characters 表添加 use_reference_images 字段（角色级别控制）
ALTER TABLE characters
ADD COLUMN IF NOT EXISTS use_reference_images BOOLEAN DEFAULT TRUE COMMENT '是否使用参考图进行三视图生成';

-- 3. 为 character_states 表添加 use_reference_images 字段（状态级别控制）
ALTER TABLE character_states
ADD COLUMN IF NOT EXISTS use_reference_images BOOLEAN DEFAULT TRUE COMMENT '是否使用参考图进行状态图片生成';

-- 4. 创建索引优化查询
CREATE INDEX IF NOT EXISTS idx_reference_images_enabled ON asset_reference_images (asset_type, asset_id, is_enabled);
