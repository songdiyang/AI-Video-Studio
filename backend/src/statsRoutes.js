/**
 * 仪表盘统计路由
 * 提供前端 DashboardPanel 所需的所有统计数据
 */
const express = require('express');
const { authMiddleware } = require('./middleware');
const { queryAll } = require('./dbHelper');

const router = express.Router();

/**
 * GET /api/stats/dashboard
 * 返回当前用户的仪表盘统计数据（项目数、剧本数、分镜数、AI调用数）
 */
router.get('/dashboard', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;

    // 并行查询：项目列表 + AI 调用计数
    const [projects, taskStats] = await Promise.all([
      queryAll(
        'SELECT id, name, type, settings_json, updated_at FROM projects WHERE user_id = ? ORDER BY updated_at DESC',
        [userId]
      ),
      queryAll(
        'SELECT COUNT(*) as totalCalls, COUNT(DISTINCT DATE(created_at)) as activeDays FROM generation_tasks WHERE user_id = ?',
        [userId]
      )
    ]);

    const projectCount = projects.length;

    // 统计剧本和分镜数量
    let scriptCount = 0;
    let storyboardCount = 0;
    for (const project of projects) {
      if (project.type === 'script') scriptCount++;
      try {
        const settings = project.settings_json ? JSON.parse(project.settings_json) : {};
        if (settings.storyboardCount) storyboardCount += settings.storyboardCount;
      } catch { /* ignore parse errors */ }
    }

    const aiCallsCount = taskStats[0]?.totalCalls || 0;

    // 最近5个项目
    const recentProjects = projects.slice(0, 5).map(p => ({
      id: String(p.id),
      name: p.name,
      updatedAt: p.updated_at || new Date().toISOString()
    }));

    res.json({
      projectCount,
      scriptCount,
      storyboardCount,
      aiCallsCount,
      recentProjects
    });
  } catch (error) {
    console.error('[Stats Dashboard]', error);
    res.status(500).json({ message: '获取统计数据失败' });
  }
});

module.exports = router;
