/**
 * 工作流任务 API 路由
 * 
 * 前端只需要：
 * 1. POST /api/workflows       - 启动工作流
 * 2. GET  /api/workflows/:jobId - 轮询工作流状态（含所有子任务）
 * 3. POST /api/workflows/:jobId/resume  - 恢复失败的工作流
 * 4. POST /api/workflows/:jobId/cancel  - 取消工作流
 * 5. GET  /api/workflows        - 获取用户的工作流列表
 * 6. GET  /api/workflows/types   - 获取可用的工作流类型
 */

const express = require('express');
const { authMiddleware, requireAdmin } = require('../middleware');
const { getAvailableWorkflows } = require('./definitions');
const {
  generationStartService,
  generationQueryService,
  getOperationContractByWorkflowType,
  sendGenerationError
} = require('../modules/generation');
const engine = require('./engine/index');
const { generateWorkflowETag, matchesETag } = require('../utils/etag');
const { getRateLimitStats } = require('./utils/aiRateLimiter');
const pollManager = require('./utils/PollManager');
const { encodeId, decodeId, safeDecodeId, encodeJobIds } = require('../utils/workflowId');

const router = express.Router();

/**
 * 获取可用的工作流类型
 */
router.get('/types', authMiddleware, (req, res) => {
  try {
    const workflows = getAvailableWorkflows();
    res.json({ workflows });
  } catch (error) {
    console.error('[Workflow Types]', error);
    res.status(500).json({ message: '获取工作流类型失败' });
  }
});

/**
 * 获取用户的工作流列表
 */
router.get('/', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;
    const { projectId, workflowType, status, limit } = req.query;

    const jobs = await generationQueryService.getUserJobs(userId, {
      projectId: projectId ? parseInt(projectId) : undefined,
      workflowType,
      status,
      limit: limit ? parseInt(limit) : undefined
    });

    // 转换ID为16进制
    const encodedJobs = jobs.map(job => ({
      ...job,
      id: encodeId(job.id)
    }));

    res.json({ jobs: encodedJobs });
  } catch (error) {
    console.error('[Get Workflows]', error);
    res.status(500).json({ message: error.message || '获取工作流列表失败' });
  }
});

/**
 * 启动工作流
 * 
 * Body: {
 *   workflowType: 'script_only' | 'script_and_characters' | 'comic_generation',
 *   projectId: number,
 *   params: { title, description, style, length, modelName, ... }
 * }
 */
router.post('/', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;
    const { workflowType, projectId, params } = req.body;

    if (!workflowType) {
      return res.status(400).json({ message: '缺少 workflowType' });
    }
    if (
      projectId !== undefined &&
      projectId !== null &&
      (!Number.isInteger(Number(projectId)) || Number(projectId) <= 0)
    ) {
      return res.status(400).json({ message: 'projectId 必须为正整数' });
    }
    const contract = getOperationContractByWorkflowType(workflowType);
    const rawInput = {
      ...(params || {}),
      ...(projectId ? { projectId: Number(projectId) } : {})
    };
    const result = await generationStartService.start({
      operationKey: contract?.operationKey || null,
      workflowType,
      rawInput,
      actor: { userId }
    });

    res.json({
      jobId: encodeId(result.jobId),
      tasks: result.tasks.map(t => ({
        ...t,
        id: encodeId(t.id)
      })),
      message: '工作流已启动'
    });
  } catch (error) {
    sendGenerationError(res, error, '启动工作流失败', '[Start Workflow]');
  }
});

/**
 * 查询项目的活跃（未消费）工作流
 */
router.get('/active', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;
    const { projectId } = req.query;
    if (!projectId) {
      return res.status(400).json({ message: '缺少 projectId' });
    }
    const jobs = await generationQueryService.listActive({
      userId,
      projectId: parseInt(projectId)
    });

    // 转换ID为16进制
    const encodedJobs = jobs.map(job => ({
      ...job,
      id: encodeId(job.id)
    }));

    res.json({ jobs: encodedJobs });
  } catch (error) {
    console.error('[Active Workflows]', error);
    res.status(500).json({ message: error.message || '查询活跃工作流失败' });
  }
});

/**
 * 管理员接口 - 获取所有用户的失败工作流
 */
