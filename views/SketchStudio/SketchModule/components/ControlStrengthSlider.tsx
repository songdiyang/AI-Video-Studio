import React, { useMemo } from 'react';
import { Slider, Tooltip } from '@heroui/react';
import {
  MIN_CONTROL_STRENGTH,
  MAX_CONTROL_STRENGTH,
  CONTROL_STRENGTH_STEP,
  CONTROL_STRENGTH_PRESETS,
  ControlStrengthPreset
} from '../types/sketch';

interface ControlStrengthSliderProps {
  /** 当前控制强度值 (0.0 ~ 1.0) */
  value: number;
  /** 值变化回调 */
  onChange: (value: number) => void;
  /** 值变化结束回调（用于保存） */
  onChangeEnd?: (value: number) => void;
  /** 是否显示预设按钮（弱/中/强） */
  showPresets?: boolean;
  /** 紧凑模式（用于工具栏内） */
  compact?: boolean;
  /** 是否禁用 */
  disabled?: boolean;
  /** 自定义类名 */
  className?: string;
}

/**
 * 控制强度滑块组件
 * 用于调整草图对生成图像的控制强度
 */
const ControlStrengthSlider: React.FC<ControlStrengthSliderProps> = ({
  value,
  onChange,
  onChangeEnd,
  showPresets = false,
  compact = false,
  disabled = false,
  className = ''
}) => {
  // 格式化为百分比显示
  const percentageValue = useMemo(() => {
    return `${Math.round(value * 100)}%`;
  }, [value]);

  // 判断当前值是否匹配某个预设
  const currentPreset = useMemo((): ControlStrengthPreset | null => {
    for (const [key, config] of Object.entries(CONTROL_STRENGTH_PRESETS)) {
      if (Math.abs(value - config.value) < 0.01) {
        return key as ControlStrengthPreset;
      }
    }
    return null;
  }, [value]);

  // 处理预设点击
  const handlePresetClick = (preset: Exclude<ControlStrengthPreset, 'custom'>) => {
    const newValue = CONTROL_STRENGTH_PRESETS[preset].value;
    onChange(newValue);
    onChangeEnd?.(newValue);
  };

  // 紧凑模式渲染
  if (compact) {
    return (
      <div className={`flex items-center gap-3 ${className}`}>
        <span className="text-xs text-[var(--text-muted)] whitespace-nowrap">控制强度:</span>
        <Slider
          size="sm"
          step={CONTROL_STRENGTH_STEP}
          minValue={MIN_CONTROL_STRENGTH}
          maxValue={MAX_CONTROL_STRENGTH}
          value={value}
          onChange={(v) => onChange(v as number)}
          onChangeEnd={(v) => onChangeEnd?.(v as number)}
          isDisabled={disabled}
          className="w-28"
          classNames={{
            track: "bg-[var(--bg-app)]",
            filler: "bg-[var(--accent)]",
            thumb: "bg-[var(--accent)] border-2 border-white shadow-md"
          }}
          aria-label="控制强度"
        />
        <span className="text-xs font-mono text-[var(--text-secondary)] w-10">
          {percentageValue}
        </span>
      </div>
    );
  }

  // 完整模式渲染
  return (
    <div className={`space-y-2 ${className}`}>
      {/* 标签和数值 */}
      <div className="flex items-center justify-between">
        <label className="text-xs text-[var(--text-muted)]">控制强度</label>
        <span className="text-xs font-mono text-[var(--text-secondary)]">
          {percentageValue}
        </span>
      </div>

      {/* 滑块 */}
      <Slider
        size="sm"
        step={CONTROL_STRENGTH_STEP}
        minValue={MIN_CONTROL_STRENGTH}
        maxValue={MAX_CONTROL_STRENGTH}
        value={value}
        onChange={(v) => onChange(v as number)}
        onChangeEnd={(v) => onChangeEnd?.(v as number)}
        isDisabled={disabled}
        className="max-w-full"
        classNames={{
          track: "bg-[var(--bg-card)]",
          filler: "bg-[var(--accent)]"
        }}
        aria-label="控制强度"
      />

      {/* 预设按钮 */}
      {showPresets && (
        <div className="flex items-center gap-2">
          {(Object.keys(CONTROL_STRENGTH_PRESETS) as Exclude<ControlStrengthPreset, 'custom'>[]).map((preset) => {
            const config = CONTROL_STRENGTH_PRESETS[preset];
            const isActive = currentPreset === preset;
            return (
              <Tooltip key={preset} content={config.description}>
                <button
                  onClick={() => handlePresetClick(preset)}
                  disabled={disabled}
                  className={`
                    px-2.5 py-1 rounded text-xs font-medium transition-all
                    ${isActive
                      ? 'bg-[var(--accent)] text-white'
                      : 'bg-[var(--bg-app)] text-[var(--text-secondary)] hover:bg-[var(--bg-card-hover)] border border-[var(--border-color)]'
                    }
                    ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
                  `}
                >
                  {config.label}
                </button>
              </Tooltip>
            );
          })}
        </div>
      )}

      {/* 说明文字 */}
      <p className="text-[10px] text-[var(--text-muted)]">
        值越大，生成的图像越接近草图轮廓
      </p>
    </div>
  );
};

export default ControlStrengthSlider;
