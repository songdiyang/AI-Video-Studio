const { queryAll } = require('../../dbHelper');
const { authMiddleware } = require('../../middleware');
const { getEffectiveProjectRole } = require('../../middleware/collaborationAuth');

// GET /project/:projectId - 获取项目的所有角色
// 支持可选的 scriptId 参数：/project/:projectId?scriptId=123
// 如果不传 scriptId，返回项目下所有角色；如果传了，只返回该剧本的角色
//
// 返回数据中包含白膜/服装状态概要：
//   states_count           - 状态总数
//   base_model_image_url   - 白膜正面图 URL
//   has_base_model_views   - 是否已生成白膜三视图
//   active_state_name      - 当前激活状态名称
//   active_state_outfit    - 当前激活状态服装描述
//   active_state_image_url - 当前激活状态正面图
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

      let sql = `SELECT DISTINCT c.*,
         (SELECT COUNT(*) FROM character_states WHERE character_id = c.id) AS states_count,
         bs.front_view_url AS base_model_image_url,
         CASE WHEN bs.front_view_url IS NOT NULL AND bs.front_view_url != '' THEN 1 ELSE 0 END AS has_base_model_views,
         acs.name AS active_state_name,
         acs.outfit AS active_state_outfit,
         acs.front_view_url AS active_state_image_url,
         COALESCE(cpb.binding_type, CASE WHEN c.project_id = ? THEN 'owner' ELSE NULL END) AS binding_type
         FROM characters c
         LEFT JOIN character_states bs ON bs.character_id = c.id AND bs.is_base_model = 1
         LEFT JOIN character_states acs ON acs.character_id = c.id AND acs.is_active = 1 AND acs.is_base_model = 0
         LEFT JOIN character_project_bindings cpb ON cpb.character_id = c.id AND cpb.project_id = ?
         WHERE (c.project_id = ? OR cpb.project_id = ?)`;
      const params = [projectId, projectId, projectId, projectId];

      // 如果提供了 scriptId，添加过滤条件
      if (scriptId) {
        sql += ' AND c.script_id = ?';
        params.push(scriptId);
      }

      sql += ' ORDER BY c.created_at DESC';

      const characters = await queryAll(sql, params);

      console.log('[Characters by Project] projectId:', projectId, 'scriptId:', scriptId || 'all', '找到', characters.length, '个角色');

      res.json({ characters });
    } catch (error) {
      console.error('[Characters by Project]', error);
      res.status(500).json({ message: '获取项目角色失败' });
    }
  });
};
