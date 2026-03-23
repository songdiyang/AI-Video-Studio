const { queryOne } = require('../dbHelper');

// 默认免费限额（未订阅或订阅过期的用户）
const FREE_LIMITS = {
  max_projects: 3,
  max_api_calls_monthly: 100,
  max_team_members: 1
};

/**
 * 配额检查中间件工厂函数
 * 
 * @param {'api_call' | 'project' | 'team_member'} resourceType - 资源类型
 * @returns {Function} Express 中间件
 * 
 * 依赖：authMiddleware 需先执行（req.user 必须存在）
 * 
 * 使用示例：
 * router.post('/generate', authMiddleware, quotaCheck('api_call'), async (req, res) => { ... });
 * router.post('/projects', authMiddleware, quotaCheck('project'), async (req, res) => { ... });
 * router.post('/teams/:id/members', authMiddleware, quotaCheck('team_member'), async (req, res) => { ... });
 */
function quotaCheck(resourceType) {
  return async (req, res, next) => {
    try {
      // 1. 从 req.user 获取用户 ID
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ message: '用户未认证' });
      }

      // 2. 查询用户当前订阅和套餐
      const subscription = await queryOne(
        `SELECT 
          us.status,
          us.api_calls_used,
          us.current_period_end,
          sp.max_api_calls_monthly,
          sp.max_projects,
          sp.max_team_members
         FROM user_subscriptions us
         JOIN subscription_plans sp ON us.plan_id = sp.id
         WHERE us.user_id = ? 
           AND us.status IN ('active', 'trial')
           AND us.current_period_end >= NOW()
         LIMIT 1`,
        [userId]
      );

      // 3. 确定配额限制（订阅或免费默认值）
      let limits;
      let apiCallsUsed = 0;
      let isSubscribed = false;

      if (subscription) {
        isSubscribed = true;
        limits = {
          max_api_calls: subscription.max_api_calls_monthly,
          max_projects: subscription.max_projects,
          max_team_members: subscription.max_team_members
        };
        apiCallsUsed = subscription.api_calls_used || 0;
      } else {
        // 未订阅或已过期，使用免费限额
        limits = {
          max_api_calls: FREE_LIMITS.max_api_calls_monthly,
          max_projects: FREE_LIMITS.max_projects,
          max_team_members: FREE_LIMITS.max_team_members
        };

        // 查询免费用户的 API 调用次数（可能需要单独跟踪）
        const freeUsage = await queryOne(
          `SELECT api_calls_used FROM user_subscriptions WHERE user_id = ?`,
          [userId]
        );
        apiCallsUsed = freeUsage?.api_calls_used || 0;
      }

      // 4. 根据资源类型检查配额
      if (resourceType === 'api_call') {
        if (apiCallsUsed >= limits.max_api_calls) {
          return res.status(429).json({
            error: '配额已达上限',
            message: `本月 API 调用次数已达上限（${limits.max_api_calls} 次）`,
            upgradeUrl: '/pricing',
            usage: {
              used: apiCallsUsed,
              limit: limits.max_api_calls
            }
          });
        }

        // 5. 通过后自动递增 api_calls_used
        if (isSubscribed) {
          await incrementApiCallsUsed(userId);
        } else {
          // 免费用户：如果没有订阅记录，创建一个跟踪记录
          await trackFreeUserApiCall(userId);
        }

        // 将配额信息附加到请求对象，供后续路由使用
        req.quota = {
          type: 'api_call',
          used: apiCallsUsed + 1,
          limit: limits.max_api_calls,
          isSubscribed
        };

      } else if (resourceType === 'project') {
        // 查询当前项目数
        const projectCount = await queryOne(
          'SELECT COUNT(*) as count FROM projects WHERE user_id = ?',
          [userId]
        );
        const projectsUsed = projectCount?.count || 0;

        if (projectsUsed >= limits.max_projects) {
          return res.status(429).json({
            error: '配额已达上限',
            message: `项目数量已达上限（${limits.max_projects} 个）`,
            upgradeUrl: '/pricing',
            usage: {
              used: projectsUsed,
              limit: limits.max_projects
            }
          });
        }

        req.quota = {
          type: 'project',
          used: projectsUsed,
          limit: limits.max_projects,
          isSubscribed
        };
      } else if (resourceType === 'team_member') {
        // 检查团队成员数量配额
        const teamId = req.params.id || req.params.teamId || req.body.teamId;
        
        if (!teamId) {
          return res.status(400).json({ message: '缺少团队ID' });
        }

        // 查询团队当前成员数
        const memberCount = await queryOne(
          'SELECT COUNT(*) as count FROM team_members WHERE team_id = ?',
          [teamId]
        );
        const membersUsed = memberCount?.count || 0;

        // 团队成员配额基于团队所有者的订阅
        const team = await queryOne('SELECT owner_id FROM teams WHERE id = ?', [teamId]);
        if (!team) {
          return res.status(404).json({ message: '团队不存在' });
        }

        // 查询团队所有者的订阅配额
        const ownerSubscription = await queryOne(
          `SELECT sp.max_team_members
           FROM user_subscriptions us
           JOIN subscription_plans sp ON us.plan_id = sp.id
           WHERE us.user_id = ?
             AND us.status IN ('active', 'trial')
             AND us.current_period_end >= NOW()
           LIMIT 1`,
          [team.owner_id]
        );

        const maxTeamMembers = ownerSubscription?.max_team_members || FREE_LIMITS.max_team_members;

        // -1 表示无限
        if (maxTeamMembers !== -1 && membersUsed >= maxTeamMembers) {
          return res.status(429).json({
            error: '配额已达上限',
            message: `团队成员数量已达上限（${maxTeamMembers} 人）`,
            upgradeUrl: '/pricing',
            usage: {
              used: membersUsed,
              limit: maxTeamMembers
            }
          });
        }

        req.quota = {
          type: 'team_member',
          used: membersUsed,
          limit: maxTeamMembers,
          isSubscribed: !!ownerSubscription
        };
      }

      // 6. 通过检查，继续执行
      next();

    } catch (error) {
      console.error('[QuotaCheck] Error:', error);
      res.status(500).json({ message: '配额检查失败' });
    }
  };
}

