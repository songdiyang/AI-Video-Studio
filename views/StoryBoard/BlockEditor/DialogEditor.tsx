/**
 * 对话框式编辑器
 * 左侧组件面板 + 右侧文本编辑区域
 */

import React, { useState, useCallback, useRef, useEffect } from 'react';
import { Button, Tabs, Tab } from '@heroui/react';
import { Save, Trash2, Wand2, Image as ImageIcon, Type, Camera, Users, MapPin, Zap } from 'lucide-react';
import { useToast } from '../../../contexts/ToastContext';
import { BLOCK_OPTIONS } from './utils/blockRegistry';

interface DialogEditorProps {
  storyboardId: number;
  initialPrompt?: string;
  onChange?: (prompt: string) => void;
  onSave?: (prompt: string) => Promise<boolean> | void;
  projectId?: number;
  availableFrames?: { startFrame?: string; endFrame?: string };
}

interface ReferenceImage {
  id: string;
  url: string;
  source: 'frame' | 'scene';
  label: string;
}

const COMPONENT_CATEGORIES = [
  { key: 'text', label: '文本', icon: Type },
  { key: 'shot', label: '镜头', icon: Camera },
  { key: 'character', label: '角色', icon: Users },
  { key: 'scene', label: '场景', icon: MapPin },
  { key: 'action', label: '动作', icon: Zap },
];

