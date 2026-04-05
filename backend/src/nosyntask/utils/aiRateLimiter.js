/**
 * AI 调用全局限流器（支持按角色动态配置）
 * 
 * 使用信号量模式控制并发数，防止：
 * 1. 多用户同时触发大量 AI 任务导致 API 限流（429 错误）
 * 2. 数据库连接池耗尽
 * 3. 服务器内存/CPU 过载
 * 
 * 配置参数从数据库 rate_limit_configs 表读取，支持按角色配置不同限额
 */

const { queryAll, queryOne } = require('../../dbHelper');
const { CircuitBreaker, CircuitBreakerOpenError } = require('./CircuitBreaker');

// 默认配置（数据库加载前或加载失败时使用）
const DEFAULT_CONFIG = {
  max_concurrent_text: 15,
  max_concurrent_image: 15,
  max_concurrent_video: 15,
  max_concurrent_poll: 100,  // 轮询阶段独立并发池
  timeout_seconds: 600,
  retry_delay_ms: 60000,
  max_retries: 3
};

// 缓存的配置（按角色索引）
let configCache = {};
let defaultConfig = { ...DEFAULT_CONFIG };
let configLoaded = false;

/**
 * 公平信号量实现（支持按用户轮流分配槽位）
 * 
 * 当多个用户同时排队时，采用 Round-Robin 策略：
 * 每次释放槽位时，优先选择等待队列中不同用户的任务，
 * 而不是先到先服务（FIFO），避免一个用户独占所有槽位。
 */
class Semaphore {
  constructor(maxConcurrent, name = 'unknown') {
    this.maxConcurrent = maxConcurrent;
    this.name = name;
    this.current = 0;
    this.queue = [];
    this.lastServedUserIndex = -1; // 上次服务的用户在 uniqueUsers 列表中的索引
    this.stats = {
      acquired: 0,
      released: 0,
      maxWaitingReached: 0,
      totalWaitTime: 0
    };
  }

  // 动态更新最大并发数
  updateMaxConcurrent(newMax) {
    const oldMax = this.maxConcurrent;
    this.maxConcurrent = newMax;
    console.log(`[RateLimiter] ${this.name} 并发限制更新: ${oldMax} -> ${newMax}`);
    
    // 如果增加了限额，尝试释放等待队列（使用公平调度）
    while (this.queue.length > 0 && this.current < this.maxConcurrent) {
      const next = this._pickNextFair();
      if (!next) break;
      this.current++;
      next.resolve();
    }
  }

  /**
   * 从等待队列中公平选取下一个任务
   * Round-Robin：轮流服务不同用户
   */
  _pickNextFair() {
    if (this.queue.length === 0) return null;

    // 收集队列中所有不同的用户
    const uniqueUsers = [...new Set(this.queue.map(item => item.userId || 'anonymous'))];
    
    if (uniqueUsers.length <= 1) {
      // 只有一个用户（或全匿名），直接 FIFO
      return this.queue.shift();
    }

    // Round-Robin: 从上次服务用户的下一个开始找
    this.lastServedUserIndex = (this.lastServedUserIndex + 1) % uniqueUsers.length;
    const targetUser = uniqueUsers[this.lastServedUserIndex];

    // 找到该用户的第一个等待任务
    const idx = this.queue.findIndex(item => (item.userId || 'anonymous') === targetUser);
    if (idx !== -1) {
      return this.queue.splice(idx, 1)[0];
    }

    // 兜底：直接取队首
    return this.queue.shift();
  }

