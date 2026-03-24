/**
 * 角色图片上传 API
 * POST /:id/upload-image  - 上传角色参考图片
 */
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const { queryOne, execute } = require('../../dbHelper');
const { authMiddleware } = require('../../middleware');

const ALLOWED_MIMETYPES = ['image/png', 'image/jpeg', 'image/webp'];
const EXTENSION_MAP = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' };
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const UPLOADS_BASE = path.join(__dirname, '..', '..', '..', 'uploads');

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
    cb(null, `char_temp_${Date.now()}.${ext}`);
  }
});

const fileFilter = (req, file, cb) => {
  if (ALLOWED_MIMETYPES.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('不支持的文件类型，仅支持 PNG/JPG/WebP 格式'), false);
  }
};

const upload = multer({ storage, fileFilter, limits: { fileSize: MAX_FILE_SIZE } });

module.exports = (router) => {
  router.post('/:id/upload-image', authMiddleware, upload.single('image'), async (req, res) => {
    const userId = req.user.id;
    const characterId = Number(req.params.id);

    if (!characterId) {
      if (req.file) fs.unlinkSync(req.file.path);
      return res.status(400).json({ message: '无效的角色 ID' });
    }

    if (!req.file) {
      return res.status(400).json({ message: '请选择要上传的图片' });
    }

    try {
      const character = await queryOne(
        'SELECT id, user_id, project_id FROM characters WHERE id = ? AND user_id = ?',
        [characterId, userId]
      );
      if (!character) {
        fs.unlinkSync(req.file.path);
        return res.status(404).json({ message: '角色不存在或无权访问' });
      }

      // 创建存储目录
      const charDir = path.join(UPLOADS_BASE, 'character-images', String(character.project_id || 'global'));
      if (!fs.existsSync(charDir)) {
        fs.mkdirSync(charDir, { recursive: true });
      }

      const ext = EXTENSION_MAP[req.file.mimetype] || 'png';
      const fileName = `char_${characterId}_${Date.now()}.${ext}`;
      const finalPath = path.join(charDir, fileName);

      fs.renameSync(req.file.path, finalPath);

      const imageUrl = `/uploads/character-images/${character.project_id || 'global'}/${fileName}`;

      // 更新角色 image_url
      await execute(
        'UPDATE characters SET image_url = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
        [imageUrl, characterId]
      );

      console.log('[Character Upload] 上传成功:', { characterId, imageUrl });

      res.json({
        message: '图片上传成功',
        image_url: imageUrl
      });
    } catch (err) {
      if (req.file && fs.existsSync(req.file.path)) {
        fs.unlinkSync(req.file.path);
      }
      console.error('[Character Upload]', err);
      res.status(500).json({ message: '上传失败' });
    }
  });
};
