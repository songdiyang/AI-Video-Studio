import React, { useState, useMemo, useCallback, useEffect } from 'react';
import { Button, Input, Textarea, Select, SelectItem, Modal, ModalContent, ModalHeader, ModalBody, ModalFooter, Switch, Chip, Checkbox, Tooltip } from '@heroui/react';
import { Code2, Sparkles, AlertCircle, CheckCircle, ChevronDown, ChevronUp, Film, Clock, Monitor, Plus, Trash2, Settings2, DollarSign, Sliders } from 'lucide-react';
import { AIModel, ModelFormData, TEMPLATE_PRESETS, ASPECT_RATIO_PRESETS, DURATION_PRESETS, VIDEO_RESOLUTION_PRESETS, IMAGE_RESOLUTION_PRESETS, TemplatePreset } from './types';

interface ModelFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  editingModel: AIModel | null;
  formData: ModelFormData;
  setFormData: (data: ModelFormData) => void;
  onSave: () => void;
}

// JSON 验证 Hook
function useJsonValidation(value: string, label: string) {
  return useMemo(() => {
    if (!value || value.trim() === '' || value.trim() === 'null') return { valid: true, error: '' };
    try {
      JSON.parse(value);
      return { valid: true, error: '' };
    } catch (e: any) {
      return { valid: false, error: `${label} JSON 格式错误: ${e.message}` };
    }
  }, [value, label]);
}

// JSON 字段编辑器（带验证）
const JsonField: React.FC<{
  label: string;
  value: string;
  onChange: (val: string) => void;
  placeholder?: string;
  description?: string;
  minRows?: number;
  isRequired?: boolean;
}> = ({ label, value, onChange, placeholder, description, minRows = 3, isRequired }) => {
  const validation = useJsonValidation(value, label);

  return (
    <div className="relative">
      <Textarea
        label={
          <span className="flex items-center gap-2">
            {label}
            {!validation.valid && (
              <Tooltip content={validation.error}>
                <AlertCircle className="w-3.5 h-3.5 text-red-400" />
              </Tooltip>
            )}
            {validation.valid && value.trim() && value.trim() !== '{}' && value.trim() !== '[]' && (
              <CheckCircle className="w-3.5 h-3.5 text-green-400" />
            )}
          </span>
        }
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        minRows={minRows}
        description={description}
        isRequired={isRequired}
        classNames={{
          input: "font-mono text-xs",
          inputWrapper: !validation.valid ? "border-red-500/50 bg-red-500/5" : undefined
        }}
      />
    </div>
  );
};

// ============================================================
// 可视化计费配置编辑器
// ============================================================
const PRICE_TYPES = [
  { value: 'input_tokens', label: '输入 Tokens' },
  { value: 'output_tokens', label: '输出 Tokens' },
  { value: 'total_tokens', label: '总 Tokens' },
  { value: 'duration_seconds', label: '时长(秒)' },
  { value: 'request_count', label: '请求次数' },
  { value: 'item_count', label: '生成数量' },
];
const PRICE_UNITS = [
  { value: 'per_million_tokens', label: '每百万 Tokens' },
  { value: 'per_token', label: '每 Token' },
  { value: 'per_second', label: '每秒' },
  { value: 'per_request', label: '每次请求' },
  { value: 'per_image', label: '每张图片' },
  { value: 'per_item', label: '每个' },
];

interface PriceComponent { type: string; unit: string; price: number; }
interface PriceConfigData { currency: string; charge_on_failure: boolean; components: PriceComponent[]; }

