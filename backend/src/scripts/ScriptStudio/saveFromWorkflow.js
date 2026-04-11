/**
 * POST /api/scripts/save-from-workflow
 * 保存工作流生成的剧本到 scripts 表
 */

const { queryOne, execute } = require('../../dbHelper');

/**
 * 安全解析 result_data（可能是 JSON 字符串或已解析对象）
 */
function parseResultData(raw) {
  if (!raw) return null;
  if (typeof raw === 'object') return raw;
  try { return JSON.parse(raw); } catch { return null; }
}

async function saveFromWorkflow(req, res) {
  const { scriptId, jobId } = req.body;
  const userId = req.user.id;

  console.log('[Save Script from Workflow] 开始处理:', { scriptId, jobId, userId });

  if (!scriptId || !jobId) {
    return res.status(400).json({ message: '缺少必要参数 scriptId 或 jobId' });
  }

  try {
    // 验证 scriptId 归属
    const script = await queryOne(
      'SELECT id, project_id, episode_number, status FROM scripts WHERE id = ? AND user_id = ?',
      [scriptId, userId]
    );
    
    if (!script) {
      console.warn('[Save Script from Workflow] 剧本不存在或无权:', { scriptId, userId });
      return res.status(404).json({ message: '剧本不存在或无权访问' });
    }

    // 如果剧本已经是 completed 状态，直接返回成功（幂等处理）
    if (script.status === 'completed') {
      console.log('[Save Script from Workflow] 剧本已完成，跳过重复保存:', scriptId);
      return res.json({
        success: true,
        scriptId,
        episodeNumber: script.episode_number,
        message: '剧本已保存'
      });
    }

    // 获取工作流任务结果 - 主查询：按 jobId + task_type
    let task = await queryOne(
      `SELECT result_data, status FROM generation_tasks 
       WHERE job_id = ? AND task_type = 'script_generation' 
       ORDER BY id DESC LIMIT 1`,
      [jobId]
    );

    // 备用查询1：如果主查询未命中，尝试只按 jobId 查询（可能 task_type 不匹配）
    if (!task) {
      console.warn('[Save Script from Workflow] 主查询未命中，尝试备用查询 (仅 jobId):', jobId);
      task = await queryOne(
        `SELECT result_data, status, task_type FROM generation_tasks 
         WHERE job_id = ? AND status = 'completed'
         ORDER BY id DESC LIMIT 1`,
        [jobId]
      );
      if (task) {
        console.log('[Save Script from Workflow] 备用查询1命中，task_type:', task.task_type);
      }
    }

    // 备用查询2：如果 jobId 完全无匹配，尝试通过项目找最近完成的剧本生成任务
    if (!task) {
      console.warn('[Save Script from Workflow] jobId 完全无匹配，尝试通过项目查找最近任务');
      task = await queryOne(
        `SELECT gt.result_data, gt.status FROM generation_tasks gt
         INNER JOIN workflow_jobs wj ON wj.id = gt.job_id
         WHERE wj.project_id = ? AND wj.workflow_type = 'script_only' 
           AND gt.task_type = 'script_generation' AND gt.status = 'completed'
         ORDER BY gt.id DESC LIMIT 1`,
        [script.project_id]
      );
      if (task) {
        console.log('[Save Script from Workflow] 备用查询2命中（通过项目ID）');
      }
    }

    if (!task) {
      console.error('[Save Script from Workflow] 所有查询均未找到任务:', { jobId, scriptId, projectId: script.project_id });
      return res.status(400).json({ 
        message: '未找到工作流生成结果，请重新生成剧本',
        detail: `jobId=${jobId} 未找到已完成的生成任务`
      });
    }

    if (task.status !== 'completed') {
      console.warn('[Save Script from Workflow] 任务未完成:', { jobId, status: task.status });
      return res.status(400).json({ 
        message: `工作流任务状态为 ${task.status}，尚未完成`,
        detail: `当前状态: ${task.status}`
      });
    }

    const result = parseResultData(task.result_data);
    if (!result || !result.content) {
      console.error('[Save Script from Workflow] result_data 解析失败或无 content:', { 
        jobId, hasResultData: !!task.result_data, type: typeof task.result_data 
      });
      return res.status(400).json({ 
        message: '生成结果数据异常，缺少剧本内容',
        detail: 'result_data 解析失败或 content 为空'
      });
    }

    const content = result.content;
    const tokens = result.tokens || 0;
    const provider = result.provider || 'unknown';

    // 更新剧本内容和状态
    await execute(
      'UPDATE scripts SET content = ?, model_provider = ?, token_used = ?, status = ?, updated_at = NOW() WHERE id = ?', 
      [content, provider, tokens, 'completed', scriptId]
    );

    console.log('[Save Script from Workflow] 保存成功:', { scriptId, tokens, provider });

    res.json({
      success: true,
      scriptId,
      episodeNumber: script.episode_number,
      message: '剧本保存成功'
    });
  } catch (error) {
    console.error('[Save Script from Workflow] 异常:', error);
    
    // 保存失败时，将剧本状态重置为 draft（避免永远卡在 generating）
    try {
      await execute(
        'UPDATE scripts SET status = ? WHERE id = ? AND status = ?',
        ['draft', scriptId, 'generating']
      );
      console.log('[Save Script from Workflow] 已将剧本状态重置为 draft:', scriptId);
    } catch (resetErr) {
      console.error('[Save Script from Workflow] 重置状态失败:', resetErr.message);
    }

    res.status(500).json({ message: '保存失败：' + error.message });
  }
}

module.exports = saveFromWorkflow;
