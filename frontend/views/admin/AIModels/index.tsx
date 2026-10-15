import React, { useEffect, useState, useMemo } from 'react';
import { Button, useDisclosure, Tabs, Tab } from '@heroui/react';
import { Plus, Search, Layers, Building2, LayoutGrid } from 'lucide-react';
import { getAdminAuthHeaders } from '../../../services/auth';
import { useToast } from '../../../contexts/ToastContext';
import { useConfirm } from '../../../contexts/ConfirmContext';
import { AIModel, ModelFormData, DEFAULT_FORM_DATA } from './types';
import ModelCard from './ModelCard';
import ModelFormModal from './ModelFormModal';
import ModelFormModalV2 from './ModelFormModalV2';
import ModelTestModal from './ModelTest';
import ModelCatalog from './ModelCatalog';
import type { V2Model } from './ModelCatalog';

const stringifyJson = (value: any, fallback: string) => {
  if (value === undefined || value === null || value === '') {
    return fallback;
  }

  if (typeof value === 'string') {
    try {
      return JSON.stringify(JSON.parse(value), null, 2);
    } catch {
      return value;
    }
  }

  return JSON.stringify(value, null, 2);
};

const buildLegacyPriceConfig = (unit: string, price: number) => {
  const normalizedUnit = String(unit || 'token').toLowerCase();
  const type = normalizedUnit === 'second'
    ? 'duration_seconds'
    : normalizedUnit === 'request'
      ? 'request_count'
      : normalizedUnit === 'image' || normalizedUnit === 'item'
        ? 'item_count'
        : 'total_tokens';

  const componentUnit = type === 'duration_seconds'
    ? 'per_second'
    : type === 'request_count'
      ? 'per_request'
      : type === 'item_count'
        ? 'per_item'
        : 'per_token';

  return {
    currency: 'CNY',
    charge_on_failure: false,
    components: [
      {
        type,
        unit: componentUnit,
        price: Number(price) || 0
      }
    ]
  };
};

const resolvePriceConfig = (config: any) => {
  if (config?.price_config !== undefined) {
    return config.price_config;
  }

  if (config?.price_unit || config?.price_value !== undefined) {
    return buildLegacyPriceConfig(config.price_unit, config.price_value);
  }

  return null;
};

const buildFormDataFromConfig = (config: any): ModelFormData => ({
  name: config?.name || '',
  category: config?.category || 'TEXT',
  provider: config?.provider || '',
  description: config?.description || '',
  is_active: config?.is_active ?? 1,
  api_key: config?.api_key || '',
  provider_id: config?.provider_id ? String(config.provider_id) : '',
  model_id: config?.model_id || '',
  capabilities: stringifyJson(config?.capabilities, '[]'),
  price_config: stringifyJson(resolvePriceConfig(config), 'null'),
  request_method: config?.request_method || 'POST',
  url_template: config?.url_template || '',
  headers_template: stringifyJson(config?.headers_template, '{}'),
  body_template: stringifyJson(config?.body_template, '{}'),
  default_params: stringifyJson(config?.default_params, '{}'),
  supported_aspect_ratios: stringifyJson(config?.supported_aspect_ratios ?? config?.supportedAspectRatios, '[]'),
  supported_durations: stringifyJson(config?.supported_durations ?? config?.supportedDurations, '[]'),
  supported_resolutions: stringifyJson(config?.supported_resolutions ?? config?.supportedResolutions, '[]'),
  response_mapping: stringifyJson(config?.response_mapping, '{}'),
  query_url_template: config?.query_url_template || '',
  query_method: config?.query_method || 'GET',
  query_headers_template: stringifyJson(config?.query_headers_template, '{}'),
  query_body_template: stringifyJson(config?.query_body_template, '{}'),
  query_response_mapping: stringifyJson(config?.query_response_mapping, '{}'),
  query_success_condition: config?.query_success_condition || '',
  query_fail_condition: config?.query_fail_condition || '',
  query_success_mapping: stringifyJson(config?.query_success_mapping, '{}'),
  query_fail_mapping: stringifyJson(config?.query_fail_mapping, '{}'),
  custom_handler: config?.custom_handler || config?.customHandler || '',
  custom_query_handler: config?.custom_query_handler || config?.customQueryHandler || '',
  billing_handler: config?.billing_handler || config?.billingHandler || '',
  billing_query_handler: config?.billing_query_handler || config?.billingQueryHandler || ''
});

