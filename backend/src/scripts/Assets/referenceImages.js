/**
 * 资产参考图管理 API
 * 端点:
 * - GET /api/reference-images - 查询参考图（按asset_type和asset_id）
 * - POST /api/reference-images - 上传参考图
 * - DELETE /api/reference-images/:id - 删除参考图
 */
const { queryOne, queryAll, execute } = require('../../dbHelper');
const { authMiddleware } = require('../../middleware');

// 验证资产所有权
async function verifyAssetOwnership(assetType, assetId, userId) {
  switch (assetType) {
    case 'character': {
      const character = await queryOne(
        'SELECT id FROM characters WHERE id = ? AND user_id = ?',
        [assetId, userId]
      );
      return !!character;
    }
    case 'character_state': {
      // 需要通过character_states关联到characters验证
      const state = await queryOne(
        `SELECT cs.id FROM character_states cs
         JOIN characters c ON cs.character_id = c.id
         WHERE cs.id = ? AND c.user_id = ?`,
        [assetId, userId]
      );
      return !!state;
    }
    case 'prop': {
      const prop = await queryOne(
        'SELECT id FROM props WHERE id = ? AND user_id = ?',
        [assetId, userId]
      );
      return !!prop;
    }
    default:
      return false;
  }
}

module.exports = (router) => {
  // GET /api/reference-images - 查询参考图
  router.get('/reference-images', authMiddleware, async (req, res) => {
    const userId = req.user.id;
    const { asset_type, asset_id, enabled_only } = req.query;

    if (!asset_type || !asset_id) {
      return res.status(400).json({ message: '缺少asset_type或asset_id参数' });
    }

    const validTypes = ['character', 'character_state', 'prop'];
    if (!validTypes.includes(asset_type)) {
      return res.status(400).json({ message: '无效的asset_type' });
    }

    try {
      // 验证资产所有权
      const hasAccess = await verifyAssetOwnership(asset_type, parseInt(asset_id), userId);
      if (!hasAccess) {
        return res.status(403).json({ message: '无权访问该资产' });
      }

      // 根据 enabled_only 参数决定查询条件
      let query = 'SELECT * FROM asset_reference_images WHERE asset_type = ? AND asset_id = ?';
      const params = [asset_type, parseInt(asset_id)];
      
      if (enabled_only === 'true') {
        query += ' AND is_enabled = TRUE';
      }
      
      query += ' ORDER BY sort_order ASC, created_at ASC';

      const images = await queryAll(query, params);

      res.json({ images });
    } catch (error) {
      console.error('[Get Reference Images]', error);
      res.status(500).json({ message: '获取参考图失败' });
    }
  });

  // POST /api/reference-images - 上传参考图
  router.post('/reference-images', authMiddleware, async (req, res) => {
    const userId = req.user.id;
    const { asset_type, asset_id, image_url, description, sort_order, view_type, is_enabled } = req.body;

    if (!asset_type || !asset_id || !image_url) {
      return res.status(400).json({ message: '缺少必要参数' });
    }

    const validTypes = ['character', 'character_state', 'prop'];
    if (!validTypes.includes(asset_type)) {
      return res.status(400).json({ message: '无效的asset_type' });
    }

    // 验证 view_type
    const validViewTypes = ['front', 'side', 'back', 'other'];
    const finalViewType = view_type && validViewTypes.includes(view_type) ? view_type : 'other';
    
    // 默认启用参考图
    const finalIsEnabled = is_enabled !== undefined ? is_enabled : true;

    try {
      // 验证资产所有权
      const hasAccess = await verifyAssetOwnership(asset_type, parseInt(asset_id), userId);
      if (!hasAccess) {
        return res.status(403).json({ message: '无权访问该资产' });
      }

      // 获取当前最大排序值
      const maxOrder = await queryOne(
        'SELECT MAX(sort_order) as max_order FROM asset_reference_images WHERE asset_type = ? AND asset_id = ?',
        [asset_type, parseInt(asset_id)]
      );
      const newSortOrder = sort_order !== undefined ? sort_order : (maxOrder?.max_order || 0) + 1;

      const result = await execute(
        `INSERT INTO asset_reference_images (asset_type, asset_id, image_url, description, view_type, sort_order, is_enabled)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [asset_type, parseInt(asset_id), image_url, description || null, finalViewType, newSortOrder, finalIsEnabled]
      );

      const image = await queryOne('SELECT * FROM asset_reference_images WHERE id = ?', [result.insertId]);
      res.status(201).json({ message: '参考图添加成功', image });
    } catch (error) {
      console.error('[Create Reference Image]', error);
      res.status(500).json({ message: '添加参考图失败' });
    }
  });

  // PUT /api/reference-images/:id - 更新参考图
  router.put('/reference-images/:id', authMiddleware, async (req, res) => {
    const userId = req.user.id;
    const { id } = req.params;
    const { image_url, description, sort_order, view_type, is_enabled } = req.body;

    try {
      // 获取参考图信息
      const existingImage = await queryOne(
        'SELECT * FROM asset_reference_images WHERE id = ?',
        [id]
      );

      if (!existingImage) {
        return res.status(404).json({ message: '参考图不存在' });
      }

      // 验证资产所有权
      const hasAccess = await verifyAssetOwnership(
        existingImage.asset_type,
        existingImage.asset_id,
        userId
      );
      if (!hasAccess) {
        return res.status(403).json({ message: '无权访问该资产' });
      }

      // 验证 view_type
      const validViewTypes = ['front', 'side', 'back', 'other'];
      const finalViewType = view_type !== undefined 
        ? (validViewTypes.includes(view_type) ? view_type : existingImage.view_type)
        : existingImage.view_type;

      await execute(
        `UPDATE asset_reference_images 
         SET image_url = ?, description = ?, view_type = ?, sort_order = ?, is_enabled = ?
         WHERE id = ?`,
        [
          image_url !== undefined ? image_url : existingImage.image_url,
          description !== undefined ? description : existingImage.description,
          finalViewType,
          sort_order !== undefined ? sort_order : existingImage.sort_order,
          is_enabled !== undefined ? is_enabled : existingImage.is_enabled,
          id
        ]
      );

      const image = await queryOne('SELECT * FROM asset_reference_images WHERE id = ?', [id]);
      res.json({ message: '参考图更新成功', image });
    } catch (error) {
      console.error('[Update Reference Image]', error);
      res.status(500).json({ message: '更新参考图失败' });
    }
  });

  // DELETE /api/reference-images/:id - 删除参考图
  router.delete('/reference-images/:id', authMiddleware, async (req, res) => {
    const userId = req.user.id;
    const { id } = req.params;

    try {
      // 获取参考图信息
      const existingImage = await queryOne(
        'SELECT * FROM asset_reference_images WHERE id = ?',
        [id]
      );

      if (!existingImage) {
        return res.status(404).json({ message: '参考图不存在' });
      }

      // 验证资产所有权
      const hasAccess = await verifyAssetOwnership(
        existingImage.asset_type,
        existingImage.asset_id,
        userId
      );
      if (!hasAccess) {
        return res.status(403).json({ message: '无权访问该资产' });
      }

      await execute('DELETE FROM asset_reference_images WHERE id = ?', [id]);
      res.json({ message: '参考图删除成功' });
    } catch (error) {
      console.error('[Delete Reference Image]', error);
      res.status(500).json({ message: '删除参考图失败' });
    }
  });

  // PUT /api/reference-images/batch-reorder - 批量重排序
  router.put('/reference-images/batch-reorder', authMiddleware, async (req, res) => {
    const userId = req.user.id;
    const { orders } = req.body; // [{ id: number, sort_order: number }, ...]

    if (!orders || !Array.isArray(orders) || orders.length === 0) {
      return res.status(400).json({ message: '缺少排序数据' });
    }

    try {
      // 验证所有参考图的所有权
      for (const item of orders) {
        const existingImage = await queryOne(
          'SELECT * FROM asset_reference_images WHERE id = ?',
          [item.id]
        );
        if (!existingImage) {
          continue;
        }
        const hasAccess = await verifyAssetOwnership(
          existingImage.asset_type,
          existingImage.asset_id,
          userId
        );
        if (!hasAccess) {
          return res.status(403).json({ message: '无权访问某些资产' });
        }
      }

      // 批量更新排序
      for (const item of orders) {
        await execute(
          'UPDATE asset_reference_images SET sort_order = ? WHERE id = ?',
          [item.sort_order, item.id]
        );
      }

      res.json({ message: '排序更新成功' });
    } catch (error) {
      console.error('[Batch Reorder Reference Images]', error);
      res.status(500).json({ message: '更新排序失败' });
    }
  });
};
