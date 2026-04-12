const { generationStartService, sendGenerationError } = require('../../modules/generation');
const { authMiddleware } = require('../../middleware');
const { queryOne, execute } = require('../../dbHelper');

// POST /:id/generate-views - 生成角色三视图提示词
module.exports = (router) => {
  router.post('/:id/generate-views', authMiddleware, async (req, res) => {
    const userId = req.user.id;
    const characterId = Number(req.params.id);

    try {
      const result = await generationStartService.start({
        operationKey: 'character_views_generate',
        rawInput: {
          characterId,
          ...req.body
        },
        actor: { userId }
      });

      res.json(result.response || {
        message: '三视图生成已启动',
        jobId: result.jobId,
        characterId,
        status: 'generating'
      });
    } catch (error) {
      sendGenerationError(res, error, '生成三视图失败', '[Generate Character Views]');
    }
  });

  // POST /:id/generate-concept - 生成角色概念分解图
  router.post('/:id/generate-concept', authMiddleware, async (req, res) => {
    const userId = req.user.id;
    const characterId = Number(req.params.id);

    try {
      // 查询角色现有的三视图 URL，作为参考传入
      const character = await queryOne(
        'SELECT front_view_url, side_view_url, back_view_url FROM characters WHERE id = ? AND user_id = ?',
        [characterId, userId]
      );
      if (!character) {
        return res.status(404).json({ message: '角色不存在' });
      }

      // 设置概念分解图生成状态为 generating
      await execute(
        'UPDATE characters SET concept_generation_status = ? WHERE id = ? AND user_id = ?',
        ['generating', characterId, userId]
      );

      const result = await generationStartService.start({
        operationKey: 'character_concept_breakdown',
        rawInput: {
          characterId,
          frontViewUrl: character.front_view_url || null,
          sideViewUrl: character.side_view_url || null,
          backViewUrl: character.back_view_url || null,
          ...req.body
        },
        actor: { userId }
      });

      res.json(result.response || {
        message: '概念分解图生成已启动',
        jobId: result.jobId,
        characterId,
        status: 'generating'
      });
    } catch (error) {
      sendGenerationError(res, error, '生成概念分解图失败', '[Generate Concept Breakdown]');
    }
  });

  // DELETE /:id/views/:viewType - 删除单个视图
  router.delete('/:id/views/:viewType', authMiddleware, async (req, res) => {
    const userId = req.user.id;
    const characterId = Number(req.params.id);
    const { viewType } = req.params;

    const fieldMap = {
      front: 'front_view_url',
      side: 'side_view_url',
      back: 'back_view_url'
    };

    const field = fieldMap[viewType];
    if (!field) {
      return res.status(400).json({ message: 'viewType 必须为 front / side / back' });
    }

    try {
      // 验证角色归属
      const character = await queryOne(
        'SELECT id FROM characters WHERE id = ? AND user_id = ?',
        [characterId, userId]
      );
      if (!character) {
        return res.status(404).json({ message: '角色不存在' });
      }

      // 如果删除的是正面视图且 image_url 与 front_view_url 相同，也清空 image_url
      let extraSet = '';
      if (viewType === 'front') {
        const current = await queryOne(
          'SELECT front_view_url, image_url FROM characters WHERE id = ?',
          [characterId]
        );
        if (current && current.image_url && current.image_url === current.front_view_url) {
          extraSet = ', image_url = NULL';
        }
      }

      await execute(
        `UPDATE characters SET ${field} = NULL${extraSet}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
        [characterId]
      );

      // 返回更新后的视图状态
      const updated = await queryOne(
        'SELECT front_view_url, side_view_url, back_view_url, image_url FROM characters WHERE id = ?',
        [characterId]
      );

      res.json({
        message: `${viewType} 视图已删除`,
        ...updated
      });
    } catch (error) {
      console.error('[Delete View] 删除失败:', error);
      res.status(500).json({ message: '删除视图失败' });
    }
  });

  // GET /:id/generation-status - 查询三视图生成状态
  router.get('/:id/generation-status', authMiddleware, async (req, res) => {
    const userId = req.user.id;
    const characterId = Number(req.params.id);

    try {
      const character = await queryOne(
        'SELECT generation_status, concept_generation_status, front_view_url, side_view_url, back_view_url, concept_image_url FROM characters WHERE id = ? AND user_id = ?',
        [characterId, userId]
      );

      if (!character) {
        return res.status(404).json({ message: '角色不存在' });
      }

      // 计算进度：根据已生成的视图数量
      let progress = '';
      if (character.generation_status === 'generating') {
        const viewsCount = [character.front_view_url, character.side_view_url, character.back_view_url].filter(Boolean).length;
        progress = `${viewsCount}/3`;
      }

      res.json({
        status: character.generation_status || 'idle',
        progress,
        conceptStatus: character.concept_generation_status || 'idle',
        conceptImageUrl: character.concept_image_url || null
      });
    } catch (error) {
      console.error('[Generation Status] 查询失败:', error);
      res.status(500).json({ message: '查询生成状态失败' });
    }
  });
};
