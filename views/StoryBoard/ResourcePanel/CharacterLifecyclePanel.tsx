/**
 * 角色生命周期资产管理界面
 * 
 * 功能：
 * - 显示角色的所有状态版本（基础白膜、各剧集状态）
 * - 管理角色服装（穿戴/脱下）
 * - 为各状态生成/重新生成三视图
 * - 预览角色的三视图
 */

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Modal, ModalContent, ModalHeader, ModalBody, ModalFooter,
  Button, Tabs, Tab, Card, CardBody, Chip, Image,
  Dropdown, DropdownTrigger, DropdownMenu, DropdownItem,
  Spinner, useDisclosure
} from '@heroui/react';
import {
  RefreshCw, User, Shirt, Plus, Check, Trash2,
  ChevronLeft, ChevronRight, Eye, LayoutGrid, List, Star,
  Clock, Sparkles, Tag, History
} from 'lucide-react';
import { Character, CharacterState } from './types';
import { Costume, fetchCostumes, equipCostume, unequipCostume, fetchCharacterCostumes } from '../../../services/costumes';
import { fetchCharacterStateHistory, STATE_CATEGORIES, type StateCategory } from '../../../services/assets';
import { getAuthToken } from '../../../services/auth';

// 状态分类图标映射
const CATEGORY_ICON_MAP: Record<string, React.ElementType> = {
  daily: User,
  costume: Shirt,
  time: Clock,
  effect: Sparkles,
};

