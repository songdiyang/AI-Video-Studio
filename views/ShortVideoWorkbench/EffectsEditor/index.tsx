/**
 * 特效编辑器组件
 * 转场效果选择、滤镜应用、贴纸/文字叠加
 */

import React, { useState, useCallback } from 'react';
import { Button, Slider, Tabs, Tab, Input, Select, SelectItem } from '@heroui/react';
import { 
  Sparkles, Image, Type, Palette, Play, Plus, Trash2, 
  ChevronUp, ChevronDown, Eye, EyeOff, Copy, Layers
} from 'lucide-react';
import { VideoEffect, TransitionType, FilterType } from '../../../types/projectTypes';
import { useToast } from '../../../contexts/ToastContext';

// ==================== 类型定义 ====================

interface EffectsEditorProps {
  projectId: number;
  effects: VideoEffect[];
  onEffectsChange: (effects: VideoEffect[]) => void;
}

// ==================== 转场效果配置 ====================

const TRANSITIONS: { type: TransitionType; name: string; description: string }[] = [
  { type: 'fade', name: '淡入淡出', description: '渐隐渐显的经典转场' },
  { type: 'dissolve', name: '溶解', description: '画面逐渐溶解过渡' },
  { type: 'wipe', name: '擦除', description: '从一边擦除到另一边' },
  { type: 'slide', name: '滑动', description: '画面滑动切换' },
  { type: 'zoom', name: '缩放', description: '放大或缩小切换' },
  { type: 'spin', name: '旋转', description: '旋转过渡效果' },
  { type: 'flip', name: '翻转', description: '3D翻转效果' },
];

// ==================== 滤镜配置 ====================

const FILTERS: { type: FilterType; name: string; params: { key: string; label: string; min: number; max: number; default: number }[] }[] = [
  { 
    type: 'brightness', 
    name: '亮度',
    params: [{ key: 'value', label: '亮度值', min: -100, max: 100, default: 0 }]
  },
  { 
    type: 'contrast', 
    name: '对比度',
    params: [{ key: 'value', label: '对比度', min: -100, max: 100, default: 0 }]
  },
  { 
    type: 'saturation', 
    name: '饱和度',
    params: [{ key: 'value', label: '饱和度', min: -100, max: 100, default: 0 }]
  },
  { 
    type: 'hue', 
    name: '色相',
    params: [{ key: 'value', label: '色相偏移', min: -180, max: 180, default: 0 }]
  },
  { 
    type: 'blur', 
    name: '模糊',
    params: [{ key: 'radius', label: '模糊半径', min: 0, max: 50, default: 0 }]
  },
  { 
    type: 'sharpen', 
    name: '锐化',
    params: [{ key: 'amount', label: '锐化程度', min: 0, max: 100, default: 0 }]
  },
  { 
    type: 'vintage', 
    name: '复古',
    params: [{ key: 'intensity', label: '强度', min: 0, max: 100, default: 50 }]
  },
  { 
    type: 'noir', 
    name: '黑白',
    params: [{ key: 'intensity', label: '强度', min: 0, max: 100, default: 100 }]
  },
];

// ==================== 贴纸预设 ====================

const STICKER_PRESETS = [
  { id: 'arrow', name: '箭头', emoji: '➡️' },
  { id: 'star', name: '星星', emoji: '⭐' },
  { id: 'heart', name: '爱心', emoji: '❤️' },
  { id: 'fire', name: '火焰', emoji: '🔥' },
  { id: 'like', name: '点赞', emoji: '👍' },
  { id: 'wow', name: '惊叹', emoji: '😮' },
  { id: 'laugh', name: '大笑', emoji: '😂' },
  { id: 'cool', name: '墨镜', emoji: '😎' },
];

// ==================== 转场面板 ====================

interface TransitionPanelProps {
  effects: VideoEffect[];
  onAddTransition: (type: TransitionType) => void;
  onRemoveEffect: (id: number) => void;
  onUpdateEffect: (id: number, config: Record<string, any>) => void;
}