const AIModels: React.FC = () => {
  const [models, setModels] = useState<AIModel[]>([]);
  const [v2Models, setV2Models] = useState<V2Model[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [editingModel, setEditingModel] = useState<AIModel | null>(null);
  const [editingV2Model, setEditingV2Model] = useState<V2Model | null>(null);
  const [testingModel, setTestingModel] = useState<AIModel | null>(null);
  const [testingV2Model, setTestingV2Model] = useState<V2Model | null>(null);
  const [viewMode, setViewMode] = useState<'legacy' | 'catalog'>('catalog');
  const [apiVersion, setApiVersion] = useState<'v1' | 'v2'>('v1');
  const { isOpen, onOpen, onClose } = useDisclosure();
  const { isOpen: isV2Open, onOpen: onV2Open, onClose: onV2Close } = useDisclosure();
  const { isOpen: isTestOpen, onOpen: onTestOpen, onClose: onTestClose } = useDisclosure();
  const { showToast } = useToast();
  const { confirm } = useConfirm();

  const [formData, setFormData] = useState<ModelFormData>({ ...DEFAULT_FORM_DATA });

  useEffect(() => {
    fetchModels();
    // 暴露刷新方法给弹窗内的发现面板
    (window as any).__refreshModelList = fetchModels;
    return () => {
      delete (window as any).__refreshModelList;
    };
  }, []);

  const fetchModels = async () => {
    try {
      const response = await fetch('/api/admin/ai-models', {
        headers: getAdminAuthHeaders()
      });

      if (response.ok) {
        const data = await response.json();
        setApiVersion(data.version || 'v1');
        if (data.version === 'v2') {
          setV2Models(data.models || []);
          setViewMode('catalog');
        } else {
          setModels(data.models || []);
          setViewMode('legacy');
        }
      }
    } catch (error) {
      console.error('获取模型列表失败:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleEdit = (model: AIModel) => {
    setEditingModel(model);
    setFormData(buildFormDataFromConfig(model));
    onOpen();
  };

  const handleEditV2 = (model: V2Model) => {
    setEditingV2Model(model);
    onV2Open();
  };

  const handleTestV2 = (model: V2Model) => {
    setTestingV2Model(model);
    onTestOpen();
  };

  const handleSave = async () => {
    try {
      const payload = {
        name: formData.name,
        category: formData.category,
        provider: formData.provider,
        description: formData.description,
        is_active: formData.is_active,
        api_key: formData.api_key || null,
        provider_id: formData.provider_id ? parseInt(formData.provider_id) : null,
        model_id: formData.model_id || null,
        capabilities: formData.capabilities ? JSON.parse(formData.capabilities) : [],
        price_config: formData.price_config.trim() ? JSON.parse(formData.price_config) : null,
        request_method: formData.request_method,
        url_template: formData.url_template,
        headers_template: JSON.parse(formData.headers_template),
        body_template: formData.body_template ? JSON.parse(formData.body_template) : null,
        default_params: formData.default_params ? JSON.parse(formData.default_params) : null,
        supported_aspect_ratios: formData.supported_aspect_ratios ? JSON.parse(formData.supported_aspect_ratios) : [],
        supported_durations: formData.supported_durations ? JSON.parse(formData.supported_durations) : [],
        supported_resolutions: formData.supported_resolutions ? JSON.parse(formData.supported_resolutions) : [],
        response_mapping: JSON.parse(formData.response_mapping),
        query_url_template: formData.query_url_template || null,
        query_method: formData.query_method,
        query_headers_template: formData.query_headers_template ? JSON.parse(formData.query_headers_template) : null,
        query_body_template: formData.query_body_template ? JSON.parse(formData.query_body_template) : null,
        query_response_mapping: formData.query_response_mapping ? JSON.parse(formData.query_response_mapping) : null,
        query_success_condition: formData.query_success_condition || null,
        query_fail_condition: formData.query_fail_condition || null,
        query_success_mapping: formData.query_success_mapping ? JSON.parse(formData.query_success_mapping) : null,
        query_fail_mapping: formData.query_fail_mapping ? JSON.parse(formData.query_fail_mapping) : null,
        custom_handler: formData.custom_handler || null,
        custom_query_handler: formData.custom_query_handler || null,
        billing_handler: formData.billing_handler || null,
        billing_query_handler: formData.billing_query_handler || null
      };

      const url = editingModel 
        ? `/api/admin/ai-models/${editingModel.id}`
        : '/api/admin/ai-models';
      
      const response = await fetch(url, {
        method: editingModel ? 'PUT' : 'POST',
        headers: getAdminAuthHeaders({
          'Content-Type': 'application/json'
        }),
        body: JSON.stringify(payload)
      });

      const data = await response.json().catch(() => ({}));
      if (response.ok) {
        fetchModels();
        onClose();
        resetForm();
      } else {
        throw new Error('保存失败');
      }
    } catch (error) {
      console.error('保存模型失败:', error);
      showToast('保存失败，请检查配置或稍后重试', 'error');
    }
  };

  const handleDelete = async (modelId: number) => {
    const confirmed = await confirm({
      title: '删除模型',
      message: '确定要删除此模型吗？',
      type: 'danger',
      confirmText: '删除'
    });
    if (!confirmed) return;

    try {
      const response = await fetch(`/api/admin/ai-models/${modelId}`, {
        method: 'DELETE',
        headers: getAdminAuthHeaders()
      });

      if (response.ok) {
        fetchModels();
      }
    } catch (error) {
      console.error('删除模型失败:', error);
    }
  };

  const resetForm = () => {
    setEditingModel(null);
    setFormData({ ...DEFAULT_FORM_DATA });
  };

  const [groupBy, setGroupBy] = useState<'category' | 'provider'>('category');

  const filteredModels = models.filter(model =>
    model.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    model.provider.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // 按种类分组
  const categoryGroups = useMemo(() => {
    const groups: Record<string, AIModel[]> = {};
    const order = ['TEXT', 'MULTIMODAL', 'IMAGE', 'VIDEO', 'AUDIO'];
    filteredModels.forEach(model => {
      const key = model.category;
      if (!groups[key]) groups[key] = [];
      groups[key].push(model);
    });
    // 按固定顺序返回
    const ordered: Record<string, AIModel[]> = {};
    order.forEach(cat => {
      if (groups[cat]) ordered[cat] = groups[cat];
    });
    return ordered;
  }, [filteredModels]);

  // 按厂家分组
  const providerGroups = useMemo(() => {
    const groups: Record<string, AIModel[]> = {};
    filteredModels.forEach(model => {
      const key = model.provider;
      if (!groups[key]) groups[key] = [];
      groups[key].push(model);
    });
    return groups;
  }, [filteredModels]);

  const categoryLabels: Record<string, string> = {
    TEXT: '文本模型',
    IMAGE: '图像生成',
    VIDEO: '视频生成',
    AUDIO: '声音模型',
    MULTIMODAL: '多模态'
  };

  const categoryColors: Record<string, string> = {
    TEXT: 'text-blue-400 border-blue-500/30',
    IMAGE: 'text-purple-400 border-purple-500/30',
    VIDEO: 'text-pink-400 border-pink-500/30',
    AUDIO: 'text-emerald-400 border-emerald-500/30',
    MULTIMODAL: 'text-teal-400 border-teal-500/30'
  };

  const renderModelGrid = (modelList: AIModel[]) => (
    <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">
      {modelList.map((model) => (
        <ModelCard
          key={model.id}
          model={model}
          onEdit={handleEdit}
          onDelete={handleDelete}
          onTest={(m) => { setTestingModel(m); onTestOpen(); }}
        />
      ))}
    </div>
  );

  return (
    <div className="p-8">
      {/* 页面标题 */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-[var(--text-primary)]">AI 模型配置</h1>
          <p className="text-[var(--text-muted)] mt-1 text-sm">
            {apiVersion === 'v2' ? '模型目录 · 智能管理' : '管理所有第三方 AI 模型接口配置'}
          </p>
        </div>
        <div className="flex items-center gap-2">

          <Button
            className="bg-[var(--accent)] text-white font-semibold shadow-md hover:brightness-110"
            startContent={<Plus className="w-4 h-4" />}
            onPress={() => {
              if (apiVersion === 'v2' && viewMode === 'catalog') {
                setEditingV2Model(null);
                onV2Open();
              } else {
                resetForm();
                onOpen();
              }
            }}
          >
            {apiVersion === 'v2' ? '添加模型' : '添加模型'}
          </Button>
        </div>
      </div>

      {/* v2 目录视图 */}
      {apiVersion === 'v2' && viewMode === 'catalog' ? (
        <ModelCatalog
          models={v2Models}
          onRefresh={fetchModels}
          onEdit={handleEditV2}
          onTest={handleTestV2}
        />
      ) : (
        <>
          {/* 搜索与分组 */}
          <div className="flex items-center gap-3 mb-6">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-muted)]" />
              <input
                type="text"
                placeholder="搜索模型名称或厂商..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full h-9 pl-9 pr-4 rounded-lg bg-white border border-[var(--border-color)] text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] outline-none focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent)]/20 transition-colors"
              />
            </div>
            <div className="flex items-center gap-1 bg-white border border-[var(--border-color)] rounded-lg p-1 shadow-sm">
              <button
                onClick={() => setGroupBy('category')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-semibold transition-colors ${
                  groupBy === 'category'
                    ? 'bg-[var(--accent)] text-white shadow-sm'
                    : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)]'
                }`}
              >
                <Layers className="w-4 h-4" />
                按种类
              </button>
              <button
                onClick={() => setGroupBy('provider')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-semibold transition-colors ${
                  groupBy === 'provider'
                    ? 'bg-[var(--accent)] text-white shadow-sm'
                    : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)]'
                }`}
              >
                <Building2 className="w-4 h-4" />
                按厂家
              </button>
            </div>
          </div>

          {loading ? (
            <div className="text-center py-12 text-[var(--text-muted)]">加载中...</div>
          ) : filteredModels.length === 0 ? (
            <div className="text-center py-12 text-[var(--text-muted)]">暂无模型配置</div>
          ) : groupBy === 'category' ? (
            <div className="space-y-6">
              {Object.entries(categoryGroups).map(([category, categoryModels]) => (
                <div key={category}>
                  <div className="flex items-center gap-3 mb-3">
                    <div className={`px-3 py-1 rounded-full border text-sm font-semibold ${categoryColors[category] || 'text-[var(--text-muted)] border-[var(--border-color)]'}`}>
                      {categoryLabels[category] || category}
                    </div>
                    <span className="text-[var(--text-muted)] text-sm">{categoryModels.length} 个模型</span>
                    <div className="flex-1 h-px bg-[var(--border-color)]" />
                  </div>
                  {renderModelGrid(categoryModels)}
                </div>
              ))}
            </div>
          ) : (
            <div className="space-y-6">
              {Object.entries(providerGroups).map(([provider, providerModels]) => (
                <div key={provider}>
                  <div className="flex items-center gap-3 mb-3">
                    <div className="px-3 py-1 rounded-full border text-sm font-semibold text-[var(--text-primary)] border-[var(--border-color)] bg-[var(--bg-hover)]">
                      {provider}
                    </div>
                    <span className="text-[var(--text-muted)] text-sm">{providerModels.length} 个模型</span>
                    <div className="flex-1 h-px bg-[var(--border-color)]" />
                  </div>
                  {renderModelGrid(providerModels)}
                </div>
              ))}
            </div>
          )}
        </>
      )}

      <ModelFormModal
        isOpen={isOpen}
        onClose={onClose}
        editingModel={editingModel}
        formData={formData}
        setFormData={setFormData}
        onSave={handleSave}
      />

      <ModelFormModalV2
        isOpen={isV2Open}
        onClose={onV2Close}
        model={editingV2Model}
        onSaved={fetchModels}
      />

      <ModelTestModal
        isOpen={isTestOpen}
        onClose={onTestClose}
        model={testingModel || (testingV2Model ? {
          id: testingV2Model.id,
          name: testingV2Model.name,
          provider: testingV2Model.provider,
          category: testingV2Model.capabilities?.includes('video_gen') ? 'VIDEO'
            : testingV2Model.capabilities?.includes('image_gen') ? 'IMAGE'
            : testingV2Model.capabilities?.includes('audio_gen') ? 'AUDIO'
            : testingV2Model.capabilities?.includes('vision') ? 'MULTIMODAL'
            : 'TEXT',
          is_active: testingV2Model.is_active,
          provider_id: testingV2Model.provider_id,
          model_id: testingV2Model.model_id,
          capabilities: testingV2Model.capabilities,
          price_config: null,
          request_method: 'POST',
          url_template: '',
          headers_template: {},
          response_mapping: {},
          created_at: testingV2Model.created_at,
          updated_at: testingV2Model.updated_at,
        } as AIModel : null)}
      />
    </div>
  );
};

export default AIModels;
