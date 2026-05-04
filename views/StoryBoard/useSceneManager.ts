import { useState, useEffect, useRef } from 'react';
import { getAuthToken } from '../../services/auth';
import { DirectorParams } from '../SimpleStoryBoard/DirectorAssistant';
import { useToast } from '../../contexts/ToastContext';
import { ShotLanguage } from '../../types/shotLanguage';

export interface LinkedCharacter {
  character_id: number;
  role_type?: string;
  name: string;
  appearance?: string;
  image_url?: string;
  // 白膜/服装分层信息（来自 queryLinks 的 LEFT JOIN）
  base_appearance?: string;        // 白膜体貌描述
  outfit_appearance?: string;      // 服装外貌描述
  base_front_view_url?: string;    // 白膜正面图 URL
  has_base_model?: number;         // 是否有白膜状态（1=有）
  active_state_name?: string;      // 当前激活状态名称
  active_state_outfit?: string;    // 当前激活状态服装描述
  active_state_image_url?: string; // 当前激活状态正面图 URL
}

export interface LinkedScene {
  scene_id: number;
  name: string;
  description?: string;
  image_url?: string;
}

// 分镜空间描述接口
export interface CharacterPosition {
  name: string;
  position: string;
  depth?: string;
  facing?: string;
}

export interface SpatialDescription {
  characterPositions?: CharacterPosition[];
  cameraAngle?: string;
  spatialRelationship?: string;
  environmentDepth?: string;
}

export interface DialogueLine {
  character: string;
  line: string;
}

export interface StoryboardScene {
  id: number;
  order: number;
  description: string;           // 图片提示词（对应 prompt_template）
  baseDescription?: string;      // 原始分镜描述（对应 description）
  dialogue: string;
  dialogues: DialogueLine[];
  voiceover: string;
  duration: number;
  imageUrl?: string;
  videoUrl?: string;
  characters: string[];
  props: string[];
  location: string;
  shotType?: string;
  emotion?: string;
  hasAction?: boolean;
  startFrame?: string;
  endFrame?: string;
  startFrameDesc?: string;
  endFrameDesc?: string;
  cameraMovement?: string;
  endState?: string;
  linkedCharacters?: LinkedCharacter[];
  linkedScenes?: LinkedScene[];
  directorParams?: DirectorParams;  // 导演参数
  spatialDescription?: SpatialDescription;  // 空间描述
  // 草图相关字段
  sketchUrl?: string;           // 草图图片 URL
  sketchType?: string;          // 草图类型 (stick_figure / storyboard_sketch / detailed_lineart)
  sketchData?: unknown;         // Excalidraw 矢量数据，用于回显编辑
  controlStrength?: number;     // 控制强度 (0.0 ~ 1.0)
  // 镜头语言参数
  shotLanguage?: ShotLanguage;  // 专业镜头参数
  isLocked?: boolean;           // 是否锁定
  negativePrompt?: string;      // 反向提示词
  videoPrompt?: string;          // 视频生成专用提示词
  firstFramePrompt?: string;     // 图片首帧专用提示词（对应 first_frame_prompt）
  lastFramePrompt?: string;      // 图片尾帧专用提示词（对应 last_frame_prompt）
  // 分镜级角色状态覆写：characterId -> { stateId, stateName, stateImage, stateOutfit }
  characterStates?: Record<number, { stateId: number; stateName: string; stateImage?: string; stateOutfit?: string }>;
}

