import React, { useState } from 'react';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import { ChevronDown, ChevronRight, LogOut, Settings, Users, Cpu, LayoutDashboard, Server, BarChart3, Gauge, CreditCard, Globe } from 'lucide-react';
import { getAuthUser, logout } from '../../services/auth';

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
          id: 'site-settings',
          label: '站点设置',
          icon: <Globe className="w-4 h-4" />,
          path: '/admin/site-settings'
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
              ? 'bg-white/10 text-white backdrop-blur-sm' 
              : 'text-white/90 hover:bg-white/5 hover:text-white'
            }
            ${level > 0 ? 'ml-6' : ''}
          `}
        >
          <div className="flex items-center gap-3">
            <span className={active ? 'text-white' : 'text-white/60'}>
              {item.icon}
            </span>
            <span className="font-medium">{item.label}</span>
          </div>
          {hasChildren && (
            isExpanded 
              ? <ChevronDown className="w-4 h-4 text-white/60" />
              : <ChevronRight className="w-4 h-4 text-white/60" />
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

  return (
    <div className="flex h-screen bg-[#0a0a0f]">
      <aside className="w-64 bg-gradient-to-b from-[#1a1035] via-[#2d1f4e] to-[#4a3070] shadow-xl flex flex-col">
        <div className="p-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-white/10 backdrop-blur rounded-xl flex items-center justify-center">
              <Settings className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-white font-bold text-lg">管理后台</h1>
              <p className="text-white/50 text-xs">饺子动漫 Admin</p>
            </div>
          </div>
        </div>

        <nav className="flex-1 px-4 overflow-y-auto">
          {menuItems.map(item => renderMenuItem(item))}
        </nav>

        <div className="p-4">
          <div className="flex items-center gap-3 px-3 py-3 bg-white/10 backdrop-blur rounded-xl mb-3">
            <div className="w-9 h-9 bg-gradient-to-r from-blue-400 to-violet-500 rounded-full flex items-center justify-center">
              <span className="text-white text-sm font-semibold">
                {userEmail.charAt(0).toUpperCase()}
              </span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-white text-sm font-medium truncate">{userEmail}</p>
              <p className="text-white/50 text-xs">管理员</p>
            </div>
          </div>
          
          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-2 px-4 py-2.5 text-white/70 hover:bg-white/10 hover:text-white rounded-xl transition-all"
          >
            <LogOut className="w-4 h-4" />
            <span className="text-sm font-medium">退出登录</span>
          </button>
        </div>
      </aside>

      <main className="flex-1 overflow-auto bg-[#0a0a0f]">
        <Outlet />
      </main>
    </div>
  );
};

export default AdminLayout;
