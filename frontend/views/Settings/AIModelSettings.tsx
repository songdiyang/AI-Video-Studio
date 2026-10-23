import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import {
  Button, Input, Tooltip,
  Modal, ModalContent, ModalHeader, ModalBody, ModalFooter,
} from '@heroui/react';
import {
  Plus, Trash2, Star, Search, Zap, Pencil,
  Loader2, ShieldCheck, MessageSquare, Image as ImageIcon, Clapperboard, X, AlertCircle,
  CheckCircle2, XCircle, ChevronDown, Eye, EyeOff, Check,
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
  /** 品牌徽标首字母缩写（无真实 logo 资源时的品牌标识降级方案） */
  abbr: string;
  /** 品牌 logo 图片路径（public/providers 下，可选；缺失时回退缩写徽标） */
  logoUrl?: string;
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
    supportedCategories: ['text', 'multimodal'],
    modelsByCategory: {
      text: ['deepseek-chat'],
      multimodal: ['deepseek-reasoner'],
    },
    defaultApiBase: 'https://api.deepseek.com/v1', isCustom: false, color: '#4d6bfe', abbr: 'DS', logoUrl: '/providers/deepseek.svg',
  },
  {
    id: 'qwen', name: '通义千问',
    supportedCategories: ['text', 'multimodal'],
    modelsByCategory: {
      text: ['qwen-turbo', 'qwen-plus', 'qwen-max', 'qwen-long'],
      multimodal: ['qwen-vl-plus', 'qwen-vl-max'],
    },
    defaultApiBase: 'https://dashscope.aliyuncs.com/compatible-mode/v1', isCustom: false, color: '#615ced', abbr: 'QW', logoUrl: '/providers/qwen.svg',
  },
  {
    id: 'doubao', name: '火山引擎',
    supportedCategories: ['text', 'multimodal', 'image', 'video'],
    modelsByCategory: {
      text: ['doubao-seed-evolving', 'doubao-seed-2-1-pro-260915', 'doubao-seed-2-1-lite-260915', 'doubao-seed-2-1-turbo-260628'],
      multimodal: ['doubao-seed-evolving', 'doubao-seed-2-1-pro-260915', 'doubao-seed-2-1-lite-260915', 'doubao-seed-2-1-turbo-260628'],
      // 图片：官方当前推荐的 Seedream 5.0 pro / flash（旧版 5.0 lite 及 4.x 已标注即将下线，不再提供）
      image: ['doubao-seedream-5-0-pro-260628', 'doubao-seedream-5-0-flash-260915'],
      video: ['doubao-seedance-2-5-260628', 'doubao-seedance-2-0-260128', 'doubao-seedance-2-0-fast-260128', 'doubao-seedance-2-0-mini-260615'],
    },
    defaultApiBase: 'https://ark.cn-beijing.volces.com/api/v3', isCustom: false, color: '#ff752d', abbr: '火山', logoUrl: '/providers/doubao.svg',
  },
  {
    id: 'zhipu', name: '智谱 AI',
    supportedCategories: ['text', 'multimodal'],
    modelsByCategory: {
      text: ['glm-4-plus', 'glm-4-flash', 'glm-4-long'],
      multimodal: ['glm-4v', 'glm-4v-plus'],
    },
    defaultApiBase: 'https://open.bigmodel.cn/api/paas/v4', isCustom: false, color: '#3b82f6', abbr: 'GLM', logoUrl: '/providers/zhipu.svg',
  },
  {
    id: 'openai', name: 'OpenAI',
    supportedCategories: ['multimodal', 'text', 'image'],
    modelsByCategory: {
      multimodal: ['gpt-4o', 'gpt-4o-mini', 'gpt-4-vision-preview'],
      text: ['gpt-4-turbo', 'gpt-3.5-turbo'],
      image: ['dall-e-3', 'dall-e-2'],
    },
    defaultApiBase: 'https://api.openai.com/v1', isCustom: false, color: '#10a37f', abbr: 'OA', logoUrl: '/providers/openai.svg',
  },
  {
    id: 'kling', name: '可灵',
    supportedCategories: ['video'],
    modelsByCategory: { video: ['kling-v1', 'kling-v1-5', 'kling-v2-master'] },
    defaultApiBase: 'https://api.klingai.com', isCustom: false, color: '#00c2a8', abbr: 'KL', logoUrl: '/providers/kling.svg',
  },
  {
    id: 'seedance', name: 'Seedance',
    supportedCategories: ['video'],
    modelsByCategory: { video: ['seedance-1-0-lite', 'seedance-1-0-pro'] },
    defaultApiBase: '', isCustom: true, color: '#8b5cf6', abbr: 'SD', logoUrl: '/providers/seedance.svg',
  },
  {
    id: 'vidu', name: 'Vidu',
    supportedCategories: ['video'],
    modelsByCategory: { video: ['viduq1', 'vidu2.0'] },
    defaultApiBase: 'https://api.vidu.cn', isCustom: false, color: '#ef4444', abbr: 'VD', logoUrl: '/providers/vidu.svg',
  },
  {
    id: 'custom', name: '自定义',
    supportedCategories: ['text', 'multimodal', 'image', 'video'],
    modelsByCategory: {},
    defaultApiBase: '', isCustom: true, color: '#64748b', abbr: '自',
  },
];

