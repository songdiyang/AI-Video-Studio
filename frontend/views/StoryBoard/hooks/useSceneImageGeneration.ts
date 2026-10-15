/**
 * 场景图片生成 Hook
 * 负责场景图片生成和工作流轮询
 */

import { useMemo } from 'react';
import { WorkflowJob } from '../../../hooks/useWorkflow';
import { useWorkflowRecovery } from './useWorkflowRecovery';

interface UseSceneImageGenerationProps {
  sceneId: string | null;
  projectId: number | null;
  isActive: boolean; // 是否在资源面松页面
  onComplete: () => void;
  onSuccess?: (message: string) => void;
  onError?: (message: string) => void;
}

export function useSceneImageGeneration({
  sceneId,
  projectId,
  isActive,
  onComplete,
  onSuccess,
  onError
}: UseSceneImageGenerationProps) {
  const sceneIdString = useMemo(() => (sceneId ? String(sceneId) : null), [sceneId]);

  const recovery = useWorkflowRecovery({
    projectId,
    workflowTypes: ['scene_image_generation'],
    isActive,
    matchJob: (job: WorkflowJob) => {
      if (!sceneIdString) {
        return true;
      }

      return String(job.input_params?.sceneId || '') === sceneIdString;
    },
    onCompleted: async () => {
      onSuccess?.('场景图片生成完成！');
      onComplete();
    },
    onFailed: (failedJob) => {
      console.error('[useSceneImageGeneration] 工作流失败:', failedJob);
      onError?.('场景图片生成失败，请重试');
    },
    logPrefix: '[useSceneImageGeneration]'
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
