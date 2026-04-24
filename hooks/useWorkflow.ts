import { useState, useEffect, useCallback, useRef } from 'react';
import { getAuthToken } from '../services/auth';

// ============================================================
// Types
// ============================================================

export interface WorkflowTask {
  id: string;
  job_id: string;
  step_index: number;
  task_type: string;
  target_type: string;
  target_id: number | null;
  model_name: string | null;
  input_params: any;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  progress: number;
  result_data: any;
  error_message: string | null;
  started_at: string | null;
  completed_at: string | null;
  /** 前端显示名称（从 input_params.displayName 提取） */
  displayName?: string;
}

export interface WorkflowJob {
  id: string;
  user_id: number;
  project_id: number;
  workflow_type: string;
  workflowName: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
  current_step_index: number;
  total_steps: number;
  params?: string | any;  // 工作流参数（可能是字符串或对象）
  input_params: any;
  error_message: string | null;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
  tasks: WorkflowTask[];
}

interface UseWorkflowOptions {
  /** 轮询间隔（毫秒），默认 500 */
  interval?: number;
  /** 工作流完成回调 */
  onCompleted?: (job: WorkflowJob) => void;
  /** 工作流失败回调 */
  onFailed?: (job: WorkflowJob) => void;
  /** 进度更新回调 */
  onProgress?: (job: WorkflowJob) => void;
}

export class ApiError extends Error {
  status: number;
  data: any;

  constructor(message: string, status: number, data: any) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.data = data;
  }
}

// ============================================================
// API 函数
// ============================================================

async function fetchApi(url: string, options: RequestInit = {}) {
  const token = getAuthToken();
  
  const doFetch = async (isRetry = false): Promise<any> => {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000);

    try {
      const res = await fetch(url, {
        ...options,
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          ...options.headers
        },
        signal: controller.signal
      });
      clearTimeout(timeoutId);
      
      // 5xx 错误且不是重试时，自动重试一次
      if (res.status >= 500 && !isRetry) {
        console.warn(`[Workflow API] ${url} 返回 ${res.status}，1秒后重试`);
        await new Promise(r => setTimeout(r, 1000));
        return doFetch(true);
      }
      
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new ApiError(data.message || '请求失败', res.status, data);
      }
      return data;
    } catch (err: any) {
      clearTimeout(timeoutId);
      if (err instanceof ApiError) throw err; // 业务错误不重试
      if (err.name === 'AbortError') {
        throw new Error('请求超时（30秒）');
      }
      // 网络错误且不是重试时，自动重试一次
      if (!isRetry) {
        console.warn(`[Workflow API] ${url} 网络错误: ${err.message}，1秒后重试`);
        await new Promise(r => setTimeout(r, 1000));
        return doFetch(true);
      }
      throw err;
    }
  };
  
  return doFetch(false);
}

/** 启动工作流 */
export async function startWorkflow(
  workflowType: string,
  projectId: number,
  params: Record<string, any>
): Promise<{ jobId: string; tasks: any[] }> {
  return fetchApi('/api/workflows', {
    method: 'POST',
    body: JSON.stringify({ workflowType, projectId, params })
  });
}

/** 获取工作流状态 */
export async function getWorkflowStatus(jobId: string): Promise<WorkflowJob> {
  return fetchApi(`/api/workflows/${jobId}`);
}

/** 恢复工作流 */
export async function resumeWorkflow(jobId: string) {
  return fetchApi(`/api/workflows/${jobId}/resume`, { method: 'POST' });
}

/** 取消工作流 */
export async function cancelWorkflow(jobId: string) {
  return fetchApi(`/api/workflows/${jobId}/cancel`, { method: 'POST' });
}

/** 获取工作流列表 */
export async function getWorkflowList(options: {
  projectId?: number;
  workflowType?: string;
  status?: string;
} = {}): Promise<{ jobs: WorkflowJob[] }> {
  const params = new URLSearchParams();
  if (options.projectId) params.set('projectId', String(options.projectId));
  if (options.workflowType) params.set('workflowType', options.workflowType);
  if (options.status) params.set('status', options.status);
  const qs = params.toString();
  return fetchApi(`/api/workflows${qs ? '?' + qs : ''}`);
}

/** 查询项目的活跃（未消费）工作流 */
export async function getActiveWorkflows(projectId: number): Promise<{ jobs: WorkflowJob[] }> {
  return fetchApi(`/api/workflows/active?projectId=${projectId}`);
}

/** 标记工作流已消费 */
export async function consumeWorkflow(jobId: string): Promise<void> {
  await fetchApi(`/api/workflows/${jobId}/consume`, { method: 'POST' });
}

/** 批量清除失败/已取消的任务（标记已消费，不删除数据库记录） */
export async function consumeAllFailed(): Promise<{ consumed: number }> {
  return fetchApi('/api/workflows/batch-consume-failed', { method: 'POST' });
}

/** 手动重试失败的任务（不扣积分） */
export async function retryTask(jobId: string, taskId: string): Promise<{ success: boolean; message: string }> {
  return fetchApi(`/api/workflows/${jobId}/tasks/${taskId}/retry`, { method: 'POST' });
}

/** 获取任务错误详情和重试历史 */
export async function getTaskErrors(jobId: string, taskId: string): Promise<{
  taskId: string;
  status: string;
  retryCount: number;
  maxRetries: number;
  retryHistory: any;
  errorMessage: string | null;
  logs: any[];
}> {
  return fetchApi(`/api/workflows/${jobId}/tasks/${taskId}/errors`);
}

