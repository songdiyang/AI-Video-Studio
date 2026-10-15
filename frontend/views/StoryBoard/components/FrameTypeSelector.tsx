/**
 * 画面类型选择器组件
 * 
 * 用于标记分镜是静止画面（单图）还是运动画面（首尾帧视频）
 */

import React from 'react';
import { Select, SelectItem } from '@heroui/react';
import { Image, Video } from 'lucide-react';

// 画面类型选项
export const FRAME_TYPE_OPTIONS = [
  { value: 'static', label: '静止', desc: '单张静态图' },
  { value: 'motion', label: '运动', desc: '首尾帧视频' },
];

interface FrameTypeSelectorProps {
  /** 当前画面类型（true=运动，false=静止） */
  hasAction?: boolean;
  /** 类型变化回调 */
  onChange?: (hasAction: boolean) => void;
  compact?: boolean;
}

export const FrameTypeSelector: React.FC<FrameTypeSelectorProps> = ({
  hasAction = false,
  onChange,
  compact = false,
}) => {
  const currentValue = hasAction ? 'motion' : 'static';

  if (compact) {
    return (
      <Select
        selectedKeys={[currentValue]}
        onSelectionChange={(keys) => {
          const selected = Array.from(keys)[0] as string;
          onChange?.(selected === 'motion');
        }}
        className="min-w-fit"
        size="sm"
        variant="flat"
        aria-label="选择画面类型"
        classNames={{
          base: "!max-w-fit",
          trigger: "h-[18px] min-h-[18px] px-0.5 bg-transparent border-0 shadow-none overflow-visible hover:bg-[var(--bg-card-hover)] rounded",
          value: "text-[10px] whitespace-nowrap overflow-visible",
          innerWrapper: "gap-0 overflow-visible",
          listbox: "max-h-80 overflow-y-auto [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]",
          selectorIcon: "relative static ml-0.5 w-3 h-3",
        }}
        renderValue={() => (
          <span className={`text-[10px] px-1 py-0 rounded-sm whitespace-nowrap leading-none ${hasAction ? 'bg-amber-500/15 text-amber-400' : 'bg-slate-500/15 text-slate-400'}`}>
            {hasAction ? '运动' : '静止'}
          </span>
        )}
        popoverProps={{
          placement: 'bottom-start',
          shouldFlip: true,
          offset: 2,
          classNames: {
            content: 'bg-[var(--bg-card)] border border-[var(--border-default)] min-w-[180px] max-w-[220px]',
          },
        }}
      >
        {FRAME_TYPE_OPTIONS.map((option) => (
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
      <label className="text-xs font-medium text-[var(--text-muted)]">画面类型</label>
      <Select
        selectedKeys={[currentValue]}
        onSelectionChange={(keys) => {
          const selected = Array.from(keys)[0] as string;
          onChange?.(selected === 'motion');
        }}
        className="w-full"
        variant="bordered"
        aria-label="选择画面类型"
        startContent={
          hasAction ? (
            <Video className="w-4 h-4 text-amber-400" />
          ) : (
            <Image className="w-4 h-4 text-[var(--text-muted)]" />
          )
        }
      >
        {FRAME_TYPE_OPTIONS.map((option) => (
          <SelectItem key={option.value} description={option.desc}>
            {option.label}
          </SelectItem>
        ))}
      </Select>
    </div>
  );
};

export default FrameTypeSelector;
