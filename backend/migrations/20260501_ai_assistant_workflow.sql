-- AI 助手长任务接入 nosyntask 工作流
-- 1. workflow_jobs 增加 parent_job_id 建立主/子关联
-- 2. workflow_jobs 增加 metadata JSON 存规划产物/ContinuationToken
-- 3. ai_assistant_sessions 增加 active_job_id 记录当前进行中的主 workflow
-- 4. ai_assistant_sessions 增加 continuation_token 存多轮循环上下文摘要
-- 5. ai_model_configs 增加 supports_tool_calling（如果不存在）

-- ============================================
-- 1-2. workflow_jobs 扩展
-- ============================================
ALTER TABLE workflow_jobs
ADD COLUMN parent_job_id INT DEFAULT NULL COMMENT '父工作流ID（用于AI助手级联调度）',
ADD COLUMN metadata JSON DEFAULT NULL COMMENT '扩展元数据（规划产物、ContinuationToken等）',
ADD INDEX idx_parent_job_id (parent_job_id);

-- ============================================
-- 3-4. ai_assistant_sessions 扩展
-- ============================================
ALTER TABLE ai_assistant_sessions
ADD COLUMN active_job_id INT DEFAULT NULL COMMENT '当前进行中的主工作流ID',
ADD COLUMN continuation_token JSON DEFAULT NULL COMMENT '多轮循环上下文摘要',
ADD INDEX idx_active_job_id (active_job_id);

-- ============================================
-- 5. ai_model_configs 增加 supports_tool_calling 字段
-- ============================================
ALTER TABLE ai_model_configs
ADD COLUMN supports_tool_calling TINYINT(1) DEFAULT 0 COMMENT '是否支持 function calling';

-- 默认给 DeepSeek / 豆包 主模型开启
UPDATE ai_model_configs
SET supports_tool_calling = 1
WHERE is_active = 1
  AND category IN ('TEXT', 'MULTIMODAL')
  AND (provider LIKE '%deepseek%' OR provider LIKE '%doubao%' OR provider LIKE '%ark%' OR provider LIKE '%openai%');
