/**
 * 任务指派 API 模块
 * 支持管理员向团队成员分配任务，任务通过站内信发送
 */

const express = require('express');
const { queryOne, queryAll, execute } = require('./dbHelper');
const { authMiddleware } = require('./middleware');
const { checkTeamPermission } = require('./middleware/collaborationAuth');

const router = express.Router();

// 优先级配置
const PRIORITY_CONFIG = {
  low: { label: '低', color: 'green' },
  medium: { label: '中', color: 'blue' },
  high: { label: '高', color: 'orange' },
  urgent: { label: '紧急', color: 'red' }
};

// 状态配置
const STATUS_CONFIG = {
  pending: { label: '待接收', color: 'gray' },
  accepted: { label: '已接受', color: 'blue' },
  in_progress: { label: '进行中', color: 'orange' },
  completed: { label: '已完成', color: 'green' },
  rejected: { label: '已拒绝', color: 'red' }
};

/**
 * 创建任务指派
 * POST /api/tasks/assign
 * 需要团队 admin 或 owner 权限
 */
router.post('/assign', authMiddleware, async (req, res) => {
  try {
    const assignerId = req.user.id;
    const { 
      teamId, 
      assigneeId, 
      title, 
      description, 
      priority = 'medium', 
      deadline, 
      projectId, 
      storyboardId 
    } = req.body;

    // 参数校验
    if (!teamId || !assigneeId || !title?.trim()) {
      return res.status(400).json({ error: '团队ID、接收者ID和任务标题不能为空' });
    }

    // 验证优先级
    if (!PRIORITY_CONFIG[priority]) {
      return res.status(400).json({ error: '无效的优先级' });
    }

    // 检查指派者是否有权限（admin 或 owner）
    const assignerRole = await queryOne(
      'SELECT role FROM team_members WHERE team_id = ? AND user_id = ?',
      [teamId, assignerId]
    );
    if (!assignerRole || !['admin', 'owner'].includes(assignerRole.role)) {
      return res.status(403).json({ error: '只有团队管理员或所有者可以指派任务' });
    }

    // 检查接收者是否是团队成员
    const assigneeMember = await queryOne(
      `SELECT tm.user_id, IFNULL(NULLIF(u.nickname, ''), u.email) as username 
       FROM team_members tm 
       JOIN users u ON tm.user_id = u.id 
       WHERE tm.team_id = ? AND tm.user_id = ?`,
      [teamId, assigneeId]
    );
    if (!assigneeMember) {
      return res.status(400).json({ error: '接收者不是该团队的成员' });
    }

    // 获取团队信息
    const team = await queryOne('SELECT name FROM teams WHERE id = ?', [teamId]);

    // 获取项目信息（如果有）
    let projectName = null;
    if (projectId) {
      const project = await queryOne('SELECT name FROM projects WHERE id = ?', [projectId]);
      projectName = project?.name;
    }

    // 获取分镜信息（如果有）
    let storyboardInfo = null;
    if (storyboardId) {
      const storyboard = await queryOne(
        'SELECT id, scene_number FROM storyboards WHERE id = ?', 
        [storyboardId]
      );
      storyboardInfo = storyboard;
    }

    // 创建任务记录
    const taskResult = await execute(
      `INSERT INTO task_assignments 
       (team_id, project_id, storyboard_id, assigner_id, assignee_id, title, description, priority, deadline, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')`,
      [teamId, projectId || null, storyboardId || null, assignerId, assigneeId, title.trim(), description?.trim() || null, priority, deadline || null]
    );
    const taskId = taskResult.insertId;

    // 构建站内信内容（JSON 格式，方便前端解析）
    const mailContent = JSON.stringify({
      taskId,
      title: title.trim(),
      description: description?.trim() || '',
      priority,
      priorityLabel: PRIORITY_CONFIG[priority].label,
      deadline: deadline || null,
      teamId,
      teamName: team?.name || '未知团队',
      projectId: projectId || null,
      projectName: projectName,
      storyboardId: storyboardId || null,
      storyboardInfo: storyboardInfo
    });

    // 发送站内信通知
    const mailResult = await execute(
      `INSERT INTO internal_mail 
       (sender_type, sender_id, receiver_id, title, content, mail_type, related_task_id)
       VALUES ('admin', ?, ?, ?, ?, 'task', ?)`,
      [assignerId, assigneeId, `[任务指派] ${title.trim()}`, mailContent, taskId]
    );

    res.json({ 
      success: true, 
      taskId, 
      mailId: mailResult.insertId,
      message: '任务指派成功' 
    });
  } catch (err) {
    console.error('[TaskAssignment] 创建任务指派失败:', err);
    res.status(500).json({ error: '创建任务指派失败' });
  }
});

