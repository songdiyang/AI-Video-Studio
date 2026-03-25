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
    if (modelName) {
      whereClause += ` AND model_name = ?`;
    }

    // 1. 获取各模型的总体统计
    const overallStatsQuery = `
      SELECT 
        model_name,
        COUNT(*) as total_calls,
        SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as success_calls,
        SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed_calls,
        AVG(CASE WHEN status = 'completed' THEN TIMESTAMPDIFF(SECOND, created_at, completed_at) END) as avg_duration_seconds,
        AVG(cost) as avg_cost,
        SUM(cost) as total_cost,
        MIN(CASE WHEN status = 'completed' THEN TIMESTAMPDIFF(SECOND, created_at, completed_at) END) as min_duration,
        MAX(CASE WHEN status = 'completed' THEN TIMESTAMPDIFF(SECOND, created_at, completed_at) END) as max_duration
      FROM generation_tasks
      ${whereClause}
      GROUP BY model_name
      ORDER BY total_calls DESC
    `;

    const overallStats = await execute(
      overallStatsQuery,
      modelName ? [modelName] : []
    );

    // 2. 获取按天的趋势数据
    const dailyTrendQuery = `
      SELECT 
        DATE(created_at) as date,
        model_name,
        COUNT(*) as calls,
        SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as success,
        AVG(CASE WHEN status = 'completed' THEN TIMESTAMPDIFF(SECOND, created_at, completed_at) END) as avg_duration
      FROM generation_tasks
      ${whereClause}
      GROUP BY DATE(created_at), model_name
      ORDER BY date DESC, model_name
    `;

    const dailyTrend = await execute(
      dailyTrendQuery,
      modelName ? [modelName] : []
    );

    // 3. 获取错误类型分布
    const errorDistributionQuery = `
      SELECT 
        model_name,
        error_message,
        COUNT(*) as count
      FROM generation_tasks
      ${whereClause}
        AND status = 'failed'
        AND error_message IS NOT NULL
      GROUP BY model_name, error_message
      ORDER BY count DESC
      LIMIT 50
    `;

    const errorDistribution = await execute(
      errorDistributionQuery,
      modelName ? [modelName] : []
    );

    // 4. 获取任务类型分布
    const taskTypeQuery = `
      SELECT 
        task_type,
        model_name,
        COUNT(*) as count,
        AVG(cost) as avg_cost
      FROM generation_tasks
      ${whereClause}
      GROUP BY task_type, model_name
      ORDER BY count DESC
    `;

    const taskTypeDistribution = await execute(
      taskTypeQuery,
      modelName ? [modelName] : []
    );

    // 处理统计数据
    const processedStats = overallStats.map(stat => ({
      modelName: stat.model_name,
      totalCalls: stat.total_calls,
      successCalls: stat.success_calls,
      failedCalls: stat.failed_calls,
      successRate: stat.total_calls > 0 
        ? ((stat.success_calls / stat.total_calls) * 100).toFixed(2) 
        : 0,
      avgDurationSeconds: stat.avg_duration_seconds 
        ? parseFloat(stat.avg_duration_seconds).toFixed(2) 
        : null,
      minDuration: stat.min_duration,
      maxDuration: stat.max_duration,
      avgCost: stat.avg_cost ? parseFloat(stat.avg_cost).toFixed(6) : 0,
      totalCost: stat.total_cost ? parseFloat(stat.total_cost).toFixed(6) : 0,
    }));

    res.json({
      success: true,
      period: `${daysInt}天`,
      overallStats: processedStats,
      dailyTrend,
      errorDistribution,
      taskTypeDistribution,
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
    const { days = 7, taskType } = req.query;
    const daysInt = parseInt(days) || 7;

    let whereClause = `WHERE created_at >= DATE_SUB(NOW(), INTERVAL ${daysInt} DAY)`;
    if (taskType) {
      whereClause += ` AND task_type = ?`;
    }

    // 获取同类型任务不同模型的表现对比
    const comparisonQuery = `
      SELECT 
        task_type,
        model_name,
        COUNT(*) as calls,
        SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as success,
        AVG(CASE WHEN status = 'completed' THEN TIMESTAMPDIFF(SECOND, created_at, completed_at) END) as avg_duration,
        AVG(cost) as avg_cost
      FROM generation_tasks
      ${whereClause}
      GROUP BY task_type, model_name
      HAVING calls >= 5
      ORDER BY task_type, success DESC, avg_duration ASC
    `;

    const comparison = await execute(
      comparisonQuery,
      taskType ? [taskType] : []
    );

    // 按任务类型分组
    const groupedByTask = {};
    for (const item of comparison) {
      if (!groupedByTask[item.task_type]) {
        groupedByTask[item.task_type] = [];
      }
      groupedByTask[item.task_type].push({
        modelName: item.model_name,
        calls: item.calls,
        success: item.success,
        successRate: item.calls > 0 
          ? ((item.success / item.calls) * 100).toFixed(2) 
          : 0,
        avgDuration: item.avg_duration 
          ? parseFloat(item.avg_duration).toFixed(2) 
          : null,
        avgCost: item.avg_cost ? parseFloat(item.avg_cost).toFixed(6) : 0,
      });
    }

    res.json({
      success: true,
      period: `${daysInt}天`,
      comparison: groupedByTask,
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
        COUNT(*) as recent_calls,
        SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as recent_success,
        SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as recent_failed,
        SUM(CASE WHEN status = 'pending' OR status = 'running' THEN 1 ELSE 0 END) as active_tasks
      FROM generation_tasks
      WHERE created_at >= DATE_SUB(NOW(), INTERVAL 1 HOUR)
      GROUP BY model_name
    `;

    const recentStats = await execute(recentQuery);

    // 获取当前进行中的任务
    const activeQuery = `
      SELECT 
        gt.id,
        gt.model_name,
        gt.task_type,
        gt.status,
        gt.progress,
        TIMESTAMPDIFF(SECOND, gt.created_at, NOW()) as running_seconds
      FROM generation_tasks gt
      WHERE gt.status IN ('pending', 'running')
        AND gt.created_at >= DATE_SUB(NOW(), INTERVAL 24 HOUR)
      ORDER BY gt.created_at DESC
      LIMIT 20
    `;

    const activeTasks = await execute(activeQuery);

    res.json({
      success: true,
      recentStats: recentStats.map(s => ({
        modelName: s.model_name,
        recentCalls: s.recent_calls,
        recentSuccess: s.recent_success,
        recentFailed: s.recent_failed,
        activeTasks: s.active_tasks,
        recentSuccessRate: s.recent_calls > 0 
          ? ((s.recent_success / s.recent_calls) * 100).toFixed(2) 
          : 0,
      })),
      activeTasks,
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
