/**
 * 场景草图 API
 * 
 * POST   /:sceneId/sketch  - 上传场景草图
 * DELETE /:sceneId/sketch  - 删除场景草图
 * GET    /:sceneId/sketch  - 获取场景草图
 */

const path = require('path');
const fs = require('fs');
const multer = require('multer');
const { queryOne, execute } = require('../../dbHelper');

// 允许的文件 MIME 类型
const ALLOWED_MIMETYPES = ['image/png', 'image/jpeg', 'image/webp'];

// 文件扩展名映射
const EXTENSION_MAP = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp'
};

// 最大文件大小 10MB
const MAX_FILE_SIZE = 10 * 1024 * 1024;

// 获取 uploads 目录的基础路径
const UPLOADS_BASE = path.join(__dirname, '..', '..', '..', 'uploads');

// 配置 multer 存储
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    // 临时存储位置，后续会移动到正确目录
    const tempDir = path.join(UPLOADS_BASE, 'temp');
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }
    cb(null, tempDir);
  },
  filename: (req, file, cb) => {
    const ext = EXTENSION_MAP[file.mimetype] || 'png';
    cb(null, `scene_temp_${Date.now()}.${ext}`);
  }
});

// 文件过滤器
const fileFilter = (req, file, cb) => {
  if (ALLOWED_MIMETYPES.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('不支持的文件类型，仅支持 PNG/JPG/WebP 格式'), false);
  }
};

const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: MAX_FILE_SIZE
  }
});

/**
 * 获取场景信息并验证用户权限
 * @param {number} sceneId 
 * @param {number} userId 
 * @returns {Promise<object|null>}
 */
async function getSceneWithAuth(sceneId, userId) {
  return queryOne(
    'SELECT id, user_id, project_id, sketch_url FROM scenes WHERE id = ? AND user_id = ?',
    [sceneId, userId]
  );
}

/**
 * 删除文件（如果存在）
 * @param {string} filePath 
 */
function safeDeleteFile(filePath) {
  if (filePath && fs.existsSync(filePath)) {
    try {
      fs.unlinkSync(filePath);
    } catch (err) {
      console.error('[SceneSketch] Failed to delete file:', filePath, err.message);
    }
  }
}

/**
 * POST /:sceneId/sketch
 * 上传场景草图
 */
async function uploadSceneSketch(req, res) {
  const userId = req.user.id;
  const sceneId = Number(req.params.sceneId);

  if (!sceneId) {
    return res.status(400).json({ message: '无效的场景 ID' });
  }

  if (!req.file) {
    return res.status(400).json({ message: '请选择要上传的草图文件' });
  }

  try {
    // 验证用户权限
    const scene = await getSceneWithAuth(sceneId, userId);
    if (!scene) {
      safeDeleteFile(req.file.path);
      return res.status(404).json({ message: '场景不存在或无权访问' });
    }

    // 创建存储目录
    const sketchDir = path.join(UPLOADS_BASE, 'scene-sketches', String(scene.project_id || 'global'));
    if (!fs.existsSync(sketchDir)) {
      fs.mkdirSync(sketchDir, { recursive: true });
    }

    // 生成文件名
    const ext = EXTENSION_MAP[req.file.mimetype] || 'png';
    const fileName = `scene_${sceneId}_${Date.now()}.${ext}`;
    const finalPath = path.join(sketchDir, fileName);

    // 移动文件到正确目录
    fs.renameSync(req.file.path, finalPath);

    // 删除旧草图文件
    if (scene.sketch_url) {
      const relative = scene.sketch_url.replace(/^\/uploads\//, '');
      const oldFilePath = path.join(UPLOADS_BASE, relative);
      safeDeleteFile(oldFilePath);
    }

    // 生成相对 URL
    const sketchUrl = `/uploads/scene-sketches/${scene.project_id || 'global'}/${fileName}`;

    // 更新数据库
    await execute(
      'UPDATE scenes SET sketch_url = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      [sketchUrl, sceneId]
    );

    console.log('[SceneSketch] Uploaded:', { sceneId, sketchUrl });

    res.json({
      message: '草图上传成功',
      sketch_url: sketchUrl
    });
  } catch (err) {
    // 清理临时文件
    if (req.file) safeDeleteFile(req.file.path);
    console.error('[SceneSketch Upload]', err);
    res.status(500).json({ message: '草图上传失败' });
  }
}

/**
 * DELETE /:sceneId/sketch
 * 删除场景草图
 */
async function deleteSceneSketch(req, res) {
  const userId = req.user.id;
  const sceneId = Number(req.params.sceneId);

  if (!sceneId) {
    return res.status(400).json({ message: '无效的场景 ID' });
  }

  try {
    // 验证用户权限
    const scene = await getSceneWithAuth(sceneId, userId);
    if (!scene) {
      return res.status(404).json({ message: '场景不存在或无权访问' });
    }

    // 删除文件
    if (scene.sketch_url) {
      const relative = scene.sketch_url.replace(/^\/uploads\//, '');
      const filePath = path.join(UPLOADS_BASE, relative);
      safeDeleteFile(filePath);
    }

    // 更新数据库
    await execute(
      'UPDATE scenes SET sketch_url = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      [sceneId]
    );

    console.log('[SceneSketch] Deleted:', { sceneId });

    res.json({ success: true, message: '草图删除成功' });
  } catch (err) {
    console.error('[SceneSketch Delete]', err);
    res.status(500).json({ message: '删除草图失败' });
  }
}

/**
 * GET /:sceneId/sketch
 * 获取场景草图
 */
async function getSceneSketch(req, res) {
  const userId = req.user.id;
  const sceneId = Number(req.params.sceneId);

  if (!sceneId) {
    return res.status(400).json({ message: '无效的场景 ID' });
  }

  try {
    // 验证用户权限
    const scene = await getSceneWithAuth(sceneId, userId);
    if (!scene) {
      return res.status(404).json({ message: '场景不存在或无权访问' });
    }

    res.json({
      sketch_url: scene.sketch_url || null
    });
  } catch (err) {
    console.error('[SceneSketch Get]', err);
    res.status(500).json({ message: '获取草图失败' });
  }
}

/**
 * 导出路由注册函数
 * @param {import('express').Router} router 
 */
module.exports = function(router) {
  const { authMiddleware } = require('../../middleware');

  // 上传场景草图（使用 multer 处理文件上传）
  router.post('/:sceneId/sketch', authMiddleware, upload.single('sketch'), uploadSceneSketch);

  // 删除场景草图
  router.delete('/:sceneId/sketch', authMiddleware, deleteSceneSketch);

  // 获取场景草图
  router.get('/:sceneId/sketch', authMiddleware, getSceneSketch);
};

