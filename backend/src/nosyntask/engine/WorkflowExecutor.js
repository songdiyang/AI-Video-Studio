/**
 * 工作流执行模块
 * 负责执行工作流步骤和任务
 * 支持基于 dependencies 的并行执行
 * 
 * 性能优化：
 * - 内存管理器：定期检查堆内存，超阈值触发 GC
 * - 背压控制器：pending 任务过多时自动降速
 * - 任务超时保护：防止单个任务无限挂起
 * - 过期状态清理：防止内存泄漏
 * - Redis 缓存集成：减少 DB 查询（可选，不可用时降级）
 */

const { queryOne, queryAll, execute } = require('../../dbHelper');
const { getWorkflowDefinition } = require('../definitions');
const ContextBuilder = require('./ContextBuilder');
const JobStatusManager = require('./JobStatusManager');
const { runWithTrace } = require('./generationTrace');
const { withAIBillingContext } = require('../../aiBillingContext');
const { updateJobWithVersion } = require('../utils/occUtils');
const { WorkflowLogger } = require('../utils/WorkflowLogger');

// 尝试加载 Redis 缓存服务（可选）
let CacheService = null;
try {
  CacheService = require('../../redis-service').CacheService;
} catch (e) {
  // Redis 服务未初始化时忽略
}

// 尝试加载 Pub/Sub 服务（可选，用于工作流事件异步解耦）
let PubSubService = null;
try {
  PubSubService = require('../../redis-service').PubSubService;
} catch (e) {
  // Redis 服务未初始化时忽略
}

// ============================================
// 配置常量
// ============================================
const MAX_STEPS = parseInt(process.env.WORKFLOW_MAX_STEPS, 10) || 100;
const MAX_CONCURRENT_TASKS = parseInt(process.env.WORKFLOW_MAX_CONCURRENT, 10) || 20;
const TASK_TIMEOUT = parseInt(process.env.WORKFLOW_TASK_TIMEOUT, 10) || 300000; // 5分钟
const TASK_MAX_RETRIES = parseInt(process.env.WORKFLOW_TASK_MAX_RETRIES, 10) || 3; // 任务最大重试次数
const TASK_RETRY_BASE_DELAY_MS = parseInt(process.env.WORKFLOW_TASK_RETRY_BASE_DELAY, 10) || 3000; // 重试基础延迟
const SNAPSHOT_INTERVAL = parseInt(process.env.WORKFLOW_SNAPSHOT_INTERVAL, 10) || 15000; // 快照持久化间隔
const MEMORY_THRESHOLD_MB = parseInt(process.env.WORKFLOW_MEMORY_THRESHOLD, 10) || 1024;
const BACKPRESSURE_THRESHOLD = parseInt(process.env.WORKFLOW_BACKPRESSURE, 10) || 1000;
const MEMORY_CHECK_INTERVAL = 30000;
const STALE_CLEANUP_INTERVAL = 60000;
const STALE_THRESHOLD = 3600000; // 1小时
const JOB_CACHE_TTL = 30; // 秒

// ============================================
// 内存管理器
// ============================================
class MemoryManager {
  constructor() {
    this.lastGC = 0;
    this.gcCooldown = 60000;
    this.monitorTimer = null;
  }

  getMemoryUsage() {
    const usage = process.memoryUsage();
    return {
      heapUsed: Math.round(usage.heapUsed / 1024 / 1024),
      heapTotal: Math.round(usage.heapTotal / 1024 / 1024),
      rss: Math.round(usage.rss / 1024 / 1024)
    };
  }

  checkAndGC() {
    const now = Date.now();
    if (now - this.lastGC < this.gcCooldown) return false;

    const usage = this.getMemoryUsage();

    if (usage.heapUsed > MEMORY_THRESHOLD_MB) {
      console.warn(`[MemoryManager] 内存使用过高: ${usage.heapUsed}MB / ${MEMORY_THRESHOLD_MB}MB`);

      if (global.gc) {
        global.gc();
        this.lastGC = now;
        const after = this.getMemoryUsage();
        console.log(`[MemoryManager] GC 完成: ${after.heapUsed}MB (释放 ${usage.heapUsed - after.heapUsed}MB)`);
        return true;
      } else {
        console.warn('[MemoryManager] GC 未暴露，建议使用 --expose-gc 启动');
      }
    } else if (usage.heapUsed > MEMORY_THRESHOLD_MB * 0.8) {
      console.warn(`[MemoryManager] 内存预警: ${usage.heapUsed}MB / ${MEMORY_THRESHOLD_MB}MB (80%)`);
    }

    return false;
  }

