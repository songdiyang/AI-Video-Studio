/**
 * 团队协作 API 路由
 * 包含团队管理、成员管理、项目协作者、邀请系统
 */

const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const { queryOne, queryAll, execute } = require('./db');
const { authMiddleware } = require('./middleware');
const { 
  checkTeamPermission, 
  checkProjectPermission,
  checkInvitePermission,
  getTeamRole,
  getEffectiveProjectRole,
  PERMISSION_LEVELS
} = require('./middleware/collaborationAuth');

// 生成随机邀请码
function generateInviteCode(length = 12) {
  return crypto.randomBytes(length).toString('base64url').slice(0, length);
}

// =============================================
// 团队管理 API
// =============================================

/**
 * 创建团队
 * POST /api/teams
 */
router.post('/teams', authMiddleware, async (req, res) => {
  const userId = req.user.id;
  const { name, description, avatar_url } = req.body;

  if (!name || !name.trim()) {
    return res.status(400).json({ message: '团队名称不能为空' });
  }

  try {
    // 生成唯一邀请码
    const inviteCode = generateInviteCode(8);

    // 创建团队
    const result = await execute(
      `INSERT INTO teams (name, description, avatar_url, owner_id, invite_code)
       VALUES (?, ?, ?, ?, ?)`,
      [name.trim(), description || null, avatar_url || null, userId, inviteCode]
    );

    const teamId = result.insertId;

    // 自动添加创建者为 owner 成员
    await execute(
      `INSERT INTO team_members (team_id, user_id, role, invited_by)
       VALUES (?, ?, 'owner', ?)`,
      [teamId, userId, userId]
    );

    res.json({
      message: '团队创建成功',
      team: {
        id: teamId,
        name: name.trim(),
        description,
        avatar_url,
        owner_id: userId,
        invite_code: inviteCode
      }
    });
  } catch (error) {
    console.error('[Collaboration] Create team error:', error);
    res.status(500).json({ message: '创建团队失败' });
  }
});

/**
 * 获取用户所有团队（创建的 + 加入的）
 * GET /api/teams
 */
router.get('/teams', authMiddleware, async (req, res) => {
  const userId = req.user.id;

  try {
    const teams = await queryAll(
      `SELECT 
        t.id, t.name, t.description, t.avatar_url, t.owner_id, 
        t.invite_code, t.max_members, t.created_at,
        tm.role as my_role,
        (SELECT COUNT(*) FROM team_members WHERE team_id = t.id) as members_count,
        (SELECT COUNT(*) FROM projects WHERE team_id = t.id) as projects_count,
        u.email as owner_username,
        u.avatar_url as owner_avatar
       FROM teams t
       JOIN team_members tm ON t.id = tm.team_id AND tm.user_id = ?
       JOIN users u ON t.owner_id = u.id
       WHERE t.is_active = 1
       ORDER BY t.created_at DESC`,
      [userId]
    );

    res.json({ teams });
  } catch (error) {
    console.error('[Collaboration] Get teams error:', error);
    res.status(500).json({ message: '获取团队列表失败' });
  }
});

/**
 * 获取团队详情
 * GET /api/teams/:id
 */
router.get('/teams/:id', authMiddleware, checkTeamPermission('viewer'), async (req, res) => {
  const teamId = req.params.id;

  try {
    const team = await queryOne(
      `SELECT 
        t.*, 
        u.email as owner_username,
        u.avatar_url as owner_avatar,
        (SELECT COUNT(*) FROM team_members WHERE team_id = t.id) as members_count,
        (SELECT COUNT(*) FROM projects WHERE team_id = t.id) as projects_count
       FROM teams t
       JOIN users u ON t.owner_id = u.id
       WHERE t.id = ? AND t.is_active = 1`,
      [teamId]
    );

    if (!team) {
      return res.status(404).json({ message: '团队不存在' });
    }

    res.json({ 
      team,
      myRole: req.teamRole
    });
  } catch (error) {
    console.error('[Collaboration] Get team detail error:', error);
    res.status(500).json({ message: '获取团队详情失败' });
  }
});

/**
 * 更新团队信息
 * PUT /api/teams/:id
 */
