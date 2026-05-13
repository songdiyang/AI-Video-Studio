/**
 * StoryBoard 核心状态管理 Hook
 * 提取原 index.tsx 中所有 state 和逻辑，供骨架和插件共享
 */

import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useSceneManager, StoryboardScene, DialogueLine } from '../useSceneManager';
import { useAutoStoryboard } from '../useAutoStoryboard';
import { useSceneGeneration } from '../useSceneGeneration';
import { useBatchResourceGeneration } from '../hooks/useBatchResourceGeneration';
import { batchValidateScenes } from '../../../services/storyboards';
import { fetchProject, updateProject, type Project } from '../../../services/projects';
import { getAuthToken } from '../../../services/auth';
import { fetchCharactersByProject, fetchScenesByProject, createCharacter, updateCharacter, deleteCharacter, generateCharacterViews, generateCharacterStateViews, fetchCharacterStates, createScene as createSceneAsset, updateScene as updateSceneAsset, deleteScene as deleteSceneAsset } from '../../../services/assets';
import { createScript as createScriptApi, deleteScript as deleteScriptApi, updateScriptTitle, fetchScripts } from '../../../services/scripts';
import { addProjectCollaborator } from '../../../services/collaboration';
import { useToast } from '../../../contexts/ToastContext';
import { useAIAssistantUI } from '../../../contexts/AIAssistantContext';
import { normalizeCapabilityOptions } from '../../../utils/modelCapabilities';
import type { AIModel } from '../../../components/AIModelSelector';
import type { 
  StoryboardCoreState, 
  SceneActions, 
  GenerationActions, 
  ResourceActions,
  Script 
} from './types';

interface UseStoryboardCoreOptions {
  scriptId?: number | null;
  projectId?: number | null;
  episodeNumber?: number;
  scripts?: Script[];
  models?: AIModel[];
  textModel: string;
  imageModel: string;
  videoModel: string;
  onEpisodeChange?: (episodeNumber: number, scriptId: number) => void;
  projectSettings?: {
    imageAspectRatio?: string;
    imageResolution?: string;
    videoAspectRatio?: string;
    videoResolution?: string;
  };
}

