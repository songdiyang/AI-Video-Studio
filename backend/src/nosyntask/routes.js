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

    res.json({ jobs });
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
      jobId: result.jobId,
      tasks: result.tasks,
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
    res.json({ jobs });
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
    const { page = 1, limit = 20, workflowType } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);
    const { execute } = require('../dbHelper');

    let where = "WHERE wj.status = 'failed'";
    const params = [];
    if (workflowType) {
      where += ' AND wj.workflow_type = ?';
      params.push(workflowType);
    }

    const countSql = `SELECT COUNT(*) as total FROM workflow_jobs wj ${where}`;
    const countResult = await execute(countSql, params);
    const total = countResult[0].total;

    const dataSql = `
      SELECT wj.id, wj.user_id, u.email as user_email, wj.workflow_type, wj.status,
             wj.error_message, wj.input_params, wj.created_at, wj.updated_at, wj.is_consumed
      FROM workflow_jobs wj
      LEFT JOIN users u ON u.id = wj.user_id
      ${where}
      ORDER BY wj.created_at DESC
      LIMIT ? OFFSET ?
    `;
    const dataParams = [...params, parseInt(limit), offset];
    const jobs = await execute(dataSql, dataParams);

    res.json({
      jobs,
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
 * 标记工作流已消费
 */
router.post('/:jobId/consume', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;
    const { jobId } = req.params;
    const { execute } = require('../dbHelper');
    await execute(
      'UPDATE workflow_jobs SET is_consumed = 1 WHERE id = ? AND user_id = ?',
      [parseInt(jobId), userId]
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

    const job = await generationQueryService.getJob(parseInt(jobId));

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

    res.json(job);
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

    // 验证所有权
    const job = await engine.getJobStatus(parseInt(jobId));
    if (job.user_id !== userId) {
      return res.status(403).json({ message: '无权访问此工作流' });
    }

    const result = await engine.resumeWorkflow(parseInt(jobId));
    res.json(result);
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

    const result = await engine.cancelWorkflow(parseInt(jobId), userId);
    res.json(result);
  } catch (error) {
    console.error('[Cancel Workflow]', error);
    res.status(500).json({ message: error.message || '取消工作流失败' });
  }
});

module.exports = router;