router.put('/teams/:id', authMiddleware, checkTeamPermission('admin'), async (req, res) => {
  const teamId = req.params.id;
  const { name, description, avatar_url } = req.body;

  try {
    const updates = [];
    const values = [];

    if (name !== undefined) {
      updates.push('name = ?');
      values.push(name.trim());
    }
    if (description !== undefined) {
      updates.push('description = ?');
      values.push(description);
    }
    if (avatar_url !== undefined) {
      updates.push('avatar_url = ?');
      values.push(avatar_url);
    }

    if (updates.length === 0) {
      return res.status(400).json({ message: '没有要更新的字段' });
    }

    values.push(teamId);
    await execute(
      `UPDATE teams SET ${updates.join(', ')} WHERE id = ?`,
      values
    );

    res.json({ message: '团队信息更新成功' });
  } catch (error) {
    console.error('[Collaboration] Update team error:', error);
    res.status(500).json({ message: '更新团队信息失败' });
  }
});

/**
 * 删除团队（仅所有者）
 * DELETE /api/teams/:id
 */
router.delete('/teams/:id', authMiddleware, checkTeamPermission('owner'), async (req, res) => {
  const teamId = req.params.id;

  try {
    // 软删除
    await execute(
      'UPDATE teams SET is_active = 0 WHERE id = ?',
      [teamId]
    );

    // 解除团队项目关联
    await execute(
      'UPDATE projects SET team_id = NULL WHERE team_id = ?',
      [teamId]
    );

    res.json({ message: '团队已删除' });
  } catch (error) {
    console.error('[Collaboration] Delete team error:', error);
    res.status(500).json({ message: '删除团队失败' });
  }
});

// =============================================
// 团队成员管理 API
// =============================================

/**
 * 获取团队成员列表
 * GET /api/teams/:id/members
 */
router.get('/teams/:id/members', authMiddleware, checkTeamPermission('viewer'), async (req, res) => {
  const teamId = req.params.id;

  try {
    const members = await queryAll(
      `SELECT 
        tm.id, tm.user_id, tm.role, tm.joined_at,
        u.email as username, u.avatar_url as avatar, u.email,
        inv.email as invited_by_username
       FROM team_members tm
       JOIN users u ON tm.user_id = u.id
       LEFT JOIN users inv ON tm.invited_by = inv.id
       WHERE tm.team_id = ?
       ORDER BY 
         FIELD(tm.role, 'owner', 'admin', 'editor', 'viewer'),
         tm.joined_at ASC`,
      [teamId]
    );

    res.json({ members });
  } catch (error) {
    console.error('[Collaboration] Get team members error:', error);
    res.status(500).json({ message: '获取团队成员失败' });
  }
});

/**
 * 添加团队成员（通过用户名）
 * POST /api/teams/:id/members
 */
router.post('/teams/:id/members', authMiddleware, checkTeamPermission('admin'), async (req, res) => {
  const teamId = req.params.id;
  const userId = req.user.id;
  const { username, role = 'viewer' } = req.body;

  if (!username) {
    return res.status(400).json({ message: '请提供用户名' });
  }

  // 验证角色有效性（不能添加 owner）
  if (!['viewer', 'editor', 'admin'].includes(role)) {
    return res.status(400).json({ message: '无效的角色' });
  }

  try {
    // 查找用户
    const targetUser = await queryOne(
      'SELECT id, username FROM users WHERE username = ?',
      [username]
    );

    if (!targetUser) {
      return res.status(404).json({ message: '用户不存在' });
    }

    // 检查是否已是成员
    const existing = await queryOne(
      'SELECT id FROM team_members WHERE team_id = ? AND user_id = ?',
      [teamId, targetUser.id]
    );

    if (existing) {
      return res.status(409).json({ message: '该用户已是团队成员' });
    }

    // 检查团队成员上限
    const team = await queryOne(
      'SELECT max_members FROM teams WHERE id = ?',
      [teamId]
    );
    const memberCount = await queryOne(
      'SELECT COUNT(*) as count FROM team_members WHERE team_id = ?',
      [teamId]
    );

    if (team.max_members > 0 && memberCount.count >= team.max_members) {
      return res.status(403).json({ message: '团队成员已达上限' });
    }

    // 添加成员
    await execute(
      `INSERT INTO team_members (team_id, user_id, role, invited_by)
       VALUES (?, ?, ?, ?)`,
      [teamId, targetUser.id, role, userId]
    );

    res.json({ 
      message: '成员添加成功',
      member: {
        user_id: targetUser.id,
        username: targetUser.username,
        role
      }
    });
  } catch (error) {
    console.error('[Collaboration] Add team member error:', error);
    res.status(500).json({ message: '添加成员失败' });
  }
});

/**
 * 修改成员角色
 * PUT /api/teams/:id/members/:userId
 */