router.get('/admin/errors', authMiddleware, requireAdmin, async (req, res) => {
  try {
    const { page = 1, limit = 20, workflowType, search } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);
    const { execute } = require('../dbHelper');

    let where = "WHERE wj.status = 'failed'";
    const params = [];
    if (workflowType) {
      where += ' AND wj.workflow_type = ?';
      params.push(workflowType);
    }
    if (search && String(search).trim()) {
      const keyword = `%${String(search).trim()}%`;
      where += ' AND (wj.error_message LIKE ? OR wj.workflow_type LIKE ? OR u.email LIKE ?)';
      params.push(keyword, keyword, keyword);
    }

    const countSql = `SELECT COUNT(*) as total FROM workflow_jobs wj LEFT JOIN users u ON u.id = wj.user_id ${where}`;
    const countResult = await execute(countSql, params);
    const total = countResult[0].total;

    const dataSql = `
      SELECT wj.id, wj.user_id, u.email as user_email, wj.workflow_type, wj.status,
             wj.error_message, wj.input_params, wj.created_at, wj.updated_at, wj.admin_resolved
      FROM workflow_jobs wj
      LEFT JOIN users u ON u.id = wj.user_id
      ${where}
      ORDER BY wj.created_at DESC
      LIMIT ? OFFSET ?
    `;
    const dataParams = [...params, parseInt(limit), offset];
    const jobs = await execute(dataSql, dataParams);

    // 转换ID为16进制
    const encodedJobs = jobs.map(job => ({
      ...job,
      id: encodeId(job.id)
    }));

    res.json({
      jobs: encodedJobs,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        totalPages: Math.ceil(total / parseInt(limit))
      }
    });
  } catch (error) {
    console.error('[Admin Error Monitor]', error);
    res.status(500).json({ message: error.message || '获取错误任务失败' });
  }
});

/**
 * 管理员接口 - 更新任务处理状态
 */
router.patch('/admin/errors/:jobId/status', authMiddleware, requireAdmin, async (req, res) => {
  try {
    const { jobId } = req.params;
    const { admin_resolved } = req.body;
    const numericJobId = decodeId(jobId);
    const { execute } = require('../dbHelper');
    
    if (typeof admin_resolved !== 'number' && typeof admin_resolved !== 'boolean') {
      return res.status(400).json({ message: '无效的状态值' });
    }
    
    await execute(
      'UPDATE workflow_jobs SET admin_resolved = ? WHERE id = ?',
      [admin_resolved ? 1 : 0, numericJobId]
    );
    
    res.json({ success: true, message: admin_resolved ? '已标记为已处理' : '已标记为待处理' });
  } catch (error) {
    console.error('[Admin Update Error Status]', error);
    res.status(500).json({ message: error.message || '更新状态失败' });
  }
});

/**
 * 批量标记失败/已取消的任务为已消费（一键清除错误信息）
 * 仅标记 is_consumed=1，不删除数据库记录
 */
router.post('/batch-consume-failed', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;
    const { execute } = require('../dbHelper');
    const [result] = await execute(
      `UPDATE workflow_jobs SET is_consumed = 1 
       WHERE user_id = ? AND status IN ('failed', 'cancelled') AND is_consumed = 0`,
      [userId]
    );
    const count = result?.affectedRows || 0;
    console.log(`[BatchConsumeFailed] 用户 ${userId} 清除了 ${count} 个失败任务`);
    res.json({ success: true, consumed: count });
  } catch (error) {
    console.error('[BatchConsumeFailed]', error);
    res.status(500).json({ message: error.message || '批量清除失败' });
  }
});

/**
 * 标记工作流已消费
 */
router.post('/:jobId/consume', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;
    const { jobId } = req.params;
    const numericJobId = decodeId(jobId);
    const { execute } = require('../dbHelper');
    await execute(
      'UPDATE workflow_jobs SET is_consumed = 1 WHERE id = ? AND user_id = ?',
      [numericJobId, userId]
    );
    res.json({ success: true });
  } catch (error) {
    console.error('[Consume Workflow]', error);
    res.status(500).json({ message: error.message || '标记消费失败' });
  }
});

/**
 * 获取工作流状态（含所有子任务详情）
 * 支持 ETag 缓存，减少数据传输
 */
router.get('/:jobId', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;
    const { jobId } = req.params;
    const numericJobId = decodeId(jobId);

    const job = await generationQueryService.getJob(numericJobId);

    // 验证所有权
    if (job.user_id !== userId) {
      return res.status(403).json({ message: '无权访问此工作流' });
    }

    // 生成 ETag
    const etag = generateWorkflowETag(job);
    res.set('ETag', etag);
    res.set('Cache-Control', 'private, must-revalidate');

    // 检查 If-None-Match，如果匹配则返回 304
    const ifNoneMatch = req.get('If-None-Match');
    if (ifNoneMatch && matchesETag(ifNoneMatch, etag)) {
      return res.status(304).end();
    }

    // 转换ID为16进制后返回
    res.json(encodeJobIds(job));
  } catch (error) {
    console.error('[Get Workflow Status]', error);
    res.status(500).json({ message: error.message || '获取工作流状态失败' });
  }
});

/**
 * 恢复失败的工作流（断点续传）
 */
