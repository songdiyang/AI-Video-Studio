/**
 * 角色三视图生成 Hook
 * 负责三视图生成和工作流轮询
 */

import { useMemo } from 'react';
import { WorkflowJob } from '../../../hooks/useWorkflow';
import { useWorkflowRecovery } from './useWorkflowRecovery';

interface UseCharacterViewsGenerationProps {
  characterId: string | null;
  projectId: number | null;
  isActive: boolean; // 是否在资源面松页面
  onComplete: () => void;
  onSuccess?: (message: string) => void;
  onError?: (message: string) => void;
}

export function useCharacterViewsGeneration({
  characterId,
  projectId,
  isActive,
  onComplete,
  onSuccess,
  onError
}: UseCharacterViewsGenerationProps) {
  const characterIdString = useMemo(() => (characterId ? String(characterId) : null), [characterId]);

  const recovery = useWorkflowRecovery({
    projectId,
    workflowTypes: ['character_views_generation'],
    isActive,
    matchJob: (job: WorkflowJob) => {
      if (!characterIdString) {
        return true;
      }

      return String(job.input_params?.characterId || '') === characterIdString;
    },
    onCompleted: async () => {
      onSuccess?.('三视图生成完成！');
      onComplete();
    },
    onFailed: (failedJob) => {
      console.error('[useCharacterViewsGeneration] 工作流失败:', failedJob);
      onError?.('三视图生成失败，请重试');
    },
    logPrefix: '[useCharacterViewsGeneration]'
  });

  return {
    isGenerating: recovery.isGenerating,
    generatingJobId: recovery.jobId,
    job: recovery.job,
    isRunning: recovery.isRunning,
    isCompleted: recovery.isCompleted,
    isFailed: recovery.isFailed,
    checkAndResumeNextWorkflow: recovery.checkAndResume
  };
}
