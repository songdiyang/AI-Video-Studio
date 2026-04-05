/**
 * 订阅服务 - 管理用户会员等级和权限检查
 */

const { queryOne, query, execute } = require('./db');

// 会员等级配置（与文档保持一致）
const PLAN_LIMITS = {
  // 免费版 (Lv.0)
  free: {
    level: 0,
    name: '免费版',
    maxProjects: 3,
    monthlyPoints: 2000,
    maxTeamMembers: 1,
    features: ['basic_ai', 'standard_templates', 'community_support']
  },
  // 基础版 (Lv.1)
  basic: {
    level: 1,
    name: '基础版',
    maxProjects: 20,
    monthlyPoints: 10000,
    maxTeamMembers: 5,
    features: ['advanced_ai', 'full_templates', 'ticket_support', 'priority_queue', 'export']
  },
  // 专业版 (Lv.2)
  pro: {
    level: 2,
    name: '专业版',
    maxProjects: -1, // 无限
    monthlyPoints: 30000,
    maxTeamMembers: 15,
    features: ['all_ai', 'custom_templates', 'priority_support', 'team_collab', 'api_access']
  },
  // 旗舰版 (Lv.3)
  premium: {
    level: 3,
    name: '旗舰版',
    maxProjects: -1, // 无限
    monthlyPoints: 90000,
    maxTeamMembers: -1, // 无限
    features: ['all_ai', 'full_api_access', 'dedicated_support', 'team_collab', 'all_models']
  },
  // 企业版 (Lv.4)
  enterprise: {
    level: 4,
    name: '企业版',
    maxProjects: -1, // 无限
    monthlyPoints: -1, // 定制
    maxTeamMembers: -1, // 无限
    features: ['all_ai', 'private_deploy', 'custom_dev', 'sla_99_9', 'dedicated_support']
  }
};

// 默认计划（未订阅用户）
const DEFAULT_PLAN = 'free';

/**
 * 获取用户当前订阅计划
 * @param {number} userId 
 * @returns {Promise<{planName: string, planConfig: object, subscription: object|null}>}
 */
async function getUserSubscription(userId) {
  try {
    // 查询用户订阅信息
    const subscription = await queryOne(`
      SELECT us.*, sp.name as plan_name, sp.display_name
      FROM user_subscriptions us
      JOIN subscription_plans sp ON us.plan_id = sp.id
      WHERE us.user_id = ? AND us.status IN ('active', 'trial')
      ORDER BY us.created_at DESC
      LIMIT 1
    `, [userId]);

    if (subscription && subscription.plan_name) {
      const planName = subscription.plan_name.toLowerCase();
      const planConfig = PLAN_LIMITS[planName] || PLAN_LIMITS[DEFAULT_PLAN];
      return {
        planName,
        planConfig,
        subscription
      };
    }

    // 没有订阅，返回默认入门版
    return {
      planName: DEFAULT_PLAN,
      planConfig: PLAN_LIMITS[DEFAULT_PLAN],
      subscription: null
    };
  } catch (error) {
    console.error('[SubscriptionService] 获取用户订阅失败:', error);
    // 出错时返回默认计划
    return {
      planName: DEFAULT_PLAN,
      planConfig: PLAN_LIMITS[DEFAULT_PLAN],
      subscription: null
    };
  }
}

/**
 * 获取用户当前项目数量
 * @param {number} userId 
 * @returns {Promise<number>}
 */
async function getUserProjectCount(userId) {
  try {
    const result = await queryOne(
      'SELECT COUNT(*) as count FROM projects WHERE user_id = ?',
      [userId]
    );
    return result?.count || 0;
  } catch (error) {
    console.error('[SubscriptionService] 获取项目数量失败:', error);
    return 0;
  }
}

/**
 * 检查用户是否可以创建新项目
 * @param {number} userId 
 * @returns {Promise<{allowed: boolean, currentCount: number, maxCount: number, planName: string, planDisplayName: string}>}
 */
async function canCreateProject(userId) {
  const { planName, planConfig } = await getUserSubscription(userId);
  const currentCount = await getUserProjectCount(userId);
  const maxCount = planConfig.maxProjects;
  
  // -1 表示无限
  const allowed = maxCount === -1 || currentCount < maxCount;
  
  return {
    allowed,
    currentCount,
    maxCount,
    planName,
    planDisplayName: planConfig.name,
    planLevel: planConfig.level
  };
}

/**
 * 获取下一级套餐信息（用于升级提示）
 * @param {string} currentPlan 
 * @returns {object|null}
 */
function getNextPlanInfo(currentPlan) {
  const planOrder = ['free', 'basic', 'pro', 'premium', 'enterprise'];
  const currentIndex = planOrder.indexOf(currentPlan);
  
  if (currentIndex === -1 || currentIndex >= planOrder.length - 1) {
    return null;
  }
  
  const nextPlanName = planOrder[currentIndex + 1];
  const nextPlanConfig = PLAN_LIMITS[nextPlanName];
  
  // 价格信息
  const prices = {
    basic: { monthly: 99, yearly: 990, firstMonth: 49.9 },
    pro: { monthly: 299, yearly: 2990 },
    premium: { monthly: 888, yearly: 8880 },
    enterprise: { monthly: null, yearly: null, custom: true }
  };
  
  return {
    name: nextPlanName,
    displayName: nextPlanConfig.name,
    maxProjects: nextPlanConfig.maxProjects,
    monthlyPoints: nextPlanConfig.monthlyPoints,
    price: prices[nextPlanName] || null
  };
}

/**
 * 获取用户完整的会员信息（用于前端展示）
 * @param {number} userId 
 * @returns {Promise<object>}
 */
async function getMembershipInfo(userId) {
  const { planName, planConfig, subscription } = await getUserSubscription(userId);
  const projectCount = await getUserProjectCount(userId);
  const nextPlan = getNextPlanInfo(planName);
  
  return {
    plan: {
      name: planName,
      displayName: planConfig.name,
      level: planConfig.level
    },
    limits: {
      maxProjects: planConfig.maxProjects,
      currentProjects: projectCount,
      projectsRemaining: planConfig.maxProjects === -1 ? -1 : Math.max(0, planConfig.maxProjects - projectCount),
      monthlyPoints: planConfig.monthlyPoints,
      maxTeamMembers: planConfig.maxTeamMembers
    },
    features: planConfig.features,
    subscription: subscription ? {
      status: subscription.status,
      billingCycle: subscription.billing_cycle,
      periodEnd: subscription.current_period_end
    } : null,
    upgrade: nextPlan ? {
      available: true,
      nextPlan
    } : {
      available: false,
      nextPlan: null
    }
  };
}

module.exports = {
  PLAN_LIMITS,
  DEFAULT_PLAN,
  getUserSubscription,
  getUserProjectCount,
  canCreateProject,
  getNextPlanInfo,
  getMembershipInfo
};
