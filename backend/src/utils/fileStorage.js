/**
 * 文件存储工具模块（MinIO）
 * 
 * 职责：
 * 1. 初始化 MinIO 客户端 + 自动创建桶
 * 2. downloadAndStore(tempUrl, objectPath) — 下载临时 URL 并上传到 MinIO，返回持久 URL
 * 3. 优雅降级：MinIO 未配置时直接返回原始 URL，不阻断业务流程
 * 
 * 存储路径约定：
 *   images/characters/{characterId}/{view}.png
 *   images/scenes/{sceneId}/scene.png
 *   images/frames/{storyboardId}/first_frame.png
 *   images/frames/{storyboardId}/last_frame.png
 *   videos/{storyboardId}/video.mp4
 */

const Minio = require('minio');
const path = require('path');
const { safeFetch } = require('./outboundRequestGuard');

// ========== 配置 ==========

const CONFIG = {
  endPoint:  process.env.MINIO_ENDPOINT   || 'localhost',
  port:      parseInt(process.env.MINIO_PORT || '9000', 10),
  useSSL:    process.env.MINIO_USE_SSL === 'true',
  accessKey: process.env.MINIO_ACCESS_KEY  || '',
  secretKey: process.env.MINIO_SECRET_KEY  || '',
  bucket:    process.env.MINIO_BUCKET      || 'nanostory',
  publicUrl: process.env.MINIO_PUBLIC_URL  || '',
};

// ========== 客户端单例 ==========

let minioClient = null;
let bucketReady = false;
let initPromise = null;

/**
 * 检查 MinIO 是否已配置（accessKey 非空即视为已配置）
 */
function isConfigured() {
  return !!(CONFIG.accessKey && CONFIG.secretKey);
}

/**
 * 初始化 MinIO 客户端并确保桶存在（只执行一次）
 */
async function ensureReady() {
  if (bucketReady) return true;
  if (!isConfigured()) return false;

  if (!initPromise) {
    initPromise = (async () => {
      try {
        minioClient = new Minio.Client({
          endPoint:  CONFIG.endPoint,
          port:      CONFIG.port,
          useSSL:    CONFIG.useSSL,
          accessKey: CONFIG.accessKey,
          secretKey: CONFIG.secretKey,
        });

        // 确保桶存在
        const exists = await minioClient.bucketExists(CONFIG.bucket);
        if (!exists) {
          await minioClient.makeBucket(CONFIG.bucket);
          console.log(`[FileStorage] 已创建存储桶: ${CONFIG.bucket}`);

          // 设置桶策略为公开只读（前端可直接访问图片/视频）
          const policy = {
            Version: '2012-10-17',
            Statement: [{
              Effect: 'Allow',
              Principal: { AWS: ['*'] },
              Action: ['s3:GetObject'],
              Resource: [`arn:aws:s3:::${CONFIG.bucket}/*`]
            }]
          };
          await minioClient.setBucketPolicy(CONFIG.bucket, JSON.stringify(policy));
          console.log(`[FileStorage] 已设置桶公开只读策略`);
        }

        bucketReady = true;
        console.log(`[FileStorage] MinIO 就绪 (${CONFIG.endPoint}:${CONFIG.port}/${CONFIG.bucket})`);
        return true;
      } catch (err) {
        console.error('[FileStorage] MinIO 初始化失败:', err.message);
        minioClient = null;
        initPromise = null;
        return false;
      }
    })();
  }

  return initPromise;
}

