const express = require('express');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const { queryOne, execute } = require('./dbHelper');
const { authMiddleware } = require('./middleware');
const { listBillingRecords, getBillingStats } = require('./aiBillingService');

const router = express.Router();

// ========== 头像上传配置 ==========

const ALLOWED_MIMETYPES = ['image/png', 'image/jpeg', 'image/webp'];
const EXTENSION_MAP = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' };
const MAX_AVATAR_SIZE = 5 * 1024 * 1024; // 5MB
const UPLOADS_BASE = path.join(__dirname, '..', 'uploads');

const avatarStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = path.join(UPLOADS_BASE, 'avatars');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const ext = EXTENSION_MAP[file.mimetype] || 'png';
    cb(null, `user_${req.user.id}_${Date.now()}.${ext}`);
  }
});

const avatarUpload = multer({
  storage: avatarStorage,
  fileFilter: (req, file, cb) => {
    if (ALLOWED_MIMETYPES.includes(file.mimetype)) cb(null, true);
    else cb(new Error('不支持的文件类型，仅支持 PNG/JPG/WebP 格式'), false);
  },
  limits: { fileSize: MAX_AVATAR_SIZE }
});

// ========== API 路由 ==========

// 获取用户信息（包括余额和资料字段）
router.get('/profile', authMiddleware, async (req, res) => {
  const userId = req.user.id;

  try {
    const user = await queryOne(
      'SELECT id, email, nickname, avatar_url, signature, balance, created_at FROM users WHERE id = ?',
      [userId]
    );

    if (!user) {
      return res.status(404).json({ message: '用户不存在' });
    }

    res.json(user);
  } catch (error) {
    console.error('[User Profile]', error);
    res.status(500).json({ message: '获取用户信息失败' });
  }
});

// 更新用户资料（昵称、签名）
router.put('/profile', authMiddleware, async (req, res) => {
  const userId = req.user.id;
  const { nickname, signature } = req.body;

  try {
    const updates = [];
    const values = [];

    if (nickname !== undefined) {
      const trimmed = String(nickname).trim();
      if (trimmed.length > 50) {
        return res.status(400).json({ message: '昵称最多50个字符' });
      }
      updates.push('nickname = ?');
      values.push(trimmed || null);
    }

    if (signature !== undefined) {
      const trimmed = String(signature).trim();
      if (trimmed.length > 200) {
        return res.status(400).json({ message: '签名最多200个字符' });
      }
      updates.push('signature = ?');
      values.push(trimmed || null);
    }

    if (updates.length === 0) {
      return res.status(400).json({ message: '没有需要更新的字段' });
    }

    values.push(userId);
    await execute(
      `UPDATE users SET ${updates.join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
      values
    );

    // 返回更新后的用户信息
    const user = await queryOne(
      'SELECT id, email, nickname, avatar_url, signature, balance, created_at FROM users WHERE id = ?',
      [userId]
    );

    res.json({ message: '资料更新成功', user });
  } catch (error) {
    console.error('[User Profile Update]', error);
    res.status(500).json({ message: '更新资料失败' });
  }
});

// 上传头像
router.post('/avatar', authMiddleware, avatarUpload.single('avatar'), async (req, res) => {
  const userId = req.user.id;

  if (!req.file) {
    return res.status(400).json({ message: '请选择要上传的头像图片' });
  }

  try {
    // 获取旧头像路径，用于清理
    const oldUser = await queryOne('SELECT avatar_url FROM users WHERE id = ?', [userId]);
    
    const avatarUrl = `/uploads/avatars/${req.file.filename}`;

    await execute(
      'UPDATE users SET avatar_url = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      [avatarUrl, userId]
    );

    // 清理旧头像文件
    if (oldUser?.avatar_url && oldUser.avatar_url.startsWith('/uploads/avatars/')) {
      const oldPath = path.join(UPLOADS_BASE, '..', oldUser.avatar_url);
      if (fs.existsSync(oldPath)) {
        fs.unlinkSync(oldPath);
      }
    }

    console.log('[User Avatar] 上传成功:', { userId, avatarUrl });
    res.json({ message: '头像上传成功', avatar_url: avatarUrl });
  } catch (err) {
    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }
    console.error('[User Avatar]', err);
    res.status(500).json({ message: '头像上传失败' });
  }
});

// 获取消费记录
router.get('/billing', authMiddleware, async (req, res) => {
  const userId = req.user.id;
  const {
    limit: rawLimit = 20,
    offset: rawOffset,
    page: rawPage,
    chargeStatus,
    modelCategory,
    sourceType
  } = req.query;

  try {
    const limit = Math.min(Math.max(parseInt(rawLimit, 10) || 20, 1), 100);
    const page = parseInt(rawPage, 10) || 0;
    const offset = page > 0 ? (page - 1) * limit : (parseInt(rawOffset, 10) || 0);

    const result = await listBillingRecords(userId, {
      limit,
      offset,
      chargeStatus: chargeStatus || null,
      modelCategory: modelCategory || null,
      sourceType: sourceType || null
    });

    res.json(result);
  } catch (error) {
    console.error('[User Billing]', error);
    res.status(500).json({ message: '获取消费记录失败' });
  }
});

// 获取消费统计
router.get('/stats', authMiddleware, async (req, res) => {
  const userId = req.user.id;

  try {
    const stats = await getBillingStats(userId);
    res.json(stats);
  } catch (error) {
    console.error('[User Stats]', error);
    res.status(500).json({ message: '获取统计数据失败' });
  }
});

module.exports = router;
