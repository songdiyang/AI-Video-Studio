-- ============================================================
-- 角色状态分类标签功能迁移
-- 添加状态分类和自由标签字段，支持白膜状态调整功能
-- ============================================================

-- 添加状态分类字段
-- daily: 日常状态, costume: 服装变化, time: 时间相关, effect: 效果状态
ALTER TABLE character_states
  ADD COLUMN IF NOT EXISTS state_category VARCHAR(50) DEFAULT 'daily' COMMENT '状态分类:daily/costume/time/effect' AFTER is_active;

-- 添加自由标签字段（JSON数组格式，如 ["受伤","中毒","加速"]）
ALTER TABLE character_states
  ADD COLUMN IF NOT EXISTS tags TEXT COMMENT '状态标签JSON数组' AFTER state_category;

-- 添加分类索引优化查询
CREATE INDEX IF NOT EXISTS idx_character_states_category ON character_states(character_id, state_category);
