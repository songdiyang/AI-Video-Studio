/**
 * 扩展市场页面
 * 支持浏览、搜索、安装、管理扩展
 * 布局参考 VS Code 扩展商店：左侧列表 + 右侧详情
 */

import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import {
  Search, Puzzle, Star, DownloadIcon, Plus, ToggleLeft, ToggleRight,
  Trash2, Package, User, Calendar, Tag, Loader2, FileText, Upload, X,
  RefreshCw, MoreHorizontal, LayoutList, LayoutGrid, ChevronDown, ChevronRight,
  Filter, Check
} from 'lucide-react';
import { useLanguage } from '../../contexts/LanguageContext';
import { useExtensions } from '../../contexts/ExtensionContext';
import {
  Extension, ExtensionDetail, UserExtension,
  getExtensions, getExtensionCategories, getExtensionDetail,
  getUserExtensions, installExtension, uninstallExtension, toggleExtension
} from '../../services/extensions';
import { installFromZip, installFromUrl } from '../../utils/extensionInstaller';
import {
  getAllLocalExtensions,
  toggleExtensionEnabled,
  getRegistryEntry,
} from '../../utils/extensionStorage';

// ============ 简易 Markdown 渲染器 ============

// 翻译辅助函数（提取到组件外部供复用）
const getCategoryLabel = (cat: string, tx: any) => {
  return tx?.categories?.[cat] || cat;
};

