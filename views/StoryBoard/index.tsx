import React, { useState, useEffect, useMemo, useCallback, Component, ReactNode, Suspense, lazy } from 'react';
import { Button, Select, SelectItem, Tooltip, Badge, Chip } from '@heroui/react';
import { Wand2, RefreshCw, Upload, Download, Video, ImageIcon, Users, MapPin, Frame, Film, PencilRuler, Sparkles, ChevronUp, ChevronDown, Play } from 'lucide-react';
import { useSceneManager, StoryboardScene } from './useSceneManager';
import { useAutoStoryboard } from './useAutoStoryboard';
import { useSceneGeneration } from './useSceneGeneration';
import { useBatchFrameGeneration } from './hooks/useBatchFrameGeneration';
import { useBatchSceneVideoGeneration } from './hooks/useBatchSceneVideoGeneration';
import { useWorkflowRecovery } from './hooks/useWorkflowRecovery';
import EpisodeSelector from './EpisodeSelector';
import AutoStoryboardModal from './AutoStoryboardModal';
import ImportStoryboardModal from './ImportStoryboardModal';
import BatchDownloadModal from './BatchDownloadModal';
import SceneList from './SceneList';
import ResourcePanel from './ResourcePanel';
import ScenePreviewPanel from './ScenePreviewPanel';
import { PanelGroup } from '../../components/PanelGroup';
import ResizablePanel from '../../components/ResizablePanel';
import { getAuthToken } from '../../services/auth';
import { useToast } from '../../contexts/ToastContext';
import { AIModel } from '../../components/AIModelSelector';
import { normalizeCapabilityOptions } from '../../utils/modelCapabilities';
import { useKeyboardShortcuts, ShortcutConfig, STORYBOARD_SHORTCUTS_CONFIG, VIDEO_COMPOSITION_SHORTCUTS_CONFIG } from '../../hooks/useKeyboardShortcuts';
import { generateFromSketch } from '../../services/storyboards';

// 懒加载草图组件
const SketchManager = lazy(() => import('./SketchModule/components/SketchManager'));
const SketchEditor = lazy(() => import('./SketchModule/components/SketchEditor'));

// 导入 AnimaticPreview 组件
import { AnimaticPreview } from './AnimaticPreview';

interface Script {
  id: number;
  episode_number: number;
  title: string;
  status: string;
}

// Error Boundary to catch rendering errors and prevent full-view crashes
interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

class StoryboardErrorBoundary extends Component<
  { children: ReactNode },
  ErrorBoundaryState
