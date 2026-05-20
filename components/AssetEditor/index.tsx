import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { Button, Input, Textarea, Select, SelectItem, Tabs, Tab, Chip } from '@heroui/react';
import {
  User, MapPin, FileText, Tag as TagIcon, Plus,
  Layers, Image as ImageIcon, FolderOpen, Shirt, Cloud, Building2, BookOpen,
  Wand2, Settings, Palette, Camera, ZoomIn, LayoutGrid, Link2, Unlink, X, Loader2, Trash2
} from 'lucide-react';
import { Project } from '../../services/projects';
import {
  TagGroup, CharacterState, updateCharacterUseReferenceImages,
  uploadSceneReferenceImage, deleteSceneReferenceImage,
  updateCharacter, updateScene, updateProp,
} from '../../services/assets';
import { updateScript } from '../../services/scripts';
import { updateCostume, COSTUME_CATEGORIES, CostumeCategory } from '../../services/costumes';
import { updateEnvironment, generateEnvironmentImage, deleteEnvironment, getEnvironment } from '../../services/environments';
import { updateBuilding, generateBuildingImage, deleteBuilding, getBuilding } from '../../services/buildings';
import {
  updateStudio, getStudio, type StudioDetail,
  attachEnvironmentToStudio, detachEnvironmentFromStudio,
  attachBuildingToStudio, detachBuildingFromStudio,
  setStudioEnvironmentView, setStudioBuildingView,
  generateStudioNineGrid,
} from '../../services/studios';
import { listEnvironments, type Environment } from '../../services/environments';
import { listBuildings, type Building } from '../../services/buildings';
import { useToast } from '../../contexts/ToastContext';
import { useConfirm } from '../../contexts/ConfirmContext';
import { usePreview } from '../../components/PreviewProvider';
import CharacterStateEditor from '../../views/AssetsManager/AssetModel/CharacterStateEditor';
import ReferenceImageManager from '../../views/AssetsManager/AssetModel/ReferenceImageManager';
import PropStyleConfigPanel, { PropStyleConfig } from '../../views/AssetsManager/AssetModel/PropStyleConfig';
import { useAIModels } from '../../hooks/useAIModels';
import { getAuthToken } from '../../services/auth';
import { StoryboardScene } from '../../views/StoryBoard/useSceneManager';

interface AssetEditorProps {
  tabId: string;
  assetType: string;
  initialData?: any;
  onClose: () => void;
  /** 当前所有分镜数据（用于关联分镜展示） */
  scenes?: StoryboardScene[];
  /** 点击关联分镜时的回调 */
  onSelectScene?: (sceneId: number) => void;
}

// 资产类型配置
const ASSET_TYPE_CONFIG: Record<string, { label: string; icon: React.ReactNode; color: string }> = {
  character: { label: '角色', icon: <User size={14} />, color: 'blue' },
  scene: { label: '场景', icon: <MapPin size={14} />, color: 'emerald' },
  studio: { label: '影棚', icon: <Layers size={14} />, color: 'violet' },
  prop: { label: '道具', icon: <FileText size={14} />, color: 'amber' },
  costume: { label: '服装', icon: <Shirt size={14} />, color: 'purple' },
  environment: { label: '环境', icon: <Cloud size={14} />, color: 'cyan' },
  building: { label: '建筑', icon: <Building2 size={14} />, color: 'orange' },
  script: { label: '剧本', icon: <BookOpen size={14} />, color: 'rose' },
};

