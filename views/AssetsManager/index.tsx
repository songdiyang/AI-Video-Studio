import React, { useState, useEffect, useCallback } from 'react';
import { Button, Input, Tabs, Tab, useDisclosure, Modal, ModalContent, ModalHeader, ModalBody, ModalFooter, Popover, PopoverTrigger, PopoverContent } from '@heroui/react';
import { Users, MapPin, FileText, Plus, Search, Tag, Settings, X, Edit2, ChevronDown, ChevronRight, Shirt } from 'lucide-react';
import { getAuthToken } from '../../services/auth';
import { useSceneImageGeneration } from '../StoryBoard/hooks/useSceneImageGeneration';
import SceneDetailModal from '../StoryBoard/ResourcePanel/SceneDetailModal';
import { 
  Character, Scene, Prop, TagGroup, CharacterTagGroupEntry,
  fetchCharacters, fetchScenes, fetchProps,
  createCharacter, createScene, createProp,
  updateCharacter, updateScene, updateProp,
  deleteCharacter, deleteScene, deleteProp,
  fetchTagGroups, createTagGroup, updateTagGroup, deleteTagGroup,
  TAG_GROUP_COLORS
} from '../../services/assets';
import { Costume, fetchCostumes, createCostume, updateCostume, deleteCostume, COSTUME_CATEGORIES } from '../../services/costumes';
import CharacterList from './CharacterList';
import SceneList from './SceneList';
import PropList from './PropList';
import CostumeList from './CostumeList';
import { CharacterModal, SceneModal, PropModal, CostumeModal } from './AssetModel';
import { useToast } from '../../contexts/ToastContext';
import { useConfirm } from '../../contexts/ConfirmContext';
import { AIModel } from '../../components/AIModelSelector';

