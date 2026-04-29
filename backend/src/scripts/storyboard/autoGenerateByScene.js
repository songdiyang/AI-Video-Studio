/**
 * 批量分镜生成 API
 * 将剧本解析为多个场景，创建单一整合任务进行处理
 * 
 * 特点：
 * - 用户界面只显示一个统一任务
 * - 后台按场景分割顺序处理
 * - 统一进度反馈
 * - 结果一次性保存
 * 
 * POST /auto-generate-by-scene/:scriptId
 */

const { generationStartService, sendGenerationError } = require('../../modules/generation');
const { authMiddleware } = require('../../middleware');
const { parseScriptScenes } = require('../../utils/parseScriptScenes');
const { queryOne } = require('../../dbHelper');

module.exports = (router) => {
  /**
   * 批量分镜生成（整合版）
   * 解析剧本中的各个场景，创建单一工作流任务处理所有场景
   */
  router.post('/auto-generate-by-scene/:scriptId', authMiddleware, async (req, res) => {
    const userId = req.user.id;
    const scriptId = Number(req.params.scriptId);
    const { textModel, clearExisting = true, appendMode, referenceScriptContent, referenceScriptTitle, conflictStrategy } = req.body || {};

    if (!textModel) {
      return res.status(400).json({ message: '缺少模型名称，请选择一个文本模型' });
    }

    try {
      const result = await generationStartService.start({
        operationKey: 'batch_storyboard_generate',
        rawInput: {
          scriptId,
          textModel,
          clearExisting: appendMode ? false : clearExisting,
          appendMode: !!appendMode,
          ...(referenceScriptContent ? { referenceScriptContent: String(referenceScriptContent) } : {}),
          ...(referenceScriptTitle ? { referenceScriptTitle: String(referenceScriptTitle) } : {}),
          ...(conflictStrategy ? { conflictStrategy: String(conflictStrategy) } : {})
        },
        actor: { userId }
      });

      console.log(`[BatchStoryboard] 任务已创建: jobId=${result.jobId}`);

      res.json(result.response || {
        message: `已启动分镜生成（共 ${result.command.inputs.totalScenes} 个场景）`,
        scriptId,
        totalScenes: result.command.inputs.totalScenes,
        jobId: result.jobId
      });
    } catch (error) {
      sendGenerationError(res, error, '启动分镜生成失败', '[BatchStoryboard]');
    }
  });

  /**
   * 获取场景解析预览（不启动任务，只返回场景列表）
   */
  router.get('/preview-scenes/:scriptId', authMiddleware, async (req, res) => {
    const userId = req.user.id;
    const scriptId = Number(req.params.scriptId);

    try {
      const script = await queryOne(
        'SELECT * FROM scripts WHERE id = ? AND user_id = ?',
        [scriptId, userId]
      );

      if (!script) {
        return res.status(404).json({ message: '剧本不存在' });
      }

      if (!script.content || script.content.trim() === '') {
        return res.status(400).json({ message: '剧本内容为空' });
      }

      const scenes = parseScriptScenes(script.content);

      res.json({
        scriptId,
        totalScenes: scenes.length,
        scenes: scenes.map(s => ({
          sceneNumber: s.sceneNumber,
          sceneName: s.sceneName,
          contentLength: s.content.length,
          preview: s.content.substring(0, 200) + (s.content.length > 200 ? '...' : '')
        }))
      });
    } catch (error) {
      console.error('[PreviewScenes]', error);
      res.status(500).json({ message: '解析场景失败: ' + error.message });
    }
  });
};
