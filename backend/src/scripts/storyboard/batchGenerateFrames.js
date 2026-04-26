/**
 * POST /batch-generate-frames/:scriptId
 * 一键生成一集所有分镜的首帧/首尾帧图片
 * 
 * 优化：每个分镜作为独立任务显示在任务栏中
 */

const { authMiddleware } = require('../../middleware');
const { generationStartService, sendGenerationError } = require('../../modules/generation');
const { queryAll, queryOne, execute } = require('../../dbHelper');
const { requireVisualStyle } = require('../../utils/getProjectStyle');

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

      // 1. 获取项目信息
      const scriptInfo = await queryOne(
        'SELECT project_id FROM scripts WHERE id = ?',
        [scriptId]
      );
      if (!scriptInfo || !scriptInfo.project_id) {
        return res.status(400).json({ message: '无法获取剧本所属项目信息' });
      }
      const projectId = scriptInfo.project_id;

      // 2. 查询分镜列表（含锁定状态，用于跳过）
      let whereClause = 'script_id = ?';
      const whereParams = [scriptId];
      
      // 如果有 validSceneIds，只处理指定的分镜
      if (Array.isArray(validSceneIds) && validSceneIds.length > 0) {
        whereClause += ` AND id IN (${validSceneIds.map(() => '?').join(',')})`;
        whereParams.push(...validSceneIds);
      }

      const storyboards = await queryAll(
        `SELECT id, idx, prompt_template, variables_json, first_frame_url, last_frame_url, is_locked 
         FROM storyboards WHERE ${whereClause} ORDER BY idx ASC`,
        whereParams
      );

      if (!storyboards || storyboards.length === 0) {
        return res.status(400).json({ message: '没有需要生成的分镜' });
      }

      // 3. 覆盖模式：清除已有帧（跳过锁定分镜）
      if (overwriteFrames) {
        console.log('[BatchGenerateFrames] 覆盖模式：清除未锁定分镜的首尾帧...');
        await execute(
          `UPDATE storyboards SET first_frame_url = NULL, last_frame_url = NULL, updated_scene_url = NULL WHERE ${whereClause} AND is_locked = FALSE`,
          whereParams
        );
      }

      // 4. 过滤需要生成的分镜（跳过锁定分镜）
      const storyboardItems = [];
      let lockedSkipped = 0;
      for (const sb of storyboards) {
        // 锁定分镜跳过
        if (sb.is_locked) {
          lockedSkipped++;
          console.log(`[BatchGenerateFrames] 分镜 ${sb.idx} (id=${sb.id}) 已锁定，跳过`);
          continue;
        }
        const vars = typeof sb.variables_json === 'string'
          ? JSON.parse(sb.variables_json || '{}')
          : (sb.variables_json || {});
        const hasAction = vars.hasAction || false;
        const hasFirstFrame = !!sb.first_frame_url;
        const hasLastFrame = !!sb.last_frame_url;
        
        // 判断是否需要生成
        const isComplete = hasAction 
          ? (hasFirstFrame && hasLastFrame)
          : hasFirstFrame;
        
        if (overwriteFrames || !isComplete) {
          storyboardItems.push({
            id: sb.id,
            idx: sb.idx,
            description: sb.prompt_template || '',
            hasAction,
            endState: vars.endState || null
          });
        }
      }

      if (storyboardItems.length === 0) {
        return res.json({
          success: true,
          message: '所有分镜已有帧图片，无需生成',
          skipped: storyboards.length
        });
      }

      // 5. 预取视觉风格
      let visualStyle = null;
      try {
        visualStyle = await requireVisualStyle(projectId);
      } catch (e) {
        console.warn('[BatchGenerateFrames] 获取视觉风格失败:', e.message);
      }

      console.log(`[BatchGenerateFrames] 准备生成 ${storyboardItems.length} 个分镜帧`);

      // 6. 启动工作流，传递分镜列表
      const result = await generationStartService.start({
        operationKey: 'batch_frame_generate',
        rawInput: {
          scriptId,
          projectId,
          imageModel,
          textModel,
          overwriteFrames: !!overwriteFrames,
          aspectRatio: aspectRatio || null,
          resolution: resolution || null,
          visualStyle,
          storyboardItems // 传递分镜列表，启用动态步骤模式
        },
        actor: { userId }
      });
      const { jobId, tasks } = result;

      res.json(result.response || {
        success: true,
        jobId,
        tasks,
        totalScenes: storyboardItems.length,
        lockedSkipped,
        message: `批量帧生成任务已启动，共 ${storyboardItems.length} 个分镜${lockedSkipped > 0 ? `（已跳过 ${lockedSkipped} 个锁定分镜）` : ''}`
      });
    } catch (error) {
      sendGenerationError(res, error, '启动批量生成失败', '[BatchGenerateFrames]');
    }
  });
};
