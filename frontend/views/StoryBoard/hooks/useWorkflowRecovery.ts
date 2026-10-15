/**
 * 通用工作流恢复 Hook
 * 
 * 封装 useWorkflow + getActiveWorkflows 的通用模式：
 * 1. 页面加载时自动检查并恢复未消费的工作流
 * 2. 自动轮询进度
 * 3. 完成/失败时自动 consumeWorkflow
 * 4. 支持链式恢复（处理完一个工作流后检查下一个）
 * 5. 支持子任务完成回调（用于实时刷新单个分镜）
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  useWorkflow,
  getActiveWorkflows,
  consumeWorkflow,
  WorkflowJob,
  WorkflowTask
} from '../../../hooks/useWorkflow';

interface UseWorkflowRecoveryOptions {
  /** 项目 ID */
  projectId: number | null;
  /** 要匹配的 workflow_type（支持多个） */
  workflowTypes: string[];
  /** 是否激活（页面可见时才轮询） */
  isActive?: boolean;
  /** 工作流完成回调 */
  onCompleted?: (job: WorkflowJob) => void;
  /** 工作流失败回调 */
  onFailed?: (job: WorkflowJob) => void;
  /** 工作流恢复回调 */
  onRecovered?: (job: WorkflowJob) => void;
  /** 子任务完成回调（用于实时刷新单个分镜） */
  onSubTaskCompleted?: (task: WorkflowTask, job: WorkflowJob) => void;
  /** 额外过滤条件 */
  matchJob?: (job: WorkflowJob) => boolean;
  /** 日志前缀 */
  logPrefix?: string;
}

function parseJobInputParams(inputParams: WorkflowJob['input_params']) {
  if (!inputParams) {
    return {};
  }

  if (typeof inputParams === 'string') {
    try {
      return JSON.parse(inputParams);
    } catch (error) {
      return {};
    }
  }

  return inputParams;
}

export function useWorkflowRecovery({
  projectId,
  workflowTypes,
  isActive = true,
  onCompleted,
  onFailed,
  onRecovered,
  onSubTaskCompleted,
  matchJob,
  logPrefix = '[WorkflowRecovery]'
}: UseWorkflowRecoveryOptions) {
  const [jobId, setJobId] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);

  // 用 ref 保持回调最新，避免 useWorkflow 闭包过期
  const callbackRefs = useRef({ onCompleted, onFailed, onRecovered, onSubTaskCompleted, matchJob });
  useEffect(() => {
    callbackRefs.current = { onCompleted, onFailed, onRecovered, onSubTaskCompleted, matchJob };
  }, [onCompleted, onFailed, onRecovered, onSubTaskCompleted, matchJob]);

  // 跟踪已完成的子任务 ID（防止重复触发回调）
  const completedTaskIdsRef = useRef<Set<string>>(new Set());

  const matchesJob = useCallback((job: WorkflowJob) => {
    if (!workflowTypes.includes(job.workflow_type)) {
      return false;
    }

    const currentMatchJob = callbackRefs.current.matchJob;
    if (!currentMatchJob) {
      return true;
    }

    return currentMatchJob({
      ...job,
      input_params: parseJobInputParams(job.input_params)
    });
  }, [workflowTypes]);

  // 检查并恢复活跃工作流
  const checkAndResume = useCallback(async () => {
    if (!projectId || !isActive) {
      return;
    }

    try {
      console.log(`${logPrefix} 检查活跃工作流...`);
      const { jobs } = await getActiveWorkflows(projectId);

      if (jobs && jobs.length > 0) {
        const matchedJob = jobs.find((job: WorkflowJob) => matchesJob(job));

        if (matchedJob) {
          console.log(`${logPrefix} 恢复工作流:`, matchedJob.id, matchedJob.workflow_type);
          setJobId(matchedJob.id);
          setIsGenerating(true);
          callbackRefs.current.onRecovered?.({
            ...matchedJob,
            input_params: parseJobInputParams(matchedJob.input_params)
          });
          return;
        }
      }

      console.log(`${logPrefix} 无活跃工作流`);
      setJobId(null);
      setIsGenerating(false);
    } catch (error) {
      console.error(`${logPrefix} 检查活跃工作流失败:`, error);
    }
  }, [projectId, isActive, matchesJob, logPrefix]);

  // 页面加载 / isActive 变化时自动检查
  useEffect(() => {
    if (isActive && projectId) {
      checkAndResume();
    }
  }, [projectId, isActive]);

  // 使用 useWorkflow 轮询
  const workflow = useWorkflow(jobId, {
    onProgress: (job) => {
      // 检测新完成的子任务
      const { onSubTaskCompleted } = callbackRefs.current;
      if (onSubTaskCompleted && job.tasks) {
        for (const task of job.tasks) {
          if (task.status === 'completed' && !completedTaskIdsRef.current.has(task.id)) {
            completedTaskIdsRef.current.add(task.id);
            console.log(`${logPrefix} 子任务完成:`, task.id, task.task_type);
            onSubTaskCompleted(task, job);
          }
        }
      }
    },
    onCompleted: async (completedJob) => {
      console.log(`${logPrefix} 工作流完成:`, completedJob.id);
      try {
        await consumeWorkflow(completedJob.id);
        callbackRefs.current.onCompleted?.(completedJob);
      } catch (error: any) {
        console.error(`${logPrefix} 处理完成失败:`, error);
      } finally {
        setIsGenerating(false);
        setJobId(null);
        completedTaskIdsRef.current.clear(); // 清空已完成任务集合
        // 链式检查下一个
        await checkAndResume();
      }
    },
    onFailed: async (failedJob) => {
      console.error(`${logPrefix} 工作流失败:`, failedJob.id);
      try {
        await consumeWorkflow(failedJob.id);
      } catch (e) {
        console.error(`${logPrefix} consume 失败:`, e);
      }
      callbackRefs.current.onFailed?.(failedJob);
      setIsGenerating(false);
      setJobId(null);
      completedTaskIdsRef.current.clear(); // 清空已完成任务集合
      await checkAndResume();
    }
  });

  // 手动启动新任务（设置 jobId 后自动开始轮询）
  const startJob = useCallback((newJobId: string) => {
    setJobId(newJobId);
    setIsGenerating(true);
  }, []);

  return {
    ...workflow,
    isGenerating,
    jobId,
    startJob,
    checkAndResume
  };
}