export const useSceneManager = (scriptId: number | null, projectId?: number | null, episodeNumber?: number) => {
  const [scenes, setScenes] = useState<StoryboardScene[]>([]);
  const [selectedScene, setSelectedScene] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const { showToast } = useToast();

  // 使用 ref 跟踪当前正在加载的 key，防止竞态条件
  // key 形如 "script:123" 或 "project:456:ep:2"
  const loadingKeyRef = useRef<string | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  // standalone 模式下使用的集数，未提供时默认 1（与后端行为一致）
  const effectiveEpisode = Number.isFinite(episodeNumber) && (episodeNumber as number) >= 1 ? (episodeNumber as number) : 1;

  // scriptId / projectId / episodeNumber 变化时重新加载
  useEffect(() => {
    if (scriptId) {
      loadStoryboards(scriptId);
    } else if (projectId) {
      loadStandaloneStoryboards(projectId, effectiveEpisode);
    } else {
      setScenes([]);
      setSelectedScene(null);
    }

    // 清理函数：取消正在进行的请求
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
        abortControllerRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scriptId, projectId, effectiveEpisode]);

  // 监听任务完成事件，刷新分镜数据
  useEffect(() => {
    if (!scriptId && !projectId) return;

    let debounceTimer: ReturnType<typeof setTimeout> | null = null;

    const handleTaskCompleted = (event: Event) => {
      const customEvent = event as CustomEvent<{ completedJobIds: number[] }>;
      console.log('[useSceneManager] 收到任务完成事件，准备刷新分镜数据', customEvent.detail);

      // 使用防抖，避免短时间内多次刷新
      if (debounceTimer) {
        clearTimeout(debounceTimer);
      }
      debounceTimer = setTimeout(() => {
        console.log('[useSceneManager] 执行分镜数据刷新');
        if (scriptId) {
          loadStoryboards(scriptId);
        } else if (projectId) {
          loadStandaloneStoryboards(projectId, effectiveEpisode);
        }
      }, 500);
    };

    window.addEventListener('storyboard:taskCompleted', handleTaskCompleted);

    return () => {
      window.removeEventListener('storyboard:taskCompleted', handleTaskCompleted);
      if (debounceTimer) {
        clearTimeout(debounceTimer);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scriptId, projectId, effectiveEpisode]);

  // 公共：将后端响应数据映射为前端 StoryboardScene[]
  const mapStoryboardItems = (data: any[]): StoryboardScene[] => {
    return data.map((item: any, index: number) => {
      const vars = item.variables || {};
      return {
        id: item.id || Date.now() + index,
        order: item.index || item.idx || index + 1,
        description: item.prompt_template || '',
        baseDescription: item.description || '',
        dialogue: vars.dialogue || '',
        dialogues: Array.isArray(vars.dialogues) ? vars.dialogues : [],
        voiceover: vars.voiceover || '',
        duration: vars.duration || 3,
        imageUrl: item.image_ref || undefined,
        videoUrl: item.video_url || vars.videoUrl || undefined,
        characters: vars.characters || [],
        props: vars.props || [],
        location: vars.location || '',
        shotType: vars.shotType || '',
        emotion: vars.emotion || '',
        hasAction: vars.hasAction || false,
        startFrame: item.first_frame_url || undefined,
        endFrame: item.last_frame_url || undefined,
        startFrameDesc: vars.startFrame || undefined,
        endFrameDesc: vars.endFrame || undefined,
        cameraMovement: vars.cameraMovement || undefined,
        endState: vars.endState || undefined,
        linkedCharacters: item.linkedCharacters || [],
        linkedScenes: item.linkedScenes || [],
        directorParams: vars.directorParams || undefined,
        spatialDescription: item.spatial_description || undefined,
        sketchUrl: item.sketch_url || undefined,
        sketchType: item.sketch_type || undefined,
        sketchData: item.sketch_data || undefined,
        controlStrength: item.control_strength ?? undefined,
        negativePrompt: item.negative_prompt || undefined,
        videoPrompt: item.video_prompt || undefined,
        firstFramePrompt: item.first_frame_prompt || undefined,
        lastFramePrompt: item.last_frame_prompt || undefined,
        characterStates: vars.characterStates || undefined,
        isLocked: item.is_locked || false
      } as StoryboardScene;
    });
  };

  const loadStoryboards = async (targetScriptId: number) => {
    if (!targetScriptId) return;

    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    const abortController = new AbortController();
    abortControllerRef.current = abortController;
    const key = `script:${targetScriptId}`;
    loadingKeyRef.current = key;

    setIsLoading(true);
    try {
      const token = getAuthToken();
      const res = await fetch(`/api/storyboards/${targetScriptId}`, {
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        },
        signal: abortController.signal
      });

      if (loadingKeyRef.current !== key) {
        console.log('[useSceneManager] 请求已过期，忽略结果');
        return;
      }

      if (res.ok) {
        const data = await res.json();
        console.log('[useSceneManager] 加载分镜数据(script)，原始数据:', data.length, '条');

        if (data && data.length > 0) {
          const loadedScenes = mapStoryboardItems(data);
          setScenes(loadedScenes);
          if (loadedScenes.length > 0) {
            setSelectedScene(loadedScenes[0].id);
          }
        } else {
          setScenes([]);
        }
      }
    } catch (error: any) {
      if (error.name === 'AbortError') {
        console.log('[useSceneManager] 请求已取消');
        return;
      }
      console.error('加载分镜失败:', error);
    } finally {
      if (loadingKeyRef.current === key) {
        setIsLoading(false);
        abortControllerRef.current = null;
      }
    }
  };

  // 自由分镜加载：GET /api/storyboards/project/:projectId/standalone?episode=N
  const loadStandaloneStoryboards = async (targetProjectId: number, episode: number = 1) => {
    if (!targetProjectId) return;

    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    const abortController = new AbortController();
    abortControllerRef.current = abortController;
    const key = `project:${targetProjectId}:ep:${episode}`;
    loadingKeyRef.current = key;

    setIsLoading(true);
    try {
      const token = getAuthToken();
      const res = await fetch(`/api/storyboards/project/${targetProjectId}/standalone?episode=${episode}`, {
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        },
        signal: abortController.signal
      });

      if (loadingKeyRef.current !== key) {
        console.log('[useSceneManager] 请求已过期，忽略结果');
        return;
      }

      if (res.ok) {
        const data = await res.json();
        console.log('[useSceneManager] 加载自由分镜数据(project)，原始数据:', data.length, '条');

        if (data && data.length > 0) {
          const loadedScenes = mapStoryboardItems(data);
          setScenes(loadedScenes);
          if (loadedScenes.length > 0) {
            setSelectedScene(loadedScenes[0].id);
          }
        } else {
          setScenes([]);
          setSelectedScene(null);
        }
      }
    } catch (error: any) {
      if (error.name === 'AbortError') {
        return;
      }
      console.error('加载自由分镜失败:', error);
    } finally {
      if (loadingKeyRef.current === key) {
        setIsLoading(false);
        abortControllerRef.current = null;
      }
    }
  };

  const addScene = async () => {
    await insertScene(scenes.length);
  };

  const insertScene = async (atIndex: number) => {
    const variables_json = {
      dialogue: '',
      duration: 5,
      characters: [],
      props: [],
      location: '',
      shotType: '中景',
      emotion: ''
    };

    // 先用临时 ID 立即显示，再替换为真实 ID
    const tempId = Date.now();
    const newScene: StoryboardScene = {
      id: tempId,
      order: atIndex + 1,
      description: '',
      baseDescription: '',
      dialogue: '',
      dialogues: [],
      voiceover: '',
      duration: 5,
      characters: [],
      props: [],
      location: ''
    };

    // 在指定位置插入
    setScenes(prev => {
      const newScenes = [...prev];
      newScenes.splice(atIndex, 0, newScene);
      // 重新计算 order
      return newScenes.map((s, i) => ({ ...s, order: i + 1 }));
    });

    if (scriptId) {
      try {
        const token = getAuthToken();
        // 1. 创建新分镜（剧集模式）
        const res = await fetch('/api/storyboards/add', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {})
          },
          body: JSON.stringify({ scriptId, idx: atIndex, description: '', variables_json })
        });
        if (res.ok) {
          const data = await res.json();
          // 用真实 DB ID 替换临时 ID
          setScenes(prev => {
            const newScenes = prev.map(s => s.id === tempId ? { ...s, id: data.id } : s);
            // 重新排序所有分镜
            return newScenes.map((s, i) => ({ ...s, order: i + 1 }));
          });
          console.log('[useSceneManager] 分镜已保存到数据库, id:', data.id);

          // 2. 重新排序所有分镜的 idx
          setScenes(prev => {
            const newScenes = prev.map(s => s.id === tempId ? { ...s, id: data.id } : s);
            const sorted = newScenes.sort((a, b) => a.order - b.order);
            const reorderBody = sorted.map((s, i) => ({ id: s.id, idx: i }));

            // 异步调用 reorder API
            fetch('/api/storyboards/reorder', {
              method: 'PATCH',
              headers: {
                'Content-Type': 'application/json',
                ...(token ? { Authorization: `Bearer ${token}` } : {})
              },
              body: JSON.stringify({ scriptId, order: reorderBody })
            }).then(() => {
              console.log('[useSceneManager] 分镜顺序已重新排序');
            }).catch(err => {
              console.error('[useSceneManager] 重新排序失败:', err);
            });

            return sorted.map((s, i) => ({ ...s, order: i + 1 }));
          });
        } else {
          console.error('[useSceneManager] 保存分镜失败:', await res.text());
        }
      } catch (err) {
        console.error('[useSceneManager] 保存分镜网络错误:', err);
      }
    } else if (projectId) {
      // 自由分镜模式：无 scriptId，仅传 projectId
      try {
        const token = getAuthToken();
        const res = await fetch('/api/storyboards/add', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {})
          },
          body: JSON.stringify({ projectId, idx: atIndex, description: '', variables_json, episodeNumber: effectiveEpisode })
        });
        if (res.ok) {
          const data = await res.json();
          setScenes(prev => {
            const newScenes = prev.map(s => s.id === tempId ? { ...s, id: data.id } : s);
            return newScenes.map((s, i) => ({ ...s, order: i + 1 }));
          });
          console.log('[useSceneManager] 自由分镜已保存到数据库, id:', data.id);

          setScenes(prev => {
            const newScenes = prev.map(s => s.id === tempId ? { ...s, id: data.id } : s);
            const sorted = newScenes.sort((a, b) => a.order - b.order);
            const reorderBody = sorted.map((s, i) => ({ id: s.id, idx: i }));

            fetch('/api/storyboards/reorder', {
              method: 'PATCH',
              headers: {
                'Content-Type': 'application/json',
                ...(token ? { Authorization: `Bearer ${token}` } : {})
              },
              body: JSON.stringify({ projectId, order: reorderBody })
            }).then(() => {
              console.log('[useSceneManager] 自由分镜顺序已重新排序');
            }).catch(err => {
              console.error('[useSceneManager] 自由分镜重新排序失败:', err);
            });

            return sorted.map((s, i) => ({ ...s, order: i + 1 }));
          });
        } else {
          console.error('[useSceneManager] 保存自由分镜失败:', await res.text());
        }
      } catch (err) {
        console.error('[useSceneManager] 保存自由分镜网络错误:', err);
      }
    }
  };

  const deleteScene = async (id: number) => {
    console.log('[useSceneManager] deleteScene 调用, id:', id, 'type:', typeof id, 'scriptId:', scriptId);
    // 本地新增的分镜（Date.now() 生成的 ID 远大于数据库自增 ID）无需调用后端
    const isLocalOnly = id > 1_000_000_000;
    console.log('[useSceneManager] isLocalOnly:', isLocalOnly);
    if (!isLocalOnly) {
      try {
        const token = getAuthToken();
        const url = `/api/storyboards/scene/${id}`;
        console.log('[useSceneManager] DELETE 请求:', url, 'token:', token ? '有' : '无');
        const res = await fetch(url, {
          method: 'DELETE',
          headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) }
        });
        console.log('[useSceneManager] DELETE 响应: status=', res.status, 'statusText=', res.statusText);
        if (!res.ok && res.status !== 404) {
          const data = await res.json().catch(() => ({}));
          console.error('[useSceneManager] 删除分镜失败: status=', res.status, 'body=', JSON.stringify(data));
          return;
        }
        if (res.status === 404) {
          console.warn('[useSceneManager] 分镜在服务端已不存在, id:', id);
        } else {
          const resData = await res.json().catch(() => ({}));
          console.log('[useSceneManager] 删除成功, 响应:', JSON.stringify(resData));
        }
      } catch (err) {
        console.error('[useSceneManager] 删除分镜网络错误:', err);
        return;
      }
    } else {
      console.log('[useSceneManager] 删除本地分镜:', id);
    }
    setScenes(prev => prev.filter(s => s.id !== id));
  };

  const moveScene = (id: number, direction: 'up' | 'down') => {
    const index = scenes.findIndex(s => s.id === id);
    let newScenes: StoryboardScene[] | null = null;
    if (direction === 'up' && index > 0) {
      newScenes = [...scenes];
      [newScenes[index], newScenes[index - 1]] = [newScenes[index - 1], newScenes[index]];
    } else if (direction === 'down' && index < scenes.length - 1) {
      newScenes = [...scenes];
      [newScenes[index], newScenes[index + 1]] = [newScenes[index + 1], newScenes[index]];
    }
    if (newScenes) {
      setScenes(newScenes);
      persistReorder(newScenes);
    }
  };

  // 更新图片提示词（对应 prompt_template）
  const updateDescription = async (id: number, description: string) => {
    const previousScene = scenes.find((scene) => scene.id === id);
    if (!previousScene) {
      return false;
    }

    setScenes(prevScenes => prevScenes.map(s => s.id === id ? { ...s, description } : s));

    try {
      const token = getAuthToken();
      const res = await fetch(`/api/storyboards/${id}/content`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        },
        body: JSON.stringify({ prompt_template: description })
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.message || '保存图片提示词失败');
      }

      return true;
    } catch (error: any) {
      setScenes(prevScenes => prevScenes.map(s =>
        s.id === id ? { ...s, description: previousScene.description } : s
      ));
      console.error('保存图片提示词失败:', error);
      showToast('保存图片提示词失败，请稍后重试', 'error');
      return false;
    }
  };

  // 更新原始分镜描述（对应 description 字段）
  const updateBaseDescription = async (id: number, baseDescription: string) => {
    const previousScene = scenes.find((scene) => scene.id === id);
    if (!previousScene) {
      return false;
    }

    setScenes(prevScenes => prevScenes.map(s => s.id === id ? { ...s, baseDescription } : s));

    try {
      const token = getAuthToken();
      const res = await fetch(`/api/storyboards/${id}/content`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        },
        body: JSON.stringify({ description: baseDescription })
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.message || '保存分镜描述失败');
      }

      return true;
    } catch (error: any) {
      setScenes(prevScenes => prevScenes.map(s =>
        s.id === id ? { ...s, baseDescription: previousScene.baseDescription } : s
      ));
      console.error('保存分镜描述失败:', error);
      showToast('保存分镜描述失败，请稍后重试', 'error');
      return false;
    }
  };

  const updateVideoPrompt = async (id: number, videoPrompt: string) => {
    const previousScene = scenes.find((scene) => scene.id === id);
    if (!previousScene) {
      return false;
    }

    setScenes(prevScenes => prevScenes.map(s => s.id === id ? { ...s, videoPrompt } : s));

    try {
      const token = getAuthToken();
      const res = await fetch(`/api/storyboards/${id}/content`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        },
        body: JSON.stringify({ video_prompt: videoPrompt })
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.message || '保存视频提示词失败');
      }

      return true;
    } catch (error: any) {
      setScenes(prevScenes => prevScenes.map(s =>
        s.id === id ? { ...s, videoPrompt: previousScene.videoPrompt } : s
      ));
      console.error('保存视频提示词失败:', error);
      showToast('保存视频提示词失败，请稍后重试', 'error');
      return false;
    }
  };

  // 更新图片首帧专用提示词（对应 first_frame_prompt）
  const updateFirstFramePrompt = async (id: number, firstFramePrompt: string) => {
    const previousScene = scenes.find((scene) => scene.id === id);
    if (!previousScene) return false;

    setScenes(prevScenes => prevScenes.map(s => s.id === id ? { ...s, firstFramePrompt } : s));

    try {
      const token = getAuthToken();
      const res = await fetch(`/api/storyboards/${id}/content`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        },
        body: JSON.stringify({ first_frame_prompt: firstFramePrompt })
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.message || '保存首帧提示词失败');
      }

      return true;
    } catch (error: any) {
      setScenes(prevScenes => prevScenes.map(s =>
        s.id === id ? { ...s, firstFramePrompt: previousScene.firstFramePrompt } : s
      ));
      console.error('保存首帧提示词失败:', error);
      showToast('保存首帧提示词失败，请稍后重试', 'error');
      return false;
    }
  };

  // 更新图片尾帧专用提示词（对应 last_frame_prompt）
  const updateLastFramePrompt = async (id: number, lastFramePrompt: string) => {
    const previousScene = scenes.find((scene) => scene.id === id);
    if (!previousScene) return false;

    setScenes(prevScenes => prevScenes.map(s => s.id === id ? { ...s, lastFramePrompt } : s));

    try {
      const token = getAuthToken();
      const res = await fetch(`/api/storyboards/${id}/content`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        },
        body: JSON.stringify({ last_frame_prompt: lastFramePrompt })
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.message || '保存尾帧提示词失败');
      }

      return true;
    } catch (error: any) {
      setScenes(prevScenes => prevScenes.map(s =>
        s.id === id ? { ...s, lastFramePrompt: previousScene.lastFramePrompt } : s
      ));
      console.error('保存尾帧提示词失败:', error);
      showToast('保存尾帧提示词失败，请稍后重试', 'error');
      return false;
    }
  };

  // 更新视频首尾帧提示词（新版，支持首尾帧分离）
  const updateVideoStartEndPrompts = async (id: number, videoStartPrompt: string, videoEndPrompt?: string) => {
    const previousScene = scenes.find((scene) => scene.id === id);
    if (!previousScene) return false;

    try {
      const token = getAuthToken();
      const body: any = { video_start_prompt: videoStartPrompt };
      if (videoEndPrompt !== undefined) body.video_end_prompt = videoEndPrompt;

      const res = await fetch(`/api/storyboards/${id}/content`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        },
        body: JSON.stringify(body)
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.message || '保存视频提示词失败');
      }

      return true;
    } catch (error: any) {
      console.error('保存视频首尾帧提示词失败:', error);
      showToast('保存视频提示词失败，请稍后重试', 'error');
      return false;
    }
  };

  // 更新导演参数并保存到后端
  const updateDirectorParams = async (id: number, directorParams: DirectorParams) => {
    // 先更新本地状态
    setScenes(prevScenes => prevScenes.map(s => s.id === id ? { ...s, directorParams } : s));

    // 保存到后端（通过更新 variables_json）
    try {
      const token = getAuthToken();
      const res = await fetch(`/api/storyboards/${id}/director-params`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        },
        body: JSON.stringify({ directorParams })
      });
      if (res.ok) {
        console.log('[useSceneManager] 导演参数已保存');
      } else {
        console.error('[useSceneManager] 保存导演参数失败:', res.statusText);
      }
    } catch (err) {
      console.error('[useSceneManager] 保存导演参数网络错误:', err);
    }
  };

  const reorderScenes = (newScenes: StoryboardScene[]) => {
    setScenes(newScenes);
    persistReorder(newScenes);
  };

  // 更新结构化台词并保存到后端
  const updateDialogues = async (id: number, dialogues: DialogueLine[]) => {
    const previousScene = scenes.find((scene) => scene.id === id);
    if (!previousScene) return false;

    // 先更新本地状态
    const flatDialogue = dialogues.length > 0 ? dialogues.map(d => d.line).join('；') : '';
    setScenes(prev => prev.map(s => s.id === id ? { ...s, dialogues, dialogue: flatDialogue } : s));

    try {
      const token = getAuthToken();
      const res = await fetch(`/api/storyboards/${id}/content`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        },
        body: JSON.stringify({ dialogues })
      });

      if (!res.ok) {
        throw new Error('保存台词失败');
      }
      return true;
    } catch (error: any) {
      // 回滚
      setScenes(prev => prev.map(s =>
        s.id === id ? { ...s, dialogues: previousScene.dialogues, dialogue: previousScene.dialogue } : s
      ));
      console.error('保存台词失败:', error);
      showToast('保存台词失败，请稍后重试', 'error');
      return false;
    }
  };

  // 更新画外音并保存到后端
  const updateVoiceover = async (id: number, voiceover: string) => {
    const previousScene = scenes.find((scene) => scene.id === id);
    if (!previousScene) return false;

    // 先更新本地状态
    setScenes(prev => prev.map(s => s.id === id ? { ...s, voiceover } : s));

    try {
      const token = getAuthToken();
      const res = await fetch(`/api/storyboards/${id}/content`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        },
        body: JSON.stringify({ voiceover })
      });

      if (!res.ok) {
        throw new Error('保存画外音失败');
      }
      return true;
    } catch (error: any) {
      // 回滚
      setScenes(prev => prev.map(s =>
        s.id === id ? { ...s, voiceover: previousScene.voiceover } : s
      ));
      console.error('保存画外音失败:', error);
      showToast('保存画外音失败，请稍后重试', 'error');
      return false;
    }
  };

  // 更新分镜的角色和场景
  const updateCharactersAndLocation = async (id: number, characters: string[], location: string, characterIds?: number[], sceneId?: number) => {
    const previousScene = scenes.find((scene) => scene.id === id);
    if (!previousScene) return false;

    // 本地先更新
    setScenes(prevScenes => prevScenes.map(s =>
      s.id === id ? { ...s, characters, location } : s
    ));

    try {
      const token = getAuthToken();
      const body: Record<string, unknown> = { characters, location };
      if (characterIds && characterIds.length > 0) body.characterIds = characterIds;
      if (sceneId) body.sceneId = sceneId;

      const res = await fetch(`/api/storyboards/${id}/content`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        },
        body: JSON.stringify(body)
      });

      if (!res.ok) {
        throw new Error('保存角色/影棚失败');
      }
      return true;
    } catch (error: any) {
      // 回滚
      setScenes(prevScenes => prevScenes.map(s =>
        s.id === id ? { ...s, characters: previousScene.characters, location: previousScene.location } : s
      ));
      console.error('保存角色/场景失败:', error);
      showToast('保存角色/影棚失败，请稍后重试', 'error');
      return false;
    }
  };

  // 将排序持久化到后端
  const persistReorder = async (orderedScenes: StoryboardScene[]) => {
    if (!scriptId && !projectId) return;
    try {
      const token = getAuthToken();
      const order = orderedScenes.map((s, i) => ({ id: s.id, idx: i }));
      const body: Record<string, unknown> = { order };
      if (scriptId) {
        body.scriptId = scriptId;
      } else if (projectId) {
        body.projectId = projectId;
      }
      const res = await fetch('/api/storyboards/reorder', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        },
        body: JSON.stringify(body)
      });
      if (res.ok) {
        console.log('[useSceneManager] 排序已保存到数据库');
      } else {
        console.error('[useSceneManager] 保存排序失败:', res.statusText);
      }
    } catch (err) {
      console.error('[useSceneManager] 保存排序网络错误:', err);
    }
  };

  // 更新分镜时长并保存到后端
  const updateDuration = async (id: number, duration: number) => {
    const previousScene = scenes.find((scene) => scene.id === id);
    if (!previousScene) return false;

    // 本地先更新
    setScenes(prevScenes => prevScenes.map(s =>
      s.id === id ? { ...s, duration } : s
    ));

    try {
      const token = getAuthToken();
      const res = await fetch(`/api/storyboards/${id}/content`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        },
        body: JSON.stringify({ duration })
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.message || '保存时长失败');
      }

      return true;
    } catch (error: any) {
      // 回滚
      setScenes(prevScenes => prevScenes.map(s =>
        s.id === id ? { ...s, duration: previousScene.duration } : s
      ));
      console.error('保存时长失败:', error);
      showToast('保存时长失败，请稍后重试', 'error');
      return false;
    }
  };

  const updateProps = async (id: number, props: string[]) => {
    const previousScene = scenes.find((scene) => scene.id === id);
    if (!previousScene) return false;

    // 本地先更新
    setScenes(prevScenes => prevScenes.map(s =>
      s.id === id ? { ...s, props } : s
    ));

    try {
      const token = getAuthToken();
      const res = await fetch(`/api/storyboards/${id}/content`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        },
        body: JSON.stringify({ props })
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.message || '保存道具失败');
      }

      return true;
    } catch (error: any) {
      // 回滚
      setScenes(prevScenes => prevScenes.map(s =>
        s.id === id ? { ...s, props: previousScene.props } : s
      ));
      console.error('保存道具失败:', error);
      showToast('保存道具失败，请稍后重试', 'error');
      return false;
    }
  };

  // 更新景别并保存到后端
  const updateShotType = async (id: number, shotType: string) => {
    const previousScene = scenes.find((scene) => scene.id === id);
    if (!previousScene) return false;

    // 本地先更新
    setScenes(prevScenes => prevScenes.map(s =>
      s.id === id ? { ...s, shotType } : s
    ));

    try {
      const token = getAuthToken();
      const res = await fetch(`/api/storyboards/${id}/content`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        },
        body: JSON.stringify({ shotType })
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.message || '保存景别失败');
      }

      return true;
    } catch (error: any) {
      // 回滚
      setScenes(prevScenes => prevScenes.map(s =>
        s.id === id ? { ...s, shotType: previousScene.shotType } : s
      ));
      console.error('保存景别失败:', error);
      showToast('保存景别失败，请稍后重试', 'error');
      return false;
    }
  };

  // 更新分镜级角色状态覆写
  const updateCharacterStates = async (id: number, characterStates: Record<number, { stateId: number; stateName: string; stateImage?: string; stateOutfit?: string }>) => {
    const previousScene = scenes.find((scene) => scene.id === id);
    if (!previousScene) return false;

    // 本地先更新
    setScenes(prevScenes => prevScenes.map(s =>
      s.id === id ? { ...s, characterStates } : s
    ));

    try {
      const token = getAuthToken();
      const res = await fetch(`/api/storyboards/${id}/content`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        },
        body: JSON.stringify({ characterStates })
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.message || '保存角色状态失败');
      }

      return true;
    } catch (error: any) {
      // 回滚
      setScenes(prevScenes => prevScenes.map(s =>
        s.id === id ? { ...s, characterStates: previousScene.characterStates } : s
      ));
      console.error('保存角色状态失败:', error);
      showToast('保存角色状态失败，请稍后重试', 'error');
      return false;
    }
  };

  return {
    scenes,
    setScenes,
    selectedScene,
    setSelectedScene,
    isLoading,
    loadStoryboards,
    loadStandaloneStoryboards,
    /** 通用刷新：根据 scriptId/projectId 自动走对应端点 */
    refresh: () => {
      if (scriptId) return loadStoryboards(scriptId);
      if (projectId) return loadStandaloneStoryboards(projectId);
      return Promise.resolve();
    },
    addScene,
    insertScene,
    deleteScene,
    moveScene,
    updateDescription,
    updateBaseDescription,
    updateVideoPrompt,
    updateVideoStartEndPrompts,
    updateFirstFramePrompt,
    updateLastFramePrompt,
    updateDialogues,
    updateVoiceover,
    updateDirectorParams,
    updateCharactersAndLocation,
    updateProps,
    updateShotType,
    updateCharacterStates,
    updateDuration,
    reorderScenes
  };
}
