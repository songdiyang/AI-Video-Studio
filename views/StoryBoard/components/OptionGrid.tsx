/**
 * 共享选项按钮网格组件
 * 用于镜头参数编辑器中的各种选项选择
 */

import React from 'react';

export interface OptionGridItem {
  value: string;
  label: string;
  desc?: string;
}

interface OptionGridProps {
  options: OptionGridItem[];
  selected?: string;
  onSelect: (value: string) => void;
  columns?: number;
  /** 是否允许取消选择（再次点击已选中项） */
  allowDeselect?: boolean;
}

/** 选项按钮网格组件 */
const OptionGrid: React.FC<OptionGridProps> = ({
  options,
  selected,
  onSelect,
  columns = 3,
  allowDeselect = true,
}) => (
  <div className="grid gap-1.5" style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}>
    {options.map((opt) => {
      const isSelected = selected === opt.value;
      return (
        <button
          key={opt.value}
          onClick={() => {
            if (allowDeselect && isSelected) {
              onSelect('');
            } else {
              onSelect(opt.value);
            }
          }}
          className={`p-2 rounded text-left transition-all duration-150 border ${
            isSelected
              ? 'bg-(--accent) text-white border-(--accent) shadow-sm shadow-(--accent)/20'
              : 'bg-(--bg-input) text-(--text-primary) border-(--border-color) hover:border-(--accent)/50 hover:bg-(--bg-card-hover)'
          }`}
        >
          <div className="text-xs font-medium leading-tight">{opt.label}</div>
          {opt.desc && (
            <div className={`text-[10px] mt-0.5 leading-tight ${isSelected ? 'text-white/70' : 'text-[var(--text-muted)]'}`}>
              {opt.desc}
            </div>
          )}
        </button>
      );
    })}
  </div>
);

/** 分区标题组件 */
export const SectionLabel: React.FC<{
  icon?: React.ReactNode;
  label: string;
  hint?: string;
}> = ({ icon, label, hint }) => (
  <div className="flex items-center gap-1.5">
    {icon && <span className="text-[var(--text-muted)]">{icon}</span>}
    <label className="text-xs text-[var(--text-secondary)] font-medium">{label}</label>
    {hint && <span className="text-[10px] text-[var(--text-muted)] ml-auto">{hint}</span>}
  </div>
);

/** 分组选项网格组件（带子分组标签） */
export const GroupedOptionGrid: React.FC<{
  groups: Array<{
    label: string;
    color: string;
    values: readonly string[];
  }>;
  options: OptionGridItem[];
  selected?: string;
  onSelect: (value: string) => void;
  columns?: number;
  allowDeselect?: boolean;
}> = ({ groups, options, selected, onSelect, columns = 3, allowDeselect = true }) => (
  <div className="space-y-3">
    {groups.map((group) => {
      const groupOptions = options.filter((o) => group.values.includes(o.value));
      if (groupOptions.length === 0) return null;
      return (
        <div key={group.label} className="space-y-1.5">
          <div className="text-[10px] text-[var(--text-muted)] uppercase tracking-wider font-medium flex items-center gap-1.5">
            <span className={`w-2 h-2 rounded-full inline-block ${group.color}`} />
            {group.label}
          </div>
          <OptionGrid
            options={groupOptions}
            selected={selected}
            onSelect={onSelect}
            columns={columns}
            allowDeselect={allowDeselect}
          />
        </div>
      );
    })}
  </div>
);

export default OptionGrid;
