import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLanguage } from '../../contexts/LanguageContext';
import { Button, Input, Tabs, Tab, useDisclosure, Modal, ModalContent, ModalHeader, ModalBody, ModalFooter, Popover, PopoverTrigger, PopoverContent, Textarea } from '@heroui/react';
import { Users, MapPin, FileText, Plus, Search, Tag, Settings, Edit2, X, ChevronDown, ChevronRight, BookOpen, Sparkles, Cloud, Building2, Wand2 } from 'lucide-react';
import { getAuthToken } from '../../services/auth';
import { useSceneImageGeneration } from '../StoryBoard/hooks/useSceneImageGeneration';
import SceneDetailModal from '../StoryBoard/ResourcePanel/SceneDetailModal';
import { 
  Character, Scene, Prop, TagGroup, CharacterTagGroupEntry, HeldPropsRef,
  fetchCharacters, fetchCharactersByProject, fetchScenes, fetchScenesByProject, fetchProps,
  createCharacter, createScene, createProp,
  updateCharacter, updateScene, updateProp,
  deleteCharacter, deleteScene, deleteProp,
  fetchTagGroups, createTagGroup, updateTagGroup, deleteTagGroup,
  TAG_GROUP_COLORS,
  generateCharacterViews,
  generateCharacterStateViews,
  createCharacterState,
  fetchCharacterStates,
} from '../../services/assets';
import { Project, fetchProjects } from '../../services/projects';

import { fetchCostumes, deleteCostume as deleteCostumeApi, generateCostumeViews, updateCostume, generatePropViews } from '../../services/costumes';
import type { Costume } from '../../services/costumes';
import {
  ScriptLibraryItem,
  fetchScriptLibrary,
  createScript as createScriptApi,
  deleteScript as deleteScriptApi,
  bindScriptToProject,
} from '../../services/scripts';
import {
  Environment,
  listEnvironments,
  createEnvironment,
  updateEnvironment,
  deleteEnvironment,
  generateEnvironmentImage,
  sanitizeEnvironmentDescriptions,
} from '../../services/environments';
import {
  Building,
  listBuildings,
  createBuilding,
  updateBuilding,
  deleteBuilding,
  generateBuildingImage,
  deleteBuildingImage,
} from '../../services/buildings';
import CharacterList from './CharacterList';
import ProjectSidebar from './ProjectSidebar';
import SceneList from './SceneList';
import PropList from './PropList';

import StudioList from './StudioList';
import EnvironmentList from './EnvironmentList';
import BuildingList from './BuildingList';
import ScriptList from './ScriptList';
import ScriptGenerateModal from './ScriptGenerateModal';
import CharacterDraftPreviewModal from './CharacterDraftPreviewModal';
import { useWorkflow, consumeWorkflow } from '../../hooks/useWorkflow';
import { generateDefaultCostumeState } from '../../services/assets';
import { CharacterModal, SceneModal, PropModal, StudioModal } from './AssetModel';
import { useToast } from '../../contexts/ToastContext';
import { useConfirm } from '../../contexts/ConfirmContext';
import { useCurrentProject } from '../../contexts/WorkbenchContext';
import { usePreview } from '../../components/PreviewProvider';
import { AIModel } from '../../components/AIModelSelector';
import type { CharacterState } from '../../services/assets';
import { useAIAssistantWorkbenchContext } from '../../contexts/AIAssistantContext';

type TabType = 'characters' | 'studios' | 'props' | 'costumes' | 'scripts' | 'environments' | 'buildings';

// 标签分组管理面板组件
interface TagGroupManagerProps {
  isOpen: boolean;
  onOpenChange: () => void;
  tagGroups: TagGroup[];
  onRefresh: () => void;
}

const TagGroupManager: React.FC<TagGroupManagerProps> = ({ isOpen, onOpenChange, tagGroups, onRefresh }) => {
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editName, setEditName] = useState('');
  const [editColor, setEditColor] = useState('');
  const [newName, setNewName] = useState('');
  const [newColor, setNewColor] = useState(TAG_GROUP_COLORS[0]);
  const { showToast } = useToast();
  const { confirm } = useConfirm();

  const handleStartEdit = (group: TagGroup) => {
    setEditingId(group.id);
    setEditName(group.name);
    setEditColor(group.color);
  };

  const handleSaveEdit = async () => {
    if (!editingId || !editName.trim()) return;
    try {
      await updateTagGroup(editingId, { name: editName.trim(), color: editColor });
      setEditingId(null);
      onRefresh();
    } catch (error: any) {
      console.error('更新标签分组失败:', error);
      showToast('更新标签分组失败，请稍后重试', 'error');
    }
  };

  const handleDelete = async (id: number) => {
    const confirmed = await confirm({
      title: '删除确认',
      message: '确定要删除这个标签分组吗？',
      type: 'danger',
      confirmText: '删除'
    });
    if (!confirmed) return;
    try {
      await deleteTagGroup(id);
      onRefresh();
    } catch (error: any) {
      console.error('删除标签分组失败:', error);
      showToast('删除标签分组失败，请稍后重试', 'error');
    }
  };

  const handleCreate = async () => {
    if (!newName.trim()) return;
    try {
      await createTagGroup({ name: newName.trim(), color: newColor });
      setNewName('');
      setNewColor(TAG_GROUP_COLORS[0]);
      onRefresh();
    } catch (error: any) {
      console.error('创建标签分组失败:', error);
      showToast('创建标签分组失败，请稍后重试', 'error');
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onOpenChange={onOpenChange}
      size="lg"
      motionProps={{
        variants: {
          enter: {
            y: 0,
            opacity: 1,
            scale: 1,
            transition: {
              duration: 0.2,
              ease: [0.4, 0, 0.2, 1],
            },
          },
          exit: {
            y: 8,
            opacity: 0,
            scale: 0.98,
            transition: {
              duration: 0.15,
              ease: [0.4, 0, 1, 1],
            },
          },
        },
      }}
      classNames={{
        base: "bg-white shadow-xl",
        header: "border-b-0",
        body: "py-4",
        backdrop: "bg-black/40 backdrop-blur-sm"
      }}
    >
      <ModalContent>
        {(onClose) => (
          <>
            <ModalHeader className="text-slate-800 font-bold flex items-center gap-2">
              <Tag className="w-5 h-5 text-slate-600" />
              标签分组管理
            </ModalHeader>
            <ModalBody className="space-y-4">
              {/* 新建分组 */}
              <div className="flex gap-3 items-center">
                <Input
                  size="lg"
                  placeholder=""
                  value={newName}
                  onValueChange={setNewName}
                  classNames={{
                    input: "bg-transparent text-slate-700 placeholder:text-slate-400",
                    inputWrapper: "bg-blue-50 border-0 shadow-none hover:bg-blue-100 transition-colors"
                  }}
                  className="flex-1"
                />
                <Popover>
                  <PopoverTrigger>
                    <button
                      className="w-10 h-10 rounded-full shrink-0 shadow-md hover:scale-105 transition-transform"
                      style={{ 
                        backgroundColor: newColor,
                        boxShadow: `0 2px 8px ${newColor}40`
                      }}
                    />
                  </PopoverTrigger>
                  <PopoverContent className="bg-white border border-slate-200 p-3 shadow-lg rounded-xl">
                    <div className="flex flex-wrap gap-2 max-w-50">
                      {TAG_GROUP_COLORS.map((color) => (
                        <button
                          key={color}
                          onClick={() => setNewColor(color)}
                          className="w-8 h-8 rounded-full transition-all hover:scale-110"
                          style={{
                            backgroundColor: color,
                            boxShadow: newColor === color 
                              ? `0 0 0 3px white, 0 0 0 5px ${color}` 
                              : 'none',
                            transform: newColor === color ? 'scale(1.1)' : 'scale(1)',
                          }}
                        />
                      ))}
                    </div>
                  </PopoverContent>
                </Popover>
                <Button
                  size="lg"
                  className="bg-blue-500 hover:bg-blue-600 text-white font-medium px-6"
                  onPress={handleCreate}
                  isDisabled={!newName.trim()}
                >
                  <Plus className="w-4 h-4" />
                  添加
                </Button>
              </div>

              {/* 分组列表 */}
              <div className="space-y-2 max-h-100 overflow-y-auto">
                {tagGroups.length === 0 ? (
                  <div className="text-center text-slate-400 py-12">
                    暂无标签分组，点击上方添加
                  </div>
                ) : (
                  tagGroups.map((group) => (
                    <div
                      key={group.id}
                      className="flex items-center gap-3 p-3 bg-slate-50 rounded-lg hover:bg-slate-100 transition-colors">
                      {editingId === group.id ? (
                        <>
                          <Popover>
                            <PopoverTrigger>
                              <button
                                className="w-6 h-6 rounded-full shrink-0"
                                style={{ backgroundColor: editColor }}
                              />
                            </PopoverTrigger>
                            <PopoverContent className="bg-slate-800 border border-slate-700 p-2">
                              <div className="flex flex-wrap gap-2 max-w-50">
                                {TAG_GROUP_COLORS.map((color) => (
                                  <button
                                    key={color}
                                    onClick={() => setEditColor(color)}
                                    className="w-7 h-7 rounded-full transition-all"
                                    style={{
                                      backgroundColor: color,
                                      boxShadow: editColor === color 
                                        ? `0 0 0 2px #1e293b, 0 0 0 4px ${color}` 
                                        : `0 0 0 1px rgba(255,255,255,0.15)`,
                                      transform: editColor === color ? 'scale(1.15)' : 'scale(1)',
                                    }}
                                    title={color}
                                  />
                                ))}
                              </div>
                            </PopoverContent>
                          </Popover>
                          <Input
                            size="sm"
                            value={editName}
                            onValueChange={setEditName}
                            classNames={{
                              input: "bg-transparent text-slate-700",
                              inputWrapper: "bg-blue-50 border-0 shadow-none"
                            }}
                            className="flex-1"
                          />
                          <Button size="sm" className="bg-green-500 text-white" onPress={handleSaveEdit}>
                            保存
                          </Button>
                          <Button size="sm" variant="light" className="text-slate-500" onPress={() => setEditingId(null)}>
                            取消
                          </Button>
                        </>
                      ) : (
                        <>
                          <span
                            className="w-5 h-5 rounded-full shrink-0"
                            style={{ 
                              backgroundColor: group.color,
                              boxShadow: `0 0 0 2px ${group.color}30`,
                            }}
                          />
                          <span className="flex-1 text-slate-700">{group.name}</span>
                          <Button
                            size="sm"
                            isIconOnly
                            variant="light"
                            onPress={() => handleStartEdit(group)}
                            className="text-slate-400 hover:text-blue-500"
                          >
                            <Edit2 className="w-4 h-4" />
                          </Button>
                          <Button
                            size="sm"
                            isIconOnly
                            variant="light"
                            onPress={() => handleDelete(group.id)}
                            className="text-slate-400 hover:text-red-500"
                          >
                            <X className="w-4 h-4" />
                          </Button>
                        </>
                      )}
                    </div>
                  ))
                )}
              </div>
            </ModalBody>
            <ModalFooter>
              <Button variant="light" onPress={onClose} className="text-slate-500 hover:text-slate-700">
                关闭
              </Button>
            </ModalFooter>
          </>
        )}
      </ModalContent>
    </Modal>
  );
};

