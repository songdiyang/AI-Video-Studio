const { queryAll, queryOne, execute } = require('../dbHelper');
const { authMiddleware } = require('../middleware');

// GET /api/collaboration/team/:projectId - 获取项目团队成员
module.exports = (router) => {
  router.get('/collaboration/team/:projectId', authMiddleware, async (req, res) => {
    const userId = req.user.id;
    const { projectId } = req.params;

    try {
      const members = await queryAll(
        `SELECT tc.*, u.email, IFNULL(NULLIF(u.nickname, ''), u.email) as username, u.avatar_url
         FROM team_collaborators tc
         LEFT JOIN users u ON tc.user_id = u.id
         WHERE tc.project_id = ? AND tc.status = 'active'
         ORDER BY tc.role DESC, tc.joined_at DESC`,
        [projectId]
      );

      res.json({ members });
    } catch (error) {
      console.error('[Team Members]', error);
      res.status(500).json({ message: '获取团队成员失败' });
    }
  });

  // POST /api/collaboration/invite - 邀请成员
  router.post('/collaboration/invite', authMiddleware, async (req, res) => {
    const userId = req.user.id;
    const { projectId, email, role = 'viewer' } = req.body;

    if (!projectId || !email) {
      return res.status(400).json({ message: '缺少必要参数' });
    }

    try {
      // 查找用户
      const user = await queryOne('SELECT id FROM users WHERE email = ?', [email]);
      if (!user) {
        return res.status(404).json({ message: '用户不存在' });
      }

      // 检查是否已在团队中
      const existing = await queryOne(
        'SELECT id FROM team_collaborators WHERE project_id = ? AND user_id = ?',
        [projectId, user.id]
      );

      if (existing) {
        return res.status(400).json({ message: '该用户已在团队中' });
      }

      // 添加团队成员
      await execute(
        `INSERT INTO team_collaborators (project_id, user_id, role, invited_by, status)
         VALUES (?, ?, ?, ?, 'active')`,
        [projectId, user.id, role, userId]
      );

      // 记录操作日志
      await execute(
        `INSERT INTO audit_logs (project_id, user_id, action_type, action_description)
         VALUES (?, ?, 'collaboration.invite', ?)`,
        [projectId, userId, `邀请 ${email} 加入项目`]
      );

      console.log(`[Collaboration] 邀请用户：${email} 加入项目 ${projectId}`);

      res.json({ message: '邀请成功' });
    } catch (error) {
      console.error('[Collaboration Invite]', error);
      res.status(500).json({ message: '邀请失败' });
    }
  });

  // PUT /api/collaboration/member/:memberId - 更新成员角色
  router.put('/collaboration/member/:memberId', authMiddleware, async (req, res) => {
    const userId = req.user.id;
    const { memberId } = req.params;
    const { role } = req.body;

    if (!role || !['owner', 'admin', 'editor', 'viewer', 'reviewer'].includes(role)) {
      return res.status(400).json({ message: '无效的角色' });
    }

    try {
      await execute(
        'UPDATE team_collaborators SET role = ? WHERE id = ?',
        [role, memberId]
      );

      // 记录操作日志
      await execute(
        `INSERT INTO audit_logs (user_id, action_type, action_description)
         VALUES (?, 'collaboration.update_role', ?)`,
        [userId, `更新成员角色为 ${role}`]
      );

      console.log(`[Collaboration] 更新成员角色：${memberId} -> ${role}`);

      res.json({ message: '角色更新成功' });
    } catch (error) {
      console.error('[Collaboration Update Role]', error);
      res.status(500).json({ message: '更新角色失败' });
    }
  });

  // DELETE /api/collaboration/member/:memberId - 移除成员
  router.delete('/collaboration/member/:memberId', authMiddleware, async (req, res) => {
    const userId = req.user.id;
    const { memberId } = req.params;

    try {
      await execute(
        'UPDATE team_collaborators SET status = \'removed\' WHERE id = ?',
        [memberId]
      );

      // 记录操作日志
      await execute(
        `INSERT INTO audit_logs (user_id, action_type, action_description)
         VALUES (?, 'collaboration.remove_member', ?)`,
        [userId, '移除团队成员']
      );

      console.log(`[Collaboration] 移除成员：${memberId}`);

      res.json({ message: '成员已移除' });
    } catch (error) {
      console.error('[Collaboration Remove Member]', error);
      res.status(500).json({ message: '移除成员失败' });
    }
  });

  // GET /api/collaboration/annotations/:storyboardId - 获取分镜的批注
  router.get('/collaboration/annotations/:storyboardId', authMiddleware, async (req, res) => {
    const { storyboardId } = req.params;
    const { status = 'open', frameType } = req.query;

    try {
      let sql = `
        SELECT a.*, IFNULL(NULLIF(u.nickname, ''), u.email) as created_by_name, u.avatar_url
        FROM frame_annotations a
        LEFT JOIN users u ON a.created_by = u.id
        WHERE a.storyboard_id = ?
      `;
      const params = [storyboardId];

      if (status && status !== 'all') {
        sql += ' AND a.status = ?';
        params.push(status);
      }

      if (frameType) {
        sql += ' AND a.frame_type = ?';
        params.push(frameType);
      }

      sql += ' ORDER BY a.created_at DESC';

      const annotations = await queryAll(sql, params);

      // 获取回复
      const annotationIds = annotations.map(a => a.id);
      if (annotationIds.length > 0) {
        const replies = await queryAll(
          `SELECT a.*, IFNULL(NULLIF(u.nickname, ''), u.email) as created_by_name
           FROM frame_annotations a
           LEFT JOIN users u ON a.created_by = u.id
           WHERE a.reply_to IN (?)
           ORDER BY a.created_at ASC`,
          [annotationIds]
        );

        // 将回复分组到对应的批注
        annotations.forEach(annotation => {
          annotation.replies = replies.filter(r => r.reply_to === annotation.id);
        });
      }

      res.json({ annotations });
    } catch (error) {
      console.error('[Annotations]', error);
      res.status(500).json({ message: '获取批注失败' });
    }
  });

  // POST /api/collaboration/annotation/create - 创建批注
  router.post('/collaboration/annotation/create', authMiddleware, async (req, res) => {
    const userId = req.user.id;
    const {
      projectId,
      storyboardId,
      frameType = 'first',
      frameTimestamp,
      annotationType = 'comment',
      positionX,
      positionY,
      content,
      replyTo,
      priority = 'medium',
      tags
    } = req.body;

    if (!projectId || !storyboardId || !content) {
      return res.status(400).json({ message: '缺少必要参数' });
    }

    try {
      const result = await execute(
        `INSERT INTO frame_annotations 
         (project_id, storyboard_id, frame_type, frame_timestamp, annotation_type,
          position_x, position_y, content, reply_to, priority, tags, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [projectId, storyboardId, frameType, frameTimestamp, annotationType,
         positionX, positionY, content, replyTo, priority, tags, userId]
      );

      // 记录操作日志
      await execute(
        `INSERT INTO audit_logs (project_id, user_id, action_type, resource_type, resource_id, action_description)
         VALUES (?, ?, 'collaboration.create_annotation', 'storyboard', ?, ?)`,
        [projectId, userId, storyboardId, '创建了批注']
      );

      console.log(`[Collaboration] 创建批注：${result.insertId}`);

      res.json({
        message: '批注创建成功',
        annotationId: result.insertId
      });
    } catch (error) {
      console.error('[Collaboration Create Annotation]', error);
      res.status(500).json({ message: '创建批注失败' });
    }
  });

  // PUT /api/collaboration/annotation/:annotationId/resolve - 解决批注
  router.put('/collaboration/annotation/:annotationId/resolve', authMiddleware, async (req, res) => {
    const userId = req.user.id;
    const { annotationId } = req.params;
    const { resolution = 'resolved' } = req.body;

    try {
      await execute(
        `UPDATE frame_annotations 
         SET status = ?, resolved_at = NOW(), resolved_by = ?
         WHERE id = ?`,
        [resolution, userId, annotationId]
      );

      // 记录操作日志
      await execute(
        `INSERT INTO audit_logs (user_id, action_type, action_description)
         VALUES (?, 'collaboration.resolve_annotation', ?)`,
        [userId, `解决了批注 #${annotationId}`]
      );

      console.log(`[Collaboration] 解决批注：${annotationId}`);

      res.json({ message: '批注已解决' });
    } catch (error) {
      console.error('[Collaboration Resolve Annotation]', error);
      res.status(500).json({ message: '解决批注失败' });
    }
  });

  // GET /api/collaboration/audit-logs/:projectId - 获取操作日志
  router.get('/collaboration/audit-logs/:projectId', authMiddleware, async (req, res) => {
    const { projectId } = req.params;
    const { limit = 100, offset = 0, actionType, userId } = req.query;

    try {
      let sql = `
        SELECT al.*, IFNULL(NULLIF(u.nickname, ''), u.email) as username, u.email
        FROM audit_logs al
        LEFT JOIN users u ON al.user_id = u.id
        WHERE al.project_id = ?
      `;
      const params = [projectId];

      if (actionType) {
        sql += ' AND al.action_type LIKE ?';
        params.push(`%${actionType}%`);
      }

      if (userId) {
        sql += ' AND al.user_id = ?';
        params.push(userId);
      }

      sql += ' ORDER BY al.created_at DESC LIMIT ? OFFSET ?';
      params.push(parseInt(limit), parseInt(offset));

      const logs = await queryAll(sql, params);

      const total = await queryOne(
        'SELECT COUNT(*) as count FROM audit_logs WHERE project_id = ?',
        [projectId]
      );

      res.json({
        logs,
        total: total.count
      });
    } catch (error) {
      console.error('[Audit Logs]', error);
      res.status(500).json({ message: '获取操作日志失败' });
    }
  });
};
