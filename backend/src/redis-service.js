/**
 * Redis 缓存和分布式任务队列服务
 * 
 * 核心特性：
 * - Redis 为可选依赖，不可用时自动降级为内存模式
 * - CacheService 在无 Redis 时使用本地 LRU Map
 * - TaskQueueService 在无 Redis 时退回数据库轮询模式
 * - 支持单机和集群两种 Redis 部署模式
 * 
 * 安装依赖: npm install ioredis bull
 */

let Redis, Queue;
try {
  Redis = require('ioredis');
  Queue = require('bull');
} catch (e) {
  // ioredis/bull 未安装时，降级为内存模式
  console.warn('[Redis] ioredis/bull 未安装，将使用内存模式');
}

// ============================================
// 状态管理
// ============================================

let redis = null;
let redisAvailable = false;
let taskQueues = new Map();

// 内存 LRU 缓存（Redis 不可用时的降级方案）
const MAX_MEMORY_CACHE_SIZE = 10000;
const memoryCache = new Map();

/**
 * 检查 Redis 是否可用
 */
function isRedisAvailable() {
  return redisAvailable && redis !== null;
}

// ============================================
// Redis 连接配置
// ============================================

function getRedisConfig() {
  return {
    host: process.env.REDIS_HOST || '127.0.0.1',
    port: parseInt(process.env.REDIS_PORT, 10) || 6379,
    password: process.env.REDIS_PASSWORD || undefined,
    db: parseInt(process.env.REDIS_DB, 10) || 0,
    maxRetriesPerRequest: 3,
    retryStrategy: (times) => {
      if (times > 10) return null;
      return Math.min(times * 100, 3000);
    },
    enableReadyCheck: true,
    enableOfflineQueue: true,
    connectTimeout: 10000,
    commandTimeout: 5000,
    reconnectOnError: (err) => {
      return err.message.includes('READONLY');
    },
    // 静默模式：连接失败不抛出
    lazyConnect: true
  };
}

/**
 * Redis 集群配置
 */
function getClusterConfig() {
  const nodesStr = process.env.REDIS_CLUSTER_NODES || '';
  const nodes = nodesStr.split(',').filter(Boolean).map(node => {
    const [host, port] = node.split(':');
    return { host, port: parseInt(port, 10) || 6379 };
  });

  if (nodes.length === 0) return null;

  return {
    nodes,
    redisOptions: {
      password: process.env.REDIS_PASSWORD || undefined,
      maxRetriesPerRequest: 3,
      retryStrategy: (times) => Math.min(times * 100, 3000)
    },
    clusterRetryStrategy: (times) => Math.min(times * 100, 3000),
    enableReadyCheck: true,
    scaleReads: 'slave',
    maxRedirections: 16
  };
}

/**
 * 初始化 Redis 连接（可选，失败时降级为内存模式）
 */
async function initializeRedis() {
  if (!Redis) {
    console.warn('[Redis] ioredis 未安装，使用内存缓存模式');
    return null;
  }

  // 如果没有配置 Redis，直接使用内存模式
  if (!process.env.REDIS_HOST && !process.env.REDIS_CLUSTER_NODES) {
    console.log('[Redis] 未配置 REDIS_HOST，使用内存缓存模式');
    return null;
  }

  try {
    const clusterConfig = getClusterConfig();

    if (clusterConfig) {
      redis = new Redis.Cluster(clusterConfig.nodes, clusterConfig);
      console.log(`[Redis] 集群模式连接中: ${clusterConfig.nodes.length} 节点`);
    } else {
      const config = getRedisConfig();
      redis = new Redis(config);
      await redis.connect();
      console.log(`[Redis] 单机模式连接: ${config.host}:${config.port}`);
    }

    // 连接事件
    redis.on('error', (err) => {
      if (redisAvailable) {
        console.error('[Redis] 连接异常，降级为内存模式:', err.message);
        redisAvailable = false;
      }
    });

    redis.on('ready', () => {
      if (!redisAvailable) {
        console.log('[Redis] 连接恢复');
        redisAvailable = true;
      }
    });

    redis.on('reconnecting', () => {
      console.warn('[Redis] 正在重连...');
    });

    // 验证连接
    await redis.ping();
    redisAvailable = true;
    console.log('[Redis] 连接成功');

    return redis;
  } catch (err) {
    console.warn('[Redis] 连接失败，降级为内存缓存模式:', err.message);
    redis = null;
    redisAvailable = false;
    return null;
  }
}

