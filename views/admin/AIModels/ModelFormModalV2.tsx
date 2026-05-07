import React, { useState, useEffect } from 'react';
import {
  Modal, ModalContent, ModalHeader, ModalBody, ModalFooter,
  Button, Input, Switch, Chip, Tabs, Tab, Textarea, Select, SelectItem
} from '@heroui/react';
import { Save, X, Sparkles, Star } from 'lucide-react';
import { getAdminAuthHeaders } from '../../../services/auth';
import { useToast } from '../../../contexts/ToastContext';
import type { V2Model } from './ModelCatalog';

// ============================================================
// 能力选项
// ============================================================
const CAPABILITY_OPTIONS = [
  { key: 'chat', label: '对话', description: '文本对话、问答' },
  { key: 'vision', label: '视觉', description: '图像理解、多模态输入' },
  { key: 'image_gen', label: '生图', description: '文生图、图生图' },
  { key: 'video_gen', label: '生视频', description: '文生视频、图生视频' },
  { key: 'audio_gen', label: '生音频', description: '文生语音、音乐生成' },
  { key: 'tool_calling', label: '工具调用', description: 'Function Calling' },
  { key: 'reasoning', label: '推理', description: '深度思考、逻辑推理' },
  { key: 'code', label: '代码', description: '代码生成、代码补全' },
];

const ADAPTER_OPTIONS = [
  { key: 'openai_compatible', label: 'OpenAI 兼容' },
  { key: 'volcengine', label: '火山引擎' },
  { key: 'deepseek', label: 'DeepSeek' },
  { key: 'zhipu', label: '智谱 AI' },
  { key: 'baidu', label: '百度千帆' },
];

// ============================================================
// 类型
// ============================================================
interface ModelFormModalV2Props {
  isOpen: boolean;
  onClose: () => void;
  model: V2Model | null;
  onSaved: () => void;
}

interface FormData {
  name: string;
  provider_id: string;
  model_id: string;
  capabilities: string[];
  adapter_name: string;
  quality_score: string;
  is_recommended: boolean;
  is_active: boolean;
  description: string;
  max_tokens: string;
  context_window: string;
  input_price: string;
  output_price: string;
}

const DEFAULT_FORM: FormData = {
  name: '',
  provider_id: '',
  model_id: '',
  capabilities: ['chat'],
  adapter_name: 'openai_compatible',
  quality_score: '5',
  is_recommended: false,
  is_active: true,
  description: '',
  max_tokens: '',
  context_window: '',
  input_price: '',
  output_price: '',
};