  startMonitoring() {
    this.monitorTimer = setInterval(() => this.checkAndGC(), MEMORY_CHECK_INTERVAL);
    return this.monitorTimer;
  }

  stopMonitoring() {
    if (this.monitorTimer) {
      clearInterval(this.monitorTimer);
      this.monitorTimer = null;
    }
  }
}

// ============================================
// 背压控制器
// ============================================
class BackpressureController {
  constructor() {
    this.pendingCount = 0;
    this.isActive = false;
  }

  update(pendingCount) {
    const wasActive = this.isActive;
    this.pendingCount = pendingCount;
    this.isActive = pendingCount > BACKPRESSURE_THRESHOLD;

    if (this.isActive && !wasActive) {
      console.warn(`[Backpressure] 已激活: pending=${pendingCount} > 阈值${BACKPRESSURE_THRESHOLD}`);
    } else if (!this.isActive && wasActive) {
      console.log(`[Backpressure] 已解除: pending=${pendingCount}`);
    }
  }

  getAllowedConcurrency(baseConcurrency) {
    if (!this.isActive) return baseConcurrency;
    // 背压状态下降低到 25%
    const reduced = Math.max(1, Math.floor(baseConcurrency * 0.25));
    return reduced;
  }
}

// ============================================
// 工具函数
// ============================================

/**
 * 将日期转换为 MySQL DATETIME 兼容格式 'YYYY-MM-DD HH:mm:ss'
 * MySQL 不接受 ISO 8601 带 T 和 Z 的格式
 * @param {Date|string|null} date - 日期对象或日期字符串
 * @returns {string|null} MySQL 兼容的日期字符串，或 null
 */
function toMySQLDatetime(date) {
  if (!date) return null;
  const d = date instanceof Date ? date : new Date(date);
  if (isNaN(d.getTime())) return null;
  return d.getFullYear() + '-' +
    String(d.getMonth() + 1).padStart(2, '0') + '-' +
    String(d.getDate()).padStart(2, '0') + ' ' +
    String(d.getHours()).padStart(2, '0') + ':' +
    String(d.getMinutes()).padStart(2, '0') + ':' +
    String(d.getSeconds()).padStart(2, '0');
}

function extractResourceRefs(inputParams, executionContext = {}) {
  const refs = {};
  for (const key of ['scriptId', 'storyboardId', 'sceneId', 'characterId', 'projectId']) {
    if (inputParams?.[key] !== undefined && inputParams?.[key] !== null && inputParams?.[key] !== '') {
      refs[key] = inputParams[key];
    }
  }
  if (refs.projectId === undefined && executionContext?.projectId !== undefined && executionContext?.projectId !== null) {
    refs.projectId = executionContext.projectId;
  }
  return refs;
}

/**
 * 带超时的 Promise 执行
 */
function executeWithTimeout(fn, timeoutMs) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`任务执行超时 (${Math.round(timeoutMs / 1000)}秒)`));
    }, timeoutMs);

    fn()
      .then(result => {
        clearTimeout(timer);
        resolve(result);
      })
      .catch(error => {
        clearTimeout(timer);
        reject(error);
      });
  });
}

// ============================================

// 工作流执行器
// ============================================

class WorkflowExecutor {
  constructor() {
    this.contextBuilder = new ContextBuilder();
    this.jobStatusManager = new JobStatusManager();
    this.stepCounters = new Map(); // jobId -> { count, lastUpdate }
    this.runningTasks = new Map(); // jobId -> Set<taskId> 正在执行的任务

    // 新增：结构化日志
    this.logger = new WorkflowLogger({ source: 'Executor' });

    // 新增：内存管理器
    this.memoryManager = new MemoryManager();
    this.memoryManager.startMonitoring();

    // 新增：背压控制器
    this.backpressure = new BackpressureController();

    // 新增：定期清理过期状态（防止内存泄漏）
    this.cleanupTimer = setInterval(() => this._cleanupStaleState(), STALE_CLEANUP_INTERVAL);

    // 新增：定期持久化执行快照（断点恢复）
    this.snapshotTimer = setInterval(() => this._persistAllSnapshots(), SNAPSHOT_INTERVAL);
    if (this.snapshotTimer && typeof this.snapshotTimer.unref === 'function') {
      this.snapshotTimer.unref();
    }

    // 启动时恢复被中断的工作流 - 延迟执行，确保数据库已初始化
    this._recoveryDeferred = true;
  }

