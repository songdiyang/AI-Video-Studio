const { generationStartService, sendGenerationError } = require('../../modules/generation');
const { authMiddleware } = require('../../middleware');

// POST /auto-generate/:scriptId - 根据剧本内容自动生成分镜（异步工作流）
module.exports = (router) => {
  router.post('/auto-generate/:scriptId', authMiddleware, async (req, res) => {
    const userId = req.user.id;
    const scriptId = Number(req.params.scriptId);
    const { textModel, appendMode, referenceScriptContent, referenceScriptTitle, conflictStrategy } = req.body || {};

    if (!textModel) {
      return res.status(400).json({ message: '缺少模型名称，请选择一个文本模型' });
    }

    try {
      const result = await generationStartService.start({
        operationKey: 'storyboard_generate',
        rawInput: {
          scriptId,
          textModel,
          appendMode: !!appendMode,
          ...(referenceScriptContent ? { referenceScriptContent: String(referenceScriptContent) } : {}),
          ...(referenceScriptTitle ? { referenceScriptTitle: String(referenceScriptTitle) } : {}),
          ...(conflictStrategy ? { conflictStrategy: String(conflictStrategy) } : {})
        },
        actor: { userId }
      });

      res.json(result.response || {
        message: '分镜生成已启动',
        jobId: result.jobId,
        scriptId
      });
    } catch (error) {
      sendGenerationError(res, error, '启动分镜生成失败', '[Auto Generate Storyboard]');
    }
  });
};
