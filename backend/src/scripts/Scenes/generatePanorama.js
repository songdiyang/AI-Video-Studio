/**
 * 场景全景图生成 & 删除路由
 * POST   /api/scenes/:id/generate-panorama - 生成 360°×180° 等距柱状全景图
 * DELETE /api/scenes/:id/panorama          - 清空全景图 URL（让用户可重新生成）
 */
const { generationStartService, sendGenerationError } = require('../../modules/generation');
const { authMiddleware } = require('../../middleware');
const { queryOne, execute } = require('../../dbHelper');

module.exports = (router) => {
  // POST /:id/generate-panorama
  router.post('/:id/generate-panorama', authMiddleware, async (req, res) => {
    const userId = req.user.id;
    const sceneId = Number(req.params.id);

    try {
      const result = await generationStartService.start({
        operationKey: 'scene_panorama_generate',
        rawInput: {
          sceneId,
          ...req.body
        },
        actor: { userId }
      });

      res.json(result.response || {
        message: '场景全景图生成已启动',
        jobId: result.jobId,
        sceneId,
        status: 'generating'
      });
    } catch (error) {
      sendGenerationError(res, error, '生成场景全景图失败', '[Generate Scene Panorama]');
    }
  });

  // DELETE /:id/panorama
  router.delete('/:id/panorama', authMiddleware, async (req, res) => {
    const userId = req.user.id;
    const sceneId = Number(req.params.id);

    try {
      const scene = await queryOne(
        'SELECT id FROM scenes WHERE id = ? AND user_id = ?',
        [sceneId, userId]
      );
      if (!scene) {
        return res.status(404).json({ message: '场景不存在或无权访问' });
      }

      await execute(
        'UPDATE scenes SET panorama_image_url = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
        [sceneId]
      );

      res.json({ message: '场景全景图已清除' });
    } catch (error) {
      console.error('[Delete Scene Panorama]', error);
      res.status(500).json({ message: '清除场景全景图失败' });
    }
  });
};
