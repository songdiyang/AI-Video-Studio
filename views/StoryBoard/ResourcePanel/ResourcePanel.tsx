import React, { useEffect, useMemo, useState } from 'react';
import { Button } from '@heroui/react';
import { Save } from 'lucide-react';
import { ResourcePanelProps, TabType } from './types';
import { useCharacterData } from './useCharacterData';
import { useSceneData, Scene } from './useSceneData';
import TabButtons from './TabButtons';
import CharactersTab from './CharactersTab';
import LocationsTab from './LocationsTab';
import PropsTab from './PropsTab';
import CharacterViewsModal from './CharacterViewsModal';
import CharacterDetailModal from './CharacterDetailModal';
import CharacterLifecyclePanel from './CharacterLifecyclePanel';
import SceneDetailModal from './SceneDetailModal';
import SceneImageModal from './SceneImageModal';
import CreateAssetModal, { CreateAssetType } from './CreateAssetModal';
import { useResourceModals } from './useResourceModals';
import { Character } from './types';
import { getAuthToken } from '../../../services/auth';
import { deleteCharacter, uploadCharacterImage } from '../../../services/assets';
import { useToast } from '../../../contexts/ToastContext';
import { useConfirm } from '../../../contexts/ConfirmContext';
import { useWorkflowTargetMonitor } from '../hooks/useWorkflowTargetMonitor';
import { normalizeCapabilityOptions } from '../../../utils/modelCapabilities';

export interface StoryboardStateOverride {
  stateId: number;
  stateName: string;
  stateImage?: string;
  stateOutfit?: string;
}

