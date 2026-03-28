/**
 * POST /batch-generate-frames/:scriptId
 * 一键生成一集所有分镜的首帧/首尾帧图片
 */

const { authMiddleware } = require('../../middleware');
const { generationStartService, sendGenerationError } = require('../../modules/generation');

module.exports = (router) => {
  router.post('/batch-generate-frames/:scriptId', authMiddleware, async (req, res) => {
    try {
      const userId = req.user.id;
      const scriptId = Number(req.params.scriptId);
      const { imageModel, textModel, overwriteFrames = false, aspectRatio, resolution, validSceneIds } = req.body;

      if (!scriptId) {
        return res.status(400).json({ message: '缺少 scriptId' });
      }
      if (!imageModel) {
        return res.status(400).json({ message: '缺少 imageModel（图片模型）' });
      }

      console.log(`[BatchGenerateFrames] 用户 ${userId} 请求批量生成，scriptId=${scriptId}, 覆盖=${overwriteFrames}`);

      const result = await generationStartService.start({
        operationKey: 'batch_frame_generate',
        rawInput: {
          scriptId,
          imageModel,
          textModel,
          overwriteFrames: !!overwriteFrames,
          aspectRatio: aspectRatio || null,
          resolution: resolution || null,
          validSceneIds: Array.isArray(validSceneIds) && validSceneIds.length > 0 ? validSceneIds : undefined
        },
        actor: { userId }
      });
      const { jobId, tasks } = result;

      res.json(result.response || {
        success: true,
        jobId,
        tasks,
        message: '批量帧生成任务已启动'
      });
    } catch (error) {
      sendGenerationError(res, error, '启动批量生成失败', '[BatchGenerateFrames]');
    }
  });
};