  async acquire(timeout = 300000, userId = null) {
    const startTime = Date.now();
    
    if (this.current < this.maxConcurrent) {
      this.current++;
      this.stats.acquired++;
      return { acquired: true, waitTime: 0, queuePosition: 0 };
    }

    // 需要等待
    const queuePosition = this.queue.length + 1;
    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        const idx = this.queue.findIndex(item => item._id === itemId);
        if (idx !== -1) {
          this.queue.splice(idx, 1);
        }
        reject(new Error(`AI 限流等待超时（${timeout / 1000}秒），当前队列长度: ${this.queue.length}`));
      }, timeout);

      const itemId = `${userId || 'anon'}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;

      this.queue.push({
        _id: itemId,
        userId: userId || null,
        resolve: () => {
          clearTimeout(timeoutId);
          const waitTime = Date.now() - startTime;
          this.stats.totalWaitTime += waitTime;
          this.stats.acquired++;
          resolve({ acquired: true, waitTime, queuePosition });
        }
      });

      this.stats.maxWaitingReached = Math.max(this.stats.maxWaitingReached, this.queue.length);
    });
  }

  release() {
    this.current--;
    this.stats.released++;
    
    if (this.queue.length > 0 && this.current < this.maxConcurrent) {
      const next = this._pickNextFair();
      if (next) {
        this.current++;
        next.resolve();
      }
    }
  }

  getStats() {
    // 统计队列中各用户的等待数
    const userWaiting = {};
    for (const item of this.queue) {
      const uid = item.userId || 'anonymous';
      userWaiting[uid] = (userWaiting[uid] || 0) + 1;
    }

    return {
      ...this.stats,
      current: this.current,
      waiting: this.queue.length,
      maxConcurrent: this.maxConcurrent,
      avgWaitTime: this.stats.acquired > 0 ? Math.round(this.stats.totalWaitTime / this.stats.acquired) : 0,
      userWaiting
    };
  }
}

// 按角色存储信号量实例
const semaphoresByRole = {};

/**
 * 获取或创建角色的信号量组
 */
function getSemaphoresForRole(role) {
  if (!semaphoresByRole[role]) {
    const config = configCache[role] || defaultConfig;
    semaphoresByRole[role] = {
      text: new Semaphore(config.max_concurrent_text, `${role}-text`),
      image: new Semaphore(config.max_concurrent_image, `${role}-image`),
      video: new Semaphore(config.max_concurrent_video, `${role}-video`),
      poll: new Semaphore(config.max_concurrent_poll || DEFAULT_CONFIG.max_concurrent_poll, `${role}-poll`)
    };
  }
  return semaphoresByRole[role];
}

/**
 * 从数据库加载配置
 */
async function loadConfigsFromDB() {
  try {
    const configs = await queryAll(
      'SELECT * FROM rate_limit_configs WHERE is_active = 1'
    );

    const newCache = {};
    for (const config of configs) {
      if (config.role === 'default') {
        defaultConfig = {
          max_concurrent_text: config.max_concurrent_text || DEFAULT_CONFIG.max_concurrent_text,
          max_concurrent_image: config.max_concurrent_image || DEFAULT_CONFIG.max_concurrent_image,
          max_concurrent_video: config.max_concurrent_video || DEFAULT_CONFIG.max_concurrent_video,
          timeout_seconds: config.timeout_seconds || DEFAULT_CONFIG.timeout_seconds,
          retry_delay_ms: config.retry_delay_ms || DEFAULT_CONFIG.retry_delay_ms,
          max_retries: config.max_retries || DEFAULT_CONFIG.max_retries
        };
      } else {
        newCache[config.role] = {
          max_concurrent_text: config.max_concurrent_text,
          max_concurrent_image: config.max_concurrent_image,
          max_concurrent_video: config.max_concurrent_video,
          timeout_seconds: config.timeout_seconds,
          retry_delay_ms: config.retry_delay_ms,
          max_retries: config.max_retries
        };
      }
    }

    configCache = newCache;
    configLoaded = true;
    console.log(`[RateLimiter] 已从数据库加载 ${configs.length} 个限流配置`);

    // 更新已存在的信号量
    for (const role in semaphoresByRole) {
      const config = configCache[role] || defaultConfig;
      semaphoresByRole[role].text.updateMaxConcurrent(config.max_concurrent_text);
      semaphoresByRole[role].image.updateMaxConcurrent(config.max_concurrent_image);
      semaphoresByRole[role].video.updateMaxConcurrent(config.max_concurrent_video);
      if (semaphoresByRole[role].poll) {
        semaphoresByRole[role].poll.updateMaxConcurrent(config.max_concurrent_poll || DEFAULT_CONFIG.max_concurrent_poll);
      }
    }

    return true;
  } catch (err) {
    // 表可能不存在（迁移未执行），使用默认配置
    console.warn('[RateLimiter] 加载数据库配置失败，使用默认配置:', err.message);
    return false;
  }
}

/**
 * 重新加载配置（供管理员修改后调用）
 */
async function reloadRateLimitConfigs() {
  return loadConfigsFromDB();
}

/**
 * 确保配置已加载
 */
async function ensureConfigLoaded() {
  if (!configLoaded) {
    await loadConfigsFromDB();
  }
}

/**
 * 获取角色的配置
 */
function getConfigForRole(role) {
  return configCache[role] || defaultConfig;
}

/**
 * 根据模型类型获取对应的限流器
 * @param {string} modelName - 模型名称
 * @param {string} userRole - 用户角色
 * @returns {Semaphore}
 */
function getSemaphoreForModel(modelName, userRole = 'default') {
  const name = (modelName || '').toLowerCase();
  const semaphores = getSemaphoresForRole(userRole);
  
  // 视频模型限流最严格
  if (name.includes('video') || name.includes('kling') || name.includes('runway') || name.includes('pika')) {
    return semaphores.video;
  }
  
  // 图片模型次之
  if (name.includes('image') || name.includes('flux') || name.includes('sd') || name.includes('midjourney') || name.includes('dall')) {
    return semaphores.image;
  }
  
  // 其他（文本模型）
  return semaphores.text;
}

/**
 * 带限流的执行包装器（完整生命周期：提交+轮询期间持有信号量）
 * @param {string} modelName - 模型名称（用于选择限流器）
 * @param {Function} fn - 要执行的异步函数
 * @param {object} options - 选项
 * @returns {Promise<any>}
 */
async function withRateLimit(modelName, fn, options = {}) {
  await ensureConfigLoaded();
  
  const { 
    timeout, 
    logTag = 'RateLimiter',
    userRole = 'default',
    userId = null
  } = options;
  
  const config = getConfigForRole(userRole);
  const actualTimeout = timeout || (config.timeout_seconds * 1000);
  const semaphore = getSemaphoreForModel(modelName, userRole);
  
  const { waitTime, queuePosition } = await semaphore.acquire(actualTimeout, userId);
  
  if (waitTime > 1000) {
    console.log(`[${logTag}] 限流等待 ${Math.round(waitTime / 1000)}s 后获取到执行槽位 (角色: ${userRole}, 用户: ${userId || 'unknown'}, 排队位: ${queuePosition})`);
  }
  
  try {
    return await fn();
  } finally {
    semaphore.release();
  }
}

/**
 * 仅提交阶段的限流包装器（提交完成后立即释放信号量）
 * 用于异步任务：提交请求获取 taskId 后释放并发槽，不在轮询期间占用
 * @param {string} modelName - 模型名称
 * @param {Function} fn - 提交函数
 * @param {object} options - 选项
 * @returns {Promise<any>}
 */
async function withSubmitRateLimit(modelName, fn, options = {}) {
  await ensureConfigLoaded();
  
  const { 
    timeout, 
    logTag = 'RateLimiter',
    userRole = 'default',
    userId = null
  } = options;
  
  const config = getConfigForRole(userRole);
  const actualTimeout = timeout || (config.timeout_seconds * 1000);
  const semaphore = getSemaphoreForModel(modelName, userRole);
  
  const { waitTime, queuePosition } = await semaphore.acquire(actualTimeout, userId);
  
  if (waitTime > 1000) {
    console.log(`[${logTag}] [提交] 限流等待 ${Math.round(waitTime / 1000)}s 后获取到提交槽位 (角色: ${userRole}, 用户: ${userId || 'unknown'}, 排队位: ${queuePosition})`);
  }
  
  try {
    return await fn();
  } finally {
    // 提交完成后立即释放，不在轮询期间占用并发槽
    semaphore.release();
  }
}

/**
 * 轮询阶段的限流包装器（使用独立的 poll 信号量池）
 * 控制同时进行的轮询请求数量，避免大量轮询耗尽网络/内存资源
 * @param {Function} fn - 单次轮询函数
 * @param {object} options - 选项
 * @returns {Promise<any>}
 */
async function withPollRateLimit(fn, options = {}) {
  await ensureConfigLoaded();
  
  const { 
    timeout = 60000,
    logTag = 'RateLimiter',
    userRole = 'default'
  } = options;
  
  const semaphores = getSemaphoresForRole(userRole);
  const pollSemaphore = semaphores.poll;
  
  const { waitTime } = await pollSemaphore.acquire(timeout);
  
  if (waitTime > 2000) {
    console.log(`[${logTag}] [轮询] 限流等待 ${Math.round(waitTime / 1000)}s 后获取到轮询槽位`);
  }
  
  try {
    return await fn();
  } finally {
    pollSemaphore.release();
  }
}

/**
 * 获取所有限流器的统计信息
 * @returns {object}
 */
function getRateLimitStats() {
  const roleStats = {};
  
  for (const role in semaphoresByRole) {
    roleStats[role] = {
      text: semaphoresByRole[role].text.getStats(),
      image: semaphoresByRole[role].image.getStats(),
      video: semaphoresByRole[role].video.getStats(),
      poll: semaphoresByRole[role].poll ? semaphoresByRole[role].poll.getStats() : null
    };
  }
  
  return {
    roleStats,
    configCache,
    defaultConfig,
    configLoaded
  };
}

/**
 * 获取角色的重试配置
 */
function getRetryConfig(userRole = 'default') {
  const config = getConfigForRole(userRole);
  return {
    retryDelayMs: config.retry_delay_ms,
    maxRetries: config.max_retries
  };
}

// 启动时尝试加载配置
loadConfigsFromDB().catch(err => {
  console.warn('[RateLimiter] 启动加载配置失败:', err.message);
});

// ===== 断路器模式 =====
const circuitBreakers = new Map();

function getCircuitBreaker(modelName) {
  if (!circuitBreakers.has(modelName)) {
    circuitBreakers.set(modelName, new CircuitBreaker(
      async (...args) => args[0](...args.slice(1)),
      {
        failureThreshold: 5,
        resetTimeout: 60000,
        halfOpenMaxAttempts: 3,
        onStateChange: (oldState, newState) => {
          console.log(`[CircuitBreaker] 模型 ${modelName}: ${oldState} -> ${newState}`);
        }
      }
    ));
  }
  return circuitBreakers.get(modelName);
}

async function withCircuitBreaker(modelName, fn, ...args) {
  const breaker = getCircuitBreaker(modelName);
  return breaker.call(fn, ...args);
}

function getCircuitBreakerStats() {
  const stats = {};
  for (const [name, breaker] of circuitBreakers) {
    stats[name] = breaker.getStats();
  }
  return stats;
}

module.exports = {
  withRateLimit,
  withSubmitRateLimit,
  withPollRateLimit,
  getSemaphoreForModel,
  getRateLimitStats,
  reloadRateLimitConfigs,
  getConfigForRole,
  getRetryConfig,
  ensureConfigLoaded,
  withCircuitBreaker,
  getCircuitBreakerStats,
  CircuitBreakerOpenError
};
