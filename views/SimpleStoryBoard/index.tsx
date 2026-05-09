import React, { useState, useEffect, useMemo } from 'react';
import { useSceneManager } from '../StoryBoard/useSceneManager';
import { useAutoStoryboard } from '../StoryBoard/useAutoStoryboard';
import { useSceneGeneration } from '../StoryBoard/useSceneGeneration';
import { useBatchFrameGeneration } from '../StoryBoard/hooks/useBatchFrameGeneration';
import { useBatchSceneVideoGeneration } from '../StoryBoard/hooks/useBatchSceneVideoGeneration';
import { useBatchResourceGeneration } from '../StoryBoard/hooks/useBatchResourceGeneration';
import { useWorkflowTargetMonitor } from '../StoryBoard/hooks/useWorkflowTargetMonitor';
import { useCharacterData } from '../StoryBoard/ResourcePanel/useCharacterData';
import { useSceneData } from '../StoryBoard/ResourcePanel/useSceneData';
import { PropItem } from '../StoryBoard/ResourcePanel/types';
import DarkEpisodeSelector from './DarkEpisodeSelector';
import AutoStoryboardModal from '../StoryBoard/AutoStoryboardModal';
import StoryboardTable from './StoryboardTable';
import ResourceSidebar from './ResourceSidebar';
import { Wand2, Users, Image, Film, Video, Play } from 'lucide-react';
import { Button } from '@heroui/react';
import { getAuthToken } from '../../services/auth';
import { useToast } from '../../contexts/ToastContext';
import { AIModel } from '../../components/AIModelSelector';
import { normalizeCapabilityOptions } from '../../utils/modelCapabilities';
import { AnimaticPreview } from '../StoryBoard/AnimaticPreview';

interface Script {
  id: number;
  episode_number: number;
  title: string;
  status: string;
}

