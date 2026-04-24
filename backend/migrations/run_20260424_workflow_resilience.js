/**
 * 工作流弹性增强迁移运行器
 * 执行方式: node migrations/run_20260424_workflow_resilience.js
 */
require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const mysql = require('mysql2/promise');

async function run() {
  const conn = await mysql.createConnection({
    host: process.env.MYSQL_HOST || 'localhost',
    port: parseInt(process.env.MYSQL_PORT) || 3306,
    user: process.env.MYSQL_USER || 'root',
    password: process.env.MYSQL_PASSWORD || '',
    database: process.env.MYSQL_DATABASE || 'nanostory'
  });

  try {
    console.log('[Migration] 开始: 工作流弹性增强...');

    // 1. execution_snapshot 列
    try {
      await conn.query(
        `ALTER TABLE workflow_jobs ADD COLUMN execution_snapshot JSON DEFAULT NULL COMMENT '执行快照：持久化 stepCounters、runningTasks 等内存状态，用于断点恢复' AFTER error_message`
      );
      console.log('[Migration] ✓ workflow_jobs.execution_snapshot 已添加');
    } catch (e) {
      if (e.code === 'ER_DUP_FIELDNAME') {
        console.log('[Migration] - workflow_jobs.execution_snapshot 已存在，跳过');
      } else { throw e; }
    }

    // 2. retry_count
    try {
      await conn.query(
        `ALTER TABLE generation_tasks ADD COLUMN retry_count INT DEFAULT 0 COMMENT '已重试次数' AFTER error_message`
      );
      console.log('[Migration] ✓ generation_tasks.retry_count 已添加');
    } catch (e) {
      if (e.code === 'ER_DUP_FIELDNAME') {
        console.log('[Migration] - generation_tasks.retry_count 已存在，跳过');
      } else { throw e; }
    }

    // 3. max_retries
    try {
      await conn.query(
        `ALTER TABLE generation_tasks ADD COLUMN max_retries INT DEFAULT 3 COMMENT '最大重试次数' AFTER retry_count`
      );
      console.log('[Migration] ✓ generation_tasks.max_retries 已添加');
    } catch (e) {
      if (e.code === 'ER_DUP_FIELDNAME') {
        console.log('[Migration] - generation_tasks.max_retries 已存在，跳过');
      } else { throw e; }
    }

    // 4. retry_reason
    try {
      await conn.query(
        `ALTER TABLE generation_tasks ADD COLUMN retry_reason TEXT COMMENT '重试原因/错误详情（JSON格式）' AFTER max_retries`
      );
      console.log('[Migration] ✓ generation_tasks.retry_reason 已添加');
    } catch (e) {
      if (e.code === 'ER_DUP_FIELDNAME') {
        console.log('[Migration] - generation_tasks.retry_reason 已存在，跳过');
      } else { throw e; }
    }

    // 5. status 枚举增加 retrying
    try {
      await conn.query(
        `ALTER TABLE generation_tasks MODIFY COLUMN status ENUM('pending', 'processing', 'completed', 'failed', 'retrying') DEFAULT 'pending' COMMENT '任务状态'`
      );
      console.log('[Migration] ✓ generation_tasks.status 已增加 retrying');
    } catch (e) {
      console.warn('[Migration] - status 枚举修改:', e.message);
    }

    // 6. workflow_logs 表
    await conn.query(`
      CREATE TABLE IF NOT EXISTS workflow_logs (
        id BIGINT AUTO_INCREMENT PRIMARY KEY,
        job_id INT DEFAULT NULL COMMENT '关联的工作流ID',
        task_id INT DEFAULT NULL COMMENT '关联的任务ID',
        user_id INT DEFAULT NULL COMMENT '关联的用户ID',
        workflow_type VARCHAR(50) DEFAULT NULL COMMENT '工作流类型',
        log_level ENUM('debug', 'info', 'warn', 'error') DEFAULT 'info' COMMENT '日志级别',
        log_source VARCHAR(100) DEFAULT NULL COMMENT '日志来源模块',
        log_event VARCHAR(100) DEFAULT NULL COMMENT '事件类型',
        log_message TEXT COMMENT '日志消息',
        log_context JSON DEFAULT NULL COMMENT '结构化上下文',
        created_at DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3) COMMENT '日志生成时间（毫秒精度）',
        INDEX idx_job_id (job_id),
        INDEX idx_task_id (task_id),
        INDEX idx_user_id (user_id),
        INDEX idx_log_level (log_level),
        INDEX idx_log_event (log_event),
        INDEX idx_workflow_type (workflow_type),
        INDEX idx_created_at (created_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='工作流结构化日志表'
    `);
    console.log('[Migration] ✓ workflow_logs 表已创建');

    console.log('[Migration] 完成: 工作流弹性增强');
  } catch (e) {
    console.error('[Migration] 失败:', e.message);
    throw e;
  } finally {
    await conn.end();
  }
}

run().then(() => process.exit(0)).catch(() => process.exit(1));