const VisualPriceConfigEditor: React.FC<{
  value: string;
  onChange: (val: string) => void;
}> = ({ value, onChange }) => {
  const config = useMemo<PriceConfigData>(() => {
    try {
      const parsed = JSON.parse(value);
      if (!parsed || typeof parsed !== 'object') throw new Error();
      return {
        currency: parsed.currency || 'CNY',
        charge_on_failure: !!parsed.charge_on_failure,
        components: Array.isArray(parsed.components) ? parsed.components : [],
      };
    } catch {
      return { currency: 'CNY', charge_on_failure: false, components: [] };
    }
  }, [value]);

  const emit = (updated: PriceConfigData) => {
    onChange(JSON.stringify(updated, null, 2));
  };

  const updateComponent = (idx: number, field: keyof PriceComponent, val: string | number) => {
    const comps = [...config.components];
    comps[idx] = { ...comps[idx], [field]: val };
    emit({ ...config, components: comps });
  };

  const addComponent = () => {
    emit({ ...config, components: [...config.components, { type: 'total_tokens', unit: 'per_million_tokens', price: 0 }] });
  };

  const removeComponent = (idx: number) => {
    emit({ ...config, components: config.components.filter((_, i) => i !== idx) });
  };

  return (
    <div className="bg-slate-800/30 border border-slate-700/50 rounded-lg p-4 space-y-3">
      <h4 className="text-sm font-semibold text-slate-200 flex items-center gap-2">
        <DollarSign className="w-4 h-4 text-amber-400" />
        计费配置
      </h4>

      <div className="grid grid-cols-2 gap-3">
        <Select
          label="币种"
          size="sm"
          selectedKeys={[config.currency]}
          onChange={(e) => emit({ ...config, currency: e.target.value || 'CNY' })}
        >
          <SelectItem key="CNY">CNY (人民币)</SelectItem>
          <SelectItem key="USD">USD (美元)</SelectItem>
        </Select>
        <div className="flex items-center pt-4">
          <Checkbox
            size="sm"
            isSelected={config.charge_on_failure}
            onValueChange={(v) => emit({ ...config, charge_on_failure: v })}
          >
            <span className="text-sm text-slate-300">失败也计费</span>
          </Checkbox>
        </div>
      </div>

      {/* 计费项列表 */}
      <div className="space-y-2">
        <label className="text-xs font-medium text-slate-400">计费项目</label>
        {config.components.map((comp, idx) => (
          <div key={idx} className="flex items-center gap-2 bg-slate-800/50 rounded-lg p-2">
            <Select
              size="sm"
              className="flex-1"
              label="类型"
              selectedKeys={[comp.type]}
              onChange={(e) => updateComponent(idx, 'type', e.target.value)}
            >
              {PRICE_TYPES.map((t) => <SelectItem key={t.value}>{t.label}</SelectItem>)}
            </Select>
            <Select
              size="sm"
              className="flex-1"
              label="单位"
              selectedKeys={[comp.unit]}
              onChange={(e) => updateComponent(idx, 'unit', e.target.value)}
            >
              {PRICE_UNITS.map((u) => <SelectItem key={u.value}>{u.label}</SelectItem>)}
            </Select>
            <Input
              size="sm"
              className="w-28"
              type="number"
              label="单价"
              value={String(comp.price ?? '')}
              onChange={(e) => updateComponent(idx, 'price', parseFloat(e.target.value) || 0)}
            />
            <Button
              isIconOnly
              size="sm"
              variant="light"
              className="text-red-400 hover:text-red-300 mt-2"
              onPress={() => removeComponent(idx)}
            >
              <Trash2 className="w-3.5 h-3.5" />
            </Button>
          </div>
        ))}
        <Button
          size="sm"
          variant="flat"
          className="bg-slate-800/60 text-slate-300 hover:bg-slate-700"
          startContent={<Plus className="w-3.5 h-3.5" />}
          onPress={addComponent}
        >
          添加计费项
        </Button>
      </div>
    </div>
  );
};

// ============================================================
// 可视化 Key-Value 默认参数编辑器
// ============================================================
const COMMON_PARAM_PRESETS = [
  { key: 'temperature', value: 0.7, label: 'temperature' },
  { key: 'maxTokens', value: 8000, label: 'maxTokens' },
  { key: 'top_p', value: 0.9, label: 'top_p' },
];

