-- ============================================================
-- 角色状态表扩展 - 添加外观属性字段
-- 支持服装、年龄、发型等细粒度外观管理
-- ============================================================

-- 添加服装描述字段
ALTER TABLE character_states
  ADD COLUMN IF NOT EXISTS outfit VARCHAR(500) COMMENT '服装描述' AFTER appearance;

-- 添加年龄阶段字段
ALTER TABLE character_states
  ADD COLUMN IF NOT EXISTS age_stage VARCHAR(50) COMMENT '年龄阶段:童年/少年/青年/中年/老年' AFTER outfit;

-- 添加发型描述字段
ALTER TABLE character_states
  ADD COLUMN IF NOT EXISTS hairstyle VARCHAR(200) COMMENT '发型描述' AFTER age_stage;

-- 添加配饰描述字段（JSON格式）
ALTER TABLE character_states
  ADD COLUMN IF NOT EXISTS accessories TEXT COMMENT '配饰描述JSON' AFTER hairstyle;

-- 添加激活状态标记
ALTER TABLE character_states
  ADD COLUMN IF NOT EXISTS is_active TINYINT(1) DEFAULT 0 COMMENT '是否为当前激活状态' AFTER accessories;

-- 添加生成提示词字段
ALTER TABLE character_states
  ADD COLUMN IF NOT EXISTS generation_prompt TEXT COMMENT '生成时使用的提示词' AFTER is_active;

-- 添加生成状态字段
ALTER TABLE character_states
  ADD COLUMN IF NOT EXISTS generation_status VARCHAR(20) DEFAULT 'idle' COMMENT '生成状态:idle/generating/completed/failed' AFTER generation_prompt;

-- 添加索引优化查询
CREATE INDEX IF NOT EXISTS idx_character_states_is_active ON character_states(character_id, is_active);
