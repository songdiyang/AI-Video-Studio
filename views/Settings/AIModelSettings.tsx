import React, { useState, useEffect, useMemo } from 'react';
import {
  Button, Input, Chip, Switch,
  Modal, ModalContent, ModalHeader, ModalBody, ModalFooter,
} from '@heroui/react';
import {
  Plus, Trash2, Star, Search, Zap,
  Loader2, ShieldCheck, MessageSquare, Image as ImageIcon, Clapperboard, X, AlertCircle,
  CheckCircle2, XCircle, ChevronDown, Eye, EyeOff,
} from 'lucide-react';
import { useToast } from '../../contexts/ToastContext';
import {
  saveAIModelKey, listAIModelConfigs, deleteAIModelConfig,
  updateAIModelConfigFlags, testAIModelConnection, testModelByCategory, DEFAULT_API_BASES,
  type AIModelConfig, type ConnectionTestResult,
} from '../../services/localApi';

// ─── 提供商目录 ───────────────────────────────────────────────
type ProviderCategory = 'multimodal' | 'text' | 'image' | 'video';

interface ModelProvider {
  id: string;
  name: string;
  /** 该提供商支持的模型类别（一个提供商可支持多种） */
  supportedCategories: ProviderCategory[];
  /** 按类别分组的模型列表 */
  modelsByCategory: Partial<Record<ProviderCategory, string[]>>;
  /** 默认 API Base（选择后自动填充，自定义除外） */
  defaultApiBase: string;
  /** 是否为自定义提供商（需要手动填写 API Base） */
  isCustom: boolean;
  color: string;
}

const CATEGORY_META: Record<ProviderCategory, { label: string; icon: React.ReactNode }> = {
  multimodal: { label: '多模态', icon: <Zap className="w-3.5 h-3.5" /> },
  text: { label: '文本模型', icon: <MessageSquare className="w-3.5 h-3.5" /> },
  image: { label: '图片模型', icon: <ImageIcon className="w-3.5 h-3.5" /> },
  video: { label: '视频模型', icon: <Clapperboard className="w-3.5 h-3.5" /> },
};

const MODEL_PROVIDERS: ModelProvider[] = [
  {
    id: 'deepseek', name: 'DeepSeek',
    supportedCategories: ['text'],
    modelsByCategory: { text: ['deepseek-chat', 'deepseek-reasoner'] },
    defaultApiBase: 'https://api.deepseek.com/v1', isCustom: false, color: '#4d6bfe',
  },
  {
    id: 'qwen', name: '通义千问',
    supportedCategories: ['text', 'multimodal'],
    modelsByCategory: {
      text: ['qwen-turbo', 'qwen-plus', 'qwen-max', 'qwen-long'],
      multimodal: ['qwen-vl-plus', 'qwen-vl-max'],
    },
    defaultApiBase: 'https://dashscope.aliyuncs.com/compatible-mode/v1', isCustom: false, color: '#615ced',
  },
  {
    id: 'doubao', name: '豆包',
    supportedCategories: ['text'],
    modelsByCategory: { text: ['doubao-pro-4k', 'doubao-pro-32k', 'doubao-pro-128k'] },
    defaultApiBase: 'https://ark.cn-beijing.volces.com/api/v3', isCustom: false, color: '#ff752d',
  },
  {
    id: 'zhipu', name: '智谱 AI',
    supportedCategories: ['text', 'multimodal'],
    modelsByCategory: {
      text: ['glm-4-plus', 'glm-4-flash', 'glm-4-long'],
      multimodal: ['glm-4v', 'glm-4v-plus'],
    },
    defaultApiBase: 'https://open.bigmodel.cn/api/paas/v4', isCustom: false, color: '#3b82f6',
  },
  {
    id: 'openai', name: 'OpenAI',
    supportedCategories: ['multimodal', 'text', 'image'],
    modelsByCategory: {
      multimodal: ['gpt-4o', 'gpt-4o-mini'],
      text: ['gpt-4-turbo', 'gpt-3.5-turbo'],
      image: ['dall-e-3', 'dall-e-2'],
    },
    defaultApiBase: 'https://api.openai.com/v1', isCustom: false, color: '#10a37f',
  },
  {
    id: 'kling', name: '可灵',
    supportedCategories: ['video'],
    modelsByCategory: { video: ['kling-v1', 'kling-v1-5', 'kling-v2-master'] },
    defaultApiBase: 'https://api.klingai.com', isCustom: false, color: '#00c2a8',
  },
  {
    id: 'seedance', name: 'Seedance',
    supportedCategories: ['video'],
    modelsByCategory: { video: ['seedance-1-0-lite', 'seedance-1-0-pro'] },
    defaultApiBase: '', isCustom: true, color: '#8b5cf6',
  },
  {
    id: 'vidu', name: 'Vidu',
    supportedCategories: ['video'],
    modelsByCategory: { video: ['viduq1', 'vidu2.0'] },
    defaultApiBase: 'https://api.vidu.cn', isCustom: false, color: '#ef4444',
  },
  {
    id: 'custom', name: '自定义',
    supportedCategories: ['text', 'multimodal', 'image', 'video'],
    modelsByCategory: {},
    defaultApiBase: '', isCustom: true, color: '#64748b',
  },
];

