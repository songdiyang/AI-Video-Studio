/**
 * 镜头参数编辑器
 * 简洁易用的镜头参数设置组件
 */

import React, { useState, useEffect, useCallback } from 'react';
import { Button, Select, SelectItem, Input, Card, CardBody, Slider } from '@heroui/react';
import { Camera, Wand2, Save, RotateCcw, Clock } from 'lucide-react';
import { useToast } from '../../../contexts/ToastContext';
import { ShotLanguage, ShotPreset, DEFAULT_SHOT_PRESETS } from '../../../types/shotLanguage';
import { getAuthToken } from '../../../services/auth';

interface ShotLanguageEditorProps {
  storyboardId: number;
  initialValues?: ShotLanguage;
  onChange?: (values: ShotLanguage) => void;
  onSave?: (values: ShotLanguage) => void;
  compact?: boolean;
}

// 简化的选项定义
const SIMPLE_OPTIONS = {
  shotSize: [
    { value: 'extreme_close_up', label: '超近景', desc: '聚焦细节，如眼睛、手指' },
    { value: 'close_up', label: '近景', desc: '面部表情，情感表达' },
    { value: 'medium_close_up', label: '中近景', desc: '头部和肩部' },
    { value: 'medium', label: '中景', desc: '上半身，常用对话镜头' },
    { value: 'medium_long', label: '中远景', desc: '大部分身体' },
    { value: 'full', label: '全景', desc: '完整人物' },
    { value: 'long', label: '远景', desc: '人物与环境' },
    { value: 'extreme_long', label: '超远景', desc: '宏大场面' },
  ],
  cameraAngle: [
    { value: 'eye_level', label: '平视', desc: '自然、平等的视角' },
    { value: 'low', label: '仰视', desc: '使人物显得高大、威严' },
    { value: 'high', label: '俯视', desc: '使人物显得渺小、脆弱' },
    { value: 'birds_eye', label: '鸟瞰', desc: '从上方俯瞰全局' },
  ],
  movement: [
    { value: 'static', label: '固定', desc: '镜头保持不动' },
    { value: 'pan', label: '横摇', desc: '镜头左右转动' },
    { value: 'tilt', label: '纵摇', desc: '镜头上下转动' },
    { value: 'zoom_in', label: '推近', desc: '逐渐放大' },
    { value: 'zoom_out', label: '拉远', desc: '逐渐缩小' },
    { value: 'dolly', label: '推拉', desc: '镜头前后移动' },
    { value: 'tracking', label: '跟踪', desc: '跟随人物移动' },
  ],
  mood: [
    { value: 'bright', label: '明亮', desc: '阳光、温暖、积极' },
    { value: 'dark', label: '暗调', desc: '神秘、压抑、紧张' },
    { value: 'warm', label: '暖色', desc: '温馨、浪漫' },
    { value: 'cool', label: '冷色', desc: '冷静、疏离' },
    { value: 'dramatic', label: '戏剧性', desc: '强烈明暗对比' },
    { value: 'soft', label: '柔和', desc: '均匀柔光' },
  ],
  transition: [
    { value: 'cut', label: '硬切', desc: '直接切换' },
    { value: 'fade', label: '淡入淡出', desc: '渐隐渐显' },
    { value: 'dissolve', label: '叠化', desc: '两镜头渐变' },
    { value: 'wipe', label: '划变', desc: '新画面推入' },
  ],
};

