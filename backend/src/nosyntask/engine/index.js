/**
 * 工作流执行引擎（Workflow Engine）
 * 
 * 职责：
 * 1. 创建工作流 Job + 预创建所有子任务（pending）
 * 2. 按顺序执行步骤，步骤间传递数据
 * 3. 处理失败：当前步骤失败 -> 后续步骤自动暂停，Job 标记 failed
 * 4. 支持断点恢复：从第一个 pending 的步骤继续执行
 * 
 * 不做的事：
 * - 不处理副作用（保存剧本、扣费等）
 * - 副作用由调用方通过查询 result_data 自行处理
 */

const WorkflowStarter = require('./WorkflowStarter');
const WorkflowExecutor = require('./WorkflowExecutor');
const WorkflowResumer = require('./WorkflowResumer');
const WorkflowCanceller = require('./WorkflowCanceller');
const WorkflowQuery = require('./WorkflowQuery');

class WorkflowEngine {
  constructor() {
    this.starter = new WorkflowStarter();
    this.executor = new WorkflowExecutor();
    this.resumer = new WorkflowResumer(this.executor);
    this.canceller = new WorkflowCanceller();
    this.query = new WorkflowQuery();
  }

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
  async startWorkflow(workflowType, { userId, projectId, jobParams, parentJobId = null, metadata = null }) {
    const { jobId, tasks } = await this.starter.startWorkflow(workflowType, {
      userId,
      projectId,
      jobParams,
      parentJobId,
      metadata
    });

    // 异步触发执行（不阻塞返回）
    this.executor.runNextStep(jobId).catch(err => {
      console.error(`[WorkflowEngine] 工作流启动失败: jobId=${jobId}`, err);
    });

    return { jobId, tasks };
  }

  /**
   * 执行下一个 pending 的步骤
   * 这是引擎的核心调度逻辑
   */
  async runNextStep(jobId) {
    return this.executor.runNextStep(jobId);
  }

  /**
   * 恢复工作流（断点续传）
   * 从第一个 pending 的步骤继续执行
   */
  async resumeWorkflow(jobId) {
    return this.resumer.resumeWorkflow(jobId);
  }

  /**
   * 取消工作流
   */
  async cancelWorkflow(jobId, userId) {
    return this.canceller.cancelWorkflow(jobId, userId);
  }

  /**
   * 获取工作流状态（含所有子任务）
   */
  async getJobStatus(jobId) {
    return this.query.getJobStatus(jobId);
  }

  /**
   * 获取用户的工作流列表
   */
  async getUserJobs(userId, options = {}) {
    return this.query.getUserJobs(userId, options);
  }

  /**
   * 关闭引擎（优雅退出）
   */
  async shutdown() {
    if (this.executor && typeof this.executor.shutdown === 'function') {
      await this.executor.shutdown();
    }
  }
}

// 单例导出
module.exports = new WorkflowEngine();