const PROVIDER_MAP: Record<string, ModelProvider> = Object.fromEntries(MODEL_PROVIDERS.map((p) => [p.id, p]));

/** 添加/编辑模型时开放选择的提供商（当前仅 DeepSeek 与火山引擎） */
const SELECTABLE_PROVIDERS = MODEL_PROVIDERS.filter((p) => p.id === 'deepseek' || p.id === 'doubao');

const getProviderName = (id: string) => PROVIDER_MAP[id]?.name || id;
const configKey = (c: { provider: string; model_name: string }) => `${c.provider}::${c.model_name}`;
/** 从已有配置反推类别（编辑回填 / 卡片标签展示用） */
const inferCategory = (c: { provider: string; model_name: string }): ProviderCategory => {
  const p = PROVIDER_MAP[c.provider];
  if (!p) return 'text';
  const found = p.supportedCategories.find((cat) => (p.modelsByCategory[cat] ?? []).includes(c.model_name));
  return found || p.supportedCategories[0] || 'text';
};

// ─── 统一输入控件样式（正常/聚焦/错误/禁用仅靠边框与文字色区分） ──────
const inputWrapperBase =
  'bg-(--bg-input) border border-(--border-color) rounded-lg h-10 px-3 transition-colors ' +
  'hover:border-(--accent)/50 data-[focus=true]:border-(--accent) data-[focus=true]:ring-1 data-[focus=true]:ring-(--accent)/30 ' +
  'data-[invalid=true]:border-(--danger) data-[invalid=true]:bg-(--bg-input) shadow-none';
const inputClassNames = {
  inputWrapper: inputWrapperBase,
  input: 'text-sm text-(--text-primary) placeholder:text-(--text-muted)',
  errorMessage: 'hidden', // 错误提示统一由 FieldError 渲染，避免 HeroUI 默认红块
};

// ─── 轻量错误提示（细红边 + 小图标 + 小一号文字，替代整块红填充） ──────
const FieldError: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <p className="flex items-center gap-1 mt-1.5 text-xs text-(--danger)">
    <AlertCircle className="w-3.5 h-3.5 shrink-0" />
    <span>{children}</span>
  </p>
);

// ─── 统一表单标签（必填星号基线对齐；strong=必填加重，默认次级减弱） ──────
const FieldLabel: React.FC<{
  required?: boolean;
  strong?: boolean;
  step?: number;
  children: React.ReactNode;
  trailing?: React.ReactNode;
}> = ({ required, strong = true, step, children, trailing }) => (
  <label className={`flex items-center gap-1.5 mb-1.5 text-sm text-(--text-primary) ${strong ? 'font-medium' : 'font-normal text-(--text-secondary)'}`}>
    {step != null && (
      <span className="inline-flex items-center justify-center rounded-full bg-(--accent)/15 text-(--accent) text-[10px] font-semibold shrink-0" style={{ width: 18, height: 18 }}>
        {step}
      </span>
    )}
    {required && <span className="text-(--danger) leading-none">*</span>}
    <span className="truncate">{children}</span>
    {trailing && <span className="ml-auto pl-2 shrink-0">{trailing}</span>}
  </label>
);

// ─── 提供商品牌徽标（优先真实 logo 图片，加载失败回退品牌色缩写徽标） ──
const ProviderBadge: React.FC<{ color: string; abbr: string; logoUrl?: string; className?: string }> = ({ color, abbr, logoUrl, className = '' }) => {
  const [imgFailed, setImgFailed] = useState(false);
  if (logoUrl && !imgFailed) {
    return (
      <span className={`inline-flex items-center justify-center w-5 h-5 rounded-md shrink-0 overflow-hidden ${className}`}>
        <img
          src={logoUrl}
          alt={abbr}
          className="w-full h-full object-contain"
          onError={() => setImgFailed(true)}
        />
      </span>
    );
  }
  return (
    <span
      className={`inline-flex items-center justify-center w-5 h-5 rounded-md text-white font-semibold shrink-0 ${className}`}
      style={{ backgroundColor: color, fontSize: abbr.length > 2 ? 8 : 10, letterSpacing: abbr.length > 2 ? 0 : 0.5 }}
    >
      {abbr}
    </span>
  );
};

