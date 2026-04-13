-- 为 workflow_jobs 添加管理员审核状态字段
-- is_consumed 由用户前端消费接口设置，不适合管理员错误审核
-- admin_resolved 独立追踪管理员是否已处理该错误

ALTER TABLE workflow_jobs
  ADD COLUMN admin_resolved TINYINT(1) DEFAULT 0 COMMENT '管理员是否已处理：0=未处理, 1=已处理' AFTER is_consumed;

CREATE INDEX idx_admin_resolved ON workflow_jobs(admin_resolved);
