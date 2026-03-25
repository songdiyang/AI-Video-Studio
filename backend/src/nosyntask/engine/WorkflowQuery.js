/**
 * 工作流查询模块
 * 负责查询工作流状态和列表
 */

const { queryOne, queryAll } = require('../../dbHelper');
const { getWorkflowDefinition } = require('../definitions');
const { normalizeWorkflowJobForApi } = require('../../modules/generation/utils/workflowParams');

class WorkflowQuery {
  /**
   * 获取工作流状态（含所有子任务）
   */
  async getJobStatus(jobId) {
    const job = await queryOne('SELECT * FROM workflow_jobs WHERE id = ?', [jobId]);
    if (!job) {
      throw new Error('工作流不存在');
    }

    // 解析 JSON
    if (job.input_params && typeof job.input_params === 'string') {
      job.input_params = JSON.parse(job.input_params);
    }

    // 获取所有子任务
    const tasks = await queryAll(
      `SELECT * FROM generation_tasks WHERE job_id = ? ORDER BY step_index ASC`,
      [jobId]
    );

    // 解析子任务的 JSON 字段
    const parsedTasks = tasks.map(t => {
      if (t.input_params && typeof t.input_params === 'string') {
        try { t.input_params = JSON.parse(t.input_params); } catch(e) {}
      }
      if (t.result_data && typeof t.result_data === 'string') {
        try { t.result_data = JSON.parse(t.result_data); } catch(e) {}
      }
      return t;
    });

    // 获取工作流定义信息
    const definition = getWorkflowDefinition(job.workflow_type);

    return normalizeWorkflowJobForApi({
      ...job,
      workflowName: definition?.name || job.workflow_type,
      tasks: parsedTasks
    });
  }

  /**
   * 获取用户的工作流列表
   */
  async getUserJobs(userId, options = {}) {
    const { projectId, workflowType, status, limit = 50 } = options;

    let sql = 'SELECT * FROM workflow_jobs WHERE user_id = ?';
    const params = [userId];

    if (projectId) {
      sql += ' AND project_id = ?';
      params.push(projectId);
    }
    if (workflowType) {
      sql += ' AND workflow_type = ?';
      params.push(workflowType);
    }
    if (status) {
      const statuses = status.split(',').map(s => s.trim()).filter(Boolean);
      if (statuses.length === 1) {
        sql += ' AND status = ?';
        params.push(statuses[0]);
      } else if (statuses.length > 1) {
        sql += ` AND status IN (${statuses.map(() => '?').join(',')})`;
        params.push(...statuses);
      }
    }

    // 排除已消费的非活跃任务（failed/cancelled 被用户删除后不再显示）
    sql += ' AND (is_consumed = 0 OR status IN (\'pending\', \'running\'))';

    sql += ' ORDER BY created_at DESC LIMIT ?';
    params.push(limit);

    const jobs = await queryAll(sql, params);

    // 批量获取所有 job 的子任务
    const jobIds = jobs.map(j => j.id);
    let tasksMap = {};
    if (jobIds.length > 0) {
      const tasks = await queryAll(
        `SELECT * FROM generation_tasks WHERE job_id IN (${jobIds.map(() => '?').join(',')}) ORDER BY step_index ASC`,
        jobIds
      );
      tasksMap = tasks.reduce((map, t) => {
        if (t.input_params && typeof t.input_params === 'string') {
          try { t.input_params = JSON.parse(t.input_params); } catch(e) {}
        }
        if (t.result_data && typeof t.result_data === 'string') {
          try { t.result_data = JSON.parse(t.result_data); } catch(e) {}
        }
        if (!map[t.job_id]) map[t.job_id] = [];
        map[t.job_id].push(t);
        return map;
      }, {});
    }

    return jobs.map(job => {
      if (job.input_params && typeof job.input_params === 'string') {
        try { job.input_params = JSON.parse(job.input_params); } catch(e) {}
      }
      // 添加工作流名称
      const definition = getWorkflowDefinition(job.workflow_type);
      job.workflowName = definition?.name || job.workflow_type;
      // 添加子任务数据
      job.tasks = tasksMap[job.id] || [];
      return normalizeWorkflowJobForApi(job);
    });
  }
}

module.exports = WorkflowQuery;
