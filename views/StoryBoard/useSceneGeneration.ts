import { useEffect, Dispatch, SetStateAction } from 'react';
import { getAuthToken } from '../../services/auth';
import { useTaskRunner, TaskState } from '../../hooks/useTaskRunner';
import { WorkflowJob } from '../../hooks/useWorkflow';
import { StoryboardScene } from './useSceneManager';

interface UseSceneGenerationOptions {
  projectId: number | null;
  scriptId: number | null;
  episodeNumber: number;
  scenes: StoryboardScene[];
  setScenes: Dispatch<SetStateAction<StoryboardScene[]>>;
  imageModel: string;
  imageAspectRatio: string;
  textModel: string;
  videoModel: string;
  videoAspectRatio: string;
  videoDuration: number | null;
  videoResolution?: string;
}

function parseJobInputParams(inputParams: WorkflowJob['input_params']) {
  if (!inputParams) {
    return null;
  }

  if (typeof inputParams === 'string') {
    try {
      return JSON.parse(inputParams);
    } catch (error) {
      return null;
    }
  }

  return inputParams;
}

// 从工作流 job 中提取 storyboardId，映射到 task key
function jobToTaskKey(job: WorkflowJob): string | null {
  const params = parseJobInputParams(job.input_params);
  const storyboardId = params?.storyboardId;
  if (!storyboardId) return null;

  if (job.workflow_type === 'scene_video') {
    return `vid_${storyboardId}`;
  }
  return `img_${storyboardId}`;
}

function normalizeFrameResult(result: any) {
  const startFrame =
    result?.startFrame ||
    result?.firstFrameUrl ||
    result?.first_frame_url ||
    result?.imageUrl ||
    result?.image_url ||
    null;

  const endFrame =
    result?.endFrame ||
    result?.lastFrameUrl ||
    result?.last_frame_url ||
    startFrame ||
    null;

  return { startFrame, endFrame };
}

async function persistStoryboardMedia(storyboardId: number, payload: Record<string, unknown>) {
  const token = getAuthToken();

  const doFetch = () =>
    fetch(`/api/storyboards/${storyboardId}/media`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {})
      },
      body: JSON.stringify(payload)
    });

  try {
    const res = await doFetch();
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res;
  } catch (firstError) {
    console.warn('[persistStoryboardMedia] First attempt failed, retrying in 2s...', firstError);
    await new Promise((r) => setTimeout(r, 2000));
    try {
      const res = await doFetch();
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res;
    } catch (retryError) {
      console.error('[persistStoryboardMedia] Retry failed:', retryError);
      // Dispatch event for UI notification
      window.dispatchEvent(
        new CustomEvent('storyboard:mediaPersistFailed', {
          detail: { storyboardId, error: (retryError as Error).message }
        })
      );
      throw retryError;
    }
  }
}

