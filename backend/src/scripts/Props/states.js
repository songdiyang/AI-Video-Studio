/**
 * 道具状态管理 API
 * 
 * 支持为道具创建多个状态（如：门的开/关状态，灯的亮/灭状态等）
 * 
 * GET /:id/states - 获取道具所有状态
 * POST /:id/states - 创建道具状态
 * PUT /:id/states/:stateId - 更新道具状态
 * DELETE /:id/states/:stateId - 删除道具状态
 */

const { authMiddleware } = require('../../middleware');
const { queryOne, queryAll, execute } = require('../../dbHelper');

module.exports = function(router) {

  /**
   * GET /:id/states
   * 获取道具的所有状态
   */
  router.get('/:id/states', authMiddleware, async (req, res) => {
    const userId = req.user.id;
    const propId = parseInt(req.params.id);

    try {
      // 验证道具所有权
      const prop = await queryOne(
        'SELECT id FROM props WHERE id = ? AND user_id = ?',
        [propId, userId]
      );

      if (!prop) {
        return res.status(404).json({ message: '道具不存在或无权访问' });
      }

      const states = await queryAll(
        `SELECT * FROM prop_states 
         WHERE prop_id = ? 
         ORDER BY sort_order ASC, created_at ASC`,
        [propId]
      );

      res.json({ states });

    } catch (error) {
      console.error('[Get Prop States]', error);
      res.status(500).json({ message: '获取道具状态失败' });
    }
  });

  /**
   * POST /:id/states
   * 创建道具状态
   * 
   * Body: {
   *   name: string (必需) - 状态名称
   *   description?: string - 状态描述
   *   image_url?: string - 状态图片
   *   sort_order?: number - 排序
   * }
   */
  router.post('/:id/states', authMiddleware, async (req, res) => {
    const userId = req.user.id;
    const propId = parseInt(req.params.id);
    const { name, description, image_url, sort_order } = req.body;

    try {
      // 验证道具所有权
      const prop = await queryOne(
        'SELECT id FROM props WHERE id = ? AND user_id = ?',
        [propId, userId]
      );

      if (!prop) {
        return res.status(404).json({ message: '道具不存在或无权访问' });
      }

      if (!name || !name.trim()) {
        return res.status(400).json({ message: '状态名称不能为空' });
      }

      // 获取当前最大排序号
      const maxOrder = await queryOne(
        'SELECT MAX(sort_order) as max_order FROM prop_states WHERE prop_id = ?',
        [propId]
      );
      const nextOrder = sort_order ?? ((maxOrder?.max_order || 0) + 1);

      const result = await execute(
        `INSERT INTO prop_states (prop_id, name, description, image_url, sort_order) 
         VALUES (?, ?, ?, ?, ?)`,
        [propId, name.trim(), description || '', image_url || '', nextOrder]
      );

      const state = await queryOne(
        'SELECT * FROM prop_states WHERE id = ?',
        [result.insertId]
      );

      res.status(201).json({ state });

    } catch (error) {
      console.error('[Create Prop State]', error);
      res.status(500).json({ message: '创建道具状态失败' });
    }
  });

  /**
   * PUT /:id/states/:stateId
   * 更新道具状态
   */
  router.put('/:id/states/:stateId', authMiddleware, async (req, res) => {
    const userId = req.user.id;
    const propId = parseInt(req.params.id);
    const stateId = parseInt(req.params.stateId);
    const { name, description, image_url, sort_order } = req.body;

    try {
      // 验证道具所有权
      const prop = await queryOne(
        'SELECT id FROM props WHERE id = ? AND user_id = ?',
        [propId, userId]
      );

      if (!prop) {
        return res.status(404).json({ message: '道具不存在或无权访问' });
      }

      // 验证状态存在
      const state = await queryOne(
        'SELECT * FROM prop_states WHERE id = ? AND prop_id = ?',
        [stateId, propId]
      );

      if (!state) {
        return res.status(404).json({ message: '道具状态不存在' });
      }

      await execute(
        `UPDATE prop_states 
         SET name = ?, description = ?, image_url = ?, sort_order = ?
         WHERE id = ?`,
        [
          name !== undefined ? name : state.name,
          description !== undefined ? description : state.description,
          image_url !== undefined ? image_url : state.image_url,
          sort_order !== undefined ? sort_order : state.sort_order,
          stateId
        ]
      );

      const updatedState = await queryOne(
        'SELECT * FROM prop_states WHERE id = ?',
        [stateId]
      );

      res.json({ state: updatedState });

    } catch (error) {
      console.error('[Update Prop State]', error);
      res.status(500).json({ message: '更新道具状态失败' });
    }
  });

  /**
   * DELETE /:id/states/:stateId
   * 删除道具状态
   */
  router.delete('/:id/states/:stateId', authMiddleware, async (req, res) => {
    const userId = req.user.id;
    const propId = parseInt(req.params.id);
    const stateId = parseInt(req.params.stateId);

    try {
      // 验证道具所有权
      const prop = await queryOne(
        'SELECT id FROM props WHERE id = ? AND user_id = ?',
        [propId, userId]
      );

      if (!prop) {
        return res.status(404).json({ message: '道具不存在或无权访问' });
      }

      // 验证状态存在
      const state = await queryOne(
        'SELECT id FROM prop_states WHERE id = ? AND prop_id = ?',
        [stateId, propId]
      );

      if (!state) {
        return res.status(404).json({ message: '道具状态不存在' });
      }

      await execute('DELETE FROM prop_states WHERE id = ?', [stateId]);

      res.json({ message: '道具状态已删除' });

    } catch (error) {
      console.error('[Delete Prop State]', error);
      res.status(500).json({ message: '删除道具状态失败' });
    }
  });

  /**
   * PUT /:id/states/reorder
   * 批量重排序道具状态
   */
  router.put('/:id/states/reorder', authMiddleware, async (req, res) => {
    const userId = req.user.id;
    const propId = parseInt(req.params.id);
    const { orders } = req.body;  // [{ id: number, sort_order: number }, ...]

    try {
      // 验证道具所有权
      const prop = await queryOne(
        'SELECT id FROM props WHERE id = ? AND user_id = ?',
        [propId, userId]
      );

      if (!prop) {
        return res.status(404).json({ message: '道具不存在或无权访问' });
      }

      if (!Array.isArray(orders)) {
        return res.status(400).json({ message: 'orders 必须是数组' });
      }

      // 批量更新排序
      for (const { id, sort_order } of orders) {
        await execute(
          'UPDATE prop_states SET sort_order = ? WHERE id = ? AND prop_id = ?',
          [sort_order, id, propId]
        );
      }

      res.json({ message: '排序已更新' });

    } catch (error) {
      console.error('[Reorder Prop States]', error);
      res.status(500).json({ message: '重排序失败' });
    }
  });

};
