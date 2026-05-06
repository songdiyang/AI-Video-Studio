/**
 * 文件存储工具模块
 * 
 * 职责：
 * 1. 通过统一接口初始化存储客户端
 * 2. downloadAndStore(tempUrl, objectPath) — 下载临时 URL 并持久化，返回 URL
 * 3. 优雅降级：存储未配置时直接返回原始 URL，不阻断业务流程
 * 
 * 存储路径约定：
 *   images/characters/{characterId}/{view}.png
 *   images/scenes/{sceneId}/scene.png
 *   images/frames/{storyboardId}/first_frame.png
 *   images/frames/{storyboardId}/last_frame.png
 *   videos/{storyboardId}/video.mp4
 */

const path = require('path');
const { safeFetch } = require('./outboundRequestGuard');
const { StorageFactory } = require('../storage');

// ========== undici 连接池（按域名懒初始化）==========

let Pool = null;          // undici.Pool 构造函数，懒加载
let undiciAvailable = null; // null = 未检测，true/false = 检测结果

// 域名 -> Pool 实例 的缓存
const domainPoolMap = new Map();

// 常见的 AI 图片源域名模式（用于判断是否创建专用连接池）
const AI_IMAGE_DOMAINS = [
  'volces.com',           // 火山引擎 TOS
  'volcengineapi.com',    // 火山引擎 API
  'tos-cn-beijing.volces.com',
  'ark-acg-cn-beijing.tos-cn-beijing.volces.com',
];

/**
 * 检测 undici 是否可用
 */
function checkUndiciAvailable() {
  if (undiciAvailable !== null) return undiciAvailable;
  try {
    const undici = require('undici');
    Pool = undici.Pool;
    undiciAvailable = true;
    console.log('[FileStorage] undici 连接池已加载');
  } catch (err) {
    undiciAvailable = false;
    console.log('[FileStorage] undici 不可用，将使用 node-fetch 回退方案');
  }
  return undiciAvailable;
}

/**
 * 获取或创建指定域名的连接池
 * @param {string} origin - 例如 'https://example.com'
 * @returns {Object|null} Pool 实例或 null
 */
function getOrCreatePool(origin) {
  if (!checkUndiciAvailable()) return null;
  
  if (domainPoolMap.has(origin)) {
    return domainPoolMap.get(origin);
  }
  
  // 创建新的连接池
  const pool = new Pool(origin, {
    connections: 10,           // 最大连接数
    pipelining: 1,             // 管道化请求数
    keepAliveTimeout: 60000,   // keep-alive 超时 60s
    keepAliveMaxTimeout: 300000, // 最大 keep-alive 超时 5分钟
    connect: {
      timeout: 15000,          // 连接超时 15s
    }
  });
  
  domainPoolMap.set(origin, pool);
  console.log(`[FileStorage] 创建连接池: ${origin}`);
  return pool;
}

/**
 * 判断某域名是否应使用连接池（只对常见 AI 图片源启用）
 */
function shouldUsePool(hostname) {
  return AI_IMAGE_DOMAINS.some(domain => hostname.endsWith(domain));
}

// ========== 配置 ==========

const CONFIG = {
  publicUrl: process.env.MINIO_PUBLIC_URL  || '',
};

// ========== 存储客户端单例 ==========

let storageClient = null;
let bucketReady = false;
let initPromise = null;

/**
 * 检查存储是否已配置
 */
function isConfigured() {
  const config = StorageFactory.getConfig();
  return !!(config.accessKey && config.secretKey);
}

/**
 * 初始化存储客户端并确保桶存在（只执行一次）
 */
async function ensureReady() {
  if (bucketReady) return true;
  if (!isConfigured()) return false;

  if (!initPromise) {
    initPromise = (async () => {
      try {
        storageClient = StorageFactory.create();
        if (!storageClient) {
          throw new Error('无法创建存储客户端');
        }

        const ready = await storageClient.init();
        if (!ready) {
          throw new Error('存储客户端初始化失败');
        }

        bucketReady = true;
        return true;
      } catch (err) {
        console.error('[FileStorage] 存储初始化失败:', err.message);
        storageClient = null;
        initPromise = null;
        return false;
      }
    })();
  }

  return initPromise;
}

