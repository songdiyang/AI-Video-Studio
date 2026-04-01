import React, { useState, useEffect, useCallback } from 'react';
import { Button, Input, Textarea, Modal, ModalContent, ModalHeader, ModalBody, ModalFooter, useDisclosure, Card, CardBody, Select, SelectItem, Tooltip } from '@heroui/react';
import { Plus, Edit2, Trash2, ChevronDown, ChevronRight, Image as ImageIcon, Star, Copy, RefreshCw, Shirt, Calendar, Scissors } from 'lucide-react';
import {
  CharacterState,
  fetchCharacterStates,
  createCharacterState,
  updateCharacterState,
  deleteCharacterState,
  activateCharacterState,
  duplicateCharacterState,
  AGE_STAGES
} from '../../../services/assets';
import ReferenceImageManager from './ReferenceImageManager';
import { useToast } from '../../../contexts/ToastContext';
import { useConfirm } from '../../../contexts/ConfirmContext';

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
  const [loading, setLoading] = useState(false);
  const [expandedStates, setExpandedStates] = useState<Set<number>>(new Set());
  const [activatingId, setActivatingId] = useState<number | null>(null);
  const [duplicatingId, setDuplicatingId] = useState<number | null>(null);
  
  // 编辑状态表单
  const [editingState, setEditingState] = useState<CharacterState | null>(null);
  const [formData, setFormData] = useState<Partial<CharacterState>>({
    name: '',
    description: '',
    appearance: '',
    image_url: '',
    front_view_url: '',
    side_view_url: '',
    back_view_url: '',
    // 新增外观属性
    outfit: '',
    age_stage: '',
    hairstyle: '',
    accessories: '',
    is_active: false
  });
  
  const { showToast } = useToast();
  const { confirm } = useConfirm();
  const { isOpen, onOpen, onOpenChange } = useDisclosure();

  // 加载状态列表
  const loadStates = useCallback(async () => {
    if (!characterId) return;
    setLoading(true);
    try {
      const data = await fetchCharacterStates(characterId);
      setStates(data);
    } catch (error: any) {
      console.error('加载角色状态失败:', error);
    } finally {
      setLoading(false);
    }
  }, [characterId]);

  useEffect(() => {
    loadStates();
  }, [loadStates]);

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
  const handleCreate = () => {
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
      is_active: false
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
      is_active: state.is_active || false
    });
    onOpen();
  };

  // 保存状态
  const handleSave = async () => {
    if (!formData.name?.trim()) {
      showToast('状态名称不能为空', 'error');
      return;
    }

    try {
      if (editingState) {
        // 更新
        await updateCharacterState(characterId!, editingState.id, formData);
        showToast('状态更新成功', 'success');
      } else {
        // 创建
        await createCharacterState(characterId!, formData);
        showToast('状态创建成功', 'success');
      }
      await loadStates();
      onOpenChange();
    } catch (error: any) {
      showToast(error.message, 'error');
    }
  };

  // 删除状态
  const handleDelete = async (state: CharacterState) => {
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
    if (state.is_active) return; // 已经是激活状态
    
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

  if (!characterId) {
    return (
      <div className="text-center py-8 text-slate-500">
        <ImageIcon className="w-12 h-12 mx-auto mb-2 opacity-30" />
        <p className="text-sm">请先保存角色后再管理状态</p>
      </div>
    );
  }

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
          <Button
            size="sm"
            variant="flat"
            className="bg-blue-500/10 text-blue-400 hover:bg-blue-500/20"
            startContent={<Plus className="w-3 h-3" />}
            onPress={handleCreate}
          >
            新建状态
          </Button>
        )}
      </div>

      {/* 状态列表 */}
      {loading ? (
        <div className="text-center py-4 text-slate-400 text-sm">
          加载中...
        </div>
      ) : states.length === 0 ? (
        <div className="text-center py-6 bg-slate-800/30 rounded-lg border border-slate-700/30">
          <p className="text-sm text-slate-500">暂无状态</p>
          <p className="text-xs text-slate-600 mt-1">可添加角色的不同时期或状态版本</p>
        </div>
      ) : (
        <div className="space-y-2">
          {states.map((state) => {
            const isExpanded = expandedStates.has(state.id);
            const hasViews = !!(state.front_view_url || state.side_view_url || state.back_view_url);
            const isActive = state.is_active;
            const hasOutfitInfo = !!(state.outfit || state.age_stage || state.hairstyle);
            
            return (
              <Card 
                key={state.id} 
                className={`bg-slate-800/40 border transition-all ${
                  isActive 
                    ? 'border-amber-500/50 ring-1 ring-amber-500/20' 
                    : 'border-slate-700/50'
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
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-slate-200 truncate">
                          {state.name}
                        </span>
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
                      <div className="flex items-center gap-2 text-xs text-slate-500">
                        {state.age_stage && <span>{state.age_stage}</span>}
                        {state.outfit && <span className="truncate max-w-[100px]">{state.outfit}</span>}
                        {!state.age_stage && !state.outfit && state.description && (
                          <span className="truncate">{state.description}</span>
                        )}
                      </div>
                    </div>
                    
                    {/* 操作按钮 */}
                    {!disabled && (
                      <div className="flex gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
                        {/* 激活按钮 */}
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
                        {/* 复制按钮 */}
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
                        {/* 编辑按钮 */}
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
                        {/* 删除按钮 */}
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
                      
                      {/* 三视图 */}
                      {hasViews && (
                        <div className="grid grid-cols-3 gap-2">
                          {state.front_view_url && (
                            <div className="space-y-1">
                              <p className="text-xs text-slate-500 text-center">正面</p>
                              <div className="aspect-square bg-slate-800/60 rounded-lg overflow-hidden border border-slate-700/50">
                                <img src={state.front_view_url} alt="正面" className="w-full h-full object-cover" />
                              </div>
                            </div>
                          )}
                          {state.side_view_url && (
                            <div className="space-y-1">
                              <p className="text-xs text-slate-500 text-center">侧面</p>
                              <div className="aspect-square bg-slate-800/60 rounded-lg overflow-hidden border border-slate-700/50">
                                <img src={state.side_view_url} alt="侧面" className="w-full h-full object-cover" />
                              </div>
                            </div>
                          )}
                          {state.back_view_url && (
                            <div className="space-y-1">
                              <p className="text-xs text-slate-500 text-center">背面</p>
                              <div className="aspect-square bg-slate-800/60 rounded-lg overflow-hidden border border-slate-700/50">
                                <img src={state.back_view_url} alt="背面" className="w-full h-full object-cover" />
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                      
                      {/* 参考图 */}
                      <div>
                        <h5 className="text-xs font-medium text-slate-400 mb-2">参考图</h5>
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
          {(onClose) => (
            <>
              <ModalHeader className="text-slate-100">
                {editingState ? '编辑' : '新建'}状态
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
                      classNames={{
                        input: "bg-transparent text-slate-100",
                        label: "text-slate-400 font-medium",
                        inputWrapper: "bg-slate-800/60 border border-slate-600/50"
                      }}
                    />
                    
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
                <Button
                  className="bg-gradient-to-r from-blue-500 to-violet-600 text-white font-semibold"
                  onPress={handleSave}
                >
                  保存
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