const VisualKeyValueEditor: React.FC<{
  value: string;
  onChange: (val: string) => void;
  title?: string;
  icon?: React.ReactNode;
  presets?: { key: string; value: any; label: string }[];
}> = ({ value, onChange, title = '默认参数', icon, presets = COMMON_PARAM_PRESETS }) => {
  // 使用本地状态存储正在编辑的条目（包括空 key）
  const [localEntries, setLocalEntries] = useState<[string, any][]>([]);

  // 初始化或外部 value 变化时同步
  useEffect(() => {
    try {
      const parsed = JSON.parse(value);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        setLocalEntries(Object.entries(parsed));
      } else {
        setLocalEntries([]);
      }
    } catch {
      setLocalEntries([]);
    }
  }, [value]);

  const entries = localEntries;

  const emit = (newEntries: [string, any][]) => {
    setLocalEntries(newEntries);
    // 只同步有效的条目到父组件
    const obj: Record<string, any> = {};
    for (const [k, v] of newEntries) {
      if (k.trim()) obj[k.trim()] = v;
    }
    onChange(JSON.stringify(obj, null, 2));
  };

  const updateEntry = (idx: number, field: 'key' | 'value', val: string) => {
    const arr = [...entries];
    if (field === 'key') {
      arr[idx] = [val, arr[idx][1]];
    } else {
      // 尝试解析为数字/布尔
      let parsed: any = val;
      if (val === 'true') parsed = true;
      else if (val === 'false') parsed = false;
      else if (val !== '' && !isNaN(Number(val))) parsed = Number(val);
      arr[idx] = [arr[idx][0], parsed];
    }
    emit(arr);
  };

  const addEntry = () => emit([...entries, ['', '']]);
  const removeEntry = (idx: number) => emit(entries.filter((_, i) => i !== idx));

  const addPreset = (preset: { key: string; value: any }) => {
    if (entries.some(([k]) => k === preset.key)) return;
    emit([...entries, [preset.key, preset.value]]);
  };

  return (
    <div className="bg-slate-800/30 border border-slate-700/50 rounded-lg p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-semibold text-slate-200 flex items-center gap-2">
          {icon || <Sliders className="w-4 h-4 text-cyan-400" />}
          {title}
        </h4>
        {presets.length > 0 && (
          <div className="flex items-center gap-1">
            <span className="text-xs text-slate-500 mr-1">快捷添加:</span>
            {presets.map((p) => (
              <Chip
                key={p.key}
                size="sm"
                className={`cursor-pointer text-xs transition-all ${
                  entries.some(([k]) => k === p.key)
                    ? 'bg-slate-700/50 text-slate-500 cursor-default'
                    : 'bg-cyan-500/10 text-cyan-400 border-cyan-500/30 hover:bg-cyan-500/20 border'
                }`}
                onClick={() => addPreset(p)}
              >
                {p.label}
              </Chip>
            ))}
          </div>
        )}
      </div>

      <div className="space-y-2">
        {entries.map(([k, v], idx) => (
          <div key={idx} className="flex items-center gap-2">
            <Input
              size="sm"
              className="flex-1"
              placeholder="参数名"
              value={k}
              onChange={(e) => updateEntry(idx, 'key', e.target.value)}
              classNames={{ input: 'font-mono text-xs' }}
            />
            <Input
              size="sm"
              className="flex-1"
              placeholder="参数值"
              value={String(v ?? '')}
              onChange={(e) => updateEntry(idx, 'value', e.target.value)}
              classNames={{ input: 'font-mono text-xs' }}
            />
            <Button
              isIconOnly
              size="sm"
              variant="light"
              className="text-red-400 hover:text-red-300"
              onPress={() => removeEntry(idx)}
            >
              <Trash2 className="w-3.5 h-3.5" />
            </Button>
          </div>
        ))}
        {entries.length === 0 && (
          <p className="text-xs text-slate-500 italic py-1">暂无参数，点击下方按钮或快捷标签添加</p>
        )}
        <Button
          size="sm"
          variant="flat"
          className="bg-slate-800/60 text-slate-300 hover:bg-slate-700"
          startContent={<Plus className="w-3.5 h-3.5" />}
          onPress={addEntry}
        >
          添加参数
        </Button>
      </div>
    </div>
  );
};

// ============================================================
// 可视化长宽比 / 时长 / 分辨率选择器（保持不变）
// ============================================================
const VisualAspectRatioSelector: React.FC<{
  value: string;
  onChange: (val: string) => void;
}> = ({ value, onChange }) => {
  const selected = useMemo(() => {
    try { return JSON.parse(value) || []; } catch { return []; }
  }, [value]);

  const toggleRatio = (ratio: string) => {
    const arr = [...selected];
    const idx = arr.indexOf(ratio);
    if (idx >= 0) arr.splice(idx, 1);
    else arr.push(ratio);
    onChange(JSON.stringify(arr, null, 2));
  };

  return (
    <div>
      <label className="text-sm font-medium text-slate-300 mb-2 flex items-center gap-2">
        <Film className="w-4 h-4 text-purple-400" />
        支持的长宽比
      </label>
      <div className="flex flex-wrap gap-2">
        {ASPECT_RATIO_PRESETS.map((preset) => (
          <Chip
            key={preset.value}
            className={`cursor-pointer transition-all ${
              selected.includes(preset.value)
                ? 'bg-purple-500/20 text-purple-300 border-purple-500/50'
                : 'bg-slate-800/60 text-slate-400 border-slate-600/50 hover:border-purple-500/30'
            } border`}
            onClick={() => toggleRatio(preset.value)}
          >
            {preset.label}
          </Chip>
        ))}
      </div>
      <p className="text-xs text-slate-500 mt-1">点击添加或移除长宽比选项</p>
    </div>
  );
};