router.put('/teams/:id/members/:userId', authMiddleware, checkTeamPermission('admin'), async (req, res) => {
  const teamId = req.params.id;
  const targetUserId = parseInt(req.params.userId);
  const { role } = req.body;

  if (!['viewer', 'editor', 'admin'].includes(role)) {
    return res.status(400).json({ message: '无效的角色' });
  }

  try {
    // 检查目标用户是否是所有者
    const team = await queryOne('SELECT owner_id FROM teams WHERE id = ?', [teamId]);
    if (team.owner_id === targetUserId) {
      return res.status(403).json({ message: '无法修改团队所有者的角色' });
    }

    // 检查当前用户权限是否高于目标用户
    const targetMember = await queryOne(
      'SELECT role FROM team_members WHERE team_id = ? AND user_id = ?',
      [teamId, targetUserId]
    );

    if (!targetMember) {
      return res.status(404).json({ message: '成员不存在' });
    }

    const currentLevel = PERMISSION_LEVELS[req.teamRole] || 0;
    const targetLevel = PERMISSION_LEVELS[targetMember.role] || 0;

    if (currentLevel <= targetLevel && req.teamRole !== 'owner') {
      return res.status(403).json({ message: '无法修改同级或更高级别成员的角色' });
    }

    await execute(
      'UPDATE team_members SET role = ? WHERE team_id = ? AND user_id = ?',
      [role, teamId, targetUserId]
    );

    res.json({ message: '角色更新成功' });
  } catch (error) {
    console.error('[Collaboration] Update member role error:', error);
    res.status(500).json({ message: '更新角色失败' });
  }
});

/**
 * 移除团队成员
 * DELETE /api/teams/:id/members/:userId
 */
router.delete('/teams/:id/members/:userId', authMiddleware, checkTeamPermission('admin'), async (req, res) => {
  const teamId = req.params.id;
  const targetUserId = parseInt(req.params.userId);

  try {
    // 检查目标用户是否是所有者
    const team = await queryOne('SELECT owner_id FROM teams WHERE id = ?', [teamId]);
    if (team.owner_id === targetUserId) {
      return res.status(403).json({ message: '无法移除团队所有者' });
    }

    await execute(
      'DELETE FROM team_members WHERE team_id = ? AND user_id = ?',
      [teamId, targetUserId]
    );

    res.json({ message: '成员已移除' });
  } catch (error) {
    console.error('[Collaboration] Remove team member error:', error);
    res.status(500).json({ message: '移除成员失败' });
  }
});

/**
 * 退出团队
 * POST /api/teams/:id/leave
 */
router.post('/teams/:id/leave', authMiddleware, async (req, res) => {
  const teamId = req.params.id;
  const userId = req.user.id;

  try {
    // 检查是否是所有者
    const team = await queryOne('SELECT owner_id FROM teams WHERE id = ?', [teamId]);
    if (team.owner_id === userId) {
      return res.status(403).json({ message: '团队所有者无法退出，请先转让团队或删除团队' });
    }

    await execute(
      'DELETE FROM team_members WHERE team_id = ? AND user_id = ?',
      [teamId, userId]
    );

    res.json({ message: '已退出团队' });
  } catch (error) {
    console.error('[Collaboration] Leave team error:', error);
    res.status(500).json({ message: '退出团队失败' });
  }
});

/**
 * 获取团队项目列表
 * GET /api/teams/:id/projects
 */
router.get('/teams/:id/projects', authMiddleware, checkTeamPermission('viewer'), async (req, res) => {
  const teamId = req.params.id;

  try {
    const projects = await queryAll(
      `SELECT 
        p.id, p.title, p.description, p.cover_image, p.project_type,
        p.created_at, p.updated_at,
        u.username as owner_username
       FROM projects p
       JOIN users u ON p.user_id = u.id
       WHERE p.team_id = ?
       ORDER BY p.updated_at DESC`,
      [teamId]
    );

    res.json({ projects });
  } catch (error) {
    console.error('[Collaboration] Get team projects error:', error);
    res.status(500).json({ message: '获取团队项目失败' });
  }
});

// =============================================
// 项目协作者管理 API
// =============================================

/**
 * 获取项目协作者列表
 * GET /api/projects/:id/collaborators
 */
