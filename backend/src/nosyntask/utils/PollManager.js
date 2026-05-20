/**
 * 统一轮询调度管理器（单例）
 * 
 * 将所有异步任务的轮询集中到一个统一的调度器中管理，避免：
 * 1. 每个任务独立维护 setTimeout 定时器（3500个任务 = 3500个定时器）
 * 2. 轮询请求无序发出，无法统一控制并发
 * 3. 内存中大量定时器对象占用 heap
 * 
 * 工作原理：
 * - 使用单个 setInterval 定时器驱动（tick 间隔 1 秒）
 * - 每个任务注册时指定轮询间隔、自适应策略、超时等参数
 * - 每次 tick 检查哪些任务到了轮询时间，批量发出查询
 * - 使用 withPollRateLimit 控制同时发出的轮询请求数
 */

const { queryAIModel } = require('../../aiModelService');
const { withPollRateLimit } = require('./aiRateLimiter');

// 模型类型到推荐轮询间隔的映射（基于 M/M/c 排队模型理论）
// 不同服务时间的任务应有不同的轮询策略，避免短任务过慢查询、长任务过频查询
const MODEL_POLL_INTERVALS = {
  // 文本类（通常 5-15s 完成）—— 初始间隔短，最大间隔也短
  'Doubao-pro': { initialMs: 3000, maxMs: 10000 },
  'Doubao-pro-32k': { initialMs: 3000, maxMs: 10000 },
  'Doubao-pro-256k': { initialMs: 3000, maxMs: 10000 },
  'DeepSeek-V3': { initialMs: 3000, maxMs: 10000 },
  'DeepSeek-R1': { initialMs: 5000, maxMs: 15000 },
  // 图片类（通常 10-30s 完成）—— 中等间隔
  'Seedream 3.0': { initialMs: 5000, maxMs: 20000 },
  'Seedream 4.0': { initialMs: 5000, maxMs: 20000 },
  'Seedream 4.5': { initialMs: 5000, maxMs: 20000 },
  'Seedream 5.0 Lite': { initialMs: 5000, maxMs: 20000 },
  // 视频类（通常 60-300s 完成）—— 长间隔
  'Seedance 1.0': { initialMs: 15000, maxMs: 60000 },
  'Seedance 1.0 Pro': { initialMs: 20000, maxMs: 60000 },
  'Seedance 2.0': { initialMs: 15000, maxMs: 60000 },
  'Kling': { initialMs: 15000, maxMs: 60000 },
  // 多模态理解（通常3-15s完成，同步API为主）
  'Doubao-Seed-2.0-Pro': { initialMs: 3000, maxMs: 15000 },
  // 默认配置
  '_default': { initialMs: 10000, maxMs: 30000 }
};

/**
 * 根据模型名称获取推荐轮询配置
 * 支持模糊匹配：如 "Seedream 4.5" 可以匹配 "Seedream"
 */
function getModelPollConfig(modelName) {
  // 精确匹配
  if (MODEL_POLL_INTERVALS[modelName]) {
    return MODEL_POLL_INTERVALS[modelName];
  }
  // 前缀模糊匹配
  for (const [key, config] of Object.entries(MODEL_POLL_INTERVALS)) {
    if (key !== '_default' && modelName && modelName.startsWith(key.split(' ')[0])) {
      return config;
    }
  }
  return MODEL_POLL_INTERVALS['_default'];
}

// 轮询任务状态
const POLL_STATUS = {
  ACTIVE: 'active',
  COMPLETED: 'completed',
  FAILED: 'failed',
  TIMEOUT: 'timeout'
};

class PollManager {
  constructor() {
    // 注册的轮询任务 Map<pollId, PollTask>
    this.tasks = new Map();
    // 调度器定时器
    this.tickTimer = null;
    // tick 间隔（毫秒）
    this.tickInterval = 1000;
    // 统计
    this.stats = {
      totalRegistered: 0,
      totalCompleted: 0,
      totalFailed: 0,
      totalTimeout: 0,
      totalPollRequests: 0,
      peakActiveTasks: 0
    };
  }

  /**
   * 启动调度器
   */
  start() {
    if (this.tickTimer) return;
    this.tickTimer = setInterval(() => this._tick(), this.tickInterval);
    console.log(`[PollManager] 调度器已启动 (tick间隔: ${this.tickInterval}ms)`);
  }

