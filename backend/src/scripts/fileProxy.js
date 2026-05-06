/**
 * 文件代理路由
 * 
 * GET /api/files/:objectPath(*)
 * 
 * 当存储桶设置为公开只读时，前端可直接通过 MINIO_PUBLIC_URL 访问文件。
 * 此路由作为备选方案，用于：
 * 1. 桶未公开时，通过后端代理访问
 * 2. 需要鉴权控制文件访问时
 */

const express = require('express');
const router = express.Router();
const { StorageFactory } = require('../storage');

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

module.exports = router;