router.post('/:jobId/resume', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;
    const { jobId } = req.params;
    const numericJobId = decodeId(jobId);

    // 验证所有权
    const job = await engine.getJobStatus(numericJobId);
    if (job.user_id !== userId) {
      return res.status(403).json({ message: '无权访问此工作流' });
    }

    const result = await engine.resumeWorkflow(numericJobId);
    res.json(encodeJobIds(result));
  } catch (error) {
    console.error('[Resume Workflow]', error);
    res.status(500).json({ message: error.message || '恢复工作流失败' });
  }
});

/**
 * 取消工作流
 */
router.post('/:jobId/cancel', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;
    const { jobId } = req.params;
    const numericJobId = decodeId(jobId);

    const result = await engine.cancelWorkflow(numericJobId, userId);
    res.json(encodeJobIds(result));
  } catch (error) {
    console.error('[Cancel Workflow]', error);
    const msg = error.message || '取消工作流失败';
    // 工作流不存在或已完成时返回 404/409 而非 500
    if (msg.includes('不存在') || msg.includes('无权访问')) {
      return res.status(404).json({ message: msg });
    }
    if (msg.includes('已完成')) {
      return res.status(409).json({ message: msg });
    }
    res.status(500).json({ message: msg });
  }
});

/**
 * 获取当前排队和轮询状态（用户端）
 * 返回当前限流器队列信息和轮询调度器状态，供前端显示排队位置
 */
router.get('/queue-status', authMiddleware, (req, res) => {
  try {
    const rateLimitStats = getRateLimitStats();
    const pollStats = pollManager.getStats();

    // 提取用户关心的摘要信息
    const defaultRole = rateLimitStats.roleStats?.default || {};
    const summary = {
      // 提交队列状态
      submit: {
        video: {
          current: defaultRole.video?.current || 0,
          max: defaultRole.video?.maxConcurrent || 0,
          waiting: defaultRole.video?.waiting || 0,
          userWaiting: defaultRole.video?.userWaiting || {}
        },
        image: {
          current: defaultRole.image?.current || 0,
          max: defaultRole.image?.maxConcurrent || 0,
          waiting: defaultRole.image?.waiting || 0
        },
        text: {
          current: defaultRole.text?.current || 0,
          max: defaultRole.text?.maxConcurrent || 0,
          waiting: defaultRole.text?.waiting || 0
        }
      },
      // 轮询状态
      poll: {
        activeTasks: pollStats.currentActiveTasks,
        totalCompleted: pollStats.totalCompleted,
        totalFailed: pollStats.totalFailed,
        peakActiveTasks: pollStats.peakActiveTasks
      }
    };

    res.json(summary);
  } catch (error) {
    console.error('[Queue Status]', error);
    res.status(500).json({ message: error.message || '获取排队状态失败' });
  }
});

/**
 * 手动重试失败的任务（不扣积分）
 * POST /api/workflows/:jobId/tasks/:taskId/retry
 */
router.post('/:jobId/tasks/:taskId/retry', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;
    const { jobId, taskId } = req.params;
    const numericJobId = decodeId(jobId);
    const numericTaskId = decodeId(taskId);
    const { execute, queryOne } = require('../dbHelper');

    // 验证所有权
    const task = await queryOne(
      `SELECT g.*, w.user_id as owner_user_id, w.status as job_status
       FROM generation_tasks g
       JOIN workflow_jobs w ON w.id = g.job_id
       WHERE g.id = ? AND g.job_id = ?`,
      [numericTaskId, numericJobId]
    );

    if (!task) {
      return res.status(404).json({ message: '任务不存在' });
    }
    if (task.owner_user_id !== userId) {
      return res.status(403).json({ message: '无权操作此任务' });
    }
    if (task.status !== 'failed') {
      return res.status(400).json({ message: `只能重试失败的任务，当前状态: ${task.status}` });
    }

    // 重置任务状态为 pending，保留 retry_count 以便 skipBilling
    await execute(
      `UPDATE generation_tasks 
       SET status = 'pending', error_message = NULL, progress = 0, started_at = NULL, completed_at = NULL,
           updated_at = NOW()
       WHERE id = ?`,
      [numericTaskId]
    );

    // 确保工作流为 running 状态
    if (task.job_status === 'failed') {
      await execute(
        `UPDATE workflow_jobs SET status = 'running', error_message = NULL, updated_at = NOW()
         WHERE id = ?`,
        [numericJobId]
      );
    }

    console.log(`[Retry] 用户 ${userId} 手动重试任务: taskId=${numericTaskId}, jobId=${numericJobId}`);

    // 触发执行
    const workflowEngine = require('./engine');
    workflowEngine.runNextStep(numericJobId).catch(err => {
      console.error(`[Retry] 重试调度失败: jobId=${numericJobId}`, err);
    });

    res.json({
      success: true,
      message: '任务已重新加入调度队列',
      taskId: encodeId(numericTaskId),
      jobId: encodeId(numericJobId)
    });
  } catch (error) {
    console.error('[Retry Task]', error);
    res.status(500).json({ message: error.message || '重试任务失败' });
  }
});

