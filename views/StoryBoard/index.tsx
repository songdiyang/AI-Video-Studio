import React, { useState, useEffect, useMemo, useCallback, useRef, Component, ReactNode, lazy, Suspense } from 'react';
import { Button, Select, SelectItem, Tooltip } from '@heroui/react';
import { Wand2, RefreshCw, Download, Video, ImageIcon, Users, MapPin, Frame, Film, ChevronDown, Play, GitBranch, MessageSquare, Lock, Sparkles } from 'lucide-react';
import { useSceneManager, StoryboardScene, DialogueLine } from './useSceneManager';
import { useAutoStoryboard } from './useAutoStoryboard';
import { useSceneGeneration } from './useSceneGeneration';
import { useWorkflowRecovery } from './hooks/useWorkflowRecovery';
import { useBatchResourceGeneration } from './hooks/useBatchResourceGeneration';
import { batchValidateScenes } from '../../services/storyboards';
import EpisodeSelector from './EpisodeSelector';
import AutoStoryboardModal from './AutoStoryboardModal';
import BatchDownloadModal from './BatchDownloadModal';
import SceneList from './SceneList';
import ResourcePanel, { StoryboardStateOverride } from './ResourcePanel';
import ScriptOutlinePanel from './ScriptOutlinePanel';
import ScenePreviewPanel from './ScenePreviewPanel';
import ScriptGenerateModal, { type ScriptGeneratedPayload } from '../AssetsManager/ScriptGenerateModal';
import { fetchProject, updateProject, type Project } from '../../services/projects';
import { PanelGroup } from '../../components/PanelGroup';
import ResizablePanel, { ResizablePanelRef } from '../../components/ResizablePanel';
import { getAuthToken } from '../../services/auth';
import { fetchCharactersByProject, fetchScenesByProject, createCharacter, updateCharacter, deleteCharacter, generateCharacterViews, createScene as createSceneAsset, updateScene as updateSceneAsset, deleteScene as deleteSceneAsset } from '../../services/assets';
import { createScript as createScriptApi, deleteScript as deleteScriptApi } from '../../services/scripts';
import { addProjectCollaborator } from '../../services/collaboration';
import { useToast } from '../../contexts/ToastContext';
import { AIModel } from '../../components/AIModelSelector';
import { normalizeCapabilityOptions } from '../../utils/modelCapabilities';
import { useKeyboardShortcuts, ShortcutConfig, STORYBOARD_SHORTCUTS_CONFIG, VIDEO_COMPOSITION_SHORTCUTS_CONFIG } from '../../hooks/useKeyboardShortcuts';
// 导入 AnimaticPreview 组件
import { AnimaticPreview } from './AnimaticPreview';
// 导入版本控制和协作组件
import VersionHistoryPanel from './VersionHistoryPanel';
import TeamCollaborationPanel from './TeamCollaborationPanel';
import FrameAnnotationPanel from './FrameAnnotationPanel';

