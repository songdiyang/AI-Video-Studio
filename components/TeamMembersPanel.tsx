import React, { useState, useEffect, useCallback } from 'react';
import type { Key, Selection } from '@react-types/shared';
import {
  Card,
  CardBody,
  Button,
  Input,
  Avatar,
  Chip,
  Spinner,
  Dropdown,
  DropdownTrigger,
  DropdownMenu,
  DropdownItem,
  Modal,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
  Select,
  SelectItem,
  Listbox,
  ListboxItem,
} from '@heroui/react';
import {
  UserPlus,
  MoreVertical,
  Crown,
  Shield,
  Edit,
  Eye,
  Trash2,
  Search,
} from 'lucide-react';
import { useToast } from '../contexts/ToastContext';
import { useConfirm } from '../contexts/ConfirmContext';
import {
  TeamMember,
  CollaborationRole,
  SearchedUser,
  fetchTeamMembers,
  addTeamMember,
  updateTeamMemberRole,
  removeTeamMember,
  searchUsers,
  canManageMembers,
  ROLE_LABELS,
  ROLE_DESCRIPTIONS,
} from '../services/collaboration';

interface TeamMembersPanelProps {
  teamId: number;
  myRole: CollaborationRole;
  onMemberChange?: () => void;
}

const ROLE_ICONS: Record<CollaborationRole, React.ReactNode> = {
  owner: <Crown className="w-3.5 h-3.5 text-warning" />,
  admin: <Shield className="w-3.5 h-3.5 text-primary" />,
  editor: <Edit className="w-3.5 h-3.5 text-success" />,
  viewer: <Eye className="w-3.5 h-3.5 text-default-400" />,
};

const ROLE_COLORS: Record<CollaborationRole, 'warning' | 'primary' | 'success' | 'default'> = {
  owner: 'warning',
  admin: 'primary',
  editor: 'success',
  viewer: 'default',
};