// ============================================
// 内存 LRU 缓存（降级方案）
// ============================================

function memoryCacheSet(key, value, ttlMs) {
  // 简易 LRU：超过上限时删除最早的 20%
  if (memoryCache.size >= MAX_MEMORY_CACHE_SIZE) {
    const deleteCount = Math.floor(MAX_MEMORY_CACHE_SIZE * 0.2);
    const keys = memoryCache.keys();
    for (let i = 0; i < deleteCount; i++) {
      const k = keys.next().value;
      if (k) memoryCache.delete(k);
    }
  }

  memoryCache.set(key, {
    value,
    expireAt: ttlMs > 0 ? Date.now() + ttlMs : 0
  });
}

function memoryCacheGet(key) {
  const entry = memoryCache.get(key);
  if (!entry) return null;

  // 检查过期
  if (entry.expireAt > 0 && Date.now() > entry.expireAt) {
    memoryCache.delete(key);
    return null;
  }

  return entry.value;
}

function memoryCacheDel(key) {
  memoryCache.delete(key);
}

// ============================================
// 分布式缓存服务（自动降级）
// ============================================

const CacheService = {
  /**
   * 设置缓存
   * @param {string} key
   * @param {any} value
   * @param {number} ttlSeconds - 过期时间（秒）
   */
  async set(key, value, ttlSeconds = 300) {
    const serialized = JSON.stringify(value);

    if (isRedisAvailable()) {
      try {
        if (ttlSeconds > 0) {
          await redis.setex(key, ttlSeconds, serialized);
        } else {
          await redis.set(key, serialized);
        }
        return;
      } catch (e) {
        console.warn('[CacheService] Redis set 失败，降级内存:', e.message);
      }
    }

    memoryCacheSet(key, serialized, ttlSeconds * 1000);
  },

  /**
   * 获取缓存
   */
  async get(key) {
    if (isRedisAvailable()) {
      try {
        const data = await redis.get(key);
        return data ? JSON.parse(data) : null;
      } catch (e) {
        console.warn('[CacheService] Redis get 失败，降级内存:', e.message);
      }
    }

    const data = memoryCacheGet(key);
    return data ? JSON.parse(data) : null;
  },

  /**
   * 删除缓存
   */
  async del(key) {
    if (isRedisAvailable()) {
      try {
        await redis.del(key);
      } catch (e) {
        // 静默失败
      }
    }
    memoryCacheDel(key);
  },

  /**
   * 批量获取
   */
  async mget(keys) {
    if (keys.length === 0) return [];

    if (isRedisAvailable()) {
      try {
        const results = await redis.mget(keys);
        return results.map(r => r ? JSON.parse(r) : null);
      } catch (e) {
        console.warn('[CacheService] Redis mget 失败，降级内存:', e.message);
      }
    }

    return keys.map(key => {
      const data = memoryCacheGet(key);
      return data ? JSON.parse(data) : null;
    });
  },

  /**
   * 批量设置
   */
  async mset(items, defaultTtl = 300) {
    if (isRedisAvailable()) {
      try {
        const pipeline = redis.pipeline();
        for (const item of items) {
          const serialized = JSON.stringify(item.value);
          const ttl = item.ttl || defaultTtl;
          pipeline.setex(item.key, ttl, serialized);
        }
        await pipeline.exec();
        return;
      } catch (e) {
        console.warn('[CacheService] Redis mset 失败，降级内存:', e.message);
      }
    }

    for (const item of items) {
      const ttl = item.ttl || defaultTtl;
      memoryCacheSet(item.key, JSON.stringify(item.value), ttl * 1000);
    }
  },

  /**
   * 缓存穿透保护：先读缓存，未命中则执行函数并缓存
   */
  async getOrSet(key, fetchFn, ttlSeconds = 300, options = {}) {
    // Bloom Filter 前置检查：快速排除不存在的 key
    if (options.bloomFilter) {
      const mightExist = await this.bloomExists(options.bloomFilter, key);
      if (!mightExist) return options.defaultValue !== undefined ? options.defaultValue : null;
    }

    let value = await this.get(key);
    if (value !== null) return value;

    value = await fetchFn();

    // null 也缓存（防穿透），但用更短 TTL
    const actualTtl = value === null ? 60 : ttlSeconds;
    await this.set(key, value, actualTtl);

    return value;
  },

  /**
   * 分布式锁（Redis 可用时才有效）
   */
  async acquireLock(lockKey, ttlMs = 10000) {
    if (!isRedisAvailable()) return `local-${Date.now()}`;

    try {
      const token = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      const result = await redis.set(lockKey, token, 'PX', ttlMs, 'NX');
      return result === 'OK' ? token : null;
    } catch (e) {
      return `local-${Date.now()}`;
    }
  },

  /**
   * 释放分布式锁
   */
  async releaseLock(lockKey, token) {
    if (!isRedisAvailable() || token.startsWith('local-')) return 1;

    try {
      const script = `
        if redis.call("get", KEYS[1]) == ARGV[1] then
          return redis.call("del", KEYS[1])
        else
          return 0
        end
      `;
      return await redis.eval(script, 1, lockKey, token);
    } catch (e) {
      return 0;
    }
  },

  /**
   * 计数器（用于限流统计）
   */
  async incr(key, ttlSeconds = 60) {
    if (isRedisAvailable()) {
      try {
        const count = await redis.incr(key);
        if (count === 1) {
          await redis.expire(key, ttlSeconds);
        }
        return count;
      } catch (e) {
        // 降级
      }
    }

    // 内存计数
    const current = memoryCacheGet(key);
    const count = (current ? parseInt(current) : 0) + 1;
    memoryCacheSet(key, String(count), ttlSeconds * 1000);
    return count;
  },

  // ============================================
  // Bloom Filter（防缓存穿透）
  // 理论基础：Bloom, 1970 - Space/Time Trade-offs in Hash Coding
  // 使用 k 个哈希函数映射到 m 位的位数组，O(1) 时间判断元素不存在
  // ============================================

  /**
   * 初始化 Bloom Filter
   * @param {string} filterName - 过滤器名称
   * @param {number} expectedItems - 预期元素数量
   * @param {number} errorRate - 期望误判率（0.01 = 1%）
   */
  async bloomInit(filterName, expectedItems = 10000, errorRate = 0.01) {
    // 计算最优参数：m = -(n * ln(p)) / (ln2)^2, k = (m/n) * ln2
    const m = Math.ceil(-(expectedItems * Math.log(errorRate)) / (Math.log(2) ** 2));
    const k = Math.round((m / expectedItems) * Math.log(2));
    
    const config = { m, k, expectedItems, errorRate, count: 0 };
    
    if (isRedisAvailable()) {
      try {
        await redis.set(`bloom:config:${filterName}`, JSON.stringify(config));
        return config;
      } catch (e) {
        console.warn('[Bloom] Redis bloomInit 失败，降级内存:', e.message);
      }
    }
    
    // 内存降级：使用 Set
    if (!this._memoryBlooms) this._memoryBlooms = new Map();
    this._memoryBlooms.set(filterName, { config, set: new Set() });
    return config;
  },

  /**
   * 向 Bloom Filter 添加元素
   */
  async bloomAdd(filterName, value) {
    if (isRedisAvailable()) {
      try {
        const configStr = await redis.get(`bloom:config:${filterName}`);
        if (!configStr) return false;
        const config = JSON.parse(configStr);
        
        const hashes = this._bloomHashes(value, config.k, config.m);
        const pipeline = redis.pipeline();
        for (const pos of hashes) {
          pipeline.setbit(`bloom:bits:${filterName}`, pos, 1);
        }
        await pipeline.exec();
        
        config.count++;
        await redis.set(`bloom:config:${filterName}`, JSON.stringify(config));
        return true;
      } catch (e) {
        console.warn('[Bloom] Redis bloomAdd 失败:', e.message);
      }
    }
    
    // 内存降级
    if (this._memoryBlooms && this._memoryBlooms.has(filterName)) {
      this._memoryBlooms.get(filterName).set.add(String(value));
      return true;
    }
    return false;
  },

  /**
   * 检查元素是否可能存在于 Bloom Filter
   * 返回 false = 一定不存在，返回 true = 可能存在（有误判率）
   */
  async bloomExists(filterName, value) {
    if (isRedisAvailable()) {
      try {
        const configStr = await redis.get(`bloom:config:${filterName}`);
        if (!configStr) return true; // 无过滤器时不拦截
        const config = JSON.parse(configStr);
        
        const hashes = this._bloomHashes(value, config.k, config.m);
        for (const pos of hashes) {
          const bit = await redis.getbit(`bloom:bits:${filterName}`, pos);
          if (bit === 0) return false; // 一定不存在
        }
        return true; // 可能存在
      } catch (e) {
        return true; // 出错时不拦截
      }
    }
    
    // 内存降级
    if (this._memoryBlooms && this._memoryBlooms.has(filterName)) {
      return this._memoryBlooms.get(filterName).set.has(String(value));
    }
    return true; // 无过滤器时不拦截
  },

  /**
   * 计算多个哈希值（使用双哈希技术模拟 k 个哈希函数）
   * h_i(x) = (h1(x) + i * h2(x)) mod m
   */
  _bloomHashes(value, k, m) {
    const str = String(value);
    const h1 = this._fnv1a(str);
    const h2 = this._djb2(str);
    const hashes = [];
    for (let i = 0; i < k; i++) {
      hashes.push(Math.abs((h1 + i * h2) % m));
    }
    return hashes;
  },

  /** FNV-1a 哈希 */
  _fnv1a(str) {
    let hash = 0x811c9dc5;
    for (let i = 0; i < str.length; i++) {
      hash ^= str.charCodeAt(i);
      hash = (hash * 0x01000193) >>> 0;
    }
    return hash;
  },

  /** DJB2 哈希 */
  _djb2(str) {
    let hash = 5381;
    for (let i = 0; i < str.length; i++) {
      hash = ((hash << 5) + hash) + str.charCodeAt(i);
      hash = hash >>> 0;
    }
    return hash;
  },

  /**
   * 缓存预热：批量加载高频数据到缓存
   * 理论基础：缓存层次理论 —— 预热消除冷启动延迟
   * 
   * @param {Array<{key: string, fetchFn: Function, ttl: number}>} warmupTasks
   * @returns {object} 预热统计
   */
  async warmup(warmupTasks) {
    if (!warmupTasks || warmupTasks.length === 0) return { total: 0 };
    
    const startTime = Date.now();
    console.log(`[CacheWarmup] 开始预热 ${warmupTasks.length} 项缓存...`);
    
    const results = await Promise.allSettled(
      warmupTasks.map(async (task) => {
        try {
          const value = await task.fetchFn();
          if (value !== null && value !== undefined) {
            await this.set(task.key, value, task.ttl || 3600);
            return { key: task.key, success: true };
          }
          return { key: task.key, success: false, reason: '数据为空' };
        } catch (err) {
          return { key: task.key, success: false, reason: err.message };
        }
      })
    );
    
    const succeeded = results.filter(r => r.status === 'fulfilled' && r.value.success).length;
    const failed = results.length - succeeded;
    const elapsed = Date.now() - startTime;
    
    console.log(`[CacheWarmup] 预热完成: 成功 ${succeeded}/${results.length}, 失败 ${failed}, 耗时 ${elapsed}ms`);
    
    // 输出失败详情
    results.forEach(r => {
      if (r.status === 'fulfilled' && !r.value.success) {
        console.warn(`[CacheWarmup] 预热失败: ${r.value.key} - ${r.value.reason}`);
      } else if (r.status === 'rejected') {
        console.warn(`[CacheWarmup] 预热异常: ${r.reason}`);
      }
    });
    
    return { total: results.length, succeeded, failed, elapsed };
  },

  /**
   * 获取缓存统计
   */
  getStats() {
    return {
      mode: isRedisAvailable() ? 'redis' : 'memory',
      memoryCacheSize: memoryCache.size,
      memoryCacheMaxSize: MAX_MEMORY_CACHE_SIZE
    };
  }
};

