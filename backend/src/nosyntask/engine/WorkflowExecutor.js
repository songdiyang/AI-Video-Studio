/**
 * 工作流执行模块
 * 负责执行工作流步骤和任务
 * 支持基于 dependencies 的并行执行
 */

const { queryOne, queryAll, execute } = require('../../dbHelper');
const { getWorkflowDefinition } = require('../definitions');
const ContextBuilder = require('./ContextBuilder');
const JobStatusManager = require('./JobStatusManager');
const { runWithTrace } = require('./generationTrace');
const { withAIBillingContext } = require('../../aiBillingContext');

const MAX_STEPS = 50; // 单个工作流最大步骤数，防止无限递归
const MAX_CONCURRENT_TASKS = parseInt(process.env.WORKFLOW_MAX_CONCURRENT, 10) || 5;

function extractResourceRefs(inputParams, executionContext = {}) {
  const refs = {};
  for (const key of ['scriptId', 'storyboardId', 'sceneId', 'characterId', 'projectId']) {
    if (inputParams?.[key] !== undefined && inputParams?.[key] !== null && inputParams?.[key] !== '') {
      refs[key] = inputParams[key];
    }
  }
  if (refs.projectId === undefined && executionContext?.projectId !== undefined && executionContext?.projectId !== null) {
    refs.projectId = executionContext.projectId;
  }
  return refs;
}

class WorkflowExecutor {
  constructor() {
    this.contextBuilder = new ContextBuilder();
    this.jobStatusManager = new JobStatusManager();
    this.stepCounters = new Map(); // jobId -> 已执行步骤计数
    this.runningTasks = new Map(); // jobId -> Set<taskId> 正在执行的任务
  }

  /**
   * 检查步骤的依赖是否都已完成
   * @param {Array} tasks - 所有任务
   * @param {Object} stepDef - 步骤定义
   * @returns {boolean}
   */
  areDependenciesMet(tasks, stepDef) {
    const deps = stepDef.dependencies || [];
    if (deps.length === 0) return true;
    
    return deps.every(depIndex => {
      const depTask = tasks.find(t => t.step_index === depIndex);
      return depTask && depTask.status === 'completed';
    });
  }