const AssetsManager: React.FC = () => {
  const { t } = useLanguage();
  const [activeTab, setActiveTab] = useState<TabType>('characters');
  const [characters, setCharacters] = useState<Character[]>([]);
  const [scenes, setScenes] = useState<Scene[]>([]);
  const [props, setProps] = useState<Prop[]>([]);
  const [heldPropsRefs, setHeldPropsRefs] = useState<HeldPropsRef[]>([]);
  const [creatingPropFromRef, setCreatingPropFromRef] = useState<number | null>(null); // state_id being processed
  const [studios, setStudios] = useState<import('../../services/studios').Studio[]>([]);
  const [costumes, setCostumes] = useState<Costume[]>([]);
  const [editingCostumeDesc, setEditingCostumeDesc] = useState<{ id: number; value: string } | null>(null);
  const [scripts, setScripts] = useState<ScriptLibraryItem[]>([]);
  const [environments, setEnvironments] = useState<Environment[]>([]);
  const [buildings, setBuildings] = useState<Building[]>([]);
  const [tagGroups, setTagGroups] = useState<TagGroup[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTag, setActiveTag] = useState<string | null>(null);
  // 项目筛选：'all' | 'unused' | 数字(projectId)
  const [projectFilter, setProjectFilter] = useState<string>('all');
  // 用户的项目列表
  const [userProjects, setUserProjects] = useState<Project[]>([]);
  // 分组筛选状态：{ groupId: number, tag: string } | null
  const [activeGroupFilter, setActiveGroupFilter] = useState<{ groupId: number; tag: string } | null>(null);
  // 展开的分组
  const [expandedGroups, setExpandedGroups] = useState<Set<number>>(new Set());
  // AI 模型列表
  const [aiModels, setAiModels] = useState<AIModel[]>([]);
  const [selectedImageModel, setSelectedImageModel] = useState('');
  const [selectedTextModel, setSelectedTextModel] = useState('');
  const { showToast } = useToast();
  const { confirm } = useConfirm();
  const { currentProject } = useCurrentProject();
  const { openPreview } = usePreview();
  const navigate = useNavigate();

  // 加载用户项目列表
  useEffect(() => {
    fetchProjects().then(setUserProjects).catch(console.error);
  }, []);
  
  const { isOpen, onOpen, onOpenChange } = useDisclosure();
  const [editMode, setEditMode] = useState(false);
  const [currentId, setCurrentId] = useState<number | null>(null);
  
  // 标签分组管理模态框
  const { isOpen: isTagManagerOpen, onOpen: onTagManagerOpen, onOpenChange: onTagManagerOpenChange } = useDisclosure();
  
  // 场景详情模态框
  const { isOpen: isDetailOpen, onOpen: onDetailOpen, onOpenChange: onDetailOpenChange } = useDisclosure();
  const [selectedScene, setSelectedScene] = useState<Scene | null>(null);

  // 影棚模态框
  const { isOpen: isStudioOpen, onOpen: onStudioOpen, onOpenChange: onStudioOpenChange } = useDisclosure();
  const [editingStudioId, setEditingStudioId] = useState<number | null>(null);
  const [studioEditMode, setStudioEditMode] = useState(false);

  // 环境模态框
  const { isOpen: isEnvOpen, onOpen: onEnvOpen, onOpenChange: onEnvOpenChange } = useDisclosure();
  const [editingEnvId, setEditingEnvId] = useState<number | null>(null);
  const [envEditMode, setEnvEditMode] = useState(false);
  const [envForm, setEnvForm] = useState({
    name: '',
    description: '',
    timeOfDay: '',
    weather: '',
    lighting: '',
    mood: '',
    terrainType: '',
    project_id: undefined as number | undefined,
  });

  // 建筑模态框
  const { isOpen: isBldOpen, onOpen: onBldOpen, onOpenChange: onBldOpenChange } = useDisclosure();
  const [editingBldId, setEditingBldId] = useState<number | null>(null);
  const [bldEditMode, setBldEditMode] = useState(false);
  const [bldForm, setBldForm] = useState({
    name: '',
    description: '',
    interiorExterior: 'both' as 'interior' | 'exterior' | 'both',
    structureType: '',
    project_id: undefined as number | undefined,
  });
  // 编辑 Modal 中图像区 Tab 当前视图（外景/内景叠加卡片）
  const [editBldView, setEditBldView] = useState<'exterior' | 'interior'>('exterior');

  // 剧本创建模态框
  const {
    isOpen: isScriptCreateOpen,
    onOpen: onScriptCreateOpen,
    onOpenChange: onScriptCreateOpenChange,
  } = useDisclosure();
  const [scriptCreateTitle, setScriptCreateTitle] = useState('');
  const [scriptCreateContent, setScriptCreateContent] = useState('');
  const [scriptCreateTargetProjectId, setScriptCreateTargetProjectId] = useState<string>('');
  const [scriptCreating, setScriptCreating] = useState(false);

  // AI 剧本生成模态框
  const {
    isOpen: isScriptGenerateOpen,
    onOpen: onScriptGenerateOpen,
    onOpenChange: onScriptGenerateOpenChange,
  } = useDisclosure();

  // AI 生成角色模态框
  const {
    isOpen: isCharGenOpen,
    onOpen: onCharGenOpen,
    onOpenChange: onCharGenOpenChange,
  } = useDisclosure();

  // 白膜 workflow 轮询：完成后自动触发默认服装画风版
  const [pendingCharGen, setPendingCharGen] = useState<{ characterId: number; jobId: string } | null>(null);

  // 监听 TaskQueue 派发的"生成类任务完成"事件，自动刷新当前资产 Tab 数据
  // 事件由 components/TaskQueueBubble/useTaskQueue.ts 在检测到白名单 workflow_type 完成时派发
  useEffect(() => {
    let debounceTimer: ReturnType<typeof setTimeout> | null = null;
    const handleAssetTaskCompleted = () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        console.log('[AssetsManager] 检测到资产类任务完成，刷新数据');
        loadData();
      }, 500);
    };
    window.addEventListener('asset:taskCompleted', handleAssetTaskCompleted);
    return () => {
      window.removeEventListener('asset:taskCompleted', handleAssetTaskCompleted);
      if (debounceTimer) clearTimeout(debounceTimer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, projectFilter]);

  // 服装 Tab 生成状态轮询：有 generating 状态的服装时，每 5 秒刷新一次
  useEffect(() => {
    if (activeTab !== 'costumes') return;
    const hasGenerating = costumes.some(c => c.generation_status === 'generating');
    if (!hasGenerating) return;
    const interval = setInterval(() => {
      console.log('[AssetsManager] 服装生成中，轮询刷新');
      loadData();
    }, 5000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, costumes]);

  useWorkflow(pendingCharGen?.jobId || null, {
    onCompleted: async (completedJob) => {
      const ctx = pendingCharGen;
      if (!ctx) return;
      try {
        await consumeWorkflow(completedJob.id);
      } catch (e) {
        console.warn('[AssetsManager] 白膜 workflow 标记消费失败:', e);
      }
      try {
        await generateDefaultCostumeState(ctx.characterId, {
          imageModel: selectedImageModel || undefined,
          textModel: selectedTextModel || undefined,
        });
        showToast('白膜生成完成，正在生成默认服装画风版…', 'success');
        loadData();
      } catch (e: any) {
        console.error('[AssetsManager] 启动默认服装画风版失败:', e);
        showToast(e?.message || '启动默认服装画风版失败', 'error');
      } finally {
        setPendingCharGen(null);
      }
    },
    onFailed: async (failedJob) => {
      try {
        await consumeWorkflow(failedJob.id);
      } catch (e) {
        console.warn('[AssetsManager] 白膜 workflow 标记消费失败:', e);
      }
      showToast('角色白膜生成失败，请重试', 'error');
      setPendingCharGen(null);
    },
  });

  // ── AI 助手上下文注册：资产管理侧 ─────────────────────────────
  const handleAIAction = useCallback((action: string, params: any) => {
    const toastOk = (m: string) => showToast(m, 'success');
    const toastErr = (prefix: string) => (e: any) => showToast(prefix + ': ' + (e?.message || e), 'error');
    const ensureProject = () => {
      const pid = projectFilter !== 'all' && projectFilter !== 'unused' ? Number(projectFilter) : currentProject?.id || null;
      if (!pid) { showToast('未选择项目', 'warning'); return null; }
      return pid;
    };

    // ── 白膌三视图生成（作用于角色的「白膌状态」而非角色本体）──
    if (action === 'generate_base_model') {
      const id = Number(params?.characterId); if (!id) { showToast('缺少 characterId', 'warning'); return; }
      // 查找该角色的白膌状态，对状态集合中的 base_model state 生成三视图
      fetchCharacterStates(id)
        .then((states) => {
          const baseState = states.find((s) => s.is_base_model);
          if (!baseState || !baseState.id) {
            // 无白膌状态 → 降级为旧接口（导致 character 字段直生）
            return generateCharacterViews(id, {
              imageModel: params?.imageModel || selectedImageModel || undefined,
              textModel: params?.textModel || selectedTextModel || undefined,
            } as any).then((res) => {
              toastOk('白膌三视图生成已启动');
              if (res?.jobId) setPendingCharGen({ characterId: id, jobId: res.jobId });
            });
          }
          return generateCharacterStateViews(id, baseState.id, {
            imageModel: params?.imageModel || selectedImageModel,
            textModel: params?.textModel || selectedTextModel || undefined,
          }).then(() => {
            toastOk('白膌状态三视图生成已启动');
            loadData();
          });
        })
        .catch(toastErr('生成失败'));
    }
    // ── 角色状态三视图生成 ──
    else if (action === 'generate_state_views') {
      const charId = Number(params?.characterId); const stateId = Number(params?.stateId);
      if (!charId || !stateId) { showToast('缺少 characterId 或 stateId', 'warning'); return; }
      generateCharacterStateViews(charId, stateId, {
        imageModel: params?.imageModel || selectedImageModel,
        textModel: params?.textModel || selectedTextModel || undefined,
      })
        .then(() => { toastOk('状态三视图生成已启动'); loadData(); })
        .catch(toastErr('状态三视图生成失败'));
    }
    // ── 创建角色状态 ──
    else if (action === 'create_state') {
      const charId = Number(params?.characterId); if (!charId) { showToast('缺少 characterId', 'warning'); return; }
      createCharacterState(charId, {
        name: params?.name || '新状态',
        description: params?.description,
        state_category: params?.state_category || 'daily',
        outfit: params?.outfit,
        age_stage: params?.age_stage,
        hairstyle: params?.hairstyle,
      } as any)
        .then(() => { toastOk('角色状态已创建'); loadData(); })
        .catch(toastErr('创建状态失败'));
    }
    // ── 角色 CRUD ──
    else if (action === 'create_character') {
      const pid = ensureProject(); if (!pid) return;
      createCharacter({ projectId: pid, name: String(params?.name || '新角色'), description: params?.description, base_appearance: params?.base_appearance } as any)
        .then(c => { toastOk(`已创建角色「${c.name}」`); loadData(); })
        .catch(toastErr('创建角色失败'));
    } else if (action === 'update_character') {
      const id = Number(params?.characterId); if (!id) { showToast('缺少 characterId', 'warning'); return; }
      updateCharacter(id, params?.fields || {})
        .then(() => { toastOk('角色已更新'); loadData(); })
        .catch(toastErr('更新角色失败'));
    } else if (action === 'delete_character') {
      const id = Number(params?.characterId); if (!id) { showToast('缺少 characterId', 'warning'); return; }
      deleteCharacter(id)
        .then(() => { toastOk('角色已删除'); loadData(); })
        .catch(toastErr('删除角色失败'));
    }
    // ── 场景 CRUD ──
    else if (action === 'create_location') {
      const pid = ensureProject(); if (!pid) return;
      createScene({ project_id: pid, name: String(params?.name || '新影棚'), description: params?.description } as any)
        .then(s => { toastOk(`已创建影棚「${s.name}」`); loadData(); })
        .catch(toastErr('创建影棚失败'));
    } else if (action === 'update_location') {
      const id = Number(params?.locationId); if (!id) { showToast('缺少 locationId', 'warning'); return; }
      updateScene(id, params?.fields || {})
        .then(() => { toastOk('影棚已更新'); loadData(); })
        .catch(toastErr('更新影棚失败'));
    } else if (action === 'delete_location') {
      const id = Number(params?.locationId); if (!id) { showToast('缺少 locationId', 'warning'); return; }
      deleteScene(id)
        .then(() => { toastOk('影棚已删除'); loadData(); })
        .catch(toastErr('删除影棚失败'));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectFilter, currentProject, selectedImageModel, selectedTextModel, showToast]);

  // 注册角色/场景/onAction 到 AI 助手全局上下文
  const aiCharacters = useMemo(() =>
    characters.map(c => ({ id: c.id, name: c.name, description: (c as any).base_appearance || c.description })),
    [characters]
  );
  const aiLocations = useMemo(() =>
    scenes.map(s => ({ id: s.id, name: s.name, description: s.description })),
    [scenes]
  );
  useAIAssistantWorkbenchContext({
    characters: aiCharacters,
    locations: aiLocations,
    onAction: handleAIAction,
  });

  const [formData, setFormData] = useState<any>({
    name: '',
    description: '',
    appearance: '',
    personality: '',
    environment: '',
    lighting: '',
    mood: '',
    category: '',
    image_url: '',
    tags: '',
    tag_groups_json: null
  });

  // 挂载 & 切换项目筛选时：并发加载所有资源（保证 Tab 徽标首次渲染就正确）
  useEffect(() => {
    loadAllData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectFilter]);

  // 切换当前 Tab 时：只刷当前 tab 一种资源（保持数据新鲜），跳过首次挂载避免与 loadAllData 重复
  const didMountRef = React.useRef(false);
  useEffect(() => {
    if (!didMountRef.current) {
      didMountRef.current = true;
      return;
    }
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab]);

  useEffect(() => {
    loadTagGroups();
  }, []);

  // 加载 AI 模型列表
  useEffect(() => {
    const loadAiModels = async () => {
      try {
        const token = getAuthToken();
        const res = await fetch('/api/ai-models', {
          headers: token ? { Authorization: `Bearer ${token}` } : {}
        });
        if (res.ok) {
          const data = await res.json();
          const models = data.models || [];
          setAiModels(models);
          // 设置默认模型
          const imageModel = models.find((m: AIModel) => (m.type || m.category)?.toUpperCase() === 'IMAGE');
          const textModel = models.find((m: AIModel) => (m.type || m.category)?.toUpperCase() === 'TEXT');
          if (imageModel) setSelectedImageModel(imageModel.name);
          if (textModel) setSelectedTextModel(textModel.name);
        }
      } catch (err) {
        console.error('[加载 AI 模型失败]:', err);
      }
    };
    loadAiModels();
  }, []);

  // 场景图片生成轮询
  const { isGenerating } = useSceneImageGeneration({
    sceneId: selectedScene?.id?.toString() || null,
    projectId: null,
    isActive: false,
    onComplete: () => {
      loadData();
    }
  });

  const loadTagGroups = async () => {
    try {
      const data = await fetchTagGroups();
      setTagGroups(data);
    } catch (error) {
      console.error('加载标签分组失败:', error);
    }
  };

  const loadData = async () => {
    setLoading(true);
    try {
      const filterProjectId = projectFilter !== 'all' && projectFilter !== 'unused' ? Number(projectFilter) : null;

      if (activeTab === 'characters') {
        // 指定项目时用项目级API（支持团队），否则加载全部
        const data = filterProjectId
          ? await fetchCharactersByProject(filterProjectId)
          : await fetchCharacters();
        setCharacters(data);
      } else if (activeTab === 'scripts') {
        // 剧本资源库：支持项目筛选
        const all = await fetchScriptLibrary('all');
        const filtered = filterProjectId
          ? all.filter((s) => s.project_id === filterProjectId)
          : projectFilter === 'unused'
            ? all.filter((s) => s.project_id == null)
            : all;
        setScripts(filtered);
      } else if (activeTab === 'studios') {
        const { listStudios } = await import('../../services/studios');
        const data = await listStudios(filterProjectId || undefined);
        setStudios(data);
      } else if (activeTab === 'costumes') {
        // 服装支持全部项目/未使用素材筛选，空项目时不筛选项目
        const data = await fetchCostumes(filterProjectId || null);
        setCostumes(data);
      } else if (activeTab === 'environments') {
        const data = await listEnvironments(filterProjectId || undefined);
        setEnvironments(data);
      } else if (activeTab === 'buildings') {
        const data = await listBuildings(filterProjectId || undefined);
        setBuildings(data);
      } else {
        const { props: propsData, heldPropsRefs: refsData } = await fetchProps();
        setProps(propsData);
        setHeldPropsRefs(refsData);
      }
    } catch (error) {
      console.error('加载数据失败:', error);
    } finally {
      setLoading(false);
    }
  };

  /**
   * 并发加载所有资源类型。
   * 用于：组件挂载 / 切换项目筛选时 —— 保证 Tab 徽标 (角色(2)/道具(0)/...) 在首次渲染时就正确。
   * 单个资源拉取失败不影响其他资源，使用 allSettled。
   */
  const loadAllData = async () => {
    setLoading(true);
    try {
      const filterProjectId = projectFilter !== 'all' && projectFilter !== 'unused' ? Number(projectFilter) : null;
      const studiosService = import('../../services/studios');
      const results = await Promise.allSettled([
        filterProjectId ? fetchCharactersByProject(filterProjectId) : fetchCharacters(),
        fetchScriptLibrary('all'),
        studiosService.then(({ listStudios }) => listStudios(filterProjectId || undefined)),
        fetchCostumes(filterProjectId || null),
        listEnvironments(filterProjectId || undefined),
        listBuildings(filterProjectId || undefined),
        fetchProps(),
      ]);
      if (results[0].status === 'fulfilled') setCharacters(results[0].value as Character[]);
      if (results[1].status === 'fulfilled') {
        const all = results[1].value as ScriptLibraryItem[];
        const filtered = filterProjectId
          ? all.filter((s) => s.project_id === filterProjectId)
          : projectFilter === 'unused'
            ? all.filter((s) => s.project_id == null)
            : all;
        setScripts(filtered);
      }
      if (results[2].status === 'fulfilled') setStudios(results[2].value as import('../../services/studios').Studio[]);
      if (results[3].status === 'fulfilled') setCostumes(results[3].value as Costume[]);
      if (results[4].status === 'fulfilled') setEnvironments(results[4].value as Environment[]);
      if (results[5].status === 'fulfilled') setBuildings(results[5].value as Building[]);
      if (results[6].status === 'fulfilled') {
        const propsResult = results[6].value as { props: Prop[]; heldPropsRefs: HeldPropsRef[] };
        setProps(propsResult.props);
        setHeldPropsRefs(propsResult.heldPropsRefs);
      }
      results.forEach((r, idx) => {
        if (r.status === 'rejected') {
          console.error(`[AssetsManager] 资源加载失败 idx=${idx}:`, r.reason);
        }
      });
    } finally {
      setLoading(false);
    }
  };

  const getTabLabel = () => {
    switch (activeTab) {
      case 'characters': return t.assetsManager.tabs.characters;
      case 'studios': return t.assetsManager.tabs.studios;
      case 'props': return t.assetsManager.tabs.props;
      case 'costumes': return t.assetsManager.tabs.costumes;
      case 'scripts': return t.assetsManager.tabs.scripts;
      case 'environments': return t.assetsManager.tabs.environments;
      case 'buildings': return t.assetsManager.tabs.buildings;
    }
  };

  const handleAdd = () => {
    // 影棚 Tab：走独立的 StudioModal
    if (activeTab === 'studios') {
      setStudioEditMode(false);
      setEditingStudioId(null);
      onStudioOpen();
      return;
    }

    // 环境 Tab
    if (activeTab === 'environments') {
      setEnvEditMode(false);
      setEditingEnvId(null);
      const defaultProjectId = (projectFilter !== 'all' && projectFilter !== 'unused') ? Number(projectFilter) : undefined;
      setEnvForm({
        name: '',
        description: '',
        timeOfDay: '',
        weather: '',
        lighting: '',
        mood: '',
        terrainType: '',
        project_id: defaultProjectId,
      });
      onEnvOpen();
      return;
    }

    // 建筑 Tab
    if (activeTab === 'buildings') {
      setBldEditMode(false);
      setEditingBldId(null);
      const defaultProjectId = (projectFilter !== 'all' && projectFilter !== 'unused') ? Number(projectFilter) : undefined;
      setBldForm({
        name: '',
        description: '',
        interiorExterior: 'both',
        structureType: '',
        project_id: defaultProjectId,
      });
      onBldOpen();
      return;
    }

    // 剧本 Tab：走独立的创建弹窗（内容只需 title + content）
    if (activeTab === 'scripts') {
      setScriptCreateTitle('');
      setScriptCreateContent('');
      // 默认归属：若已选项目则带入，否则"个人剧本库"
      const defaultTarget = projectFilter !== 'all' && projectFilter !== 'unused'
        ? String(projectFilter)
        : '';
      setScriptCreateTargetProjectId(defaultTarget);
      onScriptCreateOpen();
      return;
    }

    setEditMode(false);
    setCurrentId(null);
    // 默认项目：如果当前筛选器选中了具体项目，自动填充
    const defaultProjectId = (projectFilter !== 'all' && projectFilter !== 'unused') ? Number(projectFilter) : undefined;
    setFormData({
      name: '',
      description: '',
      appearance: '',
      personality: '',
      environment: '',
      lighting: '',
      mood: '',
      category: '',
      image_url: '',
      tags: '',
      tag_groups_json: null,
      project_id: defaultProjectId
    });
    onOpen();
  };

  const handleEdit = (item: Character | Scene | Prop, type?: string) => {
    // 根据当前活跃标签页推断类型（如果未显式传入）
    let assetType = type;
    if (!assetType) {
      if (activeTab === 'characters') assetType = 'character';
      else if (activeTab === 'studios') assetType = 'scene';
      else if (activeTab === 'props') assetType = 'prop';
    }
    if (!assetType) return;

    // 将资产信息存入 sessionStorage，导航到工作台后自动打开编辑标签页
    sessionStorage.setItem('pendingAssetEdit', JSON.stringify({
      assetType,
      assetId: item.id,
      assetName: item.name,
      initialData: item,
    }));

    // 导航到工作台页面（优先使用当前项目对应的 storyboard）
    const projectId = (item as any).project_id || currentProject?.id;
    if (projectId) {
      navigate(`/storyboard?projectId=${projectId}`);
    } else {
      navigate('/storyboard');
    }
  };

  const handleEditStudio = (studio: import('../../services/studios').Studio) => {
    window.dispatchEvent(new CustomEvent('openAssetEditTab', {
      detail: {
        assetType: 'studio',
        assetId: studio.id,
        assetName: studio.name,
        initialData: studio,
      }
    }));
  };

  const handleEditEnvironment = (env: Environment) => {
    window.dispatchEvent(new CustomEvent('openAssetEditTab', {
      detail: {
        assetType: 'environment',
        assetId: env.id,
        assetName: env.name,
        initialData: {
          id: env.id,
          name: env.name,
          description: env.description || '',
          timeOfDay: env.time_of_day || '',
          weather: env.weather || '',
          lighting: env.lighting || '',
          mood: env.mood || '',
          terrainType: env.terrain_type || '',
          project_id: env.project_id,
          image_url: env.image_url,
          image_back_url: env.image_back_url,
          generation_status: env.generation_status,
        },
      }
    }));
  };

  const handleGenerateEnvImage = async (env: Environment, mode: 'front' | 'back' | 'both' = 'both') => {
    if (!selectedImageModel) {
      showToast('请先在 AI 模型配置中选择图像模型', 'error');
      return;
    }
    try {
      await generateEnvironmentImage(env.id, {
        imageModel: selectedImageModel,
        textModel: selectedTextModel || undefined,
        mode,
      });
      const label = mode === 'front' ? '正面图' : mode === 'back' ? '背面图' : '环境图';
      showToast(`${label}生成已启动`, 'success');
      loadData();
    } catch (err: any) {
      showToast(err?.message || '启动环境图生成失败', 'error');
    }
  };

  // 更新环境数据（地貌识别后刷新本地状态）
  const handleUpdateEnvironment = (updatedEnv: Environment) => {
    setEnvironments((prev) =>
      prev.map((e) => (e.id === updatedEnv.id ? updatedEnv : e))
    );
  };

  const [sanitizingEnvs, setSanitizingEnvs] = useState(false);
  const handleSanitizeEnvDescriptions = async () => {
    const pid = projectFilter !== 'all' && projectFilter !== 'unused' ? Number(projectFilter) : null;
    if (!pid) {
      showToast('请先在左侧选择具体项目', 'error');
      return;
    }
    setSanitizingEnvs(true);
    try {
      const result = await sanitizeEnvironmentDescriptions(pid);
      if (result.changed > 0) {
        showToast(`已清洗 ${result.changed}/${result.total} 条环境描述`, 'success');
      } else {
        showToast('所有环境描述均已为纯自然场景描述', 'success');
      }
      await loadData();
    } catch (err: any) {
      showToast(err?.message || '清洗环境描述失败', 'error');
    } finally {
      setSanitizingEnvs(false);
    }
  };

  const handleEditBuilding = (b: Building) => {
    window.dispatchEvent(new CustomEvent('openAssetEditTab', {
      detail: {
        assetType: 'building',
        assetId: b.id,
        assetName: b.name,
        initialData: {
          id: b.id,
          name: b.name,
          description: b.description || '',
          interiorExterior: b.interior_exterior || 'both',
          structureType: b.structure_type || '',
          project_id: b.project_id,
          exterior_image_url: b.exterior_image_url,
          interior_image_url: b.interior_image_url,
          generation_status: b.generation_status,
        },
      }
    }));
  };

  const handleGenerateBuildingImage = async (b: Building, viewType: 'interior' | 'exterior' | 'both' = 'both') => {
    if (!selectedImageModel) {
      showToast('请先在 AI 模型配置中选择图像模型', 'error');
      return;
    }
    // 建筑天然都有室内室外两面，不再基于 b.interior_exterior 收敛 viewType —— 用户显式点哪个就生成哪个
    try {
      await generateBuildingImage(b.id, {
        imageModel: selectedImageModel,
        textModel: selectedTextModel || undefined,
        viewType,
      });
      const label =
        viewType === 'interior'
          ? '内景九宫格图（6视角+3特写）'
          : viewType === 'exterior'
            ? '外景四方位图'
            : '建筑图（外景四方位+内景九宫格）';
      showToast(`${label}生成已启动`, 'success');
      loadData();
    } catch (err: any) {
      showToast(err?.message || '建筑设定图生成失败', 'error');
    }
  };

  const handleDeleteBuildingImage = async (id: number) => {
    try {
      await deleteBuildingImage(id);
      showToast('设定图已删除', 'success');
      loadData();
    } catch (err: any) {
      showToast(err?.message || '删除设定图失败', 'error');
    }
  };

  // 刷新当前编辑的角色数据
  const handleRefreshCharacter = useCallback(async () => {
    if (!currentId) return;
    try {
      const updatedCharacters = await fetchCharacters();
      setCharacters(updatedCharacters);
      const updatedChar = updatedCharacters.find(c => c.id === currentId);
      if (updatedChar) {
        setFormData(updatedChar);
      }
    } catch (error) {
      console.error('刷新角色数据失败:', error);
    }
  }, [currentId]);

  // 获取当前筛选器对应的项目ID（用于创建资源）
  const getActiveProjectId = (): number | null => {
    if (projectFilter !== 'all' && projectFilter !== 'unused') {
      return Number(projectFilter);
    }
    return currentProject?.id || null;
  };

  const handleSave = async () => {
    // 优先使用表单中用户选择的项目，其次使用筛选器/上下文推断
    const activeProjectId = formData.project_id || getActiveProjectId();
  
    // 创建时非"未使用素材"模式下需要项目ID
    if (!editMode && !activeProjectId && projectFilter !== 'unused') {
      showToast('请先选择一个所属项目', 'error');
      return;
    }
  
    try {
      if (activeTab === 'characters') {
        if (editMode && currentId) {
          await updateCharacter(currentId, formData);
        } else {
          const newChar = await createCharacter({ ...formData, projectId: activeProjectId || undefined });
          // 创建成功后自动切换到编辑模式，以便用户立即生成三视图
          if (newChar && newChar.id) {
            await loadData();
            setEditMode(true);
            setCurrentId(newChar.id);
            setFormData(newChar);
            showToast('角色创建成功，现在可以生成三视图', 'success');
            return; // 不关闭弹窗
          }
        }
      } else {
        if (editMode && currentId) {
          await updateProp(currentId, formData);
        } else {
          await createProp({ ...formData, project_id: activeProjectId || undefined } as any);
        }
      }
      await loadData();
      onOpenChange();
    } catch (error: any) {
      console.error('资源保存失败:', error);
      showToast('保存失败，请稍后重试', 'error');
    }
  };
  
  const handleSaveEnvironment = async () => {
    const activeProjectId = envForm.project_id || getActiveProjectId();
    if (!envEditMode && !activeProjectId && projectFilter !== 'unused') {
      showToast('请先选择一个所属项目', 'error');
      return;
    }
    if (!envForm.name.trim()) {
      showToast('环境名称不能为空', 'error');
      return;
    }
    try {
      if (envEditMode && editingEnvId) {
        await updateEnvironment(editingEnvId, {
          name: envForm.name,
          description: envForm.description || null,
          timeOfDay: envForm.timeOfDay || null,
          weather: envForm.weather || null,
          lighting: envForm.lighting || null,
          mood: envForm.mood || null,
          terrainType: envForm.terrainType || null,
        });
      } else {
        await createEnvironment({
          projectId: activeProjectId || 0,
          name: envForm.name,
          description: envForm.description,
          timeOfDay: envForm.timeOfDay,
          weather: envForm.weather,
          lighting: envForm.lighting,
          mood: envForm.mood,
        });
      }
      await loadData();
      onEnvOpenChange();
      showToast(envEditMode ? '环境更新成功' : '环境创建成功', 'success');
    } catch (error: any) {
      console.error('环境保存失败:', error);
      showToast('保存失败，请稍后重试', 'error');
    }
  };
  
  const handleSaveBuilding = async () => {
    const activeProjectId = bldForm.project_id || getActiveProjectId();
    if (!bldEditMode && !activeProjectId && projectFilter !== 'unused') {
      showToast('请先选择一个所属项目', 'error');
      return;
    }
    if (!bldForm.name.trim()) {
      showToast('建筑名称不能为空', 'error');
      return;
    }
    try {
      if (bldEditMode && editingBldId) {
        await updateBuilding(editingBldId, {
          name: bldForm.name,
          description: bldForm.description || null,
          interiorExterior: bldForm.interiorExterior,
          structureType: bldForm.structureType || null,
        });
      } else {
        await createBuilding({
          projectId: activeProjectId || 0,
          name: bldForm.name,
          description: bldForm.description,
          interiorExterior: bldForm.interiorExterior,
          structureType: bldForm.structureType,
        });
      }
      await loadData();
      onBldOpenChange();
      showToast(bldEditMode ? '建筑更新成功' : '建筑创建成功', 'success');
    } catch (error: any) {
      console.error('建筑保存失败:', error);
      showToast('保存失败，请稍后重试', 'error');
    }
  };

  const handleDelete = async (id: number) => {
    const confirmed = await confirm({
      title: '删除确认',
      message: '确定要删除吗？',
      type: 'danger',
      confirmText: '删除'
    });
    if (!confirmed) return;
    
    try {
      if (activeTab === 'characters') {
        await deleteCharacter(id);
      } else if (activeTab === 'scripts') {
        await deleteScriptApi(id);
      } else if (activeTab === 'studios') {
        const { deleteStudio } = await import('../../services/studios');
        await deleteStudio(id);
      } else if (activeTab === 'costumes') {
        await deleteCostumeApi(id);
      } else if (activeTab === 'environments') {
        await deleteEnvironment(id);
      } else if (activeTab === 'buildings') {
        await deleteBuilding(id);
      } else {
        await deleteProp(id);
      }
      await loadData();
    } catch (error: any) {
      console.error('资源删除失败:', error);
      showToast('删除失败，请稍后重试', 'error');
    }
  };

  const handleViewSceneDetail = (scene: Scene) => {
    setSelectedScene(scene);
    onDetailOpen();
  };

  const handleGenerateSceneImage = async (sceneId: number, styleOrImageModel: string, imageModelOrOptions?: string | { customPromptA?: string; customPromptB?: string }) => {
    try {
      // 兼容两种调用方式：
      // 1. 旧方式 (sceneId, style, imageModel)
      // 2. 新方式 (sceneId, imageModel, { customPromptA, customPromptB })
      let imageModel = '';
      let style = '';
      let customPromptA: string | undefined;
      let customPromptB: string | undefined;

      if (typeof imageModelOrOptions === 'object') {
        imageModel = styleOrImageModel;
        customPromptA = imageModelOrOptions.customPromptA;
        customPromptB = imageModelOrOptions.customPromptB;
      } else {
        style = styleOrImageModel;
        imageModel = imageModelOrOptions || '';
      }

      const token = getAuthToken();
      const res = await fetch(`/api/scenes/${sceneId}/generate-image`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ 
          style, 
          imageModel, 
          width: 1024, 
          height: 576,
          customPromptA,
          customPromptB
        })
      });
      
      if (!res.ok) {
        throw new Error('启动生成失败');
      }
      
      const data = await res.json();
      console.log('[AssetsManager] 场景图片生成已启动:', data.jobId);
    } catch (error: any) {
      console.error('[AssetsManager] 生成场景图片失败:', error);
      showToast('生成影棚图片失败，请稍后重试', 'error');
      throw error;
    }
  };

  // 切换分组展开状态
  const toggleGroupExpand = (groupId: number) => {
    setExpandedGroups(prev => {
      const newSet = new Set(prev);
      if (newSet.has(groupId)) {
        newSet.delete(groupId);
      } else {
        newSet.add(groupId);
      }
      return newSet;
    });
  };

  // 从角色的 tag_groups_json 中提取分组下的所有标签
  const getGroupedTags = () => {
    const groupedTags: Record<number, { groupName: string; color: string; tags: Set<string> }> = {};
    
    characters.forEach(c => {
      if (c.tag_groups_json) {
        c.tag_groups_json.forEach(entry => {
          if (!groupedTags[entry.groupId]) {
            const group = tagGroups.find(g => g.id === entry.groupId);
            groupedTags[entry.groupId] = {
              groupName: entry.groupName,
              color: group?.color || '#6366f1',
              tags: new Set()
            };
          }
          entry.tags.forEach(tag => groupedTags[entry.groupId].tags.add(tag));
        });
      }
    });

    return groupedTags;
  };

  // 提取所有普通标签（去重并统计出现次数）
  const allTags = React.useMemo(() => {
    const tagCount: Record<string, number> = {};
    const extractTags = (tagStr?: string) => {
      if (!tagStr) return;
      tagStr.split(',').map(t => t.trim()).filter(Boolean).forEach(t => {
        tagCount[t] = (tagCount[t] || 0) + 1;
      });
    };
    if (activeTab === 'characters') characters.forEach(c => extractTags(c.tags));
    else props.forEach(p => extractTags(p.tags));
    return Object.entries(tagCount)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 30);
  }, [characters, scenes, props, activeTab]);

  const groupedTags = React.useMemo(() => getGroupedTags(), [characters, tagGroups]);

  // 匹配分组标签筛选
  const matchesGroupFilter = (character: Character) => {
    if (!activeGroupFilter) return true;
    if (!character.tag_groups_json) return false;
    
    const entry = character.tag_groups_json.find(e => e.groupId === activeGroupFilter.groupId);
    return entry ? entry.tags.includes(activeGroupFilter.tag) : false;
  };

  const matchesTag = (tags?: string) => {
    if (!activeTag) return true;
    if (!tags) return false;
    return tags.split(',').map(t => t.trim()).includes(activeTag);
  };

  const filteredCharacters = characters.filter(c => {
    // 项目筛选（“未使用素材”过滤无项目的资源）
    if (projectFilter === 'unused' && c.project_id) return false;
    // 分组筛选
    if (activeGroupFilter && !matchesGroupFilter(c)) return false;
    // 普通标签筛选
    if (!matchesTag(c.tags)) return false;
    // 搜索
    const q = searchQuery.toLowerCase();
    return (c.name || '').toLowerCase().includes(q) ||
      (c.description || '').toLowerCase().includes(q) ||
      (c.tags && c.tags.toLowerCase().includes(q)) ||
      (c.project_name && c.project_name.toLowerCase().includes(q));
  });

  const filteredScenes = scenes.filter(s => {
    if (projectFilter === 'unused' && s.project_id) return false;
    if (!matchesTag(s.tags)) return false;
    const q = searchQuery.toLowerCase();
    return (s.name || '').toLowerCase().includes(q) ||
      (s.description || '').toLowerCase().includes(q) ||
      (s.tags && s.tags.toLowerCase().includes(q)) ||
      (s.project_name && s.project_name.toLowerCase().includes(q));
  });

  const filteredProps = props.filter(p => {
    if (projectFilter === 'unused' && (p as any).project_id) return false;
    if (!matchesTag(p.tags)) return false;
    const q = searchQuery.toLowerCase();
    return (p.name || '').toLowerCase().includes(q) ||
      (p.description || '').toLowerCase().includes(q) ||
      (p.tags && p.tags.toLowerCase().includes(q));
  });

  const filteredStudios = studios.filter((s) => {
    const q = searchQuery.toLowerCase();
    if (!q) return true;
    return (
      (s.name || '').toLowerCase().includes(q) ||
      (s.description || '').toLowerCase().includes(q)
    );
  });

  const filteredCostumes = costumes.filter((c) => {
    const q = searchQuery.toLowerCase();
    if (!q) return true;
    return (
      (c.name || '').toLowerCase().includes(q) ||
      (c.description || '').toLowerCase().includes(q) ||
      (c.category || '').toLowerCase().includes(q) ||
      (c.tags || '').toLowerCase().includes(q)
    );
  });

  const filteredScripts = scripts.filter((s) => {
    const q = searchQuery.toLowerCase();
    if (!q) return true;
    return (
      (s.title || '').toLowerCase().includes(q) ||
      (s.content || '').toLowerCase().includes(q) ||
      (String(s.episode_number || '')).includes(q)
    );
  });

  // 建筑关键词过滤：环境名中不得包含建筑词
  const BUILDING_KEYWORDS = ['屋', '房', '室', '厅', '楼', '阁', '桥', '亭', '塔', '殿', '榭', '廊', '庙', '堡', '窑', '棚', '舍', '坞', '巢'];
  const cleanEnvironments = environments.filter((e) => {
    const name = (e.name || '').replace(/[_\-]/g, '');
    return !BUILDING_KEYWORDS.some(kw => name.includes(kw));
  });

  const filteredEnvironments = cleanEnvironments.filter((e) => {
    const q = searchQuery.toLowerCase();
    if (!q) return true;
    return (
      (e.name || '').toLowerCase().includes(q) ||
      (e.description || '').toLowerCase().includes(q) ||
      (e.weather || '').toLowerCase().includes(q) ||
      (e.time_of_day || '').toLowerCase().includes(q)
    );
  });

  const filteredBuildings = buildings.filter((b) => {
    const q = searchQuery.toLowerCase();
    if (!q) return true;
    return (
      (b.name || '').toLowerCase().includes(q) ||
      (b.description || '').toLowerCase().includes(q) ||
      (b.structure_type || '').toLowerCase().includes(q)
    );
  });

  // 剧本创建提交
  const handleScriptCreateSubmit = async () => {
    if (!scriptCreateContent.trim()) {
      showToast('请填写剧本内容', 'warning');
      return;
    }
    setScriptCreating(true);
    try {
      const projectId = scriptCreateTargetProjectId ? Number(scriptCreateTargetProjectId) : null;
      await createScriptApi({
        projectId,
        title: scriptCreateTitle.trim() || undefined,
        content: scriptCreateContent,
      });
      showToast(projectId ? '剧本已保存到项目' : '已保存到个人剧本库', 'success');
      onScriptCreateOpenChange();
      await loadData();
    } catch (err: any) {
      console.error('[ScriptCreate]', err);
      showToast(err?.message || '创建剧本失败', 'error');
    } finally {
      setScriptCreating(false);
    }
  };

  // 剧本绑定提交
  const handleScriptBind = async (payload: {
    sourceScriptId: number;
    targetProjectId: number;
    titleOverride?: string;
    bindAll?: boolean;
    siblingIds?: number[];
  }) => {
    try {
      const res = await bindScriptToProject(payload as any);
      showToast(res.message || '已绑定到项目', 'success');
      await loadData();
    } catch (err: any) {
      console.error('[ScriptBind]', err);
      showToast(err?.message || '绑定失败', 'error');
      throw err;
    }
  };

  // 剧本批量删除（整组）
  const handleScriptDeleteGroup = async (ids: number[]) => {
    const confirmed = await confirm({
      title: '删除整组剧本',
      message: `确定要删除该剧本的全部 ${ids.length} 集吗？此操作不可撤销。`,
      type: 'danger',
      confirmText: '删除全部'
    });
    if (!confirmed) return;
    try {
      await Promise.all(ids.map(id => deleteScriptApi(id)));
      showToast('已删除整组剧本', 'success');
      await loadData();
    } catch (err: any) {
      console.error('[ScriptDeleteGroup]', err);
      showToast(err?.message || '删除失败', 'error');
    }
  };

  // 添加集数（个人剧本组内）
  const handleScriptCreateEpisode = async (title: string, projectId: number | null, episodeNumber: number) => {
    try {
      await createScriptApi({
        projectId,
        title,
        content: '',
        episodeNumber,
      });
      showToast(`已添加第${episodeNumber}集`, 'success');
      await loadData();
    } catch (err: any) {
      console.error('[ScriptCreateEpisode]', err);
      showToast(err?.message || '添加集数失败', 'error');
    }
  };

  return (
    <div className="h-full bg-(--bg-app) flex">
      {/* 左侧边栏 - 项目快速切换 */}
      <ProjectSidebar
        projects={userProjects}
        selectedProject={projectFilter}
        activeTab={activeTab}
        onSelectProject={setProjectFilter}
        onOpenProject={(pid) => navigate(`/projects/${pid}`)}
        onSelectResourceType={(pid, tab) => {
          setProjectFilter(pid);
          setActiveTab(tab as TabType);
        }}
        onSelectAsset={(tabType, asset) => {
          const pid = String(asset.project_id || projectFilter);
          setProjectFilter(pid);
          setActiveTab(tabType as TabType);
        }}
        onEditAsset={(tabType, asset) => {
          const pid = String(asset.project_id || projectFilter);
          setProjectFilter(pid);
          setActiveTab(tabType as TabType);
          // 影棚走 StudioModal
          if (tabType === 'studios') {
            setStudioEditMode(true);
            setEditingStudioId(asset.id);
            onStudioOpen();
            return;
          }
          // 剧本走独立创建弹窗（编辑模式）
          if (tabType === 'scripts') {
            setScriptCreateTitle(asset.title || '');
            setScriptCreateContent(asset.content || '');
            setScriptCreateTargetProjectId(String(asset.project_id || ''));
            onScriptCreateOpen();
            return;
          }
          // 角色/道具/服装走通用弹窗
          setEditMode(true);
          setCurrentId(asset.id);
          setFormData(asset);
          onOpen();
        }}
      />

      {/* 主内容区 */}
      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-7xl mx-auto space-y-6">
        {/* 头部 */}
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold pro-title">{t.assetsManager.title}</h1>
          <div className="flex gap-2">
            {activeTab === 'characters' && (
              <>
                <Button
                  variant="flat"
                  className="pro-btn bg-violet-500/10 text-violet-500 hover:bg-violet-500/20"
                  startContent={<Sparkles className="w-4 h-4" />}
                  onPress={() => {
                    const pid = projectFilter !== 'all' && projectFilter !== 'unused' ? Number(projectFilter) : null;
                    if (!pid) {
                      showToast(t.assetsManager.toasts.selectProjectForAI, 'warning');
                      return;
                    }
                    onCharGenOpen();
                  }}
                >
                  {t.assetsManager.aiGenerateCharacter}
                </Button>
              </>
            )}
            {activeTab === 'scripts' && (
              <Button
                variant="flat"
                className="pro-btn bg-violet-500/10 text-violet-500 hover:bg-violet-500/20"
                startContent={<Sparkles className="w-4 h-4" />}
                onPress={onScriptGenerateOpen}
              >
                {t.assetsManager.aiGenerateScript}
              </Button>
            )}
            <Button
              className="pro-btn-primary"
              startContent={<Plus className="w-4 h-4" />}
              onPress={handleAdd}
            >
              {(t.assetsManager as any)[`new${activeTab.charAt(0).toUpperCase() + activeTab.slice(1)}`] || `New ${getTabLabel()}`}
            </Button>
          </div>
        </div>

        {/* 搜索栏 */}
        <Input
          placeholder={t.assetsManager.searchPlaceholder}
          value={searchQuery}
          onValueChange={setSearchQuery}
          startContent={<Search className="w-4 h-4 text-(--text-muted)" />}
          classNames={{
            input: "bg-transparent text-(--text-primary) placeholder:text-(--text-muted)",
            inputWrapper: "bg-(--bg-input) border border-(--border-color) hover:border-(--accent)/30 focus-within:border-(--accent)/50 shadow-sm transition-all"
          }}
          className="w-full"
        />

        {/* 分组标签筛选（仅角色Tab显示） */}
        {activeTab === 'characters' && Object.keys(groupedTags).length > 0 && (
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Tag className="w-3.5 h-3.5 text-(--text-muted)" />
              <span className="text-xs text-(--text-muted)">{t.assetsManager.groupFilter.title}</span>
              {activeGroupFilter && (
                <button
                  onClick={() => setActiveGroupFilter(null)}
                  className="px-2 py-0.5 rounded-full text-xs font-medium bg-(--danger)/15 text-(--danger) border border-(--danger)/30 hover:bg-(--danger)/25 transition-all"
                >
                  {t.assetsManager.groupFilter.clear}
                </button>
              )}
            </div>
            <div className="space-y-1">
              {Object.entries(groupedTags).map(([groupIdStr, { groupName, color, tags }]) => {
                const groupId = parseInt(groupIdStr);
                const isExpanded = expandedGroups.has(groupId);
                return (
                  <div key={groupId} className="space-y-1">
                    <button
                      onClick={() => toggleGroupExpand(groupId)}
                      className="flex items-center gap-2 text-sm text-(--text-secondary) hover:text-(--text-primary) transition-colors"
                    >
                      {isExpanded ? (
                        <ChevronDown className="w-3 h-3" />
                      ) : (
                        <ChevronRight className="w-3 h-3" />
                      )}
                      <span
                        className="w-3 h-3 rounded-full"
                        style={{ 
                          backgroundColor: color,
                          boxShadow: `0 0 0 2px ${color}30`,
                        }}
                      />
                      <span>{groupName}</span>
                      <span className="text-xs text-(--text-muted)">({tags.size})</span>
                    </button>
                    {isExpanded && (
                      <div className="flex flex-wrap gap-1.5 pl-6">
                        {Array.from(tags).map((tag) => {
                          const isActive = activeGroupFilter?.groupId === groupId && activeGroupFilter?.tag === tag;
                          return (
                            <button
                              key={tag}
                              onClick={() => setActiveGroupFilter(isActive ? null : { groupId, tag })}
                              className={`px-2.5 py-1 rounded-full text-xs font-medium transition-all ${
                                isActive
                                  ? 'shadow-sm'
                                  : 'hover:opacity-90'
                              }`}
                              style={{
                                backgroundColor: isActive ? `${color}35` : `${color}20`,
                                color: color,
                                border: `1.5px solid ${isActive ? color : `${color}45`}`,
                                boxShadow: isActive ? `0 2px 4px ${color}20` : 'none',
                              }}
                            >
                              {tag}
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* 普通标签过滤 */}
        {allTags.length > 0 && (
          <div className="flex items-center gap-2 flex-wrap">
            <Tag className="w-3.5 h-3.5 text-(--text-muted) shrink-0" />
            {activeTag && (
              <button
                onClick={() => setActiveTag(null)}
                className="px-2.5 py-1 rounded-full text-xs font-medium bg-(--danger)/15 text-(--danger) border border-(--danger)/30 hover:bg-(--danger)/25 transition-all"
              >
                清除筛选
              </button>
            )}
            {allTags.map(([tag, count]) => (
              <button
                key={tag}
                onClick={() => setActiveTag(activeTag === tag ? null : tag)}
                className={`px-2.5 py-1 rounded-full text-xs font-medium transition-all ${
                  activeTag === tag
                    ? 'bg-(--accent)/20 text-(--accent-light) border border-(--accent)/40 shadow-(--accent-glow)'
                    : 'bg-white/5 text-(--text-muted) border border-white/10 hover:bg-white/10 hover:text-(--text-secondary)'
                }`}
              >
                {tag} <span className="opacity-60">({count})</span>
              </button>
            ))}
          </div>
        )}

        {/* 标签页 */}
        <Tabs
          selectedKey={activeTab}
          onSelectionChange={(key) => setActiveTab(key as TabType)}
          classNames={{
            tabList: "bg-(--bg-card) border border-(--border-color) shadow-sm",
            tab: "text-(--text-muted) data-[selected=true]:text-(--accent-light) font-medium",
            cursor: "bg-linear-to-r from-(--accent) to-(--accent-light) h-0.5 shadow-(--accent-glow)"
          }}
        >
          <Tab
            key="characters"
            title={
              <div className="flex items-center gap-2">
                <Users className="w-4 h-4" />
                <span>{t.assetsManager.tabs.characters} ({characters.length})</span>
              </div>
            }
          >
            {/* 角色数量统计 */}
            <div className="flex items-center justify-between mt-4 mb-2">
              <span className="text-sm text-(--text-muted)">
                {t.assetsManager.counts.characters.replace('{count}', String(filteredCharacters.length))}
              </span>
            </div>

            {/* 网格视图 */}
            <CharacterList 
              characters={filteredCharacters} 
              tagGroups={tagGroups}
              onEdit={handleEdit} 
              onDelete={handleDelete} 
            />
          </Tab>

          <Tab
            key="props"
            title={
              <div className="flex items-center gap-2">
                <FileText className="w-4 h-4" />
                <span>{t.assetsManager.tabs.props} ({props.length + heldPropsRefs.length})</span>
              </div>
            }
          >
            <PropList 
              props={filteredProps} 
              onEdit={handleEdit} 
              onDelete={handleDelete} 
            />
            {/* 来自角色状态的道具引用 */}
            {heldPropsRefs.length > 0 && (
              <div className="mt-6">
                <h3 className="text-xs font-medium mb-2 flex items-center gap-1.5" style={{ color: 'var(--text-muted)' }}>
                  <Sparkles className="w-3.5 h-3.5 text-teal-500" />
                  {t.assetsManager.heldProps.title}
                  <span className="text-[10px] px-1 py-0.5 rounded bg-teal-500/10 text-teal-600 dark:text-teal-400">
                    {heldPropsRefs.length}
                  </span>
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2">
                  {heldPropsRefs.map((ref, idx) => {
                    const isCreating = creatingPropFromRef === ref.state_id;
                    return (
                      <div
                        key={`${ref.state_id}-${idx}`}
                        className="group rounded-md px-3 py-2 border border-teal-500/15 bg-teal-500/5 hover:border-teal-500/30 transition-all flex items-center gap-2"
                      >
                        {/* 左侧道具图标占位 */}
                        <div className="shrink-0 w-9 h-9 rounded-md bg-teal-500/10 border border-teal-500/20 flex items-center justify-center text-teal-500">
                          <Sparkles className="w-4 h-4" />
                        </div>
                        {/* 中间文字 */}
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-medium truncate" style={{ color: 'var(--text-primary)' }}>
                            {ref.held_props}
                          </p>
                          <p className="text-[10px] truncate mt-0.5" style={{ color: 'var(--text-muted)' }}>
                            {ref.character_name} · {ref.state_name}
                          </p>
                        </div>
                        {/* 右侧生成按钮 */}
                        <Button
                          isIconOnly
                          size="sm"
                          variant="flat"
                          className="shrink-0 w-7 h-7 min-w-7 bg-teal-500/15 text-teal-600 dark:text-teal-400 hover:bg-teal-500/30 opacity-70 group-hover:opacity-100 transition-opacity"
                          isLoading={isCreating}
                          isDisabled={!selectedImageModel}
                          title={selectedImageModel ? t.assetsManager.heldProps.createAndGenerate : t.assetsManager.heldProps.selectImageModelFirst}
                          onPress={async () => {
                            if (!selectedImageModel) {
                              showToast(t.assetsManager.heldProps.selectImageModelFirst, 'error');
                              return;
                            }
                            setCreatingPropFromRef(ref.state_id);
                            try {
                              const newProp = await createProp({
                                name: ref.held_props,
                                description: ref.held_props,
                                project_id: ref.project_id,
                                prop_type: 'permanent',
                              });
                              showToast(t.assetsManager.heldProps.propCreated.replace('{name}', ref.held_props), 'success');
                              await generatePropViews(newProp.id, {
                                imageModel: selectedImageModel,
                                textModel: selectedTextModel || undefined,
                              });
                              showToast(t.assetsManager.heldProps.propImageGenStarted, 'success');
                              loadData();
                            } catch (e: any) {
                              showToast(e.message || '创建道具失败', 'error');
                            } finally {
                              setCreatingPropFromRef(null);
                            }
                          }}
                        >
                          {!isCreating && <Wand2 className="w-3.5 h-3.5" />}
                        </Button>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </Tab>

          <Tab
            key="costumes"
            title={
              <div className="flex items-center gap-2">
                <Tag className="w-4 h-4" />
                <span>{t.assetsManager.tabs.costumes} ({costumes.length})</span>
              </div>
            }
          >
            <div className="space-y-3 mt-4">
              <div className="flex items-center justify-between">
                <span className="text-sm text-(--text-muted)">
                  {t.assetsManager.counts.costumes.replace('{count}', String(filteredCostumes.length))}
                </span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {filteredCostumes.map((c) => {
                  const hasImage = !!c.image_url;
                  const isGenerating = c.generation_status === 'generating';
                  const handleGenCostumeViews = async () => {
                    if (!selectedImageModel) {
                      showToast('请先配置图像模型', 'warning');
                      return;
                    }
                    try {
                      await generateCostumeViews(c.id, { imageModel: selectedImageModel });
                      showToast(t.assetsManager.costume.generateDesign, 'success');
                      setTimeout(() => loadData(), 500);
                    } catch (e: any) {
                      showToast(e.message || '生成失败', 'error');
                    }
                  };
                  return (
                    <div
                      key={c.id}
                      className="bg-(--bg-card) border border-(--border-color) rounded-xl p-4 hover:border-(--accent)/30 transition-all"
                    >
                      {c.image_url ? (
                        <img
                          src={c.image_url}
                          alt={c.name}
                          className="w-full aspect-video object-cover rounded-lg mb-2 cursor-pointer hover:opacity-90 transition-opacity"
                          onClick={() => openPreview([{ src: c.image_url!, alt: c.name }], 0)}
                        />
                      ) : (
                        <div className="w-full aspect-video bg-(--bg-muted) rounded-lg mb-2 flex items-center justify-center text-(--text-muted) text-xs">
                          {t.assetsManager.costume.noImage}
                        </div>
                      )}
                      <h3 className="font-semibold text-(--text-primary) truncate">{c.name}</h3>
                      {c.character_name && (
                        <div className="text-xs text-(--text-muted) mt-0.5 flex items-center gap-1">
                          <span className="w-1.5 h-1.5 rounded-full bg-(--accent)" />
                          {t.assetsManager.costume.belongsTo}: {c.character_name}
                        </div>
                      )}
                      <div className="flex flex-wrap gap-1 mt-1">
                        {c.category && (
                          <span className="text-[10px] px-2 py-0.5 rounded-full bg-purple-500/15 text-purple-300">{c.category}</span>
                        )}
                        {c.gender && (
                          <span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-500/15 text-blue-300">{c.gender}</span>
                        )}
                      </div>
                      {editingCostumeDesc?.id === c.id ? (
                        <textarea
                          autoFocus
                          className="w-full text-xs text-(--text-primary) mt-2 p-1.5 rounded-md border border-(--accent)/40 bg-(--bg-muted) resize-none focus:outline-none focus:border-(--accent) overflow-y-auto"
                          rows={3}
                          value={editingCostumeDesc.value}
                          onChange={(e) => setEditingCostumeDesc({ id: c.id, value: e.target.value })}
                          onBlur={async () => {
                            const newDesc = editingCostumeDesc.value.trim();
                            if (newDesc !== (c.description || '').trim()) {
                              try {
                                await updateCostume(c.id, {
                                  name: c.name,
                                  description: newDesc,
                                  category: c.category,
                                  gender: c.gender,
                                  outfit_prompt: newDesc,
                                  image_url: c.image_url,
                                  front_view_url: c.front_view_url,
                                  side_view_url: c.side_view_url,
                                  back_view_url: c.back_view_url,
                                  tags: c.tags,
                                });
                                showToast(t.assetsManager.costume.descUpdated, 'success');
                                loadData();
                              } catch (e: any) {
                                showToast(e.message || '更新失败', 'error');
                              }
                            }
                            setEditingCostumeDesc(null);
                          }}
                          onKeyDown={(e) => {
                            if (e.key === 'Escape') {
                              setEditingCostumeDesc(null);
                            }
                          }}
                        />
                      ) : (
                        <p
                          className="text-xs text-(--text-muted) mt-2 line-clamp-2 cursor-pointer hover:text-(--text-primary) transition-colors group/desc"
                          onClick={() => setEditingCostumeDesc({ id: c.id, value: c.description || '' })}
                          title={'点击编辑描述'}
                        >
                          {c.description || <span className="italic text-(--text-muted)/50">{t.assetsManager.costume.descPlaceholder}</span>}
                          <Edit2 className="w-2.5 h-2.5 inline-block ml-1 opacity-0 group-hover/desc:opacity-60 transition-opacity" />
                        </p>
                      )}
                      {c.generation_status && c.generation_status !== 'pending' && (
                        <span className={`text-[10px] px-2 py-0.5 rounded-full mt-2 inline-block ${
                          c.generation_status === 'completed' ? 'bg-green-500/15 text-green-400' :
                          c.generation_status === 'generating' ? 'bg-blue-500/15 text-blue-400 animate-pulse' :
                          'bg-red-500/15 text-red-400'
                        }`}>{c.generation_status}</span>
                      )}
                      <div className="flex gap-2 mt-2">
                        <Button
                          size="sm"
                          color="primary"
                          variant="flat"
                          className="text-xs flex-1"
                          isDisabled={isGenerating}
                          onPress={handleGenCostumeViews}
                        >
                          {isGenerating ? t.assetsManager.costume.generating : hasImage ? t.assetsManager.costume.regenerate : t.assetsManager.costume.generateDesign}
                        </Button>
                        <Button
                          size="sm"
                          variant="flat"
                          className="text-xs"
                          onPress={() => {
                            window.dispatchEvent(new CustomEvent('openAssetEditTab', {
                              detail: {
                                assetType: 'costume',
                                assetId: c.id,
                                assetName: c.name,
                                initialData: c,
                              }
                            }));
                          }}
                        >
                          编辑
                        </Button>
                        <Button size="sm" variant="flat" className="text-xs" onPress={() => handleDelete(c.id)}>删除</Button>
                      </div>
                    </div>
                  );
                })}
                {filteredCostumes.length === 0 && (
                  <div className="col-span-full text-center text-(--text-muted) py-12">
                    {t.assetsManager.empty.costumes}
                  </div>
                )}
              </div>
            </div>
          </Tab>

          <Tab
            key="environments"
            title={
              <div className="flex items-center gap-2">
                <Cloud className="w-4 h-4" />
                <span>{t.assetsManager.tabs.environments} ({cleanEnvironments.length})</span>
              </div>
            }
          >
            <div className="flex items-center justify-between mt-4 mb-2">
              <span className="text-sm text-(--text-muted)">
                {t.assetsManager.counts.environments.replace('{count}', String(filteredEnvironments.length))}
              </span>
              {filteredEnvironments.length > 0 && projectFilter !== 'all' && projectFilter !== 'unused' && (
                <Button
                  size="sm"
                  variant="flat"
                  color="warning"
                  isLoading={sanitizingEnvs}
                  onPress={handleSanitizeEnvDescriptions}
                  startContent={!sanitizingEnvs ? <Sparkles className="w-3.5 h-3.5" /> : undefined}
                  title="一键去除描述中的角色活动与建筑/人造物描述，只保留纯自然场景描述"
                >
                  {sanitizingEnvs ? '清洗中…' : '清洗描述'}
                </Button>
              )}
            </div>
            <EnvironmentList
              environments={filteredEnvironments}
              onEdit={handleEditEnvironment}
              onDelete={handleDelete}
              onGenerateImage={handleGenerateEnvImage}
              onUpdateEnvironment={handleUpdateEnvironment}
              selectedImageModel={selectedImageModel}
              selectedTextModel={selectedTextModel}
            />
          </Tab>

          <Tab
            key="buildings"
            title={
              <div className="flex items-center gap-2">
                <Building2 className="w-4 h-4" />
                <span>{t.assetsManager.tabs.buildings} ({buildings.length})</span>
              </div>
            }
          >
            <div className="flex items-center justify-between mt-4 mb-2">
              <span className="text-sm text-(--text-muted)">
                {t.assetsManager.counts.buildings.replace('{count}', String(filteredBuildings.length))}
              </span>
            </div>
            <BuildingList
              buildings={filteredBuildings}
              onEdit={handleEditBuilding}
              onDelete={handleDelete}
              onGenerateImage={handleGenerateBuildingImage}
              onDeleteImage={handleDeleteBuildingImage}
            />
          </Tab>

          <Tab
            key="studios"
            title={
              <div className="flex items-center gap-2">
                <MapPin className="w-4 h-4" />
                <span>{t.assetsManager.tabs.studios} ({studios.length})</span>
              </div>
            }
          >
            <StudioList
              studios={filteredStudios}
              onEdit={handleEditStudio}
              onDelete={handleDelete}
              selectedImageModel={selectedImageModel}
              selectedTextModel={selectedTextModel}
            />
          </Tab>

          <Tab
            key="scripts"
            title={
              <div className="flex items-center gap-2">
                <BookOpen className="w-4 h-4" />
                <span>{t.assetsManager.tabs.scripts} ({scripts.length})</span>
              </div>
            }
          >
            <ScriptList
              scripts={filteredScripts}
              projects={userProjects}
              onDelete={handleDelete}
              onDeleteGroup={handleScriptDeleteGroup}
              onBind={handleScriptBind}
              onCreateEpisode={handleScriptCreateEpisode}
              onGenerateStoryboard={(script) => {
                navigate(`/storyboard?scriptId=${script.id}`);
              }}
              onEditScript={(script) => {
                window.dispatchEvent(new CustomEvent('openAssetEditTab', {
                  detail: {
                    assetType: 'script',
                    assetId: script.id,
                    assetName: script.title || `剧本 #${script.id}`,
                    initialData: script,
                  }
                }));
              }}
            />
          </Tab>
        </Tabs>

        {/* 编辑/新增对话框 */}
        {activeTab === 'characters' && (
          <CharacterModal
            isOpen={isOpen}
            onOpenChange={onOpenChange}
            editMode={editMode}
            formData={formData}
            setFormData={setFormData}
            onSave={handleSave}
            tagGroups={tagGroups}
            onTagGroupsChange={loadTagGroups}
            onRefreshCharacter={handleRefreshCharacter}
            userProjects={userProjects}
            projectId={formData.project_id || getActiveProjectId()}
          />
        )}
        
        
        {activeTab === 'props' && (
          <PropModal
            isOpen={isOpen}
            onOpenChange={onOpenChange}
            editMode={editMode}
            formData={formData}
            setFormData={setFormData}
            onSave={handleSave}
            imageAspectRatio={(currentProject as any)?.settings?.imageAspectRatio}
          />
        )}

        {/* 影棚编辑模态框 */}
        <StudioModal
          isOpen={isStudioOpen}
          onOpenChange={onStudioOpenChange}
          editMode={studioEditMode}
          studioId={editingStudioId}
          projectId={getActiveProjectId()}
          onSaved={loadData}
        />

        {/* 环境编辑模态框 */}
        <Modal isOpen={isEnvOpen} onOpenChange={onEnvOpenChange} size="lg">
          <ModalContent>
            {(onClose) => (
              <>
                <ModalHeader>{envEditMode ? '编辑环境' : '新建环境'}</ModalHeader>
                <ModalBody className="space-y-4">
                  <Input
                    label="名称"
                    placeholder="如：蜜糖草地、沙地、溪流..."
                    value={envForm.name}
                    onValueChange={(v) => setEnvForm((p) => ({ ...p, name: v }))}
                    isRequired
                  />
                  <Textarea
                    label="描述"
                    placeholder="环境氛围描述..."
                    value={envForm.description}
                    onValueChange={(v) => setEnvForm((p) => ({ ...p, description: v }))}
                  />
                  <div className="grid grid-cols-2 gap-3">
                    <Input
                      label="时间"
                      placeholder="如：清晨、黄昏"
                      value={envForm.timeOfDay}
                      onValueChange={(v) => setEnvForm((p) => ({ ...p, timeOfDay: v }))}
                    />
                    <Input
                      label="天气"
                      placeholder="如：晴朗、雨天"
                      value={envForm.weather}
                      onValueChange={(v) => setEnvForm((p) => ({ ...p, weather: v }))}
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <Input
                      label="光照"
                      placeholder="如：柔和、强烈"
                      value={envForm.lighting}
                      onValueChange={(v) => setEnvForm((p) => ({ ...p, lighting: v }))}
                    />
                    <Input
                      label="氛围"
                      placeholder="如：温馨、神秘"
                      value={envForm.mood}
                      onValueChange={(v) => setEnvForm((p) => ({ ...p, mood: v }))}
                    />
                  </div>
                  {/* 地貌类型显示（只读，由 AI 识别生成） */}
                  {envForm.terrainType && envForm.terrainType.length > 0 && (
                    <div>
                      <label className="text-xs text-(--text-muted) mb-1.5 block">地貌类型（AI识别）</label>
                      <div className="flex flex-wrap gap-1.5">
                        {envForm.terrainType.split(',').filter(Boolean).map((type: string) => (
                          <span
                            key={type}
                            className="px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-500/10 text-emerald-500 border border-emerald-500/20"
                          >
                            {type}
                          </span>
                        ))}
                      </div>
                      <p className="text-[10px] text-(--text-muted) mt-1">点击卡片上的扫描图标可重新识别地貌类型</p>
                    </div>
                  )}
                  <div>
                    <label className="text-xs text-(--text-muted) mb-1.5 block">归属项目</label>
                    <div className="flex flex-wrap gap-1.5">
                      {userProjects.map((p) => (
                        <button
                          key={p.id}
                          type="button"
                          onClick={() => setEnvForm((prev) => ({ ...prev, project_id: p.id }))}
                          className={`px-2.5 py-1 rounded-full text-xs font-medium transition-all border ${
                            envForm.project_id === p.id
                              ? 'bg-(--accent)/20 text-(--accent-light) border-(--accent)/40'
                              : 'bg-white/5 text-(--text-muted) border-white/10 hover:bg-white/10'
                          }`}
                        >
                          {p.name}
                        </button>
                      ))}
                      {userProjects.length === 0 && (
                        <span className="text-xs text-(--text-muted)">暂无项目</span>
                      )}
                    </div>
                  </div>

                  {/* 环境图生成区（仅编辑模式可见）*/}
                  {envEditMode && editingEnvId && (() => {
                    const editingEnv = environments.find((e) => e.id === editingEnvId);
                    if (!editingEnv) return null;
                    const envIsGenerating = editingEnv.generation_status === 'generating';
                    return (
                      <div className="border-t border-(--border-color) pt-3">
                        <div className="flex items-center justify-between mb-2">
                          <label className="text-xs text-(--text-muted) font-medium">环境图</label>
                          {envIsGenerating && (
                            <span className="text-[10px] text-blue-500 flex items-center gap-1">
                              <span className="inline-block w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse" />
                              生成中…
                            </span>
                          )}
                        </div>
                        <div className="flex gap-2 mb-2">
                          <div className="flex-1 relative">
                            {editingEnv.image_url ? (
                              <img
                                src={editingEnv.image_url}
                                alt={`${editingEnv.name} · 正面`}
                                className="w-full h-24 object-cover rounded border border-(--border-color)"
                              />
                            ) : (
                              <div className="w-full h-24 rounded bg-(--bg-input) border border-dashed border-(--border-color) flex items-center justify-center text-[11px] text-(--text-muted)">
                                正面未生成
                              </div>
                            )}
                            <span className="absolute bottom-1 left-1 bg-black/60 text-white text-[10px] px-1 rounded">正面</span>
                          </div>
                          <div className="flex-1 relative">
                            {editingEnv.image_back_url ? (
                              <img
                                src={editingEnv.image_back_url}
                                alt={`${editingEnv.name} · 背面`}
                                className="w-full h-24 object-cover rounded border border-(--border-color)"
                              />
                            ) : (
                              <div className="w-full h-24 rounded bg-(--bg-input) border border-dashed border-(--border-color) flex items-center justify-center text-[11px] text-(--text-muted)">
                                背面未生成
                              </div>
                            )}
                            <span className="absolute bottom-1 left-1 bg-black/60 text-white text-[10px] px-1 rounded">背面</span>
                          </div>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <Button
                            size="sm"
                            color="primary"
                            variant="solid"
                            isLoading={envIsGenerating}
                            isDisabled={envIsGenerating}
                            onPress={() => handleGenerateEnvImage(editingEnv, 'both')}
                            startContent={!envIsGenerating ? <Wand2 className="w-3.5 h-3.5" /> : undefined}
                          >
                            {editingEnv.image_url || editingEnv.image_back_url ? '一键重新生成' : '一键生成（正+背）'}
                          </Button>
                          <Button
                            size="sm"
                            variant="flat"
                            color="primary"
                            isLoading={envIsGenerating}
                            isDisabled={envIsGenerating}
                            onPress={() => handleGenerateEnvImage(editingEnv, 'front')}
                          >
                            {editingEnv.image_url ? '重新生成正面' : '生成正面'}
                          </Button>
                          <Button
                            size="sm"
                            variant="flat"
                            color="primary"
                            isLoading={envIsGenerating}
                            isDisabled={envIsGenerating}
                            onPress={() => handleGenerateEnvImage(editingEnv, 'back')}
                          >
                            {editingEnv.image_back_url ? '重新生成背面' : '生成背面'}
                          </Button>
                        </div>
                        <p className="text-[10px] text-(--text-muted) mt-1.5">
                          正/背图基于对方做 i2i 参考，保持画风与色彩一致。生成后可关闭弹窗查看。
                        </p>
                      </div>
                    );
                  })()}
                </ModalBody>
                <ModalFooter>
                  <Button variant="light" onPress={onClose}>取消</Button>
                  <Button color="primary" onPress={handleSaveEnvironment}>
                    {envEditMode ? '保存' : '创建'}
                  </Button>
                </ModalFooter>
              </>
            )}
          </ModalContent>
        </Modal>

        {/* 建筑编辑模态框 */}
        <Modal isOpen={isBldOpen} onOpenChange={onBldOpenChange} size={bldEditMode && editingBldId ? '3xl' : 'lg'}>
          <ModalContent>
            {(onClose) => (
              <>
                <ModalHeader>{bldEditMode ? '编辑建筑' : '新建建筑'}</ModalHeader>
                <ModalBody className="pb-2">
                  <div className={bldEditMode && editingBldId ? 'flex gap-6' : ''}>
                    {/* ===== 左栏：表单 ===== */}
                    <div className={`space-y-4 ${bldEditMode && editingBldId ? 'w-2/5 shrink-0' : 'w-full'}`}>
                      <Input
                        label="名称"
                        placeholder="如：蜜糖小屋、石桥..."
                        value={bldForm.name}
                        onValueChange={(v) => setBldForm((p) => ({ ...p, name: v }))}
                        isRequired
                      />
                      <Textarea
                        label="描述"
                        placeholder="建筑结构描述..."
                        value={bldForm.description}
                        onValueChange={(v) => setBldForm((p) => ({ ...p, description: v }))}
                        minRows={3}
                      />
                      {/* 室内外类型字段已移除：建筑天然都有内外两面，interiorExterior 统一为 'both' */}
                      <Input
                        label="结构类型"
                        placeholder="如：residential、commercial"
                        value={bldForm.structureType}
                        onValueChange={(v) => setBldForm((p) => ({ ...p, structureType: v }))}
                      />
                      <div>
                        <label className="text-xs text-(--text-muted) mb-1.5 block">归属项目</label>
                        <div className="flex flex-wrap gap-1.5">
                          {userProjects.map((p) => (
                            <button
                              key={p.id}
                              type="button"
                              onClick={() => setBldForm((prev) => ({ ...prev, project_id: p.id }))}
                              className={`px-2.5 py-1 rounded-full text-xs font-medium transition-all border ${
                                bldForm.project_id === p.id
                                  ? 'bg-(--accent)/20 text-(--accent-light) border-(--accent)/40'
                                  : 'bg-white/5 text-(--text-muted) border-white/10 hover:bg-white/10'
                              }`}
                            >
                              {p.name}
                            </button>
                          ))}
                          {userProjects.length === 0 && (
                            <span className="text-xs text-(--text-muted)">暂无项目</span>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* ===== 右栏：建筑设定图（仅编辑模式） ===== */}
                    {bldEditMode && editingBldId && (() => {
                      const editingBld = buildings.find((b) => b.id === editingBldId);
                      if (!editingBld) return null;
                      const bldIsGenerating = editingBld.generation_status === 'generating';
                      const hasExt = !!editingBld.exterior_image_url;
                      const hasInt = !!editingBld.interior_image_url;
                      const view = editBldView;
                      return (
                        <div className="flex-1 min-w-0 flex flex-col">
                          <div className="flex items-center justify-between mb-2">
                            <label className="text-xs text-(--text-muted) font-medium">建筑设定图</label>
                            {bldIsGenerating && (
                              <span className="text-[10px] text-blue-500 flex items-center gap-1">
                                <span className="inline-block w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse" />
                                生成中…
                              </span>
                            )}
                          </div>

                          {/* Tab 切换 */}
                          <div className="flex gap-1 bg-(--bg-input) p-0.5 rounded-md mb-3">
                            <button
                              type="button"
                              onClick={() => setEditBldView('exterior')}
                              className={`flex-1 text-xs py-1.5 rounded transition-all flex items-center justify-center gap-1.5 ${
                                view === 'exterior'
                                  ? 'bg-(--bg-card) text-(--accent-light) font-medium shadow-sm'
                                  : 'text-(--text-muted) hover:text-(--text-secondary)'
                              }`}
                            >
                              外景·四方位
                              {hasExt && <span className="w-1.5 h-1.5 rounded-full bg-green-500" />}
                            </button>
                            <button
                              type="button"
                              onClick={() => setEditBldView('interior')}
                              className={`flex-1 text-xs py-1.5 rounded transition-all flex items-center justify-center gap-1.5 ${
                                view === 'interior'
                                  ? 'bg-(--bg-card) text-(--accent-light) font-medium shadow-sm'
                                  : 'text-(--text-muted) hover:text-(--text-secondary)'
                              }`}
                            >
                              内景·九宫格
                              {hasInt && <span className="w-1.5 h-1.5 rounded-full bg-green-500" />}
                            </button>
                          </div>

                          {/* 图片预览区 */}
                          <div className="flex-1 mb-3">
                            <div className={view === 'exterior' ? 'block' : 'hidden'}>
                              {hasExt ? (
                                <img
                                  src={editingBld.exterior_image_url!}
                                  alt={`${editingBld.name} · 外景四方位`}
                                  loading="eager" decoding="async"
                                  className="w-full aspect-video object-cover rounded-lg border border-(--border-color)"
                                />
                              ) : (
                                <div className="w-full aspect-video rounded-lg bg-(--bg-input) border border-dashed border-(--border-color) flex flex-col items-center justify-center text-[11px] text-(--text-muted) gap-1">
                                  <span>外景四方位未生成</span>
                                  <span className="text-[10px] opacity-70">Front / Back / Left / Right 2×2 正交参考</span>
                                </div>
                              )}
                            </div>
                            <div className={view === 'interior' ? 'block' : 'hidden'}>
                              {hasInt ? (
                                <img
                                  src={editingBld.interior_image_url!}
                                  alt={`${editingBld.name} · 内景九宫格`}
                                  loading="eager" decoding="async"
                                  className="w-full aspect-square object-cover rounded-lg border border-(--border-color)"
                                />
                              ) : (
                                <div className="w-full aspect-square rounded-lg bg-(--bg-input) border border-dashed border-(--border-color) flex flex-col items-center justify-center text-[11px] text-(--text-muted) gap-1">
                                  <span>内景九宫格未生成</span>
                                  <span className="text-[10px] opacity-70 text-center px-4">6 视角 + 3 细节特写<br/>（入口/后墙/左墙/右墙 + 俯视 + 轴测 + 家具/材质/陈设）</span>
                                </div>
                              )}
                            </div>
                          </div>

                          {/* 生成按钮 */}
                          <div className="flex flex-wrap gap-2">
                            <Button
                              size="sm"
                              color="primary"
                              variant="solid"
                              isLoading={bldIsGenerating}
                              isDisabled={bldIsGenerating}
                              onPress={() => handleGenerateBuildingImage(editingBld, 'both')}
                              startContent={!bldIsGenerating ? <Wand2 className="w-3.5 h-3.5" /> : undefined}
                            >
                              {hasExt || hasInt ? '重新生成（外+内）' : '一键生成（外+内）'}
                            </Button>
                            {view === 'exterior' ? (
                              <Button
                                size="sm"
                                variant="flat"
                                color="primary"
                                isLoading={bldIsGenerating}
                                isDisabled={bldIsGenerating}
                                onPress={() => handleGenerateBuildingImage(editingBld, 'exterior')}
                              >
                                {hasExt ? '重新生成外景' : '仅生成外景'}
                              </Button>
                            ) : (
                              <Button
                                size="sm"
                                variant="flat"
                                color="primary"
                                isLoading={bldIsGenerating}
                                isDisabled={bldIsGenerating}
                                onPress={() => handleGenerateBuildingImage(editingBld, 'interior')}
                              >
                                {hasInt ? '重新生成内景' : '仅生成内景'}
                              </Button>
                            )}
                          </div>
                          <p className="text-[10px] text-(--text-muted) mt-1.5">
                            外景 = 2×2 四方位正交参考；内景 = 3×3 九宫格（6 视角 + 3 细节特写）
                          </p>
                        </div>
                      );
                    })()}
                  </div>
                </ModalBody>
                <ModalFooter>
                  <Button variant="light" onPress={onClose}>取消</Button>
                  <Button color="primary" onPress={handleSaveBuilding}>
                    {bldEditMode ? '保存' : '创建'}
                  </Button>
                </ModalFooter>
              </>
            )}
          </ModalContent>
        </Modal>

        {/* 场景详情模态框 */}
        <SceneDetailModal
          isOpen={isDetailOpen}
          onClose={onDetailOpenChange}
          scene={selectedScene}
          onGenerateImage={(sceneId: number, imageModel: string, options?: { customPromptA?: string; customPromptB?: string }) => handleGenerateSceneImage(sceneId, imageModel, options)}
          isGenerating={isGenerating}
          textModel={selectedTextModel}
        />

        {/* 标签分组管理模态框已移除入口，所谓“当前状态”交由工作台在分镜时主动选择 */}

        {/* 剧本创建模态框 */}
        <Modal isOpen={isScriptCreateOpen} onOpenChange={onScriptCreateOpenChange} size="2xl">
          <ModalContent>
            {(onClose) => (
              <>
                <ModalHeader>新建剧本</ModalHeader>
                <ModalBody>
                  <div className="space-y-3">
                    <Input
                      label="剧本标题（可选）"
                      placeholder="留空则默认用集数"
                      value={scriptCreateTitle}
                      onValueChange={setScriptCreateTitle}
                    />

                    <div>
                      <label className="text-xs text-(--text-muted) mb-1.5 block">归属</label>
                      <div className="flex flex-wrap gap-1.5">
                        <button
                          type="button"
                          onClick={() => setScriptCreateTargetProjectId('')}
                          className={`px-2.5 py-1 rounded-full text-xs font-medium transition-all border ${
                            scriptCreateTargetProjectId === ''
                              ? 'bg-(--accent)/20 text-(--accent-light) border-(--accent)/40'
                              : 'bg-white/5 text-(--text-muted) border-white/10 hover:bg-white/10'
                          }`}
                        >
                          个人剧本库
                        </button>
                        {userProjects.map((p) => (
                          <button
                            key={p.id}
                            type="button"
                            onClick={() => setScriptCreateTargetProjectId(String(p.id))}
                            className={`px-2.5 py-1 rounded-full text-xs font-medium transition-all border ${
                              scriptCreateTargetProjectId === String(p.id)
                                ? 'bg-(--accent)/20 text-(--accent-light) border-(--accent)/40'
                                : 'bg-white/5 text-(--text-muted) border-white/10 hover:bg-white/10'
                            }`}
                          >
                            {p.name}
                          </button>
                        ))}
                      </div>
                      <div className="text-[11px] text-(--text-muted) mt-1.5">
                        个人剧本库：仅自己可见，可随后绑定到任意项目（会生成副本）
                      </div>
                    </div>

                    <Textarea
                      label="剧本内容"
                      placeholder="粘贴或手写剧本内容..."
                      value={scriptCreateContent}
                      onValueChange={setScriptCreateContent}
                      minRows={10}
                      maxRows={20}
                      isRequired
                    />
                  </div>
                </ModalBody>
                <ModalFooter>
                  <Button variant="light" onPress={onClose}>取消</Button>
                  <Button
                    color="primary"
                    onPress={handleScriptCreateSubmit}
                    isDisabled={!scriptCreateContent.trim() || scriptCreating}
                    isLoading={scriptCreating}
                  >
                    创建
                  </Button>
                </ModalFooter>
              </>
            )}
          </ModalContent>
        </Modal>

        {/* AI 剧本生成弹窗 */}
        <ScriptGenerateModal
          isOpen={isScriptGenerateOpen}
          onOpenChange={onScriptGenerateOpenChange}
          projects={userProjects}
          aiModels={aiModels}
          defaultTextModel={selectedTextModel}
          onSuccess={() => {
            showToast('剧本生成成功', 'success');
            loadData();
          }}
          onError={(msg) => showToast(msg, 'error')}
        />

        {/* AI 生成角色弹窗 */}
        {(() => {
          const pid = projectFilter !== 'all' && projectFilter !== 'unused' ? Number(projectFilter) : null;
          const pname = pid ? userProjects.find((p) => p.id === pid)?.name : undefined;
          if (!pid) return null;
          return (
            <CharacterDraftPreviewModal
              isOpen={isCharGenOpen}
              onOpenChange={onCharGenOpenChange}
              projectId={pid}
              projectName={pname}
              aiModels={aiModels}
              defaultTextModel={selectedTextModel}
              defaultImageModel={selectedImageModel}
              onCommitted={(res) => {
                showToast('角色已创建，正在生成白膜三视图…', 'success');
                setPendingCharGen({ characterId: res.characterId, jobId: res.jobId });
                loadData();
              }}
              onError={(msg) => showToast(msg, 'error')}
            />
          );
        })()}
      </div>
      </div>
    </div>
  );
};

export default AssetsManager;
