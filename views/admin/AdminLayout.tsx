import React, { useState } from 'react';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import { ChevronDown, ChevronRight, LogOut, Settings, Users, Cpu, LayoutDashboard, Server, BarChart3, Gauge, CreditCard } from 'lucide-react';
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
            w-full flex items-center justify-between px-4 py-3 rounded-lg transition-all
            ${level === 0 ? 'mb-1' : 'mb-0.5'}
            ${active 
              ? 'bg-gradient-to-r from-blue-500 to-violet-600 text-white shadow-md' 
              : 'text-slate-300 hover:bg-slate-700/50 hover:text-white'
            }
            ${level > 0 ? 'ml-4 text-sm' : ''}
          `}
        >
          <div className="flex items-center gap-3">
            {item.icon}
            <span className="font-medium">{item.label}</span>
          </div>
          {hasChildren && (
            isExpanded 
              ? <ChevronDown className="w-4 h-4" />
              : <ChevronRight className="w-4 h-4" />
          )}
        </button>

        {hasChildren && isExpanded && (
          <div className="mt-1 space-y-0.5">
            {item.children!.map(child => renderMenuItem(child, level + 1))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="flex h-screen bg-[#0a0a0f]">
      <aside className="w-64 bg-slate-950 shadow-xl flex flex-col border-r border-slate-800">
        <div className="p-6 border-b border-slate-800">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-violet-600 rounded-lg flex items-center justify-center">
              <Settings className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-white font-bold text-lg">管理后台</h1>
              <p className="text-slate-400 text-xs">NanoStory Admin</p>
            </div>
          </div>
        </div>

        <nav className="flex-1 p-4 overflow-y-auto">
          {menuItems.map(item => renderMenuItem(item))}
        </nav>

        <div className="p-4 border-t border-slate-800">
          <div className="flex items-center gap-3 px-3 py-2 bg-slate-700/50 rounded-lg mb-3">
            <div className="w-8 h-8 bg-gradient-to-r from-blue-500 to-violet-600 rounded-full flex items-center justify-center">
              <span className="text-white text-sm font-semibold">
                {userEmail.charAt(0).toUpperCase()}
              </span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-white text-sm font-medium truncate">{userEmail}</p>
              <p className="text-slate-400 text-xs">管理员</p>
            </div>
          </div>
          
          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-2 px-4 py-2.5 text-slate-300 hover:bg-red-600 hover:text-white rounded-lg transition-all"
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
