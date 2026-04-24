import React, { useState, useEffect } from 'react';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import { ChevronDown, ChevronRight, LogOut, Settings, Users, Cpu, LayoutDashboard, Server, BarChart3, Gauge, CreditCard, Globe, MessageSquare, AlertTriangle, Megaphone, Calculator, Sun, Moon, Contrast, ClipboardList } from 'lucide-react';
import { getAuthUser, logout, getUserRole } from '../../services/auth';
import { getAdminEmployeeId } from '../../services/admin';

type AdminThemeType = 'dark' | 'light' | 'high-contrast';
const ADMIN_THEME_KEY = 'nanostory-admin-theme';

interface MenuItem {
  id: string;
  label: string;
  icon: React.ReactNode;
  path?: string;
  children?: MenuItem[];
}

const AdminLayout: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [expandedMenus, setExpandedMenus] = useState<Set<string>>(new Set(['system']));
  const authUser = getAuthUser();
  const userEmail = authUser?.email || 'Admin';
  const currentRole = getUserRole();
  const isOps = currentRole === 'ops';

  // 运维角色可访问的系统管理子菜单 ID
  const OPS_ALLOWED_SYSTEM_ITEMS = new Set([
    'model-stats', 'users', 'subscriptions', 'feedback',
    'error-monitor', 'announcements', 'admin-logs'
  ]);

  const [adminTheme, setAdminTheme] = useState<AdminThemeType>(() => {
    try {
      const saved = localStorage.getItem(ADMIN_THEME_KEY);
      if (saved === 'dark' || saved === 'light' || saved === 'high-contrast') return saved;
    } catch {}
    return 'dark';
  });
  const [employeeId, setEmployeeId] = useState<string>('');

  useEffect(() => {
    getAdminEmployeeId().then(data => {
      setEmployeeId(data.employeeId);
    }).catch(() => {});
  }, []);

  // 管理后台主题隔离：根据管理员选择的主题设置 <html>，退出时还原用户主题
  useEffect(() => {
    const root = document.documentElement;
    root.dataset.adminMode = 'true';

    // 应用管理员选择的主题
    root.classList.remove('theme-dark', 'theme-light', 'theme-high-contrast', 'dark', 'high-contrast');
    root.classList.add(`theme-${adminTheme}`);
    if (adminTheme === 'dark' || adminTheme === 'high-contrast') {
      root.classList.add('dark');
      if (adminTheme === 'high-contrast') root.classList.add('high-contrast');
    }

    return () => {
      delete root.dataset.adminMode;
      const saved = localStorage.getItem('nanostory-theme') || 'dark';
      root.classList.remove('theme-dark', 'theme-light', 'theme-high-contrast', 'dark', 'high-contrast');
      let actualTheme: string = saved;
      if (saved === 'system') {
        actualTheme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
      }
      root.classList.add(`theme-${actualTheme}`);
      if (actualTheme === 'dark' || actualTheme === 'high-contrast') {
        root.classList.add('dark');
        if (actualTheme === 'high-contrast') root.classList.add('high-contrast');
      }
    };
  }, [adminTheme]);

  const changeAdminTheme = (t: AdminThemeType) => {
    setAdminTheme(t);
    try { localStorage.setItem(ADMIN_THEME_KEY, t); } catch {}
  };

  const isLight = adminTheme === 'light';
  const isHC = adminTheme === 'high-contrast';

  const menuItems: MenuItem[] = [
    {
      id: 'dashboard',
      label: '仪表盘',
      icon: <LayoutDashboard className="w-5 h-5" />,
      path: '/admin/dashboard'
    },
    {
      id: 'services',
      label: '服务仪表盘',
      icon: <Server className="w-5 h-5" />,
      path: '/admin/services'
    },
    {
      id: 'system',
      label: '系统管理',
      icon: <Settings className="w-5 h-5" />,
      children: [
        {
          id: 'ai-models',
          label: 'AI 模型配置',
          icon: <Cpu className="w-4 h-4" />,
          path: '/admin/ai-models'
        },
        {
          id: 'model-stats',
          label: '模型性能统计',
          icon: <BarChart3 className="w-4 h-4" />,
          path: '/admin/model-stats'
        },
        {
          id: 'users',
          label: '用户管理',
          icon: <Users className="w-4 h-4" />,
          path: '/admin/users'
        },
        {
          id: 'rate-limits',
          label: 'AI 限流配置',
          icon: <Gauge className="w-4 h-4" />,
          path: '/admin/rate-limits'
        },
        {
          id: 'subscriptions',
          label: '订阅管理',
          icon: <CreditCard className="w-4 h-4" />,
          path: '/admin/subscriptions'
        },
        {
          id: 'billing-config',
          label: '计费配置',
          icon: <Calculator className="w-4 h-4" />,
          path: '/admin/billing-config'
        },
        {
          id: 'site-settings',
          label: '站点设置',
          icon: <Globe className="w-4 h-4" />,
          path: '/admin/site-settings'
        },
        {
          id: 'feedback',
          label: '反馈管理',
          icon: <MessageSquare className="w-4 h-4" />,
          path: '/admin/feedback'
        },
        {
          id: 'error-monitor',
          label: '错误监控',
          icon: <AlertTriangle className="w-4 h-4" />,
          path: '/admin/error-monitor'
        },
        {
          id: 'announcements',
          label: '公告管理',
          icon: <Megaphone className="w-4 h-4" />,
          path: '/admin/announcements'
        },
        {
          id: 'admin-logs',
          label: '操作日志',
          icon: <ClipboardList className="w-4 h-4" />,
          path: '/admin/logs'
        }
      ]
    }
  ];

  const toggleMenu = (menuId: string) => {
    setExpandedMenus(prev => {
      const newSet = new Set(prev);
      if (newSet.has(menuId)) {
        newSet.delete(menuId);
      } else {
        newSet.add(menuId);
      }
      return newSet;
    });
  };

  const handleLogout = () => {
    logout();
    navigate('/admin/login');
  };

  const isActive = (path?: string) => {
    if (!path) return false;
    return location.pathname === path;
  };

  const renderMenuItem = (item: MenuItem, level: number = 0) => {
    const hasChildren = item.children && item.children.length > 0;
    const isExpanded = expandedMenus.has(item.id);
    const active = isActive(item.path);

    return (
      <div key={item.id}>
        <button
          onClick={() => {
            if (hasChildren) {
              toggleMenu(item.id);
            } else if (item.path) {
              navigate(item.path);
            }
          }}
          className={`
            w-full flex items-center justify-between px-4 py-3 rounded-xl transition-all
            ${level === 0 ? 'mb-1' : 'mb-1'}
            ${active
              ? isLight
                ? 'bg-indigo-100/80 text-indigo-700'
                : 'bg-white/10 text-white backdrop-blur-sm'
              : isLight
                ? 'text-slate-600 hover:bg-indigo-50 hover:text-indigo-700'
                : 'text-white/90 hover:bg-white/10 hover:text-white'
            }
            ${level > 0 ? 'ml-6' : ''}
          `}
        >
          <div className="flex items-center gap-3">
            <span className={active
              ? isLight ? 'text-indigo-600' : 'text-white'
              : isLight ? 'text-slate-400' : 'text-white/60'
            }>
              {item.icon}
            </span>
            <span className="font-medium">{item.label}</span>
          </div>
          {hasChildren && (
            isExpanded
              ? <ChevronDown className={`w-4 h-4 ${isLight ? 'text-slate-400' : 'text-white/60'}`} />
              : <ChevronRight className={`w-4 h-4 ${isLight ? 'text-slate-400' : 'text-white/60'}`} />
          )}
        </button>

        {hasChildren && isExpanded && (
          <div className="mt-1 space-y-1">
            {item.children!.map(child => renderMenuItem(child, level + 1))}
          </div>
        )}
      </div>
    );
  };

  const themeOptions: { key: AdminThemeType; icon: typeof Moon; label: string }[] = [
    { key: 'dark', icon: Moon, label: '深色' },
    { key: 'light', icon: Sun, label: '浅色' },
    { key: 'high-contrast', icon: Contrast, label: '高对比度' },
  ];

  return (
    <div
      className={`flex h-screen ${!isLight ? 'admin-forced-dark dark' : ''}`}
      data-theme={isLight ? 'light' : 'dark'}
      style={{ backgroundColor: isLight ? undefined : isHC ? '#000000' : '#0a0a0f' }}
    >
      <aside className={`w-64 flex flex-col shadow-xl ${
        isLight
          ? 'bg-gradient-to-b from-slate-50 via-indigo-50/80 to-purple-50/60 border-r border-indigo-100/50'
          : isHC
            ? 'bg-gradient-to-b from-[#0a0018] via-[#120028] to-[#1a0038] border-r-2 border-white/25'
            : 'bg-gradient-to-b from-[#1a1035] via-[#2d1f4e] to-[#4a3070]'
      }`}>
        <div className="p-6">
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
              isLight ? 'bg-indigo-100' : 'bg-white/10 backdrop-blur'
            }`}>
              <Settings className={`w-6 h-6 ${isLight ? 'text-indigo-600' : 'text-white'}`} />
            </div>
            <div>
              <h1 className={`font-bold text-lg ${isLight ? 'text-slate-800' : 'text-white'}`}>管理后台</h1>
              <p className={`text-xs ${isLight ? 'text-slate-400' : 'text-white/70'}`}>饺子动漫 Admin</p>
            </div>
          </div>
        </div>

        <nav className="flex-1 px-4 overflow-y-auto">
          {menuItems.map(item => {
            // 运维角色：过滤系统管理子菜单中不可见的项
            if (isOps && item.children) {
              const filteredItem = {
                ...item,
                children: item.children.filter(child => OPS_ALLOWED_SYSTEM_ITEMS.has(child.id))
              };
              return renderMenuItem(filteredItem);
            }
            return renderMenuItem(item);
          })}
        </nav>

        <div className="p-4">
          {/* 主题切换 */}
          <div className={`flex items-center gap-1 mb-3 p-1 rounded-lg ${
            isLight ? 'bg-slate-200/50' : 'bg-white/5'
          }`}>
            {themeOptions.map(({ key, icon: Icon, label }) => (
              <button
                key={key}
                onClick={() => changeAdminTheme(key)}
                title={label}
                className={`flex-1 flex items-center justify-center py-1.5 rounded-md transition-all ${
                  adminTheme === key
                    ? isLight
                      ? 'bg-white shadow-sm text-indigo-600'
                      : 'bg-white/15 text-white'
                    : isLight
                      ? 'text-slate-400 hover:text-slate-600'
                      : 'text-white/40 hover:text-white/70'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
              </button>
            ))}
          </div>

          <div className={`flex items-center gap-3 px-3 py-3 rounded-xl mb-3 ${
            isLight ? 'bg-white/80 shadow-sm border border-indigo-100/50' : 'bg-white/10 backdrop-blur'
          }`}>
            <div className="w-9 h-9 bg-gradient-to-r from-blue-400 to-violet-500 rounded-full flex items-center justify-center">
              <span className="text-white text-sm font-semibold">
                {userEmail.charAt(0).toUpperCase()}
              </span>
            </div>
            <div className="flex-1 min-w-0">
              <p className={`text-sm font-medium truncate ${isLight ? 'text-slate-800' : 'text-white'}`}>{userEmail}</p>
              <div className={`text-xs flex items-center gap-1 ${isLight ? 'text-slate-400' : 'text-white/70'}`}>
                <span>{isOps ? '运维' : '管理员'}</span>
                {employeeId && (
                  <span className={`px-1.5 py-0.5 rounded text-[10px] font-mono ${isLight ? 'bg-indigo-100 text-indigo-600' : 'bg-white/20 text-white/90'}`}>
                    {employeeId}
                  </span>
                )}
              </div>
            </div>
          </div>

          <button
            onClick={handleLogout}
            className={`w-full flex items-center gap-2 px-4 py-2.5 rounded-xl transition-all ${
              isLight
                ? 'text-slate-500 hover:bg-indigo-50 hover:text-indigo-700'
                : 'text-white/70 hover:bg-white/10 hover:text-white'
            }`}
          >
            <LogOut className="w-4 h-4" />
            <span className="text-sm font-medium">退出登录</span>
          </button>
        </div>
      </aside>

      <main
        className="admin-content flex-1 overflow-auto"
        style={{ backgroundColor: isLight ? undefined : isHC ? '#000000' : '#0a0a0f' }}
      >
        <Outlet />
      </main>
    </div>
  );
};

export default AdminLayout;