const PROVIDER_MAP: Record<string, ModelProvider> = Object.fromEntries(MODEL_PROVIDERS.map((p) => [p.id, p]));

const getProviderName = (id: string) => PROVIDER_MAP[id]?.name || id;
/** 从配置中推断类别（用于列表分组展示） */
const getCategory = (id: string): ProviderCategory => {
  const p = PROVIDER_MAP[id];
  if (!p) return 'text';
  return p.supportedCategories[0] || 'text';
};
const configKey = (c: { provider: string; model_name: string }) => `${c.provider}::${c.model_name}`;

// ─── 小组件已移除（行式布局不再需要头像/密钥显隐） ────────────

const AIModelSettings: React.FC = () => {
  const { showToast } = useToast();
  const [configs, setConfigs] = useState<AIModelConfig[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');

  const [showAddModal, setShowAddModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deletingConfig, setDeletingConfig] = useState<AIModelConfig | null>(null);

  // 连接测试状态
  const [testing, setTesting] = useState<Record<string, boolean>>({});
  const [testResults, setTestResults] = useState<Record<string, ConnectionTestResult>>({});

  // 新增表单
  const [selectedProvider, setSelectedProvider] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<ProviderCategory | ''>('');
  const [selectedModel, setSelectedModel] = useState('');
  const [customModelId, setCustomModelId] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [apiBase, setApiBase] = useState('');
  const [revealKey, setRevealKey] = useState(false);
  const [keyTouched, setKeyTouched] = useState(false);
  const [saving, setSaving] = useState(false);

  // 添加前测试状态
  const [addTesting, setAddTesting] = useState(false);
  const [addTestResult, setAddTestResult] = useState<ConnectionTestResult | null>(null);
  const [addTestPassed, setAddTestPassed] = useState(false);

  useEffect(() => {
    loadConfigs();
  }, []);

  const loadConfigs = async () => {
    setLoading(true);
    try {
      const data = await listAIModelConfigs();
      setConfigs(data);
    } catch (error) {
      console.error('Failed to load AI model configs:', error);
      showToast('加载模型配置失败', 'error');
    } finally {
      setLoading(false);
    }
  };

  // ── 表单校验 ────────────────────────────────────────────
  const selectedProviderInfo = PROVIDER_MAP[selectedProvider];
  const isCustomProvider = selectedProviderInfo?.isCustom ?? false;
  // 当前可用的类别列表
  const availableCategories = selectedProviderInfo?.supportedCategories ?? [];
  // 当前类别下的可选模型
  const availableModels = selectedCategory
    ? (selectedProviderInfo?.modelsByCategory[selectedCategory] ?? [])
    : [];
  // 最终模型 ID（自定义提供商用手动输入，否则用下拉选择）
  const effectiveModelId = isCustomProvider ? customModelId.trim() : selectedModel;

  const keyError = apiKey && apiKey.trim().length < 8
    ? '密钥长度过短，请检查是否完整粘贴'
    : (keyTouched && !apiKey.trim() ? '请填写 API Key' : '');
  const apiBaseError = isCustomProvider && !apiBase.trim()
    ? '自定义提供商需要填写 API Base'
    : '';
  const modelError = selectedCategory && !effectiveModelId
    ? (isCustomProvider ? '请填写模型 ID' : '请选择模型')
    : '';
  const canSave = !!selectedProvider && !!selectedCategory && !!effectiveModelId && !!apiKey.trim() && !keyError && !apiBaseError && !modelError;

  // ── 过滤后的配置列表 ──────────────────────────────────────
  const filteredConfigs = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return configs;
    return configs.filter(
      (c) => getProviderName(c.provider).toLowerCase().includes(q) || c.model_name.toLowerCase().includes(q),
    );
  }, [configs, search]);

  const handleAdd = () => {
    setSelectedProvider('');
    setSelectedCategory('');
    setSelectedModel('');
    setCustomModelId('');
    setApiKey('');
    setApiBase('');
    setRevealKey(false);
    setKeyTouched(false);
    setAddTestResult(null);
    setAddTestPassed(false);
    setAddTesting(false);
    setShowAddModal(true);
  };

  /** 选择提供商时：自动填充 API Base、重置下游选择 */
  const handleProviderChange = (providerId: string) => {
    setSelectedProvider(providerId);
    setSelectedCategory('');
    setSelectedModel('');
    setCustomModelId('');
    setKeyTouched(false);
    setAddTestResult(null);
    setAddTestPassed(false);
    const p = PROVIDER_MAP[providerId];
    if (p && !p.isCustom) {
      setApiBase(p.defaultApiBase);
    } else {
      setApiBase('');
    }
  };

  /** 选择模型类型时：重置模型选择 */
  const handleCategoryChange = (cat: ProviderCategory) => {
    setSelectedCategory(cat);
    setSelectedModel('');
    setCustomModelId('');
    setAddTestResult(null);
    setAddTestPassed(false);
  };

  /** 执行添加前的模型测试 */
  const handleAddTest = async (): Promise<boolean> => {
    if (!selectedCategory || !effectiveModelId || !apiKey.trim()) return false;
    setAddTesting(true);
    setAddTestResult(null);
    setAddTestPassed(false);
    try {
      const config: AIModelConfig = {
        provider: selectedProvider,
        model_name: effectiveModelId,
        api_key: apiKey.trim(),
        api_base: apiBase.trim() || undefined,
      };
      const result = await testModelByCategory(selectedCategory, config);
      setAddTestResult(result);
      setAddTestPassed(result.ok);
      return result.ok;
    } catch (err: any) {
      const failResult: ConnectionTestResult = {
        ok: false, status: 'failed',
        message: '测试请求异常',
        detail: err?.message || '未知错误',
      };
      setAddTestResult(failResult);
      setAddTestPassed(false);
      return false;
    } finally {
      setAddTesting(false);
    }
  };

  /** 保存（先测试，通过才保存） */
  const handleSave = async () => {
    if (!canSave) return;
    // 如果尚未通过测试，先执行测试
    if (!addTestPassed) {
      const passed = await handleAddTest();
      if (!passed) return; // 测试失败，不保存
    }
    setSaving(true);
    try {
      await saveAIModelKey({
        provider: selectedProvider,
        model_name: effectiveModelId,
        api_key: apiKey.trim(),
        api_base: apiBase.trim() || undefined,
      });
      showToast('保存成功', 'success');
      setShowAddModal(false);
      await loadConfigs();
    } catch (error) {
      console.error('Failed to save AI model config:', error);
      showToast('保存失败', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deletingConfig) return;
    try {
      await deleteAIModelConfig(deletingConfig.provider, deletingConfig.model_name);
      showToast('删除成功', 'success');
      setShowDeleteModal(false);
      setDeletingConfig(null);
      await loadConfigs();
    } catch (error) {
      console.error('Failed to delete AI model config:', error);
      showToast('删除失败', 'error');
    }
  };

  const handleToggleEnabled = async (config: AIModelConfig, next: boolean) => {
    try {
      await updateAIModelConfigFlags(config.provider, config.model_name, { enabled: next });
      await loadConfigs();
    } catch {
      showToast('更新状态失败', 'error');
    }
  };

  const handleSetDefault = async (config: AIModelConfig) => {
    try {
      await updateAIModelConfigFlags(config.provider, config.model_name, { is_default: true });
      showToast(`已将 ${getProviderName(config.provider)} · ${config.model_name} 设为默认`, 'success');
      await loadConfigs();
    } catch {
      showToast('设置默认失败', 'error');
    }
  };

  const handleTest = async (config: AIModelConfig) => {
    const key = configKey(config);
    setTesting((t) => ({ ...t, [key]: true }));
    setTestResults((r) => {
      const next = { ...r };
      delete next[key];
      return next;
    });
    try {
      const result = await testAIModelConnection(config);
      setTestResults((r) => ({ ...r, [key]: result }));
    } catch (err) {
      setTestResults((r) => ({ ...r, [key]: { ok: false, status: 'failed', message: '测试异常' } }));
    } finally {
      setTesting((t) => ({ ...t, [key]: false }));
    }
  };

  const enabledCount = configs.filter((c) => c.enabled !== false).length;
  const defaultCount = configs.filter((c) => c.is_default).length;

  // ── 渲染单个配置行（行式简洁布局） ────────────────────────
  const renderConfigRow = (config: AIModelConfig) => {
    const key = configKey(config);
    const isEnabled = config.enabled !== false;
    const result = testResults[key];
    const isTesting = testing[key];

    return (
      <div
        key={key}
        className={`group flex items-center justify-between px-4 py-3.5 rounded-xl transition-colors hover:bg-(--bg-hover) ${
          isEnabled ? '' : 'opacity-50'
        }`}
      >
        {/* 左侧：模型信息 */}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-sm text-(--text-primary) truncate">{config.model_name}</span>
            {config.is_default && (
              <Chip size="sm" color="primary" variant="flat" className="text-xs shrink-0">默认</Chip>
            )}
            {/* 测试结果行内提示 */}
            {result && (
              <span className={`inline-flex items-center gap-1 text-xs ${
                result.status === 'success' ? 'text-green-500' : result.status === 'unknown' ? 'text-amber-500' : 'text-red-500'
              }`}>
                {result.status === 'success' ? <ShieldCheck className="w-3 h-3" /> : <AlertCircle className="w-3 h-3" />}
                {result.status === 'success' ? '可用' : result.status === 'unknown' ? '未知' : '失败'}
              </span>
            )}
          </div>
          <p className="text-xs text-(--text-muted) mt-0.5">{getProviderName(config.provider)}</p>
        </div>

        {/* 右侧：操作 + 开关 */}
        <div className="flex items-center gap-1 shrink-0 ml-4">
          {/* 连接测试 */}
          <Button
            isIconOnly
            size="sm"
            variant="light"
            aria-label="连接测试"
            isDisabled={isTesting}
            onPress={() => handleTest(config)}
            className="opacity-0 group-hover:opacity-100 transition-opacity"
          >
            {isTesting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
          </Button>
          {/* 设为默认 */}
          {!config.is_default && (
            <Button
              isIconOnly
              size="sm"
              variant="light"
              aria-label="设为默认"
              isDisabled={!isEnabled}
              onPress={() => handleSetDefault(config)}
              className="opacity-0 group-hover:opacity-100 transition-opacity"
            >
              <Star className="w-4 h-4" />
            </Button>
          )}
          {/* 删除 */}
          <Button
            isIconOnly
            size="sm"
            variant="light"
            color="danger"
            aria-label="删除配置"
            onPress={() => { setDeletingConfig(config); setShowDeleteModal(true); }}
            className="opacity-0 group-hover:opacity-100 transition-opacity"
          >
            <Trash2 className="w-4 h-4" />
          </Button>
          {/* 启用开关 */}
          <Switch
            size="sm"
            color="success"
            isSelected={isEnabled}
            onValueChange={(v) => handleToggleEnabled(config, v)}
            className="ml-2"
          />
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-6">
      {/* 头部 */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h3 className="text-lg font-semibold text-(--text-primary)">AI 模型配置</h3>
          <p className="text-sm text-(--text-muted) mt-1">配置你自己的 AI 模型密钥，全部加密保存在本地，不上传任何服务器</p>
        </div>
        <Button color="primary" startContent={<Plus className="w-4 h-4" />} onPress={handleAdd}>
          添加模型
        </Button>
      </div>

      {/* 统计 + 搜索 */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2 text-xs text-(--text-muted)">
          <Chip size="sm" variant="flat">{configs.length} 个配置</Chip>
          <Chip size="sm" variant="flat" color="success">{enabledCount} 个启用</Chip>
          {defaultCount > 0 && <Chip size="sm" variant="flat" color="primary">{defaultCount} 个默认</Chip>}
        </div>
        {configs.length > 0 && (
          <Input
            size="sm"
            startContent={<Search className="w-4 h-4 text-(--text-muted)" />}
            placeholder="搜索服务商或模型"
            value={search}
            onValueChange={setSearch}
            className="w-56"
          />
        )}
      </div>

      {/* 配置列表：行式布局 */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <div className="w-8 h-8 border-2 border-(--accent) border-t-transparent rounded-full animate-spin" />
        </div>
      ) : configs.length === 0 ? (
        <div className="py-14 text-center">
          <div className="w-14 h-14 mx-auto mb-4 rounded-2xl bg-(--accent)/10 flex items-center justify-center">
            <MessageSquare className="w-7 h-7 text-(--accent)" />
          </div>
          <p className="text-(--text-primary) font-medium">还没有配置任何 AI 模型</p>
          <p className="text-sm text-(--text-muted) mt-2">点击右上角「添加模型」，选择服务商并填入你的 API Key 即可开始</p>
        </div>
      ) : filteredConfigs.length === 0 ? (
        <div className="py-10 text-center text-sm text-(--text-muted)">没有匹配「{search}」的配置</div>
      ) : (
        <div className="space-y-1">
          {filteredConfigs.map(renderConfigRow)}
        </div>
      )}

      {/* 添加配置模态框 */}
      <Modal isOpen={showAddModal} onClose={() => setShowAddModal(false)} size="md" scrollBehavior="inside">
        <ModalContent>
          <ModalHeader className="flex items-center justify-between">
            <span className="text-base font-semibold text-(--text-primary)">添加模型</span>
          </ModalHeader>
          <ModalBody className="space-y-5">
            {/* 第一步：选择提供商 */}
            <div>
              <label className="block text-sm font-medium text-(--text-primary) mb-1.5">
                <span className="text-red-400 mr-0.5">*</span>提供商
              </label>
              <div className="relative">
                <select
                  value={selectedProvider}
                  onChange={(e) => handleProviderChange(e.target.value)}
                  className="w-full h-10 px-3 pr-8 rounded-lg bg-(--bg-card) border border-(--border-color) text-(--text-primary) text-sm appearance-none cursor-pointer focus:outline-none focus:ring-1 focus:ring-(--accent) hover:border-(--accent)/50 transition-colors"
                >
                  <option value="">选择提供商</option>
                  {MODEL_PROVIDERS.map((p) => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
                <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-(--text-muted) pointer-events-none" />
              </div>
            </div>

            {/* 第二步：选择模型类型（选定提供商后可用） */}
            {selectedProvider && selectedProviderInfo && (
              <div>
                <label className="block text-sm font-medium text-(--text-primary) mb-1.5">
                  <span className="text-red-400 mr-0.5">*</span>模型类型
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {availableCategories.map((cat) => {
                    const meta = CATEGORY_META[cat];
                    const isActive = selectedCategory === cat;
                    return (
                      <button
                        key={cat}
                        type="button"
                        onClick={() => handleCategoryChange(cat)}
                        className={`flex items-center gap-2 px-3 py-2.5 rounded-lg border text-sm font-medium transition-all cursor-pointer ${
                          isActive
                            ? 'border-(--accent) bg-(--accent)/10 text-(--accent)'
                            : 'border-(--border-color) bg-(--bg-card) text-(--text-secondary) hover:border-(--accent)/40'
                        }`}
                      >
                        {meta.icon}
                        <span>{meta.label}</span>
                      </button>
                    );
                  })}
                </div>
                {selectedCategory && (
                  <p className="text-xs text-(--text-muted) mt-1.5">
                    {selectedCategory === 'multimodal' && '支持文本、图像、语音等多种输入输出'}
                    {selectedCategory === 'text' && '纯文本对话与生成'}
                    {selectedCategory === 'image' && '文本生成图像'}
                    {selectedCategory === 'video' && '文本/图像生成视频'}
                  </p>
                )}
              </div>
            )}

            {/* 第三步：选择模型 ID */}
            {selectedCategory && (
              <div>
                <label className="block text-sm font-medium text-(--text-primary) mb-1.5">
                  <span className="text-red-400 mr-0.5">*</span>{isCustomProvider ? '模型 ID' : '模型'}
                </label>
                {isCustomProvider ? (
                  <Input
                    placeholder="输入模型 ID，如 gpt-4o、qwen-max"
                    value={customModelId}
                    onValueChange={(v) => { setCustomModelId(v); setAddTestPassed(false); setAddTestResult(null); }}
                    isInvalid={!!modelError}
                    errorMessage={modelError}
                  />
                ) : (
                  <div className="relative">
                    <select
                      value={selectedModel}
                      onChange={(e) => { setSelectedModel(e.target.value); setAddTestPassed(false); setAddTestResult(null); }}
                      className="w-full h-10 px-3 pr-8 rounded-lg bg-(--bg-card) border border-(--border-color) text-(--text-primary) text-sm appearance-none cursor-pointer focus:outline-none focus:ring-1 focus:ring-(--accent) hover:border-(--accent)/50 transition-colors"
                    >
                      <option value="">选择模型</option>
                      {availableModels.map((m) => (
                        <option key={m} value={m}>{m}</option>
                      ))}
                    </select>
                    <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-(--text-muted) pointer-events-none" />
                  </div>
                )}
                {modelError && !isCustomProvider && (
                  <p className="text-xs text-red-400 mt-1">{modelError}</p>
                )}
              </div>
            )}

            {/* API 密钥 */}
            <div>
              <label className="block text-sm font-medium text-(--text-primary) mb-1.5">
                <span className="text-red-400 mr-0.5">*</span>API 密钥
              </label>
              <div className="relative">
                <Input
                  type={revealKey ? 'text' : 'password'}
                  placeholder="API密钥"
                  value={apiKey}
                  onValueChange={(v) => { setApiKey(v); setAddTestPassed(false); setAddTestResult(null); }}
                  onBlur={() => setKeyTouched(true)}
                  isInvalid={!!keyError}
                  errorMessage={keyError}
                  endContent={
                    <button type="button" onClick={() => setRevealKey((v) => !v)} className="text-(--text-muted) hover:text-(--text-primary)" aria-label="显示密钥">
                      {revealKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  }
                />
              </div>
              {selectedProvider && (
                <p className="text-xs text-(--accent) mt-1.5 cursor-pointer hover:underline">
                  获取 API 密钥
                </p>
              )}
            </div>

            {/* API Base：非自定义提供商自动填充且只读，自定义可编辑 */}
            <div>
              <label className="block text-sm font-medium text-(--text-primary) mb-1.5">
                API Base
                {!isCustomProvider && selectedProvider && (
                  <span className="text-xs text-(--text-muted) font-normal ml-2">已自动填充</span>
                )}
                {isCustomProvider && (
                  <span className="text-red-400 ml-0.5">*</span>
                )}
              </label>
              <Input
                placeholder={isCustomProvider ? 'https://api.example.com/v1' : (selectedProviderInfo?.defaultApiBase || '选择提供商后自动填充')}
                value={apiBase}
                onValueChange={(v) => { setApiBase(v); setAddTestPassed(false); setAddTestResult(null); }}
                isInvalid={!!apiBaseError}
                errorMessage={apiBaseError}
                isReadOnly={!isCustomProvider && !!selectedProvider}
                className={!isCustomProvider && selectedProvider ? 'opacity-80' : ''}
              />
              {!isCustomProvider && selectedProvider && (
                <p className="text-xs text-(--text-muted) mt-1">
                  使用 {selectedProviderInfo?.name} 官方默认地址
                </p>
              )}
            </div>

            {/* 模型测试区域 */}
            {selectedCategory && effectiveModelId && apiKey.trim() && (
              <div className="rounded-lg border border-(--border-color) overflow-hidden">
                <div className="flex items-center justify-between px-3 py-2.5 bg-(--bg-card)">
                  <span className="text-sm font-medium text-(--text-primary)">模型测试</span>
                  <Button
                    size="sm"
                    color={addTestPassed ? 'success' : 'primary'}
                    variant={addTestPassed ? 'flat' : 'solid'}
                    isDisabled={addTesting || !canSave}
                    isLoading={addTesting}
                    startContent={!addTesting && (addTestPassed ? <CheckCircle2 className="w-4 h-4" /> : <Zap className="w-4 h-4" />)}
                    onPress={handleAddTest}
                  >
                    {addTesting ? '测试中…' : addTestPassed ? '测试通过' : '开始测试'}
                  </Button>
                </div>
                {/* 测试说明 */}
                <div className="px-3 py-2 text-xs text-(--text-muted) border-t border-(--border-color)">
                  {selectedCategory === 'text' && '将发送「你好」测试文本对话能力'}
                  {selectedCategory === 'multimodal' && '将发送一张测试图片并询问「这是什么」'}
                  {selectedCategory === 'image' && '将请求生成一张测试图片'}
                  {selectedCategory === 'video' && '将请求生成一段最低画质的小猫走路视频'}
                </div>
                {/* 测试结果 */}
                {addTestResult && (
                  <div className={`px-3 py-2.5 border-t border-(--border-color) ${
                    addTestResult.ok ? 'bg-green-500/5' : 'bg-red-500/5'
                  }`}>
                    <div className={`flex items-start gap-2 text-sm ${
                      addTestResult.ok ? 'text-green-500' : 'text-red-500'
                    }`}>
                      {addTestResult.ok
                        ? <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" />
                        : <XCircle className="w-4 h-4 mt-0.5 shrink-0" />
                      }
                      <div className="min-w-0">
                        <p className="font-medium">{addTestResult.message}</p>
                        {addTestResult.detail && (
                          <p className="text-xs mt-1 opacity-80 break-all font-mono">{addTestResult.detail}</p>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
          </ModalBody>
          <ModalFooter>
            <Button variant="light" onPress={() => setShowAddModal(false)}>取消</Button>
            <Button
              color="primary"
              onPress={handleSave}
              isLoading={saving || addTesting}
              isDisabled={!canSave}
            >
              {saving ? '保存中' : addTesting ? '测试中…' : addTestPassed ? '添加' : '测试并添加'}
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>

      {/* 删除确认模态框 */}
      <Modal isOpen={showDeleteModal} onClose={() => setShowDeleteModal(false)}>
        <ModalContent>
          <ModalHeader className="flex items-center gap-2">
            <AlertCircle className="w-5 h-5 text-red-500" /> 确认删除
          </ModalHeader>
          <ModalBody>
            <p className="text-(--text-primary)">
              确定要删除 <strong>{deletingConfig && getProviderName(deletingConfig.provider)}</strong> 的{' '}
              <strong>{deletingConfig?.model_name}</strong> 配置吗？
            </p>
            <p className="text-sm text-(--text-muted) mt-2">此操作无法撤销，本地保存的密钥将被清除</p>
          </ModalBody>
          <ModalFooter>
            <Button variant="light" onPress={() => setShowDeleteModal(false)}>取消</Button>
            <Button color="danger" onPress={handleDelete} startContent={<X className="w-4 h-4" />}>删除</Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </div>
  );
};

export default AIModelSettings;
