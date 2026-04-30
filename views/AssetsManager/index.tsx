import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button, Input, Tabs, Tab, useDisclosure, Modal, ModalContent, ModalHeader, ModalBody, ModalFooter, Popover, PopoverTrigger, PopoverContent, Textarea } from '@heroui/react';
import { Users, MapPin, FileText, Plus, Search, Tag, Settings, Edit2, X, ChevronDown, ChevronRight, BookOpen, Sparkles } from 'lucide-react';
import { getAuthToken } from '../../services/auth';
import { useSceneImageGeneration } from '../StoryBoard/hooks/useSceneImageGeneration';
import SceneDetailModal from '../StoryBoard/ResourcePanel/SceneDetailModal';
import { 
  Character, Scene, Prop, TagGroup, CharacterTagGroupEntry,
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

import { fetchCostumes, deleteCostume as deleteCostumeApi, generateCostumeViews } from '../../services/costumes';
import type { Costume } from '../../services/costumes';
import {
  ScriptLibraryItem,
  fetchScriptLibrary,
  createScript as createScriptApi,
  deleteScript as deleteScriptApi,
  bindScriptToProject,
} from '../../services/scripts';
import CharacterList from './CharacterList';
import ProjectSidebar from './ProjectSidebar';
import SceneList from './SceneList';
import PropList from './PropList';

import StudioList from './StudioList';
import ScriptList from './ScriptList';
import ScriptGenerateModal from './ScriptGenerateModal';
import CharacterDraftPreviewModal from './CharacterDraftPreviewModal';
import { useWorkflow, consumeWorkflow } from '../../hooks/useWorkflow';
import { generateDefaultCostumeState } from '../../services/assets';
import { CharacterModal, SceneModal, PropModal, StudioModal } from './AssetModel';
import { useToast } from '../../contexts/ToastContext';
import { useConfirm } from '../../contexts/ConfirmContext';
import { useCurrentProject } from '../../contexts/WorkbenchContext';
import { AIModel } from '../../components/AIModelSelector';
import type { CharacterState } from '../../services/assets';
import { useAIAssistantWorkbenchContext } from '../../contexts/AIAssistantContext';

type TabType = 'characters' | 'studios' | 'props' | 'costumes' | 'scripts';

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
  const [activeTab, setActiveTab] = useState<TabType>('characters');
  const [characters, setCharacters] = useState<Character[]>([]);
  const [scenes, setScenes] = useState<Scene[]>([]);
  const [props, setProps] = useState<Prop[]>([]);
  const [studios, setStudios] = useState<import('../../services/studios').Studio[]>([]);
  const [costumes, setCostumes] = useState<Costume[]>([]);
  const [scripts, setScripts] = useState<ScriptLibraryItem[]>([]);
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

  useEffect(() => {
    loadData();
  }, [activeTab, projectFilter]);

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
      } else {
        const data = await fetchProps();
        setProps(data);
      }
    } catch (error) {
      console.error('加载数据失败:', error);
    } finally {
      setLoading(false);
    }
  };

  const getTabLabel = () => {
    switch (activeTab) {
      case 'characters': return '角色';
      case 'studios': return '影棚';
      case 'props': return '道具';
      case 'costumes': return '服装';
      case 'scripts': return '剧本';
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

  const handleEdit = (item: Character | Scene | Prop) => {
    setEditMode(true);
    setCurrentId(item.id);
    setFormData(item);
    onOpen();
  };

  const handleEditStudio = (studio: import('../../services/studios').Studio) => {
    setStudioEditMode(true);
    setEditingStudioId(studio.id);
    onStudioOpen();
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

    // 创建时非“未使用素材”模式下需要项目ID
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
          <h1 className="text-2xl font-bold pro-title">资产管理</h1>
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
                      showToast('请先在左侧选择目标项目，AI 生成的角色将绑定到项目的画风', 'warning');
                      return;
                    }
                    onCharGenOpen();
                  }}
                >
                  AI 生成角色
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
                AI 生成剧本
              </Button>
            )}
            <Button
              className="pro-btn-primary"
              startContent={<Plus className="w-4 h-4" />}
              onPress={handleAdd}
            >
              新建{getTabLabel()}
            </Button>
          </div>
        </div>

        {/* 搜索栏 */}
        <Input
          placeholder="搜索资产..."
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
              <span className="text-xs text-(--text-muted)">分组标签筛选</span>
              {activeGroupFilter && (
                <button
                  onClick={() => setActiveGroupFilter(null)}
                  className="px-2 py-0.5 rounded-full text-xs font-medium bg-(--danger)/15 text-(--danger) border border-(--danger)/30 hover:bg-(--danger)/25 transition-all"
                >
                  清除分组筛选
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
                <span>角色 ({characters.length})</span>
              </div>
            }
          >
            {/* 角色数量统计 */}
            <div className="flex items-center justify-between mt-4 mb-2">
              <span className="text-sm text-(--text-muted)">
                共 {filteredCharacters.length} 个角色
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
                <span>道具 ({props.length})</span>
              </div>
            }
          >
            <PropList 
              props={filteredProps} 
              onEdit={handleEdit} 
              onDelete={handleDelete} 
            />
          </Tab>

          <Tab
            key="costumes"
            title={
              <div className="flex items-center gap-2">
                <Tag className="w-4 h-4" />
                <span>服装 ({costumes.length})</span>
              </div>
            }
          >
            <div className="space-y-3 mt-4">
              <div className="flex items-center justify-between">
                <span className="text-sm text-(--text-muted)">
                  共 {filteredCostumes.length} 件服装
                </span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {filteredCostumes.map((c) => {
                  const hasViews = !!(c.image_url || c.front_view_url);
                  const isGenerating = c.generation_status === 'generating';
                  const handleGenCostumeViews = async () => {
                    if (!selectedImageModel) {
                      showToast('请先配置图像模型', 'warning');
                      return;
                    }
                    try {
                      await generateCostumeViews(c.id, { imageModel: selectedImageModel });
                      showToast('服装三视图生成已启动', 'success');
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
                        <img src={c.image_url} alt={c.name} className="w-full aspect-[2/3] object-cover rounded-lg mb-2" />
                      ) : (
                        <div className="w-full aspect-[2/3] bg-(--bg-muted) rounded-lg mb-2 flex items-center justify-center text-(--text-muted) text-xs">
                          无图片
                        </div>
                      )}
                      {hasViews && (
                        <div className="grid grid-cols-3 gap-1 mb-2">
                          <img src={c.front_view_url} alt="正" className="w-full aspect-[2/3] object-cover rounded" />
                          <img src={c.side_view_url} alt="侧" className="w-full aspect-[2/3] object-cover rounded" />
                          <img src={c.back_view_url} alt="背" className="w-full aspect-[2/3] object-cover rounded" />
                        </div>
                      )}
                      <h3 className="font-semibold text-(--text-primary) truncate">{c.name}</h3>
                      {c.character_name && (
                        <div className="text-xs text-(--text-muted) mt-0.5 flex items-center gap-1">
                          <span className="w-1.5 h-1.5 rounded-full bg-(--accent)" />
                          所属角色: {c.character_name}
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
                      {c.description && (
                        <p className="text-xs text-(--text-muted) mt-2 line-clamp-2">{c.description}</p>
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
                          {isGenerating ? '生成中…' : hasViews ? '重新生成' : '生成设定图'}
                        </Button>
                        <Button size="sm" variant="flat" className="text-xs" onPress={() => handleDelete(c.id)}>删除</Button>
                      </div>
                    </div>
                  );
                })}
                {filteredCostumes.length === 0 && (
                  <div className="col-span-full text-center text-(--text-muted) py-12">
                    暂无服装，通过角色 AI 生成或手动创建
                  </div>
                )}
              </div>
            </div>
          </Tab>

          <Tab
            key="studios"
            title={
              <div className="flex items-center gap-2">
                <MapPin className="w-4 h-4" />
                <span>影棚 ({studios.length})</span>
              </div>
            }
          >
            <StudioList
              studios={filteredStudios}
              onEdit={handleEditStudio}
              onDelete={handleDelete}
            />
          </Tab>

          <Tab
            key="scripts"
            title={
              <div className="flex items-center gap-2">
                <BookOpen className="w-4 h-4" />
                <span>剧本 ({scripts.length})</span>
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
