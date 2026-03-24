import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Modal, ModalContent, ModalHeader, ModalBody, ModalFooter, Button, Chip, Select, SelectItem } from '@heroui/react';
import { User, Wand2, Layers, Volume2, Trash2, Upload, ImagePlus, ZoomIn, X } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { Character, CharacterState } from './types';
import { fetchCharacterStates } from '../../../services/assets';
import { getAuthToken } from '../../../services/auth';
import { usePreview } from '../../../components/PreviewProvider';
import CharacterVoiceModal, { VoiceConfig } from './CharacterVoiceModal';

interface CharacterDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  character: Character | null;
  scenes?: any[];
  onGenerateImage?: () => void;
  onDelete?: (characterId: number) => void;
  onUploadImage?: (characterId: number, file: File) => Promise<void>;
  onGenerateViews?: (characterId: number) => void;
}

const CharacterDetailModal: React.FC<CharacterDetailModalProps> = ({
  isOpen,
  onClose,
  character,
  scenes,
  onGenerateImage,
  onDelete,
  onUploadImage,
  onGenerateViews
}) => {
  const [states, setStates] = useState<CharacterState[]>([]);
  const [selectedStateId, setSelectedStateId] = useState<number | null>(null);
  const [voiceConfig, setVoiceConfig] = useState<VoiceConfig | null>(null);
  const [showVoiceModal, setShowVoiceModal] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { openPreview } = usePreview();

  // 加载角色状态
  useEffect(() => {
    if (character?.id && isOpen) {
      fetchCharacterStates(character.id)
        .then(setStates)
        .catch(err => console.error('加载角色状态失败:', err));
      fetchVoiceConfig(character.id);
    } else {
      setStates([]);
      setSelectedStateId(null);
      setVoiceConfig(null);
      setShowDeleteConfirm(false);
    }
  }, [character?.id, isOpen]);

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

  // 获取当前显示的状态
  const currentState = selectedStateId 
    ? states.find(s => s.id === selectedStateId) 
    : null;

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

  // 三视图预览
  const openViewPreview = (startIndex: number) => {
    const slides: { src: string; alt?: string }[] = [];
    const views = [
      { url: character?.frontViewUrl, label: '正面视图' },
      { url: character?.sideViewUrl, label: '侧面视图' },
      { url: character?.backViewUrl, label: '背面视图' },
    ];
    views.forEach(v => { if (v.url) slides.push({ src: v.url, alt: v.label }); });
    if (slides.length > 0) openPreview(slides, Math.min(startIndex, slides.length - 1));
  };

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

                {/* 图片上传区域 */}
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
                  <h4 className="text-sm font-bold mb-3 flex items-center gap-2" style={{ color: 'var(--text-secondary)' }}>
                    <span className="w-1 h-4 rounded" style={{ backgroundColor: 'rgb(59,130,246)' }} />
                    角色参考图
                  </h4>
                  {(currentState?.image_url || character.imageUrl) ? (
                    <div className="flex gap-4 items-start">
                      <div className="w-40 h-40 rounded-lg overflow-hidden border flex-shrink-0" style={{ borderColor: 'var(--border)' }}>
                        <img
                          src={currentState?.image_url || character.imageUrl}
                          alt={character.name}
                          className="w-full h-full object-cover"
                        />
                      </div>
                      <div className="flex-1 flex flex-col gap-2">
                        <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                          已上传参考图，可重新上传替换
                        </p>
                        <Button
                          size="sm"
                          variant="flat"
                          startContent={<Upload className="w-3 h-3" />}
                          isLoading={isUploading}
                          onPress={() => fileInputRef.current?.click()}
                          style={{ backgroundColor: 'rgba(59,130,246,0.1)', color: 'rgb(59,130,246)' }}
                        >
                          重新上传
                        </Button>
                        {onGenerateViews && (
                          <Button
                            size="sm"
                            startContent={<Wand2 className="w-3 h-3" />}
                            onPress={() => onGenerateViews(character.id)}
                            className="font-semibold text-white"
                            style={{ background: 'linear-gradient(135deg, #8b5cf6, #6366f1)' }}
                          >
                            生成三视图
                          </Button>
                        )}
                      </div>
                    </div>
                  ) : (
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

                {/* 三视图 */}
                {(character.frontViewUrl || character.sideViewUrl || character.backViewUrl || character.characterSheetUrl) && (
                  <div className="rounded-lg p-4 border" style={{ backgroundColor: 'rgba(99,102,241,0.05)', borderColor: 'rgba(99,102,241,0.2)' }}>
                    <h4 className="text-sm font-bold mb-3 flex items-center gap-2" style={{ color: 'var(--text-secondary)' }}>
                      <span className="w-1 h-4 bg-indigo-500 rounded" />
                      角色三视图
                    </h4>
                    <div className="grid grid-cols-2 gap-3">
                      {[{ url: character.frontViewUrl, label: '正面', idx: 0 },
                        { url: character.sideViewUrl, label: '侧面', idx: 1 },
                        { url: character.backViewUrl, label: '背面', idx: 2 }].filter(v => v.url).map(view => (
                        <div key={view.label} className="space-y-1">
                          <p className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>{view.label}</p>
                          <div
                            className="aspect-square rounded-lg overflow-hidden border group cursor-pointer relative"
                            style={{ backgroundColor: 'var(--bg-secondary)', borderColor: 'var(--border)' }}
                            onClick={() => openViewPreview(view.idx)}
                          >
                            <img src={view.url!} alt={view.label} className="w-full h-full object-cover" />
                            <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors flex items-center justify-center">
                              <ZoomIn className="w-5 h-5 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
                            </div>
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

                {/* 状态选择器 */}
                {states.length > 0 && (
                  <div className="rounded-lg p-4 border" style={{ backgroundColor: 'rgba(168,85,247,0.05)', borderColor: 'rgba(168,85,247,0.2)' }}>
                    <div className="flex items-center gap-2 mb-2">
                      <Layers className="w-4 h-4" style={{ color: 'rgb(168,85,247)' }} />
                      <h4 className="text-sm font-bold" style={{ color: 'var(--text-secondary)' }}>角色状态</h4>
                      <Chip size="sm" variant="flat" style={{ backgroundColor: 'rgba(168,85,247,0.1)', color: 'rgb(168,85,247)' }}>
                        {states.length} 个状态
                      </Chip>
                    </div>
                    <Select
                      size="sm"
                      placeholder="选择状态查看"
                      selectedKeys={selectedStateId ? [selectedStateId.toString()] : []}
                      onSelectionChange={(keys) => {
                        const key = Array.from(keys)[0] as string;
                        setSelectedStateId(key ? parseInt(key) : null);
                      }}
                    >
                      {[
                        <SelectItem key="default" textValue="默认状态">默认状态</SelectItem>,
                        ...states.map((state) => (
                          <SelectItem key={state.id.toString()} textValue={state.name}>{state.name}</SelectItem>
                        ))
                      ]}
                    </Select>
                  </div>
                )}

                {/* 外貌描述 */}
                {character.appearance && (
                  <div className="rounded-lg p-4 border" style={{ backgroundColor: 'rgba(59,130,246,0.05)', borderColor: 'rgba(59,130,246,0.2)' }}>
                    <h4 className="text-sm font-bold mb-2 flex items-center gap-2" style={{ color: 'var(--text-secondary)' }}>
                      <span className="w-1 h-4 rounded" style={{ backgroundColor: 'rgb(59,130,246)' }} />
                      外貌特征
                    </h4>
                    <p className="text-sm leading-relaxed whitespace-pre-wrap" style={{ color: 'var(--text-muted)' }}>
                      {character.appearance}
                    </p>
                  </div>
                )}
                
                {/* 性格描述 */}
                {character.personality && (
                  <div className="rounded-lg p-4 border" style={{ backgroundColor: 'rgba(168,85,247,0.05)', borderColor: 'rgba(168,85,247,0.2)' }}>
                    <h4 className="text-sm font-bold mb-2 flex items-center gap-2" style={{ color: 'var(--text-secondary)' }}>
                      <span className="w-1 h-4 rounded" style={{ backgroundColor: 'rgb(168,85,247)' }} />
                      性格特点
                    </h4>
                    <p className="text-sm leading-relaxed whitespace-pre-wrap" style={{ color: 'var(--text-muted)' }}>
                      {character.personality}
                    </p>
                  </div>
                )}
                
                {/* 角色简介 */}
                {character.description && (
                  <div className="rounded-lg p-4 border" style={{ backgroundColor: 'rgba(34,197,94,0.05)', borderColor: 'rgba(34,197,94,0.2)' }}>
                    <h4 className="text-sm font-bold mb-2 flex items-center gap-2" style={{ color: 'var(--text-secondary)' }}>
                      <span className="w-1 h-4 rounded" style={{ backgroundColor: 'rgb(34,197,94)' }} />
                      角色简介
                    </h4>
                    <p className="text-sm leading-relaxed whitespace-pre-wrap" style={{ color: 'var(--text-muted)' }}>
                      {character.description}
                    </p>
                  </div>
                )}
                
                {/* 如果没有任何详细信息 */}
                {!character.appearance && !character.personality && !character.description && !character.imageUrl && (
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
              {onGenerateViews && (
                <Button 
                  className="font-semibold text-white"
                  style={{ background: 'linear-gradient(135deg, #8b5cf6, #6366f1)' }}
                  startContent={<Wand2 className="w-4 h-4" />}
                  onPress={() => onGenerateViews(character.id)}
                >
                  生成三视图
                </Button>
              )}
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