  /**
   * 清理过期的内部状态
   */
  _cleanupStaleState() {
    const now = Date.now();
    let cleaned = 0;

    for (const [jobId, data] of this.stepCounters) {
      // stepCounters 存储 { count, lastUpdate } 或旧格式的纯数字
      const lastUpdate = typeof data === 'object' ? data.lastUpdate : 0;
      if (lastUpdate > 0 && now - lastUpdate > STALE_THRESHOLD) {
        this.stepCounters.delete(jobId);
        this.runningTasks.delete(jobId);
        cleaned++;
      }
    }

    if (cleaned > 0) {
      console.log(`[WorkflowExecutor] 清理过期状态: ${cleaned} 个工作流`);
    }
  }

  /**
   * 持久化单个工作流的执行快照到 DB
   */
  async _persistSnapshot(jobId) {
    try {
      const counterData = this.stepCounters.get(jobId);
      const runningSet = this.runningTasks.get(jobId);
      if (!counterData && !runningSet) return; // 没有活跃状态，跳过

      const snapshot = {
        stepCounter: counterData || { count: 0, lastUpdate: Date.now() },
        runningTaskIds: runningSet ? Array.from(runningSet) : [],
        savedAt: new Date().toISOString()
      };

      await execute(
        `UPDATE workflow_jobs SET execution_snapshot = ? WHERE id = ? AND status IN ('pending', 'running')`,
        [JSON.stringify(snapshot), jobId]
      );
    } catch (err) {
      // 持久化失败不阻塞主流程
    }
  }

  /**
   * 批量持久化所有活跃工作流的执行快照
   */
  async _persistAllSnapshots() {
    if (this.stepCounters.size === 0) return;
    const jobs = Array.from(this.stepCounters.keys());
    for (const jobId of jobs) {
      await this._persistSnapshot(jobId);
    }
  }

  /**
   * 启动时恢复被中断的工作流
   * 将在重启前处于 running 状态的工作流从快照中恢复
   */
  async _recoverInterruptedJobs() {
    try {
      // 查找有执行快照的运行中工作流（说明是异常中断）
      const interruptedJobs = await queryAll(
        `SELECT * FROM workflow_jobs WHERE status IN ('pending', 'running') AND execution_snapshot IS NOT NULL`
      );

      if (interruptedJobs.length === 0) {
        // 没有可恢复的，标记剩余的 running/pending 为 failed（旧逻辑）
        const { execute: dbExec } = require('../../dbHelper');
        await dbExec(
          `UPDATE workflow_jobs SET status = 'failed', error_message = '服务重启导致任务中断', updated_at = NOW()
           WHERE status IN ('pending', 'running') AND execution_snapshot IS NULL`
        );
        return;
      }

      console.log(`[WorkflowExecutor] 发现 ${interruptedJobs.length} 个可恢复的工作流`);

      for (const job of interruptedJobs) {
        try {
          let snapshot = job.execution_snapshot;
          if (typeof snapshot === 'string') {
            snapshot = JSON.parse(snapshot);
          }

          // 恢复 stepCounters
          if (snapshot.stepCounter) {
            this.stepCounters.set(job.id, snapshot.stepCounter);
          }

          // 恢复 runningTasks（将当时正在执行的任务重置为 pending）
          if (Array.isArray(snapshot.runningTaskIds) && snapshot.runningTaskIds.length > 0) {
            await execute(
              `UPDATE generation_tasks SET status = 'pending', error_message = NULL, progress = 0
               WHERE id IN (${snapshot.runningTaskIds.map(() => '?').join(',')}) AND status = 'processing'`,
              snapshot.runningTaskIds
            );
          }

          // 删除已消费的快照（避免重复恢复）
          await execute(
            `UPDATE workflow_jobs SET execution_snapshot = NULL WHERE id = ?`,
            [job.id]
          );

          this.logger.info('job_recovered', '从快照恢复工作流', {
            jobId: job.id,
            workflowType: job.workflow_type,
            previousRunningTasks: snapshot.runningTaskIds?.length || 0
          });

          // 触发继续执行
          setImmediate(() => {
            this.runNextStep(job.id).catch(err => {
              console.error(`[WorkflowExecutor] 恢复工作流失败: jobId=${job.id}`, err);
            });
          });
        } catch (err) {
          console.error(`[WorkflowExecutor] 恢复工作流异常: jobId=${job.id}`, err);
          // 恢复失败则标记为失败
          await this.jobStatusManager.failJob(job.id, `服务重启后恢复失败: ${err.message}`);
        }
      }
    } catch (err) {
      console.error('[WorkflowExecutor] 恢复工作流失败:', err);
    }
  }

