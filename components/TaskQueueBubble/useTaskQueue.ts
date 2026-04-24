import { useState, useEffect, useCallback, useRef } from 'react';
import { getAuthToken } from '../../services/auth';
import { getWorkflowList, WorkflowJob } from '../../hooks/useWorkflow';

// Polling interval constants (in milliseconds)
const POLLING_ACTIVE = 3000;    // When there are active tasks
const POLLING_IDLE = 10000;     // When no active tasks
const POLLING_MINIMIZED = 15000; // When panel is collapsed

// 需要在完成后刷新页面的任务类型
const REFRESH_ON_COMPLETE_TYPES = [
  'frame_generation',            // 分镜首尾帧生成
  'single_frame_generation',     // 分镜单帧生成
  'batch_frame_generation',      // 批量分镜帧生成（兼容旧任务）
  'scene_video',                 // 分镜视频生成
  'scene_image_generation',      // 场景图片生成
  'character_views_generation',  // 角色三视图生成
  'batch_prompt_optimization',   // 批量提示词优化
  'single_prompt_optimization',  // 单条提示词优化
  'batch_image_prompt_optimization',   // 批量图片提示词优化
  'single_image_prompt_optimization',  // 单条图片提示词优化
  'batch_video_prompt_optimization',   // 批量视频提示词优化
  'single_video_prompt_optimization',  // 单条视频提示词优化
];

export interface UseTaskQueueOptions {
  onJobFailed?: (job: WorkflowJob) => void;
}

export interface UseTaskQueueReturn {
  jobs: WorkflowJob[];
  loading: boolean;
  isExpanded: boolean;
  setIsExpanded: (expanded: boolean) => void;
  fetchJobs: (showLoading?: boolean) => Promise<void>;
  getJobProgress: (job: WorkflowJob) => number;
}

