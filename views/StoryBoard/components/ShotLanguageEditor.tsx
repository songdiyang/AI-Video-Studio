/**
 * 镜头参数编辑器
 * 专业影视镜头参数设置组件 - Tab式布局
 * 
 * Tab 1 "摄像机"：焦距、距离、运动、景深、构图、角度
 * Tab 2 "打光"：光源、方向、质量、色温、对比度
 * Tab 3 "构图"：景别、轴线、屏幕方向、转场、时长
 */

import React, { useState, useEffect, useCallback } from 'react';
import { Button, Tabs, Tab, Card, CardBody, Input } from '@heroui/react';
import { Camera, Sun, Grid3X3, Wand2, Save, RotateCcw, Clock, Film, User } from 'lucide-react';
import { useToast } from '../../../contexts/ToastContext';
import {
  ShotLanguage,
  ShotPreset,
  DEFAULT_SHOT_PRESETS,
  MONTAGE_TYPE_OPTIONS,
  migrateShotLanguage,
} from '../../../types/shotLanguage';
import { getAuthToken } from '../../../services/auth';
import CameraParametersPanel from './CameraParametersPanel';
import LightingParametersPanel from './LightingParametersPanel';

interface ShotLanguageEditorProps {
  storyboardId: number;
  initialValues?: ShotLanguage;
  onChange?: (values: ShotLanguage) => void;
  onSave?: (values: ShotLanguage) => void;
  compact?: boolean;
}

// 构图Tab使用的选项定义
const COMPOSITION_OPTIONS = {
  shotSize: [
    { value: 'extreme_close_up', label: '大特写', desc: '聚焦细节，如眼睛、手指' },
    { value: 'close_up', label: '特写', desc: '面部表情，情感表达' },
    { value: 'medium_close_up', label: '中近景', desc: '头部和肩部' },
    { value: 'medium_shot', label: '中景', desc: '上半身，常用对话镜头' },
    { value: 'medium_long_shot', label: '中全景', desc: '大部分身体' },
    { value: 'long_shot', label: '全景', desc: '完整人物' },
    { value: 'extreme_long_shot', label: '大远景', desc: '宏大场面' },
  ],
  axisPosition: [
    { value: 'left', label: '左侧', desc: '主体在轴线左侧' },
    { value: 'right', label: '右侧', desc: '主体在轴线右侧' },
    { value: 'on_axis', label: '轴线上', desc: '主体在轴线上' },
  ],
  screenDirection: [
    { value: 'left_to_right', label: '左→右', desc: '从左向右运动' },
    { value: 'right_to_left', label: '右→左', desc: '从右向左运动' },
    { value: 'towards_camera', label: '朝向镜头', desc: '向观众方向运动' },
    { value: 'away_from_camera', label: '远离镜头', desc: '远离观众方向运动' },
  ],
  transitionType: [
    { value: 'cut', label: '硬切', desc: '直接切换' },
    { value: 'fade', label: '淡入淡出', desc: '渐隐渐显' },
    { value: 'dissolve', label: '叠化', desc: '两镜头渐变' },
    { value: 'wipe', label: '划像', desc: '新画面推入' },
    { value: 'match_cut', label: '匹配剪辑', desc: '相似元素切换' },
  ],
  montageType: [
    { value: 'narrative', label: '叙事', desc: '按时间顺序讲述故事' },
    { value: 'expressive', label: '表现', desc: '镜头对比表达情感' },
    { value: 'cross_cutting', label: '交叉', desc: '多场景交替并行' },
    { value: 'metaphorical', label: '隐喻', desc: '镜头组合象征意义' },
    { value: 'accumulative', label: '积累', desc: '重复镜头强化主题' },
  ],
};

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

