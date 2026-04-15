import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Button, Input, Textarea, Modal, ModalContent, ModalHeader, ModalBody, ModalFooter, useDisclosure, Card, CardBody, Select, SelectItem, Tooltip, Chip, Switch } from '@heroui/react';
import { Plus, Edit2, Trash2, ChevronDown, ChevronRight, Image as ImageIcon, Star, Copy, RefreshCw, Shirt, Calendar, Scissors, Clock, Sparkles, User, X, Tag } from 'lucide-react';
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
  activateCharacterState,
  duplicateCharacterState,
  generateCharacterStateViews,
  AGE_STAGES
} from '../../../services/assets';
import ReferenceImageManager from './ReferenceImageManager';
import { useToast } from '../../../contexts/ToastContext';
import { useConfirm } from '../../../contexts/ConfirmContext';
import { useAIModels } from '../../../hooks/useAIModels';
import AIModelSelector from '../../../components/AIModelSelector';
import { getAuthToken } from '../../../services/auth';

// 状态分类图标映射
const CATEGORY_ICON_MAP: Record<StateCategory, React.ElementType> = {
  daily: User,
  costume: Shirt,
  time: Clock,
  effect: Sparkles,
};

// 状态分类颜色映射
const CATEGORY_COLOR_MAP: Record<StateCategory, { bg: string; text: string; border: string }> = {
  daily: { bg: 'bg-blue-500/15', text: 'text-blue-400', border: 'border-blue-500/30' },
  costume: { bg: 'bg-pink-500/15', text: 'text-pink-400', border: 'border-pink-500/30' },
  time: { bg: 'bg-purple-500/15', text: 'text-purple-400', border: 'border-purple-500/30' },
  effect: { bg: 'bg-amber-500/15', text: 'text-amber-400', border: 'border-amber-500/30' },
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

// 序列化标签数组为JSON字符串
function serializeTags(tags: string[]): string {
  return JSON.stringify(tags);
}

interface CharacterStateEditorProps {
  characterId: number | null;
  disabled?: boolean;
  onStateActivated?: (state: CharacterState) => void;
}

const CharacterStateEditor: React.FC<CharacterStateEditorProps> = ({
  characterId,
  disabled = false,
  onStateActivated
}) => {
  const [states, setStates] = useState<CharacterState[]>([]);
  const [character, setCharacter] = useState<Character | null>(null);
  const [loading, setLoading] = useState(false);
  const [expandedStates, setExpandedStates] = useState<Set<number>>(new Set());
  const [activatingId, setActivatingId] = useState<number | null>(null);
  const [duplicatingId, setDuplicatingId] = useState<number | null>(null);
  const [generatingId, setGeneratingId] = useState<number | null>(null);
  
  // 分类筛选状态
  const [activeCategoryFilter, setActiveCategoryFilter] = useState<StateCategory | 'all'>('all');
  
  // 使用AI模型hook
  const { models, selected, setSelected } = useAIModels(null);
  
  // AI生成对话框状态
  const [isGenerateModalOpen, setIsGenerateModalOpen] = useState(false);
  const [generatingState, setGeneratingState] = useState<CharacterState | null>(null);
  const [naturalLanguageInput, setNaturalLanguageInput] = useState('');
  const [analyzing, setAnalyzing] = useState(false);
  const [generatedTags, setGeneratedTags] = useState<{
    name: string;
    age_stage: string;
    outfit: string;
    hairstyle: string;
    accessories: string;
    appearance: string;
  } | null>(null);
  
  // 编辑状态表单
  const [editingState, setEditingState] = useState<CharacterState | null>(null);
  const [formData, setFormData] = useState<Partial<CharacterState> & { tagInput?: string }>({
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
    is_active: false,
    state_category: 'daily',
    tags: '[]',
    tagInput: '',
    use_reference_images: true
  });
  
  const { showToast } = useToast();
  const { confirm } = useConfirm();
  const { isOpen, onOpen, onOpenChange } = useDisclosure();

  // 加载角色详情和状态列表
  const loadStates = useCallback(async () => {
    if (!characterId) return;
    setLoading(true);
    try {
      const [characterData, statesData] = await Promise.all([
        fetchCharacter(characterId),
        fetchCharacterStates(characterId)
      ]);
      setCharacter(characterData);
      setStates(statesData);
    } catch (error: any) {
      console.error('加载角色数据失败:', error);
    } finally {
      setLoading(false);
    }
  }, [characterId]);

  useEffect(() => {
    loadStates();
  }, [loadStates]);

  // 按分类筛选状态（白膜始终置顶）
  const filteredStates = useMemo(() => {
    let result = states;
    if (activeCategoryFilter !== 'all') {
      result = states.filter(s => (s.state_category || 'daily') === activeCategoryFilter);
    }
    // 白膜状态始终置顶
    return [...result].sort((a, b) => {
      if (a.is_base_model && !b.is_base_model) return -1;
      if (!a.is_base_model && b.is_base_model) return 1;
      return (a.sort_order || 0) - (b.sort_order || 0);
    });
  }, [states, activeCategoryFilter]);

  // 各分类状态数量
  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = { all: states.length };
    STATE_CATEGORIES.forEach(cat => {
      counts[cat.key] = states.filter(s => (s.state_category || 'daily') === cat.key).length;
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
      is_active: false,
      state_category: presetCategory || 'daily',
      tags: '[]',
      tagInput: ''
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
      is_active: false,
      state_category: 'daily',
      tags: '[]',
      tagInput: ''
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
      is_active: state.is_active || false,
      state_category: state.state_category || 'daily',
      tags: state.tags || '[]',
      tagInput: '',
      use_reference_images: state.use_reference_images !== false
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

    setGeneratingId(generatingState.id);
    setIsGenerateModalOpen(false);
    
    try {
      // 先保存AI分析出的外貌属性到状态
      if (generatedTags) {
        await updateCharacterState(characterId!, generatingState.id, {
          name: generatedTags.name || generatingState.name,
          age_stage: generatedTags.age_stage,
          outfit: generatedTags.outfit,
          hairstyle: generatedTags.hairstyle,
          accessories: generatedTags.accessories,
          appearance: generatedTags.appearance
        });
      }

      // 调用状态级别三视图生成API（后端会自动组装外貌属性）
      await generateCharacterStateViews(characterId!, generatingState.id, {
        imageModel: selected.image,
        textModel: selected.text || undefined
      });
      
      showToast('三视图生成任务已启动', 'success');
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
        age_stage: state.age_stage
      });

      await generateCharacterStateViews(characterId!, state.id, {
        imageModel: selected.image,
        textModel: selected.text || undefined
      });
      showToast('三视图生成任务已启动', 'success');
      pollGenerationStatus(state.id);
    } catch (error: any) {
      showToast(error.message || '生成失败', 'error');
      setGeneratingId(null);
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
          showToast('三视图生成完成', 'success');
          return;
        } else if (state?.generation_status === 'failed') {
          setGeneratingId(null);
          showToast('三视图生成失败', 'error');
          return;
        }
        
        attempts++;
        if (attempts < maxAttempts) {
          setTimeout(checkStatus, 5000);
        } else {
          setGeneratingId(null);
          showToast('生成超时，请稍后刷新查看', 'warning');
        }
      } catch (error) {
        setGeneratingId(null);
        console.error('轮询生成状态失败:', error);
      }
    };
    
    checkStatus();
  };

  // 渲染分类标签
  const renderCategoryChip = (category: StateCategory, size: 'sm' | 'md' = 'sm') => {
    const config = STATE_CATEGORIES.find(c => c.key === category) || STATE_CATEGORIES[0];
    const colors = CATEGORY_COLOR_MAP[category];
    const IconComp = CATEGORY_ICON_MAP[category];
    return (
      <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-${size === 'sm' ? 'xs' : 'sm'} ${colors.bg} ${colors.text} ${colors.border} border`}>
        <IconComp className={`w-${size === 'sm' ? '3' : '4'} h-${size === 'sm' ? '3' : '4'}`} />
        {config.label}
      </span>
    );
  };

  if (!characterId) {
    return (
      <div className="text-center py-8 text-slate-500">
        <ImageIcon className="w-12 h-12 mx-auto mb-2 opacity-30" />
        <p className="text-sm">请先保存角色后再管理状态</p>
      </div>
    );
  }

  // 白膜状态
  const baseModelState = states.find(s => s.is_base_model);

  return (
    <div className="space-y-4">
      {/* 头部 */}
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-medium text-slate-300 flex items-center gap-2">
          <ImageIcon className="w-4 h-4" />
          角色状态
          {states.length > 0 && (
            <span className="text-xs text-slate-500">({states.length})</span>
          )}
        </h4>
        {!disabled && (
          <div className="flex items-center gap-2">
            {/* 基于白膜创建快捷按钮 */}
            {baseModelState && (
              <Button
                size="sm"
                variant="flat"
                className="bg-amber-500/10 text-amber-400 hover:bg-amber-500/20"
                startContent={<Star className="w-3 h-3" />}
                onPress={handleCreateFromBaseModel}
              >
                基于白膜新建
              </Button>
            )}
            <Button
              size="sm"
              variant="flat"
              className="bg-blue-500/10 text-blue-400 hover:bg-blue-500/20"
              startContent={<Plus className="w-3 h-3" />}
              onPress={() => handleCreate()}
            >
              新建状态
            </Button>
          </div>
        )}
      </div>

      {/* 分类筛选栏 */}
      {states.length > 0 && (
        <div className="flex items-center gap-1.5 flex-wrap">
          <button
            className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${
              activeCategoryFilter === 'all'
                ? 'bg-slate-600/50 text-slate-200'
                : 'text-slate-500 hover:text-slate-300 hover:bg-slate-700/30'
            }`}
            onClick={() => setActiveCategoryFilter('all')}
          >
            全部 ({categoryCounts.all})
          </button>
          {STATE_CATEGORIES.map(cat => {
            const count = categoryCounts[cat.key] || 0;
            const colors = CATEGORY_COLOR_MAP[cat.key];
            return (
              <button
                key={cat.key}
                className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors flex items-center gap-1 ${
                  activeCategoryFilter === cat.key
                    ? `${colors.bg} ${colors.text}`
                    : 'text-slate-500 hover:text-slate-300 hover:bg-slate-700/30'
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
        <Card className="bg-linear-to-r from-slate-800/60 to-slate-800/30 border border-amber-500/30 ring-1 ring-amber-500/10">
          <CardBody className="p-0">
            <div
              className="flex items-center gap-3 p-3 cursor-pointer hover:bg-amber-500/5 transition-colors"
              onClick={() => toggleExpand(baseModelState.id)}
            >
              {expandedStates.has(baseModelState.id) ? (
                <ChevronDown className="w-4 h-4 text-amber-400" />
              ) : (
                <ChevronRight className="w-4 h-4 text-amber-400" />
              )}
              
              {/* 白膜标识 */}
              <div className="relative">
                {baseModelState.image_url || baseModelState.front_view_url ? (
                  <img
                    src={baseModelState.image_url || baseModelState.front_view_url}
                    alt={baseModelState.name}
                    className="w-12 h-12 rounded-lg object-cover border border-amber-500/40"
                  />
                ) : (
                  <div className="w-12 h-12 rounded-lg bg-amber-500/10 flex items-center justify-center border border-amber-500/30">
                    <Star className="w-5 h-5 text-amber-400" />
                  </div>
                )}
                <div className="absolute -top-1 -right-1 w-5 h-5 bg-amber-500 rounded-full flex items-center justify-center">
                  <Star className="w-3 h-3 text-white fill-white" />
                </div>
              </div>
              
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-amber-300">
                    {baseModelState.name}
                  </span>
                  <span className="text-xs px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-400 border border-amber-500/30">
                    白膜
                  </span>
                  {renderCategoryChip(baseModelState.state_category || 'daily')}
                </div>
                <p className="text-xs text-slate-500 mt-0.5">
                  基础白膜状态 - 角色的初始外观参考
                </p>
              </div>
              
              {/* 操作按钮 */}
              {!disabled && (
                <div className="flex gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
                  <Tooltip content="基于白膜创建新状态">
                    <Button
                      size="sm"
                      isIconOnly
                      variant="light"
                      className="text-slate-400 hover:text-amber-400 hover:bg-amber-500/10"
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
                      className="text-slate-400 hover:text-blue-400 hover:bg-blue-500/10"
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
                        <div className="flex items-center gap-1.5 text-xs text-purple-400 mb-0.5">
                          <Calendar className="w-3 h-3" />
                          年龄阶段
                        </div>
                        <p className="text-sm text-slate-200">{baseModelState.age_stage}</p>
                      </div>
                    )}
                    {baseModelState.outfit && (
                      <div className="bg-pink-500/10 rounded-lg p-2 border border-pink-500/20">
                        <div className="flex items-center gap-1.5 text-xs text-pink-400 mb-0.5">
                          <Shirt className="w-3 h-3" />
                          服装
                        </div>
                        <p className="text-sm text-slate-200 truncate">{baseModelState.outfit}</p>
                      </div>
                    )}
                    {baseModelState.hairstyle && (
                      <div className="bg-cyan-500/10 rounded-lg p-2 border border-cyan-500/20">
                        <div className="flex items-center gap-1.5 text-xs text-cyan-400 mb-0.5">
                          <Scissors className="w-3 h-3" />
                          发型
                        </div>
                        <p className="text-sm text-slate-200 truncate">{baseModelState.hairstyle}</p>
                      </div>
                    )}
                    {baseModelState.accessories && (
                      <div className="bg-amber-500/10 rounded-lg p-2 border border-amber-500/20">
                        <div className="flex items-center gap-1.5 text-xs text-amber-400 mb-0.5">
                          <Star className="w-3 h-3" />
                          配饰
                        </div>
                        <p className="text-sm text-slate-200 truncate">{baseModelState.accessories}</p>
                      </div>
                    )}
                  </div>
                )}
                
                {baseModelState.appearance && (
                  <div className="bg-blue-500/5 rounded-lg p-3 border border-blue-500/20">
                    <h5 className="text-xs font-medium text-slate-400 mb-1">外貌特征</h5>
                    <p className="text-sm text-slate-300 whitespace-pre-wrap">{baseModelState.appearance}</p>
                  </div>
                )}

                {/* 白膜三视图 */}
                {(baseModelState.front_view_url || baseModelState.side_view_url || baseModelState.back_view_url || baseModelState.generation_status === 'generating') && (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <h5 className="text-xs font-medium text-slate-400">三视图</h5>
                      {baseModelState.generation_status === 'generating' && (
                        <span className="text-xs text-amber-400 flex items-center gap-1">
                          <RefreshCw className="w-3 h-3 animate-spin" />
                          生成中...
                        </span>
                      )}
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                      {[
                        { url: baseModelState.front_view_url, label: '正面' },
                        { url: baseModelState.side_view_url, label: '侧面' },
                        { url: baseModelState.back_view_url, label: '背面' }
                      ].map(({ url, label }) => (
                        <div key={label} className="space-y-1">
                          <p className="text-xs text-slate-500 text-center">{label}</p>
                          <div className="aspect-square bg-slate-800/60 rounded-lg overflow-hidden border border-slate-700/50 flex items-center justify-center">
                            {url ? (
                              <img src={url} alt={label} className="w-full h-full object-cover" />
                            ) : (
                              <ImageIcon className="w-6 h-6 text-slate-600" />
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                
                {/* AI生成三视图按钮 */}
                {!disabled && baseModelState.generation_status !== 'generating' && (
                  <Button
                    size="sm"
                    color="primary"
                    variant="flat"
                    className="w-full bg-linear-to-r from-amber-500/20 to-purple-500/20 text-amber-300 border border-amber-500/30"
                    startContent={<RefreshCw className="w-4 h-4" />}
                    onPress={() => openGenerateModal(baseModelState)}
                    isLoading={generatingId === baseModelState.id}
                  >
                    {baseModelState.front_view_url ? '重新生成白膜三视图' : 'AI生成白膜三视图'}
                  </Button>
                )}
                
                {/* 参考图 */}
                <div>
                  <h5 className="text-xs font-medium text-slate-400 mb-2">参考图</h5>
                  <ReferenceImageManager
                    assetType="character_state"
                    assetId={baseModelState.id}
                    disabled={disabled}
                  />
                </div>
              </div>
            )}
          </CardBody>
        </Card>
      )}

      {/* 其他状态列表 */}
      {loading ? (
        <div className="text-center py-4 text-slate-400 text-sm">
          加载中...
        </div>
      ) : filteredStates.filter(s => !s.is_base_model).length === 0 && !baseModelState ? (
        <div className="text-center py-6 bg-slate-800/30 rounded-lg border border-slate-700/30">
          <p className="text-sm text-slate-500">暂无状态</p>
          <p className="text-xs text-slate-600 mt-1">可添加角色的不同时期或状态版本</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filteredStates.filter(s => !s.is_base_model).map((state) => {
            const isExpanded = expandedStates.has(state.id);
            const hasViews = !!(state.front_view_url || state.side_view_url || state.back_view_url);
            const isActive = state.is_active;
            const hasOutfitInfo = !!(state.outfit || state.age_stage || state.hairstyle);
            const stateTags = parseTags(state.tags);
            const category = state.state_category || 'daily';
            const colors = CATEGORY_COLOR_MAP[category];
            
            return (
              <Card 
                key={state.id} 
                className={`bg-slate-800/40 border transition-all ${
                  isActive 
                    ? 'border-amber-500/50 ring-1 ring-amber-500/20' 
                    : `border-slate-700/50 hover:${colors.border}`
                }`}
              >
                <CardBody className="p-0">
                  {/* 状态头部 */}
                  <div
                    className="flex items-center gap-2 p-3 cursor-pointer hover:bg-slate-700/20 transition-colors"
                    onClick={() => toggleExpand(state.id)}
                  >
                    {isExpanded ? (
                      <ChevronDown className="w-4 h-4 text-slate-400" />
                    ) : (
                      <ChevronRight className="w-4 h-4 text-slate-400" />
                    )}
                    
                    {/* 状态主图 */}
                    <div className="relative">
                      {state.image_url || state.front_view_url ? (
                        <img
                          src={state.image_url || state.front_view_url}
                          alt={state.name}
                          className="w-10 h-10 rounded object-cover border border-slate-600/50"
                        />
                      ) : (
                        <div className="w-10 h-10 rounded bg-slate-700/50 flex items-center justify-center border border-slate-600/50">
                          <ImageIcon className="w-4 h-4 text-slate-500" />
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
                        <span className="text-sm font-medium text-slate-200 truncate">
                          {state.name}
                        </span>
                        {renderCategoryChip(category)}
                        {isActive && (
                          <span className="text-xs px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-400">
                            当前
                          </span>
                        )}
                        {hasViews && (
                          <span className="text-xs px-1.5 py-0.5 rounded bg-indigo-500/20 text-indigo-400">
                            三视图
                          </span>
                        )}
                        {hasOutfitInfo && (
                          <span className="text-xs px-1.5 py-0.5 rounded bg-pink-500/20 text-pink-400">
                            <Shirt className="w-3 h-3 inline" />
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 text-xs text-slate-500 mt-0.5">
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
                            <span key={idx} className="text-xs px-1.5 py-0 rounded bg-slate-700/50 text-slate-400 border border-slate-600/30">
                              {tag}
                            </span>
                          ))}
                          {stateTags.length > 3 && (
                            <span className="text-xs text-slate-500">+{stateTags.length - 3}</span>
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
                              className="text-slate-400 hover:text-amber-400 hover:bg-amber-500/10"
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
                            className="text-slate-400 hover:text-green-400 hover:bg-green-500/10"
                            onPress={() => handleDuplicate(state)}
                            isLoading={duplicatingId === state.id}
                          >
                            <Copy className="w-3.5 h-3.5" />
                          </Button>
                        </Tooltip>
                        <Tooltip content="编辑">
                          <Button
                            size="sm"
                            isIconOnly
                            variant="light"
                            className="text-slate-400 hover:text-blue-400 hover:bg-blue-500/10"
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
                            className="text-slate-400 hover:text-red-400 hover:bg-red-500/10"
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
                    <div className="px-4 pb-4 pt-2 border-t border-slate-700/30 space-y-4">
                      {/* 外观属性展示 */}
                      {(state.outfit || state.age_stage || state.hairstyle || state.accessories) && (
                        <div className="grid grid-cols-2 gap-2">
                          {state.age_stage && (
                            <div className="bg-purple-500/10 rounded-lg p-2 border border-purple-500/20">
                              <div className="flex items-center gap-1.5 text-xs text-purple-400 mb-0.5">
                                <Calendar className="w-3 h-3" />
                                年龄阶段
                              </div>
                              <p className="text-sm text-slate-200">{state.age_stage}</p>
                            </div>
                          )}
                          {state.outfit && (
                            <div className="bg-pink-500/10 rounded-lg p-2 border border-pink-500/20">
                              <div className="flex items-center gap-1.5 text-xs text-pink-400 mb-0.5">
                                <Shirt className="w-3 h-3" />
                                服装
                              </div>
                              <p className="text-sm text-slate-200 truncate">{state.outfit}</p>
                            </div>
                          )}
                          {state.hairstyle && (
                            <div className="bg-cyan-500/10 rounded-lg p-2 border border-cyan-500/20">
                              <div className="flex items-center gap-1.5 text-xs text-cyan-400 mb-0.5">
                                <Scissors className="w-3 h-3" />
                                发型
                              </div>
                              <p className="text-sm text-slate-200 truncate">{state.hairstyle}</p>
                            </div>
                          )}
                          {state.accessories && (
                            <div className="bg-amber-500/10 rounded-lg p-2 border border-amber-500/20">
                              <div className="flex items-center gap-1.5 text-xs text-amber-400 mb-0.5">
                                <Star className="w-3 h-3" />
                                配饰
                              </div>
                              <p className="text-sm text-slate-200 truncate">{state.accessories}</p>
                            </div>
                          )}
                        </div>
                      )}
                      
                      {/* 外貌描述 */}
                      {state.appearance && (
                        <div className="bg-blue-500/5 rounded-lg p-3 border border-blue-500/20">
                          <h5 className="text-xs font-medium text-slate-400 mb-1">外貌特征</h5>
                          <p className="text-sm text-slate-300 whitespace-pre-wrap">{state.appearance}</p>
                        </div>
                      )}

                      {/* 展开的标签展示 */}
                      {stateTags.length > 0 && (
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <Tag className="w-3 h-3 text-slate-500" />
                          {stateTags.map((tag, idx) => (
                            <span key={idx} className="text-xs px-2 py-0.5 rounded-full bg-slate-700/50 text-slate-300 border border-slate-600/30">
                              {tag}
                            </span>
                          ))}
                        </div>
                      )}
                      
                      {/* 三视图 */}
                      {(hasViews || state.generation_status === 'generating') && (
                        <div className="space-y-2">
                          <div className="flex items-center justify-between">
                            <h5 className="text-xs font-medium text-slate-400">三视图</h5>
                            {state.generation_status === 'generating' && (
                              <span className="text-xs text-amber-400 flex items-center gap-1">
                                <RefreshCw className="w-3 h-3 animate-spin" />
                                生成中...
                              </span>
                            )}
                          </div>
                          <div className="grid grid-cols-3 gap-2">
                            {[
                              { url: state.front_view_url, label: '正面' },
                              { url: state.side_view_url, label: '侧面' },
                              { url: state.back_view_url, label: '背面' }
                            ].map(({ url, label }) => (
                              <div key={label} className="space-y-1">
                                <p className="text-xs text-slate-500 text-center">{label}</p>
                                <div className="aspect-square bg-slate-800/60 rounded-lg overflow-hidden border border-slate-700/50 flex items-center justify-center">
                                  {url ? (
                                    <img src={url} alt={label} className="w-full h-full object-cover" />
                                  ) : (
                                    <ImageIcon className="w-6 h-6 text-slate-600" />
                                  )}
                                </div>
                              </div>
                            ))}
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
                            className="w-full bg-linear-to-r from-purple-500/20 to-pink-500/20 text-purple-300 border border-purple-500/30"
                            startContent={<RefreshCw className="w-4 h-4" />}
                            onPress={() => openGenerateModal(state)}
                            isLoading={generatingId === state.id}
                          >
                            {hasViews ? '重新生成三视图' : 'AI生成三视图'}
                          </Button>
                        </div>
                      )}
                      
                      {/* 参考图 */}
                      <div>
                        <div className="flex items-center justify-between mb-2">
                          <h5 className="text-xs font-medium text-slate-400">参考图</h5>
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-slate-500">使用参考图</span>
                            <Switch
                              size="sm"
                              isSelected={state.use_reference_images !== false}
                              onValueChange={async (enabled) => {
                                try {
                                  await updateCharacterState(characterId!, state.id, {
                                    use_reference_images: enabled
                                  });
                                  await loadStates();
                                  showToast(enabled ? '已启用参考图' : '已禁用参考图', 'success');
                                } catch (error: any) {
                                  showToast(error.message, 'error');
                                }
                              }}
                              isDisabled={disabled}
                            />
                          </div>
                        </div>
                        <ReferenceImageManager
                          assetType="character_state"
                          assetId={state.id}
                          disabled={disabled}
                        />
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
        size="3xl"
        scrollBehavior="inside"
        classNames={{
          base: "bg-slate-900/95 backdrop-blur-xl border border-slate-700/50",
          header: "border-b border-slate-700/50",
          body: "py-4"
        }}
      >
        <ModalContent>
          {(onClose) => {
            const currentTags = parseTags(formData.tags);
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
                      
                      {/* 状态分类选择器 */}
                      <div className="space-y-1.5">
                        <label className="text-xs font-medium text-slate-400">状态分类</label>
                        <div className="grid grid-cols-2 gap-2">
                          {STATE_CATEGORIES.map(cat => {
                            const IconComp = CATEGORY_ICON_MAP[cat.key];
                            const colors = CATEGORY_COLOR_MAP[cat.key];
                            const isSelected = (formData.state_category || 'daily') === cat.key;
                            return (
                              <button
                                key={cat.key}
                                type="button"
                                className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-sm transition-colors ${
                                  isSelected
                                    ? `${colors.bg} ${colors.text} ${colors.border}`
                                    : 'border-slate-600/50 text-slate-400 hover:border-slate-500 hover:text-slate-300'
                                }`}
                                onClick={() => setFormData({ ...formData, state_category: cat.key })}
                                disabled={isBaseModel}
                              >
                                <IconComp className="w-4 h-4" />
                                {cat.label}
                              </button>
                            );
                          })}
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

                      {/* 状态标签编辑 */}
                      <div className="space-y-2">
                        <label className="text-xs font-medium text-slate-400 flex items-center gap-1.5">
                          <Tag className="w-3.5 h-3.5" />
                          状态标签
                        </label>
                        {/* 已添加的标签 */}
                        {currentTags.length > 0 && (
                          <div className="flex items-center gap-1.5 flex-wrap">
                            {currentTags.map((tag, idx) => (
                              <Chip
                                key={idx}
                                size="sm"
                                variant="flat"
                                onClose={() => handleRemoveTag(tag)}
                                classNames={{
                                  base: "bg-slate-700/50 border border-slate-600/30",
                                  content: "text-xs text-slate-300"
                                }}
                              >
                                {tag}
                              </Chip>
                            ))}
                          </div>
                        )}
                        {/* 添加标签输入 */}
                        <div className="flex gap-2">
                          <Input
                            size="sm"
                            placeholder="输入标签后回车添加"
                            value={formData.tagInput || ''}
                            onValueChange={(val) => setFormData({ ...formData, tagInput: val })}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                e.preventDefault();
                                handleAddTag();
                              }
                            }}
                            classNames={{
                              input: "bg-transparent text-slate-100 text-xs",
                              inputWrapper: "bg-slate-800/60 border border-slate-600/50"
                            }}
                          />
                          <Button
                            size="sm"
                            variant="flat"
                            className="bg-slate-700/50 text-slate-300 shrink-0"
                            onPress={handleAddTag}
                            isDisabled={!formData.tagInput?.trim()}
                          >
                            添加
                          </Button>
                        </div>
                      </div>
                      
                      {/* 外观属性区域 */}
                      <div className="pt-2 border-t border-slate-700/30">
                        <label className="text-sm font-medium text-slate-400 flex items-center gap-2 mb-3">
                          <Shirt className="w-4 h-4" />
                          外观属性
                        </label>
                        
                        <div className="space-y-2">
                          <Select
                            label="年龄阶段"
                            placeholder="选择年龄阶段"
                            selectedKeys={formData.age_stage ? [formData.age_stage] : []}
                            onSelectionChange={(keys) => {
                              const value = Array.from(keys)[0] as string;
                              setFormData({ ...formData, age_stage: value || '' });
                            }}
                            classNames={{
                              trigger: "bg-slate-800/60 border border-slate-600/50",
                              value: "text-slate-100",
                              label: "text-slate-400 text-xs"
                            }}
                          >
                            {AGE_STAGES.map((stage) => (
                              <SelectItem key={stage} textValue={stage}>
                                {stage}
                              </SelectItem>
                            ))}
                          </Select>
                          
                          <Input
                            size="sm"
                            label="服装描述"
                            placeholder="如：学生制服、休闲装、战斗服"
                            value={formData.outfit || ''}
                            onValueChange={(val) => setFormData({ ...formData, outfit: val })}
                            classNames={{
                              input: "bg-transparent text-slate-100",
                              label: "text-slate-400 text-xs",
                              inputWrapper: "bg-slate-800/60 border border-slate-600/50"
                            }}
                          />
                          
                          <Input
                            size="sm"
                            label="发型描述"
                            placeholder="如：长发、短发、马尾"
                            value={formData.hairstyle || ''}
                            onValueChange={(val) => setFormData({ ...formData, hairstyle: val })}
                            classNames={{
                              input: "bg-transparent text-slate-100",
                              label: "text-slate-400 text-xs",
                              inputWrapper: "bg-slate-800/60 border border-slate-600/50"
                            }}
                          />
                          
                          <Input
                            size="sm"
                            label="配饰描述"
                            placeholder="如：眼镜、项链、帽子"
                            value={formData.accessories || ''}
                            onValueChange={(val) => setFormData({ ...formData, accessories: val })}
                            classNames={{
                              input: "bg-transparent text-slate-100",
                              label: "text-slate-400 text-xs",
                              inputWrapper: "bg-slate-800/60 border border-slate-600/50"
                            }}
                          />
                        </div>
                        
                        {/* 外貌提示词预览 */}
                        {(formData.outfit || formData.hairstyle || formData.accessories || formData.age_stage || formData.appearance) && (
                          <div className="mt-3 p-2.5 rounded-lg bg-purple-500/5 border border-purple-500/20">
                            <div className="flex items-center gap-1.5 mb-1.5">
                              <Sparkles className="w-3 h-3 text-purple-400" />
                              <span className="text-xs font-medium text-purple-400">生成提示词预览</span>
                            </div>
                            <p className="text-xs text-slate-400 leading-relaxed">
                              {[
                                formData.appearance || '',
                                formData.age_stage ? `年龄阶段: ${formData.age_stage}` : '',
                                formData.outfit ? `服装: ${formData.outfit}` : '',
                                formData.hairstyle ? `发型: ${formData.hairstyle}` : '',
                                formData.accessories ? `配饰: ${formData.accessories}` : ''
                              ].filter(Boolean).join('；')}
                            </p>
                            <p className="text-xs text-slate-500 mt-1.5">
                              生成图像时将基于以上描述构建提示词，修改外观属性后重新生成即可反映变化
                            </p>
                          </div>
                        )}
                      </div>
                    </div>
                    
                    {/* 右侧：三视图 */}
                    <div className="space-y-3">
                      <Input
                        label="主图URL"
                        placeholder="状态主图"
                        value={formData.image_url || ''}
                        onValueChange={(val) => setFormData({ ...formData, image_url: val })}
                        classNames={{
                          input: "bg-transparent text-slate-100",
                          label: "text-slate-400 font-medium",
                          inputWrapper: "bg-slate-800/60 border border-slate-600/50"
                        }}
                      />
                      
                      <label className="text-sm font-medium text-slate-400">三视图</label>
                      
                      <Input
                        size="sm"
                        label="正面视图URL"
                        placeholder="正面视图"
                        value={formData.front_view_url || ''}
                        onValueChange={(val) => setFormData({ ...formData, front_view_url: val })}
                        classNames={{
                          input: "bg-transparent text-slate-100",
                          label: "text-slate-400 text-xs",
                          inputWrapper: "bg-slate-800/60 border border-slate-600/50"
                        }}
                      />
                      
                      <Input
                        size="sm"
                        label="侧面视图URL"
                        placeholder="侧面视图"
                        value={formData.side_view_url || ''}
                        onValueChange={(val) => setFormData({ ...formData, side_view_url: val })}
                        classNames={{
                          input: "bg-transparent text-slate-100",
                          label: "text-slate-400 text-xs",
                          inputWrapper: "bg-slate-800/60 border border-slate-600/50"
                        }}
                      />
                      
                      <Input
                        size="sm"
                        label="背面视图URL"
                        placeholder="背面视图"
                        value={formData.back_view_url || ''}
                        onValueChange={(val) => setFormData({ ...formData, back_view_url: val })}
                        classNames={{
                          input: "bg-transparent text-slate-100",
                          label: "text-slate-400 text-xs",
                          inputWrapper: "bg-slate-800/60 border border-slate-600/50"
                        }}
                      />
                      
                      {/* 三视图预览 */}
                      <div className="grid grid-cols-3 gap-2 mt-2">
                        {[{ key: 'front_view_url', label: '正面' }, { key: 'side_view_url', label: '侧面' }, { key: 'back_view_url', label: '背面' }].map(({ key, label }) => {
                          const url = formData[key as keyof typeof formData];
                          return (
                            <div key={key} className="space-y-1">
                              <p className="text-xs text-slate-500 text-center">{label}</p>
                              <div className="aspect-square bg-slate-800/60 rounded-lg overflow-hidden border border-slate-700/50 flex items-center justify-center">
                                {url ? (
                                  <img src={String(url)} alt={label} className="w-full h-full object-cover" />
                                ) : (
                                  <ImageIcon className="w-6 h-6 text-slate-600" />
                                )}
                              </div>
                            </div>
                          );
                        })}
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
                  AI生成角色状态图片
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
                      <p className="text-xs text-slate-500">将基于此角色生成新的状态图片</p>
                    </div>
                  </div>
                )}

                {/* 自然语言输入 */}
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

                {/* 分析按钮 */}
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
                  isDisabled={!generatedTags || !selected.image}
                  startContent={<RefreshCw className="w-4 h-4" />}
                >
                  生成图片
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