const DialogEditor: React.FC<DialogEditorProps> = ({
  storyboardId,
  initialPrompt = '',
  onChange,
  onSave,
  projectId,
  availableFrames,
}) => {
  const { showToast } = useToast();
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [promptText, setPromptText] = useState(initialPrompt);
  const [isDirty, setIsDirty] = useState(false);
  const [activeTab, setActiveTab] = useState('shot');
  const [referenceImages, setReferenceImages] = useState<ReferenceImage[]>([]);
  const [isDraggingOver, setIsDraggingOver] = useState(false);

  // 当文本变化时触发 onChange
  useEffect(() => {
    onChange?.(promptText);
  }, [promptText, onChange]);

  // 插入组件到光标位置
  const insertComponent = useCallback((text: string) => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const before = promptText.substring(0, start);
    const after = promptText.substring(end);
    
    const newText = before + text + after;
    setPromptText(newText);
    setIsDirty(true);

    // 恢复光标位置
    setTimeout(() => {
      textarea.focus();
      const newCursorPos = start + text.length;
      textarea.setSelectionRange(newCursorPos, newCursorPos);
    }, 0);
  }, [promptText]);

  // 处理拖拽进入
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
    setIsDraggingOver(true);
  }, []);

  // 处理拖拽离开
  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDraggingOver(false);
  }, []);

  // 处理放置
  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDraggingOver(false);

    try {
      const data = JSON.parse(e.dataTransfer.getData('application/json'));
      
      if (data.type === 'reference-image') {
        // 添加参考图
        const newImage: ReferenceImage = {
          id: `ref-${Date.now()}`,
          url: data.imageUrl,
          source: data.source as 'frame' | 'scene',
          label: data.frameType === 'start' ? '首帧' : data.frameType === 'end' ? '尾帧' : '参考',
        };
        setReferenceImages(prev => [...prev, newImage]);
        insertComponent(`[参考图:${newImage.id}]`);
      } else if (data.componentType) {
        // 插入组件
        insertComponent(data.template);
      }
    } catch (error) {
      console.error('[DialogEditor] Drop error:', error);
    }
  }, [insertComponent]);

  // 删除参考图
  const removeReferenceImage = useCallback((id: string) => {
    setReferenceImages(prev => prev.filter(img => img.id !== id));
    // 从文本中移除引用
    setPromptText(prev => prev.replace(`[参考图:${id}]`, ''));
    setIsDirty(true);
  }, []);

  // 清空
  const handleClear = useCallback(() => {
    setPromptText('');
    setReferenceImages([]);
    setIsDirty(true);
    showToast('已清空', 'info');
  }, [showToast]);

  // 保存
  const handleSave = useCallback(async () => {
    try {
      await onSave?.(promptText);
      setIsDirty(false);
      showToast('分镜描述已保存', 'success');
    } catch (error) {
      showToast('保存失败', 'error');
    }
  }, [promptText, onSave, showToast]);

  // 渲染组件按钮
  const renderComponentButtons = () => {
    switch (activeTab) {
      case 'shot':
        return (
          <div className="space-y-3">
            <div>
              <div className="text-xs text-[var(--text-muted)] mb-2">景别</div>
              <div className="flex flex-wrap gap-1.5">
                {BLOCK_OPTIONS.shotSize.map(opt => (
                  <button
                    key={opt.value}
                    onClick={() => insertComponent(`${opt.label}镜头，`)}
                    className="px-2 py-1 rounded bg-blue-500/10 text-blue-600 text-xs hover:bg-blue-500/20 transition-colors"
                    draggable
                    onDragStart={(e) => {
                      e.dataTransfer.setData('application/json', JSON.stringify({
                        componentType: 'shotSize',
                        template: `${opt.label}镜头，`
                      }));
                    }}
                  >
                    {opt.icon} {opt.label}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <div className="text-xs text-[var(--text-muted)] mb-2">视角</div>
              <div className="flex flex-wrap gap-1.5">
                {BLOCK_OPTIONS.cameraAngle.map(opt => (
                  <button
                    key={opt.value}
                    onClick={() => insertComponent(`${opt.label}视角，`)}
                    className="px-2 py-1 rounded bg-blue-500/10 text-blue-600 text-xs hover:bg-blue-500/20 transition-colors"
                    draggable
                    onDragStart={(e) => {
                      e.dataTransfer.setData('application/json', JSON.stringify({
                        componentType: 'cameraAngle',
                        template: `${opt.label}视角，`
                      }));
                    }}
                  >
                    {opt.icon} {opt.label}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <div className="text-xs text-[var(--text-muted)] mb-2">运镜</div>
              <div className="flex flex-wrap gap-1.5">
                {BLOCK_OPTIONS.movement.map(opt => (
                  <button
                    key={opt.value}
                    onClick={() => insertComponent(opt.value === 'static' ? '镜头固定，' : `镜头${opt.label}，`)}
                    className="px-2 py-1 rounded bg-blue-500/10 text-blue-600 text-xs hover:bg-blue-500/20 transition-colors"
                    draggable
                    onDragStart={(e) => {
                      e.dataTransfer.setData('application/json', JSON.stringify({
                        componentType: 'movement',
                        template: opt.value === 'static' ? '镜头固定，' : `镜头${opt.label}，`
                      }));
                    }}
                  >
                    {opt.icon} {opt.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        );
      case 'character':
        return (
          <div className="space-y-3">
            <div>
              <div className="text-xs text-[var(--text-muted)] mb-2">位置</div>
              <div className="flex flex-wrap gap-1.5">
                {BLOCK_OPTIONS.characterPosition.map(opt => (
                  <button
                    key={opt.value}
                    onClick={() => insertComponent(`位于画面${opt.label}，`)}
                    className="px-2 py-1 rounded bg-rose-500/10 text-rose-600 text-xs hover:bg-rose-500/20 transition-colors"
                    draggable
                    onDragStart={(e) => {
                      e.dataTransfer.setData('application/json', JSON.stringify({
                        componentType: 'position',
                        template: `位于画面${opt.label}，`
                      }));
                    }}
                  >
                    {opt.icon} {opt.label}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <div className="text-xs text-[var(--text-muted)] mb-2">景深层次</div>
              <div className="flex flex-wrap gap-1.5">
                {BLOCK_OPTIONS.verticalPosition.map(opt => (
                  <button
                    key={opt.value}
                    onClick={() => insertComponent(`位于${opt.label}，`)}
                    className="px-2 py-1 rounded bg-rose-500/10 text-rose-600 text-xs hover:bg-rose-500/20 transition-colors"
                    draggable
                    onDragStart={(e) => {
                      e.dataTransfer.setData('application/json', JSON.stringify({
                        componentType: 'depth',
                        template: `位于${opt.label}，`
                      }));
                    }}
                  >
                    {opt.icon} {opt.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        );
      case 'scene':
        return (
          <div className="space-y-3">
            <div>
              <div className="text-xs text-[var(--text-muted)] mb-2">光线</div>
              <div className="flex flex-wrap gap-1.5">
                {BLOCK_OPTIONS.lighting.map(opt => (
                  <button
                    key={opt.value}
                    onClick={() => insertComponent(`${opt.label}，`)}
                    className="px-2 py-1 rounded bg-emerald-500/10 text-emerald-600 text-xs hover:bg-emerald-500/20 transition-colors"
                    draggable
                    onDragStart={(e) => {
                      e.dataTransfer.setData('application/json', JSON.stringify({
                        componentType: 'lighting',
                        template: `${opt.label}，`
                      }));
                    }}
                  >
                    {opt.icon} {opt.label}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <div className="text-xs text-[var(--text-muted)] mb-2">氛围</div>
              <div className="flex flex-wrap gap-1.5">
                {BLOCK_OPTIONS.atmosphere.map(opt => (
                  <button
                    key={opt.value}
                    onClick={() => insertComponent(`${opt.label}氛围，`)}
                    className="px-2 py-1 rounded bg-emerald-500/10 text-emerald-600 text-xs hover:bg-emerald-500/20 transition-colors"
                    draggable
                    onDragStart={(e) => {
                      e.dataTransfer.setData('application/json', JSON.stringify({
                        componentType: 'atmosphere',
                        template: `${opt.label}氛围，`
                      }));
                    }}
                  >
                    {opt.icon} {opt.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        );
      case 'action':
        return (
          <div className="space-y-3">
            <div>
              <div className="text-xs text-[var(--text-muted)] mb-2">动作</div>
              <div className="flex flex-wrap gap-1.5">
                {BLOCK_OPTIONS.actionType.map(opt => (
                  <button
                    key={opt.value}
                    onClick={() => insertComponent(`${opt.label}，`)}
                    className="px-2 py-1 rounded bg-amber-500/10 text-amber-600 text-xs hover:bg-amber-500/20 transition-colors"
                    draggable
                    onDragStart={(e) => {
                      e.dataTransfer.setData('application/json', JSON.stringify({
                        componentType: 'action',
                        template: `${opt.label}，`
                      }));
                    }}
                  >
                    {opt.icon} {opt.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        );
      case 'text':
        return (
          <div className="space-y-3">
            <div className="text-xs text-[var(--text-muted)] mb-2">常用句式</div>
            {['角色', '场景', '动作', '表情', '服装', '道具'].map(text => (
              <button
                key={text}
                onClick={() => insertComponent(`${text}：`)}
                className="w-full px-3 py-2 rounded bg-slate-500/10 text-slate-600 text-xs hover:bg-slate-500/20 transition-colors text-left mb-1.5"
              >
                {text}：
              </button>
            ))}
          </div>
        );
      default:
        return null;
    }
  };

  return (
    <div className="flex flex-col h-full bg-[var(--bg-body)] rounded-lg border border-[var(--border-color)] overflow-hidden">
      {/* 头部工具栏 */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border-color)] bg-[var(--bg-card)]">
        <div className="flex items-center gap-2">
          <Wand2 className="w-5 h-5 text-[var(--accent)]" />
          <h2 className="text-sm font-semibold text-[var(--text-primary)]">
            导演空间
          </h2>
          {isDirty && (
            <span className="text-xs text-[var(--text-muted)]">(未保存)</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="flat"
            className="bg-[var(--bg-input)] text-[var(--text-secondary)]"
            startContent={<Trash2 className="w-3.5 h-3.5" />}
            onPress={handleClear}
            isDisabled={!promptText && referenceImages.length === 0}
          >
            清空
          </Button>
          <Button
            size="sm"
            className="pro-btn-primary"
            startContent={<Save className="w-3.5 h-3.5" />}
            onPress={handleSave}
            isDisabled={!isDirty}
          >
            保存
          </Button>
        </div>
      </div>

      {/* 主编辑区 */}
      <div className="flex flex-1 overflow-hidden">
        {/* 左侧组件面板 */}
        <div className="w-56 bg-[var(--bg-card)] border-r border-[var(--border-color)] flex flex-col">
          {/* 分类标签 */}
          <div className="flex flex-wrap gap-1 p-2 border-b border-[var(--border-color)]">
            {COMPONENT_CATEGORIES.map(cat => (
              <button
                key={cat.key}
                onClick={() => setActiveTab(cat.key)}
                className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${
                  activeTab === cat.key
                    ? 'bg-[var(--accent)] text-white'
                    : 'bg-[var(--bg-input)] text-[var(--text-secondary)] hover:bg-[var(--bg-card-hover)]'
                }`}
              >
                <cat.icon className="w-3 h-3 inline mr-1" />
                {cat.label}
              </button>
            ))}
          </div>

          {/* 组件列表 */}
          <div className="flex-1 overflow-y-auto p-3">
            {renderComponentButtons()}
          </div>

          {/* 参考图区域 */}
          {(availableFrames?.startFrame || availableFrames?.endFrame) && (
            <div className="p-3 border-t border-[var(--border-color)]">
              <div className="text-xs text-[var(--text-muted)] mb-2">拖拽参考图</div>
              <div className="flex gap-2">
                {availableFrames.startFrame && (
                  <div
                    className="relative w-14 h-10 rounded overflow-hidden cursor-grab"
                    draggable
                    onDragStart={(e) => {
                      e.dataTransfer.setData('application/json', JSON.stringify({
                        type: 'reference-image',
                        imageUrl: availableFrames.startFrame,
                        source: 'frame',
                        frameType: 'start'
                      }));
                    }}
                  >
                    <img src={availableFrames.startFrame} alt="首帧" className="w-full h-full object-cover" />
                    <span className="absolute bottom-0 left-0 right-0 text-[8px] text-center text-white bg-black/50">首帧</span>
                  </div>
                )}
                {availableFrames.endFrame && (
                  <div
                    className="relative w-14 h-10 rounded overflow-hidden cursor-grab"
                    draggable
                    onDragStart={(e) => {
                      e.dataTransfer.setData('application/json', JSON.stringify({
                        type: 'reference-image',
                        imageUrl: availableFrames.endFrame,
                        source: 'frame',
                        frameType: 'end'
                      }));
                    }}
                  >
                    <img src={availableFrames.endFrame} alt="尾帧" className="w-full h-full object-cover" />
                    <span className="absolute bottom-0 left-0 right-0 text-[8px] text-center text-white bg-black/50">尾帧</span>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* 右侧文本编辑区域 */}
        <div className="flex-1 flex flex-col p-4">
          {/* 参考图标签展示 */}
          {referenceImages.length > 0 && (
            <div className="flex flex-wrap gap-2 mb-3">
              {referenceImages.map(img => (
                <div key={img.id} className="flex items-center gap-1 px-2 py-1 rounded bg-purple-500/10 border border-purple-500/30">
                  <ImageIcon className="w-3 h-3 text-purple-500" />
                  <span className="text-xs text-purple-600">{img.label}</span>
                  <button
                    onClick={() => removeReferenceImage(img.id)}
                    className="ml-1 text-purple-400 hover:text-purple-600"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* 文本输入区 */}
          <div
            className={`flex-1 relative ${isDraggingOver ? 'ring-2 ring-[var(--accent)]' : ''}`}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
          >
            <textarea
              ref={textareaRef}
              value={promptText}
              onChange={(e) => {
                setPromptText(e.target.value);
                setIsDirty(true);
              }}
              placeholder="点击左侧组件插入，或拖拽组件/参考图到此处..."
              className="w-full h-full p-4 rounded-lg bg-[var(--bg-input)] border border-[var(--border-color)] text-sm text-[var(--text-primary)] resize-none focus:outline-none focus:border-[var(--accent)]"
            />
            {isDraggingOver && (
              <div className="absolute inset-0 flex items-center justify-center bg-[var(--accent)]/10 rounded-lg pointer-events-none">
                <span className="text-sm text-[var(--accent)]">释放以插入</span>
              </div>
            )}
          </div>

          {/* 提示 */}
          <div className="mt-2 text-xs text-[var(--text-muted)]">
            提示：点击左侧组件直接插入，或拖拽组件到文本区域
          </div>
        </div>
      </div>
    </div>
  );
};

export default DialogEditor;
