import React, { useState, useEffect, useMemo } from 'react';
import {
  Button, Input, Card, CardBody, Chip, Switch,
  Modal, ModalContent, ModalHeader, ModalBody, ModalFooter,
} from '@heroui/react';
import {
  Plus, Trash2, Eye, EyeOff, Star, Search, Zap,
  Loader2, ShieldCheck, MessageSquare, Image as ImageIcon, Clapperboard, X, AlertCircle,
} from 'lucide-react';
import { useToast } from '../../contexts/ToastContext';
import {
  saveAIModelKey, listAIModelConfigs, deleteAIModelConfig,
  updateAIModelConfigFlags, testAIModelConnection, DEFAULT_API_BASES,
  type AIModelConfig, type ConnectionTestResult,
} from '../../services/localApi';

// ─── 提供商目录 ───────────────────────────────────────────────
type ProviderCategory = 'multimodal' | 'text' | 'image' | 'video';

interface ModelProvider {
  id: string;
  name: string;
  category: ProviderCategory;
  models: string[];
  apiBasePlaceholder: string;
  requiresApiBase: boolean;
  color: string;
}

const CATEGORY_META: Record<ProviderCategory, { label: string; icon: React.ReactNode }> = {
  multimodal: { label: '多模态', icon: <Zap className="w-3.5 h-3.5" /> },
  text: { label: '文本模型', icon: <MessageSquare className="w-3.5 h-3.5" /> },
  image: { label: '图片模型', icon: <ImageIcon className="w-3.5 h-3.5" /> },
  video: { label: '视频模型', icon: <Clapperboard className="w-3.5 h-3.5" /> },
};

