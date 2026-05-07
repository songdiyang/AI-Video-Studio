-- ============================================================
-- AI 模型架构重构：创建新的精简模型表
-- Phase 1: 模型目录层
-- ============================================================

-- 1. 创建新的 ai_models_v2 表
CREATE TABLE IF NOT EXISTS ai_models_v2 (
  id INT AUTO_INCREMENT PRIMARY KEY,
  
  -- 基础标识
  name VARCHAR(255) NOT NULL COMMENT '模型显示名称，如 "GPT-4o"',
  provider_id INT NOT NULL COMMENT '关联 model_providers.id',
  model_id VARCHAR(255) NOT NULL COMMENT '平台官方模型ID，如 "deepseek-v4-pro"',
  
  -- 能力标签（替代静态 category ENUM）
  -- 支持: chat, vision, image_gen, video_gen, audio_gen, tool_calling, reasoning, code, embedding
  capabilities JSON NOT NULL COMMENT '能力标签数组',
  
  -- 模型元数据
  metadata JSON COMMENT '{context_window, knowledge_cutoff, max_output_tokens, supported_languages, description}',
  
  -- 计费配置（简化版，支持多维度）
  pricing JSON NOT NULL COMMENT '计费配置',
  
  -- 质量与路由
  quality_score FLOAT DEFAULT 0.5 COMMENT '质量评分 0-1，用于智能路由',
  is_recommended TINYINT(1) DEFAULT 0 COMMENT '是否推荐',
  
  -- 发现来源
  is_discovered TINYINT(1) DEFAULT 0 COMMENT '是否自动发现',
  discovery_source VARCHAR(100) DEFAULT NULL COMMENT '发现来源平台',
  
  -- 状态
  is_active TINYINT(1) DEFAULT 1 COMMENT '是否启用',
  
  -- 适配器配置（非标准平台使用）
  adapter_name VARCHAR(100) DEFAULT NULL COMMENT 'Platform Adapter 名称',
  adapter_config JSON COMMENT 'Adapter 专用配置参数',
  
  -- 时间戳
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  
  -- 约束
  UNIQUE KEY uk_provider_model (provider_id, model_id),
  
  -- 索引
  INDEX idx_capabilities ( (CAST(capabilities AS CHAR(255) ARRAY)) ),
  INDEX idx_active_quality (is_active, quality_score),
  INDEX idx_adapter (adapter_name),
  INDEX idx_discovered (is_discovered, discovery_source)
  
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='AI 模型目录表（精简版）';

-- 2. 创建模型发现日志表
CREATE TABLE IF NOT EXISTS model_discovery_logs (
  id INT AUTO_INCREMENT PRIMARY KEY,
  provider_id INT NOT NULL COMMENT '关联平台ID',
  provider_name VARCHAR(100) NOT NULL COMMENT '平台名称',
  discovered_count INT DEFAULT 0 COMMENT '发现模型数量',
  added_count INT DEFAULT 0 COMMENT '新增模型数量',
  updated_count INT DEFAULT 0 COMMENT '更新模型数量',
  removed_count INT DEFAULT 0 COMMENT '移除模型数量',
  error_message TEXT COMMENT '错误信息',
  started_at DATETIME NOT NULL COMMENT '开始时间',
  completed_at DATETIME COMMENT '完成时间',
  
  INDEX idx_provider_time (provider_id, started_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='模型发现日志';

-- 3. 创建模型路由配置表（用于智能路由策略）
CREATE TABLE IF NOT EXISTS model_routing_rules (
  id INT AUTO_INCREMENT PRIMARY KEY,
  
  -- 匹配条件
  task_type VARCHAR(100) NOT NULL COMMENT '任务类型，如 storyboard_generation',
  required_capabilities JSON NOT NULL COMMENT '必需能力标签',
  
  -- 路由策略
  preferred_model_id INT COMMENT '首选模型ID',
  fallback_model_ids JSON COMMENT '备选模型ID列表 [id1, id2, ...]',
  
  -- 约束条件
  min_quality_score FLOAT DEFAULT 0.3 COMMENT '最低质量要求',
  max_cost_per_request FLOAT COMMENT '单次请求最大成本',
  
  -- 状态
  is_active TINYINT(1) DEFAULT 1,
  priority INT DEFAULT 0 COMMENT '优先级，数字越大越优先',
  
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  
  INDEX idx_task_type (task_type),
  INDEX idx_active_priority (is_active, priority)
  
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='模型路由规则';

-- 4. 迁移现有数据（从 ai_model_configs 到 ai_models_v2）
-- 注意：此迁移将现有模型转换为新格式

INSERT INTO ai_models_v2 (
  name, provider_id, model_id, capabilities, metadata, pricing, 
  quality_score, is_recommended, is_active, adapter_name, created_at
)
SELECT 
  amc.name,
  amc.provider_id,
  COALESCE(amc.model_id, amc.name) as model_id,
  
  -- 转换 category 为 capabilities
  CASE amc.category
    WHEN 'TEXT' THEN JSON_ARRAY('chat')
    WHEN 'IMAGE' THEN JSON_ARRAY('image_gen')
    WHEN 'VIDEO' THEN JSON_ARRAY('video_gen')
    WHEN 'AUDIO' THEN JSON_ARRAY('audio_gen')
    WHEN 'MULTIMODAL' THEN JSON_ARRAY('chat', 'vision')
    ELSE JSON_ARRAY('chat')
  END as capabilities,
  
  -- 构建 metadata
  JSON_OBJECT(
    'description', amc.description,
    'legacy_id', amc.id
  ) as metadata,
  
  -- 迁移 pricing
  COALESCE(amc.price_config, '{"currency":"CNY","components":[]}') as pricing,
  
  -- 默认质量分
  0.5 as quality_score,
  
  -- 是否推荐（启用的主模型）
  CASE WHEN amc.is_active = 1 AND amc.provider_id IS NOT NULL THEN 1 ELSE 0 END as is_recommended,
  
  amc.is_active,
  
  -- 判断 adapter
  CASE 
    WHEN amc.custom_handler IS NOT NULL AND amc.custom_handler != '' THEN amc.custom_handler
    WHEN amc.provider_id IS NOT NULL AND amc.model_id IS NOT NULL THEN 'openai_compatible'
    ELSE NULL
  END as adapter_name,
  
  amc.created_at

FROM ai_model_configs amc
WHERE amc.provider_id IS NOT NULL
  AND amc.model_id IS NOT NULL
  AND amc.model_id != ''
ON DUPLICATE KEY UPDATE
  name = VALUES(name),
  capabilities = VALUES(capabilities),
  metadata = VALUES(metadata),
  pricing = VALUES(pricing),
  is_active = VALUES(is_active),
  adapter_name = VALUES(adapter_name);

-- 5. 插入默认路由规则
INSERT INTO model_routing_rules (task_type, required_capabilities, priority) VALUES
  ('storyboard_generation', '["chat"]', 100),
  ('character_extraction', '["chat"]', 100),
  ('scene_state_analysis', '["chat"]', 100),
  ('image_generation', '["image_gen"]', 100),
  ('video_generation', '["video_gen"]', 100),
  ('prompt_optimization', '["chat", "reasoning"]', 100)
ON DUPLICATE KEY UPDATE priority = VALUES(priority);
