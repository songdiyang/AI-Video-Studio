const express = require('express');
const { queryOne, queryAll, execute } = require('./dbHelper');
const { authMiddleware } = require('./middleware');

const router = express.Router();

// 默认免费限额（未订阅用户）
const FREE_LIMITS = {
  max_projects: 3,
  max_api_calls_monthly: 100,
  max_team_members: 1
};

/**
 * GET /api/subscriptions/plans
 * 公开接口 - 获取所有激活的订阅计划
 */
router.get('/plans', async (_req, res) => {
  try {
    const plans = await queryAll(
      `SELECT id, name, display_name, price_monthly, price_yearly, 
              first_month_price, first_year_price,
              max_projects, max_api_calls_monthly, max_team_members, 
              features_json, sort_order
       FROM subscription_plans 
       WHERE is_active = 1 
       ORDER BY sort_order ASC`
    );

    // 解析 features_json
    const parsedPlans = plans.map(plan => ({
      ...plan,
      features: parseJsonField(plan.features_json, [])
    }));

    res.json(parsedPlans);
  } catch (error) {
    console.error('[Subscriptions] Get plans error:', error);
    res.status(500).json({ message: '获取订阅计划失败' });
  }
});

/**
 * GET /api/subscriptions/current
 * 需认证 - 获取当前用户的订阅信息
 */
router.get('/current', authMiddleware, async (req, res) => {
  const userId = req.user.id;

  try {
    // 查询用户当前有效订阅（JOIN 套餐信息）
    const subscription = await queryOne(
      `SELECT 
        us.id as subscription_id,
        us.user_id,
        us.plan_id,
        us.status,
        us.billing_cycle,
        us.current_period_start,
        us.current_period_end,
        us.api_calls_used,
        us.created_at as subscribed_at,
        sp.name as plan_name,
        sp.display_name as plan_display_name,
        sp.price_monthly,
        sp.price_yearly,
        sp.max_projects,
        sp.max_api_calls_monthly,
        sp.max_team_members,
        sp.features_json
       FROM user_subscriptions us
       JOIN subscription_plans sp ON us.plan_id = sp.id
       WHERE us.user_id = ? 
         AND us.status IN ('active', 'trial')
         AND us.current_period_end >= NOW()
       ORDER BY us.created_at DESC
       LIMIT 1`,
      [userId]
    );

    if (!subscription) {
      // 无有效订阅，返回 trial 状态
      return res.json({
        plan: null,
        subscription: null,
        usage: {
          api_calls_used: 0,
          api_calls_limit: FREE_LIMITS.max_api_calls_monthly,
          projects_limit: FREE_LIMITS.max_projects,
          team_members_limit: FREE_LIMITS.max_team_members
        },
        status: 'trial',
        message: '您当前使用免费版'
      });
    }

    // 计算项目使用量
    const projectCount = await queryOne(
      'SELECT COUNT(*) as count FROM projects WHERE user_id = ?',
      [userId]
    );

    res.json({
      plan: {
        id: subscription.plan_id,
        name: subscription.plan_name,
        display_name: subscription.plan_display_name,
        price_monthly: subscription.price_monthly,
        price_yearly: subscription.price_yearly,
        max_projects: subscription.max_projects,
        max_api_calls_monthly: subscription.max_api_calls_monthly,
        max_team_members: subscription.max_team_members,
        features: parseJsonField(subscription.features_json, [])
      },
      subscription: {
        id: subscription.subscription_id,
        status: subscription.status,
        billing_cycle: subscription.billing_cycle,
        current_period_start: subscription.current_period_start,
        current_period_end: subscription.current_period_end,
        subscribed_at: subscription.subscribed_at
      },
      usage: {
        api_calls_used: subscription.api_calls_used || 0,
        api_calls_limit: subscription.max_api_calls_monthly,
        projects_used: projectCount?.count || 0,
        projects_limit: subscription.max_projects,
        team_members_limit: subscription.max_team_members
      },
      status: subscription.status
    });
  } catch (error) {
    console.error('[Subscriptions] Get current error:', error);
    res.status(500).json({ message: '获取订阅信息失败' });
  }
});

/**
 * POST /api/subscriptions/subscribe
 * 需认证 - 订阅或升级套餐
 */
