/**
 * 道具图片生成 API
 * 
 * POST /:id/generate-image - 启动道具图片生成工作流
 * GET /:id/generation-status - 查询道具生成状态
 */

const { authMiddleware } = require('../../middleware');
const { queryOne, execute } = require('../../dbHelper');
const { WorkflowStarter } = require('../../nosyntask/engine');

module.exports = function(router) {

  /**
   * POST /:id/generate-image
   * 启动道具图片生成工作流
   * 
   * Body: {
   *   imageModel: string (必需) - 图像生成模型
   *   textModel?: string - 文本模型（用于生成提示词）
   *   styleConfig?: object - 样式配置
   * }
   */
  router.post('/:id/generate-image', authMiddleware, async (req, res) => {
    const userId = req.user.id;
    const propId = parseInt(req.params.id);
    const { imageModel, textModel, styleConfig } = req.body;

    try {
      // 验证道具所有权
      const prop = await queryOne(
        'SELECT * FROM props WHERE id = ? AND user_id = ?',
        [propId, userId]
      );

      if (!prop) {
        return res.status(404).json({ message: '道具不存在或无权访问' });
      }

      // 验证必需参数
      if (!imageModel) {
        return res.status(400).json({ message: 'imageModel 参数是必需的' });
      }

      // 更新状态为生成中
      await execute(
        'UPDATE props SET generation_status = ? WHERE id = ?',
        ['generating', propId]
      );

      // 启动工作流
      const workflowStarter = new WorkflowStarter();
      const { jobId } = await workflowStarter.start({
        userId,
        workflowType: 'prop_image_generation',
        projectId: prop.project_id,
        targetType: 'prop',
        targetId: propId,
        params: {
          propId,
          propName: prop.name,
          propDescription: prop.description || '',
          propCategory: prop.category || '',
          propStyleConfig: styleConfig || prop.style_config || {},
          imageModel,
          textModel: textModel || 'deepseek-chat',  // 默认文本模型
          aspectRatio: '1:1'  // 道具图默认正方形
        }
      });

      res.json({
        message: '道具图片生成已启动',
        jobId,
        propId,
        status: 'generating'
      });

    } catch (error) {
      console.error('[Prop Generate Image]', error);
      
      // 失败时重置状态
      await execute(
        'UPDATE props SET generation_status = ? WHERE id = ?',
        ['failed', propId]
      ).catch(() => {});
      
      res.status(500).json({ message: '启动道具图片生成失败: ' + error.message });
    }
  });

  /**
   * GET /:id/generation-status
   * 查询道具生成状态
   */
  router.get('/:id/generation-status', authMiddleware, async (req, res) => {
    const userId = req.user.id;
    const propId = parseInt(req.params.id);

    try {
      const prop = await queryOne(
        `SELECT id, generation_status, image_url, generation_prompt 
         FROM props 
         WHERE id = ? AND user_id = ?`,
        [propId, userId]
      );

      if (!prop) {
        return res.status(404).json({ message: '道具不存在或无权访问' });
      }

      // 查询最新的工作流任务状态
      const latestJob = await queryOne(
        `SELECT id, status, current_step_index, error_message 
         FROM workflow_jobs 
         WHERE user_id = ? AND target_type = 'prop' AND target_id = ?
         ORDER BY created_at DESC 
         LIMIT 1`,
        [userId, propId]
      );

      res.json({
        status: prop.generation_status || 'idle',
        imageUrl: prop.image_url,
        prompt: prop.generation_prompt,
        job: latestJob ? {
          jobId: latestJob.id,
          status: latestJob.status,
          currentStep: latestJob.current_step_index,
          error: latestJob.error_message
        } : null
      });

    } catch (error) {
      console.error('[Prop Generation Status]', error);
      res.status(500).json({ message: '查询道具生成状态失败' });
    }
  });

  /**
   * PUT /:id/style-config
   * 更新道具样式配置
   */
  router.put('/:id/style-config', authMiddleware, async (req, res) => {
    const userId = req.user.id;
    const propId = parseInt(req.params.id);
    const { styleConfig } = req.body;

    try {
      const prop = await queryOne(
        'SELECT id FROM props WHERE id = ? AND user_id = ?',
        [propId, userId]
      );

      if (!prop) {
        return res.status(404).json({ message: '道具不存在或无权访问' });
      }

      await execute(
        'UPDATE props SET style_config = ? WHERE id = ?',
        [JSON.stringify(styleConfig), propId]
      );

      res.json({ 
        message: '样式配置已更新',
        styleConfig 
      });

    } catch (error) {
      console.error('[Update Prop Style Config]', error);
      res.status(500).json({ message: '更新样式配置失败' });
    }
  });

};
