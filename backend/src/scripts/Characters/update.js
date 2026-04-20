const { queryOne, execute } = require('../../dbHelper');
const { authMiddleware } = require('../../middleware');
const { getEffectiveProjectRole } = require('../../middleware/collaborationAuth');

// PUT /:id - 更新角色
module.exports = (router) => {
  router.put('/:id', authMiddleware, async (req, res) => {
    const userId = req.user.id;
    const { id } = req.params;
    const { name, description, appearance, personality, image_url, tags, tag_groups_json } = req.body;

    try {
      const existing = await queryOne(
        'SELECT * FROM characters WHERE id = ?',
        [id]
      );

      if (!existing) {
        return res.status(404).json({ message: '角色不存在' });
      }

      // 检查编辑权限
      let hasAccess = false;
      if (existing.project_id) {
        const role = await getEffectiveProjectRole(userId, existing.project_id);
        hasAccess = role && role !== 'viewer';
      } else {
        hasAccess = existing.user_id === userId;
      }
      if (!hasAccess) {
        return res.status(403).json({ message: '无权编辑该角色' });
      }

      // 处理 tag_groups_json，确保是有效的 JSON 字符串
      let tagGroupsStr = existing.tag_groups_json;
      if (tag_groups_json !== undefined) {
        tagGroupsStr = tag_groups_json 
          ? (typeof tag_groups_json === 'string' ? tag_groups_json : JSON.stringify(tag_groups_json))
          : null;
      }

      await execute(
        `UPDATE characters 
         SET name = ?, description = ?, appearance = ?, personality = ?, image_url = ?, tags = ?, tag_groups_json = ?, updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [
          name || existing.name,
          description !== undefined ? description : existing.description,
          appearance !== undefined ? appearance : existing.appearance,
          personality !== undefined ? personality : existing.personality,
          image_url !== undefined ? image_url : existing.image_url,
          tags !== undefined ? tags : existing.tags,
          tagGroupsStr,
          id
        ]
      );

      const updated = await queryOne('SELECT * FROM characters WHERE id = ?', [id]);
      res.json({ message: '角色更新成功', character: updated });
    } catch (error) {
      console.error('[Character Update]', error);
      res.status(500).json({ message: '更新角色失败' });
    }
  });
};
