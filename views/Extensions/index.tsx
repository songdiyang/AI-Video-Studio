/**
 * 扩展市场页面
 * 支持浏览、搜索、安装、管理扩展
 */

import React, { useState, useEffect, useMemo } from 'react';
import {
  BookOpen, Search, ExternalLink, Download, Puzzle, Grid3X3, List,
  Star, DownloadIcon, Check, Plus, Settings, ToggleLeft, ToggleRight,
  Trash2, ChevronRight, Package, User, Calendar, Tag, Loader2
} from 'lucide-react';
import { useLanguage } from '../../contexts/LanguageContext';
import {
  Extension, ExtensionDetail, UserExtension,
  getExtensions, getExtensionCategories, getExtensionDetail,
  getUserExtensions, installExtension, uninstallExtension, toggleExtension
} from '../../services/extensions';

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

  // 初始加载
  useEffect(() => {
    loadCategories();
    loadMarketplace(1);
    loadUserExtensions();
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

  // 启用/禁用扩展
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

  // 检查扩展是否已安装
  const isInstalled = (extId: number) => userExtensions.some(ue => ue.extension_id === extId);
  const getUserExt = (extId: number) => userExtensions.find(ue => ue.extension_id === extId);

  // 翻译辅助
  const getCategoryLabel = (cat: string) => {
    const map: Record<string, string> = {
      productivity: '效率工具',
      theme: '主题外观',
      tool: '实用工具',
      integration: '集成',
      other: '其他',
    };
    return map[cat] || cat;
  };

  const getSortLabel = (sort: SortType) => {
    const map: Record<string, string> = {
      download: '最多下载',
      newest: '最新发布',
      rating: '最高评分',
      name: '名称排序',
    };
    return map[sort] || sort;
  };

  return (
    <div className="flex h-full overflow-hidden" style={{ backgroundColor: 'var(--bg-body)' }}>
      {/* 左侧边栏 */}
      <div className="w-72 flex-shrink-0 border-r flex flex-col" style={{ borderColor: 'var(--border-color)', backgroundColor: 'var(--bg-card)' }}>
        {/* 头部 */}
        <div className="p-4 border-b" style={{ borderColor: 'var(--border-color)' }}>
          <h2 className="text-lg font-bold flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
            <Puzzle className="w-5 h-5 text-blue-500" />
            扩展市场
          </h2>
          <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
            浏览和管理扩展
          </p>
        </div>

        {/* Tab 切换 */}
        <div className="flex border-b" style={{ borderColor: 'var(--border-color)' }}>
          <button
            onClick={() => setActiveTab('marketplace')}
            className={`flex-1 py-2.5 text-xs font-medium flex items-center justify-center gap-1.5 transition-colors ${
              activeTab === 'marketplace' ? 'border-b-2 border-blue-500 text-blue-500' : ''
            }`}
            style={{ color: activeTab === 'marketplace' ? undefined : 'var(--text-muted)' }}
          >
            <Grid3X3 className="w-3.5 h-3.5" />
            市场
          </button>
          <button
            onClick={() => { setActiveTab('installed'); loadUserExtensions(); }}
            className={`flex-1 py-2.5 text-xs font-medium flex items-center justify-center gap-1.5 transition-colors ${
              activeTab === 'installed' ? 'border-b-2 border-blue-500 text-blue-500' : ''
            }`}
            style={{ color: activeTab === 'installed' ? undefined : 'var(--text-muted)' }}
          >
            <Package className="w-3.5 h-3.5" />
            已安装
            {userExtensions.length > 0 && (
              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-blue-500/10 text-blue-500">
                {userExtensions.length}
              </span>
            )}
          </button>
        </div>

        {activeTab === 'marketplace' ? (
          <>
            {/* 搜索 */}
            <div className="p-3">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5" style={{ color: 'var(--text-muted)' }} />
                <input
                  type="text"
                  placeholder="搜索扩展..."
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

            {/* 分类 */}
            <div className="px-3 pb-2">
              <div className="text-[10px] font-medium uppercase tracking-wider mb-2" style={{ color: 'var(--text-muted)' }}>
                分类
              </div>
              <div className="space-y-0.5">
                <button
                  onClick={() => setSelectedCategory('')}
                  className={`w-full text-left px-2.5 py-1.5 rounded-lg text-xs transition-colors flex items-center justify-between ${
                    selectedCategory === '' ? 'bg-blue-500/10 text-blue-500' : 'hover:bg-[var(--bg-hover)]'
                  }`}
                  style={{ color: selectedCategory === '' ? undefined : 'var(--text-secondary)' }}
                >
                  <span>全部</span>
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
            <div className="px-3 pb-3">
              <div className="text-[10px] font-medium uppercase tracking-wider mb-2" style={{ color: 'var(--text-muted)' }}>
                排序
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
        ) : (
          /* 已安装扩展列表 */
          <div className="flex-1 overflow-y-auto p-3 space-y-2">
            {userExtsLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-5 h-5 animate-spin" style={{ color: 'var(--text-muted)' }} />
              </div>
            ) : userExtensions.length === 0 ? (
              <div className="text-center py-8" style={{ color: 'var(--text-muted)' }}>
                <Package className="w-8 h-8 mx-auto mb-2 opacity-30" />
                <p className="text-xs">尚未安装扩展</p>
                <button
                  onClick={() => setActiveTab('marketplace')}
                  className="text-xs text-blue-500 mt-2 hover:underline"
                >
                  去市场浏览
                </button>
              </div>
            ) : (
              userExtensions.map(ue => (
                <div
                  key={ue.extension_id}
                  className="p-3 rounded-xl border transition-all duration-200"
                  style={{
                    borderColor: 'var(--border-color)',
                    backgroundColor: selectedExtension?.id === ue.extension_id ? 'var(--accent-bg, rgba(59,130,246,0.08))' : 'transparent',
                    opacity: ue.is_enabled ? 1 : 0.5,
                  }}
                >
                  <div className="flex items-start gap-2.5">
                    <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0" style={{ backgroundColor: 'rgba(59,130,246,0.1)' }}>
                      <Puzzle className="w-4 h-4 text-blue-500" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <h3 className="text-sm font-semibold truncate" style={{ color: 'var(--text-primary)' }}>
                          {ue.display_name}
                        </h3>
                        <span className="text-[10px] px-1 py-0.5 rounded bg-[var(--bg-body)]" style={{ color: 'var(--text-muted)' }}>
                          v{ue.installed_version}
                        </span>
                      </div>
                      <p className="text-[10px] mt-0.5 truncate" style={{ color: 'var(--text-muted)' }}>
                        {ue.description || '无描述'}
                      </p>
                      <div className="flex items-center gap-1 mt-2">
                        <button
                          onClick={(e) => handleToggle(ue, e)}
                          className="p-1 rounded transition-colors hover:bg-[var(--bg-hover)]"
                          title={ue.is_enabled ? '禁用' : '启用'}
                        >
                          {ue.is_enabled ? (
                            <ToggleRight className="w-4 h-4 text-green-500" />
                          ) : (
                            <ToggleLeft className="w-4 h-4" style={{ color: 'var(--text-muted)' }} />
                          )}
                        </button>
                        <button
                          onClick={(e) => handleUninstall(ue.extension_id, e)}
                          className="p-1 rounded transition-colors hover:bg-red-500/10 text-red-500"
                          title="卸载"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                        {ue.latest_version !== ue.installed_version && (
                          <span className="text-[10px] text-orange-500 ml-auto">有更新</span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </div>

      {/* 中间/右侧内容区域 */}
      <div className="flex-1 overflow-y-auto">
        {activeTab === 'marketplace' ? (
          <>
            {/* 错误提示 */}
            {actionError && (
              <div className="mx-6 mt-4 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-500 text-xs">
                {actionError}
              </div>
            )}

            {/* 扩展卡片网格 */}
            <div className="p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
                  {selectedCategory ? getCategoryLabel(selectedCategory) : '全部扩展'}
                  <span className="text-xs font-normal ml-2" style={{ color: 'var(--text-muted)' }}>
                    共 {total} 个
                  </span>
                </h3>
              </div>

              {loading && extensions.length === 0 ? (
                <div className="flex items-center justify-center py-20">
                  <Loader2 className="w-6 h-6 animate-spin" style={{ color: 'var(--text-muted)' }} />
                </div>
              ) : extensions.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-20" style={{ color: 'var(--text-muted)' }}>
                  <Search className="w-10 h-10 mb-3 opacity-20" />
                  <p className="text-sm">未找到扩展</p>
                  <p className="text-xs mt-1">尝试其他搜索词或分类</p>
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                    {extensions.map(ext => {
                      const installed = isInstalled(ext.id);
                      const userExt = getUserExt(ext.id);
                      return (
                        <div
                          key={ext.id}
                          onClick={() => handleSelectExtension(ext)}
                          className={`p-4 rounded-xl border cursor-pointer transition-all duration-200 hover:shadow-md ${
                            selectedExtension?.id === ext.id ? 'border-blue-500/50 shadow-md' : ''
                          }`}
                          style={{
                            borderColor: selectedExtension?.id === ext.id ? undefined : 'var(--border-color)',
                            backgroundColor: 'var(--bg-card)',
                          }}
                        >
                          <div className="flex items-start gap-3">
                            <div
                              className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                              style={{ backgroundColor: `${getCategoryColor(ext.category)}15` }}
                            >
                              <Puzzle className="w-5 h-5" style={{ color: getCategoryColor(ext.category) }} />
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-1.5">
                                <h4 className="text-sm font-semibold truncate" style={{ color: 'var(--text-primary)' }}>
                                  {ext.display_name}
                                </h4>
                                {installed && (
                                  <span className="text-[10px] px-1 py-0.5 rounded-full bg-green-500/10 text-green-500 flex-shrink-0">
                                    已安装
                                  </span>
                                )}
                              </div>
                              <p className="text-xs mt-0.5 line-clamp-2" style={{ color: 'var(--text-muted)' }}>
                                {ext.description || '暂无描述'}
                              </p>
                              <div className="flex items-center gap-3 mt-2.5">
                                <span className="flex items-center gap-1 text-[10px]" style={{ color: 'var(--text-muted)' }}>
                                  <DownloadIcon className="w-3 h-3" />
                                  {ext.download_count}
                                </span>
                                <span className="flex items-center gap-1 text-[10px]" style={{ color: 'var(--text-muted)' }}>
                                  <Star className="w-3 h-3" />
                                  {ext.rating}
                                </span>
                                <span
                                  className="text-[10px] px-1.5 py-0.5 rounded-full flex-shrink-0"
                                  style={{
                                    backgroundColor: `${getCategoryColor(ext.category)}15`,
                                    color: getCategoryColor(ext.category),
                                  }}
                                >
                                  {getCategoryLabel(ext.category)}
                                </span>
                              </div>
                              <div className="flex items-center justify-between mt-2">
                                <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
                                  {ext.author || '未知作者'} · v{ext.version}
                                </span>
                                {installed ? (
                                  <button
                                    onClick={(e) => handleUninstall(ext.id, e)}
                                    className="text-[10px] px-2 py-1 rounded-md border transition-colors hover:bg-red-500/10 hover:border-red-500/30 hover:text-red-500"
                                    style={{ borderColor: 'var(--border-color)', color: 'var(--text-muted)' }}
                                  >
                                    卸载
                                  </button>
                                ) : (
                                  <button
                                    onClick={(e) => handleInstall(ext, e)}
                                    disabled={installingId === ext.id}
                                    className="text-[10px] px-2 py-1 rounded-md bg-blue-500 text-white transition-colors hover:bg-blue-600 disabled:opacity-50 flex items-center gap-1"
                                  >
                                    {installingId === ext.id ? (
                                      <Loader2 className="w-3 h-3 animate-spin" />
                                    ) : (
                                      <Plus className="w-3 h-3" />
                                    )}
                                    安装
                                  </button>
                                )}
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* 加载更多 */}
                  {extensions.length < total && (
                    <div className="flex justify-center mt-6">
                      <button
                        onClick={() => loadMarketplace(page + 1)}
                        disabled={loading}
                        className="px-4 py-2 rounded-lg text-xs border transition-colors hover:bg-[var(--bg-hover)] disabled:opacity-50"
                        style={{ borderColor: 'var(--border-color)', color: 'var(--text-secondary)' }}
                      >
                        {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : '加载更多'}
                      </button>
                    </div>
                  )}
                </>
              )}
            </div>

            {/* 扩展详情面板（点击卡片后显示在下方或右侧，这里复用原有布局） */}
            {selectedExtension && (
              <div className="border-t" style={{ borderColor: 'var(--border-color)' }}>
                <div className="max-w-4xl mx-auto p-6 pb-20">
                  {/* 详情头部 */}
                  <div className="flex items-start gap-4 mb-6 pb-4 border-b" style={{ borderColor: 'var(--border-color)' }}>
                    <div
                      className="w-14 h-14 rounded-2xl flex items-center justify-center flex-shrink-0"
                      style={{ backgroundColor: `${getCategoryColor(selectedExtension.category)}15` }}
                    >
                      <Puzzle className="w-7 h-7" style={{ color: getCategoryColor(selectedExtension.category) }} />
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <h1 className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>
                          {selectedExtension.display_name}
                        </h1>
                        <span className="text-xs px-2 py-0.5 rounded-full" style={{ backgroundColor: 'var(--bg-body)', color: 'var(--text-muted)' }}>
                          v{selectedExtension.version}
                        </span>
                      </div>
                      <p className="text-sm mt-1" style={{ color: 'var(--text-muted)' }}>
                        {selectedExtension.description || '暂无描述'}
                      </p>
                      <div className="flex items-center gap-4 mt-2">
                        <span className="flex items-center gap-1 text-xs" style={{ color: 'var(--text-muted)' }}>
                          <User className="w-3.5 h-3.5" />
                          {selectedExtension.author || '未知作者'}
                        </span>
                        <span className="flex items-center gap-1 text-xs" style={{ color: 'var(--text-muted)' }}>
                          <DownloadIcon className="w-3.5 h-3.5" />
                          {selectedExtension.download_count} 次下载
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
                    <div className="flex items-center gap-2">
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
                            {getUserExt(selectedExtension.id)?.is_enabled ? '已启用' : '已禁用'}
                          </button>
                          <button
                            onClick={() => handleUninstall(selectedExtension.id)}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors border hover:bg-red-500/10 hover:border-red-500/30 hover:text-red-500"
                            style={{ borderColor: 'var(--border-color)', color: 'var(--text-secondary)' }}
                          >
                            <Trash2 className="w-4 h-4" />
                            卸载
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
                          安装
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
                      <p className="text-sm">暂无文档</p>
                    </div>
                  )}
                </div>
              </div>
            )}
          </>
        ) : (
          /* 已安装扩展详情/管理 */
          <div className="p-6">
            <h3 className="text-sm font-semibold mb-4" style={{ color: 'var(--text-primary)' }}>
              已安装扩展管理
            </h3>
            {userExtensions.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20" style={{ color: 'var(--text-muted)' }}>
                <Package className="w-12 h-12 mb-4 opacity-20" />
                <p className="text-sm">尚未安装任何扩展</p>
                <button
                  onClick={() => setActiveTab('marketplace')}
                  className="mt-3 px-4 py-2 rounded-lg bg-blue-500 text-white text-xs hover:bg-blue-600 transition-colors"
                >
                  去扩展市场浏览
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
                      <div className="flex items-center gap-2">
                        <h4 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
                          {ue.display_name}
                        </h4>
                        <span className="text-[10px] px-1.5 py-0.5 rounded" style={{ backgroundColor: 'var(--bg-body)', color: 'var(--text-muted)' }}>
                          v{ue.installed_version}
                        </span>
                        {ue.latest_version !== ue.installed_version && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-orange-500/10 text-orange-500">
                            可更新至 v{ue.latest_version}
                          </span>
                        )}
                        <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${ue.is_enabled ? 'bg-green-500/10 text-green-500' : 'bg-gray-500/10 text-gray-500'}`}>
                          {ue.is_enabled ? '已启用' : '已禁用'}
                        </span>
                      </div>
                      <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
                        {ue.description || '无描述'}
                      </p>
                      <div className="flex items-center gap-4 mt-2 text-[10px]" style={{ color: 'var(--text-muted)' }}>
                        <span className="flex items-center gap-1">
                          <User className="w-3 h-3" />
                          {ue.author || '未知作者'}
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
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => handleToggle(ue)}
                        className="p-2 rounded-lg transition-colors hover:bg-[var(--bg-hover)]"
                        title={ue.is_enabled ? '禁用' : '启用'}
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
                        title="卸载"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
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
