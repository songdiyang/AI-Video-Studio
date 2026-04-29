/**
 * 场景参考图 API
 * 
 * POST   /:sceneId/reference-image  - 上传场景参考图
 * DELETE /:sceneId/reference-image  - 删除场景参考图
 * GET    /:sceneId/reference-image  - 获取场景参考图
 */

const path = require('path');
const fs = require('fs');
const multer = require('multer');
const { queryOne, execute } = require('../../dbHelper');
const { getUploadsBase } = require('../../utils/uploadsBase');

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
const UPLOADS_BASE = getUploadsBase();

// 配置 multer 存储
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const tempDir = path.join(UPLOADS_BASE, 'temp');
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }
    cb(null, tempDir);
  },
  filename: (req, file, cb) => {
    const ext = EXTENSION_MAP[file.mimetype] || 'png';
    cb(null, `scene_ref_temp_${Date.now()}.${ext}`);
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
 */
async function getSceneWithAuth(sceneId, userId) {
  return queryOne(
    'SELECT id, user_id, project_id, reference_image_url FROM scenes WHERE id = ? AND user_id = ?',
    [sceneId, userId]
  );
}

/**
 * 删除文件（如果存在）
 */
function safeDeleteFile(filePath) {
  if (filePath && fs.existsSync(filePath)) {
    try {
      fs.unlinkSync(filePath);
    } catch (err) {
      console.error('[SceneRefImage] Failed to delete file:', filePath, err.message);
    }
  }
}

/**
 * POST /:sceneId/reference-image
 * 上传场景参考图
 */
async function uploadReferenceImage(req, res) {
  const userId = req.user.id;
  const sceneId = Number(req.params.sceneId);

  if (!sceneId) {
    return res.status(400).json({ message: '无效的场景 ID' });
  }

  if (!req.file) {
    return res.status(400).json({ message: '请选择要上传的参考图文件' });
  }

  try {
    const scene = await getSceneWithAuth(sceneId, userId);
    if (!scene) {
      safeDeleteFile(req.file.path);
      return res.status(404).json({ message: '场景不存在或无权访问' });
    }

    // 创建存储目录
    const refDir = path.join(UPLOADS_BASE, 'scene-references', String(scene.project_id || 'global'));
    if (!fs.existsSync(refDir)) {
      fs.mkdirSync(refDir, { recursive: true });
    }

    // 生成文件名
    const ext = EXTENSION_MAP[req.file.mimetype] || 'png';
    const fileName = `scene_${sceneId}_ref_${Date.now()}.${ext}`;
    const finalPath = path.join(refDir, fileName);

    // 移动文件到正确目录
    fs.renameSync(req.file.path, finalPath);

    // 删除旧参考图文件
    if (scene.reference_image_url) {
      const relative = scene.reference_image_url.replace(/^\/uploads\//, '');
      const oldFilePath = path.join(UPLOADS_BASE, relative);
      safeDeleteFile(oldFilePath);
    }

    // 生成相对 URL
    const referenceUrl = `/uploads/scene-references/${scene.project_id || 'global'}/${fileName}`;

    // 更新数据库
    await execute(
      'UPDATE scenes SET reference_image_url = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      [referenceUrl, sceneId]
    );

    console.log('[SceneRefImage] Uploaded:', { sceneId, referenceUrl });

    res.json({
      message: '参考图上传成功',
      reference_image_url: referenceUrl
    });
  } catch (err) {
    if (req.file) safeDeleteFile(req.file.path);
    console.error('[SceneRefImage Upload]', err);
    res.status(500).json({ message: '参考图上传失败' });
  }
}

/**
 * DELETE /:sceneId/reference-image
 * 删除场景参考图
 */
async function deleteReferenceImage(req, res) {
  const userId = req.user.id;
  const sceneId = Number(req.params.sceneId);

  if (!sceneId) {
    return res.status(400).json({ message: '无效的场景 ID' });
  }

  try {
    const scene = await getSceneWithAuth(sceneId, userId);
    if (!scene) {
      return res.status(404).json({ message: '场景不存在或无权访问' });
    }

    // 删除文件
    if (scene.reference_image_url) {
      const relative = scene.reference_image_url.replace(/^\/uploads\//, '');
      const filePath = path.join(UPLOADS_BASE, relative);
      safeDeleteFile(filePath);
    }

    // 更新数据库
    await execute(
      'UPDATE scenes SET reference_image_url = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      [sceneId]
    );

    console.log('[SceneRefImage] Deleted:', { sceneId });

    res.json({ success: true, message: '参考图删除成功' });
  } catch (err) {
    console.error('[SceneRefImage Delete]', err);
    res.status(500).json({ message: '删除参考图失败' });
  }
}

/**
 * GET /:sceneId/reference-image
 * 获取场景参考图
 */
async function getReferenceImage(req, res) {
  const userId = req.user.id;
  const sceneId = Number(req.params.sceneId);

  if (!sceneId) {
    return res.status(400).json({ message: '无效的场景 ID' });
  }

  try {
    const scene = await getSceneWithAuth(sceneId, userId);
    if (!scene) {
      return res.status(404).json({ message: '场景不存在或无权访问' });
    }

    res.json({
      reference_image_url: scene.reference_image_url || null
    });
  } catch (err) {
    console.error('[SceneRefImage Get]', err);
    res.status(500).json({ message: '获取参考图失败' });
  }
}

/**
 * 导出路由注册函数
 * @param {import('express').Router} router 
 */
module.exports = function(router) {
  const { authMiddleware } = require('../../middleware');

  router.post('/:sceneId/reference-image', authMiddleware, upload.single('reference_image'), uploadReferenceImage);
  router.delete('/:sceneId/reference-image', authMiddleware, deleteReferenceImage);
  router.get('/:sceneId/reference-image', authMiddleware, getReferenceImage);
};

