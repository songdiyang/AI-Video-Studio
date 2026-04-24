/**
 * 结构化日志系统 (WorkflowLogger)
 * 
 * 为工作流引擎提供统一的结构化日志，支持按 jobId/taskId/时间范围/事件类型 查询过滤。
 * 
 * 使用方式：
 *   const logger = new WorkflowLogger({ jobId, taskId, userId, workflowType });
 *   logger.info('task_started', '开始执行分镜生成', { stepIndex: 1, modelName: '...' });
 *   logger.error('task_failed', 'AI API 调用超时', { errorType: 'timeout', stack: '...' });
 * 
 * 特性：
 * - 批量缓冲写入（每 2 秒或满 50 条刷新），减少 DB IOPS
 * - 优雅关闭：进程退出前 flush 所有缓冲日志
 * - 非阻塞：日志写入失败不影响主流程
 */

const { execute } = require('../../dbHelper');

const FLUSH_INTERVAL = 2000;  // 2 秒
const BATCH_SIZE = 50;        // 攒满 50 条强制刷新

class WorkflowLogger {
  /**
   * @param {Object} ctx - 默认上下文字段，所有日志都会继承
   * @param {number} ctx.jobId
   * @param {number} ctx.taskId
   * @param {number} ctx.userId
   * @param {string} ctx.workflowType
   */
  constructor(ctx = {}) {
    this.defaultCtx = ctx;
    this._buffer = [];
    this._timer = null;
    this._flushing = false;
  }

  // ──────────────────────────────
  // 公共 API
  // ──────────────────────────────

  /**
   * DEBUG 级别（仅开发环境记录）
   */
  debug(event, message, context = {}) {
    if (process.env.NODE_ENV === 'production') return;
    this._enqueue('debug', event, message, context);
  }

  /**
   * INFO 级别：正常业务流程
   */
  info(event, message, context = {}) {
    this._enqueue('info', event, message, context);
  }

  /**
   * WARN 级别：异常但可恢复
   */
  warn(event, message, context = {}) {
    this._enqueue('warn', event, message, context);
  }

  /**
   * ERROR 级别：失败，需要关注
   */
  error(event, message, context = {}) {
    this._enqueue('error', event, message, context);
  }

  /**
   * 创建带额外默认上下文的子 logger
   */
  child(extraCtx = {}) {
    return new WorkflowLogger({ ...this.defaultCtx, ...extraCtx });
  }

  /**
   * 立即刷新所有缓冲日志（进程退出前调用）
   */
  async flush() {
    if (this._timer) {
      clearInterval(this._timer);
      this._timer = null;
    }
    await this._flush();
  }

  /**
   * 销毁 logger，停止定时器
   */
  destroy() {
    if (this._timer) {
      clearInterval(this._timer);
      this._timer = null;
    }
    this._buffer = [];
  }

  // ──────────────────────────────
  // 内部实现
  // ──────────────────────────────

  _enqueue(level, event, message, context) {
    const mergedCtx = { ...this.defaultCtx, ...context };
    this._buffer.push({
      job_id: mergedCtx.jobId ?? null,
      task_id: mergedCtx.taskId ?? null,
      user_id: mergedCtx.userId ?? null,
      workflow_type: mergedCtx.workflowType ?? null,
      log_level: level,
      log_source: mergedCtx.source ?? 'Engine',
      log_event: event,
      log_message: message,
      log_context: JSON.stringify(this._serializeContext(mergedCtx))
    });

    // 同时输出到控制台（保持运维可见性）
    this._consolePrint(level, event, message, mergedCtx);

    // 超阈值立即刷新
    if (this._buffer.length >= BATCH_SIZE) {
      this._flush().catch(() => {});
    }

    // 启动定时器
    if (!this._timer && !this._flushing) {
      this._timer = setInterval(() => {
        this._flush().catch(() => {});
      }, FLUSH_INTERVAL);
      // 允许进程退出（不阻塞事件循环）
      if (this._timer && typeof this._timer.unref === 'function') {
        this._timer.unref();
      }
    }
  }

  async _flush() {
    if (this._buffer.length === 0) return;
    if (this._flushing) return;

    this._flushing = true;
    const batch = this._buffer.splice(0);
    this._flushing = false;

    try {
      // 批量 INSERT
      const placeholders = batch.map(() => '(?,?,?,?,?,?,?,?,?)').join(',');
      const values = [];
      for (const entry of batch) {
        values.push(
          entry.job_id, entry.task_id, entry.user_id, entry.workflow_type,
          entry.log_level, entry.log_source, entry.log_event,
          entry.log_message, entry.log_context
        );
      }
      await execute(
        `INSERT INTO workflow_logs (job_id, task_id, user_id, workflow_type, log_level, log_source, log_event, log_message, log_context) VALUES ${placeholders}`,
        values
      );
    } catch (err) {
      // 静默失败：写入控制台兜底
      console.error('[WorkflowLogger] 批量写入失败:', err.message);
    }
  }

  _consolePrint(level, event, message, ctx) {
    const ts = new Date().toISOString();
    const prefix = {
      debug: '\x1b[90m',   // 灰色
      info:  '\x1b[36m',   // 青色
      warn:  '\x1b[33m',   // 黄色
      error: '\x1b[31m'    // 红色
    }[level] || '';
    const reset = '\x1b[0m';
    const extras = [];
    if (ctx.jobId) extras.push(`job=${ctx.jobId}`);
    if (ctx.taskId) extras.push(`task=${ctx.taskId}`);
    if (ctx.durationMs !== undefined) extras.push(`${ctx.durationMs}ms`);
    const extraStr = extras.length ? ` [${extras.join(' ')}]` : '';

    if (level === 'error' || level === 'warn') {
      console[level === 'error' ? 'error' : 'warn'](
        `${prefix}[${event}]${reset} ${message}${extraStr}`
      );
    } else {
      console.log(
        `${prefix}[${event}]${reset} ${message}${extraStr}`
      );
    }
  }

  /**
   * 序列化上下文，剔除大对象避免日志膨胀
   */
  _serializeContext(ctx) {
    const cleaned = {};
    for (const [key, value] of Object.entries(ctx)) {
      // 跳过已映射到顶层列的字段
      if (['jobId', 'taskId', 'userId', 'workflowType', 'source'].includes(key)) continue;
      // 截断超长字符串
      if (typeof value === 'string' && value.length > 1000) {
        cleaned[key] = value.substring(0, 1000) + '...[truncated]';
      } else if (value instanceof Error) {
        cleaned[key] = { message: value.message, stack: value.stack?.substring(0, 2000) };
      } else {
        cleaned[key] = value;
      }
    }
    return cleaned;
  }
}

// ──────────────────────────────
// 进程退出时自动 flush
// ──────────────────────────────
const activeLoggers = new Set();

function registerLogger(logger) {
  activeLoggers.add(logger);
}

function unregisterLogger(logger) {
  activeLoggers.delete(logger);
}

// 优雅关闭
async function flushAll() {
  const loggers = Array.from(activeLoggers);
  await Promise.all(loggers.map(l => l.flush()));
  activeLoggers.clear();
}

// 注册进程退出钩子
if (typeof process !== 'undefined') {
  let hooksRegistered = false;
  if (!hooksRegistered) {
    hooksRegistered = true;
    process.on('SIGTERM', () => { flushAll().then(() => process.exit(0)); });
    process.on('SIGINT', () => { flushAll().then(() => process.exit(0)); });
    process.on('beforeExit', () => { flushAll(); });
  }
}

module.exports = { WorkflowLogger, flushAll: () => flushAll() };