export function useStoryboardCore(options: UseStoryboardCoreOptions) {
  const {
    scriptId,
    projectId,
    episodeNumber = 1,
    scripts: externalScripts = [],
    models = [],
    textModel,
    imageModel,
    videoModel,
    onEpisodeChange,
    projectSettings
  } = options;

  const { showToast } = useToast();

  // ===== 基础状态 =====
  const [currentScriptId, setCurrentScriptId] = useState<number | null>(scriptId || null);
  const [currentProjectId, setCurrentProjectId] = useState<number | null>(projectId || null);
  const [currentEpisode, setCurrentEpisode] = useState(episodeNumber);
  const [standaloneMaxEpisode, setStandaloneMaxEpisode] = useState<number>(episodeNumber || 1);

  // 模型选择
  const [currentImageModel, setCurrentImageModel] = useState(imageModel);
  const [currentVideoModel, setCurrentVideoModel] = useState(videoModel);
  const [currentMultimodalModel, setCurrentMultimodalModel] = useState('');

  // UI 状态
  const [showBatchDownloadModal, setShowBatchDownloadModal] = useState(false);
  const [imageAspectRatio, setImageAspectRatio] = useState(projectSettings?.imageAspectRatio || '');
  const [videoAspectRatio, setVideoAspectRatio] = useState(projectSettings?.videoAspectRatio || '');
  const [videoDuration, setVideoDuration] = useState<number | null>(null);
  const [imageResolution, setImageResolution] = useState(projectSettings?.imageResolution || '');
  const [videoResolution, setVideoResolution] = useState(projectSettings?.videoResolution || '');
  const [isOptimizingAllPrompts, setIsOptimizingAllPrompts] = useState(false);
  const [isAnimaticOpen, setIsAnimaticOpen] = useState(false);
  const [isCommentPanelOpen, setIsCommentPanelOpen] = useState(false);
  const [isGenerateScriptOpen, setIsGenerateScriptOpen] = useState(false);
  const [isBatchFrameSubmitting, setIsBatchFrameSubmitting] = useState(false);
  const [isBatchVideoSubmitting, setIsBatchVideoSubmitting] = useState(false);

  // AI 助手面板状态
  const { 
    isOpen: isAssistantOpen, 
    toggle: toggleAssistant, 
    open: openAssistant,
    leftPanelOpen, 
    rightPanelOpen, 
    bottomPanelOpen,
    closeLeftPanel, 
    closeRightPanel, 
    closeBottomPanel 
  } = useAIAssistantUI();

  // 项目数据
  const [currentProject, setCurrentProject] = useState<Project | null>(null);
  const [scripts, setScripts] = useState<Script[]>(externalScripts);
  const scriptsRef = useRef(externalScripts);

  // 项目资源
  const [projectCharacters, setProjectCharacters] = useState<any[]>([]);
  const [projectScenes, setProjectScenes] = useState<any[]>([]);
  const [projectProps, setProjectProps] = useState<any[]>([]);

  // 剧本内容
  const [scriptContent, setScriptContent] = useState<string | null>(null);
  const [scriptTitle, setScriptTitle] = useState<string>('');
  const [isLoadingScript, setIsLoadingScript] = useState(false);
  const [referenceScriptContent, setReferenceScriptContent] = useState<string | null>(null);
  const [referenceScriptTitle, setReferenceScriptTitle] = useState<string>('');

  // ===== 同步外部 props =====
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
    if (imageModel !== undefined && imageModel !== currentImageModel) {
      setCurrentImageModel(imageModel);
    }
    if (videoModel !== undefined && videoModel !== currentVideoModel) {
      setCurrentVideoModel(videoModel);
    }
  }, [scriptId, projectId, episodeNumber, imageModel, videoModel]);

  // 同步外部 scripts 数组（仅当外部数组有新增脚本时同步，避免覆盖本地新增）
  useEffect(() => {
    setScripts(prev => {
      // 首次加载或外部有新增脚本时同步
      const currentIds = new Set(prev.map(s => s.id));
      const newFromExternal = externalScripts.filter(s => !currentIds.has(s.id));
      if (newFromExternal.length > 0) {
        // 外部有新增，合并到本地
        return [...prev, ...newFromExternal];
      }
      // 如果本地为空但外部有数据，使用外部数据
      if (prev.length === 0 && externalScripts.length > 0) {
        return externalScripts;
      }
      // 否则保留本地数据（避免外部旧数据覆盖本地新增）
      return prev;
    });
    scriptsRef.current = externalScripts;
  }, [externalScripts]);

  // 模型选项
  const modelMap = useMemo(() => {
    const map = new Map<string, typeof models[number]>();
    for (const m of models) map.set(m.name, m);
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
  const videoResolutionOptions = useMemo(() => [
    { value: '480p', label: '480p' },
    { value: '720p', label: '720p' },
    { value: '1080p', label: '1080p' }
  ], []);

  // 自动设置模型默认值
  useEffect(() => {
    if (!currentMultimodalModel && models.length > 0) {
      const firstMultimodal = models.find(m => (m.type || m.category)?.toUpperCase() === 'MULTIMODAL');
      if (firstMultimodal) setCurrentMultimodalModel(firstMultimodal.name);
    }
  }, [models, currentMultimodalModel]);

  // 自动设置比例/分辨率默认值
  useEffect(() => {
    if (projectSettings?.imageAspectRatio) return;
    if (imageAspectRatioOptions.length === 0) { setImageAspectRatio(''); return; }
    setImageAspectRatio(current => imageAspectRatioOptions.some(o => o.value === current) ? current : imageAspectRatioOptions[0].value);
  }, [imageAspectRatioOptions, projectSettings?.imageAspectRatio]);

  useEffect(() => {
    if (projectSettings?.imageResolution) return;
    if (imageResolutionOptions.length === 0) { setImageResolution(''); return; }
    setImageResolution(current => imageResolutionOptions.some(o => o.value === current) ? current : imageResolutionOptions[0].value);
  }, [imageResolutionOptions, projectSettings?.imageResolution]);

  useEffect(() => {
    if (!projectSettings?.videoAspectRatio) {
      if (videoAspectRatioOptions.length === 0) setVideoAspectRatio('');
      else setVideoAspectRatio(current => videoAspectRatioOptions.some(o => o.value === current) ? current : videoAspectRatioOptions[0].value);
    }
    if (videoDurationOptions.length === 0) { setVideoDuration(null); return; }
    setVideoDuration(current => {
      const currentValue = current === null ? '' : String(current);
      const matched = videoDurationOptions.find(o => o.value === currentValue);
      return matched ? Number(matched.value) : Number(videoDurationOptions[0].value);
    });
  }, [videoAspectRatioOptions, videoDurationOptions, projectSettings?.videoAspectRatio]);

  useEffect(() => {
    if (projectSettings?.videoResolution) return;
    if (videoResolutionOptions.length === 0) { setVideoResolution(''); return; }
    setVideoResolution(current => videoResolutionOptions.some(o => o.value === current) ? current : videoResolutionOptions[0].value);
  }, [videoResolutionOptions, projectSettings?.videoResolution]);

  // ===== 分镜管理 =====
  const {
    scenes, setScenes, selectedScene, setSelectedScene, isLoading,
    loadStoryboards, refresh: refreshScenes,
    addScene, insertScene, deleteScene,
    updateDescription, updateBaseDescription, updateVideoPrompt,
    updateFirstFramePrompt, updateLastFramePrompt,
    updateDialogues, updateVoiceover,
    moveScene, reorderScenes,
    updateCharactersAndLocation, updateProps, updateShotType,
    updateCharacterStates, updateDuration
  } = useSceneManager(currentScriptId, currentProjectId, currentEpisode);

  // ===== 自动分镜 =====
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
    loadStoryboards,
    referenceScriptContent,
    referenceScriptTitle
  });

  // ===== 场景生成 =====
  const { generateImage, generateVideo, generateWithCamera, generateWithPaint, generateWithSketch, generateHdRepair, tasks, isRunning } = useSceneGeneration({
    projectId: currentProjectId,
    scriptId: currentScriptId,
    episodeNumber: currentEpisode,
    scenes, setScenes,
    imageModel: currentImageModel,
    imageAspectRatio,
    textModel,
    videoModel: currentVideoModel,
    videoAspectRatio,
    videoDuration,
    videoResolution
  });

  // ===== 批量资源生成 =====
  const batchResource = useBatchResourceGeneration({
    projectId: currentProjectId,
    scriptId: currentScriptId,
    imageModel,
    textModel,
    imageAspectRatio,
    imageResolution: imageResolution || undefined,
    onCharactersComplete: () => {
      if (currentProjectId) fetchCharactersByProject(currentProjectId).then(setProjectCharacters).catch(() => {});
    },
    onScenesComplete: () => {
      if (currentProjectId) fetchScenesByProject(currentProjectId, currentScriptId || undefined).then(setProjectScenes).catch(() => {});
    },
  });

  // ===== 加载项目资源 =====
  useEffect(() => {
    if (!currentProjectId) return;
    fetchCharactersByProject(currentProjectId)
      .then(chars => setProjectCharacters(chars.map((c: any) => ({
        id: c.id, name: c.name,
        image_url: c.image_url,
        front_view_url: c.front_view_url || c.frontView_url,
        base_appearance: c.base_appearance,
        outfit_appearance: c.outfit_appearance,
        has_base_model: c.has_base_model_views ? 1 : 0,
        has_base_model_views: c.has_base_model_views ? 1 : 0,
        states_count: c.states_count || 0,
        active_state_name: c.active_state_name,
        active_state_outfit: c.active_state_outfit,
        active_state_image_url: c.active_state_image_url,
        base_front_view_url: c.base_model_image_url
      }))))
      .catch(() => {});
    fetchScenesByProject(currentProjectId)
      .then(scenes => setProjectScenes(scenes.map((s: any) => ({ id: s.id, name: s.name, description: s.description }))))
      .catch(() => {});
    const token = getAuthToken();
    fetch(`/api/props/project/${currentProjectId}`, {
      headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) }
    })
      .then(res => res.ok ? res.json() : null)
      .then(data => setProjectProps(data?.props || []))
      .catch(() => setProjectProps([]));
  }, [currentProjectId]);

  // ===== 加载剧本内容 =====
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
      .catch(() => { setScriptContent(null); setScriptTitle(''); })
      .finally(() => setIsLoadingScript(false));
  }, [currentScriptId, currentProjectId, currentEpisode]);

  // ===== 加载项目详情 =====
  useEffect(() => {
    if (!currentProjectId) { setCurrentProject(null); return; }
    let cancelled = false;
    fetchProject(currentProjectId)
      .then(p => { if (!cancelled) setCurrentProject(p); })
      .catch(() => { if (!cancelled) setCurrentProject(null); });
    return () => { cancelled = true; };
  }, [currentProjectId]);

  // ===== 监听批注事件 =====
  useEffect(() => {
    const handleOpenComment = (e: CustomEvent) => {
      const { storyboardId } = e.detail || {};
      if (storyboardId) { setSelectedScene(storyboardId); setIsCommentPanelOpen(true); }
    };
    window.addEventListener('open-storyboard-comment', handleOpenComment as EventListener);
    return () => window.removeEventListener('open-storyboard-comment', handleOpenComment as EventListener);
  }, []);

  // ===== 集数切换 =====
  const handleEpisodeSelect = useCallback((script: Script | null) => {
    if (!script) { setCurrentScriptId(null); return; }
    setCurrentScriptId(script.id);
    setCurrentEpisode(script.episode_number);
    onEpisodeChange?.(script.episode_number, script.id);
  }, [onEpisodeChange]);

  const handleStandaloneEpisodeChange = useCallback((episode: number) => {
    if (!isNaN(episode) && episode >= 1) {
      setCurrentEpisode(episode);
      setStandaloneMaxEpisode(prev => Math.max(prev, episode));
      if (currentProjectId) {
        try {
          localStorage.setItem(`nano_progress_episode_${currentProjectId}`, String(episode));
          const prevMaxRaw = localStorage.getItem(`nano_progress_max_episode_${currentProjectId}`);
          const prevMax = prevMaxRaw ? parseInt(prevMaxRaw, 10) : 0;
          if (episode > (isNaN(prevMax) ? 0 : prevMax)) {
            localStorage.setItem(`nano_progress_max_episode_${currentProjectId}`, String(episode));
          }
        } catch {}
      }
    }
  }, [currentProjectId]);

  // 恢复进度标签
  useEffect(() => {
    if (!currentProjectId || currentScriptId) return;
    try {
      const raw = localStorage.getItem(`nano_progress_episode_${currentProjectId}`);
      const maxRaw = localStorage.getItem(`nano_progress_max_episode_${currentProjectId}`);
      const cur = raw ? parseInt(raw, 10) : NaN;
      const mx = maxRaw ? parseInt(maxRaw, 10) : NaN;
      if (!isNaN(cur) && cur >= 1 && cur !== currentEpisode) setCurrentEpisode(cur);
      const baseline = !isNaN(cur) ? cur : (currentEpisode || 1);
      setStandaloneMaxEpisode(Math.max(isNaN(mx) ? 0 : mx, baseline, 1));
    } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentProjectId, currentScriptId]);

  // ===== 批量操作 =====
  const handleBatchOptimizePrompts = useCallback(async (targetType: 'image' | 'video' = 'image') => {
    if (isOptimizingAllPrompts) { showToast('正在优化中，请稍候', 'warning'); return; }
    if (!currentProjectId) { showToast('请先选择项目', 'warning'); return; }
    if (scenes.length === 0) { showToast('没有可优化的分镜', 'warning'); return; }
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
        if (res.status === 409 && err.jobId) { showToast('已有提示词优化任务正在运行中', 'warning'); return; }
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
  }, [isOptimizingAllPrompts, currentProjectId, scenes.length, currentScriptId, textModel, showToast]);

  const handleBatchFrameGeneration = useCallback(async (overwrite = false) => {
    if (!currentProjectId) { showToast('请先选择项目', 'warning'); return; }
    if (!imageModel) { showToast('请先选择图片模型', 'warning'); return; }
    if (!imageAspectRatio) { showToast('当前图片模型未配置可用长宽比', 'warning'); return; }
    if (scenes.length === 0) { showToast('没有分镜可生成', 'warning'); return; }
    setIsBatchFrameSubmitting(true);
    try {
      let targetScenes = scenes.filter(s => s.id != null);
      if (!overwrite) {
        targetScenes = targetScenes.filter(s => {
          if (s.hasAction) return !(s.startFrame && s.endFrame);
          return !s.startFrame;
        });
      }
      if (targetScenes.length === 0) { showToast('所有分镜已有帧图片，无需生成', 'info'); return; }
      const sceneIds = targetScenes.map(s => s.id!);
      let validSceneIds = sceneIds;
      try {
        const validation = await batchValidateScenes(sceneIds, currentScriptId, 'frame', currentProjectId);
        validSceneIds = validation.results.filter(r => r.ready).map(r => r.sceneId);
        const skippedCount = validation.results.filter(r => !r.ready).length;
        if (skippedCount > 0) showToast(`${skippedCount} 个分镜因资源不完整被跳过`, 'warning');
      } catch (err) { console.warn('[BatchFrame] 预检失败，尝试全部生成:', err); }
      if (validSceneIds.length === 0) { showToast('所有分镜都因资源不完整被跳过', 'error'); return; }
      let startedCount = 0;
      let skippedCount = 0;
      for (const sceneId of validSceneIds) {
        const scene = scenes.find(s => s.id === sceneId);
        if (!scene) continue;
        const result = await generateImage(sceneId, scene.description || '');
        if (result.success) startedCount++;
        else { skippedCount++; console.warn(`[BatchFrame] 分镜 ${sceneId} 跳过: ${result.error}`); }
      }
      showToast(`已启动 ${startedCount} 个分镜的帧生成任务${skippedCount > 0 ? `，${skippedCount} 个跳过` : ''}`, 'info');
    } catch (error: any) {
      showToast('首尾帧批量生成失败，请稍后重试', 'error');
      console.error('首尾帧批量生成失败:', error);
    } finally {
      setIsBatchFrameSubmitting(false);
    }
  }, [currentProjectId, imageModel, imageAspectRatio, scenes, currentScriptId, generateImage, showToast]);

  const handleBatchVideoGeneration = useCallback(async (overwrite = false) => {
    if (!currentProjectId || scenes.length === 0) { showToast('请先生成分镜', 'warning'); return; }
    if (!videoModel) { showToast('请先选择视频生成模型', 'warning'); return; }
    if (!videoAspectRatio) { showToast('当前视频模型未配置可用长宽比', 'warning'); return; }
    setIsBatchVideoSubmitting(true);
    try {
      let targetScenes = scenes.filter(s => s.id != null);
      if (!overwrite) targetScenes = targetScenes.filter(s => !s.videoUrl);
      if (targetScenes.length === 0) { showToast('所有分镜已有视频，无需生成', 'info'); return; }
      const sceneIds = targetScenes.map(s => s.id!);
      let validSceneIds = sceneIds;
      try {
        const validation = await batchValidateScenes(sceneIds, currentScriptId, 'video', currentProjectId);
        validSceneIds = validation.results.filter(r => r.ready).map(r => r.sceneId);
        const skippedCount = validation.results.filter(r => !r.ready).length;
        if (skippedCount > 0) showToast(`${skippedCount} 个分镜因资源不完整被跳过`, 'warning');
      } catch (err) { console.warn('[BatchVideo] 预检失败，尝试全部生成:', err); }
      if (validSceneIds.length === 0) { showToast('所有分镜都因资源不完整被跳过', 'error'); return; }
      let startedCount = 0;
      let skippedCount = 0;
      for (const sceneId of validSceneIds) {
        const result = await generateVideo(sceneId);
        if (result.success) startedCount++;
        else { skippedCount++; console.warn(`[BatchVideo] 分镜 ${sceneId} 跳过: ${result.error}`); }
      }
      showToast(`已启动 ${startedCount} 个分镜的视频生成任务${skippedCount > 0 ? `，${skippedCount} 个跳过` : ''}`, 'info');
    } catch (error: any) {
      showToast('视频批量生成失败，请稍后重试', 'error');
      console.error('视频批量生成失败:', error);
    } finally {
      setIsBatchVideoSubmitting(false);
    }
  }, [currentProjectId, scenes, videoModel, videoAspectRatio, currentScriptId, generateVideo, showToast]);

  // ===== 导入分镜 =====
  const handleImportScenes = useCallback(async (importedScenes: any[]) => {
    if (!currentProjectId) { showToast('请先选择项目', 'warning'); return; }
    try {
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
      await refreshScenes();
    } catch (error: any) {
      console.error('[ImportScenes] 保存失败:', error);
      showToast('导入失败: ' + error.message, 'error');
    }
  }, [currentProjectId, currentScriptId, refreshScenes, showToast]);

  // ===== 新建下一集 =====
  const handleCreateNextEpisode = useCallback(async () => {
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
      if (res?.scriptId) {
        // 将新集添加到 scripts 数组
        const newScript: Script = {
          id: res.scriptId,
          episode_number: nextEp,
          title: title,
          status: 'completed',
        };
        setScripts(prev => [...prev, newScript]);
        setStandaloneMaxEpisode(nextEp);
        onEpisodeChange?.(nextEp, res.scriptId);
        setCurrentScriptId(res.scriptId);
        setCurrentEpisode(nextEp);
      }
    } catch (err: any) {
      console.error('[StoryBoard.createNextEpisode]', err);
      showToast(err?.message || '添加集数失败', 'error');
    }
  }, [currentProjectId, scripts, currentScriptId, onEpisodeChange, showToast]);

  // ===== 选中分镜数据 =====
  const selectedSceneData = useMemo(() => 
    scenes.find(s => s.id === selectedScene) || null, [scenes, selectedScene]);

  // 分镜级角色状态覆写
  const storyboardStates = selectedSceneData?.characterStates || {};
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

  // ===== 事件总线 =====
  const eventHandlers = useRef<Map<string, Set<(payload: any) => void>>>(new Map());
  const emit = useCallback((event: string, payload?: any) => {
    const handlers = eventHandlers.current.get(event);
    if (handlers) handlers.forEach(h => h(payload));
  }, []);
  const on = useCallback((event: string, handler: (payload: any) => void) => {
    if (!eventHandlers.current.has(event)) eventHandlers.current.set(event, new Set());
    eventHandlers.current.get(event)!.add(handler);
    return () => { eventHandlers.current.get(event)?.delete(handler); };
  }, []);

  // ===== 通用状态更新 =====
  const setState = useCallback(<K extends keyof StoryboardCoreState>(key: K, value: StoryboardCoreState[K]) => {
    switch (key) {
      case 'currentScriptId': setCurrentScriptId(value as number | null); break;
      case 'currentProjectId': setCurrentProjectId(value as number | null); break;
      case 'currentEpisode': setCurrentEpisode(value as number); break;
      case 'showBatchDownloadModal': setShowBatchDownloadModal(value as boolean); break;
      case 'isAnimaticOpen': setIsAnimaticOpen(value as boolean); break;
      case 'isCommentPanelOpen': setIsCommentPanelOpen(value as boolean); break;
      case 'isGenerateScriptOpen': setIsGenerateScriptOpen(value as boolean); break;
      case 'currentImageModel': setCurrentImageModel(value as string); break;
      case 'currentVideoModel': setCurrentVideoModel(value as string); break;
      case 'imageAspectRatio': setImageAspectRatio(value as string); break;
      case 'videoAspectRatio': setVideoAspectRatio(value as string); break;
      case 'imageResolution': setImageResolution(value as string); break;
      case 'videoResolution': setVideoResolution(value as string); break;
      case 'scriptContent': setScriptContent(value as string | null); break;
      case 'scriptTitle': setScriptTitle(value as string); break;
      case 'referenceScriptContent': setReferenceScriptContent(value as string | null); break;
      case 'referenceScriptTitle': setReferenceScriptTitle(value as string); break;
      default: break;
    }
  }, []);

  // ===== 组装核心状态 =====
  const state: StoryboardCoreState = {
    currentScriptId, currentProjectId, currentEpisode, standaloneMaxEpisode,
    currentProject, scripts,
    currentImageModel, currentVideoModel, currentMultimodalModel, textModel, models,
    imageAspectRatio, videoAspectRatio, videoDuration, imageResolution, videoResolution,
    projectCharacters: effectiveProjectCharacters, projectScenes, projectProps,
    scriptContent, scriptTitle, isLoadingScript,
    referenceScriptContent, referenceScriptTitle,
    showBatchDownloadModal, isOptimizingAllPrompts, isAnimaticOpen, isCommentPanelOpen, isGenerateScriptOpen,
    isBatchFrameSubmitting, isBatchVideoSubmitting,
  };

  // ===== 组装操作接口 =====
  const sceneActions: SceneActions = {
    addScene, insertScene, deleteScene, moveScene, reorderScenes,
    updateDescription, updateBaseDescription, updateVideoPrompt,
    updateFirstFramePrompt, updateLastFramePrompt,
    updateDialogues, updateVoiceover,
    updateCharactersAndLocation, updateProps, updateShotType,
    updateCharacterStates, updateDuration,
    updateScene: async (id, updates) => {
      setScenes(prev => prev.map(s => s.id === id ? { ...s, ...updates } : s));
      if (updates.shotType !== undefined) await updateShotType(id, updates.shotType);
      return true;
    },
    refreshScenes, loadStoryboards,
  };

  const generationActions: GenerationActions = {
    generateImage, generateVideo, generateWithCamera, generateWithPaint, generateWithSketch, generateHdRepair,
    handleBatchFrameGeneration, handleBatchVideoGeneration, handleBatchOptimizePrompts,
  };

  const resourceActions: ResourceActions = {
    fetchProjectCharacters: async () => {
      if (currentProjectId) fetchCharactersByProject(currentProjectId).then(setProjectCharacters).catch(() => {});
    },
    fetchProjectScenes: async () => {
      if (currentProjectId) fetchScenesByProject(currentProjectId, currentScriptId || undefined).then(setProjectScenes).catch(() => {});
    },
    fetchProjectProps: async () => {
      if (!currentProjectId) return;
      const token = getAuthToken();
      fetch(`/api/props/project/${currentProjectId}`, {
        headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) }
      })
        .then(res => res.ok ? res.json() : null)
        .then(data => setProjectProps(data?.props || []))
        .catch(() => setProjectProps([]));
    },
    createCharacter: (data) => createCharacter(data),
    updateCharacter: (id, fields) => updateCharacter(id, fields),
    deleteCharacter: (id) => deleteCharacter(id),
    createLocation: (data) => createSceneAsset(data),
    updateLocation: (id, fields) => updateSceneAsset(id, fields),
    deleteLocation: (id) => deleteSceneAsset(id),
  };

  return {
    // 状态
    state,
    scenes,
    setScenes,
    selectedScene,
    setSelectedScene,
    selectedSceneData,
    isLoading,
    
    // 操作
    sceneActions,
    generationActions,
    resourceActions,
    
    // 集数
    handleEpisodeSelect,
    handleStandaloneEpisodeChange,
    handleCreateNextEpisode,
    handleImportScenes,
    
    // 事件
    emit,
    on,
    
    // 状态更新
    setState,
    
    // AI 助手面板控制
    isAssistantOpen, toggleAssistant, openAssistant,
    leftPanelOpen, rightPanelOpen, bottomPanelOpen,
    closeLeftPanel, closeRightPanel, closeBottomPanel,
    
    // 自动分镜
    autoStoryboard,
    
    // 任务
    tasks,
    isRunning,
    
    // 工具
    showToast,
    
    // 原始数据（供骨架使用）
    projectCharacters: effectiveProjectCharacters,
    projectScenes,
    projectProps,
    storyboardStates,
    currentProject,
    scripts,
  };
}
