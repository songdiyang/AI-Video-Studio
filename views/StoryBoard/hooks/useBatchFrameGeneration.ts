/**
 * 批量分镜帧生成 Hook
 * 一键生成一集所有分镜的首帧/首尾帧图片
 * 支持页面刷新后自动恢复状态和进度
 * 
 * 此为 useBatchGeneration 的薄封装，保持原有接口兼容性
 */

import { useBatchGeneration, FRAME_GENERATION_CONFIG, StoryboardScene } from './useBatchGeneration';

interface UseBatchFrameGenerationProps {
  scriptId: number | null;
  projectId: number | null;
  imageModel: string;
  aspectRatio: string;
  resolution?: string;
  textModel: string;
  scenes: StoryboardScene[];
  onComplete?: () => void;
  onError?: (message: string) => void;
}

export function useBatchFrameGeneration({
  scriptId,
  projectId,
  imageModel,
  aspectRatio,
  resolution,
  textModel,
  scenes,
  onComplete,
  onError
}: UseBatchFrameGenerationProps) {
  const result = useBatchGeneration(FRAME_GENERATION_CONFIG, {
    scriptId,
    projectId,
    model: imageModel,
    aspectRatio,
    resolution,
    textModel,
    scenes,
    onComplete,
    onError
  });

  // 保持原有接口兼容性
  return {
    startBatchGeneration: result.startBatchGeneration,
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
