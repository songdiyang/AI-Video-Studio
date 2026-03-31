const express = require('express');
const { queryAll, queryOne, execute } = require('./dbHelper');
const { authMiddleware } = require('./middleware');

const router = express.Router();

/**
 * 团队管理 API 路由
 */

// GET /api/teams - 获取用户的团队列表
router.get('/', authMiddleware, async (req, res) => {
  const userId = req.user.id;

  try {
    const teams = await queryAll(
      `SELECT t.*, 
       COUNT(tm.user_id) as member_count,
       (SELECT COUNT(*) FROM projects WHERE team_id = t.id) as project_count
       FROM teams t
       LEFT JOIN team_members tm ON t.id = tm.team_id
       WHERE t.id IN (
         SELECT team_id FROM team_members WHERE user_id = ? AND role != 'viewer'
       ) OR t.owner_id = ?
       GROUP BY t.id
       ORDER BY t.updated_at DESC`,
      [userId, userId]
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
       COUNT(tm.user_id) as member_count,
       (SELECT COUNT(*) FROM projects WHERE team_id = t.id) as project_count
       FROM teams t
       LEFT JOIN team_members tm ON t.id = tm.team_id
       WHERE t.id = ? AND (t.owner_id = ? OR EXISTS (
         SELECT 1 FROM team_members WHERE team_id = t.id AND user_id = ?
       ))
       GROUP BY t.id`,
      [teamId, userId, userId]
    );

    if (!team) {
      return res.status(404).json({ message: '团队不存在或无权访问' });
    }

    res.json({ team });
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
      `SELECT tm.*, u.email
       FROM team_members tm
       LEFT JOIN users u ON tm.user_id = u.id
       WHERE tm.team_id = ?
       ORDER BY tm.role DESC, tm.joined_at DESC`,
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

// POST /api/teams/join - 通过邀请码加入团队
router.post('/join', authMiddleware, async (req, res) => {
  const userId = req.user.id;
  const { invite_code } = req.body;

  if (!invite_code) {
    return res.status(400).json({ message: '邀请码不能为空' });
  }

  try {
    // 查找团队
    const team = await queryOne(
      `SELECT * FROM teams WHERE invite_code = ? AND is_active = 1`,
      [invite_code]
    );

    if (!team) {
      return res.status(404).json({ message: '邀请码无效或已过期' });
    }

    // 检查邀请码是否过期
    if (team.invite_code_expires_at && new Date(team.invite_code_expires_at) < new Date()) {
      return res.status(400).json({ message: '邀请码已过期' });
    }

    // 检查成员数量是否已满
    const memberCount = await queryOne(
      `SELECT COUNT(*) as count FROM team_members WHERE team_id = ?`,
      [team.id]
    );

    if (memberCount.count >= team.max_members) {
      return res.status(400).json({ message: '团队人数已满' });
    }

    // 检查是否已是成员
    const existingMember = await queryOne(
      `SELECT * FROM team_members WHERE team_id = ? AND user_id = ?`,
      [team.id, userId]
    );

    if (existingMember) {
      return res.status(400).json({ message: '你已是该团队成员' });
    }

    // 添加成员（默认为 viewer 角色）
    await execute(
      `INSERT INTO team_members (team_id, user_id, role, invited_by) VALUES (?, ?, 'viewer', 0)`,
      [team.id, userId]
    );

    res.json({ 
      message: '加入团队成功',
      team: {
        id: team.id,
        name: team.name
      }
    });
  } catch (error) {
    console.error('[Teams API] 加入团队失败:', error);
    res.status(500).json({ message: '加入团队失败' });
  }
});

module.exports = router;
