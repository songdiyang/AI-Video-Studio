import React, { useEffect, useState } from 'react';
import { Modal, ModalContent, ModalHeader, ModalBody, ModalFooter, useDisclosure } from '@heroui/react';
import { Plus, Search, Edit, Trash2, User, Shield, ShieldOff, Globe, MapPin, ArrowUpCircle, ArrowDownCircle, Send } from 'lucide-react';
import { getAdminAuthHeaders, getUserRole } from '../../services/auth';
import { useConfirm } from '../../contexts/ConfirmContext';

interface UserData {
  id: number;
  email: string;
  role: 'user' | 'admin' | 'ops';
  employee_id?: string;
  balance: number;
  is_active: number;
  last_login_ip: string | null;
  last_login_location: string | null;
  last_active_at: string | null;
  created_at: string;
  updated_at: string;
}

const UserManagement: React.FC = () => {
  const currentRole = getUserRole();
  const isOps = currentRole === 'ops';
  const [users, setUsers] = useState<UserData[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [editingUser, setEditingUser] = useState<UserData | null>(null);
  const [togglingId, setTogglingId] = useState<number | null>(null);
  const { isOpen, onOpen, onClose } = useDisclosure();
  const { confirm } = useConfirm();

  // 积分调整状态
  const [pointsModalOpen, setPointsModalOpen] = useState(false);
  const [pointsTarget, setPointsTarget] = useState<UserData | null>(null);
  const [adjustType, setAdjustType] = useState<'add' | 'subtract'>('add');
  const [adjustAmount, setAdjustAmount] = useState('');
  const [adjustMessage, setAdjustMessage] = useState('');
  const [adjustLoading, setAdjustLoading] = useState(false);
  const [adminEmployeeId, setAdminEmployeeId] = useState<string>('');

  const [formData, setFormData] = useState({
    email: '',
    password: '',
    role: 'user' as 'user' | 'admin' | 'ops',
  });

  useEffect(() => {
    fetchUsers();
    fetchAdminEmployeeId();
  }, []);

  const fetchAdminEmployeeId = async () => {
    try {
      const res = await fetch('/api/admin/me/employee-id', {
        headers: getAdminAuthHeaders()
      });
      if (res.ok) {
        const data = await res.json();
        setAdminEmployeeId(data.employeeId || '');
      }
    } catch { /* ignore */ }
  };

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
        setFormData({ email: '', password: '', role: 'user' });
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

  // 打开积分调整弹窗
  const openPointsModal = (user: UserData, type: 'add' | 'subtract') => {
    setPointsTarget(user);
    setAdjustType(type);
    setAdjustAmount('');
    setAdjustMessage('');
    setPointsModalOpen(true);
  };

  // 执行积分调整
  const handleAdjustPoints = async () => {
    if (!pointsTarget || !adjustAmount || !adjustMessage.trim()) return;
    const amount = Number(adjustAmount);
    if (!Number.isInteger(amount) || amount <= 0) {
      alert('请输入有效的正整数积分');
      return;
    }

    // 前端校验：减少时不能超过当前余额
    const currentBalance = Math.round(Number(pointsTarget.balance) || 0);
    if (adjustType === 'subtract' && amount > currentBalance) {
      alert(`积分不足，当前仅 ${currentBalance} 积分`);
      return;
    }

    // 前端校验：增加后不能超过系统上限
    if (adjustType === 'add' && currentBalance + amount > 9999999999) {
      alert('增加后积分将超出系统上限');
      return;
    }

    setAdjustLoading(true);
    try {
      const res = await fetch(`/api/admin/users/${pointsTarget.id}/adjust-points`, {
        method: 'POST',
        headers: getAdminAuthHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({
          adjustmentType: adjustType,
          amount,
          message: adjustMessage.trim()
        })
      });
      const data = await res.json();
      if (res.ok) {
        await fetchUsers();
        setPointsModalOpen(false);
        setPointsTarget(null);
      } else {
        alert(data.message || '操作失败');
      }
    } catch (error) {
      console.error('积分调整失败:', error);
      alert('操作失败');
    } finally {
      setAdjustLoading(false);
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
          <p className="text-gray-600 text-sm mt-1">管理系统所有用户账户</p>
        </div>
        <button
          onClick={() => {
            setEditingUser(null);
            setFormData({ email: '', password: '', role: 'user' });
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
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
            <input
              type="text"
              placeholder="搜索用户邮箱..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-900 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-colors"
            />
          </div>
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-100">
                <th className="text-left text-xs font-semibold text-gray-600 uppercase tracking-wider px-4 py-3">ID</th>
                <th className="text-left text-xs font-semibold text-gray-600 uppercase tracking-wider px-4 py-3">用户</th>
                <th className="text-left text-xs font-semibold text-gray-600 uppercase tracking-wider px-4 py-3">状态</th>
                <th className="text-left text-xs font-semibold text-gray-600 uppercase tracking-wider px-4 py-3">角色</th>
                <th className="text-left text-xs font-semibold text-gray-600 uppercase tracking-wider px-4 py-3">积分</th>
                <th className="text-left text-xs font-semibold text-gray-600 uppercase tracking-wider px-4 py-3">登录IP</th>
                <th className="text-left text-xs font-semibold text-gray-600 uppercase tracking-wider px-4 py-3">登录地点</th>
                <th className="text-left text-xs font-semibold text-gray-600 uppercase tracking-wider px-4 py-3">创建时间</th>
                <th className="text-left text-xs font-semibold text-gray-600 uppercase tracking-wider px-4 py-3">操作</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={9} className="text-center py-12 text-gray-500 text-sm">加载中...</td></tr>
              ) : filteredUsers.length === 0 ? (
                <tr><td colSpan={9} className="text-center py-12 text-gray-500 text-sm">暂无用户</td></tr>
              ) : filteredUsers.map((user) => {
                const status = getOnlineStatus(user.last_active_at);
                const isDisabled = !user.is_active;
                return (
                  <tr key={user.id} className={`border-b border-gray-50 hover:bg-gray-50/80 transition-colors ${isDisabled ? 'opacity-60' : ''}`}>
                    <td className="px-4 py-3.5 text-sm text-gray-600 font-mono">{user.id}</td>
                    <td className="px-4 py-3.5">
                      <div className="flex items-center gap-3">
                        <div className="relative shrink-0">
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
                        <span className={`w-2 h-2 rounded-full shrink-0 ${status.online ? 'bg-emerald-400' : 'bg-gray-300'}`} />
                        <span className={`text-xs whitespace-nowrap ${status.online ? 'text-emerald-600 font-medium' : 'text-gray-500'}`}>
                          {status.label}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-3.5">
                      <span className={`inline-flex items-center px-2 py-1 text-xs font-medium rounded-md ${
                        user.role === 'admin'
                          ? 'bg-purple-50 text-purple-700'
                          : user.role === 'ops'
                          ? 'bg-cyan-50 text-cyan-700'
                          : 'bg-gray-100 text-gray-600'
                      }`}>
                        {user.role === 'admin' ? '管理员' : user.role === 'ops' ? '运维' : '普通用户'}
                      </span>
                    </td>
                    <td className="px-4 py-3.5">
                      <div className="flex flex-col">
                        <span className="text-sm font-mono font-semibold text-emerald-600">
                          {Math.floor(typeof user.balance === 'number' ? user.balance : Number(user.balance || 0))} 积分
                        </span>
                        <span className="text-xs text-gray-500">
                          ≈ ¥{((typeof user.balance === 'number' ? user.balance : Number(user.balance || 0)) * 0.02).toFixed(2)}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-3.5">
                      {user.last_login_ip ? (
                        <div className="flex items-center gap-1.5">
                          <Globe className="w-3.5 h-3.5 text-gray-500 shrink-0" />
                          <span className="text-xs font-mono text-gray-600">{user.last_login_ip}</span>
                        </div>
                      ) : (
                        <span className="text-xs text-gray-500">-</span>
                      )}
                    </td>
                    <td className="px-4 py-3.5">
                      {user.last_login_location ? (
                        <div className="flex items-center gap-1.5">
                          <MapPin className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
                          <span className="text-xs font-medium text-gray-700">{user.last_login_location}</span>
                        </div>
                      ) : (
                        <span className="text-xs text-gray-400">-</span>
                      )}
                    </td>
                    <td className="px-4 py-3.5 text-xs text-gray-600 whitespace-nowrap">
                      {formatDate(user.created_at)}
                    </td>
                    <td className="px-4 py-3.5">
                      <div className="flex items-center gap-1">
                        {/* 运维不能操作管理员和运维用户 */}
                        {isOps && (user.role === 'admin' || user.role === 'ops') ? (
                          <span className="text-xs text-gray-400">无权限</span>
                        ) : (
                          <>
                            <button
                              onClick={() => openPointsModal(user, 'add')}
                              className="p-1.5 rounded-md text-emerald-500 hover:bg-emerald-50 hover:text-emerald-600 transition-colors"
                              title="增加积分"
                            >
                              <ArrowUpCircle className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => openPointsModal(user, 'subtract')}
                              className="p-1.5 rounded-md text-red-400 hover:bg-red-50 hover:text-red-500 transition-colors"
                              title="减少积分"
                            >
                              <ArrowDownCircle className="w-4 h-4" />
                            </button>
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
                            {/* 运维不能编辑用户（只能增删普通用户） */}
                            {!isOps && (
                              <button
                                onClick={() => handleEdit(user)}
                                className="p-1.5 rounded-md text-blue-500 hover:bg-blue-50 hover:text-blue-600 transition-colors"
                                title="编辑"
                              >
                                <Edit className="w-4 h-4" />
                              </button>
                            )}
                            <button
                              onClick={() => handleDelete(user.id)}
                              className="p-1.5 rounded-md text-red-400 hover:bg-red-50 hover:text-red-500 transition-colors"
                              title="删除"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Footer Stats */}
        <div className="px-4 py-3 border-t border-gray-100 flex items-center justify-between text-xs text-gray-600">
          <span>共 {filteredUsers.length} 位用户</span>
          <span>
            {filteredUsers.filter(u => {
              const s = getOnlineStatus(u.last_active_at);
              return s.online;
            }).length} 人在线
          </span>
        </div>
      </div>

      {/* 编辑用户 Modal（不再含积分直接编辑） */}
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
                className="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-900 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400"
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
                  className="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-900 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400"
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
                      : 'border-gray-200 bg-gray-50 text-gray-600 hover:border-gray-300'
                  }`}
                >
                  <p className="font-semibold text-sm">普通用户</p>
                  <p className="text-xs mt-0.5 text-current/80">标准权限</p>
                </button>
                {!isOps && (
                  <>
                    <button
                      onClick={() => setFormData({ ...formData, role: 'ops' })}
                      className={`flex-1 px-4 py-3 rounded-lg border-2 transition-all text-left ${
                        formData.role === 'ops'
                          ? 'border-cyan-500 bg-cyan-50 text-cyan-700'
                          : 'border-gray-200 bg-gray-50 text-gray-600 hover:border-gray-300'
                      }`}
                    >
                      <p className="font-semibold text-sm">运维</p>
                      <p className="text-xs mt-0.5 text-current/80">运维权限</p>
                    </button>
                    <button
                      onClick={() => setFormData({ ...formData, role: 'admin' })}
                      className={`flex-1 px-4 py-3 rounded-lg border-2 transition-all text-left ${
                        formData.role === 'admin'
                          ? 'border-purple-500 bg-purple-50 text-purple-700'
                          : 'border-gray-200 bg-gray-50 text-gray-600 hover:border-gray-300'
                      }`}
                    >
                      <p className="font-semibold text-sm">管理员</p>
                      <p className="text-xs mt-0.5 text-current/80">完整权限</p>
                    </button>
                  </>
                )}
              </div>
            </div>

            {/* 编辑时显示当前积分（只读） */}
            {editingUser && (
              <div>
                <label className="text-sm font-medium text-gray-700 mb-1.5 block">当前积分</label>
                <div className="flex items-center gap-3">
                  <div className="flex-1 px-4 py-2.5 bg-gray-100 border border-gray-200 rounded-lg text-sm text-gray-600">
                    {Math.floor(editingUser.balance)} 积分
                    <span className="ml-2 text-xs text-gray-400">≈ ¥{((editingUser.balance || 0) * 0.02).toFixed(2)}</span>
                  </div>
                  <span className="text-xs text-gray-400 whitespace-nowrap">请在列表中使用 ± 按钮调整</span>
                </div>
              </div>
            )}
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

      {/* 积分调整 Modal */}
      <Modal isOpen={pointsModalOpen} onClose={() => setPointsModalOpen(false)} size="md" classNames={{ base: "bg-white border border-gray-200 shadow-xl" }}>
        <ModalContent>
          <ModalHeader className="text-lg font-bold text-gray-900">
            {adjustType === 'add' ? '增加积分' : '减少积分'}
          </ModalHeader>
          <ModalBody className="space-y-4">
            {/* 用户信息 */}
            <div className="p-3 bg-gray-50 rounded-lg">
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-sm font-medium text-gray-900">{pointsTarget?.email}</span>
                  <span className="ml-2 text-xs text-gray-500">ID: {pointsTarget?.id}</span>
                </div>
                <span className="text-sm font-mono font-semibold text-emerald-600">
                  当前: {Math.floor(pointsTarget?.balance || 0)} 积分
                </span>
              </div>
            </div>

            {/* 操作类型提示 */}
            <div className={`p-3 rounded-lg border-2 ${
              adjustType === 'add'
                ? 'bg-emerald-50 border-emerald-300'
                : 'bg-red-50 border-red-300'
            }`}>
              <div className="flex items-center gap-2">
                {adjustType === 'add' ? (
                  <ArrowUpCircle className="w-5 h-5 text-emerald-500" />
                ) : (
                  <ArrowDownCircle className="w-5 h-5 text-red-500" />
                )}
                <span className={`text-sm font-semibold ${
                  adjustType === 'add' ? 'text-emerald-700' : 'text-red-700'
                }`}>
                  {adjustType === 'add' ? '增加积分' : '减少积分'}
                </span>
              </div>
            </div>

            {/* 积分数额 */}
            <div>
              <label className="text-sm font-medium text-gray-700 mb-1.5 block">
                {adjustType === 'add' ? '增加' : '减少'}积分数额
              </label>
              <input
                type="number"
                min="1"
                placeholder="请输入正整数"
                value={adjustAmount}
                onChange={(e) => setAdjustAmount(e.target.value.replace(/[^\d]/g, ''))}
                className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-900 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400"
              />
              {adjustAmount && Number(adjustAmount) > 0 && (() => {
                const currentBalance = Math.round(Number(pointsTarget?.balance) || 0);
                const amount = Number(adjustAmount);
                const newBalance = adjustType === 'add' ? currentBalance + amount : currentBalance - amount;
                const isOverflow = newBalance > 9999999999;
                const isInsufficient = adjustType === 'subtract' && amount > currentBalance;
                return (
                  <p className="mt-1.5 text-xs text-gray-500">
                    调整后余额: <span className={`font-semibold ${
                      adjustType === 'add' ? 'text-emerald-600' : 'text-red-600'
                    }`}>
                      {newBalance.toLocaleString()} 积分
                    </span>
                    <span className="ml-1">
                      (≈ ¥{(newBalance * 0.02).toFixed(2)})
                    </span>
                    {isOverflow && (
                      <span className="ml-2 text-red-500 font-medium">⚠ 超出系统上限</span>
                    )}
                    {isInsufficient && (
                      <span className="ml-2 text-red-500 font-medium">⚠ 积分不足</span>
                    )}
                  </p>
                );
              })()}
            </div>

            {/* 站内信内容（必填） */}
            <div>
              <label className="text-sm font-medium text-gray-700 mb-1.5 block">
                站内信内容 <span className="text-red-500">*</span>
              </label>
              <textarea
                placeholder={`请填写向用户说明的${adjustType === 'add' ? '增加' : '减少'}积分原因...\n\n此内容将以站内信形式发送给用户。`}
                value={adjustMessage}
                onChange={(e) => setAdjustMessage(e.target.value)}
                rows={4}
                className="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-900 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 resize-none overflow-y-auto"
              />
              <div className="mt-1.5 flex items-center justify-between">
                <span className="text-xs text-gray-400">
                  发送人: {adminEmployeeId || '加载中...'}
                </span>
                <span className="text-xs text-red-400">
                  {!adjustMessage.trim() && '必须填写站内信内容才能操作'}
                </span>
              </div>
            </div>

            {/* 预览 */}
            {adjustAmount && Number(adjustAmount) > 0 && adjustMessage.trim() && (
              <div className="p-3 bg-gray-50 rounded-lg border border-gray-100">
                <p className="text-xs text-gray-500 mb-1">站内信预览:</p>
                <div className="text-sm">
                  <span className={`font-bold ${adjustType === 'add' ? 'text-emerald-600' : 'text-red-600'}`}>
                    {adjustType === 'add' ? '+' : '-'}{adjustAmount} 积分
                  </span>
                  <span className="text-gray-600 ml-2">· {adjustMessage.substring(0, 50)}{adjustMessage.length > 50 ? '...' : ''}</span>
                </div>
              </div>
            )}
          </ModalBody>
          <ModalFooter>
            <button
              onClick={() => setPointsModalOpen(false)}
              className="px-4 py-2 text-sm font-medium text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
              disabled={adjustLoading}
            >
              取消
            </button>
            <button
              onClick={handleAdjustPoints}
              disabled={adjustLoading || !adjustAmount || !adjustMessage.trim() || Number(adjustAmount) <= 0}
              className={`flex items-center gap-2 px-4 py-2 text-sm font-medium text-white rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                adjustType === 'add'
                  ? 'bg-emerald-600 hover:bg-emerald-700'
                  : 'bg-red-600 hover:bg-red-700'
              }`}
            >
              <Send className="w-4 h-4" />
              {adjustLoading ? '处理中...' : `${adjustType === 'add' ? '增加' : '减少'} ${adjustAmount || 0} 积分并发送通知`}
            </button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </div>
  );
};

export default UserManagement;
