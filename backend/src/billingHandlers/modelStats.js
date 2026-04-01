/**
 * AI模型性能统计 API
 * 提供各模型的成功率、平均耗时、调用次数等统计信息
 */

const { execute } = require('../dbHelper');

/**
 * 获取模型性能统计
 * GET /api/billing/model-stats
 */
async function getModelStats(req, res) {
  try {
    const { days = 7, modelName } = req.query;
    const daysInt = parseInt(days) || 7;
    
    // 构建查询条件
    let whereClause = `WHERE created_at >= DATE_SUB(NOW(), INTERVAL ${daysInt} DAY)`;
    const params = [];
    if (modelName) {
      whereClause += ` AND model_name = ?`;
      params.push(modelName);
    }

    // 1. 获取各模型的总体统计（使用 billing_records 表）
    const overallStatsQuery = `
      SELECT 
        model_name,
        model_category,
        COUNT(*) as total_calls,
        SUM(CASE WHEN request_status = 'success' THEN 1 ELSE 0 END) as success_calls,
        SUM(CASE WHEN request_status = 'failed' THEN 1 ELSE 0 END) as failed_calls,
        AVG(duration_seconds) as avg_duration_seconds,
        AVG(amount) as avg_cost,
        SUM(amount) as total_cost,
        SUM(points_cost) as total_points,
        MIN(duration_seconds) as min_duration,
        MAX(duration_seconds) as max_duration
      FROM billing_records
      ${whereClause}
        AND model_name IS NOT NULL
      GROUP BY model_name, model_category
      ORDER BY total_calls DESC
    `;

    const overallStats = await execute(overallStatsQuery, params);

    // 2. 获取按天的趋势数据
    const dailyTrendQuery = `
      SELECT 
        DATE(created_at) as date,
        model_name,
        COUNT(*) as calls,
        SUM(CASE WHEN request_status = 'success' THEN 1 ELSE 0 END) as success,
        AVG(duration_seconds) as avg_duration,
        SUM(amount) as daily_cost
      FROM billing_records
      ${whereClause}
        AND model_name IS NOT NULL
      GROUP BY DATE(created_at), model_name
      ORDER BY date DESC, model_name
    `;

    const dailyTrend = await execute(dailyTrendQuery, params);

    // 3. 获取错误类型分布
    const errorDistributionQuery = `
      SELECT 
        model_name,
        error_message,
        COUNT(*) as count
      FROM billing_records
      ${whereClause}
        AND request_status = 'failed'
        AND error_message IS NOT NULL
      GROUP BY model_name, error_message
      ORDER BY count DESC
      LIMIT 50
    `;

    const errorDistribution = await execute(errorDistributionQuery, params);

    // 4. 获取模型类别分布
    const categoryQuery = `
      SELECT 
        model_category,
        model_name,
        COUNT(*) as count,
        AVG(amount) as avg_cost,
        SUM(points_cost) as total_points
      FROM billing_records
      ${whereClause}
        AND model_name IS NOT NULL
      GROUP BY model_category, model_name
      ORDER BY count DESC
    `;

    const categoryDistribution = await execute(categoryQuery, params);

    // 处理统计数据
    const processedStats = overallStats.map(stat => ({
      modelName: stat.model_name,
      modelCategory: stat.model_category,
      totalCalls: parseInt(stat.total_calls) || 0,
      successCalls: parseInt(stat.success_calls) || 0,
      failedCalls: parseInt(stat.failed_calls) || 0,
      successRate: stat.total_calls > 0 
        ? ((stat.success_calls / stat.total_calls) * 100).toFixed(2) 
        : '0.00',
      avgDurationSeconds: stat.avg_duration_seconds 
        ? parseFloat(stat.avg_duration_seconds).toFixed(2) 
        : null,
      minDuration: stat.min_duration,
      maxDuration: stat.max_duration,
      avgCost: stat.avg_cost ? parseFloat(stat.avg_cost).toFixed(6) : '0',
      totalCost: stat.total_cost ? parseFloat(stat.total_cost).toFixed(6) : '0',
      totalPoints: parseInt(stat.total_points) || 0,
    }));

    res.json({
      success: true,
      period: `${daysInt}天`,
      overallStats: processedStats,
      dailyTrend: dailyTrend.map(d => ({
        date: d.date,
        modelName: d.model_name,
        calls: d.calls,
        success: d.success || 0,
        avgDuration: d.avg_duration ? parseFloat(d.avg_duration).toFixed(2) : null,
        dailyCost: d.daily_cost ? parseFloat(d.daily_cost).toFixed(4) : '0',
      })),
      errorDistribution,
      categoryDistribution,
    });
  } catch (error) {
    console.error('[getModelStats] 错误:', error);
    res.status(500).json({ error: '获取模型统计失败: ' + error.message });
  }
}

