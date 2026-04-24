-- 工作流弹性增强迁移
-- 1. execution_snapshot: 内存状态持久化
-- 2. retry_count/max_retries/retry_reason: 任务级重试
-- 3. workflow_logs: 结构化日志表
-- 执行方式: node migrations/run_20260424_workflow_resilience.js

-- ============================================
-- 1. workflow_jobs 增加执行快照列（内存状态持久化）
-- ============================================
ALTER TABLE workflow_jobs
ADD COLUMN execution_snapshot JSON DEFAULT NULL COMMENT '执行快照：持久化 stepCounters、runningTasks 等内存状态，用于断点恢复'
AFTER error_message;

-- ============================================
-- 2. generation_tasks 增加重试相关列
-- ============================================
ALTER TABLE generation_tasks
ADD COLUMN retry_count INT DEFAULT 0 COMMENT '已重试次数'
AFTER error_message;

ALTER TABLE generation_tasks
ADD COLUMN max_retries INT DEFAULT 3 COMMENT '最大重试次数'
AFTER retry_count;

ALTER TABLE generation_tasks
ADD COLUMN retry_reason TEXT COMMENT '重试原因/错误详情（JSON格式，含 errorType、stack、timestamp 等）'
AFTER max_retries;

-- 为 status 增加 retrying 枚举值
ALTER TABLE generation_tasks
MODIFY COLUMN status ENUM('pending', 'processing', 'completed', 'failed', 'retrying') DEFAULT 'pending' COMMENT '任务状态';

-- ============================================
-- 3. 结构化日志表
-- ============================================
CREATE TABLE IF NOT EXISTS workflow_logs (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  job_id INT DEFAULT NULL COMMENT '关联的工作流ID',
  task_id INT DEFAULT NULL COMMENT '关联的任务ID',
  user_id INT DEFAULT NULL COMMENT '关联的用户ID',
  workflow_type VARCHAR(50) DEFAULT NULL COMMENT '工作流类型',
  log_level ENUM('debug', 'info', 'warn', 'error') DEFAULT 'info' COMMENT '日志级别',
  log_source VARCHAR(100) DEFAULT NULL COMMENT '日志来源模块（Engine/Executor/Scheduler/Handler 等）',
  log_event VARCHAR(100) DEFAULT NULL COMMENT '事件类型（task_started, task_completed, task_failed, task_retrying, job_started, job_completed, job_failed, step_scheduled, memory_high, backpressure_activated 等）',
  log_message TEXT COMMENT '日志消息',
  log_context JSON DEFAULT NULL COMMENT '结构化上下文（duration_ms, step_index, model_name, error_type 等）',
  created_at DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3) COMMENT '日志生成时间（毫秒精度）',
  INDEX idx_job_id (job_id),
  INDEX idx_task_id (task_id),
  INDEX idx_user_id (user_id),
  INDEX idx_log_level (log_level),
  INDEX idx_log_event (log_event),
  INDEX idx_workflow_type (workflow_type),
  INDEX idx_created_at (created_at),
  FOREIGN KEY (job_id) REFERENCES workflow_jobs(id) ON DELETE CASCADE,
  FOREIGN KEY (task_id) REFERENCES generation_tasks(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='工作流结构化日志表';
