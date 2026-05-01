import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Modal, ModalContent, ModalHeader, ModalBody, ModalFooter, Button, Chip, Switch } from '@heroui/react';
import { User, Wand2, Layers, Volume2, Trash2, Upload, ImagePlus, ZoomIn, X, Star, Plus, Pencil, Copy, StarOff, Clock, Filter, ChevronDown, Loader2, ImageIcon, Eye, Power } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { Character, CharacterState } from './types';
import { fetchCharacterStates, activateCharacterState, fetchCharacterStateHistory, updateCharacter, deleteCharacterViewApi, fetchReferenceImages, AssetReferenceImage, updateCharacterUseReferenceImages } from '../../../services/assets';
import type { CharacterStateHistoryEntry } from '../../../services/assets';
import { getAuthToken } from '../../../services/auth';
import { usePreview } from '../../../components/PreviewProvider';
import CharacterVoiceModal, { VoiceConfig } from './CharacterVoiceModal';

// 历史操作类型配置：图标、颜色、中文描述
const ACTION_CONFIG: Record<string, { icon: React.ElementType; color: string; bgColor: string; label: string }> = {
  created: { icon: Plus, color: 'text-green-400', bgColor: 'bg-green-500', label: '创建了' },
  updated: { icon: Pencil, color: 'text-blue-400', bgColor: 'bg-blue-500', label: '更新了' },
  activated: { icon: Star, color: 'text-amber-400', bgColor: 'bg-amber-500', label: '激活了' },
  deactivated: { icon: StarOff, color: 'text-slate-400', bgColor: 'bg-slate-500', label: '取消激活了' },
  deleted: { icon: Trash2, color: 'text-red-400', bgColor: 'bg-red-500', label: '删除了' },
  duplicated: { icon: Copy, color: 'text-purple-400', bgColor: 'bg-purple-500', label: '复制了' },
};

// 筛选选项
const FILTER_OPTIONS = [
  { value: '', label: '全部' },
  { value: 'created', label: '创建' },
  { value: 'updated', label: '更新' },
  { value: 'activated', label: '激活' },
  { value: 'deactivated', label: '取消激活' },
  { value: 'deleted', label: '删除' },
  { value: 'duplicated', label: '复制' },
];

// 格式化时间
const formatTime = (dateStr: string) => {
  const d = new Date(dateStr);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

interface CharacterDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  character: Character | null;
  scenes?: any[];
  onGenerateImage?: () => void;
  onDelete?: (characterId: number) => void;
  onUploadImage?: (characterId: number, file: File) => Promise<void>;
  onGenerateViews?: (characterId: number) => void;
  onAddState?: (characterId: number) => void;
  onCharacterUpdate?: (character: Character) => void;
}

