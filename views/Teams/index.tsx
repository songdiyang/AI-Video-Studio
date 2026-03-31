import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  Card,
  CardBody,
  Button,
  Input,
  Textarea,
  Modal,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
  Avatar,
  Chip,
  Tabs,
  Tab,
  Spinner,
  Dropdown,
  DropdownTrigger,
  DropdownMenu,
  DropdownItem,
} from '@heroui/react';
import {
  Users,
  Plus,
  Settings,
  FolderOpen,
  Crown,
  MoreVertical,
  Trash2,
  LogOut,
  Link as LinkIcon,
  Copy,
  ArrowLeft,
} from 'lucide-react';
import { useToast } from '../../contexts/ToastContext';
import { useConfirm } from '../../contexts/ConfirmContext';
import { useLanguage } from '../../contexts/LanguageContext';
import TeamMembersPanel from '../../components/TeamMembersPanel';
import {
  Team,
  fetchTeams,
  fetchTeamDetail,
  fetchTeamProjects,
  createTeam,
  updateTeam,
  deleteTeam,
  leaveTeam,
  joinTeam,
  generateInvite,
  generateInviteLink,
  canManageMembers,
  canDelete,
  ROLE_LABELS,
} from '../../services/collaboration';

const Teams: React.FC = () => {
  const navigate = useNavigate();
  const { id: teamIdParam } = useParams<{ id: string }>();
  const { showToast } = useToast();
  const { confirm } = useConfirm();
  const { t } = useLanguage();

  // 状态
  const [teams, setTeams] = useState<Team[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedTeam, setSelectedTeam] = useState<Team | null>(null);
  const [teamProjects, setTeamProjects] = useState<any[]>([]);
  const [activeTab, setActiveTab] = useState<'members' | 'projects'>('members');

  // 创建/编辑模态框
  const [showModal, setShowModal] = useState(false);
  const [editingTeam, setEditingTeam] = useState<Team | null>(null);
  const [formData, setFormData] = useState({ name: '', description: '' });
  const [submitting, setSubmitting] = useState(false);

  // 邀请链接模态框
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [inviteLink, setInviteLink] = useState('');
  const [generatingInvite, setGeneratingInvite] = useState(false);

  // 加入团队模态框
  const [showJoinModal, setShowJoinModal] = useState(false);
  const [inviteCode, setInviteCode] = useState('');
  const [joining, setJoining] = useState(false);

  // 加载团队列表
  const loadTeams = useCallback(async () => {
    try {
      setLoading(true);
      const { teams: data } = await fetchTeams();
      setTeams(data);
    } catch (error) {
      showToast(error instanceof Error ? error.message : '加载团队失败', 'error');
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  // 加载团队详情
  const loadTeamDetail = useCallback(async (teamId: number) => {
    try {
      const { team } = await fetchTeamDetail(teamId);
      setSelectedTeam(team);
      // 加载团队项目
      const { projects } = await fetchTeamProjects(teamId);
      setTeamProjects(projects);
    } catch (error) {
      showToast(error instanceof Error ? error.message : '加载团队详情失败', 'error');
      navigate('/teams');
    }
  }, [showToast, navigate]);

  useEffect(() => {
    loadTeams();
  }, [loadTeams]);

  useEffect(() => {
    if (teamIdParam) {
      loadTeamDetail(parseInt(teamIdParam));
    } else {
      setSelectedTeam(null);
    }
  }, [teamIdParam, loadTeamDetail]);

  // 打开创建/编辑模态框
  const handleOpenModal = (team?: Team) => {
    if (team) {
      setEditingTeam(team);
      setFormData({ name: team.name, description: team.description || '' });
    } else {
      setEditingTeam(null);
      setFormData({ name: '', description: '' });
    }
    setShowModal(true);
  };

  // 保存团队
  const handleSave = async () => {
    if (!formData.name.trim()) {
      showToast('请输入团队名称', 'error');
      return;
    }

    try {
      setSubmitting(true);
      if (editingTeam) {
        await updateTeam(editingTeam.id, formData);
        showToast('团队更新成功', 'success');
        if (selectedTeam?.id === editingTeam.id) {
          loadTeamDetail(editingTeam.id);
        }
      } else {
        const { team } = await createTeam(formData);
        showToast('团队创建成功', 'success');
        navigate(`/teams/${team.id}`);
      }
      await loadTeams();
      setShowModal(false);
    } catch (error) {
      showToast(error instanceof Error ? error.message : '操作失败', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  // 删除团队
  const handleDeleteTeam = async (team: Team) => {
    const confirmed = await confirm({
      title: '删除团队',
      message: `确定要删除团队「${team.name}」吗？此操作不可撤销，团队内的项目将解除团队关联。`,
      confirmText: '删除',
      cancelText: '取消',
      type: 'danger',
    });

    if (confirmed) {
      try {
        await deleteTeam(team.id);
        showToast('团队已删除', 'success');
        await loadTeams();
        if (selectedTeam?.id === team.id) {
          navigate('/teams');
        }
      } catch (error) {
        showToast(error instanceof Error ? error.message : '删除失败', 'error');
      }
    }
  };

  // 退出团队
  const handleLeaveTeam = async (team: Team) => {
    const confirmed = await confirm({
      title: '退出团队',
      message: `确定要退出团队「${team.name}」吗？`,
      confirmText: '退出',
      cancelText: '取消',
      type: 'warning',
    });

    if (confirmed) {
      try {
        await leaveTeam(team.id);
        showToast('已退出团队', 'success');
        await loadTeams();
        if (selectedTeam?.id === team.id) {
          navigate('/teams');
        }
      } catch (error) {
        showToast(error instanceof Error ? error.message : '退出失败', 'error');
      }
    }
  };

  // 加入团队
  const handleJoinTeam = async () => {
    if (!inviteCode.trim()) {
      showToast('请输入邀请码', 'error');
      return;
    }

    try {
      setJoining(true);
      const { message, team } = await joinTeam(inviteCode.trim());
      showToast(message, 'success');
      setShowJoinModal(false);
      setInviteCode('');
      await loadTeams();
      navigate(`/teams/${team.id}`);
    } catch (error) {
      showToast(error instanceof Error ? error.message : '加入失败', 'error');
    } finally {
      setJoining(false);
    }
  };

  // 生成邀请链接
  const handleGenerateInvite = async () => {
    if (!selectedTeam) return;

    try {
      setGeneratingInvite(true);
      const { invite } = await generateInvite({
        type: 'team',
        target_id: selectedTeam.id,
        role: 'viewer',
        max_uses: 10,
        expires_in_hours: 168, // 7天
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

  // 团队列表视图
  if (!selectedTeam) {
    return (
      <div className="p-6 max-w-6xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-[var(--text-primary)]">我的团队</h1>
            <p className="text-[var(--text-secondary)] mt-1">管理和参与团队协作</p>
          </div>
          <div className="flex gap-2">
            <Button
              variant="bordered"
              color="default"
              startContent={<Users className="w-4 h-4" />}
              onPress={() => setShowJoinModal(true)}
            >
              加入团队
            </Button>
            <Button
              color="primary"
              startContent={<Plus className="w-4 h-4" />}
              onPress={() => handleOpenModal()}
            >
              创建团队
            </Button>
          </div>
        </div>

        {loading ? (
          <div className="flex justify-center py-12">
            <Spinner size="lg" />
          </div>
        ) : teams.length === 0 ? (
          <Card className="bg-[var(--bg-card)]">
            <CardBody className="py-12 text-center">
              <Users className="w-12 h-12 mx-auto mb-4 text-[var(--text-tertiary)]" />
              <p className="text-[var(--text-secondary)]">还没有加入任何团队</p>
              <p className="text-sm text-[var(--text-tertiary)] mt-1">创建一个团队或通过邀请链接加入</p>
            </CardBody>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {teams.map((team) => (
              <Card
                key={team.id}
                isPressable={false}
                className="bg-[var(--bg-card)] hover:bg-[var(--bg-elevated)] cursor-pointer"
                onPress={() => navigate(`/teams/${team.id}`)}
              >
                <CardBody className="p-4">
                  <div 
                    className="flex items-start justify-between mb-3"
                    onClick={() => navigate(`/teams/${team.id}`)}
                  >
                    <div className="flex items-center gap-3">
                      <Avatar
                        src={team.avatar_url || undefined}
                        name={team.name}
                        className="w-12 h-12"
                      />
                      <div>
                        <h3 className="font-semibold text-[var(--text-primary)]">{team.name}</h3>
                        <div className="flex items-center gap-2 mt-1">
                          <Chip size="sm" variant="flat" color={team.my_role === 'owner' ? 'warning' : 'default'}>
                            {team.my_role === 'owner' && <Crown className="w-3 h-3 mr-1" />}
                            {ROLE_LABELS[team.my_role || 'viewer']}
                          </Chip>
                        </div>
                      </div>
                    </div>
                    <Dropdown>
                      <DropdownTrigger>
                        <Button isIconOnly size="sm" variant="light" onClick={(e) => e.stopPropagation()}>
                          <MoreVertical className="w-4 h-4" />
                        </Button>
                      </DropdownTrigger>
                      <DropdownMenu
                        aria-label="团队操作"
                        onAction={(key) => {
                          if (key === 'edit') handleOpenModal(team);
                          if (key === 'delete') handleDeleteTeam(team);
                          if (key === 'leave') handleLeaveTeam(team);
                        }}
                      >
                        {canManageMembers(team.my_role) ? (
                          <DropdownItem key="edit" startContent={<Settings className="w-4 h-4" />}>
                            编辑团队
                          </DropdownItem>
                        ) : null}
                        {canDelete(team.my_role) ? (
                          <DropdownItem key="delete" className="text-danger" color="danger" startContent={<Trash2 className="w-4 h-4" />}>
                            删除团队
                          </DropdownItem>
                        ) : (
                          <DropdownItem key="leave" className="text-warning" color="warning" startContent={<LogOut className="w-4 h-4" />}>
                            退出团队
                          </DropdownItem>
                        )}
                      </DropdownMenu>
                    </Dropdown>
                  </div>
                  {team.description && (
                    <p className="text-sm text-[var(--text-secondary)] line-clamp-2 mb-3">
                      {team.description}
                    </p>
                  )}
                  <div className="flex items-center gap-4 text-sm text-[var(--text-tertiary)]">
                    <span className="flex items-center gap-1">
                      <Users className="w-4 h-4" />
                      {team.members_count} 成员
                    </span>
                    <span className="flex items-center gap-1">
                      <FolderOpen className="w-4 h-4" />
                      {team.projects_count} 项目
                    </span>
                  </div>
                </CardBody>
              </Card>
            ))}
          </div>
        )}

        {/* 创建/编辑团队模态框 */}
        <Modal isOpen={showModal} onClose={() => setShowModal(false)}>
          <ModalContent>
            <ModalHeader>{editingTeam ? '编辑团队' : '创建团队'}</ModalHeader>
            <ModalBody>
              <Input
                label="团队名称"
                placeholder="输入团队名称"
                value={formData.name}
                onValueChange={(v) => setFormData({ ...formData, name: v })}
                isRequired
              />
              <Textarea
                label="团队描述"
                placeholder="描述团队的目标或工作内容（可选）"
                value={formData.description}
                onValueChange={(v) => setFormData({ ...formData, description: v })}
                minRows={3}
              />
            </ModalBody>
            <ModalFooter>
              <Button variant="light" onPress={() => setShowModal(false)}>
                取消
              </Button>
              <Button color="primary" onPress={handleSave} isLoading={submitting}>
                {editingTeam ? '保存' : '创建'}
              </Button>
            </ModalFooter>
          </ModalContent>
        </Modal>
      </div>
    );
  }

  // 团队详情视图
  return (
    <div className="p-6 max-w-6xl mx-auto">
      {/* 头部 */}
      <div className="flex items-center gap-4 mb-6">
        <Button
          isIconOnly
          variant="light"
          onPress={() => navigate('/teams')}
        >
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <Avatar
          src={selectedTeam.avatar_url || undefined}
          name={selectedTeam.name}
          className="w-14 h-14"
        />
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold text-[var(--text-primary)]">{selectedTeam.name}</h1>
            <Chip size="sm" variant="flat" color={selectedTeam.my_role === 'owner' ? 'warning' : 'default'}>
              {selectedTeam.my_role === 'owner' && <Crown className="w-3 h-3 mr-1" />}
              {ROLE_LABELS[selectedTeam.my_role || 'viewer']}
            </Chip>
          </div>
          {selectedTeam.description && (
            <p className="text-[var(--text-secondary)] mt-1">{selectedTeam.description}</p>
          )}
        </div>
        <div className="flex gap-2">
          {canManageMembers(selectedTeam.my_role) && (
            <>
              <Button
                variant="flat"
                startContent={<LinkIcon className="w-4 h-4" />}
                onPress={handleGenerateInvite}
                isLoading={generatingInvite}
              >
                邀请链接
              </Button>
              <Button
                variant="flat"
                startContent={<Settings className="w-4 h-4" />}
                onPress={() => handleOpenModal(selectedTeam)}
              >
                设置
              </Button>
            </>
          )}
        </div>
      </div>

      {/* 标签页 */}
      <Tabs
        selectedKey={activeTab}
        onSelectionChange={(key) => setActiveTab(key as 'members' | 'projects')}
        className="mb-4"
      >
        <Tab
          key="members"
          title={
            <div className="flex items-center gap-2">
              <Users className="w-4 h-4" />
              成员 ({selectedTeam.members_count})
            </div>
          }
        />
        <Tab
          key="projects"
          title={
            <div className="flex items-center gap-2">
              <FolderOpen className="w-4 h-4" />
              项目 ({selectedTeam.projects_count})
            </div>
          }
        />
      </Tabs>

      {/* 内容区 */}
      {activeTab === 'members' ? (
        <TeamMembersPanel
          teamId={selectedTeam.id}
          myRole={selectedTeam.my_role || 'viewer'}
          onMemberChange={() => loadTeamDetail(selectedTeam.id)}
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {teamProjects.length === 0 ? (
            <Card className="col-span-full bg-[var(--bg-card)]">
              <CardBody className="py-8 text-center">
                <FolderOpen className="w-10 h-10 mx-auto mb-3 text-[var(--text-tertiary)]" />
                <p className="text-[var(--text-secondary)]">团队还没有项目</p>
                <p className="text-sm text-[var(--text-tertiary)] mt-1">
                  创建项目时可以选择归属到此团队
                </p>
              </CardBody>
            </Card>
          ) : (
            teamProjects.map((project) => (
              <Card
                key={project.id}
                isPressable
                className="bg-[var(--bg-card)] hover:bg-[var(--bg-elevated)]"
                onPress={() => navigate(`/projects/${project.id}`)}
              >
                <CardBody className="p-4">
                  <h3 className="font-semibold text-[var(--text-primary)] mb-1">{project.title}</h3>
                  {project.description && (
                    <p className="text-sm text-[var(--text-secondary)] line-clamp-2 mb-2">
                      {project.description}
                    </p>
                  )}
                  <p className="text-xs text-[var(--text-tertiary)]">
                    创建者: {project.owner_username}
                  </p>
                </CardBody>
              </Card>
            ))
          )}
        </div>
      )}

      {/* 邀请链接模态框 */}
      <Modal isOpen={showInviteModal} onClose={() => setShowInviteModal(false)}>
        <ModalContent>
          <ModalHeader>邀请链接</ModalHeader>
          <ModalBody>
            <p className="text-sm text-[var(--text-secondary)] mb-4">
              分享此链接邀请他人加入团队，链接7天内有效，最多可使用10次。
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

      {/* 编辑团队模态框 */}
      <Modal isOpen={showModal} onClose={() => setShowModal(false)}>
        <ModalContent>
          <ModalHeader>编辑团队</ModalHeader>
          <ModalBody>
            <Input
              label="团队名称"
              placeholder="输入团队名称"
              value={formData.name}
              onValueChange={(v) => setFormData({ ...formData, name: v })}
              isRequired
            />
            <Textarea
              label="团队描述"
              placeholder="描述团队的目标或工作内容（可选）"
              value={formData.description}
              onValueChange={(v) => setFormData({ ...formData, description: v })}
              minRows={3}
            />
          </ModalBody>
          <ModalFooter>
            <Button variant="light" onPress={() => setShowModal(false)}>
              取消
            </Button>
            <Button color="primary" onPress={handleSave} isLoading={submitting}>
              保存
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>

      {/* 加入团队模态框 */}
      <Modal isOpen={showJoinModal} onClose={() => setShowJoinModal(false)}>
        <ModalContent>
          <ModalHeader>加入团队</ModalHeader>
          <ModalBody>
            <p className="text-sm text-[var(--text-secondary)] mb-4">
              输入邀请码加入团队
            </p>
            <Input
              label="邀请码"
              placeholder="输入邀请码"
              value={inviteCode}
              onValueChange={(v) => setInviteCode(v.toUpperCase())}
              isRequired
              autoFocus
            />
          </ModalBody>
          <ModalFooter>
            <Button variant="light" onPress={() => setShowJoinModal(false)}>
              取消
            </Button>
            <Button color="primary" onPress={handleJoinTeam} isLoading={joining}>
              加入团队
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </div>
  );
};

export default Teams;
