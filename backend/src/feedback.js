const express = require('express');
const { queryOne, queryAll, execute } = require('./dbHelper');
const { authMiddleware, requireAdmin } = require('./middleware');

const router = express.Router();

// 确保 feedback 表存在
async function ensureFeedbackTable() {
  await execute(`
    CREATE TABLE IF NOT EXISTS feedback (
      id INT AUTO_INCREMENT PRIMARY KEY,
      user_id INT NOT NULL,
      project_id INT DEFAULT NULL,
      type ENUM('bug', 'feature', 'improvement', 'other') DEFAULT 'other' COMMENT '反馈类型',
      content TEXT NOT NULL COMMENT '反馈内容',
      contact VARCHAR(255) DEFAULT NULL COMMENT '联系方式（可选）',
      status ENUM('pending', 'reviewing', 'resolved', 'closed') DEFAULT 'pending' COMMENT '处理状态',
      admin_reply TEXT DEFAULT NULL COMMENT '管理员回复',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_user_id (user_id),
      INDEX idx_status (status),
      INDEX idx_type (type)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
}

// POST /api/feedback - 提交反馈
router.post('/', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;
    const { type, content, projectId, contact } = req.body;

    if (!content || content.trim().length === 0) {
      return res.status(400).json({ error: '反馈内容不能为空' });
    }
    if (content.length > 5000) {
      return res.status(400).json({ error: '反馈内容不能超过 5000 字' });
    }

    const validTypes = ['bug', 'feature', 'improvement', 'other'];
    const feedbackType = validTypes.includes(type) ? type : 'other';

    const result = await execute(
      `INSERT INTO feedback (user_id, project_id, type, content, contact)
       VALUES (?, ?, ?, ?, ?)`,
      [userId, projectId || null, feedbackType, content.trim(), contact || null]
    );

    const id = result.insertId;
    res.status(201).json({ success: true, id });
  } catch (err) {
    console.error('[Feedback] 提交反馈失败:', err);
    res.status(500).json({ error: '提交反馈失败' });
  }
});

// GET /api/feedback - 获取当前用户的反馈列表
router.get('/', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;
    const feedbacks = await queryAll(
      `SELECT id, type, content, contact, status, admin_reply, project_id, created_at, updated_at
       FROM feedback WHERE user_id = ? ORDER BY created_at DESC LIMIT 50`,
      [userId]
    );
    res.json(feedbacks);
  } catch (err) {
    console.error('[Feedback] 获取反馈列表失败:', err);
    res.status(500).json({ error: '获取反馈列表失败' });
  }
});

// GET /api/feedback/admin - 管理员获取所有反馈
router.get('/admin', authMiddleware, requireAdmin, async (req, res) => {
  try {
    const { status, type, page = 1, limit = 20 } = req.query;
    const offset = (Math.max(1, Number(page)) - 1) * Number(limit);

    let where = '1=1';
    const params = [];
    if (status) { where += ' AND f.status = ?'; params.push(status); }
    if (type) { where += ' AND f.type = ?'; params.push(type); }

    params.push(Number(limit), offset);

    const feedbacks = await queryAll(
      `SELECT f.*, u.email as user_email
       FROM feedback f
       LEFT JOIN users u ON f.user_id = u.id
       WHERE ${where}
       ORDER BY f.created_at DESC
       LIMIT ? OFFSET ?`,
      params
    );

    res.json(feedbacks);
  } catch (err) {
    console.error('[Feedback] 管理员获取反馈失败:', err);
    res.status(500).json({ error: '获取反馈列表失败' });
  }
});

// PATCH /api/feedback/:id - 管理员更新反馈状态/回复
router.patch('/:id', authMiddleware, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { status, admin_reply } = req.body;

    const feedback = await queryOne('SELECT id FROM feedback WHERE id = ?', [id]);
    if (!feedback) {
      return res.status(404).json({ error: '反馈不存在' });
    }

    const updates = [];
    const params = [];
    if (status) { updates.push('status = ?'); params.push(status); }
    if (admin_reply !== undefined) { updates.push('admin_reply = ?'); params.push(admin_reply); }

    if (updates.length === 0) {
      return res.status(400).json({ error: '没有要更新的字段' });
    }

    params.push(id);
    await execute(`UPDATE feedback SET ${updates.join(', ')} WHERE id = ?`, params);

    res.json({ success: true });
  } catch (err) {
    console.error('[Feedback] 更新反馈失败:', err);
    res.status(500).json({ error: '更新反馈失败' });
  }
});

module.exports = {
  router,
  ensureFeedbackTable
};
