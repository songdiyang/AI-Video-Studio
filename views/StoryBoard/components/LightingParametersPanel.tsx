/**
 * 打光参数面板
 * 专业打光效果设置组件，包含光源、方向、质量、色温、对比度
 */

import React from 'react';
import {
  LIGHTING_SOURCE_OPTIONS,
  LIGHTING_DIRECTION_OPTIONS,
  LIGHTING_QUALITY_OPTIONS,
  LIGHTING_COLOR_OPTIONS,
  LIGHTING_INTENSITY_OPTIONS,
  NATURAL_LIGHT_SOURCES,
  ARTIFICIAL_LIGHT_SOURCES,
  ShotLanguage,
} from '../../../types/shotLanguage';

interface LightingParametersPanelProps {
  values: ShotLanguage;
  onChange: (field: keyof ShotLanguage, value: string | number | undefined) => void;
}

/** 选项按钮网格组件 */
const OptionGrid: React.FC<{
  options: Array<{ value: string; label: string; desc?: string }>;
  selected?: string;
  onSelect: (value: string) => void;
  columns?: number;
}> = ({ options, selected, onSelect, columns = 3 }) => (
  <div className={`grid gap-1.5`} style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}>
    {options.map((opt) => (
      <button
        key={opt.value}
        onClick={() => onSelect(opt.value)}
        className={`p-2 rounded text-left transition-colors border ${
          selected === opt.value
            ? 'bg-(--accent) text-white border-(--accent)'
            : 'bg-(--bg-input) text-(--text-primary) border-(--border-color) hover:border-(--accent)/50 hover:bg-(--bg-card-hover)'
        }`}
      >
        <div className="text-xs font-medium">{opt.label}</div>
        {opt.desc && (
          <div className={`text-[10px] mt-0.5 ${selected === opt.value ? 'text-white/70' : 'text-[var(--text-muted)]'}`}>
            {opt.desc}
          </div>
        )}
      </button>
    ))}
  </div>
);

/** 分组选项组件（用于光源类型：自然光/人工光分组） */
const GroupedOptionGrid: React.FC<{
  options: Array<{ value: string; label: string; desc?: string }>;
  groupLabels: { natural: string; artificial: string };
  naturalValues: readonly string[];
  artificialValues: readonly string[];
  selected?: string;
  onSelect: (value: string) => void;
  columns?: number;
}> = ({ options, groupLabels, naturalValues, artificialValues, selected, onSelect, columns = 3 }) => {
  const naturalOptions = options.filter((o) => naturalValues.includes(o.value));
  const artificialOptions = options.filter((o) => artificialValues.includes(o.value));

  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <div className="text-[10px] text-[var(--text-muted)] uppercase tracking-wider font-medium flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-yellow-400 inline-block" />
          {groupLabels.natural}
        </div>
        <OptionGrid options={naturalOptions} selected={selected} onSelect={onSelect} columns={columns} />
      </div>
      <div className="space-y-1.5">
        <div className="text-[10px] text-[var(--text-muted)] uppercase tracking-wider font-medium flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-blue-400 inline-block" />
          {groupLabels.artificial}
        </div>
        <OptionGrid options={artificialOptions} selected={selected} onSelect={onSelect} columns={columns} />
      </div>
    </div>
  );
};

const LightingParametersPanel: React.FC<LightingParametersPanelProps> = ({ values, onChange }) => {
  return (
    <div className="space-y-5">
      {/* 光源类型（自然光/人工光分组） */}
      <div className="space-y-2">
        <label className="text-xs text-[var(--text-secondary)] font-medium">光源类型</label>
        <GroupedOptionGrid
          options={LIGHTING_SOURCE_OPTIONS.map((o) => ({ value: o.value, label: o.label, desc: o.description }))}
          groupLabels={{ natural: '自然光', artificial: '人工光' }}
          naturalValues={NATURAL_LIGHT_SOURCES}
          artificialValues={ARTIFICIAL_LIGHT_SOURCES}
          selected={values.lightingSource}
          onSelect={(v) => onChange('lightingSource', v)}
          columns={3}
        />
      </div>

      {/* 光线方向 */}
      <div className="space-y-2">
        <label className="text-xs text-[var(--text-secondary)] font-medium">光线方向</label>
        <OptionGrid
          options={LIGHTING_DIRECTION_OPTIONS.map((o) => ({ value: o.value, label: o.label, desc: o.description }))}
          selected={values.lightingDirection}
          onSelect={(v) => onChange('lightingDirection', v)}
          columns={4}
        />
      </div>

      {/* 光线质量 */}
      <div className="space-y-2">
        <label className="text-xs text-[var(--text-secondary)] font-medium">光线质量</label>
        <OptionGrid
          options={LIGHTING_QUALITY_OPTIONS.map((o) => ({ value: o.value, label: o.label, desc: o.description }))}
          selected={values.lightingQuality}
          onSelect={(v) => onChange('lightingQuality', v)}
          columns={3}
        />
      </div>

      {/* 光线色温 */}
      <div className="space-y-2">
        <label className="text-xs text-[var(--text-secondary)] font-medium">光线色温</label>
        <OptionGrid
          options={LIGHTING_COLOR_OPTIONS.map((o) => ({ value: o.value, label: o.label, desc: o.description }))}
          selected={values.lightingColor}
          onSelect={(v) => onChange('lightingColor', v)}
          columns={4}
        />
      </div>

      {/* 光线对比度/强度 */}
      <div className="space-y-2">
        <label className="text-xs text-[var(--text-secondary)] font-medium">光线对比度</label>
        <OptionGrid
          options={LIGHTING_INTENSITY_OPTIONS.map((o) => ({ value: o.value, label: o.label, desc: o.description }))}
          selected={values.lightingIntensity}
          onSelect={(v) => onChange('lightingIntensity', v)}
          columns={3}
        />
      </div>
    </div>
  );
};

export default LightingParametersPanel;