const TeamMembersPanel: React.FC<TeamMembersPanelProps> = ({
  teamId,
  myRole,
  onMemberChange,
}) => {
  const { showToast } = useToast();
  const { confirm } = useConfirm();

  // 状态
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState(true);

  // 添加成员模态框
  const [showAddModal, setShowAddModal] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchedUser[]>([]);
  const [searching, setSearching] = useState(false);
  const [selectedUser, setSelectedUser] = useState<SearchedUser | null>(null);
  const [selectedRole, setSelectedRole] = useState<Exclude<CollaborationRole, 'owner'>>('viewer');
  const [adding, setAdding] = useState(false);

  // 修改角色模态框
  const [showRoleModal, setShowRoleModal] = useState(false);
  const [editingMember, setEditingMember] = useState<TeamMember | null>(null);
  const [newRole, setNewRole] = useState<Exclude<CollaborationRole, 'owner'>>('viewer');
  const [updatingRole, setUpdatingRole] = useState(false);

  const canManage = canManageMembers(myRole);

  // 加载成员列表
  const loadMembers = useCallback(async () => {
    try {
      setLoading(true);
      const { members: data } = await fetchTeamMembers(teamId);
      setMembers(data);
    } catch (error) {
      showToast(error instanceof Error ? error.message : '加载成员失败', 'error');
    } finally {
      setLoading(false);
    }
  }, [teamId, showToast]);

  useEffect(() => {
    loadMembers();
  }, [loadMembers]);

  // 搜索用户
  useEffect(() => {
    const timer = setTimeout(async () => {
      if (searchQuery.length >= 2) {
        setSearching(true);
        try {
          const { users } = await searchUsers(searchQuery);
          // 过滤已是成员的用户
          const memberIds = new Set(members.map(m => m.user_id));
          setSearchResults(users.filter(u => !memberIds.has(u.id)));
        } catch {
          setSearchResults([]);
        } finally {
          setSearching(false);
        }
      } else {
        setSearchResults([]);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [searchQuery, members]);

  // 添加成员
  const handleAddMember = async () => {
    if (!selectedUser) return;

    try {
      setAdding(true);
      await addTeamMember(teamId, {
        username: selectedUser.username,
        role: selectedRole,
      });
      showToast('成员添加成功', 'success');
      await loadMembers();
      onMemberChange?.();
      setShowAddModal(false);
      setSelectedUser(null);
      setSearchQuery('');
    } catch (error) {
      showToast(error instanceof Error ? error.message : '添加失败', 'error');
    } finally {
      setAdding(false);
    }
  };

  // 修改角色
  const handleUpdateRole = async () => {
    if (!editingMember) return;

    try {
      setUpdatingRole(true);
      await updateTeamMemberRole(teamId, editingMember.user_id, newRole);
      showToast('角色更新成功', 'success');
      await loadMembers();
      onMemberChange?.();
      setShowRoleModal(false);
    } catch (error) {
      showToast(error instanceof Error ? error.message : '更新失败', 'error');
    } finally {
      setUpdatingRole(false);
    }
  };

  // 移除成员
  const handleRemoveMember = async (member: TeamMember) => {
    const confirmed = await confirm({
      title: '移除成员',
      message: `确定要将「${member.username}」从团队中移除吗？`,
      confirmText: '移除',
      cancelText: '取消',
      type: 'danger',
    });

    if (confirmed) {
      try {
        await removeTeamMember(teamId, member.user_id);
        showToast('成员已移除', 'success');
        await loadMembers();
        onMemberChange?.();
      } catch (error) {
        showToast(error instanceof Error ? error.message : '移除失败', 'error');
      }
    }
  };

  // 打开修改角色模态框
  const openRoleModal = (member: TeamMember) => {
    setEditingMember(member);
    setNewRole(member.role === 'owner' ? 'admin' : member.role);
    setShowRoleModal(true);
  };

  if (loading) {
    return (
      <div className="flex justify-center py-8">
        <Spinner size="lg" />
      </div>
    );
  }

  return (
    <div>
      {/* 头部操作区 */}
      {canManage && (
        <div className="flex justify-end mb-4">
          <Button
            color="primary"
            startContent={<UserPlus className="w-4 h-4" />}
            onPress={() => setShowAddModal(true)}
          >
            添加成员
          </Button>
        </div>
      )}

      {/* 成员列表 */}
      <Card className="bg-[var(--bg-card)]">
        <CardBody className="p-0">
          {members.length === 0 ? (
            <div className="py-8 text-center">
              <p className="text-[var(--text-secondary)]">暂无成员</p>
            </div>
          ) : (
            <div className="divide-y divide-[var(--border-color)]">
              {members.map((member) => (
                <div
                  key={member.id}
                  className="flex items-center justify-between p-4 hover:bg-[var(--bg-elevated)] transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <Avatar
                      src={member.avatar || undefined}
                      name={member.username}
                      size="sm"
                    />
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-[var(--text-primary)]">
                          {member.username}
                        </span>
                        <Chip
                          size="sm"
                          variant="flat"
                          color={ROLE_COLORS[member.role]}
                          startContent={ROLE_ICONS[member.role]}
                        >
                          {ROLE_LABELS[member.role]}
                        </Chip>
                      </div>
                      {member.invited_by_username && member.role !== 'owner' && (
                        <p className="text-xs text-[var(--text-tertiary)] mt-0.5">
                          由 {member.invited_by_username} 邀请
                        </p>
                      )}
                    </div>
                  </div>

                  {canManage && member.role !== 'owner' && (
                    <Dropdown>
                      <DropdownTrigger>
                        <Button isIconOnly size="sm" variant="light">
                          <MoreVertical className="w-4 h-4" />
                        </Button>
                      </DropdownTrigger>
                      <DropdownMenu
                        aria-label="成员操作"
                        onAction={(key: Key) => {
                          if (key === 'role') openRoleModal(member);
                          if (key === 'remove') handleRemoveMember(member);
                        }}
                      >
                        <DropdownItem key="role" startContent={<Edit className="w-4 h-4" />}>
                          修改角色
                        </DropdownItem>
                        <DropdownItem
                          key="remove"
                          className="text-danger"
                          color="danger"
                          startContent={<Trash2 className="w-4 h-4" />}
                        >
                          移除成员
                        </DropdownItem>
                      </DropdownMenu>
                    </Dropdown>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardBody>
      </Card>

      {/* 添加成员模态框 */}
      <Modal isOpen={showAddModal} onClose={() => setShowAddModal(false)} size="lg">
        <ModalContent>
          <ModalHeader>添加团队成员</ModalHeader>
          <ModalBody>
            {/* 搜索用户 */}
            <Input
              placeholder="搜索用户名..."
              value={searchQuery}
              onValueChange={setSearchQuery}
              startContent={<Search className="w-4 h-4 text-default-400" />}
              endContent={searching && <Spinner size="sm" />}
            />

            {/* 搜索结果 */}
            {searchResults.length > 0 && !selectedUser && (
              <Card className="mt-2">
                <CardBody className="p-0">
                  <Listbox
                    aria-label="搜索结果"
                    onAction={(key: Key) => {
                      const user = searchResults.find(u => u.id === Number(key));
                      if (user) setSelectedUser(user);
                    }}
                  >
                    {searchResults.map((user) => (
                      <ListboxItem
                        key={user.id}
                        startContent={
                          <Avatar src={user.avatar || undefined} name={user.username} size="sm" />
                        }
                      >
                        <div>
                          <p className="font-medium">{user.username}</p>
                          {user.email && (
                            <p className="text-xs text-default-400">{user.email}</p>
                          )}
                        </div>
                      </ListboxItem>
                    ))}
                  </Listbox>
                </CardBody>
              </Card>
            )}

            {/* 已选用户 */}
            {selectedUser && (
              <Card className="mt-2 bg-primary-50 dark:bg-primary-900/20">
                <CardBody className="p-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <Avatar
                        src={selectedUser.avatar || undefined}
                        name={selectedUser.username}
                        size="sm"
                      />
                      <div>
                        <p className="font-medium">{selectedUser.username}</p>
                        {selectedUser.email && (
                          <p className="text-xs text-default-400">{selectedUser.email}</p>
                        )}
                      </div>
                    </div>
                    <Button
                      size="sm"
                      variant="light"
                      onPress={() => setSelectedUser(null)}
                    >
                      更换
                    </Button>
                  </div>
                </CardBody>
              </Card>
            )}

            {/* 角色选择 */}
            <Select
              label="成员角色"
              selectedKeys={[selectedRole]}
              onSelectionChange={(keys: Selection) => {
                const role = Array.from(keys)[0] as Exclude<CollaborationRole, 'owner'>;
                if (role) setSelectedRole(role);
              }}
              className="mt-4"
            >
              <SelectItem key="viewer" description={ROLE_DESCRIPTIONS.viewer}>
                {ROLE_LABELS.viewer}
              </SelectItem>
              <SelectItem key="editor" description={ROLE_DESCRIPTIONS.editor}>
                {ROLE_LABELS.editor}
              </SelectItem>
              <SelectItem key="admin" description={ROLE_DESCRIPTIONS.admin}>
                {ROLE_LABELS.admin}
              </SelectItem>
            </Select>
          </ModalBody>
          <ModalFooter>
            <Button variant="light" onPress={() => setShowAddModal(false)}>
              取消
            </Button>
            <Button
              color="primary"
              onPress={handleAddMember}
              isLoading={adding}
              isDisabled={!selectedUser}
            >
              添加
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>

      {/* 修改角色模态框 */}
      <Modal isOpen={showRoleModal} onClose={() => setShowRoleModal(false)}>
        <ModalContent>
          <ModalHeader>修改成员角色</ModalHeader>
          <ModalBody>
            {editingMember && (
              <div className="flex items-center gap-3 mb-4">
                <Avatar
                  src={editingMember.avatar || undefined}
                  name={editingMember.username}
                  size="sm"
                />
                <span className="font-medium">{editingMember.username}</span>
              </div>
            )}
            <Select
              label="新角色"
              selectedKeys={[newRole]}
              onSelectionChange={(keys: Selection) => {
                const role = Array.from(keys)[0] as Exclude<CollaborationRole, 'owner'>;
                if (role) setNewRole(role);
              }}
            >
              <SelectItem key="viewer" description={ROLE_DESCRIPTIONS.viewer}>
                {ROLE_LABELS.viewer}
              </SelectItem>
              <SelectItem key="editor" description={ROLE_DESCRIPTIONS.editor}>
                {ROLE_LABELS.editor}
              </SelectItem>
              <SelectItem key="admin" description={ROLE_DESCRIPTIONS.admin}>
                {ROLE_LABELS.admin}
              </SelectItem>
            </Select>
          </ModalBody>
          <ModalFooter>
            <Button variant="light" onPress={() => setShowRoleModal(false)}>
              取消
            </Button>
            <Button color="primary" onPress={handleUpdateRole} isLoading={updatingRole}>
              保存
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </div>
  );
};

export default TeamMembersPanel;