  /**
   * 获取 Job 信息（带 Redis 缓存）
   */
  async _getJobCached(jobId) {
    if (CacheService) {
      try {
        return await CacheService.getOrSet(
          `workflow:job:${jobId}`,
          () => queryOne('SELECT * FROM workflow_jobs WHERE id = ?', [jobId]),
          JOB_CACHE_TTL
        );
      } catch (e) {
        // 缓存失败，回退 DB 查询
      }
    }
    return queryOne('SELECT * FROM workflow_jobs WHERE id = ?', [jobId]);
  }

  /**
   * 使 Job 缓存失效
   */
  async _invalidateJobCache(jobId) {
    if (CacheService) {
      try {
        await CacheService.del(`workflow:job:${jobId}`);
      } catch (e) {
        // 静默
      }
    }
  }

  /**
   * 检查步骤的依赖是否都已完成
   * @param {Array} tasks - 所有任务
   * @param {Object} stepDef - 步骤定义
   * @returns {boolean}
   */
  areDependenciesMet(tasks, stepDef) {
    const deps = stepDef.dependencies || [];
    if (deps.length === 0) return true;
    
    return deps.every(depIndex => {
      const depTask = tasks.find(t => t.step_index === depIndex);
      return depTask && depTask.status === 'completed';
    });
  }