// ========== 工具函数 ==========

/**
 * 睡眠函数（用于重试退避）
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * 判断是否应该重试
 * @param {Error|null} error - 错误对象
 * @param {number|null} statusCode - HTTP 状态码
 */
function shouldRetry(error, statusCode) {
  // 网络错误、超时错误应该重试
  if (error) {
    const errorMsg = error.message || '';
    const errorName = error.name || '';
    
    // AbortError（超时中止）应该重试
    if (errorName === 'AbortError') {
      return true;
    }
    
    if (errorMsg.includes('timeout') || 
        errorMsg.includes('ETIMEDOUT') ||
        errorMsg.includes('ECONNRESET') ||
        errorMsg.includes('ECONNREFUSED') ||
        errorMsg.includes('socket hang up') ||
        errorMsg.includes('network') ||
        errorMsg.includes('心跳超时') ||
        errorMsg.includes('中止')) {
      return true;
    }
  }
  // 5xx 状态码应该重试
  if (statusCode && statusCode >= 500) {
    return true;
  }
  return false;
}

/**
 * 使用 undici 连接池下载文件（带重试机制）
 * 
 * @param {string} url - 下载 URL
 * @param {Object} options - 可选配置
 * @param {number} [options.maxRetries=3] - 最大重试次数
 * @param {number} [options.bodyTimeout=30000] - 响应体超时（毫秒）
 * @param {number} [options.headersTimeout=15000] - 响应头超时（毫秒）
 * @param {number} [options.chunkTimeout=15000] - 单个chunk超时（毫秒）
 * @returns {Promise<{buffer: Buffer, contentType: string, contentLength: number, ttfb: number, downloadTime: number, poolReused: boolean}>}
 */
