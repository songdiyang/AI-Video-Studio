import React, { useEffect, useState } from 'react';
import { Card, CardBody, Button, Input, Table, TableHeader, TableColumn, TableBody, TableRow, TableCell, Chip, Modal, ModalContent, ModalHeader, ModalBody, ModalFooter, useDisclosure } from '@heroui/react';
import { Plus, Search, Edit, Trash2, User } from 'lucide-react';
import { getAdminAuthHeaders } from '../../services/auth';
import { useConfirm } from '../../contexts/ConfirmContext';

interface UserData {
  id: number;
  email: string;
  role: 'user' | 'admin';
  balance: number;
  created_at: string;
  updated_at: string;
}

const UserManagement: React.FC = () => {
  const [users, setUsers] = useState<UserData[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [editingUser, setEditingUser] = useState<UserData | null>(null);
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
        headers: getAdminAuthHeaders({
          'Content-Type': 'application/json'
        }),
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
      message: '确定要删除此用户吗？',
      type: 'danger',
      confirmText: '删除'
    });
    if (!confirmed) return;

    try {
      const response = await fetch(`/api/admin/users/${userId}`, {
        method: 'DELETE',
        headers: getAdminAuthHeaders()
      });

      if (response.ok) {
        fetchUsers();
      }
    } catch (error) {
      console.error('删除用户失败:', error);
    }
  };

  const filteredUsers = users.filter(user =>
    user.email.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString('zh-CN');
  };

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold text-slate-100">用户管理</h1>
          <p className="text-slate-400 mt-1">管理系统所有用户账户</p>
        </div>
        <Button
          className="bg-gradient-to-r from-blue-500 to-violet-600 text-white font-semibold shadow-lg"
          startContent={<Plus className="w-4 h-4" />}
          onPress={() => {
            setEditingUser(null);
            setFormData({ email: '', password: '', role: 'user', balance: 100 });
            onOpen();
          }}
        >
          添加用户
        </Button>
      </div>

      <Card className="bg-slate-900/80 border border-slate-700/50 shadow-sm">
        <CardBody className="p-6">
          <div className="mb-6">
            <Input
              placeholder="搜索用户邮箱..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              startContent={<Search className="w-4 h-4 text-slate-400" />}
              classNames={{
                inputWrapper: "bg-slate-800/60 border border-slate-600/50"
              }}
            />
          </div>

          <Table
            aria-label="用户列表"
            classNames={{
              wrapper: "bg-transparent shadow-none",
              th: "bg-slate-800/60 text-slate-400 font-semibold",
              td: "text-slate-300"
            }}
          >
            <TableHeader>
              <TableColumn>ID</TableColumn>
              <TableColumn>邮箱</TableColumn>
              <TableColumn>角色</TableColumn>
              <TableColumn>余额</TableColumn>
              <TableColumn>创建时间</TableColumn>
              <TableColumn>操作</TableColumn>
            </TableHeader>
            <TableBody emptyContent={loading ? "加载中..." : "暂无用户"}>
              {filteredUsers.map((user) => (
                <TableRow key={user.id}>
                  <TableCell>{user.id}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 bg-blue-500/10 rounded-full flex items-center justify-center">
                        <User className="w-4 h-4 text-blue-400" />
                      </div>
                      <span className="font-medium">{user.email}</span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Chip
                      size="sm"
                      className={user.role === 'admin' 
                        ? 'bg-purple-500/10 text-purple-400 font-medium'
                        : 'bg-slate-700/50 text-slate-400 font-medium'
                      }
                    >
                      {user.role === 'admin' ? '管理员' : '普通用户'}
                    </Chip>
                  </TableCell>
                  <TableCell>
                    <span className="font-mono font-semibold text-emerald-400">
                      ¥{typeof user.balance === 'number' ? user.balance.toFixed(2) : Number(user.balance || 0).toFixed(2)}
                    </span>
                  </TableCell>
                  <TableCell className="text-slate-500 text-sm">
                    {formatDate(user.created_at)}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Button
                        size="sm"
                        variant="flat"
                        className="bg-blue-500/10 text-blue-400 hover:bg-blue-500/20 min-w-0 px-3"
                        onPress={() => handleEdit(user)}
                      >
                        <Edit className="w-4 h-4" />
                      </Button>
                      <Button
                        size="sm"
                        variant="flat"
                        className="bg-red-500/10 text-red-400 hover:bg-red-500/20 min-w-0 px-3"
                        onPress={() => handleDelete(user.id)}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardBody>
      </Card>

      <Modal isOpen={isOpen} onClose={onClose} size="lg" classNames={{ base: "bg-slate-900/95 backdrop-blur-xl border border-slate-700/50" }}>
        <ModalContent>
          <ModalHeader className="text-xl font-bold text-slate-100">
            {editingUser ? '编辑用户' : '添加用户'}
          </ModalHeader>
          <ModalBody className="space-y-4">
            <Input
              label="邮箱"
              placeholder="请输入邮箱"
              value={formData.email}
              onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              classNames={{
                inputWrapper: "bg-slate-800/60 border border-slate-600/50"
              }}
            />

            {!editingUser && (
              <Input
                type="password"
                label="密码"
                placeholder="请输入密码"
                value={formData.password}
                onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                classNames={{
                  inputWrapper: "bg-slate-800/60 border border-slate-600/50"
                }}
              />
            )}
            
            <div>
              <label className="text-sm font-medium text-slate-400 mb-2 block">角色</label>
              <div className="flex gap-4">
                <button
                  onClick={() => setFormData({ ...formData, role: 'user' })}
                  className={`flex-1 px-4 py-3 rounded-lg border-2 transition-all ${
                    formData.role === 'user'
                      ? 'border-blue-500 bg-blue-500/10 text-blue-400'
                      : 'border-slate-600/50 bg-slate-800/60 text-slate-400 hover:border-slate-500'
                  }`}
                >
                  <p className="font-semibold">普通用户</p>
                  <p className="text-xs mt-1">标准权限</p>
                </button>
                <button
                  onClick={() => setFormData({ ...formData, role: 'admin' })}
                  className={`flex-1 px-4 py-3 rounded-lg border-2 transition-all ${
                    formData.role === 'admin'
                      ? 'border-purple-500 bg-purple-500/10 text-purple-400'
                      : 'border-slate-600/50 bg-slate-800/60 text-slate-400 hover:border-slate-500'
                  }`}
                >
                  <p className="font-semibold">管理员</p>
                  <p className="text-xs mt-1">完整权限</p>
                </button>
              </div>
            </div>

            <Input
              type="number"
              label="余额"
              placeholder="请输入余额"
              value={String(formData.balance)}
              onChange={(e) => setFormData({ ...formData, balance: parseFloat(e.target.value) || 0 })}
              startContent={<span className="text-slate-500">¥</span>}
              classNames={{
                inputWrapper: "bg-slate-800/60 border border-slate-600/50"
              }}
            />
          </ModalBody>
          <ModalFooter>
            <Button
              variant="flat"
              className="bg-slate-800/80 text-slate-300 hover:bg-slate-700"
              onPress={onClose}
            >
              取消
            </Button>
            <Button
              className="bg-gradient-to-r from-blue-500 to-violet-600 text-white"
              onPress={handleSave}
            >
              保存
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </div>
  );
};

export default UserManagement;