// ============================================
// 任务队列分片服务（基于 Bull，可选）
// ============================================

const SHARD_COUNT = parseInt(process.env.QUEUE_SHARD_COUNT, 10) || 8;

const QUEUE_TYPES = {
  'text_generation': 'text',
  'image_generation': 'image',
  'video_generation': 'video',
  'audio_generation': 'audio',
  'script_generation': 'text',
  'storyboard_generation': 'image'
};

const PRIORITIES = {
  'text_generation': 1,
  'script_generation': 2,
  'image_generation': 3,
  'storyboard_generation': 4,
  'audio_generation': 5,
  'video_generation': 6
};

const TaskQueueService = {
  /**
   * 检查队列服务是否可用
   */
  isAvailable() {
    return isRedisAvailable() && Queue !== undefined;
  },

  /**
   * 获取或创建任务队列
   */
  getQueue(queueName) {
    if (!this.isAvailable()) return null;

    if (!taskQueues.has(queueName)) {
      const queue = new Queue(queueName, {
        redis: getRedisConfig(),
        defaultJobOptions: {
          attempts: 3,
          backoff: { type: 'exponential', delay: 1000 },
          removeOnComplete: 100,
          removeOnFail: 1000
        },
        limiter: {
          max: parseInt(process.env.QUEUE_RATE_LIMIT, 10) || 1000,
          duration: 1000
        },
        settings: {
          lockDuration: 30000,
          stalledInterval: 30000,
          maxStalledCount: 3,
          guardInterval: 5000
        }
      });

      queue.on('error', (error) => {
        console.error(`[Queue:${queueName}] Error:`, error.message);
      });

      queue.on('failed', (job, error) => {
        console.error(`[Queue:${queueName}] Job ${job.id} failed:`, error.message);
      });

      taskQueues.set(queueName, queue);
    }
    return taskQueues.get(queueName);
  },

  /**
   * 计算分片索引
   */
  getShardName(taskType, userId) {
    const baseQueue = QUEUE_TYPES[taskType] || 'default';
    const hash = (userId || 0) % SHARD_COUNT;
    return `${baseQueue}:shard:${hash}`;
  },

  /**
   * 添加任务到队列
   */
  async addTask(taskType, data, options = {}) {
    if (!this.isAvailable()) return null;

    const queueName = this.getShardName(taskType, data.userId);
    const queue = this.getQueue(queueName);
    if (!queue) return null;

    try {
      const job = await queue.add(taskType, data, {
        ...options,
        priority: options.priority || PRIORITIES[taskType] || 10,
        delay: options.delay || 0,
        timeout: options.timeout || 300000
      });

      console.log(`[Queue] 任务已添加: ${queueName}/${job.id} (type=${taskType})`);
      return job;
    } catch (e) {
      console.warn(`[Queue] 添加任务失败，回退DB模式:`, e.message);
      return null;
    }
  },

  /**
   * 批量添加任务
   */
  async addBulk(tasks, batchSize = 100) {
    if (!this.isAvailable()) return [];

    const results = [];
    const grouped = new Map();

    for (const task of tasks) {
      const queueName = this.getShardName(task.type, task.data?.userId);
      if (!grouped.has(queueName)) {
        grouped.set(queueName, []);
      }
      grouped.get(queueName).push(task);
    }

    for (const [queueName, queueTasks] of grouped) {
      const queue = this.getQueue(queueName);
      if (!queue) continue;

      for (let i = 0; i < queueTasks.length; i += batchSize) {
        const batch = queueTasks.slice(i, i + batchSize);
        const bulkData = batch.map(t => ({
          name: t.type,
          data: t.data,
          opts: {
            priority: PRIORITIES[t.type] || 10,
            ...t.options
          }
        }));

        try {
          const jobs = await queue.addBulk(bulkData);
          results.push(...jobs);
        } catch (e) {
          console.warn(`[Queue] 批量添加失败:`, e.message);
        }
      }
    }

    return results;
  },

  /**
   * 注册任务处理器
   */
  registerProcessor(queueName, processor, options = {}) {
    const queue = this.getQueue(queueName);
    if (!queue) return;

    queue.process(
      options.taskType || '*',
      options.concurrency || 5,
      async (job) => {
        const startTime = Date.now();
        try {
          const result = await processor(job.data, job);
          await job.progress(100);
          console.log(`[Queue] Job ${job.id} 完成: ${Date.now() - startTime}ms`);
          return result;
        } catch (error) {
          console.error(`[Queue] Job ${job.id} 错误:`, error.message);
          throw error;
        }
      }
    );
  },

  /**
   * 注册所有分片的处理器
   */
  registerAllShards(baseQueueName, processor, options = {}) {
    if (!this.isAvailable()) return;

    for (let i = 0; i < SHARD_COUNT; i++) {
      const shardName = `${baseQueueName}:shard:${i}`;
      this.registerProcessor(shardName, processor, options);
    }
    console.log(`[Queue] 已注册 ${SHARD_COUNT} 个分片处理器: ${baseQueueName}`);
  },

  /**
   * 获取队列状态
   */
  async getStats() {
    const stats = {};
    for (const [name, queue] of taskQueues) {
      try {
        const counts = await queue.getJobCounts();
        stats[name] = counts;
      } catch (e) {
        stats[name] = { error: e.message };
      }
    }
    return stats;
  },

  /**
   * 暂停所有队列
   */
  async pauseAll() {
    for (const [name, queue] of taskQueues) {
      await queue.pause();
      console.log(`[Queue] 已暂停: ${name}`);
    }
  },

  /**
   * 恢复所有队列
   */
  async resumeAll() {
    for (const [name, queue] of taskQueues) {
      await queue.resume();
      console.log(`[Queue] 已恢复: ${name}`);
    }
  },

  /**
   * 关闭所有队列
   */
  async closeAll() {
    for (const [, queue] of taskQueues) {
      try { await queue.close(); } catch (e) { /* 静默 */ }
    }
    taskQueues.clear();
  }
};

