-- 工作流乐观并发控制（OCC）版本号
-- 理论基础：Optimistic Concurrency Control
-- 防止多 Worker 并发修改同一工作流时的数据竞争
-- 幂等设计：可重复执行
-- 执行: mysql -u root -p nanostory < migrations/add_workflow_version.sql

USE nanostory;

-- 添加乐观锁版本号字段
ALTER TABLE workflow_jobs ADD COLUMN IF NOT EXISTS version INT DEFAULT 0 COMMENT '乐观锁版本号（OCC）';
