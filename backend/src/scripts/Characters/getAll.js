const { queryAll } = require('../../dbHelper');
const { authMiddleware } = require('../../middleware');

// GET / - 获取所有角色
// 支持查询参数：
// - tagGroup: 筛选指定分组名称的标签
// - tag: 筛选指定标签
module.exports = (router) => {
  router.get('/', authMiddleware, async (req, res) => {
    const userId = req.user.id;
    const { tagGroup, tag } = req.query;

    try {
      let sql = `SELECT c.*, p.name AS project_name,
         (SELECT COUNT(*) FROM character_states WHERE character_id = c.id) AS states_count,
         (SELECT COALESCE(front_view_url, image_url)
          FROM character_states
          WHERE character_id = c.id
            AND (front_view_url IS NOT NULL OR image_url IS NOT NULL)
          ORDER BY is_base_model DESC, COALESCE(sort_order, 0) ASC, id ASC
          LIMIT 1) AS first_state_front_view_url
         FROM characters c 
         LEFT JOIN projects p ON c.project_id = p.id 
         WHERE c.user_id = ?`;
      const params = [userId];

      // 如果指定了分组和标签，添加筛选条件
      if (tagGroup && tag) {
        // 使用 JSON_CONTAINS 查询 tag_groups_json 中包含指定分组和标签的记录
        sql += ` AND JSON_CONTAINS(c.tag_groups_json, JSON_OBJECT('groupName', ?, 'tags', JSON_ARRAY(?)))`;
        params.push(tagGroup, tag);
      } else if (tag) {
        // 只有标签，在 tags 字段或 tag_groups_json 中查找
        sql += ` AND (c.tags LIKE ? OR c.tag_groups_json LIKE ?)`;
        params.push(`%${tag}%`, `%"${tag}"%`);
      }

      sql += ' ORDER BY c.created_at DESC';

      const characters = await queryAll(sql, params);

      // 解析 tag_groups_json 字段
      const parsedCharacters = characters.map(c => ({
        ...c,
        tag_groups_json: c.tag_groups_json ? JSON.parse(c.tag_groups_json) : null,
        states_count: c.states_count || 0
      }));

      res.json({ characters: parsedCharacters });
    } catch (error) {
      console.error('[Characters List]', error);
      res.status(500).json({ message: '获取角色列表失败' });
    }
  });
};