// 状态分类颜色映射
const CATEGORY_COLOR_MAP: Record<string, { bg: string; text: string; border: string }> = {
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

interface CharacterLifecyclePanelProps {
  isOpen: boolean;
  onClose: () => void;
  character: Character | null;
  onGenerateViews?: (stateId: number, isBaseModel: boolean) => void;
  onRefresh?: () => void;
}

const CharacterLifecyclePanel: React.FC<CharacterLifecyclePanelProps> = ({
  isOpen,
  onClose,
  character,
  onGenerateViews,
  onRefresh
}) => {
  const [states, setStates] = useState<CharacterState[]>([]);
  const [costumes, setCostumes] = useState<Costume[]>([]);
  const [equippedCostumes, setEquippedCostumes] = useState<(Costume & { is_equipped: boolean })[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedState, setSelectedState] = useState<CharacterState | null>(null);
  const [activeTab, setActiveTab] = useState<string>('states');
  // 状态版本视图模式：卡片网格 / 紧凑列表
  const [stateViewMode, setStateViewMode] = useState<'grid' | 'list'>('grid');
  // 分类筛选
  const [activeCategoryFilter, setActiveCategoryFilter] = useState<StateCategory | 'all'>('all');
  // 变更历史
  const [stateHistory, setStateHistory] = useState<any[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  // 加载角色状态
  const loadStates = useCallback(async () => {
    if (!character) return;
    
    setLoading(true);
    try {
      const token = getAuthToken();
      const response = await fetch(`/api/characters/${character.id}/states`, {
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        }
      });
      
      if (response.ok) {
        const data = await response.json();
        setStates(data.states || []);
        // 默认选中基础白膜状态
        const baseModel = data.states?.find((s: CharacterState) => s.is_base_model);
        setSelectedState(baseModel || data.states?.[0] || null);
      }
    } catch (error) {
      console.error('[CharacterLifecycle] 加载状态失败:', error);
    } finally {
      setLoading(false);
    }
  }, [character]);

  // 加载变更历史
  const loadHistory = useCallback(async () => {
    if (!character) return;
    setLoadingHistory(true);
    try {
      const result = await fetchCharacterStateHistory(character.id, { limit: 50 });
      setStateHistory(result.history || []);
    } catch (error) {
      console.error('[CharacterLifecycle] 加载历史失败:', error);
    } finally {
      setLoadingHistory(false);
    }
  }, [character]);

  // 按分类筛选状态（白膜始终置顶）
  const filteredStates = useMemo(() => {
    let result = states;
    if (activeCategoryFilter !== 'all') {
      result = states.filter(s => (s.state_category || 'daily') === activeCategoryFilter);
    }
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

  // 加载项目服装列表
  const loadCostumes = useCallback(async () => {
    if (!character?.projectId) return;
    
    try {
      const costumeList = await fetchCostumes(character.projectId);
      setCostumes(costumeList);
    } catch (error) {
      console.error('[CharacterLifecycle] 加载服装失败:', error);
    }
  }, [character?.projectId]);

  // 加载角色已装备的服装
  const loadEquippedCostumes = useCallback(async () => {
    if (!character) return;
    
    try {
      const data = await fetchCharacterCostumes(character.id);
      setEquippedCostumes(data.costumes || []);
    } catch (error) {
      console.error('[CharacterLifecycle] 加载角色服装失败:', error);
    }
  }, [character]);

  useEffect(() => {
    if (isOpen && character) {
      loadStates();
      loadCostumes();
      loadEquippedCostumes();
      if (activeTab === 'history') loadHistory();
    }
  }, [isOpen, character, loadStates, loadCostumes, loadEquippedCostumes, activeTab]);

  // 穿戴服装
  const handleEquipCostume = async (costume: Costume) => {
    if (!character) return;
    
    try {
      await equipCostume(character.id, costume.id);
      await loadEquippedCostumes();
      onRefresh?.();
    } catch (error: any) {
      console.error('[CharacterLifecycle] 穿戴服装失败:', error);
      alert(error.message || '穿戴服装失败');
    }
  };

  // 脱下服装
  const handleUnequipCostume = async (costume: Costume) => {
    if (!character) return;
    
    try {
      await unequipCostume(character.id, costume.id);
      await loadEquippedCostumes();
      onRefresh?.();
    } catch (error: any) {
      console.error('[CharacterLifecycle] 脱下服装失败:', error);
      alert(error.message || '脱下服装失败');
    }
  };

  // 创建新状态
  const handleCreateState = async () => {
    if (!character) return;
    
    try {
      const token = getAuthToken();
      const response = await fetch(`/api/characters/${character.id}/states`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        },
        body: JSON.stringify({
          name: `状态 ${states.length + 1}`,
          description: '',
          appearance: character.appearance || '',
          gender: character.gender || 'unknown',
          state_category: 'daily'
        })
      });
      
      if (response.ok) {
        await loadStates();
      }
    } catch (error) {
      console.error('[CharacterLifecycle] 创建状态失败:', error);
    }
  };

  // 删除状态
  const handleDeleteState = async (stateId: number) => {
    if (!character || states.length <= 1) {
      alert('至少保留一个状态');
      return;
    }
    
    if (!confirm('确定要删除此状态吗？')) return;
    
    try {
      const token = getAuthToken();
      const response = await fetch(`/api/characters/${character.id}/states/${stateId}`, {
        method: 'DELETE',
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        }
      });
      
      if (response.ok) {
        await loadStates();
      }
    } catch (error) {
      console.error('[CharacterLifecycle] 删除状态失败:', error);
    }
  };

  // 激活状态
  const handleActivateState = async (stateId: number) => {
    if (!character) return;
    
    try {
      const token = getAuthToken();
      const response = await fetch(`/api/characters/${character.id}/states/${stateId}/activate`, {
        method: 'PUT',
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        }
      });
      
      if (response.ok) {
        await loadStates();
        onRefresh?.();
      }
    } catch (error) {
      console.error('[CharacterLifecycle] 激活状态失败:', error);
    }
  };

  // 渲染三视图预览
  const renderViewsPreview = (state: CharacterState) => {
    const views = [
      { label: '正面', url: state.front_view_url || state.image_url },
      { label: '侧面', url: state.side_view_url },
      { label: '背面', url: state.back_view_url }
    ];

    return (
      <div className="flex gap-2 mt-2">
        {views.map((view, idx) => (
          <div key={idx} className="flex-1 aspect-square bg-slate-800 rounded-lg overflow-hidden border border-slate-700">
            {view.url ? (
              <img 
                src={view.url} 
                alt={view.label} 
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-slate-500">
                <User className="w-8 h-8" />
              </div>
            )}
          </div>
        ))}
      </div>
    );
  };

  if (!character) return null;

  return (
    <Modal 
      isOpen={isOpen} 
      onClose={onClose} 
      size="5xl"
      scrollBehavior="inside"
    >
      <ModalContent>
        <ModalHeader className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-purple-500/20 flex items-center justify-center shrink-0">
            {character.imageUrl ? (
              <img src={character.imageUrl} alt="" className="w-full h-full rounded-full object-cover" />
            ) : (
              <User className="w-5 h-5 text-purple-400" />
            )}
          </div>
          <div>
            <h3 className="text-lg font-bold">{character.name}</h3>
            <p className="text-sm text-slate-400">
              {character.gender === 'male' ? '男性' : character.gender === 'female' ? '女性' : '未知性别'}
              {character.appearance && ` · ${character.appearance.slice(0, 30)}...`}
            </p>
          </div>
        </ModalHeader>
        
        <ModalBody className="p-0">
          <Tabs 
            selectedKey={activeTab} 
            onSelectionChange={(key) => setActiveTab(String(key))}
            className="px-6 pt-2"
          >
            <Tab key="states" title="状态版本" />
            <Tab key="costumes" title="服装管理" />
            <Tab key="history" title={
              <div className="flex items-center gap-1.5">
                <History className="w-4 h-4" />
                变更历史
              </div>
            } />
          </Tabs>

          {loading ? (
            <div className="flex items-center justify-center py-20">
              <Spinner size="lg" />
            </div>
          ) : (
            <>
              {/* 状态版本Tab */}
              {activeTab === 'states' && (
                <div className="p-6">
                  <div className="flex justify-between items-center mb-4">
                    <div className="flex items-center gap-3">
                      <h4 className="text-sm font-semibold text-slate-300">角色状态版本</h4>
                      {/* 视图切换按钮 */}
                      <div className="flex items-center gap-0.5 bg-slate-800/60 rounded-lg p-0.5">
                        <button
                          className={`p-1.5 rounded-md transition-colors ${
                            stateViewMode === 'grid'
                              ? 'bg-amber-500/20 text-amber-400'
                              : 'text-slate-400 hover:text-slate-300'
                          }`}
                          onClick={() => setStateViewMode('grid')}
                          title="卡片视图"
                        >
                          <LayoutGrid className="w-3.5 h-3.5" />
                        </button>
                        <button
                          className={`p-1.5 rounded-md transition-colors ${
                            stateViewMode === 'list'
                              ? 'bg-amber-500/20 text-amber-400'
                              : 'text-slate-400 hover:text-slate-300'
                          }`}
                          onClick={() => setStateViewMode('list')}
                          title="列表视图"
                        >
                          <List className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                    <Button 
                      size="sm" 
                      color="primary" 
                      variant="flat"
                      startContent={<Plus className="w-4 h-4" />}
                      onPress={handleCreateState}
                    >
                      新建状态
                    </Button>
                  </div>
                  
                  {/* 分类筛选栏 */}
                  <div className="flex items-center gap-1.5 mb-4 flex-wrap">
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
                          onClick={() => setActiveCategoryFilter(cat.key as StateCategory)}
                        >
                          {React.createElement(CATEGORY_ICON_MAP[cat.key], { className: 'w-3 h-3' })}
                          {cat.label} ({count})
                        </button>
                      );
                    })}
                  </div>
                  
                  {/* 当前激活状态快速切换面板 */}
                  {states.filter(s => s.is_active).length > 0 && (
                    <div className="mb-4 p-3 bg-amber-500/5 rounded-lg border border-amber-500/20">
                      <div className="flex items-center gap-2 mb-2">
                        <Star className="w-4 h-4 text-amber-400 fill-current" />
                        <span className="text-sm font-medium text-amber-300">当前激活状态</span>
                      </div>
                      <div className="flex items-center gap-3">
                        {(() => {
                          const activeState = states.find(s => s.is_active);
                          if (!activeState) return null;
                          const thumb = activeState.image_url || activeState.front_view_url;
                          const category = (Array.isArray(activeState.state_category)
                            ? (activeState.state_category[0] || 'daily')
                            : (activeState.state_category || 'daily')) as 'daily' | 'costume' | 'time' | 'effect';
                          const colors = CATEGORY_COLOR_MAP[category];
                          return (
                            <>
                              <div className="w-10 h-10 rounded-lg overflow-hidden bg-slate-700 shrink-0">
                                {thumb ? (
                                  <img src={thumb} alt={activeState.name} className="w-full h-full object-cover" />
                                ) : (
                                  <div className="w-full h-full flex items-center justify-center">
                                    <User className="w-5 h-5 text-slate-500" />
                                  </div>
                                )}
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2">
                                  <span className="text-sm font-medium text-slate-200">{activeState.name}</span>
                                  <span className={`text-xs px-1.5 py-0.5 rounded ${colors.bg} ${colors.text}`}>
                                    {STATE_CATEGORIES.find(c => c.key === category)?.label || '日常'}
                                  </span>
                                  {activeState.is_base_model && (
                                    <span className="text-xs px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-400">白膜</span>
                                  )}
                                </div>
                                {activeState.description && (
                                  <p className="text-xs text-slate-500 truncate">{activeState.description}</p>
                                )}
                              </div>
                            </>
                          );
                        })()}
                      </div>
                    </div>
                  )}
                  
                  {/* 卡片网格视图 */}
                  {stateViewMode === 'grid' && (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {filteredStates.map((state) => {
                      const category = (Array.isArray(state.state_category)
                        ? (state.state_category[0] || 'daily')
                        : (state.state_category || 'daily')) as 'daily' | 'costume' | 'time' | 'effect';
                      const colors = CATEGORY_COLOR_MAP[category];
                      const stateTags = parseTags(state.tags);
                      return (
                        <Card 
                          key={state.id}
                          className={`bg-slate-800/60 border ${
                            state.is_active ? 'border-purple-500/50' : state.is_base_model ? 'border-amber-500/30' : 'border-slate-700/50'
                          } ${selectedState?.id === state.id ? 'ring-2 ring-purple-500' : ''}`}
                          isPressable
                          onPress={() => setSelectedState(state)}
                        >
                          <CardBody className="p-4">
                            <div className="flex items-start justify-between mb-2">
                              <div>
                                <div className="flex items-center gap-2">
                                  <h5 className="font-semibold">{state.name}</h5>
                                  {state.is_base_model && (
                                    <Chip size="sm" color="warning" variant="flat">白膜</Chip>
                                  )}
                                  {state.is_active && (
                                    <Chip size="sm" color="success" variant="flat">激活</Chip>
                                  )}
                                  <span className={`text-xs px-1.5 py-0.5 rounded ${colors.bg} ${colors.text}`}>
                                    {STATE_CATEGORIES.find(c => c.key === category)?.label || '日常'}
                                  </span>
                                </div>
                                {state.description && (
                                  <p className="text-xs text-slate-400 mt-1">{state.description}</p>
                                )}
                                {/* 标签展示 */}
                                {stateTags.length > 0 && (
                                  <div className="flex items-center gap-1 mt-1 flex-wrap">
                                    <Tag className="w-3 h-3 text-slate-500" />
                                    {stateTags.slice(0, 3).map((tag, idx) => (
                                      <span key={idx} className="text-xs px-1.5 py-0 rounded bg-slate-700/50 text-slate-400">
                                        {tag}
                                      </span>
                                    ))}
                                    {stateTags.length > 3 && (
                                      <span className="text-xs text-slate-500">+{stateTags.length - 3}</span>
                                    )}
                                  </div>
                                )}
                              </div>
                              
                              <Dropdown>
                                <DropdownTrigger>
                                  <Button isIconOnly size="sm" variant="light">
                                    <Eye className="w-4 h-4" />
                                  </Button>
                                </DropdownTrigger>
                                <DropdownMenu>
                                  {!state.is_active ? (
                                    <DropdownItem 
                                      key="activate"
                                      startContent={<Check className="w-4 h-4" />}
                                      onPress={() => handleActivateState(state.id)}
                                    >
                                      激活此状态
                                    </DropdownItem>
                                  ) : null}
                                  <DropdownItem 
                                    key="generate"
                                    startContent={<RefreshCw className="w-4 h-4" />}
                                    onPress={() => onGenerateViews?.(state.id, !!state.is_base_model)}
                                  >
                                    {state.generation_status === 'generating' ? '生成中...' : '生成三视图'}
                                  </DropdownItem>
                                  {!state.is_base_model ? (
                                    <DropdownItem 
                                      key="delete"
                                      className="text-danger"
                                      startContent={<Trash2 className="w-4 h-4" />}
                                      onPress={() => handleDeleteState(state.id)}
                                    >
                                      删除状态
                                    </DropdownItem>
                                  ) : null}
                                </DropdownMenu>
                              </Dropdown>
                            </div>
                            
                            {renderViewsPreview(state)}
                          </CardBody>
                        </Card>
                      );
                    })}
                  </div>
                  )}

                  {/* 紧凑列表视图 */}
                  {stateViewMode === 'list' && (
                    <div className="space-y-1 bg-slate-800/30 rounded-lg overflow-hidden border border-slate-700/50">
                      {filteredStates.map((state) => {
                        const thumb = state.image_url || state.front_view_url;
                        const isSelected = selectedState?.id === state.id;
                        const category = (Array.isArray(state.state_category)
                          ? (state.state_category[0] || 'daily')
                          : (state.state_category || 'daily')) as 'daily' | 'costume' | 'time' | 'effect';
                        const colors = CATEGORY_COLOR_MAP[category];
                        const stateTags = parseTags(state.tags);
                        return (
                          <div
                            key={state.id}
                            className={`flex items-center gap-3 px-4 py-2.5 cursor-pointer transition-colors group ${
                              isSelected
                                ? 'bg-slate-700/60 ring-1 ring-purple-500/40'
                                : 'hover:bg-slate-700/30'
                            }`}
                            onClick={() => setSelectedState(state)}
                          >
                            {/* 缩略图 */}
                            <div className={`shrink-0 w-9 h-9 rounded-lg overflow-hidden flex items-center justify-center ${
                              state.is_base_model ? 'bg-amber-500/10 border border-amber-500/30' : 'bg-slate-700'
                            }`}>
                              {thumb ? (
                                <img src={thumb} alt={state.name} className="w-full h-full object-cover" loading="lazy" />
                              ) : state.is_base_model ? (
                                <Star className="w-4 h-4 text-amber-400" />
                              ) : (
                                <User className="w-4 h-4 text-slate-500" />
                              )}
                            </div>

                            {/* 名称 */}
                            <span className="text-sm font-medium text-slate-200 truncate min-w-0 shrink-0 max-w-32">
                              {state.name}
                            </span>

                            {/* 标签 */}
                            <div className="flex-1 min-w-0 flex items-center gap-1.5 flex-wrap">
                              {state.is_active && (
                                <span className="text-xs px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-400 flex items-center gap-0.5 shrink-0">
                                  <Star className="w-3 h-3 fill-current" />
                                  激活
                                </span>
                              )}
                              {state.is_base_model && (
                                <span className="text-xs px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-400 shrink-0">
                                  白膜
                                </span>
                              )}
                              <span className={`text-xs px-1.5 py-0.5 rounded ${colors.bg} ${colors.text} shrink-0`}>
                                {STATE_CATEGORIES.find(c => c.key === category)?.label || '日常'}
                              </span>
                              {stateTags.slice(0, 2).map((tag, idx) => (
                                <span key={idx} className="text-xs px-1.5 py-0 rounded bg-slate-700/50 text-slate-400 shrink-0">
                                  {tag}
                                </span>
                              ))}
                              {state.description && (
                                <span className="text-xs text-slate-500 truncate">
                                  {state.description}
                                </span>
                              )}
                            </div>

                            {/* 操作按钮 */}
                            <div className="shrink-0 flex items-center gap-1">
                              {!state.is_active && (
                                <Button
                                  size="sm"
                                  isIconOnly
                                  variant="light"
                                  className="opacity-0 group-hover:opacity-100 transition-opacity text-slate-400 hover:text-amber-400"
                                  onPress={() => handleActivateState(state.id)}
                                  title="激活此状态"
                                >
                                  <Star className="w-3.5 h-3.5" />
                                </Button>
                              )}
                              <Button
                                size="sm"
                                isIconOnly
                                variant="light"
                                className="opacity-0 group-hover:opacity-100 transition-opacity text-slate-400 hover:text-blue-400"
                                onPress={() => onGenerateViews?.(state.id, !!state.is_base_model)}
                                isDisabled={state.generation_status === 'generating'}
                                title="生成三视图"
                              >
                                <RefreshCw className={`w-3.5 h-3.5 ${state.generation_status === 'generating' ? 'animate-spin' : ''}`} />
                              </Button>
                              {!state.is_base_model && (
                                <Button
                                  size="sm"
                                  isIconOnly
                                  variant="light"
                                  className="opacity-0 group-hover:opacity-100 transition-opacity text-slate-400 hover:text-red-400"
                                  onPress={() => handleDeleteState(state.id)}
                                  title="删除状态"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </Button>
                              )}
                            </div>
                          </div>
                        );
                      })}
                      {filteredStates.length === 0 && (
                        <div className="text-center py-8 text-slate-500 text-sm">
                          暂无匹配的状态版本
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* 服装管理Tab */}
              {activeTab === 'costumes' && (
                <div className="p-6">
                  <div className="mb-4">
                    <h4 className="text-sm font-semibold text-slate-300 mb-2">当前穿戴</h4>
                    {equippedCostumes.filter(c => c.is_equipped).length > 0 ? (
                      <div className="flex flex-wrap gap-2">
                        {equippedCostumes.filter(c => c.is_equipped).map((costume) => (
                          <Chip
                            key={costume.id}
                            onClose={() => handleUnequipCostume(costume)}
                            variant="flat"
                            color="primary"
                          >
                            {costume.name}
                          </Chip>
                        ))}
                      </div>
                    ) : (
                      <p className="text-sm text-slate-500">未穿戴任何服装</p>
                    )}
                  </div>

                  <div className="mb-4">
                    <h4 className="text-sm font-semibold text-slate-300 mb-2">可用服装（项目级）</h4>
                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                      {costumes.map((costume) => {
                        const isEquipped = equippedCostumes.some(
                          ec => ec.id === costume.id && ec.is_equipped
                        );
                        
                        return (
                          <div 
                            key={costume.id}
                            className={`bg-slate-800 rounded-lg p-3 border ${
                              isEquipped ? 'border-purple-500/50' : 'border-slate-700/50'
                            }`}
                          >
                            <div className="aspect-square bg-slate-700 rounded mb-2 overflow-hidden">
                              {costume.image_url || costume.front_view_url ? (
                                <img 
                                  src={costume.front_view_url || costume.image_url} 
                                  alt={costume.name}
                                  className="w-full h-full object-cover"
                                />
                              ) : (
                                <div className="w-full h-full flex items-center justify-center">
                                  <Shirt className="w-8 h-8 text-slate-500" />
                                </div>
                              )}
                            </div>
                            <div className="flex items-center justify-between">
                              <div>
                                <p className="text-sm font-medium truncate">{costume.name}</p>
                                <p className="text-xs text-slate-500">
                                  {costume.gender === 'male' ? '男性' : 
                                   costume.gender === 'female' ? '女性' : '通用'}
                                </p>
                              </div>
                              <Button
                                size="sm"
                                color={isEquipped ? 'danger' : 'primary'}
                                variant="flat"
                                onPress={() => isEquipped ? handleUnequipCostume(costume) : handleEquipCostume(costume)}
                              >
                                {isEquipped ? '脱下' : '穿戴'}
                              </Button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                    
                    {costumes.length === 0 && (
                      <p className="text-sm text-slate-500 text-center py-8">
                        项目中暂无服装，请在资源管理器中创建
                      </p>
                    )}
                  </div>
                </div>
              )}
              
              {/* 变更历史Tab */}
              {activeTab === 'history' && (
                <div className="p-6">
                  <div className="flex items-center justify-between mb-4">
                    <h4 className="text-sm font-semibold text-slate-300 flex items-center gap-2">
                      <History className="w-4 h-4" />
                      状态变更历史
                    </h4>
                    <Button
                      size="sm"
                      variant="flat"
                      className="text-slate-400"
                      startContent={<RefreshCw className="w-3 h-3" />}
                      onPress={loadHistory}
                      isLoading={loadingHistory}
                    >
                      刷新
                    </Button>
                  </div>
                  
                  {loadingHistory ? (
                    <div className="flex items-center justify-center py-12">
                      <Spinner size="sm" />
                    </div>
                  ) : stateHistory.length === 0 ? (
                    <div className="text-center py-8 text-slate-500 text-sm">
                      暂无变更历史
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {stateHistory.map((entry, idx) => {
                        const actionLabels: Record<string, { label: string; color: string; icon: React.ElementType }> = {
                          created: { label: '创建', color: 'text-green-400 bg-green-500/15', icon: Plus },
                          updated: { label: '更新', color: 'text-blue-400 bg-blue-500/15', icon: Eye },
                          activated: { label: '激活', color: 'text-amber-400 bg-amber-500/15', icon: Star },
                          deactivated: { label: '取消激活', color: 'text-slate-400 bg-slate-500/15', icon: Star },
                          deleted: { label: '删除', color: 'text-red-400 bg-red-500/15', icon: Trash2 },
                          duplicated: { label: '复制', color: 'text-purple-400 bg-purple-500/15', icon: RefreshCw },
                        };
                        const actionConfig = actionLabels[entry.action] || actionLabels.updated;
                        const ActionIcon = actionConfig.icon;
                        
                        return (
                          <div key={entry.id || idx} className="flex gap-3 p-3 bg-slate-800/40 rounded-lg border border-slate-700/30">
                            {/* 操作图标 */}
                            <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${actionConfig.color}`}>
                              <ActionIcon className="w-4 h-4" />
                            </div>
                            
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-0.5">
                                <span className={`text-xs px-1.5 py-0.5 rounded ${actionConfig.color}`}>
                                  {actionConfig.label}
                                </span>
                                {entry.state_id && (
                                  <span className="text-xs text-slate-500">状态ID: {entry.state_id}</span>
                                )}
                              </div>
                              
                              {/* 变更详情 */}
                              {entry.changes && Object.keys(entry.changes).length > 0 && (
                                <div className="mt-1.5 space-y-1">
                                  {Object.entries(entry.changes).map(([field, change]: [string, any]) => (
                                    <div key={field} className="text-xs text-slate-500 flex items-center gap-1.5">
                                      <span className="text-slate-400 font-medium">{field}:</span>
                                      <span className="line-through text-red-400/60">{String(change.from ?? '')}</span>
                                      <ChevronRight className="w-3 h-3 text-slate-600" />
                                      <span className="text-green-400/80">{String(change.to ?? '')}</span>
                                    </div>
                                  ))}
                                </div>
                              )}
                              
                              {/* 快照摘要 */}
                              {entry.snapshot && !entry.changes && (
                                <p className="text-xs text-slate-500 mt-1 truncate">
                                  {entry.snapshot.name || `状态快照`}
                                </p>
                              )}
                            </div>
                            
                            {/* 时间 */}
                            <span className="text-xs text-slate-600 shrink-0 whitespace-nowrap">
                              {entry.created_at ? new Date(entry.created_at).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }) : ''}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </ModalBody>

        <ModalFooter>
          <Button variant="light" onPress={onClose}>
            关闭
          </Button>
          {selectedState && (
            <Button
              color="primary"
              startContent={<RefreshCw className="w-4 h-4" />}
              onPress={() => onGenerateViews?.(selectedState.id, !!selectedState.is_base_model)}
              isDisabled={selectedState.generation_status === 'generating'}
            >
              {selectedState.generation_status === 'generating' ? '生成中...' : '生成选中状态三视图'}
            </Button>
          )}
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
};

export default CharacterLifecyclePanel;
