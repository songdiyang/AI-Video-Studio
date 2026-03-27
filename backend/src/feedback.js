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
      status ENUM('pending', 'reviewing', 'resolved', 'closed', 'replied') DEFAULT 'pending' COMMENT '处理状态',
      admin_reply TEXT DEFAULT NULL COMMENT '管理员回复',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_user_id (user_id),
      INDEX idx_status (status),
      INDEX idx_type (type)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
  // 迁移：为已有表添加 replied 枚举值
  try {
    await execute(`ALTER TABLE feedback MODIFY COLUMN status ENUM('pending', 'reviewing', 'resolved', 'closed', 'replied') DEFAULT 'pending' COMMENT '处理状态'`);
  } catch (e) { /* 已经是最新结构则忽略 */ }
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

    // 查询总数用于分页
    const countParams = params.slice(0, params.length - 2); // 去掉 limit 和 offset
    const countRow = await queryOne(
      `SELECT COUNT(*) as total FROM feedback f WHERE ${where}`,
      countParams
    );

    res.json({ feedbacks, total: countRow ? countRow.total : 0 });
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

// POST /api/feedback/admin/:id/mail - 管理员给反馈用户发站内信
router.post('/admin/:id/mail', authMiddleware, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { title, content } = req.body;

    if (!title || !content) {
      return res.status(400).json({ error: '标题和内容不能为空' });
    }

    const feedback = await queryOne(
      'SELECT id, user_id FROM feedback WHERE id = ?',
      [id]
    );
    if (!feedback) {
      return res.status(404).json({ error: '反馈不存在' });
    }

    await execute(
      `INSERT INTO internal_mail (sender_type, sender_id, receiver_id, title, content, mail_type, related_feedback_id)
       VALUES ('admin', ?, ?, ?, ?, 'reply', ?)`,
      [req.user.id, feedback.user_id, title, content, id]
    );

    // 自动将反馈状态更新为 "已回复"
    await execute('UPDATE feedback SET status = ? WHERE id = ?', ['replied', id]);

    res.json({ success: true });
  } catch (err) {
    console.error('[Feedback] 发送站内信失败:', err);
    res.status(500).json({ error: '发送站内信失败' });
  }
});

// POST /api/feedback/admin/announce - 管理员群发公告站内信
router.post('/admin/announce', authMiddleware, requireAdmin, async (req, res) => {
  try {
    const { title, content } = req.body;

    if (!title || !content) {
      return res.status(400).json({ error: '公告标题和内容不能为空' });
    }

    const users = await queryAll('SELECT id FROM users');
    if (!users || users.length === 0) {
      return res.status(400).json({ error: '没有可发送的用户' });
    }

    let sent = 0;
    for (const user of users) {
      await execute(
        `INSERT INTO internal_mail (sender_type, sender_id, receiver_id, title, content, mail_type)
         VALUES ('admin', ?, ?, ?, ?, 'announce')`,
        [req.user.id, user.id, title, content]
      );
      sent++;
    }

    res.json({ success: true, total: users.length, sent });
  } catch (err) {
    console.error('[Feedback] 群发公告失败:', err);
    res.status(500).json({ error: '群发公告失败' });
  }
});

// GET /api/feedback/admin/announcements - 获取公告历史列表
router.get('/admin/announcements', authMiddleware, requireAdmin, async (req, res) => {
  try {
    const { page = 1, limit = 10, q = '' } = req.query;
    const offset = (Math.max(1, Number(page)) - 1) * Number(limit);

    // 查询公告列表（去重，按标题和内容分组，取最新的一条）
    let where = "m.mail_type = 'announce' AND m.sender_type = 'admin'";
    const params = [];
    if (q) {
      where += ' AND (m.title LIKE ? OR m.content LIKE ?)';
      params.push(`%${q}%`, `%${q}%`);
    }

    // 获取去重后的公告列表
    const announcements = await queryAll(
      `SELECT 
        m.id,
        m.title,
        m.content,
        m.sender_id as created_by,
        u.email as created_by_email,
        m.created_at,
        COUNT(DISTINCT m2.receiver_id) as total_count,
        COUNT(DISTINCT m2.receiver_id) as sent_count
       FROM internal_mail m
       LEFT JOIN users u ON m.sender_id = u.id
       LEFT JOIN internal_mail m2 ON m.title = m2.title AND m.content = m2.content AND m2.mail_type = 'announce'
       WHERE ${where}
       GROUP BY m.title, m.content
       ORDER BY m.created_at DESC
       LIMIT ? OFFSET ?`,
      [...params, Number(limit), offset]
    );

    // 查询总数（去重后的公告数量）
    const countRow = await queryOne(
      `SELECT COUNT(DISTINCT CONCAT(m.title, m.content)) as total 
       FROM internal_mail m 
       WHERE ${where}`,
      params
    );

    res.json({ announcements, total: countRow ? countRow.total : 0 });
  } catch (err) {
    console.error('[Feedback] 获取公告列表失败:', err);
    res.status(500).json({ error: '获取公告列表失败' });
  }
});

// DELETE /api/feedback/admin/announcements/:id - 删除公告
router.delete('/admin/announcements/:id', authMiddleware, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    
    // 获取公告信息（用于确认存在）
    const announcement = await queryOne(
      'SELECT id FROM internal_mail WHERE id = ? AND mail_type = "announce"',
      [id]
    );
    
    if (!announcement) {
      return res.status(404).json({ error: '公告不存在' });
    }
    
    // 删除该公告（根据标题和内容匹配的所有记录）
    const targetMail = await queryOne(
      'SELECT title, content FROM internal_mail WHERE id = ?',
      [id]
    );
    
    if (targetMail) {
      await execute(
        'DELETE FROM internal_mail WHERE title = ? AND content = ? AND mail_type = "announce"',
        [targetMail.title, targetMail.content]
      );
    }
    
    res.json({ success: true });
  } catch (err) {
    console.error('[Feedback] 删除公告失败:', err);
    res.status(500).json({ error: '删除公告失败' });
  }
});

module.exports = {
  router,
  ensureFeedbackTable
};