const AssetEditor: React.FC<AssetEditorProps> = ({ tabId, assetType, initialData, onClose, scenes = [], onSelectScene }) => {
  const { showToast } = useToast();
  const { confirm } = useConfirm();
  const { openPreview } = usePreview();
  const [formData, setFormData] = useState<any>(initialData || {});
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState<string>('basic');
  const [isDirty, setIsDirty] = useState(false);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSavedRef = useRef<string>('');

  // AI 模型选择（用于图片生成）
  const projectId = formData.project_id || null;
  const { selected: aiModels, isConfigured } = useAIModels(projectId);
  const effectiveImageModel = aiModels.image || '';
  const effectiveTextModel = aiModels.text || '';

  // 影棚组装相关状态（仅 scene/studio 类型使用）
  const [studioDetail, setStudioDetail] = useState<StudioDetail | null>(null);
  const [allEnvironments, setAllEnvironments] = useState<Environment[]>([]);
  const [allBuildings, setAllBuildings] = useState<Building[]>([]);
  const [assemblyLoading, setAssemblyLoading] = useState(false);
  const [actingIds, setActingIds] = useState<Set<string>>(new Set());
  const [generatingGrid, setGeneratingGrid] = useState(false);
  const [previewImage, setPreviewImage] = useState<{ url: string; name: string } | null>(null);

  // 环境/建筑图片生成 loading 状态
  const [generatingEnvImage, setGeneratingEnvImage] = useState(false);
  const [generatingBldImage, setGeneratingBldImage] = useState(false);

  // 标签输入缓冲
  const [tagInput, setTagInput] = useState('');

  // 同步 initialData 变化
  useEffect(() => {
    if (initialData) {
      setFormData(initialData);
      lastSavedRef.current = JSON.stringify(initialData);
      setIsDirty(false);
    }
  }, [initialData]);

  // 环境/建筑类型时，从 API 加载完整数据以确保图片等字段正确
  useEffect(() => {
    if (assetType === 'environment' && initialData?.id) {
      getEnvironment(initialData.id).then((data) => {
        setFormData((prev: any) => ({ ...prev, ...data }));
      }).catch((e) => {
        console.error('[AssetEditor] 加载环境详情失败:', e);
      });
    } else if (assetType === 'building' && initialData?.id) {
      getBuilding(initialData.id).then((data) => {
        setFormData((prev: any) => ({ ...prev, ...data }));
      }).catch((e) => {
        console.error('[AssetEditor] 加载建筑详情失败:', e);
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assetType, initialData?.id]);

  // 影棚类型时，加载 studio 详情、环境/建筑候选池
  useEffect(() => {
    if ((assetType === 'scene' || assetType === 'studio') && initialData?.id) {
      loadStudioDetail(initialData.id);
      if (initialData.project_id) {
        loadAssemblyCandidates(initialData.project_id);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assetType, initialData?.id]);

  // 自动保存：监听 formData 变化，防抖 2 秒后自动保存
  useEffect(() => {
    const currentJson = JSON.stringify(formData);
    if (currentJson === lastSavedRef.current) {
      setIsDirty(false);
      return;
    }
    setIsDirty(true);

    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
    }
    saveTimerRef.current = setTimeout(() => {
      handleSave();
    }, 2000);

    return () => {
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formData]);

  // 组件卸载时如果还有未保存的更改，立即保存
  useEffect(() => {
    return () => {
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
      }
      if (isDirty) {
        handleSave();
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 资产类型配置
  const config = ASSET_TYPE_CONFIG[assetType] || { label: '资产', icon: <FileText size={14} />, color: 'blue' };

  // 标签数组
  const tagList = useMemo<string[]>(() => {
    const raw = (formData.tags ?? '') as string;
    if (!raw) return [];
    return raw.split(/[,，]/).map((t: string) => t.trim()).filter(Boolean);
  }, [formData.tags]);

  const commitTags = (list: string[]) => {
    const uniq: string[] = [];
    list.forEach(t => {
      const v = t.trim();
      if (v && !uniq.includes(v)) uniq.push(v);
    });
    setFormData({ ...formData, tags: uniq.join(',') });
  };

  const addTagFromInput = () => {
    const raw = tagInput;
    if (!raw) return;
    const pieces = raw.split(/[,，]/).map(s => s.trim()).filter(Boolean);
    if (pieces.length === 0) {
      setTagInput('');
      return;
    }
    commitTags([...tagList, ...pieces]);
    setTagInput('');
  };

  const removeTag = (tag: string) => {
    commitTags(tagList.filter(t => t !== tag));
  };

  const handleTagKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',' || e.key === '，') {
      e.preventDefault();
      addTagFromInput();
    } else if (e.key === 'Backspace' && !tagInput && tagList.length > 0) {
      removeTag(tagList[tagList.length - 1]);
    }
  };

  // ========== 影棚组装逻辑 ==========
  const loadStudioDetail = async (studioId: number) => {
    setAssemblyLoading(true);
    try {
      const detail = await getStudio(studioId);
      setStudioDetail(detail);
    } catch (err: any) {
      showToast('加载影棚详情失败: ' + err.message, 'error');
    } finally {
      setAssemblyLoading(false);
    }
  };

  const loadAssemblyCandidates = async (projectId: number) => {
    try {
      const [envs, blds] = await Promise.all([
        listEnvironments(projectId),
        listBuildings(projectId),
      ]);
      setAllEnvironments(envs);
      setAllBuildings(blds);
    } catch (err: any) {
      console.error('[AssetEditor] 加载候选池失败:', err);
    }
  };

  const withActing = async (key: string, fn: () => Promise<void>) => {
    setActingIds(prev => new Set(prev).add(key));
    try {
      await fn();
    } finally {
      setActingIds(prev => {
        const next = new Set(prev);
        next.delete(key);
        return next;
      });
    }
  };

  const handleAttachEnvironment = async (envId: number) => {
    if (!studioDetail) return;
    await withActing(`attachEnv`, async () => {
      await attachEnvironmentToStudio(studioDetail.studio.id, envId);
      await loadStudioDetail(studioDetail.studio.id);
      showToast('环境已绑定', 'success');
    });
  };

  const handleDetachEnvironment = async () => {
    if (!studioDetail) return;
    await withActing(`detachEnv`, async () => {
      await detachEnvironmentFromStudio(studioDetail.studio.id);
      await loadStudioDetail(studioDetail.studio.id);
      showToast('环境已解绑', 'success');
    });
  };

  const handleSetEnvView = async (view: 'front' | 'back') => {
    if (!studioDetail) return;
    await withActing(`envView-${view}`, async () => {
      await setStudioEnvironmentView(studioDetail.studio.id, view);
      await loadStudioDetail(studioDetail.studio.id);
      showToast(`已切换为环境${view === 'back' ? '背面' : '正面'}`, 'success');
    });
  };

  const handleAttachBuilding = async (buildingId: number) => {
    if (!studioDetail) return;
    await withActing(`attachBld`, async () => {
      await attachBuildingToStudio(studioDetail.studio.id, buildingId);
      await loadStudioDetail(studioDetail.studio.id);
      showToast('建筑已关联', 'success');
    });
  };

  const handleDetachBuilding = async (buildingId: number) => {
    if (!studioDetail) return;
    await withActing(`detachBld-${buildingId}`, async () => {
      await detachBuildingFromStudio(studioDetail.studio.id, buildingId);
      await loadStudioDetail(studioDetail.studio.id);
      showToast('建筑已移除', 'success');
    });
  };

  const handleSetBuildingView = async (buildingId: number, view: 'exterior' | 'interior') => {
    if (!studioDetail) return;
    await withActing(`bView-${buildingId}-${view}`, async () => {
      await setStudioBuildingView(studioDetail.studio.id, buildingId, view);
      await loadStudioDetail(studioDetail.studio.id);
      showToast(`已切换为建筑${view === 'interior' ? '内景' : '外景'}`, 'success');
    });
  };

  const handleGenerateNineGrid = async () => {
    if (!studioDetail) return;
    const studio = studioDetail.studio;
    const hasEnv = !!studioDetail.environment;
    const hasBld = studioDetail.buildings.length > 0;
    if (!hasEnv && !hasBld) {
      showToast('请先绑定环境或关联建筑', 'warning');
      return;
    }
    if (!effectiveImageModel) {
      showToast('请先配置图像模型（在设置中选择图片模型）', 'warning');
      return;
    }
    setGeneratingGrid(true);
    try {
      await generateStudioNineGrid(studio.id, {
        imageModel: effectiveImageModel,
        textModel: effectiveTextModel
      });
      showToast('已启动九宫组装图生成', 'success');
      setTimeout(() => loadStudioDetail(studio.id), 2000);
    } catch (err: any) {
      showToast('启动失败: ' + (err?.message || '未知错误'), 'error');
    } finally {
      setGeneratingGrid(false);
    }
  };

  // 保存处理
  const handleSave = async () => {
    setSaving(true);
    try {
      // 从 tabId 解析资产 ID：格式为 `asset-${assetType}-${assetId}`
      const parts = tabId.split('-');
      const assetId = parseInt(parts[parts.length - 1], 10);
      if (!assetId || isNaN(assetId)) {
        throw new Error('无法解析资产ID');
      }

      let savedData: any;
      switch (assetType) {
        case 'character':
          savedData = await updateCharacter(assetId, {
            name: formData.name,
            description: formData.description,
            personality: formData.personality,
            tags: formData.tags,
          });
          break;
        case 'scene':
          savedData = await updateScene(assetId, {
            name: formData.name,
            description: formData.description,
            environment: formData.environment,
            lighting: formData.lighting,
            mood: formData.mood,
            tags: formData.tags,
          });
          break;
        case 'studio':
          savedData = await updateStudio(assetId, {
            name: formData.name,
            description: formData.description,
          });
          break;
        case 'prop':
          savedData = await updateProp(assetId, {
            name: formData.name,
            description: formData.description,
            prop_type: formData.prop_type,
            category: formData.category,
            image_url: formData.image_url,
            tags: formData.tags,
          });
          break;
        case 'costume':
          savedData = await updateCostume(assetId, {
            name: formData.name,
            description: formData.description,
            category: formData.category,
            gender: formData.gender,
            outfit_prompt: formData.outfit_prompt,
            image_url: formData.image_url,
            front_view_url: formData.front_view_url,
            side_view_url: formData.side_view_url,
            back_view_url: formData.back_view_url,
            tags: formData.tags,
          });
          break;
        case 'environment':
          savedData = await updateEnvironment(assetId, {
            name: formData.name,
            description: formData.description,
            timeOfDay: formData.timeOfDay,
            weather: formData.weather,
            lighting: formData.lighting,
            mood: formData.mood,
            terrainType: formData.terrainType,
          });
          break;
        case 'building':
          savedData = await updateBuilding(assetId, {
            name: formData.name,
            description: formData.description,
            interiorExterior: formData.interiorExterior,
            structureType: formData.structureType,
          });
          break;
        case 'script':
          savedData = await updateScript(assetId, formData.name || '', formData.content || '');
          // updateScript 返回 { message: string } 而非剧本数据，需要构造兼容的数据对象
          savedData = { name: formData.name, content: formData.content };
          break;
        default:
          throw new Error('不支持的资产类型');
      }

      // 更新本地 formData 以同步 API 返回的数据
      if (savedData) {
        setFormData((prev: any) => ({ ...prev, ...savedData }));
      }
      lastSavedRef.current = JSON.stringify({ ...formData, ...savedData });
      setIsDirty(false);
      showToast('保存成功', 'success');
    } catch (error: any) {
      showToast(error?.message || '保存失败', 'error');
    } finally {
      setSaving(false);
    }
  };

  // 渲染标签输入组件（通用）
  const renderTagInput = () => (
    <div className="space-y-2">
      <label className="text-[var(--text-secondary)] font-medium text-xs flex items-center gap-1">
        <TagIcon className="w-3 h-3" />
        标签
        <span className="text-[10px] text-[var(--text-muted)] font-normal ml-1">（方便管理和搜索分类）</span>
      </label>
      {tagList.length > 0 ? (
        <div className="bg-slate-800/40 border border-slate-700/50 rounded-xl p-2.5 flex flex-wrap gap-1.5">
          {tagList.map((tag) => (
            <Chip
              key={tag}
              size="sm"
              variant="solid"
              color="primary"
              onClose={() => removeTag(tag)}
              classNames={{
                base: "bg-blue-600 dark:bg-blue-500/90 border border-blue-700/40 dark:border-blue-400/40 shadow-sm",
                content: "text-white font-medium text-xs px-1",
                closeButton: "text-white/85 hover:text-white"
              }}
            >
              {tag}
            </Chip>
          ))}
        </div>
      ) : (
        <div className="bg-slate-800/30 border border-dashed border-slate-700/50 rounded-xl p-3 text-center text-[11px] text-slate-500">
          暂无标签，在下方输入并按回车添加
        </div>
      )}
      <div className="flex items-center gap-2 bg-slate-800/60 border border-slate-600/50 hover:border-blue-500/50 rounded-xl shadow-sm px-2.5 py-1.5">
        <TagIcon className="w-3.5 h-3.5 text-slate-500 shrink-0" />
        <input
          type="text"
          value={tagInput}
          onChange={(e) => setTagInput(e.target.value)}
          onKeyDown={handleTagKeyDown}
          onBlur={() => addTagFromInput()}
          placeholder={tagList.length === 0 ? '输入标签后按回车添加，多个标签可用逗号分隔' : '继续添加标签…'}
          className="flex-1 min-w-[120px] bg-transparent outline-none text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 py-1"
        />
        <Button
          size="sm"
          variant="flat"
          color="primary"
          isDisabled={!tagInput.trim()}
          onPress={addTagFromInput}
          className="h-7 shrink-0"
          startContent={<Plus className="w-3.5 h-3.5" />}
        >
          添加
        </Button>
      </div>
      {tagList.length > 0 && (
        <p className="text-[11px] text-slate-500">
          已添加 {tagList.length} 个标签 · 点击标签上的 × 移除，输入框为空时按退格删除最后一个
        </p>
      )}
    </div>
  );

  // 渲染关联分镜列表（内嵌到角色编辑面板）
  const renderRelatedScenes = () => {
    const assetName = formData.name || '';
    if (!assetName || scenes.length === 0) {
      return (
        <div className="h-full flex flex-col items-center justify-center text-slate-500 py-8">
          <Camera size={24} className="opacity-30 mb-2" />
          <span className="text-xs">暂无关联分镜</span>
          <span className="text-[10px] opacity-60 mt-1">
            该角色尚未在任何分镜中使用
          </span>
        </div>
      );
    }

    const normalizedAssetName = assetName.trim();
    const relatedScenes = scenes.filter((scene) => {
      return scene.characters?.some(
        (char: string) => char.trim() === normalizedAssetName ||
                  char.trim().includes(normalizedAssetName) ||
                  normalizedAssetName.includes(char.trim())
      );
    });

    if (relatedScenes.length === 0) {
      return (
        <div className="h-full flex flex-col items-center justify-center text-slate-500 py-8">
          <Camera size={24} className="opacity-30 mb-2" />
          <span className="text-xs">暂无关联分镜</span>
          <span className="text-[10px] opacity-60 mt-1">
            该角色尚未在任何分镜中使用
          </span>
        </div>
      );
    }

    return (
      <div className="h-full flex flex-col">
        {/* 标题栏 */}
        <div className="flex items-center justify-between px-3 py-2 border-b border-slate-700/50">
          <div className="flex items-center gap-2">
            <div className="flex items-center justify-center w-5 h-5 rounded bg-blue-500/10 text-blue-400">
              <Camera size={12} />
            </div>
            <span className="text-xs font-medium text-slate-400">
              关联分镜
            </span>
            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-slate-800 text-slate-500">
              {relatedScenes.length}
            </span>
          </div>
          <span className="text-[10px] text-slate-500 truncate max-w-[120px]">
            {assetName}
          </span>
        </div>

        {/* 分镜列表 */}
        <div className="flex-1 overflow-y-auto">
          <div className="divide-y divide-slate-700/30">
            {relatedScenes.map((scene) => (
              <button
                key={scene.id}
                onClick={() => {
                  // 派发事件让 PreviewEditor 打开对应分镜标签页
                  window.dispatchEvent(new CustomEvent('openSceneTab', {
                    detail: { sceneId: scene.id }
                  }));
                  onSelectScene?.(scene.id);
                }}
                className="w-full text-left px-3 py-2 hover:bg-slate-800/50 transition-colors group"
              >
                <div className="flex items-start gap-2">
                  {/* 分镜序号 */}
                  <div className="flex items-center justify-center w-6 h-6 rounded bg-slate-800 text-[10px] font-medium text-slate-500 shrink-0 mt-0.5">
                    {scene.order}
                  </div>

                  {/* 分镜内容 */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 mb-1">
                      <span className="text-xs font-medium text-slate-200 truncate">
                        {scene.baseDescription || scene.description || `分镜 #${scene.order}`}
                      </span>
                    </div>

                    {/* 分镜元信息 */}
                    <div className="flex items-center gap-2 text-[10px] text-slate-500">
                      {scene.location && (
                        <span>{scene.location}</span>
                      )}
                      {scene.duration && (
                        <span>{scene.duration}s</span>
                      )}
                    </div>
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>
    );
  };

  // 渲染角色编辑表单
  const renderCharacterForm = () => {
    const [useReferenceImages, setUseReferenceImages] = useState(formData.use_reference_images !== false);

    const handleUseReferenceImagesChange = async (enabled: boolean) => {
      if (!formData.id) return;
      try {
        await updateCharacterUseReferenceImages(formData.id, enabled);
        setUseReferenceImages(enabled);
        setFormData({ ...formData, use_reference_images: enabled });
      } catch (error: any) {
        console.error('更新参考图设置失败:', error);
      }
    };

    return (
      <Tabs
        selectedKey={activeTab}
        onSelectionChange={(key) => setActiveTab(key as string)}
        classNames={{
          tabList: "bg-slate-800/60 border border-slate-700/50",
          tab: "text-slate-400 data-[selected=true]:text-slate-100",
          cursor: "bg-blue-500/20",
          panel: "py-4"
        }}
      >
        <Tab key="basic" title={<div className="flex items-center gap-1.5"><User className="w-4 h-4" /><span>基础信息</span></div>}>
          <div className="space-y-4">
            <Input
              label="名称"
              placeholder="输入角色名称"
              value={formData.name || ''}
              onValueChange={(val) => setFormData({ ...formData, name: val })}
              classNames={{
                input: "bg-transparent text-slate-100 placeholder:text-slate-500",
                label: "text-slate-400 font-medium",
                inputWrapper: "bg-slate-800/60 border border-slate-600/50 hover:border-blue-500/50 shadow-sm"
              }}
            />
            <Textarea
              label="描述"
              placeholder="输入角色背景故事、性格特点等"
              value={formData.description || ''}
              onValueChange={(val) => setFormData({ ...formData, description: val })}
              minRows={3}
              classNames={{
                input: "bg-transparent text-slate-100 placeholder:text-slate-500",
                label: "text-slate-400 font-medium",
                inputWrapper: "bg-slate-800/60 border border-slate-600/50 hover:border-blue-500/50 shadow-sm"
              }}
            />
            <Input
              label="性格"
              placeholder="性格特点"
              value={formData.personality || ''}
              onValueChange={(val) => setFormData({ ...formData, personality: val })}
              classNames={{
                input: "bg-transparent text-slate-100 placeholder:text-slate-500",
                label: "text-slate-400 font-medium",
                inputWrapper: "bg-slate-800/60 border border-slate-600/50 hover:border-blue-500/50 shadow-sm"
              }}
            />
            {renderTagInput()}
          </div>
        </Tab>
        <Tab key="states" title={<div className="flex items-center gap-1.5"><Layers className="w-4 h-4" /><span>状态管理</span></div>}>
          {formData.id ? (
            <CharacterStateEditor
              characterId={formData.id}
              disabled={false}
              projectId={formData.project_id || null}
              tagGroups={[]}
              onTagGroupsChange={() => {}}
              formData={formData}
              setFormData={setFormData}
              onStateActivated={(state: CharacterState) => {
                if (state.image_url || state.front_view_url) {
                  setFormData({ ...formData, image_url: state.image_url || state.front_view_url });
                }
              }}
            />
          ) : (
            <div className="text-center py-8 text-slate-500">
              <Layers className="w-12 h-12 mx-auto mb-2 opacity-30" />
              <p className="text-sm">请先保存角色后管理状态</p>
            </div>
          )}
        </Tab>
        <Tab key="references" title={<div className="flex items-center gap-1.5"><ImageIcon className="w-4 h-4" /><span>参考图</span></div>}>
          {formData.id ? (
            <ReferenceImageManager
              assetType="character"
              assetId={formData.id}
              showGlobalToggle={true}
              globalEnabled={useReferenceImages}
              onGlobalEnabledChange={handleUseReferenceImagesChange}
            />
          ) : (
            <div className="text-center py-8 text-slate-500">
              <ImageIcon className="w-12 h-12 mx-auto mb-2 opacity-30" />
              <p className="text-sm">请先保存角色后管理参考图</p>
            </div>
          )}
        </Tab>
        <Tab key="scenes" title={<div className="flex items-center gap-1.5"><Camera className="w-4 h-4" /><span>关联分镜</span></div>}>
          {renderRelatedScenes()}
        </Tab>
      </Tabs>
    );
  };

  // 渲染场景编辑表单
  const renderSceneForm = () => {
    return (
      <Tabs
        selectedKey={activeTab}
        onSelectionChange={(key) => setActiveTab(key as string)}
        classNames={{
          tabList: "bg-slate-800/60 border border-slate-700/50",
          tab: "text-slate-400 data-[selected=true]:text-slate-100",
          cursor: "bg-blue-500/20",
          panel: "py-4"
        }}
      >
        <Tab key="basic" title={<div className="flex items-center gap-1.5"><Layers className="w-4 h-4" /><span>场景要素</span></div>}>
          <div className="space-y-4">
            <Input
              label="名称"
              placeholder="输入场景名称"
              value={formData.name || ''}
              onValueChange={(val) => setFormData({ ...formData, name: val })}
              classNames={{
                input: "bg-transparent text-slate-100 placeholder:text-slate-500",
                label: "text-slate-400 font-medium",
                inputWrapper: "bg-slate-800/60 border border-slate-600/50 hover:border-blue-500/50 shadow-sm"
              }}
            />
            <Textarea
              label="描述"
              placeholder="输入详细描述"
              value={formData.description || ''}
              onValueChange={(val) => setFormData({ ...formData, description: val })}
              minRows={3}
              classNames={{
                input: "bg-transparent text-slate-100 placeholder:text-slate-500",
                label: "text-slate-400 font-medium",
                inputWrapper: "bg-slate-800/60 border border-slate-600/50 hover:border-blue-500/50 shadow-sm"
              }}
            />
            <Input
              label="环境"
              placeholder="环境描述（建筑结构、空间布局、物品摆设等）"
              value={formData.environment || ''}
              onValueChange={(val) => setFormData({ ...formData, environment: val })}
              classNames={{
                input: "bg-transparent text-slate-100 placeholder:text-slate-500",
                label: "text-slate-400 font-medium",
                inputWrapper: "bg-slate-800/60 border border-slate-600/50 hover:border-blue-500/50 shadow-sm"
              }}
            />
            <Input
              label="光线"
              placeholder="光线效果（光线来源、明暗对比、色调等）"
              value={formData.lighting || ''}
              onValueChange={(val) => setFormData({ ...formData, lighting: val })}
              classNames={{
                input: "bg-transparent text-slate-100 placeholder:text-slate-500",
                label: "text-slate-400 font-medium",
                inputWrapper: "bg-slate-800/60 border border-slate-600/50 hover:border-blue-500/50 shadow-sm"
              }}
            />
            <Input
              label="氛围"
              placeholder="氛围感觉（紧张、温馨、诡异等）"
              value={formData.mood || ''}
              onValueChange={(val) => setFormData({ ...formData, mood: val })}
              classNames={{
                input: "bg-transparent text-slate-100 placeholder:text-slate-500",
                label: "text-slate-400 font-medium",
                inputWrapper: "bg-slate-800/60 border border-slate-600/50 hover:border-blue-500/50 shadow-sm"
              }}
            />
            {renderTagInput()}
          </div>
        </Tab>
        <Tab key="assembly" title={<div className="flex items-center gap-1.5"><Link2 className="w-4 h-4" /><span>自由组装</span></div>}>
          {renderStudioAssembly()}
        </Tab>
      </Tabs>
    );
  };

  // 渲染影棚自由组装面板
  const renderStudioAssembly = () => {
    if (assemblyLoading && !studioDetail) {
      return (
        <div className="text-center py-8 text-slate-500">
          <Loader2 className="w-8 h-8 mx-auto mb-2 animate-spin" />
          <p className="text-sm">加载影棚组装信息...</p>
        </div>
      );
    }

    const studio = studioDetail?.studio;
    const env = studioDetail?.environment || null;
    const linkedBuildings = studioDetail?.buildings || [];
    const envView = studio?.environment_view === 'back' ? 'back' : 'front';
    const hasNineGrid = !!studio?.nine_grid_image_url;
    const gridStatus = studio?.nine_grid_generation_status || 'pending';

    const linkedBuildingIds = new Set(linkedBuildings.map(b => b.id));
    const availableBuildings = allBuildings.filter(b => !linkedBuildingIds.has(b.id));
    const availableEnvironments = allEnvironments.filter(e => e.id !== env?.id);

    const STATUS_TEXT: Record<string, string> = {
      pending: '待生成',
      generating: '生成中',
      completed: '已完成',
      failed: '失败',
    };
    const STATUS_CLASS: Record<string, string> = {
      pending: 'bg-slate-600/30 text-slate-300',
      generating: 'bg-blue-500/10 text-blue-300',
      completed: 'bg-emerald-500/10 text-emerald-300',
      failed: 'bg-red-500/10 text-red-300',
    };

    return (
      <div className="space-y-5">
        {/* 九宫图预览区 */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <div className="text-[11px] font-medium text-(--text-secondary) flex items-center gap-1">
              <LayoutGrid className="w-3 h-3" />
              九宫组装图
            </div>
            <div className={`text-[10px] px-1.5 py-0.5 rounded ${STATUS_CLASS[gridStatus] || 'bg-slate-600/30 text-slate-300'}`}>
              {STATUS_TEXT[gridStatus] || gridStatus}
            </div>
          </div>
          {hasNineGrid ? (
            <div
              className="relative group cursor-zoom-in rounded-lg border border-slate-700/50 overflow-hidden"
              onClick={() => setPreviewImage({ url: studio.nine_grid_image_url!, name: `${studio.name} - 九宫组装图` })}
            >
              <img
                src={studio.nine_grid_image_url!}
                alt={`${studio.name} 九宫组装图`}
                className="w-full h-40 object-cover"
              />
              <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                <ZoomIn className="w-5 h-5 text-white" />
              </div>
              <div className="absolute bottom-1 left-1 px-1.5 py-0.5 rounded bg-black/60 text-[10px] text-white">
                九宫组装图
              </div>
            </div>
          ) : (
            <div className="w-full h-24 rounded-lg border border-dashed border-slate-600 flex flex-col items-center justify-center bg-slate-800/40 gap-1">
              <LayoutGrid className="w-6 h-6 text-slate-500" />
              <span className="text-[11px] text-slate-500">暂无九宫组装图</span>
            </div>
          )}
          <Button
            size="sm"
            variant="flat"
            className="h-7 min-w-0 px-3 text-[11px] bg-violet-500/10 text-violet-400 hover:bg-violet-500/20"
            startContent={generatingGrid ? <Loader2 className="w-3 h-3 animate-spin" /> : <LayoutGrid className="w-3 h-3" />}
            isDisabled={generatingGrid || (!env && linkedBuildings.length === 0)}
            onPress={handleGenerateNineGrid}
          >
            {hasNineGrid ? '重新生成九宫' : '生成九宫'}
          </Button>
        </div>

        {/* 环境绑定区 */}
        <div className="space-y-2">
          <div className="text-[11px] font-medium text-(--text-secondary) flex items-center gap-1">
            <Cloud className="w-3 h-3" />
            环境绑定
          </div>
          {env ? (
            <div className="flex items-center gap-2 p-2 rounded bg-slate-800/40 border border-slate-700/30">
              {env.image_url ? (
                <img
                  src={envView === 'back' && env.image_back_url ? env.image_back_url : env.image_url}
                  alt={env.name}
                  className="w-10 h-10 object-cover rounded shrink-0"
                />
              ) : (
                <div className="w-10 h-10 rounded bg-slate-700 flex items-center justify-center shrink-0">
                  <Cloud className="w-4 h-4 text-slate-500" />
                </div>
              )}
              <div className="flex-1 min-w-0">
                <div className="text-xs text-(--text-primary) truncate">{env.name}</div>
                <div className="flex gap-1 mt-0.5">
                  <button
                    type="button"
                    onClick={() => handleSetEnvView('front')}
                    disabled={actingIds.has('envView-front') || !env.image_url}
                    className={`text-[9px] px-1.5 py-0.5 rounded border ${
                      envView === 'front'
                        ? 'border-(--accent) bg-(--accent)/10 text-(--accent)'
                        : 'border-slate-600 text-(--text-muted) hover:border-(--accent)/50'
                    } ${!env.image_url ? 'opacity-40 cursor-not-allowed' : ''}`}
                  >
                    正面
                  </button>
                  <button
                    type="button"
                    onClick={() => handleSetEnvView('back')}
                    disabled={actingIds.has('envView-back') || !env.image_back_url}
                    className={`text-[9px] px-1.5 py-0.5 rounded border ${
                      envView === 'back'
                        ? 'border-(--accent) bg-(--accent)/10 text-(--accent)'
                        : 'border-slate-600 text-(--text-muted) hover:border-(--accent)/50'
                    } ${!env.image_back_url ? 'opacity-40 cursor-not-allowed' : ''}`}
                  >
                    背面
                  </button>
                </div>
              </div>
              <Button
                size="sm"
                isIconOnly
                variant="light"
                className="w-7 h-7 min-w-0 hover:bg-red-500/10"
                isLoading={actingIds.has('detachEnv')}
                onPress={handleDetachEnvironment}
              >
                <Unlink className="w-3.5 h-3.5 text-red-400" />
              </Button>
            </div>
          ) : (
            <div className="flex items-center gap-1.5">
              <select
                className="flex-1 min-w-0 text-xs bg-slate-800/40 border border-slate-700/30 rounded px-2 py-1.5 text-(--text-primary) outline-none focus:border-(--accent)/50"
                onChange={(e) => {
                  const val = e.target.value;
                  if (val) {
                    handleAttachEnvironment(Number(val));
                    e.target.value = '';
                  }
                }}
                value=""
              >
                <option value="">选择环境绑定...</option>
                {availableEnvironments.map(e => (
                  <option key={e.id} value={e.id}>{e.name}</option>
                ))}
              </select>
            </div>
          )}
        </div>

        {/* 建筑关联区 */}
        <div className="space-y-2">
          <div className="text-[11px] font-medium text-(--text-secondary) flex items-center gap-1">
            <Building2 className="w-3 h-3" />
            建筑关联 ({linkedBuildings.length})
          </div>
          {linkedBuildings.map((b) => {
            const bView = (b as any).building_view === 'interior' ? 'interior' : 'exterior';
            const bHasExterior = !!b.exterior_image_url;
            const bHasInterior = !!b.interior_image_url;
            return (
              <div
                key={b.id}
                className="flex items-center gap-2 p-2 rounded bg-slate-800/40 border border-slate-700/30"
              >
                {b.image_url ? (
                  <img src={b.image_url} alt={b.name} className="w-10 h-10 object-cover rounded shrink-0" />
                ) : (
                  <div className="w-10 h-10 rounded bg-slate-700 flex items-center justify-center shrink-0">
                    <Building2 className="w-4 h-4 text-slate-500" />
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <div className="text-xs text-(--text-primary) truncate">{b.name}</div>
                  <div className="flex gap-1 mt-0.5">
                    <button
                      type="button"
                      onClick={() => handleSetBuildingView(b.id, 'exterior')}
                      disabled={actingIds.has(`bView-${b.id}-exterior`) || !bHasExterior}
                      className={`text-[9px] px-1.5 py-0.5 rounded border ${
                        bView === 'exterior'
                          ? 'border-(--accent) bg-(--accent)/10 text-(--accent)'
                          : 'border-slate-600 text-(--text-muted) hover:border-(--accent)/50'
                      } ${!bHasExterior ? 'opacity-40 cursor-not-allowed' : ''}`}
                    >
                      外景
                    </button>
                    <button
                      type="button"
                      onClick={() => handleSetBuildingView(b.id, 'interior')}
                      disabled={actingIds.has(`bView-${b.id}-interior`) || !bHasInterior}
                      className={`text-[9px] px-1.5 py-0.5 rounded border ${
                        bView === 'interior'
                          ? 'border-(--accent) bg-(--accent)/10 text-(--accent)'
                          : 'border-slate-600 text-(--text-muted) hover:border-(--accent)/50'
                      } ${!bHasInterior ? 'opacity-40 cursor-not-allowed' : ''}`}
                    >
                      内景
                    </button>
                  </div>
                </div>
                <Button
                  size="sm"
                  isIconOnly
                  variant="light"
                  className="w-7 h-7 min-w-0 hover:bg-red-500/10"
                  isLoading={actingIds.has(`detachBld-${b.id}`)}
                  onPress={() => handleDetachBuilding(b.id)}
                >
                  <X className="w-3.5 h-3.5 text-red-400" />
                </Button>
              </div>
            );
          })}
          {availableBuildings.length > 0 && (
            <div className="flex items-center gap-1.5">
              <select
                className="flex-1 min-w-0 text-xs bg-slate-800/40 border border-slate-700/30 rounded px-2 py-1.5 text-(--text-primary) outline-none focus:border-(--accent)/50"
                onChange={(e) => {
                  const val = e.target.value;
                  if (val) {
                    handleAttachBuilding(Number(val));
                    e.target.value = '';
                  }
                }}
                value=""
              >
                <option value="">添加建筑...</option>
                {availableBuildings.map(b => (
                  <option key={b.id} value={b.id}>{b.name}</option>
                ))}
              </select>
            </div>
          )}
        </div>
      </div>
    );
  };

  // 渲染道具编辑表单
  const renderPropForm = () => {
    const [styleConfig, setStyleConfig] = useState<PropStyleConfig>({});

    useEffect(() => {
      if (formData.style_config) {
        try {
          const config = typeof formData.style_config === 'string'
            ? JSON.parse(formData.style_config)
            : formData.style_config;
          setStyleConfig(config);
        } catch {
          setStyleConfig({});
        }
      }
    }, [formData.style_config]);

    return (
      <Tabs
        selectedKey={activeTab}
        onSelectionChange={(key) => setActiveTab(key as string)}
        classNames={{
          tabList: "bg-slate-800/60 border border-slate-700/50",
          tab: "text-slate-400 data-[selected=true]:text-slate-100",
          cursor: "bg-blue-500/20",
          panel: "py-4"
        }}
      >
        <Tab key="basic" title={<div className="flex items-center gap-1.5"><Settings className="w-4 h-4" /><span>基础信息</span></div>}>
          <div className="space-y-4">
            <Input
              label="名称"
              placeholder="输入道具名称"
              value={formData.name || ''}
              onValueChange={(val) => setFormData({ ...formData, name: val })}
              classNames={{
                input: "bg-transparent text-slate-100 placeholder:text-slate-500",
                label: "text-slate-400 font-medium",
                inputWrapper: "bg-slate-800/60 border border-slate-600/50 hover:border-blue-500/50 shadow-sm"
              }}
            />
            <Textarea
              label="描述"
              placeholder="输入详细描述"
              value={formData.description || ''}
              onValueChange={(val) => setFormData({ ...formData, description: val })}
              minRows={3}
              classNames={{
                input: "bg-transparent text-slate-100 placeholder:text-slate-500",
                label: "text-slate-400 font-medium",
                inputWrapper: "bg-slate-800/60 border border-slate-600/50 hover:border-blue-500/50 shadow-sm"
              }}
            />
            <Select
              label="道具类型"
              selectedKeys={formData.prop_type ? [formData.prop_type] : ['interactive']}
              onSelectionChange={(keys) => {
                const selected = Array.from(keys)[0] as string;
                if (selected) setFormData({ ...formData, prop_type: selected });
              }}
              classNames={{
                trigger: "bg-slate-800/60 border border-slate-600/50 hover:border-blue-500/50 shadow-sm",
                value: "text-slate-100",
                label: "text-slate-400 font-medium",
                popoverContent: "bg-slate-800 border border-slate-700"
              }}
            >
              <SelectItem key="held" textValue="手持道具">手持道具</SelectItem>
              <SelectItem key="permanent" textValue="永久道具">永久道具</SelectItem>
              <SelectItem key="interactive" textValue="交互道具">交互道具</SelectItem>
            </Select>
            <Input
              label="道具分类"
              placeholder="如：武器、工具、装饰品等"
              value={formData.category || ''}
              onValueChange={(val) => setFormData({ ...formData, category: val })}
              classNames={{
                input: "bg-transparent text-slate-100 placeholder:text-slate-500",
                label: "text-slate-400 font-medium",
                inputWrapper: "bg-slate-800/60 border border-slate-600/50 hover:border-blue-500/50 shadow-sm"
              }}
            />
            <Input
              label="图片URL"
              placeholder="图片地址（选填，可通过AI生成）"
              value={formData.image_url || ''}
              onValueChange={(val) => setFormData({ ...formData, image_url: val })}
              classNames={{
                input: "bg-transparent text-slate-100 placeholder:text-slate-500",
                label: "text-slate-400 font-medium",
                inputWrapper: "bg-slate-800/60 border border-slate-600/50 hover:border-blue-500/50 shadow-sm"
              }}
            />
            {renderTagInput()}
          </div>
        </Tab>
        <Tab key="style" title={<div className="flex items-center gap-1.5"><Palette className="w-4 h-4" /><span>样式配置</span></div>}>
          <PropStyleConfigPanel value={styleConfig} onChange={setStyleConfig} />
        </Tab>
      </Tabs>
    );
  };

  // 渲染服装编辑表单
  const renderCostumeForm = () => {
    const genderOptions = [
      { value: 'male', label: '男性' },
      { value: 'female', label: '女性' },
      { value: 'unisex', label: '通用' }
    ];

    // 收集所有可用的预览图片
    const previewImages = [
      formData.image_url,
      formData.front_view_url,
      formData.side_view_url,
      formData.back_view_url,
    ].filter(Boolean) as string[];

    const hasPreviewImage = previewImages.length > 0;

    const handlePreviewClick = (index: number) => {
      const slides = previewImages.map((url, i) => ({
        src: url,
        alt: i === 0 && formData.image_url === url
          ? `${formData.name || '服装'} - 设定图`
          : i === 0 && formData.front_view_url === url
          ? `${formData.name || '服装'} - 正面`
          : url === formData.side_view_url
          ? `${formData.name || '服装'} - 侧面`
          : url === formData.back_view_url
          ? `${formData.name || '服装'} - 背面`
          : `${formData.name || '服装'} - 预览`,
      }));
      openPreview(slides, index);
    };

    return (
      <Tabs
        selectedKey={activeTab}
        onSelectionChange={(key) => setActiveTab(key as string)}
        classNames={{
          tabList: "bg-slate-800/60 border border-slate-700/50",
          tab: "text-slate-400 data-[selected=true]:text-slate-100",
          cursor: "bg-purple-500/20",
          panel: "py-4"
        }}
      >
        <Tab key="basic" title={<div className="flex items-center gap-1.5"><Settings className="w-4 h-4" /><span>基础信息</span></div>}>
          <div className="space-y-6">
            <div className="space-y-3">
              <h4 className="text-sm font-semibold text-slate-400">基本信息</h4>
              <Input
                label="服装名称"
                placeholder="输入服装名称"
                value={formData.name || ''}
                onValueChange={(value) => setFormData({ ...formData, name: value })}
                classNames={{
                  input: "bg-transparent text-slate-100",
                  label: "text-slate-400 font-medium",
                  inputWrapper: "bg-slate-800/60 border border-slate-600/50 hover:border-blue-500/50 shadow-sm"
                }}
              />
              <Textarea
                label="服装描述"
                placeholder="描述这件服装的特点、风格等"
                value={formData.description || ''}
                onValueChange={(value) => setFormData({ ...formData, description: value })}
                minRows={3}
                classNames={{
                  input: "bg-transparent text-slate-100",
                  label: "text-slate-400 font-medium",
                  inputWrapper: "bg-slate-800/60 border border-slate-600/50 hover:border-blue-500/50 shadow-sm"
                }}
              />
            </div>
            <div className="space-y-3">
              <h4 className="text-sm font-semibold text-slate-400">分类配置</h4>
              <div className="grid grid-cols-2 gap-4">
                <Select
                  label="服装分类"
                  placeholder="选择分类"
                  selectedKeys={formData.category ? [formData.category] : []}
                  onSelectionChange={(keys) => {
                    const value = Array.from(keys)[0] as CostumeCategory;
                    setFormData({ ...formData, category: value });
                  }}
                  classNames={{
                    trigger: "bg-slate-800/60 border border-slate-600/50 hover:border-blue-500/50 shadow-sm",
                    value: "text-slate-100",
                    label: "text-slate-400 font-medium",
                    popoverContent: "bg-slate-800 border border-slate-700"
                  }}
                >
                  {COSTUME_CATEGORIES.map((category) => (
                    <SelectItem key={category} textValue={category}>{category}</SelectItem>
                  ))}
                </Select>
                <Select
                  label="适用性别"
                  placeholder="选择性别"
                  selectedKeys={formData.gender ? [formData.gender] : new Set(['unisex'])}
                  onSelectionChange={(keys) => {
                    const value = Array.from(keys)[0] as string;
                    setFormData({ ...formData, gender: value });
                  }}
                  classNames={{
                    trigger: "bg-slate-800/60 border border-slate-600/50 hover:border-blue-500/50 shadow-sm",
                    value: "text-slate-100",
                    label: "text-slate-400 font-medium",
                    popoverContent: "bg-slate-800 border border-slate-700"
                  }}
                >
                  {genderOptions.map((option) => (
                    <SelectItem key={option.value} textValue={option.label}>{option.label}</SelectItem>
                  ))}
                </Select>
              </div>
            </div>
            <div className="space-y-3">
              <h4 className="text-sm font-semibold text-slate-400">AI生成提示词</h4>
              <Textarea
                label="服装提示词"
                placeholder="描述服装的具体样式，用于AI生成三视图..."
                value={formData.outfit_prompt || ''}
                onValueChange={(value) => setFormData({ ...formData, outfit_prompt: value })}
                minRows={4}
                classNames={{
                  input: "bg-transparent text-slate-100 font-mono text-sm",
                  label: "text-slate-400 font-medium",
                  inputWrapper: "bg-slate-800/60 border border-slate-600/50 hover:border-blue-500/50 shadow-sm"
                }}
              />
              <p className="text-xs text-slate-500">
                此提示词将用于生成服装的三视图。建议使用英文描述，包含服装的颜色、材质、款式等关键词。
              </p>
            </div>
          </div>
        </Tab>
        <Tab key="preview" title={<div className="flex items-center gap-1.5"><ImageIcon className="w-4 h-4" /><span>服装预览</span></div>}>
          <div className="space-y-4">
            {hasPreviewImage ? (
              <>
                {/* 主预览图 */}
                <div
                  className="relative group cursor-zoom-in rounded-lg border border-slate-700/50 overflow-hidden bg-slate-800/40"
                  onClick={() => handlePreviewClick(0)}
                >
                  <img
                    src={previewImages[0]}
                    alt={formData.name || '服装预览'}
                    className="w-full h-56 object-contain"
                  />
                  <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                    <ZoomIn className="w-6 h-6 text-white" />
                  </div>
                  <div className="absolute bottom-2 left-2 px-2 py-0.5 rounded bg-black/60 text-[10px] text-white">
                    {previewImages[0] === formData.image_url ? '设定图' : '正面'}
                  </div>
                </div>

                {/* 多视角缩略图 */}
                {previewImages.length > 1 && (
                  <div className="grid grid-cols-3 gap-2">
                    {previewImages.slice(1).map((url, idx) => {
                      const label = url === formData.front_view_url
                        ? '正面'
                        : url === formData.side_view_url
                        ? '侧面'
                        : url === formData.back_view_url
                        ? '背面'
                        : `视角 ${idx + 2}`;
                      return (
                        <div
                          key={url}
                          className="relative group cursor-zoom-in rounded-lg border border-slate-700/50 overflow-hidden bg-slate-800/40 aspect-square"
                          onClick={() => handlePreviewClick(idx + 1)}
                        >
                          <img
                            src={url}
                            alt={label}
                            className="w-full h-full object-cover"
                          />
                          <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                            <ZoomIn className="w-5 h-5 text-white" />
                          </div>
                          <div className="absolute bottom-1 left-1 px-1.5 py-0.5 rounded bg-black/60 text-[10px] text-white">
                            {label}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                <p className="text-xs text-slate-500 text-center">
                  点击图片可放大预览，支持滚轮缩放与拖拽平移
                </p>
              </>
            ) : (
              <div className="flex flex-col items-center justify-center py-12 text-slate-500">
                <Shirt className="w-12 h-12 mb-3 opacity-30" />
                <p className="text-sm">暂无服装预览图</p>
                <p className="text-xs mt-1 opacity-60">请在资源面板中生成服装设定图</p>
              </div>
            )}
          </div>
        </Tab>
      </Tabs>
    );
  };

  // 渲染环境编辑表单
  const renderEnvironmentForm = () => {
    const hasFront = !!formData.image_url;
    const hasBack = !!formData.image_back_url;
    const envId = formData.id as number | undefined;
    const isGenerating = formData.generation_status === 'generating';

    // 刷新环境数据（图片生成后调用）
    const refreshEnvData = useCallback(async () => {
      if (!envId) return;
      try {
        const data = await getEnvironment(envId);
        setFormData((prev: any) => ({ ...prev, ...data }));
      } catch (e) {
        console.error('[AssetEditor] 刷新环境数据失败:', e);
      }
    }, [envId]);

    // 监听外部刷新事件（ResourcePanel 中生成完成后广播）
    useEffect(() => {
      const handleEnvUpdated = (e: CustomEvent) => {
        if (e.detail?.environmentId === envId) {
          refreshEnvData();
        }
      };
      window.addEventListener('environment:updated', handleEnvUpdated as EventListener);
      return () => window.removeEventListener('environment:updated', handleEnvUpdated as EventListener);
    }, [envId, refreshEnvData]);

    const handleGenerateEnvImage = async (mode: 'front' | 'back' | 'both') => {
      if (!envId) return;
      if (!effectiveImageModel) {
        showToast('请先配置图像模型（在设置中选择图片模型）', 'warning');
        return;
      }
      setGeneratingEnvImage(true);
      try {
        await generateEnvironmentImage(envId, {
          imageModel: effectiveImageModel,
          textModel: effectiveTextModel,
          mode
        });
        showToast(`已启动环境${mode === 'both' ? '双面' : mode === 'back' ? '背面' : '正面'}图生成`, 'success');
        // 启动后刷新一次数据以更新 generation_status
        await refreshEnvData();
      } catch (err: any) {
        showToast('启动失败: ' + (err?.message || '未知错误'), 'error');
      } finally {
        setGeneratingEnvImage(false);
      }
    };

    const handleDelete = async () => {
      if (!envId) return;
      const ok = await confirm({
        title: '删除环境',
        message: `确定要删除环境「${formData.name || '未命名'}」吗？此操作不可撤销。`,
        confirmText: '删除',
        cancelText: '取消',
        type: 'danger',
      });
      if (!ok) return;
      try {
        await deleteEnvironment(envId);
        showToast('环境已删除', 'success');
        // 通知外部刷新列表
        window.dispatchEvent(new CustomEvent('environment:deleted', { detail: { environmentId: envId } }));
        onClose();
      } catch (err: any) {
        showToast('删除失败: ' + (err?.message || '未知错误'), 'error');
      }
    };

    return (
      <Tabs
        selectedKey={activeTab}
        onSelectionChange={(key) => setActiveTab(key as string)}
        classNames={{
          tabList: "bg-slate-800/60 border border-slate-700/50",
          tab: "text-slate-400 data-[selected=true]:text-slate-100",
          cursor: "bg-blue-500/20",
          panel: "py-4"
        }}
      >
        <Tab key="basic" title={<div className="flex items-center gap-1.5"><Settings className="w-4 h-4" /><span>基础信息</span></div>}>
          <div className="space-y-4">
            <Input
              label="名称"
              placeholder="如：蜜糖草地、沙地、溪流..."
              value={formData.name || ''}
              onValueChange={(v) => setFormData({ ...formData, name: v })}
              classNames={{
                input: "bg-transparent text-slate-100",
                label: "text-slate-400 font-medium",
                inputWrapper: "bg-slate-800/60 border border-slate-600/50 hover:border-blue-500/50 shadow-sm"
              }}
            />
            <Textarea
              label="描述"
              placeholder="环境氛围描述..."
              value={formData.description || ''}
              onValueChange={(v) => setFormData({ ...formData, description: v })}
              minRows={3}
              classNames={{
                input: "bg-transparent text-slate-100",
                label: "text-slate-400 font-medium",
                inputWrapper: "bg-slate-800/60 border border-slate-600/50 hover:border-blue-500/50 shadow-sm"
              }}
            />
            <div className="grid grid-cols-2 gap-3">
              <Input
                label="时间"
                placeholder="如：清晨、黄昏"
                value={formData.timeOfDay || ''}
                onValueChange={(v) => setFormData({ ...formData, timeOfDay: v })}
                classNames={{
                  input: "bg-transparent text-slate-100",
                  label: "text-slate-400 font-medium",
                  inputWrapper: "bg-slate-800/60 border border-slate-600/50 hover:border-blue-500/50 shadow-sm"
                }}
              />
              <Input
                label="天气"
                placeholder="如：晴朗、雨天"
                value={formData.weather || ''}
                onValueChange={(v) => setFormData({ ...formData, weather: v })}
                classNames={{
                  input: "bg-transparent text-slate-100",
                  label: "text-slate-400 font-medium",
                  inputWrapper: "bg-slate-800/60 border border-slate-600/50 hover:border-blue-500/50 shadow-sm"
                }}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Input
                label="光照"
                placeholder="如：柔和、强烈"
                value={formData.lighting || ''}
                onValueChange={(v) => setFormData({ ...formData, lighting: v })}
                classNames={{
                  input: "bg-transparent text-slate-100",
                  label: "text-slate-400 font-medium",
                  inputWrapper: "bg-slate-800/60 border border-slate-600/50 hover:border-blue-500/50 shadow-sm"
                }}
              />
              <Input
                label="氛围"
                placeholder="如：温馨、神秘"
                value={formData.mood || ''}
                onValueChange={(v) => setFormData({ ...formData, mood: v })}
                classNames={{
                  input: "bg-transparent text-slate-100",
                  label: "text-slate-400 font-medium",
                  inputWrapper: "bg-slate-800/60 border border-slate-600/50 hover:border-blue-500/50 shadow-sm"
                }}
              />
            </div>
            <Input
              label="地貌类型"
              placeholder="如：山地、平原、水域"
              value={formData.terrainType || ''}
              onValueChange={(v) => setFormData({ ...formData, terrainType: v })}
              classNames={{
                input: "bg-transparent text-slate-100",
                label: "text-slate-400 font-medium",
                inputWrapper: "bg-slate-800/60 border border-slate-600/50 hover:border-blue-500/50 shadow-sm"
              }}
            />
            {/* 删除操作 */}
            <div className="pt-4 border-t border-slate-700/30">
              <Button
                size="sm"
                variant="light"
                className="text-red-400 hover:bg-red-500/10"
                startContent={<Trash2 className="w-3.5 h-3.5" />}
                onPress={handleDelete}
              >
                删除环境
              </Button>
            </div>
          </div>
        </Tab>
        <Tab key="images" title={<div className="flex items-center gap-1.5"><ImageIcon className="w-4 h-4" /><span>图片预览</span></div>}>
          <div className="space-y-3">
            {/* 生成状态提示 */}
            {isGenerating && (
              <div className="flex items-center gap-2 text-xs text-blue-400 bg-blue-500/10 px-3 py-2 rounded-lg">
                <Loader2 className="w-3 h-3 animate-spin" />
                <span>环境图生成中，请稍候...</span>
              </div>
            )}
            {/* 正面图 + 背面图 左右并排 */}
            <div className="grid grid-cols-2 gap-3">
              {/* 正面图 */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <div className="text-[11px] font-medium text-(--text-secondary)">正面图</div>
                  <Button
                    size="sm"
                    variant="flat"
                    className="h-6 px-2 text-[11px] bg-violet-500/10 text-violet-400 hover:bg-violet-500/20"
                    startContent={generatingEnvImage ? <Loader2 className="w-3 h-3 animate-spin" /> : <Wand2 className="w-3 h-3" />}
                    isDisabled={generatingEnvImage || !effectiveImageModel || isGenerating}
                    onPress={() => handleGenerateEnvImage('front')}
                  >
                    生成正面
                  </Button>
                </div>
                {hasFront ? (
                  <div
                    className="relative group cursor-zoom-in rounded-lg border border-slate-700/50 overflow-hidden"
                    onClick={() => setPreviewImage({ url: formData.image_url, name: `${formData.name} - 正面图` })}
                  >
                    <img src={formData.image_url} alt="正面图" className="w-full h-36 object-cover" />
                    <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                      <ZoomIn className="w-5 h-5 text-white" />
                    </div>
                  </div>
                ) : (
                  <div className="w-full h-28 rounded-lg border border-dashed border-slate-600 flex flex-col items-center justify-center bg-slate-800/40 gap-1">
                    <ImageIcon className="w-7 h-7 text-slate-500" />
                    <span className="text-[11px] text-slate-500">暂无正面图</span>
                  </div>
                )}
              </div>
              {/* 背面图 */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <div className="text-[11px] font-medium text-(--text-secondary)">背面图</div>
                  <Button
                    size="sm"
                    variant="flat"
                    className="h-6 px-2 text-[11px] bg-violet-500/10 text-violet-400 hover:bg-violet-500/20"
                    startContent={generatingEnvImage ? <Loader2 className="w-3 h-3 animate-spin" /> : <Wand2 className="w-3 h-3" />}
                    isDisabled={generatingEnvImage || !effectiveImageModel || isGenerating}
                    onPress={() => handleGenerateEnvImage('back')}
                  >
                    生成背面
                  </Button>
                </div>
                {hasBack ? (
                  <div
                    className="relative group cursor-zoom-in rounded-lg border border-slate-700/50 overflow-hidden"
                    onClick={() => setPreviewImage({ url: formData.image_back_url, name: `${formData.name} - 背面图` })}
                  >
                    <img src={formData.image_back_url} alt="背面图" className="w-full h-36 object-cover" />
                    <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                      <ZoomIn className="w-5 h-5 text-white" />
                    </div>
                  </div>
                ) : (
                  <div className="w-full h-28 rounded-lg border border-dashed border-slate-600 flex flex-col items-center justify-center bg-slate-800/40 gap-1">
                    <ImageIcon className="w-7 h-7 text-slate-500" />
                    <span className="text-[11px] text-slate-500">暂无背面图</span>
                  </div>
                )}
              </div>
            </div>
            {/* 生成双面按钮 */}
            <Button
              size="sm"
              variant="flat"
              className="w-full h-8 text-[11px] bg-violet-500/10 text-violet-400 hover:bg-violet-500/20"
              startContent={generatingEnvImage ? <Loader2 className="w-3 h-3 animate-spin" /> : <Wand2 className="w-3 h-3" />}
              isDisabled={generatingEnvImage || !effectiveImageModel || isGenerating}
              onPress={() => handleGenerateEnvImage('both')}
            >
              生成双面（正面 + 背面）
            </Button>
          </div>
        </Tab>
      </Tabs>
    );
  };

  // 渲染建筑编辑表单
  const renderBuildingForm = () => {
    const hasExterior = !!formData.exterior_image_url;
    const hasInterior = !!formData.interior_image_url;
    const bldId = formData.id as number | undefined;
    const isGenerating = formData.generation_status === 'generating';

    const refreshBldData = useCallback(async () => {
      if (!bldId) return;
      try {
        const data = await getBuilding(bldId);
        setFormData((prev: any) => ({ ...prev, ...data }));
      } catch (e) {
        console.error('[AssetEditor] 刷新建筑数据失败:', e);
      }
    }, [bldId]);

    // 监听外部刷新事件
    useEffect(() => {
      const handleBldUpdated = (e: CustomEvent) => {
        if (e.detail?.buildingId === bldId) refreshBldData();
      };
      window.addEventListener('building:updated', handleBldUpdated as EventListener);
      return () => window.removeEventListener('building:updated', handleBldUpdated as EventListener);
    }, [bldId, refreshBldData]);

    const handleDelete = async () => {
      if (!bldId) return;
      const ok = await confirm({
        title: '删除建筑',
        message: `确定要删除建筑 "${formData.name || ''}" 吗？此操作不可恢复。`,
        confirmText: '删除',
        cancelText: '取消',
        type: 'danger',
      });
      if (!ok) return;
      try {
        await deleteBuilding(bldId);
        window.dispatchEvent(new CustomEvent('building:deleted', { detail: { buildingId: bldId } }));
        showToast('建筑已删除', 'success');
        onClose();
      } catch (err: any) {
        showToast('删除失败: ' + (err?.message || '未知错误'), 'error');
      }
    };

    const handleGenerateBldImage = async (viewType: 'exterior' | 'interior' | 'both') => {
      if (!bldId) return;
      if (!effectiveImageModel) {
        showToast('请先配置图像模型（在设置中选择图片模型）', 'warning');
        return;
      }
      setGeneratingBldImage(true);
      try {
        await generateBuildingImage(bldId, {
          imageModel: effectiveImageModel,
          textModel: effectiveTextModel,
          viewType
        });
        showToast(`已启动建筑${viewType === 'both' ? '双面' : viewType === 'interior' ? '室内' : '室外'}图生成`, 'success');
      } catch (err: any) {
        showToast('启动失败: ' + (err?.message || '未知错误'), 'error');
      } finally {
        setGeneratingBldImage(false);
      }
    };

    return (
      <Tabs
        selectedKey={activeTab}
        onSelectionChange={(key) => setActiveTab(key as string)}
        classNames={{
          tabList: "bg-slate-800/60 border border-slate-700/50",
          tab: "text-slate-400 data-[selected=true]:text-slate-100",
          cursor: "bg-blue-500/20",
          panel: "py-4"
        }}
      >
        <Tab key="basic" title={<div className="flex items-center gap-1.5"><Settings className="w-4 h-4" /><span>基础信息</span></div>}>
          <div className="space-y-4">
            <Input
              label="名称"
              placeholder="输入建筑名称"
              value={formData.name || ''}
              onValueChange={(v) => setFormData({ ...formData, name: v })}
              classNames={{
                input: "bg-transparent text-slate-100",
                label: "text-slate-400 font-medium",
                inputWrapper: "bg-slate-800/60 border border-slate-600/50 hover:border-blue-500/50 shadow-sm"
              }}
            />
            <Textarea
              label="描述"
              placeholder="建筑描述..."
              value={formData.description || ''}
              onValueChange={(v) => setFormData({ ...formData, description: v })}
              minRows={3}
              classNames={{
                input: "bg-transparent text-slate-100",
                label: "text-slate-400 font-medium",
                inputWrapper: "bg-slate-800/60 border border-slate-600/50 hover:border-blue-500/50 shadow-sm"
              }}
            />
            <Select
              label="内外景"
              selectedKeys={formData.interiorExterior ? [formData.interiorExterior] : ['both']}
              onSelectionChange={(keys) => {
                const value = Array.from(keys)[0] as string;
                setFormData({ ...formData, interiorExterior: value });
              }}
              classNames={{
                trigger: "bg-slate-800/60 border border-slate-600/50 hover:border-blue-500/50 shadow-sm",
                value: "text-slate-100",
                label: "text-slate-400 font-medium",
                popoverContent: "bg-slate-800 border border-slate-700"
              }}
            >
              <SelectItem key="interior" textValue="室内">室内</SelectItem>
              <SelectItem key="exterior" textValue="室外">室外</SelectItem>
              <SelectItem key="both" textValue="室内外">室内外</SelectItem>
            </Select>
            <Input
              label="结构类型"
              placeholder="如：现代建筑、古建筑..."
              value={formData.structureType || ''}
              onValueChange={(v) => setFormData({ ...formData, structureType: v })}
              classNames={{
                input: "bg-transparent text-slate-100",
                label: "text-slate-400 font-medium",
                inputWrapper: "bg-slate-800/60 border border-slate-600/50 hover:border-blue-500/50 shadow-sm"
              }}
            />
            {/* 删除操作 */}
            <div className="pt-4 border-t border-slate-700/30">
              <Button
                size="sm"
                variant="light"
                className="text-red-400 hover:bg-red-500/10"
                startContent={<Trash2 className="w-3.5 h-3.5" />}
                onPress={handleDelete}
              >
                删除建筑
              </Button>
            </div>
          </div>
        </Tab>
        <Tab key="images" title={<div className="flex items-center gap-1.5"><ImageIcon className="w-4 h-4" /><span>图片预览</span></div>}>
          <div className="space-y-3">
            {/* 生成状态提示 */}
            {isGenerating && (
              <div className="flex items-center gap-2 text-xs text-blue-400 bg-blue-500/10 px-3 py-2 rounded-lg">
                <Loader2 className="w-3 h-3 animate-spin" />
                <span>建筑图生成中，请稍候...</span>
              </div>
            )}
            {/* 室外图 + 室内图 左右并排 */}
            <div className="grid grid-cols-2 gap-3">
              {/* 室外图 */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <div className="text-[11px] font-medium text-(--text-secondary)">室外图</div>
                  <Button
                    size="sm"
                    variant="flat"
                    className="h-6 px-2 text-[11px] bg-violet-500/10 text-violet-400 hover:bg-violet-500/20"
                    startContent={generatingBldImage ? <Loader2 className="w-3 h-3 animate-spin" /> : <Wand2 className="w-3 h-3" />}
                    isDisabled={generatingBldImage || !effectiveImageModel || isGenerating}
                    onPress={() => handleGenerateBldImage('exterior')}
                  >
                    生成室外
                  </Button>
                </div>
                {hasExterior ? (
                  <div
                    className="relative group cursor-zoom-in rounded-lg border border-slate-700/50 overflow-hidden"
                    onClick={() => setPreviewImage({ url: formData.exterior_image_url, name: `${formData.name} - 室外图` })}
                  >
                    <img src={formData.exterior_image_url} alt="室外图" className="w-full h-36 object-cover" />
                    <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                      <ZoomIn className="w-5 h-5 text-white" />
                    </div>
                  </div>
                ) : (
                  <div className="w-full h-28 rounded-lg border border-dashed border-slate-600 flex flex-col items-center justify-center bg-slate-800/40 gap-1">
                    <ImageIcon className="w-7 h-7 text-slate-500" />
                    <span className="text-[11px] text-slate-500">暂无室外图</span>
                  </div>
                )}
              </div>
              {/* 室内图 */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <div className="text-[11px] font-medium text-(--text-secondary)">室内图</div>
                  <Button
                    size="sm"
                    variant="flat"
                    className="h-6 px-2 text-[11px] bg-violet-500/10 text-violet-400 hover:bg-violet-500/20"
                    startContent={generatingBldImage ? <Loader2 className="w-3 h-3 animate-spin" /> : <Wand2 className="w-3 h-3" />}
                    isDisabled={generatingBldImage || !effectiveImageModel || isGenerating}
                    onPress={() => handleGenerateBldImage('interior')}
                  >
                    生成室内
                  </Button>
                </div>
                {hasInterior ? (
                  <div
                    className="relative group cursor-zoom-in rounded-lg border border-slate-700/50 overflow-hidden"
                    onClick={() => setPreviewImage({ url: formData.interior_image_url, name: `${formData.name} - 室内图` })}
                  >
                    <img src={formData.interior_image_url} alt="室内图" className="w-full h-36 object-cover" />
                    <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                      <ZoomIn className="w-5 h-5 text-white" />
                    </div>
                  </div>
                ) : (
                  <div className="w-full h-28 rounded-lg border border-dashed border-slate-600 flex flex-col items-center justify-center bg-slate-800/40 gap-1">
                    <ImageIcon className="w-7 h-7 text-slate-500" />
                    <span className="text-[11px] text-slate-500">暂无室内图</span>
                  </div>
                )}
              </div>
            </div>
            {/* 生成双面按钮 */}
            <Button
              size="sm"
              variant="flat"
              className="w-full h-8 text-[11px] bg-violet-500/10 text-violet-400 hover:bg-violet-500/20"
              startContent={generatingBldImage ? <Loader2 className="w-3 h-3 animate-spin" /> : <Wand2 className="w-3 h-3" />}
              isDisabled={generatingBldImage || !effectiveImageModel || isGenerating}
              onPress={() => handleGenerateBldImage('both')}
            >
              生成双面（室外 + 室内）
            </Button>
          </div>
        </Tab>
      </Tabs>
    );
  };

  // 渲染剧本编辑表单
  const renderScriptForm = () => (
    <div className="space-y-4">
      <Input
        label="剧本名称"
        placeholder="输入剧本名称"
        value={formData.name || ''}
        onValueChange={(v) => setFormData({ ...formData, name: v })}
        classNames={{
          input: "bg-transparent text-slate-100",
          label: "text-slate-400 font-medium",
          inputWrapper: "bg-slate-800/60 border border-slate-600/50 hover:border-blue-500/50 shadow-sm"
        }}
      />
      <Textarea
        label="剧本内容"
        placeholder="在此输入或编辑剧本内容..."
        value={formData.content || ''}
        onValueChange={(v) => setFormData({ ...formData, content: v })}
        minRows={20}
        classNames={{
          input: "bg-transparent text-slate-100 font-mono text-sm leading-relaxed",
          label: "text-slate-400 font-medium",
          inputWrapper: "bg-slate-800/60 border border-slate-600/50 hover:border-blue-500/50 shadow-sm"
        }}
      />
      <p className="text-[11px] text-slate-500">
        提示：剧本内容修改后将在 2 秒后自动保存，也可手动点击上方保存按钮
      </p>
    </div>
  );

  // 根据资产类型渲染对应表单
  const renderForm = () => {
    switch (assetType) {
      case 'character':
        return renderCharacterForm();
      case 'scene':
      case 'studio':
        return renderSceneForm();
      case 'prop':
        return renderPropForm();
      case 'costume':
        return renderCostumeForm();
      case 'environment':
        return renderEnvironmentForm();
      case 'building':
        return renderBuildingForm();
      case 'script':
        return renderScriptForm();
      default:
        return <div className="text-center py-8 text-slate-500">暂不支持该资产类型的编辑</div>;
    }
  };

  return (
    <div className="flex flex-col h-full bg-[var(--bg-app)]">
      {/* 顶部标题栏 */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border-color)] bg-[var(--bg-card)]">
        <div className="flex items-center gap-2">
          <div className={`flex items-center justify-center w-6 h-6 rounded bg-${config.color}-500/15 text-${config.color}-400`}>
            {config.icon}
          </div>
          <span className="text-sm font-semibold text-[var(--text-primary)]">
            {formData.name || '未命名'}{config.label}
          </span>
          <span className={`text-[10px] px-1.5 py-0.5 rounded bg-${config.color}-500/15 text-${config.color}-400`}>
            {config.label}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {isDirty && (
            <span className="text-[10px] text-amber-400 animate-pulse">
              未保存
            </span>
          )}
        </div>
      </div>

      {/* 表单内容区 */}
      <div className="flex-1 overflow-auto p-4">
        {renderForm()}
      </div>

      {/* 图片预览弹窗 */}
      {previewImage && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
          onClick={() => setPreviewImage(null)}
        >
          <div className="bg-slate-900/95 backdrop-blur-xl border border-slate-700/50 rounded-xl max-w-[90vw] max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between px-4 py-3 border-b border-slate-700/50">
              <span className="text-slate-100 font-bold text-sm">{previewImage.name}</span>
              <button
                onClick={() => setPreviewImage(null)}
                className="text-slate-400 hover:text-slate-200"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-2 flex items-center justify-center">
              <img
                src={previewImage.url}
                alt={previewImage.name}
                className="max-w-full max-h-[70vh] object-contain rounded-lg"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AssetEditor;