async function downloadWithUndici(url, options = {}) {
  const {
    maxRetries = 3,
    bodyTimeout = 30000,
    headersTimeout = 15000,
    chunkTimeout = 15000,  // 单个chunk最大等待时间
  } = options;
  
  const parsedUrl = new URL(url);
  const origin = parsedUrl.origin;
  const pool = getOrCreatePool(origin);
  
  if (!pool) {
    throw new Error('undici 连接池不可用');
  }
  
  // 检查是否复用已有连接
  const poolStats = pool.stats || {};
  const poolReused = (poolStats.connected || 0) > 0;
  
  let lastError = null;
  let attempt = 0;
  
  while (attempt < maxRetries) {
    attempt++;
    const retryDelay = Math.pow(2, attempt - 1) * 1000; // 1s, 2s, 4s
    
    // 等待响应阶段的进度日志计时器
    let waitingLogInterval = null;
    let waitingSeconds = 0;
    
    try {
      console.log(`[FileStorage] [undici] 第 ${attempt}/${maxRetries} 次请求: ${parsedUrl.pathname.substring(0, 50)}...`);
      
      const requestStart = Date.now();
      
      // 启动等待进度日志（每5秒输出）
      waitingLogInterval = setInterval(() => {
        waitingSeconds += 5;
        console.log(`[FileStorage] [undici] 等待服务器响应... ${waitingSeconds}s`);
      }, 5000);
      
      // 发起请求
      const { statusCode, headers, body } = await pool.request({
        path: parsedUrl.pathname + parsedUrl.search,
        method: 'GET',
        headersTimeout,
        bodyTimeout,
      });
      
      // 清除等待日志计时器
      if (waitingLogInterval) {
        clearInterval(waitingLogInterval);
        waitingLogInterval = null;
      }
      
      const ttfb = Date.now() - requestStart;
      console.log(`[FileStorage] [undici] TTFB: ${ttfb}ms, 状态码: ${statusCode}, 连接池: ${poolReused ? '复用' : '新建'}`);
      
      // 检查状态码
      if (statusCode >= 400) {
        // 5xx 可重试
        if (shouldRetry(null, statusCode) && attempt < maxRetries) {
          console.log(`[FileStorage] [undici] HTTP ${statusCode}, ${retryDelay}ms 后重试...`);
          await sleep(retryDelay);
          continue;
        }
        throw new Error(`HTTP ${statusCode}`);
      }
      
      const contentType = headers['content-type'] || '';
      const contentLength = parseInt(headers['content-length'] || '0', 10);
      
      // 收集响应体（带心跳检测）
      const downloadStart = Date.now();
      const chunks = [];
      let downloadedBytes = 0;
      let lastLogTime = Date.now();
      let lastChunkTime = Date.now(); // 心跳检测：记录最后收到chunk的时间
      const logInterval = 2000;
      
      // 心跳检测计时器
      let heartbeatInterval = null;
      let heartbeatAborted = false;
      
      heartbeatInterval = setInterval(() => {
        const sinceLastChunk = Date.now() - lastChunkTime;
        if (sinceLastChunk > chunkTimeout) {
          heartbeatAborted = true;
          console.error(`[FileStorage] [undici] 心跳超时: ${sinceLastChunk}ms 未收到数据，中止下载`);
          // undici body 不支持 abort，但会在下次迭代时触发错误
          if (heartbeatInterval) {
            clearInterval(heartbeatInterval);
            heartbeatInterval = null;
          }
        }
      }, 5000);
      
      try {
        for await (const chunk of body) {
          if (heartbeatAborted) {
            throw new Error(`下载心跳超时: 超过 ${chunkTimeout}ms 未收到数据`);
          }
          
          chunks.push(chunk);
          downloadedBytes += chunk.length;
          lastChunkTime = Date.now(); // 更新心跳时间
          
          // 定期输出下载进度
          const now = Date.now();
          if (now - lastLogTime >= logInterval) {
            const progress = contentLength > 0 
              ? `${((downloadedBytes / contentLength) * 100).toFixed(1)}%` 
              : `${(downloadedBytes / 1024 / 1024).toFixed(2)}MB`;
            const elapsed = (now - downloadStart) / 1000;
            const speed = elapsed > 0 ? ((downloadedBytes / 1024 / 1024) / elapsed).toFixed(2) : '0';
            console.log(`[FileStorage] [undici] 下载中... ${progress} (${speed}MB/s)`);
            lastLogTime = now;
          }
        }
      } finally {
        if (heartbeatInterval) {
          clearInterval(heartbeatInterval);
          heartbeatInterval = null;
        }
      }
      
      const buffer = Buffer.concat(chunks);
      const downloadTime = Date.now() - downloadStart;
      
      return {
        buffer,
        contentType,
        contentLength: buffer.length,
        ttfb,
        downloadTime,
        poolReused,
      };
      
    } catch (err) {
      // 确保清理计时器
      if (waitingLogInterval) {
        clearInterval(waitingLogInterval);
      }
      
      lastError = err;
      console.error(`[FileStorage] [undici] 第 ${attempt} 次请求失败:`, err.message);
      
      // 判断是否需要重试
      if (shouldRetry(err, null) && attempt < maxRetries) {
        console.log(`[FileStorage] [undici] ${retryDelay}ms 后重试...`);
        await sleep(retryDelay);
        continue;
      }
      
      // 不可重试或已达最大重试次数
      break;
    }
  }
  
  throw lastError || new Error('下载失败');
}

