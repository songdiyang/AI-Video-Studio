/**
 * useTaskRunner - 通用异步任务执行 hook
 * 
 * 封装 startWorkflow + WebSocket 推送（轮询降级），提供：
 * - runTask(workflowType, params) 启动任务
 * - recoverTasks(workflowTypes, keyMapper) 恢复未消费的活跃任务
 * - WebSocket 实时推送（优先）/ 轮询降级
 * - 完成/失败回调
 * - 支持同时跟踪多个任务（按 key 区分）
 * - clearTask 时自动 consumeWorkflow
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import { startWorkflow, getWorkflowStatus, getActiveWorkflows, consumeWorkflow, resumeWorkflow, WorkflowJob, ApiError } from './useWorkflow';
import { useWebSocket, TaskStatusMessage } from './useWebSocket';

export interface TaskState {
  jobId: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
  progress: number;
  result: any | null;
  error: string | null;
}

interface UseTaskRunnerOptions {
  /** 轮询间隔（毫秒），默认 500 */
  interval?: number;
  /** projectId，默认 0 */
  projectId?: number;
  /** 最大自动重试次数，默认 0（不重试） */
  maxRetries?: number;
  /** 是否启用 WebSocket（默认 true，不可用时自动降级轮询） */
  useWebSocketPush?: boolean;
}

/**
 * 通用任务执行 hook
 * 
 * 用法：
 * const { tasks, runTask, recoverTasks, isRunning } = useTaskRunner();
 * 
 * // 启动首尾帧生成
 * const jobId = await runTask('img_123', 'frame_generation', { prompt: '...' });
 * 
 * // 页面加载时恢复未完成的任务
 * recoverTasks(['frame_generation', 'single_frame_generation'], (job) => `img_${storyboardId}`);
 * 
 * // 读取某个任务状态
 * const task = tasks['img_123']; // { status, progress, result, error }
 */
