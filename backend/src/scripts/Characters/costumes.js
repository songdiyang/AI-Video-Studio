/**
 * 角色服装关联管理 API
 * 端点:
 * - GET /api/characters/:id/costumes - 获取角色的服装列表
 * - POST /api/characters/:id/costumes/:costumeId/equip - 穿戴服装
 * - POST /api/characters/:id/costumes/:costumeId/unequip - 脱下服装
 * - DELETE /api/characters/:id/costumes/:costumeId - 移除角色服装关联
 */
const { queryOne, queryAll, execute } = require('../../dbHelper');
const { authMiddleware } = require('../../middleware');

module.exports = (router) => {
  // GET /api/characters/:id/costumes - 获取角色的服装列表
  router.get('/:id/costumes', authMiddleware, async (req, res) => {
    const userId = req.user.id;
    const { id } = req.params;

    try {
      // 验证角色所有权
      const character = await queryOne(
        'SELECT id, name, gender FROM characters WHERE id = ? AND user_id = ?',
        [id, userId]
      );

      if (!character) {
        return res.status(404).json({ message: '角色不存在或无权访问' });
      }

      // 获取角色关联的所有服装
      const costumes = await queryAll(
        `SELECT c.*, cc.is_equipped, cc.created_at as equipped_at
         FROM costumes c
         JOIN character_costumes cc ON c.id = cc.costume_id
         WHERE cc.character_id = ?
         ORDER BY cc.is_equipped DESC, cc.created_at DESC`,
        [id]
      );

      res.json({ costumes, characterGender: character.gender });
    } catch (error) {
      console.error('[Get Character Costumes]', error);
      res.status(500).json({ message: '获取角色服装失败' });
    }
  });

  // POST /api/characters/:id/costumes/:costumeId/equip - 穿戴服装
  router.post('/:id/costumes/:costumeId/equip', authMiddleware, async (req, res) => {
    const userId = req.user.id;
    const { id, costumeId } = req.params;

    try {
      // 验证角色所有权
      const character = await queryOne(
        'SELECT id, name, gender FROM characters WHERE id = ? AND user_id = ?',
        [id, userId]
      );

      if (!character) {
        return res.status(404).json({ message: '角色不存在或无权访问' });
      }

      // 验证服装存在且用户有权访问
      const costume = await queryOne(
        `SELECT c.* FROM costumes c
         JOIN projects p ON c.project_id = p.id
         WHERE c.id = ? AND p.user_id = ?`,
        [costumeId, userId]
      );

      if (!costume) {
        return res.status(404).json({ message: '服装不存在或无权访问' });
      }

      // 检查性别兼容性
      if (costume.gender !== 'unisex' && costume.gender !== character.gender) {
        return res.status(400).json({ message: '该服装不适用于此角色的性别' });
      }

      // 检查是否已有关联
      const existing = await queryOne(
        'SELECT * FROM character_costumes WHERE character_id = ? AND costume_id = ?',
        [id, costumeId]
      );

      // 先取消当前穿戴的其他服装
      await execute(
        'UPDATE character_costumes SET is_equipped = 0 WHERE character_id = ?',
        [id]
      );

      if (existing) {
        // 更新为穿戴状态
        await execute(
          'UPDATE character_costumes SET is_equipped = 1 WHERE character_id = ? AND costume_id = ?',
          [id, costumeId]
        );
      } else {
        // 创建新关联并设为穿戴
        await execute(
          'INSERT INTO character_costumes (character_id, costume_id, is_equipped) VALUES (?, ?, 1)',
          [id, costumeId]
        );
      }

      res.json({ message: '服装穿戴成功', costume });
    } catch (error) {
      console.error('[Equip Costume]', error);
      res.status(500).json({ message: '穿戴服装失败' });
    }
  });

  // POST /api/characters/:id/costumes/:costumeId/unequip - 脱下服装（保持关联）
  router.post('/:id/costumes/:costumeId/unequip', authMiddleware, async (req, res) => {
    const userId = req.user.id;
    const { id, costumeId } = req.params;

    try {
      // 验证角色所有权
      const character = await queryOne(
        'SELECT id FROM characters WHERE id = ? AND user_id = ?',
        [id, userId]
      );

      if (!character) {
        return res.status(404).json({ message: '角色不存在或无权访问' });
      }

      // 更新为未穿戴状态
      const result = await execute(
        'UPDATE character_costumes SET is_equipped = 0 WHERE character_id = ? AND costume_id = ?',
        [id, costumeId]
      );

      if (result.affectedRows === 0) {
        return res.status(404).json({ message: '角色未穿戴此服装' });
      }

      res.json({ message: '服装已脱下' });
    } catch (error) {
      console.error('[Unequip Costume]', error);
      res.status(500).json({ message: '脱下服装失败' });
    }
  });

  // DELETE /api/characters/:id/costumes/:costumeId - 移除角色服装关联
  router.delete('/:id/costumes/:costumeId', authMiddleware, async (req, res) => {
    const userId = req.user.id;
    const { id, costumeId } = req.params;

    try {
      // 验证角色所有权
      const character = await queryOne(
        'SELECT id FROM characters WHERE id = ? AND user_id = ?',
        [id, userId]
      );

      if (!character) {
        return res.status(404).json({ message: '角色不存在或无权访问' });
      }

      await execute(
        'DELETE FROM character_costumes WHERE character_id = ? AND costume_id = ?',
        [id, costumeId]
      );

      res.json({ message: '服装关联已移除' });
    } catch (error) {
      console.error('[Remove Character Costume]', error);
      res.status(500).json({ message: '移除服装关联失败' });
    }
  });

  // GET /api/characters/:id/equipped-costume - 获取角色当前穿戴的服装
  router.get('/:id/equipped-costume', authMiddleware, async (req, res) => {
    const userId = req.user.id;
    const { id } = req.params;

    try {
      // 验证角色所有权
      const character = await queryOne(
        'SELECT id FROM characters WHERE id = ? AND user_id = ?',
        [id, userId]
      );

      if (!character) {
        return res.status(404).json({ message: '角色不存在或无权访问' });
      }

      const costume = await queryOne(
        `SELECT c.* FROM costumes c
         JOIN character_costumes cc ON c.id = cc.costume_id
         WHERE cc.character_id = ? AND cc.is_equipped = 1`,
        [id]
      );

      res.json({ costume: costume || null });
    } catch (error) {
      console.error('[Get Equipped Costume]', error);
      res.status(500).json({ message: '获取穿戴服装失败' });
    }
  });
};
