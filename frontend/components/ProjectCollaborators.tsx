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
  Divider,
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
  Link as LinkIcon,
  Copy,
  Users,
} from 'lucide-react';
import { useToast } from '../contexts/ToastContext';
import { useConfirm } from '../contexts/ConfirmContext';
import {
  ProjectCollaborator,
  ProjectOwner,
  CollaborationRole,
  SearchedUser,
  fetchProjectCollaborators,
  addProjectCollaborator,
  updateCollaboratorRole,
  removeProjectCollaborator,
  searchUsers,
  generateInvite,
  generateInviteLink,
  canManageMembers,
  ROLE_LABELS,
  ROLE_DESCRIPTIONS,
} from '../services/collaboration';

interface ProjectCollaboratorsProps {
  projectId: number;
  onCollaboratorChange?: () => void;
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

const ProjectCollaborators: React.FC<ProjectCollaboratorsProps> = ({
  projectId,
  onCollaboratorChange,
}) => {
  const { showToast } = useToast();
  const { confirm } = useConfirm();

  // 状态
  const [owner, setOwner] = useState<ProjectOwner | null>(null);
  const [collaborators, setCollaborators] = useState<ProjectCollaborator[]>([]);
  const [myRole, setMyRole] = useState<CollaborationRole | null>(null);
  const [teamId, setTeamId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  // 添加协作者模态框
  const [showAddModal, setShowAddModal] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchedUser[]>([]);
  const [searching, setSearching] = useState(false);
  const [selectedUser, setSelectedUser] = useState<SearchedUser | null>(null);
  const [selectedRole, setSelectedRole] = useState<Exclude<CollaborationRole, 'owner'>>('viewer');
  const [adding, setAdding] = useState(false);

  // 修改角色模态框
  const [showRoleModal, setShowRoleModal] = useState(false);
  const [editingCollaborator, setEditingCollaborator] = useState<ProjectCollaborator | null>(null);
  const [newRole, setNewRole] = useState<Exclude<CollaborationRole, 'owner'>>('viewer');
  const [updatingRole, setUpdatingRole] = useState(false);

  // 邀请链接模态框
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [inviteLink, setInviteLink] = useState('');
  const [generatingInvite, setGeneratingInvite] = useState(false);

  const canManage = canManageMembers(myRole);

  // 加载协作者列表
  const loadCollaborators = useCallback(async () => {
    try {
      setLoading(true);
      const data = await fetchProjectCollaborators(projectId);
      setOwner(data.owner);
      setCollaborators(data.collaborators);
      setMyRole(data.myRole);
      setTeamId(data.team_id);
    } catch (error) {
      showToast(error instanceof Error ? error.message : '加载协作者失败', 'error');
    } finally {
      setLoading(false);
    }
  }, [projectId, showToast]);

  useEffect(() => {
    loadCollaborators();
  }, [loadCollaborators]);

  // 搜索用户
  useEffect(() => {
    const timer = setTimeout(async () => {
      if (searchQuery.length >= 2) {
        setSearching(true);
        try {
          const { users } = await searchUsers(searchQuery);
          // 过滤已是协作者的用户和所有者
          const existingIds = new Set([
            ...(owner ? [owner.user_id] : []),
            ...collaborators.map(c => c.user_id),
          ]);
          setSearchResults(users.filter(u => !existingIds.has(u.id)));
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
  }, [searchQuery, owner, collaborators]);

  // 添加协作者
  const handleAddCollaborator = async () => {
    if (!selectedUser) return;

    try {
      setAdding(true);
      await addProjectCollaborator(projectId, {
        username: selectedUser.username,
        role: selectedRole,
      });
      showToast('协作者添加成功', 'success');
      await loadCollaborators();
      onCollaboratorChange?.();
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
    if (!editingCollaborator) return;

    try {
      setUpdatingRole(true);
      await updateCollaboratorRole(projectId, editingCollaborator.user_id, newRole);
      showToast('角色更新成功', 'success');
      await loadCollaborators();
      onCollaboratorChange?.();
      setShowRoleModal(false);
    } catch (error) {
      showToast(error instanceof Error ? error.message : '更新失败', 'error');
    } finally {
      setUpdatingRole(false);
    }
  };

  // 移除协作者
  const handleRemoveCollaborator = async (collaborator: ProjectCollaborator) => {
    const confirmed = await confirm({
      title: '移除协作者',
      message: `确定要将「${collaborator.username}」从项目中移除吗？`,
      confirmText: '移除',
      cancelText: '取消',
      type: 'danger',
    });

    if (confirmed) {
      try {
        await removeProjectCollaborator(projectId, collaborator.user_id);
        showToast('协作者已移除', 'success');
        await loadCollaborators();
        onCollaboratorChange?.();
      } catch (error) {
        showToast(error instanceof Error ? error.message : '移除失败', 'error');
      }
    }
  };

  // 生成邀请链接
  const handleGenerateInvite = async () => {
    try {
      setGeneratingInvite(true);
      const { invite } = await generateInvite({
        type: 'project',
        target_id: projectId,
        role: 'viewer',
        max_uses: 5,
        expires_in_hours: 72, // 3天
      });
      setInviteLink(generateInviteLink(invite.code));
      setShowInviteModal(true);
    } catch (error) {
      showToast(error instanceof Error ? error.message : '生成邀请失败', 'error');
    } finally {
      setGeneratingInvite(false);
    }
  };

  // 复制邀请链接
  const handleCopyInviteLink = () => {
    navigator.clipboard.writeText(inviteLink);
    showToast('邀请链接已复制', 'success');
  };

  // 打开修改角色模态框
  const openRoleModal = (collaborator: ProjectCollaborator) => {
    setEditingCollaborator(collaborator);
    setNewRole(collaborator.role);
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
        <div className="flex justify-end gap-2 mb-4">
          <Button
            variant="flat"
            startContent={<LinkIcon className="w-4 h-4" />}
            onPress={handleGenerateInvite}
            isLoading={generatingInvite}
          >
            邀请链接
          </Button>
          <Button
            color="primary"
            startContent={<UserPlus className="w-4 h-4" />}
            onPress={() => setShowAddModal(true)}
          >
            添加协作者
          </Button>
        </div>
      )}

      {/* 团队提示 */}
      {teamId && (
        <div className="flex items-center gap-2 p-3 mb-4 bg-primary-50 dark:bg-primary-900/20 rounded-lg">
          <Users className="w-4 h-4 text-primary" />
          <span className="text-sm text-primary">此项目属于团队，团队成员自动拥有访问权限</span>
        </div>
      )}

      {/* 协作者列表 */}
      <Card className="bg-[var(--bg-card)]">
        <CardBody className="p-0">
          {/* 所有者 */}
          {owner && (
            <div className="flex items-center justify-between p-4 bg-[var(--bg-elevated)]">
              <div className="flex items-center gap-3">
                <Avatar
                  src={owner.avatar || undefined}
                  name={owner.username}
                  size="sm"
                />
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-[var(--text-primary)]">
                      {owner.username}
                    </span>
                    <Chip
                      size="sm"
                      variant="flat"
                      color="warning"
                      startContent={ROLE_ICONS.owner}
                    >
                      {ROLE_LABELS.owner}
                    </Chip>
                  </div>
                  <p className="text-xs text-[var(--text-tertiary)]">项目创建者</p>
                </div>
              </div>
            </div>
          )}

          <Divider />

          {/* 协作者列表 */}
          {collaborators.length === 0 ? (
            <div className="py-8 text-center">
              <p className="text-[var(--text-secondary)]">暂无其他协作者</p>
              {canManage && (
                <p className="text-sm text-[var(--text-tertiary)] mt-1">
                  点击上方按钮添加协作者
                </p>
              )}
            </div>
          ) : (
            <div className="divide-y divide-[var(--border-color)]">
              {collaborators.map((collaborator) => (
                <div
                  key={collaborator.id}
                  className="flex items-center justify-between p-4 hover:bg-[var(--bg-elevated)] transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <Avatar
                      src={collaborator.avatar || undefined}
                      name={collaborator.username}
                      size="sm"
                    />
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-[var(--text-primary)]">
                          {collaborator.username}
                        </span>
                        <Chip
                          size="sm"
                          variant="flat"
                          color={ROLE_COLORS[collaborator.role]}
                          startContent={ROLE_ICONS[collaborator.role]}
                        >
                          {ROLE_LABELS[collaborator.role]}
                        </Chip>
                      </div>
                      {collaborator.added_by_username && (
                        <p className="text-xs text-[var(--text-tertiary)] mt-0.5">
                          由 {collaborator.added_by_username} 添加
                        </p>
                      )}
                    </div>
                  </div>

                  {canManage && (
                    <Dropdown>
                      <DropdownTrigger>
                        <Button isIconOnly size="sm" variant="light">
                          <MoreVertical className="w-4 h-4" />
                        </Button>
                      </DropdownTrigger>
                      <DropdownMenu
                        aria-label="协作者操作"
                        onAction={(key: Key) => {
                          if (key === 'role') openRoleModal(collaborator);
                          if (key === 'remove') handleRemoveCollaborator(collaborator);
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
                          移除协作者
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

      {/* 添加协作者模态框 */}
      <Modal isOpen={showAddModal} onClose={() => setShowAddModal(false)} size="lg">
        <ModalContent>
          <ModalHeader>添加项目协作者</ModalHeader>
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
              label="协作者角色"
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
              onPress={handleAddCollaborator}
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
          <ModalHeader>修改协作者角色</ModalHeader>
          <ModalBody>
            {editingCollaborator && (
              <div className="flex items-center gap-3 mb-4">
                <Avatar
                  src={editingCollaborator.avatar || undefined}
                  name={editingCollaborator.username}
                  size="sm"
                />
                <span className="font-medium">{editingCollaborator.username}</span>
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

      {/* 邀请链接模态框 */}
      <Modal isOpen={showInviteModal} onClose={() => setShowInviteModal(false)}>
        <ModalContent>
          <ModalHeader>邀请链接</ModalHeader>
          <ModalBody>
            <p className="text-sm text-[var(--text-secondary)] mb-4">
              分享此链接邀请他人加入项目，链接3天内有效，最多可使用5次。
            </p>
            <div className="flex gap-2">
              <Input
                value={inviteLink}
                isReadOnly
                classNames={{
                  input: 'text-sm',
                }}
              />
              <Button
                isIconOnly
                color="primary"
                onPress={handleCopyInviteLink}
              >
                <Copy className="w-4 h-4" />
              </Button>
            </div>
          </ModalBody>
          <ModalFooter>
            <Button variant="light" onPress={() => setShowInviteModal(false)}>
              关闭
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </div>
  );
};

export default ProjectCollaborators;