export function useTaskRunner(options: UseTaskRunnerOptions = {}) {
  const { interval = 500, projectId = 0, maxRetries = 0, useWebSocketPush = true } = options;

  const [tasks, setTasks] = useState<Record<string, TaskState>>({});
  const timersRef = useRef<Record<string, ReturnType<typeof setInterval>>>({});
  // 用 ref 追踪 tasks，供 clearTask 读取 jobId
  const tasksRef = useRef<Record<string, TaskState>>({});
  const activeKeysRef = useRef<Set<string>>(new Set());
  // 用于记录每个任务的轮询次数，实现自适应轮询
  const pollCountRef = useRef<Record<string, number>>({});
  const retryCountRef = useRef<Record<string, number>>({});
  const retryTimerRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  // jobId -> key 映射，用于 WebSocket 消息路由
  const jobIdToKeyRef = useRef<Map<string, string>>(new Map());
  // stopPolling 的 ref，用于在回调中调用
  const stopPollingRef = useRef<(key: string) => void>(() => {});
  useEffect(() => { tasksRef.current = tasks; }, [tasks]);

  // 停止某个 key 的轮询
  const stopPolling = useCallback((key: string) => {
    if (timersRef.current[key]) {
      clearInterval(timersRef.current[key]);
      delete timersRef.current[key];
    }
  }, []);
  
  // 保持 ref 同步
  useEffect(() => { stopPollingRef.current = stopPolling; }, [stopPolling]);

  // 处理 WebSocket 任务状态消息
  const handleTaskStatus = useCallback((data: TaskStatusMessage) => {
    const key = jobIdToKeyRef.current.get(data.jobId);
    if (!key) return;

    console.log(`[useTaskRunner] WebSocket 收到任务状态: jobId=${data.jobId}, status=${data.status}, progress=${data.progress}`);

    if (data.status === 'completed') {
      stopPollingRef.current(key);
      setTasks(prev => ({
        ...prev,
        [key]: {
          ...prev[key],
          status: 'completed',
          progress: 100,
          result: data.result ?? null
        }
      }));
    } else if (data.status === 'failed') {
      stopPollingRef.current(key);
      setTasks(prev => ({
        ...prev,
        [key]: {
          ...prev[key],
          status: 'failed',
          error: data.error || '任务失败'
        }
      }));
    } else if (data.progress !== undefined) {
      setTasks(prev => ({
        ...prev,
        [key]: {
          ...prev[key],
          status: 'running',
          progress: data.progress!
        }
      }));
    }
  }, []);

  // WebSocket 连接
  const { isConnected: wsConnected, subscribeTask, unsubscribeTask } = useWebSocket({
    enabled: useWebSocketPush,
    onTaskStatus: handleTaskStatus
  });

  // 清理所有定时器
  useEffect(() => {
    return () => {
      Object.values(timersRef.current).forEach(clearInterval);
      Object.values(retryTimerRef.current).forEach(clearTimeout);
    };
  }, []);

  // 性能优化：自适应轮询间隔
  // - 前10次：500ms（快速响应）
  // - 10-30次：1000ms（中速）
  // - 30次以上：2000ms（长时任务）
  const getAdaptiveInterval = useCallback((key: string) => {
    const count = pollCountRef.current[key] || 0;
    if (count < 10) return interval;          // 前10次用初始间隔
    if (count < 30) return interval * 2;      // 10-30次放慢一倍
    return Math.min(2000, interval * 4);      // 30次以上最多2秒
  }, [interval]);

  // 更新某个 key 的任务状态
  const updateTask = useCallback((key: string, patch: Partial<TaskState>) => {
    setTasks(prev => ({
      ...prev,
      [key]: { ...prev[key], ...patch } as TaskState
    }));
  }, []);

  // 开始轮询某个 jobId（使用 setTimeout 实现自适应间隔）
  // isBackupMode: true 表示 WebSocket 模式下的低频备用轮询
  const startPolling = useCallback((key: string, jobId: string, isBackupMode: boolean = false) => {
    stopPolling(key);
    activeKeysRef.current.add(key);
    pollCountRef.current[key] = 0;
    let failCount = 0;
    const MAX_FAIL = 1; // 立即标记失败，不静默重试
    
    // WebSocket 备用模式使用更长的轮询间隔（10秒）
    const backupInterval = 10000;

    const poll = async () => {
      // 检查是否已停止
      if (!activeKeysRef.current.has(key)) return;
      
      pollCountRef.current[key] = (pollCountRef.current[key] || 0) + 1;
      
      try {
        const job = await getWorkflowStatus(jobId);
        failCount = 0; // 请求成功，重置失败计数
        // 计算所有任务的加权进度
        const allTasks = job.tasks || [];
        const progress = allTasks.length > 0
          ? Math.round(allTasks.reduce((sum: number, t: any) => sum + (t.progress ?? 0), 0) / allTasks.length)
          : 0;

        updateTask(key, {
          status: job.status,
          progress
        });

        if (job.status === 'completed') {
          stopPolling(key);
          const lastTask = allTasks[allTasks.length - 1];
          updateTask(key, {
            status: 'completed',
            progress: 100,
            result: lastTask?.result_data ?? null
          });
          return;
        } else if (job.status === 'failed' || job.status === 'cancelled') {
          stopPolling(key);
          const failedTask = allTasks.find((t: any) => t.status === 'failed');
          const errorMsg = job.error_message || failedTask?.error_message || '任务失败';
          
          // 自动重试逻辑（仅 failed 状态且配置了 maxRetries）
          if (job.status === 'failed' && maxRetries > 0) {
            const currentRetry = retryCountRef.current[key] || 0;
            if (currentRetry < maxRetries) {
              retryCountRef.current[key] = currentRetry + 1;
              const delay = Math.min(30000, 2000 * Math.pow(2, currentRetry));
              console.log(`[useTaskRunner] 任务 ${key} 失败，${delay/1000}秒后自动重试 (${currentRetry + 1}/${maxRetries})`);
              
              updateTask(key, {
                status: 'pending',
                progress: 0,
                error: `重试中 (${currentRetry + 1}/${maxRetries})...`
              });
              
              retryTimerRef.current[key] = setTimeout(async () => {
                try {
                  await resumeWorkflow(jobId);
                  startPolling(key, jobId);
                } catch (retryErr: any) {
                  console.error(`[useTaskRunner] 重试失败: ${key}`, retryErr);
                  updateTask(key, {
                    status: 'failed',
                    error: errorMsg
                  });
                }
              }, delay);
              return;
            }
            console.log(`[useTaskRunner] 任务 ${key} 已达最大重试次数 (${maxRetries})`);
          }
          
          updateTask(key, {
            status: job.status,
            error: errorMsg
          });
          return;
        }
      } catch (err: any) {
        failCount++;
        console.error(`[useTaskRunner] 轮询失败 (${failCount}/${MAX_FAIL}): ${key}`, err.message);
        if (failCount >= MAX_FAIL) {
          stopPolling(key);
          updateTask(key, {
            status: 'failed',
            error: err.message || '网络请求失败，请检查网络连接'
          });
          return;
        }
      }
      
      // 继续下一次轮询（使用自适应间隔）
      if (activeKeysRef.current.has(key)) {
        const nextInterval = isBackupMode ? backupInterval : getAdaptiveInterval(key);
        timersRef.current[key] = setTimeout(poll, nextInterval) as any;
      }
    };

    // 立即查一次
    poll();
  }, [stopPolling, updateTask, getAdaptiveInterval, maxRetries]);

  /**
   * 启动任务
   * @param key 唯一标识（如 'img_123'），用于跟踪状态
   * @param workflowType 工作流类型（如 'frame_generation'）
   * @param params 业务参数
   * @returns jobId
   */
  const runTask = useCallback(async (
    key: string,
    workflowType: string,
    params: Record<string, any>
  ): Promise<string> => {
    if (activeKeysRef.current.has(key)) {
      throw new Error('任务正在进行中，请等待当前任务结束');
    }

    activeKeysRef.current.add(key);
    // 初始化状态
    updateTask(key, {
      jobId: '',
      status: 'pending',
      progress: 0,
      result: null,
      error: null
    });

    try {
      const { jobId } = await startWorkflow(workflowType, projectId, params);
      updateTask(key, { jobId, status: 'running' });
      
      // 记录 jobId -> key 映射
      jobIdToKeyRef.current.set(jobId, key);
      
      // 如果 WebSocket 已连接，订阅任务状态推送
      if (wsConnected) {
        subscribeTask(jobId);
        console.log(`[useTaskRunner] WebSocket 已订阅任务: jobId=${jobId}`);
        // 启动低频轮询作为保底（每10秒一次）
        startPolling(key, jobId, true);
      } else {
        // WebSocket 不可用，使用传统轮询
        console.log(`[useTaskRunner] WebSocket 不可用，降级使用轮询: jobId=${jobId}`);
        startPolling(key, jobId, false);
      }
      
      return jobId;
    } catch (error: any) {
      if (error instanceof ApiError && error.status === 409 && error.data?.jobId) {
        const conflictJobId = String(error.data.jobId);
        updateTask(key, {
          jobId: conflictJobId,
          status: 'running',
          progress: 0,
          result: null,
          error: null
        });
        
        jobIdToKeyRef.current.set(conflictJobId, key);
        if (wsConnected) {
          subscribeTask(conflictJobId);
          startPolling(key, conflictJobId, true);
        } else {
          startPolling(key, conflictJobId, false);
        }
        return conflictJobId;
      }

      activeKeysRef.current.delete(key);
      updateTask(key, {
        status: 'failed',
        error: error.message || '启动任务失败'
      });
      throw error;
    }
  }, [projectId, updateTask, startPolling, wsConnected, subscribeTask]);

  /**
   * 恢复未消费的活跃工作流任务
   * @param workflowTypes 要恢复的工作流类型列表
   * @param keyMapper 从 WorkflowJob 映射到任务 key，返回 null 则跳过
   */
  const recoverTasks = useCallback(async (
    workflowTypes: string[],
    keyMapper: (job: WorkflowJob) => string | null
  ) => {
    if (!projectId) return;

    try {
      const { jobs } = await getActiveWorkflows(projectId);
      if (!jobs || jobs.length === 0) return;

      for (const job of jobs) {
        if (!workflowTypes.includes(job.workflow_type)) continue;

        const key = keyMapper(job);
        if (!key) continue;

        // 跳过已在跟踪的任务
        if (tasksRef.current[key]) continue;

        console.log(`[useTaskRunner] 恢复任务: key=${key}, jobId=${job.id}, type=${job.workflow_type}`);
        activeKeysRef.current.add(key);
        updateTask(key, {
          jobId: job.id,
          status: (job.status === 'completed' || job.status === 'failed') ? job.status : 'running',
          progress: 0,
          result: null,
          error: null
        });
        startPolling(key, job.id);
      }
    } catch (error) {
      console.error('[useTaskRunner] 恢复任务失败:', error);
    }
  }, [projectId, updateTask, startPolling]);

  // 清除某个任务的状态，同时 consumeWorkflow
  const clearTask = useCallback((key: string) => {
    const task = tasksRef.current[key];
    if (task?.jobId) {
      // 取消 WebSocket 订阅
      unsubscribeTask(task.jobId);
      // 清理映射
      jobIdToKeyRef.current.delete(task.jobId);
      // 消费工作流
      consumeWorkflow(task.jobId).catch(err =>
        console.warn('[useTaskRunner] consumeWorkflow 失败:', err)
      );
    }
    activeKeysRef.current.delete(key);
    delete retryCountRef.current[key];
    if (retryTimerRef.current[key]) {
      clearTimeout(retryTimerRef.current[key]);
      delete retryTimerRef.current[key];
    }
    stopPolling(key);
    setTasks(prev => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
  }, [stopPolling, unsubscribeTask]);

  const isTaskActive = useCallback((key: string) => activeKeysRef.current.has(key), []);

  // 页面可见性检测：页面不可见时暂停所有轮询，可见时恢复
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.hidden) {
        // 页面不可见时暂停所有轮询
        Object.keys(timersRef.current).forEach(key => {
          clearTimeout(timersRef.current[key]);
          delete timersRef.current[key];
        });
        console.log('[useTaskRunner] 页面不可见，暂停所有轮询');
      } else {
        // 页面可见时恢复所有活跃任务的轮询
        const tasksToResume = tasksRef.current;
        Object.entries(tasksToResume).forEach(([key, task]) => {
          if (task.status === 'pending' || task.status === 'running') {
            if (task.jobId && !timersRef.current[key]) {
              console.log(`[useTaskRunner] 恢复任务轮询: ${key}`);
              // 复用 startPolling，但不重置 pollCountRef 以保留自适应间隔状态
              activeKeysRef.current.add(key);
              const savedPollCount = pollCountRef.current[key] || 0;
              startPolling(key, task.jobId);
              pollCountRef.current[key] = savedPollCount; // 恢复轮询计数
            }
          }
        });
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [startPolling]);

  // 是否有任何任务在运行
  const isRunning = (Object.values(tasks) as TaskState[]).some(
    t => t.status === 'pending' || t.status === 'running'
  );

  return {
    tasks,
    runTask,
    recoverTasks,
    clearTask,
    stopPolling,
    isRunning,
    isTaskActive
  };
}