/**
 * 使用 safeFetch（node-fetch）下载文件（回退方案，带超时和心跳检测）
 * 
 * @param {string} url - 下载 URL
 * @param {Object} options - 可选配置
 * @param {number} [options.responseTimeout=15000] - 等待响应头超时（毫秒）
 * @param {number} [options.chunkTimeout=15000] - 单个chunk超时（毫秒）
 * @param {number} [options.maxRetries=3] - 最大重试次数
 * @returns {Promise<{buffer: Buffer, contentType: string, contentLength: number, ttfb: number, downloadTime: number, poolReused: boolean}>}
 */
async function downloadWithFetch(url, options = {}) {
  const {
    responseTimeout = 15000,  // 等待响应头超时
    chunkTimeout = 15000,     // 单个chunk超时
    maxRetries = 3,
  } = options;
  
  let lastError = null;
  let attempt = 0;
  
  while (attempt < maxRetries) {
    attempt++;
    const retryDelay = Math.pow(2, attempt - 1) * 1000; // 1s, 2s, 4s
    
    // 等待响应阶段的进度日志计时器
    let waitingLogInterval = null;
    let waitingSeconds = 0;
    // AbortController 用于超时控制
    const controller = new AbortController();
    let responseTimeoutId = null;
    
    try {
      console.log(`[FileStorage] [fetch] 第 ${attempt}/${maxRetries} 次请求: ${url.substring(0, 80)}...`);
      
      const requestStart = Date.now();
      
      // 启动等待进度日志（每5秒输出）
      waitingLogInterval = setInterval(() => {
        waitingSeconds += 5;
        console.log(`[FileStorage] [fetch] 等待服务器响应... ${waitingSeconds}s`);
      }, 5000);
      
      // 设置响应头超时
      responseTimeoutId = setTimeout(() => {
        console.error(`[FileStorage] [fetch] 响应头超时: 超过 ${responseTimeout}ms 未收到响应`);
        controller.abort();
      }, responseTimeout);
      
      const response = await safeFetch(
        url,
        { timeout: 300000, signal: controller.signal }, // 总超时 5 分钟，但有更细粒度的超时控制
        '文件持久化下载'
      );
      
      // 清除响应头超时和等待日志
      if (responseTimeoutId) {
        clearTimeout(responseTimeoutId);
        responseTimeoutId = null;
      }
      if (waitingLogInterval) {
        clearInterval(waitingLogInterval);
        waitingLogInterval = null;
      }
      
      const ttfb = Date.now() - requestStart;
      console.log(`[FileStorage] [fetch] TTFB: ${ttfb}ms, 状态码: ${response.status}`);
      
      if (!response.ok) {
        // 5xx 可重试
        if (shouldRetry(null, response.status) && attempt < maxRetries) {
          console.log(`[FileStorage] [fetch] HTTP ${response.status}, ${retryDelay}ms 后重试...`);
          await sleep(retryDelay);
          continue;
        }
        throw new Error(`HTTP ${response.status}`);
      }
      
      const contentType = response.headers.get('content-type') || '';
      const contentLength = parseInt(response.headers.get('content-length') || '0', 10);
      
      // 收集响应体（带心跳检测）
      const downloadStart = Date.now();
      const chunks = [];
      let downloadedBytes = 0;
      let lastLogTime = Date.now();
      let lastChunkTime = Date.now(); // 心跳检测：记录最后收到chunk的时间
      const logInterval = 2000;
      
      // 心跳检测计时器
      let heartbeatInterval = null;
      let heartbeatAborted = false;
      
      heartbeatInterval = setInterval(() => {
        const sinceLastChunk = Date.now() - lastChunkTime;
        if (sinceLastChunk > chunkTimeout) {
          heartbeatAborted = true;
          console.error(`[FileStorage] [fetch] 心跳超时: ${sinceLastChunk}ms 未收到数据，中止下载`);
          controller.abort(); // 主动中止请求
          if (heartbeatInterval) {
            clearInterval(heartbeatInterval);
            heartbeatInterval = null;
          }
        }
      }, 5000);
      
      try {
        for await (const chunk of response.body) {
          if (heartbeatAborted) {
            throw new Error(`下载心跳超时: 超过 ${chunkTimeout}ms 未收到数据`);
          }
          
          chunks.push(chunk);
          downloadedBytes += chunk.length;
          lastChunkTime = Date.now(); // 更新心跳时间
          
          const now = Date.now();
          if (now - lastLogTime >= logInterval) {
            const progress = contentLength > 0 
              ? `${((downloadedBytes / contentLength) * 100).toFixed(1)}%` 
              : `${(downloadedBytes / 1024 / 1024).toFixed(2)}MB`;
            const elapsed = (now - downloadStart) / 1000;
            const speed = elapsed > 0 ? ((downloadedBytes / 1024 / 1024) / elapsed).toFixed(2) : '0';
            console.log(`[FileStorage] [fetch] 下载中... ${progress} (${speed}MB/s)`);
            lastLogTime = now;
          }
        }
      } finally {
        if (heartbeatInterval) {
          clearInterval(heartbeatInterval);
          heartbeatInterval = null;
        }
      }
      
      const buffer = Buffer.concat(chunks);
      const downloadTime = Date.now() - downloadStart;
      
      return {
        buffer,
        contentType,
        contentLength: buffer.length,
        ttfb,
        downloadTime,
        poolReused: false, // fetch 无法确定是否复用
      };
      
    } catch (err) {
      // 确保清理计时器
      if (responseTimeoutId) clearTimeout(responseTimeoutId);
      if (waitingLogInterval) clearInterval(waitingLogInterval);
      
      lastError = err;
      const errorMsg = err.name === 'AbortError' ? '请求被中止（超时）' : err.message;
      console.error(`[FileStorage] [fetch] 第 ${attempt} 次请求失败:`, errorMsg);
      
      // 判断是否需要重试
      if (shouldRetry(err, null) && attempt < maxRetries) {
        console.log(`[FileStorage] [fetch] ${retryDelay}ms 后重试...`);
        await sleep(retryDelay);
        continue;
      }
      
      // AbortError 也应该重试
      if (err.name === 'AbortError' && attempt < maxRetries) {
        console.log(`[FileStorage] [fetch] ${retryDelay}ms 后重试...`);
        await sleep(retryDelay);
        continue;
      }
      
      break;
    }
  }
  
  throw lastError || new Error('下载失败');
}