const ShotLanguageEditor: React.FC<ShotLanguageEditorProps> = ({
  storyboardId,
  initialValues = {},
  onChange,
  onSave,
  compact = false,
}) => {
  const { showToast } = useToast();
  const [values, setValues] = useState<ShotLanguage>(() => migrateShotLanguage(initialValues));
  const [saving, setSaving] = useState(false);
  const [showPresets, setShowPresets] = useState(false);
  const [activeTab, setActiveTab] = useState<string>('camera');

  // 同步外部初始值（带迁移）
  useEffect(() => {
    setValues(migrateShotLanguage(initialValues));
  }, [initialValues]);

  const handleChange = useCallback((field: keyof ShotLanguage, value: string | number | undefined) => {
    const newValues = { ...values, [field]: value || undefined };
    setValues(newValues);
    onChange?.(newValues);
  }, [values, onChange]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const token = getAuthToken();
      const res = await fetch(`/api/storyboards/${storyboardId}/shot-language`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(values),
      });

      const data = await res.json();
      if (data.success) {
        showToast('镜头参数已保存', 'success');
        onSave?.(values);
      } else {
        throw new Error(data.error);
      }
    } catch (error: any) {
      showToast(error.message || '保存失败', 'error');
    } finally {
      setSaving(false);
    }
  };

  const applyPreset = (preset: ShotPreset) => {
    const migrated = migrateShotLanguage(preset.shotLanguage);
    setValues(migrated);
    onChange?.(migrated);
    setShowPresets(false);
    showToast(`已应用预设: ${preset.name}`, 'success');
  };

  const resetValues = () => {
    setValues({});
    onChange?.({});
  };

  // 紧凑模式 - 仅显示景别+视角+焦距
  if (compact) {
    return (
      <div className="flex items-center gap-2 flex-wrap">
        <select
          className="bg-slate-800 border border-slate-700 rounded px-2 py-1 text-xs text-slate-200"
          value={values.shotSize || ''}
          onChange={(e) => handleChange('shotSize', e.target.value)}
        >
          <option value="">画面大小</option>
          {COMPOSITION_OPTIONS.shotSize.map((opt) => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>

        <select
          className="bg-slate-800 border border-slate-700 rounded px-2 py-1 text-xs text-slate-200"
          value={values.cameraHeight || ''}
          onChange={(e) => handleChange('cameraHeight', e.target.value)}
        >
          <option value="">视角</option>
          <option value="eye_level">平视</option>
          <option value="low_angle">仰视</option>
          <option value="high_angle">俯视</option>
          <option value="bird_eye">鸟瞰</option>
        </select>

        <select
          className="bg-slate-800 border border-slate-700 rounded px-2 py-1 text-xs text-slate-200"
          value={values.focalLength || ''}
          onChange={(e) => handleChange('focalLength', e.target.value)}
        >
          <option value="">焦距</option>
          <option value="ultra_wide">超广角</option>
          <option value="wide">广角</option>
          <option value="standard">标准</option>
          <option value="portrait">人像</option>
          <option value="telephoto">长焦</option>
          <option value="macro">微距</option>
        </select>

        <Input
          type="number"
          size="sm"
          placeholder="时长"
          value={values.shotDuration?.toString() || ''}
          onChange={(e) => handleChange('shotDuration', parseFloat(e.target.value) || undefined)}
          classNames={{ input: 'bg-slate-800 border-slate-700 w-16' }}
          endContent={<span className="text-xs text-slate-500">秒</span>}
        />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* 头部工具栏 */}
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-[var(--text-primary)] flex items-center gap-2">
          <Camera className="w-4 h-4" />
          镜头设置
        </h3>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="flat"
            className="bg-[var(--bg-input)] text-[var(--text-secondary)] border border-[var(--border-color)]"
            startContent={<Wand2 className="w-3 h-3" />}
            onPress={() => setShowPresets(!showPresets)}
          >
            快速预设
          </Button>
          <Button
            size="sm"
            variant="flat"
            className="bg-[var(--bg-input)] text-[var(--text-secondary)] border border-[var(--border-color)]"
            startContent={<RotateCcw className="w-3 h-3" />}
            onPress={resetValues}
          >
            清空
          </Button>
          <Button
            size="sm"
            className="pro-btn-primary"
            startContent={<Save className="w-3 h-3" />}
            onPress={handleSave}
            isLoading={saving}
          >
            保存
          </Button>
        </div>
      </div>

      {/* 预设面板 */}
      {showPresets && (
        <Card className="bg-[var(--bg-card)] border border-[var(--border-color)]">
          <CardBody className="p-3">
            <p className="text-xs text-[var(--text-muted)] mb-2">选择一个场景类型，快速应用推荐设置：</p>
            <div className="grid grid-cols-2 gap-2">
              {DEFAULT_SHOT_PRESETS.map((preset) => (
                <button
                  key={preset.id}
                  onClick={() => applyPreset(preset)}
                  className="text-left p-2 rounded bg-[var(--bg-input)] hover:bg-[var(--bg-card-hover)] border border-[var(--border-color)] transition-colors"
                >
                  <div className="text-xs font-medium text-[var(--text-primary)]">{preset.name}</div>
                  <div className="text-[10px] text-[var(--text-muted)]">{preset.description}</div>
                </button>
              ))}
            </div>
          </CardBody>
        </Card>
      )}

      {/* Tab式参数面板 */}
      <Tabs
        selectedKey={activeTab}
        onSelectionChange={(key) => setActiveTab(key as string)}
        variant="underlined"
        classNames={{
          tabList: 'gap-6 w-full relative p-0 border-b border-[var(--border-color)]',
          tab: 'text-[var(--text-muted)] data-[selected=true]:text-[var(--accent)] font-medium px-2 py-2',
          tabContent: 'group-data-[selected=true]:text-[var(--accent)]',
          cursor: 'bg-[var(--accent)]',
        }}
      >
        <Tab
          key="camera"
          title={
            <div className="flex items-center gap-1.5">
              <Camera className="w-3.5 h-3.5" />
              <span>摄像机</span>
            </div>
          }
        >
          <div className="pt-4">
            <CameraParametersPanel values={values} onChange={handleChange} />
          </div>
        </Tab>

        <Tab
          key="lighting"
          title={
            <div className="flex items-center gap-1.5">
              <Sun className="w-3.5 h-3.5" />
              <span>打光</span>
            </div>
          }
        >
          <div className="pt-4">
            <LightingParametersPanel values={values} onChange={handleChange} />
          </div>
        </Tab>

        <Tab
          key="composition"
          title={
            <div className="flex items-center gap-1.5">
              <Grid3X3 className="w-3.5 h-3.5" />
              <span>构图</span>
            </div>
          }
        >
          <div className="pt-4 space-y-5">
            {/* 景别 */}
            <div className="space-y-2">
              <label className="text-xs text-[var(--text-secondary)] font-medium">景别（画面大小）</label>
              <OptionGrid
                options={COMPOSITION_OPTIONS.shotSize}
                selected={values.shotSize}
                onSelect={(v) => handleChange('shotSize', v)}
                columns={4}
              />
            </div>

            {/* 轴线位置 */}
            <div className="space-y-2">
              <label className="text-xs text-[var(--text-secondary)] font-medium">轴线位置</label>
              <OptionGrid
                options={COMPOSITION_OPTIONS.axisPosition}
                selected={values.axisPosition}
                onSelect={(v) => handleChange('axisPosition', v)}
                columns={3}
              />
            </div>

            {/* 屏幕方向 */}
            <div className="space-y-2">
              <label className="text-xs text-[var(--text-secondary)] font-medium">屏幕方向</label>
              <OptionGrid
                options={COMPOSITION_OPTIONS.screenDirection}
                selected={values.screenDirection}
                onSelect={(v) => handleChange('screenDirection', v)}
                columns={4}
              />
            </div>

            {/* 转场效果 */}
            <div className="space-y-2">
              <label className="text-xs text-[var(--text-secondary)] font-medium">转场效果</label>
              <OptionGrid
                options={COMPOSITION_OPTIONS.transitionType}
                selected={values.transitionType}
                onSelect={(v) => handleChange('transitionType', v)}
                columns={3}
              />
            </div>

            {/* 时长 */}
            <div className="space-y-2">
              <label className="text-xs text-[var(--text-secondary)] font-medium flex items-center gap-1">
                <Clock className="w-3 h-3" /> 镜头时长
              </label>
              <Input
                type="number"
                size="sm"
                step="0.5"
                min="0.5"
                max="30"
                placeholder="秒"
                value={values.shotDuration?.toString() || ''}
                onChange={(e) => handleChange('shotDuration', parseFloat(e.target.value) || undefined)}
                classNames={{ inputWrapper: 'bg-[var(--bg-input)] border-[var(--border-color)]' }}
                endContent={<span className="text-xs text-[var(--text-muted)]">秒</span>}
              />
            </div>

            {/* 焦点位置 */}
            <div className="space-y-2">
              <label className="text-xs text-[var(--text-secondary)] font-medium">焦点位置</label>
              <Input
                size="sm"
                placeholder="描述焦点位置，如：角色左眼"
                value={values.focusPoint || ''}
                onChange={(e) => handleChange('focusPoint', e.target.value)}
                classNames={{ inputWrapper: 'bg-[var(--bg-input)] border-[var(--border-color)]' }}
              />
            </div>
          </div>
        </Tab>
      </Tabs>
    </div>
  );
};

export default ShotLanguageEditor;