const VisualDurationSelector: React.FC<{
  value: string;
  onChange: (val: string) => void;
}> = ({ value, onChange }) => {
  const selected = useMemo(() => {
    try { return JSON.parse(value) || []; } catch { return []; }
  }, [value]);

  const toggleDuration = (dur: number) => {
    const arr = [...selected];
    const idx = arr.indexOf(dur);
    if (idx >= 0) arr.splice(idx, 1);
    else arr.push(dur);
    arr.sort((a: number, b: number) => a - b);
    onChange(JSON.stringify(arr, null, 2));
  };

  return (
    <div>
      <label className="text-sm font-medium text-slate-300 mb-2 flex items-center gap-2">
        <Clock className="w-4 h-4 text-blue-400" />
        支持的视频时长
      </label>
      <div className="flex flex-wrap gap-2">
        {DURATION_PRESETS.map((preset) => (
          <Chip
            key={preset.value}
            className={`cursor-pointer transition-all ${
              selected.includes(preset.value)
                ? 'bg-blue-500/20 text-blue-300 border-blue-500/50'
                : 'bg-slate-800/60 text-slate-400 border-slate-600/50 hover:border-blue-500/30'
            } border`}
            onClick={() => toggleDuration(preset.value)}
          >
            {preset.label}
          </Chip>
        ))}
      </div>
      <p className="text-xs text-slate-500 mt-1">点击添加或移除时长选项</p>
    </div>
  );
};

const VisualResolutionSelector: React.FC<{
  value: string;
  onChange: (val: string) => void;
  category?: string;
}> = ({ value, onChange, category }) => {
  const selected = useMemo(() => {
    try { return JSON.parse(value) || []; } catch { return []; }
  }, [value]);

  const toggleRes = (res: string) => {
    const arr = [...selected];
    const idx = arr.indexOf(res);
    if (idx >= 0) arr.splice(idx, 1);
    else arr.push(res);
    onChange(JSON.stringify(arr, null, 2));
  };

  const isImage = category === 'IMAGE';
  const presets: Array<{ label: string; value: string }> = isImage ? IMAGE_RESOLUTION_PRESETS : VIDEO_RESOLUTION_PRESETS;

  return (
    <div>
      <label className="text-sm font-medium text-slate-300 mb-2 flex items-center gap-2">
        <Monitor className="w-4 h-4 text-emerald-400" />
        {isImage ? '支持的清晰度' : '支持的分辨率'}
      </label>
      <div className="flex flex-wrap gap-2">
        {presets.map((preset) => (
          <Chip
            key={preset.value}
            className={`cursor-pointer transition-all ${
              selected.includes(preset.value)
                ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/50'
                : 'bg-slate-800/60 text-slate-400 border-slate-600/50 hover:border-emerald-500/30'
            } border`}
            onClick={() => toggleRes(preset.value)}
          >
            {preset.label}{!isImage && 'width' in preset ? ` (${(preset as any).width}×${(preset as any).height})` : ''}
          </Chip>
        ))}
      </div>
      <p className="text-xs text-slate-500 mt-1">点击添加或移除{isImage ? '清晰度' : '分辨率'}选项</p>
    </div>
  );
};