const MarkdownRenderer: React.FC<{ content: string }> = ({ content }) => {
  const html = useMemo(() => renderMarkdown(content), [content]);
  return (
    <div
      className="markdown-body prose prose-sm max-w-none"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
};

function renderMarkdown(md: string): string {
  let html = md
    .replace(/```(\w*)\n([\s\S]*?)```/g, (_m, lang, code) =>
      `<pre class="md-code-block"><code class="language-${lang}">${escapeHtml(code.trim())}</code></pre>`)
    .replace(/`([^`]+)`/g, '<code class="md-inline-code">$1</code>')
    .replace(/^#### (.+)$/gm, '<h4 class="md-h4">$1</h4>')
    .replace(/^### (.+)$/gm, '<h3 class="md-h3">$1</h3>')
    .replace(/^## (.+)$/gm, '<h2 class="md-h2">$1</h2>')
    .replace(/^# (.+)$/gm, '<h1 class="md-h1">$1</h1>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/^---$/gm, '<hr class="md-hr"/>')
    .replace(/^\|(.+)\|$/gm, (line) => {
      const cells = line.split('|').filter(c => c.trim() !== '');
      if (cells.every(c => /^[\s-:]+$/.test(c))) return '<!--table-sep-->';
      const cellHtml = cells.map(c => `<td class="md-td">${c.trim()}</td>`).join('');
      return `<tr>${cellHtml}</tr>`;
    })
    .replace(/^- (.+)$/gm, '<li class="md-li">$1</li>')
    .replace(/^\d+\. (.+)$/gm, '<li class="md-li-ordered">$1</li>');

  html = html.replace(/((?:<tr>.*<\/tr>\s*(?:<!--table-sep-->\s*)?)+)/g, (block) => {
    const cleaned = block.replace(/<!--table-sep-->/g, '');
    return `<table class="md-table">${cleaned}</table>`;
  });
  html = html.replace(/((?:<li class="md-li">.*<\/li>\s*)+)/g, '<ul class="md-ul">$1</ul>');
  html = html.replace(/((?:<li class="md-li-ordered">.*<\/li>\s*)+)/g, '<ol class="md-ol">$1</ol>');
  html = html.replace(/^(?!<[a-z/!])((?!^\s*$).+)$/gm, '<p class="md-p">$1</p>');
  return html;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// ============ 分类颜色映射 ============

const CATEGORY_COLORS: Record<string, string> = {
  productivity: 'rgb(59,130,246)',
  theme: 'rgb(168,85,247)',
  tool: 'rgb(34,197,94)',
  integration: 'rgb(249,115,22)',
  other: 'rgb(156,163,175)',
};

function getCategoryColor(category: string): string {
  return CATEGORY_COLORS[category] || CATEGORY_COLORS.other;
}

// ============ 扩展图标组件 ============

const ExtensionIcon: React.FC<{ iconUrl?: string | null; category: string; size?: 'sm' | 'md' | 'lg' }> = ({ iconUrl, category, size = 'sm' }) => {
  const sizeClasses = {
    sm: 'w-9 h-9',
    md: 'w-10 h-10',
    lg: 'w-16 h-16',
  };
  const iconSizes = {
    sm: 'w-4 h-4',
    md: 'w-5 h-5',
    lg: 'w-8 h-8',
  };

  if (iconUrl) {
    return (
      <img
        src={iconUrl}
        alt=""
        className={`${sizeClasses[size]} rounded-lg flex-shrink-0 object-cover`}
        onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
      />
    );
  }

  return (
    <div
      className={`${sizeClasses[size]} rounded-lg flex items-center justify-center flex-shrink-0`}
      style={{ backgroundColor: `${getCategoryColor(category)}15` }}
    >
      <Puzzle className={iconSizes[size]} style={{ color: getCategoryColor(category) }} />
    </div>
  );
};

// ============ 下拉菜单组件 ============

interface DropdownMenuProps {
  trigger: React.ReactNode;
  children: React.ReactNode;
  align?: 'left' | 'right';
}

const DropdownMenu: React.FC<DropdownMenuProps> = ({ trigger, children, align = 'right' }) => {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  return (
    <div ref={ref} className="relative">
      <div onClick={() => setOpen(!open)}>{trigger}</div>
      {open && (
        <>
          <div
            className={`absolute z-50 mt-1 min-w-[200px] rounded-lg border shadow-lg py-1 ${align === 'right' ? 'right-0' : 'left-0'}`}
            style={{
              backgroundColor: 'var(--bg-card)',
              borderColor: 'var(--border-color)',
            }}
          >
            {children}
          </div>
        </>
      )}
    </div>
  );
};

const DropdownItem: React.FC<{
  children: React.ReactNode;
  onClick?: () => void;
  active?: boolean;
  disabled?: boolean;
  hasSubmenu?: boolean;
}> = ({ children, onClick, active, disabled, hasSubmenu }) => (
  <button
    onClick={onClick}
    disabled={disabled}
    className={`w-full text-left px-3 py-1.5 text-xs flex items-center justify-between transition-colors ${
      disabled ? 'opacity-50 cursor-not-allowed' : 'hover:bg-[var(--bg-hover)]'
    } ${active ? 'text-blue-500' : ''}`}
    style={{ color: active ? undefined : 'var(--text-secondary)' }}
  >
    <span>{children}</span>
    {active && <Check className="w-3 h-3" />}
    {hasSubmenu && <ChevronRight className="w-3 h-3" style={{ color: 'var(--text-muted)' }} />}
  </button>
);

const DropdownDivider = () => (
  <div className="my-1 border-t" style={{ borderColor: 'var(--border-color)' }} />
);

const DropdownLabel: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="px-3 py-1 text-[10px] font-medium uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
    {children}
  </div>
);

// ============ 扩展详情视图组件（用于标签页内嵌） ============

interface ExtensionDetailViewProps {
  extId: number;
}

export const ExtensionDetailView: React.FC<ExtensionDetailViewProps> = ({ extId }) => {
  const { t } = useLanguage();
  const { uninstallLocalExtension } = useExtensions();
  const tx = t.extensions;

  const [detail, setDetail] = useState<ExtensionDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [installing, setInstalling] = useState(false);
  const [userExts, setUserExts] = useState<UserExtension[]>([]);

  const loadDetail = async () => {
    setLoading(true);
    setError(null);
    try {
      const d = await getExtensionDetail(extId);
      setDetail(d);
    } catch (e: any) {
      setError(e.message || '加载详情失败');
    } finally {
      setLoading(false);
    }
  };

  const loadUserExts = async () => {
    try {
      const res = await getUserExtensions();
      setUserExts(res.extensions);
    } catch { /* ignore */ }
  };

  useEffect(() => {
    loadDetail();
    loadUserExts();
  }, [extId]);

  const isInstalled = userExts.some(ue => ue.extension_id === extId);
  const userExt = userExts.find(ue => ue.extension_id === extId);

  const handleInstall = async () => {
    if (!detail) return;
    setInstalling(true);
    setError(null);
    try {
      await installExtension(extId);
      await loadUserExts();
      if (detail.package_url) {
        const result = await installFromUrl(detail.package_url);
        if (result.success) {
          window.dispatchEvent(new Event('extensions:refresh'));
        } else {
          setError(result.message);
        }
      }
      await loadDetail();
    } catch (err: any) {
      setError(err.message || '安装失败');
    } finally {
      setInstalling(false);
    }
  };

  const handleUninstall = async () => {
    if (!detail) return;
    setError(null);
    try {
      await uninstallExtension(extId);
      await loadUserExts();
      if (detail.name) {
        try {
          await uninstallLocalExtension(detail.name);
          window.dispatchEvent(new Event('extensions:refresh'));
        } catch (localErr: any) {
          console.warn('[Extensions] 本地扩展清理失败:', localErr.message);
        }
      }
      await loadDetail();
    } catch (err: any) {
      setError(err.message || '卸载失败');
    }
  };

  const handleToggle = async () => {
    if (!userExt) return;
    try {
      await toggleExtension(extId, !userExt.is_enabled);
      await loadUserExts();
      try {
        const localEntry = await getRegistryEntry(userExt.name);
        if (localEntry && localEntry.enabled !== !userExt.is_enabled) {
          await toggleExtensionEnabled(userExt.name, !userExt.is_enabled);
          window.dispatchEvent(new Event('extensions:refresh'));
        }
      } catch (localErr: any) {
        console.warn('[Extensions] 本地扩展状态同步失败:', localErr.message);
      }
    } catch (err: any) {
      setError(err.message || '操作失败');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="w-6 h-6 animate-spin" style={{ color: 'var(--text-muted)' }} />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <X className="w-8 h-8 mx-auto mb-2 text-red-500" />
          <p className="text-sm text-red-500">{error}</p>
          <button onClick={loadDetail} className="text-sm text-blue-500 mt-2 hover:underline">
            {tx.retry}
          </button>
        </div>
      </div>
    );
  }

  if (!detail) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-sm" style={{ color: 'var(--text-muted)' }}>扩展不存在</p>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto p-6">
      {/* 头部信息 */}
      <div className="flex items-start gap-4 mb-6">
        <ExtensionIcon iconUrl={detail.icon_url} category={detail.category} size="lg" />
        <div className="flex-1 min-w-0">
          <h2 className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>
            {detail.display_name}
          </h2>
          <p className="text-sm mt-1" style={{ color: 'var(--text-muted)' }}>
            {detail.description}
          </p>
          <div className="flex items-center gap-3 mt-2 text-xs" style={{ color: 'var(--text-muted)' }}>
            <span className="flex items-center gap-1">
              <User className="w-3 h-3" />
              {detail.author || tx.unknownAuthor}
            </span>
            <span className="flex items-center gap-1">
              <DownloadIcon className="w-3 h-3" />
              {detail.download_count}
            </span>
            <span className="flex items-center gap-1">
              <Star className="w-3 h-3" />
              {detail.rating || 0}
            </span>
            <span className="flex items-center gap-1">
              <Tag className="w-3 h-3" />
              {getCategoryLabel(detail.category, tx)}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {!isInstalled ? (
            <button
              onClick={handleInstall}
              disabled={installing}
              className="px-4 py-2 rounded text-sm font-medium bg-blue-500 text-white hover:bg-blue-600 disabled:opacity-50 flex items-center gap-1.5"
            >
              {installing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
              {tx.install}
            </button>
          ) : (
            <>
              <button
                onClick={handleToggle}
                className={`px-4 py-2 rounded text-sm font-medium flex items-center gap-1.5 ${
                  userExt?.is_enabled
                    ? 'bg-green-500/10 text-green-500 hover:bg-green-500/20'
                    : 'bg-gray-500/10 text-gray-500 hover:bg-gray-500/20'
                }`}
              >
                {userExt?.is_enabled ? <ToggleRight className="w-4 h-4" /> : <ToggleLeft className="w-4 h-4" />}
                {userExt?.is_enabled ? tx.enabled : tx.disabled}
              </button>
              <button
                onClick={handleUninstall}
                className="px-4 py-2 rounded text-sm font-medium bg-red-500/10 text-red-500 hover:bg-red-500/20 flex items-center gap-1.5"
              >
                <Trash2 className="w-4 h-4" />
                {tx.uninstall}
              </button>
            </>
          )}
        </div>
      </div>

      {/* README */}
      {detail.readme && (
        <div className="mt-4">
          <MarkdownRenderer content={detail.readme} />
        </div>
      )}
    </div>
  );
};

// ============ 主组件 ============

type TabType = 'marketplace' | 'installed';
type SortType = 'download' | 'newest' | 'rating' | 'name';
type FilterType = 'all' | 'featured' | 'mcp' | 'recommended' | 'recent' | 'popular' | 'installed' | 'updates' | 'builtin' | 'enabled' | 'disabled' | 'unsupported';

const Extensions: React.FC = () => {
  const { t } = useLanguage();
  const { uninstallLocalExtension } = useExtensions();
  const tx = t.extensions;

  // Tab 状态
  const [activeTab, setActiveTab] = useState<TabType>('marketplace');

  // 市场列表状态
  const [extensions, setExtensions] = useState<Extension[]>([]);
  const [total, setTotal] = useState(0);
  const [categories, setCategories] = useState<{ category: string; count: number }[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<SortType>('download');
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);

  // 筛选状态
  const [activeFilter, setActiveFilter] = useState<FilterType>('all');
  const [filterMenuOpen, setFilterMenuOpen] = useState(false);
  const [categoryMenuOpen, setCategoryMenuOpen] = useState(false);
  const [sortMenuOpen, setSortMenuOpen] = useState(false);

  // 已安装扩展状态
  const [userExtensions, setUserExtensions] = useState<UserExtension[]>([]);
  const [userExtsLoading, setUserExtsLoading] = useState(false);

  // 详情状态
  const [selectedExtension, setSelectedExtension] = useState<ExtensionDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  // 操作状态
  const [installingId, setInstallingId] = useState<number | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  // 本地扩展状态
  const [localExtensions, setLocalExtensions] = useState<Array<{
    name: string;
    displayName: string;
    version: string;
    enabled: boolean;
    category: string;
    description: string;
    author: string;
    installedAt: number;
  }>>([]);
  const [zipInstalling, setZipInstalling] = useState(false);
  const [zipInstallMsg, setZipInstallMsg] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);

  // 折叠状态
  const [localExpanded, setLocalExpanded] = useState(true);
  const [marketplaceExpanded, setMarketplaceExpanded] = useState(true);

  // 加载市场数据
  const loadMarketplace = async (p = 1) => {
    setLoading(true);
    setActionError(null);
    try {
      const res = await getExtensions({
        q: searchQuery || undefined,
        category: selectedCategory || undefined,
        sort: sortBy,
        page: p,
        limit: 20,
      });
      setExtensions(p === 1 ? res.extensions : [...extensions, ...res.extensions]);
      setTotal(res.total);
      setPage(p);
    } catch (e: any) {
      setActionError(e.message || '加载失败');
    } finally {
      setLoading(false);
    }
  };

  // 加载分类
  const loadCategories = async () => {
    try {
      const res = await getExtensionCategories();
      setCategories(res.categories);
    } catch { /* ignore */ }
  };

  // 加载已安装扩展
  const loadUserExtensions = async () => {
    setUserExtsLoading(true);
    try {
      const res = await getUserExtensions();
      setUserExtensions(res.extensions);
    } catch (e: any) {
      setActionError(e.message || '加载已安装扩展失败');
    } finally {
      setUserExtsLoading(false);
    }
  };

  // 加载本地扩展
  const loadLocalExtensions = async () => {
    try {
      const entries = await getAllLocalExtensions();
      setLocalExtensions(entries.map(e => ({
        name: e.name,
        displayName: e.displayName,
        version: e.version,
        enabled: e.enabled,
        category: e.category,
        description: e.description,
        author: e.author,
        installedAt: e.installedAt,
      })));
    } catch (e: any) {
      console.error('加载本地扩展失败:', e);
    }
  };

  // 初始加载
  useEffect(() => {
    loadCategories();
    loadMarketplace(1);
    loadUserExtensions();
    loadLocalExtensions();
  }, []);

  // 搜索/分类/排序变化时重新加载
  useEffect(() => {
    const timer = setTimeout(() => loadMarketplace(1), 300);
    return () => clearTimeout(timer);
  }, [searchQuery, selectedCategory, sortBy]);

  // 查看扩展详情
  const handleSelectExtension = async (ext: Extension) => {
    setDetailLoading(true);
    setSelectedExtension(null);
    try {
      const detail = await getExtensionDetail(ext.id);
      setSelectedExtension(detail);
    } catch (e: any) {
      setActionError(e.message || '加载详情失败');
    } finally {
      setDetailLoading(false);
    }
  };

  // 安装扩展
  const handleInstall = async (ext: Extension, e?: React.MouseEvent) => {
    e?.stopPropagation();
    setInstallingId(ext.id);
    setActionError(null);
    try {
      await installExtension(ext.id);
      await loadUserExtensions();

      if (ext.package_url) {
        setZipInstallMsg('下载扩展文件中...');
        const result = await installFromUrl(ext.package_url);
        if (result.success) {
          setZipInstallMsg(result.message);
          await loadLocalExtensions();
          window.dispatchEvent(new Event('extensions:refresh'));
        } else {
          setActionError(result.message);
        }
      }

      if (selectedExtension?.id === ext.id) {
        const detail = await getExtensionDetail(ext.id);
        setSelectedExtension(detail);
      }
    } catch (err: any) {
      setActionError(err.message || '安装失败');
    } finally {
      setInstallingId(null);
      setTimeout(() => setZipInstallMsg(null), 3000);
    }
  };

  // 卸载扩展
  const handleUninstall = async (extId: number, e?: React.MouseEvent) => {
    e?.stopPropagation();
    setActionError(null);
    try {
      const ue = userExtensions.find(u => u.extension_id === extId);
      const extName = ue?.name;

      await uninstallExtension(extId);
      await loadUserExtensions();

      if (extName) {
        const localEntry = localExtensions.find(le => le.name === extName);
        if (localEntry) {
          try {
            await uninstallLocalExtension(extName);
            await loadLocalExtensions();
            window.dispatchEvent(new Event('extensions:refresh'));
          } catch (localErr: any) {
            console.warn('[Extensions] 本地扩展清理失败:', localErr.message);
          }
        }
      }

      if (selectedExtension?.id === extId) setSelectedExtension(null);
    } catch (err: any) {
      setActionError(err.message || '卸载失败');
    }
  };

  // 启用/禁用扩展
  const handleToggle = async (ext: UserExtension, e?: React.MouseEvent) => {
    e?.stopPropagation();
    setActionError(null);
    try {
      const newEnabled = !ext.is_enabled;
      await toggleExtension(ext.extension_id, newEnabled);
      await loadUserExtensions();

      try {
        const localEntry = await getRegistryEntry(ext.name);
        if (localEntry && localEntry.enabled !== newEnabled) {
          await toggleExtensionEnabled(ext.name, newEnabled);
          await loadLocalExtensions();
          window.dispatchEvent(new Event('extensions:refresh'));
        }
      } catch (localErr: any) {
        console.warn('[Extensions] 本地扩展状态同步失败:', localErr.message);
      }
    } catch (err: any) {
      setActionError(err.message || '操作失败');
    }
  };

  // 启用/禁用本地扩展
  const handleToggleLocal = async (name: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    const ext = localExtensions.find(le => le.name === name);
    if (!ext) return;
    try {
      await toggleExtensionEnabled(name, !ext.enabled);
      await loadLocalExtensions();
      window.dispatchEvent(new Event('extensions:refresh'));
    } catch (err: any) {
      setActionError(err.message || '操作失败');
    }
  };

  // 卸载本地扩展
  const handleUninstallLocal = async (name: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    try {
      await uninstallLocalExtension(name);
      await loadLocalExtensions();
      if (selectedExtension?.name === name) setSelectedExtension(null);
    } catch (err: any) {
      setActionError(err.message || '卸载失败');
    }
  };

  // ZIP 上传安装（AOM 文件）
  const handleZipInstall = async (file: File) => {
    setZipInstalling(true);
    setZipInstallMsg(null);
    setActionError(null);
    try {
      const result = await installFromZip(file);
      if (result.success) {
        setZipInstallMsg(result.message);
        await loadLocalExtensions();
        // 自动同步到后端：按扩展名匹配市场中的扩展，调用后端注册安装记录
        const extName = result.name;
        const matchedExt = extensions.find(e => e.name === extName);
        if (matchedExt && !userExtensions.some(ue => ue.extension_id === matchedExt.id)) {
          try {
            await installExtension(matchedExt.id);
            await loadUserExtensions();
          } catch {
            // 后端注册失败不阻塞，本地 IndexedDB 已有记录
            console.warn('[Extensions] 后端注册扩展失败:', extName);
          }
        }
        window.dispatchEvent(new Event('extensions:refresh'));
      } else {
        setActionError(result.message);
      }
    } catch (err: any) {
      setActionError(err.message || '安装失败');
    } finally {
      setZipInstalling(false);
      setTimeout(() => setZipInstallMsg(null), 3000);
    }
  };

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleZipInstall(file);
    e.target.value = '';
  };

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file && file.name.endsWith('.aom')) {
      handleZipInstall(file);
    }
  }, []);

  // 检查扩展是否已安装（同时检查后端记录和本地 IndexedDB）
  const isInstalled = (extId: number) => {
    // 先查后端
    if (userExtensions.some(ue => ue.extension_id === extId)) return true;
    // 再查本地 IndexedDB，通过 name 匹配
    const ext = extensions.find(e => e.id === extId);
    if (ext && localExtensions.some(le => le.name === ext.name)) return true;
    return false;
  };
  const getUserExt = (extId: number) => userExtensions.find(ue => ue.extension_id === extId);

  const getSortLabel = (sort: SortType) => {
    const map: Record<SortType, string> = {
      download: tx.sortDownload,
      newest: tx.sortNewest,
      rating: tx.sortRating,
      name: tx.sortName,
    };
    return map[sort] || sort;
  };

  // 当前列表数据
  const listData = activeTab === 'marketplace' ? extensions : userExtensions.map(ue => ({
    id: ue.extension_id,
    name: ue.name,
    display_name: ue.display_name,
    description: ue.description,
    version: ue.installed_version,
    author: ue.author,
    category: ue.category,
    icon_url: ue.icon_url,
    download_count: ue.download_count || 0,
    rating: ue.rating || 0,
    created_at: ue.installed_at,
    updated_at: ue.installed_at,
  } as Extension));

  // 过滤后的市场数据
  const filteredExtensions = useMemo(() => {
    let result = [...extensions];
    switch (activeFilter) {
      case 'featured':
      case 'recommended':
        result = result.filter(e => e.rating >= 4.5 || e.download_count > 100);
        break;
      case 'recent':
        result = [...result].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
        break;
      case 'popular':
        result = [...result].sort((a, b) => b.download_count - a.download_count);
        break;
      case 'installed':
        result = result.filter(e => isInstalled(e.id));
        break;
      default:
        break;
    }
    return result;
  }, [extensions, activeFilter]);

  // 当前选中的扩展是否在列表中
  const selectedInList = listData.find(e => e.id === selectedExtension?.id);

  // 渲染扩展列表项
  const renderExtensionItem = (ext: Extension, isLocal = false) => {
    const installed = isLocal ? true : isInstalled(ext.id);
    const isSelected = selectedExtension?.id === ext.id;
    const localExt = isLocal ? localExtensions.find(le => le.name === ext.name) : null;

    const handleItemClick = () => {
      if (isLocal) return;
      // 在右侧标签页打开扩展详情
      window.dispatchEvent(new CustomEvent('openExtensionDetailTab', {
        detail: { extId: ext.id, extName: ext.display_name }
      }));
    };

    return (
      <div
        key={isLocal ? ext.name : ext.id}
        onClick={handleItemClick}
        className={`p-3 cursor-pointer transition-colors ${
          isSelected ? 'bg-[var(--accent)]/8' : 'hover:bg-[var(--bg-hover)]'
        }`}
        title={ext.display_name}
      >
        <div className="flex items-start gap-3">
          <ExtensionIcon iconUrl={ext.icon_url} category={ext.category} size="sm" />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5">
              <h4 className="text-sm font-semibold truncate" style={{ color: 'var(--text-primary)' }}>
                {ext.display_name}
              </h4>
              {!isLocal && installed && activeTab === 'marketplace' && (
                <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-green-500/10 text-green-500 flex-shrink-0">
                  {tx.installedBadge}
                </span>
              )}
              {isLocal && localExt && (
                <>
                  <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-purple-500/10 text-purple-500 flex-shrink-0">
                    本地
                  </span>
                  <span className={`text-[10px] px-1.5 py-0.5 rounded-full flex-shrink-0 ${localExt.enabled ? 'bg-green-500/10 text-green-500' : 'bg-gray-500/10 text-gray-500'}`}>
                    {localExt.enabled ? tx.enabled : tx.disabled}
                  </span>
                </>
              )}
            </div>
            <p className="text-xs mt-1 truncate" style={{ color: 'var(--text-muted)' }}>
              {ext.description || tx.noDescription}
            </p>
            <div className="flex items-center gap-2 mt-1">
              {!isLocal && (
                <>
                  <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
                    {ext.author || tx.unknownAuthor}
                  </span>
                  <span className="flex items-center gap-0.5 text-xs" style={{ color: 'var(--text-muted)' }}>
                    <DownloadIcon className="w-3 h-3" />
                    {ext.download_count}
                  </span>
                </>
              )}
              {isLocal && localExt && (
                <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
                  {localExt.author || tx.unknownAuthor}
                </span>
              )}
            </div>
          </div>
          {isLocal && localExt && (
            <div className="flex items-center gap-1 flex-shrink-0">
              <button
                onClick={(e) => handleToggleLocal(localExt.name, e)}
                className="p-1 rounded transition-colors hover:bg-[var(--bg-hover)]"
                title={localExt.enabled ? tx.disable : tx.enable}
              >
                {localExt.enabled ? (
                  <ToggleRight className="w-4 h-4 text-green-500" />
                ) : (
                  <ToggleLeft className="w-4 h-4" style={{ color: 'var(--text-muted)' }} />
                )}
              </button>
              <button
                onClick={(e) => handleUninstallLocal(localExt.name, e)}
                className="p-1 rounded transition-colors hover:bg-red-500/10 text-red-500"
                title={tx.uninstall}
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="flex flex-col h-screen overflow-hidden" style={{ backgroundColor: 'var(--bg-app)' }}>
      {/* 顶部标题栏 */}
      <div className="flex items-center justify-between px-4 py-3 border-b shrink-0" style={{ borderColor: 'var(--border-color)' }}>
          <span className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
            {tx.title}
          </span>
          <div className="flex items-center gap-1">
            <button
              onClick={() => { loadMarketplace(1); loadUserExtensions(); loadLocalExtensions(); }}
              className="p-1.5 rounded transition-colors hover:bg-[var(--bg-hover)]"
              title={tx.refresh}
            >
              <RefreshCw className="w-4 h-4" style={{ color: 'var(--text-muted)' }} />
            </button>
            <DropdownMenu
              trigger={
                <button className="p-1.5 rounded transition-colors hover:bg-[var(--bg-hover)]" title={tx.moreActions}>
                  <MoreHorizontal className="w-3.5 h-3.5" style={{ color: 'var(--text-muted)' }} />
                </button>
              }
            >
              <DropdownItem onClick={() => { setActiveTab('marketplace'); setActiveFilter('featured'); }} active={activeFilter === 'featured'}>
                {tx.filterFeatured}
              </DropdownItem>
              <DropdownItem onClick={() => { setActiveTab('marketplace'); setActiveFilter('mcp'); }} active={activeFilter === 'mcp'}>
                {tx.filterMcpServers}
              </DropdownItem>
              <DropdownItem onClick={() => { setActiveTab('marketplace'); setActiveFilter('recommended'); }} active={activeFilter === 'recommended'}>
                {tx.filterRecommended}
              </DropdownItem>
              <DropdownItem onClick={() => { setActiveTab('marketplace'); setActiveFilter('recent'); }} active={activeFilter === 'recent'}>
                {tx.filterRecent}
              </DropdownItem>
              <DropdownItem onClick={() => { setActiveTab('marketplace'); setActiveFilter('popular'); }} active={activeFilter === 'popular'}>
                {tx.filterPopular}
              </DropdownItem>
              <DropdownDivider />
              <div className="relative">
                <DropdownMenu
                  trigger={
                    <div className="w-full">
                      <DropdownItem hasSubmenu>{tx.filterCategories}</DropdownItem>
                    </div>
                  }
                  align="left"
                >
                  <DropdownItem onClick={() => setSelectedCategory('')} active={selectedCategory === ''}>
                    {tx.all}
                  </DropdownItem>
                  {categories.map(cat => (
                    <DropdownItem
                      key={cat.category}
                      onClick={() => setSelectedCategory(cat.category === selectedCategory ? '' : cat.category)}
                      active={selectedCategory === cat.category}
                    >
                      {getCategoryLabel(cat.category, tx)} ({cat.count})
                    </DropdownItem>
                  ))}
                </DropdownMenu>
              </div>
              <DropdownDivider />
              <DropdownItem onClick={() => { setActiveTab('installed'); setActiveFilter('installed'); }} active={activeTab === 'installed' && activeFilter === 'installed'}>
                {tx.filterInstalled}
              </DropdownItem>
              <DropdownItem onClick={() => setActiveFilter('updates')} active={activeFilter === 'updates'} disabled>
                {tx.filterUpdates}
              </DropdownItem>
              <DropdownItem onClick={() => setActiveFilter('builtin')} active={activeFilter === 'builtin'} disabled>
                {tx.filterBuiltIn}
              </DropdownItem>
              <DropdownDivider />
              <DropdownItem onClick={() => setActiveFilter('enabled')} active={activeFilter === 'enabled'} disabled>
                {tx.filterEnabled}
              </DropdownItem>
              <DropdownItem onClick={() => setActiveFilter('disabled')} active={activeFilter === 'disabled'} disabled>
                {tx.filterDisabled}
              </DropdownItem>
              <DropdownItem onClick={() => setActiveFilter('unsupported')} active={activeFilter === 'unsupported'} disabled>
                {tx.filterUnsupported}
              </DropdownItem>
              <DropdownDivider />
              <div className="relative">
                <DropdownMenu
                  trigger={
                    <div className="w-full">
                      <DropdownItem hasSubmenu>{tx.sortBy}</DropdownItem>
                    </div>
                  }
                  align="left"
                >
                  {(['download', 'newest', 'rating', 'name'] as SortType[]).map(sort => (
                    <DropdownItem
                      key={sort}
                      onClick={() => setSortBy(sort)}
                      active={sortBy === sort}
                    >
                      {getSortLabel(sort)}
                    </DropdownItem>
                  ))}
                </DropdownMenu>
              </div>
            </DropdownMenu>
          </div>
        </div>

        {/* 搜索框 */}
        <div className="px-4 py-3">
          <div className="relative flex items-center">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: 'var(--text-muted)' }} />
            <input
              type="text"
              placeholder={activeTab === 'marketplace' ? tx.searchPlaceholder : tx.searchInMarketplace}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-20 py-2 text-sm rounded border outline-none focus:ring-1 focus:ring-blue-500"
              style={{
                backgroundColor: 'var(--bg-input, var(--bg-body))',
                borderColor: 'var(--border-color)',
                color: 'var(--text-primary)',
              }}
            />
            <div className="absolute right-1 flex items-center gap-0.5">
              <button
                className="p-1.5 rounded transition-colors hover:bg-[var(--bg-hover)]"
                title={tx.viewList}
              >
                <LayoutList className="w-4 h-4" style={{ color: 'var(--text-muted)' }} />
              </button>
              <button
                className="p-1.5 rounded transition-colors hover:bg-[var(--bg-hover)]"
                title={tx.moreActions}
                onClick={() => setFilterMenuOpen(!filterMenuOpen)}
              >
                <Filter className="w-4 h-4" style={{ color: 'var(--text-muted)' }} />
              </button>
            </div>
          </div>
        </div>

        {/* Tab 切换 */}
        <div className="flex border-b px-4" style={{ borderColor: 'var(--border-color)' }}>
          <button
            onClick={() => { setActiveTab('marketplace'); setSelectedExtension(null); }}
            className={`flex-1 py-2 text-xs font-medium flex items-center justify-center gap-1 transition-colors ${
              activeTab === 'marketplace' ? 'border-b-2 border-blue-500 text-blue-500' : ''
            }`}
            style={{ color: activeTab === 'marketplace' ? undefined : 'var(--text-muted)' }}
          >
            {tx.marketplace}
          </button>
          <button
            onClick={() => { setActiveTab('installed'); loadUserExtensions(); setSelectedExtension(null); }}
            className={`flex-1 py-2 text-xs font-medium flex items-center justify-center gap-1 transition-colors ${
              activeTab === 'installed' ? 'border-b-2 border-blue-500 text-blue-500' : ''
            }`}
            style={{ color: activeTab === 'installed' ? undefined : 'var(--text-muted)' }}
          >
            {tx.installed}
            {userExtensions.length > 0 && (
              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-blue-500/10 text-blue-500">
                {userExtensions.length}
              </span>
            )}
          </button>
        </div>

        {/* 扩展列表 */}
        <div className="flex-1 overflow-y-auto">
          {activeTab === 'marketplace' && loading && extensions.length === 0 ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-5 h-5 animate-spin" style={{ color: 'var(--text-muted)' }} />
            </div>
          ) : activeTab === 'installed' && userExtsLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-5 h-5 animate-spin" style={{ color: 'var(--text-muted)' }} />
            </div>
          ) : (
            <div>
              {/* 市场扩展 - 可折叠 */}
              {activeTab === 'marketplace' && filteredExtensions.length > 0 && (
                <>
                  <button
                    onClick={() => setMarketplaceExpanded(!marketplaceExpanded)}
                    className="w-full flex items-center gap-1.5 px-4 py-2 text-xs font-medium uppercase tracking-wider transition-colors hover:bg-[var(--bg-hover)]"
                    style={{ color: 'var(--text-muted)' }}
                  >
                    {marketplaceExpanded ? (
                      <ChevronDown className="w-3.5 h-3.5" />
                    ) : (
                      <ChevronRight className="w-3.5 h-3.5" />
                    )}
                    {tx.marketplace}
                    <span className="ml-auto">{filteredExtensions.length}</span>
                  </button>
                  {marketplaceExpanded && (
                    <div className="divide-y" style={{ borderColor: 'var(--border-color)' }}>
                      {filteredExtensions.map(ext => renderExtensionItem(ext))}
                      {extensions.length < total && (
                        <div className="p-3 text-center">
                          <button
                            onClick={() => loadMarketplace(page + 1)}
                            disabled={loading}
                            className="text-sm text-blue-500 hover:underline disabled:opacity-50"
                          >
                            {loading ? <Loader2 className="w-4 h-4 animate-spin inline" /> : tx.loadMore}
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </>
              )}

              {/* 已安装扩展 - 可折叠 */}
              {activeTab === 'installed' && listData.length > 0 && (
                <>
                  <button
                    onClick={() => setLocalExpanded(!localExpanded)}
                    className="w-full flex items-center gap-1.5 px-4 py-2 text-xs font-medium uppercase tracking-wider transition-colors hover:bg-[var(--bg-hover)]"
                    style={{ color: 'var(--text-muted)' }}
                  >
                    {localExpanded ? (
                      <ChevronDown className="w-3.5 h-3.5" />
                    ) : (
                      <ChevronRight className="w-3.5 h-3.5" />
                    )}
                    {tx.localInstalled}
                    <span className="ml-auto">{listData.length + localExtensions.length}</span>
                  </button>
                  {localExpanded && (
                    <div className="divide-y" style={{ borderColor: 'var(--border-color)' }}>
                      {listData.map(ext => renderExtensionItem(ext))}
                      {localExtensions.map(le => renderExtensionItem({
                        id: 0,
                        name: le.name,
                        display_name: le.displayName,
                        description: le.description,
                        version: le.version,
                        author: le.author,
                        category: le.category,
                        icon_url: null,
                        download_count: 0,
                        rating: 0,
                        created_at: '',
                        updated_at: '',
                      }, true))}
                    </div>
                  )}
                </>
              )}

              {/* 空状态 */}
              {activeTab === 'marketplace' && filteredExtensions.length === 0 && !loading && (
                <div className="text-center py-12 px-4" style={{ color: 'var(--text-muted)' }}>
                  <Package className="w-12 h-12 mx-auto mb-3 opacity-30" />
                  <p className="text-sm">{tx.noExtensions}</p>
                </div>
              )}
              {activeTab === 'installed' && listData.length === 0 && localExtensions.length === 0 && (
                <div className="text-center py-12 px-4" style={{ color: 'var(--text-muted)' }}>
                  <Package className="w-12 h-12 mx-auto mb-3 opacity-30" />
                  <p className="text-sm">{tx.noInstalled}</p>
                  <button
                    onClick={() => setActiveTab('marketplace')}
                    className="text-sm text-blue-500 mt-3 hover:underline"
                  >
                    {tx.browseMarketplace}
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* ZIP 上传安装区域 */}
        <div className="p-4 border-t" style={{ borderColor: 'var(--border-color)' }}>
          <input
            ref={fileInputRef}
            type="file"
            accept=".aom"
            onChange={onFileChange}
            className="hidden"
          />
          <div
            onClick={() => fileInputRef.current?.click()}
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={onDrop}
            className={`w-full py-3 px-4 rounded border border-dashed text-sm flex items-center justify-center gap-2 cursor-pointer transition-colors ${
              dragOver ? 'border-blue-500 bg-blue-500/5 text-blue-500' : ''
            }`}
            style={{
              borderColor: dragOver ? undefined : 'var(--border-color)',
              color: dragOver ? undefined : 'var(--text-muted)',
            }}
          >
            {zipInstalling ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Upload className="w-4 h-4" />
            )}
            {zipInstalling ? '安装中...' : zipInstallMsg || '从 AOM 安装扩展'}
          </div>
          {actionError && (
            <div className="flex items-center gap-1 mt-2 text-xs text-red-500">
              <X className="w-3.5 h-3.5" />
              {actionError}
            </div>
          )}
        </div>

      {/* Markdown 样式 */}
      <style>{`
        .md-h1 { font-size: 1.5rem; font-weight: 700; margin: 2rem 0 1rem; color: var(--text-primary); border-bottom: 1px solid var(--border-color); padding-bottom: 0.5rem; }
        .md-h2 { font-size: 1.25rem; font-weight: 700; margin: 1.8rem 0 0.8rem; color: var(--text-primary); border-bottom: 1px solid var(--border-color); padding-bottom: 0.4rem; }
        .md-h3 { font-size: 1.05rem; font-weight: 600; margin: 1.4rem 0 0.6rem; color: var(--text-primary); }
        .md-h4 { font-size: 0.95rem; font-weight: 600; margin: 1rem 0 0.5rem; color: var(--text-primary); }
        .md-p { font-size: 0.85rem; line-height: 1.7; margin: 0.4rem 0; color: var(--text-secondary, var(--text-primary)); }
        .md-hr { border: none; border-top: 1px solid var(--border-color); margin: 1.5rem 0; }
        .md-ul, .md-ol { padding-left: 1.5rem; margin: 0.5rem 0; }
        .md-li, .md-li-ordered { font-size: 0.85rem; line-height: 1.7; color: var(--text-secondary, var(--text-primary)); margin: 0.15rem 0; }
        .md-li::marker { color: var(--accent, #3b82f6); }
        .md-code-block { background: var(--bg-input, #1e1e2e); border: 1px solid var(--border-color); border-radius: 0.5rem; padding: 1rem; overflow-x: auto; margin: 0.8rem 0; }
        .md-code-block code { font-size: 0.8rem; line-height: 1.6; color: var(--text-primary); font-family: 'Fira Code', 'JetBrains Mono', monospace; }
        .md-inline-code { background: rgba(59,130,246,0.1); color: rgb(59,130,246); padding: 0.15rem 0.4rem; border-radius: 0.25rem; font-size: 0.8rem; font-family: 'Fira Code', monospace; }
        .md-table { width: 100%; border-collapse: collapse; margin: 0.8rem 0; font-size: 0.8rem; }
        .md-td { padding: 0.5rem 0.75rem; border: 1px solid var(--border-color); color: var(--text-secondary, var(--text-primary)); }
        .md-table tr:first-child .md-td { font-weight: 600; background: var(--bg-input, rgba(0,0,0,0.05)); color: var(--text-primary); }
      `}</style>
    </div>
  );
};

export default Extensions;