/**
 * 获取团队所有任务
 * GET /api/tasks/team/:teamId
 */
router.get('/team/:teamId', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;
    const { teamId } = req.params;
    const { status, page = 1, limit = 20 } = req.query;

    // 检查用户是否是团队成员
    const memberRole = await queryOne(
      'SELECT role FROM team_members WHERE team_id = ? AND user_id = ?',
      [teamId, userId]
    );
    if (!memberRole) {
      return res.status(403).json({ error: '您不是该团队的成员' });
    }

    // 构建查询条件
    let whereClause = 'WHERE ta.team_id = ?';
    const params = [teamId];

    if (status) {
      whereClause += ' AND ta.status = ?';
      params.push(status);
    }

    // 获取任务列表
    const tasks = await queryAll(
      `SELECT 
        ta.*,
        assigner.email as assigner_name,
        assignee.email as assignee_name,
        p.name as project_name,
        t.name as team_name
       FROM task_assignments ta
       JOIN users assigner ON ta.assigner_id = assigner.id
       JOIN users assignee ON ta.assignee_id = assignee.id
       LEFT JOIN projects p ON ta.project_id = p.id
       LEFT JOIN teams t ON ta.team_id = t.id
       ${whereClause}
       ORDER BY 
         FIELD(ta.priority, 'urgent', 'high', 'medium', 'low'),
         ta.created_at DESC
       LIMIT ? OFFSET ?`,
      [...params, Number(limit), (Math.max(1, Number(page)) - 1) * Number(limit)]
    );

    // 获取总数
    const countRow = await queryOne(
      `SELECT COUNT(*) as total FROM task_assignments ta ${whereClause}`,
      params
    );

    res.json({ 
      tasks, 
      total: countRow?.total || 0,
      page: Number(page),
      limit: Number(limit)
    });
  } catch (err) {
    console.error('[TaskAssignment] 获取团队任务失败:', err);
    res.status(500).json({ error: '获取团队任务失败' });
  }
});

/**
 * 获取我的任务列表
 * GET /api/tasks/my
 */
router.get('/my', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;
    const { status, page = 1, limit = 20 } = req.query;

    // 构建查询条件
    let whereClause = 'WHERE ta.assignee_id = ?';
    const params = [userId];

    if (status) {
      whereClause += ' AND ta.status = ?';
      params.push(status);
    }

    // 获取任务列表
    const tasks = await queryAll(
      `SELECT 
        ta.*,
        assigner.email as assigner_name,
        p.name as project_name,
        t.name as team_name
       FROM task_assignments ta
       JOIN users assigner ON ta.assigner_id = assigner.id
       LEFT JOIN projects p ON ta.project_id = p.id
       LEFT JOIN teams t ON ta.team_id = t.id
       ${whereClause}
       ORDER BY 
         FIELD(ta.status, 'pending', 'accepted', 'in_progress', 'completed', 'rejected'),
         FIELD(ta.priority, 'urgent', 'high', 'medium', 'low'),
         ta.created_at DESC
       LIMIT ? OFFSET ?`,
      [...params, Number(limit), (Math.max(1, Number(page)) - 1) * Number(limit)]
    );

    // 获取总数
    const countRow = await queryOne(
      `SELECT COUNT(*) as total FROM task_assignments ta ${whereClause}`,
      params
    );

    // 获取各状态统计
    const statsRows = await queryAll(
      `SELECT status, COUNT(*) as count 
       FROM task_assignments 
       WHERE assignee_id = ? 
       GROUP BY status`,
      [userId]
    );
    const stats = {};
    statsRows.forEach(row => {
      stats[row.status] = row.count;
    });

    res.json({ 
      tasks, 
      total: countRow?.total || 0,
      stats,
      page: Number(page),
      limit: Number(limit)
    });
  } catch (err) {
    console.error('[TaskAssignment] 获取我的任务失败:', err);
    res.status(500).json({ error: '获取我的任务失败' });
  }
});

