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
      const { textModel } = req.body;

      if (!scriptId) {
        return res.status(400).json({ message: '缺少 scriptId' });
      }

      console.log(`[BatchOptimizePrompts] 用户 ${userId} 请求批量优化，scriptId=${scriptId}`);

      const result = await generationStartService.start({
        operationKey: 'batch_prompt_optimize',
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
        message: '批量提示词优化任务已启动'
      });
    } catch (error) {
      sendGenerationError(res, error);
    }
  });
};
