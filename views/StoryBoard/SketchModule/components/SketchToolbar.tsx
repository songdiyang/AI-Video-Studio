import React from 'react';
import { Button, Slider, Tooltip } from '@heroui/react';
import { Save, X, Eye, EyeOff, Undo, Redo, Trash2 } from 'lucide-react';
import SketchTypeSelector from './SketchTypeSelector';
import { SketchType, BackgroundType } from '../hooks/useSketchEditor';

interface SketchToolbarProps {
  sketchType: SketchType;
  controlStrength: number;
  showBackground: boolean;
  backgroundType: BackgroundType;
  onSketchTypeChange: (type: SketchType) => void;
  onControlStrengthChange: (strength: number) => void;
  onToggleBackground: () => void;
  onBackgroundTypeChange: (type: BackgroundType) => void;
  onSave: () => void;
  onCancel: () => void;
  onClear?: () => void;
  saving: boolean;
  hasBackgroundImage?: boolean;
  /** 独立模式：隐藏 AI 生成相关控件 (SketchTypeSelector, ControlStrengthSlider) */
  standalone?: boolean;
}

const SketchToolbar: React.FC<SketchToolbarProps> = ({
  sketchType,
  controlStrength,
  showBackground,
  backgroundType,
  onSketchTypeChange,
  onControlStrengthChange,
  onToggleBackground,
  onBackgroundTypeChange,
  onSave,
  onCancel,
  onClear,
  saving,
  hasBackgroundImage = false,
  standalone = false
}) => {
  return (
    <div className="flex items-center justify-between px-4 py-2 bg-[var(--bg-card)] border-b border-[var(--border-color)] md:flex-wrap gap-2">
      {/* 左侧：草图类型 + 控制强度（分镜模式显示） */}
      <div className="flex items-center gap-6">
        {/* 分镜模式：草图类型选择器 */}
        {!standalone && (
          <SketchTypeSelector
            value={sketchType}
            onChange={onSketchTypeChange}
            compact
          />
        )}

        {/* 分镜模式：控制强度滑块 */}
        {!standalone && (
          <div className="flex items-center gap-3">
            <span className="text-xs text-[var(--text-muted)] whitespace-nowrap">控制强度:</span>
            <Slider
              size="sm"
              step={0.05}
              minValue={0}
              maxValue={1}
              value={controlStrength}
              onChange={(value) => onControlStrengthChange(value as number)}
              className="w-24 md:w-28 lg:w-32"
              classNames={{
                track: "bg-[var(--bg-app)]",
                filler: "bg-[var(--accent)]",
                thumb: "bg-[var(--accent)] border-2 border-white shadow-md"
              }}
              aria-label="控制强度"
            />
            <span className="text-xs font-mono text-[var(--text-secondary)] w-10">
              {controlStrength.toFixed(2)}
            </span>
          </div>
        )}

        {/* 独立模式：显示简单提示 */}
        {standalone && (
          <span className="text-sm text-[var(--text-muted)]">草图编辑器</span>
        )}
      </div>

      {/* 右侧：背景控制 + 保存/取消 */}
      <div className="flex items-center gap-4">
        {/* 背景图开关 */}
        {hasBackgroundImage && (
          <Tooltip content={showBackground ? "隐藏底图参考" : "显示底图参考"}>
            <button
              onClick={onToggleBackground}
              className={`
                flex items-center gap-1.5 px-2 py-1 rounded text-xs transition-all
                ${showBackground
                  ? 'bg-[var(--accent)]/20 text-[var(--accent)]'
                  : 'bg-[var(--bg-app)] text-[var(--text-muted)]'
                }
              `}
            >
              {showBackground ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
              <span className="hidden sm:inline">底图</span>
            </button>
          </Tooltip>
        )}

        {/* 背景色选择 */}
        <div className="flex items-center gap-2">
          <span className="text-xs text-[var(--text-muted)]">画布:</span>
          <div className="flex gap-1">
            <Tooltip content="白色背景">
              <button
                onClick={() => onBackgroundTypeChange('white')}
                className={`
                  w-6 h-6 rounded border-2 transition-all hover:scale-110 hover:ring-2 hover:ring-[var(--accent)]/30
                  ${backgroundType === 'white'
                    ? 'border-[var(--accent)] ring-2 ring-[var(--accent)]/30'
                    : 'border-[var(--border-color)]'
                  }
                  bg-white
                `}
                aria-label="白色背景"
              />
            </Tooltip>
            <Tooltip content="透明背景">
              <button
                onClick={() => onBackgroundTypeChange('transparent')}
                className={`
                  w-6 h-6 rounded border-2 transition-all overflow-hidden hover:scale-110 hover:ring-2 hover:ring-[var(--accent)]/30
                  ${backgroundType === 'transparent'
                    ? 'border-[var(--accent)] ring-2 ring-[var(--accent)]/30'
                    : 'border-[var(--border-color)]'
                  }
                `}
                style={{
                  background: 'repeating-conic-gradient(#808080 0% 25%, #fff 0% 50%) 50% / 8px 8px'
                }}
                aria-label="透明背景"
              />
            </Tooltip>
          </div>
        </div>

        {/* 分隔线 */}
        <div className="w-px h-6 bg-[var(--border-color)]" />

        {/* 清空画布按钮 */}
        {onClear && (
          <Tooltip content="清空画布">
            <button
              onClick={onClear}
              className="flex items-center gap-1.5 px-2 py-1 rounded text-xs bg-red-500/10 text-red-400 hover:bg-red-500/20 transition-all"
            >
              <Trash2 className="w-4 h-4" />
              <span className="hidden sm:inline">清空</span>
            </button>
          </Tooltip>
        )}

        {/* 分隔线 */}
        <div className="w-px h-6 bg-[var(--border-color)]" />

        {/* 保存/取消按钮 */}
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="flat"
            onPress={onCancel}
            className="pro-btn text-[var(--text-secondary)]"
            isDisabled={saving}
            startContent={<X className="w-4 h-4" />}
          >
            取消
          </Button>
          <Button
            size="sm"
            onPress={onSave}
            className="pro-btn-primary"
            isLoading={saving}
            isDisabled={saving}
            startContent={!saving && <Save className="w-4 h-4" />}
          >
            {saving ? '保存中...' : '保存草图'}
          </Button>
        </div>
      </div>
    </div>
  );
};

export default SketchToolbar;
