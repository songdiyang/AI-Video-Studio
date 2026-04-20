const { queryOne } = require('../../dbHelper');
const { authMiddleware } = require('../../middleware');
const { getEffectiveProjectRole } = require('../../middleware/collaborationAuth');

// GET /:id - 获取单个角色
module.exports = (router) => {
  router.get('/:id', authMiddleware, async (req, res) => {
    const userId = req.user.id;
    const { id } = req.params;

    try {
      const character = await queryOne(
        'SELECT * FROM characters WHERE id = ?',
        [id]
      );

      if (!character) {
        return res.status(404).json({ message: '角色不存在' });
      }

      // 通过角色关联的项目检查权限
      if (character.project_id) {
        const role = await getEffectiveProjectRole(userId, character.project_id);
        if (!role) {
          return res.status(403).json({ message: '无权访问该角色' });
        }
      } else if (character.user_id !== userId) {
        return res.status(403).json({ message: '无权访问该角色' });
      }

      res.json(character);
    } catch (error) {
      console.error('[Character Detail]', error);
      res.status(500).json({ message: '获取角色失败' });
    }
  });
};
