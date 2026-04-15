/**
 * 文件上传 API - 直接上传到 MinIO
 * 端点:
 * - POST /api/upload - 上传文件到 MinIO
 */
const multer = require('multer');
const { authMiddleware } = require('../../middleware');
const { uploadBuffer, isMinIOReady } = require('../../utils/fileStorage');
const { queryOne, execute } = require('../../dbHelper');

// 内存存储（不保存到本地磁盘）
const storage = multer.memoryStorage();

// 文件过滤器 - 只允许图片
const fileFilter = (req, file, cb) => {
  const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
  if (allowedTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('只允许上传图片文件 (JPEG, PNG, GIF, WebP)'), false);
  }
};

// 配置 multer
const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB 限制
  },
});

/**
 * 生成存储路径
 * @param {string} assetType - 资产类型 (character, character_state, prop)
 * @param {number} assetId - 资产ID
 * @param {string} viewType - 视角类型 (front, side, back, other)
 * @param {string} originalName - 原始文件名
 * @returns {string} MinIO 存储路径
 */
function generateObjectPath(assetType, assetId, viewType, originalName) {
  const timestamp = Date.now();
  const ext = originalName.match(/\.[^.]+$/)?.[0] || '.png';
  
  // 根据资产类型生成路径
  switch (assetType) {
    case 'character':
      return `images/characters/${assetId}/${viewType}_${timestamp}${ext}`;
    case 'character_state':
      return `images/character_states/${assetId}/${viewType}_${timestamp}${ext}`;
    case 'prop':
      return `images/props/${assetId}/${viewType}_${timestamp}${ext}`;
    default:
      return `images/uploads/${assetType}_${assetId}_${timestamp}${ext}`;
  }
}

/**
 * 验证资产所有权
 */
async function verifyAssetOwnership(assetType, assetId, userId) {
  switch (assetType) {
    case 'character': {
      const character = await queryOne(
        'SELECT id FROM characters WHERE id = ? AND user_id = ?',
        [assetId, userId]
      );
      return !!character;
    }
    case 'character_state': {
      const state = await queryOne(
        `SELECT cs.id FROM character_states cs
         JOIN characters c ON cs.character_id = c.id
         WHERE cs.id = ? AND c.user_id = ?`,
        [assetId, userId]
      );
      return !!state;
    }
    case 'prop': {
      const prop = await queryOne(
        'SELECT id FROM props WHERE id = ? AND user_id = ?',
        [assetId, userId]
      );
      return !!prop;
    }
    default:
      return false;
  }
}

module.exports = (router) => {
  // POST /api/upload - 上传文件
  router.post(
    '/upload',
    authMiddleware,
    upload.single('file'),
    async (req, res) => {
      try {
        // 检查是否有文件
        if (!req.file) {
          return res.status(400).json({ message: '没有上传文件或文件类型不支持' });
        }

        const userId = req.user.id;
        const { asset_type, asset_id, view_type = 'other', description } = req.body;

        // 验证必要参数
        if (!asset_type || !asset_id) {
          return res.status(400).json({ message: '缺少 asset_type 或 asset_id 参数' });
        }

        // 验证资产类型
        const validTypes = ['character', 'character_state', 'prop'];
        if (!validTypes.includes(asset_type)) {
          return res.status(400).json({ message: '无效的 asset_type' });
        }

        // 验证视角类型
        const validViewTypes = ['front', 'side', 'back', 'other'];
        const finalViewType = validViewTypes.includes(view_type) ? view_type : 'other';

        // 验证资产所有权
        const hasAccess = await verifyAssetOwnership(asset_type, parseInt(asset_id), userId);
        if (!hasAccess) {
          return res.status(403).json({ message: '无权访问该资产' });
        }

        // 检查 MinIO 是否可用
        const minioReady = await isMinIOReady();
        if (!minioReady) {
          return res.status(503).json({ 
            message: '文件存储服务暂时不可用，请稍后重试',
            code: 'STORAGE_UNAVAILABLE'
          });
        }

        // 生成存储路径
        const objectPath = generateObjectPath(
          asset_type,
          parseInt(asset_id),
          finalViewType,
          req.file.originalname
        );

        // 上传到 MinIO
        const persistentUrl = await uploadBuffer(
          req.file.buffer,
          objectPath,
          { contentType: req.file.mimetype }
        );

        // 保存到数据库（asset_reference_images 表）
        // 获取当前最大排序值
        const maxOrder = await queryOne(
          'SELECT MAX(sort_order) as max_order FROM asset_reference_images WHERE asset_type = ? AND asset_id = ?',
          [asset_type, parseInt(asset_id)]
        );
        const newSortOrder = (maxOrder?.max_order || 0) + 1;

        const result = await execute(
          `INSERT INTO asset_reference_images 
           (asset_type, asset_id, image_url, description, view_type, sort_order, is_enabled)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [
            asset_type,
            parseInt(asset_id),
            persistentUrl,
            description || null,
            finalViewType,
            newSortOrder,
            true
          ]
        );

        // 返回结果
        const image = await queryOne(
          'SELECT * FROM asset_reference_images WHERE id = ?',
          [result.insertId]
        );

        res.status(201).json({
          message: '文件上传成功',
          image,
          url: persistentUrl,
        });
      } catch (error) {
        console.error('[File Upload]', error);
        
        // 处理 multer 错误
        if (error.code === 'LIMIT_FILE_SIZE') {
          return res.status(400).json({ 
            message: '文件大小超过限制（最大 10MB）',
            code: 'FILE_TOO_LARGE'
          });
        }
        
        res.status(500).json({ 
          message: '文件上传失败: ' + (error.message || '未知错误'),
          code: 'UPLOAD_FAILED'
        });
      }
    }
  );

  // GET /api/upload/status - 检查上传服务状态
  router.get('/upload/status', authMiddleware, async (req, res) => {
    try {
      const minioReady = await isMinIOReady();
      res.json({
        ready: minioReady,
        maxFileSize: 10 * 1024 * 1024, // 10MB
        allowedTypes: ['image/jpeg', 'image/png', 'image/gif', 'image/webp'],
      });
    } catch (error) {
      console.error('[Upload Status]', error);
      res.status(500).json({ message: '检查服务状态失败' });
    }
  });
};
