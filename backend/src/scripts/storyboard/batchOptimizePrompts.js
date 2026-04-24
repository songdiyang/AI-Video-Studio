/**
 * POST /batch-optimize-prompts/:scriptId
 * 一键优化全部分镜提示词（持久化工作流任务）
 */

const { authMiddleware } = require('../../middleware');
const { generationStartService, sendGenerationError } = require('../../modules/generation');

module.exports = (router) => {
  router.post('/batch-optimize-prompts/:scriptId', authMiddleware, async (req, res) => {
    try {
      const userId = req.user.id;
      const scriptId = Number(req.params.scriptId);
      const { textModel, targetType } = req.body;

      if (!scriptId) {
        return res.status(400).json({ message: '缺少 scriptId' });
      }

      // 根据 targetType 选择工作流类型，默认使用原有工作流保持向后兼容
      const operationKey = targetType === 'video'
        ? 'batch_video_prompt_optimize'
        : 'batch_prompt_optimize';

      console.log(`[BatchOptimizePrompts] 用户 ${userId} 请求批量优化，scriptId=${scriptId}, targetType=${targetType || 'default'}`);

      const result = await generationStartService.start({
        operationKey,
        rawInput: {
          scriptId,
          textModel: textModel || null
        },
        actor: { userId }
      });

      res.json(result.response || {
        success: true,
        jobId: result.jobId,
        tasks: result.tasks,
        message: targetType === 'video'
          ? '批量视频提示词优化任务已启动'
          : '批量提示词优化任务已启动'
      });
    } catch (error) {
      sendGenerationError(res, error);
    }
  });
};
