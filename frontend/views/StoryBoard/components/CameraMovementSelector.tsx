/**
 * 运镜方式选择器组件
 * 
 * 允许用户自由切换分镜的运镜方式（静止、推、拉、摇、俯仰、跟、移等）
 * 参考 ShotSizeSelector 的设计风格
 */

import React from 'react';
import { Select, SelectItem, Chip } from '@heroui/react';
import { Camera } from 'lucide-react';
import { CAMERA_MOVEMENT_OPTIONS } from '../../SimpleStoryBoard/DirectorAssistant/directorParams';

// 运镜方式到中文标签的映射
export const CAMERA_MOVEMENT_LABELS: Record<string, string> = {
  static: '静止',
  push: '推',
  pull: '拉',
  pan: '摇',
  tilt: '俯仰',
  track: '跟',
  dolly: '移',
  zoom: '变焦',
  crane: '升降',
  handheld: '手持',
  steadicam: '稳定器',
  orbit: '环绕',
  dolly_zoom: '希区柯克变焦',
  whip_pan: '甩镜',
};

interface CameraMovementSelectorProps {
  value?: string;
  onChange?: (newValue: string) => void;
  compact?: boolean;
}

export const CameraMovementSelector: React.FC<CameraMovementSelectorProps> = ({
  value,
  onChange,
  compact = false,
}) => {
  const currentValue = value || 'static';
  const currentLabel = CAMERA_MOVEMENT_LABELS[currentValue] || currentValue;

  if (compact) {
    return (
      <Select
        selectedKeys={[currentValue]}
        onSelectionChange={(keys) => {
          const selected = Array.from(keys)[0] as string;
          onChange?.(selected);
        }}
        className="min-w-fit"
        size="sm"
        variant="flat"
        aria-label="选择运镜方式"
        classNames={{
          base: "!max-w-fit",
          trigger: "h-[18px] min-h-[18px] px-0.5 bg-transparent border-0 shadow-none overflow-visible hover:bg-[var(--bg-card-hover)] rounded",
          value: "text-[10px] whitespace-nowrap overflow-visible",
          innerWrapper: "gap-0 overflow-visible",
          listbox: "max-h-80 overflow-y-auto [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]",
          selectorIcon: "relative static ml-0.5 w-3 h-3",
        }}
        renderValue={() => (
          <span className="bg-slate-500/15 text-slate-400 text-[10px] px-1 py-0 rounded-sm whitespace-nowrap leading-none">
            {currentLabel}
          </span>
        )}
        popoverProps={{
          placement: 'bottom-start',
          shouldFlip: true,
          offset: 2,
          classNames: {
            content: 'bg-[var(--bg-card)] border border-[var(--border-default)] min-w-[240px] max-w-[280px]',
          },
        }}
      >
        {CAMERA_MOVEMENT_OPTIONS.map((option) => (
          <SelectItem key={option.value} textValue={option.label} className="text-xs">
            <div className="flex flex-col">
              <span className="text-sm font-medium">{option.label}</span>
              <span className="text-xs text-[var(--text-muted)]">{option.desc}</span>
            </div>
          </SelectItem>
        ))}
      </Select>
    );
  }

  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs font-medium text-[var(--text-muted)]">运镜方式</label>
      <Select
        selectedKeys={[currentValue]}
        onChange={(e) => {
          const newValue = e.target.value;
          onChange?.(newValue);
        }}
        className="w-full"
        variant="bordered"
        aria-label="选择运镜方式"
        startContent={<Camera className="w-4 h-4 text-[var(--text-muted)]" />}
      >
        {CAMERA_MOVEMENT_OPTIONS.map((option) => (
          <SelectItem key={option.value} description={option.desc}>
            {option.label}
          </SelectItem>
        ))}
      </Select>
    </div>
  );
};

export default CameraMovementSelector;
