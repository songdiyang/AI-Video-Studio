/**
 * 协作权限中间件
 * 提供团队和项目级别的权限检查
 */

const { queryOne, queryAll } = require('../dbHelper');

// 权限层级定义
const PERMISSION_LEVELS = {
  viewer: 1,   // 只读访问
  editor: 2,   // 编辑内容
  admin: 3,    // 管理成员、设置
  owner: 4     // 完全控制、删除
};

/**
 * 获取用户在团队中的角色
 */
async function getTeamRole(userId, teamId) {
  // 先检查是否是团队所有者
  const team = await queryOne(
    'SELECT owner_id FROM teams WHERE id = ? AND is_active = 1',
    [teamId]
  );

  if (!team) return null;
  
  // 使用 == 进行比较，避免类型不匹配问题（字符串 vs 数字）
  if (team.owner_id == userId) return 'owner';

  // 查询成员角色
  const member = await queryOne(
    'SELECT role FROM team_members WHERE team_id = ? AND user_id = ?',
    [teamId, userId]
  );

  return member?.role || null;
}

/**
 * 获取用户对项目的有效权限
 * 权限来源：项目所有者 > 项目协作者 > 团队成员（对团队项目）
 */
async function getEffectiveProjectRole(userId, projectId) {
  // 1. 查询项目基本信息
  const project = await queryOne(
    'SELECT user_id, team_id FROM projects WHERE id = ?',
    [projectId]
  );

  if (!project) return null;

  // 2. 项目所有者拥有最高权限
  if (project.user_id === userId) return 'owner';

  // 3. 查询项目协作者权限
  const collaborator = await queryOne(
    'SELECT role FROM project_collaborators WHERE project_id = ? AND user_id = ?',
    [projectId, userId]
  );

  let projectRole = collaborator?.role || null;

  // 4. 如果项目属于团队，检查团队成员权限
  if (project.team_id) {
    const teamRole = await getTeamRole(userId, project.team_id);
    
    // 取较高权限
    if (teamRole) {
      const teamLevel = PERMISSION_LEVELS[teamRole] || 0;
      const projectLevel = PERMISSION_LEVELS[projectRole] || 0;
      
      if (teamLevel > projectLevel) {
        projectRole = teamRole;
      }
    }
  }

  return projectRole;
}

/**
 * 检查团队权限中间件
 * @param {string} requiredRole - 所需最低权限
 */
function checkTeamPermission(requiredRole) {
  return async (req, res, next) => {
    try {
      const userId = req.user?.id;
      const teamId = req.params.id || req.params.teamId || req.body.teamId;

      if (!userId) {
        return res.status(401).json({ message: '未登录' });
      }

      if (!teamId) {
        return res.status(400).json({ message: '缺少团队ID' });
      }

      const userRole = await getTeamRole(userId, teamId);

      if (!userRole) {
        return res.status(403).json({ message: '您不是该团队成员' });
      }

      const userLevel = PERMISSION_LEVELS[userRole] || 0;
      const requiredLevel = PERMISSION_LEVELS[requiredRole] || 0;

      if (userLevel < requiredLevel) {
        return res.status(403).json({ 
          message: '权限不足',
          required: requiredRole,
          current: userRole
        });
      }

      // 附加权限信息到请求对象
      req.teamRole = userRole;
      req.teamId = teamId;

      next();
    } catch (error) {
      console.error('[CollaborationAuth] Team permission check error:', error);
      res.status(500).json({ message: '权限检查失败' });
    }
  };
}

/**
 * 检查项目权限中间件
 * @param {string} requiredRole - 所需最低权限
 */
function checkProjectPermission(requiredRole) {
  return async (req, res, next) => {
    try {
      const userId = req.user?.id;
      const projectId = req.params.id || req.params.projectId || req.body.projectId;

      if (!userId) {
        return res.status(401).json({ message: '未登录' });
      }

      if (!projectId) {
        return res.status(400).json({ message: '缺少项目ID' });
      }

      const userRole = await getEffectiveProjectRole(userId, projectId);

      if (!userRole) {
        return res.status(403).json({ message: '您没有访问该项目的权限' });
      }

      const userLevel = PERMISSION_LEVELS[userRole] || 0;
      const requiredLevel = PERMISSION_LEVELS[requiredRole] || 0;

      if (userLevel < requiredLevel) {
        return res.status(403).json({ 
          message: '权限不足',
          required: requiredRole,
          current: userRole
        });
      }

      // 附加权限信息到请求对象
      req.projectRole = userRole;
      req.projectId = projectId;

      next();
    } catch (error) {
      console.error('[CollaborationAuth] Project permission check error:', error);
      res.status(500).json({ message: '权限检查失败' });
    }
  };
}

/**
 * 可选的项目权限检查（用于列表等场景）
 * 不会阻止请求，只是附加权限信息
 */
function optionalProjectPermission() {
  return async (req, res, next) => {
    try {
      const userId = req.user?.id;
      const projectId = req.params.id || req.params.projectId;

      if (userId && projectId) {
        const userRole = await getEffectiveProjectRole(userId, projectId);
        req.projectRole = userRole;
      }

      next();
    } catch (error) {
      // 忽略错误，继续请求
      next();
    }
  };
}

/**
 * 检查用户是否有权限邀请成员
 * 需要 admin 或 owner 权限
 */
function checkInvitePermission(type) {
  return async (req, res, next) => {
    try {
      const userId = req.user?.id;
      const targetId = req.params.id || req.body.targetId;

      if (!userId) {
        return res.status(401).json({ message: '未登录' });
      }

      let userRole;
      if (type === 'team') {
        userRole = await getTeamRole(userId, targetId);
      } else if (type === 'project') {
        userRole = await getEffectiveProjectRole(userId, targetId);
      }

      const userLevel = PERMISSION_LEVELS[userRole] || 0;
      const requiredLevel = PERMISSION_LEVELS['admin'];

      if (userLevel < requiredLevel) {
        return res.status(403).json({ message: '您没有邀请成员的权限' });
      }

      req.inviteRole = userRole;
      next();
    } catch (error) {
      console.error('[CollaborationAuth] Invite permission check error:', error);
      res.status(500).json({ message: '权限检查失败' });
    }
  };
}

module.exports = {
  PERMISSION_LEVELS,
  getTeamRole,
  getEffectiveProjectRole,
  checkTeamPermission,
  checkProjectPermission,
  optionalProjectPermission,
  checkInvitePermission
};
