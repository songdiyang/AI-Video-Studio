/**
 * 角色生命周期资产管理界面
 * 
 * 功能：
 * - 显示角色的所有状态版本（基础白膜、各剧集状态）
 * - 管理角色服装（穿戴/脱下）
 * - 为各状态生成/重新生成三视图
 * - 预览角色的三视图
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  Modal, ModalContent, ModalHeader, ModalBody, ModalFooter,
  Button, Tabs, Tab, Card, CardBody, Chip, Image,
  Dropdown, DropdownTrigger, DropdownMenu, DropdownItem,
  Spinner, useDisclosure
} from '@heroui/react';
import {
  X, RefreshCw, User, Shirt, Plus, Check, Trash2,
  ChevronLeft, ChevronRight, Eye
} from 'lucide-react';
import { Character, CharacterState } from './types';
import { Costume, fetchCostumes, equipCostume, unequipCostume, fetchCharacterCostumes } from '../../../services/costumes';
import { getAuthToken } from '../../../services/auth';

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
    }
  }, [isOpen, character, loadStates, loadCostumes, loadEquippedCostumes]);

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
          gender: character.gender || 'unknown'
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
        <ModalHeader className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-purple-500/20 flex items-center justify-center">
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
          </div>
          <Button isIconOnly variant="light" onPress={onClose}>
            <X className="w-5 h-5" />
          </Button>
        </ModalHeader>
        
        <ModalBody className="p-0">
          <Tabs 
            selectedKey={activeTab} 
            onSelectionChange={(key) => setActiveTab(String(key))}
            className="px-6 pt-2"
          >
            <Tab key="states" title="状态版本" />
            <Tab key="costumes" title="服装管理" />
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
                    <h4 className="text-sm font-semibold text-slate-300">角色状态版本</h4>
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
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {states.map((state) => (
                      <Card 
                        key={state.id}
                        className={`bg-slate-800/60 border ${
                          state.is_active ? 'border-purple-500/50' : 'border-slate-700/50'
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
                                  <Chip size="sm" color="secondary" variant="flat">白膜</Chip>
                                )}
                                {state.is_active && (
                                  <Chip size="sm" color="success" variant="flat">激活</Chip>
                                )}
                              </div>
                              {state.description && (
                                <p className="text-xs text-slate-400 mt-1">{state.description}</p>
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
                    ))}
                  </div>
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