> {
  state: ErrorBoundaryState = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('[StoryboardErrorBoundary] Caught error:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center h-full gap-4 bg-[var(--bg-app)]">
          <p className="text-lg font-medium text-[var(--text-secondary)]">Something went wrong loading the storyboard.</p>
          <p className="text-sm text-[var(--text-muted)]">{this.state.error?.message}</p>
          <button
            onClick={() => this.setState({ hasError: false, error: null })}
            className="pro-btn-primary px-4 py-2"
          >
            Retry
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

interface StoryBoardProps {
  scriptId?: number | null;
  projectId?: number | null;
  episodeNumber?: number;
  scripts?: Script[];
  models?: AIModel[];
  textModel: string;
  imageModel: string;
  videoModel: string;
  onEpisodeChange?: (episodeNumber: number, scriptId: number) => void;
}

const StoryBoard: React.FC<StoryBoardProps> = ({
  scriptId,
  projectId,
  episodeNumber = 1,
  scripts = [],
  models = [],
  textModel,
  imageModel,
  videoModel,
  onEpisodeChange
}) => {
  const [currentScriptId, setCurrentScriptId] = useState<number | null>(scriptId || null);
  const [currentProjectId, setCurrentProjectId] = useState<number | null>(projectId || null);
  const [currentEpisode, setCurrentEpisode] = useState(episodeNumber);
  const [showImportModal, setShowImportModal] = useState(false);
  const [showBatchDownloadModal, setShowBatchDownloadModal] = useState(false);
  const [imageAspectRatio, setImageAspectRatio] = useState('');
  const [videoAspectRatio, setVideoAspectRatio] = useState('');
  const [videoDuration, setVideoDuration] = useState<number | null>(null);
  const [isSubmittingCharacterBatch, setIsSubmittingCharacterBatch] = useState(false);
  const [isSubmittingSceneBatch, setIsSubmittingSceneBatch] = useState(false);
  const [showSketchManager, setShowSketchManager] = useState(false);
  const [sketchEditorStoryboardId, setSketchEditorStoryboardId] = useState<number | null>(null);
  const [isBatchSketchGenerating, setIsBatchSketchGenerating] = useState(false);
  const [isAnimaticOpen, setIsAnimaticOpen] = useState(false);
  const { showToast } = useToast();

  // O(1) model lookup via Map
  const modelMap = useMemo(() => {
    const map = new Map<string, typeof models[number]>();
    for (const m of models) {
      map.set(m.name, m);
    }
    return map;
  }, [models]);

  const imageModelConfig = useMemo(() => {
    const model = modelMap.get(imageModel);
    return model && (model.type || model.category)?.toUpperCase() === 'IMAGE' ? model : undefined;
  }, [modelMap, imageModel]);

  const videoModelConfig = useMemo(() => {
    const model = modelMap.get(videoModel);
    return model && (model.type || model.category)?.toUpperCase() === 'VIDEO' ? model : undefined;
  }, [modelMap, videoModel]);

  const imageAspectRatioOptions = useMemo(
    () => normalizeCapabilityOptions(imageModelConfig?.supportedAspectRatios, 'aspectRatio'),
    [imageModelConfig]
  );
  const videoAspectRatioOptions = useMemo(
    () => normalizeCapabilityOptions(videoModelConfig?.supportedAspectRatios, 'aspectRatio'),
    [videoModelConfig]
  );
  const videoDurationOptions = useMemo(
    () => normalizeCapabilityOptions(videoModelConfig?.supportedDurations, 'duration'),
    [videoModelConfig]
  );

  // 同步外部 props - 合并为单个 useEffect 减少渲染开销
  useEffect(() => {
    if (scriptId !== undefined && scriptId !== currentScriptId) {
      setCurrentScriptId(scriptId || null);
    }
    if (projectId !== undefined && projectId !== currentProjectId) {
      setCurrentProjectId(projectId || null);
    }
    if (episodeNumber !== undefined && episodeNumber !== currentEpisode) {
      setCurrentEpisode(episodeNumber);
    }
  }, [scriptId, projectId, episodeNumber, currentScriptId, currentProjectId, currentEpisode]);

  useEffect(() => {
    if (imageAspectRatioOptions.length === 0) {
      setImageAspectRatio('');
      return;
    }

    setImageAspectRatio((current) =>
      imageAspectRatioOptions.some((option) => option.value === current)
        ? current
        : imageAspectRatioOptions[0].value
    );
  }, [imageAspectRatioOptions]);

  useEffect(() => {
    if (videoAspectRatioOptions.length === 0) {
      setVideoAspectRatio('');
    } else {
      setVideoAspectRatio((current) =>
        videoAspectRatioOptions.some((option) => option.value === current)
          ? current
          : videoAspectRatioOptions[0].value
      );
    }

    if (videoDurationOptions.length === 0) {
      setVideoDuration(null);
      return;
    }

    setVideoDuration((current) => {
      const currentValue = current === null ? '' : String(current);
      const matchedOption = videoDurationOptions.find((option) => option.value === currentValue);
      return matchedOption ? Number(matchedOption.value) : Number(videoDurationOptions[0].value);
    });
  }, [videoAspectRatioOptions, videoDurationOptions]);

  // 1. 分镜列表管理
  const {
    scenes,
    setScenes,
    selectedScene,
    setSelectedScene,
    isLoading,
    loadStoryboards,
    addScene,
    deleteScene,
    updateDescription,
    moveScene,
    reorderScenes
  } = useSceneManager(currentScriptId, currentProjectId);

  // 2. 自动分镜
  const autoStoryboard = useAutoStoryboard({
    scriptId: currentScriptId,
    projectId: currentProjectId,
    isActive: true,
    hasExistingScenes: scenes.length > 0,
    textModel,
    onScenesGenerated: (newScenes) => {
      setScenes(newScenes);
      if (newScenes.length > 0) setSelectedScene(newScenes[0].id);
    },
    onError: (msg) => showToast(msg, 'error'),
    loadStoryboards // 传入增量加载函数，避免整页刷新
  });

  // 5. 场景图片/视频生成
  const { generateImage, generateVideo, tasks } = useSceneGeneration({
    projectId: currentProjectId,
    scriptId: currentScriptId,
    episodeNumber: currentEpisode,
    scenes,
    setScenes,
    imageModel,
    imageAspectRatio,
    textModel,
    videoModel,
    videoAspectRatio,
    videoDuration
  });

  const characterBatchRecovery = useWorkflowRecovery({
    projectId: currentProjectId,
    workflowTypes: ['character_views_generation'],
    isActive: true,
    logPrefix: '[StoryBoardCharacterBatch]'
  });

  const sceneBatchRecovery = useWorkflowRecovery({
    projectId: currentProjectId,
    workflowTypes: ['scene_image_generation'],
    isActive: true,
    logPrefix: '[StoryBoardSceneBatch]'
  });

  // 批量生成功能
  const handleBatchCharacterGeneration = async () => {
    if (isSubmittingCharacterBatch || characterBatchRecovery.isGenerating) {
      showToast('角色批量生成任务正在进行中', 'warning');
      return;
    }
    if (!currentProjectId || !currentScriptId) {
      showToast('请先选择项目和剧本', 'warning');
      return;
    }
    if (!imageModel) {
      showToast('请先选择图像模型', 'warning');
      return;
    }
    if (!imageAspectRatio) {
      showToast('当前图片模型未配置可用长宽比', 'warning');
      return;
    }

    try {
      setIsSubmittingCharacterBatch(true);
      showToast('正在启动角色批量生成...', 'info');
      
      // 获取所有角色数据（不过滤 scriptId，角色是项目级别的）
      const token = getAuthToken();
      const charRes = await fetch(`/api/characters/project/${currentProjectId}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      if (!charRes.ok) {
        throw new Error('获取角色数据失败');
      }
      
      const result = await charRes.json();
      const characters = result.characters || [];
      
      if (characters.length === 0) {
        showToast('没有找到角色数据', 'warning');
        return;
      }
      
      // 为每个角色启动生成任务
      let startedCount = 0;
      let recoveredCount = 0;
      let failedCount = 0;
      for (const character of characters) {
        try {
          const response = await fetch(`/api/characters/${character.id}/generate-views`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({
              imageModel,
              textModel,
              style: '',
              aspectRatio: imageAspectRatio
            })
          });

          const data = await response.json().catch(() => ({}));
          if (response.ok) {
            startedCount += 1;
          } else if (response.status === 409 && data.jobId) {
            recoveredCount += 1;
          } else {
            failedCount += 1;
            console.error(`生成角色 ${character.name} 图片失败:`, data.message || response.statusText);
          }
        } catch (err) {
          failedCount += 1;
          console.error(`生成角色 ${character.name} 图片失败:`, err);
        }
      }

      await characterBatchRecovery.checkAndResume();
      
      // Show summary with failure count if any
      if (failedCount > 0) {
        console.error('角色批量生成存在失败项:', {
          total: characters.length,
          startedCount,
          recoveredCount,
          failedCount
        });
      }
    } catch (error: any) {
      showToast('角色批量生成失败，请稍后重试', 'error');
      console.error('角色批量生成失败:', error);
    } finally {
      setIsSubmittingCharacterBatch(false);
    }
  };

  const handleBatchSceneGeneration = async () => {
    if (isSubmittingSceneBatch || sceneBatchRecovery.isGenerating) {
      showToast('场景批量生成任务正在进行中', 'warning');
      return;
    }
    if (!currentProjectId || !currentScriptId) {
      showToast('请先选择项目和剧本', 'warning');
      return;
    }
    if (!imageAspectRatio) {
      showToast('当前图片模型未配置可用长宽比', 'warning');
      return;
    }

    try {
      setIsSubmittingSceneBatch(true);
      showToast('正在启动场景批量生成...', 'info');
      
      // 获取所有场景数据
      const token = getAuthToken();
      const sceneRes = await fetch(`/api/scenes/project/${currentProjectId}?scriptId=${currentScriptId}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      if (!sceneRes.ok) {
        throw new Error('获取场景数据失败');
      }
      
      const result = await sceneRes.json();
      const scenesData = result.scenes || [];
      
      if (scenesData.length === 0) {
        showToast('没有找到场景数据', 'warning');
        return;
      }
      
      // 为每个场景启动生成任务
      let startedCount = 0;
      let recoveredCount = 0;
      let failedCount = 0;
      for (const scene of scenesData) {
        try {
          const response = await fetch(`/api/scenes/${scene.id}/generate-image`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({
              imageModel,
              textModel,
              aspectRatio: imageAspectRatio
            })
          });

          const data = await response.json().catch(() => ({}));
          if (response.ok) {
            startedCount += 1;
          } else if (response.status === 409 && data.jobId) {
            recoveredCount += 1;
          } else {
            failedCount += 1;
            console.error(`生成场景 ${scene.name} 图片失败:`, data.message || response.statusText);
          }
        } catch (err) {
          failedCount += 1;
          console.error(`生成场景 ${scene.name} 图片失败:`, err);
        }
      }

      await sceneBatchRecovery.checkAndResume();
      
      // Show summary with failure count if any
      if (failedCount > 0) {
        console.error('场景批量生成存在失败项:', {
          total: scenesData.length,
          startedCount,
          recoveredCount,
          failedCount
        });
      }
    } catch (error: any) {
      showToast('场景批量生成失败，请稍后重试', 'error');
      console.error('场景批量生成失败:', error);
    } finally {
      setIsSubmittingSceneBatch(false);
    }
  };

  const handleBatchFrameGeneration = async () => {
    if (!currentScriptId) {
      showToast('请先选择剧本', 'warning');
      return;
    }

    try {
      showToast('正在启动首尾帧批量生成...', 'info');
      await batchFrameGen.startBatchGeneration(false);
    } catch (error: any) {
      showToast('首尾帧批量生成失败，请稍后重试', 'error');
      console.error('首尾帧批量生成失败:', error);
    }
  };

  const handleBatchVideoGeneration = async () => {
    if (!currentScriptId || scenes.length === 0) {
      showToast('请先生成分镜', 'warning');
      return;
    }
    try {
      showToast(`正在批量生成 ${scenes.length} 个分镜的视频...`, 'info');
      await batchSceneVideoGen.startBatchVideoGeneration(false);
    } catch (error: any) {
      showToast('视频批量生成失败，请稍后重试', 'error');
      console.error('视频批量生成失败:', error);
    }
  };

  // 批量草图生成
  const handleBatchSketchGeneration = async () => {
    const scenesWithSketch = scenes.filter(s => s.sketchUrl);
    if (scenesWithSketch.length === 0) {
      showToast('没有分镜含有草图', 'warning');
      return;
    }

    setIsBatchSketchGenerating(true);
    let successCount = 0;
    let failCount = 0;

    try {
      showToast(`正在批量生成 ${scenesWithSketch.length} 个草图分镜...`, 'info');
      
      for (const scene of scenesWithSketch) {
        try {
          await generateFromSketch(scene.id, {
            controlStrength: scene.controlStrength ?? 0.85,
            sketchUrl: scene.sketchUrl!,
            sketchType: scene.sketchType || 'storyboard_sketch',
          });
          successCount++;
        } catch (error) {
          failCount++;
          console.error(`[StoryBoard] 草图生成失败, sceneId: ${scene.id}`, error);
        }
      }

      if (failCount === 0) {
        showToast(`成功提交 ${successCount} 个草图生成任务`, 'success');
      } else {
        showToast(`提交 ${successCount} 个成功，${failCount} 个失败`, 'warning');
      }
    } catch (error: any) {
      showToast('批量草图生成失败，请稍后重试', 'error');
      console.error('批量草图生成失败:', error);
    } finally {
      setIsBatchSketchGenerating(false);
    }
  };

  // 打开草图编辑器
  const handleOpenSketchEditor = useCallback((storyboardId: number) => {
    setSketchEditorStoryboardId(storyboardId);
  }, []);

  // 关闭草图编辑器
  const handleCloseSketchEditor = useCallback(() => {
    setSketchEditorStoryboardId(null);
  }, []);

  // 草图编辑器保存回调
  const handleSketchEditorSave = useCallback((sketchUrl: string, sketchData: unknown) => {
    if (sketchEditorStoryboardId) {
      setScenes(prev => prev.map(s => 
        s.id === sketchEditorStoryboardId 
          ? { ...s, sketchUrl, sketchData } 
          : s
      ));
    }
    setSketchEditorStoryboardId(null);
  }, [sketchEditorStoryboardId, setScenes]);

  // 计算有草图的分镜数量
  const sketchCount = useMemo(() => scenes.filter(s => s.sketchUrl).length, [scenes]);


  // 8. 批量帧生成
  const batchFrameGen = useBatchFrameGeneration({
    scriptId: currentScriptId,
    projectId: currentProjectId,
    imageModel,
    aspectRatio: imageAspectRatio,
    textModel,
    scenes,
    onComplete: () => {
      console.log('[StoryBoard] 批量帧生成完成，重新加载分镜');
      if (currentScriptId) {
        loadStoryboards(currentScriptId);
      }
    },
    onError: (msg) => showToast(msg, 'error')
  });

  // 9. 批量视频生成
  const batchSceneVideoGen = useBatchSceneVideoGeneration({
    scriptId: currentScriptId,
    projectId: currentProjectId,
    videoModel,
    textModel,
    aspectRatio: videoAspectRatio,
    duration: videoDuration,
    onComplete: () => {
      console.log('[StoryBoard] 批量视频生成完成，重新加载分镜');
      if (currentScriptId) {
        loadStoryboards(currentScriptId);
      }
    },
    onError: (msg) => showToast(msg, 'error')
  });


  // 4. 集数切换
  const handleEpisodeSelect = (script: Script) => {
    setCurrentScriptId(script.id);
    setCurrentEpisode(script.episode_number);
    onEpisodeChange?.(script.episode_number, script.id);
  };

  // 5. 导入分镜
  const handleImportScenes = async (importedScenes: any[]) => {
    if (!currentScriptId) {
      showToast('请先选择一个剧本', 'warning');
      return;
    }

    try {
      // 转换导入的数据为标准格式
      const formattedScenes = importedScenes.map((scene, index) => ({
        idx: scene.order || index + 1,
        prompt_template: scene.description || scene.prompt_template || '',
        variables_json: {
          shotType: scene.shotType || '中景',
          dialogue: scene.dialogue || '',
          duration: scene.duration || 3,
          characters: scene.characters || [],
          location: scene.location || '',
          emotion: scene.emotion || '',
          hasAction: scene.hasAction || false,
          startFrame: scene.startFrame,
          endFrame: scene.endFrame,
          cameraMovement: scene.cameraMovement,
          endState: scene.endState
        }
      }));

      // 保存到数据库
      const token = getAuthToken();
      const res = await fetch(`/api/storyboards/${currentScriptId}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        },
        body: JSON.stringify({ items: formattedScenes })
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.message || '保存失败');
      }

      showToast(`成功导入 ${formattedScenes.length} 个分镜！`, 'success');
      
      // 重新加载分镜列表
      await loadStoryboards(currentScriptId);
      
    } catch (error: any) {
      console.error('[ImportScenes] 保存失败:', error);
      showToast('导入失败: ' + error.message, 'error');
    }
  };


  // 收集资源面板数据 - 使用 useMemo 避免每次渲染重新计算
  const allCharacters = useMemo(() => 
    [...new Set(scenes.flatMap(s => s.characters))], [scenes]);
  const allLocations = useMemo(() => 
    [...new Set(scenes.map(s => s.location).filter(Boolean))], [scenes]);
  const allProps = useMemo(() => 
    [...new Set(scenes.flatMap(s => s.props))], [scenes]);
  
  // 获取选中的分镜数据
  const selectedSceneData = useMemo(() => 
    scenes.find(s => s.id === selectedScene) || null, [scenes, selectedScene]);

  // 处理分镜描述更新
  const handleUpdateSelectedDescription = async (description: string) => {
    if (selectedScene) {
      return await updateDescription(selectedScene, description);
    }
    return false;
  };

  // 处理选中分镜的更新
  const handleUpdateSelectedScene = (updates: Partial<StoryboardScene>) => {
    if (selectedScene) {
      setScenes(prev => prev.map(s => s.id === selectedScene ? { ...s, ...updates } : s));
    }
  };
  
  // 分镜视图快捷键
  const storyboardShortcuts = useMemo<ShortcutConfig[]>(() => [
    {
      ...STORYBOARD_SHORTCUTS_CONFIG.SELECT_PREV,
      action: () => {
        if (scenes.length === 0) return;
        const currentIndex = scenes.findIndex(s => s.id === selectedScene);
        if (currentIndex > 0) {
          setSelectedScene(scenes[currentIndex - 1].id);
        } else if (currentIndex === -1 && scenes.length > 0) {
          // 没有选中时，选择最后一个
          setSelectedScene(scenes[scenes.length - 1].id);
        }
      },
    },
    {
      ...STORYBOARD_SHORTCUTS_CONFIG.SELECT_NEXT,
      action: () => {
        if (scenes.length === 0) return;
        const currentIndex = scenes.findIndex(s => s.id === selectedScene);
        if (currentIndex < scenes.length - 1) {
          setSelectedScene(scenes[currentIndex + 1].id);
        } else if (currentIndex === -1 && scenes.length > 0) {
          // 没有选中时，选择第一个
          setSelectedScene(scenes[0].id);
        }
      },
    },
    {
      ...STORYBOARD_SHORTCUTS_CONFIG.DELETE_SCENE,
      action: () => {
        if (selectedScene && !isLoading) {
          deleteScene(selectedScene);
        }
      },
    },
    {
      ...STORYBOARD_SHORTCUTS_CONFIG.NEW_SCENE,
      action: () => {
        if (currentScriptId && !isLoading) {
          addScene();
        }
      },
    },
    {
      ...STORYBOARD_SHORTCUTS_CONFIG.REFRESH_LIST,
      action: () => {
        if (currentScriptId && !isLoading) {
          loadStoryboards(currentScriptId);
        }
      },
    },
    {
      ...STORYBOARD_SHORTCUTS_CONFIG.DESELECT,
      action: () => {
        setSelectedScene(null);
      },
    },
    // 新增快捷键
    {
      ...STORYBOARD_SHORTCUTS_CONFIG.MOVE_UP,
      action: () => {
        if (selectedScene && !isLoading) {
          moveScene(selectedScene, 'up');
        }
      },
    },
    {
      ...STORYBOARD_SHORTCUTS_CONFIG.MOVE_DOWN,
      action: () => {
        if (selectedScene && !isLoading) {
          moveScene(selectedScene, 'down');
        }
      },
    },
    {
      ...STORYBOARD_SHORTCUTS_CONFIG.GENERATE_IMAGE,
      action: () => {
        if (selectedScene && !isLoading) {
          const scene = scenes.find(s => s.id === selectedScene);
          if (scene && !scene.imageUrl) {
            generateImage(selectedScene, scene.description);
          }
        }
      },
    },
    {
      ...STORYBOARD_SHORTCUTS_CONFIG.GENERATE_VIDEO,
      action: () => {
        if (selectedScene && !isLoading) {
          const scene = scenes.find(s => s.id === selectedScene);
          if (scene && scene.imageUrl && !scene.videoUrl) {
            generateVideo(selectedScene);
          }
        }
      },
    },
    {
      ...STORYBOARD_SHORTCUTS_CONFIG.SELECT_ALL,
      action: () => {
        // 暂不支持多选，可以扩展为选择全部
        showToast('多选功能开发中', 'info');
      },
    },
  ], [scenes, selectedScene, setSelectedScene, deleteScene, addScene, currentScriptId, isLoading, loadStoryboards, moveScene, generateImage, generateVideo, showToast]);

  // 注册快捷键（只在有剧本ID且 Animatic 预览未打开时启用）
  useKeyboardShortcuts(storyboardShortcuts, !!currentScriptId && !isAnimaticOpen);

  // Debug: 检查角色数据
  useEffect(() => {
    console.log('[StoryBoard] 分镜数量:', scenes.length);
    console.log('[StoryBoard] 前3个分镜的角色数据:', scenes.slice(0, 3).map(s => ({
      id: s.id,
      characters: s.characters,
      description: s.description?.substring(0, 50)
    })));
    console.log('[StoryBoard] 收集到的角色:', allCharacters);
  }, [scenes, allCharacters]);

  // 小型图标按钮组件
  const IconButton: React.FC<{
    icon: React.ReactNode;
    tooltip: string;
    onClick: () => void;
    disabled?: boolean;
    loading?: boolean;
    variant?: 'default' | 'primary' | 'success' | 'warning' | 'danger';
  }> = ({ icon, tooltip, onClick, disabled, loading, variant = 'default' }) => {
    const variantClasses = {
      default: 'bg-[var(--bg-card)] hover:bg-[var(--bg-card-hover)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] border-[var(--border-color)]',
      primary: 'bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white border-transparent',
      success: 'bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-400 border-emerald-500/30',
      warning: 'bg-amber-500/20 hover:bg-amber-500/30 text-amber-400 border-amber-500/30',
      danger: 'bg-rose-500/20 hover:bg-rose-500/30 text-rose-400 border-rose-500/30'
    };

    return (
      <Tooltip content={tooltip} placement="bottom">
        <button
          onClick={onClick}
          disabled={disabled || loading}
          className={`
            h-8 w-8 flex items-center justify-center rounded-md border transition-all duration-150
            ${variantClasses[variant]}
            ${disabled || loading ? 'opacity-50 cursor-not-allowed' : ''}
          `}
        >
          {loading ? (
            <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
          ) : icon}
        </button>
      </Tooltip>
    );
  };

  // 分隔线组件
  const Divider = () => (
    <div className="w-px h-6 bg-[var(--border-color)]" />
  );

  return (
    <div className="h-full flex flex-col bg-[var(--bg-app)]">
      {/* 顶部工具栏 */}
      <div className="flex-shrink-0 border-b border-[var(--border-color)] bg-[var(--bg-card)]">
        {/* 第一行：集数选择 + 操作按钮 */}
        <div className="h-11 px-4 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <EpisodeSelector
              scripts={scripts}
              currentEpisode={currentEpisode}
              onSelect={handleEpisodeSelect}
            />
            {scenes.length > 0 && (
              <span className="text-xs text-[var(--text-muted)] px-2 py-0.5 rounded bg-[var(--bg-app)]">
                {scenes.length} 个分镜
              </span>
            )}
          </div>

          <div className="flex items-center gap-1.5">
            {/* 基础操作 */}
            <IconButton
              icon={<RefreshCw className="w-4 h-4" />}
              tooltip="刷新分镜列表"
              onClick={() => currentScriptId && loadStoryboards(currentScriptId)}
              disabled={!currentScriptId}
              loading={isLoading}
            />
            {scenes.length > 0 && (
              <IconButton
                icon={<Download className="w-4 h-4" />}
                tooltip="批量下载"
                onClick={() => setShowBatchDownloadModal(true)}
                variant="success"
              />
            )}
            <IconButton
              icon={<Upload className="w-4 h-4" />}
              tooltip="从 JSON 导入"
              onClick={() => setShowImportModal(true)}
              disabled={!currentScriptId}
            />

            <Divider />

            {/* 批量生成操作 */}
            <IconButton
              icon={<Users className="w-4 h-4" />}
              tooltip="批量生成角色"
              onClick={handleBatchCharacterGeneration}
              disabled={!currentScriptId || isSubmittingCharacterBatch || characterBatchRecovery.isGenerating}
              loading={isSubmittingCharacterBatch || characterBatchRecovery.isGenerating}
              variant="warning"
            />
            <IconButton
              icon={<MapPin className="w-4 h-4" />}
              tooltip="批量生成场景"
              onClick={handleBatchSceneGeneration}
              disabled={!currentScriptId || isSubmittingSceneBatch || sceneBatchRecovery.isGenerating}
              loading={isSubmittingSceneBatch || sceneBatchRecovery.isGenerating}
              variant="success"
            />
            <IconButton
              icon={<Frame className="w-4 h-4" />}
              tooltip="批量生成首尾帧"
              onClick={handleBatchFrameGeneration}
              disabled={!currentScriptId || batchFrameGen.isGenerating}
              loading={batchFrameGen.isGenerating}
              variant="warning"
            />
            <IconButton
              icon={<Film className="w-4 h-4" />}
              tooltip="批量生成视频"
              onClick={handleBatchVideoGeneration}
              disabled={!currentScriptId || batchSceneVideoGen.isGenerating}
              loading={batchSceneVideoGen.isGenerating}
              variant="danger"
            />

            <Divider />

            {/* 草图操作 */}
            <Tooltip content="草图管理" placement="bottom">
              <button
                onClick={() => setShowSketchManager(!showSketchManager)}
                className={`
                  h-8 w-8 flex items-center justify-center rounded-md border transition-all duration-150
                  ${showSketchManager 
                    ? 'bg-purple-500/20 text-purple-400 border-purple-500/30' 
                    : 'bg-[var(--bg-card)] hover:bg-[var(--bg-card-hover)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] border-[var(--border-color)]'
                  }
                `}
              >
                <PencilRuler className="w-4 h-4" />
              </button>
            </Tooltip>
            <div className="relative">
              <IconButton
                icon={<Sparkles className="w-4 h-4" />}
                tooltip={`批量草图生成 (${sketchCount} 个有草图)`}
                onClick={handleBatchSketchGeneration}
                disabled={!currentScriptId || isBatchSketchGenerating || sketchCount === 0}
                loading={isBatchSketchGenerating}
                variant="primary"
              />
              {sketchCount > 0 && (
                <span className="absolute -top-1 -right-1 w-4 h-4 flex items-center justify-center rounded-full bg-purple-500 text-white text-[10px] font-bold">
                  {sketchCount}
                </span>
              )}
            </div>

            <Divider />

            {/* 播放分镜 */}
            {scenes.length > 0 && (
              <Tooltip content="播放分镜预览" placement="bottom">
                <Button
                  size="sm"
                  variant="flat"
                  color="secondary"
                  className="h-8 px-3 font-medium"
                  startContent={<Play className="w-4 h-4" />}
                  onPress={() => setIsAnimaticOpen(true)}
                  isDisabled={scenes.length === 0}
                >
                  播放分镜
                </Button>
              </Tooltip>
            )}

            {/* 主操作 */}
            <Tooltip content={autoStoryboard.isGenerating 
              ? (autoStoryboard.progress 
                ? `${autoStoryboard.progress.currentStep}/${autoStoryboard.progress.totalSteps} ${autoStoryboard.progress.stepName}`
                : '生成中...')
              : '智能生成分镜'
            } placement="bottom">
              <Button
                size="sm"
                className="pro-btn-primary h-8 px-3 font-medium"
                startContent={!autoStoryboard.isGenerating && <Wand2 className="w-4 h-4" />}
                onPress={autoStoryboard.handleAutoGenerateClick}
                isLoading={autoStoryboard.isGenerating}
                isDisabled={!currentScriptId || autoStoryboard.isGenerating}
              >
                {autoStoryboard.isGenerating ? '生成中...' : '智能分镜'}
              </Button>
            </Tooltip>
          </div>
        </div>

        {/* 第二行：模型设置（仅当有模型时显示） */}
        {(imageModel || videoModel) && (
          <div className="h-10 px-4 flex items-center gap-4 border-t border-[var(--border-color)] bg-[var(--bg-app)]">
            {imageModel && (
              <div className="flex items-center gap-2">
                <ImageIcon className="w-3.5 h-3.5 text-cyan-400" />
                <span className="text-xs text-[var(--text-muted)]">图片:</span>
                <span className="text-xs font-medium text-[var(--text-secondary)]">{imageModel}</span>
                <Select
                  size="sm"
                  aria-label="图片比例"
                  placeholder="比例"
                  selectedKeys={imageAspectRatio ? [imageAspectRatio] : []}
                  onChange={(e) => setImageAspectRatio(e.target.value)}
                  className="w-28"
                  isDisabled={imageAspectRatioOptions.length === 0}
                  classNames={{
                    trigger: "h-7 min-h-7 bg-[var(--bg-card)] border-[var(--border-color)]",
                    value: "text-xs text-[var(--text-secondary)]"
                  }}
                >
                  {imageAspectRatioOptions.map((option) => (
                    <SelectItem key={option.value}>{option.label}</SelectItem>
                  ))}
                </Select>
              </div>
            )}

            {videoModel && (
              <div className="flex items-center gap-2">
                <Video className="w-3.5 h-3.5 text-rose-400" />
                <span className="text-xs text-[var(--text-muted)]">视频:</span>
                <span className="text-xs font-medium text-[var(--text-secondary)]">{videoModel}</span>
                <Select
                  size="sm"
                  aria-label="视频比例"
                  placeholder="比例"
                  selectedKeys={videoAspectRatio ? [videoAspectRatio] : []}
                  onChange={(e) => setVideoAspectRatio(e.target.value)}
                  className="w-28"
                  isDisabled={videoAspectRatioOptions.length === 0}
                  classNames={{
                    trigger: "h-7 min-h-7 bg-[var(--bg-card)] border-[var(--border-color)]",
                    value: "text-xs text-[var(--text-secondary)]"
                  }}
                >
                  {videoAspectRatioOptions.map((option) => (
                    <SelectItem key={option.value}>{option.label}</SelectItem>
                  ))}
                </Select>
                <Select
                  size="sm"
                  aria-label="视频时长"
                  placeholder="时长"
                  selectedKeys={videoDuration === null ? [] : [String(videoDuration)]}
                  onChange={(e) => setVideoDuration(Number(e.target.value))}
                  className="w-24"
                  isDisabled={videoDurationOptions.length === 0}
                  classNames={{
                    trigger: "h-7 min-h-7 bg-[var(--bg-card)] border-[var(--border-color)]",
                    value: "text-xs text-[var(--text-secondary)]"
                  }}
                >
                  {videoDurationOptions.map((option) => (
                    <SelectItem key={option.value}>{option.label}</SelectItem>
                  ))}
                </Select>
              </div>
            )}
          </div>
        )}
      </div>

      {/* 无剧本提示 */}
      {!currentScriptId && (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <Wand2 className="w-16 h-16 mx-auto mb-4 text-[var(--text-muted)] opacity-30" />
            <p className="text-lg font-medium text-[var(--text-secondary)]">请先生成剧本</p>
            <p className="text-sm mt-1 text-[var(--text-muted)]">生成剧本后，可以自动将剧本转换为分镜</p>
          </div>
        </div>
      )}

      {/* 主内容区 - 三栏布局 */}
      {currentScriptId && (
        <div className="flex-1 overflow-hidden flex flex-col">
          {/* 草图管理面板（可折叠） */}
          {showSketchManager && (
            <div className="flex-shrink-0 border-b border-[var(--border-color)]">
              <div className="flex items-center justify-between px-4 py-2 bg-[var(--bg-card)]">
                <div className="flex items-center gap-2">
                  <PencilRuler className="w-4 h-4 text-purple-400" />
                  <span className="text-sm font-medium text-[var(--text-primary)]">草图管理</span>
                  <Chip size="sm" variant="flat" className="bg-purple-500/20 text-purple-400 text-xs">
                    {sketchCount} / {scenes.length}
                  </Chip>
                </div>
                <button
                  onClick={() => setShowSketchManager(false)}
                  className="p-1 rounded hover:bg-[var(--bg-app)] text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
                >
                  <ChevronUp className="w-4 h-4" />
                </button>
              </div>
              <div className="h-[300px] overflow-hidden">
                <Suspense fallback={
                  <div className="flex items-center justify-center h-full">
                    <div className="w-6 h-6 border-2 border-purple-500 border-t-transparent rounded-full animate-spin" />
                  </div>
                }>
                  <SketchManager
                    scriptId={currentScriptId}
                    projectId={currentProjectId || 0}
                    storyboards={scenes.map(s => ({
                      id: s.id,
                      order: s.order,
                      description: s.description,
                      sketchUrl: s.sketchUrl,
                      sketchType: s.sketchType,
                      sketchData: s.sketchData,
                      controlStrength: s.controlStrength,
                      firstFrameUrl: s.startFrame,
                    }))}
                    onOpenEditor={handleOpenSketchEditor}
                    onStoryboardUpdate={(id, updates) => {
                      setScenes(prev => prev.map(s => 
                        s.id === id ? { ...s, ...updates } : s
                      ));
                    }}
                    onRefresh={() => currentScriptId && loadStoryboards(currentScriptId)}
                  />
                </Suspense>
              </div>
            </div>
          )}

          {/* 三栏布局 */}
          <div className="flex-1 overflow-hidden">
            <PanelGroup 
              direction="horizontal" 
              storageKey="storyboard-layout"
              mobileDefaultPanel={1}
              mobilePanelLabels={['分镜列表', '预览编辑', '资源']}
            >
              {/* 左侧：分镜列表 */}
              <ResizablePanel defaultSize={22} minSize={15} maxSize={35} title="分镜列表" collapsible>
                <SceneList
                scenes={scenes}
                selectedScene={selectedScene}
                projectId={currentProjectId}
                scriptId={currentScriptId}
                onSelectScene={setSelectedScene}
                onAddScene={addScene}
                onDeleteScene={deleteScene}
                onMoveScene={moveScene}
                onUpdateDescription={updateDescription}
                onReorderScenes={reorderScenes}
                onGenerateImage={generateImage}
                onGenerateVideo={generateVideo}
                onUpdateScene={(id, updates) => {
                  setScenes(prev => prev.map(s => s.id === id ? { ...s, ...updates } : s));
                }}
                tasks={tasks}
                onBatchGenerate={(overwrite) => batchFrameGen.startBatchGeneration(overwrite)}
                isBatchGenerating={batchFrameGen.isGenerating}
                batchProgress={batchFrameGen.progress}
                onBatchGenerateVideo={(overwrite) => batchSceneVideoGen.startBatchVideoGeneration(overwrite)}
                isBatchGeneratingVideo={batchSceneVideoGen.isGenerating}
                batchVideoProgress={batchSceneVideoGen.progress}
                isLoading={isLoading}
              />
            </ResizablePanel>

            {/* 中央：预览编辑 */}
            <ResizablePanel defaultSize={53} minSize={30} title="预览编辑">
              <ScenePreviewPanel
                scene={selectedSceneData}
                sceneIndex={selectedSceneData ? scenes.findIndex(s => s.id === selectedSceneData.id) : -1}
                projectId={currentProjectId}
                scriptId={currentScriptId}
                onUpdateDescription={handleUpdateSelectedDescription}
                onGenerateImage={generateImage}
                onGenerateVideo={generateVideo}
                onUpdateScene={handleUpdateSelectedScene}
                imageTask={selectedScene ? tasks[`img_${selectedScene}`] : undefined}
                videoTask={selectedScene ? tasks[`vid_${selectedScene}`] : undefined}
              />
            </ResizablePanel>

            {/* 右侧：资源面板 */}
            <ResizablePanel defaultSize={25} minSize={15} maxSize={35} title="资源" collapsible>
              <ResourcePanel
                characters={allCharacters}
                locations={allLocations}
                props={allProps}
                projectId={currentProjectId}
                scriptId={currentScriptId}
                scenes={scenes}
                imageModel={imageModel}
                imageAspectRatio={imageAspectRatio}
                textModel={textModel}
              />
            </ResizablePanel>
          </PanelGroup>
        </div>
        </div>
      )}

      {/* 自动分镜确认弹窗 */}
      <AutoStoryboardModal
        isOpen={autoStoryboard.showConfirmModal}
        onOpenChange={autoStoryboard.setShowConfirmModal}
        dontShowAgain={autoStoryboard.dontShowAgain}
        onDontShowAgainChange={autoStoryboard.setDontShowAgain}
        onConfirm={autoStoryboard.handleConfirmGenerate}
      />

      {/* 导入分镜弹窗 */}
      <ImportStoryboardModal
        isOpen={showImportModal}
        onOpenChange={setShowImportModal}
        onImport={handleImportScenes}
      />

      {/* 批量下载弹窗 */}
      <BatchDownloadModal
        isOpen={showBatchDownloadModal}
        onOpenChange={setShowBatchDownloadModal}
        scenes={scenes}
      />

      {/* 草图编辑器弹窗 */}
      {sketchEditorStoryboardId && (
        <Suspense fallback={
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
            <div className="w-8 h-8 border-3 border-purple-500 border-t-transparent rounded-full animate-spin" />
          </div>
        }>
          <SketchEditor
            storyboardId={sketchEditorStoryboardId}
            initialData={scenes.find(s => s.id === sketchEditorStoryboardId)?.sketchData}
            backgroundImage={scenes.find(s => s.id === sketchEditorStoryboardId)?.startFrame}
            onSave={handleSketchEditorSave}
            onClose={handleCloseSketchEditor}
          />
        </Suspense>
      )}

      {/* Animatic 预览弹窗 */}
      <AnimaticPreview
        isOpen={isAnimaticOpen}
        onClose={() => setIsAnimaticOpen(false)}
        storyboards={scenes}
      />
    </div>
  );
};

// Wrap with error boundary
const StoryBoardWithErrorBoundary: React.FC<StoryBoardProps> = (props) => (
  <StoryboardErrorBoundary>
    <StoryBoard {...props} />
  </StoryboardErrorBoundary>
);

export default StoryBoardWithErrorBoundary;
