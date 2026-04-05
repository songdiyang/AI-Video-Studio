import React, { useEffect, useState } from 'react';
import { Modal, ModalContent, ModalHeader, ModalBody, ModalFooter, useDisclosure } from '@heroui/react';
import { Plus, Search, Edit, Trash2, User, Shield, ShieldOff, Globe } from 'lucide-react';
import { getAdminAuthHeaders } from '../../services/auth';
import { useConfirm } from '../../contexts/ConfirmContext';

interface UserData {
  id: number;
  email: string;
  role: 'user' | 'admin';
  balance: number;
  is_active: number;
  last_login_ip: string | null;
  last_active_at: string | null;
  created_at: string;
  updated_at: string;
}

const UserManagement: React.FC = () => {
  const [users, setUsers] = useState<UserData[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [editingUser, setEditingUser] = useState<UserData | null>(null);
  const [togglingId, setTogglingId] = useState<number | null>(null);
  const { isOpen, onOpen, onClose } = useDisclosure();
  const { confirm } = useConfirm();

  const [formData, setFormData] = useState({
    email: '',
    password: '',
    role: 'user' as 'user' | 'admin',
    balance: 100
  });

  useEffect(() => {
    fetchUsers();
  }, []);

  const fetchUsers = async () => {
    try {
      const response = await fetch('/api/admin/users', {
        headers: getAdminAuthHeaders()
      });
      if (response.ok) {
        const data = await response.json();
        setUsers(data.users || []);
      }
    } catch (error) {
      console.error('获取用户列表失败:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleEdit = (user: UserData) => {
    setEditingUser(user);
    setFormData({
      email: user.email,
      password: '',
      role: user.role,
      balance: user.balance
    });
    onOpen();
  };

  const handleSave = async () => {
    try {
      const url = editingUser
        ? `/api/admin/users/${editingUser.id}`
        : '/api/admin/users';
      const response = await fetch(url, {
        method: editingUser ? 'PUT' : 'POST',
        headers: getAdminAuthHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify(formData)
      });
      if (response.ok) {
        fetchUsers();
        onClose();
        setEditingUser(null);
        setFormData({ email: '', password: '', role: 'user', balance: 100 });
      } else {
        const data = await response.json().catch(() => null);
        alert(data?.message || '保存失败');
      }
    } catch (error) {
      console.error('保存用户失败:', error);
    }
  };

  const handleDelete = async (userId: number) => {
    const confirmed = await confirm({
      title: '删除用户',
      message: '确定要删除此用户吗？此操作不可撤销。',
      type: 'danger',
      confirmText: '删除'
    });
    if (!confirmed) return;
    try {
      const response = await fetch(`/api/admin/users/${userId}`, {
        method: 'DELETE',
        headers: getAdminAuthHeaders()
      });
      if (response.ok) fetchUsers();
    } catch (error) {
      console.error('删除用户失败:', error);
    }
  };

  const handleToggleActive = async (user: UserData) => {
    const newActive = !user.is_active;
    const confirmed = await confirm({
      title: newActive ? '启用账号' : '禁用账号',
      message: newActive
        ? `确定要启用 ${user.email} 的账号吗？`
        : `确定要禁用 ${user.email} 的账号吗？禁用后该用户将无法登录。`,
      type: newActive ? 'info' : 'danger',
      confirmText: newActive ? '启用' : '禁用'
    });
    if (!confirmed) return;

    setTogglingId(user.id);
    try {
      const response = await fetch(`/api/admin/users/${user.id}/toggle-active`, {
        method: 'PATCH',
        headers: getAdminAuthHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ is_active: newActive })
      });
      if (response.ok) fetchUsers();
    } catch (error) {
      console.error('切换账号状态失败:', error);
    } finally {
      setTogglingId(null);
    }
  };

  const filteredUsers = users.filter(user =>
    user.email.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString('zh-CN');
  };

  const getOnlineStatus = (lastActive: string | null): { online: boolean; label: string } => {
    if (!lastActive) return { online: false, label: '从未活跃' };
    const diff = Date.now() - new Date(lastActive).getTime();
    if (diff < 5 * 60 * 1000) return { online: true, label: '在线' };
    if (diff < 30 * 60 * 1000) return { online: false, label: `${Math.floor(diff / 60000)}分钟前` };
    if (diff < 24 * 60 * 60 * 1000) return { online: false, label: `${Math.floor(diff / 3600000)}小时前` };
    return { online: false, label: `${Math.floor(diff / 86400000)}天前` };
  };

  return (
    <div className="p-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">用户管理</h1>
          <p className="text-gray-500 text-sm mt-1">管理系统所有用户账户</p>
        </div>
        <button
          onClick={() => {
            setEditingUser(null);
            setFormData({ email: '', password: '', role: 'user', balance: 100 });
            onOpen();
          }}
          className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors shadow-sm"
        >
          <Plus className="w-4 h-4" />
          添加用户
        </button>
      </div>

      {/* Main Card */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200">
        {/* Search */}
        <div className="p-4 border-b border-gray-100">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="搜索用户邮箱..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-colors"
            />
          </div>
        </div>

        {/* Table */}
        {/* 
          [虚拟列表评估] 不适用 useVirtualList，原因：
          1. 使用 <table> 布局，虚拟列表需要绝对定位（position: absolute）与 table 行布局不兼容
          2. 如需虚拟化需将整个表格重构为 div 布局，改动过大且影响表格对齐和语义化
          3. 建议后续用户量增长后添加服务端分页替代虚拟化
        */}
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-100">
                <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wider px-4 py-3">ID</th>
                <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wider px-4 py-3">用户</th>
                <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wider px-4 py-3">状态</th>
                <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wider px-4 py-3">角色</th>
                <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wider px-4 py-3">积分</th>
                <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wider px-4 py-3">登录IP</th>
                <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wider px-4 py-3">创建时间</th>
                <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wider px-4 py-3">操作</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={8} className="text-center py-12 text-gray-400 text-sm">加载中...</td></tr>
              ) : filteredUsers.length === 0 ? (
                <tr><td colSpan={8} className="text-center py-12 text-gray-400 text-sm">暂无用户</td></tr>
              ) : filteredUsers.map((user) => {
                const status = getOnlineStatus(user.last_active_at);
                const isDisabled = !user.is_active;
                return (
                  <tr key={user.id} className={`border-b border-gray-50 hover:bg-gray-50/80 transition-colors ${isDisabled ? 'opacity-60' : ''}`}>
                    <td className="px-4 py-3.5 text-sm text-gray-500 font-mono">{user.id}</td>
                    <td className="px-4 py-3.5">
                      <div className="flex items-center gap-3">
                        <div className="relative flex-shrink-0">
                          <div className="w-9 h-9 bg-blue-50 rounded-full flex items-center justify-center">
                            <User className="w-4 h-4 text-blue-500" />
                          </div>
                          <span className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-white ${
                            status.online ? 'bg-emerald-400' : 'bg-gray-300'
                          }`} />
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-gray-900 truncate">{user.email}</p>
                          {isDisabled && <p className="text-xs text-red-500 font-medium">已禁用</p>}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3.5">
                      <div className="flex items-center gap-1.5">
                        <span className={`w-2 h-2 rounded-full flex-shrink-0 ${status.online ? 'bg-emerald-400' : 'bg-gray-300'}`} />
                        <span className={`text-xs whitespace-nowrap ${status.online ? 'text-emerald-600 font-medium' : 'text-gray-400'}`}>
                          {status.label}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-3.5">
                      <span className={`inline-flex items-center px-2 py-1 text-xs font-medium rounded-md ${
                        user.role === 'admin'
                          ? 'bg-purple-50 text-purple-700'
                          : 'bg-gray-100 text-gray-600'
                      }`}>
                        {user.role === 'admin' ? '管理员' : '普通用户'}
                      </span>
                    </td>
                    <td className="px-4 py-3.5">
                      <div className="flex flex-col">
                        <span className="text-sm font-mono font-semibold text-emerald-600">
                          {Math.floor(typeof user.balance === 'number' ? user.balance : Number(user.balance || 0))} 积分
                        </span>
                        <span className="text-xs text-gray-400">
                          ≈ ¥{((typeof user.balance === 'number' ? user.balance : Number(user.balance || 0)) * 0.02).toFixed(2)}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-3.5">
                      {user.last_login_ip ? (
                        <div className="flex items-center gap-1.5">
                          <Globe className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
                          <span className="text-xs font-mono text-gray-500">{user.last_login_ip}</span>
                        </div>
                      ) : (
                        <span className="text-xs text-gray-300">-</span>
                      )}
                    </td>
                    <td className="px-4 py-3.5 text-xs text-gray-400 whitespace-nowrap">
                      {formatDate(user.created_at)}
                    </td>
                    <td className="px-4 py-3.5">
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => handleToggleActive(user)}
                          disabled={togglingId === user.id}
                          className={`p-1.5 rounded-md transition-colors ${
                            user.is_active
                              ? 'text-amber-500 hover:bg-amber-50 hover:text-amber-600'
                              : 'text-emerald-500 hover:bg-emerald-50 hover:text-emerald-600'
                          }`}
                          title={user.is_active ? '禁用账号' : '启用账号'}
                        >
                          {user.is_active ? <ShieldOff className="w-4 h-4" /> : <Shield className="w-4 h-4" />}
                        </button>
                        <button
                          onClick={() => handleEdit(user)}
                          className="p-1.5 rounded-md text-blue-500 hover:bg-blue-50 hover:text-blue-600 transition-colors"
                          title="编辑"
                        >
                          <Edit className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleDelete(user.id)}
                          className="p-1.5 rounded-md text-red-400 hover:bg-red-50 hover:text-red-500 transition-colors"
                          title="删除"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Footer Stats */}
        <div className="px-4 py-3 border-t border-gray-100 flex items-center justify-between text-xs text-gray-400">
          <span>共 {filteredUsers.length} 位用户</span>
          <span>
            {filteredUsers.filter(u => {
              const s = getOnlineStatus(u.last_active_at);
              return s.online;
            }).length} 人在线
          </span>
        </div>
      </div>

      {/* Modal */}
      <Modal isOpen={isOpen} onClose={onClose} size="lg" classNames={{ base: "bg-white border border-gray-200 shadow-xl" }}>
        <ModalContent>
          <ModalHeader className="text-lg font-bold text-gray-900">
            {editingUser ? '编辑用户' : '添加用户'}
          </ModalHeader>
          <ModalBody className="space-y-4">
            <div>
              <label className="text-sm font-medium text-gray-700 mb-1.5 block">邮箱/用户名</label>
              <input
                type="text"
                placeholder="请输入邮箱或用户名"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                className="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400"
              />
            </div>

            {!editingUser && (
              <div>
                <label className="text-sm font-medium text-gray-700 mb-1.5 block">密码</label>
                <input
                  type="password"
                  placeholder="请输入密码"
                  value={formData.password}
                  onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                  className="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400"
                />
              </div>
            )}

            <div>
              <label className="text-sm font-medium text-gray-700 mb-2 block">角色</label>
              <div className="flex gap-3">
                <button
                  onClick={() => setFormData({ ...formData, role: 'user' })}
                  className={`flex-1 px-4 py-3 rounded-lg border-2 transition-all text-left ${
                    formData.role === 'user'
                      ? 'border-blue-500 bg-blue-50 text-blue-700'
                      : 'border-gray-200 bg-gray-50 text-gray-500 hover:border-gray-300'
                  }`}
                >
                  <p className="font-semibold text-sm">普通用户</p>
                  <p className="text-xs mt-0.5 opacity-70">标准权限</p>
                </button>
                <button
                  onClick={() => setFormData({ ...formData, role: 'admin' })}
                  className={`flex-1 px-4 py-3 rounded-lg border-2 transition-all text-left ${
                    formData.role === 'admin'
                      ? 'border-purple-500 bg-purple-50 text-purple-700'
                      : 'border-gray-200 bg-gray-50 text-gray-500 hover:border-gray-300'
                  }`}
                >
                  <p className="font-semibold text-sm">管理员</p>
                  <p className="text-xs mt-0.5 opacity-70">完整权限</p>
                </button>
              </div>
            </div>

            <div>
              <label className="text-sm font-medium text-gray-700 mb-1.5 block">积分</label>
              <div className="relative">
                <input
                  type="number"
                  placeholder="请输入积分数量"
                  value={String(formData.balance)}
                  onChange={(e) => setFormData({ ...formData, balance: parseInt(e.target.value) || 0 })}
                  className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400"
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 text-xs">
                  ≈ ¥{((formData.balance || 0) * 0.02).toFixed(2)}
                </span>
              </div>
            </div>
          </ModalBody>
          <ModalFooter>
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
            >
              取消
            </button>
            <button
              onClick={handleSave}
              className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors"
            >
              保存
            </button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </div>
  );
};

export default UserManagement;
