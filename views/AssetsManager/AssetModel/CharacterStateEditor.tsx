import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Button, Input, Textarea, Modal, ModalContent, ModalHeader, ModalBody, ModalFooter, useDisclosure, Card, CardBody, Select, SelectItem, Tooltip, Chip, Popover, PopoverTrigger, PopoverContent } from '@heroui/react';
import { Plus, Edit2, Trash2, ChevronDown, ChevronRight, Image as ImageIcon, Star, Copy, RefreshCw, Shirt, Calendar, Scissors, Clock, Sparkles, User, X, Tag, Layers, Download } from 'lucide-react';
import {
  Character,
  CharacterState,
  StateCategory,
  STATE_CATEGORIES,
  fetchCharacter,
  fetchCharacterStates,
  createCharacterState,
  updateCharacterState,
  deleteCharacterState,
  deleteCharacterStateBaseModelImage,
  activateCharacterState,
  duplicateCharacterState,
  generateCharacterStateViews,
  generateConceptBreakdown,
  getCharacterViewStatus,
  downloadCharacterView,
  fetchReferenceImages,
  fetchCharacterLoadout,
  updateCharacterLoadout,
  AGE_STAGES,
  TagGroup,
  CharacterTagGroupEntry,
  TAG_GROUP_COLORS,
  createTagGroup
} from '../../../services/assets';
import { useToast } from '../../../contexts/ToastContext';
import { usePreview } from '../../../components/PreviewProvider';
import { useConfirm } from '../../../contexts/ConfirmContext';
import { useAIModels } from '../../../hooks/useAIModels';
import AIModelSelector from '../../../components/AIModelSelector';
import { getAuthToken } from '../../../services/auth';
import { generateCostumeViews, fetchCharacterCostumes, Costume } from '../../../services/costumes';

// 状态分类图标映射
const CATEGORY_ICON_MAP: Record<StateCategory, React.ElementType> = {
  daily: User,
  costume: Shirt,
  time: Clock,
  effect: Sparkles,
};

// 状态分类颜色映射（WCAG AA 双主题适配）
const CATEGORY_COLOR_MAP: Record<StateCategory, { bg: string; text: string; border: string }> = {
  daily: { bg: 'bg-blue-500/15', text: 'text-blue-700 dark:text-blue-400', border: 'border-blue-500/30' },
  costume: { bg: 'bg-pink-500/15', text: 'text-pink-700 dark:text-pink-400', border: 'border-pink-500/30' },
  time: { bg: 'bg-purple-500/15', text: 'text-purple-700 dark:text-purple-400', border: 'border-purple-500/30' },
  effect: { bg: 'bg-amber-500/15', text: 'text-amber-700 dark:text-amber-400', border: 'border-amber-500/30' },
};

