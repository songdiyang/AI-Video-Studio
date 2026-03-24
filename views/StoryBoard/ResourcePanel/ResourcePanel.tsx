import React, { useEffect, useState } from 'react';
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
import SceneDetailModal from './SceneDetailModal';
import SceneImageModal from './SceneImageModal';
import { useResourceModals } from './useResourceModals';
import { Character } from './types';
import { getAuthToken } from '../../../services/auth';
import { deleteCharacter, uploadCharacterImage } from '../../../services/assets';
import { useToast } from '../../../contexts/ToastContext';
import { useWorkflowTargetMonitor } from '../hooks/useWorkflowTargetMonitor';

const ResourcePanel: React.FC<ResourcePanelProps> = ({ 
  characters, 
  props,
  projectId,
  scriptId,
  scenes,
  imageModel,
  imageAspectRatio,
  textModel,
}) => {
  const [activeTab, setActiveTab] = useState<TabType>('characters');
  const { showToast } = useToast();
  
  const { dbCharacters, isLoadingCharacters, loadCharacters } = useCharacterData(projectId, scriptId);
  const { dbScenes, isLoadingScenes, loadScenes } = useSceneData(projectId, scriptId);
  
  const [selectedCharacter, setSelectedCharacter] = useState<Character | null>(null);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
  const [viewsCharacterId, setViewsCharacterId] = useState<number | undefined>(undefined);
  
  const [selectedScene, setSelectedScene] = useState<Scene | null>(null);
  const [isSceneDetailModalOpen, setIsSceneDetailModalOpen] = useState(false);
  const [isSceneImageModalOpen, setIsSceneImageModalOpen] = useState(false);

  useEffect(() => {
    setSelectedCharacter((prev) => {
      if (!prev?.id) {
        return prev;
      }

      return dbCharacters.find((character) => character.id === prev.id) || prev;
    });
  }, [dbCharacters]);

  useEffect(() => {
    setSelectedScene((prev) => {
      if (!prev?.id) {
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

  const handleGenerateSceneImage = async (sceneId: number, imageModelName: string) => {
    try {
      if (!imageAspectRatio) {
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
          aspectRatio: imageAspectRatio
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
    <div className="h-full flex flex-col bg-[var(--bg-app)]">
      {/* 头部 */}
      <div className="flex-shrink-0 px-3 py-2 border-b border-[var(--border-color)]">
        <div className="flex items-center justify-between mb-2">
          <TabButtons activeTab={activeTab} onTabChange={setActiveTab} />
          <Button
            size="sm"
            variant="flat"
            className="h-7 px-2 text-xs bg-[var(--bg-card)] text-[var(--text-muted)] hover:text-[var(--text-primary)] border border-[var(--border-color)]"
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
            onGenerateViews={handleGenerateViewsWrapper}
            onShowDetail={handleShowDetail}
          />
        )}

        {activeTab === 'locations' && (
          <>
            {isLoadingScenes ? (
              <div className="text-center py-8 text-[var(--text-muted)]">
                <p className="text-sm">加载场景中...</p>
              </div>
            ) : dbScenes.length === 0 ? (
              <div className="text-center py-8 text-[var(--text-muted)]">
                <p className="text-sm">暂无场景数据</p>
                <p className="text-xs mt-2">智能分镜生成后会自动提取场景</p>
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
        imageModel={imageModel}
        textModel={textModel}
        imageAspectRatio={imageAspectRatio}
      />

      <CharacterDetailModal
        isOpen={isDetailModalOpen}
        onClose={closeDetailModal}
        character={selectedCharacter}
        scenes={scenes}
        onDelete={handleDeleteCharacter}
        onUploadImage={handleUploadCharacterImage}
        onGenerateViews={handleGenerateViewsFromDetail}
      />

      <SceneDetailModal
        isOpen={isSceneDetailModalOpen}
        onClose={closeSceneDetailModal}
        scene={selectedScene}
        onGenerateImage={handleGenerateSceneImage}
        isGenerating={sceneImageMonitor.isTargetActive(selectedScene?.id)}
        imageModel={imageModel}
      />

      <SceneImageModal
        isOpen={isSceneImageModalOpen}
        onClose={closeSceneImageModal}
        scene={selectedScene}
        isGenerating={sceneImageMonitor.isTargetActive(selectedScene?.id)}
        onGenerate={handleGenerateSceneImage}
        imageModel={imageModel}
      />
    </div>
  );
};

export default ResourcePanel;