  /**
   * 执行下一批可执行的步骤（支持并行）
   * 这是引擎的核心调度逻辑
   */
  async runNextStep(jobId) {
    // 步骤计数保护：防止无限递归
    const count = (this.stepCounters.get(jobId) || 0) + 1;
    this.stepCounters.set(jobId, count);
    if (count > MAX_STEPS) {
      this.stepCounters.delete(jobId);
      await this.jobStatusManager.failJob(jobId, `工作流执行超过最大步骤数（${MAX_STEPS}），已强制终止`);
      return;
    }

    // 获取 Job 信息
    const job = await queryOne('SELECT * FROM workflow_jobs WHERE id = ?', [jobId]);
    if (!job) {
      throw new Error(`工作流不存在: jobId=${jobId}`);
    }

    if (job.status === 'completed' || job.status === 'failed' || job.status === 'cancelled') {
      console.log(`[WorkflowExecutor] 工作流已结束: jobId=${jobId}, status=${job.status}`);
      return;
    }

    // 获取工作流定义
    const definition = getWorkflowDefinition(job.workflow_type);
    if (!definition) {
      await this.jobStatusManager.failJob(jobId, `工作流定义不存在: ${job.workflow_type}`);
      return;
    }

    // 获取所有任务
    const allTasks = await queryAll(
      'SELECT * FROM generation_tasks WHERE job_id = ? ORDER BY step_index ASC',
      [jobId]
    );

    // 找到所有可执行的 pending 任务（依赖已满足且未在执行中）
    const runningSet = this.runningTasks.get(jobId) || new Set();
    const executableTasks = [];

    for (const task of allTasks) {
      if (task.status !== 'pending') continue;
      if (runningSet.has(task.id)) continue;

      const stepDef = definition.steps[task.step_index];
      if (!stepDef) continue;

      // 检查依赖是否满足
      if (this.areDependenciesMet(allTasks, stepDef)) {
        executableTasks.push({ task, stepDef });
      }
    }

    // 没有可执行的任务
    if (executableTasks.length === 0) {
      // 检查是否有正在运行的任务
      const hasRunning = allTasks.some(t => t.status === 'processing');
      if (hasRunning) {
        // 等待运行中的任务完成
        return;
      }

      // 检查是否所有任务都完成
      const allCompleted = allTasks.every(t => t.status === 'completed');
      const allSettled = allTasks.every(t => t.status === 'completed' || t.status === 'failed');

      if (allCompleted) {
        this.stepCounters.delete(jobId);
        this.runningTasks.delete(jobId);
        await this.jobStatusManager.completeJob(jobId);
      } else if (allSettled) {
        // continue_independent 策略下：有失败的但其他都完成了
        const failedTasks = allTasks.filter(t => t.status === 'failed');
        this.stepCounters.delete(jobId);
        this.runningTasks.delete(jobId);
        await this.jobStatusManager.failJob(jobId, `${failedTasks.length} 个任务失败，其余任务已完成`);
      }
      return;
    }

    // 全局并发限制：计算当前正在运行的任务数
    const currentRunningCount = runningSet.size;
    const availableSlots = Math.max(0, MAX_CONCURRENT_TASKS - currentRunningCount);

    if (availableSlots === 0) {
      console.log(`[WorkflowExecutor] 已达并发上限 (${MAX_CONCURRENT_TASKS})，等待任务完成: jobId=${jobId}`);
      return;
    }

    // 限制本批次调度的任务数量
    const tasksToExecute = executableTasks.slice(0, availableSlots);
    console.log(`[WorkflowExecutor] 调度 ${tasksToExecute.length}/${executableTasks.length} 个任务 (并发: ${currentRunningCount + tasksToExecute.length}/${MAX_CONCURRENT_TASKS}): jobId=${jobId}`);

    // 更新 Job 状态
    const minStepIndex = Math.min(...tasksToExecute.map(t => t.task.step_index));
    await execute(
      `UPDATE workflow_jobs SET status = 'running', current_step_index = ?, started_at = COALESCE(started_at, NOW()) WHERE id = ?`,
      [minStepIndex, jobId]
    );

    // 标记任务为正在运行
    if (!this.runningTasks.has(jobId)) {
      this.runningTasks.set(jobId, new Set());
    }
    const running = this.runningTasks.get(jobId);
    tasksToExecute.forEach(({ task }) => running.add(task.id));

    // 并行执行所有可执行的任务
    const executions = tasksToExecute.map(async ({ task, stepDef }) => {
      // 构建上下文
      const context = await this.contextBuilder.buildContext(jobId, job);

      // 构建本步骤的 input_params
      let inputParams;
      try {
        inputParams = stepDef.buildInput(context);
      } catch (err) {
        await this.jobStatusManager.failTask(task.id, `构建输入参数失败: ${err.message}`);
        await this.jobStatusManager.failJob(jobId, `步骤 ${task.step_index} 输入参数构建失败: ${err.message}`);
        return;
      }

      // 执行任务
      await this.executeTask(task.id, stepDef, inputParams, jobId, context);
    });

    // 等待所有并行任务完成
    await Promise.all(executions);
  }