  /**
   * 执行下一批可执行的步骤（支持并行）
   * 这是引擎的核心调度逻辑
   */
  async runNextStep(jobId) {
    // 步骤计数保护：防止无限递归（增强版：记录时间戳）
    const counterData = this.stepCounters.get(jobId) || { count: 0, lastUpdate: Date.now() };
    if (typeof counterData === 'number') {
      // 兼容旧格式
      this.stepCounters.set(jobId, { count: counterData + 1, lastUpdate: Date.now() });
    } else {
      counterData.count++;
      counterData.lastUpdate = Date.now();
      this.stepCounters.set(jobId, counterData);
    }

    const count = (typeof counterData === 'number') ? counterData + 1 : counterData.count;
    if (count > MAX_STEPS) {
      this.stepCounters.delete(jobId);
      await this.jobStatusManager.failJob(jobId, `工作流执行超过最大步骤数（${MAX_STEPS}），已强制终止`);
      return;
    }

    // 获取 Job 信息（使用缓存）
    const job = await this._getJobCached(jobId);
    if (!job) {
      throw new Error(`工作流不存在: jobId=${jobId}`);
    }

    if (job.status === 'completed' || job.status === 'failed' || job.status === 'cancelled') {
      console.log(`[WorkflowExecutor] 工作流已结束: jobId=${jobId}, status=${job.status}`);
      this.stepCounters.delete(jobId);
      this.runningTasks.delete(jobId);
      return;
    }

    // 获取工作流定义
    const definition = getWorkflowDefinition(job.workflow_type);
    if (!definition) {
      await this.jobStatusManager.failJob(jobId, `工作流定义不存在: ${job.workflow_type}`);
      return;
    }

    // 解析步骤（支持动态步骤函数）
    let jobParams = job.input_params;
    if (typeof jobParams === 'string') {
      try { jobParams = JSON.parse(jobParams); } catch(e) { jobParams = {}; }
    }
    const steps = typeof definition.steps === 'function'
      ? definition.steps(jobParams || {})
      : definition.steps;

    // 获取所有任务
    const allTasks = await queryAll(
      'SELECT * FROM generation_tasks WHERE job_id = ? ORDER BY step_index ASC',
      [jobId]
    );

    // 背压检查：更新 pending 任务数
    const pendingCount = allTasks.filter(t => t.status === 'pending').length;
    this.backpressure.update(pendingCount);

    // 找到所有可执行的 pending 任务（依赖已满足且未在执行中）
    const runningSet = this.runningTasks.get(jobId) || new Set();
    const executableTasks = [];

    for (const task of allTasks) {
      if (task.status !== 'pending') continue;
      if (runningSet.has(task.id)) continue;

      const stepDef = steps[task.step_index];
      if (!stepDef) continue;

      // 检查依赖是否满足
      if (this.areDependenciesMet(allTasks, stepDef)) {
        executableTasks.push({ task, stepDef });
      }
    }

    // 没有可执行的任务
    if (executableTasks.length === 0) {
      // 检查是否有正在运行的任务
      const hasRunning = allTasks.some(t => t.status === 'processing');
      if (hasRunning) {
        // 等待运行中的任务完成
        return;
      }

      // 检查是否所有任务都完成
      const allCompleted = allTasks.every(t => t.status === 'completed');
      const allSettled = allTasks.every(t => t.status === 'completed' || t.status === 'failed');

      if (allCompleted) {
        this.stepCounters.delete(jobId);
        this.runningTasks.delete(jobId);
        await this.jobStatusManager.completeJob(jobId);
        await this._invalidateJobCache(jobId);

        // 异步发布工作流完成事件（不阻塞主流程）
        if (PubSubService && PubSubService.isAvailable()) {
          PubSubService.publish('workflow:completed', {
            jobId: job.id,
            userId: job.user_id,
            status: 'completed',
            workflowType: job.workflow_type,
            completedAt: new Date().toISOString()
          }).catch(err => {
            console.warn('[PubSub] 发布工作流完成事件失败:', err.message);
          });
        }
      } else if (allSettled) {
        // continue_independent 策略下：有失败的但其他都完成了
        const failedTasks = allTasks.filter(t => t.status === 'failed');
        const failMessage = `${failedTasks.length} 个任务失败，其余任务已完成`;
        this.stepCounters.delete(jobId);
        this.runningTasks.delete(jobId);
        await this.jobStatusManager.failJob(jobId, failMessage);
        await this._invalidateJobCache(jobId);

        // 异步发布工作流失败事件（不阻塞主流程）
        if (PubSubService && PubSubService.isAvailable()) {
          PubSubService.publish('workflow:failed', {
            jobId: job.id,
            userId: job.user_id,
            status: 'failed',
            workflowType: job.workflow_type,
            error: failMessage,
            failedAt: new Date().toISOString()
          }).catch(err => {
            console.warn('[PubSub] 发布工作流失败事件失败:', err.message);
          });
        }
      }
      return;
    }

    // 全局并发限制：计算当前正在运行的任务数（考虑背压）
    const currentRunningCount = runningSet.size;
    const allowedConcurrency = this.backpressure.getAllowedConcurrency(MAX_CONCURRENT_TASKS);
    const availableSlots = Math.max(0, allowedConcurrency - currentRunningCount);

    if (availableSlots === 0) {
      console.log(`[WorkflowExecutor] 已达并发上限 (${allowedConcurrency}${this.backpressure.isActive ? ' [背压]' : ''})，等待任务完成: jobId=${jobId}`);
      return;
    }

    // 限制本批次调度的任务数量
    const tasksToExecute = executableTasks.slice(0, availableSlots);
    console.log(`[WorkflowExecutor] 调度 ${tasksToExecute.length}/${executableTasks.length} 个任务 (并发: ${currentRunningCount + tasksToExecute.length}/${allowedConcurrency}${this.backpressure.isActive ? ' [背压]' : ''}): jobId=${jobId}`);

    // 更新 Job 状态（使用乐观锁）
    const minStepIndex = Math.min(...tasksToExecute.map(t => t.task.step_index));
    await updateJobWithVersion(jobId, { status: 'running', current_step_index: minStepIndex, started_at: toMySQLDatetime(job.started_at || new Date()) }, job.version || 0);
    await this._invalidateJobCache(jobId);

    // 标记任务为正在运行
    if (!this.runningTasks.has(jobId)) {
      this.runningTasks.set(jobId, new Set());
    }
    const running = this.runningTasks.get(jobId);
    tasksToExecute.forEach(({ task }) => running.add(task.id));

    // 并行执行所有可执行的任务
    const executions = tasksToExecute.map(async ({ task, stepDef }) => {
      // 构建上下文
      const context = await this.contextBuilder.buildContext(jobId, job);

      // 构建本步骤的 input_params
      let inputParams;
      try {
        inputParams = stepDef.buildInput(context);
      } catch (err) {
        await this.jobStatusManager.failTask(task.id, `构建输入参数失败: ${err.message}`);
        await this.jobStatusManager.failJob(jobId, `步骤 ${task.step_index} 输入参数构建失败: ${err.message}`);
        return;
      }

      // 执行任务
      await this.executeTask(task.id, stepDef, inputParams, jobId, context);
    });

    // 等待所有并行任务完成
    await Promise.all(executions);
  }