// 解析标签JSON字符串
function parseTags(tagsStr?: string): string[] {
  if (!tagsStr) return [];
  try {
    const parsed = JSON.parse(tagsStr);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

// 解析状态分类（兼容旧单值字符串和新JSON数组）
function parseStateCategories(cat?: string | StateCategory | StateCategory[]): StateCategory[] {
  if (!cat) return ['daily'];
  if (Array.isArray(cat)) return cat;
  try {
    const parsed = JSON.parse(cat as string);
    if (Array.isArray(parsed)) return parsed as StateCategory[];
  } catch {}
  return [cat as StateCategory];
}

// 序列化标签数组为JSON字符串
function serializeTags(tags: string[]): string {
  return JSON.stringify(tags);
}

interface CharacterStateEditorProps {
  characterId: number | null;
  disabled?: boolean;
  onStateActivated?: (state: CharacterState) => void;
  /** 当前上下文项目ID（保留用于其它上下文相关逻辑） */
  projectId?: number | null;
  /** 标签分组列表 */
  tagGroups?: TagGroup[];
  /** 标签分组变更回调 */
  onTagGroupsChange?: () => void;
  /** 角色表单数据（用于标签分组编辑） */
  formData?: any;
  /** 更新角色表单数据 */
  setFormData?: (data: any) => void;
}

const CharacterStateEditor: React.FC<CharacterStateEditorProps> = ({
  characterId,
  disabled = false,
  onStateActivated,
  projectId = null,
  tagGroups = [],
  onTagGroupsChange,
  formData: charFormData,
  setFormData: setCharFormData
}) => {
  const [states, setStates] = useState<CharacterState[]>([]);
  const [character, setCharacter] = useState<Character | null>(null);
  const [loading, setLoading] = useState(false);
  const [expandedStates, setExpandedStates] = useState<Set<number>>(new Set());
  const [activatingId, setActivatingId] = useState<number | null>(null);
  const [duplicatingId, setDuplicatingId] = useState<number | null>(null);
  const [generatingId, setGeneratingId] = useState<number | null>(null);
  const [deletingViewsId, setDeletingViewsId] = useState<number | null>(null);
  const [regeneratingView, setRegeneratingView] = useState<{ stateId: number; view: 'front' | 'side' | 'back' } | null>(null);

  // 当前装配（T5）
  const [loadoutCostumeId, setLoadoutCostumeId] = useState<number | null>(null);
  const [loadoutExpressionId, setLoadoutExpressionId] = useState<number | null>(null);
  const [savingLoadout, setSavingLoadout] = useState(false);

  // 筛选分类状态
  const [activeCategoryFilter, setActiveCategoryFilter] = useState<StateCategory | 'all'>('all');
  
  // 使用AI模型hook
  const { models, selected, setSelected } = useAIModels(null);
  
  // AI生成对话框状态
  const [isGenerateModalOpen, setIsGenerateModalOpen] = useState(false);
  const [generatingState, setGeneratingState] = useState<CharacterState | null>(null);
  const [baseModelGenerateMode, setBaseModelGenerateMode] = useState<'design_sheet' | 'three_views'>('design_sheet');
  const [naturalLanguageInput, setNaturalLanguageInput] = useState('');
  const [analyzing, setAnalyzing] = useState(false);
  const [generatedTags, setGeneratedTags] = useState<{
    name: string;
    age_stage: string;
    outfit: string;
    hairstyle: string;
    accessories: string;
    held_props: string;
    appearance: string;
  } | null>(null);

  // 概念分解图状态
  const [isGeneratingConcept, setIsGeneratingConcept] = useState(false);
  const [conceptGenerationError, setConceptGenerationError] = useState<string | null>(null);

  // 标签分组状态
  const [selectedGroupId, setSelectedGroupId] = useState<string>('');
  const [newTagInput, setNewTagInput] = useState('');
  const [isCreatingGroup, setIsCreatingGroup] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');
  const [newGroupColor, setNewGroupColor] = useState(TAG_GROUP_COLORS[0]);

  // 道具叠加弹窗状态
  const [equipPropModalOpen, setEquipPropModalOpen] = useState(false);
  const [equippingState, setEquippingState] = useState<CharacterState | null>(null);
  const [projectProps, setProjectProps] = useState<Array<{ id: number; name: string; image_url: string; prop_type: string }>>([]);
  const [selectedPropId, setSelectedPropId] = useState<string>('');
  const [handPosition, setHandPosition] = useState<string>('right');
  const [usageMode, setUsageMode] = useState<string>('hold');
  const [equipping, setEquipping] = useState(false);

  // 角色服装列表
  const [characterCostumes, setCharacterCostumes] = useState<(Costume & { is_equipped: boolean })[]>([]);

  // 编辑状态表单
  const [editingState, setEditingState] = useState<CharacterState | null>(null);
  const [formData, setFormData] = useState<Partial<CharacterState> & { tagInput?: string; costume_id?: number | null }>({
    name: '',
    description: '',
    appearance: '',
    image_url: '',
    front_view_url: '',
    side_view_url: '',
    back_view_url: '',
    outfit: '',
    age_stage: '',
    hairstyle: '',
    accessories: '',
    held_props: '',
    is_active: false,
    state_category: 'daily',
    tags: '[]',
    tagInput: '',
    use_reference_images: true,
    costume_id: null
  });
  
  const { showToast } = useToast();
    const { openPreview } = usePreview();
  const { confirm } = useConfirm();
  const { isOpen, onOpen, onOpenChange } = useDisclosure();

  // 加载角色详情和状态列表
  const loadStates = useCallback(async () => {
    if (!characterId) return;
    setLoading(true);
    try {
      const [characterData, statesData, loadoutData, costumesData] = await Promise.all([
        fetchCharacter(characterId),
        fetchCharacterStates(characterId),
        fetchCharacterLoadout(characterId).catch(() => null),
        fetchCharacterCostumes(characterId).catch(() => ({ costumes: [], characterGender: '' })),
      ]);
      setCharacter(characterData);
      setStates(statesData);
      setCharacterCostumes(costumesData.costumes || []);
      if (loadoutData?.loadout) {
        setLoadoutCostumeId(loadoutData.loadout.costumeStateId);
        setLoadoutExpressionId(loadoutData.loadout.expressionStateId);
      }
    } catch (error: any) {
      console.error('加载角色数据失败:', error);
    } finally {
      setLoading(false);
    }
  }, [characterId, projectId]);

  useEffect(() => {
    loadStates();
  }, [loadStates]);

  // 按分类筛选状态（白膜始终置顶）
  const filteredStates = useMemo(() => {
    let result = states;
    if (activeCategoryFilter !== 'all') {
      result = states.filter(s => parseStateCategories(s.state_category).includes(activeCategoryFilter as StateCategory));
    }
    // 白膜状态始终置顶
    return [...result].sort((a, b) => {
      if (a.is_base_model && !b.is_base_model) return -1;
      if (!a.is_base_model && b.is_base_model) return 1;
      return (a.sort_order || 0) - (b.sort_order || 0);
    });
  }, [states, activeCategoryFilter]);

  // 各分类状态数量（一个状态可归属多个分类）
  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = { all: states.length };
    STATE_CATEGORIES.forEach(cat => {
      counts[cat.key] = states.filter(s => parseStateCategories(s.state_category).includes(cat.key)).length;
    });
    return counts;
  }, [states]);

  // 切换展开状态
  const toggleExpand = (stateId: number) => {
    setExpandedStates(prev => {
      const newSet = new Set(prev);
      if (newSet.has(stateId)) {
        newSet.delete(stateId);
      } else {
        newSet.add(stateId);
      }
      return newSet;
    });
  };

  // 打开新建弹窗
  const handleCreate = (presetCategory?: StateCategory) => {
    setEditingState(null);
    setFormData({
      name: '',
      description: '',
      appearance: '',
      image_url: '',
      front_view_url: '',
      side_view_url: '',
      back_view_url: '',
      outfit: '',
      age_stage: '',
      hairstyle: '',
      accessories: '',
      held_props: '',
      is_active: false,
      state_category: presetCategory ? [presetCategory] : ['daily'],
      tags: '[]',
      tagInput: '',
      costume_id: null
    });
    onOpen();
  };

  // 基于白膜创建新状态
  const handleCreateFromBaseModel = () => {
    const baseModel = states.find(s => s.is_base_model);
    setEditingState(null);
    setFormData({
      name: '',
      description: '',
      appearance: baseModel?.appearance || character?.appearance || '',
      image_url: '',
      front_view_url: '',
      side_view_url: '',
      back_view_url: '',
      outfit: baseModel?.outfit || '',
      age_stage: baseModel?.age_stage || '',
      hairstyle: baseModel?.hairstyle || '',
      accessories: baseModel?.accessories || '',
      held_props: '',
      is_active: false,
      state_category: ['daily'],
      tags: '[]',
      tagInput: '',
      costume_id: null
    });
    onOpen();
  };

  // 打开编辑弹窗
  const handleEdit = (state: CharacterState) => {
    setEditingState(state);
    setFormData({
      name: state.name,
      description: state.description,
      appearance: state.appearance,
      image_url: state.image_url,
      front_view_url: state.front_view_url,
      side_view_url: state.side_view_url,
      back_view_url: state.back_view_url,
      outfit: state.outfit || '',
      age_stage: state.age_stage || '',
      hairstyle: state.hairstyle || '',
      accessories: state.accessories || '',
      held_props: state.held_props || '',
      is_active: state.is_active || false,
      state_category: parseStateCategories(state.state_category),
      tags: state.tags || '[]',
      tagInput: '',
      use_reference_images: state.use_reference_images !== false,
      costume_id: (state as any).costume_id || null
    });
    onOpen();
  };

  // 添加标签
  const handleAddTag = () => {
    const input = formData.tagInput?.trim();
    if (!input) return;
    const currentTags = parseTags(formData.tags);
    if (currentTags.includes(input)) {
      showToast('标签已存在', 'error');
      return;
    }
    const newTags = [...currentTags, input];
    setFormData({ ...formData, tags: serializeTags(newTags), tagInput: '' });
  };

  // 删除标签
  const handleRemoveTag = (tag: string) => {
    const currentTags = parseTags(formData.tags);
    const newTags = currentTags.filter(t => t !== tag);
    setFormData({ ...formData, tags: serializeTags(newTags) });
  };

  // 保存状态（支持保存后直接重新生成）
  const handleSave = async (andRegenerate = false) => {
    if (!formData.name?.trim()) {
      showToast('状态名称不能为空', 'error');
      return false;
    }

    try {
      const saveData = { ...formData };
      delete (saveData as any).tagInput;

      // 自动推断状态分类
      const cats: string[] = [];
      if (saveData.costume_id || saveData.outfit) cats.push('costume');
      if (saveData.body_elements) cats.push('effect');
      if (cats.length === 0) cats.push('daily');
      (saveData as any).state_category = cats;

      // 防御性清洗：tags 为 JSON 数组字符串
      const rawTags = (saveData as any).tags;
      if (Array.isArray(rawTags)) {
        (saveData as any).tags = JSON.stringify(rawTags);
      } else if (typeof rawTags !== 'string') {
        (saveData as any).tags = '[]';
      }

      if (editingState) {
        await updateCharacterState(characterId!, editingState.id, saveData);
        showToast(andRegenerate ? '外貌属性已保存，正在启动生成...' : '状态更新成功', 'success');
      } else {
        await createCharacterState(characterId!, saveData);
        showToast('状态创建成功', 'success');
      }
      await loadStates();
      onOpenChange();

      // 保存成功后触发重新生成
      if (andRegenerate && editingState) {
        handleGenerateViews({ ...editingState, ...formData } as CharacterState);
      }
      return true;
    } catch (error: any) {
      showToast(error.message, 'error');
      return false;
    }
  };

  // 删除状态
  const handleDelete = async (state: CharacterState) => {
    if (state.is_base_model) {
      showToast('基础白膜状态不可删除', 'error');
      return;
    }
    const confirmed = await confirm({
      title: '删除确认',
      message: `确定要删除状态「${state.name}」吗？该状态下的所有参考图也会被删除。`,
      type: 'danger',
      confirmText: '删除'
    });
    if (!confirmed) return;

    try {
      await deleteCharacterState(characterId!, state.id);
      await loadStates();
      showToast('状态删除成功', 'success');
    } catch (error: any) {
      showToast(error.message, 'error');
    }
  };

  // 激活状态
  const handleActivate = async (state: CharacterState) => {
    if (state.is_active) return;
    
    setActivatingId(state.id);
    try {
      const updatedState = await activateCharacterState(characterId!, state.id);
      await loadStates();
      showToast(`已切换到「${state.name}」状态`, 'success');
      onStateActivated?.(updatedState);
    } catch (error: any) {
      showToast(error.message, 'error');
    } finally {
      setActivatingId(null);
    }
  };

  // 复制状态
  const handleDuplicate = async (state: CharacterState) => {
    setDuplicatingId(state.id);
    try {
      await duplicateCharacterState(characterId!, state.id);
      await loadStates();
      showToast('状态复制成功，可编辑新状态', 'success');
    } catch (error: any) {
      showToast(error.message, 'error');
    } finally {
      setDuplicatingId(null);
    }
  };

  // 打开AI生成对话框
  const openGenerateModal = (state: CharacterState) => {
    setGeneratingState(state);
    setNaturalLanguageInput('');
    setGeneratedTags(null);
    setIsGenerateModalOpen(true);
  };

  // AI分析自然语言描述
  const analyzeDescription = async () => {
    if (!naturalLanguageInput.trim()) {
      showToast('请输入状态描述', 'error');
      return;
    }
    if (!selected.text) {
      showToast('请先选择文本分析模型', 'error');
      return;
    }

    setAnalyzing(true);
    try {
      const token = getAuthToken();
      const response = await fetch(`/api/characters/${characterId}/states/analyze`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        },
        body: JSON.stringify({
          description: naturalLanguageInput,
          characterName: character?.name,
          characterAppearance: character?.appearance,
          textModel: selected.text
        })
      });

      if (!response.ok) {
        throw new Error('分析失败');
      }

      const data = await response.json();
      setGeneratedTags(data.tags);
      showToast('分析完成', 'success');
    } catch (error: any) {
      showToast(error.message || '分析失败', 'error');
    } finally {
      setAnalyzing(false);
    }
  };

  // 确认生成图片
  const confirmGenerate = async () => {
    if (!generatingState || !selected.image) {
      showToast('请选择图像生成模型', 'error');
      return;
    }

    // 白膜生成无前置条件限制，有参考图就用、没有就纯描述生成

    setGeneratingId(generatingState.id);
    setIsGenerateModalOpen(false);
    
    try {
      // 白膜直接生成，非白膜先保存AI分析出的外貌属性
      if (!generatingState.is_base_model && generatedTags) {
        await updateCharacterState(characterId!, generatingState.id, {
          name: generatedTags.name || generatingState.name,
          age_stage: generatedTags.age_stage,
          outfit: generatedTags.outfit,
          hairstyle: generatedTags.hairstyle,
          accessories: generatedTags.accessories,
          held_props: generatedTags.held_props || '',
          appearance: generatedTags.appearance
        });
      }

      // 调用状态级别三视图生成API（后端会自动组装外貌属性）
      const generateParams: any = {
        imageModel: selected.image,
        textModel: selected.text || undefined
      };
      // 白膜状态：根据模式传递 generateMode
      if (generatingState.is_base_model && baseModelGenerateMode === 'three_views') {
        generateParams.generateMode = 'three_views';
      }
      await generateCharacterStateViews(characterId!, generatingState.id, generateParams);
      
      showToast(
        generatingState.is_base_model && baseModelGenerateMode !== 'three_views'
          ? '角色设定图生成任务已启动' 
          : '三视图生成任务已启动',
        'success'
      );
      await loadStates();
      pollGenerationStatus(generatingState.id);
    } catch (error: any) {
      showToast(error.message || '生成失败', 'error');
      setGeneratingId(null);
    }
  };

  // 原有的AI生成函数（用于已有状态的重新生成）
  // 关键修复：重新生成前先保存当前状态的外貌属性，确保修改能反映到生成结果
  const handleGenerateViews = async (state: CharacterState) => {
    if (!selected.image) {
      showToast('请先选择图像生成模型', 'error');
      return;
    }
    
    setGeneratingId(state.id);
    try {
      // 先保存当前状态的外貌属性，确保最新数据传给后端
      // 后端的 scopeResolver 会从数据库读取最新状态数据来组装提示词
      await updateCharacterState(characterId!, state.id, {
        appearance: state.appearance,
        outfit: state.outfit,
        hairstyle: state.hairstyle,
        accessories: state.accessories,
        age_stage: state.age_stage,
        body_elements: state.body_elements,
        held_props: state.held_props || ''
      });

      const hasExistingViews = !!(state.front_view_url || state.side_view_url || state.back_view_url);
      await generateCharacterStateViews(characterId!, state.id, {
        imageModel: selected.image,
        textModel: selected.text || undefined,
        regenerateOnly: hasExistingViews ? ['front', 'side', 'back'] : undefined
      });
      showToast('三视图生成任务已启动', 'success');
      await loadStates();
      pollGenerationStatus(state.id);
    } catch (error: any) {
      // 服装未就绪时给出引导提示
      if (error?.code === 'COSTUME_NOT_READY') {
        showToast(error.message || '服装设定图尚未生成', 'warning');
      } else {
        showToast(error.message || '生成失败', 'error');
      }
      setGeneratingId(null);
    }
  };

  // 单独重新生成某一个视图
  const handleRegenerateSingleView = async (state: CharacterState, view: 'front' | 'side' | 'back') => {
    if (!selected.image) {
      showToast('请先选择图像生成模型', 'error');
      return;
    }
    setRegeneratingView({ stateId: state.id, view });
    try {
      await updateCharacterState(characterId!, state.id, {
        appearance: state.appearance,
        outfit: state.outfit,
        hairstyle: state.hairstyle,
        accessories: state.accessories,
        age_stage: state.age_stage,
        body_elements: state.body_elements,
        held_props: state.held_props || ''
      });
      await generateCharacterStateViews(characterId!, state.id, {
        imageModel: selected.image,
        textModel: selected.text || undefined,
        regenerateOnly: [view]
      });
      showToast(`${view === 'front' ? '正面' : view === 'side' ? '侧面' : '背面'}视图重新生成已启动`, 'success');
      await loadStates();
      pollGenerationStatus(state.id);
    } catch (error: any) {
      if (error?.code === 'COSTUME_NOT_READY') {
        showToast(error.message || '服装设定图尚未生成', 'warning');
      } else {
        showToast(error.message || '生成失败', 'error');
      }
      setRegeneratingView(null);
    }
  };

  // 快速生成关联服装的设定图
  const handleGenerateCostume = async (costumeId: number, costumeName?: string) => {
    if (!selected.image) {
      showToast('请先选择图像生成模型', 'error');
      return;
    }
    try {
      await generateCostumeViews(costumeId, {
        imageModel: selected.image,
        textModel: selected.text || undefined
      });
      showToast(`「${costumeName || '服装'}」设定图生成已启动`, 'success');
      await loadStates();
    } catch (error: any) {
      showToast(error.message || '服装设定图生成失败', 'error');
    }
  };

  // 道具叠加弹窗
  const openEquipPropModal = async (state: CharacterState) => {
    setEquippingState(state);
    setSelectedPropId('');
    setHandPosition('right');
    setUsageMode('hold');
    setEquipPropModalOpen(true);
    // 加载项目道具列表（永久道具）
    try {
      const token = getAuthToken();
      const projectId = character?.project_id;
      if (!projectId) return;
      const res = await fetch(`/api/props/project/${projectId}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        // 过滤出永久道具且未叠加的
        const equippedIds = new Set(state.equipped_props?.map(ep => ep.prop_id) || []);
        setProjectProps((data.props || []).filter((p: any) => p.prop_type === 'permanent' && !equippedIds.has(p.id)));
      }
    } catch (err) {
      console.error('加载项目道具失败:', err);
    }
  };

  const handleEquipProp = async () => {
    if (!equippingState || !selectedPropId) return;
    setEquipping(true);
    try {
      const token = getAuthToken();
      const res = await fetch(`/api/characters/${characterId}/states/${equippingState.id}/props`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          propId: Number(selectedPropId),
          handPosition,
          usageMode
        })
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.message || '叠加道具失败');
      }
      showToast('道具叠加成功', 'success');
      setEquipPropModalOpen(false);
      await loadStates();
    } catch (error: any) {
      showToast(error.message || '叠加道具失败', 'error');
    } finally {
      setEquipping(false);
    }
  };

  const handleUnequipProp = async (state: CharacterState, propId: number) => {
    try {
      const token = getAuthToken();
      const res = await fetch(`/api/characters/${characterId}/states/${state.id}/props/${propId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.message || '解绑道具失败');
      }
      showToast('道具已解绑', 'success');
      await loadStates();
    } catch (error: any) {
      showToast(error.message || '解绑道具失败', 'error');
    }
  };

  // 删除当前状态的三视图（清空 front/side/back URL，不删除状态本身）
  const handleDeleteViews = async (state: CharacterState) => {
    if (deletingViewsId) return;
    setDeletingViewsId(state.id);
    try {
      await updateCharacterState(characterId!, state.id, {
        front_view_url: '',
        side_view_url: '',
        back_view_url: '',
        image_url: '',
        generation_status: 'idle'
      });
      showToast('三视图已删除', 'success');
      await loadStates();
    } catch (error: any) {
      showToast(error.message || '删除三视图失败', 'error');
    } finally {
      setDeletingViewsId(null);
    }
  };

  // 轮询生成状态
  const pollGenerationStatus = async (stateId: number) => {
    const maxAttempts = 60;
    let attempts = 0;

    const checkStatus = async () => {
      try {
        const states = await fetchCharacterStates(characterId!);
        const state = states.find(s => s.id === stateId);

        if (state?.generation_status === 'completed') {
          setStates(states);
          setGeneratingId(null);
          setRegeneratingView(null);
          showToast('三视图生成完成', 'success');
          return;
        } else if (state?.generation_status === 'failed') {
          setGeneratingId(null);
          setRegeneratingView(null);
          showToast('三视图生成失败', 'error');
          return;
        }

        attempts++;
        if (attempts < maxAttempts) {
          setTimeout(checkStatus, 5000);
        } else {
          setGeneratingId(null);
          setRegeneratingView(null);
          showToast('生成超时，请稍后刷新查看', 'warning');
        }
      } catch (error) {
        setGeneratingId(null);
        setRegeneratingView(null);
        console.error('轮询生成状态失败:', error);
      }
    };

    checkStatus();
  };

  // ─── 概念分解图（角色级，展示在白膜状态卡） ───────────────────────────
  const handleGenerateConcept = useCallback(async () => {
    if (!characterId) return;
    if (!selected.image) {
      showToast('请先选择图像生成模型', 'error');
      return;
    }
    setIsGeneratingConcept(true);
    setConceptGenerationError(null);
    try {
      await generateConceptBreakdown(characterId, {
        imageModel: selected.image,
        textModel: selected.text || undefined
      });
      // 轮询概念分解图状态
      const poll = async (attempts = 0) => {
        if (attempts > 60) {
          setIsGeneratingConcept(false);
          showToast('概念分解图生成超时', 'warning');
          return;
        }
        try {
          const result = await getCharacterViewStatus(characterId);
          const status = result.conceptStatus || 'idle';
          if (status === 'completed') {
            setIsGeneratingConcept(false);
            // 重新加载角色数据以获取概念图 URL
            const ch = await fetchCharacter(characterId);
            setCharacter(ch);
            showToast('概念分解图生成完成', 'success');
            return;
          }
          if (status === 'failed') {
            setIsGeneratingConcept(false);
            setConceptGenerationError('生成失败，请重试');
            return;
          }
          setTimeout(() => poll(attempts + 1), 3000);
        } catch {
          setIsGeneratingConcept(false);
        }
      };
      poll();
    } catch (error: any) {
      setIsGeneratingConcept(false);
      setConceptGenerationError(error.message || '启动概念分解图生成失败');
    }
  }, [characterId, selected.image, selected.text, showToast]);

  // ─── 标签分组管理 ─────────────────────────────────────────
  const getTagGroupsJson = (): CharacterTagGroupEntry[] => {
    return charFormData?.tag_groups_json || [];
  };

  const handleAddGroupTag = () => {
    if (!selectedGroupId || !newTagInput.trim() || !setCharFormData || !charFormData) return;
    const groupId = parseInt(selectedGroupId);
    const group = tagGroups.find(g => g.id === groupId);
    if (!group) return;
    const tagName = newTagInput.trim();
    const currentGroups = getTagGroupsJson();
    const existingEntry = currentGroups.find(e => e.groupId === groupId);
    let newGroups: CharacterTagGroupEntry[];
    if (existingEntry) {
      if (existingEntry.tags.includes(tagName)) { setNewTagInput(''); return; }
      newGroups = currentGroups.map(e => e.groupId === groupId ? { ...e, tags: [...e.tags, tagName] } : e);
    } else {
      newGroups = [...currentGroups, { groupId, groupName: group.name, tags: [tagName] }];
    }
    setCharFormData({ ...charFormData, tag_groups_json: newGroups });
    setNewTagInput('');
  };

  const handleRemoveGroupTag = (groupId: number, tagName: string) => {
    if (!setCharFormData || !charFormData) return;
    const currentGroups = getTagGroupsJson();
    const newGroups = currentGroups
      .map(e => e.groupId === groupId ? { ...e, tags: e.tags.filter(t => t !== tagName) } : e)
      .filter(e => e.tags.length > 0);
    setCharFormData({ ...charFormData, tag_groups_json: newGroups });
  };

  const handleCreateGroup = async () => {
    if (!newGroupName.trim()) return;
    try {
      await createTagGroup({ name: newGroupName.trim(), color: newGroupColor });
      setNewGroupName('');
      setNewGroupColor(TAG_GROUP_COLORS[0]);
      setIsCreatingGroup(false);
      onTagGroupsChange?.();
    } catch (error: any) {
      console.error('创建分组失败:', error);
    }
  };

  const getGroupColor = (groupId: number): string => {
    const group = tagGroups.find(g => g.id === groupId);
    return group?.color || '#6366f1';
  };

  const handleGroupTagInputKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') { e.preventDefault(); handleAddGroupTag(); }
  };

  // 渲染分类标签（支持多分类）
  const renderCategoryChip = (category: StateCategory | StateCategory[] | string, size: 'sm' | 'md' = 'sm') => {
    const cats = parseStateCategories(category as any);
    return (
      <>
        {cats.map(cat => {
          const config = STATE_CATEGORIES.find(c => c.key === cat) || STATE_CATEGORIES[0];
          const colors = CATEGORY_COLOR_MAP[cat] || CATEGORY_COLOR_MAP.daily;
          const IconComp = CATEGORY_ICON_MAP[cat] || CATEGORY_ICON_MAP.daily;
          return (
            <span key={cat} className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-${size === 'sm' ? 'xs' : 'sm'} ${colors.bg} ${colors.text} ${colors.border} border`}>
              <IconComp className={`w-${size === 'sm' ? '3' : '4'} h-${size === 'sm' ? '3' : '4'}`} />
              {config.label}
            </span>
          );
        })}
      </>
    );
  };

  if (!characterId) {
    return (
      <div className="text-center py-8 text-default-400">
        <ImageIcon className="w-12 h-12 mx-auto mb-2 opacity-30" />
        <p className="text-sm">请先保存角色后再管理状态</p>
      </div>
    );
  }

  // 白膜状态
  const baseModelState = states.find(s => s.is_base_model);
  // 白膜是否就绪：必须已生成正面三视图
  const baseModelReady = !!(baseModelState && (baseModelState.front_view_url || baseModelState.image_url));

  return (
    <div className="space-y-4">
      {/* 头部 */}
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-medium flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
          <ImageIcon className="w-4 h-4" />
          角色状态
          {states.length > 0 && (
            <span className="text-xs" style={{ color: 'var(--text-muted)' }}>({states.length})</span>
          )}
        </h4>
        {!disabled && (
          <div className="flex items-center gap-2">
            {/* 所有新建状态统一基于白膜创建 */}
            <Button
              size="sm"
              variant="flat"
              className="bg-amber-500/10 text-amber-700 dark:text-amber-400 hover:bg-amber-500/20"
              startContent={<Star className="w-3 h-3" />}
              isDisabled={!baseModelReady}
              onPress={handleCreateFromBaseModel}
              title={baseModelReady ? '基于白膜新建状态' : '请先生成白膜角色设定图再新建状态/服装'}
            >
              基于白膜新建
            </Button>
          </div>
        )}
      </div>

      {/* 白膜未就绪提示 */}
      {!disabled && !baseModelReady && (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-xs text-amber-700 dark:text-amber-400">
          当前角色的白膜设定图尚未生成，请先在「白膜」区域生成角色设定图，再进行服装/状态创建与三视图生成。
        </div>
      )}

      {/* 当前装配（当前服装 / 当前状态）UI 已移除：
          根据产品决策，角色的当前装配 / 表情不再在资源中预设，改由工作台（导演空间）在分镜时自由选择 */}

      {/* 分类筛选栏 */}
      {states.length > 0 && (
        <div className="flex items-center gap-1.5 flex-wrap">
          <button
            className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${
              activeCategoryFilter === 'all'
                ? 'bg-default-200 text-default-700'
                : 'text-default-400 hover:text-default-600 hover:bg-default-100'
            }`}
            onClick={() => setActiveCategoryFilter('all')}
          >
            全部 ({categoryCounts.all})
          </button>
          {STATE_CATEGORIES.map(cat => {
            const count = categoryCounts[cat.key] || 0;
            const colors = CATEGORY_COLOR_MAP[cat.key] || CATEGORY_COLOR_MAP.daily;
            return (
              <button
                key={cat.key}
                className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors flex items-center gap-1 ${
                  activeCategoryFilter === cat.key
                    ? `${colors.bg} ${colors.text}`
                    : 'text-default-400 hover:text-default-600 hover:bg-default-100'
                }`}
                onClick={() => setActiveCategoryFilter(cat.key)}
              >
                {React.createElement(CATEGORY_ICON_MAP[cat.key], { className: 'w-3 h-3' })}
                {cat.label} ({count})
              </button>
            );
          })}
        </div>
      )}

      {/* 白膜状态卡片（置顶特殊展示） */}
      {baseModelState && activeCategoryFilter === 'all' && (
        <Card className="border border-amber-500/30 ring-1 ring-amber-500/10" style={{ background: 'var(--bg-elevated)' }}>
          <CardBody className="p-0">
            <div
              className="flex items-center gap-3 p-3 cursor-pointer hover:bg-amber-500/5 transition-colors"
              onClick={() => toggleExpand(baseModelState.id)}
            >
              {expandedStates.has(baseModelState.id) ? (
                <ChevronDown className="w-4 h-4 text-amber-600 dark:text-amber-400" />
              ) : (
                <ChevronRight className="w-4 h-4 text-amber-600 dark:text-amber-400" />
              )}
              
              {/* 白膜标识 */}
              <div className="relative">
                {(baseModelState.image_url || baseModelState.front_view_url || character?.image_url || character?.front_view_url) ? (
                  <img
                    src={baseModelState.image_url || baseModelState.front_view_url || character?.image_url || character?.front_view_url}
                    alt={baseModelState.name}
                    className="w-12 h-12 rounded-lg object-cover border border-amber-500/40"
                  />
                ) : (
                  <div className="w-12 h-12 rounded-lg bg-amber-500/10 flex items-center justify-center border border-amber-500/30">
                    <Star className="w-5 h-5 text-amber-600 dark:text-amber-400" />
                  </div>
                )}
                <div className="absolute -top-1 -right-1 w-5 h-5 bg-amber-500 rounded-full flex items-center justify-center">
                  <Star className="w-3 h-3 text-white fill-white" />
                </div>
              </div>
              
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-amber-700 dark:text-amber-300">
                    {baseModelState.name}
                  </span>
                  <span className="text-xs px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-700 dark:text-amber-400 border border-amber-500/30">
                    白膜
                  </span>
                  {renderCategoryChip(baseModelState.state_category || ['daily'])}
                </div>
                <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
                  {baseModelState.front_view_url 
                    ? '基础白膜状态 - 其他状态图片将以白膜为参考基准生成'
                    : '基础白膜 - 可先生成其他状态，再用已有图片反向生成白膜'}
                </p>
              </div>
              
              {/* 操作按钮 */}
              {!disabled && (
                <div className="flex gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
                  <Tooltip content={baseModelReady ? '基于白膜创建新状态' : '请先完成白膜三视图再新建状态'}>
                    <Button
                      size="sm"
                      isIconOnly
                      variant="light"
                      className="text-default-400 hover:text-amber-600 dark:hover:text-amber-400 hover:bg-amber-500/10"
                      isDisabled={!baseModelReady}
                      onPress={handleCreateFromBaseModel}
                    >
                      <Plus className="w-3.5 h-3.5" />
                    </Button>
                  </Tooltip>
                  <Tooltip content="编辑白膜">
                    <Button
                      size="sm"
                      isIconOnly
                      variant="light"
                      className="text-default-400 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-blue-500/10"
                      onPress={() => handleEdit(baseModelState)}
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                    </Button>
                  </Tooltip>
                </div>
              )}
            </div>
            
            {/* 白膜展开内容 */}
            {expandedStates.has(baseModelState.id) && (
              <div className="px-4 pb-4 pt-2 border-t border-amber-500/20 space-y-3">
                {/* 白膜外观属性 */}
                {(baseModelState.outfit || baseModelState.age_stage || baseModelState.hairstyle || baseModelState.accessories) && (
                  <div className="grid grid-cols-2 gap-2">
                    {baseModelState.age_stage && (
                      <div className="bg-purple-500/10 rounded-lg p-2 border border-purple-500/20">
                        <div className="flex items-center gap-1.5 text-xs text-purple-700 dark:text-purple-400 mb-0.5">
                          <Calendar className="w-3 h-3" />
                          年龄阶段
                        </div>
                        <p className="text-sm" style={{ color: 'var(--text-primary)' }}>{baseModelState.age_stage}</p>
                      </div>
                    )}
                    {baseModelState.outfit && (
                      <div className="bg-pink-500/10 rounded-lg p-2 border border-pink-500/20">
                        <div className="flex items-center gap-1.5 text-xs text-pink-700 dark:text-pink-400 mb-0.5">
                          <Shirt className="w-3 h-3" />
                          服装
                        </div>
                        <p className="text-sm truncate" style={{ color: 'var(--text-primary)' }}>{baseModelState.outfit}</p>
                      </div>
                    )}
                    {baseModelState.hairstyle && (
                      <div className="bg-cyan-500/10 rounded-lg p-2 border border-cyan-500/20">
                        <div className="flex items-center gap-1.5 text-xs text-cyan-700 dark:text-cyan-400 mb-0.5">
                          <Scissors className="w-3 h-3" />
                          发型
                        </div>
                        <p className="text-sm truncate" style={{ color: 'var(--text-primary)' }}>{baseModelState.hairstyle}</p>
                      </div>
                    )}
                    {baseModelState.accessories && (
                      <div className="bg-amber-500/10 rounded-lg p-2 border border-amber-500/20">
                        <div className="flex items-center gap-1.5 text-xs text-amber-700 dark:text-amber-400 mb-0.5">
                          <Star className="w-3 h-3" />
                          配饰
                        </div>
                        <p className="text-sm truncate" style={{ color: 'var(--text-primary)' }}>{baseModelState.accessories}</p>
                      </div>
                    )}
                  </div>
                )}
                
                {baseModelState.appearance && (
                  <div className="bg-blue-500/5 rounded-lg p-3 border border-blue-500/20">
                    <h5 className="text-xs font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>外貌特征</h5>
                    <p className="text-sm whitespace-pre-wrap" style={{ color: 'var(--text-primary)' }}>{baseModelState.appearance}</p>
                  </div>
                )}

                {/* 角色设定图 */}
                {(baseModelState.image_url || baseModelState.generation_status === 'generating') && (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <h5 className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>角色设定图</h5>
                      <div className="flex items-center gap-2">
                        {baseModelState.generation_status === 'generating' && (
                          <span className="text-xs text-amber-600 dark:text-amber-400 flex items-center gap-1">
                            <RefreshCw className="w-3 h-3 animate-spin" />
                            生成中...
                          </span>
                        )}
                        {!disabled && baseModelState.image_url && baseModelState.generation_status !== 'generating' && (
                          <Tooltip content="删除当前白膜设定图，稍后可重新生成">
                            <Button
                              size="sm"
                              isIconOnly
                              variant="light"
                              className="text-default-400 hover:text-danger hover:bg-danger-50 h-6 w-6 min-w-6"
                              onPress={async () => {
                                try {
                                  const updated = await deleteCharacterStateBaseModelImage(characterId!, baseModelState.id);
                                  setStates(prev => prev.map(s => s.id === baseModelState.id ? { ...s, ...updated } : s));
                                  setCharacter(prev => prev ? { ...prev, image_url: '', character_sheet_url: '' } : prev);
                                  showToast('白膜设定图已删除，可重新生成', 'success');
                                } catch (err: any) {
                                  showToast(err.message || '删除失败', 'error');
                                }
                              }}
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </Button>
                          </Tooltip>
                        )}
                      </div>
                    </div>
                    {baseModelState.image_url ? (
                      <div
                        className="rounded-lg overflow-hidden cursor-pointer hover:opacity-90 transition-opacity"
                        style={{ border: '1px solid var(--border-color)' }}
                        onClick={() => openPreview([{ src: baseModelState.image_url!, alt: '角色设定图' }], 0)}
                      >
                        <img src={baseModelState.image_url} alt="角色设定图" className="w-full object-contain" style={{ maxHeight: '300px' }} />
                      </div>
                    ) : (
                      <div className="aspect-video rounded-lg flex items-center justify-center" style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-color)' }}>
                        <ImageIcon className="w-8 h-8 text-default-300" />
                      </div>
                    )}
                  </div>
                )}


                
                {/* AI生成三视图按钮 */}
                {!disabled && baseModelState.generation_status !== 'generating' && (
                  <div className="space-y-2">
                    {/* 白膜无图时显示提示 */}
                    {!baseModelState.image_url && (
                      <div className="p-2.5 rounded-lg bg-amber-500/5 border border-amber-500/20">
                        <p className="text-xs text-amber-700 dark:text-amber-400 leading-relaxed">
                          白膜是角色的基础形态参考。点击下方按钮生成角色设定图（含正/侧/背三视角），
                          生成其他状态图片时会以白膜为基准保持一致性。
                        </p>
                      </div>
                    )}
                    <Button
                      size="sm"
                      color="primary"
                      variant="flat"
                      className="w-full bg-linear-to-r from-amber-500/20 to-purple-500/20 text-amber-700 dark:text-amber-300 border border-amber-500/30"
                      startContent={<RefreshCw className="w-4 h-4" />}
                      onPress={() => { setBaseModelGenerateMode('design_sheet'); openGenerateModal(baseModelState); }}
                      isLoading={generatingId === baseModelState.id}
                    >
                      {baseModelState.image_url ? '重新生成角色设定图' : 'AI生成角色设定图'}
                    </Button>

                  </div>
                )}
                
                {/* 参考图提示 */}
                <div className="rounded-lg p-3" style={{ backgroundColor: 'var(--bg-secondary)' }}>
                  <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                    白膜生成将自动使用角色「参考图」Tab 中的图片作为参考，请在角色编辑的参考图页面上传和管理参考图。
                  </p>
                </div>

                {/* 身体元素（白膜专用） */}
                {!disabled && (
                  <div>
                    <h5 className="text-xs font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>
                      身体元素
                    </h5>
                    <p className="text-xs mb-2" style={{ color: 'var(--text-muted)' }}>
                      描述角色身体上的永久性标记，如纹身、疤痕、胎记等，生成白膜时会体现
                    </p>
                    <Textarea
                      size="sm"
                      placeholder="例: 左臂有龙纹身、右眼下方有一道疤痕、后背有大面积火焰纹身"
                      defaultValue={baseModelState.body_elements || ''}
                      onBlur={async (e) => {
                        const newValue = (e.target as unknown as HTMLTextAreaElement).value;
                        if (newValue !== (baseModelState.body_elements || '')) {
                          try {
                            await updateCharacterState(characterId!, baseModelState.id, { body_elements: newValue });
                            // 更新本地 states 缓存
                            setStates(prev => prev.map(s => s.id === baseModelState.id ? { ...s, body_elements: newValue } : s));
                          } catch (err: any) {
                            showToast(err.message || '保存身体元素失败', 'error');
                          }
                        }
                      }}
                      minRows={2}
                      maxRows={4}
                    />
                  </div>
                )}

              </div>
            )}
          </CardBody>
        </Card>
      )}

      {/* 标签分组管理 UI 已移除：基础信息 Tab 的标签即可满足管理/搜索分类需求 */}

      {/* 其他状态列表 */}
      {loading ? (
        <div className="text-center py-4 text-sm" style={{ color: 'var(--text-secondary)' }}>
          加载中...
        </div>
      ) : filteredStates.filter(s => !s.is_base_model).length === 0 ? (
        <div className="text-center py-6 rounded-lg" style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-color)' }}>
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>暂无其他状态</p>
          <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>可添加角色的不同时期、服装或场景状态版本</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filteredStates.filter(s => !s.is_base_model).map((state) => {
            const isExpanded = expandedStates.has(state.id);
            const hasViews = !!(state.front_view_url || state.side_view_url || state.back_view_url);
            const isActive = state.is_active;
            const hasOutfitInfo = !!(state.outfit || state.age_stage || state.hairstyle);
            const stateTags = parseTags(state.tags);
            const categories = parseStateCategories(state.state_category);
            const primaryCategory = categories[0] || 'daily';
            const colors = CATEGORY_COLOR_MAP[primaryCategory] || CATEGORY_COLOR_MAP.daily;
            
            return (
              <Card 
                key={state.id} 
                className={`border transition-all ${
                  isActive 
                    ? 'border-amber-500/50 ring-1 ring-amber-500/20' 
                    : `hover:${colors.border}`
                }`}
                style={{ background: 'var(--bg-elevated)', borderColor: isActive ? undefined : 'var(--border-color)' }}
              >
                <CardBody className="p-0">
                  {/* 状态头部 */}
                  <div
                    className="flex items-center gap-2 p-3 cursor-pointer hover:bg-default-100 transition-colors"
                    onClick={() => toggleExpand(state.id)}
                  >
                    {isExpanded ? (
                      <ChevronDown className="w-4 h-4 text-default-400" />
                    ) : (
                      <ChevronRight className="w-4 h-4 text-default-400" />
                    )}
                    
                    {/* 状态主图 */}
                    <div className="relative">
                      {(state.image_url || state.front_view_url || (state.is_active && (character?.image_url || character?.front_view_url))) ? (
                        <img
                          src={state.image_url || state.front_view_url || character?.image_url || character?.front_view_url}
                          alt={state.name}
                          className="w-10 h-10 rounded object-cover"
                          style={{ border: '1px solid var(--border-color)' }}
                        />
                      ) : (
                        <div className="w-10 h-10 rounded flex items-center justify-center" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)' }}>
                          <ImageIcon className="w-4 h-4 text-default-300" />
                        </div>
                      )}
                      {isActive && (
                        <div className="absolute -top-1 -right-1 w-4 h-4 bg-amber-500 rounded-full flex items-center justify-center">
                          <Star className="w-2.5 h-2.5 text-white fill-white" />
                        </div>
                      )}
                    </div>
                    
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-sm font-medium truncate" style={{ color: 'var(--text-primary)' }}>
                          {state.name}
                        </span>
                        {renderCategoryChip(categories)}
                        {isActive && (
                          <span className="text-xs px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-700 dark:text-amber-400">
                            当前
                          </span>
                        )}
                        {hasViews && (
                          <span className="text-xs px-1.5 py-0.5 rounded bg-indigo-500/20 text-indigo-700 dark:text-indigo-400">
                            三视图
                          </span>
                        )}
                        {hasOutfitInfo && (
                          <span className="text-xs px-1.5 py-0.5 rounded bg-pink-500/20 text-pink-700 dark:text-pink-400">
                            <Shirt className="w-3 h-3 inline" />
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
                        {state.age_stage && <span>{state.age_stage}</span>}
                        {state.outfit && <span className="truncate max-w-25">{state.outfit}</span>}
                        {!state.age_stage && !state.outfit && state.description && (
                          <span className="truncate">{state.description}</span>
                        )}
                      </div>
                      {/* 标签展示 */}
                      {stateTags.length > 0 && (
                        <div className="flex items-center gap-1 mt-1 flex-wrap">
                          {stateTags.slice(0, 3).map((tag, idx) => (
                            <span key={idx} className="text-xs px-1.5 py-0 rounded" style={{ background: 'var(--bg-card)', color: 'var(--text-secondary)', border: '1px solid var(--border-color)' }}>
                              {tag}
                            </span>
                          ))}
                          {stateTags.length > 3 && (
                            <span className="text-xs" style={{ color: 'var(--text-muted)' }}>+{stateTags.length - 3}</span>
                          )}
                        </div>
                      )}
                    </div>
                    
                    {/* 操作按钮 */}
                    {!disabled && (
                      <div className="flex gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
                        {!isActive && (
                          <Tooltip content="设为当前状态">
                            <Button
                              size="sm"
                              isIconOnly
                              variant="light"
                              className="text-default-400 hover:text-amber-600 dark:hover:text-amber-400 hover:bg-amber-500/10"
                              onPress={() => handleActivate(state)}
                              isLoading={activatingId === state.id}
                            >
                              <Star className="w-3.5 h-3.5" />
                            </Button>
                          </Tooltip>
                        )}
                        <Tooltip content="复制为新状态">
                          <Button
                            size="sm"
                            isIconOnly
                            variant="light"
                            className="text-default-400 hover:text-green-600 dark:hover:text-green-400 hover:bg-green-500/10"
                            onPress={() => handleDuplicate(state)}
                            isLoading={duplicatingId === state.id}
                          >
                            <Copy className="w-3.5 h-3.5" />
                          </Button>
                        </Tooltip>
                        <Tooltip content="叠加道具">
                          <Button
                            size="sm"
                            isIconOnly
                            variant="light"
                            className="text-default-400 hover:text-emerald-600 dark:hover:text-emerald-400 hover:bg-emerald-500/10"
                            onPress={() => openEquipPropModal(state)}
                          >
                            <Sparkles className="w-3.5 h-3.5" />
                          </Button>
                        </Tooltip>
                        <Tooltip content="编辑">
                          <Button
                            size="sm"
                            isIconOnly
                            variant="light"
                            className="text-default-400 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-blue-500/10"
                            onPress={() => handleEdit(state)}
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </Button>
                        </Tooltip>
                        <Tooltip content="删除">
                          <Button
                            size="sm"
                            isIconOnly
                            variant="light"
                            className="text-default-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-500/10"
                            onPress={() => handleDelete(state)}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        </Tooltip>
                      </div>
                    )}
                  </div>
                  
                  {/* 展开内容 */}
                  {isExpanded && (
                    <div className="px-4 pb-4 pt-2 border-t border-default-200 dark:border-slate-700/30 space-y-4">
                      {/* 外观属性展示 */}
                      {(state.outfit || state.age_stage || state.hairstyle || state.accessories || (state.equipped_props && state.equipped_props.length > 0)) && (
                        <div className="grid grid-cols-2 gap-2">
                          {state.age_stage && (
                            <div className="bg-purple-500/10 rounded-lg p-2 border border-purple-500/20">
                              <div className="flex items-center gap-1.5 text-xs text-purple-700 dark:text-purple-400 mb-0.5">
                                <Calendar className="w-3 h-3" />
                                年龄阶段
                              </div>
                              <p className="text-sm text-default-700 dark:text-slate-200">{state.age_stage}</p>
                            </div>
                          )}
                          {state.outfit && (
                            <div className="bg-pink-500/10 rounded-lg p-2 border border-pink-500/20">
                              <div className="flex items-center gap-1.5 text-xs text-pink-700 dark:text-pink-400 mb-0.5">
                                <Shirt className="w-3 h-3" />
                                服装
                                {state.costume_name && (
                                  <span
                                    className="ml-1 text-[10px] px-1.5 py-0.5 rounded-full bg-pink-500/20 text-pink-600 dark:text-pink-300 cursor-pointer hover:bg-pink-500/30 transition-colors"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      if (state.costume_image_url) {
                                        openPreview([{ src: state.costume_image_url, alt: state.costume_name || '服装设定图' }], 0);
                                      }
                                    }}
                                    title={state.costume_image_url ? '点击预览服装设定图' : '服装设定图尚未生成'}
                                  >
                                    {state.costume_name}
                                  </span>
                                )}
                                {state.costume_generation_status && (
                                  <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${
                                    state.costume_generation_status === 'completed'
                                      ? 'bg-green-500/15 text-green-600 dark:text-green-400'
                                      : state.costume_generation_status === 'generating'
                                      ? 'bg-amber-500/15 text-amber-600 dark:text-amber-400'
                                      : 'bg-red-500/15 text-red-600 dark:text-red-400'
                                  }`}>
                                    {state.costume_generation_status === 'completed'
                                      ? '已生成'
                                      : state.costume_generation_status === 'generating'
                                      ? '生成中'
                                      : state.costume_generation_status === 'pending'
                                      ? '待生成'
                                      : '生成失败'}
                                  </span>
                                )}
                                {state.costume_id && (state.costume_generation_status === 'pending' || state.costume_generation_status === 'failed' || !state.costume_generation_status) && (
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleGenerateCostume(state.costume_id!, state.costume_name || undefined);
                                    }}
                                    className="ml-auto text-[10px] px-2 py-0.5 rounded-full bg-pink-500 text-white hover:bg-pink-600 transition-colors flex items-center gap-1"
                                    title="生成服装设定图"
                                  >
                                    <RefreshCw className="w-2.5 h-2.5" />
                                    生成设定图
                                  </button>
                                )}
                              </div>
                              <p className="text-sm text-default-700 dark:text-slate-200 truncate">{state.outfit}</p>
                            </div>
                          )}
                          {state.hairstyle && (
                            <div className="bg-cyan-500/10 rounded-lg p-2 border border-cyan-500/20">
                              <div className="flex items-center gap-1.5 text-xs text-cyan-700 dark:text-cyan-400 mb-0.5">
                                <Scissors className="w-3 h-3" />
                                发型
                              </div>
                              <p className="text-sm text-default-700 dark:text-slate-200 truncate">{state.hairstyle}</p>
                            </div>
                          )}
                          {state.accessories && (
                            <div className="bg-amber-500/10 rounded-lg p-2 border border-amber-500/20">
                              <div className="flex items-center gap-1.5 text-xs text-amber-700 dark:text-amber-400 mb-0.5">
                                <Star className="w-3 h-3" />
                                配饰
                              </div>
                              <p className="text-sm text-default-700 dark:text-slate-200 truncate">{state.accessories}</p>
                            </div>
                          )}
                          {/* 已叠加道具 */}
                          {state.equipped_props && state.equipped_props.length > 0 && (
                            <div className="bg-emerald-500/10 rounded-lg p-2 border border-emerald-500/20">
                              <div className="flex items-center gap-1.5 text-xs text-emerald-700 dark:text-emerald-400 mb-1">
                                <Sparkles className="w-3 h-3" />
                                已叠加道具
                              </div>
                              <div className="flex flex-wrap gap-1.5">
                                {state.equipped_props.map((ep) => (
                                  <Chip
                                    key={ep.prop_id}
                                    size="sm"
                                    variant="flat"
                                    className="bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 cursor-pointer hover:bg-emerald-500/25"
                                    onClose={() => handleUnequipProp(state, ep.prop_id)}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      if (ep.image_url) {
                                        openPreview([{ src: ep.image_url, alt: ep.name }], 0);
                                      }
                                    }}
                                  >
                                    {ep.name}
                                  </Chip>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                      
                      {/* 外貌特征展示已移除：状态图 = 白膜图 + 白膜提示词 + 状态提示词，上方已有服装/发型/配饰/年龄/手持道具独立字段，appearance 混合字段没必要再展示 */}

                      {/* 展开的标签展示 */}
                      {stateTags.length > 0 && (
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <Tag className="w-3 h-3 text-default-400 dark:text-slate-500" />
                          {stateTags.map((tag, idx) => (
                            <span key={idx} className="text-xs px-2 py-0.5 rounded-full bg-default-100 dark:bg-slate-700/50 text-default-600 dark:text-slate-300 border border-default-200 dark:border-slate-600/30">
                              {tag}
                            </span>
                          ))}
                        </div>
                      )}
                      
                      {/* 三视图 */}
                      {(hasViews || state.generation_status === 'generating') && (
                        <div className="space-y-2">
                          <div className="flex items-center justify-between">
                            <h5 className="text-xs font-medium text-default-500 dark:text-slate-400">三视图</h5>
                            {state.generation_status === 'generating' ? (
                              <span className="text-xs text-amber-600 dark:text-amber-400 flex items-center gap-1">
                                <RefreshCw className="w-3 h-3 animate-spin" />
                                生成中...
                              </span>
                            ) : (
                              hasViews && !disabled && (
                                <Button
                                  size="sm"
                                  variant="light"
                                  color="danger"
                                  isIconOnly
                                  isLoading={deletingViewsId === state.id}
                                  onPress={() => handleDeleteViews(state)}
                                  className="h-6 min-w-6 w-6"
                                  aria-label="删除三视图"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </Button>
                              )
                            )}
                          </div>
                          <div className="grid grid-cols-3 gap-2">
                            {[
                              { url: state.front_view_url, label: '正面', view: 'front' as const },
                              { url: state.side_view_url, label: '侧面', view: 'side' as const },
                              { url: state.back_view_url, label: '背面', view: 'back' as const }
                            ].map(({ url, label, view }, idx) => {
                              const isRegenerating = regeneratingView?.stateId === state.id && regeneratingView?.view === view;
                              return (
                                <div key={label} className="space-y-1">
                                  <div className="flex items-center justify-between px-0.5">
                                    <p className="text-xs text-default-400 dark:text-slate-500">{label}</p>
                                    {!disabled && state.generation_status !== 'generating' && (
                                      <Button
                                        size="sm"
                                        variant="light"
                                        isIconOnly
                                        className="h-5 min-w-5 w-5"
                                        isLoading={isRegenerating}
                                        onPress={() => handleRegenerateSingleView(state, view)}
                                        aria-label={`重新生成${label}视图`}
                                      >
                                        <RefreshCw className="w-3 h-3 text-default-400 dark:text-slate-500" />
                                      </Button>
                                    )}
                                  </div>
                                  <div
                                    className={`aspect-[3/4] bg-default-100 dark:bg-slate-800/60 rounded-lg overflow-hidden border border-default-200 dark:border-slate-700/50 flex items-center justify-center ${url ? 'cursor-pointer hover:opacity-90 transition-opacity' : ''}`}
                                    onClick={() => {
                                      if (!url) return;
                                      const slides = [
                                        state.front_view_url,
                                        state.side_view_url,
                                        state.back_view_url
                                      ].filter(Boolean).map(u => ({ src: u!, alt: '' }));
                                      const beforeCount = [state.front_view_url, state.side_view_url, state.back_view_url].slice(0, idx).filter(Boolean).length;
                                      openPreview(slides, beforeCount);
                                    }}
                                  >
                                    {url ? (
                                      <img src={url} alt={label} className="w-full h-full object-cover object-top" />
                                    ) : (
                                      <ImageIcon className="w-6 h-6 text-default-300 dark:text-slate-600" />
                                    )}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}
                      
                      {/* AI生成三视图按钮 */}
                      {!disabled && state.generation_status !== 'generating' && (
                        <div className="space-y-2">
                          <Button
                            size="sm"
                            color="primary"
                            variant="flat"
                            className="w-full bg-linear-to-r from-purple-500/20 to-pink-500/20 text-purple-700 dark:text-purple-300 border border-purple-500/30"
                            startContent={<RefreshCw className="w-4 h-4" />}
                            onPress={() => handleGenerateViews(state)}
                            isLoading={generatingId === state.id}
                          >
                            {hasViews ? '重新生成三视图' : 'AI生成三视图'}
                          </Button>
                        </div>
                      )}

                      {/* 参考图提示：非白膜状态自动使用白膜三视图 */}
                      <div className="rounded-lg p-3" style={{ backgroundColor: 'var(--bg-secondary)' }}>
                        <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                          生成三视图时将自动使用白膜三视图作为参考，无需单独上传参考图。
                        </p>
                      </div>
                    </div>
                  )}
                </CardBody>
              </Card>
            );
          })}
        </div>
      )}

      {/* 编辑/新建弹窗 */}
      <Modal
        isOpen={isOpen}
        onOpenChange={onOpenChange}
        size="5xl"
        scrollBehavior="inside"
        classNames={{
          base: "bg-slate-900/95 backdrop-blur-xl border border-slate-700/50",
          header: "border-b border-slate-700/50",
          body: "py-4"
        }}
      >
        <ModalContent>
          {(onClose) => {
            const isBaseModel = editingState?.is_base_model;
            
            return (
              <>
                <ModalHeader className="text-slate-100">
                  {isBaseModel ? '调整白膜状态' : editingState ? '编辑' : '新建'}状态
                </ModalHeader>
                <ModalBody className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* 左侧：基本信息 */}
                    <div className="space-y-3">
                      <Input
                        label="状态名称"
                        placeholder="如：童年、青年、战斗、受伤"
                        value={formData.name || ''}
                        onValueChange={(val) => setFormData({ ...formData, name: val })}
                        isDisabled={isBaseModel}
                        classNames={{
                          input: "bg-transparent text-slate-100",
                          label: "text-slate-400 font-medium",
                          inputWrapper: "bg-slate-800/60 border border-slate-600/50"
                        }}
                      />
                      
                      {/* 状态分类（自动推断，只读展示） */}
                      <div className="space-y-1.5">
                        <label className="text-xs font-medium text-slate-400">状态分类（自动）</label>
                        <div className="flex flex-wrap gap-1.5">
                          {(() => {
                            const cats: StateCategory[] = [];
                            if (formData.costume_id || formData.outfit) cats.push('costume');
                            if (formData.body_elements) cats.push('effect');
                            if (cats.length === 0) cats.push('daily');
                            return cats.map(cat => {
                              const IconComp = CATEGORY_ICON_MAP[cat];
                              const colors = CATEGORY_COLOR_MAP[cat];
                              const config = STATE_CATEGORIES.find(c => c.key === cat);
                              return (
                                <div
                                  key={cat}
                                  className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs ${colors.bg} ${colors.text} ${colors.border} border`}
                                >
                                  <IconComp className="w-3 h-3" />
                                  {config?.label || cat}
                                </div>
                              );
                            });
                          })()}
                        </div>
                      </div>
                      
                      <Textarea
                        label="状态描述"
                        placeholder="描述该状态的特点"
                        value={formData.description || ''}
                        onValueChange={(val) => setFormData({ ...formData, description: val })}
                        minRows={2}
                        classNames={{
                          input: "bg-transparent text-slate-100",
                          label: "text-slate-400 font-medium",
                          inputWrapper: "bg-slate-800/60 border border-slate-600/50"
                        }}
                      />
                      
                      <Textarea
                        label="外貌特征"
                        placeholder="该状态下的外貌变化"
                        value={formData.appearance || ''}
                        onValueChange={(val) => setFormData({ ...formData, appearance: val })}
                        minRows={2}
                        classNames={{
                          input: "bg-transparent text-slate-100",
                          label: "text-slate-400 font-medium",
                          inputWrapper: "bg-slate-800/60 border border-slate-600/50"
                        }}
                      />
                    </div>
                    
                    {/* 右侧：三视图 + 外观属性卡片 */}
                    <div className="space-y-3">
                      {/* 三视图预览 */}
                      <div>
                        <label className="text-sm font-medium text-slate-400 mb-2 block">三视图</label>
                        <div className="grid grid-cols-3 gap-2">
                          {[{ key: 'front_view_url', label: '正面' }, { key: 'side_view_url', label: '侧面' }, { key: 'back_view_url', label: '背面' }].map(({ key, label }) => {
                            const url = formData[key as keyof typeof formData];
                            return (
                              <div key={key} className="space-y-1">
                                <p className="text-xs text-slate-500 text-center">{label}</p>
                                <div className="aspect-[3/4] bg-slate-800/60 rounded-lg overflow-hidden border border-slate-700/50 flex items-center justify-center">
                                  {url ? (
                                    <img src={String(url)} alt={label} className="w-full h-full object-cover object-top" />
                                  ) : (
                                    <ImageIcon className="w-6 h-6 text-slate-600" />
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                      
                      {/* 外观属性卡片列表 */}
                      <label className="text-sm font-medium text-slate-400 flex items-center gap-2">
                        <Shirt className="w-4 h-4" />
                        外观属性
                      </label>
                      
                      <div className="space-y-2.5">
                        {/* 服装卡片 */}
                        <Card className="bg-slate-800/40 border border-slate-700/40">
                          <CardBody className="p-3 space-y-2">
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-1.5">
                                <Shirt className="w-3.5 h-3.5 text-pink-400" />
                                <span className="text-xs font-medium text-slate-300">服装</span>
                              </div>
                              {formData.costume_id && (
                                <Button
                                  size="sm"
                                  variant="light"
                                  className="h-5 px-1.5 text-[10px] text-slate-500 min-w-0"
                                  onPress={() => setFormData({ ...formData, costume_id: null, outfit: '' })}
                                >
                                  清除
                                </Button>
                              )}
                            </div>
                            {characterCostumes.length > 0 ? (
                              <div className="grid grid-cols-4 gap-1.5">
                                {characterCostumes.map((costume) => {
                                  const isSelected = formData.costume_id === costume.id;
                                  return (
                                    <div
                                      key={costume.id}
                                      className={`relative rounded-md border overflow-hidden cursor-pointer transition-all ${
                                        isSelected
                                          ? 'border-pink-500/60 ring-1 ring-pink-500/40'
                                          : 'border-slate-700/50 hover:border-slate-500/50'
                                      }`}
                                      onClick={() => setFormData({
                                        ...formData,
                                        costume_id: costume.id,
                                        outfit: costume.outfit_prompt || costume.name
                                      })}
                                    >
                                      <div className="aspect-square bg-slate-800/60 flex items-center justify-center overflow-hidden">
                                        {costume.image_url ? (
                                          <img src={costume.image_url} alt={costume.name} className="w-full h-full object-cover" />
                                        ) : (
                                          <Shirt className="w-4 h-4 text-slate-600" />
                                        )}
                                      </div>
                                      <div className="px-1 py-0.5">
                                        <p className={`text-[10px] truncate text-center ${isSelected ? 'text-pink-400 font-medium' : 'text-slate-400'}`}>
                                          {costume.name}
                                        </p>
                                      </div>
                                      {isSelected && (
                                        <div className="absolute top-0.5 right-0.5 w-3.5 h-3.5 rounded-full bg-pink-500 flex items-center justify-center">
                                          <svg className="w-2 h-2 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                                            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                          </svg>
                                        </div>
                                      )}
                                    </div>
                                  );
                                })}
                              </div>
                            ) : (
                              <div className="text-center py-2 rounded-md bg-slate-800/40 border border-slate-700/30">
                                <p className="text-[10px] text-slate-500">暂无服装</p>
                              </div>
                            )}
                            {(!formData.costume_id || formData.costume_id === null) && (
                              <Input
                                size="sm"
                                placeholder="自定义服装描述，如：学生制服、战斗服"
                                value={formData.outfit || ''}
                                onValueChange={(val) => setFormData({ ...formData, outfit: val })}
                                classNames={{
                                  input: "bg-transparent text-slate-100 text-xs",
                                  inputWrapper: "bg-slate-800/60 border border-slate-600/50 h-8 min-h-0"
                                }}
                              />
                            )}
                            {formData.costume_id && formData.outfit && (
                              <Chip size="sm" variant="flat" className="bg-pink-500/10 text-pink-400 text-[10px]">
                                已选：{formData.outfit}
                              </Chip>
                            )}
                          </CardBody>
                        </Card>
                        
                        {/* 年龄 / 发型 / 配饰 三个小卡片 */}
                        <div className="grid grid-cols-3 gap-2">
                          {/* 年龄阶段卡片 */}
                          <Card className="bg-slate-800/40 border border-slate-700/40">
                            <CardBody className="p-3 space-y-2">
                              <div className="flex items-center gap-1.5">
                                <Calendar className="w-3.5 h-3.5 text-purple-400" />
                                <span className="text-xs font-medium text-slate-300">年龄</span>
                              </div>
                              <Select
                                size="sm"
                                placeholder="选择"
                                selectedKeys={formData.age_stage ? [formData.age_stage] : []}
                                onSelectionChange={(keys) => {
                                  const value = Array.from(keys)[0] as string;
                                  setFormData({ ...formData, age_stage: value || '' });
                                }}
                                classNames={{
                                  trigger: "bg-slate-800/60 border border-slate-600/50 h-8 min-h-0",
                                  value: "text-slate-100 text-xs",
                                  label: "hidden"
                                }}
                              >
                                {AGE_STAGES.map((stage) => (
                                  <SelectItem key={stage} textValue={stage}>
                                    {stage}
                                  </SelectItem>
                                ))}
                              </Select>
                            </CardBody>
                          </Card>
                          
                          {/* 发型卡片 */}
                          <Card className="bg-slate-800/40 border border-slate-700/40">
                            <CardBody className="p-3 space-y-2">
                              <div className="flex items-center gap-1.5">
                                <Scissors className="w-3.5 h-3.5 text-amber-400" />
                                <span className="text-xs font-medium text-slate-300">发型</span>
                              </div>
                              <Input
                                size="sm"
                                placeholder="如：长发、短发"
                                value={formData.hairstyle || ''}
                                onValueChange={(val) => setFormData({ ...formData, hairstyle: val })}
                                classNames={{
                                  input: "bg-transparent text-slate-100 text-xs",
                                  inputWrapper: "bg-slate-800/60 border border-slate-600/50 h-8 min-h-0"
                                }}
                              />
                            </CardBody>
                          </Card>
                          
                          {/* 配饰卡片 */}
                          <Card className="bg-slate-800/40 border border-slate-700/40">
                            <CardBody className="p-3 space-y-2">
                              <div className="flex items-center gap-1.5">
                                <Sparkles className="w-3.5 h-3.5 text-cyan-400" />
                                <span className="text-xs font-medium text-slate-300">配饰</span>
                              </div>
                              <Input
                                size="sm"
                                placeholder="如：眼镜、项链"
                                value={formData.accessories || ''}
                                onValueChange={(val) => setFormData({ ...formData, accessories: val })}
                                classNames={{
                                  input: "bg-transparent text-slate-100 text-xs",
                                  inputWrapper: "bg-slate-800/60 border border-slate-600/50 h-8 min-h-0"
                                }}
                              />
                            </CardBody>
                          </Card>
                        </div>
                        
                        {/* 效果/附加描述卡片 */}
                        <Card className="bg-slate-800/40 border border-slate-700/40">
                          <CardBody className="p-3 space-y-2">
                            <div className="flex items-center gap-1.5">
                              <Sparkles className="w-3.5 h-3.5 text-emerald-400" />
                              <span className="text-xs font-medium text-slate-300">效果 / 附加描述</span>
                            </div>
                            <Textarea
                              size="sm"
                              placeholder="自由描述角色的特殊状态效果，如：身上有泥巴、淋湿了、发光、受伤流血、满脸通红..."
                              value={formData.body_elements || ''}
                              onValueChange={(val) => setFormData({ ...formData, body_elements: val })}
                              minRows={2}
                              classNames={{
                                input: "bg-transparent text-slate-100 text-xs",
                                inputWrapper: "bg-slate-800/60 border border-slate-600/50"
                              }}
                            />
                          </CardBody>
                        </Card>
                        
                        {/* 生成提示词预览 */}
                        {(formData.outfit || formData.hairstyle || formData.accessories || formData.held_props || formData.age_stage || formData.appearance || formData.body_elements) && (
                          <div className="p-2.5 rounded-lg bg-purple-500/5 border border-purple-500/20">
                            <div className="flex items-center gap-1.5 mb-1.5">
                              <Sparkles className="w-3 h-3 text-purple-400" />
                              <span className="text-xs font-medium text-purple-400">生成提示词预览</span>
                            </div>
                            <p className="text-xs text-slate-400 leading-relaxed">
                              {[
                                formData.appearance || '',
                                formData.age_stage ? `年龄: ${formData.age_stage}` : '',
                                formData.outfit ? `服装: ${formData.outfit}` : '',
                                formData.hairstyle ? `发型: ${formData.hairstyle}` : '',
                                formData.accessories ? `配饰: ${formData.accessories}` : '',
                                formData.body_elements ? `效果: ${formData.body_elements}` : '',
                                formData.held_props ? `手持: ${formData.held_props}` : ''
                              ].filter(Boolean).join('；')}
                            </p>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </ModalBody>
                <ModalFooter>
                  <Button variant="light" onPress={onClose} className="text-slate-400">
                    取消
                  </Button>
                  {editingState && (
                    <Button
                      variant="flat"
                      className="bg-purple-500/20 text-purple-300 border border-purple-500/30"
                      startContent={<RefreshCw className="w-4 h-4" />}
                      isDisabled={!selected.image}
                      onPress={() => handleSave(true)}
                    >
                      保存并重新生成
                    </Button>
                  )}
                  <Button
                    className="bg-linear-to-r from-blue-500 to-violet-600 text-white font-semibold"
                    onPress={() => handleSave()}
                  >
                    {isBaseModel ? '保存白膜调整' : '保存'}
                  </Button>
                </ModalFooter>
              </>
            );
          }}
        </ModalContent>
      </Modal>

      {/* AI生成对话框 */}
      <Modal
        isOpen={isGenerateModalOpen}
        onOpenChange={() => setIsGenerateModalOpen(false)}
        size="2xl"
        scrollBehavior="inside"
        classNames={{
          base: "bg-slate-900/95 backdrop-blur-xl border border-slate-700/50",
          header: "border-b border-slate-700/50",
          body: "py-4"
        }}
      >
        <ModalContent>
          {(onClose) => (
            <>
              <ModalHeader className="text-slate-100">
                <div className="flex items-center gap-2">
                  <RefreshCw className="w-5 h-5 text-purple-400" />
                  {generatingState?.is_base_model 
                    ? (baseModelGenerateMode === 'three_views' ? 'AI生成白膜三视图' : 'AI生成角色设定图')
                    : 'AI生成角色状态图片'}
                </div>
              </ModalHeader>
              <ModalBody className="space-y-4">
                {/* 角色参考图 */}
                {character && (character.image_url || character.front_view_url) && (
                  <div className="flex items-center gap-3 p-3 bg-slate-800/50 rounded-lg border border-slate-700/50">
                    <img
                      src={character.image_url || character.front_view_url}
                      alt={character.name}
                      className="w-16 h-16 rounded-lg object-cover border border-slate-600"
                    />
                    <div>
                      <p className="text-sm font-medium text-slate-200">参考角色：{character.name}</p>
                      <p className="text-xs text-slate-500">
                        {generatingState?.is_base_model 
                          ? (baseModelGenerateMode === 'three_views' 
                              ? '将基于角色设定图生成独立三视图（用于分镜管线）' 
                              : '将基于角色基础外貌生成角色设定图（含正/侧/背三视角）')
                          : '将基于此角色生成新的状态图片'}
                      </p>
                    </div>
                  </div>
                )}

                {/* 白膜模式：直接说明，无需状态描述 */}
                {generatingState?.is_base_model && (
                  <div className="p-3 bg-amber-500/10 rounded-lg border border-amber-500/30">
                    <p className="text-sm text-amber-300 leading-relaxed">
                      {baseModelGenerateMode === 'three_views' 
                        ? '将基于已有角色设定图生成正面、侧面、背面独立三视图，用于分镜生成管线中按镜头角度选取参考图。'
                        : '白膜是角色的基础形态参考。将生成包含正面、侧面、背面三视角的角色设定图，用于后续各状态图片生成的参考基准。'}
                    </p>
                  </div>
                )}

                {/* 非白膜：自然语言输入 */}
                {!generatingState?.is_base_model && (
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-slate-300">
                      描述这个角色状态
                    </label>
                    <Textarea
                      placeholder="例如：这是角色童年时期的样子，穿着蓝色的学生制服，头发扎成双马尾，戴着一副圆框眼镜..."
                      value={naturalLanguageInput}
                      onValueChange={setNaturalLanguageInput}
                      minRows={4}
                      classNames={{
                        input: "bg-transparent text-slate-100",
                        inputWrapper: "bg-slate-800/60 border border-slate-600/50"
                      }}
                    />
                    <p className="text-xs text-slate-500">
                      用自然语言描述角色的状态、服装、发型等特征，AI会自动分析并生成图片
                    </p>
                  </div>
                )}

                {/* 模型选择 */}
                <div className="grid grid-cols-2 gap-3">
                  <AIModelSelector
                    label="文本分析模型"
                    placeholder="选择文本模型"
                    models={models}
                    selectedModel={selected.text}
                    onModelChange={(model) => setSelected('text', model)}
                    filterType="TEXT"
                    size="sm"
                    isRequired
                  />
                  <AIModelSelector
                    label="图像生成模型"
                    placeholder="选择图像模型"
                    models={models}
                    selectedModel={selected.image}
                    onModelChange={(model) => setSelected('image', model)}
                    filterType="IMAGE"
                    size="sm"
                    isRequired
                  />
                </div>

                {/* 分析按钮（仅非白膜显示） */}
                {!generatingState?.is_base_model && (
                  <Button
                    color="secondary"
                    variant="flat"
                    className="w-full bg-linear-to-r from-blue-500/20 to-cyan-500/20 text-blue-300 border border-blue-500/30"
                    startContent={analyzing ? <RefreshCw className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                    onPress={analyzeDescription}
                    isLoading={analyzing}
                    isDisabled={!naturalLanguageInput.trim() || !selected.text}
                  >
                    {analyzing ? 'AI分析中...' : 'AI分析描述'}
                  </Button>
                )}

                {/* 分析结果展示 */}
                {generatedTags && (
                  <div className="space-y-3 p-4 bg-slate-800/50 rounded-lg border border-slate-700/50">
                    <h4 className="text-sm font-medium text-slate-300 flex items-center gap-2">
                      <Star className="w-4 h-4 text-amber-400" />
                      AI分析结果
                    </h4>
                    <div className="grid grid-cols-2 gap-3">
                      {generatedTags.name && (
                        <div className="space-y-1">
                          <label className="text-xs text-slate-500">状态名称</label>
                          <p className="text-sm text-slate-200 bg-slate-800 px-2 py-1 rounded">{generatedTags.name}</p>
                        </div>
                      )}
                      {generatedTags.age_stage && (
                        <div className="space-y-1">
                          <label className="text-xs text-slate-500">年龄阶段</label>
                          <p className="text-sm text-slate-200 bg-slate-800 px-2 py-1 rounded">{generatedTags.age_stage}</p>
                        </div>
                      )}
                      {generatedTags.outfit && (
                        <div className="space-y-1">
                          <label className="text-xs text-slate-500">服装</label>
                          <p className="text-sm text-slate-200 bg-slate-800 px-2 py-1 rounded">{generatedTags.outfit}</p>
                        </div>
                      )}
                      {generatedTags.hairstyle && (
                        <div className="space-y-1">
                          <label className="text-xs text-slate-500">发型</label>
                          <p className="text-sm text-slate-200 bg-slate-800 px-2 py-1 rounded">{generatedTags.hairstyle}</p>
                        </div>
                      )}
                      {generatedTags.accessories && (
                        <div className="space-y-1 col-span-2">
                          <label className="text-xs text-slate-500">配饰</label>
                          <p className="text-sm text-slate-200 bg-slate-800 px-2 py-1 rounded">{generatedTags.accessories}</p>
                        </div>
                      )}
                      {generatedTags.appearance && (
                        <div className="space-y-1 col-span-2">
                          <label className="text-xs text-slate-500">外貌特征</label>
                          <p className="text-sm text-slate-200 bg-slate-800 px-2 py-1 rounded">{generatedTags.appearance}</p>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </ModalBody>
              <ModalFooter>
                <Button variant="light" onPress={onClose} className="text-slate-400">
                  取消
                </Button>
                <Button
                  className="bg-linear-to-r from-purple-500 to-pink-600 text-white font-semibold"
                  onPress={confirmGenerate}
                  isDisabled={!selected.image || (!generatingState?.is_base_model && !generatedTags)}
                  startContent={<RefreshCw className="w-4 h-4" />}
                >
                  {generatingState?.is_base_model 
                    ? (baseModelGenerateMode === 'three_views' ? '生成三视图' : '生成角色设定图')
                    : '生成图片'}
                </Button>
              </ModalFooter>
            </>
          )}
        </ModalContent>
      </Modal>

      {/* 道具叠加弹窗 */}
      <Modal isOpen={equipPropModalOpen} onOpenChange={setEquipPropModalOpen} size="md">
        <ModalContent>
          {(onClose) => (
            <>
              <ModalHeader>叠加道具到状态「{equippingState?.name}」</ModalHeader>
              <ModalBody className="space-y-4">
                {projectProps.length === 0 ? (
                  <p className="text-sm text-slate-400">当前项目没有可用的永久道具，请先到资产管理中创建永久道具。</p>
                ) : (
                  <>
                    <Select
                      label="选择道具"
                      selectedKeys={selectedPropId ? [selectedPropId] : []}
                      onSelectionChange={(keys) => setSelectedPropId(Array.from(keys)[0] as string)}
                    >
                      {projectProps.map((prop) => (
                        <SelectItem key={String(prop.id)} textValue={prop.name}>
                          {prop.name}
                        </SelectItem>
                      ))}
                    </Select>
                    <Select
                      label="手持位置"
                      selectedKeys={[handPosition]}
                      onSelectionChange={(keys) => setHandPosition(Array.from(keys)[0] as string)}
                    >
                      <SelectItem key="right">右手</SelectItem>
                      <SelectItem key="left">左手</SelectItem>
                      <SelectItem key="both">双手</SelectItem>
                      <SelectItem key="back">背后</SelectItem>
                      <SelectItem key="waist">腰间</SelectItem>
                    </Select>
                    <Select
                      label="持握方式"
                      selectedKeys={[usageMode]}
                      onSelectionChange={(keys) => setUsageMode(Array.from(keys)[0] as string)}
                    >
                      <SelectItem key="hold">持握</SelectItem>
                      <SelectItem key="wear">佩戴</SelectItem>
                      <SelectItem key="carry">背负</SelectItem>
                      <SelectItem key="ground">放置</SelectItem>
                    </Select>
                  </>
                )}
              </ModalBody>
              <ModalFooter>
                <Button variant="light" onPress={onClose}>取消</Button>
                <Button
                  color="primary"
                  isDisabled={!selectedPropId || projectProps.length === 0}
                  isLoading={equipping}
                  onPress={handleEquipProp}
                >
                  确认叠加
                </Button>
              </ModalFooter>
            </>
          )}
        </ModalContent>
      </Modal>
    </div>
  );
};

export default CharacterStateEditor;