  /**
   * 执行单个任务
   */
  async executeTask(taskId, stepDef, inputParams, jobId, executionContext = {}) {
    try {
      // 更新任务状态为 processing
      await execute(
        `UPDATE generation_tasks 
         SET status = 'processing', input_params = ?, model_name = ?, started_at = NOW(), progress = 10 
         WHERE id = ?`,
        [JSON.stringify(inputParams), inputParams.textModel || inputParams.imageModel || inputParams.videoModel || inputParams.audioModel || null, taskId]
      );

      console.log(`[WorkflowExecutor] 执行任务: taskId=${taskId}, type=${stepDef.type}`);

      // 进度回调
      const onProgress = async (progress) => {
        await execute('UPDATE generation_tasks SET progress = ? WHERE id = ?', [progress, taskId]);
      };

      // 用统一 billing context 包裹 handler，保证工作流内所有真实模型调用都能自动计费
      const billingContext = {
        userId: executionContext?.userId ?? inputParams?.userId ?? null,
        projectId: executionContext?.projectId ?? inputParams?.projectId ?? null,
        sourceType: 'workflow',
        operationKey: stepDef.type,
        workflowJobId: jobId,
        generationTaskId: taskId,
        resourceRefs: extractResourceRefs(inputParams, executionContext)
      };

      console.log('[WorkflowExecutor] AI 计费上下文字段:', {
        taskId,
        workflowJobId: jobId,
        stepType: stepDef.type,
        userId: billingContext.userId,
        projectId: billingContext.projectId,
        modelName: inputParams.textModel || inputParams.imageModel || inputParams.videoModel || inputParams.audioModel || null,
        resourceRefs: billingContext.resourceRefs
      });

      if (!billingContext.userId) {
        console.warn('[WorkflowExecutor] AI 计费上下文缺少 userId:', {
          taskId,
          workflowJobId: jobId,
          stepType: stepDef.type,
          executionContext,
          inputParams
        });
      }

      // 用追踪系统包裹 handler 调用，自动记录开始/结束/耗时
      const { result: resultData, trace: traceData } = await withAIBillingContext(
        billingContext,
        () => runWithTrace(taskId, stepDef.type, () => stepDef.handler(inputParams, onProgress))
      );

      // 任务成功：保存 result_data + trace
      await this.jobStatusManager.completeTask(taskId, resultData, traceData);

      // 从正在运行集合中移除
      const running = this.runningTasks.get(jobId);
      if (running) running.delete(taskId);

      // 异步触发下一批任务（避免递归调用栈过深）
      setImmediate(() => {
        this.runNextStep(jobId).catch(err => {
          console.error(`[WorkflowExecutor] 异步调度失败: jobId=${jobId}`, err);
        });
      });

    } catch (error) {
      console.error(`[WorkflowExecutor] 任务执行失败: taskId=${taskId}`, error);
      
      // 从正在运行集合中移除
      const running = this.runningTasks.get(jobId);
      if (running) running.delete(taskId);
      
      await this.jobStatusManager.failTask(taskId, error.message, error._trace || null);

      // 获取工作流定义的失败策略
      const definition = getWorkflowDefinition(
        (await queryOne('SELECT workflow_type FROM workflow_jobs WHERE id = ?', [jobId]))?.workflow_type
      );
      const failPolicy = definition?.failPolicy || 'fail_fast';

      if (failPolicy === 'continue_independent') {
        // 检查是否还有不依赖失败任务的独立分支可继续
        const allTasks = await queryAll(
          'SELECT * FROM generation_tasks WHERE job_id = ? ORDER BY step_index ASC',
          [jobId]
        );
        const failedStepIndex = allTasks.find(t => t.id === taskId)?.step_index;
        const hasIndependentPending = allTasks.some(t => {
          if (t.status !== 'pending') return false;
          const stepDef = definition?.steps?.[t.step_index];
          if (!stepDef) return false;
          // 检查该任务是否依赖了已失败的步骤
          const deps = stepDef.dependencies || [];
          return !deps.includes(failedStepIndex);
        });

        if (hasIndependentPending) {
          console.log(`[WorkflowExecutor] failPolicy=continue_independent，继续独立分支: jobId=${jobId}`);
          setImmediate(() => {
            this.runNextStep(jobId).catch(err => {
              console.error(`[WorkflowExecutor] 独立分支调度失败: jobId=${jobId}`, err);
            });
          });
          return;
        }
        console.log(`[WorkflowExecutor] 无独立分支可继续，标记工作流失败: jobId=${jobId}`);
      }

      await this.jobStatusManager.failJob(jobId, `步骤执行失败: ${error.message}`);
    }
  }
}

module.exports = WorkflowExecutor;