interface SimpleStoryBoardProps {
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

const SimpleStoryBoard: React.FC<SimpleStoryBoardProps> = ({
  scriptId,
  projectId,
  episodeNumber = 1,
  scripts = [],
  models = [],
  textModel,
  imageModel,
  videoModel,
  onEpisodeChange,
}) => {
  const [currentScriptId, setCurrentScriptId] = useState<number | null>(scriptId || null);
  const [currentProjectId, setCurrentProjectId] = useState<number | null>(projectId || null);
  const [currentEpisode, setCurrentEpisode] = useState(episodeNumber);

  // 右侧面板联动状态
  const [selectedCharName, setSelectedCharName] = useState<string | null>(null);
  const [selectedSceneName, setSelectedSceneName] = useState<string | null>(null);
  const [isAnimaticOpen, setIsAnimaticOpen] = useState(false);

  const imageAspectRatio = useMemo(() => {
    const model = models.find((item) => item.name === imageModel && (item.type || item.category)?.toUpperCase() === 'IMAGE');
    return normalizeCapabilityOptions(model?.supportedAspectRatios, 'aspectRatio')[0]?.value || '';
  }, [models, imageModel]);

  const videoAspectRatio = useMemo(() => {
    const model = models.find((item) => item.name === videoModel && (item.type || item.category)?.toUpperCase() === 'VIDEO');
    return normalizeCapabilityOptions(model?.supportedAspectRatios, 'aspectRatio')[0]?.value || '';
  }, [models, videoModel]);

  const videoDuration = useMemo(() => {
    const model = models.find((item) => item.name === videoModel && (item.type || item.category)?.toUpperCase() === 'VIDEO');
    const firstOption = normalizeCapabilityOptions(model?.supportedDurations, 'duration')[0];
    return firstOption ? Number(firstOption.value) : null;
  }, [models, videoModel]);

  const imageResolution = useMemo(() => {
    const model = models.find((item) => item.name === imageModel && (item.type || item.category)?.toUpperCase() === 'IMAGE');
    return normalizeCapabilityOptions(model?.supportedResolutions, 'resolution')[0]?.value || '';
  }, [models, imageModel]);

  const videoResolution = useMemo(() => {
    const model = models.find((item) => item.name === videoModel && (item.type || item.category)?.toUpperCase() === 'VIDEO');
    return normalizeCapabilityOptions(model?.supportedResolutions, 'resolution')[0]?.value || '';
  }, [models, videoModel]);

  useEffect(() => { if (scriptId !== currentScriptId) setCurrentScriptId(scriptId || null); }, [scriptId]);
  useEffect(() => { if (projectId !== currentProjectId) setCurrentProjectId(projectId || null); }, [projectId]);
  useEffect(() => { if (episodeNumber !== currentEpisode) setCurrentEpisode(episodeNumber); }, [episodeNumber]);

  // 复用现有 hooks
  const {
    scenes, setScenes, isLoading, loadStoryboards,
    addScene, deleteScene, updateDescription, reorderScenes,
  } = useSceneManager(currentScriptId, currentProjectId);

  const autoStoryboard = useAutoStoryboard({
    scriptId: currentScriptId,
    projectId: currentProjectId,
    isActive: true,
    hasExistingScenes: scenes.length > 0,
    textModel,
    onScenesGenerated: (newScenes) => setScenes(newScenes),
  });

  // 批量资源生成（角色/场景）
  const batchResource = useBatchResourceGeneration({
    projectId: currentProjectId,
    scriptId: currentScriptId,
    imageModel,
    textModel,
    imageAspectRatio,
    imageResolution: imageResolution || undefined,
    onCharactersComplete: () => loadCharacters(),
    onScenesComplete: () => loadScenes(),
  });

  const { generateImage, generateVideo, tasks } = useSceneGeneration({
    projectId: currentProjectId,
    scriptId: currentScriptId,
    episodeNumber: currentEpisode,
    scenes, setScenes,
    imageModel,
    imageAspectRatio,
    textModel,
    videoModel,
    videoAspectRatio,
    videoDuration,
  });

  const batchFrameGen = useBatchFrameGeneration({
    scriptId: currentScriptId,
    projectId: currentProjectId,
    imageModel,
    aspectRatio: imageAspectRatio,
    resolution: imageResolution || undefined,
    textModel,
    scenes,
    onComplete: () => {
      if (currentScriptId) {
        loadStoryboards(currentScriptId);
      }
    },
    onError: (msg) => showToast(msg, 'error'),
  });

  const batchSceneVideoGen = useBatchSceneVideoGeneration({
    scriptId: currentScriptId,
    projectId: currentProjectId,
    videoModel,
    textModel,
    aspectRatio: videoAspectRatio,
    duration: videoDuration,
    resolution: videoResolution || undefined,
    onComplete: () => {
      if (currentScriptId) {
        loadStoryboards(currentScriptId);
      }
    },
    onError: (msg) => showToast(msg, 'error'),
  });

  // 数据库角色/场景
  const { dbCharacters, isLoadingCharacters, loadCharacters } = useCharacterData(currentProjectId, currentScriptId);
  const { dbScenes, isLoadingScenes, loadScenes } = useSceneData(currentProjectId, currentScriptId);
  const { showToast } = useToast();

  // 项目道具数据（从数据库加载）
  const [dbProps, setDbProps] = useState<PropItem[]>([]);
  useEffect(() => {
    if (!currentProjectId) {
      setDbProps([]);
      return;
    }
    const token = getAuthToken();
    fetch(`/api/props/project/${currentProjectId}`, {
      headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) }
    })
      .then(res => res.ok ? res.json() : null)
      .then(data => setDbProps(data?.props || []))
      .catch(() => setDbProps([]));
  }, [currentProjectId]);

  useWorkflowTargetMonitor({
    projectId: currentProjectId ?? null,
    workflowTypes: ['character_views_generation'],
    targetParamKey: 'characterId',
    isActive: true,
    onCompleted: async (job) => {
      await loadCharacters();
      showToast(`角色三视图生成完成：${job.input_params?.characterName || '角色'}`, 'success');
    },
    onFailed: async (job) => {
      showToast(`角色三视图生成失败：${job.input_params?.characterName || '角色'}`, 'error');
    }
  });

  useWorkflowTargetMonitor({
    projectId: currentProjectId ?? null,
    workflowTypes: ['scene_image_generation'],
    targetParamKey: 'sceneId',
    isActive: true,
    onCompleted: async (job) => {
      await loadScenes();
      showToast(`场景图片生成完成：${job.input_params?.sceneName || '场景'}`, 'success');
    },
    onFailed: async (job) => {
      showToast(`场景图片生成失败：${job.input_params?.sceneName || '场景'}`, 'error');
    }
  });

  // 收集道具名称（用于显示分镜中使用的道具）
  const allPropNames = [...new Set(scenes.flatMap(s => s.props || []))];
  // 合并数据库道具 + 分镜中提到的道具（以数据库为准，补充分镜中未入库的名称）
  const allProps = useMemo(() => {
    const dbNames = new Set(dbProps.map(p => p.name));
    const extraNames = allPropNames.filter(n => !dbNames.has(n));
    const extraProps: PropItem[] = extraNames.map(name => ({ id: 0, name }));
    return [...dbProps, ...extraProps];
  }, [dbProps, allPropNames]);

  // 集数切换
  const handleEpisodeSelect = (script: Script) => {
    setCurrentScriptId(script.id);
    setCurrentEpisode(script.episode_number);
    onEpisodeChange?.(script.episode_number, script.id);
  };

  // 角色图片生成
  const handleGenerateCharacterImage = async (characterId: number, imageModel: string) => {
    if (!characterId || !imageModel) {
      showToast('缺少必要参数，请选择角色和模型', 'warning');
      return;
    }

    try {
      showToast('正在生成角色三视图...', 'info');
      const token = getAuthToken();
      const response = await fetch(`/api/characters/${characterId}/generate-views`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          imageModel,
          textModel,
          style: '', // 可以从项目设置中获取
          aspectRatio: imageAspectRatio,
          resolution: imageResolution || undefined,
        }),
      });

      const data = await response.json();
      if (response.ok) {
        // 刷新角色数据
        loadCharacters();
      } else if (response.status === 409 && data.jobId) {
      } else {
        console.error('角色三视图生成失败:', data);
      }
    } catch (error) {
      showToast('生成角色图片失败，请稍后重试', 'error');
      console.error('生成角色图片出错:', error);
    }
  };

  // 场景图片生成
  const handleGenerateSceneImage = async (sceneId: number, imageModel: string, options?: { customPromptA?: string; customPromptB?: string }) => {
    if (!sceneId || !imageModel) {
      showToast('缺少必要参数，请选择场景和模型', 'warning');
      return;
    }
    if (!imageAspectRatio) {
      showToast('当前图片模型未配置可用长宽比', 'warning');
      return;
    }

    try {
      showToast('正在生成场景图片...', 'info');
      const token = getAuthToken();
      const response = await fetch(`/api/scenes/${sceneId}/generate-image`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          imageModel,
          textModel,
          aspectRatio: imageAspectRatio,
          resolution: imageResolution || undefined,
          customPromptA: options?.customPromptA,
          customPromptB: options?.customPromptB,
        }),
      });

      const data = await response.json();
      if (response.ok) {
        // 刷新场景数据
        loadScenes();
      } else if (response.status === 409 && data.jobId) {
      } else {
        console.error('场景图片生成失败:', data);
      }
    } catch (error) {
      showToast('生成场景图片失败，请稍后重试', 'error');
      console.error('生成场景图片出错:', error);
    }
  };

  // 批量生成首尾帧
  const handleBatchFrameGeneration = async () => {
    if (!currentScriptId || scenes.length === 0) {
      showToast('请先生成分镜', 'warning');
      return;
    }
    if (!imageModel) {
      showToast('请先选择图像模型', 'warning');
      return;
    }
    showToast(`正在批量生成 ${scenes.length} 个分镜的首尾帧...`, 'info');
    await batchFrameGen.startBatchGeneration(false);
  };

  // 批量生成视频
  const handleBatchVideoGeneration = async () => {
    if (!currentScriptId || scenes.length === 0) {
      showToast('请先生成分镜', 'warning');
      return;
    }
    showToast(`正在批量生成 ${scenes.length} 个分镜的视频...`, 'info');
    await batchSceneVideoGen.startBatchVideoGeneration(false);
  };


  return (
    <div className="h-full flex flex-col" style={{ backgroundColor: 'var(--bg-body)', color: 'var(--text-primary)' }}>
      {/* 顶部栏 */}
      <div 
        className="px-4 py-2.5 border-b flex items-center gap-4"
        style={{ 
          backgroundColor: 'var(--bg-card)', 
          borderColor: 'var(--border-color)' 
        }}
      >
        <h2 className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>分镜设计</h2>
        <DarkEpisodeSelector
          scripts={scripts}
          currentEpisode={currentEpisode}
          onSelect={handleEpisodeSelect}
        />
        {isLoading && <span className="text-xs" style={{ color: 'var(--text-muted)' }}>加载中...</span>}
        
        {/* 批量生成按钮 */}
        <div className="flex-1" />
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            className="bg-gradient-to-r from-violet-600 to-purple-600 text-white font-bold shadow-md hover:shadow-lg hover:from-violet-700 hover:to-purple-700 transition-all cursor-pointer"
            startContent={<Users className="w-3.5 h-3.5" />}
            onPress={batchResource.handleBatchCharacterGeneration}
            isDisabled={!currentScriptId || batchResource.isSubmittingCharacterBatch || batchResource.isCharacterBatchGenerating}
            isLoading={batchResource.isSubmittingCharacterBatch || batchResource.isCharacterBatchGenerating}
          >
            批量生成角色
          </Button>
          <Button
            size="sm"
            className="bg-gradient-to-r from-emerald-600 to-teal-600 text-white font-bold shadow-md hover:shadow-lg hover:from-emerald-700 hover:to-teal-700 transition-all cursor-pointer"
            startContent={<Image className="w-3.5 h-3.5" />}
            onPress={batchResource.handleBatchSceneGeneration}
            isDisabled={!currentScriptId || batchResource.isSubmittingSceneBatch || batchResource.isSceneBatchGenerating}
            isLoading={batchResource.isSubmittingSceneBatch || batchResource.isSceneBatchGenerating}
          >
            批量生成场景
          </Button>
          <Button
            size="sm"
            className="bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-bold shadow-md hover:shadow-lg hover:from-blue-700 hover:to-indigo-700 transition-all cursor-pointer"
            startContent={<Film className="w-3.5 h-3.5" />}
            onPress={handleBatchFrameGeneration}
            isDisabled={!currentScriptId || batchFrameGen.isGenerating}
            isLoading={batchFrameGen.isGenerating}
          >
            批量生成首尾帧
          </Button>
          <Button
            size="sm"
            className="bg-gradient-to-r from-rose-600 to-red-600 text-white font-bold shadow-md hover:shadow-lg hover:from-rose-700 hover:to-red-700 transition-all cursor-pointer"
            startContent={<Video className="w-3.5 h-3.5" />}
            onPress={handleBatchVideoGeneration}
            isDisabled={!currentScriptId || batchSceneVideoGen.isGenerating}
            isLoading={batchSceneVideoGen.isGenerating}
          >
            批量生成视频
          </Button>
          {scenes.length > 0 && (
            <Button
              size="sm"
              variant="flat"
              color="secondary"
              startContent={<Play className="w-3.5 h-3.5" />}
              onPress={() => setIsAnimaticOpen(true)}
            >
              播放分镜
            </Button>
          )}
        </div>
      </div>

      {/* 无项目提示 */}
      {!currentProjectId && (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center" style={{ color: 'var(--text-muted)' }}>
            <Wand2 className="w-12 h-12 mx-auto mb-3" style={{ color: 'var(--text-muted)' }} />
            <p className="text-sm font-medium">请先选择项目</p>
            <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>选择项目后即可开始分镜创作</p>
          </div>
        </div>
      )}

      {/* 主内容 */}
      {currentProjectId && (
        <div className="flex-1 flex overflow-hidden">
          {/* 左侧：表格 */}
          <StoryboardTable
            scenes={scenes}
            dbCharacters={dbCharacters}
            dbScenes={dbScenes}
            tasks={tasks}
            onAddScene={addScene}
            onDeleteScene={deleteScene}
            onUpdateDescription={updateDescription}
            onGenerateVideo={generateVideo}
            onGenerateImage={generateImage}
            onCharacterClick={(name) => setSelectedCharName(name)}
            onSceneClick={(name) => setSelectedSceneName(name)}
            onPropClick={() => {}}
            onAddCharacterToScene={() => {}}
            onAddSceneToScene={() => {}}
            onReorderScenes={reorderScenes}
            onAutoGenerate={autoStoryboard.handleAutoGenerateClick}
            isAutoGenerating={autoStoryboard.isGenerating}
          />

          {/* 右侧：资源面板 */}
          <ResourceSidebar
            dbCharacters={dbCharacters}
            dbScenes={dbScenes}
            props={allProps}
            usedCharacterNames={[...new Set(scenes.flatMap(s => s.characters || []))]}
            usedSceneNames={[...new Set(scenes.map(s => s.location).filter(Boolean))]}
            imageModel={imageModel}
            textModel={textModel}
            selectedCharacterName={selectedCharName}
            selectedSceneName={selectedSceneName}
            onClearSelection={() => { setSelectedCharName(null); setSelectedSceneName(null); }}
            onGenerateCharacterImage={handleGenerateCharacterImage}
            onGenerateSceneImage={handleGenerateSceneImage}
          />
        </div>
      )}

      {/* 自动分镜确认弹窗 */}
      <AutoStoryboardModal
        isOpen={autoStoryboard.showConfirmModal}
        onOpenChange={autoStoryboard.setShowConfirmModal}
        onConfirm={autoStoryboard.handleConfirmGenerate}
      />

      {/* Animatic 预览弹窗 */}
      <AnimaticPreview
        isOpen={isAnimaticOpen}
        onClose={() => setIsAnimaticOpen(false)}
        storyboards={scenes}
      />
    </div>
  );
};

export default SimpleStoryBoard;
