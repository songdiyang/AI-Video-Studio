const express = require('express');
const { queryOne, queryAll, execute } = require('./dbHelper');
const { authMiddleware } = require('./middleware');

const router = express.Router();

// 确保 internal_mail 表存在
async function ensureInternalMailTable() {
  await execute(`
    CREATE TABLE IF NOT EXISTS internal_mail (
      id INT AUTO_INCREMENT PRIMARY KEY,
      sender_type ENUM('system', 'admin') DEFAULT 'system' COMMENT '发送者类型',
      sender_id INT DEFAULT NULL COMMENT '发送者用户ID（管理员）',
      receiver_id INT NOT NULL COMMENT '接收者用户ID',
      title VARCHAR(255) NOT NULL COMMENT '标题',
      content TEXT NOT NULL COMMENT '内容',
      mail_type ENUM('reply', 'announce', 'system') DEFAULT 'system' COMMENT '邮件类型：回复/公告/系统',
      related_feedback_id INT DEFAULT NULL COMMENT '关联的反馈ID',
      is_read TINYINT(1) DEFAULT 0 COMMENT '是否已读',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_receiver (receiver_id),
      INDEX idx_receiver_read (receiver_id, is_read),
      INDEX idx_created (created_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
}

// GET /api/mail - 用户获取站内信列表
router.get('/', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;
    const { page = 1, limit = 20 } = req.query;
    const offset = (Math.max(1, Number(page)) - 1) * Number(limit);

    const mails = await queryAll(
      `SELECT id, sender_type, title, content, mail_type, related_feedback_id, is_read, created_at
       FROM internal_mail
       WHERE receiver_id = ?
       ORDER BY created_at DESC
       LIMIT ? OFFSET ?`,
      [userId, Number(limit), offset]
    );

    const countRow = await queryOne(
      'SELECT COUNT(*) as total FROM internal_mail WHERE receiver_id = ?',
      [userId]
    );

    res.json({ mails, total: countRow ? countRow.total : 0 });
  } catch (err) {
    console.error('[InternalMail] 获取站内信失败:', err);
    res.status(500).json({ error: '获取站内信失败' });
  }
});

// GET /api/mail/unread-count - 获取未读数量
router.get('/unread-count', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;
    const row = await queryOne(
      'SELECT COUNT(*) as count FROM internal_mail WHERE receiver_id = ? AND is_read = 0',
      [userId]
    );
    res.json({ count: row ? row.count : 0 });
  } catch (err) {
    console.error('[InternalMail] 获取未读数失败:', err);
    res.status(500).json({ error: '获取未读数失败' });
  }
});

// PATCH /api/mail/:id/read - 标记单条已读
router.patch('/:id/read', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;
    await execute(
      'UPDATE internal_mail SET is_read = 1 WHERE id = ? AND receiver_id = ?',
      [id, userId]
    );
    res.json({ success: true });
  } catch (err) {
    console.error('[InternalMail] 标记已读失败:', err);
    res.status(500).json({ error: '标记已读失败' });
  }
});

// PATCH /api/mail/read-all - 全部标记已读
router.patch('/read-all', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;
    await execute(
      'UPDATE internal_mail SET is_read = 1 WHERE receiver_id = ? AND is_read = 0',
      [userId]
    );
    res.json({ success: true });
  } catch (err) {
    console.error('[InternalMail] 全部标记已读失败:', err);
    res.status(500).json({ error: '全部标记已读失败' });
  }
});

// DELETE /api/mail/:id - 删除单条站内信
router.delete('/:id', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;
    await execute(
      'DELETE FROM internal_mail WHERE id = ? AND receiver_id = ?',
      [id, userId]
    );
    res.json({ success: true });
  } catch (err) {
    console.error('[InternalMail] 删除站内信失败:', err);
    res.status(500).json({ error: '删除站内信失败' });
  }
});

module.exports = {
  router,
  ensureInternalMailTable
};