/**
 * 获取单个任务详情
 * GET /api/tasks/:id
 */
router.get('/:id', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;

    const task = await queryOne(
      `SELECT 
        ta.*,
        assigner.email as assigner_name,
        assignee.email as assignee_name,
        p.name as project_name,
        t.name as team_name
       FROM task_assignments ta
       JOIN users assigner ON ta.assigner_id = assigner.id
       JOIN users assignee ON ta.assignee_id = assignee.id
       LEFT JOIN projects p ON ta.project_id = p.id
       LEFT JOIN teams t ON ta.team_id = t.id
       WHERE ta.id = ?`,
      [id]
    );

    if (!task) {
      return res.status(404).json({ error: '任务不存在' });
    }

    // 检查权限：只有指派者、接收者或团队成员可以查看
    const isMember = await queryOne(
      'SELECT id FROM team_members WHERE team_id = ? AND user_id = ?',
      [task.team_id, userId]
    );
    if (!isMember && task.assigner_id !== userId && task.assignee_id !== userId) {
      return res.status(403).json({ error: '您没有权限查看此任务' });
    }

    res.json({ task });
  } catch (err) {
    console.error('[TaskAssignment] 获取任务详情失败:', err);
    res.status(500).json({ error: '获取任务详情失败' });
  }
});

/**
 * 接受任务
 * PATCH /api/tasks/:id/accept
 */
router.patch('/:id/accept', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;

    // 检查任务是否存在且是指派给当前用户的
    const task = await queryOne(
      'SELECT * FROM task_assignments WHERE id = ? AND assignee_id = ?',
      [id, userId]
    );

    if (!task) {
      return res.status(404).json({ error: '任务不存在或您不是该任务的接收者' });
    }

    if (task.status !== 'pending') {
      return res.status(400).json({ error: '只能接受待处理的任务' });
    }

    // 更新任务状态
    await execute(
      `UPDATE task_assignments 
       SET status = 'accepted', accepted_at = NOW() 
       WHERE id = ?`,
      [id]
    );

    res.json({ success: true, message: '任务已接受' });
  } catch (err) {
    console.error('[TaskAssignment] 接受任务失败:', err);
    res.status(500).json({ error: '接受任务失败' });
  }
});

/**
 * 开始任务
 * PATCH /api/tasks/:id/start
 */
router.patch('/:id/start', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;

    const task = await queryOne(
      'SELECT * FROM task_assignments WHERE id = ? AND assignee_id = ?',
      [id, userId]
    );

    if (!task) {
      return res.status(404).json({ error: '任务不存在或您不是该任务的接收者' });
    }

    if (!['pending', 'accepted'].includes(task.status)) {
      return res.status(400).json({ error: '只能开始待处理或已接受的任务' });
    }

    await execute(
      `UPDATE task_assignments 
       SET status = 'in_progress', accepted_at = COALESCE(accepted_at, NOW()) 
       WHERE id = ?`,
      [id]
    );

    res.json({ success: true, message: '任务已开始' });
  } catch (err) {
    console.error('[TaskAssignment] 开始任务失败:', err);
    res.status(500).json({ error: '开始任务失败' });
  }
});

/**
 * 完成任务
 * PATCH /api/tasks/:id/complete
 */
