/**
 * 工作流启动模块
 * 负责创建工作流和预创建任务
 */

const { execute } = require('../../dbHelper');
const { getWorkflowDefinition } = require('../definitions');

class WorkflowStarter {
  /**
   * 启动工作流
   * 
   * @param {string} workflowType - 工作流类型（对应 definitions.js 中的 key）
   * @param {object} params - 工作流参数
   * @param {number} params.userId
   * @param {number} params.projectId
   * @param {object} params.jobParams - 传给工作流的业务参数（如 title, description 等）
   * @returns {Promise<{ jobId: number, tasks: Array }>}
   */
  async startWorkflow(workflowType, { userId, projectId, jobParams }) {
    console.log('[WorkflowStarter] startWorkflow 调用参数:', {
      workflowType,
      userId,
      projectId,
      jobParams
    });
    
    const definition = getWorkflowDefinition(workflowType);
    if (!definition) {
      throw new Error(`未知的工作流类型: ${workflowType}`);
    }

    const steps = typeof definition.steps === 'function'
      ? definition.steps(jobParams)
      : definition.steps;
    console.log(`[WorkflowStarter] 工作流定义找到: ${workflowType}, 步骤数: ${steps.length}${typeof definition.steps === 'function' ? ' (动态)' : ''}`);

    // 1. 创建 workflow_job
    console.log('[WorkflowStarter] 准备插入 workflow_jobs 表...');
    const jobResult = await execute(
      `INSERT INTO workflow_jobs 
       (user_id, project_id, workflow_type, status, current_step_index, total_steps, input_params) 
       VALUES (?, ?, ?, 'pending', 0, ?, ?)`,
      [userId, projectId, workflowType, steps.length, JSON.stringify(jobParams)]
    );
    const jobId = jobResult.insertId;

    console.log(`[WorkflowStarter] 创建工作流成功: jobId=${jobId}, type=${workflowType}, steps=${steps.length}`);

    // 2. 预创建所有 generation_tasks（状态为 pending）
    const tasks = [];
    for (let i = 0; i < steps.length; i++) {
      const step = steps[i];
      // 如果步骤有 displayName，存入 input_params 以便前端显示
      const initialParams = step.displayName ? JSON.stringify({ displayName: step.displayName }) : null;
      const taskResult = await execute(
        `INSERT INTO generation_tasks 
         (job_id, step_index, user_id, project_id, task_type, target_type, status, progress, input_params) 
         VALUES (?, ?, ?, ?, ?, ?, 'pending', 0, ?)`,
        [jobId, i, userId, projectId, step.type, step.targetType, initialParams]
      );
      tasks.push({
        id: taskResult.insertId,
        stepIndex: i,
        type: step.type,
        displayName: step.displayName || null,
        status: 'pending'
      });
    }

    return { jobId, tasks };
  }
}

module.exports = WorkflowStarter;