/**
 * 智能下载函数：优先使用 undici，失败时回退到 safeFetch
 * 
 * @param {string} url - 下载 URL
 * @returns {Promise<{buffer: Buffer, contentType: string, contentLength: number, ttfb: number, downloadTime: number, poolReused: boolean}>}
 */
async function smartDownload(url) {
  // 相对路径自动转为公网绝对 URL
  const resolved = resolveToInternalUrl(url);
  const parsedUrl = new URL(resolved);
  const hostname = parsedUrl.hostname;
  
  // 检查是否应使用 undici 连接池
  if (checkUndiciAvailable() && shouldUsePool(hostname)) {
    try {
      return await downloadWithUndici(resolved);
    } catch (err) {
      console.warn(`[FileStorage] undici 下载失败，回退到 fetch:`, err.message);
    }
  }
  
  // 回退到 safeFetch
  return await downloadWithFetch(resolved);
}

/**
 * 从 URL 或 Content-Type 推断文件扩展名
 */
function guessExtension(url, contentType) {
  // 先尝试从 URL 路径提取
  try {
    const pathname = new URL(url).pathname;
    const ext = path.extname(pathname).toLowerCase();
    if (ext && ext.length <= 6) return ext; // .png, .jpg, .mp4, .webp
  } catch {}

  // 从 Content-Type 推断
  const typeMap = {
    'image/png':  '.png',
    'image/jpeg': '.jpg',
    'image/webp': '.webp',
    'image/gif':  '.gif',
    'video/mp4':  '.mp4',
    'video/webm': '.webm',
  };
  if (contentType) {
    const base = contentType.split(';')[0].trim().toLowerCase();
    if (typeMap[base]) return typeMap[base];
  }

  return '';
}