export function useSceneGeneration({
  projectId,
  scriptId,
  episodeNumber,
  scenes,
  setScenes,
  imageModel,
  imageAspectRatio,
  textModel,
  videoModel,
  videoAspectRatio,
  videoDuration,
  videoResolution
}: UseSceneGenerationOptions) {
  const { tasks, runTask, recoverTasks, clearTask, isRunning, isTaskActive } = useTaskRunner({ projectId: projectId || 0 });

  // 页面加载时恢复未完成的单帧/视频任务
  useEffect(() => {
    if (!projectId) return;
    recoverTasks(
      ['frame_generation', 'single_frame_generation', 'scene_video'],
      jobToTaskKey
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]); // recoverTasks 是稳定的函数，不需要添加到依赖

  // 监听任务完成/失败 → 更新 scene 状态 + 保存数据库
  useEffect(() => {
    for (const [key, task] of Object.entries(tasks) as [string, TaskState][]) {
      if (!key.startsWith('img_') && !key.startsWith('vid_')) continue;

      // 失败/取消：清理任务 + localStorage 生成状态
      if (task.status === 'failed' || task.status === 'cancelled') {
        console.warn(`[useSceneGeneration] 任务${task.status}: key=${key}, error=${task.error}`);
        clearTask(key);
        continue;
      }

      if (task.status !== 'completed') continue;

      const sceneId = Number(key.split('_')[1]);
      if (!task.result) {
        console.warn(`[useSceneGeneration] 完成任务缺少结果数据: key=${key}`);
        clearTask(key);
        continue;
      }

      if (key.startsWith('img_')) {
        const { startFrame, endFrame } = normalizeFrameResult(task.result);
        if (startFrame) {
          setScenes(prev => prev.map(s =>
            s.id === sceneId
              ? { ...s, startFrame, endFrame, imageUrl: startFrame }
              : s
          ));
          void persistStoryboardMedia(sceneId, { imageUrl: startFrame, startFrame, endFrame });
        }
      } else if (key.startsWith('vid_')) {
        const videoUrl = task.result.video_url || task.result.videoUrl || task.result.url;
        if (videoUrl) {
          setScenes(prev => prev.map(s =>
            s.id === sceneId ? { ...s, videoUrl } : s
          ));
          void persistStoryboardMedia(sceneId, { videoUrl });
        }
      }

      clearTask(key);
    }
  }, [tasks, clearTask, setScenes]);

  // 启动首尾帧生成 workflow
  const generateImage = async (id: number, prompt: string, regenerateTarget?: 'first' | 'last' | 'both'): Promise<{ success: boolean; error?: string }> => {
    try {
      if (isTaskActive(`img_${id}`)) {
        return { success: false, error: '当前镜头正在生成首尾帧，请等待完成后再试' };
      }

      const sceneIdx = scenes.findIndex(s => s.id === id);
      const scene = sceneIdx >= 0 ? scenes[sceneIdx] : null;
      if (!scene) {
        return { success: false, error: '找不到分镜' };
      }

      const extraParams = {
        episodeNumber,
        storyboardIndex: sceneIdx + 1,
        isRegenerate: !!(scene.startFrame || scene.imageUrl),
        aspectRatio: imageAspectRatio
      };

      if (!imageAspectRatio) {
        return { success: false, error: '当前图片模型未配置可用长宽比' };
      }

      // 根据是否有动作选择不同的工作流
      if (scene.hasAction) {
        // 有动作：生成首尾帧
        console.log('[useSceneGeneration] 生成首尾帧（有动作）, target:', regenerateTarget || 'auto');
        await runTask(`img_${id}`, 'frame_generation', {
          storyboardId: id,
          prompt,
          imageModel,
          textModel,
          regenerateTarget,
          ...extraParams
        });
      } else {
        // 无动作：只生成单帧
        console.log('[useSceneGeneration] 生成单帧（无动作）');
        await runTask(`img_${id}`, 'single_frame_generation', {
          storyboardId: id,
          description: prompt,
          imageModel,
          textModel,
          ...extraParams
        });
      }
      
      return { success: true };
    } catch (error: any) {
      console.error('图片生成失败:', error);
      return { success: false, error: error.message || '图片生成失败' };
    }
  };

  // 启动视频生成 workflow
  const generateVideo = async (id: number): Promise<{ success: boolean; error?: string }> => {
    if (isTaskActive(`vid_${id}`)) {
      return { success: false, error: '当前镜头正在生成视频，请等待完成后再试' };
    }

    const sceneIdx = scenes.findIndex(s => s.id === id);
    const scene = sceneIdx >= 0 ? scenes[sceneIdx] : null;
    if (!scene) {
      return { success: false, error: '找不到分镜' };
    }
    if (!videoModel) {
      return { success: false, error: '请先选择视频生成模型' };
    }
    if (!videoAspectRatio) {
      return { success: false, error: '当前视频模型未配置可用长宽比' };
    }
    if (videoDuration === null) {
      return { success: false, error: '当前视频模型未配置可用时长' };
    }
    try {
      await runTask(`vid_${id}`, 'scene_video', {
        storyboardId: id,
        videoModel,
        textModel,
        duration: videoDuration,
        aspectRatio: videoAspectRatio,
        resolution: videoResolution,
        episodeNumber,
        storyboardIndex: sceneIdx + 1,
        isRegenerate: !!scene.videoUrl
      });
      return { success: true };
    } catch (error: any) {
      console.error('视频生成失败:', error);
      return { success: false, error: error.message || '视频生成失败' };
    }
  };

  // 独立删除首帧
  const deleteFirstFrame = async (sceneId: number): Promise<{ success: boolean; error?: string; warnings?: string[] }> => {
    try {
      const token = getAuthToken();
      const res = await fetch(`/api/storyboards/${sceneId}/media`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        },
        body: JSON.stringify({ firstFrameUrl: null })
      });
      
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }
      
      const data = await res.json();
      
      // 更新本地状态：只清除 startFrame
      setScenes(prev => prev.map(s => 
        s.id === sceneId 
          ? { ...s, startFrame: undefined, imageUrl: s.endFrame || undefined } 
          : s
      ));
      
      return { success: true, warnings: data.warnings };
    } catch (err: any) {
      console.error('删除首帧失败:', err);
      return { success: false, error: err.message || '删除首帧失败' };
    }
  };

  // 独立删除尾帧
  const deleteLastFrame = async (sceneId: number): Promise<{ success: boolean; error?: string }> => {
    try {
      const token = getAuthToken();
      const res = await fetch(`/api/storyboards/${sceneId}/media`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        },
        body: JSON.stringify({ lastFrameUrl: null })
      });
      
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }
      
      // 更新本地状态：只清除 endFrame
      setScenes(prev => prev.map(s => 
        s.id === sceneId ? { ...s, endFrame: undefined } : s
      ));
      
      return { success: true };
    } catch (err: any) {
      console.error('删除尾帧失败:', err);
      return { success: false, error: err.message || '删除尾帧失败' };
    }
  };

  return {
    tasks,
    isRunning,
    generateImage,
    generateVideo,
    deleteFirstFrame,
    deleteLastFrame
  };
}