// ============================================================
// 模板预设选择器（保持不变）
// ============================================================
const TemplatePresetSelector: React.FC<{
  onApply: (preset: TemplatePreset) => void;
  category: string;
}> = ({ onApply, category }) => {
  const [expanded, setExpanded] = useState(false);
  const filteredPresets = TEMPLATE_PRESETS.filter(p => !category || p.category === category || category === 'TEXT');
  const allPresets = category ? TEMPLATE_PRESETS : TEMPLATE_PRESETS;

  return (
    <div className="bg-gradient-to-r from-purple-500/5 to-blue-500/5 border border-purple-500/20 rounded-lg p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-purple-400" />
          <span className="text-sm font-semibold text-slate-200">快速模板</span>
          <span className="text-xs text-slate-500">选择预设模板快速填充配置</span>
        </div>
        <Button
          size="sm"
          variant="light"
          className="text-slate-400 text-xs"
          onPress={() => setExpanded(!expanded)}
          endContent={expanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
        >
          {expanded ? '收起' : `查看全部 (${allPresets.length})`}
        </Button>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
        {(expanded ? allPresets : filteredPresets.slice(0, 4)).map((preset, idx) => (
          <div
            key={idx}
            className="flex items-center justify-between bg-slate-800/40 border border-slate-700/50 rounded-lg p-3 hover:border-purple-500/30 hover:bg-slate-800/60 transition-all cursor-pointer group"
            onClick={() => onApply(preset)}
          >
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-slate-200 truncate">{preset.name}</span>
                <Chip size="sm" className={`text-xs ${
                  preset.category === 'TEXT' ? 'bg-blue-500/10 text-blue-400' :
                  preset.category === 'IMAGE' ? 'bg-purple-500/10 text-purple-400' :
                  preset.category === 'VIDEO' ? 'bg-pink-500/10 text-pink-400' :
                  preset.category === 'MULTIMODAL' ? 'bg-emerald-500/10 text-emerald-400' :
                  'bg-amber-500/10 text-amber-400'
                }`}>
                  {preset.category}
                </Chip>
              </div>
              <p className="text-xs text-slate-500 mt-0.5 truncate">{preset.description}</p>
            </div>
            <Button
              size="sm"
              variant="flat"
              className="bg-purple-500/10 text-purple-400 opacity-0 group-hover:opacity-100 transition-opacity ml-2 shrink-0"
            >
              应用
            </Button>
          </div>
        ))}
      </div>
    </div>
  );
};

// ============================================================
// 可折叠区域
// ============================================================
const CollapsibleSection: React.FC<{
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
  icon?: React.ReactNode;
}> = ({ title, subtitle, children, defaultOpen = false, icon }) => {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border-t border-slate-700/50 pt-4 mt-4">
      <div
        className="flex items-center justify-between cursor-pointer group"
        onClick={() => setOpen(!open)}
      >
        <div className="flex items-center gap-2">
          {icon}
          <div>
            <h4 className="font-semibold text-slate-300">{title}</h4>
            {subtitle && <p className="text-xs text-slate-500">{subtitle}</p>}
          </div>
        </div>
        {open ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
      </div>
      {open && <div className="mt-3 space-y-4">{children}</div>}
    </div>
  );
};

// ============================================================
// 主组件
// ============================================================
const ModelFormModal: React.FC<ModelFormModalProps> = ({
  isOpen,
  onClose,
  editingModel,
  formData,
  setFormData,
  onSave
}) => {
  const [jsonErrors, setJsonErrors] = useState<string[]>([]);

  // 验证所有 JSON 字段
  const validateAllJson = useCallback(() => {
    const errors: string[] = [];
    const jsonFields = [
      { key: 'price_config', label: '计费配置', allowNull: true },
      { key: 'headers_template', label: 'Headers 模板' },
      { key: 'body_template', label: 'Body 模板' },
      { key: 'default_params', label: '默认参数' },
      { key: 'response_mapping', label: '响应映射' },
      { key: 'supported_aspect_ratios', label: '长宽比' },
      { key: 'supported_durations', label: '时长' },
      { key: 'supported_resolutions', label: '分辨率' },
      { key: 'query_headers_template', label: '查询 Headers' },
      { key: 'query_body_template', label: '查询 Body' },
      { key: 'query_response_mapping', label: '查询响应映射' },
      { key: 'query_success_mapping', label: '成功结果映射' },
      { key: 'query_fail_mapping', label: '失败错误映射' },
    ];

    for (const field of jsonFields) {
      const val = (formData as any)[field.key];
      if (!val || val.trim() === '' || (field.allowNull && val.trim() === 'null')) continue;
      try {
        JSON.parse(val);
      } catch (e: any) {
        errors.push(`${field.label}: ${e.message}`);
      }
    }
    setJsonErrors(errors);
    return errors.length === 0;
  }, [formData]);

  const handleSave = () => {
    if (validateAllJson()) {
      onSave();
    }
  };

  // 应用模板预设
  const handleApplyPreset = (preset: TemplatePreset) => {
    const newData = { ...formData };
    if (preset.config.category) newData.category = preset.config.category;
    
    const fields = Object.keys(preset.config) as (keyof ModelFormData)[];
    for (const key of fields) {
      if (preset.config[key] !== undefined) {
        (newData as any)[key] = preset.config[key];
      }
    }
    setFormData(newData);
  };

  const isVideoOrImage = formData.category === 'VIDEO' || formData.category === 'IMAGE';
  const isVideo = formData.category === 'VIDEO';

  // 判断高级设置区域是否应默认展开（有配置内容时展开）
  const hasAdvancedContent = !!(formData.query_url_template || formData.custom_handler || formData.billing_handler);

  return (
    <Modal isOpen={isOpen} onClose={onClose} size="5xl" scrollBehavior="inside" classNames={{ base: "bg-slate-900/95 backdrop-blur-xl border border-slate-700/50" }}>
      <ModalContent>
        <ModalHeader className="text-xl font-bold text-slate-100">
          <span>{editingModel ? '编辑模型' : '添加模型'}</span>
        </ModalHeader>
        <ModalBody className="space-y-4">
          {/* JSON 验证错误提示 */}
          {jsonErrors.length > 0 && (
            <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3">
              <div className="flex items-center gap-2 mb-1">
                <AlertCircle className="w-4 h-4 text-red-400" />
                <span className="text-sm font-medium text-red-400">JSON 格式错误</span>
              </div>
              {jsonErrors.map((err, idx) => (
                <p key={idx} className="text-xs text-red-300 ml-6">{err}</p>
              ))}
            </div>
          )}

          {/* 模板预设区域 */}
          {!editingModel && (
            <TemplatePresetSelector
              onApply={handleApplyPreset}
              category={formData.category}
            />
          )}

          {/* 基础信息 */}
          <div className="grid grid-cols-2 gap-4">
            <Input
              label="模型名称"
              placeholder="如: GPT-4o"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              isRequired
            />
            <Input
              label="厂商标识"
              placeholder="如: openai"
              value={formData.provider}
              onChange={(e) => setFormData({ ...formData, provider: e.target.value })}
              isRequired
            />
          </div>

          <div className="grid grid-cols-3 gap-4">
            <Select
              label="分类"
              selectedKeys={[formData.category]}
              onChange={(e) => setFormData({ ...formData, category: e.target.value as any })}
              isRequired
            >
              <SelectItem key="TEXT">TEXT (文本)</SelectItem>
              <SelectItem key="IMAGE">IMAGE (图像)</SelectItem>
              <SelectItem key="VIDEO">VIDEO (视频)</SelectItem>
              <SelectItem key="AUDIO">AUDIO (音频)</SelectItem>
              <SelectItem key="MULTIMODAL">MULTIMODAL (多模态)</SelectItem>
            </Select>

            <Select
              label="状态"
              selectedKeys={[String(formData.is_active)]}
              onChange={(e) => setFormData({ ...formData, is_active: parseInt(e.target.value) })}
            >
              <SelectItem key="1">启用</SelectItem>
              <SelectItem key="0">禁用</SelectItem>
            </Select>

            <Select
              label="请求方法"
              selectedKeys={[formData.request_method]}
              onChange={(e) => setFormData({ ...formData, request_method: e.target.value })}
            >
              <SelectItem key="GET">GET</SelectItem>
              <SelectItem key="POST">POST</SelectItem>
              <SelectItem key="PUT">PUT</SelectItem>
              <SelectItem key="DELETE">DELETE</SelectItem>
            </Select>
          </div>

          <Textarea
            label="描述"
            placeholder="模型描述信息"
            value={formData.description}
            onChange={(e) => setFormData({ ...formData, description: e.target.value })}
            minRows={2}
          />

          <Input
            label="API Key"
            type="password"
            placeholder="留空则从环境变量获取"
            value={formData.api_key}
            onChange={(e) => setFormData({ ...formData, api_key: e.target.value })}
            description="优先使用此处配置的 API Key，留空则使用环境变量"
          />

          {/* URL 模板 */}
          <Input
            label="URL 模板"
            placeholder="https://api.example.com/v1/{{action}}"
            value={formData.url_template}
            onChange={(e) => setFormData({ ...formData, url_template: e.target.value })}
            isRequired
          />

          {/* 计费配置 - 可视化编辑器 */}
          <VisualPriceConfigEditor
            value={formData.price_config}
            onChange={(val) => setFormData({ ...formData, price_config: val })}
          />

          {/* 默认参数 - 可视化编辑器 */}
          <VisualKeyValueEditor
            value={formData.default_params}
            onChange={(val) => setFormData({ ...formData, default_params: val })}
          />

          {/* 视频/图像专用参数 - 始终可视化 */}
          {isVideoOrImage && (
            <div className="bg-slate-800/30 border border-slate-700/50 rounded-lg p-4 space-y-4">
              <h4 className="text-sm font-semibold text-slate-200 flex items-center gap-2">
                <Film className="w-4 h-4 text-pink-400" />
                {isVideo ? '视频生成参数配置' : '图像生成参数配置'}
              </h4>
              
              <VisualAspectRatioSelector
                value={formData.supported_aspect_ratios}
                onChange={(val) => setFormData({ ...formData, supported_aspect_ratios: val })}
              />

              {isVideo && (
                <VisualDurationSelector
                  value={formData.supported_durations}
                  onChange={(val) => setFormData({ ...formData, supported_durations: val })}
                />
              )}
              <VisualResolutionSelector
                value={formData.supported_resolutions}
                onChange={(val) => setFormData({ ...formData, supported_resolutions: val })}
                category={formData.category}
              />
            </div>
          )}

          {/* ============================================================ */}
          {/*  高级设置 (折叠区)                                           */}
          {/* ============================================================ */}
          <CollapsibleSection
            title="高级设置"
            subtitle="Headers / Body 模板、响应映射、查询配置、自定义 Handler 等"
            defaultOpen={hasAdvancedContent}
            icon={<Settings2 className="w-4 h-4 text-amber-400" />}
          >
            {/* API 请求模板 */}
            <JsonField
              label="Headers 模板 (JSON)"
              placeholder='{"Authorization": "Bearer {{apiKey}}"}'
              value={formData.headers_template}
              onChange={(val) => setFormData({ ...formData, headers_template: val })}
              minRows={3}
              isRequired
            />

            <JsonField
              label="Body 模板 (JSON)"
              placeholder='{"prompt": "{{prompt}}"}'
              value={formData.body_template}
              onChange={(val) => setFormData({ ...formData, body_template: val })}
              minRows={3}
            />

            <JsonField
              label="响应映射 (JSON)"
              placeholder='{"taskId": "data.id"}'
              value={formData.response_mapping}
              onChange={(val) => setFormData({ ...formData, response_mapping: val })}
              minRows={3}
              isRequired
              description='统一不同厂商的返回格式。如: {"content": "choices.0.message.content", "tokens": "usage.total_tokens"}'
            />

            {/* 查询配置 (子折叠) */}
            <CollapsibleSection
              title="查询配置（可选）"
              subtitle="异步模型的任务轮询配置，同步模型无需配置"
              defaultOpen={!!formData.query_url_template}
            >
              <div className="grid grid-cols-2 gap-4">
                <Input
                  label="查询 URL 模板"
                  placeholder="https://api.example.com/v1/tasks/{{taskId}}"
                  value={formData.query_url_template}
                  onChange={(e) => setFormData({ ...formData, query_url_template: e.target.value })}
                />
                <Select
                  label="查询方法"
                  selectedKeys={[formData.query_method]}
                  onChange={(e) => setFormData({ ...formData, query_method: e.target.value })}
                >
                  <SelectItem key="GET">GET</SelectItem>
                  <SelectItem key="POST">POST</SelectItem>
                </Select>
              </div>

              <JsonField
                label="查询 Headers (JSON)"
                value={formData.query_headers_template}
                onChange={(val) => setFormData({ ...formData, query_headers_template: val })}
                minRows={2}
              />

              <JsonField
                label="查询 Body 模板 (JSON)"
                placeholder='{"task_id": "{{taskId}}"}'
                value={formData.query_body_template}
                onChange={(val) => setFormData({ ...formData, query_body_template: val })}
                minRows={2}
                description="查询方法为 POST 时使用"
              />

              <JsonField
                label="查询响应映射 (JSON)"
                value={formData.query_response_mapping}
                onChange={(val) => setFormData({ ...formData, query_response_mapping: val })}
                minRows={2}
                description='基础字段映射，提取 status 等原始值。如: {"status": "data.task_status"}'
              />

              {/* 异步状态判断 */}
              <div className="border-t border-slate-700/50 pt-4 mt-2">
                <h4 className="font-semibold text-slate-300 mb-1">异步状态判断</h4>
                <p className="text-xs text-slate-400 mb-3">配置异步模型的成功/失败判断条件和结果映射。</p>

                <div className="grid grid-cols-2 gap-4">
                  <Input
                    label="成功条件表达式"
                    placeholder='status == "succeed" || status == "completed"'
                    value={formData.query_success_condition}
                    onChange={(e) => setFormData({ ...formData, query_success_condition: e.target.value })}
                    description="JS 表达式，变量来自查询响应映射的字段"
                  />
                  <Input
                    label="失败条件表达式"
                    placeholder='status == "failed" || status == "error"'
                    value={formData.query_fail_condition}
                    onChange={(e) => setFormData({ ...formData, query_fail_condition: e.target.value })}
                    description="JS 表达式，变量来自查询响应映射的字段"
                  />
                </div>

                <JsonField
                  label="成功结果映射 (JSON)"
                  placeholder='{"image_url": "data.task_result.images.0.url", "video_url": "data.remote_url"}'
                  value={formData.query_success_mapping}
                  onChange={(val) => setFormData({ ...formData, query_success_mapping: val })}
                  minRows={2}
                  description="成功时从原始响应提取结果字段"
                />

                <JsonField
                  label="失败错误映射 (JSON)"
                  placeholder='{"error": "data.fail_reason", "message": "data.error.message"}'
                  value={formData.query_fail_mapping}
                  onChange={(val) => setFormData({ ...formData, query_fail_mapping: val })}
                  minRows={2}
                  description="失败时从原始响应提取错误信息"
                />
              </div>
            </CollapsibleSection>

            {/* 自定义 Handler */}
            <CollapsibleSection
              title="自定义 Handler（可选）"
              subtitle="用于无法通过模板配置覆盖的特殊 API（如特殊认证方式、特殊参数格式等）"
              defaultOpen={!!formData.custom_handler}
            >
              <div className="grid grid-cols-2 gap-4">
                <Input
                  label="提交 Handler"
                  placeholder='如: kling_video'
                  value={formData.custom_handler}
                  onChange={(e) => setFormData({ ...formData, custom_handler: e.target.value })}
                  description="对应 customHandlers/ 目录下的文件名（不含 .js）"
                />
                <Input
                  label="查询 Handler"
                  placeholder='如: kling_video'
                  value={formData.custom_query_handler}
                  onChange={(e) => setFormData({ ...formData, custom_query_handler: e.target.value })}
                  description="留空则查询走模板流程"
                />
              </div>
            </CollapsibleSection>

            {/* 计费 Handler */}
            <CollapsibleSection
              title="计费 Handler（可选）"
              subtitle="仅复杂计费模型需要。用于覆盖预估或从提交/查询结果解析真实 usage"
              defaultOpen={!!formData.billing_handler}
            >
              <div className="grid grid-cols-2 gap-4">
                <Input
                  label="提交计费 Handler"
                  placeholder='如: minimax_video_usage'
                  value={formData.billing_handler}
                  onChange={(e) => setFormData({ ...formData, billing_handler: e.target.value })}
                  description="对应 billingHandlers/ 目录下的文件名（不含 .js）"
                />
                <Input
                  label="查询计费 Handler"
                  placeholder='如: minimax_video_usage'
                  value={formData.billing_query_handler}
                  onChange={(e) => setFormData({ ...formData, billing_query_handler: e.target.value })}
                  description="异步模型完成结算时使用"
                />
              </div>
            </CollapsibleSection>
          </CollapsibleSection>
        </ModalBody>
        <ModalFooter className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-xs text-slate-500">
            可视化配置基础参数，高级 JSON 配置请展开底部"高级设置"
          </div>
          <div className="flex gap-2">
            <Button
              variant="flat"
              className="bg-slate-800/80 text-slate-300 hover:bg-slate-700"
              onPress={onClose}
            >
              取消
            </Button>
            <Button
              className="bg-gradient-to-r from-blue-500 to-violet-600 text-white"
              onPress={handleSave}
            >
              保存
            </Button>
          </div>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
};

export default ModelFormModal;
