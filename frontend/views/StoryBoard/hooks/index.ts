/**
 * StoryBoard Hooks 统一导出
 */

export { useSceneImageGeneration } from './useSceneImageGeneration';
export { useCharacterViewsGeneration } from './useCharacterViewsGeneration';
export { useWorkflowRecovery } from './useWorkflowRecovery';
export { useBatchFrameGeneration } from './useBatchFrameGeneration';
export { useBatchSceneVideoGeneration } from './useBatchSceneVideoGeneration';
export { useImagePreloader, useScrollIndex } from './useImagePreloader';
export { 
  useBatchGeneration, 
  FRAME_GENERATION_CONFIG, 
  VIDEO_GENERATION_CONFIG,
  type BatchGenerationConfig,
  type UseBatchGenerationProps,
  type BatchGenerationResult,
  type StoryboardScene,
  type SkippedSceneInfo
} from './useBatchGeneration';
