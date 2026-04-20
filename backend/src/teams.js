const express = require('express');
const multer = require('multer');
const { queryAll, queryOne, execute } = require('./dbHelper');
const { authMiddleware } = require('./middleware');
const { uploadBuffer, deleteObject, isConfigured } = require('./utils/fileStorage');

const router = express.Router();

// ========== 团队头像上传配置 ==========
const ALLOWED_AVATAR_TYPES = ['image/png', 'image/jpeg', 'image/webp'];
const AVATAR_EXT_MAP = { 'image/png': '.png', 'image/jpeg': '.jpg', 'image/webp': '.webp' };
const MAX_AVATAR_SIZE = 5 * 1024 * 1024; // 5MB

const teamAvatarUpload = multer({
  storage: multer.memoryStorage(),
  fileFilter: (req, file, cb) => {
    if (ALLOWED_AVATAR_TYPES.includes(file.mimetype)) cb(null, true);
    else cb(new Error('不支持的文件类型，仅支持 PNG/JPG/WebP 格式'), false);
  },
  limits: { fileSize: MAX_AVATAR_SIZE }
});

/**
 * 团队管理 API 路由
 */

// GET /api/teams - 获取用户的团队列表
router.get('/', authMiddleware, async (req, res) => {
  const userId = req.user.id;

  try {
    // 使用与 collaboration.js 一致的查询逻辑
    // 通过 JOIN team_members 来筛选当前用户所属的团队
    const teams = await queryAll(
      `SELECT 
        t.id, t.name, t.description, t.avatar_url, t.owner_id, 
        t.invite_code, t.max_members, t.created_at, t.updated_at,
        tm.role as my_role,
        (SELECT COUNT(*) FROM team_members WHERE team_id = t.id) as members_count,
        (SELECT COUNT(*) FROM projects WHERE team_id = t.id) as projects_count,
        IFNULL(NULLIF(u.nickname, ''), u.email) as owner_username
       FROM teams t
       JOIN team_members tm ON t.id = tm.team_id AND tm.user_id = ?
       JOIN users u ON t.owner_id = u.id
       WHERE t.is_active = 1
       ORDER BY t.created_at DESC`,
      [userId]
    );

    res.json({ teams });
  } catch (error) {
    console.error('[Teams API] 获取团队列表失败:', error);
    res.status(500).json({ message: '获取团队列表失败' });
  }
});

// POST /api/teams - 创建团队
router.post('/', authMiddleware, async (req, res) => {
  const userId = req.user.id;
  const { name, description, max_members = 10 } = req.body;

  if (!name) {
    return res.status(400).json({ message: '团队名称不能为空' });
  }

  try {
    const invite_code = Math.random().toString(36).substring(2, 10).toUpperCase();
    const invite_code_expires_at = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    const result = await execute(
      `INSERT INTO teams (name, description, max_members, owner_id, invite_code, invite_code_expires_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [name, description || null, max_members, userId, invite_code, invite_code_expires_at]
    );

    await execute(
      `INSERT INTO team_members (team_id, user_id, role, invited_by)
       VALUES (?, ?, 'admin', ?)`,
      [result.insertId, userId, userId]
    );

    const team = await queryOne(
      `SELECT * FROM teams WHERE id = ?`,
      [result.insertId]
    );

    res.status(201).json({ team });
  } catch (error) {
    console.error('[Teams API] 创建团队失败:', error);
    res.status(500).json({ message: '创建团队失败' });
  }
});

// GET /api/teams/:teamId - 获取团队详情
router.get('/:teamId', authMiddleware, async (req, res) => {
  const userId = req.user.id;
  const { teamId } = req.params;

  try {
    const team = await queryOne(
      `SELECT t.*, 
       (SELECT COUNT(*) FROM team_members WHERE team_id = t.id) as members_count,
       (SELECT COUNT(*) FROM projects WHERE team_id = t.id) as projects_count
       FROM teams t
       WHERE t.id = ? AND (t.owner_id = ? OR EXISTS (
         SELECT 1 FROM team_members WHERE team_id = t.id AND user_id = ?
       ))`,
      [teamId, userId, userId]
    );

    if (!team) {
      return res.status(404).json({ message: '团队不存在或无权访问' });
    }

    // 计算用户角色
    let myRole = null;
    if (team.owner_id == userId) {
      myRole = 'owner';
    } else {
      const member = await queryOne(
        'SELECT role FROM team_members WHERE team_id = ? AND user_id = ?',
        [teamId, userId]
      );
      myRole = member?.role || null;
    }

    res.json({ team, myRole });
  } catch (error) {
    console.error('[Teams API] 获取团队详情失败:', error);
    res.status(500).json({ message: '获取团队详情失败' });
  }
});

// PUT /api/teams/:teamId - 更新团队信息
router.put('/:teamId', authMiddleware, async (req, res) => {
  const userId = req.user.id;
  const { teamId } = req.params;
  const { name, description, max_members } = req.body;

  try {
    const team = await queryOne(
      `SELECT * FROM teams WHERE id = ? AND owner_id = ?`,
      [teamId, userId]
    );

    if (!team) {
      return res.status(403).json({ message: '无权修改团队信息' });
    }

    await execute(
      `UPDATE teams SET name = ?, description = ?, max_members = ?, updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [name || team.name, description, max_members || team.max_members, teamId]
    );

    const updatedTeam = await queryOne(
      `SELECT * FROM teams WHERE id = ?`,
      [teamId]
    );

    res.json({ team: updatedTeam });
  } catch (error) {
    console.error('[Teams API] 更新团队失败:', error);
    res.status(500).json({ message: '更新团队失败' });
  }
});