  /**
   * 停止调度器
   */
  stop() {
    if (this.tickTimer) {
      clearInterval(this.tickTimer);
      this.tickTimer = null;
    }
    // 清理所有等待中的任务
    for (const [pollId, task] of this.tasks) {
      if (task.status === POLL_STATUS.ACTIVE) {
        task.reject(new Error('PollManager 已关闭'));
      }
    }
    this.tasks.clear();
    console.log('[PollManager] 调度器已停止');
  }

  /**
   * 注册一个轮询任务
   * 
   * @param {object} params - 轮询参数
   * @param {string} params.modelName - 模型名称
   * @param {object} params.queryFields - 传给 queryAIModel 的字段（含 taskId 等）
   * @param {number} params.intervalMs - 初始轮询间隔（毫秒）
   * @param {number} params.maxDurationMs - 最大等待时间（毫秒）
   * @param {number} params.maxNetworkErrors - 连续网络错误上限
   * @param {boolean} params.adaptiveInterval - 是否自适应增长间隔
   * @param {number} params.intervalMultiplier - 间隔增长系数
   * @param {number} params.maxIntervalMs - 最大轮询间隔
   * @param {string} params.logTag - 日志标签
   * @param {function} params.onPollResult - 每次轮询结果回调 (queryResult) => { status: 'success'|'failed'|'pending', data }
   * @param {function} params.onProgress - 进度回调
   * @param {number} params.progressStart - 进度起始百分比
   * @param {number} params.progressEnd - 进度结束百分比
   * @returns {Promise<object>} - 轮询成功时 resolve，失败/超时时 reject
   */
  register(params) {
    const pollId = `${params.modelName}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    
    return new Promise((resolve, reject) => {
      const modelConfig = getModelPollConfig(params.modelName);
      const task = {
        pollId,
        modelName: params.modelName,
        queryFields: params.queryFields,
        apiKey: params.apiKey || null,
        intervalMs: params.intervalMs || modelConfig.initialMs,
        currentInterval: params.intervalMs || modelConfig.initialMs,
        maxDurationMs: params.maxDurationMs || 600000,
        maxNetworkErrors: params.maxNetworkErrors || 5,
        adaptiveInterval: params.adaptiveInterval !== false,
        intervalMultiplier: params.intervalMultiplier || 1.5,
        maxIntervalMs: params.maxIntervalMs || modelConfig.maxMs,
        logTag: params.logTag || 'PollManager',
        onPollResult: params.onPollResult,
        onProgress: params.onProgress,
        progressStart: params.progressStart || 30,
        progressEnd: params.progressEnd || 90,
        
        // 内部状态
        status: POLL_STATUS.ACTIVE,
        startTime: Date.now(),
        lastPollTime: 0,
        pollCount: 0,
        networkErrors: 0,
        resolve,
        reject
      };

      this.tasks.set(pollId, task);
      this.stats.totalRegistered++;
      this.stats.peakActiveTasks = Math.max(this.stats.peakActiveTasks, this.tasks.size);

      // 确保调度器运行
      this.start();

      const configSource = params.intervalMs ? '自定义' : `模型推荐(${params.modelName})`;
      console.log(`[PollManager] 注册任务: ${pollId} (模型: ${params.modelName}, 间隔: ${task.intervalMs}ms, 最大: ${task.maxIntervalMs}ms, 超时: ${task.maxDurationMs}ms, 来源: ${configSource})`);
    });
  }

  /**
   * 核心 tick：检查所有任务，发出到期的轮询请求
   */
  async _tick() {
    const now = Date.now();
    const readyTasks = [];

    for (const [pollId, task] of this.tasks) {
      if (task.status !== POLL_STATUS.ACTIVE) continue;

      // 超时检查
      const elapsed = now - task.startTime;
      if (elapsed > task.maxDurationMs) {
        task.status = POLL_STATUS.TIMEOUT;
        this.stats.totalTimeout++;
        task.reject(new Error(`轮询超时：已等待 ${Math.round(elapsed / 1000)} 秒 (${task.pollId})`));
        this.tasks.delete(pollId);
        continue;
      }

      // 检查是否到了轮询时间
      const timeSinceLastPoll = now - task.lastPollTime;
      if (timeSinceLastPoll >= task.currentInterval) {
        readyTasks.push(task);
      }
    }

    // 并行执行到期的轮询请求（受 withPollRateLimit 控制并发）
    if (readyTasks.length > 0) {
      // 不用 await，让轮询异步执行不阻塞 tick
      this._executeBatchPolls(readyTasks);
    }

    // 如果没有活跃任务，停止调度器节省资源
    const activeCount = Array.from(this.tasks.values()).filter(t => t.status === POLL_STATUS.ACTIVE).length;
    if (activeCount === 0 && this.tickTimer) {
      clearInterval(this.tickTimer);
      this.tickTimer = null;
    }
  }

  /**
   * 批量执行轮询请求
   */
  async _executeBatchPolls(tasks) {
    const executions = tasks.map(task => this._executeSinglePoll(task));
    // 使用 allSettled 确保一个失败不影响其他
    await Promise.allSettled(executions);
  }

  /**
   * 执行单个轮询请求
   */
  async _executeSinglePoll(task) {
    if (task.status !== POLL_STATUS.ACTIVE) return;

    task.lastPollTime = Date.now();
    task.pollCount++;
    const elapsed = Date.now() - task.startTime;

    // 自适应增加轮询间隔
    if (task.adaptiveInterval && task.currentInterval < task.maxIntervalMs) {
      task.currentInterval = Math.min(
        Math.round(task.currentInterval * task.intervalMultiplier),
        task.maxIntervalMs
      );
    }

    // 更新进度
    if (task.onProgress) {
      const ratio = Math.min(elapsed / task.maxDurationMs, 1);
      const progress = Math.round(task.progressStart + ratio * (task.progressEnd - task.progressStart));
      task.onProgress(Math.min(progress, task.progressEnd));
    }

    try {
      // 使用轮询限流池控制并发
      const queryResult = await withPollRateLimit(
        () => queryAIModel(task.modelName, task.queryFields, task.apiKey),
        { logTag: task.logTag }
      );

      this.stats.totalPollRequests++;
      task.networkErrors = 0;

      console.log(`[${task.logTag}] 第 ${task.pollCount} 次查询, elapsed=${Math.round(elapsed / 1000)}s`);
      console.log(`[${task.logTag}] 查询原始响应:`, JSON.stringify(queryResult?._raw || queryResult, null, 2));

      // 调用结果判断回调
      if (task.onPollResult) {
        const result = task.onPollResult(queryResult);

        if (result.status === 'success') {
          task.status = POLL_STATUS.COMPLETED;
          this.stats.totalCompleted++;
          console.log(`[${task.logTag}] 任务完成: ${task.pollId}, 耗时=${Math.round((Date.now() - task.startTime) / 1000)}s, 轮询${task.pollCount}次`);
          task.resolve(result.data);
          this.tasks.delete(task.pollId);
        } else if (result.status === 'failed') {
          task.status = POLL_STATUS.FAILED;
          this.stats.totalFailed++;
          console.log(`[${task.logTag}] 任务失败: ${task.pollId}, 错误=${result.error}`);
          task.reject(new Error(result.error || '任务失败'));
          this.tasks.delete(task.pollId);
        }
        // pending: 继续等待下次 tick
        else {
          console.log(`[${task.logTag}] 任务继续轮询: ${task.pollId}, status=pending, 下次间隔=${task.currentInterval}ms`);
        }
      }
    } catch (err) {
      // 区分轮询限流超时和网络错误
      if (err.message?.includes('限流等待超时')) {
        console.warn(`[${task.logTag}] 第 ${task.pollCount} 次查询轮询槽位等待超时，跳过本轮`);
        return;
      }

      task.networkErrors++;
      console.warn(`[${task.logTag}] 第 ${task.pollCount} 次查询网络错误 (${task.networkErrors}/${task.maxNetworkErrors}):`, err.message);

      if (task.networkErrors >= task.maxNetworkErrors) {
        task.status = POLL_STATUS.FAILED;
        this.stats.totalFailed++;
        task.reject(new Error(`轮询失败：连续 ${task.networkErrors} 次网络错误: ${err.message}`));
        this.tasks.delete(task.pollId);
      }
    }
  }

  /**
   * 获取统计信息
   */
  getStats() {
    const activeTasks = Array.from(this.tasks.values()).filter(t => t.status === POLL_STATUS.ACTIVE);
    return {
      ...this.stats,
      currentActiveTasks: activeTasks.length,
      schedulerRunning: !!this.tickTimer,
      taskDetails: activeTasks.map(t => ({
        pollId: t.pollId,
        modelName: t.modelName,
        pollCount: t.pollCount,
        elapsed: Math.round((Date.now() - t.startTime) / 1000),
        currentInterval: t.currentInterval
      }))
    };
  }
}

// 单例
const pollManager = new PollManager();

module.exports = pollManager;