// ─── 分组式自定义下拉（深色面板 / hover 高亮 / 选中对勾 / 键盘导航） ──
interface SelectOption { id: string; name: string; color?: string; abbr?: string; logoUrl?: string }
interface SelectGroup { title?: string; options: SelectOption[] }

const GroupedSelect: React.FC<{
  value: string;
  onChange: (id: string) => void;
  placeholder: string;
  groups: SelectGroup[];
  ariaLabel?: string;
}> = ({ value, onChange, placeholder, groups, ariaLabel }) => {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const [popupStyle, setPopupStyle] = useState<React.CSSProperties>({});
  const [isPositioned, setIsPositioned] = useState(false); // 跟踪位置是否已计算
  const flat = useMemo(() => groups.flatMap((g) => g.options), [groups]);
  const selectedIndex = flat.findIndex((o) => o.id === value);
  const [activeIndex, setActiveIndex] = useState(selectedIndex);
  const selectedOpt = flat.find((o) => o.id === value);
  const selectedName = selectedOpt?.name;

  // 弹层 portal 到 body，用 fixed 定位贴合触发器，避免被 Modal 的 overflow 裁剪导致滑不到底
  // 注意：位置/尺寸未发生变化时必须跳过 setState。否则在工作台这类持续滚动/动画的上下文里，
  // 全局捕获 scroll 监听会不断触发「setState(新对象)→重渲染」形成重渲染风暴，打满 WebView2 渲染主线程导致窗口崩溃退出。
  const updatePosition = useCallback(() => {
    const trigger = triggerRef.current;
    if (!trigger) return;
    const rect = trigger.getBoundingClientRect();
    const margin = 8;
    const viewportH = window.innerHeight;
    const spaceBelow = viewportH - rect.bottom - margin;
    const spaceAbove = rect.top - margin;
    const flipUp = spaceBelow < 220 && spaceAbove > spaceBelow;
    const available = flipUp ? spaceAbove : spaceBelow;
    const maxHeight = Math.max(160, Math.min(320, available));
    const top = flipUp ? undefined : rect.bottom + 4;
    const bottom = flipUp ? viewportH - rect.top + 4 : undefined;
    setPopupStyle((prev) => {
      if (
        prev.left === rect.left &&
        prev.width === rect.width &&
        prev.maxHeight === maxHeight &&
        prev.top === top &&
        prev.bottom === bottom
      ) {
        return prev; // 数值未变则复用旧对象，避免无谓重渲染
      }
      const next: React.CSSProperties = {
        position: 'fixed',
        left: rect.left,
        width: rect.width,
        maxHeight,
        zIndex: 'var(--z-popup)', // 使用全局 z-index 变量，确保在 Modal 之上
      };
      if (bottom != null) next.bottom = bottom;
      if (top != null) next.top = top;
      return next;
    });
    setIsPositioned(true); // 标记位置已计算
  }, []);

  useEffect(() => {
    if (open) setActiveIndex(selectedIndex >= 0 ? selectedIndex : 0);
  }, [open, selectedIndex]);

  // 键盘导航 / 展开时，让高亮项平滑滚动进可视区
  useEffect(() => {
    if (!open || !listRef.current) return;
    const el = listRef.current.querySelector<HTMLElement>(`[data-idx="${activeIndex}"]`);
    el?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [activeIndex, open]);

  useEffect(() => {
    if (!open) {
      setIsPositioned(false); // 关闭时重置定位状态
      return;
    }
    
    // 使用 requestAnimationFrame 确保 DOM 已渲染后再计算位置
    // 第一次打开时需要等待下一帧，确保 trigger 元素已经完成渲染
    const raf = requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        updatePosition();
      });
    });
    
    // 防止背景滚动
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    
    // rAF 节流：多次 scroll/resize 合并到每帧一次，避免平滑滚动逐帧触发重排
    let rafScroll = 0;
    const onScrollOrResize = () => {
      if (rafScroll) return;
      rafScroll = requestAnimationFrame(() => {
        rafScroll = 0;
        updatePosition();
      });
    };
    window.addEventListener('scroll', onScrollOrResize, true);
    window.addEventListener('resize', onScrollOrResize);
    return () => {
      cancelAnimationFrame(raf);
      if (rafScroll) cancelAnimationFrame(rafScroll);
      window.removeEventListener('scroll', onScrollOrResize, true);
      window.removeEventListener('resize', onScrollOrResize);
      // 恢复背景滚动
      document.body.style.overflow = originalOverflow;
    };
  }, [open, updatePosition]);

  useEffect(() => {
    if (!open) return;
    const onDocMouseDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (rootRef.current?.contains(target) || listRef.current?.contains(target)) return;
      setOpen(false);
    };
    document.addEventListener('mousedown', onDocMouseDown);
    return () => document.removeEventListener('mousedown', onDocMouseDown);
  }, [open]);


  const commit = (idx: number) => {
    const opt = flat[idx];
    if (opt) { onChange(opt.id); setOpen(false); }
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') { setOpen(false); return; }
    if (!open && (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'Enter' || e.key === ' ')) {
      e.preventDefault(); setOpen(true); return;
    }
    if (open) {
      if (e.key === 'ArrowDown') { e.preventDefault(); setActiveIndex((i) => Math.min(flat.length - 1, i + 1)); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); setActiveIndex((i) => Math.max(0, i - 1)); }
      else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); commit(activeIndex); }
    }
  };

  let runningIndex = -1;

  return (
    <div ref={rootRef} className="relative">
      <button
        ref={triggerRef}
        type="button"
        role="combobox"
        aria-expanded={open}
        aria-label={ariaLabel}
        onClick={() => setOpen((v) => !v)}
        onKeyDown={onKeyDown}
        className={`flex w-full h-10 items-center justify-between gap-2 px-3 rounded-lg bg-(--bg-input) border text-sm transition-colors cursor-pointer focus:outline-none focus:ring-1 focus:ring-(--accent) ${
          open ? 'border-(--accent) ring-1 ring-(--accent)' : 'border-(--border-color) hover:border-(--accent)/60'
        }`}
      >
        <span className={`flex items-center gap-2 truncate ${selectedName ? 'text-(--text-primary)' : 'text-(--text-secondary)'}`}>
          {selectedOpt?.color && selectedOpt?.abbr && <ProviderBadge color={selectedOpt.color} abbr={selectedOpt.abbr} logoUrl={selectedOpt.logoUrl} />}
          <span className="truncate">{selectedName || placeholder}</span>
        </span>
        <ChevronDown className={`w-4 h-4 shrink-0 text-(--text-muted) transition-transform duration-200 ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && createPortal(
        <div
          ref={listRef}
          className={`overflow-y-auto overscroll-contain rounded-lg border border-(--border-color) py-1 animate-dropdown-in dropdown-scroll shadow-[0_8px_24px_rgba(0,0,0,0.4)] transition-opacity ${
            isPositioned ? 'opacity-100' : 'opacity-0'
          }`}
          style={{ ...popupStyle, backgroundColor: 'var(--bg-popover)' }}
          onWheel={(e) => e.stopPropagation()}
          onTouchMove={(e) => e.stopPropagation()}
          // 弹层 portal 到 body，是 Modal overlay 的兄弟节点；不阻断冒泡时，点击选项的
          // pointerdown/mousedown 会冒泡到 document，被 HeroUI Modal 的 useInteractOutside
          // 判定为「点击遮罩外部」而关闭整个弹窗。阻断这两个事件即可让父级弹窗收不到该点击。
          onPointerDown={(e) => e.stopPropagation()}
          onMouseDown={(e) => e.stopPropagation()}
        >
          {groups.map((g, gi) => (
            <React.Fragment key={`${g.title ?? 'g'}-${gi}`}>
              {gi > 0 && <div className="mx-3 my-1.5 h-px bg-(--border-color)" />}
              {g.title && (
                <div className="px-3 pt-2 pb-1 text-[11px] font-semibold tracking-wide text-(--text-secondary) select-none">
                  {g.title}
                </div>
              )}
              {g.options.map((opt) => {
                runningIndex += 1;
                const idx = runningIndex;
                const isSelected = opt.id === value;
                const isActive = idx === activeIndex;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    data-idx={idx}
                    onClick={() => commit(idx)}
                    onMouseEnter={() => setActiveIndex(idx)}
                    className={`flex items-center gap-2.5 w-[calc(100%-8px)] mx-1 px-2.5 py-2 rounded-lg text-sm text-left transition-colors cursor-pointer ${
                      isActive ? 'bg-white/10' : ''
                    } ${isSelected ? 'text-(--accent) font-medium' : 'text-(--text-primary)'}`}
                  >
                    {opt.color && opt.abbr && <ProviderBadge color={opt.color} abbr={opt.abbr} logoUrl={opt.logoUrl} />}
                    <span className="flex-1 truncate">{opt.name}</span>
                    {isSelected && <Check className="w-4 h-4 shrink-0" />}
                  </button>
                );
              })}
            </React.Fragment>
          ))}
        </div>,
        // 关键：portal 到最近的 [role=dialog]（父级 Modal 容器）内部，而非 document.body。
        // HeroUI Modal 用 react-aria useInteractOutside 判定「点击外部」并 preventDefault + 关闭弹窗；
        // 若弹层是 body 直子（overlay 的兄弟），点选提供商/模型的 pointerdown 会被判为外部，
        // 导致 onClick 不触发（不提交）且整个弹窗被关闭。放进 dialog 内即视为 overlay 内部，
        // 由于 dialog 及其祖先均无 transform/filter，position:fixed 仍按视口定位、不会被裁剪。
        (rootRef.current && rootRef.current.closest('[role=dialog]')) || document.body,
      )}
    </div>
  );
};

const AIModelSettings: React.FC = () => {
  const { showToast } = useToast();
  const [configs, setConfigs] = useState<AIModelConfig[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');

  const [showAddModal, setShowAddModal] = useState(false);
  const [editingConfig, setEditingConfig] = useState<AIModelConfig | null>(null);
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
    : (apiKey && /[^\x00-\xFF]/.test(apiKey) ? '密钥包含非法字符（中文或特殊符号），请重新复制'
    : (keyTouched && !apiKey.trim() ? '请填写 API Key' : ''));
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
    setEditingConfig(null);
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

  /** 打开编辑：回填表单（提供商/类别/模型可改，改动后保存会替换旧配置） */
  const handleEdit = (config: AIModelConfig) => {
    setEditingConfig(config);
    setSelectedProvider(config.provider);
    setSelectedCategory(inferCategory(config));
    const p = PROVIDER_MAP[config.provider];
    if (p?.isCustom) {
      setCustomModelId(config.model_name);
      setSelectedModel('');
    } else {
      setSelectedModel(config.model_name);
      setCustomModelId('');
    }
    setApiKey(config.api_key || '');
    setApiBase(config.api_base || p?.defaultApiBase || '');
    setRevealKey(false);
    setKeyTouched(false);
    setAddTestResult(null);
    setAddTestPassed(false);
    setAddTesting(false);
    setShowAddModal(true);
  };

  const closeAddModal = () => {
    setShowAddModal(false);
    setEditingConfig(null);
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
      const identityChanged =
        !!editingConfig &&
        (editingConfig.provider !== selectedProvider || editingConfig.model_name !== effectiveModelId);
      if (identityChanged && editingConfig) {
        await deleteAIModelConfig(editingConfig.provider, editingConfig.model_name);
      }
      await saveAIModelKey({
        provider: selectedProvider,
        model_name: effectiveModelId,
        api_key: apiKey.trim(),
        api_base: apiBase.trim() || undefined,
        ...(editingConfig ? { enabled: editingConfig.enabled, is_default: editingConfig.is_default } : {}),
      });
      showToast(editingConfig ? '模型已更新' : '保存成功', 'success');
      closeAddModal();
      await loadConfigs();
      // 触发模型更新事件，通知其他组件刷新
      window.dispatchEvent(new CustomEvent('ai-models-updated'));
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
      // 触发模型更新事件
      window.dispatchEvent(new CustomEvent('ai-models-updated'));
    } catch (error) {
      console.error('Failed to delete AI model config:', error);
      showToast('删除失败', 'error');
    }
  };

  const handleToggleEnabled = async (config: AIModelConfig, next: boolean) => {
    try {
      await updateAIModelConfigFlags(config.provider, config.model_name, { enabled: next });
      await loadConfigs();
      // 触发模型更新事件
      window.dispatchEvent(new CustomEvent('ai-models-updated'));
    } catch {
      showToast('更新状态失败', 'error');
    }
  };

  const handleSetDefault = async (config: AIModelConfig) => {
    try {
      await updateAIModelConfigFlags(config.provider, config.model_name, { is_default: true });
      showToast(`已将 ${getProviderName(config.provider)} · ${config.model_name} 设为默认`, 'success');
      await loadConfigs();
      // 触发模型更新事件
      window.dispatchEvent(new CustomEvent('ai-models-updated'));
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

  // ── 渲染单个模型卡片（仿编辑器设置页的卡片式列表） ────────
  const renderConfigRow = (config: AIModelConfig) => {
    const key = configKey(config);
    const isEnabled = config.enabled !== false;
    const result = testResults[key];
    const isTesting = testing[key];
    const category = inferCategory(config);

    return (
      <div
        key={key}
        className={`group relative flex items-center justify-between px-5 py-4 rounded-xl border transition-all ${
          isEnabled 
            ? 'bg-(--bg-card) border-(--border-color) hover:border-(--accent)/40 hover:shadow-lg' 
            : 'bg-(--bg-card)/50 border-(--border-color)/50 opacity-60'
        }`}
      >
        {/* 左侧：状态指示器 + 模型信息 */}
        <div className="min-w-0 flex-1 flex items-center gap-3">
          {/* 状态指示器 */}
          <div className={`w-1 h-12 rounded-full shrink-0 transition-colors ${
            isEnabled ? 'bg-green-500' : 'bg-(--text-muted)/30'
          }`} />
          
          {/* 模型信息 */}
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-semibold text-[15px] text-(--text-primary) truncate">{config.model_name}</span>
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium bg-(--accent)/10 text-(--accent) shrink-0">
                {CATEGORY_META[category].icon}
                {CATEGORY_META[category].label}
              </span>
              {config.is_default && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium bg-amber-500/10 text-amber-500 shrink-0">
                  <Star className="w-3 h-3 fill-current" />
                  默认
                </span>
              )}
              {/* 测试结果行内提示 */}
              {result && (
                <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium shrink-0 ${
                  result.status === 'success' ? 'bg-green-500/10 text-green-500' : 
                  result.status === 'unknown' ? 'bg-amber-500/10 text-amber-500' : 
                  'bg-red-500/10 text-red-500'
                }`}>
                  {result.status === 'success' ? <ShieldCheck className="w-3 h-3" /> : <AlertCircle className="w-3 h-3" />}
                  {result.status === 'success' ? '可用' : result.status === 'unknown' ? '未知' : '失败'}
                </span>
              )}
            </div>
            <p className="text-sm text-(--text-muted) mt-1.5 flex items-center gap-2">
              <span>{getProviderName(config.provider)}</span>
              {!isEnabled && (
                <>
                  <span className="text-(--text-muted)/50">•</span>
                  <span className="text-xs">已禁用</span>
                </>
              )}
            </p>
          </div>
        </div>

        {/* 右侧：操作按钮组 + 启用开关 */}
        <div className="flex items-center gap-1 shrink-0 ml-4">
          {/* 连接测试 */}
          <Tooltip content="连接测试" placement="top">
            <Button
              isIconOnly
              size="sm"
              variant="light"
              aria-label="连接测试"
              isDisabled={isTesting}
              onPress={() => handleTest(config)}
              className="text-(--text-muted) hover:text-(--text-primary) hover:bg-white/5 opacity-0 group-hover:opacity-100 transition-opacity"
            >
              {isTesting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
            </Button>
          </Tooltip>
          {/* 设为默认 */}
          {!config.is_default && (
            <Tooltip content="设为默认模型" placement="top">
              <Button
                isIconOnly
                size="sm"
                variant="light"
                aria-label="设为默认"
                isDisabled={!isEnabled}
                onPress={() => handleSetDefault(config)}
                className="text-(--text-muted) hover:text-(--accent) hover:bg-white/5 opacity-0 group-hover:opacity-100 transition-opacity"
              >
                <Star className="w-4 h-4" />
              </Button>
            </Tooltip>
          )}
          {/* 编辑 */}
          <Tooltip content="编辑模型" placement="top">
            <Button
              isIconOnly
              size="sm"
              variant="light"
              aria-label="编辑模型"
              onPress={() => handleEdit(config)}
              className="text-(--text-muted) hover:text-(--text-primary) hover:bg-white/5 opacity-0 group-hover:opacity-100 transition-opacity"
            >
              <Pencil className="w-4 h-4" />
            </Button>
          </Tooltip>
          {/* 删除 */}
          <Tooltip content="删除配置" placement="top">
            <Button
              isIconOnly
              size="sm"
              variant="light"
              color="danger"
              aria-label="删除配置"
              onPress={() => { setDeletingConfig(config); setShowDeleteModal(true); }}
              className="text-(--text-muted) hover:text-red-500 hover:bg-red-500/10 opacity-0 group-hover:opacity-100 transition-opacity"
            >
              <Trash2 className="w-4 h-4" />
            </Button>
          </Tooltip>
          
          {/* 分隔线 */}
          <div className="w-px h-6 bg-(--border-color) mx-2" />
          
          {/* 启用开关 */}
          <div className="flex items-center gap-2">
            <span className={`text-xs font-medium transition-colors ${isEnabled ? 'text-green-500' : 'text-(--text-muted)'}`}>
              {isEnabled ? '已启用' : '已禁用'}
            </span>
            <Tooltip content={isEnabled ? '点击禁用模型' : '点击启用模型'} placement="top">
              <button
                type="button"
                role="switch"
                aria-checked={isEnabled}
                aria-label={isEnabled ? '禁用模型' : '启用模型'}
                onClick={() => handleToggleEnabled(config, !isEnabled)}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-all focus:outline-none focus:ring-2 focus:ring-(--accent) focus:ring-offset-2 focus:ring-offset-(--bg-card) ${
                  isEnabled ? 'bg-green-500 hover:bg-green-600' : 'bg-(--text-muted)/30 hover:bg-(--text-muted)/40'
                }`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white shadow-sm transition-transform ${
                    isEnabled ? 'translate-x-6' : 'translate-x-1'
                  }`}
                />
              </button>
            </Tooltip>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-6">
      {/* 头部：标题 + 副标题，右上角「添加」与「查看文档」 */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="text-xl font-bold text-(--text-primary)">模型</h3>
          <p className="text-sm text-(--text-muted) mt-1">使用自有 API Key 管理自定义模型，密钥仅加密保存在本地</p>
        </div>
        <div className="flex flex-col items-end gap-1.5 shrink-0">
          <Button
            size="sm"
            variant="bordered"
            startContent={<Plus className="w-4 h-4" />}
            onPress={handleAdd}
            className="border-(--border-color) text-(--text-primary) hover:border-(--accent)/50"
          >
            添加
          </Button>
          <button
            type="button"
            onClick={() => showToast('帮助文档即将上线，可先参考各输入框旁的提示', 'info')}
            className="text-xs text-(--accent) hover:underline cursor-pointer"
          >
            查看文档
          </button>
        </div>
      </div>

      {/* 搜索 */}
      {configs.length > 0 && (
        <div className="flex justify-end">
          <Input
            size="sm"
            startContent={<Search className="w-4 h-4 text-(--text-muted)" />}
            placeholder="搜索服务商或模型"
            value={search}
            onValueChange={setSearch}
            className="w-56"
          />
        </div>
      )}

      {/* 模型卡片列表 */}
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
          <p className="text-sm text-(--text-muted) mt-2">点击右上角「添加」，选择服务商并填入你的 API Key 即可开始</p>
        </div>
      ) : filteredConfigs.length === 0 ? (
        <div className="py-10 text-center text-sm text-(--text-muted)">没有匹配「{search}」的配置</div>
      ) : (
        <div className="space-y-3">
          {filteredConfigs.map(renderConfigRow)}
        </div>
      )}

      {/* 添加/编辑配置模态框 */}
      <Modal
        isOpen={showAddModal}
        onClose={closeAddModal}
        size="2xl"
        scrollBehavior="inside"
        classNames={{
          wrapper: 'items-center justify-center p-4',
          base: 'bg-(--bg-card) border border-(--border-color) shadow-[0_24px_64px_rgba(0,0,0,0.6)] max-w-3xl max-h-[90vh]',
          header: 'px-6 pt-5 pb-3 border-b border-(--border-color)',
          body: 'px-6 py-5 overflow-y-auto',
          footer: 'px-6 py-4 border-t border-(--border-color)',
          closeButton: 'text-(--text-muted) hover:text-(--text-primary) hover:bg-white/10 rounded-full transition-colors',
        }}
      >
        <ModalContent>
          <ModalHeader className="flex flex-col gap-0.5">
            <span className="text-base font-bold text-(--text-primary)">{editingConfig ? '编辑模型' : '添加模型'}</span>
            <span className="text-xs font-normal text-(--text-muted)">选择提供商并配置 API 密钥即可使用</span>
          </ModalHeader>
          <ModalBody className="space-y-5">
            {/* 第一步：选择提供商 */}
            <div>
              <FieldLabel required step={1}>提供商</FieldLabel>
              <GroupedSelect
                value={selectedProvider}
                onChange={handleProviderChange}
                placeholder="选择提供商"
                ariaLabel="选择提供商"
                groups={[{
                  options: SELECTABLE_PROVIDERS.map((p) => ({ id: p.id, name: p.name, color: p.color, abbr: p.abbr, logoUrl: p.logoUrl })),
                }]}
              />
            </div>

            {/* 第二步：选择模型类型 */}
            <div>
              <FieldLabel required step={2}>模型类型</FieldLabel>
              <div className="grid grid-cols-4 gap-2">
                {(['multimodal', 'text', 'image', 'video'] as ProviderCategory[]).map((cat) => {
                  const meta = CATEGORY_META[cat];
                  const isActive = selectedCategory === cat;
                  const isSupported = !selectedProvider || availableCategories.includes(cat);
                  return (
                    <button
                      key={cat}
                      type="button"
                      onClick={() => isSupported && handleCategoryChange(cat)}
                      disabled={!isSupported}
                      className={`flex flex-col items-center justify-center gap-1.5 px-3 py-3 rounded-lg text-xs font-medium transition-all border ${
                        !isSupported
                          ? 'opacity-40 cursor-not-allowed border-(--border-color) bg-(--bg-input)'
                          : isActive
                            ? 'border-(--accent) bg-(--accent)/10 text-(--accent) shadow-sm cursor-pointer'
                            : 'border-(--border-color) bg-(--bg-input) text-(--text-secondary) hover:text-(--text-primary) hover:border-(--accent)/50 cursor-pointer'
                      }`}
                    >
                      {meta.icon}
                      <span>{meta.label}</span>
                    </button>
                  );
                })}
              </div>
              {selectedCategory && (
                <p className="text-xs text-(--text-muted) mt-2 flex items-center gap-1">
                  <span className="w-1 h-1 rounded-full bg-(--accent)"></span>
                  {selectedCategory === 'multimodal' && '支持文本、图像、语音等多种输入输出'}
                  {selectedCategory === 'text' && '纯文本对话与生成'}
                  {selectedCategory === 'image' && '文本生成图像'}
                  {selectedCategory === 'video' && '文本/图像生成视频'}
                </p>
              )}
            </div>

            {/* 第三步：选择模型 ID */}
            <div>
              <FieldLabel required step={3}>{isCustomProvider ? '模型 ID' : '模型'}</FieldLabel>
              {isCustomProvider ? (
                <>
                  <Input
                    placeholder="输入模型 ID，如 gpt-4o、qwen-max"
                    value={customModelId}
                    onValueChange={(v) => { setCustomModelId(v); setAddTestPassed(false); setAddTestResult(null); }}
                    isInvalid={!!modelError}
                    classNames={inputClassNames}
                  />
                  {modelError && <FieldError>{modelError}</FieldError>}
                </>
              ) : (
                <GroupedSelect
                  value={selectedModel}
                  onChange={(id) => { setSelectedModel(id); setAddTestPassed(false); setAddTestResult(null); }}
                  placeholder={selectedCategory ? "选择模型" : "请先选择模型类型"}
                  ariaLabel="选择模型"
                  groups={[{ options: availableModels.map((m) => ({ id: m, name: m })) }]}
                />
              )}
              {modelError && !isCustomProvider && <FieldError>{modelError}</FieldError>}
            </div>

            {/* API 密钥 */}
            <div>
              <FieldLabel
                required
                trailing={
                  <Tooltip content="密钥仅加密保存在本地，不会上传" placement="top">
                    <span className="text-(--text-muted) hover:text-(--text-secondary) cursor-help inline-flex">
                      <AlertCircle className="w-3.5 h-3.5" />
                    </span>
                  </Tooltip>
                }
              >
                API 密钥
              </FieldLabel>
              <Input
                type={revealKey ? 'text' : 'password'}
                placeholder="粘贴你的 API 密钥"
                value={apiKey}
                onValueChange={(v) => { 
                  // 自动清理非 ASCII 字符（中文、特殊符号等）
                  const cleaned = v.trimStart().replace(/[^\x00-\xFF]/g, '');
                  setApiKey(cleaned); 
                  setAddTestPassed(false); 
                  setAddTestResult(null); 
                }}
                onBlur={() => setKeyTouched(true)}
                isInvalid={!!keyError}
                isDisabled={!selectedProvider}
                classNames={inputClassNames}
                endContent={
                  <Tooltip content={revealKey ? '隐藏密钥' : '显示密钥'} placement="top">
                    <button type="button" onClick={() => setRevealKey((v) => !v)} className="text-(--text-muted) hover:text-(--text-primary) transition-colors" aria-label="显示密钥">
                      {revealKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </Tooltip>
                }
              />
              {keyError && <FieldError>{keyError}</FieldError>}
              {selectedProvider && !keyError && (
                <p className="text-xs text-(--accent) mt-2 cursor-pointer hover:underline flex items-center gap-1">
                  <span>获取 API 密钥</span>
                  <span>→</span>
                </p>
              )}
            </div>

            {/* API Base：仅自定义提供商需要手动填写并展示；非自定义自动填充、隐藏该字段 */}
            {isCustomProvider && (
            <div>
              <FieldLabel required strong>API Base</FieldLabel>
              <Input
                placeholder="https://api.example.com/v1"
                value={apiBase}
                onValueChange={(v) => { setApiBase(v); setAddTestPassed(false); setAddTestResult(null); }}
                isInvalid={!!apiBaseError}
                classNames={{
                  ...inputClassNames,
                  inputWrapper: inputWrapperBase,
                }}
              />
              {apiBaseError && <FieldError>{apiBaseError}</FieldError>}
            </div>
            )}

            {/* 测试结果：测试已并入底部主按钮，无结果时不渲染占位区域 */}
            {addTestResult && (
              <div className={`rounded-lg border border-(--border-color) overflow-hidden ${
                addTestResult.ok ? 'bg-green-500/5' : 'bg-red-500/5'
              }`}>
                <div className={`flex items-start gap-2 px-4 py-3 text-sm ${
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
          </ModalBody>
          <ModalFooter className="gap-3">
            <Button
              variant="light"
              onPress={closeAddModal}
              className="text-(--text-secondary) hover:text-(--text-primary)"
            >
              取消
            </Button>
            <Button
              color="primary"
              onPress={handleSave}
              isLoading={saving || addTesting}
              isDisabled={!canSave}
              className="min-w-[120px] data-[disabled=true]:bg-(--accent)/25 data-[disabled=true]:text-white/50 data-[disabled=true]:opacity-100 data-[disabled=true]:cursor-not-allowed"
            >
              {saving ? '保存中' : addTesting ? '测试中…' : editingConfig ? '保存' : '添加'}
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