export function useTaskQueue(options?: UseTaskQueueOptions): UseTaskQueueReturn {
  const { onJobFailed } = options || {};
  const [jobs, setJobs] = useState<WorkflowJob[]>([]);
  const [loading, setLoading] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const isFirstLoad = useRef(true);
  // 跟踪上一次的任务ID集合，用于检测任务完成
  const prevJobIdsRef = useRef<Set<string>>(new Set());
  const prevJobTypesRef = useRef<Map<string, string>>(new Map());
  // 跟踪任务状态，用于检测失败
  const prevStatusRef = useRef<Map<string, string>>(new Map());
  const currentIntervalRef = useRef<number>(POLLING_IDLE);
  // 指数退避相关
  const staleCountRef = useRef(0); // 连续无变化次数
  const prevJobsSnapshotRef = useRef<string>(''); // 任务状态快照用于比较
  // 请求去重
  const isFetchingRef = useRef(false);
  // 使用 ref 包裹回调，避免依赖变化
  const onJobFailedRef = useRef(onJobFailed);
  onJobFailedRef.current = onJobFailed;

  const fetchJobs = useCallback(async (showLoading = false) => {
    // 请求去重：如果上一次请求还未返回，跳过本次
    if (isFetchingRef.current) {
      console.log('[TaskQueue] 跳过重叠请求');
      return;
    }
    isFetchingRef.current = true;

    const token = getAuthToken();
    if (!token) {
      isFetchingRef.current = false;
      return;
    }

    try {
      // 只在手动刷新或首次加载时显示 loading
      if (showLoading || isFirstLoad.current) {
        setLoading(true);
      }
      const data = await getWorkflowList({ status: 'pending,running,failed' });
      const currentJobs = data.jobs || [];
      const currentJobIds = new Set(currentJobs.map((j: WorkflowJob) => j.id));

      // 检测已完成的任务（之前存在但现在不在列表中）
      if (!isFirstLoad.current) {
        const completedJobIds: string[] = [];
        prevJobIdsRef.current.forEach(id => {
          if (!currentJobIds.has(id)) {
            completedJobIds.push(id);
          }
        });

        // 检查是否有需要触发更新的任务完成
        const refreshJobIds = completedJobIds.filter(id => {
          const jobType = prevJobTypesRef.current.get(id);
          return jobType && REFRESH_ON_COMPLETE_TYPES.includes(jobType);
        });

        if (refreshJobIds.length > 0) {
          console.log('[TaskQueue] 检测到图片生成任务完成，触发分镜数据刷新', refreshJobIds);
          // 派发自定义事件，通知分镜页面刷新数据
          window.dispatchEvent(new CustomEvent('storyboard:taskCompleted', {
            detail: { completedJobIds: refreshJobIds }
          }));
        }
      }

      // 检测失败任务并触发回调
      if (!isFirstLoad.current && onJobFailedRef.current) {
        // 首次轮询时只记录状态不触发回调，防止页面刷新时已有失败任务重复通知
        const isFirstPoll = prevStatusRef.current.size === 0;
        if (!isFirstPoll) {
          currentJobs.forEach((job: WorkflowJob) => {
            const prevStatus = prevStatusRef.current.get(job.id);
            // 如果当前状态是 failed，且之前状态不是 failed（或之前没有记录过）
            if (job.status === 'failed' && prevStatus !== undefined && prevStatus !== 'failed') {
              onJobFailedRef.current?.(job);
            }
          });
        }
      }

      // 更新状态快照
      prevStatusRef.current = new Map(currentJobs.map((j: WorkflowJob) => [j.id, j.status]));

      // 更新跟踪状态
      prevJobIdsRef.current = currentJobIds;
      prevJobTypesRef.current = new Map(currentJobs.map((j: WorkflowJob) => [j.id, j.workflow_type]));

      // 检测任务状态是否有变化（用于指数退避）
      const currentSnapshot = currentJobs.map((j: WorkflowJob) => `${j.id}:${j.status}`).join(',');
      if (currentSnapshot === prevJobsSnapshotRef.current) {
        staleCountRef.current++;
      } else {
        staleCountRef.current = 0;
        prevJobsSnapshotRef.current = currentSnapshot;
      }

      setJobs(currentJobs);
      isFirstLoad.current = false;
    } catch (err) {
      console.error('[TaskQueue] 获取任务列表失败:', err);
    } finally {
      setLoading(false);
      isFetchingRef.current = false;
    }
  }, []);

  // Calculate adaptive polling interval based on task states and panel visibility
  const getPollingInterval = useCallback(() => {
    // When minimized/collapsed, use slower polling
    if (!isExpanded) {
      return POLLING_MINIMIZED;
    }
    // Check for active tasks (running or pending)
    const hasActiveTasks = jobs.some(
      (j) => j.status === 'running' || j.status === 'pending'
    );
    if (!hasActiveTasks) return POLLING_IDLE;
    
    // 有活跃任务时，根据连续无变化次数进行指数退避
    const staleCount = staleCountRef.current;
    if (staleCount < 3) return POLLING_ACTIVE;        // 前3次: 3s
    if (staleCount < 6) return 5000;                   // 3-6次: 5s
    if (staleCount < 10) return 8000;                  // 6-10次: 8s
    return POLLING_MINIMIZED;                           // 10次+: 15s（和最小化一样）
  }, [jobs, isExpanded]);

  // Effect to manage adaptive polling interval
  useEffect(() => {
    const token = getAuthToken();
    if (!token) return;

    const newInterval = getPollingInterval();
    
    // Only reset interval if it changed
    if (newInterval !== currentIntervalRef.current || !intervalRef.current) {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
      currentIntervalRef.current = newInterval;
      intervalRef.current = setInterval(() => fetchJobs(false), newInterval);
      console.log(`[TaskQueue] Polling interval adjusted to ${newInterval}ms`);
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [getPollingInterval, fetchJobs]);

  // 页面可见性检测：页面不可见时暂停轮询，可见时恢复
  useEffect(() => {
    const handleVisibilityChange = () => {
      const token = getAuthToken();
      if (!token) return;
      
      if (document.hidden) {
        // 页面不可见时暂停轮询
        if (intervalRef.current) {
          clearInterval(intervalRef.current);
          intervalRef.current = null;
          console.log('[TaskQueue] 页面不可见，暂停轮询');
        }
      } else {
        // 页面可见时立即获取一次并恢复轮询
        fetchJobs(false);
        if (!intervalRef.current) {
          intervalRef.current = setInterval(() => fetchJobs(false), currentIntervalRef.current);
          console.log('[TaskQueue] 页面可见，恢复轮询');
        }
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [fetchJobs]);

  // 网络状态感知：离线时暂停轮询，上线时恢复
  useEffect(() => {
    const handleOnline = () => {
      console.log('[TaskQueue] 网络恢复，立即获取数据');
      fetchJobs(false);
      // 恢复轮询
      if (!intervalRef.current) {
        const token = getAuthToken();
        if (token) {
          intervalRef.current = setInterval(() => fetchJobs(false), currentIntervalRef.current);
        }
      }
    };

    const handleOffline = () => {
      console.log('[TaskQueue] 网络离线，暂停轮询');
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [fetchJobs]);

  // Initial fetch on mount
  useEffect(() => {
    const token = getAuthToken();
    if (!token) return;
    fetchJobs(true); // First load shows loading state
  }, [fetchJobs]);

  const getJobProgress = useCallback((job: WorkflowJob) => {
    if (!job.tasks || job.tasks.length === 0) return 0;
    return Math.round(job.tasks.reduce((sum, t) => sum + t.progress, 0) / job.tasks.length);
  }, []);

  return {
    jobs,
    loading,
    isExpanded,
    setIsExpanded,
    fetchJobs,
    getJobProgress,
  };
}
