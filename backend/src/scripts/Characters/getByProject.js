const { queryAll } = require('../../dbHelper');
const { authMiddleware } = require('../../middleware');
const { getEffectiveProjectRole } = require('../../middleware/collaborationAuth');

// GET /project/:projectId - 获取项目的所有角色
// 支持可选的 scriptId 参数：/project/:projectId?scriptId=123
// 如果不传 scriptId，返回项目下所有角色；如果传了，只返回该剧本的角色
module.exports = (router) => {
  router.get('/project/:projectId', authMiddleware, async (req, res) => {
    const userId = req.user.id;
    const { projectId } = req.params;
    const { scriptId } = req.query;

    try {
      // 验证项目权限（支持团队成员访问）
      const role = await getEffectiveProjectRole(userId, projectId);
      if (!role) {
        return res.status(403).json({ message: '无权访问该项目' });
      }

      let sql = 'SELECT * FROM characters WHERE project_id = ?';
      const params = [projectId];

      // 如果提供了 scriptId，添加过滤条件
      if (scriptId) {
        sql += ' AND script_id = ?';
        params.push(scriptId);
      }

      sql += ' ORDER BY created_at DESC';

      const characters = await queryAll(sql, params);

      console.log('[Characters by Project] projectId:', projectId, 'scriptId:', scriptId || 'all', '找到', characters.length, '个角色');

      res.json({ characters });
    } catch (error) {
      console.error('[Characters by Project]', error);
      res.status(500).json({ message: '获取项目角色失败' });
    }
  });
};