// ========== 工具函数 ==========

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
    throw new Error('MinIO 存储服务不可用');
  }

  try {
    const metaData = {};
    if (options.contentType) {
      metaData['Content-Type'] = options.contentType;
    }

    await minioClient.putObject(CONFIG.bucket, objectPath, buffer, buffer.length, metaData);

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
    // 1. 发起下载请求
    console.log(`[FileStorage] 开始下载文件...`);
    const downloadStart = Date.now();
    
    const response = await safeFetch(
      tempUrl,
      { timeout: 300000 }, // 增加到 5 分钟，视频文件可能较大
      '文件持久化下载'
    );
    
    console.log(`[FileStorage] HTTP响应状态: ${response.status}, 耗时: ${Date.now() - downloadStart}ms`);
    
    if (!response.ok) {
      throw new Error(`下载失败: HTTP ${response.status} - ${tempUrl}`);
    }

    const contentType = response.headers.get('content-type') || '';
    const contentLength = parseInt(response.headers.get('content-length') || '0', 10);
    console.log(`[FileStorage] Content-Type: ${contentType}, Content-Length: ${contentLength || 'unknown'}`);
    
    // 2. 确定扩展名和完整对象路径
    let ext = guessExtension(tempUrl, contentType);
    if (!ext) ext = options.fallbackExt || '';
    const fullObjectName = objectPath + ext;

    // 3. 设置元数据
    const metaData = {};
    if (contentType) metaData['Content-Type'] = contentType;

    // 4. 先完整下载到 buffer，再上传到 MinIO
    // 注：流式上传虽然理论上更快，但 node-fetch 的 stream 与 MinIO 客户端存在兼容性问题，
    //     会导致卡顿。对于图片/小视频（< 50MB），buffer 方式更稳定可靠。
    console.log(`[FileStorage] 开始下载到内存...`);
    const bufferStart = Date.now();
    const chunks = [];
    let downloadedBytes = 0;
    let lastLogTime = Date.now();
    const logInterval = 2000; // 每2秒输出一次进度
    
    for await (const chunk of response.body) {
      chunks.push(chunk);
      downloadedBytes += chunk.length;
      
      // 定期输出下载进度（避免刷屏）
      const now = Date.now();
      if (now - lastLogTime >= logInterval) {
        const progress = contentLength > 0 
          ? `${((downloadedBytes / contentLength) * 100).toFixed(1)}%` 
          : `${(downloadedBytes / 1024 / 1024).toFixed(2)}MB`;
        const speed = ((downloadedBytes / 1024 / 1024) / ((now - bufferStart) / 1000)).toFixed(2);
        console.log(`[FileStorage] 下载中... ${progress} (${speed}MB/s)`);
        lastLogTime = now;
      }
    }
    const buffer = Buffer.concat(chunks);
    const actualSize = buffer.length;
    const downloadTime = Date.now() - bufferStart;
    const avgSpeed = ((actualSize / 1024 / 1024) / (downloadTime / 1000)).toFixed(2);
    console.log(`[FileStorage] 下载完成 (${(actualSize / 1024 / 1024).toFixed(2)}MB), 耗时: ${downloadTime}ms, 平均速度: ${avgSpeed}MB/s`);

    // 5. 上传到 MinIO
    console.log(`[FileStorage] 开始上传到 MinIO: ${fullObjectName}`);
    const uploadStart = Date.now();
    await minioClient.putObject(CONFIG.bucket, fullObjectName, buffer, actualSize, metaData);
    console.log(`[FileStorage] 上传完成, 耗时: ${Date.now() - uploadStart}ms`);

    // 6. 返回持久化 URL
    const persistentUrl = getPublicUrl(fullObjectName);
    console.log(`[FileStorage] 已持久化: ${fullObjectName} (${(actualSize / 1024).toFixed(1)}KB)`);
    return persistentUrl;
  } catch (err) {
    console.error(`[FileStorage] 持久化失败 (${objectPath}):`, err.message);
    console.error(`[FileStorage] 错误详情:`, err.stack);
    // 降级：返回原始 URL，不阻断业务
    return tempUrl;
  }
}

/**
 * 批量持久化多个 URL
 * 
 * @param {Array<{url: string, objectPath: string, fallbackExt?: string}>} items
 * @returns {Promise<string[]>} 持久化后的 URL 数组（顺序对应）
 */
async function downloadAndStoreMany(items) {
  return Promise.all(
    items.map(item => downloadAndStore(item.url, item.objectPath, { fallbackExt: item.fallbackExt }))
  );
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

    await minioClient.removeObject(CONFIG.bucket, objectName);
    console.log(`[FileStorage] 已删除: ${objectName}`);
    return true;
  } catch (err) {
    console.error(`[FileStorage] 删除失败:`, err.message);
    return false;
  }
}

module.exports = {
  uploadBuffer,
  downloadAndStore,
  downloadAndStoreMany,
  deleteObject,
  getPublicUrl,
  isConfigured,
  ensureReady,
};
