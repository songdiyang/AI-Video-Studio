import { useEffect, Dispatch, SetStateAction } from 'react';
import { getAuthToken } from '../../services/auth';
import { useTaskRunner, TaskState } from '../../hooks/useTaskRunner';
import { WorkflowJob } from '../../hooks/useWorkflow';
import { StoryboardScene } from './useSceneManager';
import { CameraGenerateParams, PaintGenerateParams } from './MagicSpace';

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

  // 注意：尾帧不再默认使用首帧的值，以支持单独重新生成首帧或尾帧
  const endFrame =
    result?.endFrame ||
    result?.lastFrameUrl ||
    result?.last_frame_url ||
    null;

  return { startFrame, endFrame };
}

/**
 * 为 URL 添加缓存破坏参数，确保浏览器加载最新内容
 * 帧图片使用固定 MinIO 路径，重新生成后 URL 不变，需要强制刷新缓存
 */
function bustCache(url: string | null | undefined): string | null {
  if (!url) return null;
  const separator = url.includes('?') ? '&' : '?';
  return `${url}${separator}v=${Date.now()}`;
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
      ['frame_generation', 'single_frame_generation', 'scene_video', 'camera_frame_generation'],
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
        // 只要有一个帧存在就更新（支持单独重新生成首帧或尾帧）
        if (startFrame || endFrame) {
          // 添加缓存破坏参数，确保浏览器加载最新帧图片
          const freshStartFrame = bustCache(startFrame);
          const freshEndFrame = bustCache(endFrame);
          setScenes(prev => prev.map(s => {
            if (s.id !== sceneId) return s;
            const updates: Partial<StoryboardScene> = {};
            // 只更新返回的帧，保留已有的帧
            if (freshStartFrame) {
              updates.startFrame = freshStartFrame;
              updates.imageUrl = freshStartFrame;
            }
            if (freshEndFrame) {
              updates.endFrame = freshEndFrame;
            }
            return { ...s, ...updates };
          }));
          // 保存到数据库时使用原始 URL（不含缓存参数）
          // 只传递实际存在的字段，避免传递 undefined 导致后端误判
          const payload: Record<string, string | null> = {};
          if (startFrame) {
            payload.imageUrl = startFrame;
            payload.startFrame = startFrame;
          }
          if (endFrame) {
            payload.endFrame = endFrame;
          }
          if (Object.keys(payload).length > 0) {
            void persistStoryboardMedia(sceneId, payload);
          }
        }
      } else if (key.startsWith('vid_')) {
        const videoUrl = task.result.video_url || task.result.videoUrl || task.result.url;
        if (videoUrl) {
          const freshVideoUrl = bustCache(videoUrl)!;
          setScenes(prev => prev.map(s =>
            s.id === sceneId ? { ...s, videoUrl: freshVideoUrl } : s
          ));
          // 保存到数据库时使用原始 URL
          void persistStoryboardMedia(sceneId, { videoUrl });
        }
      }

      clearTask(key);
    }
  }, [tasks, clearTask, setScenes]);

  // 启动首尾帧生成 workflow
  const generateImage = async (id: number, prompt: string, regenerateTarget?: 'first' | 'last' | 'both', forceRegenerate?: boolean): Promise<{ success: boolean; error?: string }> => {
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
        console.log('[useSceneGeneration] 生成首尾帧（有动作）, target:', regenerateTarget || 'auto', 'forceRegenerate:', forceRegenerate);
        await runTask(`img_${id}`, 'frame_generation', {
          storyboardId: id,
          prompt,
          imageModel,
          textModel,
          regenerateTarget,
          forceRegenerate,
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
    // 时长由分镜设置决定，使用分镜自身的 duration
    const sceneDuration = scene.duration || 3;
    try {
      await runTask(`vid_${id}`, 'scene_video', {
        storyboardId: id,
        videoModel,
        textModel,
        duration: sceneDuration, // 使用分镜的时长
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

  // 启动魔术空间-视角生成 workflow
  const generateWithCamera = async (id: number, cameraParams: CameraGenerateParams): Promise<{ success: boolean; error?: string }> => {
    try {
      if (isTaskActive(`img_${id}`)) {
        return { success: false, error: '当前镜头正在生成，请等待完成后再试' };
      }

      if (!imageModel) {
        return { success: false, error: '请先选择图片生成模型' };
      }

      // Upload composite image base64 to get a URL
      let compositeImageUrl = '';
      try {
        const base64Data = cameraParams.compositeImageBase64;
        // Convert base64 to blob
        const byteString = atob(base64Data.split(',')[1]);
        const mimeString = base64Data.split(',')[0].split(':')[1].split(';')[0];
        const ab = new ArrayBuffer(byteString.length);
        const ia = new Uint8Array(ab);
        for (let i = 0; i < byteString.length; i++) {
          ia[i] = byteString.charCodeAt(i);
        }
        const blob = new Blob([ab], { type: mimeString });

        // Upload via /api/upload
        const token = getAuthToken();
        const formData = new FormData();
        formData.append('file', blob, `camera_composite_${id}_${Date.now()}.png`);
        formData.append('path_prefix', `images/camera_composite`);

        const uploadRes = await fetch('/api/upload/general', {
          method: 'POST',
          headers: {
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: formData,
        });

        if (!uploadRes.ok) {
          throw new Error(`上传画布图片失败: HTTP ${uploadRes.status}`);
        }
        const uploadData = await uploadRes.json();
        compositeImageUrl = uploadData.url || uploadData.fileUrl || uploadData.filePath || '';
        if (!compositeImageUrl) {
          throw new Error('上传画布图片返回无效URL');
        }
      } catch (uploadErr: any) {
        console.error('[useSceneGeneration] 上传画布合成图失败:', uploadErr);
        return { success: false, error: uploadErr.message || '上传画布图片失败' };
      }

      console.log('[useSceneGeneration] 魔术空间-视角生成, mode:', cameraParams.mode, 'rotation:', {
        x: cameraParams.rotationX,
        y: cameraParams.rotationY,
        z: cameraParams.rotationZ,
      });

      const sceneIdx = scenes.findIndex(s => s.id === id);
      await runTask(`img_${id}`, 'camera_frame_generation', {
        storyboardId: id,
        compositeImageUrl,
        sourceImageUrl: cameraParams.sourceImageUrl,
        imageModel,
        textModel,
        rotationX: cameraParams.rotationX,
        rotationY: cameraParams.rotationY,
        rotationZ: cameraParams.rotationZ,
        zoomLevel: cameraParams.zoomLevel,
        mode: cameraParams.mode,
        aspectRatio: imageAspectRatio,
        episodeNumber,
        storyboardIndex: sceneIdx >= 0 ? sceneIdx + 1 : undefined,
      });

      return { success: true };
    } catch (error: any) {
      console.error('魔术空间-视角生成失败:', error);
      return { success: false, error: error.message || '魔术空间-视角生成失败' };
    }
  };

  // 启动涂改生成 workflow
  const generateWithPaint = async (id: number, paintParams: PaintGenerateParams): Promise<{ success: boolean; error?: string }> => {
    try {
      if (isTaskActive(`img_${id}`)) {
        return { success: false, error: '当前镜头正在生成，请等待完成后再试' };
      }

      if (!imageModel) {
        return { success: false, error: '请先选择图片生成模型' };
      }

      // 上传合成图
      let compositeImageUrl = '';
      try {
        const base64Data = paintParams.compositeImageBase64;
        const byteString = atob(base64Data.split(',')[1]);
        const mimeString = base64Data.split(',')[0].split(':')[1].split(';')[0];
        const ab = new ArrayBuffer(byteString.length);
        const ia = new Uint8Array(ab);
        for (let i = 0; i < byteString.length; i++) {
          ia[i] = byteString.charCodeAt(i);
        }
        const blob = new Blob([ab], { type: mimeString });
        const token = getAuthToken();
        const formData = new FormData();
        formData.append('file', blob, `paint_composite_${id}_${Date.now()}.png`);
        formData.append('path_prefix', 'images/paint_composite');

        const uploadRes = await fetch('/api/upload/general', {
          method: 'POST',
          headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
          body: formData,
        });

        if (!uploadRes.ok) throw new Error(`上传合成图失败: HTTP ${uploadRes.status}`);
        const uploadData = await uploadRes.json();
        compositeImageUrl = uploadData.url || uploadData.fileUrl || uploadData.filePath || '';
        if (!compositeImageUrl) throw new Error('上传合成图返回无效URL');
      } catch (uploadErr: any) {
        console.error('[useSceneGeneration] 上传涂改合成图失败:', uploadErr);
        return { success: false, error: uploadErr.message || '上传合成图失败' };
      }

      // 上传掩膜图
      let maskImageUrl = '';
      try {
        const base64Data = paintParams.maskImageBase64;
        const byteString = atob(base64Data.split(',')[1]);
        const mimeString = base64Data.split(',')[0].split(':')[1].split(';')[0];
        const ab = new ArrayBuffer(byteString.length);
        const ia = new Uint8Array(ab);
        for (let i = 0; i < byteString.length; i++) {
          ia[i] = byteString.charCodeAt(i);
        }
        const blob = new Blob([ab], { type: mimeString });
        const token = getAuthToken();
        const formData = new FormData();
        formData.append('file', blob, `paint_mask_${id}_${Date.now()}.png`);
        formData.append('path_prefix', 'images/paint_mask');

        const uploadRes = await fetch('/api/upload/general', {
          method: 'POST',
          headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
          body: formData,
        });

        if (!uploadRes.ok) throw new Error(`上传掩膜图失败: HTTP ${uploadRes.status}`);
        const uploadData = await uploadRes.json();
        maskImageUrl = uploadData.url || uploadData.fileUrl || uploadData.filePath || '';
        if (!maskImageUrl) throw new Error('上传掩膜图返回无效URL');
      } catch (uploadErr: any) {
        console.error('[useSceneGeneration] 上传掩膜图失败:', uploadErr);
        return { success: false, error: uploadErr.message || '上传掩膜图失败' };
      }

      console.log('[useSceneGeneration] 涂改生成, colors:', paintParams.colorInstructions.length);

      const sceneIdx = scenes.findIndex(s => s.id === id);
      await runTask(`img_${id}`, 'magic_paint_generation', {
        storyboardId: id,
        compositeImageUrl,
        maskImageUrl,
        sourceImageUrl: paintParams.sourceImageUrl,
        colorInstructions: paintParams.colorInstructions,
        imageModel,
        textModel,
        aspectRatio: imageAspectRatio,
        episodeNumber,
        storyboardIndex: sceneIdx >= 0 ? sceneIdx + 1 : undefined,
      });

      return { success: true };
    } catch (error: any) {
      console.error('涂改生成失败:', error);
      return { success: false, error: error.message || '涂改生成失败' };
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
    generateWithCamera,
    generateWithPaint,
    deleteFirstFrame,
    deleteLastFrame
  };
}