const MODEL_PROVIDERS: ModelProvider[] = [
  { id: 'deepseek', name: 'DeepSeek', category: 'text', models: ['deepseek-chat', 'deepseek-reasoner'], apiBasePlaceholder: 'https://api.deepseek.com/v1', requiresApiBase: false, color: '#4d6bfe' },
  { id: 'qwen', name: '通义千问', category: 'text', models: ['qwen-turbo', 'qwen-plus', 'qwen-max'], apiBasePlaceholder: 'https://dashscope.aliyuncs.com/compatible-mode/v1', requiresApiBase: false, color: '#615ced' },
  { id: 'doubao', name: '豆包', category: 'text', models: ['doubao-pro-4k', 'doubao-pro-32k', 'doubao-pro-128k'], apiBasePlaceholder: 'https://ark.cn-beijing.volces.com/api/v3', requiresApiBase: false, color: '#ff752d' },
  { id: 'zhipu', name: '智谱 AI', category: 'text', models: ['glm-4-plus', 'glm-4v', 'glm-4-flash'], apiBasePlaceholder: 'https://open.bigmodel.cn/api/paas/v4', requiresApiBase: false, color: '#3b82f6' },
  { id: 'openai', name: 'OpenAI', category: 'multimodal', models: ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo'], apiBasePlaceholder: 'https://api.openai.com/v1', requiresApiBase: false, color: '#10a37f' },
  { id: 'kling', name: '可灵', category: 'video', models: ['kling-v1', 'kling-v1-5', 'kling-v2-master'], apiBasePlaceholder: 'https://api.klingai.com', requiresApiBase: false, color: '#00c2a8' },
  { id: 'seedance', name: 'Seedance', category: 'video', models: ['seedance-1-0-lite', 'seedance-1-0-pro'], apiBasePlaceholder: '', requiresApiBase: true, color: '#8b5cf6' },
  { id: 'vidu', name: 'Vidu', category: 'video', models: ['viduq1', 'vidu2.0'], apiBasePlaceholder: 'https://api.vidu.cn', requiresApiBase: false, color: '#ef4444' },
];

const PROVIDER_MAP: Record<string, ModelProvider> = Object.fromEntries(MODEL_PROVIDERS.map((p) => [p.id, p]));

const getProviderName = (id: string) => PROVIDER_MAP[id]?.name || id;
const getCategory = (id: string): ProviderCategory => PROVIDER_MAP[id]?.category || 'text';
const configKey = (c: { provider: string; model_name: string }) => `${c.provider}::${c.model_name}`;

// ─── 小组件：字母头像 ─────────────────────────────────────────
const ProviderAvatar: React.FC<{ providerId: string }> = ({ providerId }) => {
  const p = PROVIDER_MAP[providerId];
  const label = p?.name?.slice(0, 1) || providerId.slice(0, 1).toUpperCase();
  return (
    <div
      className="w-9 h-9 rounded-lg flex items-center justify-center text-white font-semibold shrink-0"
      style={{ background: p?.color || '#64748b' }}
    >
      {label}
    </div>
  );
};

const AIModelSettings: React.FC = () => {
  const { showToast } = useToast();
  const [configs, setConfigs] = useState<AIModelConfig[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');

  const [showAddModal, setShowAddModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deletingConfig, setDeletingConfig] = useState<AIModelConfig | null>(null);
  const [visibleKeys, setVisibleKeys] = useState<Set<string>>(new Set());

  // 连接测试状态
  const [testing, setTesting] = useState<Record<string, boolean>>({});
  const [testResults, setTestResults] = useState<Record<string, ConnectionTestResult>>({});

  // 新增表单
  const [selectedProvider, setSelectedProvider] = useState('');
  const [selectedModel, setSelectedModel] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [apiBase, setApiBase] = useState('');
  const [revealKey, setRevealKey] = useState(false);
  const [keyTouched, setKeyTouched] = useState(false);
  const [saving, setSaving] = useState(false);

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
  const keyError = apiKey && apiKey.trim().length < 8
    ? '密钥长度过短，请检查是否完整粘贴'
    : (keyTouched && !apiKey.trim() ? '请填写 API Key' : '');
  const apiBaseError = selectedProviderInfo?.requiresApiBase && !apiBase.trim()
    ? '该服务商需要手动填写 API Base'
    : '';
  const canSave = !!selectedProvider && !!selectedModel && !!apiKey.trim() && !keyError && !apiBaseError;

  // ── 过滤后的配置列表（分组用） ──────────────────────────
  const filteredConfigs = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return configs;
    return configs.filter(
      (c) => getProviderName(c.provider).toLowerCase().includes(q) || c.model_name.toLowerCase().includes(q),
    );
  }, [configs, search]);

  const groupedConfigs = useMemo(() => {
    const groups: Record<ProviderCategory, AIModelConfig[]> = { multimodal: [], text: [], image: [], video: [] };
    filteredConfigs.forEach((c) => groups[getCategory(c.provider)].push(c));
    return groups;
  }, [filteredConfigs]);

  const handleAdd = () => {
    setSelectedProvider('');
    setSelectedModel('');
    setApiKey('');
    setApiBase('');
    setRevealKey(false);
    setKeyTouched(false);
    setShowAddModal(true);
  };

  const handleSave = async () => {
    if (!canSave) return;
    setSaving(true);
    try {
      await saveAIModelKey({
        provider: selectedProvider,
        model_name: selectedModel,
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

  const toggleKeyVisibility = (key: string) => {
    setVisibleKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  const maskApiKey = (key: string) => (key.length <= 8 ? '****' : `${key.slice(0, 4)}****${key.slice(-4)}`);

  const enabledCount = configs.filter((c) => c.enabled !== false).length;
  const defaultCount = configs.filter((c) => c.is_default).length;

  // ── 渲染单个配置卡片 ────────────────────────────────────
  const renderConfigCard = (config: AIModelConfig) => {
    const key = configKey(config);
    const isVisible = visibleKeys.has(key);
    const isEnabled = config.enabled !== false;
    const result = testResults[key];
    const isTesting = testing[key];

    return (
      <Card key={key} className={`${isEnabled ? '' : 'opacity-60'}`}>
        <CardBody className="space-y-3">
          {/* 头部 */}
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <ProviderAvatar providerId={config.provider} />
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <h4 className="font-semibold text-(--text-primary) truncate">{getProviderName(config.provider)}</h4>
                  {config.is_default && (
                    <Chip size="sm" color="primary" variant="flat" startContent={<Star className="w-3 h-3" />}>默认</Chip>
                  )}
                </div>
                <p className="text-xs text-(--text-muted) font-mono truncate">{config.model_name}</p>
              </div>
            </div>
            {/* 启用开关 */}
            <div className="flex items-center gap-2 shrink-0">
              <span className="text-xs text-(--text-muted)">{isEnabled ? '已启用' : '已停用'}</span>
              <Switch
                size="sm"
                color="success"
                isSelected={isEnabled}
                onValueChange={(v) => handleToggleEnabled(config, v)}
              />
            </div>
          </div>

          {/* API Key */}
          <div>
            <label className="text-xs text-(--text-muted)">API Key</label>
            <div className="flex items-center gap-2 mt-1">
              <Input
                type={isVisible ? 'text' : 'password'}
                value={isVisible ? config.api_key : maskApiKey(config.api_key)}
                readOnly
                size="sm"
                className="flex-1"
              />
              <Button isIconOnly size="sm" variant="light" onPress={() => toggleKeyVisibility(key)} aria-label="显示/隐藏密钥">
                {isVisible ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </Button>
            </div>
          </div>
          {config.api_base && (
            <div>
              <label className="text-xs text-(--text-muted)">API Base</label>
              <p className="text-xs text-(--text-secondary) mt-0.5 font-mono break-all">{config.api_base}</p>
            </div>
          )}

          {/* 测试结果 */}
          {result && (
            <div
              className={`flex items-center gap-1.5 text-xs rounded-lg px-2.5 py-1.5 ${
                result.status === 'success'
                  ? 'bg-green-500/10 text-green-500'
                  : result.status === 'unknown'
                    ? 'bg-amber-500/10 text-amber-500'
                    : 'bg-red-500/10 text-red-500'
              }`}
            >
              {result.status === 'success' ? <ShieldCheck className="w-3.5 h-3.5" /> : <AlertCircle className="w-3.5 h-3.5" />}
              <span>{result.message}</span>
            </div>
          )}

          {/* 操作栏 */}
          <div className="flex items-center gap-2 pt-1">
            <Button
              size="sm"
              variant="flat"
              color={result?.status === 'success' ? 'success' : 'default'}
              startContent={isTesting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
              isLoading={false}
              isDisabled={isTesting}
              onPress={() => handleTest(config)}
            >
              {isTesting ? '测试中' : '连接测试'}
            </Button>
            {!config.is_default && (
              <Button
                size="sm"
                variant="light"
                startContent={<Star className="w-4 h-4" />}
                isDisabled={!isEnabled}
                onPress={() => handleSetDefault(config)}
              >
                设为默认
              </Button>
            )}
            <Button
              isIconOnly
              size="sm"
              color="danger"
              variant="light"
              aria-label="删除配置"
              onPress={() => { setDeletingConfig(config); setShowDeleteModal(true); }}
            >
              <Trash2 className="w-4 h-4" />
            </Button>
          </div>
        </CardBody>
      </Card>
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

      {/* 配置列表 */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <div className="w-8 h-8 border-2 border-(--accent) border-t-transparent rounded-full animate-spin" />
        </div>
      ) : configs.length === 0 ? (
        <Card>
          <CardBody className="py-14">
            <div className="text-center max-w-sm mx-auto">
              <div className="w-14 h-14 mx-auto mb-4 rounded-2xl bg-(--accent)/10 flex items-center justify-center">
                <MessageSquare className="w-7 h-7 text-(--accent)" />
              </div>
              <p className="text-(--text-primary) font-medium">还没有配置任何 AI 模型</p>
              <p className="text-sm text-(--text-muted) mt-2">点击右上角「添加模型」，选择服务商并填入你的 API Key 即可开始</p>
            </div>
          </CardBody>
        </Card>
      ) : filteredConfigs.length === 0 ? (
        <Card>
          <CardBody className="py-10 text-center text-sm text-(--text-muted)">没有匹配「{search}」的配置</CardBody>
        </Card>
      ) : (
        <div className="space-y-6">
          {(['multimodal', 'text', 'image', 'video'] as ProviderCategory[]).map((cat) => {
            const items = groupedConfigs[cat];
            if (items.length === 0) return null;
            return (
              <div key={cat} className="space-y-3">
                <div className="flex items-center gap-2 text-sm font-medium text-(--text-secondary)">
                  {CATEGORY_META[cat].icon}
                  <span>{CATEGORY_META[cat].label}</span>
                  <span className="text-xs text-(--text-muted)">({items.length})</span>
                </div>
                <div className="grid gap-4 md:grid-cols-2">
                  {items.map(renderConfigCard)}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* 添加配置模态框 */}
      <Modal isOpen={showAddModal} onClose={() => setShowAddModal(false)} size="md" scrollBehavior="inside">
        <ModalContent>
          <ModalHeader className="flex items-center justify-between">
            <span className="text-base font-semibold text-(--text-primary)">添加模型</span>
          </ModalHeader>
          <ModalBody className="space-y-5">
            {/* 提供商 */}
            <div>
              <label className="block text-sm font-medium text-(--text-primary) mb-1.5">
                <span className="text-red-400 mr-0.5">*</span>提供商
              </label>
              <select
                value={selectedProvider}
                onChange={(e) => {
                  setSelectedProvider(e.target.value);
                  setSelectedModel('');
                  const p = PROVIDER_MAP[e.target.value];
                  setApiBase(p?.apiBasePlaceholder || '');
                  setKeyTouched(false);
                }}
                className="w-full h-10 px-3 rounded-lg bg-(--bg-card) border border-(--border-color) text-(--text-primary) text-sm appearance-none cursor-pointer focus:outline-none focus:ring-1 focus:ring-(--accent) hover:border-(--accent)/50 transition-colors"
              >
                <option value="">选择提供商</option>
                {(['multimodal', 'text', 'image', 'video'] as ProviderCategory[]).map((cat) => {
                  const list = MODEL_PROVIDERS.filter((p) => p.category === cat);
                  if (list.length === 0) return null;
                  return (
                    <optgroup key={cat} label={CATEGORY_META[cat].label}>
                      {list.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                    </optgroup>
                  );
                })}
              </select>
            </div>

            {/* 模型分类（自动派生） */}
            {selectedProvider && selectedProviderInfo && (
              <div>
                <label className="block text-sm font-medium text-(--text-primary) mb-1.5">模型分类</label>
                <div className="flex items-center gap-2 h-10 px-3 rounded-lg bg-(--bg-card) border border-(--border-color)">
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-(--accent)/15 text-(--accent)">
                    {CATEGORY_META[selectedProviderInfo.category].label}
                  </span>
                  <span className="text-xs text-(--text-muted)">
                    {selectedProviderInfo.category === 'multimodal' && '支持文本、图像、语音等多种输入输出'}
                    {selectedProviderInfo.category === 'text' && '纯文本对话与生成'}
                    {selectedProviderInfo.category === 'image' && '文本生成图像'}
                    {selectedProviderInfo.category === 'video' && '文本/图像生成视频'}
                  </span>
                </div>
              </div>
            )}

            {/* 模型 */}
            <div>
              <label className="block text-sm font-medium text-(--text-primary) mb-1.5">
                <span className="text-red-400 mr-0.5">*</span>模型
              </label>
              <select
                value={selectedModel}
                onChange={(e) => setSelectedModel(e.target.value)}
                disabled={!selectedProvider}
                className="w-full h-10 px-3 rounded-lg bg-(--bg-card) border border-(--border-color) text-(--text-primary) text-sm appearance-none cursor-pointer focus:outline-none focus:ring-1 focus:ring-(--accent) hover:border-(--accent)/50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <option value="">{selectedProvider ? '选择模型' : '请先选择提供商'}</option>
                {selectedProviderInfo?.models.map((m) => (
                  <option key={m} value={m}>{m}</option>
                ))}
              </select>
            </div>

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
                  onValueChange={setApiKey}
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

            {/* API Base（可选） */}
            <div>
              <label className="block text-sm font-medium text-(--text-primary) mb-1.5">API Base（可选）</label>
              <Input
                placeholder={selectedProviderInfo?.apiBasePlaceholder || 'https://api.example.com/v1'}
                value={apiBase}
                onValueChange={setApiBase}
                isInvalid={!!apiBaseError}
                errorMessage={apiBaseError}
              />
              <p className="text-xs text-(--text-muted) mt-1">
                留空则使用默认地址{DEFAULT_API_BASES[selectedProvider] ? `（${DEFAULT_API_BASES[selectedProvider]}）` : ''}
              </p>
            </div>
          </ModalBody>
          <ModalFooter>
            <Button variant="light" onPress={() => setShowAddModal(false)}>取消</Button>
            <Button color="primary" onPress={handleSave} isLoading={saving} isDisabled={!canSave}>
              添加
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