/**
 * 递增订阅用户的 API 调用计数
 */
async function incrementApiCallsUsed(userId) {
  const { execute } = require('../dbHelper');
  await execute(
    `UPDATE user_subscriptions 
     SET api_calls_used = api_calls_used + 1 
     WHERE user_id = ? AND status IN ('active', 'trial')`,
    [userId]
  );
}

/**
 * 跟踪免费用户的 API 调用
 * 如果没有订阅记录则创建一个（status=free），如果有则更新计数
 */
async function trackFreeUserApiCall(userId) {
  const { execute, queryOne: query } = require('../dbHelper');
  
  const existing = await query(
    'SELECT id FROM user_subscriptions WHERE user_id = ?',
    [userId]
  );

  if (existing) {
    await execute(
      `UPDATE user_subscriptions 
       SET api_calls_used = api_calls_used + 1 
       WHERE user_id = ?`,
      [userId]
    );
  } else {
    // 创建一个免费用户的使用跟踪记录
    const now = new Date();
    const periodEnd = new Date(now);
    periodEnd.setMonth(periodEnd.getMonth() + 1);

    const formatDateTime = (date) => {
      return date.toISOString().slice(0, 19).replace('T', ' ');
    };

    await execute(
      `INSERT INTO user_subscriptions 
        (user_id, plan_id, status, billing_cycle, current_period_start, current_period_end, api_calls_used)
       VALUES (?, NULL, 'expired', 'monthly', ?, ?, 1)`,
      [userId, formatDateTime(now), formatDateTime(periodEnd)]
    );
  }
}

/**
 * 可选：检查特定配额而不递增计数（只读检查）
 */
function quotaCheckReadOnly(resourceType) {
  return async (req, res, next) => {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ message: '用户未认证' });
      }

      const subscription = await queryOne(
        `SELECT 
          us.status,
          us.api_calls_used,
          sp.max_api_calls_monthly,
          sp.max_projects
         FROM user_subscriptions us
         JOIN subscription_plans sp ON us.plan_id = sp.id
         WHERE us.user_id = ? 
           AND us.status IN ('active', 'trial')
           AND us.current_period_end >= NOW()
         LIMIT 1`,
        [userId]
      );

      const limits = subscription ? {
        max_api_calls: subscription.max_api_calls_monthly,
        max_projects: subscription.max_projects
      } : {
        max_api_calls: FREE_LIMITS.max_api_calls_monthly,
        max_projects: FREE_LIMITS.max_projects
      };

      const apiCallsUsed = subscription?.api_calls_used || 0;

      if (resourceType === 'api_call' && apiCallsUsed >= limits.max_api_calls) {
        return res.status(429).json({
          error: '配额已达上限',
          message: `本月 API 调用次数已达上限（${limits.max_api_calls} 次）`,
          upgradeUrl: '/pricing'
        });
      }

      if (resourceType === 'project') {
        const projectCount = await queryOne(
          'SELECT COUNT(*) as count FROM projects WHERE user_id = ?',
          [userId]
        );
        if ((projectCount?.count || 0) >= limits.max_projects) {
          return res.status(429).json({
            error: '配额已达上限',
            message: `项目数量已达上限（${limits.max_projects} 个）`,
            upgradeUrl: '/pricing'
          });
        }
      }

      next();
    } catch (error) {
      console.error('[QuotaCheckReadOnly] Error:', error);
      res.status(500).json({ message: '配额检查失败' });
    }
  };
}

module.exports = {
  quotaCheck,
  quotaCheckReadOnly,
  FREE_LIMITS
};