// DELETE /api/teams/:teamId - 删除团队
router.delete('/:teamId', authMiddleware, async (req, res) => {
  const userId = req.user.id;
  const { teamId } = req.params;

  try {
    const team = await queryOne(
      `SELECT * FROM teams WHERE id = ? AND owner_id = ?`,
      [teamId, userId]
    );

    if (!team) {
      return res.status(403).json({ message: '无权删除团队' });
    }

    await execute(`DELETE FROM teams WHERE id = ?`, [teamId]);

    res.json({ message: '团队已删除' });
  } catch (error) {
    console.error('[Teams API] 删除团队失败:', error);
    res.status(500).json({ message: '删除团队失败' });
  }
});

// GET /api/teams/:teamId/members - 获取团队成员
router.get('/:teamId/members', authMiddleware, async (req, res) => {
  const userId = req.user.id;
  const { teamId } = req.params;

  try {
    const isMember = await queryOne(
      `SELECT 1 FROM team_members WHERE team_id = ? AND user_id = ?`,
      [teamId, userId]
    );

    const team = await queryOne(
      `SELECT * FROM teams WHERE id = ? AND owner_id = ?`,
      [teamId, userId]
    );

    if (!isMember && !team) {
      return res.status(403).json({ message: '无权访问团队成员列表' });
    }

    const members = await queryAll(
      `SELECT 
        tm.id, tm.user_id, tm.role, tm.joined_at, tm.invited_by,
        IFNULL(NULLIF(u.nickname, ''), u.email) as username, u.avatar_url as avatar, u.email,
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
    console.error('[Teams API] 获取团队成员失败:', error);
    res.status(500).json({ message: '获取团队成员失败' });
  }
});

// POST /api/teams/:teamId/members - 邀请成员
router.post('/:teamId/members', authMiddleware, async (req, res) => {
  const userId = req.user.id;
  const { teamId } = req.params;
  const { email, role = 'viewer' } = req.body;

  if (!email) {
    return res.status(400).json({ message: '邮箱地址不能为空' });
  }

  try {
    const memberRole = await queryOne(
      `SELECT role FROM team_members WHERE team_id = ? AND user_id = ?`,
      [teamId, userId]
    );

    const team = await queryOne(
      `SELECT * FROM teams WHERE id = ? AND owner_id = ?`,
      [teamId, userId]
    );

    if (!memberRole && !team) {
      return res.status(403).json({ message: '无权邀请成员' });
    }

    const user = await queryOne(
      `SELECT id, email FROM users WHERE email = ?`,
      [email]
    );

    if (!user) {
      return res.status(404).json({ message: '用户不存在' });
    }

    const existingMember = await queryOne(
      `SELECT * FROM team_members WHERE team_id = ? AND user_id = ?`,
      [teamId, user.id]
    );

    if (existingMember) {
      return res.status(400).json({ message: '该用户已是团队成员' });
    }

    await execute(
      `INSERT INTO team_members (team_id, user_id, role, invited_by)
       VALUES (?, ?, ?, ?)`,
      [teamId, user.id, role, userId]
    );

    const newMember = await queryOne(
      `SELECT tm.*, u.email
       FROM team_members tm
       LEFT JOIN users u ON tm.user_id = u.id
       WHERE tm.team_id = ? AND tm.user_id = ?`,
      [teamId, user.id]
    );

    res.status(201).json({ member: newMember });
  } catch (error) {
    console.error('[Teams API] 邀请成员失败:', error);
    res.status(500).json({ message: '邀请成员失败' });
  }
});

// DELETE /api/teams/:teamId/members/:userId - 移除成员
router.delete('/:teamId/members/:userId', authMiddleware, async (req, res) => {
  const currentUserId = req.user.id;
  const { teamId, userId } = req.params;

  try {
    const currentMemberRole = await queryOne(
      `SELECT role FROM team_members WHERE team_id = ? AND user_id = ?`,
      [teamId, currentUserId]
    );

    const team = await queryOne(
      `SELECT * FROM teams WHERE id = ? AND owner_id = ?`,
      [teamId, currentUserId]
    );

    if (!currentMemberRole && !team) {
      return res.status(403).json({ message: '无权移除成员' });
    }

    const targetMember = await queryOne(
      `SELECT * FROM team_members WHERE team_id = ? AND user_id = ?`,
      [teamId, userId]
    );

    if (targetMember && targetMember.role === 'owner') {
      return res.status(400).json({ message: '不能移除团队所有者' });
    }

    await execute(
      `DELETE FROM team_members WHERE team_id = ? AND user_id = ?`,
      [teamId, userId]
    );

    res.json({ message: '成员已移除' });
  } catch (error) {
    console.error('[Teams API] 移除成员失败:', error);
    res.status(500).json({ message: '移除成员失败' });
  }
});

// POST /api/teams/:teamId/leave - 离开团队
router.post('/:teamId/leave', authMiddleware, async (req, res) => {
  const userId = req.user.id;
  const { teamId } = req.params;

  try {
    const member = await queryOne(
      `SELECT * FROM team_members WHERE team_id = ? AND user_id = ?`,
      [teamId, userId]
    );

    if (!member) {
      return res.status(400).json({ message: '不是团队成员' });
    }

    if (member.role === 'owner') {
      return res.status(400).json({ message: '团队所有者不能离开团队' });
    }

    await execute(
      `DELETE FROM team_members WHERE team_id = ? AND user_id = ?`,
      [teamId, userId]
    );

    res.json({ message: '已离开团队' });
  } catch (error) {
    console.error('[Teams API] 离开团队失败:', error);
    res.status(500).json({ message: '离开团队失败' });
  }
});

// GET /api/teams/:teamId/projects - 获取团队项目
router.get('/:teamId/projects', authMiddleware, async (req, res) => {
  const userId = req.user.id;
  const { teamId } = req.params;

  try {
    const isMember = await queryOne(
      `SELECT 1 FROM team_members WHERE team_id = ? AND user_id = ?`,
      [teamId, userId]
    );

    const team = await queryOne(
      `SELECT * FROM teams WHERE id = ? AND owner_id = ?`,
      [teamId, userId]
    );

    if (!isMember && !team) {
      return res.status(403).json({ message: '无权访问团队项目' });
    }

    const projects = await queryAll(
      `SELECT p.*, u.email as creator_name
       FROM projects p
       LEFT JOIN users u ON p.user_id = u.id
       WHERE p.team_id = ?
       ORDER BY p.updated_at DESC`,
      [teamId]
    );

    res.json({ projects });
  } catch (error) {
    console.error('[Teams API] 获取团队项目失败:', error);
    res.status(500).json({ message: '获取团队项目失败' });
  }
});

// POST /api/teams/join - 通过邀请码加入团队（兼容团队邀请码 + 协作邀请码两套系统）
router.post('/join', authMiddleware, async (req, res) => {
  const userId = req.user.id;
  const { invite_code } = req.body;

  if (!invite_code) {
    return res.status(400).json({ message: '邀请码不能为空' });
  }

  try {
    let teamId = null;
    let teamName = '';
    let role = 'viewer';
    let viaCollabInvite = false;

    // === 策略 1：先查团队级邀请码（teams.invite_code） ===
    const team = await queryOne(
      `SELECT * FROM teams WHERE invite_code = ? AND is_active = 1`,
      [invite_code]
    );

    if (team) {
      // 检查团队邀请码是否过期
      if (team.invite_code_expires_at && new Date(team.invite_code_expires_at) < new Date()) {
        return res.status(400).json({ message: '邀请码已过期' });
      }
      teamId = team.id;
      teamName = team.name;
    } else {
      // === 策略 2：查协作邀请码（collaboration_invites 表） ===
      const collab = await queryOne(
        `SELECT * FROM collaboration_invites WHERE invite_code = ? AND is_active = 1 AND invite_type = 'team'`,
        [invite_code]
      );

      if (!collab) {
        return res.status(404).json({ message: '邀请码无效或已过期' });
      }

      // 检查过期
      if (new Date(collab.expires_at) < new Date()) {
        return res.status(400).json({ message: '邀请码已过期' });
      }

      // 检查使用次数
      if (collab.max_uses > 0 && collab.used_count >= collab.max_uses) {
        return res.status(400).json({ message: '邀请码已达到使用上限' });
      }

      // 确认目标团队存在
      const targetTeam = await queryOne(
        'SELECT id, name FROM teams WHERE id = ? AND is_active = 1',
        [collab.target_id]
      );
      if (!targetTeam) {
        return res.status(404).json({ message: '目标团队不存在' });
      }

      teamId = targetTeam.id;
      teamName = targetTeam.name;
      role = collab.role || 'viewer';
      viaCollabInvite = true;

      // 增加使用计数
      await execute(
        'UPDATE collaboration_invites SET used_count = used_count + 1 WHERE id = ?',
        [collab.id]
      );
    }

    // 检查是否已是成员
    const existingMember = await queryOne(
      `SELECT * FROM team_members WHERE team_id = ? AND user_id = ?`,
      [teamId, userId]
    );

    if (existingMember) {
      return res.json({
        message: '您已是该团队成员',
        team: { id: teamId, name: teamName }
      });
    }

    // 添加成员（直接加入，无需审核）
    await execute(
      `INSERT INTO team_members (team_id, user_id, role, invited_by) VALUES (?, ?, ?, NULL)`,
      [teamId, userId, role]
    );

    res.json({ 
      message: '加入团队成功',
      team: {
        id: teamId,
        name: teamName
      }
    });
  } catch (error) {
    console.error('[Teams API] 加入团队失败:', error);
    res.status(500).json({ message: '加入团队失败' });
  }
});

// POST /api/teams/:teamId/avatar - 上传团队头像（仅所有者）
router.post('/:teamId/avatar', authMiddleware, teamAvatarUpload.single('avatar'), async (req, res) => {
  const userId = req.user.id;
  const { teamId } = req.params;

  if (!req.file) {
    return res.status(400).json({ message: '请选择要上传的头像图片' });
  }

  try {
    // 验证是否为团队所有者
    const team = await queryOne(
      'SELECT * FROM teams WHERE id = ? AND owner_id = ?',
      [teamId, userId]
    );

    if (!team) {
      return res.status(403).json({ message: '只有团队所有者可以修改团队头像' });
    }

    if (!isConfigured()) {
      return res.status(500).json({ message: '文件存储服务未配置，请联系管理员' });
    }

    // 获取旧头像路径，用于清理
    const oldAvatarUrl = team.avatar_url;

    // 生成存储路径: team-avatars/team_{id}_{timestamp}.{ext}
    const ext = AVATAR_EXT_MAP[req.file.mimetype] || '.png';
    const objectPath = `team-avatars/team_${teamId}_${Date.now()}${ext}`;

    // 上传到 MinIO
    const avatarUrl = await uploadBuffer(req.file.buffer, objectPath, {
      contentType: req.file.mimetype
    });

    // 更新数据库
    await execute(
      'UPDATE teams SET avatar_url = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      [avatarUrl, teamId]
    );

    // 清理旧头像
    if (oldAvatarUrl) {
      deleteObject(oldAvatarUrl).catch(err => {
        console.error('[Team Avatar] 清理旧头像失败:', err.message);
      });
    }

    console.log('[Team Avatar] 上传成功:', { teamId, avatarUrl });
    res.json({ message: '团队头像上传成功', avatar_url: avatarUrl });
  } catch (err) {
    console.error('[Team Avatar]', err);
    res.status(500).json({ message: '团队头像上传失败' });
  }
});

module.exports = router;