const CharacterDetailModal: React.FC<CharacterDetailModalProps> = ({
  isOpen,
  onClose,
  character,
  scenes,
  onGenerateImage,
  onDelete,
  onUploadImage,
  onGenerateViews,
  onAddState,
  onCharacterUpdate
}) => {
  const [states, setStates] = useState<CharacterState[]>([]);
  const [selectedState, setSelectedState] = useState<CharacterState | null>(null);
  const [voiceConfig, setVoiceConfig] = useState<VoiceConfig | null>(null);
  const [showVoiceModal, setShowVoiceModal] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  // 每次打开弹窗时从 API 获取最新的角色三视图 URL（解决父组件 prop 陈旧问题）
  const [freshViewUrls, setFreshViewUrls] = useState<{ front?: string; side?: string; back?: string }>({});
  // 状态管理增强
  const [showHistory, setShowHistory] = useState(false);
  const [historyData, setHistoryData] = useState<CharacterStateHistoryEntry[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyTotal, setHistoryTotal] = useState(0);
  const [historyFilter, setHistoryFilter] = useState<string>('');
  const [activating, setActivating] = useState(false);
  const [showFilterDropdown, setShowFilterDropdown] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const stateScrollRef = useRef<HTMLDivElement>(null);
  const [scrollState, setScrollState] = useState({ canScrollLeft: false, canScrollRight: false });
  const { openPreview } = usePreview();

  // 编辑状态
  const [editingField, setEditingField] = useState<'appearance' | 'personality' | 'description' | null>(null);
  const [editValue, setEditValue] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const editTextareaRef = useRef<HTMLTextAreaElement>(null);

  // 参考图状态
  const [referenceImages, setReferenceImages] = useState<AssetReferenceImage[]>([]);
  const [referenceImagesLoading, setReferenceImagesLoading] = useState(false);
  const [stateReferenceImages, setStateReferenceImages] = useState<Record<number, AssetReferenceImage[]>>({});

  // 开始编辑某个字段
  const startEditing = (field: 'appearance' | 'personality' | 'description', currentValue: string) => {
    setEditingField(field);
    setEditValue(currentValue || '');
    setTimeout(() => editTextareaRef.current?.focus(), 50);
  };

  // 保存编辑
  const saveEdit = async () => {
    if (!character || !editingField || isSaving) return;
    const originalValue = character[editingField] || '';
    if (editValue.trim() === originalValue.trim()) {
      setEditingField(null);
      return;
    }
    setIsSaving(true);
    try {
      const updated = await updateCharacter(character.id, { [editingField]: editValue.trim() });
      // 通知父组件刷新
      if (onCharacterUpdate) {
        onCharacterUpdate({
          ...character,
          [editingField]: editValue.trim(),
        });
      }
      setEditingField(null);
    } catch (err) {
      console.error('[CharacterDetailModal] 保存失败', err);
    } finally {
      setIsSaving(false);
    }
  };

  // 取消编辑
  const cancelEdit = () => {
    setEditingField(null);
    setEditValue('');
  };

  // 删除单张三视图
  const [deletingView, setDeletingView] = useState<string | null>(null);
  const handleDeleteSingleView = async (viewType: 'front' | 'side' | 'back') => {
    if (!character?.id || deletingView) return;
    const labelMap = { front: '正面', side: '侧面', back: '背面' };
    if (!window.confirm(`确定删除${labelMap[viewType]}视图吗？删除后可重新生成。`)) return;
    setDeletingView(viewType);
    try {
      const result = await deleteCharacterViewApi(character.id, viewType);
      // 更新本地状态
      setFreshViewUrls({
        front: result.front_view_url || undefined,
        side: result.side_view_url || undefined,
        back: result.back_view_url || undefined,
      });
      // 通知父组件刷新
      if (onCharacterUpdate) {
        onCharacterUpdate({
          ...character,
          frontViewUrl: result.front_view_url || undefined,
          sideViewUrl: result.side_view_url || undefined,
          backViewUrl: result.back_view_url || undefined,
          imageUrl: result.image_url || character.imageUrl,
        });
      }
    } catch (err) {
      console.error('[CharacterDetailModal] 删除视图失败', err);
    } finally {
      setDeletingView(null);
    }
  };

  // 加载角色状态 & 最新三视图 & 参考图
  useEffect(() => {
    if (character?.id && isOpen) {
      fetchCharacterStates(character.id)
        .then((loadedStates) => {
          setStates(loadedStates);
          // 默认选中激活状态
          const active = loadedStates.find(s => s.is_active);
          if (active) setSelectedState(active);
        })
        .catch(err => console.error('加载角色状态失败:', err));
      fetchVoiceConfig(character.id);
      
      // 加载角色级别的参考图（如果启用了参考图功能）
      if (character.useReferenceImages !== false) {
        loadReferenceImages();
      }
      
      // 从 API 获取最新角色数据（含三视图 URL），避免父组件 prop 陈旧
      const token = getAuthToken();
      fetch(`/api/characters/${character.id}`, {
        headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) }
      }).then(r => r.ok ? r.json() : null).then(data => {
        if (data) {
          const bust = (url: string | null) => url ? `${url}${url.includes('?') ? '&' : '?'}v=${Date.now()}` : undefined;
          setFreshViewUrls({
            front: bust(data.front_view_url),
            side: bust(data.side_view_url),
            back: bust(data.back_view_url),
          });
        }
      }).catch(() => {});
    } else {
      setStates([]);
      setSelectedState(null);
      setVoiceConfig(null);
      setShowDeleteConfirm(false);
      setShowHistory(false);
      setHistoryData([]);
      setHistoryFilter('');
      setFreshViewUrls({});
      setReferenceImages([]);
      setStateReferenceImages({});
    }
  }, [character?.id, isOpen]);

  // 加载角色级别参考图
  const loadReferenceImages = useCallback(async () => {
    if (!character?.id) return;
    setReferenceImagesLoading(true);
    try {
      // 只加载启用的参考图
      const images = await fetchReferenceImages('character', character.id, true);
      setReferenceImages(images);
    } catch (err) {
      console.error('加载参考图失败:', err);
    } finally {
      setReferenceImagesLoading(false);
    }
  }, [character?.id]);

  // 加载状态级别参考图
  const loadStateReferenceImages = useCallback(async (stateId: number) => {
    if (!stateId) return;
    try {
      const images = await fetchReferenceImages('character_state', stateId, true);
      setStateReferenceImages(prev => ({ ...prev, [stateId]: images }));
    } catch (err) {
      console.error('加载状态参考图失败:', err);
    }
  }, []);

  // 当选中状态变化时，加载该状态的参考图
  useEffect(() => {
    if (selectedState?.id && selectedState?.useReferenceImages !== false) {
      loadStateReferenceImages(selectedState.id);
    }
  }, [selectedState?.id, selectedState?.useReferenceImages]);

  // 监测滚动状态，更新渐变遮罩
  const updateScrollState = useCallback(() => {
    const el = stateScrollRef.current;
    if (!el) return;
    setScrollState({
      canScrollLeft: el.scrollLeft > 0,
      canScrollRight: el.scrollLeft + el.clientWidth < el.scrollWidth - 1,
    });
  }, []);

  useEffect(() => {
    const el = stateScrollRef.current;
    if (!el) return;
    updateScrollState();
    el.addEventListener('scroll', updateScrollState);
    return () => el.removeEventListener('scroll', updateScrollState);
  }, [states, updateScrollState]);

  // 获取声音配置
  const fetchVoiceConfig = async (characterId: number) => {
    try {
      const token = getAuthToken();
      const res = await fetch(`/api/characters/${characterId}/voice`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setVoiceConfig(data.voiceConfig);
      }
    } catch (err) {
      console.error('加载声音配置失败:', err);
    }
  };

  // 获取当前选中状态用于显示
  const currentState = selectedState;

  // 激活状态处理
  const handleActivateState = useCallback(async () => {
    if (!character?.id || !selectedState) return;
    setActivating(true);
    try {
      await activateCharacterState(character.id, selectedState.id);
      // 刷新状态列表
      const refreshed = await fetchCharacterStates(character.id);
      setStates(refreshed);
      const newActive = refreshed.find(s => s.id === selectedState.id);
      if (newActive) setSelectedState(newActive);
    } catch (err) {
      console.error('激活状态失败:', err);
    } finally {
      setActivating(false);
    }
  }, [character?.id, selectedState]);

  // 加载历史记录
  const loadHistory = useCallback(async (reset = false) => {
    if (!character?.id) return;
    setHistoryLoading(true);
    try {
      const offset = reset ? 0 : historyData.length;
      const res = await fetchCharacterStateHistory(character.id, {
        action: historyFilter || undefined,
        limit: 20,
        offset,
      });
      setHistoryData(prev => reset ? res.history : [...prev, ...res.history]);
      setHistoryTotal(res.total);
    } catch (err) {
      console.error('加载历史记录失败:', err);
    } finally {
      setHistoryLoading(false);
    }
  }, [character?.id, historyFilter, historyData.length]);

  // 切换历史面板时加载数据
  const toggleHistory = useCallback(() => {
    setShowHistory(prev => {
      const next = !prev;
      if (next && historyData.length === 0) {
        // 延迟加载
        setTimeout(() => loadHistory(true), 0);
      }
      return next;
    });
  }, [historyData.length, loadHistory]);

  // 筛选变化时重新加载
  useEffect(() => {
    if (showHistory) {
      loadHistory(true);
    }
  }, [historyFilter]); // eslint-disable-line react-hooks/exhaustive-deps

  // 获取历史记录中的状态名称
  const getStateName = useCallback((entry: CharacterStateHistoryEntry) => {
    if (entry.snapshot?.name) return entry.snapshot.name;
    const found = states.find(s => s.id === entry.state_id);
    return found?.name || `状态#${entry.state_id}`;
  }, [states]);

  // 文件上传处理
  const handleFileSelect = useCallback(async (file: File) => {
    if (!character?.id || !onUploadImage) return;
    const allowed = ['image/png', 'image/jpeg', 'image/webp'];
    if (!allowed.includes(file.type)) return;
    if (file.size > 10 * 1024 * 1024) return;
    setIsUploading(true);
    try {
      await onUploadImage(character.id, file);
    } finally {
      setIsUploading(false);
    }
  }, [character?.id, onUploadImage]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFileSelect(file);
  }, [handleFileSelect]);

  // 三视图预览 - 优先使用选中状态的视图
  const openViewPreview = (startIndex: number) => {
    const slides: { src: string; alt?: string }[] = [];
    // 使用选中状态的视图（如果有），否则使用 API 最新数据，最后回退到角色主视图
    const frontUrl = currentState?.front_view_url || freshViewUrls.front || character?.frontViewUrl;
    const sideUrl = currentState?.side_view_url || freshViewUrls.side || character?.sideViewUrl;
    const backUrl = currentState?.back_view_url || freshViewUrls.back || character?.backViewUrl;
    const views = [
      { url: frontUrl, label: '正面视图' },
      { url: sideUrl, label: '侧面视图' },
      { url: backUrl, label: '背面视图' },
    ];
    views.forEach(v => { if (v.url) slides.push({ src: v.url, alt: v.label }); });
    if (slides.length > 0) openPreview(slides, Math.min(startIndex, slides.length - 1));
  };

  // 计算当前显示用的三视图 URL（状态优先 → API 最新数据 → 父组件 prop）
  const displayFrontViewUrl = currentState?.front_view_url || freshViewUrls.front || character?.frontViewUrl;
  const displaySideViewUrl = currentState?.side_view_url || freshViewUrls.side || character?.sideViewUrl;
  const displayBackViewUrl = currentState?.back_view_url || freshViewUrls.back || character?.backViewUrl;
  // 如果选中状态没有三视图但有 image_url，可作为候选展示
  const stateImageFallback = currentState?.image_url && !currentState.front_view_url && !currentState.side_view_url && !currentState.back_view_url;

  if (!character) return null;

  const sceneCount = scenes?.filter(s => s.characters?.includes(character.name)).length || 0;

  return (
    <Modal isOpen={isOpen} onOpenChange={onClose} size="2xl" scrollBehavior="inside">
      <ModalContent className="bg-slate-900/95 backdrop-blur-xl border border-slate-700/50">
        {(onCloseModal) => (
          <>
            <ModalHeader className="flex items-center gap-3 border-b" style={{ borderColor: 'var(--border)' }}>
              <div className="w-12 h-12 rounded-full flex items-center justify-center flex-shrink-0 border overflow-hidden" style={{ backgroundColor: 'rgba(59,130,246,0.1)', borderColor: 'rgba(59,130,246,0.2)' }}>
                {character.imageUrl ? (
                  <img src={character.imageUrl} alt={character.name} className="w-full h-full rounded-full object-cover" />
                ) : (
                  <User className="w-6 h-6" style={{ color: 'var(--accent)' }} />
                )}
              </div>
              <div className="flex-1">
                <h3 className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>{character.name}</h3>
                <div className="flex items-center gap-2 mt-1">
                  <Chip size="sm" variant="flat" style={{ backgroundColor: 'rgba(59,130,246,0.1)', color: 'rgb(59,130,246)' }}>
                    出现 {sceneCount} 次
                  </Chip>
                  {character.source && (
                    <Chip size="sm" variant="flat" style={{ backgroundColor: 'var(--bg-secondary)', color: 'var(--text-muted)' }}>
                      {character.source === 'ai_extracted' ? 'AI提取' : '本地'}
                    </Chip>
                  )}
                  {/* 白膜/服装分层标识 */}
                  {(() => {
                    const hasBaseViews = character.has_base_model_views === true || character.has_base_model_views === 1
                      || !!states.find(s => s.is_base_model && s.front_view_url);
                    return hasBaseViews ? (
                      <Chip size="sm" variant="flat" className="bg-amber-500/10 text-amber-400">
                        ★ 白膜已生成
                      </Chip>
                    ) : null;
                  })()}
                  {character.active_state_name && (
                    <Chip size="sm" variant="flat" className="bg-pink-500/10 text-pink-400">
                      {character.active_state_name}
                    </Chip>
                  )}
                </div>
              </div>
              {/* 删除按钮 */}
              {onDelete && (
                <Button
                  size="sm"
                  variant="flat"
                  isIconOnly
                  style={{ color: 'var(--danger, #ef4444)' }}
                  onPress={() => setShowDeleteConfirm(true)}
                  title="删除角色"
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              )}
            </ModalHeader>

            <ModalBody className="py-6">
              <div className="space-y-6">
                {/* 删除确认 */}
                <AnimatePresence>
                  {showDeleteConfirm && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      className="rounded-lg p-4 border"
                      style={{ backgroundColor: 'rgba(239,68,68,0.08)', borderColor: 'rgba(239,68,68,0.3)' }}
                    >
                      <p className="text-sm font-medium mb-3" style={{ color: 'var(--danger, #ef4444)' }}>
                        确定要删除角色「{character.name}」吗？删除后不可恢复。
                      </p>
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          variant="flat"
                          onPress={() => setShowDeleteConfirm(false)}
                        >
                          取消
                        </Button>
                        <Button
                          size="sm"
                          color="danger"
                          startContent={<Trash2 className="w-3 h-3" />}
                          onPress={() => {
                            onDelete?.(character.id);
                            setShowDeleteConfirm(false);
                          }}
                        >
                          确认删除
                        </Button>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* 角色参考图区域 - 统一显示上传的参考图或生成的正视图 */}
                <div
                  className={`rounded-lg p-4 border transition-colors ${isDragging ? 'ring-2 ring-blue-400' : ''}`}
                  style={{
                    backgroundColor: isDragging ? 'rgba(59,130,246,0.1)' : 'var(--bg-secondary)',
                    borderColor: isDragging ? 'rgb(59,130,246)' : 'var(--border)',
                  }}
                  onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                  onDragLeave={() => setIsDragging(false)}
                  onDrop={handleDrop}
                >
                  <div className="flex items-center justify-between mb-3">
                    <h4 className="text-sm font-bold flex items-center gap-2" style={{ color: 'var(--text-secondary)' }}>
                      <span className="w-1 h-4 rounded" style={{ backgroundColor: 'rgb(59,130,246)' }} />
                      角色参考图
                      {referenceImages.length > 0 && (
                        <Chip size="sm" variant="flat" className="bg-blue-500/10 text-blue-400">
                          {referenceImages.length} 张
                        </Chip>
                      )}
                    </h4>
                    {/* 使用参考图开关 */}
                    <div className="flex items-center gap-2">
                      <span className="text-xs" style={{ color: 'var(--text-muted)' }}>使用参考图生成</span>
                      <Switch
                        size="sm"
                        isSelected={character.useReferenceImages !== false}
                        onValueChange={async (checked) => {
                          try {
                            await updateCharacterUseReferenceImages(character.id, checked);
                            // 更新本地状态
                            if (onCharacterUpdate) {
                              onCharacterUpdate({
                                ...character,
                                useReferenceImages: checked,
                              });
                            }
                          } catch (err: any) {
                            console.error('更新参考图设置失败:', err);
                          }
                        }}
                      />
                    </div>
                  </div>

                  {/* 参考图显示：优先显示上传的参考图，其次显示生成的正视图 */}
                  {referenceImages.length > 0 ? (
                    // 显示上传的参考图
                    <div className="space-y-3">
                      <div className="grid grid-cols-4 gap-2">
                        {referenceImages
                          .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0))
                          .map((image) => (
                          <div
                            key={image.id}
                            className="relative group aspect-square rounded-lg overflow-hidden border cursor-pointer"
                            style={{ backgroundColor: 'var(--bg-secondary)', borderColor: 'var(--border)' }}
                            onClick={() => openPreview([{ src: image.image_url, alt: image.description || '参考图' }], 0)}
                          >
                            <img
                              src={image.image_url}
                              alt={image.description || '参考图'}
                              className="w-full h-full object-cover"
                            />
                            {/* 悬停遮罩 */}
                            <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-colors flex items-center justify-center">
                              <Eye className="w-5 h-5 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
                            </div>
                            {/* 视角类型标签 */}
                            {image.view_type && image.view_type !== 'other' && (
                              <div className="absolute bottom-0 left-0 right-0 px-1.5 py-0.5 bg-black/60">
                                <p className="text-[10px] text-white text-center capitalize">{image.view_type}</p>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          variant="flat"
                          startContent={<Upload className="w-3 h-3" />}
                          isLoading={isUploading}
                          onPress={() => fileInputRef.current?.click()}
                          style={{ backgroundColor: 'rgba(59,130,246,0.1)', color: 'rgb(59,130,246)' }}
                        >
                          上传更多
                        </Button>
                        {onGenerateViews && (
                          <Button
                            size="sm"
                            startContent={<Wand2 className="w-3 h-3" />}
                            onPress={() => onGenerateViews(character.id)}
                            className="font-semibold text-white"
                            style={{ background: 'linear-gradient(135deg, #8b5cf6, #6366f1)' }}
                          >
                            重新生成三视图
                          </Button>
                        )}
                      </div>
                    </div>
                  ) : displayFrontViewUrl ? (
                    // 显示生成的正视图作为参考
                    <div className="flex gap-4 items-start">
                      <div className="w-40 h-40 rounded-lg overflow-hidden border flex-shrink-0" style={{ borderColor: 'var(--border)' }}>
                        <img
                          src={displayFrontViewUrl}
                          alt={character.name}
                          className="w-full h-full object-cover"
                        />
                      </div>
                      <div className="flex-1 flex flex-col gap-2">
                        <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                          已生成正视图，可上传参考图替换
                        </p>
                        <Button
                          size="sm"
                          variant="flat"
                          startContent={<Upload className="w-3 h-3" />}
                          isLoading={isUploading}
                          onPress={() => fileInputRef.current?.click()}
                          style={{ backgroundColor: 'rgba(59,130,246,0.1)', color: 'rgb(59,130,246)' }}
                        >
                          上传参考图
                        </Button>
                        {onGenerateViews && (
                          <Button
                            size="sm"
                            startContent={<Wand2 className="w-3 h-3" />}
                            onPress={() => onGenerateViews(character.id)}
                            className="font-semibold text-white"
                            style={{ background: 'linear-gradient(135deg, #8b5cf6, #6366f1)' }}
                          >
                            重新生成三视图
                          </Button>
                        )}
                      </div>
                    </div>
                  ) : (
                    // 空状态
                    <div
                      className="flex flex-col items-center justify-center py-8 rounded-lg border-2 border-dashed cursor-pointer hover:border-blue-400 transition-colors"
                      style={{ borderColor: 'var(--border)' }}
                      onClick={() => fileInputRef.current?.click()}
                    >
                      <ImagePlus className="w-10 h-10 mb-3" style={{ color: 'var(--text-muted)', opacity: 0.5 }} />
                      <p className="text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>
                        {isUploading ? '上传中...' : '点击或拖拽上传角色参考图'}
                      </p>
                      <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>支持 PNG / JPG / WebP，最大 10MB</p>
                    </div>
                  )}
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) handleFileSelect(file);
                      e.target.value = '';
                    }}
                  />
                </div>

                {/* 三视图 - 支持状态对比预览 */}
                {(displayFrontViewUrl || displaySideViewUrl || displayBackViewUrl || character.characterSheetUrl || stateImageFallback) && (
                  <div className="rounded-lg p-4 border" style={{ backgroundColor: 'rgba(99,102,241,0.05)', borderColor: 'rgba(99,102,241,0.2)' }}>
                    <h4 className="text-sm font-bold mb-3 flex items-center gap-2" style={{ color: 'var(--text-secondary)' }}>
                      <span className="w-1 h-4 bg-indigo-500 rounded" />
                      {currentState ? `${currentState.name} - 三视图` : '角色三视图'}
                    </h4>
                    {/* 状态仅有 image_url 时，显示状态形象图 */}
                    {stateImageFallback && (
                      <div className="mb-3">
                        <p className="text-xs font-medium mb-1" style={{ color: 'var(--text-muted)' }}>状态形象</p>
                        <div className="w-32 h-32 rounded-lg overflow-hidden border transition-opacity duration-300" style={{ backgroundColor: 'var(--bg-secondary)', borderColor: 'var(--border)' }}>
                          <img src={currentState!.image_url!} alt={currentState!.name} className="w-full h-full object-cover" />
                        </div>
                      </div>
                    )}
                    <div className="grid grid-cols-3 gap-3">
                      {[{ url: displayFrontViewUrl, label: '正面', type: 'front' as const, idx: 0 },
                        { url: displaySideViewUrl, label: '侧面', type: 'side' as const, idx: 1 },
                        { url: displayBackViewUrl, label: '背面', type: 'back' as const, idx: 2 }].filter(v => v.url).map(view => (
                        <div key={view.label} className="space-y-1">
                          <p className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>{view.label}</p>
                          <div
                            className="aspect-[3/4] rounded-lg overflow-hidden border group cursor-pointer relative transition-opacity duration-300"
                            style={{ backgroundColor: 'var(--bg-secondary)', borderColor: 'var(--border)' }}
                            onClick={() => openViewPreview(view.idx)}
                          >
                            <img src={view.url!} alt={view.label} className="w-full h-full object-cover transition-opacity duration-300" />
                            <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors flex items-center justify-center">
                              <ZoomIn className="w-5 h-5 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
                            </div>
                            {/* 删除单张视图按钮 */}
                            <button
                              className="absolute top-1 right-1 w-6 h-6 rounded-full bg-red-500/80 hover:bg-red-500 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity z-10"
                              title={`删除${view.label}视图`}
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDeleteSingleView(view.type);
                              }}
                            >
                              <X className="w-3.5 h-3.5 text-white" />
                            </button>
                          </div>
                        </div>
                      ))}
                      {character.characterSheetUrl && (
                        <div className="space-y-1">
                          <p className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>设计稿</p>
                          <div className="aspect-square rounded-lg overflow-hidden border" style={{ backgroundColor: 'var(--bg-secondary)', borderColor: 'var(--border)' }}>
                            <img src={character.characterSheetUrl} alt="角色设计稿" className="w-full h-full object-cover" />
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* 状态级别参考图 */}
                {selectedState && selectedState.useReferenceImages !== false && stateReferenceImages[selectedState.id]?.length > 0 && (
                  <div className="rounded-lg p-4 border" style={{ backgroundColor: 'rgba(245,158,11,0.05)', borderColor: 'rgba(245,158,11,0.2)' }}>
                    <h4 className="text-sm font-bold mb-3 flex items-center gap-2" style={{ color: 'var(--text-secondary)' }}>
                      <span className="w-1 h-4 bg-amber-500 rounded" />
                      {selectedState.name} - 参考图
                      <Chip size="sm" variant="flat" className="bg-amber-500/10 text-amber-400">
                        {stateReferenceImages[selectedState.id].length} 张
                      </Chip>
                    </h4>
                    <div className="grid grid-cols-4 gap-2">
                      {stateReferenceImages[selectedState.id]
                        .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0))
                        .map((image) => (
                        <div
                          key={image.id}
                          className="relative group aspect-square rounded-lg overflow-hidden border cursor-pointer"
                          style={{ backgroundColor: 'var(--bg-secondary)', borderColor: 'var(--border)' }}
                          onClick={() => openPreview([{ src: image.image_url, alt: image.description || '参考图' }], 0)}
                        >
                          <img
                            src={image.image_url}
                            alt={image.description || '参考图'}
                            className="w-full h-full object-cover"
                          />
                          {/* 悬停遮罩 */}
                          <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-colors flex items-center justify-center">
                            <Eye className="w-5 h-5 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
                          </div>
                          {/* 视角类型标签 */}
                          {image.view_type && image.view_type !== 'other' && (
                            <div className="absolute bottom-0 left-0 right-0 px-1.5 py-0.5 bg-black/60">
                              <p className="text-[10px] text-white text-center capitalize">{image.view_type}</p>
                            </div>
                          )}
                          {/* 描述提示 */}
                          {image.description && (
                            <div className="absolute top-0 left-0 right-0 px-1.5 py-0.5 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity">
                              <p className="text-[10px] text-white truncate">{image.description}</p>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* 声音配置 */}
                <div className="rounded-lg p-4 border" style={{ backgroundColor: 'rgba(168,85,247,0.05)', borderColor: 'rgba(168,85,247,0.2)' }}>
                  <div className="flex items-center justify-between mb-2">
                    <h4 className="text-sm font-bold flex items-center gap-2" style={{ color: 'var(--text-secondary)' }}>
                      <span className="w-1 h-4 rounded" style={{ backgroundColor: 'rgb(168,85,247)' }} />
                      角色声音
                    </h4>
                    <Button
                      size="sm"
                      variant="flat"
                      style={{ backgroundColor: 'rgba(168,85,247,0.15)', color: 'rgb(168,85,247)' }}
                      startContent={<Volume2 className="w-3 h-3" />}
                      onPress={() => setShowVoiceModal(true)}
                    >
                      {voiceConfig ? '修改' : '设置'}
                    </Button>
                  </div>
                  {voiceConfig ? (
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full flex items-center justify-center" style={{ backgroundColor: 'rgba(168,85,247,0.15)' }}>
                        <Volume2 className="w-4 h-4" style={{ color: 'rgb(168,85,247)' }} />
                      </div>
                      <div>
                        <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{voiceConfig.voiceName}</p>
                        <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{voiceConfig.description}</p>
                      </div>
                    </div>
                  ) : (
                    <p className="text-xs" style={{ color: 'var(--text-muted)' }}>未设置声音，点击上方按钮配置角色专属声音</p>
                  )}
                </div>

                {/* 状态管理 - 卡片式选择器 */}
                {states.length > 0 && (
                  <div className="rounded-lg p-4 border" style={{ backgroundColor: 'rgba(245,158,11,0.05)', borderColor: 'rgba(245,158,11,0.2)' }}>
                    {/* 标题行 */}
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <Layers className="w-4 h-4 text-amber-400" />
                        <h4 className="text-sm font-bold" style={{ color: 'var(--text-secondary)' }}>状态管理</h4>
                        <Chip size="sm" variant="flat" className="bg-amber-500/10 text-amber-400">
                          {states.length} 个状态
                        </Chip>
                      </div>
                      {onAddState && (
                        <button
                          onClick={() => onAddState(character.id)}
                          className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-amber-500/15 text-amber-400 hover:bg-amber-500/25 transition-colors text-xs font-medium"
                        >
                          <Plus className="w-3.5 h-3.5" />
                          新建
                        </button>
                      )}
                    </div>

                    {/* 水平滑动卡片容器 */}
                    <div className="relative">
                      {/* 左侧渐变遮罩 */}
                      {scrollState.canScrollLeft && (
                        <div className="absolute left-0 top-0 bottom-0 w-8 z-10 pointer-events-none" style={{ background: 'linear-gradient(to right, rgba(15,23,42,0.8), transparent)' }} />
                      )}
                      {/* 右侧渐变遮罩 */}
                      {scrollState.canScrollRight && (
                        <div className="absolute right-0 top-0 bottom-0 w-8 z-10 pointer-events-none" style={{ background: 'linear-gradient(to left, rgba(15,23,42,0.8), transparent)' }} />
                      )}

                      <div
                        ref={stateScrollRef}
                        className="flex gap-2.5 overflow-x-auto pb-2 scrollbar-hide"
                        style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
                      >
                        {states.map((state) => {
                          const isSelected = selectedState?.id === state.id;
                          const isActive = state.is_active;
                          const thumbUrl = state.image_url || state.front_view_url;
                          return (
                            <div
                              key={state.id}
                              onClick={() => setSelectedState(state)}
                              className={`shrink-0 w-24 p-2 rounded-lg border cursor-pointer transition-all relative ${
                                isSelected
                                  ? 'ring-2 ring-amber-500 border-amber-500/50 bg-slate-800/80'
                                  : 'bg-slate-800/50 border-slate-700 hover:border-slate-500'
                              }`}
                            >
                              {/* 激活标记 */}
                              {isActive && (
                                <div className="absolute top-1 right-1 text-amber-400">
                                  <Star className="w-3.5 h-3.5 fill-current" />
                                </div>
                              )}
                              {/* 缩略图 */}
                              <div className="w-16 h-16 mx-auto rounded-md overflow-hidden mb-1.5 border border-slate-700/50">
                                {thumbUrl ? (
                                  <img src={thumbUrl} alt={state.name} className="w-full h-full object-cover" />
                                ) : (
                                  <div className="w-full h-full bg-slate-700/50 flex items-center justify-center">
                                    <User className="w-6 h-6 text-slate-500" />
                                  </div>
                                )}
                              </div>
                              {/* 状态名称 */}
                              <p className="text-xs text-center truncate font-medium" style={{ color: isSelected ? 'var(--text-primary)' : 'var(--text-secondary)' }}>
                                {state.name}
                              </p>
                              {/* 年龄阶段标签 */}
                              {state.age_stage && (
                                <p className="text-center mt-0.5">
                                  <span className="inline-block text-[10px] px-1.5 py-0.5 rounded-full bg-slate-700/60 text-slate-400">
                                    {state.age_stage}
                                  </span>
                                </p>
                              )}
                              {/* 激活标识文字 */}
                              {isActive && (
                                <p className="text-[10px] text-center text-amber-400 font-medium mt-0.5">★ 激活</p>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    {/* 操作按钮栏 */}
                    <div className="flex items-center gap-2 mt-3 pt-3 border-t border-slate-700/50">
                      {/* 激活按钮 - 仅在选中非激活状态时显示 */}
                      {selectedState && !selectedState.is_active && (
                        <button
                          onClick={handleActivateState}
                          disabled={activating}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-500/20 text-amber-400 hover:bg-amber-500/30 transition-colors text-sm disabled:opacity-50"
                        >
                          {activating ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <Star className="w-3.5 h-3.5" />
                          )}
                          激活此状态
                        </button>
                      )}
                      {/* 查看历史按钮 */}
                      <button
                        onClick={toggleHistory}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-colors text-sm ${
                          showHistory ? 'bg-slate-600/50 text-slate-200' : 'bg-slate-700/50 text-slate-300 hover:bg-slate-700'
                        }`}
                      >
                        <Clock className="w-3.5 h-3.5" />
                        {showHistory ? '收起历史' : '查看历史'}
                      </button>
                    </div>

                    {/* 历史记录面板 */}
                    <AnimatePresence>
                      {showHistory && (
                        <motion.div
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: 'auto' }}
                          exit={{ opacity: 0, height: 0 }}
                          className="overflow-hidden"
                        >
                          <div className="mt-4 pt-3 border-t border-slate-700/50">
                            {/* 历史头部：标题+筛选 */}
                            <div className="flex items-center justify-between mb-3">
                              <h5 className="text-xs font-bold text-slate-300">变更历史</h5>
                              {/* 筛选下拉 */}
                              <div className="relative">
                                <button
                                  onClick={() => setShowFilterDropdown(!showFilterDropdown)}
                                  className="flex items-center gap-1 px-2 py-1 rounded-md bg-slate-700/50 text-slate-400 hover:bg-slate-700 transition-colors text-xs"
                                >
                                  <Filter className="w-3 h-3" />
                                  {FILTER_OPTIONS.find(o => o.value === historyFilter)?.label || '全部'}
                                  <ChevronDown className="w-3 h-3" />
                                </button>
                                {showFilterDropdown && (
                                  <div className="absolute right-0 top-full mt-1 z-20 min-w-25 rounded-lg bg-slate-800 border border-slate-700 shadow-xl py-1">
                                    {FILTER_OPTIONS.map(opt => (
                                      <button
                                        key={opt.value}
                                        onClick={() => {
                                          setHistoryFilter(opt.value);
                                          setShowFilterDropdown(false);
                                        }}
                                        className={`w-full text-left px-3 py-1.5 text-xs hover:bg-slate-700/50 transition-colors ${
                                          historyFilter === opt.value ? 'text-amber-400' : 'text-slate-300'
                                        }`}
                                      >
                                        {opt.label}
                                      </button>
                                    ))}
                                  </div>
                                )}
                              </div>
                            </div>

                            {/* 时间线 */}
                            <div className="relative max-h-64 overflow-y-auto" style={{ scrollbarWidth: 'thin' }}>
                              {/* 竖线 */}
                              {historyData.length > 0 && (
                                <div className="absolute left-3 top-0 bottom-0 w-px bg-slate-600" />
                              )}

                              {historyData.length === 0 && !historyLoading && (
                                <p className="text-xs text-slate-500 text-center py-4">暂无历史记录</p>
                              )}

                              {historyData.map((entry) => {
                                const cfg = ACTION_CONFIG[entry.action] || ACTION_CONFIG.updated;
                                const IconComp = cfg.icon;
                                const stateName = getStateName(entry);
                                return (
                                  <div key={entry.id} className="relative pl-8 pb-4 last:pb-0">
                                    {/* 圆点 */}
                                    <div className={`absolute left-1.5 w-3 h-3 rounded-full border-2 border-slate-900 ${cfg.bgColor}`} style={{ top: '2px' }} />
                                    {/* 内容 */}
                                    <div>
                                      <div className="flex items-center gap-1.5 mb-0.5">
                                        <IconComp className={`w-3 h-3 ${cfg.color}`} />
                                        <span className="text-xs text-slate-300">
                                          {cfg.label}「<span className="font-medium text-slate-200">{stateName}</span>」状态
                                        </span>
                                      </div>
                                      <p className="text-[10px] text-slate-500">{formatTime(entry.created_at)}</p>
                                      {/* 变更详情（仅 updated 类型） */}
                                      {entry.action === 'updated' && entry.changes && (
                                        <div className="mt-1 text-[10px] text-slate-400 bg-slate-800/60 rounded px-2 py-1">
                                          修改: {Object.keys(entry.changes).join('、')}
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                );
                              })}

                              {/* 加载中 */}
                              {historyLoading && (
                                <div className="flex items-center justify-center py-3">
                                  <Loader2 className="w-4 h-4 animate-spin text-slate-400" />
                                </div>
                              )}
                            </div>

                            {/* 加载更多 */}
                            {!historyLoading && historyData.length < historyTotal && (
                              <button
                                onClick={() => loadHistory(false)}
                                className="w-full mt-2 py-1.5 text-xs text-slate-400 hover:text-slate-200 bg-slate-800/40 hover:bg-slate-800/60 rounded-md transition-colors"
                              >
                                加载更多 ({historyData.length}/{historyTotal})
                              </button>
                            )}
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                )}

                {/* 白膜+服装分层信息面板 */}
                <div className="rounded-lg p-4 border" style={{ backgroundColor: 'rgba(245,158,11,0.05)', borderColor: 'rgba(245,158,11,0.2)' }}>
                  <h4 className="text-sm font-bold mb-3 flex items-center gap-2" style={{ color: 'var(--text-secondary)' }}>
                    <span className="w-1 h-4 bg-amber-500 rounded" />
                    角色分层构成
                  </h4>
                  {/* 分层说明 */}
                  <div className="mb-3 p-2.5 rounded-lg" style={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border)' }}>
                    <p className="text-xs leading-relaxed" style={{ color: 'var(--text-muted)' }}>
                      角色在分镜中的表现 = <span className="text-cyan-400 font-medium">白膜体貌</span>（不可更换的身体特征） + <span className="text-pink-400 font-medium">服装装饰</span>（可更换的穿戴物品） + <span className="text-purple-400 font-medium">状态属性</span>（年龄/发型/配饰）。先生成白膜确保体貌一致性，再叠加服装状态。
                    </p>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    {/* 白膜体貌 */}
                    <div className="rounded-lg p-3 border" style={{ backgroundColor: 'rgba(6,182,212,0.05)', borderColor: 'rgba(6,182,212,0.2)' }}>
                      <div className="flex items-center gap-2 mb-2">
                        <Star className="w-4 h-4 text-amber-400" />
                        <span className="text-xs font-bold text-cyan-400">白膜体貌</span>
                        {(() => {
                          const baseState = states.find(s => s.is_base_model);
                          const hasBaseViews = !!(baseState?.front_view_url);
                          return hasBaseViews ? (
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-400 border border-amber-500/30">已生成</span>
                          ) : (
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-500/15 text-slate-400 border border-slate-500/30">未生成</span>
                          );
                        })()}
                      </div>
                      <p className="text-xs whitespace-pre-wrap line-clamp-4" style={{ color: 'var(--text-muted)' }}>
                        {character.base_appearance || character.appearance || '暂无白膜体貌描述'}
                      </p>
                    </div>
                    {/* 服装装饰 */}
                    <div className="rounded-lg p-3 border" style={{ backgroundColor: 'rgba(236,72,153,0.05)', borderColor: 'rgba(236,72,153,0.2)' }}>
                      <div className="flex items-center gap-2 mb-2">
                        <Layers className="w-4 h-4 text-pink-400" />
                        <span className="text-xs font-bold text-pink-400">服装装饰</span>
                        {(() => {
                          const activeState = states.find(s => s.is_active && !s.is_base_model);
                          return activeState?.name ? (
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-pink-500/15 text-pink-400 border border-pink-500/30">{activeState.name}</span>
                          ) : null;
                        })()}
                      </div>
                      <p className="text-xs whitespace-pre-wrap line-clamp-4" style={{ color: 'var(--text-muted)' }}>
                        {character.outfit_appearance || (() => {
                          const activeState = states.find(s => s.is_active && !s.is_base_model);
                          return activeState?.outfit || '暂无服装描述';
                        })()}
                      </p>
                    </div>
                  </div>
                  {/* 组合结果预览 */}
                  <div className="mt-3 p-2.5 rounded-lg flex items-center gap-2" style={{ backgroundColor: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.15)' }}>
                    <span className="text-[10px] text-amber-400 font-bold shrink-0">组合结果</span>
                    <span className="text-[10px] text-cyan-400/60 shrink-0">体貌</span>
                    <span className="text-[10px] text-slate-500">+</span>
                    <span className="text-[10px] text-pink-400/60 shrink-0">服装</span>
                    <span className="text-[10px] text-slate-500">=</span>
                    <span className="text-[10px] truncate" style={{ color: 'var(--text-muted)' }}>{character.appearance || '暂无'}</span>
                  </div>
                </div>

                {/* 外貌描述 */}
                <div className="rounded-lg p-4 border" style={{ backgroundColor: 'rgba(59,130,246,0.05)', borderColor: 'rgba(59,130,246,0.2)' }}>
                  <h4 className="text-sm font-bold mb-2 flex items-center justify-between" style={{ color: 'var(--text-secondary)' }}>
                    <span className="flex items-center gap-2">
                      <span className="w-1 h-4 rounded" style={{ backgroundColor: 'rgb(59,130,246)' }} />
                      外貌特征
                    </span>
                    {editingField !== 'appearance' && (
                      <button
                        onClick={() => startEditing('appearance', character.appearance || '')}
                        className="p-1 rounded hover:bg-blue-500/20 transition-colors"
                        title="编辑外貌特征"
                      >
                        <Pencil className="w-3.5 h-3.5" style={{ color: 'rgb(59,130,246)' }} />
                      </button>
                    )}
                  </h4>
                  {editingField === 'appearance' ? (
                    <div className="space-y-2">
                      <textarea
                        ref={editTextareaRef}
                        value={editValue}
                        onChange={(e) => setEditValue(e.target.value)}
                        className="w-full text-sm leading-relaxed rounded-md p-2 resize-none outline-none min-h-[80px]"
                        style={{ backgroundColor: 'var(--bg-input)', color: 'var(--text-primary)', border: '1px solid rgba(59,130,246,0.4)' }}
                        rows={4}
                      />
                      <div className="flex justify-end gap-2">
                        <Button size="sm" variant="light" onPress={cancelEdit} isDisabled={isSaving} style={{ color: 'var(--text-muted)' }}>取消</Button>
                        <Button size="sm" color="primary" onPress={saveEdit} isLoading={isSaving}>保存</Button>
                      </div>
                    </div>
                  ) : (
                    <p className="text-sm leading-relaxed whitespace-pre-wrap" style={{ color: 'var(--text-muted)' }}>
                      {character.appearance || '暂无外貌描述，点击编辑添加'}
                    </p>
                  )}
                </div>
                
                {/* 性格描述 */}
                <div className="rounded-lg p-4 border" style={{ backgroundColor: 'rgba(168,85,247,0.05)', borderColor: 'rgba(168,85,247,0.2)' }}>
                  <h4 className="text-sm font-bold mb-2 flex items-center justify-between" style={{ color: 'var(--text-secondary)' }}>
                    <span className="flex items-center gap-2">
                      <span className="w-1 h-4 rounded" style={{ backgroundColor: 'rgb(168,85,247)' }} />
                      性格特点
                    </span>
                    {editingField !== 'personality' && (
                      <button
                        onClick={() => startEditing('personality', character.personality || '')}
                        className="p-1 rounded hover:bg-purple-500/20 transition-colors"
                        title="编辑性格特点"
                      >
                        <Pencil className="w-3.5 h-3.5" style={{ color: 'rgb(168,85,247)' }} />
                      </button>
                    )}
                  </h4>
                  {editingField === 'personality' ? (
                    <div className="space-y-2">
                      <textarea
                        ref={editTextareaRef}
                        value={editValue}
                        onChange={(e) => setEditValue(e.target.value)}
                        className="w-full text-sm leading-relaxed rounded-md p-2 resize-none outline-none min-h-[80px]"
                        style={{ backgroundColor: 'var(--bg-input)', color: 'var(--text-primary)', border: '1px solid rgba(168,85,247,0.4)' }}
                        rows={4}
                      />
                      <div className="flex justify-end gap-2">
                        <Button size="sm" variant="light" onPress={cancelEdit} isDisabled={isSaving} style={{ color: 'var(--text-muted)' }}>取消</Button>
                        <Button size="sm" color="secondary" onPress={saveEdit} isLoading={isSaving}>保存</Button>
                      </div>
                    </div>
                  ) : (
                    <p className="text-sm leading-relaxed whitespace-pre-wrap" style={{ color: 'var(--text-muted)' }}>
                      {character.personality || '暂无性格描述，点击编辑添加'}
                    </p>
                  )}
                </div>
                
                {/* 角色简介 */}
                <div className="rounded-lg p-4 border" style={{ backgroundColor: 'rgba(34,197,94,0.05)', borderColor: 'rgba(34,197,94,0.2)' }}>
                  <h4 className="text-sm font-bold mb-2 flex items-center justify-between" style={{ color: 'var(--text-secondary)' }}>
                    <span className="flex items-center gap-2">
                      <span className="w-1 h-4 rounded" style={{ backgroundColor: 'rgb(34,197,94)' }} />
                      角色简介
                    </span>
                    {editingField !== 'description' && (
                      <button
                        onClick={() => startEditing('description', character.description || '')}
                        className="p-1 rounded hover:bg-green-500/20 transition-colors"
                        title="编辑角色简介"
                      >
                        <Pencil className="w-3.5 h-3.5" style={{ color: 'rgb(34,197,94)' }} />
                      </button>
                    )}
                  </h4>
                  {editingField === 'description' ? (
                    <div className="space-y-2">
                      <textarea
                        ref={editTextareaRef}
                        value={editValue}
                        onChange={(e) => setEditValue(e.target.value)}
                        className="w-full text-sm leading-relaxed rounded-md p-2 resize-none outline-none min-h-[80px]"
                        style={{ backgroundColor: 'var(--bg-input)', color: 'var(--text-primary)', border: '1px solid rgba(34,197,94,0.4)' }}
                        rows={4}
                      />
                      <div className="flex justify-end gap-2">
                        <Button size="sm" variant="light" onPress={cancelEdit} isDisabled={isSaving} style={{ color: 'var(--text-muted)' }}>取消</Button>
                        <Button size="sm" color="success" onPress={saveEdit} isLoading={isSaving} className="text-white">保存</Button>
                      </div>
                    </div>
                  ) : (
                    <p className="text-sm leading-relaxed whitespace-pre-wrap" style={{ color: 'var(--text-muted)' }}>
                      {character.description || '暂无角色简介，点击编辑添加'}
                    </p>
                  )}
                </div>
                
                {/* 如果没有任何详细信息且没有图片 */}
                {!character.appearance && !character.personality && !character.description && !character.imageUrl && !editingField && (
                  <div className="text-center py-8" style={{ color: 'var(--text-muted)' }}>
                    <User className="w-16 h-16 mx-auto mb-3" style={{ opacity: 0.3 }} />
                    <p className="text-sm">暂无详细信息</p>
                    <p className="text-xs mt-1">点击“提取角色”按钮获取AI生成的详细信息</p>
                  </div>
                )}
              </div>
            </ModalBody>

            <ModalFooter style={{ borderTop: '1px solid var(--border)' }}>
              <Button variant="light" onPress={onCloseModal} style={{ color: 'var(--text-muted)' }}>
                关闭
              </Button>
            </ModalFooter>

            {/* 声音设置弹窗 */}
            <CharacterVoiceModal
              isOpen={showVoiceModal}
              onClose={() => setShowVoiceModal(false)}
              characterId={character.id}
              characterName={character.name}
              characterImageUrl={character.imageUrl}
              initialVoiceConfig={voiceConfig}
              onSave={(newConfig) => setVoiceConfig(newConfig)}
            />
          </>
        )}
      </ModalContent>
    </Modal>
  );
};

export default CharacterDetailModal;