/**
 * 获取模型对比数据
 * GET /api/billing/model-comparison
 */
async function getModelComparison(req, res) {
  try {
    const { days = 7, category } = req.query;
    const daysInt = parseInt(days) || 7;

    let whereClause = `WHERE created_at >= DATE_SUB(NOW(), INTERVAL ${daysInt} DAY) AND model_name IS NOT NULL`;
    const params = [];
    if (category) {
      whereClause += ` AND model_category = ?`;
      params.push(category);
    }

    // 获取同类型不同模型的表现对比
    const comparisonQuery = `
      SELECT 
        model_category,
        model_name,
        COUNT(*) as calls,
        SUM(CASE WHEN request_status = 'success' THEN 1 ELSE 0 END) as success,
        AVG(duration_seconds) as avg_duration,
        AVG(amount) as avg_cost,
        SUM(points_cost) as total_points
      FROM billing_records
      ${whereClause}
      GROUP BY model_category, model_name
      HAVING calls >= 1
      ORDER BY model_category, success DESC, avg_duration ASC
    `;

    const comparison = await execute(comparisonQuery, params);

    // 按模型类别分组
    const groupedByCategory = {};
    for (const item of comparison) {
      const category = item.model_category || '其他';
      if (!groupedByCategory[category]) {
        groupedByCategory[category] = [];
      }
      groupedByCategory[category].push({
        modelName: item.model_name,
        calls: item.calls,
        success: item.success || 0,
        successRate: item.calls > 0 
          ? ((item.success / item.calls) * 100).toFixed(2) 
          : '0.00',
        avgDuration: item.avg_duration 
          ? parseFloat(item.avg_duration).toFixed(2) 
          : null,
        avgCost: item.avg_cost ? parseFloat(item.avg_cost).toFixed(6) : '0',
        totalPoints: item.total_points || 0,
      });
    }

    res.json({
      success: true,
      period: `${daysInt}天`,
      comparison: groupedByCategory,
    });
  } catch (error) {
    console.error('[getModelComparison] 错误:', error);
    res.status(500).json({ error: '获取模型对比失败: ' + error.message });
  }
}

/**
 * 获取实时模型状态
 * GET /api/billing/model-status
 */
async function getModelStatus(req, res) {
  try {
    // 获取最近1小时的调用情况
    const recentQuery = `
      SELECT 
        model_name,
        model_category,
        COUNT(*) as recent_calls,
        SUM(CASE WHEN request_status = 'success' THEN 1 ELSE 0 END) as recent_success,
        SUM(CASE WHEN request_status = 'failed' THEN 1 ELSE 0 END) as recent_failed,
        AVG(duration_seconds) as avg_duration
      FROM billing_records
      WHERE created_at >= DATE_SUB(NOW(), INTERVAL 1 HOUR)
        AND model_name IS NOT NULL
      GROUP BY model_name, model_category
    `;

    const recentStats = await execute(recentQuery);

    // 获取最近的错误记录
    const recentErrorsQuery = `
      SELECT 
        id,
        model_name,
        model_category,
        operation,
        error_message,
        created_at
      FROM billing_records
      WHERE request_status = 'failed'
        AND created_at >= DATE_SUB(NOW(), INTERVAL 24 HOUR)
        AND error_message IS NOT NULL
      ORDER BY created_at DESC
      LIMIT 20
    `;

    const recentErrors = await execute(recentErrorsQuery);

    res.json({
      success: true,
      recentStats: recentStats.map(s => ({
        modelName: s.model_name,
        modelCategory: s.model_category,
        recentCalls: s.recent_calls,
        recentSuccess: s.recent_success || 0,
        recentFailed: s.recent_failed || 0,
        avgDuration: s.avg_duration ? parseFloat(s.avg_duration).toFixed(2) : null,
        recentSuccessRate: s.recent_calls > 0 
          ? ((s.recent_success / s.recent_calls) * 100).toFixed(2) 
          : '0.00',
      })),
      recentErrors: recentErrors.map(e => ({
        id: e.id,
        modelName: e.model_name,
        modelCategory: e.model_category,
        operation: e.operation,
        errorMessage: e.error_message,
        createdAt: e.created_at,
      })),
    });
  } catch (error) {
    console.error('[getModelStatus] 错误:', error);
    res.status(500).json({ error: '获取模型状态失败: ' + error.message });
  }
}

/**
 * 注册路由
 */
function registerRoutes(router) {
  router.get('/model-stats', getModelStats);
  router.get('/model-comparison', getModelComparison);
  router.get('/model-status', getModelStatus);
}

module.exports = registerRoutes;