router.get('/projects/:id/collaborators', authMiddleware, checkProjectPermission('viewer'), async (req, res) => {
  const projectId = req.params.id;

  try {
    // 获取项目所有者信息
    const project = await queryOne(
      `SELECT p.user_id, p.team_id, u.username, u.avatar, u.email
       FROM projects p
       JOIN users u ON p.user_id = u.id
       WHERE p.id = ?`,
      [projectId]
    );

    // 获取协作者列表
    const collaborators = await queryAll(
      `SELECT 
        pc.id, pc.user_id, pc.role, pc.added_at,
        u.username, u.avatar, u.email,
        adder.username as added_by_username
       FROM project_collaborators pc
       JOIN users u ON pc.user_id = u.id
       LEFT JOIN users adder ON pc.added_by = adder.id
       WHERE pc.project_id = ?
       ORDER BY 
         FIELD(pc.role, 'admin', 'editor', 'viewer'),
         pc.added_at ASC`,
      [projectId]
    );

    res.json({ 
      owner: {
        user_id: project.user_id,
        username: project.username,
        avatar: project.avatar,
        email: project.email,
        role: 'owner'
      },
      collaborators,
      team_id: project.team_id,
      myRole: req.projectRole
    });
  } catch (error) {
    console.error('[Collaboration] Get project collaborators error:', error);
    res.status(500).json({ message: '获取项目协作者失败' });
  }
});

/**
 * 添加项目协作者
 * POST /api/projects/:id/collaborators
 */
router.post('/projects/:id/collaborators', authMiddleware, checkProjectPermission('admin'), async (req, res) => {
  const projectId = req.params.id;
  const userId = req.user.id;
  const { username, role = 'viewer' } = req.body;

  if (!username) {
    return res.status(400).json({ message: '请提供用户名' });
  }

  if (!['viewer', 'editor', 'admin'].includes(role)) {
    return res.status(400).json({ message: '无效的角色' });
  }

  try {
    // 查找用户
    const targetUser = await queryOne(
      'SELECT id, username FROM users WHERE username = ?',
      [username]
    );

    if (!targetUser) {
      return res.status(404).json({ message: '用户不存在' });
    }

    // 检查是否是项目所有者
    const project = await queryOne('SELECT user_id FROM projects WHERE id = ?', [projectId]);
    if (project.user_id === targetUser.id) {
      return res.status(409).json({ message: '无法将项目所有者添加为协作者' });
    }

    // 检查是否已是协作者
    const existing = await queryOne(
      'SELECT id FROM project_collaborators WHERE project_id = ? AND user_id = ?',
      [projectId, targetUser.id]
    );

    if (existing) {
      return res.status(409).json({ message: '该用户已是项目协作者' });
    }

    // 添加协作者
    await execute(
      `INSERT INTO project_collaborators (project_id, user_id, role, added_by)
       VALUES (?, ?, ?, ?)`,
      [projectId, targetUser.id, role, userId]
    );

    res.json({ 
      message: '协作者添加成功',
      collaborator: {
        user_id: targetUser.id,
        username: targetUser.username,
        role
      }
    });
  } catch (error) {
    console.error('[Collaboration] Add project collaborator error:', error);
    res.status(500).json({ message: '添加协作者失败' });
  }
});

/**
 * 修改协作者角色
 * PUT /api/projects/:id/collaborators/:userId
 */
router.put('/projects/:id/collaborators/:userId', authMiddleware, checkProjectPermission('admin'), async (req, res) => {
  const projectId = req.params.id;
  const targetUserId = parseInt(req.params.userId);
  const { role } = req.body;

  if (!['viewer', 'editor', 'admin'].includes(role)) {
    return res.status(400).json({ message: '无效的角色' });
  }

  try {
    const result = await execute(
      'UPDATE project_collaborators SET role = ? WHERE project_id = ? AND user_id = ?',
      [role, projectId, targetUserId]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ message: '协作者不存在' });
    }

    res.json({ message: '角色更新成功' });
  } catch (error) {
    console.error('[Collaboration] Update collaborator role error:', error);
    res.status(500).json({ message: '更新角色失败' });
  }
});

/**
 * 移除协作者
 * DELETE /api/projects/:id/collaborators/:userId
 */
router.delete('/projects/:id/collaborators/:userId', authMiddleware, checkProjectPermission('admin'), async (req, res) => {
  const projectId = req.params.id;
  const targetUserId = parseInt(req.params.userId);

  try {
    await execute(
      'DELETE FROM project_collaborators WHERE project_id = ? AND user_id = ?',
      [projectId, targetUserId]
    );

    res.json({ message: '协作者已移除' });
  } catch (error) {
    console.error('[Collaboration] Remove collaborator error:', error);
    res.status(500).json({ message: '移除协作者失败' });
  }
});

// =============================================
// 邀请系统 API
// =============================================

