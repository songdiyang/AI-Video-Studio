const { queryOne, execute } = require('../../dbHelper');
const { authMiddleware } = require('../../middleware');
const { getEffectiveProjectRole } = require('../../middleware/collaborationAuth');

// DELETE /:id - 删除角色
module.exports = (router) => {
  router.delete('/:id', authMiddleware, async (req, res) => {
    const userId = req.user.id;
    const { id } = req.params;

    try {
      const existing = await queryOne(
        'SELECT * FROM characters WHERE id = ?',
        [id]
      );

      if (!existing) {
        return res.status(404).json({ message: '角色不存在' });
      }

      // 检查删除权限
      let hasAccess = false;
      if (existing.project_id) {
        const role = await getEffectiveProjectRole(userId, existing.project_id);
        hasAccess = role && role !== 'viewer';
      } else {
        hasAccess = existing.user_id === userId;
      }
      if (!hasAccess) {
        return res.status(403).json({ message: '无权删除该角色' });
      }

      await execute('DELETE FROM characters WHERE id = ?', [id]);
      res.json({ message: '角色删除成功' });
    } catch (error) {
      console.error('[Character Delete]', error);
      res.status(500).json({ message: '删除角色失败' });
    }
  });
};
