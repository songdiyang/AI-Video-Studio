/**
 * 工作流取消模块
 * 负责取消正在运行的工作流，支持级联取消子 workflow
 */

const { queryOne, queryAll, execute } = require('../../dbHelper');

class WorkflowCanceller {
  /**
   * 取消工作流（递归级联所有子工作流）
   */
  async cancelWorkflow(jobId, userId) {
    const job = await queryOne(
      'SELECT * FROM workflow_jobs WHERE id = ? AND user_id = ?',
      [jobId, userId]
    );

    if (!job) {
      throw new Error('工作流不存在或无权访问');
    }

    if (job.status === 'completed') {
      throw new Error('工作流已完成，无法取消');
    }

    // 收集所有需要取消的 job id（自身 + 递归所有子 job）
    const allJobIds = await this._collectDescendantJobIds(jobId);

    // 取消所有 pending/processing 的子任务
    if (allJobIds.length > 0) {
      const placeholders = allJobIds.map(() => '?').join(',');
      await execute(
        `UPDATE generation_tasks SET status = 'failed', error_message = '工作流已取消' 
         WHERE job_id IN (${placeholders}) AND status IN ('pending', 'processing')`,
        allJobIds
      );

      await execute(
        `UPDATE workflow_jobs SET status = 'cancelled', error_message = '用户取消', completed_at = NOW() 
         WHERE id IN (${placeholders}) AND status IN ('pending', 'running')`,
        allJobIds
      );
    }

    console.log(`[WorkflowCanceller] 工作流已取消: jobId=${jobId}, 级联取消 ${allJobIds.length} 个`);

    return { jobId, status: 'cancelled', cancelledIds: allJobIds };
  }

  /**
   * 递归收集自身和所有子孙 workflow id
   */
  async _collectDescendantJobIds(rootJobId, depth = 0) {
    if (depth > 10) {
      console.warn(`[WorkflowCanceller] 递归深度超过 10，停止: rootJobId=${rootJobId}`);
      return [rootJobId];
    }
    const result = [rootJobId];
    const children = await queryAll(
      'SELECT id FROM workflow_jobs WHERE parent_job_id = ? AND status IN (\'pending\', \'running\')',
      [rootJobId]
    );
    for (const child of children) {
      const sub = await this._collectDescendantJobIds(child.id, depth + 1);
      result.push(...sub);
    }
    return result;
  }
}

module.exports = WorkflowCanceller;
