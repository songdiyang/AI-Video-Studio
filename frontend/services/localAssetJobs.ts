// 资产生成作业注册表（localAssetJobs）
//
// 后端各资产域的图片/设定图生成端点（角色三视图、场景图、建筑图、环境图、
// 服装视图、影棚九宫、环境变体人脸、元素图片…）遵循统一异步契约：
//   POST /api/<domain>/:id/<generate-*>  →  { jobId, ... }
// 前端 useWorkflowTargetMonitor / baseModelMonitor 轮询 GET /api/workflows/active?projectId=，
// 命中 job.workflow_type + job.input_params[targetKey] 且 status=completed/failed 时回调并 consume。
//
// 本地无 Node 工作流引擎，且生成结果需回写「资产文档」（localWorkflow 仅回写分镜），
// 故这里维护一个轻量作业注册表：提交即返回 ag_ 前缀 jobId（非阻塞），后台执行厂商出图 +
// persistGeneratedMedia + 文档回写，完成/失败后置状态；localWorkflowRouter 把 ag_ 作业
// 并入 /workflows 与 /workflows/active，驱动消费方在下次轮询刷新资产列表。

import type { LocalWorkflowJob, LocalWorkflowTask } from './localWorkflow';

export interface AssetJob {
  id: string;
  workflow_type: string;
  workflowName: string;
  project_id: number;
  status: 'running' | 'completed' | 'failed';
  input_params: Record<string, unknown>;
  result_data: any;
  error_message: string | null;
  created_at: string;
  started_at: string;
  completed_at: string | null;
  consumed: boolean;
}

const store = new Map<string, AssetJob>();

function genId(): string {
  return `ag_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export interface SubmitAssetJobOptions {
  workflowType: string;
  workflowName?: string;
  projectId: number;
  inputParams?: Record<string, unknown>;
  /** 后台执行体：出图 + 回写资产文档；返回 result_data（供作业展示） */
  run: () => Promise<any>;
  /** 整体超时；默认 10 分钟，测试可注入更短时长 */
  timeoutMs?: number;
  /**
   * 作业进入失败终态（厂商报错或看门狗超时）时的补偿回写。
   * run() 只在成功路径写资产文档，缺这一环记录会永远停在「生成中」，
   * 界面与智能体都读不到失败原因，也就无法提供「重新生成」。
   */
  onFail?: (error: Error) => void;
}

const DEFAULT_JOB_TIMEOUT_MS = 10 * 60 * 1000;

/**
 * 提交一个资产生成作业：登记为 running，异步执行 run()，立即返回 jobId（ag_ 前缀）。
 * 与后端「提交即返回、完成靠轮询」契约一致，不阻塞请求响应。
 */
export function submitAssetGeneration(opts: SubmitAssetJobOptions): string {
  const id = genId();
  const now = new Date().toISOString();
  const job: AssetJob = {
    id,
    workflow_type: opts.workflowType,
    workflowName: opts.workflowName || opts.workflowType,
    project_id: Number(opts.projectId) || 0,
    status: 'running',
    input_params: opts.inputParams || {},
    result_data: null,
    error_message: null,
    created_at: now,
    started_at: now,
    completed_at: null,
    consumed: false,
  };
  store.set(id, job);
  // 失败回写只允许发生一次：看门狗超时后 run() 的迟到异常不应再覆盖资产记录。
  let failNotified = false;
  const notifyFail = (message: string) => {
    if (failNotified || !opts.onFail) return;
    failNotified = true;
    try {
      opts.onFail(new Error(message));
    } catch (err) {
      console.warn(`[assetJobs] ${opts.workflowType} 失败回写异常:`, err);
    }
  };
  // 厂商调用或媒体落地异常悬停时也必须进入终态，否则 UI 与注册表会永久保持生成中。
  const watchdog = setTimeout(() => {
    if (job.status !== 'running') return;
    job.status = 'failed';
    job.error_message = '生成任务超时，请重新生成';
    job.completed_at = new Date().toISOString();
    notifyFail(job.error_message);
  }, Math.max(1, opts.timeoutMs ?? DEFAULT_JOB_TIMEOUT_MS));
  void (async () => {
    try {
      const result = await opts.run();
      if (job.status !== 'running') return; // 超时后不接受迟到结果覆盖终态
      job.result_data = result ?? null;
      job.status = 'completed';
    } catch (err: any) {
      if (job.status !== 'running') return;
      job.status = 'failed';
      job.error_message = err?.message || '生成失败';
      notifyFail(job.error_message);
    } finally {
      clearTimeout(watchdog);
      job.completed_at ||= new Date().toISOString();
    }
  })();
  return id;
}

export function isAssetJobId(jobId: string): boolean {
  return jobId.startsWith('ag_');
}

export function getAssetJob(jobId: string): AssetJob | null {
  return store.get(jobId) || null;
}

export function listActiveAssetJobs(projectId?: number): AssetJob[] {
  const arr = [...store.values()].filter((j) => !j.consumed);
  const filtered = projectId && projectId > 0 ? arr.filter((j) => j.project_id === Number(projectId)) : arr;
  return filtered.sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
}

export function consumeAssetJob(jobId: string): boolean {
  const job = store.get(jobId);
  if (!job) return false;
  job.consumed = true;
  return true;
}

/** 把 AssetJob 转成前端 WorkflowJob 形状（对齐 localWorkflow / useWorkflowTargetMonitor 消费字段） */
export function assetJobToWorkflowJob(job: AssetJob): LocalWorkflowJob {
  const task: LocalWorkflowTask = {
    id: `t_${job.id}`,
    job_id: job.id,
    step_index: 0,
    task_type: job.workflow_type,
    target_type: 'asset',
    target_id: null,
    model_name: (job.input_params?.imageModel as string) || null,
    input_params: job.input_params,
    status: job.status === 'running' ? 'processing' : job.status,
    progress: job.status === 'completed' ? 100 : job.status === 'running' ? 50 : 0,
    result_data: job.result_data,
    error_message: job.error_message,
    started_at: job.started_at,
    completed_at: job.completed_at,
    displayName: job.workflowName,
  };
  return {
    id: job.id,
    user_id: 1,
    project_id: job.project_id,
    workflow_type: job.workflow_type,
    workflowName: job.workflowName,
    status: job.status,
    current_step_index: 0,
    total_steps: 1,
    params: job.input_params,
    input_params: job.input_params,
    error_message: job.error_message,
    started_at: job.started_at,
    completed_at: job.completed_at,
    created_at: job.created_at,
    tasks: [task],
    consumed: job.consumed,
  };
}
