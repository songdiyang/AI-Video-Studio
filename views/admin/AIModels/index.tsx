import React, { useEffect, useState, useMemo } from 'react';
import { Card, CardBody, Button, Input, useDisclosure, Tabs, Tab } from '@heroui/react';
import { Plus, Search, Sparkles, Layers, Building2 } from 'lucide-react';
import { getAdminAuthHeaders } from '../../../services/auth';
import { useWorkflow } from '../../../hooks/useWorkflow';
import { useToast } from '../../../contexts/ToastContext';
import { useConfirm } from '../../../contexts/ConfirmContext';
import { AIModel, TextModel, ModelFormData, DEFAULT_FORM_DATA } from './types';
import ModelCard from './ModelCard';
import SmartImportModal from './SmartImportModal';
import ModelFormModal from './ModelFormModal';
import ModelTestModal from './ModelTest';

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
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [editingModel, setEditingModel] = useState<AIModel | null>(null);
  const [testingModel, setTestingModel] = useState<AIModel | null>(null);
  const { isOpen, onOpen, onClose } = useDisclosure();
  const { isOpen: isSmartOpen, onOpen: onSmartOpen, onClose: onSmartClose } = useDisclosure();
  const { isOpen: isTestOpen, onOpen: onTestOpen, onClose: onTestClose } = useDisclosure();
  const { showToast } = useToast();
  const { confirm } = useConfirm();
  
  const [textModels, setTextModels] = useState<TextModel[]>([]);
  const [smartMode, setSmartMode] = useState(false);
  const [importMode, setImportMode] = useState<'ai' | 'manual'>('ai');
  const [selectedTextModel, setSelectedTextModel] = useState<string>('');
  const [apiDoc, setApiDoc] = useState('');
  const [jsonConfig, setJsonConfig] = useState('');
  const [parsing, setParsing] = useState(false);
  const [parseJobId, setParseJobId] = useState<string | null>(null);

  // 工作流轮询：智能解析完成后自动填充表单
  const { job: parseJob, isRunning: isParseRunning, overallProgress: parseProgress } = useWorkflow(parseJobId, {
    onCompleted: (completedJob) => {
      setParseJobId(null);
      setParsing(false);
      const task = completedJob.tasks?.[0];
      const config = task?.result_data?.config || task?.result_data;
      if (config && typeof config === 'object' && config.name) {
        setFormData(buildFormDataFromConfig(config));
        onSmartClose();
        setSmartMode(false);
        // 延迟打开表单，确保 smart modal 先关闭
        setTimeout(() => onOpen(), 300);
      } else {
        console.error('[SmartParse] 解析结果:', task?.result_data);
        showToast('解析完成但未返回有效配置', 'error');
      }
    },
    onFailed: (failedJob) => {
      setParseJobId(null);
      setParsing(false);
    }
  });

  const [formData, setFormData] = useState<ModelFormData>({ ...DEFAULT_FORM_DATA });

  useEffect(() => {
    fetchModels();
    fetchTextModels();
  }, []);

  const fetchTextModels = async () => {
    try {
      const response = await fetch('/api/admin/text-models', {
        headers: getAdminAuthHeaders()
      });

      if (response.ok) {
        const data = await response.json();
        setTextModels(data.models || []);
        if (data.models.length > 0) {
          setSelectedTextModel(data.models[0].name);
        }
      }
    } catch (error) {
      console.error('获取文本模型列表失败:', error);
    }
  };

  const fetchModels = async () => {
    try {
      const response = await fetch('/api/admin/ai-models', {
        headers: getAdminAuthHeaders()
      });

      if (response.ok) {
        const data = await response.json();
        setModels(data.models || []);
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

  const handleManualImport = () => {
    if (!jsonConfig.trim()) {
      showToast('请输入 JSON 配置', 'warning');
      return;
    }

    try {
      let content = jsonConfig.trim();
      
      // 1. 移除 <think> 标签
      content = content.replace(/<think>[\s\S]*?<\/think>/g, '');
      
      // 2. 清洗 markdown 代码块
      if (content.includes('```')) {
        content = content.replace(/^```json\s*/m, '').replace(/^```\s*/m, '').replace(/```$/m, '');
      }
      
      // 3. 提取 JSON 对象
      const firstOpen = content.indexOf('{');
      const lastClose = content.lastIndexOf('}');
      if (firstOpen === -1 || lastClose === -1) {
         throw new Error('未找到有效的 JSON 对象');
      }
      let jsonStr = content.substring(firstOpen, lastClose + 1);

      let config;
      try {
        config = JSON.parse(jsonStr);
      } catch (e) {
        const cleanStr = jsonStr.replace(/[\n\r\t]/g, '');
        config = JSON.parse(cleanStr);
      }
      
      // 填充表单
      setFormData(buildFormDataFromConfig(config));
      
      setSmartMode(false);
      onSmartClose();
      // 延迟打开表单，确保 smart modal 先关闭
      setTimeout(() => onOpen(), 300);
    } catch (error) {
      console.error('JSON 解析失败:', error);
      showToast(`JSON 解析失败: ${error instanceof Error ? error.message : '未知错误'}`, 'error');
    }
  };

  const handleSmartParse = async () => {
    if (!apiDoc.trim()) {
      showToast('请输入API文档', 'warning');
      return;
    }

    setParsing(true);
    try {
      const response = await fetch('/api/admin/ai-models/smart-parse', {
        method: 'POST',
        headers: getAdminAuthHeaders({
          'Content-Type': 'application/json'
        }),
        body: JSON.stringify({
          apiDoc,
          textModel: selectedTextModel
        })
      });

      const data = await response.json();

      if (response.ok && data.jobId) {
        setParseJobId(String(data.jobId));
      } else {
        setParsing(false);
        showToast('启动解析任务失败，请稍后重试', 'error');
      }
    } catch (error) {
      console.error('智能解析失败:', error);
      setParsing(false);
      showToast('解析失败，请检查网络连接', 'error');
    }
  };

  const resetForm = () => {
    setEditingModel(null);
    setApiDoc('');
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
    AUDIO: '音频模型',
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
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold text-slate-100">AI 模型配置</h1>
          <p className="text-slate-400 mt-1">管理所有第三方 AI 模型接口配置</p>
        </div>
        <div className="flex gap-3">
          <Button
            className="bg-gradient-to-r from-purple-500 to-blue-500 text-white font-semibold shadow-lg hover:shadow-xl"
            startContent={<Sparkles className="w-4 h-4" />}
            onPress={() => {
              resetForm();
              setSmartMode(true);
              onSmartOpen();
            }}
          >
            智能添加
          </Button>
          <Button
            className="bg-gradient-to-r from-blue-500 to-violet-600 text-white font-semibold shadow-lg"
            startContent={<Plus className="w-4 h-4" />}
            onPress={() => {
              resetForm();
              setSmartMode(false);
              onOpen();
            }}
          >
            手动添加
          </Button>
        </div>
      </div>

      <Card className="bg-slate-900/80 border border-slate-700/50 shadow-sm mb-6">
        <CardBody className="p-6">
          <div className="flex items-center gap-4">
            <Input
              placeholder="搜索模型名称或厂商..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              startContent={<Search className="w-4 h-4 text-slate-400" />}
              classNames={{
                inputWrapper: "bg-slate-800/60 border border-slate-600/50 flex-1"
              }}
              className="flex-1"
            />
            <div className="flex items-center gap-2 bg-slate-800/60 border border-slate-600/50 rounded-lg p-1">
              <button
                onClick={() => setGroupBy('category')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                  groupBy === 'category'
                    ? 'bg-blue-500/20 text-blue-400'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <Layers className="w-4 h-4" />
                按种类
              </button>
              <button
                onClick={() => setGroupBy('provider')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                  groupBy === 'provider'
                    ? 'bg-blue-500/20 text-blue-400'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <Building2 className="w-4 h-4" />
                按厂家
              </button>
            </div>
          </div>
        </CardBody>
      </Card>

      {loading ? (
        <div className="text-center py-12 text-slate-500">加载中...</div>
      ) : filteredModels.length === 0 ? (
        <div className="text-center py-12 text-slate-500">暂无模型配置</div>
      ) : groupBy === 'category' ? (
        <div className="space-y-8">
          {Object.entries(categoryGroups).map(([category, categoryModels]) => (
            <div key={category}>
              <div className="flex items-center gap-3 mb-4">
                <div className={`px-3 py-1 rounded-full border text-sm font-semibold ${categoryColors[category] || 'text-slate-400 border-slate-600'}`}>
                  {categoryLabels[category] || category}
                </div>
                <span className="text-slate-500 text-sm">{categoryModels.length} 个模型</span>
                <div className="flex-1 h-px bg-slate-700/50" />
              </div>
              {renderModelGrid(categoryModels)}
            </div>
          ))}
        </div>
      ) : (
        <div className="space-y-8">
          {Object.entries(providerGroups).map(([provider, providerModels]) => (
            <div key={provider}>
              <div className="flex items-center gap-3 mb-4">
                <div className="px-3 py-1 rounded-full border text-sm font-semibold text-slate-300 border-slate-600/50 bg-slate-800/50">
                  {provider}
                </div>
                <span className="text-slate-500 text-sm">{providerModels.length} 个模型</span>
                <div className="flex-1 h-px bg-slate-700/50" />
              </div>
              {renderModelGrid(providerModels)}
            </div>
          ))}
        </div>
      )}

      <SmartImportModal
        isOpen={isSmartOpen}
        onClose={onSmartClose}
        importMode={importMode}
        setImportMode={setImportMode}
        textModels={textModels}
        selectedTextModel={selectedTextModel}
        onModelChange={setSelectedTextModel}
        apiDoc={apiDoc}
        onApiDocChange={setApiDoc}
        jsonConfig={jsonConfig}
        onJsonConfigChange={setJsonConfig}
        parsing={parsing}
        isParseRunning={isParseRunning}
        parseProgress={parseProgress}
        parseJob={parseJob}
        onSmartParse={handleSmartParse}
        onManualImport={handleManualImport}
      />

      <ModelFormModal
        isOpen={isOpen}
        onClose={onClose}
        editingModel={editingModel}
        formData={formData}
        setFormData={setFormData}
        onSave={handleSave}
      />

      <ModelTestModal
        isOpen={isTestOpen}
        onClose={onTestClose}
        model={testingModel}
      />
    </div>
  );
};

export default AIModels;