type TabType = 'characters' | 'scenes' | 'props' | 'costumes';

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
  const [costumes, setCostumes] = useState<Costume[]>([]);
  const [tagGroups, setTagGroups] = useState<TagGroup[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTag, setActiveTag] = useState<string | null>(null);
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
  
  const { isOpen, onOpen, onOpenChange } = useDisclosure();
  const [editMode, setEditMode] = useState(false);
  const [currentId, setCurrentId] = useState<number | null>(null);
  
  // 标签分组管理模态框
  const { isOpen: isTagManagerOpen, onOpen: onTagManagerOpen, onOpenChange: onTagManagerOpenChange } = useDisclosure();
  
  // 场景详情模态框
  const { isOpen: isDetailOpen, onOpen: onDetailOpen, onOpenChange: onDetailOpenChange } = useDisclosure();
  const [selectedScene, setSelectedScene] = useState<Scene | null>(null);
  
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
    isActive: activeTab === 'scenes' && isDetailOpen,
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
      if (activeTab === 'characters') {
        const data = await fetchCharacters();
        setCharacters(data);
      } else if (activeTab === 'scenes') {
        const data = await fetchScenes();
        setScenes(data);
      } else if (activeTab === 'costumes') {
        // 获取当前项目的服装，需要从第一个角色获取project_id
        const projectId = characters.length > 0 ? (characters[0] as any).project_id : null;
        if (projectId) {
          const data = await fetchCostumes(projectId);
          setCostumes(data);
        } else {
          setCostumes([]);
        }
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
      case 'scenes': return '场景';
      case 'props': return '道具';
      case 'costumes': return '服装';
    }
  };

  const handleAdd = () => {
    setEditMode(false);
    setCurrentId(null);
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
      tag_groups_json: null
    });
    onOpen();
  };

  const handleEdit = (item: Character | Scene | Prop | Costume) => {
    setEditMode(true);
    setCurrentId(item.id);
    setFormData(item);
    onOpen();
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

  const handleSave = async () => {
    try {
      if (activeTab === 'characters') {
        if (editMode && currentId) {
          await updateCharacter(currentId, formData);
        } else {
          await createCharacter(formData);
        }
      } else if (activeTab === 'scenes') {
        if (editMode && currentId) {
          await updateScene(currentId, formData);
        } else {
          await createScene(formData);
        }
      } else if (activeTab === 'costumes') {
        if (editMode && currentId) {
          await updateCostume(currentId, formData);
        } else {
          // 创建服装需要project_id
          const projectId = characters.length > 0 ? (characters[0] as any).project_id : null;
          if (!projectId) {
            showToast('无法创建服装：缺少项目ID', 'error');
            return;
          }
          await createCostume({ ...formData, project_id: projectId });
        }
      } else {
        if (editMode && currentId) {
          await updateProp(currentId, formData);
        } else {
          await createProp(formData);
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
      } else if (activeTab === 'scenes') {
        await deleteScene(id);
      } else if (activeTab === 'costumes') {
        await deleteCostume(id);
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

  const handleGenerateSceneImage = async (sceneId: number, style: string, imageModel: string) => {
    try {
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
          height: 576 
        })
      });
      
      if (!res.ok) {
        throw new Error('启动生成失败');
      }
      
      const data = await res.json();
      console.log('[AssetsManager] 场景图片生成已启动:', data.jobId);
    } catch (error: any) {
      console.error('[AssetsManager] 生成场景图片失败:', error);
      showToast('生成场景图片失败，请稍后重试', 'error');
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
    else if (activeTab === 'scenes') scenes.forEach(s => extractTags(s.tags));
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
    if (!matchesTag(s.tags)) return false;
    const q = searchQuery.toLowerCase();
    return (s.name || '').toLowerCase().includes(q) ||
      (s.description || '').toLowerCase().includes(q) ||
      (s.tags && s.tags.toLowerCase().includes(q)) ||
      (s.project_name && s.project_name.toLowerCase().includes(q));
  });

  const filteredProps = props.filter(p => {
    if (!matchesTag(p.tags)) return false;
    const q = searchQuery.toLowerCase();
    return (p.name || '').toLowerCase().includes(q) ||
      (p.description || '').toLowerCase().includes(q) ||
      (p.tags && p.tags.toLowerCase().includes(q));
  });

  return (
    <div className="h-full bg-(--bg-app) overflow-y-auto p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* 头部 */}
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold pro-title">资产管理</h1>
          <div className="flex gap-2">
            {activeTab === 'characters' && (
              <Button
                variant="flat"
                className="pro-btn"
                startContent={<Settings className="w-4 h-4" />}
                onPress={onTagManagerOpen}
              >
                标签分组管理
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

        {/* 搜索 */}
        <Input
          placeholder="搜索资产..."
          value={searchQuery}
          onValueChange={setSearchQuery}
          startContent={<Search className="w-4 h-4 text-(--text-muted)" />}
          classNames={{
            input: "bg-transparent text-(--text-primary) placeholder:text-(--text-muted)",
            inputWrapper: "bg-(--bg-input) border border-(--border-color) hover:border-(--accent)/30 focus-within:border-(--accent)/50 shadow-sm transition-all"
          }}
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
            <CharacterList 
              characters={filteredCharacters} 
              tagGroups={tagGroups}
              onEdit={handleEdit} 
              onDelete={handleDelete} 
            />
          </Tab>

          <Tab
            key="scenes"
            title={
              <div className="flex items-center gap-2">
                <MapPin className="w-4 h-4" />
                <span>场景 ({scenes.length})</span>
              </div>
            }
          >
            <SceneList 
              scenes={filteredScenes} 
              onEdit={handleEdit} 
              onDelete={handleDelete}
              onViewDetail={handleViewSceneDetail}
              onSceneUpdate={loadData}
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
                <Shirt className="w-4 h-4" />
                <span>服装 ({costumes.length})</span>
              </div>
            }
          >
            <CostumeList 
              costumes={costumes} 
              onEdit={handleEdit} 
              onDelete={handleDelete} 
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
            aiModels={aiModels}
            selectedImageModel={selectedImageModel}
            selectedTextModel={selectedTextModel}
          />
        )}
        
        {activeTab === 'scenes' && (
          <SceneModal
            isOpen={isOpen}
            onOpenChange={onOpenChange}
            editMode={editMode}
            formData={formData}
            setFormData={setFormData}
            onSave={handleSave}
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

        {activeTab === 'costumes' && (
          <CostumeModal
            isOpen={isOpen}
            onOpenChange={onOpenChange}
            editMode={editMode}
            formData={formData}
            setFormData={setFormData}
            onSave={handleSave}
          />
        )}

        {/* 场景详情模态框 */}
        <SceneDetailModal
          isOpen={isDetailOpen}
          onClose={onDetailOpenChange}
          scene={selectedScene}
          onGenerateImage={(sceneId: number, imageModel: string) => handleGenerateSceneImage(sceneId, '', imageModel)}
          isGenerating={isGenerating}
        />

        {/* 标签分组管理模态框 */}
        <TagGroupManager
          isOpen={isTagManagerOpen}
          onOpenChange={onTagManagerOpenChange}
          tagGroups={tagGroups}
          onRefresh={loadTagGroups}
        />
      </div>
    </div>
  );
};

export default AssetsManager;