const ShotLanguageEditor: React.FC<ShotLanguageEditorProps> = ({
  storyboardId,
  initialValues = {},
  onChange,
  onSave,
  compact = false,
}) => {
  const { showToast } = useToast();
  const [values, setValues] = useState<ShotLanguage>(initialValues);
  const [saving, setSaving] = useState(false);
  const [showPresets, setShowPresets] = useState(false);

  // 同步外部初始值
  useEffect(() => {
    setValues(initialValues);
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
    setValues(preset.shotLanguage);
    onChange?.(preset.shotLanguage);
    setShowPresets(false);
    showToast(`已应用预设: ${preset.name}`, 'success');
  };

  const resetValues = () => {
    setValues({});
    onChange?.({});
  };

  // 紧凑模式 - 仅显示关键参数
  if (compact) {
    return (
      <div className="flex items-center gap-2 flex-wrap">
        <Select
          size="sm"
          placeholder="画面大小"
          selectedKeys={values.shotSize ? [values.shotSize] : []}
          onChange={(e) => handleChange('shotSize', e.target.value)}
          classNames={{ trigger: 'bg-slate-800 border-slate-700 w-24' }}
        >
          {SIMPLE_OPTIONS.shotSize.map((opt) => (
            <SelectItem key={opt.value}>{opt.label}</SelectItem>
          ))}
        </Select>

        <Select
          size="sm"
          placeholder="视角"
          selectedKeys={values.cameraHeight ? [values.cameraHeight] : []}
          onChange={(e) => handleChange('cameraHeight', e.target.value)}
          classNames={{ trigger: 'bg-slate-800 border-slate-700 w-20' }}
        >
          {SIMPLE_OPTIONS.cameraAngle.map((opt) => (
            <SelectItem key={opt.value}>{opt.label}</SelectItem>
          ))}
        </Select>

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

      {/* 简洁参数设置 */}
      <div className="space-y-4">
        {/* 画面大小 */}
        <div className="space-y-2">
          <label className="text-xs text-[var(--text-secondary)] font-medium">画面大小（人物占画面比例）</label>
          <div className="grid grid-cols-4 gap-1.5">
            {SIMPLE_OPTIONS.shotSize.map((opt) => (
              <button
                key={opt.value}
                onClick={() => handleChange('shotSize', opt.value)}
                className={`p-2 rounded text-center transition-colors border ${
                  values.shotSize === opt.value
                    ? 'bg-[var(--accent)] text-white border-[var(--accent)]'
                    : 'bg-[var(--bg-input)] text-[var(--text-primary)] border-[var(--border-color)] hover:border-[var(--accent)]/50 hover:bg-[var(--bg-card-hover)]'
                }`}
              >
                <div className="text-xs font-medium">{opt.label}</div>
              </button>
            ))}
          </div>
        </div>

        {/* 视角 */}
        <div className="space-y-2">
          <label className="text-xs text-[var(--text-secondary)] font-medium">视角（摄像机高度）</label>
          <div className="grid grid-cols-4 gap-1.5">
            {SIMPLE_OPTIONS.cameraAngle.map((opt) => (
              <button
                key={opt.value}
                onClick={() => handleChange('cameraHeight', opt.value)}
                className={`p-2 rounded text-center transition-colors border ${
                  values.cameraHeight === opt.value
                    ? 'bg-[var(--accent)] text-white border-[var(--accent)]'
                    : 'bg-[var(--bg-input)] text-[var(--text-primary)] border-[var(--border-color)] hover:border-[var(--accent)]/50 hover:bg-[var(--bg-card-hover)]'
                }`}
              >
                <div className="text-xs font-medium">{opt.label}</div>
                <div className="text-[10px] text-[var(--text-muted)]">{opt.desc}</div>
              </button>
            ))}
          </div>
        </div>

        {/* 镜头运动 */}
        <div className="space-y-2">
          <label className="text-xs text-[var(--text-secondary)] font-medium">镜头运动</label>
          <div className="grid grid-cols-4 gap-1.5">
            {SIMPLE_OPTIONS.movement.slice(0, 4).map((opt) => (
              <button
                key={opt.value}
                onClick={() => handleChange('cameraMovement', opt.value)}
                className={`p-2 rounded text-center transition-colors border ${
                  values.cameraMovement === opt.value
                    ? 'bg-[var(--accent)] text-white border-[var(--accent)]'
                    : 'bg-[var(--bg-input)] text-[var(--text-primary)] border-[var(--border-color)] hover:border-[var(--accent)]/50 hover:bg-[var(--bg-card-hover)]'
                }`}
              >
                <div className="text-xs font-medium">{opt.label}</div>
              </button>
            ))}
          </div>
          <div className="grid grid-cols-3 gap-1.5">
            {SIMPLE_OPTIONS.movement.slice(4).map((opt) => (
              <button
                key={opt.value}
                onClick={() => handleChange('cameraMovement', opt.value)}
                className={`p-2 rounded text-center transition-colors border ${
                  values.cameraMovement === opt.value
                    ? 'bg-[var(--accent)] text-white border-[var(--accent)]'
                    : 'bg-[var(--bg-input)] text-[var(--text-primary)] border-[var(--border-color)] hover:border-[var(--accent)]/50 hover:bg-[var(--bg-card-hover)]'
                }`}
              >
                <div className="text-xs font-medium">{opt.label}</div>
              </button>
            ))}
          </div>
        </div>

        {/* 氛围与时长 */}
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <label className="text-xs text-[var(--text-secondary)] font-medium">画面氛围</label>
            <Select
              size="sm"
              placeholder="选择氛围..."
              selectedKeys={values.lightingMood ? [values.lightingMood] : []}
              onChange={(e) => handleChange('lightingMood', e.target.value)}
              classNames={{ trigger: 'bg-[var(--bg-input)] border-[var(--border-color)]' }}
            >
              {SIMPLE_OPTIONS.mood.map((opt) => (
                <SelectItem key={opt.value}>{opt.label} - {opt.desc}</SelectItem>
              ))}
            </Select>
          </div>

          <div className="space-y-2">
            <label className="text-xs text-[var(--text-secondary)] font-medium flex items-center gap-1">
              <Clock className="w-3 h-3" /> 时长
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
        </div>

        {/* 转场 */}
        <div className="space-y-2">
          <label className="text-xs text-[var(--text-secondary)] font-medium">转场效果</label>
          <div className="grid grid-cols-4 gap-1.5">
            {SIMPLE_OPTIONS.transition.map((opt) => (
              <button
                key={opt.value}
                onClick={() => handleChange('transitionType', opt.value)}
                className={`p-2 rounded text-center transition-colors border ${
                  values.transitionType === opt.value
                    ? 'bg-[var(--accent)] text-white border-[var(--accent)]'
                    : 'bg-[var(--bg-input)] text-[var(--text-primary)] border-[var(--border-color)] hover:border-[var(--accent)]/50 hover:bg-[var(--bg-card-hover)]'
                }`}
              >
                <div className="text-xs font-medium">{opt.label}</div>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default ShotLanguageEditor;