router.post('/subscribe', authMiddleware, async (req, res) => {
  const userId = req.user.id;
  const { planId, billingCycle } = req.body;

  if (!planId) {
    return res.status(400).json({ message: '请选择订阅计划' });
  }

  if (!['monthly', 'yearly'].includes(billingCycle)) {
    return res.status(400).json({ message: '无效的计费周期' });
  }

  try {
    // 查询套餐信息
    const plan = await queryOne(
      'SELECT * FROM subscription_plans WHERE id = ? AND is_active = 1',
      [planId]
    );

    if (!plan) {
      return res.status(404).json({ message: '订阅计划不存在或已下架' });
    }

    // 查询用户当前余额
    const user = await queryOne(
      'SELECT balance FROM users WHERE id = ?',
      [userId]
    );

    if (!user) {
      return res.status(404).json({ message: '用户不存在' });
    }

    // 计算费用
    let amount;
    if (billingCycle === 'monthly') {
      amount = parseFloat(plan.price_monthly) || 0;
    } else {
      // 年付：按年价格计算
      amount = parseFloat(plan.price_yearly) || 0;
    }

    // 检查余额
    if (user.balance < amount) {
      return res.status(402).json({ 
        message: '余额不足',
        required: amount,
        current: user.balance,
        shortfall: amount - user.balance
      });
    }

    // 计算订阅周期
    const now = new Date();
    const periodEnd = new Date(now);
    if (billingCycle === 'monthly') {
      periodEnd.setMonth(periodEnd.getMonth() + 1);
    } else {
      periodEnd.setFullYear(periodEnd.getFullYear() + 1);
    }

    // 格式化日期为 MySQL DATETIME
    const formatDateTime = (date) => {
      return date.toISOString().slice(0, 19).replace('T', ' ');
    };

    // 查询是否已有订阅
    const existingSubscription = await queryOne(
      'SELECT id FROM user_subscriptions WHERE user_id = ?',
      [userId]
    );

    if (existingSubscription) {
      // 更新已有订阅
      await execute(
        `UPDATE user_subscriptions SET 
          plan_id = ?,
          status = 'active',
          billing_cycle = ?,
          current_period_start = ?,
          current_period_end = ?,
          api_calls_used = 0
         WHERE user_id = ?`,
        [planId, billingCycle, formatDateTime(now), formatDateTime(periodEnd), userId]
      );
    } else {
      // 创建新订阅
      await execute(
        `INSERT INTO user_subscriptions 
          (user_id, plan_id, status, billing_cycle, current_period_start, current_period_end, api_calls_used)
         VALUES (?, ?, 'active', ?, ?, ?, 0)`,
        [userId, planId, billingCycle, formatDateTime(now), formatDateTime(periodEnd)]
      );
    }

    // 扣除余额
    await execute(
      'UPDATE users SET balance = balance - ? WHERE id = ?',
      [amount, userId]
    );

    res.json({
      message: '订阅成功',
      subscription: {
        plan_id: planId,
        plan_name: plan.display_name,
        billing_cycle: billingCycle,
        current_period_start: formatDateTime(now),
        current_period_end: formatDateTime(periodEnd),
        amount_charged: amount
      }
    });
  } catch (error) {
    console.error('[Subscriptions] Subscribe error:', error);
    res.status(500).json({ message: '订阅失败' });
  }
});

/**
 * POST /api/subscriptions/cancel
 * 需认证 - 取消订阅
 */
router.post('/cancel', authMiddleware, async (req, res) => {
  const userId = req.user.id;

  try {
    // 查询当前订阅
    const subscription = await queryOne(
      `SELECT id, status, current_period_end 
       FROM user_subscriptions 
       WHERE user_id = ? AND status IN ('active', 'trial')`,
      [userId]
    );

    if (!subscription) {
      return res.status(404).json({ message: '未找到有效订阅' });
    }

    // 更新状态为已取消（保持到期日期不变）
    await execute(
      `UPDATE user_subscriptions SET status = 'cancelled' WHERE id = ?`,
      [subscription.id]
    );

    res.json({
      message: '订阅已取消',
      effective_until: subscription.current_period_end,
      note: '您可以继续使用服务直到当前订阅周期结束'
    });
  } catch (error) {
    console.error('[Subscriptions] Cancel error:', error);
    res.status(500).json({ message: '取消订阅失败' });
  }
});

/**
 * GET /api/subscriptions/usage
 * 需认证 - 获取当前用户的配额使用情况
 */
router.get('/usage', authMiddleware, async (req, res) => {
  const userId = req.user.id;

  try {
    // 查询订阅和套餐信息
    const subscription = await queryOne(
      `SELECT 
        us.status,
        us.api_calls_used,
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

    // 查询实际项目数
    const projectCount = await queryOne(
      'SELECT COUNT(*) as count FROM projects WHERE user_id = ?',
      [userId]
    );

    // 使用订阅配额或默认免费配额
    const limits = subscription ? {
      api_calls_limit: subscription.max_api_calls_monthly,
      projects_limit: subscription.max_projects,
      team_members_limit: subscription.max_team_members
    } : {
      api_calls_limit: FREE_LIMITS.max_api_calls_monthly,
      projects_limit: FREE_LIMITS.max_projects,
      team_members_limit: FREE_LIMITS.max_team_members
    };

    res.json({
      api_calls_used: subscription?.api_calls_used || 0,
      api_calls_limit: limits.api_calls_limit,
      projects_used: projectCount?.count || 0,
      projects_limit: limits.projects_limit,
      team_members_limit: limits.team_members_limit,
      subscription_status: subscription?.status || 'free'
    });
  } catch (error) {
    console.error('[Subscriptions] Get usage error:', error);
    res.status(500).json({ message: '获取使用情况失败' });
  }
});

/**
 * 解析 JSON 字段
 */
function parseJsonField(value, defaultValue = null) {
  if (value === null || value === undefined) {
    return defaultValue;
  }
  if (typeof value === 'object') {
    return value;
  }
  try {
    return JSON.parse(value);
  } catch {
    return defaultValue;
  }
}

module.exports = router;
