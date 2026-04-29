/**
 * 上下文构建模块
 * 负责构建工作流执行上下文
 */

const { queryAll } = require('../../dbHelper');

class ContextBuilder {
  /**
   * 构建工作流上下文（收集之前步骤的结果）
   */
  async buildContext(jobId, job) {
    const completedTasks = await queryAll(
      `SELECT step_index, result_data FROM generation_tasks 
       WHERE job_id = ? AND status = 'completed' 
       ORDER BY step_index ASC`,
      [jobId]
    );

    const previousResults = {};
    for (const task of completedTasks) {
      let data;
      try {
        data = typeof task.result_data === 'string' 
          ? JSON.parse(task.result_data) 
          : task.result_data;
      } catch (e) {
        console.error(`[ContextBuilder] JSON.parse result_data 失败 (step ${task.step_index}):`, e.message);
        data = null;
      }
      previousResults[task.step_index] = data;
    }

    let jobParams;
    try {
      jobParams = typeof job.input_params === 'string'
        ? JSON.parse(job.input_params)
        : job.input_params;
    } catch (e) {
      console.error(`[ContextBuilder] JSON.parse input_params 失败 (jobId ${jobId}):`, e.message);
      jobParams = {};
    }

    return {
      jobParams,
      previousResults,
      userId: job.user_id,
      projectId: job.project_id,
      jobId: job.id,
      parentJobId: job.parent_job_id || null
    };
  }
}

module.exports = ContextBuilder;