// ============================================================
// Hook: useWorkflow
// 轮询工作流状态，自动在完成/失败时停止
// ============================================================

export function useWorkflow(jobId: string | null, options: UseWorkflowOptions = {}) {
  // 性能优化：默认轮询间隔从 500ms 降低到 300ms，加快响应速度
  const { interval = 300, onCompleted, onFailed, onProgress } = options;

  const [job, setJob] = useState<WorkflowJob | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const intervalRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const callbackRefs = useRef({ onCompleted, onFailed, onProgress });
  const pollCountRef = useRef(0);

  // 保持回调引用最新
  useEffect(() => {
    callbackRefs.current = { onCompleted, onFailed, onProgress };
  }, [onCompleted, onFailed, onProgress]);

  const isInitialFetch = useRef(true);
  // 标识轮询是否活跃（用于 setTimeout 链式调度的中止控制）
  const pollingActiveRef = useRef(false);

  // 性能优化：自适应轮询间隔
  // - 前15次：300ms（快速响应）
  // - 15-30次：600ms（中速）
  // - 30-50次：1000ms（稳定）
  // - 50次以上：1500ms（长时任务）
  const getAdaptiveInterval = useCallback(() => {
    const count = pollCountRef.current;
    if (count < 15) return interval;          // 前15次用初始间隔
    if (count < 30) return interval * 2;      // 15-30次放慢一3倍
    if (count < 50) return Math.min(1000, interval * 3); // 30-50次最多1秒
    return 1500;                              // 50次以上固定1.5秒
  }, [interval]);

  const fetchJob = useCallback(async (): Promise<boolean> => {
    if (!jobId) return true; // 返回 true 表示终态，应停止轮询
    pollCountRef.current++;
    try {
      if (isInitialFetch.current) {
        setLoading(true);
      }
      setError(null);
      const data = await getWorkflowStatus(jobId);
      setJob(data);

      callbackRefs.current.onProgress?.(data);

      if (data.status === 'completed') {
        callbackRefs.current.onCompleted?.(data);
        return true;
      } else if (data.status === 'failed') {
        callbackRefs.current.onFailed?.(data);
        return true;
      } else if (data.status === 'cancelled') {
        return true;
      }
      return false;
    } catch (err: any) {
      setError(err.message);
      // 404 表示工作流已不存在，视为终态停止轮询，避免无限重试
      if (err instanceof ApiError && err.status === 404) {
        console.warn(`[useWorkflow] 工作流 ${jobId} 不存在(404)，停止轮询`);
        callbackRefs.current.onFailed?.({ id: jobId, status: 'failed', error_message: '工作流不存在' } as WorkflowJob);
        return true;
      }
      return false; // 其他错误继续轮询
    } finally {
      setLoading(false);
      isInitialFetch.current = false;
    }
  }, [jobId]);

  // 开始轮询（使用 setTimeout 递归实现自适应间隔）
  const startPolling = useCallback(() => {
    if (!jobId) return;
    pollCountRef.current = 0;
    pollingActiveRef.current = true;

    const scheduleNext = () => {
      if (!pollingActiveRef.current) return;
      intervalRef.current = setTimeout(async () => {
        const done = await fetchJob();
        if (done || !pollingActiveRef.current) {
          pollingActiveRef.current = false;
          intervalRef.current = null;
        } else {
          scheduleNext();
        }
      }, getAdaptiveInterval());
    };

    // 立即执行第一次，然后开始调度
    fetchJob().then(done => {
      if (done || !pollingActiveRef.current) {
        pollingActiveRef.current = false;
      } else {
        scheduleNext();
      }
    });
  }, [jobId, fetchJob, getAdaptiveInterval]);

  // 停止轮询
  const stopPolling = useCallback(() => {
    pollingActiveRef.current = false;
    if (intervalRef.current) {
      clearTimeout(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  // jobId 变化时自动开始/停止轮询
  useEffect(() => {
    if (jobId) {
      isInitialFetch.current = true;
      startPolling();
    } else {
      stopPolling();
      setJob(null);
    }
    return stopPolling;
  }, [jobId, startPolling, stopPolling]);

  // 页面可见性检测：页面不可见时暂停轮询，可见时恢复
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.hidden) {
        stopPolling();
      } else if (jobId) {
        startPolling();
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [jobId, startPolling, stopPolling]);

  // 恢复工作流
  const resume = useCallback(async () => {
    if (!jobId) return;
    try {
      await resumeWorkflow(jobId);
      startPolling();
    } catch (err: any) {
      setError(err.message);
    }
  }, [jobId, startPolling]);

  // 取消工作流
  const cancel = useCallback(async () => {
    if (!jobId) return;
    try {
      await cancelWorkflow(jobId);
      stopPolling();
      await fetchJob();
    } catch (err: any) {
      setError(err.message);
    }
  }, [jobId, stopPolling, fetchJob]);

  // 计算整体进度
  const overallProgress = job?.tasks
    ? Math.round(job.tasks.reduce((sum, t) => sum + t.progress, 0) / job.tasks.length)
    : 0;

  return {
    job,
    tasks: job?.tasks || [],
    loading,
    error,
    startPolling,
    stopPolling,
    resume,
    cancel,
    // 便捷状态
    isRunning: job?.status === 'running' || job?.status === 'pending',
    isCompleted: job?.status === 'completed',
    isFailed: job?.status === 'failed',
    isCancelled: job?.status === 'cancelled',
    overallProgress,
    currentStep: job?.current_step_index ?? 0,
    totalSteps: job?.total_steps ?? 0
  };
}
