import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { Film, User, Package, LogOut, FolderOpen, Settings, Sparkles, Wifi, WifiOff, Pencil, Moon, Sun, Monitor, Contrast, BarChart3, LayoutTemplate, Users, Maximize, Minimize, BookOpen, Video, Image, UsersRound, Puzzle, Coins, ChevronDown, Check } from 'lucide-react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Dropdown, DropdownTrigger, DropdownMenu, DropdownItem } from "@heroui/react";
import { motion } from 'framer-motion';
import { getAuthToken, logout } from '../services/auth';
import { useKeyboardShortcuts, ShortcutConfig, GLOBAL_SHORTCUTS_CONFIG } from '../hooks/useKeyboardShortcuts';
import KeyboardShortcutsHelp from './KeyboardShortcutsHelp';
import CommandPalette from './CommandPalette';
import { Command } from '../hooks/useCommandPalette';
import { useLanguage } from '../contexts/LanguageContext';
import { useTheme } from '../contexts/ThemeContext';
import { useWorkbench } from '../contexts/WorkbenchContext';
import OnboardingOverlay from './Onboarding/OnboardingOverlay';
import DashboardPanel from './WorkflowDashboard/DashboardPanel';
import { useOnboarding, OnboardingStep } from '../hooks/useOnboarding';
import NetworkStatusBar from './NetworkStatusBar';
import InternalMailbox from './InternalMailbox';
import LowBalanceBanner from './LowBalanceBanner';
import PointsRechargeModal from './PointsRechargeModal';
import InsufficientPointsModal from './InsufficientPointsModal';
import { usePoints } from '../contexts/PointsContext';
import { useRoutePreload } from '../hooks/useRoutePreload';
import { fetchProjects, Project } from '../services/projects';

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
  const { projectType, currentProject, switchProject } = useWorkbench();
  const { balance, isLowBalance, loading: pointsLoading, balanceAsCNY, openRechargeModal, isRechargeModalOpen, closeRechargeModal } = usePoints();
  const isAuth = location.pathname === '/auth';
  const isLoggedIn = !!getAuthToken();
  const [isConnected, setIsConnected] = useState(true);
  const [showShortcutsHelp, setShowShortcutsHelp] = useState(false);
  const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState(false);
  const [isDashboardOpen, setIsDashboardOpen] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [userAvatar, setUserAvatar] = useState<string | null>(null);
  const [userNickname, setUserNickname] = useState<string | null>(null);
  
  // 响应式断点
  const isMobile = useMediaQuery('(max-width: 767px)');
  const isTablet = useMediaQuery('(min-width: 768px) and (max-width: 1280px)');

  // 路由预加载
  const { preload } = useRoutePreload();

  // 获取用户头像和昵称（从localStorage或API）
  useEffect(() => {
    if (!isLoggedIn) {
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
  }, [isLoggedIn]);

  // 导航项配置（使用 useMemo 优化，依赖 t 对象）
  const navItems = useMemo(() => [
    { path: '/', icon: Film, label: t.nav.workspace },
    { path: '/assets', icon: Package, label: t.nav.assets },
    { path: '/projects', icon: FolderOpen, label: t.nav.projects },
    { path: '/teams', icon: UsersRound, label: '团队' },
    { path: '/sketch', icon: Pencil, label: t.nav.sketch },
    { path: '/templates', icon: LayoutTemplate, label: (t as Record<string, unknown>).templates ? ((t as Record<string, unknown>).templates as Record<string, string>).title : '模板库' },
    { path: '/community', icon: Users, label: (t as Record<string, unknown>).community ? ((t as Record<string, unknown>).community as Record<string, string>).title : '社区' },
    { path: '/extensions', icon: Puzzle, label: '扩展' },
    { path: '/settings', icon: Settings, label: t.nav.settings },
  ], [t]);

  // 页面标题映射（使用 useMemo 优化，依赖 t 对象）
  const pageTitles = useMemo<Record<string, string>>(() => ({
    '/': t.nav.workspace,
    '/studio': t.nav.workspace,
    '/assets': t.nav.assets,
    '/projects': t.nav.projects,
    '/teams': '我的团队',
    '/sketch': t.nav.sketch,
    '/templates': (t as Record<string, unknown>).templates ? ((t as Record<string, unknown>).templates as Record<string, string>).title : '模板库',
    '/community': (t as Record<string, unknown>).community ? ((t as Record<string, unknown>).community as Record<string, string>).title : '社区',
    '/settings': t.nav.settings,
    '/user-center': t.nav.userCenter,
  }), [t]);

  // 获取工作台标题（根据项目类型）
  const getWorkbenchTitle = useCallback(() => {
    if (location.pathname !== '/' || !projectType) {
      return pageTitles[location.pathname] || t.nav.studioName;
    }
    
    const workbenchTitles: Record<string, string> = {
      'comic_drama': '漫剧工作台',
      'manga': '漫画工作台',
      'short_video': '短视频工作台',
      'novel': '小说工作台',
    };
    
    return workbenchTitles[projectType] || t.nav.workspace;
  }, [location.pathname, projectType, pageTitles, t]);

  // 获取工作台图标
  const getWorkbenchIcon = useCallback(() => {
    if (location.pathname !== '/' || !projectType) {
      return null;
    }
    
    const icons: Record<string, React.ReactNode> = {
      'comic_drama': <Film className="w-4 h-4 text-(--accent)" />,
      'manga': <Image className="w-4 h-4 text-purple-400" />,
      'short_video': <Video className="w-4 h-4 text-pink-400" />,
      'novel': <BookOpen className="w-4 h-4 text-emerald-400" />,
    };
    
    return icons[projectType] || null;
  }, [location.pathname, projectType]);

  // 真实后端连接状态检测（每30秒 ping 一次 /api/health）
  useEffect(() => {
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

  // ==================== 项目快速切换 ====================
  const [projectSwitcherOpen, setProjectSwitcherOpen] = useState(false);
  const [projectList, setProjectList] = useState<Project[]>([]);
  const [projectListLoading, setProjectListLoading] = useState(false);
  const projectSwitcherRef = useRef<HTMLDivElement>(null);

  // 点击外部关闭下拉面板
  useEffect(() => {
    if (!projectSwitcherOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (projectSwitcherRef.current && !projectSwitcherRef.current.contains(e.target as Node)) {
        setProjectSwitcherOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [projectSwitcherOpen]);

  // 打开面板时加载项目列表
  const handleOpenProjectSwitcher = useCallback(async () => {
    const willOpen = !projectSwitcherOpen;
    setProjectSwitcherOpen(willOpen);
    if (willOpen) {
      setProjectListLoading(true);
      try {
        const projects = await fetchProjects();
        setProjectList(projects);
      } catch (err) {
        console.error('Failed to fetch projects:', err);
      } finally {
        setProjectListLoading(false);
      }
    }
  }, [projectSwitcherOpen]);

  // 快速切换项目
  const handleQuickSwitchProject = useCallback((project: Project) => {
    switchProject(project);
    localStorage.setItem('nanostory_last_project_id', String(project.id));
    setProjectSwitcherOpen(false);
  }, [switchProject]);

  // 命令面板命令列表
  const commands: Command[] = useMemo(() => [
    // 导航类
    { id: 'nav-workspace', title: t.nav.workspace, category: 'navigation', icon: <Film className="w-4 h-4" />, shortcut: 'Ctrl+1', action: () => navigate('/'), keywords: ['studio', '工作台', '创作'] },
    { id: 'nav-assets', title: t.nav.assets, category: 'navigation', icon: <Package className="w-4 h-4" />, shortcut: 'Ctrl+2', action: () => navigate('/assets'), keywords: ['asset', '素材', '角色'] },
    { id: 'nav-projects', title: t.nav.projects, category: 'navigation', icon: <FolderOpen className="w-4 h-4" />, shortcut: 'Ctrl+3', action: () => navigate('/projects'), keywords: ['project', '工程'] },
    { id: 'nav-sketch', title: t.nav.sketch, category: 'navigation', icon: <Pencil className="w-4 h-4" />, shortcut: 'Ctrl+4', action: () => navigate('/sketch'), keywords: ['draw', '绘制', '草图'] },
    { id: 'nav-settings', title: t.nav.settings, category: 'navigation', icon: <Settings className="w-4 h-4" />, shortcut: 'Ctrl+5', action: () => navigate('/settings'), keywords: ['setting', '设置', '偏好'] },
    // 操作类
    { id: 'action-shortcuts', title: t.commandPalette.commands.showShortcuts, category: 'action', action: () => setShowShortcutsHelp(true), keywords: ['keyboard', '快捷键', 'shortcut'] },
    // 设置类
    { id: 'settings-dark', title: t.commandPalette.commands.themeDark, category: 'settings', icon: <Moon className="w-4 h-4" />, action: () => setTheme('dark'), keywords: ['theme', '主题', '深色', 'dark'] },
    { id: 'settings-light', title: t.commandPalette.commands.themeLight, category: 'settings', icon: <Sun className="w-4 h-4" />, action: () => setTheme('light'), keywords: ['theme', '主题', '浅色', 'light'] },
    { id: 'settings-high-contrast', title: t.commandPalette.commands.themeHighContrast, category: 'settings', icon: <Contrast className="w-4 h-4" />, action: () => setTheme('high-contrast'), keywords: ['theme', '主题', '高对比度', 'contrast'] },
    { id: 'settings-system', title: t.commandPalette.commands.themeSystem, category: 'settings', icon: <Monitor className="w-4 h-4" />, action: () => setTheme('system'), keywords: ['theme', '主题', '系统', 'system'] },
    { id: 'settings-lang-zh', title: t.commandPalette.commands.langZh, category: 'settings', action: () => setLanguage('zh-CN'), keywords: ['language', '语言', '中文'] },
    { id: 'settings-lang-en', title: t.commandPalette.commands.langEn, category: 'settings', action: () => setLanguage('en-US'), keywords: ['language', '语言', 'english'] },
  ], [t, navigate, setTheme, setLanguage]);

  // 全局快捷键
  const globalShortcuts = useMemo<ShortcutConfig[]>(() => [
    {
      ...GLOBAL_SHORTCUTS_CONFIG.NAVIGATE_WORKSPACE,
      action: () => navigate('/'),
    },
    {
      ...GLOBAL_SHORTCUTS_CONFIG.NAVIGATE_ASSETS,
      action: () => navigate('/assets'),
    },
    {
      ...GLOBAL_SHORTCUTS_CONFIG.NAVIGATE_PROJECTS,
      action: () => navigate('/projects'),
    },
    {
      ...GLOBAL_SHORTCUTS_CONFIG.NAVIGATE_SKETCH,
      action: () => navigate('/sketch'),
    },
    {
      ...GLOBAL_SHORTCUTS_CONFIG.NAVIGATE_SETTINGS,
      action: () => navigate('/settings'),
    },
    {
      ...GLOBAL_SHORTCUTS_CONFIG.SHOW_HELP,
      action: () => setShowShortcutsHelp(true),
    },
    {
      ...GLOBAL_SHORTCUTS_CONFIG.COMMAND_PALETTE,
      action: () => setIsCommandPaletteOpen(true),
    },
  ], [navigate]);

  // 注册全局快捷键（非登录页面生效）
  useKeyboardShortcuts(globalShortcuts, !isAuth);

  // 引导系统步骤配置
  const onboardingSteps: OnboardingStep[] = useMemo(() => [
    { target: '[data-onboarding="sidebar"]', title: t.onboarding?.steps?.sidebar?.title || '导航侧边栏', description: t.onboarding?.steps?.sidebar?.description || '这是您的主导航区域，可以快速切换不同的功能模块。', placement: 'right' },
    { target: '[data-onboarding="nav-workspace"]', title: t.onboarding?.steps?.workspace?.title || '创作工作台', description: t.onboarding?.steps?.workspace?.description || '在这里开始您的创作之旅，编写剧本、生成分镜。', placement: 'right' },
    { target: '[data-onboarding="nav-assets"]', title: t.onboarding?.steps?.assets?.title || '资产管理', description: t.onboarding?.steps?.assets?.description || '管理您的角色、场景、道具等创作素材。', placement: 'right' },
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
      navigate('/auth');
    }
  };

  const handleLogout = () => {
    logout();
    navigate('/auth');
    window.location.reload();
  };

  const currentPageTitle = getWorkbenchTitle();
  const workbenchIcon = getWorkbenchIcon();

  // Auth 页面不显示导航
  if (isAuth) {
    return (
      <div className="flex flex-col h-screen w-screen overflow-hidden bg-(--bg-app)">
        <main className="flex-1 overflow-hidden">
          {children}
        </main>
      </div>
    );
  }

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-(--bg-app)">
      {/* 左侧侧边栏 - 小屏隐藏 */}
      <aside data-onboarding="sidebar" className={`pro-sidebar flex flex-col bg-(--bg-nav) border-r border-(--border-color) hide-on-mobile ${isTablet ? 'w-12' : 'w-14'}`}>
        {/* Logo */}
        <div className={`${isTablet ? 'h-12' : 'h-14'} flex items-center justify-center border-b border-(--border-color)`}>
          <Link to="/" className="group relative" tabIndex={0}>
            <div className={`relative ${isTablet ? 'p-1.5' : 'p-2'} bg-linear-to-br from-blue-500 to-blue-600 rounded-lg shadow-lg transition-all duration-200 group-hover:shadow-blue-500/30 group-hover:scale-105`}>
              <Sparkles className={`${isTablet ? 'w-4 h-4' : 'w-5 h-5'} text-white`} />
            </div>
          </Link>
        </div>

        {/* 导航图标列表 */}
        <nav className="flex-1 py-2 flex flex-col gap-1" role="navigation" aria-label={t.nav.mainNav}>
          {navItems.map((item, index) => {
            const isActive = location.pathname === item.path;
            const Icon = item.icon;
            
            // 根据路径确定 data-onboarding 属性
            const getOnboardingAttr = () => {
              switch (item.path) {
                case '/': return 'nav-workspace';
                case '/assets': return 'nav-assets';
                case '/settings': return 'nav-settings';
                default: return undefined;
              }
            };
            const onboardingAttr = getOnboardingAttr();
            
            return (
              <Link
                key={item.path}
                to={item.path}
                tabIndex={0}
                aria-label={item.label}
                aria-current={isActive ? 'page' : undefined}
                data-onboarding={onboardingAttr}
                onMouseEnter={() => preload(item.path)}
                className={`pro-nav-item group relative mx-2 ${isTablet ? 'p-2.5' : 'p-3'} rounded-lg flex items-center justify-center transition-all duration-200
                  ${isActive 
                    ? 'bg-(--accent)/15 text-(--accent)' 
                    : 'text-(--text-muted) hover:text-(--text-primary) hover:bg-white/5'
                  }`}
              >
                {/* 激活态左侧指示条 */}
                {isActive && (
                  <div className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-6 bg-(--accent) rounded-r" />
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
              </Link>
            );
          })}
        </nav>

        {/* 底部用户菜单 */}
        <div className="py-2 border-t border-(--border-color)">
          {isLoggedIn ? (
            <Dropdown placement="right-end">
              <DropdownTrigger>
                <button 
                  className={`pro-nav-item group relative mx-2 ${isTablet ? 'p-2.5' : 'p-3'} rounded-lg flex items-center justify-center transition-all duration-200 text-(--text-muted) hover:text-(--text-primary) hover:bg-white/5 ${isTablet ? 'w-8' : 'w-10'}`}
                  aria-label={t.nav.myAccount}
                >
                  {userAvatar ? (
                    <img src={userAvatar} alt="" className={`${isTablet ? 'w-5 h-5' : 'w-6 h-6'} rounded-full object-cover`} />
                  ) : (
                    <User className={`${isTablet ? 'w-4 h-4' : 'w-5 h-5'}`} />
                  )}
                  
                  {/* Tooltip */}
                  <div className="absolute left-full ml-2 px-2.5 py-1.5 bg-(--bg-card) border border-(--border-color) rounded-md text-xs font-medium text-(--text-primary) whitespace-nowrap opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 z-50 shadow-lg pointer-events-none">
                    {t.nav.myAccount}
                    <div className="absolute left-0 top-1/2 -translate-y-1/2 -translate-x-1 w-2 h-2 bg-(--bg-card) border-l border-b border-(--border-color) rotate-45" />
                  </div>
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
            <button
              onClick={handleAccountClick}
              className={`pro-nav-item group relative mx-2 ${isTablet ? 'p-2.5' : 'p-3'} rounded-lg flex items-center justify-center transition-all duration-200 text-(--accent) hover:bg-(--accent)/10 ${isTablet ? 'w-8' : 'w-10'}`}
              aria-label={t.common.login}
            >
              <User className={`${isTablet ? 'w-4 h-4' : 'w-5 h-5'}`} />
              
              {/* Tooltip */}
              <div className="absolute left-full ml-2 px-2.5 py-1.5 bg-(--bg-card) border border-(--border-color) rounded-md text-xs font-medium text-(--text-primary) whitespace-nowrap opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 z-50 shadow-lg">
                {t.common.login}
                <div className="absolute left-0 top-1/2 -translate-y-1/2 -translate-x-1 w-2 h-2 bg-(--bg-card) border-l border-b border-(--border-color) rotate-45" />
              </div>
            </button>
          )}
        </div>
      </aside>

      {/* 右侧主区域 */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* 网络状态提示条 */}
        <NetworkStatusBar />
        
        {/* 顶部工具栏 - 小屏简化 */}
        <header className="pro-toolbar h-10 items-center justify-between px-4 bg-(--bg-nav)/50 border-b border-(--border-color) hide-on-mobile flex">
          {/* 左侧：当前页面标题 */}
          <div className="flex items-center gap-3">
            {workbenchIcon && (
              <div className="flex items-center gap-2">
                {workbenchIcon}
              </div>
            )}
            <h1 className="text-sm font-semibold text-(--text-primary)">
              {currentPageTitle}
            </h1>
            {currentProject && location.pathname === '/' && (
              <div className="relative" ref={projectSwitcherRef}>
                <button
                  onClick={handleOpenProjectSwitcher}
                  className="flex items-center gap-1 text-xs text-(--text-muted) px-2 py-0.5 bg-(--bg-card) hover:bg-(--bg-card-hover) rounded transition-colors cursor-pointer"
                  title="切换项目"
                >
                  <span className="max-w-[120px] truncate">{currentProject.name}</span>
                  <ChevronDown className={`w-3 h-3 transition-transform ${projectSwitcherOpen ? 'rotate-180' : ''}`} />
                </button>
                {/* 项目快速切换下拉面板 */}
                {projectSwitcherOpen && (
                  <div className="absolute top-full left-0 mt-1 w-64 max-h-80 overflow-y-auto rounded-lg border border-(--border-color) bg-(--bg-card) shadow-xl z-50">
                    <div className="px-3 py-2 border-b border-(--border-color)">
                      <span className="text-xs font-medium text-(--text-secondary)">切换项目</span>
                    </div>
                    {projectListLoading ? (
                      <div className="px-3 py-4 text-center text-xs text-(--text-muted)">加载中...</div>
                    ) : projectList.length === 0 ? (
                      <div className="px-3 py-4 text-center text-xs text-(--text-muted)">暂无项目</div>
                    ) : (
                      <div className="py-1">
                        {projectList.map((project) => (
                          <button
                            key={project.id}
                            onClick={() => handleQuickSwitchProject(project)}
                            className={`w-full flex items-center gap-2 px-3 py-2 text-left text-xs transition-colors hover:bg-(--bg-card-hover) ${
                              currentProject.id === project.id ? 'text-(--accent)' : 'text-(--text-primary)'
                            }`}
                          >
                            <FolderOpen className="w-3.5 h-3.5 shrink-0 opacity-60" />
                            <span className="truncate flex-1">{project.name}</span>
                            {currentProject.id === project.id && (
                              <Check className="w-3.5 h-3.5 shrink-0 text-(--accent)" />
                            )}
                          </button>
                        ))}
                      </div>
                    )}
                    <div className="border-t border-(--border-color) px-3 py-2">
                      <button
                        onClick={() => { setProjectSwitcherOpen(false); navigate('/projects'); }}
                        className="w-full text-xs text-(--text-muted) hover:text-(--accent) text-center transition-colors"
                      >
                        管理全部项目
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
          
          {/* 右侧：辅助信息 */}
          <div className="flex items-center gap-4">
            <button
              onClick={() => setIsDashboardOpen(true)}
              className="p-1.5 rounded-lg text-(--text-muted) hover:text-(--text-primary) hover:bg-white/5 transition-colors"
              aria-label={(t as Record<string, unknown>).dashboard ? ((t as Record<string, unknown>).dashboard as Record<string, string>).title : '工作流概览'}
              title={(t as Record<string, unknown>).dashboard ? ((t as Record<string, unknown>).dashboard as Record<string, string>).title : '工作流概览'}
            >
              <BarChart3 className="w-4 h-4" />
            </button>
            {/* 积分余额显示 */}
            {isLoggedIn && (
              <button
                onClick={openRechargeModal}
                className="group flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium transition-all duration-200 hover:bg-white/5"
                title={`积分余额: ${balance.toLocaleString()} (≈¥${balanceAsCNY.toFixed(2)})`}
              >
                <Coins className={`w-3.5 h-3.5 ${isLowBalance ? 'text-amber-400' : 'text-(--accent)'}`} />
                {pointsLoading ? (
                  <span className="text-(--text-muted)">--</span>
                ) : (
                  <span className={isLowBalance ? 'text-amber-400' : 'text-(--text-secondary)'}>
                    {balance.toLocaleString()}
                  </span>
                )}
              </button>
            )}
            <InternalMailbox />
            <span className="text-xs text-(--text-muted)">
              {t.nav.studioTitle}
            </span>
            {/* 全屏切换按钮 */}
            <button
              onClick={toggleFullscreen}
              className="p-1.5 rounded-lg text-(--text-muted) hover:text-(--text-primary) hover:bg-white/5 transition-colors"
              aria-label={isFullscreen ? t.settings?.appearance?.exitFullscreen || '退出全屏' : t.settings?.appearance?.enterFullscreen || '全屏'}
              title={isFullscreen ? t.settings?.appearance?.exitFullscreen || '退出全屏' : t.settings?.appearance?.enterFullscreen || '全屏'}
            >
              {isFullscreen ? <Minimize className="w-4 h-4" /> : <Maximize className="w-4 h-4" />}
            </button>
          </div>
        </header>

        {/* 小屏简化工具栏 */}
        {isMobile && (
          <header className="pro-toolbar h-12 flex items-center justify-center px-4 bg-(--bg-nav) border-b border-(--border-color)">
            <Link to="/" className="flex items-center gap-2">
              <div className="p-1.5 bg-linear-to-br from-blue-500 to-blue-600 rounded-lg">
                <Sparkles className="w-4 h-4 text-white" />
              </div>
              <span className="text-sm font-semibold text-(--text-primary)">
                {t.nav.studioName}
              </span>
            </Link>
          </header>
        )}

        {/* 主内容区 */}
        <main className={`flex-1 overflow-hidden bg-(--bg-app) ${isMobile ? 'main-content-mobile' : ''}`}>
          {children}
        </main>

        {/* 底部状态栏 - 小屏隐藏 */}
        <footer className="pro-statusbar h-7 items-center justify-between px-4 bg-(--bg-nav) border-t border-(--border-color) hide-on-mobile flex">
          {/* 左侧：连接状态 */}
          <div className="flex items-center gap-2">
            {isConnected ? (
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
          
          {/* 右侧：版本信息 */}
          <div className="flex items-center gap-4">
            <span className="text-xs text-(--text-muted)">v1.0.0</span>
          </div>
        </footer>
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
                onClick={handleAccountClick}
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

      {/* 工作流概览面板 */}
      <DashboardPanel
        isOpen={isDashboardOpen}
        onClose={() => setIsDashboardOpen(false)}
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

      {/* 低余额警告横幅 */}
      {isLoggedIn && <LowBalanceBanner />}

      {/* 积分充值弹窗 */}
      <PointsRechargeModal isOpen={isRechargeModalOpen} onClose={closeRechargeModal} />

      {/* 积分不足拦截弹窗 */}
      <InsufficientPointsModal />
    </div>
  );
};

export default Layout;
