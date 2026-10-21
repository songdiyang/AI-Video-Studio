import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { Film, User, Settings, Sparkles, Moon, Sun, Monitor, Contrast, UsersRound, Puzzle, PanelLeft, PanelRight, PanelBottom, FolderOpen, GripVertical, Check, X } from 'lucide-react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useKeyboardShortcuts, ShortcutConfig, GLOBAL_SHORTCUTS_CONFIG } from '../hooks/useKeyboardShortcuts';
import KeyboardShortcutsHelp from './KeyboardShortcutsHelp';
import CommandPalette from './CommandPalette';
import { Command } from '../hooks/useCommandPalette';
import { useLanguage } from '../contexts/LanguageContext';
import { useTheme } from '../contexts/ThemeContext';
import { useWorkbench } from '../contexts/WorkbenchContext';
import { useAIAssistantUI } from '../contexts/AIAssistantContext';
import { useToast } from '../contexts/ToastContext';
import OnboardingOverlay from './Onboarding/OnboardingOverlay';
import { useOnboarding, OnboardingStep } from '../hooks/useOnboarding';
import NetworkStatusBar from './NetworkStatusBar';
import TitleBar, { WindowControls } from './TitleBar';
import ActivityBarSidebar from './ActivityBar/ActivityBarSidebar';
import AIAssistantSidePanel from './ActivityBar/AIAssistantSidePanel';
import BottomTaskPanel from './ActivityBar/BottomTaskPanel';
import AppMenuBar, { AppMenu } from './ActivityBar/AppMenuBar';
import InternalMailbox from './InternalMailbox';
// import LowBalanceBanner from './LowBalanceBanner';
import { useRoutePreload } from '../hooks/useRoutePreload';
import { isDesktop } from '../utils/runtimeMode';

interface LayoutProps {
  children: React.ReactNode;
}

// 响应式断点 Hook
function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(
    () => typeof window !== 'undefined' && window.matchMedia(query).matches
  );
  
  useEffect(() => {
    if (typeof window === 'undefined') return;
    
    const mql = window.matchMedia(query);
    const handler = (e: MediaQueryListEvent) => setMatches(e.matches);
    
    mql.addEventListener('change', handler);
    return () => mql.removeEventListener('change', handler);
  }, [query]);
  
  return matches;
}

