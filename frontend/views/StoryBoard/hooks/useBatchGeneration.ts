/**
 * 批量生成通用 Hook
 * 
 * 提取 useBatchFrameGeneration 和 useBatchSceneVideoGeneration 的共享逻辑
 * - 统一的校验流程
 * - 统一的恢复处理
 * - 统一的进度跟踪
 * - 支持部分批量生成（跳过无效分镜，继续生成有效分镜）
 */

import { useCallback, useState } from 'react';
import { getAuthToken } from '../../../services/auth';
import { batchValidateScenes, BatchValidationResult } from '../../../services/storyboards';
import { useWorkflowRecovery } from './useWorkflowRecovery';
import { WorkflowTask, WorkflowJob } from '../../../hooks/useWorkflow';

export interface StoryboardScene {
  id?: number;
  characters: string[];
  location: string;
}

export interface SkippedSceneInfo {
  sceneId: number;
  reasons: string[];
}

export interface BatchGenerationConfig {
  type: 'frame' | 'video';
  endpoint: string; // e.g., '/api/storyboards/batch-generate-frames' or '/api/storyboards/batch-generate-videos'
  workflowType: string; // e.g., 'batch_frame_generation' or 'batch_scene_video_generation'
  logPrefix: string;
  modelParamKey: 'imageModel' | 'videoModel';
  overwriteParamKey: 'overwriteFrames' | 'overwriteVideos';
  modelMissingMessage: string;
  aspectRatioMissingMessage: string;
  startingErrorMessage: string;
  generatingMessage: string;
}

export interface UseBatchGenerationProps {
  scriptId: number | null;
  projectId: number | null;
  model: string; // imageModel or videoModel
  aspectRatio: string;
  textModel: string;
  scenes: StoryboardScene[];
  // Additional params for video generation
  duration?: number | null;
  resolution?: string;
  onComplete?: () => void;
  onError?: (message: string) => void;
  /** 子任务完成回调（用于实时刷新单个分镜） */
  onSubTaskCompleted?: (task: WorkflowTask, storyboardId: number | null) => void;
  /** 批量生成启动回调（返回有效分镜ID列表，用于显示 per-scene 生成状态） */
  onBatchStarted?: (validSceneIds: number[], type: 'frame' | 'video') => void;
}

export interface BatchGenerationResult {
  startBatchGeneration: (overwrite: boolean) => Promise<void>;
  isGenerating: boolean;
  isCompleted: boolean;
  isFailed: boolean;
  progress: number;
  job: ReturnType<typeof useWorkflowRecovery>['job'];
  skippedScenes: SkippedSceneInfo[];
  validSceneCount: number;
}

/**
 * 批量生成通用 Hook
 * 
 * @param config 配置参数，指定生成类型、端点等
 * @param props 运行时参数，包括 scriptId、model 等
 */
