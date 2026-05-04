/**
 * 景别选择器组件
 * 
 * 允许用户自由切换分镜的景别（大特写、特写、中近景、中景、中全景、全景、大远景）
 * AI智能分镜生成的景别只是参考，用户可以手动修改
 */

import React from 'react';
import { Select, SelectItem, Chip } from '@heroui/react';
import { Camera } from 'lucide-react';

// 景别选项定义
export const SHOT_SIZE_OPTIONS = [
  { value: 'extreme_close_up', label: '大特写', desc: '聚焦细节，如眼睛、手指' },
  { value: 'close_up', label: '特写', desc: '面部表情，情感表达' },
  { value: 'medium_close_up', label: '中近景', desc: '头部和肩部' },
  { value: 'medium_shot', label: '中景', desc: '上半身，常用对话镜头' },
  { value: 'medium_long_shot', label: '中全景', desc: '大部分身体' },
  { value: 'long_shot', label: '全景', desc: '完整人物' },
  { value: 'extreme_long_shot', label: '大远景', desc: '宏大场面' },
];

// 景别到中文标签的映射
const SHOT_SIZE_LABELS: Record<string, string> = {
  extreme_close_up: '大特写',
  close_up: '特写',
  medium_close_up: '中近景',
  medium_shot: '中景',
  medium_long_shot: '中全景',
  long_shot: '全景',
  extreme_long_shot: '大远景',
};

// 景别颜色配置
const SHOT_SIZE_COLORS: Record<string, string> = {
  extreme_close_up: 'bg-purple-500/20 text-purple-400',
  close_up: 'bg-pink-500/20 text-pink-400',
  medium_close_up: 'bg-blue-500/20 text-blue-400',
  medium_shot: 'bg-cyan-500/20 text-cyan-400',
  medium_long_shot: 'bg-green-500/20 text-green-400',
  long_shot: 'bg-orange-500/20 text-orange-400',
  extreme_long_shot: 'bg-amber-500/20 text-amber-400',
};

interface ShotSizeSelectorProps {
  /** 当前选中的景别值 */
  value?: string;
  /** 景别变化回调 */
  onChange?: (value: string) => void;
  /** 是否紧凑模式（用于分镜列表显示） */
  compact?: boolean;
  /** 是否禁用 */
  disabled?: boolean;
  /** 点击停止传播 */
  onClick?: (e: React.MouseEvent) => void;
}

/**
 * 景别选择器 - 用于分镜编辑器中
 */
export const ShotSizeSelector: React.FC<ShotSizeSelectorProps> = ({
  value,
  onChange,
  compact = false,
  disabled = false,
  onClick,
}) => {
  // 紧凑模式：只显示可点击的 Chip
  if (compact) {
    const currentLabel = value ? SHOT_SIZE_LABELS[value] || value : '未设置';
    const colorClass = value ? SHOT_SIZE_COLORS[value] : 'bg-gray-500/20 text-gray-400';

    return (
      <Select
        aria-label="景别选择"
        selectedKeys={value ? [value] : []}
        onSelectionChange={(keys) => {
          const selected = Array.from(keys)[0] as string;
          onChange?.(selected);
        }}
        disabled={disabled}
        onClick={onClick}
        classNames={{
          trigger: 'bg-transparent min-w-0 h-auto px-0 py-0 max-w-[120px]',
          value: 'text-[10px] px-1 py-0.5 rounded',
          listbox: 'max-h-60',
        }}
        renderValue={(items) => (
          <span className={`${colorClass} text-[10px] px-1 py-0.5 rounded inline-block`}>
            {currentLabel}
          </span>
        )}
        popoverProps={{
          placement: 'bottom-start',
          shouldFlip: true,
          classNames: {
            content: 'bg-[var(--bg-card)] border border-[var(--border-default)] max-w-[200px]',
          },
        }}
      >
        {SHOT_SIZE_OPTIONS.map((option) => (
          <SelectItem key={option.value} textValue={option.label}>
            <div className="flex flex-col">
              <span className="text-sm font-medium">{option.label}</span>
              <span className="text-xs text-[var(--text-muted)]">{option.desc}</span>
            </div>
          </SelectItem>
        ))}
      </Select>
    );
  }

  // 完整模式：显示标签和描述
  return (
    <div className="space-y-2">
      <label className="text-xs text-[var(--text-secondary)] font-medium">
        景别（画面大小）
      </label>
      <Select
        aria-label="景别选择"
        placeholder="选择景别"
        selectedKeys={value ? [value] : []}
        onSelectionChange={(keys) => {
          const selected = Array.from(keys)[0] as string;
          onChange?.(selected);
        }}
        disabled={disabled}
        startContent={<Camera className="w-4 h-4 text-[var(--text-muted)]" />}
        classNames={{
          trigger: 'bg-[var(--bg-input)] border-[var(--border-default)]',
        }}
      >
        {SHOT_SIZE_OPTIONS.map((option) => (
          <SelectItem key={option.value} textValue={option.label}>
            <div className="flex flex-col">
              <span className="text-sm font-medium">{option.label}</span>
              <span className="text-xs text-[var(--text-muted)]">{option.desc}</span>
            </div>
          </SelectItem>
        ))}
      </Select>
    </div>
  );
};

/**
 * 景别显示标签 - 只读显示
 */
export const ShotSizeBadge: React.FC<{ value?: string }> = ({ value }) => {
  if (!value) return null;

  const label = SHOT_SIZE_LABELS[value] || value;
  const colorClass = SHOT_SIZE_COLORS[value] || 'bg-gray-500/20 text-gray-400';

  return (
    <Chip size="sm" variant="flat" className={`${colorClass} text-xs font-medium`}>
      {label}
    </Chip>
  );
};

export default ShotSizeSelector;