/**
 * 生成邀请码/链接
 * POST /api/invites/generate
 */
router.post('/invites/generate', authMiddleware, async (req, res) => {
  const userId = req.user.id;
  const { type, target_id, role = 'viewer', max_uses = 1, expires_in_hours = 168 } = req.body;

  if (!['team', 'project'].includes(type)) {
    return res.status(400).json({ message: '无效的邀请类型' });
  }

  if (!target_id) {
    return res.status(400).json({ message: '缺少目标ID' });
  }

  if (!['viewer', 'editor', 'admin'].includes(role)) {
    return res.status(400).json({ message: '无效的角色' });
  }

  try {
    // 检查权限
    let hasPermission = false;
    let targetName = '';

    if (type === 'team') {
      const teamRole = await getTeamRole(userId, target_id);
      hasPermission = PERMISSION_LEVELS[teamRole] >= PERMISSION_LEVELS['admin'];
      const team = await queryOne('SELECT name FROM teams WHERE id = ?', [target_id]);
      targetName = team?.name || '';
    } else {
      const projectRole = await getEffectiveProjectRole(userId, target_id);
      hasPermission = PERMISSION_LEVELS[projectRole] >= PERMISSION_LEVELS['admin'];
      const project = await queryOne('SELECT title FROM projects WHERE id = ?', [target_id]);
      targetName = project?.title || '';
    }

    if (!hasPermission) {
      return res.status(403).json({ message: '您没有生成邀请的权限' });
    }

    // 生成邀请码
    const inviteCode = generateInviteCode(16);
    const expiresAt = new Date(Date.now() + expires_in_hours * 60 * 60 * 1000);

    await execute(
      `INSERT INTO collaboration_invites 
        (invite_code, invite_type, target_id, role, created_by, max_uses, expires_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [inviteCode, type, target_id, role, userId, max_uses, expiresAt]
    );

    res.json({
      invite: {
        code: inviteCode,
        type,
        target_id,
        target_name: targetName,
        role,
        max_uses,
        expires_at: expiresAt.toISOString()
      }
    });
  } catch (error) {
    console.error('[Collaboration] Generate invite error:', error);
    res.status(500).json({ message: '生成邀请失败' });
  }
});

/**
 * 获取邀请详情（公开接口，用于预览）
 * GET /api/invites/:code
 */
router.get('/invites/:code', async (req, res) => {
  const { code } = req.params;

  try {
    const invite = await queryOne(
      `SELECT 
        ci.*, 
        u.username as created_by_username
       FROM collaboration_invites ci
       JOIN users u ON ci.created_by = u.id
       WHERE ci.invite_code = ? AND ci.is_active = 1`,
      [code]
    );

    if (!invite) {
      return res.status(404).json({ message: '邀请不存在或已失效' });
    }

    // 检查是否过期
    if (new Date(invite.expires_at) < new Date()) {
      return res.status(410).json({ message: '邀请已过期' });
    }

    // 检查使用次数
    if (invite.max_uses > 0 && invite.used_count >= invite.max_uses) {
      return res.status(410).json({ message: '邀请已达到使用上限' });
    }

    // 获取目标名称
    let targetName = '';
    if (invite.invite_type === 'team') {
      const team = await queryOne('SELECT name FROM teams WHERE id = ?', [invite.target_id]);
      targetName = team?.name || '';
    } else {
      const project = await queryOne('SELECT title FROM projects WHERE id = ?', [invite.target_id]);
      targetName = project?.title || '';
    }

    res.json({
      invite: {
        code: invite.invite_code,
        type: invite.invite_type,
        target_name: targetName,
        role: invite.role,
        created_by: invite.created_by_username,
        expires_at: invite.expires_at
      }
    });
  } catch (error) {
    console.error('[Collaboration] Get invite error:', error);
    res.status(500).json({ message: '获取邀请详情失败' });
  }
});

/**
 * 接受邀请（团队类型改为创建待审核申请，项目类型保持直接加入）
 * POST /api/invites/:code/accept
 */
router.post('/invites/:code/accept', authMiddleware, async (req, res) => {
  const { code } = req.params;
  const userId = req.user.id;

  try {
    const invite = await queryOne(
      'SELECT * FROM collaboration_invites WHERE invite_code = ? AND is_active = 1',
      [code]
    );

    if (!invite) {
      return res.status(404).json({ message: '邀请不存在或已失效' });
    }

    // 检查是否过期
    if (new Date(invite.expires_at) < new Date()) {
      return res.status(410).json({ message: '邀请已过期' });
    }

    // 检查使用次数
    if (invite.max_uses > 0 && invite.used_count >= invite.max_uses) {
      return res.status(410).json({ message: '邀请已达到使用上限' });
    }

    let targetName = '';

    if (invite.invite_type === 'team') {
      // 检查是否已是成员
      const existing = await queryOne(
        'SELECT id FROM team_members WHERE team_id = ? AND user_id = ?',
        [invite.target_id, userId]
      );

      if (existing) {
        return res.status(409).json({ message: '您已是该团队成员' });
      }

      // 检查是否已有待审核的申请
      const pendingRequest = await queryOne(
        'SELECT id FROM team_join_requests WHERE team_id = ? AND user_id = ? AND status = ?',
        [invite.target_id, userId, 'pending']
      );

      if (pendingRequest) {
        return res.status(409).json({ message: '您已提交过加入申请，请等待管理员审核' });
      }

      // 创建待审核申请（而非直接加入）
      await execute(
        `INSERT INTO team_join_requests (team_id, user_id, invite_code, status)
         VALUES (?, ?, ?, 'pending')`,
        [invite.target_id, userId, code]
      );

      const team = await queryOne('SELECT name FROM teams WHERE id = ?', [invite.target_id]);
      targetName = team?.name || '';

      // 通过站内信通知团队管理员/所有者
      const applicant = await queryOne('SELECT email FROM users WHERE id = ?', [userId]);
      const admins = await queryAll(
        `SELECT user_id FROM team_members WHERE team_id = ? AND role IN ('admin', 'owner')`,
        [invite.target_id]
      );
      for (const admin of admins) {
        try {
          await execute(
            `INSERT INTO internal_mail (sender_type, receiver_id, title, content, mail_type)
             VALUES ('system', ?, ?, ?, 'system')`,
            [
              admin.user_id,
              `新的团队加入申请`,
              `用户 ${applicant?.email || userId}（ID: ${userId}）申请加入团队「${targetName}」，请前往团队管理页面审核。`
            ]
          );
        } catch (mailErr) {
          console.warn('[Collaboration] 发送站内信通知失败:', mailErr.message);
        }
      }

    } else {
      // 项目类型保持直接加入逻辑
      const project = await queryOne('SELECT user_id, title FROM projects WHERE id = ?', [invite.target_id]);
      if (project.user_id === userId) {
        return res.status(409).json({ message: '您是该项目的所有者' });
      }

      const existing = await queryOne(
        'SELECT id FROM project_collaborators WHERE project_id = ? AND user_id = ?',
        [invite.target_id, userId]
      );

      if (existing) {
        return res.status(409).json({ message: '您已是该项目的协作者' });
      }

      await execute(
        `INSERT INTO project_collaborators (project_id, user_id, role, added_by)
         VALUES (?, ?, ?, ?)`,
        [invite.target_id, userId, invite.role, invite.created_by]
      );

      targetName = project?.title || '';
    }

    // 更新邀请使用计数
    await execute(
      'UPDATE collaboration_invites SET used_count = used_count + 1 WHERE id = ?',
      [invite.id]
    );

    // 团队邀请返回 pending 状态提示
    if (invite.invite_type === 'team') {
      res.json({ 
        message: '申请已提交，请等待管理员审核',
        type: invite.invite_type,
        target_id: invite.target_id,
        target_name: targetName,
        role: invite.role,
        status: 'pending'
      });
    } else {
      res.json({ 
        message: '加入成功',
        type: invite.invite_type,
        target_id: invite.target_id,
        target_name: targetName,
        role: invite.role
      });
    }
  } catch (error) {
    console.error('[Collaboration] Accept invite error:', error);
    res.status(500).json({ message: '接受邀请失败' });
  }
});

/**
 * 撤销邀请
 * DELETE /api/invites/:code
 */
router.delete('/invites/:code', authMiddleware, async (req, res) => {
  const { code } = req.params;
  const userId = req.user.id;

  try {
    const invite = await queryOne(
      'SELECT * FROM collaboration_invites WHERE invite_code = ?',
      [code]
    );

    if (!invite) {
      return res.status(404).json({ message: '邀请不存在' });
    }

    // 检查权限（创建者或管理员可撤销）
    let hasPermission = invite.created_by === userId;

    if (!hasPermission) {
      if (invite.invite_type === 'team') {
        const teamRole = await getTeamRole(userId, invite.target_id);
        hasPermission = PERMISSION_LEVELS[teamRole] >= PERMISSION_LEVELS['admin'];
      } else {
        const projectRole = await getEffectiveProjectRole(userId, invite.target_id);
        hasPermission = PERMISSION_LEVELS[projectRole] >= PERMISSION_LEVELS['admin'];
      }
    }

    if (!hasPermission) {
      return res.status(403).json({ message: '您没有撤销该邀请的权限' });
    }

    await execute(
      'UPDATE collaboration_invites SET is_active = 0 WHERE id = ?',
      [invite.id]
    );

    res.json({ message: '邀请已撤销' });
  } catch (error) {
    console.error('[Collaboration] Revoke invite error:', error);
    res.status(500).json({ message: '撤销邀请失败' });
  }
});

// =============================================
// 团队加入申请审核 API
// =============================================

/**
 * 获取团队的加入申请列表
 * GET /api/teams/:id/join-requests
 */
router.get('/teams/:id/join-requests', authMiddleware, checkTeamPermission('admin'), async (req, res) => {
  const teamId = req.params.id;
  const { status } = req.query; // 可选过滤: pending, approved, rejected

  try {
    let sql = `
      SELECT 
        jr.id, jr.team_id, jr.user_id, jr.invite_code, jr.status,
        jr.reviewed_by, jr.reviewed_at, jr.created_at,
        u.email as user_email, u.avatar_url as user_avatar,
        t.name as team_name,
        reviewer.email as reviewer_email
      FROM team_join_requests jr
      JOIN users u ON jr.user_id = u.id
      JOIN teams t ON jr.team_id = t.id
      LEFT JOIN users reviewer ON jr.reviewed_by = reviewer.id
      WHERE jr.team_id = ?
    `;
    const params = [teamId];

    if (status && ['pending', 'approved', 'rejected'].includes(status)) {
      sql += ' AND jr.status = ?';
      params.push(status);
    }

    sql += ' ORDER BY jr.created_at DESC';

    const requests = await queryAll(sql, params);
    res.json({ requests });
  } catch (error) {
    console.error('[Collaboration] Get join requests error:', error);
    res.status(500).json({ message: '获取加入申请列表失败' });
  }
});

/**
 * 批准加入申请
 * POST /api/teams/:id/join-requests/:requestId/approve
 */
router.post('/teams/:id/join-requests/:requestId/approve', authMiddleware, checkTeamPermission('admin'), async (req, res) => {
  const teamId = req.params.id;
  const requestId = req.params.requestId;
  const reviewerId = req.user.id;

  try {
    // 获取申请详情
    const request = await queryOne(
      'SELECT * FROM team_join_requests WHERE id = ? AND team_id = ? AND status = ?',
      [requestId, teamId, 'pending']
    );

    if (!request) {
      return res.status(404).json({ message: '申请不存在或已处理' });
    }

    // 检查用户是否已是成员（可能通过其他方式加入了）
    const existingMember = await queryOne(
      'SELECT id FROM team_members WHERE team_id = ? AND user_id = ?',
      [teamId, request.user_id]
    );

    if (existingMember) {
      // 直接标记为已批准
      await execute(
        'UPDATE team_join_requests SET status = ?, reviewed_by = ?, reviewed_at = NOW() WHERE id = ?',
        ['approved', reviewerId, requestId]
      );
      return res.json({ message: '该用户已是团队成员，申请已自动批准' });
    }

    // 检查团队成员上限
    const team = await queryOne('SELECT name, max_members FROM teams WHERE id = ?', [teamId]);
    const memberCount = await queryOne(
      'SELECT COUNT(*) as count FROM team_members WHERE team_id = ?',
      [teamId]
    );

    if (team.max_members > 0 && memberCount.count >= team.max_members) {
      return res.status(403).json({ message: '团队成员已达上限，无法批准' });
    }

    // 获取邀请信息中的角色（如果有关联邀请码）
    let role = 'viewer';
    if (request.invite_code) {
      const invite = await queryOne(
        'SELECT role FROM collaboration_invites WHERE invite_code = ?',
        [request.invite_code]
      );
      if (invite) role = invite.role;
    }

    // 添加为团队成员
    await execute(
      `INSERT INTO team_members (team_id, user_id, role, invited_by)
       VALUES (?, ?, ?, ?)`,
      [teamId, request.user_id, role, reviewerId]
    );

    // 更新申请状态
    await execute(
      'UPDATE team_join_requests SET status = ?, reviewed_by = ?, reviewed_at = NOW() WHERE id = ?',
      ['approved', reviewerId, requestId]
    );

    // 站内信通知申请人
    try {
      await execute(
        `INSERT INTO internal_mail (sender_type, receiver_id, title, content, mail_type)
         VALUES ('system', ?, ?, ?, 'system')`,
        [
          request.user_id,
          '团队加入申请已通过',
          `您申请加入团队「${team.name}」已被管理员批准，您现在是该团队的${role === 'viewer' ? '查看者' : role === 'editor' ? '编辑者' : '管理员'}。`
        ]
      );
    } catch (mailErr) {
      console.warn('[Collaboration] 发送审核通知失败:', mailErr.message);
    }

    res.json({ message: '已批准该用户加入团队' });
  } catch (error) {
    console.error('[Collaboration] Approve join request error:', error);
    res.status(500).json({ message: '批准申请失败' });
  }
});

/**
 * 拒绝加入申请
 * POST /api/teams/:id/join-requests/:requestId/reject
 */
router.post('/teams/:id/join-requests/:requestId/reject', authMiddleware, checkTeamPermission('admin'), async (req, res) => {
  const teamId = req.params.id;
  const requestId = req.params.requestId;
  const reviewerId = req.user.id;

  try {
    const request = await queryOne(
      'SELECT * FROM team_join_requests WHERE id = ? AND team_id = ? AND status = ?',
      [requestId, teamId, 'pending']
    );

    if (!request) {
      return res.status(404).json({ message: '申请不存在或已处理' });
    }

    // 更新申请状态为拒绝
    await execute(
      'UPDATE team_join_requests SET status = ?, reviewed_by = ?, reviewed_at = NOW() WHERE id = ?',
      ['rejected', reviewerId, requestId]
    );

    // 站内信通知申请人
    const team = await queryOne('SELECT name FROM teams WHERE id = ?', [teamId]);
    try {
      await execute(
        `INSERT INTO internal_mail (sender_type, receiver_id, title, content, mail_type)
         VALUES ('system', ?, ?, ?, 'system')`,
        [
          request.user_id,
          '团队加入申请被拒绝',
          `很抱歉，您申请加入团队「${team?.name || ''}」已被管理员拒绝。`
        ]
      );
    } catch (mailErr) {
      console.warn('[Collaboration] 发送拒绝通知失败:', mailErr.message);
    }

    res.json({ message: '已拒绝该申请' });
  } catch (error) {
    console.error('[Collaboration] Reject join request error:', error);
    res.status(500).json({ message: '拒绝申请失败' });
  }
});

/**
 * 获取当前用户的加入申请历史
 * GET /api/my-join-requests
 */
router.get('/my-join-requests', authMiddleware, async (req, res) => {
  const userId = req.user.id;

  try {
    const requests = await queryAll(
      `SELECT 
        jr.id, jr.team_id, jr.user_id, jr.invite_code, jr.status,
        jr.reviewed_at, jr.created_at,
        t.name as team_name,
        creator.email as inviter_email
      FROM team_join_requests jr
      JOIN teams t ON jr.team_id = t.id
      LEFT JOIN collaboration_invites ci ON jr.invite_code = ci.invite_code
      LEFT JOIN users creator ON ci.created_by = creator.id
      WHERE jr.user_id = ?
      ORDER BY jr.created_at DESC`,
      [userId]
    );

    res.json({ requests });
  } catch (error) {
    console.error('[Collaboration] Get my join requests error:', error);
    res.status(500).json({ message: '获取申请历史失败' });
  }
});

// =============================================
// 用户搜索 API
// =============================================

/**
 * 搜索用户（用于邀请）
 * GET /api/users/search?q=xxx
 */
router.get('/users/search', authMiddleware, async (req, res) => {
  const { q } = req.query;

  if (!q || q.length < 2) {
    return res.status(400).json({ message: '搜索关键词至少2个字符' });
  }

  try {
    const users = await queryAll(
      `SELECT id, username, avatar, email
       FROM users
       WHERE username LIKE ? OR email LIKE ?
       LIMIT 10`,
      [`%${q}%`, `%${q}%`]
    );

    // 隐藏敏感信息
    const safeUsers = users.map(u => ({
      id: u.id,
      username: u.username,
      avatar: u.avatar,
      email: u.email ? u.email.replace(/(.{2}).*(@.*)/, '$1***$2') : null
    }));

    res.json({ users: safeUsers });
  } catch (error) {
    console.error('[Collaboration] Search users error:', error);
    res.status(500).json({ message: '搜索用户失败' });
  }
});

module.exports = router;