/**
 * 获取任务的错误详情和重试历史
 * GET /api/workflows/:jobId/tasks/:taskId/errors
 */
router.get('/:jobId/tasks/:taskId/errors', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;
    const { jobId, taskId } = req.params;
    const numericJobId = decodeId(jobId);
    const numericTaskId = decodeId(taskId);
    const { queryOne, queryAll } = require('../dbHelper');

    // 验证所有权
    const task = await queryOne(
      `SELECT g.retry_count, g.max_retries, g.retry_reason, g.error_message, g.status,
              w.user_id as owner_user_id
       FROM generation_tasks g
       JOIN workflow_jobs w ON w.id = g.job_id
       WHERE g.id = ? AND g.job_id = ?`,
      [numericTaskId, numericJobId]
    );

    if (!task) {
      return res.status(404).json({ message: '任务不存在' });
    }
    if (task.owner_user_id !== userId) {
      return res.status(403).json({ message: '无权访问此任务' });
    }

    // 获取该任务的结构化日志
    const logs = await queryAll(
      `SELECT log_level, log_event, log_message, log_context, created_at
       FROM workflow_logs
       WHERE task_id = ?
       ORDER BY created_at ASC`,
      [numericTaskId]
    );

    // 解析 retry_reason 和 log_context
    let retryHistory = null;
    if (task.retry_reason) {
      try { retryHistory = JSON.parse(task.retry_reason); } catch(e) {}
    }

    const parsedLogs = logs.map(log => ({
      ...log,
      log_context: log.log_context ? (typeof log.log_context === 'string' ? JSON.parse(log.log_context) : log.log_context) : null
    }));

    res.json({
      taskId: encodeId(numericTaskId),
      status: task.status,
      retryCount: task.retry_count || 0,
      maxRetries: task.max_retries || 3,
      retryHistory,
      errorMessage: task.error_message,
      logs: parsedLogs
    });
  } catch (error) {
    console.error('[Task Errors]', error);
    res.status(500).json({ message: error.message || '获取任务错误信息失败' });
  }
});

/**
 * 管理员接口 - 查询结构化日志
 * GET /api/workflows/admin/logs?jobId=xxx&taskId=xxx&logLevel=error&logEvent=task_failed&from=...&to=...
 */
router.get('/admin/logs', authMiddleware, requireAdmin, async (req, res) => {
  try {
    const { jobId, taskId, logLevel, logEvent, workflowType, from, to, page = 1, limit = 50 } = req.query;
    const { queryAll, execute } = require('../dbHelper');

    let sql = 'SELECT * FROM workflow_logs WHERE 1=1';
    const params = [];

    if (jobId) {
      const numericJobId = parseInt(jobId) || decodeId(jobId);
      sql += ' AND job_id = ?';
      params.push(numericJobId);
    }
    if (taskId) {
      const numericTaskId = parseInt(taskId) || decodeId(taskId);
      sql += ' AND task_id = ?';
      params.push(numericTaskId);
    }
    if (logLevel) {
      sql += ' AND log_level = ?';
      params.push(logLevel);
    }
    if (logEvent) {
      sql += ' AND log_event = ?';
      params.push(logEvent);
    }
    if (workflowType) {
      sql += ' AND workflow_type = ?';
      params.push(workflowType);
    }
    if (from) {
      sql += ' AND created_at >= ?';
      params.push(from);
    }
    if (to) {
      sql += ' AND created_at <= ?';
      params.push(to);
    }

    // 获取总数
    const countSql = sql.replace('SELECT *', 'SELECT COUNT(*) as total');
    const countResult = await execute(countSql, params);
    const total = countResult[0].total;

    // 分页
    const offset = (parseInt(page) - 1) * parseInt(limit);
    sql += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
    params.push(parseInt(limit), offset);

    const logs = await queryAll(sql, params);

    // 解码 ID
    const decodedLogs = logs.map(log => ({
      ...log,
      id: String(log.id),
      job_id: log.job_id ? encodeId(log.job_id) : null,
      task_id: log.task_id ? encodeId(log.task_id) : null,
      log_context: log.log_context ? (typeof log.log_context === 'string' ? JSON.parse(log.log_context) : log.log_context) : null
    }));

    res.json({
      logs: decodedLogs,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        totalPages: Math.ceil(total / parseInt(limit))
      }
    });
  } catch (error) {
    console.error('[Admin Logs]', error);
    res.status(500).json({ message: error.message || '查询日志失败' });
  }
});

module.exports = router;