/**
 * 生成持久化访问 URL
 */
function getPublicUrl(objectName) {
  if (CONFIG.publicUrl) {
    // 使用配置的公开 URL 前缀
    const base = CONFIG.publicUrl.replace(/\/$/, '');
    return `${base}/${objectName}`;
  }
  // 回退：拼接 MinIO 地址
  const protocol = CONFIG.useSSL ? 'https' : 'http';
  return `${protocol}://${CONFIG.endPoint}:${CONFIG.port}/${CONFIG.bucket}/${objectName}`;
}

// ========== 核心 API ==========

/**
 * 直接上传 Buffer 到 MinIO
 * 
 * @param {Buffer} buffer - 文件内容
 * @param {string} objectPath - MinIO 中的存储路径（含扩展名）
 *                              例: 'avatars/user_123_1234567890.png'
 * @param {object} [options] - 可选配置
 * @param {string} [options.contentType] - 文件 MIME 类型
 * @returns {Promise<string>} 持久化后的访问 URL
 */
async function uploadBuffer(buffer, objectPath, options = {}) {
  const ready = await ensureReady();
  if (!ready) {
    throw new Error('存储服务不可用');
  }

  try {
    await storageClient.upload(buffer, objectPath, options);

    const persistentUrl = getPublicUrl(objectPath);
    console.log(`[FileStorage] 已上传: ${objectPath} (${(buffer.length / 1024).toFixed(1)}KB)`);
    return persistentUrl;
  } catch (err) {
    console.error(`[FileStorage] 上传失败 (${objectPath}):`, err.message);
    throw err;
  }
}

/**
 * 下载临时 URL 的文件并上传到 MinIO，返回持久化 URL
 * 
 * @param {string} tempUrl - AI 生成返回的临时文件 URL
 * @param {string} objectPath - MinIO 中的存储路径（不含扩展名，会自动补充）
 *                              例: 'images/frames/123/first_frame'
 * @param {object} [options] - 可选配置
 * @param {string} [options.fallbackExt] - 无法推断扩展名时的默认值，如 '.png'
 * @returns {Promise<string>} 持久化后的访问 URL；MinIO 不可用时返回原始 tempUrl
 */
async function downloadAndStore(tempUrl, objectPath, options = {}) {
  if (!tempUrl) return tempUrl;

  console.log(`[FileStorage] 开始持久化: ${objectPath}`);
  console.log(`[FileStorage] 源URL: ${tempUrl.substring(0, 100)}...`);

  const ready = await ensureReady();
  if (!ready) {
    console.warn('[FileStorage] MinIO 不可用，返回原始 URL');
    return tempUrl;
  }

  try {
    // 1. 使用智能下载（undici 优先，自动回退到 fetch）
    const totalStart = Date.now();
    console.log(`[FileStorage] 开始下载文件...`);
    
    const downloadResult = await smartDownload(tempUrl);
    const { buffer, contentType, ttfb, downloadTime, poolReused } = downloadResult;
    
    // 输出详细的性能统计
    const totalDownloadTime = Date.now() - totalStart;
    const avgSpeed = ((buffer.length / 1024 / 1024) / (totalDownloadTime / 1000)).toFixed(2);
    console.log(`[FileStorage] 下载完成:
  - 文件大小: ${(buffer.length / 1024).toFixed(1)}KB
  - TTFB（首字节延迟）: ${ttfb}ms
  - 下载耗时: ${downloadTime}ms
  - 总耗时: ${totalDownloadTime}ms
  - 平均速度: ${avgSpeed}MB/s
  - 连接池: ${poolReused ? '复用已有连接' : '新建连接'}`);

    // 2. 确定扩展名和完整对象路径
    let ext = guessExtension(tempUrl, contentType);
    if (!ext) ext = options.fallbackExt || '';
    const fullObjectName = objectPath + ext;

    // 3. 设置元数据
    const metaData = {};
    if (contentType) metaData['Content-Type'] = contentType;

    // 4. 上传到存储
    console.log(`[FileStorage] 开始上传: ${fullObjectName}`);
    const uploadStart = Date.now();
    await storageClient.upload(buffer, fullObjectName, { contentType });
    console.log(`[FileStorage] 上传完成, 耗时: ${Date.now() - uploadStart}ms`);

    // 5. 返回持久化 URL
    const persistentUrl = getPublicUrl(fullObjectName);
    console.log(`[FileStorage] 已持久化: ${fullObjectName} (${(buffer.length / 1024).toFixed(1)}KB)`);
    return persistentUrl;
  } catch (err) {
    console.error(`[FileStorage] 持久化失败 (${objectPath}):`, err.message);
    console.error(`[FileStorage] 错误详情:`, err.stack);
    // 降级：返回原始 URL，不阻断业务
    return tempUrl;
  }
}