// ============================================================
// 组件
// ============================================================
const ModelFormModalV2: React.FC<ModelFormModalV2Props> = ({
  isOpen, onClose, model, onSaved
}) => {
  const { showToast } = useToast();
  const [form, setForm] = useState<FormData>({ ...DEFAULT_FORM });
  const [loading, setLoading] = useState(false);
  const [providers, setProviders] = useState<Array<{ id: number; name: string; display_name?: string }>>([]);

  // 加载平台列表
  useEffect(() => {
    if (isOpen) {
      fetchProviders();
    }
  }, [isOpen]);

  // 编辑模式：填充表单
  useEffect(() => {
    if (model) {
      setForm({
        name: model.name || '',
        provider_id: String(model.provider_id || ''),
        model_id: model.model_id || '',
        capabilities: model.capabilities || ['chat'],
        adapter_name: model.adapter_name || 'openai_compatible',
        quality_score: String(model.quality_score || 5),
        is_recommended: !!model.is_recommended,
        is_active: model.is_active !== 0,
        description: model.metadata?.description || '',
        max_tokens: String(model.metadata?.max_tokens || ''),
        context_window: String(model.metadata?.context_window || ''),
        input_price: String(model.pricing?.input || ''),
        output_price: String(model.pricing?.output || ''),
      });
    } else {
      setForm({ ...DEFAULT_FORM });
    }
  }, [model]);

  const fetchProviders = async () => {
    try {
      const response = await fetch('/api/admin/model-providers', {
        headers: getAdminAuthHeaders(),
      });
      if (response.ok) {
        const data = await response.json();
        setProviders(data.providers || []);
      }
    } catch (error) {
      console.error('获取平台列表失败:', error);
    }
  };

  const handleSubmit = async () => {
    if (!form.name.trim() || !form.provider_id || !form.model_id.trim()) {
      showToast('请填写必填字段：名称、平台、模型ID', 'error');
      return;
    }

    setLoading(true);

    const payload = {
      name: form.name.trim(),
      provider_id: parseInt(form.provider_id),
      model_id: form.model_id.trim(),
      capabilities: form.capabilities,
      adapter_name: form.adapter_name,
      quality_score: parseFloat(form.quality_score) || 5,
      is_recommended: form.is_recommended ? 1 : 0,
      is_active: form.is_active ? 1 : 0,
      metadata: {
        description: form.description,
        max_tokens: form.max_tokens ? parseInt(form.max_tokens) : undefined,
        context_window: form.context_window ? parseInt(form.context_window) : undefined,
      },
      pricing: {
        input: form.input_price ? parseFloat(form.input_price) : undefined,
        output: form.output_price ? parseFloat(form.output_price) : undefined,
        currency: 'CNY',
      },
    };

    try {
      const url = model
        ? `/api/admin/ai-models-v2/${model.id}`
        : '/api/admin/ai-models-v2';

      const response = await fetch(url, {
        method: model ? 'PUT' : 'POST',
        headers: getAdminAuthHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify(payload),
      });

      if (response.ok) {
        showToast(model ? '模型更新成功' : '模型创建成功', 'success');
        onSaved();
        onClose();
      } else {
        const data = await response.json().catch(() => ({}));
        showToast(data.message || '操作失败', 'error');
      }
    } catch (error) {
      showToast('网络错误', 'error');
    } finally {
      setLoading(false);
    }
  };

  const toggleCapability = (key: string) => {
    setForm(prev => ({
      ...prev,
      capabilities: prev.capabilities.includes(key)
        ? prev.capabilities.filter(c => c !== key)
        : [...prev.capabilities, key],
    }));
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} size="2xl" scrollBehavior="inside">
      <ModalContent>
        <ModalHeader className="flex items-center gap-2">
          <Sparkles size={18} className="text-primary" />
          {model ? '编辑模型' : '添加模型'}
        </ModalHeader>

        <ModalBody className="space-y-5">
          {/* 基础信息 */}
          <div className="space-y-3">
            <h4 className="text-sm font-medium text-default-700">基础信息</h4>
            <div className="grid grid-cols-2 gap-3">
              <Input
                label="模型名称 *"
                placeholder="例如：DeepSeek Chat"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                size="sm"
              />
              <Select
                label="所属平台 *"
                placeholder="选择平台"
                selectedKeys={form.provider_id ? [form.provider_id] : []}
                onChange={(e) => setForm({ ...form, provider_id: e.target.value })}
                size="sm"
              >
                {providers.map(p => (
                  <SelectItem key={String(p.id)}>
                    {p.display_name || p.name}
                  </SelectItem>
                ))}
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Input
                label="模型ID *"
                placeholder="例如：deepseek-chat"
                value={form.model_id}
                onChange={(e) => setForm({ ...form, model_id: e.target.value })}
                size="sm"
              />
              <Select
                label="适配器"
                selectedKeys={[form.adapter_name]}
                onChange={(e) => setForm({ ...form, adapter_name: e.target.value })}
                size="sm"
              >
                {ADAPTER_OPTIONS.map(a => (
                  <SelectItem key={a.key}>{a.label}</SelectItem>
                ))}
              </Select>
            </div>
            <Textarea
              label="描述"
              placeholder="模型简介..."
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              size="sm"
              minRows={2}
            />
          </div>

          {/* 能力标签 */}
          <div className="space-y-3">
            <h4 className="text-sm font-medium text-default-700">能力标签</h4>
            <div className="flex flex-wrap gap-2">
              {CAPABILITY_OPTIONS.map(opt => {
                const isSelected = form.capabilities.includes(opt.key);
                return (
                  <button
                    key={opt.key}
                    type="button"
                    onClick={() => toggleCapability(opt.key)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all border ${
                      isSelected
                        ? 'bg-primary/10 border-primary text-primary'
                        : 'bg-default-100 border-default-200 text-default-600 hover:border-default-300'
                    }`}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* 性能与定价 */}
          <div className="space-y-3">
            <h4 className="text-sm font-medium text-default-700">性能与定价</h4>
            <div className="grid grid-cols-3 gap-3">
              <Input
                label="质量评分"
                type="number"
                min={1}
                max={10}
                value={form.quality_score}
                onChange={(e) => setForm({ ...form, quality_score: e.target.value })}
                size="sm"
                endContent={<Star size={12} className="text-warning" />}
              />
              <Input
                label="最大 Token"
                type="number"
                placeholder="8192"
                value={form.max_tokens}
                onChange={(e) => setForm({ ...form, max_tokens: e.target.value })}
                size="sm"
              />
              <Input
                label="上下文窗口"
                type="number"
                placeholder="128000"
                value={form.context_window}
                onChange={(e) => setForm({ ...form, context_window: e.target.value })}
                size="sm"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Input
                label="输入价格 (¥/M tokens)"
                type="number"
                step="0.001"
                placeholder="0.0"
                value={form.input_price}
                onChange={(e) => setForm({ ...form, input_price: e.target.value })}
                size="sm"
              />
              <Input
                label="输出价格 (¥/M tokens)"
                type="number"
                step="0.001"
                placeholder="0.0"
                value={form.output_price}
                onChange={(e) => setForm({ ...form, output_price: e.target.value })}
                size="sm"
              />
            </div>
          </div>

          {/* 开关 */}
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-2">
              <Switch
                isSelected={form.is_active}
                onValueChange={(v) => setForm({ ...form, is_active: v })}
                size="sm"
              />
              <span className="text-sm">启用</span>
            </div>
            <div className="flex items-center gap-2">
              <Switch
                isSelected={form.is_recommended}
                onValueChange={(v) => setForm({ ...form, is_recommended: v })}
                size="sm"
              />
              <span className="text-sm">推荐</span>
            </div>
          </div>
        </ModalBody>

        <ModalFooter>
          <Button variant="flat" size="sm" onPress={onClose} startContent={<X size={14} />}>
            取消
          </Button>
          <Button
            color="primary"
            size="sm"
            isLoading={loading}
            onPress={handleSubmit}
            startContent={<Save size={14} />}
          >
            {model ? '保存' : '创建'}
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
};

export default ModelFormModalV2;