const Layout: React.FC<LayoutProps> = ({ children }) => {
  const location = useLocation();
  const navigate = useNavigate();
  const { t, language, setLanguage } = useLanguage();
  const { theme, setTheme } = useTheme();
  const { projectType, currentProject, switchProject, leftSidebarTab, setLeftSidebarTab, bottomPanelOpen, toggleBottomPanel, hasUnsavedChanges } = useWorkbench();
  const { isOpen: isAIAssistantOpen, toggle: toggleAIAssistant, projectId: aiProjectId } = useAIAssistantUI();
  const { showToast } = useToast();
  // 桌面端本地优先：不依赖后端，跳过健康检测（网络仅反映联网状态）
  const offlineMode = isDesktop();

  // 活动栏点击：切换左侧栏活动（再次点击同一活动则收起）
  const switchWorkbenchLeftTab = useCallback((tabId: string) => {
    setLeftSidebarTab(leftSidebarTab === tabId ? null : tabId);
  }, [leftSidebarTab, setLeftSidebarTab]);

  const [isConnected, setIsConnected] = useState(true);
  // 纯网络连通性指示（在线/无网），不再把“离线模式/本地模式”当作功能概念展示
  const [netOnline, setNetOnline] = useState(() => (typeof navigator !== 'undefined' ? navigator.onLine : true));
  const [showShortcutsHelp, setShowShortcutsHelp] = useState(false);
  const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);

  // 侧边栏导航项排序状态（支持长按拖拽排序）
  const [navOrder, setNavOrder] = useState<string[]>(() => {
    try {
      const stored = localStorage.getItem('nanostory_nav_order');
      return stored ? JSON.parse(stored) : ['/', '/projects'];
    } catch {
      return ['/', '/projects'];
    }
  });
  const [draggingNav, setDraggingNav] = useState<string | null>(null);
  const [dragOverNav, setDragOverNav] = useState<string | null>(null);
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isLongPressRef = useRef(false);
  
  // 响应式断点
  const isMobile = useMediaQuery('(max-width: 767px)');
  const isTablet = useMediaQuery('(min-width: 768px) and (max-width: 1280px)');

  // 路由预加载
  const { preload } = useRoutePreload();

  // 导航项配置（使用 useMemo 优化，依赖 t 对象）
  const navItems = useMemo(() => {
    const allItems = [
      { path: '/', icon: Film, label: t.nav.workspace },
      { path: '/projects', icon: FolderOpen, label: t.nav.projects },
    ];
    // 按 navOrder 排序
    const orderMap = new Map(navOrder.map((p, i) => [p, i]));
    return allItems.sort((a, b) => {
      const ai = orderMap.get(a.path) ?? 999;
      const bi = orderMap.get(b.path) ?? 999;
      return ai - bi;
    });
  }, [t, navOrder]);

  // ===== 活动栏按钮显示/隐藏（右键菜单可勾选，持久化） =====
  const HIDDEN_NAV_KEY = 'vscode_activitybar_hidden';
  const [hiddenNavItems, setHiddenNavItems] = useState<string[]>(() => {
    try {
      const stored = localStorage.getItem(HIDDEN_NAV_KEY);
      return stored ? JSON.parse(stored) : [];
    } catch { return []; }
  });
  // 右键上下文菜单状态
  const [activityMenu, setActivityMenu] = useState<{ x: number; y: number } | null>(null);

  // 切换某个按钮的显示/隐藏
  const toggleNavItemVisible = useCallback((id: string) => {
    setHiddenNavItems(prev => {
      const next = prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id];
      try { localStorage.setItem(HIDDEN_NAV_KEY, JSON.stringify(next)); } catch { /* 忽略 */ }
      return next;
    });
  }, []);

  // 活动栏右键：打开上下文菜单
  const handleActivityBarContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setActivityMenu({ x: e.clientX, y: e.clientY });
  }, []);

  // 点击外部 / Esc 关闭上下文菜单
  useEffect(() => {
    if (!activityMenu) return;
    const onDown = () => setActivityMenu(null);
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setActivityMenu(null); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [activityMenu]);

  // 活动栏所有可配置按钮，用于右键菜单
  const activityBarItems = useMemo(() => [
    ...navItems.map(item => ({ id: item.path, label: item.label })),
  ], [navItems]);

  // 过滤后的可见导航项
  const visibleNavItems = useMemo(
    () => navItems.filter(item => !hiddenNavItems.includes(item.path)),
    [navItems, hiddenNavItems],
  );

  // 长按拖拽排序逻辑
  const handleNavPointerDown = useCallback((path: string) => (e: React.PointerEvent) => {
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    isLongPressRef.current = false;
    longPressTimerRef.current = setTimeout(() => {
      isLongPressRef.current = true;
      setDraggingNav(path);
      // 添加拖拽时的视觉反馈
      document.body.style.cursor = 'grabbing';
    }, 500); // 500ms 长按触发
  }, []);

  const handleNavPointerMove = useCallback((e: React.PointerEvent) => {
    if (!draggingNav) return;
    e.preventDefault();
    // 获取鼠标下方的元素
    const element = document.elementFromPoint(e.clientX, e.clientY);
    const navItem = element?.closest('[data-nav-path]');
    if (navItem) {
      const path = navItem.getAttribute('data-nav-path');
      if (path && path !== draggingNav) {
        setDragOverNav(path);
      }
    }
  }, [draggingNav]);

  const handleNavPointerUp = useCallback((e: React.PointerEvent) => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
    
    if (draggingNav && dragOverNav && draggingNav !== dragOverNav) {
      // 执行排序交换
      setNavOrder(prev => {
        const newOrder = [...prev];
        const fromIdx = newOrder.indexOf(draggingNav);
        const toIdx = newOrder.indexOf(dragOverNav);
        if (fromIdx !== -1 && toIdx !== -1) {
          const [removed] = newOrder.splice(fromIdx, 1);
          newOrder.splice(toIdx, 0, removed);
        }
        // 持久化到 localStorage
        try {
          localStorage.setItem('nanostory_nav_order', JSON.stringify(newOrder));
        } catch {}
        return newOrder;
      });
    }
    
    setDraggingNav(null);
    setDragOverNav(null);
    document.body.style.cursor = '';
    isLongPressRef.current = false;
  }, [draggingNav, dragOverNav]);

  // 清理长按定时器
  useEffect(() => {
    return () => {
      if (longPressTimerRef.current) {
        clearTimeout(longPressTimerRef.current);
      }
    };
  }, []);



  // 真实后端连接状态检测（每30秒 ping 一次 /api/health）
  // 离线模式（桌面端）不依赖后端，直接视为"本地模式"，跳过轮询。
  useEffect(() => {
    if (offlineMode) {
      setIsConnected(true);
      return;
    }
    let timer: ReturnType<typeof setTimeout>;
    let mounted = true;

    const ping = async () => {
      try {
        const res = await fetch('/api/health', { method: 'GET', signal: AbortSignal.timeout(5000) });
        if (mounted) setIsConnected(res.ok);
      } catch {
        if (mounted) setIsConnected(false);
      }
    };

    // 浏览器网络恢复时立刻 ping
    const handleOnline = () => ping();
    const handleOffline = () => { if (mounted) setIsConnected(false); };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // 初次 + 定时检测
    ping();
    const schedule = () => { timer = setTimeout(async () => { await ping(); if (mounted) schedule(); }, 30000); };
    schedule();

    return () => {
      mounted = false;
      clearTimeout(timer);
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [offlineMode]);

  // 网络连通性监听（与后端/本地功能无关，仅反映联网状态）
  useEffect(() => {
    const goOnline = () => setNetOnline(true);
    const goOffline = () => setNetOnline(false);
    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);
    return () => {
      window.removeEventListener('online', goOnline);
      window.removeEventListener('offline', goOffline);
    };
  }, []);

  // 监听全屏状态变化
  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    setIsFullscreen(!!document.fullscreenElement);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  // 切换全屏
  const toggleFullscreen = async () => {
    try {
      if (!document.fullscreenElement) {
        await document.documentElement.requestFullscreen();
      } else {
        await document.exitFullscreen();
      }
    } catch (err) {
      console.error('Fullscreen error:', err);
    }
  };



  // 命令面板命令列表
  const commands: Command[] = useMemo(() => [
    // 导航类
    { id: 'nav-workspace', title: t.nav.workspace, category: 'navigation', icon: <Film className="w-4 h-4" />, shortcut: 'Ctrl+1', action: () => navigate('/'), keywords: ['studio', '工作台', '创作'] },
    // 资产管理已集成到工作台标签页，不再作为独立入口
    // { id: 'nav-assets', title: t.nav.assets, category: 'navigation', icon: <Package className="w-4 h-4" />, shortcut: 'Ctrl+2', action: () => navigate('/assets'), keywords: ['asset', '素材', '角色'] },
    { id: 'nav-projects', title: t.nav.projects, category: 'navigation', icon: <FolderOpen className="w-4 h-4" />, shortcut: 'Ctrl+2', action: () => switchWorkbenchLeftTab('projects'), keywords: ['project', '工程'] },
    // { id: 'nav-sketch', title: t.nav.sketch, category: 'navigation', icon: <Pencil className="w-4 h-4" />, shortcut: 'Ctrl+4', action: () => navigate('/sketch'), keywords: ['draw', '绘制', '草图'] },
    { id: 'nav-settings', title: t.nav.settings, category: 'navigation', icon: <Settings className="w-4 h-4" />, shortcut: 'Ctrl+5', action: () => { navigate('/'); setTimeout(() => window.dispatchEvent(new CustomEvent('openSettingsTab')), 100); }, keywords: ['setting', '设置', '偏好'] },
    // 操作类
    { id: 'action-shortcuts', title: t.commandPalette.commands.showShortcuts, category: 'action', action: () => setShowShortcutsHelp(true), keywords: ['keyboard', '快捷键', 'shortcut'] },
    // 设置类
    { id: 'settings-dark', title: t.commandPalette.commands.themeDark, category: 'settings', icon: <Moon className="w-4 h-4" />, action: () => setTheme('dark'), keywords: ['theme', '主题', '深色', 'dark'] },
    { id: 'settings-light', title: t.commandPalette.commands.themeLight, category: 'settings', icon: <Sun className="w-4 h-4" />, action: () => setTheme('light'), keywords: ['theme', '主题', '浅色', 'light'] },
    { id: 'settings-high-contrast', title: t.commandPalette.commands.themeHighContrast, category: 'settings', icon: <Contrast className="w-4 h-4" />, action: () => setTheme('high-contrast'), keywords: ['theme', '主题', '高对比度', 'contrast'] },
    { id: 'settings-system', title: t.commandPalette.commands.themeSystem, category: 'settings', icon: <Monitor className="w-4 h-4" />, action: () => setTheme('system'), keywords: ['theme', '主题', '系统', 'system'] },
    { id: 'settings-lang-zh', title: t.commandPalette.commands.langZh, category: 'settings', action: () => setLanguage('zh-CN'), keywords: ['language', '语言', '中文'] },
    { id: 'settings-lang-en', title: t.commandPalette.commands.langEn, category: 'settings', action: () => setLanguage('en-US'), keywords: ['language', '语言', 'english'] },
  ], [t, navigate, setTheme, setLanguage, switchWorkbenchLeftTab]);

  // 全局快捷键
  const globalShortcuts = useMemo<ShortcutConfig[]>(() => [
    {
      ...GLOBAL_SHORTCUTS_CONFIG.NAVIGATE_WORKSPACE,
      action: () => navigate('/'),
    },
    // 资产管理已集成到工作台标签页，快捷键已移除
    // {
    //   ...GLOBAL_SHORTCUTS_CONFIG.NAVIGATE_ASSETS,
    //   action: () => navigate('/assets'),
    // },
    {
      ...GLOBAL_SHORTCUTS_CONFIG.NAVIGATE_PROJECTS,
      action: () => switchWorkbenchLeftTab('projects'),
    },
    // {
    //   ...GLOBAL_SHORTCUTS_CONFIG.NAVIGATE_SKETCH,
    //   action: () => navigate('/sketch'),
    // },
    {
      ...GLOBAL_SHORTCUTS_CONFIG.NAVIGATE_SETTINGS,
      action: () => { navigate('/'); setTimeout(() => window.dispatchEvent(new CustomEvent('openSettingsTab')), 100); },
    },
    {
      ...GLOBAL_SHORTCUTS_CONFIG.SHOW_HELP,
      action: () => setShowShortcutsHelp(true),
    },
    {
      ...GLOBAL_SHORTCUTS_CONFIG.COMMAND_PALETTE,
      action: () => setIsCommandPaletteOpen(true),
    },
  ], [navigate, switchWorkbenchLeftTab]);

  // 注册全局快捷键
  useKeyboardShortcuts(globalShortcuts);

  // 引导系统步骤配置（首尾为居中步骤，无 target）
  const onboardingSteps: OnboardingStep[] = useMemo(() => [
    { title: t.onboarding?.steps?.welcome?.title || '欢迎使用 AI 视频编辑器', description: t.onboarding?.steps?.welcome?.description || '跟随几步引导，快速了解界面布局与核心功能。随时可按右上角跳过。' },
    { target: '[data-onboarding="sidebar"]', title: t.onboarding?.steps?.sidebar?.title || '导航侧边栏', description: t.onboarding?.steps?.sidebar?.description || '这是您的主导航区域，可以快速切换不同的功能模块。', placement: 'right' },
    { target: '[data-onboarding="nav-workspace"]', title: t.onboarding?.steps?.workspace?.title || '创作工作台', description: t.onboarding?.steps?.workspace?.description || '在这里开始您的创作之旅，编写剧本、生成分镜。', placement: 'right' },
    { target: '[data-onboarding="shortcuts-hint"]', title: t.onboarding?.steps?.shortcuts?.title || '快捷键系统', description: t.onboarding?.steps?.shortcuts?.description || '按 ? 查看所有快捷键，按 Ctrl+K 打开命令面板快速执行操作。', placement: 'top' },
    { target: '[data-onboarding="nav-settings"]', title: t.onboarding?.steps?.settings?.title || '个性化设置', description: t.onboarding?.steps?.settings?.description || '自定义界面主题、语言偏好，让工作环境更舒适。', placement: 'right' },
    { title: t.onboarding?.steps?.finish?.title || '准备就绪', description: t.onboarding?.steps?.finish?.description || '现在可以从工作台创建您的第一个项目，开启 AI 视频创作之旅。' },
  ], [t]);

  // 引导系统（移动端禁用）
  const onboarding = useOnboarding(onboardingSteps, isMobile);

  // 监听重置引导事件
  useEffect(() => {
    const handler = () => onboarding.resetOnboarding();
    window.addEventListener('reset-onboarding', handler);
    return () => window.removeEventListener('reset-onboarding', handler);
  }, [onboarding.resetOnboarding]);

  // ===== VSCode 式应用菜单（文件/编辑/查看/转到/帮助） =====
  const appMenus = useMemo<AppMenu[]>(() => {
    const execCmd = (cmd: string) => {
      try { (document as any).execCommand?.(cmd); } catch { /* 忽略 */ }
    };
    return [
      {
        id: 'file',
        label: t.menu.file,
        items: [
          { label: t.menu.newProject, shortcut: 'Ctrl+N', action: () => { setLeftSidebarTab('projects'); } },
          { label: t.menu.openProject, shortcut: 'Ctrl+O', action: () => { setLeftSidebarTab('projects'); } },
          { label: t.menu.openRecent, action: () => setLeftSidebarTab('projects') },
          { label: '-' },
          { label: t.menu.save, shortcut: 'Ctrl+S', action: () => execCmd('save') },
          { label: t.menu.saveAll, shortcut: 'Ctrl+K S', disabled: true },
          { label: '-' },
          { label: t.menu.closeWindow, shortcut: 'Alt+F4', action: () => window.close() },
        ],
      },
      {
        id: 'edit',
        label: t.menu.edit,
        items: [
          { label: t.menu.undo, shortcut: 'Ctrl+Z', action: () => execCmd('undo') },
          { label: t.menu.redo, shortcut: 'Ctrl+Y', action: () => execCmd('redo') },
          { label: '-' },
          { label: t.menu.cut, shortcut: 'Ctrl+X', action: () => execCmd('cut') },
          { label: t.menu.copy, shortcut: 'Ctrl+C', action: () => execCmd('copy') },
          { label: t.menu.paste, shortcut: 'Ctrl+V', action: () => execCmd('paste') },
          { label: '-' },
          { label: t.menu.selectAll, shortcut: 'Ctrl+A', action: () => execCmd('selectAll') },
        ],
      },
      {
        id: 'view',
        label: t.menu.view,
        items: [
          { label: t.menu.leftSidebar, shortcut: 'Ctrl+B', checked: !!leftSidebarTab, action: () => setLeftSidebarTab(leftSidebarTab ? null : 'projects') },
          { label: t.menu.aiAssistant, checked: isAIAssistantOpen, action: toggleAIAssistant },
          { label: t.menu.bottomPanel, checked: bottomPanelOpen, action: toggleBottomPanel },
          { label: '-' },
          { label: t.menu.fullscreen, shortcut: 'F11', checked: isFullscreen, action: toggleFullscreen },
          { label: '-' },
          { label: t.menu.themeDark, checked: theme === 'dark', action: () => setTheme('dark') },
          { label: t.menu.themeLight, checked: theme === 'light', action: () => setTheme('light') },
          { label: t.menu.themeHighContrast, checked: theme === 'high-contrast', action: () => setTheme('high-contrast') },
          { label: t.menu.themeSystem, checked: theme === 'system', action: () => setTheme('system') },
        ],
      },
      {
        id: 'go',
        label: t.menu.go,
        items: [
          { label: t.menu.workspace, shortcut: 'Ctrl+1', action: () => navigate('/') },
          { label: t.menu.projects, shortcut: 'Ctrl+2', action: () => switchWorkbenchLeftTab('projects') },
          { label: '-' },
          { label: t.menu.settings, shortcut: 'Ctrl+,', action: () => { navigate('/'); setTimeout(() => window.dispatchEvent(new CustomEvent('openSettingsTab')), 100); } },
          { label: t.menu.commandPalette, shortcut: 'Ctrl+K', action: () => setIsCommandPaletteOpen(true) },
        ],
      },
      {
        id: 'help',
        label: t.menu.help,
        items: [
          { label: t.menu.keyboardShortcuts, shortcut: '?', action: () => setShowShortcutsHelp(true) },
          { label: t.menu.commandPalette, shortcut: 'Ctrl+K', action: () => setIsCommandPaletteOpen(true) },
          { label: '-' },
          { label: t.menu.about, action: () => showToast('AI视频编辑器 v1.0.0', 'info') },
        ],
      },
    ];
  }, [
    leftSidebarTab, setLeftSidebarTab, isAIAssistantOpen, toggleAIAssistant,
    bottomPanelOpen, toggleBottomPanel, isFullscreen, toggleFullscreen,
    theme, setTheme, navigate, switchWorkbenchLeftTab,
    setIsCommandPaletteOpen, setShowShortcutsHelp, showToast, t,
  ]);

  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden">
      {/* 顶部菜单栏 - 通栏（VSCode 式，横跨活动栏与主区域） */}
      <header data-tauri-drag-region className="pro-toolbar relative z-50 h-11 items-center justify-between pl-3 pr-2 bg-(--bg-nav) border-b border-(--border-color) hide-on-mobile flex select-none shrink-0 w-full">
        {/* 左侧：VSCode 式应用菜单（原 logo 位置） */}
        <div data-tauri-drag-region className="flex items-center gap-1 min-w-0 flex-1">
          <AppMenuBar menus={appMenus} />
          {/* 当前打开的工程文件 */}
          {currentProject && (
            <div data-tauri-drag-region className="flex items-center gap-1.5 ml-3 min-w-0">
              <FolderOpen className="w-3 h-3 text-blue-500 shrink-0" />
              <span className="text-xs font-medium text-(--text-primary) truncate">
                {currentProject.name}
              </span>
              {hasUnsavedChanges && (
                <span className="text-orange-500 text-xs shrink-0" title="有未保存的更改">●</span>
              )}
            </div>
          )}
        </div>

        {/* 中间：可拖拽空白区（当左侧内容过多时收缩） */}
        <div data-tauri-drag-region className="flex-shrink h-full min-w-25" />

        {/* 右侧：辅助控件 */}
        <div data-tauri-drag-region className="flex items-center gap-3">
          {/* 布局切换按钮组（VSCode 式），按方位排序：左侧栏 / 底部面板 / 右侧栏 */}
          <div className="flex items-center gap-0.5 bg-white/5 rounded-lg p-0.5">
            <button
              onClick={() => setLeftSidebarTab(leftSidebarTab ? null : 'projects')}
              className={`p-1 rounded transition-colors ${
                leftSidebarTab
                  ? 'bg-(--accent)/15 text-(--accent)'
                  : 'text-(--text-muted) hover:text-(--text-primary) hover:bg-white/5'
              }`}
              aria-label="左侧栏"
              title="左侧栏"
            >
              <PanelLeft className="w-4 h-4" />
            </button>
            <button
              onClick={toggleBottomPanel}
              className={`p-1 rounded transition-colors ${
                bottomPanelOpen
                  ? 'bg-(--accent)/15 text-(--accent)'
                  : 'text-(--text-muted) hover:text-(--text-primary) hover:bg-white/5'
              }`}
              aria-label="底部面板"
              title="底部面板"
            >
              <PanelBottom className="w-4 h-4" />
            </button>
            <button
              onClick={toggleAIAssistant}
              className={`p-1 rounded transition-colors ${
                isAIAssistantOpen
                  ? 'bg-(--accent)/15 text-(--accent)'
                  : 'text-(--text-muted) hover:text-(--text-primary) hover:bg-white/5'
              }`}
              aria-label="右侧栏"
              title="右侧栏（AI 助手）"
            >
              <PanelRight className="w-4 h-4" />
            </button>
          </div>
          {/* 积分余额入口已移除（商业化功能下线） */}
          <InternalMailbox />

          {isDesktop() && <WindowControls />}
        </div>
      </header>

      <div className="flex-1 min-h-0 flex bg-(--bg-app)">
      {/* 左侧侧边栏 - 小屏隐藏 */}
      <aside data-onboarding="sidebar" onContextMenu={handleActivityBarContextMenu} className={`pro-sidebar flex flex-col bg-(--bg-nav) border-r border-(--border-color) hide-on-mobile ${isTablet ? 'w-12' : 'w-14'}`}>
        {/* 导航图标列表 */}
        <nav className="flex-1 flex flex-col pt-2" role="navigation" aria-label={t.nav.mainNav}>
          {visibleNavItems.map((item, index) => {
            // 工作台/工程/团队：在左侧栏打开对应面板（不整页跳转）；其余走路由
            const panelTabId = item.path === '/' ? 'workspace' : item.path === '/projects' ? 'projects' : null;
            const isActive = panelTabId
              ? leftSidebarTab === panelTabId
              : location.pathname === item.path;
            const Icon = item.icon;
            const isDragging = draggingNav === item.path;
            const isDragOver = dragOverNav === item.path;

            const getOnboardingAttr = () => {
              switch (item.path) {
                case '/': return 'nav-workspace';
                case '/settings': return 'nav-settings';
                default: return undefined;
              }
            };
            const onboardingAttr = getOnboardingAttr();

            const itemClassName = `pro-nav-item group relative mx-auto ${isTablet ? 'p-2.5' : 'p-3'} flex items-center justify-center transition-all duration-200 select-none touch-none
                  ${isActive
                    ? 'bg-(--accent)/15 text-(--accent)'
                    : 'text-(--text-muted) hover:text-(--text-primary) hover:bg-white/5'
                  }
                  ${isDragging ? 'opacity-50 scale-95 cursor-grabbing z-50' : ''}
                  ${isDragOver && !isDragging ? 'bg-(--accent)/10 scale-105' : ''}
                  ${draggingNav ? 'cursor-grab' : ''}
                `;

            const itemInner = (
              <>
                {/* 激活态左侧指示条 */}
                {isActive && (
                  <div className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-6 bg-(--accent) rounded-r" />
                )}

                {/* 拖拽指示器 */}
                {isDragging && (
                  <div className="absolute inset-0 border-2 border-dashed border-(--accent) rounded-lg opacity-50" />
                )}

                <div className={`transition-transform duration-150 ${isActive ? 'scale-110' : 'hover:scale-110 active:scale-95'}`}>
                  <Icon className={`${isTablet ? 'w-4 h-4' : 'w-5 h-5'}`} />
                </div>

                {/* Tooltip */}
                <div className="absolute left-full ml-2 px-2.5 py-1.5 bg-(--bg-card) border border-(--border-color) rounded-md text-xs font-medium text-(--text-primary) whitespace-nowrap opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 z-50 shadow-lg">
                  {item.label}
                  <span className="ml-2 text-(--text-muted)">
                    {t.nav.shortcutPrefix}{index + 1}
                  </span>
                  {/* 小三角 */}
                  <div className="absolute left-0 top-1/2 -translate-y-1/2 -translate-x-1 w-2 h-2 bg-(--bg-card) border-l border-b border-(--border-color) rotate-45" />
                </div>
              </>
            );

            const dragHandlers = {
              onPointerDown: handleNavPointerDown(item.path),
              onPointerMove: handleNavPointerMove,
              onPointerUp: handleNavPointerUp,
              onPointerCancel: handleNavPointerUp,
            };

            // 我的工程/团队：在工作台左侧面板内显示，不整页跳转
            if (panelTabId) {
              return (
                <button
                  key={item.path}
                  type="button"
                  tabIndex={0}
                  aria-label={item.label}
                  aria-expanded={isActive}
                  data-onboarding={onboardingAttr}
                  data-nav-path={item.path}
                  onMouseEnter={() => preload(item.path)}
                  {...dragHandlers}
                  onClick={() => switchWorkbenchLeftTab(panelTabId)}
                  draggable={false}
                  className={itemClassName}
                >
                  {itemInner}
                </button>
              );
            }

            return (
              <Link
                key={item.path}
                to={item.path}
                tabIndex={0}
                aria-label={item.label}
                aria-current={isActive ? 'page' : undefined}
                data-onboarding={onboardingAttr}
                data-nav-path={item.path}
                onMouseEnter={() => preload(item.path)}
                {...dragHandlers}
                draggable={false}
                className={itemClassName}
              >
                {itemInner}
              </Link>
            );
          })}
        </nav>
      </aside>

      {/* VSCode 式左侧栏（内容面板，常驻可折叠可拖宽） */}
      <ActivityBarSidebar />

      {/* 右侧主区域 */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* 网络状态提示条 */}
        <NetworkStatusBar />

        {/* 小屏简化工具栏 */}
        {isMobile && (
          <header className="pro-toolbar h-12 flex items-center justify-center px-4 bg-(--bg-nav) border-b border-(--border-color)">
            <Link to="/" className="flex items-center gap-2">
              <div className="w-7 h-7 flex items-center justify-center bg-linear-to-br from-blue-500 to-blue-600 rounded-lg text-white text-sm font-bold tracking-tight">
                N
              </div>
              <span className="text-sm font-semibold text-(--text-primary)">
                {t.nav.studioName}
              </span>
            </Link>
          </header>
        )}

        {/* 主内容区：编辑区 + 右侧 AI 面板（同行） */}
        <div className="flex-1 flex min-w-0 min-h-0">
          <main className={`flex-1 overflow-hidden min-w-0 min-h-0 bg-(--bg-app) ${isMobile ? 'main-content-mobile' : ''}`}>
            {children}
          </main>
          {/* VSCode 式右侧 AI 助手面板 */}
          <AIAssistantSidePanel />
        </div>

        {/* VSCode 式底部任务面板（可折叠可拖高） */}
        <BottomTaskPanel />
      </div>

      {/* 小屏底部导航栏 */}
      {isMobile && (
        <nav className="mobile-bottom-nav show-on-mobile" role="navigation" aria-label={t.nav.bottomNav}>
          <div className="h-full flex items-center">
            {navItems.map((item) => {
              const isActive = location.pathname === item.path;
              const Icon = item.icon;
              
              return (
                <Link
                  key={item.path}
                  to={item.path}
                  className={`mobile-nav-item ${isActive ? 'active' : ''}`}
                  aria-label={item.label}
                  aria-current={isActive ? 'page' : undefined}
                >
                  <Icon className="w-5 h-5" />
                  <span className="mobile-nav-label">{item.label}</span>
                </Link>
              );
            })}
            {/* 本地用户中心入口 */}
            <button
              onClick={() => navigate('/user-center')}
              className="mobile-nav-item"
              aria-label={t.nav.userCenter}
            >
              <User className="w-5 h-5" />
              <span className="mobile-nav-label">{t.nav.my}</span>
            </button>
          </div>
        </nav>
      )}

      {/* 活动栏右键上下文菜单：勾选显示/隐藏按钮 */}
      {activityMenu && (
        <div
          className="fixed z-9999 min-w-[180px] py-1 rounded-md border border-(--border-color) shadow-2xl"
          style={{
            left: activityMenu.x,
            top: activityMenu.y,
            backgroundColor: 'var(--bg-app)',
          }}
          onMouseDown={(e) => e.stopPropagation()}
        >
          <div className="px-3 py-1.5 text-[11px] font-medium text-(--text-muted) uppercase tracking-wider">
            显示 / 隐藏
          </div>
          {activityBarItems.map((item) => {
            const visible = !hiddenNavItems.includes(item.id);
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => toggleNavItemVisible(item.id)}
                className="w-full flex items-center gap-2 px-3 py-1.5 text-left text-xs text-(--text-primary) hover:bg-(--accent) hover:text-white transition-colors"
              >
                <span className="w-4 shrink-0 flex items-center justify-center">
                  {visible && <Check className="w-3.5 h-3.5" />}
                </span>
                <span className="flex-1 truncate">{item.label}</span>
              </button>
            );
          })}
        </div>
      )}

      {/* 快捷键帮助面板 */}
      <KeyboardShortcutsHelp
        isOpen={showShortcutsHelp}
        onClose={() => setShowShortcutsHelp(false)}
      />

      {/* 命令面板 */}
      <CommandPalette
        isOpen={isCommandPaletteOpen}
        onClose={() => setIsCommandPaletteOpen(false)}
        commands={commands}
      />

      {/* 新手引导系统 */}
      <OnboardingOverlay
        isActive={onboarding.isActive}
        currentStep={onboarding.currentStep}
        currentStepIndex={onboarding.currentStepIndex}
        totalSteps={onboarding.totalSteps}
        onNext={onboarding.nextStep}
        onPrev={onboarding.prevStep}
        onSkip={onboarding.skip}
      />

      </div>

      {/* VSCode 式状态栏 - 最底部通栏（跨活动栏与主区域） */}
      <footer className="pro-statusbar h-7 items-center justify-between px-4 bg-(--bg-nav) border-t border-(--border-color) hide-on-mobile flex shrink-0">
        {/* 左侧：连接状态 */}
        <div className="flex items-center gap-2">
          {netOnline ? (
            <>
              <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
              <span className="text-xs text-(--text-muted)">{t.nav.connected}</span>
            </>
          ) : (
            <>
              <span className="w-2 h-2 rounded-full bg-amber-500" />
              <span className="text-xs text-(--text-muted)">{t.nav.disconnected}</span>
            </>
          )}
        </div>

        {/* 中间：快捷键提示 */}
        <div className="flex items-center">
          <button
            onClick={() => setShowShortcutsHelp(true)}
            className="text-xs text-(--text-muted) hover:text-(--text-secondary) transition-colors"
            aria-label={t.nav.showShortcuts}
            data-onboarding="shortcuts-hint"
          >
            {t.nav.pressForShortcuts}
          </button>
        </div>

        {/* 右侧：底部面板切换 + 版本信息 */}
        <div className="flex items-center gap-3">
          <button
            onClick={toggleBottomPanel}
            className={`flex items-center gap-1 text-xs transition-colors ${bottomPanelOpen ? 'text-(--accent)' : 'text-(--text-muted) hover:text-(--text-secondary)'}`}
            aria-label={t.nav.taskPanel}
            title={t.nav.taskPanel}
          >
            <PanelBottom className="w-3.5 h-3.5" />
            <span>{t.nav.tasks}</span>
          </button>
          <span className="text-xs text-(--text-muted)">v1.0.0</span>
        </div>
      </footer>
    </div>
  );
};

export default Layout;