// ============================================
// Pub/Sub 服务（用于 WebSocket 跨实例广播）
// ============================================

let pubClient = null;
let subClient = null;
const pubsubListeners = new Map();

const PubSubService = {
  /**
   * 初始化 Pub/Sub 客户端
   */
  async initialize() {
    if (!isRedisAvailable() || !Redis) return false;

    try {
      const config = getRedisConfig();
      pubClient = redis; // 复用主连接
      subClient = new Redis(config); // 订阅需要独立连接
      await subClient.connect();

      subClient.on('error', (err) => {
        console.warn('[PubSub] 订阅客户端异常:', err.message);
      });

      console.log('[PubSub] Pub/Sub 已初始化');
      return true;
    } catch (e) {
      console.warn('[PubSub] 初始化失败:', e.message);
      return false;
    }
  },

  /**
   * 发布消息
   */
  async publish(channel, message) {
    if (!pubClient) return false;
    try {
      await pubClient.publish(channel, JSON.stringify(message));
      return true;
    } catch (e) {
      return false;
    }
  },

  /**
   * 订阅频道
   */
  async subscribe(channel, callback) {
    if (!subClient) return false;

    try {
      await subClient.subscribe(channel);
      pubsubListeners.set(channel, callback);

      subClient.on('message', (ch, msg) => {
        if (ch === channel) {
          try {
            callback(JSON.parse(msg));
          } catch (e) {
            console.warn('[PubSub] 消息解析失败:', e.message);
          }
        }
      });

      return true;
    } catch (e) {
      return false;
    }
  },

  /**
   * 是否可用
   */
  isAvailable() {
    return pubClient !== null && subClient !== null;
  }
};

// ============================================
// 关闭和导出
// ============================================

async function closeRedis() {
  if (redis) {
    try { await redis.quit(); } catch (e) { /* 静默 */ }
    redis = null;
  }
  if (subClient) {
    try { await subClient.quit(); } catch (e) { /* 静默 */ }
    subClient = null;
  }
  pubClient = null;
  redisAvailable = false;
  await TaskQueueService.closeAll();
  memoryCache.clear();
}

function getRedis() {
  return redis;
}

module.exports = {
  initializeRedis,
  getRedis,
  closeRedis,
  isRedisAvailable,
  CacheService,
  TaskQueueService,
  PubSubService
};
