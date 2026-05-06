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
// 中文标签到英文值的反向映射（用于兼容旧数据）
const LABEL_TO_VALUE: Record<string, string> = {
  '大特写': 'extreme_close_up',
  '特写': 'close_up',
  '中近景': 'medium_close_up',
  '中景': 'medium_shot',
  '中全景': 'medium_long_shot',
  '全景': 'long_shot',
  '大远景': 'extreme_long_shot',
  '远景': 'long_shot', // 兼容旧数据中的"远景"（对应long_shot）
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
  // 将中文标签转换为英文值（兼容旧数据）
  const normalizedValue = value ? (LABEL_TO_VALUE[value] || value) : undefined;
  // 紧凑模式：只显示可点击的 Chip
  if (compact) {
    const currentLabel = normalizedValue ? SHOT_SIZE_LABELS[normalizedValue] || normalizedValue : '未设置';
    const colorClass = normalizedValue ? SHOT_SIZE_COLORS[normalizedValue] : 'bg-gray-500/20 text-gray-400';

    return (
      <Select
        aria-label="景别选择"
        selectedKeys={normalizedValue ? [normalizedValue] : []}
        onSelectionChange={(keys) => {
          const selected = Array.from(keys)[0] as string;
          // 返回中文标签，保持数据存储格式一致
          const labelToReturn = SHOT_SIZE_LABELS[selected] || selected;
          onChange?.(labelToReturn);
        }}
        disabled={disabled}
        onClick={onClick}
        className="min-w-fit"
        size="sm"
        variant="flat"
        classNames={{
          base: "!max-w-fit",
          trigger: "h-[18px] min-h-[18px] px-0.5 bg-transparent border-0 shadow-none overflow-visible hover:bg-[var(--bg-card-hover)] rounded",
          value: "text-[10px] whitespace-nowrap overflow-visible",
          innerWrapper: "gap-0 overflow-visible",
          listbox: "max-h-80 overflow-y-auto [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]",
          selectorIcon: "relative static ml-0.5 w-3 h-3",
        }}
        renderValue={() => (
          <span className={`${colorClass} text-[10px] px-1 py-0 rounded-sm whitespace-nowrap leading-none`}>
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
        {SHOT_SIZE_OPTIONS.map((option) => (
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

  // 完整模式：显示标签和描述
  return (
    <div className="space-y-2">
      <label className="text-xs text-[var(--text-secondary)] font-medium">
        景别（画面大小）
      </label>
      <Select
        aria-label="景别选择"
        placeholder="选择景别"
        selectedKeys={normalizedValue ? [normalizedValue] : []}
        onSelectionChange={(keys) => {
          const selected = Array.from(keys)[0] as string;
          // 返回中文标签，保持数据存储格式一致
          const labelToReturn = SHOT_SIZE_LABELS[selected] || selected;
          onChange?.(labelToReturn);
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

  // 将中文标签转换为英文值
  const normalizedValue = LABEL_TO_VALUE[value] || value;
  const label = SHOT_SIZE_LABELS[normalizedValue] || value;
  const colorClass = SHOT_SIZE_COLORS[normalizedValue] || 'bg-gray-500/20 text-gray-400';

  return (
    <Chip size="sm" variant="flat" className={`${colorClass} text-xs font-medium`}>
      {label}
    </Chip>
  );
};

export default ShotSizeSelector;
