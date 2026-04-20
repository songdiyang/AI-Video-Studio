/**
 * 分镜描述优化 API
 * POST /api/storyboards/:storyboardId/optimize-prompt
 * 
 * 启动工作流任务，优化结果通过工作流引擎返回
 */

const { authMiddleware } = require('../../middleware');
const { generationStartService, sendGenerationError } = require('../../modules/generation');

module.exports = (router) => {
  router.post('/:storyboardId/optimize-prompt', authMiddleware, async (req, res) => {
    try {
      const userId = req.user.id;
      const { storyboardId } = req.params;
      const { prompt, textModel } = req.body;

      if (!prompt || !prompt.trim()) {
        return res.status(400).json({ message: '输入内容不能为空' });
      }

      const result = await generationStartService.start({
        operationKey: 'single_prompt_optimize',
        rawInput: {
          storyboardId: Number(storyboardId),
          prompt,
          textModel: textModel || null
        },
        actor: { userId }
      });

      res.json(result.response || {
        success: true,
        jobId: result.jobId,
        tasks: result.tasks,
        message: 'AI 优化任务已启动'
      });
    } catch (error) {
      sendGenerationError(res, error);
    }
  });
};