/**
 * 简单的并发限制器
 * @param {Array<() => Promise<T>>} tasks - 任务函数数组
 * @param {number} concurrency - 最大并发数
 * @returns {Promise<T[]>} 结果数组（顺序对应）
 */
async function limitConcurrency(tasks, concurrency) {
  const results = new Array(tasks.length);
  let currentIndex = 0;
  
  async function runWorker() {
    while (currentIndex < tasks.length) {
      const index = currentIndex++;
      try {
        results[index] = await tasks[index]();
      } catch (err) {
        results[index] = err; // 保存错误，稍后处理
      }
    }
  }
  
  // 启动 concurrency 个 worker
  const workers = [];
  for (let i = 0; i < Math.min(concurrency, tasks.length); i++) {
    workers.push(runWorker());
  }
  
  await Promise.all(workers);
  
  // 检查是否有错误需要重新抛出（这里选择返回错误而非抛出，保持与 Promise.all 不同的行为）
  // 如果需要与 Promise.all 一致的行为，可以在这里抛出第一个错误
  return results;
}

/**
 * 批量持久化多个 URL（带并发限制）
 * 
 * @param {Array<{url: string, objectPath: string, fallbackExt?: string}>} items
 * @param {object} [options] - 可选配置
 * @param {number} [options.concurrency=6] - 最大并发下载数
 * @returns {Promise<string[]>} 持久化后的 URL 数组（顺序对应）
 */
async function downloadAndStoreMany(items, options = {}) {
  const { concurrency = 6 } = options;
  
  if (!items || items.length === 0) {
    return [];
  }
  
  console.log(`[FileStorage] 批量持久化开始: ${items.length} 个文件, 并发限制: ${concurrency}`);
  const startTime = Date.now();
  
  // 创建任务函数数组
  const tasks = items.map((item, index) => {
    return async () => {
      console.log(`[FileStorage] [${index + 1}/${items.length}] 开始处理: ${item.objectPath}`);
      return downloadAndStore(item.url, item.objectPath, { fallbackExt: item.fallbackExt });
    };
  });
  
  // 使用并发限制器执行
  const results = await limitConcurrency(tasks, concurrency);
  
  const elapsed = Date.now() - startTime;
  console.log(`[FileStorage] 批量持久化完成: ${items.length} 个文件, 总耗时: ${elapsed}ms, 平均: ${(elapsed / items.length).toFixed(0)}ms/个`);
  
  return results;
}

/**
 * 从 MinIO 删除指定对象
 * 
 * @param {string} persistentUrl - 持久化 URL（会自动提取 objectName）
 * @returns {Promise<boolean>} 是否成功删除
 */