const ResourcePanel: React.FC<ResourcePanelProps & {
  /** 分镜状态覆写回调 - 用户在资源面板选择某角色的分镜状态时触发 */
  onStoryboardStateChange?: (characterId: number, state: StoryboardStateOverride | null) => void;
  /** 当前分镜状态覆写映射 */
  storyboardStates?: Record<number, StoryboardStateOverride>;
}> = ({ 
  characters, 
  props,
  projectId,
  scriptId,
  scenes,
  imageModel,
  imageAspectRatio,
  textModel,
  models = [],
  onStoryboardStateChange,
  storyboardStates = {},
}) => {
  const [activeTab, setActiveTab] = useState<TabType>('characters');
  const { showToast } = useToast();
  const { confirm } = useConfirm();

  // 当用户未手动选择图片模型时，自动从可用模型列表中选取第一个 IMAGE 模型作为 fallback
  const effectiveImageModel = useMemo(() => {
    if (imageModel) return imageModel;
    const firstImageModel = models.find(m => m.type === 'IMAGE');
    return firstImageModel?.name || '';
  }, [imageModel, models]);

  // 当使用 fallback 模型时，也要计算其对应的 aspectRatio
  const effectiveImageAspectRatio = useMemo(() => {
    if (imageAspectRatio) return imageAspectRatio;
    if (!effectiveImageModel) return '';
    const model = models.find(m => m.name === effectiveImageModel);
    if (!model?.supportedAspectRatios) return '';
    const options = normalizeCapabilityOptions(model.supportedAspectRatios, 'aspectRatio');
    return options.length > 0 ? options[0].value : '';
  }, [imageAspectRatio, effectiveImageModel, models]);
  
  const { dbCharacters, isLoadingCharacters, loadCharacters } = useCharacterData(projectId, scriptId);
  const { dbScenes, isLoadingScenes, loadScenes } = useSceneData(projectId, scriptId);
  
  const [selectedCharacter, setSelectedCharacter] = useState<Character | null>(null);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
  const [viewsCharacterId, setViewsCharacterId] = useState<number | undefined>(undefined);
  
  // 生命周期管理面板状态
  const [isLifecycleOpen, setIsLifecycleOpen] = useState(false);
  const [lifecycleCharacter, setLifecycleCharacter] = useState<Character | null>(null);
  
  const [selectedScene, setSelectedScene] = useState<Scene | null>(null);
  const [isSceneDetailModalOpen, setIsSceneDetailModalOpen] = useState(false);
  const [isSceneImageModalOpen, setIsSceneImageModalOpen] = useState(false);

  // 自由添加资产弹窗
  const [createAssetType, setCreateAssetType] = useState<CreateAssetType | null>(null);
  const handleOpenCreate = (type: CreateAssetType) => {
    if (!projectId) {
      showToast('请先选择项目', 'warning');
      return;
    }
    setCreateAssetType(type);
  };
  const closeCreateModal = () => setCreateAssetType(null);
  const handleAssetCreated = async () => {
    if (createAssetType === 'character') {
      await loadCharacters();
      showToast('角色已创建', 'success');
    } else if (createAssetType === 'scene') {
      await loadScenes();
      showToast('场景已创建', 'success');
    }
  };

  useEffect(() => {
    setSelectedCharacter((prev) => {
      if (!prev || !prev.id) {
        return prev;
      }

      return dbCharacters.find((character) => character.id === prev.id) || prev;
    });
  }, [dbCharacters]);

  useEffect(() => {
    setSelectedScene((prev) => {
      if (!prev || !prev.id) {
        return prev;
      }

      return dbScenes.find((scene) => scene.id === prev.id) || prev;
    });
  }, [dbScenes]);

  const characterViewMonitor = useWorkflowTargetMonitor({
    projectId: projectId ?? null,
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

  const sceneImageMonitor = useWorkflowTargetMonitor({
    projectId: projectId ?? null,
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

  const {
    selectedResource,
    isGenerating,
    generatedPrompts,
    isViewsModalOpen,
    useReferenceImages,
    referenceImageCount,
    handleGenerateViews,
    closeViewsModal
  } = useResourceModals({
    onSuccess: (msg) => showToast(msg, 'success'),
    onError: (msg) => showToast(msg, 'error'),
    onJobAccepted: () => characterViewMonitor.refreshNow()
  });

  const handleShowDetail = (character: Character) => {
    setSelectedCharacter(character);
    setIsDetailModalOpen(true);
  };

  const closeDetailModal = () => {
    setIsDetailModalOpen(false);
    setSelectedCharacter(null);
  };

  // 打开生命周期管理面板
  const handleOpenLifecycle = (character: Character) => {
    setLifecycleCharacter(character);
    setIsLifecycleOpen(true);
  };

  const closeLifecyclePanel = () => {
    setIsLifecycleOpen(false);
    // 不清除lifecycleCharacter，保持状态以支持动画过渡
  };

  const handleGenerateViewsWrapper = (charName: string, characterId: number) => {
    setViewsCharacterId(characterId);
    // 传空字符串表示仅打开弹窗查看，不立即生成
    handleGenerateViews(charName, '', '', '', characterId);
  };

  const handleRefreshResources = async () => {
    if (!projectId) {
      showToast('请先选择项目', 'warning');
      return;
    }
    await loadCharacters();
    await loadScenes();
  };

  // === 角色详情回调 ===
  const handleDeleteCharacter = async (characterId: number) => {
    try {
      await deleteCharacter(characterId);
      showToast('角色已删除', 'success');
      closeDetailModal();
      await loadCharacters();
    } catch (error: any) {
      showToast('删除失败: ' + error.message, 'error');
    }
  };

  // 资源卡片上的快捷删除（带二次确认）
  const handleDeleteCharacterFromCard = async (character: Character) => {
    const ok = await confirm({
      title: '删除角色',
      message: `确定要删除角色「${character.name}」吗？该操作将同步移除其白膜、服装、状态等衍生资源，且不可撤销。`,
      confirmText: '删除',
      cancelText: '取消',
      type: 'danger',
    });
    if (!ok) return;
    try {
      await deleteCharacter(character.id);
      showToast('角色已删除', 'success');
      await loadCharacters();
    } catch (error: any) {
      showToast('删除失败: ' + (error?.message || '未知错误'), 'error');
    }
  };

  const handleUploadCharacterImage = async (characterId: number, file: File) => {
    try {
      await uploadCharacterImage(characterId, file);
      showToast('图片上传成功', 'success');
      await loadCharacters();
    } catch (error: any) {
      showToast('上传失败: ' + error.message, 'error');
      throw error;
    }
  };

  const handleGenerateViewsFromDetail = (characterId: number) => {
    const char = dbCharacters.find(c => c.id === characterId);
    if (char) {
      closeDetailModal();
      handleGenerateViewsWrapper(char.name, characterId);
    }
  };

  const handleShowSceneDetail = (sceneName: string) => {
    const scene = dbScenes.find(s => s.name === sceneName);
    if (scene) {
      setSelectedScene(scene);
      setIsSceneDetailModalOpen(true);
    } else {
      console.warn('[ResourcePanel] 未找到场景:', sceneName);
    }
  };

  const closeSceneDetailModal = () => {
    setIsSceneDetailModalOpen(false);
    setSelectedScene(null);
  };

  const handleShowSceneImageModal = (sceneNameOrScene: string | Scene) => {
    const scene = typeof sceneNameOrScene === 'string'
      ? dbScenes.find(s => s.name === sceneNameOrScene)
      : sceneNameOrScene;
    if (scene) {
      setSelectedScene(scene);
      setIsSceneImageModalOpen(true);
    } else {
      console.warn('[ResourcePanel] 未找到场景:', sceneNameOrScene);
    }
  };

  const closeSceneImageModal = () => {
    setIsSceneImageModalOpen(false);
  };

  const handleGenerateSceneImage = async (sceneId: number, imageModelName: string, options?: { customPromptA?: string; customPromptB?: string }) => {
    try {
      if (!effectiveImageAspectRatio) {
        throw new Error('当前图片模型未配置可用长宽比');
      }

      const token = getAuthToken();
      const res = await fetch(`/api/scenes/${sceneId}/generate-image`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ 
          imageModel: imageModelName, 
          textModel,
          aspectRatio: effectiveImageAspectRatio,
          customPromptA: options?.customPromptA,
          customPromptB: options?.customPromptB
        })
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (res.status === 409 && data.jobId) {
          await sceneImageMonitor.refreshNow();
          showToast('已恢复该场景正在执行的生成任务', 'info');
          return;
        }

        throw new Error(data.message || '启动生成失败');
      }

      console.log('[ResourcePanel] 场景图片生成已启动:', data.jobId);
      
      // 立即刷新工作流状态，确保只有当前目标进入生成中
      await sceneImageMonitor.refreshNow();
    } catch (error: any) {
      console.error('[ResourcePanel] 生成场景图片失败:', error);
      showToast('生成场景图片失败: ' + error.message, 'error');
      throw error;
    }
  };

  return (
    <div className="h-full flex flex-col bg-(--bg-app)">
      {/* 头部 */}
      <div className="shrink-0 px-3 py-2 border-b border-(--border-color)">
        <div className="flex items-center justify-between mb-2">
          <TabButtons activeTab={activeTab} onTabChange={setActiveTab} />
          <Button
            size="sm"
            variant="flat"
            className="h-7 px-2 text-xs bg-(--bg-card) text-(--text-muted) hover:text-(--text-primary) border border-(--border-color)"
            startContent={<Save className="w-3 h-3" />}
            onPress={handleRefreshResources}
          >
            刷新
          </Button>
        </div>
      </div>

      {/* 内容区域 */}
      <div className="flex-1 overflow-y-auto p-3">
        {activeTab === 'characters' && (
          <CharactersTab
            characters={characters}
            dbCharacters={dbCharacters}
            isLoadingCharacters={isLoadingCharacters}
            scenes={scenes}
            activeCharacterIds={characterViewMonitor.activeTargetIds}
            storyboardStates={storyboardStates}
            onGenerateViews={handleGenerateViewsWrapper}
            onShowDetail={handleShowDetail}
            onOpenLifecycle={handleOpenLifecycle}
            onCreate={() => handleOpenCreate('character')}
            onDelete={handleDeleteCharacterFromCard}
            onStoryboardStateChange={onStoryboardStateChange}
          />
        )}

        {activeTab === 'locations' && (
          <>
            {isLoadingScenes ? (
              <div className="text-center py-8 text-(--text-muted)">
                <p className="text-sm">加载场景中...</p>
              </div>
            ) : (
              <LocationsTab
                scenes={dbScenes}
                activeSceneIds={sceneImageMonitor.activeTargetIds}
                onPreview={(resource) => {
                  handleShowSceneDetail(resource.name);
                }}
                onGenerateImage={(scene) => {
                  handleShowSceneImageModal(scene);
                }}
                onCreate={() => handleOpenCreate('scene')}
              />
            )}
          </>
        )}

        {activeTab === 'props' && (
          <PropsTab
            props={props}
          />
        )}
      </div>

      {/* 弹窗 */}
      <CharacterViewsModal
        isOpen={isViewsModalOpen}
        onClose={closeViewsModal}
        selectedResource={selectedResource}
        isGenerating={isGenerating || characterViewMonitor.isTargetActive(viewsCharacterId)}
        generatedPrompts={generatedPrompts}
        onGenerate={handleGenerateViews}
        characterId={viewsCharacterId}
        imageModel={effectiveImageModel}
        textModel={textModel}
        imageAspectRatio={effectiveImageAspectRatio}
        useReferenceImages={useReferenceImages}
        referenceImageCount={referenceImageCount}
      />

      <CharacterDetailModal
        isOpen={isDetailModalOpen}
        onClose={closeDetailModal}
        character={selectedCharacter}
        scenes={scenes}
        onDelete={handleDeleteCharacter}
        onUploadImage={handleUploadCharacterImage}
        onGenerateViews={handleGenerateViewsFromDetail}
        onCharacterUpdate={(updated) => {
          setSelectedCharacter(updated);
          loadCharacters();
        }}
      />

      <SceneDetailModal
        isOpen={isSceneDetailModalOpen}
        onClose={closeSceneDetailModal}
        scene={selectedScene}
        onGenerateImage={handleGenerateSceneImage}
        isGenerating={sceneImageMonitor.isTargetActive(selectedScene?.id)}
        imageModel={effectiveImageModel}
        textModel={textModel}
      />

      <SceneImageModal
        isOpen={isSceneImageModalOpen}
        onClose={closeSceneImageModal}
        scene={selectedScene}
        isGenerating={sceneImageMonitor.isTargetActive(selectedScene?.id)}
        onGenerate={handleGenerateSceneImage}
        imageModel={effectiveImageModel}
      />

      {/* 角色生命周期管理面板 */}
      <CharacterLifecyclePanel
        isOpen={isLifecycleOpen}
        onClose={closeLifecyclePanel}
        character={lifecycleCharacter}
        onRefresh={loadCharacters}
      />

      {/* 自由添加角色 / 场景 */}
      <CreateAssetModal
        isOpen={!!createAssetType}
        assetType={createAssetType || 'character'}
        projectId={projectId ?? null}
        scriptId={scriptId ?? null}
        onClose={closeCreateModal}
        onCreated={handleAssetCreated}
      />
    </div>
  );
};

export default ResourcePanel;
