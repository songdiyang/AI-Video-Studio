import { useCallback, useEffect, useRef, useState, useMemo } from 'react';
import {
  WorkflowJob,
  consumeWorkflow,
  getActiveWorkflows,
} from '../../../hooks/useWorkflow';

interface UseWorkflowTargetMonitorOptions {
  projectId: number | null;
  workflowTypes: string[];
  targetParamKey: string;
  isActive?: boolean;
  pollInterval?: number;
  onCompleted?: (job: WorkflowJob) => void | Promise<void>;
  onFailed?: (job: WorkflowJob) => void | Promise<void>;
}

function parseInputParams(inputParams: WorkflowJob['input_params']) {
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

export function useWorkflowTargetMonitor({
  projectId,
  workflowTypes,
  targetParamKey,
  isActive = true,
  pollInterval = 2000,
  onCompleted,
  onFailed,
}: UseWorkflowTargetMonitorOptions) {
  const [activeTargetIds, setActiveTargetIds] = useState<string[]>([]);
  const handledJobsRef = useRef<Set<number>>(new Set());
  const callbacksRef = useRef({ onCompleted, onFailed });
  
  // 稳定化 workflowTypes 引用，避免无限循环
  const workflowTypesKey = useMemo(() => workflowTypes.join(','), [workflowTypes]);
  const workflowTypesRef = useRef(workflowTypes);
  workflowTypesRef.current = workflowTypes;

  useEffect(() => {
    callbacksRef.current = { onCompleted, onFailed };
  }, [onCompleted, onFailed]);

  const refreshNow = useCallback(async () => {
    if (!projectId || !isActive) {
      setActiveTargetIds([]);
      return;
    }

    const { jobs } = await getActiveWorkflows(projectId);
    const currentWorkflowTypes = workflowTypesRef.current;
    const matchedJobs = (jobs || [])
      .filter((job) => currentWorkflowTypes.includes(job.workflow_type))
      .map((job) => ({
        ...job,
        input_params: parseInputParams(job.input_params),
      }));

    const runningIds = matchedJobs
      .filter((job) => job.status === 'pending' || job.status === 'running')
      .map((job) => job.input_params?.[targetParamKey])
      .filter((value) => value !== undefined && value !== null && value !== '')
      .map((value) => String(value));

    setActiveTargetIds(runningIds);

    for (const job of matchedJobs) {
      if (job.status !== 'completed' && job.status !== 'failed') {
        continue;
      }
      if (handledJobsRef.current.has(job.id)) {
        continue;
      }

      handledJobsRef.current.add(job.id);

      try {
        if (job.status === 'completed') {
          await callbacksRef.current.onCompleted?.(job);
        } else {
          await callbacksRef.current.onFailed?.(job);
        }
      } finally {
        try {
          await consumeWorkflow(job.id);
        } catch (error) {
          console.error('[useWorkflowTargetMonitor] consumeWorkflow 失败:', error);
        }
      }
    }
  }, [isActive, projectId, targetParamKey, workflowTypesKey]);

  useEffect(() => {
    if (!projectId || !isActive) {
      setActiveTargetIds([]);
      return;
    }

    let cancelled = false;

    const poll = async () => {
      try {
        await refreshNow();
      } catch (error) {
        if (!cancelled) {
          console.error('[useWorkflowTargetMonitor] 刷新失败:', error);
        }
      }
    };

    poll();
    const timer = window.setInterval(poll, pollInterval);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [isActive, pollInterval, projectId, refreshNow]);

  const isTargetActive = useCallback(
    (targetId: number | string | null | undefined) => {
      if (targetId === null || targetId === undefined) {
        return false;
      }
      return activeTargetIds.includes(String(targetId));
    },
    [activeTargetIds]
  );

  return {
    activeTargetIds,
    isTargetActive,
    refreshNow,
  };
}