async function deleteObject(persistentUrl) {
  if (!persistentUrl) return false;

  const ready = await ensureReady();
  if (!ready) {
    console.warn('[FileStorage] MinIO 不可用，跳过删除');
    return false;
  }

  try {
    // 从 URL 中提取 objectName
    let objectName = '';
    if (CONFIG.publicUrl) {
      const base = CONFIG.publicUrl.replace(/\/$/, '');
      if (persistentUrl.startsWith(base)) {
        objectName = persistentUrl.slice(base.length + 1);
      }
    }
    if (!objectName) {
      // 回退：从 URL 路径中提取（跳过 /{bucket}/ 前缀）
      const url = new URL(persistentUrl);
      const parts = url.pathname.split('/');
      // 路径格式: /{bucket}/{objectName...}
      if (parts.length > 2 && parts[1] === CONFIG.bucket) {
        objectName = parts.slice(2).join('/');
      } else {
        objectName = parts.slice(1).join('/');
      }
    }

    if (!objectName) {
      console.warn('[FileStorage] 无法从 URL 提取对象路径:', persistentUrl);
      return false;
    }

    await storageClient.delete(objectName);
    console.log(`[FileStorage] 已删除: ${objectName}`);
    return true;
  } catch (err) {
    console.error(`[FileStorage] 删除失败:`, err.message);
    return false;
  }
}

/**
 * 检查存储是否就绪
 * @returns {Promise<boolean>}
 */
async function isMinIOReady() {
  return await ensureReady();
}

/**
 * 将存储 URL（可能是相对路径）转换为外部可访问的绝对 URL
 * 当 MINIO_PUBLIC_URL 为相对路径（如 /storage）时，外部 API（如 Seedream）无法访问，
 * 需要拼接 SITE_PUBLIC_URL 为完整的公网 URL
 * 
 * @param {string} url - 原始 URL（可能为相对路径或绝对 URL）
 * @returns {string} 可访问的绝对 URL
 */
function resolveToInternalUrl(url) {
  if (!url) return url;
  
  // 如果已经是绝对 URL（以 http:// 或 https:// 开头），直接返回
  if (url.startsWith('http://') || url.startsWith('https://')) {
    return url;
  }
  
  const publicBase = (CONFIG.publicUrl || '').replace(/\/$/, '');
  const siteUrl = (process.env.SITE_PUBLIC_URL || '').replace(/\/$/, '');
  
  // 如果 publicUrl 是相对路径（如 /storage），则需要转换
  if (publicBase && !publicBase.startsWith('http') && url.startsWith(publicBase + '/')) {
    if (siteUrl) {
      // 拼接公网基址：/storage/images/xxx → http://101.133.162.255/storage/images/xxx
      const fullUrl = `${siteUrl}${url}`;
      console.log(`[FileStorage] 解析相对 URL: ${url} → ${fullUrl}`);
      return fullUrl;
    }
    // 如果没有 SITE_PUBLIC_URL，回退到存储内网地址
    const objectName = url.slice(publicBase.length + 1);
    const storage = StorageFactory.getConfig();
    const protocol = storage.useSSL ? 'https' : 'http';
    const internalUrl = `${protocol}://127.0.0.1:${storage.port}/${storage.bucket}/${objectName}`;
    console.log(`[FileStorage] 解析相对 URL (无SITE_PUBLIC_URL): ${url} → ${internalUrl}`);
    return internalUrl;
  }
  
  // 如果 publicUrl 是绝对路径且 URL 以它开头，也可能需要转换为内网地址
  if (publicBase && publicBase.startsWith('http') && url.startsWith(publicBase + '/')) {
    const objectName = url.slice(publicBase.length + 1);
    const storage = StorageFactory.getConfig();
    const protocol = storage.useSSL ? 'https' : 'http';
    const internalUrl = `${protocol}://127.0.0.1:${storage.port}/${storage.bucket}/${objectName}`;
    return internalUrl;
  }
  
  return url;
}

module.exports = {
  uploadBuffer,
  downloadAndStore,
  downloadAndStoreMany,
  deleteObject,
  getPublicUrl,
  resolveToInternalUrl,
  isConfigured,
  ensureReady,
  isMinIOReady,
  smartDownload,
};
