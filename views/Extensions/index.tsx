/**
 * 扩展市场页面
 * 支持浏览、搜索、安装、管理扩展
 * 布局参考 VS Code 扩展商店：左侧列表 + 右侧详情
 */

import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import {
  Search, Puzzle, Star, DownloadIcon, Plus, ToggleLeft, ToggleRight,
  Trash2, Package, User, Calendar, Tag, Loader2, FileText, Upload, X
} from 'lucide-react';
import { useLanguage } from '../../contexts/LanguageContext';
import { useExtensions } from '../../contexts/ExtensionContext';
import {
  Extension, ExtensionDetail, UserExtension,
  getExtensions, getExtensionCategories, getExtensionDetail,
  getUserExtensions, installExtension, uninstallExtension, toggleExtension
} from '../../services/extensions';
import { installFromZip } from '../../utils/extensionInstaller';
import {
  getAllLocalExtensions,
  toggleExtensionEnabled,
} from '../../utils/extensionStorage';

// ============ 简易 Markdown 渲染器 ============

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

// ============ 主组件 ============

type TabType = 'marketplace' | 'installed';
type SortType = 'download' | 'newest' | 'rating' | 'name';

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
      // 如果当前在详情页，刷新一下
      if (selectedExtension?.id === ext.id) {
        const detail = await getExtensionDetail(ext.id);
        setSelectedExtension(detail);
      }
    } catch (err: any) {
      setActionError(err.message || '安装失败');
    } finally {
      setInstallingId(null);
    }
  };

  // 卸载扩展
  const handleUninstall = async (extId: number, e?: React.MouseEvent) => {
    e?.stopPropagation();
    setActionError(null);
    try {
      await uninstallExtension(extId);
      await loadUserExtensions();
      if (selectedExtension?.id === extId) setSelectedExtension(null);
    } catch (err: any) {
      setActionError(err.message || '卸载失败');
    }
  };

  // 启用/禁用扩展（后端）
  const handleToggle = async (ext: UserExtension, e?: React.MouseEvent) => {
    e?.stopPropagation();
    setActionError(null);
    try {
      await toggleExtension(ext.extension_id, !ext.is_enabled);
      await loadUserExtensions();
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
    } catch (err: any) {
      setActionError(err.message || '操作失败');
    }
  };

  // 卸载本地扩展（通过 ExtensionContext 走完整清理流程）
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

  // ZIP 上传安装
  const handleZipInstall = async (file: File) => {
    setZipInstalling(true);
    setZipInstallMsg(null);
    setActionError(null);
    try {
      const result = await installFromZip(file);
      if (result.success) {
        setZipInstallMsg(result.message);
        await loadLocalExtensions();
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
    if (file && file.name.endsWith('.zip')) {
      handleZipInstall(file);
    }
  }, []);

  // 检查扩展是否已安装
  const isInstalled = (extId: number) => userExtensions.some(ue => ue.extension_id === extId);
  const getUserExt = (extId: number) => userExtensions.find(ue => ue.extension_id === extId);

  // 翻译辅助
  const getCategoryLabel = (cat: string) => {
    return tx.categories[cat as keyof typeof tx.categories] || cat;
  };

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

  // 当前选中的扩展是否在列表中
  const selectedInList = listData.find(e => e.id === selectedExtension?.id);

  return (
    <div className="flex h-full overflow-hidden" style={{ backgroundColor: 'var(--bg-body)' }}>
      {/* ====== 左侧边栏：筛选 + 扩展列表 ====== */}
      <div className="w-80 flex-shrink-0 border-r flex flex-col" style={{ borderColor: 'var(--border-color)', backgroundColor: 'var(--bg-card)' }}>
        {/* 头部 */}
        <div className="p-4 border-b" style={{ borderColor: 'var(--border-color)' }}>
          <h2 className="text-lg font-bold flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
            <Puzzle className="w-5 h-5 text-blue-500" />
            {tx.title}
          </h2>
          <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
            {tx.subtitle}
          </p>
        </div>

        {/* Tab 切换 */}
        <div className="flex border-b" style={{ borderColor: 'var(--border-color)' }}>
          <button
            onClick={() => { setActiveTab('marketplace'); setSelectedExtension(null); }}
            className={`flex-1 py-2.5 text-xs font-medium flex items-center justify-center gap-1.5 transition-colors ${
              activeTab === 'marketplace' ? 'border-b-2 border-blue-500 text-blue-500' : ''
            }`}
            style={{ color: activeTab === 'marketplace' ? undefined : 'var(--text-muted)' }}
          >
            <Search className="w-3.5 h-3.5" />
            {tx.marketplace}
          </button>
          <button
            onClick={() => { setActiveTab('installed'); loadUserExtensions(); setSelectedExtension(null); }}
            className={`flex-1 py-2.5 text-xs font-medium flex items-center justify-center gap-1.5 transition-colors ${
              activeTab === 'installed' ? 'border-b-2 border-blue-500 text-blue-500' : ''
            }`}
            style={{ color: activeTab === 'installed' ? undefined : 'var(--text-muted)' }}
          >
            <Package className="w-3.5 h-3.5" />
            {tx.installed}
            {userExtensions.length > 0 && (
              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-blue-500/10 text-blue-500">
                {userExtensions.length}
              </span>
            )}
          </button>
        </div>

        {/* 搜索 */}
        <div className="p-3">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5" style={{ color: 'var(--text-muted)' }} />
            <input
              type="text"
              placeholder={tx.searchPlaceholder}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-8 pr-3 py-1.5 text-xs rounded-lg border outline-none focus:ring-1 focus:ring-blue-500"
              style={{
                backgroundColor: 'var(--bg-input, var(--bg-body))',
                borderColor: 'var(--border-color)',
                color: 'var(--text-primary)',
              }}
            />
          </div>
        </div>

        {activeTab === 'marketplace' && (
          <>
            {/* 分类 */}
            <div className="px-3 pb-2">
              <div className="text-[10px] font-medium uppercase tracking-wider mb-2" style={{ color: 'var(--text-muted)' }}>
                {tx.category}
              </div>
              <div className="space-y-0.5">
                <button
                  onClick={() => setSelectedCategory('')}
                  className={`w-full text-left px-2.5 py-1.5 rounded-lg text-xs transition-colors flex items-center justify-between ${
                    selectedCategory === '' ? 'bg-blue-500/10 text-blue-500' : 'hover:bg-[var(--bg-hover)]'
                  }`}
                  style={{ color: selectedCategory === '' ? undefined : 'var(--text-secondary)' }}
                >
                  <span>{tx.all}</span>
                  <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>{total}</span>
                </button>
                {categories.map(cat => (
                  <button
                    key={cat.category}
                    onClick={() => setSelectedCategory(cat.category === selectedCategory ? '' : cat.category)}
                    className={`w-full text-left px-2.5 py-1.5 rounded-lg text-xs transition-colors flex items-center justify-between ${
                      selectedCategory === cat.category ? 'bg-blue-500/10 text-blue-500' : 'hover:bg-[var(--bg-hover)]'
                    }`}
                    style={{ color: selectedCategory === cat.category ? undefined : 'var(--text-secondary)' }}
                  >
                    <span>{getCategoryLabel(cat.category)}</span>
                    <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>{cat.count}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* 排序 */}
            <div className="px-3 pb-2">
              <div className="text-[10px] font-medium uppercase tracking-wider mb-2" style={{ color: 'var(--text-muted)' }}>
                {tx.sort}
              </div>
              <div className="flex flex-wrap gap-1">
                {(['download', 'newest', 'rating', 'name'] as SortType[]).map(sort => (
                  <button
                    key={sort}
                    onClick={() => setSortBy(sort)}
                    className={`px-2 py-1 rounded-md text-[10px] transition-colors ${
                      sortBy === sort ? 'bg-blue-500/10 text-blue-500' : 'bg-[var(--bg-body)]'
                    }`}
                    style={{ color: sortBy === sort ? undefined : 'var(--text-muted)' }}
                  >
                    {getSortLabel(sort)}
                  </button>
                ))}
              </div>
            </div>
          </>
        )}

        {/* 扩展列表 */}
        <div className="flex-1 overflow-y-auto border-t" style={{ borderColor: 'var(--border-color)' }}>
          {activeTab === 'marketplace' && loading && extensions.length === 0 ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-5 h-5 animate-spin" style={{ color: 'var(--text-muted)' }} />
            </div>
          ) : activeTab === 'installed' && userExtsLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-5 h-5 animate-spin" style={{ color: 'var(--text-muted)' }} />
            </div>
          ) : listData.length === 0 && activeTab === 'marketplace' ? (
            <div className="text-center py-8 px-4" style={{ color: 'var(--text-muted)' }}>
              <Package className="w-8 h-8 mx-auto mb-2 opacity-30" />
              <p className="text-xs">{tx.noExtensions}</p>
            </div>
          ) : (
            <div className="divide-y" style={{ borderColor: 'var(--border-color)' }}>
              {listData.map(ext => {
                const installed = activeTab === 'marketplace' ? isInstalled(ext.id) : true;
                const isSelected = selectedExtension?.id === ext.id;
                return (
                  <div
                    key={ext.id}
                    onClick={() => handleSelectExtension(ext)}
                    className={`p-3 cursor-pointer transition-colors ${
                      isSelected ? 'bg-blue-500/5' : 'hover:bg-[var(--bg-hover)]'
                    }`}
                  >
                    <div className="flex items-start gap-2.5">
                      <div
                        className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0"
                        style={{ backgroundColor: `${getCategoryColor(ext.category)}15` }}
                      >
                        <Puzzle className="w-4 h-4" style={{ color: getCategoryColor(ext.category) }} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <h4 className="text-xs font-semibold truncate" style={{ color: 'var(--text-primary)' }}>
                            {ext.display_name}
                          </h4>
                          {installed && activeTab === 'marketplace' && (
                            <span className="text-[9px] px-1 py-0.5 rounded-full bg-green-500/10 text-green-500 flex-shrink-0">
                              {tx.installedBadge}
                            </span>
                          )}
                        </div>
                        <p className="text-[10px] mt-0.5 truncate" style={{ color: 'var(--text-muted)' }}>
                          {ext.description || tx.noDescription}
                        </p>
                        <div className="flex items-center gap-2 mt-1">
                          <span className="flex items-center gap-0.5 text-[10px]" style={{ color: 'var(--text-muted)' }}>
                            <DownloadIcon className="w-2.5 h-2.5" />
                            {ext.download_count}
                          </span>
                          <span className="flex items-center gap-0.5 text-[10px]" style={{ color: 'var(--text-muted)' }}>
                            <Star className="w-2.5 h-2.5" />
                            {ext.rating}
                          </span>
                          <span className="text-[10px] truncate" style={{ color: 'var(--text-muted)' }}>
                            {ext.author || tx.unknownAuthor}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
              {/* 本地扩展列表（在已安装 Tab 中显示） */}
              {activeTab === 'installed' && localExtensions.map(le => (
                <div
                  key={le.name}
                  className="p-3 cursor-pointer transition-colors hover:bg-[var(--bg-hover)]"
                >
                  <div className="flex items-start gap-2.5">
                    <div
                      className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0"
                      style={{ backgroundColor: `${getCategoryColor(le.category)}15` }}
                    >
                      <Puzzle className="w-4 h-4" style={{ color: getCategoryColor(le.category) }} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <h4 className="text-xs font-semibold truncate" style={{ color: 'var(--text-primary)' }}>
                          {le.displayName}
                        </h4>
                        <span className="text-[9px] px-1 py-0.5 rounded-full bg-purple-500/10 text-purple-500 flex-shrink-0">
                          本地
                        </span>
                        <span className={`text-[9px] px-1 py-0.5 rounded-full flex-shrink-0 ${le.enabled ? 'bg-green-500/10 text-green-500' : 'bg-gray-500/10 text-gray-500'}`}>
                          {le.enabled ? tx.enabled : tx.disabled}
                        </span>
                      </div>
                      <p className="text-[10px] mt-0.5 truncate" style={{ color: 'var(--text-muted)' }}>
                        {le.description || tx.noDescription}
                      </p>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-[10px] truncate" style={{ color: 'var(--text-muted)' }}>
                          {le.author || tx.unknownAuthor}
                        </span>
                        <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
                          v{le.version}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <button
                        onClick={(e) => handleToggleLocal(le.name, e)}
                        className="p-1.5 rounded transition-colors hover:bg-[var(--bg-hover)]"
                        title={le.enabled ? tx.disable : tx.enable}
                      >
                        {le.enabled ? (
                          <ToggleRight className="w-4 h-4 text-green-500" />
                        ) : (
                          <ToggleLeft className="w-4 h-4" style={{ color: 'var(--text-muted)' }} />
                        )}
                      </button>
                      <button
                        onClick={(e) => handleUninstallLocal(le.name, e)}
                        className="p-1.5 rounded transition-colors hover:bg-red-500/10 text-red-500"
                        title={tx.uninstall}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
              {/* 已安装 Tab 为空提示 */}
              {activeTab === 'installed' && listData.length === 0 && localExtensions.length === 0 && (
                <div className="text-center py-8 px-4" style={{ color: 'var(--text-muted)' }}>
                  <Package className="w-8 h-8 mx-auto mb-2 opacity-30" />
                  <p className="text-xs">{tx.noInstalled}</p>
                  <button
                    onClick={() => setActiveTab('marketplace')}
                    className="text-xs text-blue-500 mt-2 hover:underline"
                  >
                    {tx.browseMarketplace}
                  </button>
                </div>
              )}
              {/* 加载更多 */}
              {activeTab === 'marketplace' && extensions.length < total && (
                <div className="p-3 text-center">
                  <button
                    onClick={() => loadMarketplace(page + 1)}
                    disabled={loading}
                    className="text-xs text-blue-500 hover:underline disabled:opacity-50"
                  >
                    {loading ? <Loader2 className="w-3 h-3 animate-spin inline" /> : tx.loadMore}
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* ZIP 上传安装区域 */}
        <div className="p-3 border-t" style={{ borderColor: 'var(--border-color)' }}>
          <input
            ref={fileInputRef}
            type="file"
            accept=".zip"
            onChange={onFileChange}
            className="hidden"
          />
          <div
            onClick={() => fileInputRef.current?.click()}
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={onDrop}
            className={`w-full py-2.5 px-3 rounded-lg border border-dashed text-xs flex items-center justify-center gap-1.5 cursor-pointer transition-colors ${
              dragOver ? 'border-blue-500 bg-blue-500/5 text-blue-500' : ''
            }`}
            style={{
              borderColor: dragOver ? undefined : 'var(--border-color)',
              color: dragOver ? undefined : 'var(--text-muted)',
            }}
          >
            {zipInstalling ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Upload className="w-3.5 h-3.5" />
            )}
            {zipInstalling ? '安装中...' : zipInstallMsg || '从 ZIP 安装扩展'}
          </div>
          {actionError && (
            <div className="flex items-center gap-1 mt-1.5 text-[10px] text-red-500">
              <X className="w-3 h-3" />
              {actionError}
            </div>
          )}
        </div>
      </div>

      {/* ====== 右侧内容区域：扩展详情 ====== */}
      <div className="flex-1 overflow-y-auto">
        {detailLoading ? (
          <div className="flex items-center justify-center h-full">
            <Loader2 className="w-6 h-6 animate-spin" style={{ color: 'var(--text-muted)' }} />
          </div>
        ) : selectedExtension ? (
          <div className="max-w-4xl mx-auto p-6 pb-20">
            {/* 详情头部 */}
            <div className="flex items-start gap-4 mb-6 pb-4 border-b" style={{ borderColor: 'var(--border-color)' }}>
              <div
                className="w-16 h-16 rounded-2xl flex items-center justify-center flex-shrink-0"
                style={{ backgroundColor: `${getCategoryColor(selectedExtension.category)}15` }}
              >
                <Puzzle className="w-8 h-8" style={{ color: getCategoryColor(selectedExtension.category) }} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h1 className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>
                    {selectedExtension.display_name}
                  </h1>
                  <span className="text-xs px-2 py-0.5 rounded-full" style={{ backgroundColor: 'var(--bg-body)', color: 'var(--text-muted)' }}>
                    v{selectedExtension.version}
                  </span>
                </div>
                <p className="text-sm mt-1" style={{ color: 'var(--text-muted)' }}>
                  {selectedExtension.description || tx.noDescription}
                </p>
                <div className="flex items-center gap-4 mt-2 flex-wrap">
                  <span className="flex items-center gap-1 text-xs" style={{ color: 'var(--text-muted)' }}>
                    <User className="w-3.5 h-3.5" />
                    {selectedExtension.author || tx.unknownAuthor}
                  </span>
                  <span className="flex items-center gap-1 text-xs" style={{ color: 'var(--text-muted)' }}>
                    <DownloadIcon className="w-3.5 h-3.5" />
                    {selectedExtension.download_count} {tx.downloads}
                  </span>
                  <span className="flex items-center gap-1 text-xs" style={{ color: 'var(--text-muted)' }}>
                    <Star className="w-3.5 h-3.5" />
                    {selectedExtension.rating}
                  </span>
                  <span
                    className="text-xs px-2 py-0.5 rounded-full"
                    style={{
                      backgroundColor: `${getCategoryColor(selectedExtension.category)}15`,
                      color: getCategoryColor(selectedExtension.category),
                    }}
                  >
                    {getCategoryLabel(selectedExtension.category)}
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                {isInstalled(selectedExtension.id) ? (
                  <>
                    <button
                      onClick={() => handleToggle(getUserExt(selectedExtension.id)!)}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors border"
                      style={{ borderColor: 'var(--border-color)', color: 'var(--text-secondary)' }}
                    >
                      {getUserExt(selectedExtension.id)?.is_enabled ? (
                        <ToggleRight className="w-4 h-4 text-green-500" />
                      ) : (
                        <ToggleLeft className="w-4 h-4" />
                      )}
                      {getUserExt(selectedExtension.id)?.is_enabled ? tx.enabled : tx.disabled}
                    </button>
                    <button
                      onClick={() => handleUninstall(selectedExtension.id)}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors border hover:bg-red-500/10 hover:border-red-500/30 hover:text-red-500"
                      style={{ borderColor: 'var(--border-color)', color: 'var(--text-secondary)' }}
                    >
                      <Trash2 className="w-4 h-4" />
                      {tx.uninstall}
                    </button>
                  </>
                ) : (
                  <button
                    onClick={() => handleInstall(selectedExtension)}
                    disabled={installingId === selectedExtension.id}
                    className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-sm font-medium transition-colors bg-blue-500 text-white hover:bg-blue-600 disabled:opacity-50"
                  >
                    {installingId === selectedExtension.id ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Plus className="w-4 h-4" />
                    )}
                    {installingId === selectedExtension.id ? tx.installing : tx.install}
                  </button>
                )}
              </div>
            </div>

            {/* README */}
            {selectedExtension.readme ? (
              <MarkdownRenderer content={selectedExtension.readme} />
            ) : (
              <div className="text-center py-12" style={{ color: 'var(--text-muted)' }}>
                <FileText className="w-10 h-10 mx-auto mb-3 opacity-20" />
                <p className="text-sm">{tx.noDocs}</p>
              </div>
            )}
          </div>
        ) : activeTab === 'installed' ? (
          /* 已安装扩展管理页（未选中时） */
          <div className="p-6">
            <h3 className="text-sm font-semibold mb-4" style={{ color: 'var(--text-primary)' }}>
              {tx.installedManage}
            </h3>
            {userExtensions.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20" style={{ color: 'var(--text-muted)' }}>
                <Package className="w-12 h-12 mb-4 opacity-20" />
                <p className="text-sm">{tx.noInstalledAny}</p>
                <button
                  onClick={() => setActiveTab('marketplace')}
                  className="mt-3 px-4 py-2 rounded-lg bg-blue-500 text-white text-xs hover:bg-blue-600 transition-colors"
                >
                  {tx.goBrowse}
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                {userExtensions.map(ue => (
                  <div
                    key={ue.extension_id}
                    className="p-4 rounded-xl border flex items-start gap-4"
                    style={{ borderColor: 'var(--border-color)', backgroundColor: 'var(--bg-card)' }}
                  >
                    <div className="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0" style={{ backgroundColor: 'rgba(59,130,246,0.1)' }}>
                      <Puzzle className="w-6 h-6 text-blue-500" />
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h4 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
                          {ue.display_name}
                        </h4>
                        <span className="text-[10px] px-1.5 py-0.5 rounded" style={{ backgroundColor: 'var(--bg-body)', color: 'var(--text-muted)' }}>
                          v{ue.installed_version}
                        </span>
                        {ue.latest_version !== ue.installed_version && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-orange-500/10 text-orange-500">
                            {tx.updateTo} v{ue.latest_version}
                          </span>
                        )}
                        <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${ue.is_enabled ? 'bg-green-500/10 text-green-500' : 'bg-gray-500/10 text-gray-500'}`}>
                          {ue.is_enabled ? tx.enabled : tx.disabled}
                        </span>
                      </div>
                      <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
                        {ue.description || tx.noDescription}
                      </p>
                      <div className="flex items-center gap-4 mt-2 text-[10px]" style={{ color: 'var(--text-muted)' }}>
                        <span className="flex items-center gap-1">
                          <User className="w-3 h-3" />
                          {ue.author || tx.unknownAuthor}
                        </span>
                        <span className="flex items-center gap-1">
                          <Tag className="w-3 h-3" />
                          {getCategoryLabel(ue.category)}
                        </span>
                        <span className="flex items-center gap-1">
                          <Calendar className="w-3 h-3" />
                          {new Date(ue.installed_at).toLocaleDateString()}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <button
                        onClick={() => handleToggle(ue)}
                        className="p-2 rounded-lg transition-colors hover:bg-[var(--bg-hover)]"
                        title={ue.is_enabled ? tx.disable : tx.enable}
                      >
                        {ue.is_enabled ? (
                          <ToggleRight className="w-5 h-5 text-green-500" />
                        ) : (
                          <ToggleLeft className="w-5 h-5" style={{ color: 'var(--text-muted)' }} />
                        )}
                      </button>
                      <button
                        onClick={() => handleUninstall(ue.extension_id)}
                        className="p-2 rounded-lg transition-colors hover:bg-red-500/10 text-red-500"
                        title={tx.uninstall}
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : (
          /* 市场页未选中时 */
          <div className="flex flex-col items-center justify-center h-full" style={{ color: 'var(--text-muted)' }}>
            <Puzzle className="w-16 h-16 mb-4 opacity-10" />
            <p className="text-sm">{tx.noExtensions}</p>
            <p className="text-xs mt-1">{tx.tryOtherSearch}</p>
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