  /**
   * 执行单个任务（增强版：带超时保护）
   */
  async executeTask(taskId, stepDef, inputParams, jobId, executionContext = {}) {
    const taskStartTime = Date.now();
    try {
      // 保留初始化时存储的 displayName
      const taskInputWithMeta = stepDef.displayName
        ? { ...inputParams, displayName: stepDef.displayName }
        : inputParams;

      // 检查是否为重试（retrying → processing）
      const oldTask = await queryOne('SELECT g.retry_count, g.user_id, g.step_index, w.workflow_type FROM generation_tasks g LEFT JOIN workflow_jobs w ON w.id = g.job_id WHERE g.id = ?', [taskId]);
      const isRetry = oldTask?.retry_count > 0;

      // 更新任务状态为 processing
      await execute(
        `UPDATE generation_tasks 
         SET status = 'processing', input_params = ?, model_name = ?, started_at = NOW(), progress = 10 
         WHERE id = ?`,
        [JSON.stringify(taskInputWithMeta), inputParams.textModel || inputParams.imageModel || inputParams.videoModel || inputParams.audioModel || null, taskId]
      );

      // 结构化日志：任务开始
      const taskLogger = this.logger.child({
        jobId, taskId,
        userId: executionContext?.userId ?? oldTask?.user_id,
        workflowType: executionContext?.workflowType ?? oldTask?.workflow_type
      });
      taskLogger.info('task_started', `开始执行任务: ${stepDef.type}`, {
        stepType: stepDef.type,
        stepIndex: oldTask?.step_index,
        modelName: inputParams.textModel || inputParams.imageModel || inputParams.videoModel || inputParams.audioModel,
        isRetry
      });

      // 持久化快照
      this._persistSnapshot(jobId);

      // 进度回调
      const onProgress = async (progress) => {
        await execute('UPDATE generation_tasks SET progress = ? WHERE id = ?', [progress, taskId]);
      };

      // 用统一 billing context 包裹 handler，保证工作流内所有真实模型调用都能自动计费
      // 重试任务不重复扣积分（skipBilling=true 跳过成本记录，但 AI API 实际消耗无法退还）
      const billingContext = {
        userId: executionContext?.userId ?? inputParams?.userId ?? null,
        projectId: executionContext?.projectId ?? inputParams?.projectId ?? null,
        sourceType: 'workflow',
        operationKey: stepDef.type,
        workflowJobId: jobId,
        generationTaskId: taskId,
        skipBilling: isRetry || false,
        resourceRefs: extractResourceRefs(inputParams, executionContext)
      };

      console.log('[WorkflowExecutor] AI 计费上下文字段:', {
        taskId,
        workflowJobId: jobId,
        stepType: stepDef.type,
        userId: billingContext.userId,
        projectId: billingContext.projectId,
        modelName: inputParams.textModel || inputParams.imageModel || inputParams.videoModel || inputParams.audioModel || null,
        resourceRefs: billingContext.resourceRefs
      });

      if (!billingContext.userId) {
        console.warn('[WorkflowExecutor] AI 计费上下文缺少 userId:', {
          taskId,
          workflowJobId: jobId,
          stepType: stepDef.type,
          executionContext,
          inputParams
        });
      }

      // 用追踪系统包裹 handler 调用，自动记录开始/结束/耗时
      // 新增：超时保护
      const taskExecution = () => withAIBillingContext(
        billingContext,
        () => runWithTrace(taskId, stepDef.type, () => stepDef.handler(inputParams, onProgress))
      );

      const { result: resultData, trace: traceData } = await executeWithTimeout(taskExecution, TASK_TIMEOUT);

      // 任务成功：保存 result_data + trace
      await this.jobStatusManager.completeTask(taskId, resultData, traceData);

      // 从正在运行集合中移除
      const running = this.runningTasks.get(jobId);
      if (running) running.delete(taskId);

      // 结构化日志：任务成功
      const durationMs = Date.now() - taskStartTime;
      taskLogger.info('task_completed', '任务执行成功', { durationMs, stepType: stepDef.type });

      // 持久化快照
      this._persistSnapshot(jobId);

      // 异步触发下一批任务（避免递归调用栈过深）
      setImmediate(() => {
        this.runNextStep(jobId).catch(err => {
          console.error(`[WorkflowExecutor] 异步调度失败: jobId=${jobId}`, err);
        });
      });

    } catch (error) {
      const durationMs = Date.now() - taskStartTime;

      // 结构化日志：任务失败
      const errLogger = this.logger.child({
        jobId, taskId,
        userId: executionContext?.userId,
        workflowType: executionContext?.workflowType
      });
      errLogger.error('task_failed', `任务执行失败: ${error.message}`, {
        stepType: stepDef.type,
        durationMs,
        errorType: error.name || 'Error',
        errorStack: error.stack?.substring(0, 500),
        isTimeout: error.message.includes('超时')
      });
      
      // 从正在运行集合中移除
      const running = this.runningTasks.get(jobId);
      if (running) running.delete(taskId);

      // ── 重试逻辑 ──
      const taskInfo = await queryOne(
        `SELECT retry_count, max_retries FROM generation_tasks WHERE id = ?`,
        [taskId]
      );
      const retryCount = (taskInfo?.retry_count || 0) + 1;
      const maxRetries = taskInfo?.max_retries || TASK_MAX_RETRIES;

      // 构建错误详情（记录到 retry_reason 字段）
      const retryReason = JSON.stringify({
        attempt: retryCount,
        maxRetries,
        errorType: error.name || 'Error',
        errorMessage: error.message,
        errorStack: error.stack?.substring(0, 2000),
        timestamp: new Date().toISOString(),
        stepType: stepDef.type
      });

      if (retryCount <= maxRetries) {
        // 自动重试
        const delayMs = TASK_RETRY_BASE_DELAY_MS * Math.pow(2, retryCount - 1); // 指数退避

        errLogger.warn('task_retrying', `任务进入重试 (${retryCount}/${maxRetries})`, {
          retryCount,
          maxRetries,
          delayMs,
          errorType: error.name
        });

        await execute(
          `UPDATE generation_tasks 
           SET status = 'retrying', retry_count = ?, retry_reason = ?, error_message = ?, progress = 0 
           WHERE id = ?`,
          [retryCount, retryReason, error.message, taskId]
        );

        // 延迟后重新调度
        setTimeout(() => {
          // 将状态重置为 pending 让调度器重新抓取
          execute(
            `UPDATE generation_tasks SET status = 'pending', error_message = NULL WHERE id = ? AND status = 'retrying'`,
            [taskId]
          ).then(() => {
            this.runNextStep(jobId).catch(err => {
              console.error(`[WorkflowExecutor] 重试调度失败: jobId=${jobId}`, err);
            });
          }).catch(err => {
            console.error(`[WorkflowExecutor] 重试状态重置失败: taskId=${taskId}`, err);
          });
        }, delayMs);

        return; // 不继续执行后续失败逻辑
      }

      // 超过最大重试次数，标记最终失败
      errLogger.error('task_failed_final', `任务最终失败 (已重试 ${retryCount - 1} 次)`, {
        retryCount: retryCount - 1,
        maxRetries,
        stepType: stepDef.type,
        durationMs
      });

      await execute(
        `UPDATE generation_tasks 
         SET retry_count = ?, retry_reason = ?, error_message = ?
         WHERE id = ?`,
        [retryCount, retryReason, error.message, taskId]
      );

      await this.jobStatusManager.failTask(taskId, error.message, error._trace || null);

      // 获取工作流定义的失败策略
      const definition = getWorkflowDefinition(
        (await queryOne('SELECT workflow_type FROM workflow_jobs WHERE id = ?', [jobId]))?.workflow_type
      );
      const failPolicy = definition?.failPolicy || 'fail_fast';

      if (failPolicy === 'continue_independent') {
        // 检查是否还有不依赖失败任务的独立分支可继续
        const allTasks = await queryAll(
          'SELECT * FROM generation_tasks WHERE job_id = ? ORDER BY step_index ASC',
          [jobId]
        );
        const failedStepIndex = allTasks.find(t => t.id === taskId)?.step_index;
        const hasIndependentPending = allTasks.some(t => {
          if (t.status !== 'pending') return false;
          const sd = definition?.steps?.[t.step_index];
          if (!sd) return false;
          const deps = sd.dependencies || [];
          return !deps.includes(failedStepIndex);
        });

        if (hasIndependentPending) {
          console.log(`[WorkflowExecutor] failPolicy=continue_independent，继续独立分支: jobId=${jobId}`);
          setImmediate(() => {
            this.runNextStep(jobId).catch(err => {
              console.error(`[WorkflowExecutor] 独立分支调度失败: jobId=${jobId}`, err);
            });
          });
          return;
        }
        console.log(`[WorkflowExecutor] 无独立分支可继续，标记工作流失败: jobId=${jobId}`);
      }

      await this.jobStatusManager.failJob(jobId, `步骤执行失败: ${error.message}`);
      await this._invalidateJobCache(jobId);

      // 异步发布工作流失败事件（不阻塞主流程）
      if (PubSubService && PubSubService.isAvailable()) {
        const failedJob = await queryOne('SELECT * FROM workflow_jobs WHERE id = ?', [jobId]);
        PubSubService.publish('workflow:failed', {
          jobId: jobId,
          userId: failedJob?.user_id,
          status: 'failed',
          workflowType: failedJob?.workflow_type,
          error: error?.message || '未知错误',
          failedAt: new Date().toISOString()
        }).catch(err => {
          console.warn('[PubSub] 发布工作流失败事件失败:', err.message);
        });
      }

      // 持久化最终快照
      this._persistSnapshot(jobId);
    }
  }