export function useBatchGeneration(
  config: BatchGenerationConfig,
  props: UseBatchGenerationProps
): BatchGenerationResult {
  const {
    scriptId,
    projectId,
    model,
    aspectRatio,
    textModel,
    scenes,
    duration,
    resolution,
    onComplete,
    onError,
    onSubTaskCompleted,
    onBatchStarted
  } = props;

  const [skippedScenes, setSkippedScenes] = useState<SkippedSceneInfo[]>([]);
  const [validSceneCount, setValidSceneCount] = useState<number>(0);

  const recovery = useWorkflowRecovery({
    projectId,
    workflowTypes: [config.workflowType],
    isActive: true,
    onCompleted: () => {
      console.log(`${config.logPrefix} 批量生成完成`);
      onComplete?.();
    },
    onFailed: (failedJob) => {
      console.error(`${config.logPrefix} 批量生成失败:`, failedJob.error_message);
      onError?.(`${config.startingErrorMessage}: ` + (failedJob.error_message || '未知错误'));
    },
    onSubTaskCompleted: (task, job) => {
      // 从任务的 input_params 中获取 storyboardId
      const params = task.input_params || {};
      const storyboardId = params.storyboardId || null;
      console.log(`${config.logPrefix} 子任务完成，分镜ID:`, storyboardId);
      onSubTaskCompleted?.(task, storyboardId);
    },
    logPrefix: config.logPrefix
  });

  const startBatchGeneration = useCallback(async (overwrite: boolean) => {
    if (recovery.isGenerating) {
      onError?.(config.generatingMessage);
      return;
    }
    // 允许无剧本模式：scriptId 为 null 时，使用 projectId 作为关联
    if (!scriptId && !projectId) {
      onError?.('请先选择项目或剧本');
      return;
    }
    if (!model) {
      onError?.(config.modelMissingMessage);
      return;
    }
    if (!aspectRatio) {
      onError?.(config.aspectRatioMissingMessage);
      return;
    }
    // Video-specific validation
    if (config.type === 'video' && (duration === null || duration === undefined)) {
      onError?.('当前视频模型未配置可用时长');
      return;
    }

    // Reset skipped scenes
    setSkippedScenes([]);
    setValidSceneCount(0);

    // Partial batch validation: partition scenes into valid and invalid
    let validSceneIds: number[] = [];
    const skipped: SkippedSceneInfo[] = [];

    if (projectId && scenes.length > 0) {
      const scenesWithId = scenes.filter(s => s.id != null) as { id: number; characters: string[]; location: string }[];
      
      if (scenesWithId.length > 0 && scriptId) {
        try {
          const response = await batchValidateScenes(
            scenesWithId.map(s => s.id),
            scriptId,
            config.type
          );

          // Partition scenes based on validation results
          for (const result of response.results) {
            if (result.ready) {
              validSceneIds.push(result.sceneId);
            } else {
              skipped.push({
                sceneId: result.sceneId,
                reasons: result.blockingIssues
              });
            }
          }
        } catch (err) {
          console.error(`${config.logPrefix} 预检失败:`, err);
          // On validation failure, try to generate all scenes (let backend handle validation)
          validSceneIds = scenesWithId.map(s => s.id);
        }
      } else {
        // No scenes with ID, generate all
        validSceneIds = scenesWithId.map(s => s.id);
      }
    }

    // Update state with skipped scenes info
    setSkippedScenes(skipped);
    setValidSceneCount(validSceneIds.length);

    // If no valid scenes, report error
    if (validSceneIds.length === 0 && scenes.length > 0) {
      onError?.('所有分镜都因资源不完整被跳过，请先完善角色和场景资源');
      return;
    }

    try {
      const token = getAuthToken();
      
      // Build request body based on type
      const body: Record<string, unknown> = {
        textModel,
        aspectRatio,
        projectId,
        validSceneIds: validSceneIds.length > 0 ? validSceneIds : undefined,
      };
      
      if (resolution) body.resolution = resolution;
      
      // Add model with correct key
      body[config.modelParamKey] = model;
      // Add overwrite flag with correct key
      body[config.overwriteParamKey] = overwrite;
      
      // Add duration for video type
      if (config.type === 'video' && duration !== undefined && duration !== null) {
        body.duration = duration;
      }

      // 无剧本模式：使用 projectId 作为路径参数
      const endpointUrl = scriptId ? `${config.endpoint}/${scriptId}` : `${config.endpoint}/project/${projectId}`;
      const res = await fetch(endpointUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        },
        body: JSON.stringify(body)
      });

      const data = await res.json();

      if (data.jobId && (res.ok || res.status === 409)) {
        console.log(`${config.logPrefix} 任务已启动, jobId:`, data.jobId);
        recovery.startJob(data.jobId);
        // 通知调用方批量生成已启动，传递有效分镜 ID 列表
        onBatchStarted?.(validSceneIds, config.type);
      } else {
        onError?.(data.message || config.startingErrorMessage);
      }
    } catch (error) {
      console.error(`${config.logPrefix} 启动失败:`, error);
      onError?.(`${config.startingErrorMessage}，请检查网络连接`);
    }
  }, [scriptId, model, aspectRatio, textModel, projectId, scenes, duration, resolution, recovery, onError, onBatchStarted, config]);

  return {
    startBatchGeneration,
    isGenerating: recovery.isGenerating,
    isCompleted: recovery.isCompleted,
    isFailed: recovery.isFailed,
    progress: recovery.overallProgress,
    job: recovery.job,
    skippedScenes,
    validSceneCount
  };
}

// Pre-configured configs for frame and video generation
export const FRAME_GENERATION_CONFIG: BatchGenerationConfig = {
  type: 'frame',
  endpoint: '/api/storyboards/batch-generate-frames',
  workflowType: 'batch_frame_generation',
  logPrefix: '[useBatchFrameGen]',
  modelParamKey: 'imageModel',
  overwriteParamKey: 'overwriteFrames',
  modelMissingMessage: '请先选择图片模型',
  aspectRatioMissingMessage: '当前图片模型未配置可用长宽比',
  startingErrorMessage: '批量帧生成失败',
  generatingMessage: '批量帧生成任务正在进行中'
};

export const VIDEO_GENERATION_CONFIG: BatchGenerationConfig = {
  type: 'video',
  endpoint: '/api/storyboards/batch-generate-videos',
  workflowType: 'batch_scene_video_generation',
  logPrefix: '[useBatchSceneVideoGen]',
  modelParamKey: 'videoModel',
  overwriteParamKey: 'overwriteVideos',
  modelMissingMessage: '请先选择视频模型',
  aspectRatioMissingMessage: '当前视频模型未配置可用长宽比',
  startingErrorMessage: '批量视频生成失败',
  generatingMessage: '批量视频生成任务正在进行中'
};
