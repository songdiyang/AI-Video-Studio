/**
 * 批量分镜视频生成 Hook
 * 一键生成一集所有分镜的视频
 * 支持页面刷新后自动恢复状态和进度
 * 
 * 此为 useBatchGeneration 的薄封装，保持原有接口兼容性
 */

import { useBatchGeneration, VIDEO_GENERATION_CONFIG, StoryboardScene } from './useBatchGeneration';
import { WorkflowTask } from '../../../hooks/useWorkflow';

interface UseBatchSceneVideoGenerationProps {
  scriptId: number | null;
  projectId: number | null;
  videoModel: string;
  textModel: string;
  aspectRatio: string;
  resolution?: string;
  duration?: number | null;
  scenes?: StoryboardScene[];
  onComplete?: () => void;
  onError?: (message: string) => void;
  /** 子任务完成回调（用于实时刷新单个分镜） */
  onSubTaskCompleted?: (task: WorkflowTask, storyboardId: number | null) => void;
  /** 批量生成启动回调（返回有效分镜ID列表） */
  onBatchStarted?: (validSceneIds: number[], type: 'frame' | 'video') => void;
}

export function useBatchSceneVideoGeneration({
  scriptId,
  projectId,
  videoModel,
  textModel,
  aspectRatio,
  resolution,
  duration,
  scenes = [],
  onComplete,
  onError,
  onSubTaskCompleted,
  onBatchStarted
}: UseBatchSceneVideoGenerationProps) {
  const result = useBatchGeneration(VIDEO_GENERATION_CONFIG, {
    scriptId,
    projectId,
    model: videoModel,
    aspectRatio,
    resolution,
    textModel,
    scenes,
    duration,
    onComplete,
    onError,
    onSubTaskCompleted,
    onBatchStarted
  });

  // 保持原有接口兼容性
  return {
    startBatchVideoGeneration: result.startBatchGeneration,
    isGenerating: result.isGenerating,
    isCompleted: result.isCompleted,
    isFailed: result.isFailed,
    progress: result.progress,
    job: result.job,
    // 新增：部分批量支持
    skippedScenes: result.skippedScenes,
    validSceneCount: result.validSceneCount
  };
}
