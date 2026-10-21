/**
 * 摄像机参数面板
 * 专业摄像机参数设置组件，包含焦距、距离、运动、景深、构图、角度
 */

import React, { useCallback, useMemo } from 'react';
import { Slider } from '@heroui/react';
import {
  FOCAL_LENGTH_OPTIONS,
  FOCAL_LENGTH_DEFAULT_MM,
  FOCAL_LENGTH_RANGE,
  CAMERA_DISTANCE_OPTIONS,
  ShotLanguage,
  FocalLength,
} from '../../../types/shotLanguage';
import {
  CAMERA_MOVEMENT_OPTIONS,
  CAMERA_DOF_OPTIONS,
  CAMERA_COMPOSITION_OPTIONS,
  CAMERA_ANGLE_OPTIONS,
} from '../../SimpleStoryBoard/DirectorAssistant/directorParams';

interface CameraParametersPanelProps {
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

const CameraParametersPanel: React.FC<CameraParametersPanelProps> = ({ values, onChange }) => {
  // 焦距类型变更时自动联动mm值
  const handleFocalLengthChange = useCallback(
    (fl: FocalLength) => {
      const defaultMm = FOCAL_LENGTH_DEFAULT_MM[fl];
      onChange('focalLength', fl);
      onChange('focalLengthMm', defaultMm);
    },
    [onChange]
  );

  // 焦距mm值变更
  const handleFocalLengthMmChange = useCallback(
    (mm: number) => {
      onChange('focalLengthMm', mm);
    },
    [onChange]
  );

  // 当前焦距范围
  const focalRange = useMemo(() => {
    if (values.focalLength) {
      return FOCAL_LENGTH_RANGE[values.focalLength];
    }
    return [14, 400] as [number, number];
  }, [values.focalLength]);

  return (
    <div className="space-y-5">
      {/* 焦距类型 */}
      <div className="space-y-2">
        <label className="text-xs text-[var(--text-secondary)] font-medium">焦距类型</label>
        <OptionGrid
          options={FOCAL_LENGTH_OPTIONS.map((o) => ({ value: o.value, label: o.label, desc: o.description }))}
          selected={values.focalLength}
          onSelect={(v) => handleFocalLengthChange(v as FocalLength)}
          columns={3}
        />
      </div>

      {/* 具体焦距mm值 */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <label className="text-xs text-[var(--text-secondary)] font-medium">焦距 (mm)</label>
          <span className="text-xs text-[var(--accent)] font-mono">
            {values.focalLengthMm || FOCAL_LENGTH_DEFAULT_MM[values.focalLength || 'standard']}mm
          </span>
        </div>
        <Slider
          size="sm"
          step={1}
          minValue={focalRange[0]}
          maxValue={focalRange[1]}
          value={values.focalLengthMm || FOCAL_LENGTH_DEFAULT_MM[values.focalLength || 'standard']}
          onChange={(v) => handleFocalLengthMmChange(v as number)}
          classNames={{
            track: 'bg-[var(--bg-input)]',
            filler: 'bg-[var(--accent)]',
            thumb: 'bg-[var(--accent)]',
          }}
        />
        <div className="flex justify-between text-[10px] text-[var(--text-muted)]">
          <span>{focalRange[0]}mm</span>
          <span>{focalRange[1]}mm</span>
        </div>
      </div>

      {/* 摄像机距离 */}
      <div className="space-y-2">
        <label className="text-xs text-[var(--text-secondary)] font-medium">摄像机距离</label>
        <OptionGrid
          options={CAMERA_DISTANCE_OPTIONS.map((o) => ({ value: o.value, label: o.label, desc: o.description }))}
          selected={values.cameraDistance}
          onSelect={(v) => onChange('cameraDistance', v)}
          columns={5}
        />
      </div>

      {/* 镜头运动 */}
      <div className="space-y-2">
        <label className="text-xs text-[var(--text-secondary)] font-medium">镜头运动</label>
        <OptionGrid
          options={CAMERA_MOVEMENT_OPTIONS.map((o) => ({ value: o.value, label: o.label, desc: o.desc }))}
          selected={values.cameraMovement}
          onSelect={(v) => onChange('cameraMovement', v)}
          columns={4}
        />
      </div>

      {/* 景深 */}
      <div className="space-y-2">
        <label className="text-xs text-[var(--text-secondary)] font-medium">景深</label>
        <OptionGrid
          options={CAMERA_DOF_OPTIONS.map((o) => ({ value: o.value, label: o.label, desc: o.desc }))}
          selected={values.depthOfField}
          onSelect={(v) => onChange('depthOfField', v)}
          columns={3}
        />
      </div>

      {/* 构图法则 */}
      <div className="space-y-2">
        <label className="text-xs text-[var(--text-secondary)] font-medium">构图法则</label>
        <OptionGrid
          options={CAMERA_COMPOSITION_OPTIONS.map((o) => ({ value: o.value, label: o.label, desc: o.desc }))}
          selected={values.compositionRule}
          onSelect={(v) => onChange('compositionRule', v)}
          columns={3}
        />
      </div>

      {/* 拍摄角度 */}
      <div className="space-y-2">
        <label className="text-xs text-[var(--text-secondary)] font-medium">拍摄角度</label>
        <OptionGrid
          options={CAMERA_ANGLE_OPTIONS.map((o) => ({ value: o.value, label: o.label, desc: o.desc }))}
          selected={values.cameraHeight}
          onSelect={(v) => onChange('cameraHeight', v)}
          columns={4}
        />
      </div>
    </div>
  );
};

export default CameraParametersPanel;