  /**
   * 延迟恢复被中断的工作流（应在数据库初始化完成后调用）
   */
  async recoverIfNeeded() {
    if (!this._recoveryDeferred || this._recoveryRunning) return;
    this._recoveryRunning = true;
    this._recoveryDeferred = false;
    try {
      await this._recoverInterruptedJobs();
    } catch (err) {
      console.error('[WorkflowExecutor] 恢复工作流失败:', err);
    } finally {
      this._recoveryRunning = false;
    }
  }

  /**
   * 获取执行器运行时统计
   */
  getStats() {
    const memory = this.memoryManager.getMemoryUsage();
    return {
      memory,
      activeJobs: this.stepCounters.size,
      runningTaskSets: this.runningTasks.size,
      backpressure: {
        active: this.backpressure.isActive,
        pendingCount: this.backpressure.pendingCount,
        threshold: BACKPRESSURE_THRESHOLD
      },
      config: {
        maxSteps: MAX_STEPS,
        maxConcurrentTasks: MAX_CONCURRENT_TASKS,
        taskTimeout: TASK_TIMEOUT,
        memoryThreshold: MEMORY_THRESHOLD_MB
      }
    };
  }

  /**
   * 关闭执行器（优雅退出）
   */
  async shutdown() {
    this.memoryManager.stopMonitoring();
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
    if (this.snapshotTimer) {
      clearInterval(this.snapshotTimer);
      this.snapshotTimer = null;
    }
    // 退出前最终持久化所有快照
    await this._persistAllSnapshots();
    // 刷新日志缓冲
    await this.logger.flush();
    this.stepCounters.clear();
    this.runningTasks.clear();
    // 重置恢复标记，确保下次初始化可正常恢复
    this._recoveryDeferred = true;
  }
}

module.exports = WorkflowExecutor;