// AI辅助面板 - 懒加载
const AIAssistantPanel = lazy(() => import('../../components/AIAssistantPanel'));

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
        <div className="flex flex-col items-center justify-center h-full gap-4 bg-(--bg-app)">
          <p className="text-lg font-medium text-(--text-secondary)">Something went wrong loading the storyboard.</p>
          <p className="text-sm text-(--text-muted)">{this.state.error?.message}</p>
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
  /** 外部接管“新建下一集”的回调；未传时由 StoryBoard 内部默认实现处理 */
  onCreateNextEpisode?: () => void | Promise<void>;
  projectSettings?: {
    imageAspectRatio?: string;
    imageResolution?: string;
    videoAspectRatio?: string;
    videoResolution?: string;
  };
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
  onEpisodeChange,
  onCreateNextEpisode,
  projectSettings
}) => {
  const [currentScriptId, setCurrentScriptId] = useState<number | null>(scriptId || null);
  const [currentProjectId, setCurrentProjectId] = useState<number | null>(projectId || null);
  const [currentEpisode, setCurrentEpisode] = useState(episodeNumber);
  // 无参考剧本模式下记录用户已到达过的最大集数，让 Select 保留 1..max 选项，支持自由回切
  const [standaloneMaxEpisode, setStandaloneMaxEpisode] = useState<number>(episodeNumber || 1);
  
  // 模型选择（本地可变，同步外部 props）
  const [currentImageModel, setCurrentImageModel] = useState(imageModel);
  const [currentVideoModel, setCurrentVideoModel] = useState(videoModel);

  const [showBatchDownloadModal, setShowBatchDownloadModal] = useState(false);
  const [imageAspectRatio, setImageAspectRatio] = useState(projectSettings?.imageAspectRatio || '');
  const [videoAspectRatio, setVideoAspectRatio] = useState(projectSettings?.videoAspectRatio || '');
  const [videoDuration, setVideoDuration] = useState<number | null>(null);
  const [imageResolution, setImageResolution] = useState(projectSettings?.imageResolution || '');
  const [videoResolution, setVideoResolution] = useState(projectSettings?.videoResolution || '');

  const [isOptimizingAllPrompts, setIsOptimizingAllPrompts] = useState(false);
  const [isAnimaticOpen, setIsAnimaticOpen] = useState(false);
  const [isVersionHistoryOpen, setIsVersionHistoryOpen] = useState(false);
  const [isTeamCollaborationOpen, setIsTeamCollaborationOpen] = useState(false);
  const [isFrameAnnotationOpen, setIsFrameAnnotationOpen] = useState(false);
  const [isAssistantOpen, setIsAssistantOpen] = useState(true);
  const resourcePanelRef = useRef<ResizablePanelRef>(null);
  const assistantPanelRef = useRef<ResizablePanelRef>(null);
  const [leftPanelTab, setLeftPanelTab] = useState<'scenes' | 'resources' | 'outline'>('scenes');

  // 智能拆分加载提示语
  const LOADING_TIPS = useMemo(() => [
    '桃小绒正在钓鱼...',
    '虾片正在修理 bug...',
    '真的有人会看这些 tips 吗？',
    'AI 正在努力理解剧本的深层含义...',
    '分镜师正在画草图，稍等片刻...',
    '影棚搭建中，油漆还没干...',
    '角色们正在化妆间准备登场...',
    '摄影师正在调焦距...',
    '导演喊了 Action，演员各就各位...',
    '正在给场景打光，亮一点还是暗一点？',
    '剧本里的伏笔正在被拆解...',
    '每个分镜都在寻找最合适的角度...',
    '建筑工人正在搭建木屋...',
    '环境氛围正在渲染中，请深呼吸...',
    'AI 说："这波操作有点秀"',
  ], []);
  const [tipIndex, setTipIndex] = useState(0);

  const { showToast } = useToast();

  // 剧本大纲内容
  const [scriptContent, setScriptContent] = useState<string | null>(null);
  const [scriptTitle, setScriptTitle] = useState<string>('');
  const [isLoadingScript, setIsLoadingScript] = useState(false);

  // 参考剧本（弱绑定）——用户在大纲面板中自由选择的剧本，仅用于大纲展示与创作参考，
  // 不影响 currentScriptId 和 AI 分镜的强绑定关系。
  const [referenceScriptContent, setReferenceScriptContent] = useState<string | null>(null);
  const [referenceScriptTitle, setReferenceScriptTitle] = useState<string>('');

  // 生成新剧本弹窗（弱绑定参考剧本）
  const [isGenerateScriptOpen, setIsGenerateScriptOpen] = useState(false);
  const [currentProject, setCurrentProject] = useState<Project | null>(null);

  // 批量生成提交状态追踪
  const [isBatchFrameSubmitting, setIsBatchFrameSubmitting] = useState(false);
  const [isBatchVideoSubmitting, setIsBatchVideoSubmitting] = useState(false);

  // O(1) model lookup via Map
  const modelMap = useMemo(() => {
    const map = new Map<string, typeof models[number]>();
    for (const m of models) {
      map.set(m.name, m);
    }
    return map;
  }, [models]);

  const imageModelConfig = useMemo(() => {
    const model = modelMap.get(currentImageModel);
    return model && (model.type || model.category)?.toUpperCase() === 'IMAGE' ? model : undefined;
  }, [modelMap, currentImageModel]);

  const videoModelConfig = useMemo(() => {
    const model = modelMap.get(currentVideoModel);
    return model && (model.type || model.category)?.toUpperCase() === 'VIDEO' ? model : undefined;
  }, [modelMap, currentVideoModel]);

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
  const imageResolutionOptions = useMemo(
    () => normalizeCapabilityOptions(imageModelConfig?.supportedResolutions, 'resolution'),
    [imageModelConfig]
  );
  // 视频清晰度使用固定选项（480p/720p/1080p），不依赖模型配置
  const videoResolutionOptions = useMemo(
    () => [
      { value: '480p', label: '480p' },
      { value: '720p', label: '720p' },
      { value: '1080p', label: '1080p' }
    ],
    []
  );

  // 同步外部 props - 合并为单个 useEffect 减少渲染开销
  useEffect(() => {
    if (scriptId !== undefined && scriptId !== currentScriptId) {
      setCurrentScriptId(scriptId || null);
    }
    if (projectId !== undefined && projectId !== currentProjectId) {
      setCurrentProjectId(projectId || null);
    }
    // 仅在绑定参考剧本时从外部 props 同步集数；
    // 无参考剧本模式下 currentEpisode 由本地 state + localStorage 独占，避免用户手动切换后被默认的 episodeNumber (通常为 1) 立即覆盖
    if (scriptId && episodeNumber !== undefined && episodeNumber !== currentEpisode) {
      setCurrentEpisode(episodeNumber);
    }
    if (imageModel !== undefined && imageModel !== currentImageModel) {
      setCurrentImageModel(imageModel);
    }
    if (videoModel !== undefined && videoModel !== currentVideoModel) {
      setCurrentVideoModel(videoModel);
    }
  }, [scriptId, projectId, episodeNumber, imageModel, videoModel, currentScriptId, currentProjectId, currentEpisode, currentImageModel, currentVideoModel]);

  // 图片比例/分辨率由项目设置统一管理，不再随模型选项自动变更
  // 仅在项目未设置时回退使用模型默认值
  useEffect(() => {
    if (projectSettings?.imageAspectRatio) return;
    if (imageAspectRatioOptions.length === 0) {
      setImageAspectRatio('');
      return;
    }
    setImageAspectRatio((current) =>
      imageAspectRatioOptions.some((option) => option.value === current)
        ? current
        : imageAspectRatioOptions[0].value
    );
  }, [imageAspectRatioOptions, projectSettings?.imageAspectRatio]);

  useEffect(() => {
    if (projectSettings?.imageResolution) return;
    if (imageResolutionOptions.length === 0) {
      setImageResolution('');
      return;
    }
    setImageResolution((current) =>
      imageResolutionOptions.some((option) => option.value === current)
        ? current
        : imageResolutionOptions[0].value
    );
  }, [imageResolutionOptions, projectSettings?.imageResolution]);

  useEffect(() => {
    if (!projectSettings?.videoAspectRatio) {
      if (videoAspectRatioOptions.length === 0) {
        setVideoAspectRatio('');
      } else {
        setVideoAspectRatio((current) =>
          videoAspectRatioOptions.some((option) => option.value === current)
            ? current
            : videoAspectRatioOptions[0].value
        );
      }
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
  }, [videoAspectRatioOptions, videoDurationOptions, projectSettings?.videoAspectRatio]);

  useEffect(() => {
    if (projectSettings?.videoResolution) return;
    if (videoResolutionOptions.length === 0) {
      setVideoResolution('');
      return;
    }
    setVideoResolution((current) =>
      videoResolutionOptions.some((option) => option.value === current)
        ? current
        : videoResolutionOptions[0].value
    );
  }, [videoResolutionOptions, projectSettings?.videoResolution]);

  // 1. 分镜列表管理
  const {
    scenes,
    setScenes,
    selectedScene,
    setSelectedScene,
    isLoading,
    loadStoryboards,
    refresh: refreshScenes,
    addScene,
    insertScene,
    deleteScene,
    updateDescription,
    updateBaseDescription,
    updateVideoPrompt,
    updateFirstFramePrompt,
    updateLastFramePrompt,
    updateDialogues,
    updateVoiceover,
    moveScene,
    reorderScenes,
    updateCharactersAndLocation,
    updateDuration
  } = useSceneManager(currentScriptId, currentProjectId, currentEpisode);

  // 项目角色和场景资源（供选择器使用）
  const [projectCharacters, setProjectCharacters] = useState<{ id: number; name: string; image_url?: string; front_view_url?: string; base_appearance?: string; outfit_appearance?: string; has_base_model?: number; has_base_model_views?: number; states_count?: number; active_state_name?: string; active_state_outfit?: string; active_state_image_url?: string; base_front_view_url?: string }[]>([]);
  const [projectScenes, setProjectScenes] = useState<{ id: number; name: string; description?: string }[]>([]);
  // 分镜状态覆写：用户在资源面板选择的角色状态，不影响全局激活状态
  const [storyboardStates, setStoryboardStates] = useState<Record<number, StoryboardStateOverride>>({});

  const handleStoryboardStateChange = (characterId: number, state: StoryboardStateOverride | null) => {
    setStoryboardStates(prev => {
      const next = { ...prev };
      if (state) {
        next[characterId] = state;
      } else {
        delete next[characterId];
      }
      return next;
    });
  };

  // 合并分镜状态覆写到 projectCharacters，供 CharacterTagSelector 使用
  const effectiveProjectCharacters = useMemo(() => {
    if (Object.keys(storyboardStates).length === 0) return projectCharacters;
    return projectCharacters.map(c => {
      const override = storyboardStates[c.id];
      if (!override) return c;
      return {
        ...c,
        active_state_name: override.stateName,
        active_state_outfit: override.stateOutfit || c.active_state_outfit,
        active_state_image_url: override.stateImage || c.active_state_image_url,
      };
    });
  }, [projectCharacters, storyboardStates]);

  useEffect(() => {
    if (!currentProjectId) return;
    fetchCharactersByProject(currentProjectId)
      .then(chars => setProjectCharacters(chars.map(c => ({ id: c.id, name: c.name, image_url: (c as any).image_url, front_view_url: (c as any).front_view_url || (c as any).frontView_url, base_appearance: (c as any).base_appearance, outfit_appearance: (c as any).outfit_appearance, has_base_model: (c as any).has_base_model_views ? 1 : 0, has_base_model_views: (c as any).has_base_model_views ? 1 : 0, states_count: (c as any).states_count || 0, active_state_name: (c as any).active_state_name, active_state_outfit: (c as any).active_state_outfit, active_state_image_url: (c as any).active_state_image_url, base_front_view_url: (c as any).base_model_image_url }))))
      .catch(() => {});
    fetchScenesByProject(currentProjectId)
      .then(scenes => setProjectScenes(scenes.map(s => ({ id: s.id, name: s.name, description: s.description }))))
      .catch(() => {});
  }, [currentProjectId]);

  // 加载剧本内容（大纲面板用）
  useEffect(() => {
    if (!currentScriptId) {
      setScriptContent(null);
      setScriptTitle('');
      return;
    }
    setIsLoadingScript(true);
    const token = getAuthToken();
    fetch(`/api/scripts/project/${currentProjectId}/episode/${currentEpisode}`, {
      headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    })
      .then(res => res.ok ? res.json() : null)
      .then(data => {
        const script = data?.script;
        setScriptContent(script?.content || null);
        setScriptTitle(script?.title || `第${currentEpisode}集`);
      })
      .catch(() => {
        setScriptContent(null);
        setScriptTitle('');
      })
      .finally(() => setIsLoadingScript(false));
  }, [currentScriptId, currentProjectId, currentEpisode]);

  // 加载当前项目详情（为 ScriptGenerateModal 提供 projects 数据）
  useEffect(() => {
    if (!currentProjectId) {
      setCurrentProject(null);
      return;
    }
    let cancelled = false;
    fetchProject(currentProjectId)
      .then((p) => { if (!cancelled) setCurrentProject(p); })
      .catch(() => { if (!cancelled) setCurrentProject(null); });
    return () => { cancelled = true; };
  }, [currentProjectId]);

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
    loadStoryboards, // 传入增量加载函数，避免整页刷新
    referenceScriptContent,
    referenceScriptTitle
  });

  // 智能拆分加载提示语轮播
  useEffect(() => {
    if (!autoStoryboard.isGenerating) return;
    const interval = setInterval(() => {
      setTipIndex(prev => (prev + 1) % LOADING_TIPS.length);
    }, 4000);
    return () => clearInterval(interval);
  }, [autoStoryboard.isGenerating, LOADING_TIPS.length]);

  // 5. 场景图片/视频生成
  const { generateImage, generateVideo, generateWithCamera, generateWithPaint, generateHdRepair, tasks, isRunning } = useSceneGeneration({
    projectId: currentProjectId,
    scriptId: currentScriptId,
    episodeNumber: currentEpisode,
    scenes,
    setScenes,
    imageModel: currentImageModel,
    imageAspectRatio,
    textModel,
    videoModel: currentVideoModel,
    videoAspectRatio,
    videoDuration,
    videoResolution
  });

  // 批量资源生成（角色/场景）
  const batchResource = useBatchResourceGeneration({
    projectId: currentProjectId,
    scriptId: currentScriptId,
    imageModel,
    textModel,
    imageAspectRatio,
    imageResolution: imageResolution || undefined,
    onCharactersComplete: () => {
      // 刷新项目角色数据
      if (currentProjectId) {
        fetchCharactersByProject(currentProjectId).then(setProjectCharacters).catch(() => {});
      }
    },
    onScenesComplete: () => {
      // 刷新项目场景数据
      if (currentProjectId) {
        fetchScenesByProject(currentProjectId, currentScriptId || undefined).then(setProjectScenes).catch(() => {});
      }
    },
  });

  // 批量优化全部分镜提示词（工作流模式 - 持久化任务）
  const handleBatchOptimizePrompts = async (targetType: 'image' | 'video' = 'image') => {
    if (isOptimizingAllPrompts) {
      showToast('正在优化中，请稍候', 'warning');
      return;
    }
    if (!currentProjectId) {
      showToast('请先选择项目', 'warning');
      return;
    }
    if (scenes.length === 0) {
      showToast('没有可优化的分镜', 'warning');
      return;
    }

    setIsOptimizingAllPrompts(true);
    try {
      const token = getAuthToken();
      const res = await fetch(`/api/storyboards/batch-optimize-prompts/${currentScriptId}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        },
        body: JSON.stringify({ textModel, targetType })
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        if (res.status === 409 && err.jobId) {
          showToast('已有提示词优化任务正在运行中', 'warning');
          return;
        }
        throw new Error(err.message || '启动优化任务失败');
      }

      const data = await res.json();
      const typeLabel = targetType === 'video' ? '视频' : '图片';
      showToast(`${typeLabel}提示词优化任务已启动（任务ID: ${String(data.jobId || '').slice(-6) || '...'}）`, 'success');
    } catch (error: any) {
      showToast('批量优化失败：' + (error.message || '未知错误'), 'error');
    } finally {
      setIsOptimizingAllPrompts(false);
    }
  };

  const handleBatchFrameGeneration = async (overwrite = false) => {
    if (!currentProjectId) {
      showToast('请先选择项目', 'warning');
      return;
    }
    if (!imageModel) {
      showToast('请先选择图片模型', 'warning');
      return;
    }
    if (!imageAspectRatio) {
      showToast('当前图片模型未配置可用长宽比', 'warning');
      return;
    }
    if (scenes.length === 0) {
      showToast('没有分镜可生成', 'warning');
      return;
    }

    setIsBatchFrameSubmitting(true);
    try {
      // 根据覆盖模式过滤分镜
      let targetScenes = scenes.filter(s => s.id != null);
      if (!overwrite) {
        // 跳过已有帧的分镜
        targetScenes = targetScenes.filter(s => {
          if (s.hasAction) return !(s.startFrame && s.endFrame);
          return !s.startFrame;
        });
      }

      if (targetScenes.length === 0) {
        showToast('所有分镜已有帧图片，无需生成', 'info');
        return;
      }

      // 批量预检
      const sceneIds = targetScenes.map(s => s.id!);
      let validSceneIds = sceneIds;
      try {
        const validation = await batchValidateScenes(sceneIds, currentScriptId, 'frame', currentProjectId);
        validSceneIds = validation.results.filter(r => r.ready).map(r => r.sceneId);
        const skippedCount = validation.results.filter(r => !r.ready).length;
        if (skippedCount > 0) {
          showToast(`${skippedCount} 个分镜因资源不完整被跳过`, 'warning');
        }
      } catch (err) {
        console.warn('[BatchFrame] 预检失败，尝试全部生成:', err);
      }

      if (validSceneIds.length === 0) {
        showToast('所有分镜都因资源不完整被跳过', 'error');
        return;
      }

      // 逐个提交独立任务
      let startedCount = 0;
      let skippedCount = 0;
      for (const sceneId of validSceneIds) {
        const scene = scenes.find(s => s.id === sceneId);
        if (!scene) continue;
        const prompt = scene.description || '';
        const result = await generateImage(sceneId, prompt);
        if (result.success) {
          startedCount++;
        } else {
          skippedCount++;
          console.warn(`[BatchFrame] 分镜 ${sceneId} 跳过: ${result.error}`);
        }
      }

      showToast(`已启动 ${startedCount} 个分镜的帧生成任务${skippedCount > 0 ? `，${skippedCount} 个跳过` : ''}`, 'info');
    } catch (error: any) {
      showToast('首尾帧批量生成失败，请稍后重试', 'error');
      console.error('首尾帧批量生成失败:', error);
    } finally {
      setIsBatchFrameSubmitting(false);
    }
  };

  const handleBatchVideoGeneration = async (overwrite = false) => {
    if (!currentProjectId || scenes.length === 0) {
      showToast('请先生成分镜', 'warning');
      return;
    }
    if (!videoModel) {
      showToast('请先选择视频生成模型', 'warning');
      return;
    }
    if (!videoAspectRatio) {
      showToast('当前视频模型未配置可用长宽比', 'warning');
      return;
    }

    setIsBatchVideoSubmitting(true);
    try {
      // 根据覆盖模式过滤分镜
      let targetScenes = scenes.filter(s => s.id != null);
      if (!overwrite) {
        targetScenes = targetScenes.filter(s => !s.videoUrl);
      }

      if (targetScenes.length === 0) {
        showToast('所有分镜已有视频，无需生成', 'info');
        return;
      }

      // 批量预检
      const sceneIds = targetScenes.map(s => s.id!);
      let validSceneIds = sceneIds;
      try {
        const validation = await batchValidateScenes(sceneIds, currentScriptId, 'video', currentProjectId);
        validSceneIds = validation.results.filter(r => r.ready).map(r => r.sceneId);
        const skippedCount = validation.results.filter(r => !r.ready).length;
        if (skippedCount > 0) {
          showToast(`${skippedCount} 个分镜因资源不完整被跳过`, 'warning');
        }
      } catch (err) {
        console.warn('[BatchVideo] 预检失败，尝试全部生成:', err);
      }

      if (validSceneIds.length === 0) {
        showToast('所有分镜都因资源不完整被跳过', 'error');
        return;
      }

      // 逐个提交独立任务
      let startedCount = 0;
      let skippedCount = 0;
      for (const sceneId of validSceneIds) {
        const result = await generateVideo(sceneId);
        if (result.success) {
          startedCount++;
        } else {
          skippedCount++;
          console.warn(`[BatchVideo] 分镜 ${sceneId} 跳过: ${result.error}`);
        }
      }

      showToast(`已启动 ${startedCount} 个分镜的视频生成任务${skippedCount > 0 ? `，${skippedCount} 个跳过` : ''}`, 'info');
    } catch (error: any) {
      showToast('视频批量生成失败，请稍后重试', 'error');
      console.error('视频批量生成失败:', error);
    } finally {
      setIsBatchVideoSubmitting(false);
    }
  };


  // 4. 集数切换
  const handleEpisodeSelect = (script: Script | null) => {
    if (!script) {
      // 切回自由创作：解绑剧本，保留当前 episode 标签
      setCurrentScriptId(null);
      return;
    }
    setCurrentScriptId(script.id);
    setCurrentEpisode(script.episode_number);
    onEpisodeChange?.(script.episode_number, script.id);
  };

  // 4.1 未绑参考剧本时：集数作为「进度标签」，纯前端 localStorage 持久化，不参与数据归档
  const handleStandaloneEpisodeChange = (episode: number) => {
    if (!isNaN(episode) && episode >= 1) {
      setCurrentEpisode(episode);
      // 同步上浮最大集数（用户添加时自然扩展，回切时保留原有上限）
      setStandaloneMaxEpisode(prev => Math.max(prev, episode));
      if (currentProjectId) {
        try {
          localStorage.setItem(`nano_progress_episode_${currentProjectId}`, String(episode));
          const prevMaxRaw = localStorage.getItem(`nano_progress_max_episode_${currentProjectId}`);
          const prevMax = prevMaxRaw ? parseInt(prevMaxRaw, 10) : 0;
          if (episode > (isNaN(prevMax) ? 0 : prevMax)) {
            localStorage.setItem(`nano_progress_max_episode_${currentProjectId}`, String(episode));
          }
        } catch {
          // localStorage 不可用时静默失败
        }
      }
    }
  };

  // 进入某项目时，未绑参考剧本的进度标签从 localStorage 恢复（含当前集 + 最大集）
  useEffect(() => {
    if (!currentProjectId || currentScriptId) return;
    try {
      const raw = localStorage.getItem(`nano_progress_episode_${currentProjectId}`);
      const maxRaw = localStorage.getItem(`nano_progress_max_episode_${currentProjectId}`);
      const cur = raw ? parseInt(raw, 10) : NaN;
      const mx = maxRaw ? parseInt(maxRaw, 10) : NaN;
      if (!isNaN(cur) && cur >= 1 && cur !== currentEpisode) {
        setCurrentEpisode(cur);
      }
      const baseline = !isNaN(cur) ? cur : (currentEpisode || 1);
      setStandaloneMaxEpisode(Math.max(isNaN(mx) ? 0 : mx, baseline, 1));
    } catch {
      // 忽略
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentProjectId, currentScriptId]);

  // 4.2 绑定剧本模式下：新建下一集（自动取 maxEpisode+1，创建空白集后切换）
  const handleCreateNextEpisode = async () => {
    if (!currentProjectId) { showToast('未选择项目', 'warning'); return; }
    const currentScript = scripts.find(s => s.id === currentScriptId);
    const title = currentScript?.title || '未命名剧本';
    const maxEp = scripts.reduce((m, s) => Math.max(m, s.episode_number || 0), 0);
    const nextEp = maxEp + 1;
    try {
      const res = await createScriptApi({
        projectId: currentProjectId,
        title,
        content: '',
        episodeNumber: nextEp,
      } as any);
      showToast(`已添加第${nextEp}集`, 'success');
      // 通知父组件切换到新集数（父组件需重新拉 scripts 列表）
      if (res?.scriptId) {
        onEpisodeChange?.(nextEp, res.scriptId);
        setCurrentScriptId(res.scriptId);
        setCurrentEpisode(nextEp);
      }
    } catch (err: any) {
      console.error('[StoryBoard.createNextEpisode]', err);
      showToast(err?.message || '添加集数失败', 'error');
    }
  };

  // 5. 导入分镜
  const handleImportScenes = async (importedScenes: any[]) => {
    if (!currentProjectId) {
      showToast('请先选择项目', 'warning');
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
      const endpoint = currentScriptId
        ? `/api/storyboards/${currentScriptId}`
        : `/api/storyboards/project/${currentProjectId}/standalone`;
      const res = await fetch(endpoint, {
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
      await refreshScenes();
      
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

  // 获取当前选中分镜的时长（从分镜数据中获取，严格按分镜设置）
  const currentSceneDuration = useMemo(() => {
    if (!selectedSceneData) return null;
    return selectedSceneData.duration || 3;
  }, [selectedSceneData]);

  // 处理图片提示词更新
  const handleUpdateSelectedDescription = async (description: string) => {
    if (selectedScene) {
      return await updateDescription(selectedScene, description);
    }
    return false;
  };

  // 处理分镜描述更新
  const handleUpdateSelectedBaseDescription = async (baseDescription: string) => {
    if (selectedScene) {
      return await updateBaseDescription(selectedScene, baseDescription);
    }
    return false;
  };

  // 处理分镜视频提示词更新
  const handleUpdateSelectedVideoPrompt = async (videoPrompt: string) => {
    if (selectedScene) {
      return await updateVideoPrompt(selectedScene, videoPrompt);
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
        if (currentProjectId && !isLoading) {
          refreshScenes();
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
  useKeyboardShortcuts(storyboardShortcuts, !!currentProjectId && !isAnimaticOpen);

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
      default: 'bg-(--bg-card) hover:bg-(--bg-card-hover) text-(--text-secondary) hover:text-(--text-primary) border-(--border-color)',
      primary: 'bg-(--accent) hover:bg-(--accent-hover) text-white border-transparent',
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
    <div className="w-px h-6 bg-(--border-color)" />
  );

  // 任务状态直接来自 useSceneGeneration（每个分镜独立任务）

  return (
    <div className="h-full flex flex-col bg-(--bg-app)">
      {/* 顶部工具栏 */}
      <div className="shrink-0 border-b border-(--border-color) bg-(--bg-card)">
        {/* 第一行：集数选择 + 操作按钮 */}
        <div className="h-11 px-4 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <EpisodeSelector
              scripts={scripts}
              currentEpisode={currentEpisode}
              currentScriptId={currentScriptId}
              onSelect={handleEpisodeSelect}
              onStandaloneEpisodeChange={handleStandaloneEpisodeChange}
              standaloneMaxEpisode={standaloneMaxEpisode}
              onCreateNextEpisode={onCreateNextEpisode || handleCreateNextEpisode}
            />
            {scenes.length > 0 && (
              <span className="text-xs text-(--text-muted) px-2 py-0.5 rounded bg-(--bg-app)">
                {scenes.length} 个分镜
              </span>
            )}
          </div>

          <div className="flex items-center gap-1.5">
            {/* 基础操作 */}
            <IconButton
              icon={<RefreshCw className="w-4 h-4" />}
              tooltip="刷新分镜列表"
              onClick={() => refreshScenes()}
              disabled={!currentProjectId}
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

            <Divider />

            {/* 版本控制与协作 */}
            <IconButton
              icon={<GitBranch className="w-4 h-4" />}
              tooltip="版本历史"
              onClick={() => {
                if (selectedScene) {
                  setIsVersionHistoryOpen(true);
                } else {
                  showToast('请先选择一个分镜', 'info');
                }
              }}
              disabled={!selectedScene}
              variant="default"
            />
            <IconButton
              icon={<Users className="w-4 h-4" />}
              tooltip="团队协作"
              onClick={() => setIsTeamCollaborationOpen(!isTeamCollaborationOpen)}
              variant="default"
            />
            <IconButton
              icon={<MessageSquare className="w-4 h-4" />}
              tooltip="帧批注"
              onClick={() => {
                if (selectedScene) {
                  setIsFrameAnnotationOpen(true);
                } else {
                  showToast('请先选择一个分镜', 'info');
                }
              }}
              disabled={!selectedScene}
              variant="default"
            />

            <Divider />

            {/* 批量生成操作 */}
            <IconButton
              icon={<ImageIcon className="w-4 h-4" />}
              tooltip="批量优化提示词(图片)"
              onClick={() => handleBatchOptimizePrompts('image')}
              disabled={!currentProjectId || isOptimizingAllPrompts || scenes.length === 0}
              loading={isOptimizingAllPrompts}
              variant="default"
            />
            <IconButton
              icon={<Video className="w-4 h-4" />}
              tooltip="批量优化提示词(视频)"
              onClick={() => handleBatchOptimizePrompts('video')}
              disabled={!currentProjectId || isOptimizingAllPrompts || scenes.length === 0}
              loading={isOptimizingAllPrompts}
              variant="default"
            />
            <IconButton
              icon={<Users className="w-4 h-4" />}
              tooltip="批量生成角色"
              onClick={batchResource.handleBatchCharacterGeneration}
              disabled={!currentProjectId || batchResource.isSubmittingCharacterBatch || batchResource.isCharacterBatchGenerating}
              loading={batchResource.isSubmittingCharacterBatch || batchResource.isCharacterBatchGenerating}
              variant="warning"
            />
            <IconButton
              icon={<MapPin className="w-4 h-4" />}
              tooltip="批量生成影棚"
              onClick={batchResource.handleBatchSceneGeneration}
              disabled={!currentProjectId || batchResource.isSubmittingSceneBatch || batchResource.isSceneBatchGenerating}
              loading={batchResource.isSubmittingSceneBatch || batchResource.isSceneBatchGenerating}
              variant="success"
            />
            <IconButton
              icon={<Frame className="w-4 h-4" />}
              tooltip="批量生成首尾帧"
              onClick={handleBatchFrameGeneration}
              disabled={!currentProjectId || isBatchFrameSubmitting || isRunning}
              loading={isBatchFrameSubmitting}
              variant="warning"
            />
            <IconButton
              icon={<Film className="w-4 h-4" />}
              tooltip="批量生成视频"
              onClick={handleBatchVideoGeneration}
              disabled={!currentProjectId || isBatchVideoSubmitting || isRunning}
              loading={isBatchVideoSubmitting}
              variant="danger"
            />

            <Divider />

            {/* AI 智能拆分 */}
            <Tooltip content="由剧本自动拆分镜头和影棚" placement="bottom">
              <Button
                size="sm"
                variant="flat"
                color="primary"
                className="h-8 px-3 font-medium"
                startContent={<Sparkles className="w-4 h-4" />}
                onPress={autoStoryboard.handleAutoGenerateClick}
                isDisabled={!currentProjectId || !currentScriptId || autoStoryboard.isGenerating}
                isLoading={autoStoryboard.isGenerating}
              >
                智能拆分
              </Button>
            </Tooltip>

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
          </div>
        </div>

      </div>

      {/* 无项目提示 */}
      {!currentProjectId && (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <Wand2 className="w-16 h-16 mx-auto mb-4 text-(--text-muted) opacity-30" />
            <p className="text-lg font-medium text-(--text-secondary)">请先选择项目</p>
            <p className="text-sm mt-1 text-(--text-muted)">选择项目后即可开始分镜创作</p>
          </div>
        </div>
      )}

      {/* 主内容区 - 双栏布局 */}
      {currentProjectId && (
        <div className="flex-1 overflow-hidden flex flex-col">
          {/* 双栏布局 */}
          <div className="flex-1 overflow-hidden relative">
            <PanelGroup 
              direction="horizontal" 
              storageKey={isAssistantOpen ? "storyboard-layout-v3-with-assistant" : "storyboard-layout-v2"}
              mobileDefaultPanel={1}
              mobilePanelLabels={isAssistantOpen ? ['分镜/资源', '预览编辑', 'AI助手'] : ['分镜/资源', '预览编辑']}
            >
              {/* 左侧：分镜列表 / 资源 Tab 切换 */}
              <ResizablePanel ref={resourcePanelRef} defaultSize={isAssistantOpen ? 20 : 25} minSize={15} maxSize={35} collapsedSize={8} title={leftPanelTab === 'scenes' ? '分镜列表' : leftPanelTab === 'resources' ? '资源' : '大纲'} collapsible>
                <div className="flex flex-col h-full overflow-hidden">
                  {/* Tab 切换栏 */}
                  <div className="flex items-center gap-0.5 px-2 py-1.5 border-b shrink-0" style={{ borderColor: 'var(--border-color)', backgroundColor: 'var(--bg-secondary)' }}>
                    <button
                      onClick={() => setLeftPanelTab('scenes')}
                      className={`flex-1 px-3 py-1 text-xs font-medium rounded-md transition-all ${
                        leftPanelTab === 'scenes'
                          ? 'text-[var(--accent)]'
                          : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)]'
                      }`}
                      style={leftPanelTab === 'scenes' ? { backgroundColor: 'color-mix(in srgb, var(--accent) 15%, transparent)' } : {}}
                    >
                      分镜列表
                    </button>
                    <button
                      onClick={() => setLeftPanelTab('resources')}
                      className={`flex-1 px-3 py-1 text-xs font-medium rounded-md transition-all ${
                        leftPanelTab === 'resources'
                          ? 'text-[var(--accent)]'
                          : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)]'
                      }`}
                      style={leftPanelTab === 'resources' ? { backgroundColor: 'color-mix(in srgb, var(--accent) 15%, transparent)' } : {}}
                    >
                      资源
                    </button>
                    <button
                      onClick={() => setLeftPanelTab('outline')}
                      className={`flex-1 px-3 py-1 text-xs font-medium rounded-md transition-all ${
                        leftPanelTab === 'outline'
                          ? 'text-[var(--accent)]'
                          : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)]'
                      }`}
                      style={leftPanelTab === 'outline' ? { backgroundColor: 'color-mix(in srgb, var(--accent) 15%, transparent)' } : {}}
                    >
                      大纲
                    </button>
                  </div>

                  {/* 内容区域 */}
                  <div className="flex-1 overflow-hidden">
                    {leftPanelTab === 'scenes' ? (
                      <SceneList
                        scenes={scenes}
                        selectedScene={selectedScene}
                        projectId={currentProjectId}
                        scriptId={currentScriptId}
                        onSelectScene={setSelectedScene}
                        onAddScene={addScene}
                        onInsertScene={insertScene}
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
                        onBatchGenerate={(overwrite) => handleBatchFrameGeneration(overwrite)}
                        isBatchGenerating={isBatchFrameSubmitting || isRunning}
                        batchProgress={0}
                        onBatchGenerateVideo={(overwrite) => handleBatchVideoGeneration(overwrite)}
                        isBatchGeneratingVideo={isBatchVideoSubmitting || isRunning}
                        batchVideoProgress={0}
                        isLoading={isLoading}
                      />
                    ) : leftPanelTab === 'resources' ? (
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
                        models={models}
                        storyboardStates={storyboardStates}
                        onStoryboardStateChange={handleStoryboardStateChange}
                      />
                    ) : (
                      <ScriptOutlinePanel
                        scriptContent={scriptContent || referenceScriptContent}
                        scriptTitle={scriptContent ? scriptTitle : referenceScriptTitle}
                        isLoading={isLoadingScript}
                        projectId={currentProjectId}
                        canPick={true}
                        isBoundViaEpisode={!!scriptContent && !!currentScriptId}
                        onPickScript={(_id, item) => {
                          setReferenceScriptContent(item?.content || null);
                          setReferenceScriptTitle(item?.title || (item ? `剧本 #${item.id}` : ''));
                        }}
                        onCreateNewScript={() => setIsGenerateScriptOpen(true)}
                      />
                    )}
                  </div>
                </div>
              </ResizablePanel>

            {/* 中间：预览编辑 */}
            <ResizablePanel defaultSize={isAssistantOpen ? 55 : 75} minSize={35} title="预览编辑">
              <ScenePreviewPanel
                key={selectedScene ?? 'none'}
                scene={selectedSceneData}
                sceneIndex={selectedSceneData ? scenes.findIndex(s => s.id === selectedSceneData.id) : -1}
                projectId={currentProjectId}
                scriptId={currentScriptId}
                onUpdateDescription={handleUpdateSelectedDescription}
                onUpdateBaseDescription={handleUpdateSelectedBaseDescription}
                onUpdateVideoPrompt={handleUpdateSelectedVideoPrompt}
                onUpdateDialogues={async (dialogues) => {
                  if (selectedScene) return await updateDialogues(selectedScene, dialogues);
                  return false;
                }}
                onUpdateVoiceover={async (voiceover) => {
                  if (selectedScene) return await updateVoiceover(selectedScene, voiceover);
                  return false;
                }}
                onUpdateCharactersAndLocation={async (characters, location, characterIds, sceneId) => {
                  if (selectedScene) return await updateCharactersAndLocation(selectedScene, characters, location, characterIds, sceneId);
                  return false;
                }}
                projectCharacters={effectiveProjectCharacters}
                projectScenes={projectScenes}
                onGenerateImage={generateImage}
                onGenerateVideo={generateVideo}
                onGenerateWithCamera={generateWithCamera}
                onGenerateWithPaint={generateWithPaint}
                onGenerateHdRepair={generateHdRepair}
                                onUpdateScene={handleUpdateSelectedScene}
                                onUpdateDuration={(duration) => {
                                  if (selectedScene) return updateDuration(selectedScene, duration);
                                  return Promise.resolve(false);
                                }}
                imageTask={selectedScene ? tasks[`img_${selectedScene}`] : undefined}
                videoTask={selectedScene ? tasks[`vid_${selectedScene}`] : undefined}
                models={models}
                imageModel={currentImageModel}
                videoModel={currentVideoModel}
                onImageModelChange={setCurrentImageModel}
                onVideoModelChange={setCurrentVideoModel}
              />
            </ResizablePanel>

            {/* 右侧：AI辅助面板（仅当开启时显示） */}
            {isAssistantOpen && (
              <ResizablePanel
                ref={assistantPanelRef}
                defaultSize={25}
                minSize={18}
                maxSize={40}
                collapsedSize={8}
                collapsible
                title="AI助手"
              >
                <Suspense fallback={
                  <div className="flex items-center justify-center h-full text-sm text-(--text-muted)">
                    <div className="w-5 h-5 border-2 border-current border-t-transparent rounded-full animate-spin mr-2" />
                    加载中...
                  </div>
                }>
                  <AIAssistantPanel
                    projectId={currentProjectId}
                    projectName={currentProject?.name}
                    projectDescription={currentProject?.description}
                    currentFrame={selectedSceneData ? {
                      id: selectedSceneData.id,
                      index: scenes.findIndex(s => s.id === selectedSceneData.id) + 1,
                      first_frame_url: selectedSceneData.startFrame,
                      last_frame_url: selectedSceneData.endFrame,
                      video_url: selectedSceneData.videoUrl,
                      scene_description: selectedSceneData.description
                    } : null}
                    scenes={scenes.map((s, idx) => ({
                      id: s.id!,
                      index: idx + 1,
                      description: s.description,
                      first_frame_url: (s as any).startFrame,
                      last_frame_url: (s as any).endFrame,
                      video_url: (s as any).videoUrl,
                      first_frame_prompt: (s as any).firstFramePrompt,
                      last_frame_prompt: (s as any).lastFramePrompt,
                      video_prompt: (s as any).videoPrompt,
                    }))}
                    characters={projectCharacters.map(c => ({ id: c.id, name: c.name, description: c.base_appearance || c.outfit_appearance }))}
                    locations={projectScenes.map(l => ({ id: l.id, name: l.name, description: l.description }))}
                    scripts={scripts.map(sc => ({ id: sc.id, episode_number: sc.episode_number, title: sc.title }))}
                    onClose={() => setIsAssistantOpen(false)}
                    onAction={(action, params) => {
                      const sceneIdFrom = (p: any) => Number(p?.sceneId || selectedSceneData?.id);
                      const toastOk = (m: string) => showToast(m, 'success');
                      const toastErr = (prefix: string) => (e: any) => showToast(prefix + ': ' + (e?.message || e), 'error');
                      const ensureProject = () => { if (!currentProjectId) { showToast('未选择项目', 'warning'); return false; } return true; };

                      // ── 分镜：生成与质检 ──────────────────────────
                      if (action === 'generate_frame') {
                        const sceneId = sceneIdFrom(params);
                        if (!sceneId) { showToast('请先选择分镜', 'warning'); return; }
                        const target = scenes.find(s => s.id === sceneId);
                        const prompt = params?.prompt || target?.description || selectedSceneData?.description || '';
                        generateImage(sceneId, prompt);
                      } else if (action === 'generate_video') {
                        const sceneId = sceneIdFrom(params);
                        if (!sceneId) { showToast('请先选择分镜', 'warning'); return; }
                        generateVideo(sceneId);
                      } else if (action === 'auto_storyboard') {
                        autoStoryboard.setShowConfirmModal(true);
                      } else if (action === 'optimize_prompt' || action === 'upload_material') {
                        showToast(`请在分镜卡片上手动${action === 'optimize_prompt' ? '触发提示词优化' : '上传素材'}`, 'info');
                      }
                      // ── 分镜 CRUD ──────────────────────────────────
                      else if (action === 'insert_scene') {
                        const atIndex = typeof params?.atIndex === 'number' ? params.atIndex : scenes.length;
                        insertScene(Math.max(0, Math.min(atIndex, scenes.length)))
                          .then(() => toastOk(`已在位置 ${atIndex + 1} 插入新分镜`))
                          .catch(toastErr('插入失败'));
                      } else if (action === 'delete_scene') {
                        const sceneId = sceneIdFrom(params);
                        if (!sceneId) { showToast('缺少 sceneId', 'warning'); return; }
                        deleteScene(sceneId).then(() => toastOk('分镜已删除')).catch(toastErr('删除失败'));
                      } else if (action === 'update_scene') {
                        const sceneId = sceneIdFrom(params);
                        const field = String(params?.field || '');
                        const rawValue = params?.value;
                        if (!sceneId || !field) { showToast('缺少 sceneId 或 field', 'warning'); return; }
                        if (field === 'voiceover') {
                          Promise.resolve(updateVoiceover(sceneId, String(rawValue ?? ''))).then(() => toastOk('旁白已更新')).catch(toastErr('更新失败'));
                        } else if (field === 'duration') {
                          const d = Number(rawValue); if (!Number.isFinite(d) || d <= 0) { showToast('duration 必须为正数秒', 'warning'); return; }
                          Promise.resolve(updateDuration(sceneId, d)).then(() => toastOk(`时长已更新为 ${d}s`)).catch(toastErr('更新失败'));
                        } else {
                          const fieldMap: Record<string, (id: number, v: string) => any> = {
                            description: updateDescription,
                            base_description: updateBaseDescription,
                            first_frame_prompt: updateFirstFramePrompt,
                            last_frame_prompt: updateLastFramePrompt,
                            video_prompt: updateVideoPrompt,
                          };
                          const fn = fieldMap[field];
                          if (!fn) { showToast(`不支持的字段: ${field}`, 'warning'); return; }
                          Promise.resolve(fn(sceneId, String(rawValue ?? ''))).then(() => toastOk(`已更新 ${field}`)).catch(toastErr('更新失败'));
                        }
                      } else if (action === 'update_scene_dialogues') {
                        const sceneId = sceneIdFrom(params);
                        if (!sceneId) { showToast('缺少 sceneId', 'warning'); return; }
                        const raw = params?.dialogues;
                        const list = Array.isArray(raw) ? raw.map((d: any, i: number) => typeof d === 'string'
                          ? { character: '', line: d, order: i }
                          : { character: String(d.character || ''), line: String(d.line || d.text || ''), order: i })
                          : [];
                        Promise.resolve(updateDialogues(sceneId, list as any)).then(() => toastOk('对白已更新')).catch(toastErr('更新失败'));
                      } else if (action === 'update_scene_characters_location') {
                        const sceneId = sceneIdFrom(params);
                        if (!sceneId) { showToast('缺少 sceneId', 'warning'); return; }
                        const characters: string[] = Array.isArray(params?.characters) ? params.characters.map(String) : [];
                        const location: string = String(params?.location || '');
                        const characterIds: number[] | undefined = Array.isArray(params?.characterIds) ? params.characterIds.map(Number) : undefined;
                        const locationId: number | undefined = params?.locationId != null ? Number(params.locationId) : undefined;
                        Promise.resolve(updateCharactersAndLocation(sceneId, characters, location, characterIds, locationId)).then(() => toastOk('角色/影棚绑定已更新')).catch(toastErr('更新失败'));
                      } else if (action === 'move_scene') {
                        const sceneId = sceneIdFrom(params);
                        const direction = params?.direction === 'down' ? 'down' : 'up';
                        if (!sceneId) { showToast('缺少 sceneId', 'warning'); return; }
                        moveScene(sceneId, direction as 'up' | 'down');
                        toastOk(`已${direction === 'up' ? '上移' : '下移'}分镜`);
                      } else if (action === 'reorder_scenes') {
                        const ids: number[] = Array.isArray(params?.sceneIds) ? params.sceneIds.map(Number) : [];
                        if (ids.length === 0) { showToast('sceneIds 为空', 'warning'); return; }
                        const byId = new Map(scenes.map(s => [s.id, s]));
                        const reordered = ids.map(id => byId.get(id)).filter(Boolean) as typeof scenes;
                        if (reordered.length !== scenes.length) { showToast('sceneIds 与当前分镜不匹配', 'warning'); return; }
                        reorderScenes(reordered);
                        toastOk('分镜顺序已更新');
                      }
                      // ── 角色 CRUD + 白膜 ──────────────────────────
                      else if (action === 'create_character') {
                        if (!ensureProject()) return;
                        createCharacter({ projectId: currentProjectId!, name: String(params?.name || '新角色'), description: params?.description, base_appearance: params?.base_appearance } as any)
                          .then(c => { toastOk(`已创建角色「${c.name}」`); fetchCharactersByProject(currentProjectId!).then(setProjectCharacters).catch(() => {}); })
                          .catch(toastErr('创建角色失败'));
                      } else if (action === 'update_character') {
                        const id = Number(params?.characterId); if (!id) { showToast('缺少 characterId', 'warning'); return; }
                        updateCharacter(id, params?.fields || {})
                          .then(() => { toastOk('角色已更新'); if (currentProjectId) fetchCharactersByProject(currentProjectId).then(setProjectCharacters).catch(() => {}); })
                          .catch(toastErr('更新角色失败'));
                      } else if (action === 'delete_character') {
                        const id = Number(params?.characterId); if (!id) { showToast('缺少 characterId', 'warning'); return; }
                        deleteCharacter(id)
                          .then(() => { toastOk('角色已删除'); if (currentProjectId) fetchCharactersByProject(currentProjectId).then(setProjectCharacters).catch(() => {}); })
                          .catch(toastErr('删除角色失败'));
                      } else if (action === 'generate_base_model') {
                        const id = Number(params?.characterId); if (!id) { showToast('缺少 characterId', 'warning'); return; }
                        generateCharacterViews(id, { imageModel: params?.imageModel, textModel: params?.textModel, aspectRatio: params?.aspectRatio } as any)
                          .then(() => toastOk('白膜生成任务已启动')).catch(toastErr('生成失败'));
                      }
                      // ── 场景（Location）CRUD ───────────────────────
                      else if (action === 'create_location') {
                        if (!ensureProject()) return;
                        createSceneAsset({ project_id: currentProjectId!, name: String(params?.name || '新影棚'), description: params?.description } as any)
                          .then(s => { toastOk(`已创建影棚「${s.name}」`); fetchScenesByProject(currentProjectId!, currentScriptId || undefined).then(setProjectScenes).catch(() => {}); })
                          .catch(toastErr('创建影棚失败'));
                      } else if (action === 'update_location') {
                        const id = Number(params?.locationId); if (!id) { showToast('缺少 locationId', 'warning'); return; }
                        updateSceneAsset(id, params?.fields || {})
                          .then(() => { toastOk('影棚已更新'); if (currentProjectId) fetchScenesByProject(currentProjectId, currentScriptId || undefined).then(setProjectScenes).catch(() => {}); })
                          .catch(toastErr('更新影棚失败'));
                      } else if (action === 'delete_location') {
                        const id = Number(params?.locationId); if (!id) { showToast('缺少 locationId', 'warning'); return; }
                        deleteSceneAsset(id)
                          .then(() => { toastOk('影棚已删除'); if (currentProjectId) fetchScenesByProject(currentProjectId, currentScriptId || undefined).then(setProjectScenes).catch(() => {}); })
                          .catch(toastErr('删除影棚失败'));
                      }
                      // ── 剧本 ──────────────────────────────────────
                      else if (action === 'create_script') {
                        if (!ensureProject()) return;
                        createScriptApi({ projectId: currentProjectId!, title: params?.title, episodeNumber: params?.episodeNumber, content: String(params?.content || '') } as any)
                          .then(() => { toastOk('剧本已创建，刷新后可见'); }).catch(toastErr('创建剧本失败'));
                      } else if (action === 'delete_script') {
                        const id = Number(params?.scriptId); if (!id) { showToast('缺少 scriptId', 'warning'); return; }
                        deleteScriptApi(id).then(() => toastOk('剧本已删除，刷新后可见')).catch(toastErr('删除剧本失败'));
                      } else if (action === 'bind_script') {
                        const id = params?.scriptId == null ? null : Number(params.scriptId);
                        setCurrentScriptId(id);
                        toastOk(id ? `已绑定剧本 #${id}` : '已解绑参考剧本');
                      } else if (action === 'switch_episode') {
                        const ep = Number(params?.episodeNumber);
                        if (!Number.isFinite(ep) || ep <= 0) { showToast('episodeNumber 非法', 'warning'); return; }
                        setCurrentEpisode(ep);
                        toastOk(`已切换到第 ${ep} 集`);
                      }
                      // ── 项目 ──────────────────────────────────────
                      else if (action === 'update_project') {
                        if (!ensureProject()) return;
                        const fields = params?.fields || {};
                        const payload: any = {};
                        if (fields.name != null) payload.name = String(fields.name);
                        if (fields.description != null) payload.description = String(fields.description);
                        // art_style 合并到 settings_json
                        if (fields.art_style != null) {
                          try {
                            const raw = currentProject?.settings_json;
                            const parsed = raw ? (typeof raw === 'string' ? JSON.parse(raw) : raw) : {};
                            parsed.art_style = String(fields.art_style);
                            payload.settings_json = JSON.stringify(parsed);
                          } catch { payload.settings_json = JSON.stringify({ art_style: String(fields.art_style) }); }
                        }
                        updateProject(currentProjectId!, payload)
                          .then(p => { setCurrentProject(p); toastOk('项目已更新'); })
                          .catch(toastErr('更新项目失败'));
                      }
                      // ── 协作 ──────────────────────────────────────
                      else if (action === 'invite_member') {
                        if (!ensureProject()) return;
                        const username = String(params?.username || '').trim();
                        if (!username) { showToast('缺少 username', 'warning'); return; }
                        const role = params?.role === 'viewer' ? 'viewer' : 'editor';
                        addProjectCollaborator(currentProjectId!, { username, role })
                          .then(() => toastOk(`已邀请 ${username} 为 ${role}`))
                          .catch(toastErr('邀请失败'));
                      } else if (action === 'assign_task') {
                        showToast('请打开「任务分配」面板手动分配（AI 暂不直接写入任务表）', 'info');
                      }
                      // ── 版本回滚 ────────────────────────────────
                      else if (action === 'restore_version') {
                        const versionId = Number(params?.versionId); if (!versionId) { showToast('缺少 versionId', 'warning'); return; }
                        const restoreType = params?.restoreType === 'create_new' ? 'create_new' : 'single';
                        const token = getAuthToken();
                        fetch(`/api/version/restore/${versionId}?restoreType=${restoreType}`, { method: 'PUT', headers: { Authorization: `Bearer ${token}` } })
                          .then(async r => { if (!r.ok) throw new Error(await r.text()); refreshScenes(); toastOk('版本已回滚'); })
                          .catch(toastErr('回滚失败'));
                      }
                      else {
                        console.log('[AI Assistant] 未处理的 action:', action, params);
                        showToast(`未识别的 action: ${action}`, 'warning');
                      }
                    }}
                  />
                </Suspense>
              </ResizablePanel>
            )}
          </PanelGroup>

            {/* 智能拆分中遮罩 */}
            {autoStoryboard.isGenerating && (
              <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-black/60 backdrop-blur-sm">
                <div className="w-12 h-12 border-4 border-(--accent) border-t-transparent rounded-full animate-spin mb-4" />
                <div className="text-lg font-semibold text-white mb-1">正在智能拆分中</div>
                <div className="text-sm text-white/70">请稍候，AI 正在分析剧本并生成分镜与影棚...</div>
                {autoStoryboard.progress && (
                  <div className="mt-4 w-64">
                    <div className="h-1.5 bg-white/20 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-(--accent) rounded-full transition-all duration-500"
                        style={{ width: `${autoStoryboard.progress.overallProgress || 0}%` }}
                      />
                    </div>
                    <div className="text-xs text-white/60 mt-1.5 flex items-center justify-between">
                      <span className="text-white/40 italic">{LOADING_TIPS[tipIndex]}</span>
                      <span>{autoStoryboard.progress.overallProgress ? `${autoStoryboard.progress.overallProgress}%` : ''}</span>
                    </div>
                  </div>
                )}
              </div>
            )}
        </div>
        </div>
      )}

      {/* 版本控制面板 */}
      {selectedSceneData && currentProjectId && (
        <VersionHistoryPanel
          projectId={currentProjectId}
          resourceType="storyboard"
          resourceId={selectedSceneData.id}
          isOpen={isVersionHistoryOpen}
          onClose={() => setIsVersionHistoryOpen(false)}
          onRestoreVersion={(version) => {
            console.log('[StoryBoard] 版本已恢复:', version);
            refreshScenes();
          }}
        />
      )}

      {/* 团队协作面板 */}
      {currentProjectId && (
        <TeamCollaborationPanel
          projectId={currentProjectId}
          isOpen={isTeamCollaborationOpen}
          onClose={() => setIsTeamCollaborationOpen(false)}
        />
      )}

      {/* 帧批注面板 */}
      {selectedSceneData && currentProjectId && (
        <FrameAnnotationPanel
          storyboardId={selectedSceneData.id}
          projectId={currentProjectId}
          frameType="first"
          isOpen={isFrameAnnotationOpen}
          onClose={() => setIsFrameAnnotationOpen(false)}
        />
      )}

      {/* 自动分镜确认弹窗 */}
      <AutoStoryboardModal
        isOpen={autoStoryboard.showConfirmModal}
        onOpenChange={autoStoryboard.setShowConfirmModal}
        dontShowAgain={autoStoryboard.dontShowAgain}
        onDontShowAgainChange={autoStoryboard.setDontShowAgain}
        onConfirm={autoStoryboard.handleConfirmGenerate}
      />


      {/* 批量下载弹窗 */}
      <BatchDownloadModal
        isOpen={showBatchDownloadModal}
        onOpenChange={setShowBatchDownloadModal}
        scenes={scenes}
      />

      {/* Animatic 预览弹窗 */}
      <AnimaticPreview
        isOpen={isAnimaticOpen}
        onClose={() => setIsAnimaticOpen(false)}
        storyboards={scenes}
      />

      {/* 生成新剧本弹窗（弱绑定参考剧本） */}
      {currentProjectId && currentProject && (
        <ScriptGenerateModal
          isOpen={isGenerateScriptOpen}
          onOpenChange={setIsGenerateScriptOpen}
          projects={[currentProject]}
          aiModels={models as any}
          defaultTextModel={textModel}
          lockProjectId={currentProjectId}
          lockEpisodeNumber={currentEpisode}
          onSuccess={(payload?: ScriptGeneratedPayload) => {
            if (payload?.content) {
              setReferenceScriptContent(payload.content);
              setReferenceScriptTitle(payload.title || `新剧本`);
              showToast('新剧本已生成，已自动设为本次分镜的参考剧本', 'success');
            } else {
              showToast('剧本生成成功', 'success');
            }
          }}
          onError={(msg) => showToast(msg, 'error')}
        />
      )}
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