router.patch('/:id/complete', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;

    const task = await queryOne(
      'SELECT * FROM task_assignments WHERE id = ? AND assignee_id = ?',
      [id, userId]
    );

    if (!task) {
      return res.status(404).json({ error: '任务不存在或您不是该任务的接收者' });
    }

    if (!['accepted', 'in_progress'].includes(task.status)) {
      return res.status(400).json({ error: '只能完成已接受或进行中的任务' });
    }

    await execute(
      `UPDATE task_assignments 
       SET status = 'completed', completed_at = NOW() 
       WHERE id = ?`,
      [id]
    );

    // 发送完成通知给指派者
    await execute(
      `INSERT INTO internal_mail 
       (sender_type, sender_id, receiver_id, title, content, mail_type, related_task_id)
       VALUES ('system', NULL, ?, ?, ?, 'system', ?)`,
      [
        task.assigner_id, 
        `[任务完成] ${task.title}`, 
        JSON.stringify({ 
          type: 'task_completed', 
          taskId: task.id, 
          title: task.title,
          completedBy: userId 
        }),
        task.id
      ]
    );

    res.json({ success: true, message: '任务已完成' });
  } catch (err) {
    console.error('[TaskAssignment] 完成任务失败:', err);
    res.status(500).json({ error: '完成任务失败' });
  }
});

/**
 * 拒绝任务
 * PATCH /api/tasks/:id/reject
 */
router.patch('/:id/reject', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;
    const { reason } = req.body;

    const task = await queryOne(
      'SELECT * FROM task_assignments WHERE id = ? AND assignee_id = ?',
      [id, userId]
    );

    if (!task) {
      return res.status(404).json({ error: '任务不存在或您不是该任务的接收者' });
    }

    if (task.status !== 'pending') {
      return res.status(400).json({ error: '只能拒绝待处理的任务' });
    }

    await execute(
      `UPDATE task_assignments 
       SET status = 'rejected', reject_reason = ? 
       WHERE id = ?`,
      [reason?.trim() || null, id]
    );

    // 发送拒绝通知给指派者
    await execute(
      `INSERT INTO internal_mail 
       (sender_type, sender_id, receiver_id, title, content, mail_type, related_task_id)
       VALUES ('system', NULL, ?, ?, ?, 'system', ?)`,
      [
        task.assigner_id, 
        `[任务被拒绝] ${task.title}`, 
        JSON.stringify({ 
          type: 'task_rejected', 
          taskId: task.id, 
          title: task.title,
          rejectedBy: userId,
          reason: reason?.trim() || '无' 
        }),
        task.id
      ]
    );

    res.json({ success: true, message: '任务已拒绝' });
  } catch (err) {
    console.error('[TaskAssignment] 拒绝任务失败:', err);
    res.status(500).json({ error: '拒绝任务失败' });
  }
});

/**
 * 获取我指派的任务列表（作为指派者）
 * GET /api/tasks/assigned
 */
router.get('/assigned/list', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;
    const { status, teamId, page = 1, limit = 20 } = req.query;

    let whereClause = 'WHERE ta.assigner_id = ?';
    const params = [userId];

    if (status) {
      whereClause += ' AND ta.status = ?';
      params.push(status);
    }

    if (teamId) {
      whereClause += ' AND ta.team_id = ?';
      params.push(teamId);
    }

    const tasks = await queryAll(
      `SELECT 
        ta.*,
        assignee.email as assignee_name,
        p.name as project_name,
        t.name as team_name
       FROM task_assignments ta
       JOIN users assignee ON ta.assignee_id = assignee.id
       LEFT JOIN projects p ON ta.project_id = p.id
       LEFT JOIN teams t ON ta.team_id = t.id
       ${whereClause}
       ORDER BY ta.created_at DESC
       LIMIT ? OFFSET ?`,
      [...params, Number(limit), (Math.max(1, Number(page)) - 1) * Number(limit)]
    );

    const countRow = await queryOne(
      `SELECT COUNT(*) as total FROM task_assignments ta ${whereClause}`,
      params
    );

    res.json({ 
      tasks, 
      total: countRow?.total || 0,
      page: Number(page),
      limit: Number(limit)
    });
  } catch (err) {
    console.error('[TaskAssignment] 获取指派任务失败:', err);
    res.status(500).json({ error: '获取指派任务失败' });
  }
});

module.exports = router;
