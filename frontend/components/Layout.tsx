import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { Film, User, LogOut, Settings, Sparkles, Moon, Sun, Monitor, Contrast, UsersRound, Puzzle, HelpCircle, PanelLeft, PanelRight, PanelBottom, FolderOpen, GripVertical, Check, X } from 'lucide-react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Dropdown, DropdownTrigger, DropdownMenu, DropdownItem } from "@heroui/react";
import { getAuthToken, logout } from '../services/auth';
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
import AuthModal from './AuthModal';
// import LowBalanceBanner from './LowBalanceBanner';
import { useRoutePreload } from '../hooks/useRoutePreload';
import { useOfflineMode, isDesktop } from '../utils/runtimeMode';

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
  const isAuth = location.pathname === '/auth';
  const isLoggedIn = !!getAuthToken();
  // 离线模式（桌面端默认开启）：跳过依赖后端的健康检测与用户资料拉取
  const offlineMode = useOfflineMode();

  // 扩展按钮激活态：左侧栏选中扩展
  const isExtensionsActive = leftSidebarTab === 'extensions';

  // 活动栏点击：切换左侧栏活动（再次点击同一活动则收起）
  const switchWorkbenchLeftTab = useCallback((tabId: string) => {
    setLeftSidebarTab(leftSidebarTab === tabId ? null : tabId);
  }, [leftSidebarTab, setLeftSidebarTab]);

  const [isConnected, setIsConnected] = useState(true);
  const [showShortcutsHelp, setShowShortcutsHelp] = useState(false);
  const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [userAvatar, setUserAvatar] = useState<string | null>(null);
  const [userNickname, setUserNickname] = useState<string | null>(null);
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);

  // 侧边栏导航项排序状态（支持长按拖拽排序）
  const [navOrder, setNavOrder] = useState<string[]>(() => {
    try {
      const stored = localStorage.getItem('nanostory_nav_order');
      return stored ? JSON.parse(stored) : ['/', '/projects', '/teams'];
    } catch {
      return ['/', '/projects', '/teams'];
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

  // 获取用户头像和昵称（从localStorage或API）
  useEffect(() => {
    if (offlineMode || !isLoggedIn) {
      setUserAvatar(null);
      setUserNickname(null);
      return;
    }
    // 先从 localStorage 读取
    try {
      const stored = localStorage.getItem('auth_user');
      if (stored) {
        const user = JSON.parse(stored);
        if (user.avatar_url) setUserAvatar(user.avatar_url);
        if (user.nickname) setUserNickname(user.nickname);
      }
    } catch {}
    // 再从 API 拉取最新
    const token = getAuthToken();
    if (token) {
      fetch('/api/users/profile', { headers: { Authorization: `Bearer ${token}` } })
        .then(res => res.ok ? res.json() : null)
        .then(data => {
          if (data) {
            setUserAvatar(data.avatar_url || null);
            setUserNickname(data.nickname || null);
            // 同步到 localStorage
            try {
              const stored = localStorage.getItem('auth_user');
              if (stored) {
                const user = JSON.parse(stored);
                localStorage.setItem('auth_user', JSON.stringify({ ...user, avatar_url: data.avatar_url, nickname: data.nickname }));
              }
            } catch {}
          }
        })
        .catch(() => {});
    }
  }, [isLoggedIn, offlineMode]);

  // 导航项配置（使用 useMemo 优化，依赖 t 对象）
  const navItems = useMemo(() => {
    const allItems = [
      { path: '/', icon: Film, label: t.nav.workspace },
      { path: '/projects', icon: FolderOpen, label: t.nav.projects },
      { path: '/teams', icon: UsersRound, label: '团队' },
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

  // 活动栏所有可配置按钮（含扩展），用于右键菜单
  const activityBarItems = useMemo(() => [
    ...navItems.map(item => ({ id: item.path, label: item.label })),
    { id: 'extensions', label: '扩展' },
  ], [navItems]);

  // 过滤后的可见导航项
  const visibleNavItems = useMemo(
    () => navItems.filter(item => !hiddenNavItems.includes(item.path)),
    [navItems, hiddenNavItems],
  );
  const isExtensionsVisible = !hiddenNavItems.includes('extensions');

  // 扩展按钮点击：导航到工作台并切换到扩展标签页
  const handleOpenExtensions = useCallback(() => {
    switchWorkbenchLeftTab('extensions');
  }, [switchWorkbenchLeftTab]);

  // 扩展按钮长按拖拽排序事件（与导航项一致）
  const handleExtPointerDown = useCallback((e: React.PointerEvent) => {
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    isLongPressRef.current = false;
    longPressTimerRef.current = setTimeout(() => {
      isLongPressRef.current = true;
      setDraggingNav('extensions');
      document.body.style.cursor = 'grabbing';
    }, 500);
  }, []);

  const handleExtPointerMove = useCallback((e: React.PointerEvent) => {
    if (draggingNav !== 'extensions') return;
    e.preventDefault();
    const element = document.elementFromPoint(e.clientX, e.clientY);
    const navItem = element?.closest('[data-nav-path]');
    if (navItem) {
      const path = navItem.getAttribute('data-nav-path');
      if (path && path !== 'extensions') {
        setDragOverNav(path);
      }
    }
  }, [draggingNav]);

  const handleExtPointerUp = useCallback((e: React.PointerEvent) => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
    if (draggingNav && dragOverNav && draggingNav !== dragOverNav) {
      // 扩展不参与排序，直接取消拖拽
      setDraggingNav(null);
      setDragOverNav(null);
      document.body.style.cursor = '';
      isLongPressRef.current = false;
      return;
    }
    if (!isLongPressRef.current) {
      // 短按：打开扩展面板
      handleOpenExtensions();
    }
    setDraggingNav(null);
    setDragOverNav(null);
    document.body.style.cursor = '';
    isLongPressRef.current = false;
  }, [draggingNav, dragOverNav, handleOpenExtensions]);

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

  // 注册全局快捷键（非登录页面生效）
  useKeyboardShortcuts(globalShortcuts, !isAuth);

  // 引导系统步骤配置
  const onboardingSteps: OnboardingStep[] = useMemo(() => [
    { target: '[data-onboarding="sidebar"]', title: t.onboarding?.steps?.sidebar?.title || '导航侧边栏', description: t.onboarding?.steps?.sidebar?.description || '这是您的主导航区域，可以快速切换不同的功能模块。', placement: 'right' },
    { target: '[data-onboarding="nav-workspace"]', title: t.onboarding?.steps?.workspace?.title || '创作工作台', description: t.onboarding?.steps?.workspace?.description || '在这里开始您的创作之旅，编写剧本、生成分镜。', placement: 'right' },
    // 资产管理已集成到工作台标签页，引导步骤已移除
    // { target: '[data-onboarding="nav-assets"]', title: t.onboarding?.steps?.assets?.title || '资产管理', description: t.onboarding?.steps?.assets?.description || '管理您的角色、场景、道具等创作素材。', placement: 'right' },
    { target: '[data-onboarding="shortcuts-hint"]', title: t.onboarding?.steps?.shortcuts?.title || '快捷键系统', description: t.onboarding?.steps?.shortcuts?.description || '按 ? 查看所有快捷键，按 Ctrl+K 打开命令面板快速执行操作。', placement: 'top' },
    { target: '[data-onboarding="nav-settings"]', title: t.onboarding?.steps?.settings?.title || '个性化设置', description: t.onboarding?.steps?.settings?.description || '自定义界面主题、语言偏好，让工作环境更舒适。', placement: 'right' },
  ], [t]);

  // 引导系统（移动端禁用）
  const onboarding = useOnboarding(onboardingSteps, isMobile);

  // 监听重置引导事件
  useEffect(() => {
    const handler = () => onboarding.resetOnboarding();
    window.addEventListener('reset-onboarding', handler);
    return () => window.removeEventListener('reset-onboarding', handler);
  }, [onboarding.resetOnboarding]);

  const handleAccountClick = (e: React.MouseEvent) => {
    if (!isLoggedIn) {
      e.preventDefault();
      setIsAuthModalOpen(true);
    }
  };

  const handleLogout = () => {
    logout();
    window.location.reload();
  };

  // ===== VSCode 式应用菜单（文件/编辑/查看/转到/帮助） =====
  const appMenus = useMemo<AppMenu[]>(() => {
    const execCmd = (cmd: string) => {
      try { (document as any).execCommand?.(cmd); } catch { /* 忽略 */ }
    };
    return [
      {
        id: 'file',
        label: '文件(F)',
        items: [
          { label: '新建工程', shortcut: 'Ctrl+N', action: () => { setLeftSidebarTab('projects'); } },
          { label: '打开工程...', shortcut: 'Ctrl+O', action: () => { setLeftSidebarTab('projects'); } },
          { label: '打开最近的工程', action: () => setLeftSidebarTab('projects') },
          { label: '-' },
          { label: '保存', shortcut: 'Ctrl+S', action: () => execCmd('save') },
          { label: '全部保存', shortcut: 'Ctrl+K S', disabled: true },
          { label: '-' },
          { label: '关闭窗口', shortcut: 'Alt+F4', action: () => window.close() },
        ],
      },
      {
        id: 'edit',
        label: '编辑(E)',
        items: [
          { label: '撤销', shortcut: 'Ctrl+Z', action: () => execCmd('undo') },
          { label: '重做', shortcut: 'Ctrl+Y', action: () => execCmd('redo') },
          { label: '-' },
          { label: '剪切', shortcut: 'Ctrl+X', action: () => execCmd('cut') },
          { label: '复制', shortcut: 'Ctrl+C', action: () => execCmd('copy') },
          { label: '粘贴', shortcut: 'Ctrl+V', action: () => execCmd('paste') },
          { label: '-' },
          { label: '全选', shortcut: 'Ctrl+A', action: () => execCmd('selectAll') },
        ],
      },
      {
        id: 'view',
        label: '查看(V)',
        items: [
          { label: '左侧栏', shortcut: 'Ctrl+B', checked: !!leftSidebarTab, action: () => setLeftSidebarTab(leftSidebarTab ? null : 'projects') },
          { label: 'AI 助手', checked: isAIAssistantOpen, action: toggleAIAssistant },
          { label: '底部面板', checked: bottomPanelOpen, action: toggleBottomPanel },
          { label: '-' },
          { label: '全屏', shortcut: 'F11', checked: isFullscreen, action: toggleFullscreen },
          { label: '-' },
          { label: '深色主题', checked: theme === 'dark', action: () => setTheme('dark') },
          { label: '浅色主题', checked: theme === 'light', action: () => setTheme('light') },
          { label: '高对比主题', checked: theme === 'high-contrast', action: () => setTheme('high-contrast') },
          { label: '跟随系统', checked: theme === 'system', action: () => setTheme('system') },
        ],
      },
      {
        id: 'go',
        label: '转到(G)',
        items: [
          { label: '创作工作台', shortcut: 'Ctrl+1', action: () => navigate('/') },
          { label: '我的工程', shortcut: 'Ctrl+2', action: () => switchWorkbenchLeftTab('projects') },
          { label: '团队', shortcut: 'Ctrl+3', action: () => switchWorkbenchLeftTab('teams') },
          { label: '扩展', shortcut: 'Ctrl+4', action: () => switchWorkbenchLeftTab('extensions') },
          { label: '-' },
          { label: '设置', shortcut: 'Ctrl+,', action: () => { navigate('/'); setTimeout(() => window.dispatchEvent(new CustomEvent('openSettingsTab')), 100); } },
          { label: '命令面板', shortcut: 'Ctrl+K', action: () => setIsCommandPaletteOpen(true) },
        ],
      },
      {
        id: 'help',
        label: '帮助(H)',
        items: [
          { label: '键盘快捷键', shortcut: '?', action: () => setShowShortcutsHelp(true) },
          { label: '命令面板', shortcut: 'Ctrl+K', action: () => setIsCommandPaletteOpen(true) },
          { label: '-' },
          { label: '关于 子墨视频Studio', action: () => showToast('子墨视频Studio v1.0.0', 'info') },
        ],
      },
    ];
  }, [
    leftSidebarTab, setLeftSidebarTab, isAIAssistantOpen, toggleAIAssistant,
    bottomPanelOpen, toggleBottomPanel, isFullscreen, toggleFullscreen,
    theme, setTheme, navigate, switchWorkbenchLeftTab,
    setIsCommandPaletteOpen, setShowShortcutsHelp, showToast,
  ]);

  // Auth 页面不显示导航
  if (isAuth) {
    return (
      <div className="flex flex-col h-screen w-screen overflow-hidden">
        {isDesktop() && <TitleBar />}
        <div className="flex-1 min-h-0 flex bg-(--bg-app)">
          <main className="flex-1 overflow-hidden">
            {children}
          </main>
        </div>
      </div>
    );
  }

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
        <div data-tauri-drag-region className="flex-shrink h-full min-w-[100px]" />

        {/* 右侧：辅助控件 */}
        <div data-tauri-drag-region className="flex items-center gap-3">
          {/* 布局切换按钮组（VSCode 式），按方位排序：左侧栏 / 底部面板 / 右侧栏 */}
          <div className="flex items-center gap-0.5 bg-white/5 rounded-lg p-0.5">
            <button
              onClick={() => setLeftSidebarTab(leftSidebarTab ? null : 'projects')}
              className={`p-1 rounded transition-colors ${
                leftSidebarTab
                  ? 'bg-[var(--accent)]/15 text-[var(--accent)]'
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
                  ? 'bg-[var(--accent)]/15 text-[var(--accent)]'
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
                  ? 'bg-[var(--accent)]/15 text-[var(--accent)]'
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

          {/* 用户入口（登录 / 账户菜单） */}
          {isLoggedIn ? (
            <Dropdown placement="bottom-end">
              <DropdownTrigger>
                <button
                  className="p-1.5 rounded-lg text-(--text-muted) hover:text-(--text-primary) hover:bg-white/10 transition-colors"
                  aria-label={t.nav.myAccount}
                  title={t.nav.myAccount}
                >
                  {userAvatar ? (
                    <img src={userAvatar} alt="" className="w-5 h-5 rounded-full object-cover" />
                  ) : (
                    <User className="w-4 h-4" />
                  )}
                </button>
              </DropdownTrigger>
              <DropdownMenu
                aria-label={t.nav.userMenu}
                classNames={{
                  base: "bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 shadow-lg rounded-xl min-w-[160px] p-1",
                  list: "bg-transparent gap-0.5"
                }}
              >
                <DropdownItem
                  key="profile"
                  className="text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg py-2.5"
                  startContent={<User className="w-4 h-4 text-slate-500" />}
                  onPress={() => navigate('/user-center')}
                  description={userNickname || undefined}
                >
                  {t.nav.userCenter}
                </DropdownItem>
                <DropdownItem
                  key="settings"
                  className="text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg py-2.5"
                  startContent={<Settings className="w-4 h-4 text-slate-500" />}
                  onPress={() => {
                    navigate('/');
                    setTimeout(() => {
                      window.dispatchEvent(new CustomEvent('openSettingsTab'));
                    }, 100);
                  }}
                >
                  {t.nav.settings}
                </DropdownItem>
                <DropdownItem
                  key="helpDocs"
                  className="text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg py-2.5"
                  startContent={<HelpCircle className="w-4 h-4 text-blue-500" />}
                  onPress={() => window.open('https://doubao.com', '_blank')}
                >
                  {t.nav.helpDocs}
                </DropdownItem>
                <DropdownItem
                  key="logout"
                  className="text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 rounded-lg py-2.5"
                  color="danger"
                  startContent={<LogOut className="w-4 h-4" />}
                  onPress={handleLogout}
                >
                  {t.common.logout}
                </DropdownItem>
              </DropdownMenu>
            </Dropdown>
          ) : (
            <Dropdown placement="bottom-end">
              <DropdownTrigger>
                <button
                  className="p-1.5 rounded-lg text-(--accent) hover:bg-(--accent)/10 transition-colors"
                  aria-label={t.common.login}
                  title={t.common.login}
                >
                  <User className="w-4 h-4" />
                </button>
              </DropdownTrigger>
              <DropdownMenu
                aria-label="账户菜单"
                classNames={{
                  base: "bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 shadow-lg rounded-xl min-w-[160px] p-1",
                  list: "bg-transparent gap-0.5"
                }}
              >
                <DropdownItem
                  key="login"
                  className="text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg py-2.5"
                  startContent={<User className="w-4 h-4 text-slate-500" />}
                  onPress={() => setIsAuthModalOpen(true)}
                >
                  {t.common.login}
                </DropdownItem>
                <DropdownItem
                  key="settings"
                  className="text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg py-2.5"
                  startContent={<Settings className="w-4 h-4 text-slate-500" />}
                  onPress={() => {
                    navigate('/');
                    setTimeout(() => {
                      window.dispatchEvent(new CustomEvent('openSettingsTab'));
                    }, 100);
                  }}
                >
                  {t.nav.settings}
                </DropdownItem>
              </DropdownMenu>
            </Dropdown>
          )}

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
            const panelTabId = item.path === '/' ? 'workspace' : item.path === '/projects' ? 'projects' : item.path === '/teams' ? 'teams' : null;
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
          {/* 扩展按钮 - 在工作台打开标签页（可被右键菜单隐藏） */}
          {isExtensionsVisible && (
          <button
            onPointerDown={handleExtPointerDown}
            onPointerMove={handleExtPointerMove}
            onPointerUp={handleExtPointerUp}
            onPointerCancel={handleExtPointerUp}
            tabIndex={0}
            aria-label="扩展"
            data-nav-path="extensions"
            draggable={false}
            className={`pro-nav-item group relative mx-auto ${isTablet ? 'p-2.5' : 'p-3'} flex items-center justify-center transition-all duration-200 select-none touch-none
              ${isExtensionsActive
                ? 'bg-(--accent)/15 text-(--accent)'
                : 'text-(--text-muted) hover:text-(--text-primary) hover:bg-white/5'
              }
              ${draggingNav === 'extensions' ? 'opacity-50 scale-95 cursor-grabbing z-50' : ''}
              ${dragOverNav === 'extensions' ? 'bg-(--accent)/10 scale-105' : ''}
              ${draggingNav ? 'cursor-grab' : ''}
            `}
          >
            {/* 激活态左侧指示条 */}
            {isExtensionsActive && (
              <div className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-6 bg-(--accent) rounded-r" />
            )}
            {/* 拖拽指示器 */}
            {draggingNav === 'extensions' && (
              <div className="absolute inset-0 border-2 border-dashed border-(--accent) rounded-lg opacity-50" />
            )}
            <div className={`transition-transform duration-150 ${isExtensionsActive ? 'scale-110' : 'hover:scale-110 active:scale-95'}`}>
              <Puzzle className={`${isTablet ? 'w-4 h-4' : 'w-5 h-5'}`} />
            </div>
            {/* Tooltip */}
            <div className="absolute left-full ml-2 px-2.5 py-1.5 bg-(--bg-card) border border-(--border-color) rounded-md text-xs font-medium text-(--text-primary) whitespace-nowrap opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 z-50 shadow-lg">
              扩展
              <div className="absolute left-0 top-1/2 -translate-y-1/2 -translate-x-1 w-2 h-2 bg-(--bg-card) border-l border-b border-(--border-color) rotate-45" />
            </div>
          </button>
          )}
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
            {/* 用户按钮 */}
            {isLoggedIn ? (
              <button
                onClick={() => navigate('/user-center')}
                className="mobile-nav-item"
                aria-label={t.nav.userCenter}
              >
                <User className="w-5 h-5" />
                <span className="mobile-nav-label">{t.nav.my}</span>
              </button>
            ) : (
              <button
                onClick={() => setIsAuthModalOpen(true)}
                className="mobile-nav-item"
                aria-label={t.common.login}
              >
                <User className="w-5 h-5" />
                <span className="mobile-nav-label">{t.common.login}</span>
              </button>
            )}
          </div>
        </nav>
      )}

      {/* 活动栏右键上下文菜单：勾选显示/隐藏按钮 */}
      {activityMenu && (
        <div
          className="fixed z-[9999] min-w-[180px] py-1 rounded-md border border-(--border-color) shadow-2xl"
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
          {offlineMode ? (
            <>
              <span className="w-2 h-2 rounded-full bg-sky-500" />
              <span className="text-xs text-(--text-muted)">本地模式</span>
            </>
          ) : isConnected ? (
            <>
              <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
              <span className="text-xs text-(--text-muted)">{t.nav.connected}</span>
            </>
          ) : (
            <>
              <span className="w-2 h-2 rounded-full bg-red-500" />
              <span className="text-xs text-red-400">{t.nav.disconnected}</span>
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
            aria-label="任务面板"
            title="任务面板"
          >
            <PanelBottom className="w-3.5 h-3.5" />
            <span>任务</span>
          </button>
          <span className="text-xs text-(--text-muted)">v1.0.0</span>
        </div>
      </footer>

      {/* 登录弹窗 */}
      <AuthModal isOpen={isAuthModalOpen} onClose={() => setIsAuthModalOpen(false)} />
    </div>
  );
};

export default Layout;
