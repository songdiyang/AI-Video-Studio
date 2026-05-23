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
import EnvironmentsTab from './EnvironmentsTab';
import BuildingsTab from './BuildingsTab';
import CostumesTab from './CostumesTab';
import CharacterViewsModal from './CharacterViewsModal';
import CreateAssetModal, { CreateAssetType } from './CreateAssetModal';
import { useResourceModals } from './useResourceModals';
import { Character } from './types';
import { getAuthToken } from '../../../services/auth';
import { deleteCharacter, uploadCharacterImage, deleteProp } from '../../../services/assets';
import {
  extractStudioComponentsFromScript, composeStudiosFromScript,
  generateStudioNineGrid, deleteStudio,
} from '../../../services/studios';
import { listEnvironments, generateEnvironmentImage, deleteEnvironment } from '../../../services/environments';
import { listBuildings, generateBuildingImage, deleteBuilding } from '../../../services/buildings';
import { fetchCostumes, generateCostumeViews, deleteCostume } from '../../../services/costumes';
import type { Environment } from '../../../services/environments';
import type { Building } from '../../../services/buildings';
import type { Costume } from '../../../services/costumes';
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
  /** 刷新道具列表回调 */
  onRefreshProps?: () => void;
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
  onRefreshProps,
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

  // 环境、建筑和服装数据
  const [dbEnvironments, setDbEnvironments] = useState<Environment[]>([]);
  const [dbBuildings, setDbBuildings] = useState<Building[]>([]);
  const [dbCostumes, setDbCostumes] = useState<Costume[]>([]);
  const [isLoadingEnvironments, setIsLoadingEnvironments] = useState(false);
  const [isLoadingBuildings, setIsLoadingBuildings] = useState(false);
  const [isLoadingCostumes, setIsLoadingCostumes] = useState(false);
  
  const [viewsCharacterId, setViewsCharacterId] = useState<number | undefined>(undefined);

  // 两阶段 AI 工作流 loading 状态
  const [isExtractingComponents, setIsExtractingComponents] = useState(false);
  const [isComposingStudios, setIsComposingStudios] = useState(false);



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
      showToast('影棚已创建', 'success');
    }
  };

  // 项目切换时加载环境、建筑和服装
  useEffect(() => {
    if (projectId) {
      loadEnvironments();
      loadBuildings();
      loadCostumes();
    }
  }, [projectId]);

  // 监听环境删除事件，刷新环境列表
  useEffect(() => {
    const handleEnvDeleted = () => {
      loadEnvironments();
    };
    window.addEventListener('environment:deleted', handleEnvDeleted);
    return () => window.removeEventListener('environment:deleted', handleEnvDeleted);
  }, []);

  // 监听建筑删除事件
  useEffect(() => {
    const handleBldDeleted = () => {
      loadBuildings();
    };
    window.addEventListener('building:deleted', handleBldDeleted);
    return () => window.removeEventListener('building:deleted', handleBldDeleted);
  }, []);

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
      showToast(`影棚图片生成完成：${job.input_params?.sceneName || '影棚'}`, 'success');
    },
    onFailed: async (job) => {
      showToast(`影棚图片生成失败：${job.input_params?.sceneName || '影棚'}`, 'error');
    }
  });

  // 环境图片生成监控
  const environmentImageMonitor = useWorkflowTargetMonitor({
    projectId: projectId ?? null,
    workflowTypes: ['environment_image_generation'],
    targetParamKey: 'environmentId',
    isActive: true,
    onCompleted: async (job) => {
      await loadEnvironments();
      // 广播事件通知 AssetEditor 刷新数据
      window.dispatchEvent(new CustomEvent('environment:updated', {
        detail: { environmentId: job.input_params?.environmentId }
      }));
      showToast(`环境图片生成完成：${job.input_params?.environmentName || '环境'}`, 'success');
    },
    onFailed: async (job) => {
      await loadEnvironments();
      window.dispatchEvent(new CustomEvent('environment:updated', {
        detail: { environmentId: job.input_params?.environmentId }
      }));
      showToast(`环境图片生成失败：${job.input_params?.environmentName || '环境'}`, 'error');
    }
  });

  // 服装设定图生成监控
  const costumeViewsMonitor = useWorkflowTargetMonitor({
    projectId: projectId ?? null,
    workflowTypes: ['costume_views_generation'],
    targetParamKey: 'costumeId',
    isActive: true,
    onCompleted: async (job) => {
      await loadCostumes();
      showToast(`服装设定图生成完成：${job.input_params?.costumeName || '服装'}`, 'success');
    },
    onFailed: async (job) => {
      showToast(`服装设定图生成失败：${job.input_params?.costumeName || '服装'}`, 'error');
    }
  });

  // 建筑图片生成监控
  const buildingImageMonitor = useWorkflowTargetMonitor({
    projectId: projectId ?? null,
    workflowTypes: ['building_image_generation'],
    targetParamKey: 'buildingId',
    isActive: true,
    onCompleted: async (job) => {
      await loadBuildings();
      window.dispatchEvent(new CustomEvent('building:updated', {
        detail: { buildingId: job.input_params?.buildingId }
      }));
      showToast(`建筑图片生成完成：${job.input_params?.buildingName || '建筑'}`, 'success');
    },
    onFailed: async (job) => {
      showToast(`建筑图片生成失败：${job.input_params?.buildingName || '建筑'}`, 'error');
    }
  });

  // 九宫组装图生成监控
  const nineGridMonitor = useWorkflowTargetMonitor({
    projectId: projectId ?? null,
    workflowTypes: ['studio_nine_grid_generation'],
    targetParamKey: 'studioId',
    isActive: true,
    onCompleted: async (job) => {
      await loadScenes();
      showToast(`九宫组装图生成完成：${job.input_params?.studioName || '影棚'}`, 'success');
    },
    onFailed: async (job) => {
      showToast(`九宫组装图生成失败：${job.input_params?.studioName || '影棚'}`, 'error');
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
    // 在工作台打开角色编辑标签页
    window.dispatchEvent(new CustomEvent('openAssetEditTab', {
      detail: {
        assetType: 'character',
        assetId: character.id,
        assetName: character.name,
        initialData: character,
      }
    }));
  };



  const handleGenerateViewsWrapper = (charName: string, characterId: number) => {
    setViewsCharacterId(characterId);
    // 传空字符串表示仅打开弹窗查看，不立即生成
    handleGenerateViews(charName, '', '', '', characterId);
  };

  const loadEnvironments = async () => {
    if (!projectId) return;
    setIsLoadingEnvironments(true);
    try {
      const data = await listEnvironments(projectId);
      setDbEnvironments(data);
    } catch (error) {
      console.error('[ResourcePanel] 加载环境失败:', error);
    } finally {
      setIsLoadingEnvironments(false);
    }
  };

  const loadBuildings = async () => {
    if (!projectId) return;
    setIsLoadingBuildings(true);
    try {
      const data = await listBuildings(projectId);
      setDbBuildings(data);
    } catch (error) {
      console.error('[ResourcePanel] 加载建筑失败:', error);
    } finally {
      setIsLoadingBuildings(false);
    }
  };

  const loadCostumes = async () => {
    if (!projectId) return;
    setIsLoadingCostumes(true);
    try {
      const data = await fetchCostumes(projectId);
      setDbCostumes(data);
    } catch (error) {
      console.error('[ResourcePanel] 加载服装失败:', error);
    } finally {
      setIsLoadingCostumes(false);
    }
  };

  const handleRefreshResources = async () => {
    if (!projectId) {
      showToast('请先选择项目', 'warning');
      return;
    }
    await loadCharacters();
    await loadScenes();
    await loadEnvironments();
    await loadBuildings();
    await loadCostumes();
    onRefreshProps?.();
  };

  // === 角色详情回调 ===
  const handleDeleteCharacter = async (characterId: number) => {
    try {
      await deleteCharacter(characterId);
      showToast('角色已删除', 'success');
      await loadCharacters();
    } catch (error: any) {
      showToast('删除失败: ' + error.message, 'error');
    }
  };

  // 资源卡片上的右键删除（带二次确认）
  // 删除角色时，同步从所有分镜中移除该角色的绑定
  const handleDeleteCharacterFromCard = async (character: Character) => {
    const ok = await confirm({
      title: '删除角色',
      message: `确定要删除角色「${character.name}」吗？该操作将同步移除其白膜、服装、状态等衍生资源，且不可撤销。已生成的图片/视频不受影响，但从所有分镜中移除该角色绑定。`,
      confirmText: '删除',
      cancelText: '取消',
      type: 'danger',
    });
    if (!ok) return;
    try {
      // 1. 先找到所有绑定了该角色的分镜，移除绑定
      const boundScenes = scenes?.filter(s => s.characters?.includes(character.name)) || [];
      for (const scene of boundScenes) {
        const newCharacters = scene.characters.filter(c => c !== character.name);
        // 同时从 linkedCharacters 中移除
        const newLinkedCharacters = scene.linkedCharacters?.filter(lc => lc.name !== character.name) || [];
        // 更新分镜内容（保留 location 不变）
        try {
          const token = getAuthToken();
          await fetch(`/api/storyboards/${scene.id}/content`, {
            method: 'PATCH',
            headers: {
              'Content-Type': 'application/json',
              ...(token ? { Authorization: `Bearer ${token}` } : {})
            },
            body: JSON.stringify({ characters: newCharacters })
          });
        } catch (err) {
          console.error(`[ResourcePanel] 从分镜 ${scene.id} 移除角色绑定失败:`, err);
        }
      }

      // 2. 触发事件通知节点画布移除该角色节点
      window.dispatchEvent(new CustomEvent('resource:characterDeleted', {
        detail: { characterId: character.id, characterName: character.name }
      }));

      // 3. 删除角色本身
      await deleteCharacter(character.id);
      showToast('角色已删除', 'success');
      await loadCharacters();
    } catch (error: any) {
      showToast('删除失败: ' + (error?.message || '未知错误'), 'error');
    }
  };

  // === 影棚右键删除 ===
  const handleDeleteStudioFromCard = async (scene: Scene) => {
    const ok = await confirm({
      title: '删除影棚',
      message: `确定要删除影棚「${scene.name}」吗？此操作不可撤销。`,
      confirmText: '删除',
      cancelText: '取消',
      type: 'danger',
    });
    if (!ok) return;
    try {
      await deleteStudio(scene.id);
      showToast('影棚已删除', 'success');
      await loadScenes();
    } catch (error: any) {
      showToast('删除失败: ' + (error?.message || '未知错误'), 'error');
    }
  };

  // === 道具右键删除 ===
  const handleDeletePropFromCard = async (prop: import('./types').PropItem) => {
    if (!prop.id) return;
    const ok = await confirm({
      title: '删除道具',
      message: `确定要删除道具「${prop.name}」吗？此操作不可撤销。`,
      confirmText: '删除',
      cancelText: '取消',
      type: 'danger',
    });
    if (!ok) return;
    try {
      await deleteProp(prop.id);
      showToast('道具已删除', 'success');
      onRefreshProps?.();
    } catch (error: any) {
      showToast('删除失败: ' + (error?.message || '未知错误'), 'error');
    }
  };

  // === 环境右键删除 ===
  const handleDeleteEnvironmentFromCard = async (env: Environment) => {
    const ok = await confirm({
      title: '删除环境',
      message: `确定要删除环境「${env.name}」吗？此操作不可撤销。`,
      confirmText: '删除',
      cancelText: '取消',
      type: 'danger',
    });
    if (!ok) return;
    try {
      await deleteEnvironment(env.id);
      showToast('环境已删除', 'success');
      await loadEnvironments();
      // 广播事件通知 AssetEditor 等组件
      window.dispatchEvent(new CustomEvent('environment:deleted', { detail: { environmentId: env.id } }));
    } catch (error: any) {
      showToast('删除失败: ' + (error?.message || '未知错误'), 'error');
    }
  };

  // === 建筑右键删除 ===
  const handleDeleteBuildingFromCard = async (b: Building) => {
    const ok = await confirm({
      title: '删除建筑',
      message: `确定要删除建筑「${b.name}」吗？此操作不可撤销。`,
      confirmText: '删除',
      cancelText: '取消',
      type: 'danger',
    });
    if (!ok) return;
    try {
      await deleteBuilding(b.id);
      showToast('建筑已删除', 'success');
      await loadBuildings();
      // 广播事件通知 AssetEditor 等组件
      window.dispatchEvent(new CustomEvent('building:deleted', { detail: { buildingId: b.id } }));
    } catch (error: any) {
      showToast('删除失败: ' + (error?.message || '未知错误'), 'error');
    }
  };

  // === 服装右键删除 ===
  const handleDeleteCostumeFromCard = async (costume: Costume) => {
    const ok = await confirm({
      title: '删除服装',
      message: `确定要删除服装「${costume.name}」吗？此操作不可撤销。`,
      confirmText: '删除',
      cancelText: '取消',
      type: 'danger',
    });
    if (!ok) return;
    try {
      await deleteCostume(costume.id);
      showToast('服装已删除', 'success');
      await loadCostumes();
    } catch (error: any) {
      showToast('删除失败: ' + (error?.message || '未知错误'), 'error');
    }
  };

  const handleGenerateSceneImage = async (sceneId: number, imageModelName?: string, options?: { customPromptA?: string; customPromptB?: string }) => {
    const modelName = imageModelName || effectiveImageModel;
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
          imageModel: modelName, 
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
          showToast('已恢复该影棚正在执行的生成任务', 'info');
          return;
        }

        throw new Error(data.message || '启动生成失败');
      }

      console.log('[ResourcePanel] 场景图片生成已启动:', data.jobId);
      
      // 立即刷新工作流状态，确保只有当前目标进入生成中
      await sceneImageMonitor.refreshNow();
    } catch (error: any) {
      console.error('[ResourcePanel] 生成场景图片失败:', error);
      showToast('生成影棚图片失败: ' + error.message, 'error');
      throw error;
    }
  };

  const handleExtractStudioComponents = async () => {
    if (!projectId) { showToast('请先选择项目', 'warning'); return; }
    if (!textModel) { showToast('请先选择文本模型', 'warning'); return; }
    setIsExtractingComponents(true);
    try {
      const res = await extractStudioComponentsFromScript({ projectId, scriptId, textModel });
      showToast(res.message || '已启动拆分影棚组件', 'success');
      setTimeout(() => { loadScenes(); }, 1500);
    } catch (error: any) {
      showToast('启动失败: ' + (error?.message || '未知错误'), 'error');
    } finally {
      setIsExtractingComponents(false);
    }
  };

  const handleComposeStudiosFromScript = async () => {
    if (!projectId) { showToast('请先选择项目', 'warning'); return; }
    if (!textModel) { showToast('请先选择文本模型', 'warning'); return; }
    setIsComposingStudios(true);
    try {
      const res = await composeStudiosFromScript({ projectId, scriptId, textModel });
      showToast(res.message || '已启动拼接影棚', 'success');
      setTimeout(() => { loadScenes(); }, 1500);
    } catch (error: any) {
      showToast('启动失败: ' + (error?.message || '未知错误'), 'error');
    } finally {
      setIsComposingStudios(false);
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
            onCreate={() => handleOpenCreate('character')}
            onDelete={handleDeleteCharacterFromCard}
            onStoryboardStateChange={onStoryboardStateChange}
          />
        )}

        {activeTab === 'locations' && (
          <>
            {isLoadingScenes ? (
              <div className="text-center py-8 text-(--text-muted)">
                <p className="text-sm">加载影棚中...</p>
              </div>
            ) : (
              <LocationsTab scenes={dbScenes} onDelete={handleDeleteStudioFromCard} />
            )}
          </>
        )}

        {activeTab === 'props' && (
          <PropsTab
            props={props}
            imageModel={effectiveImageModel}
            onDelete={handleDeletePropFromCard}
          />
        )}

        {activeTab === 'environments' && (
          <EnvironmentsTab
            environments={dbEnvironments}
            isLoading={isLoadingEnvironments}
            onDelete={handleDeleteEnvironmentFromCard}
          />
        )}

        {activeTab === 'buildings' && (
          <BuildingsTab
            buildings={dbBuildings}
            isLoading={isLoadingBuildings}
            onDelete={handleDeleteBuildingFromCard}
          />
        )}

        {activeTab === 'costumes' && (
          <CostumesTab
            costumes={dbCostumes}
            isLoading={isLoadingCostumes}
            imageModel={effectiveImageModel}
            textModel={textModel}
            onGenerateViews={async (costume) => {
              if (!effectiveImageModel) {
                showToast('请先选择图像模型', 'warning');
                return;
              }
              try {
                await generateCostumeViews(costume.id, { imageModel: effectiveImageModel, textModel });
                await costumeViewsMonitor.refreshNow();
                showToast('已启动服装设定图生成', 'success');
              } catch (error: any) {
                showToast('启动失败: ' + (error?.message || '未知错误'), 'error');
              }
            }}
            onDelete={handleDeleteCostumeFromCard}
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