const TransitionPanel: React.FC<TransitionPanelProps> = ({
  effects,
  onAddTransition,
  onRemoveEffect,
  onUpdateEffect,
}) => {
  const transitionEffects = effects.filter(e => e.effect_type === 'transition');

  return (
    <div className="p-4 space-y-4">
      <div className="text-sm text-[var(--text-muted)]">
        选择转场效果应用到视频片段之间
      </div>
      
      {/* 转场效果列表 */}
      <div className="grid grid-cols-2 gap-3">
        {TRANSITIONS.map((transition) => (
          <button
            key={transition.type}
            onClick={() => onAddTransition(transition.type)}
            className="p-4 rounded-lg border border-[var(--border-color)] bg-[var(--bg-card)] hover:border-[var(--accent)]/50 transition-all text-left"
          >
            <div className="flex items-center gap-2 mb-2">
              <div className="w-8 h-8 rounded bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center">
                <Sparkles className="w-4 h-4 text-white" />
              </div>
              <span className="font-medium text-[var(--text-primary)]">{transition.name}</span>
            </div>
            <p className="text-xs text-[var(--text-muted)]">{transition.description}</p>
          </button>
        ))}
      </div>

      {/* 已添加的转场 */}
      {transitionEffects.length > 0 && (
        <div className="mt-6">
          <h4 className="text-sm font-medium text-[var(--text-primary)] mb-3">已添加的转场</h4>
          <div className="space-y-2">
            {transitionEffects.map((effect) => (
              <div
                key={effect.id}
                className="flex items-center justify-between p-3 rounded-lg bg-[var(--bg-input)]"
              >
                <div className="flex items-center gap-3">
                  <Sparkles className="w-4 h-4 text-[var(--accent)]" />
                  <span className="text-sm text-[var(--text-primary)]">{effect.effect_name}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Slider
                    size="sm"
                    step={0.1}
                    minValue={0.1}
                    maxValue={2}
                    defaultValue={0.5}
                    className="w-24"
                    aria-label="时长"
                  />
                  <span className="text-xs text-[var(--text-muted)]">0.5s</span>
                  <Button
                    size="sm"
                    isIconOnly
                    variant="light"
                    color="danger"
                    onPress={() => onRemoveEffect(effect.id)}
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

// ==================== 滤镜面板 ====================

interface FilterPanelProps {
  effects: VideoEffect[];
  onAddFilter: (type: FilterType) => void;
  onRemoveEffect: (id: number) => void;
  onUpdateEffect: (id: number, config: Record<string, any>) => void;
}

const FilterPanel: React.FC<FilterPanelProps> = ({
  effects,
  onAddFilter,
  onRemoveEffect,
  onUpdateEffect,
}) => {
  const filterEffects = effects.filter(e => e.effect_type === 'filter');
  const [previewFilter, setPreviewFilter] = useState<FilterType | null>(null);

  return (
    <div className="p-4 space-y-4">
      <div className="text-sm text-[var(--text-muted)]">
        调整视频的颜色和效果
      </div>

      {/* 滤镜预设 */}
      <div className="grid grid-cols-4 gap-2">
        {FILTERS.map((filter) => (
          <button
            key={filter.type}
            onClick={() => onAddFilter(filter.type)}
            onMouseEnter={() => setPreviewFilter(filter.type)}
            onMouseLeave={() => setPreviewFilter(null)}
            className={`p-3 rounded-lg border transition-all ${
              previewFilter === filter.type
                ? 'border-[var(--accent)] bg-[var(--accent)]/10'
                : 'border-[var(--border-color)] bg-[var(--bg-card)] hover:border-[var(--accent)]/50'
            }`}
          >
            <div className="w-full aspect-video rounded bg-gradient-to-br from-gray-600 to-gray-800 mb-2" />
            <span className="text-xs text-[var(--text-primary)]">{filter.name}</span>
          </button>
        ))}
      </div>

      {/* 已应用的滤镜 */}
      {filterEffects.length > 0 && (
        <div className="mt-6 space-y-3">
          <h4 className="text-sm font-medium text-[var(--text-primary)]">已应用的滤镜</h4>
          {filterEffects.map((effect) => {
            const filterConfig = FILTERS.find(f => f.type === effect.effect_name);
            return (
              <div
                key={effect.id}
                className="p-3 rounded-lg bg-[var(--bg-input)] space-y-3"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Palette className="w-4 h-4 text-[var(--accent)]" />
                    <span className="text-sm font-medium text-[var(--text-primary)]">
                      {filterConfig?.name || effect.effect_name}
                    </span>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button size="sm" isIconOnly variant="light">
                      {effect.is_active ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
                    </Button>
                    <Button
                      size="sm"
                      isIconOnly
                      variant="light"
                      color="danger"
                      onPress={() => onRemoveEffect(effect.id)}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
                {/* 滤镜参数 */}
                {filterConfig?.params.map((param) => (
                  <div key={param.key}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs text-[var(--text-muted)]">{param.label}</span>
                      <span className="text-xs text-[var(--text-primary)]">
                        {effect.effect_config?.[param.key] || param.default}
                      </span>
                    </div>
                    <Slider
                      size="sm"
                      step={1}
                      minValue={param.min}
                      maxValue={param.max}
                      defaultValue={param.default}
                      onChange={(val) => onUpdateEffect(effect.id, { [param.key]: val })}
                    />
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

// ==================== 贴纸/文字面板 ====================

interface OverlayPanelProps {
  effects: VideoEffect[];
  onAddSticker: (stickerId: string) => void;
  onAddText: (text: string) => void;
  onRemoveEffect: (id: number) => void;
  onUpdateEffect: (id: number, config: Record<string, any>) => void;
}

const OverlayPanel: React.FC<OverlayPanelProps> = ({
  effects,
  onAddSticker,
  onAddText,
  onRemoveEffect,
}) => {
  const [textInput, setTextInput] = useState('');
  const overlayEffects = effects.filter(e => 
    e.effect_type === 'sticker' || e.effect_type === 'text_overlay'
  );

  return (
    <div className="p-4 space-y-6">
      {/* 贴纸选择 */}
      <div>
        <h4 className="text-sm font-medium text-[var(--text-primary)] mb-3">贴纸</h4>
        <div className="grid grid-cols-4 gap-2">
          {STICKER_PRESETS.map((sticker) => (
            <button
              key={sticker.id}
              onClick={() => onAddSticker(sticker.id)}
              className="p-4 rounded-lg border border-[var(--border-color)] bg-[var(--bg-card)] hover:border-[var(--accent)]/50 transition-all flex flex-col items-center gap-1"
            >
              <span className="text-2xl">{sticker.emoji}</span>
              <span className="text-xs text-[var(--text-muted)]">{sticker.name}</span>
            </button>
          ))}
        </div>
      </div>

      {/* 文字叠加 */}
      <div>
        <h4 className="text-sm font-medium text-[var(--text-primary)] mb-3">添加文字</h4>
        <div className="flex gap-2">
          <Input
            value={textInput}
            onValueChange={setTextInput}
            placeholder="输入要添加的文字..."
            classNames={{
              input: "bg-transparent text-[var(--text-primary)]",
              inputWrapper: "bg-[var(--bg-input)] border border-[var(--border-color)]"
            }}
          />
          <Button
            color="primary"
            onPress={() => {
              if (textInput.trim()) {
                onAddText(textInput.trim());
                setTextInput('');
              }
            }}
          >
            添加
          </Button>
        </div>
      </div>

      {/* 已添加的叠加层 */}
      {overlayEffects.length > 0 && (
        <div>
          <h4 className="text-sm font-medium text-[var(--text-primary)] mb-3">已添加</h4>
          <div className="space-y-2">
            {overlayEffects.map((effect) => (
              <div
                key={effect.id}
                className="flex items-center justify-between p-3 rounded-lg bg-[var(--bg-input)]"
              >
                <div className="flex items-center gap-2">
                  {effect.effect_type === 'sticker' ? (
                    <Image className="w-4 h-4 text-[var(--accent)]" />
                  ) : (
                    <Type className="w-4 h-4 text-[var(--accent)]" />
                  )}
                  <span className="text-sm text-[var(--text-primary)]">{effect.effect_name}</span>
                </div>
                <div className="flex items-center gap-1">
                  <Button size="sm" isIconOnly variant="light">
                    <ChevronUp className="w-4 h-4" />
                  </Button>
                  <Button size="sm" isIconOnly variant="light">
                    <ChevronDown className="w-4 h-4" />
                  </Button>
                  <Button
                    size="sm"
                    isIconOnly
                    variant="light"
                    color="danger"
                    onPress={() => onRemoveEffect(effect.id)}
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

// ==================== 主组件 ====================

const EffectsEditor: React.FC<EffectsEditorProps> = ({
  projectId,
  effects,
  onEffectsChange,
}) => {
  const { showToast } = useToast();
  const [activePanel, setActivePanel] = useState<'transition' | 'filter' | 'overlay'>('transition');

  // 添加转场效果
  const handleAddTransition = useCallback((type: TransitionType) => {
    const transition = TRANSITIONS.find(t => t.type === type);
    const newEffect: VideoEffect = {
      id: Date.now(),
      project_id: projectId,
      user_id: 0,
      effect_type: 'transition',
      effect_name: transition?.name || type,
      effect_config: { type, duration: 0.5 },
      layer_order: effects.length,
      is_active: true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    onEffectsChange([...effects, newEffect]);
    showToast(`已添加 ${transition?.name} 转场`, 'success');
  }, [projectId, effects, onEffectsChange, showToast]);

  // 添加滤镜
  const handleAddFilter = useCallback((type: FilterType) => {
    const filter = FILTERS.find(f => f.type === type);
    const newEffect: VideoEffect = {
      id: Date.now(),
      project_id: projectId,
      user_id: 0,
      effect_type: 'filter',
      effect_name: type,
      effect_config: filter?.params.reduce((acc, p) => ({ ...acc, [p.key]: p.default }), {}) || {},
      layer_order: effects.length,
      is_active: true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    onEffectsChange([...effects, newEffect]);
    showToast(`已添加 ${filter?.name} 滤镜`, 'success');
  }, [projectId, effects, onEffectsChange, showToast]);

  // 添加贴纸
  const handleAddSticker = useCallback((stickerId: string) => {
    const sticker = STICKER_PRESETS.find(s => s.id === stickerId);
    const newEffect: VideoEffect = {
      id: Date.now(),
      project_id: projectId,
      user_id: 0,
      effect_type: 'sticker',
      effect_name: sticker?.name || stickerId,
      effect_config: { stickerId, position: { x: 50, y: 50 }, scale: 1 },
      layer_order: effects.length,
      is_active: true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    onEffectsChange([...effects, newEffect]);
    showToast(`已添加 ${sticker?.name} 贴纸`, 'success');
  }, [projectId, effects, onEffectsChange, showToast]);

  // 添加文字
  const handleAddText = useCallback((text: string) => {
    const newEffect: VideoEffect = {
      id: Date.now(),
      project_id: projectId,
      user_id: 0,
      effect_type: 'text_overlay',
      effect_name: text,
      effect_config: { text, position: { x: 50, y: 50 }, fontSize: 24, color: '#FFFFFF' },
      layer_order: effects.length,
      is_active: true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    onEffectsChange([...effects, newEffect]);
    showToast('已添加文字', 'success');
  }, [projectId, effects, onEffectsChange, showToast]);

  // 删除效果
  const handleRemoveEffect = useCallback((id: number) => {
    onEffectsChange(effects.filter(e => e.id !== id));
    showToast('已删除效果', 'success');
  }, [effects, onEffectsChange, showToast]);

  // 更新效果配置
  const handleUpdateEffect = useCallback((id: number, config: Record<string, any>) => {
    onEffectsChange(effects.map(e => 
      e.id === id ? { ...e, effect_config: { ...e.effect_config, ...config } } : e
    ));
  }, [effects, onEffectsChange]);

  return (
    <div className="h-full flex flex-col">
      {/* 标签页切换 */}
      <div className="border-b border-[var(--border-color)] bg-[var(--bg-nav)]">
        <Tabs
          selectedKey={activePanel}
          onSelectionChange={(key) => setActivePanel(key as typeof activePanel)}
          variant="underlined"
          classNames={{
            tabList: "gap-6 px-4",
            cursor: "bg-[var(--accent)]",
            tab: "h-12",
            tabContent: "text-[var(--text-secondary)] group-data-[selected=true]:text-[var(--accent)]"
          }}
        >
          <Tab
            key="transition"
            title={
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4" />
                <span>转场效果</span>
              </div>
            }
          />
          <Tab
            key="filter"
            title={
              <div className="flex items-center gap-2">
                <Palette className="w-4 h-4" />
                <span>滤镜</span>
              </div>
            }
          />
          <Tab
            key="overlay"
            title={
              <div className="flex items-center gap-2">
                <Layers className="w-4 h-4" />
                <span>贴纸/文字</span>
              </div>
            }
          />
        </Tabs>
      </div>

      {/* 内容区 */}
      <div className="flex-1 overflow-y-auto">
        {activePanel === 'transition' && (
          <TransitionPanel
            effects={effects}
            onAddTransition={handleAddTransition}
            onRemoveEffect={handleRemoveEffect}
            onUpdateEffect={handleUpdateEffect}
          />
        )}
        {activePanel === 'filter' && (
          <FilterPanel
            effects={effects}
            onAddFilter={handleAddFilter}
            onRemoveEffect={handleRemoveEffect}
            onUpdateEffect={handleUpdateEffect}
          />
        )}
        {activePanel === 'overlay' && (
          <OverlayPanel
            effects={effects}
            onAddSticker={handleAddSticker}
            onAddText={handleAddText}
            onRemoveEffect={handleRemoveEffect}
            onUpdateEffect={handleUpdateEffect}
          />
        )}
      </div>
    </div>
  );
};

export default EffectsEditor;
