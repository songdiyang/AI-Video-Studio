/**
 * 文件代理路由
 *
 * GET /api/files/:objectPath(*)
 * POST /api/proxy/image — 代理下载任意图片 URL 并返回 Blob（解决前端跨域）
 *
 * 当存储桶设置为公开只读时，前端可直接通过 MINIO_PUBLIC_URL 访问文件。
 * 此路由作为备选方案，用于：
 * 1. 桶未公开时，通过后端代理访问
 * 2. 需要鉴权控制文件访问时
 * 3. 前端 Canvas 需要跨域图片时，通过后端代理绕开 CORS 限制
 */

const express = require('express');
const router = express.Router();
const { StorageFactory } = require('../storage');
const { safeFetch } = require('../utils/outboundRequestGuard');
const { authMiddleware } = require('../middleware');

let storageClient = null;
let initPromise = null;

async function ensureStorage() {
  if (storageClient) return storageClient;
  if (!initPromise) {
    initPromise = (async () => {
      storageClient = StorageFactory.create();
      if (storageClient) {
        await storageClient.init();
      }
      return storageClient;
    })();
  }
  return initPromise;
}

// GET /api/files/images/frames/123/first_frame.png
router.get('/*', async (req, res) => {
  const objectPath = req.params[0];
  if (!objectPath) {
    return res.status(400).json({ message: '缺少文件路径' });
  }

  try {
    const storage = await ensureStorage();
    if (!storage) {
      return res.status(503).json({ message: '文件存储服务未配置' });
    }

    const info = await storage.head(objectPath);

    if (info.contentType) {
      res.setHeader('Content-Type', info.contentType);
    }
    res.setHeader('Content-Length', info.size);
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');

    const result = await storage.download(objectPath);
    result.stream.pipe(res);
  } catch (err) {
    if (err.name === 'NoSuchKey' || err.Code === 'NoSuchKey' ||
        err.code === 'NoSuchKey' || err.code === 'NotFound') {
      return res.status(404).json({ message: '文件不存在' });
    }
    console.error('[FileProxy] 获取文件失败:', err.message);
    res.status(500).json({ message: '获取文件失败' });
  }
});

/**
 * POST /api/proxy/image
 * 代理下载任意图片 URL，返回图片二进制（带鉴权）
 * 用于前端 Canvas 裁剪时绕开第三方存储的 CORS 限制
 */
router.post('/image', authMiddleware, async (req, res) => {
  const { url } = req.body;
  if (!url || typeof url !== 'string') {
    return res.status(400).json({ message: '缺少 url 参数' });
  }

  // 只允许 http/https URL
  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    return res.status(400).json({ message: '无效的 URL' });
  }

  try {
    const response = await safeFetch(url, { timeout: 30000 }, '图片代理下载');

    if (!response.ok) {
      return res.status(502).json({ message: `源服务器返回 ${response.status}` });
    }

    const contentType = response.headers.get('content-type') || 'application/octet-stream';
    const contentLength = response.headers.get('content-length');

    res.setHeader('Content-Type', contentType);
    if (contentLength) {
      res.setHeader('Content-Length', contentLength);
    }
    res.setHeader('Cache-Control', 'private, max-age=300');

    // 流式转发
    const buffer = await response.arrayBuffer();
    res.send(Buffer.from(buffer));
  } catch (err) {
    console.error('[FileProxy] 代理下载图片失败:', err.message);
    res.status(500).json({ message: '代理下载图片失败' });
  }
});

module.exports = router;
