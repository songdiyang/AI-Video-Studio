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
  Select,
  SelectItem,
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
  Check,
  X,
  Clock,
  ShieldCheck,
  Mail,
  Upload,
  Download,
} from 'lucide-react';
import { useToast } from '../../contexts/ToastContext';
import { useConfirm } from '../../contexts/ConfirmContext';
import { useLanguage } from '../../contexts/LanguageContext';
import TeamMembersPanel from '../../components/TeamMembersPanel';
import { createProject, updateProject, fetchProjects, Project } from '../../services/projects';
import { PROJECT_TYPES, ProjectType } from '../../types/projectTypes';
import {
  Team,
  JoinRequest,
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
  fetchJoinRequests,
  approveJoinRequest,
  rejectJoinRequest,
  fetchMyJoinRequests,
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
  const [activeTab, setActiveTab] = useState<'members' | 'projects' | 'review'>('members');

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

  // 审核申请
  const [joinRequests, setJoinRequests] = useState<JoinRequest[]>([]);
  const [loadingRequests, setLoadingRequests] = useState(false);
  const [pendingCount, setPendingCount] = useState(0);

  // 用户的邀请历史
  const [myJoinRequests, setMyJoinRequests] = useState<JoinRequest[]>([]);
  const [loadingMyRequests, setLoadingMyRequests] = useState(false);

  // 创建团队工程
  const [showCreateProjectModal, setShowCreateProjectModal] = useState(false);
  const [newProjectName, setNewProjectName] = useState('');
  const [newProjectDesc, setNewProjectDesc] = useState('');
  const [newProjectType, setNewProjectType] = useState<ProjectType>('comic_drama');
  const [creatingProject, setCreatingProject] = useState(false);

  // 导入个人项目到团队
  const [showImportModal, setShowImportModal] = useState(false);
  const [personalProjects, setPersonalProjects] = useState<Project[]>([]);
  const [loadingPersonalProjects, setLoadingPersonalProjects] = useState(false);
  const [transferring, setTransferring] = useState<number | null>(null);

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
      } catch (error) {
        // 即使退出失败（如已不是成员），也刷新列表
        const errorMessage = error instanceof Error ? error.message : '退出失败';
        console.log('退出团队结果:', errorMessage);
        if (errorMessage.includes('不是团队成员')) {
          showToast('您已不在该团队中', 'info');
        } else {
          showToast(errorMessage, 'error');
        }
      } finally {
        // 无论成功失败，都刷新团队列表
        await loadTeams();
        if (selectedTeam?.id === team.id) {
          navigate('/teams');
        }
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
      const result = await joinTeam(inviteCode.trim());
      showToast(result.message, 'success');
      setShowJoinModal(false);
      setInviteCode('');
      // 刷新邀请历史
      loadMyJoinRequests();
      await loadTeams();
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

  // 在团队中创建工程
  const handleCreateTeamProject = async () => {
    if (!selectedTeam || !newProjectName.trim()) {
      showToast('请输入工程名称', 'error');
      return;
    }
    try {
      setCreatingProject(true);
      const project = await createProject({
        name: newProjectName.trim(),
        description: newProjectDesc.trim(),
        type: newProjectType,
        team_id: selectedTeam.id,
      });
      showToast('工程创建成功，团队成员均可编辑', 'success');
      setShowCreateProjectModal(false);
      setNewProjectName('');
      setNewProjectDesc('');
      setNewProjectType('comic_drama');
      // 刷新团队项目列表
      const { projects } = await fetchTeamProjects(selectedTeam.id);
      setTeamProjects(projects);
      // 跳转到新项目
      navigate(`/projects/${project.id}`);
    } catch (error) {
      showToast(error instanceof Error ? error.message : '创建工程失败', 'error');
    } finally {
      setCreatingProject(false);
    }
  };

  // 加载个人项目列表（未关联团队的）
  const loadPersonalProjects = async () => {
    try {
      setLoadingPersonalProjects(true);
      const projects = await fetchProjects();
      // 只显示用户自己创建的、未关联团队的项目
      setPersonalProjects(projects.filter(p => (p as any).source === 'own' && !p.team_id));
    } catch (error) {
      showToast('加载个人项目失败', 'error');
    } finally {
      setLoadingPersonalProjects(false);
    }
  };

  // 导入个人项目到团队
  const handleImportToTeam = async (projectId: number) => {
    if (!selectedTeam) return;
    try {
      setTransferring(projectId);
      await updateProject(projectId, { team_id: selectedTeam.id } as any);
      showToast('项目已移入团队，所有成员可编辑', 'success');
      // 刷新
      const { projects } = await fetchTeamProjects(selectedTeam.id);
      setTeamProjects(projects);
      // 从个人列表移除
      setPersonalProjects(prev => prev.filter(p => p.id !== projectId));
    } catch (error) {
      showToast(error instanceof Error ? error.message : '移入失败', 'error');
    } finally {
      setTransferring(null);
    }
  };

  // 将团队项目移出到个人
  const handleRemoveFromTeam = async (projectId: number, projectTitle: string) => {
    if (!selectedTeam) return;
    const confirmed = await confirm({
      title: '移出到个人',
      message: `确定将项目「${projectTitle}」移出团队吗？移出后团队成员将无法访问该项目。`,
      confirmText: '确认移出',
      cancelText: '取消',
      type: 'warning',
    });
    if (!confirmed) return;
    try {
      await updateProject(projectId, { team_id: null } as any);
      showToast('项目已移出到个人', 'success');
      const { projects } = await fetchTeamProjects(selectedTeam.id);
      setTeamProjects(projects);
    } catch (error) {
      showToast(error instanceof Error ? error.message : '移出失败', 'error');
    }
  };

  // 加载团队加入申请列表
  const loadJoinRequests = useCallback(async (teamId: number) => {
    try {
      setLoadingRequests(true);
      const { requests } = await fetchJoinRequests(teamId);
      setJoinRequests(requests);
      setPendingCount(requests.filter(r => r.status === 'pending').length);
    } catch (error) {
      console.error('加载加入申请失败:', error);
    } finally {
      setLoadingRequests(false);
    }
  }, []);

  // 批准申请
  const handleApproveRequest = async (requestId: number) => {
    if (!selectedTeam) return;
    try {
      const { message } = await approveJoinRequest(selectedTeam.id, requestId);
      showToast(message, 'success');
      loadJoinRequests(selectedTeam.id);
      loadTeamDetail(selectedTeam.id);
    } catch (error) {
      showToast(error instanceof Error ? error.message : '操作失败', 'error');
    }
  };

  // 拒绝申请
  const handleRejectRequest = async (requestId: number) => {
    if (!selectedTeam) return;
    const confirmed = await confirm({
      title: '拒绝申请',
      message: '确定要拒绝该用户的加入申请吗？',
      confirmText: '拒绝',
      cancelText: '取消',
      type: 'warning',
    });
    if (!confirmed) return;
    try {
      const { message } = await rejectJoinRequest(selectedTeam.id, requestId);
      showToast(message, 'success');
      loadJoinRequests(selectedTeam.id);
    } catch (error) {
      showToast(error instanceof Error ? error.message : '操作失败', 'error');
    }
  };

  // 加载用户的邀请历史
  const loadMyJoinRequests = useCallback(async () => {
    try {
      setLoadingMyRequests(true);
      const { requests } = await fetchMyJoinRequests();
      setMyJoinRequests(requests);
    } catch (error) {
      console.error('加载邀请历史失败:', error);
    } finally {
      setLoadingMyRequests(false);
    }
  }, []);

  // 当切换到审核标签页时加载数据
  useEffect(() => {
    if (activeTab === 'review' && selectedTeam && canManageMembers(selectedTeam.my_role)) {
      loadJoinRequests(selectedTeam.id);
    }
  }, [activeTab, selectedTeam, loadJoinRequests]);

  // 列表视图时加载用户邀请历史
  useEffect(() => {
    if (!selectedTeam) {
      loadMyJoinRequests();
    }
  }, [selectedTeam, loadMyJoinRequests]);

  // 团队详情加载时获取待审核数量
  useEffect(() => {
    if (selectedTeam && canManageMembers(selectedTeam.my_role)) {
      fetchJoinRequests(selectedTeam.id, 'pending').then(({ requests }) => {
        setPendingCount(requests.length);
      }).catch(() => {});
    }
  }, [selectedTeam]);

  // 格式化时间
  const formatTime = (dateStr: string) => {
    const d = new Date(dateStr);
    const now = new Date();
    const diff = now.getTime() - d.getTime();
    if (diff < 60000) return '刚刚';
    if (diff < 3600000) return `${Math.floor(diff / 60000)} 分钟前`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)} 小时前`;
    if (diff < 604800000) return `${Math.floor(diff / 86400000)} 天前`;
    return d.toLocaleDateString('zh-CN');
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

        {/* 邀请历史 */}
        {myJoinRequests.length > 0 && (
          <div className="mt-8">
            <h2 className="text-lg font-semibold text-[var(--text-primary)] mb-4 flex items-center gap-2">
              <Mail className="w-5 h-5" />
              我的申请记录
            </h2>
            <div className="space-y-2">
              {loadingMyRequests ? (
                <div className="flex justify-center py-6">
                  <Spinner size="sm" />
                </div>
              ) : (
                myJoinRequests.map((req) => (
                  <Card key={req.id} className="bg-[var(--bg-card)]">
                    <CardBody className="p-4 flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                          req.status === 'pending' ? 'bg-warning/10' : 
                          req.status === 'approved' ? 'bg-success/10' : 'bg-danger/10'
                        }`}>
                          {req.status === 'pending' ? (
                            <Clock className="w-4 h-4 text-warning" />
                          ) : req.status === 'approved' ? (
                            <Check className="w-4 h-4 text-success" />
                          ) : (
                            <X className="w-4 h-4 text-danger" />
                          )}
                        </div>
                        <div>
                          <p className="text-sm text-[var(--text-primary)]">
                            {req.inviter_email ? (
                              <><span className="font-medium">{req.inviter_email}</span> 邀请您加入团队 </>
                            ) : (
                              <>您申请加入团队 </>
                            )}
                            <span className="font-semibold">{req.team_name}</span>
                          </p>
                          <p className="text-xs text-[var(--text-tertiary)] mt-0.5">
                            {formatTime(req.created_at)}
                          </p>
                        </div>
                      </div>
                      <Chip
                        size="sm"
                        variant="flat"
                        color={req.status === 'pending' ? 'warning' : req.status === 'approved' ? 'success' : 'danger'}
                      >
                        {req.status === 'pending' ? '待审核' : req.status === 'approved' ? '已通过' : '已拒绝'}
                      </Chip>
                    </CardBody>
                  </Card>
                ))
              )}
            </div>
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

        {/* 加入团队模态框 */}
        <Modal 
          isOpen={showJoinModal} 
          onOpenChange={(open) => setShowJoinModal(open)}
        >
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
        onSelectionChange={(key) => setActiveTab(key as 'members' | 'projects' | 'review')}
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
        {canManageMembers(selectedTeam.my_role) ? (
          <Tab
            key="review"
            title={
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-4 h-4" />
                审核
                {pendingCount > 0 && (
                  <Chip size="sm" color="danger" variant="solid" className="ml-1 min-w-5 h-5 text-xs">
                    {pendingCount}
                  </Chip>
                )}
              </div>
            }
          />
        ) : null}
      </Tabs>
  
      {/* 内容区 */}
      {activeTab === 'members' ? (
        <TeamMembersPanel
          teamId={selectedTeam.id}
          myRole={selectedTeam.my_role || 'viewer'}
          onMemberChange={() => loadTeamDetail(selectedTeam.id)}
        />
      ) : activeTab === 'review' ? (
        <div className="space-y-3">
          {loadingRequests ? (
            <div className="flex justify-center py-12">
              <Spinner size="lg" />
            </div>
          ) : joinRequests.length === 0 ? (
            <Card className="bg-[var(--bg-card)]">
              <CardBody className="py-12 text-center">
                <ShieldCheck className="w-10 h-10 mx-auto mb-3 text-[var(--text-tertiary)]" />
                <p className="text-[var(--text-secondary)]">暂无加入申请</p>
              </CardBody>
            </Card>
          ) : (
            joinRequests.map((req) => (
              <Card key={req.id} className="bg-[var(--bg-card)]">
                <CardBody className="p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <Avatar name={req.user_email} className="w-10 h-10" />
                      <div>
                        <p className="text-sm font-medium text-[var(--text-primary)]">
                          {req.user_email}
                        </p>
                        <p className="text-xs text-[var(--text-tertiary)]">
                          用户 ID: {req.user_id} · {formatTime(req.created_at)}
                          {req.invite_code && (
                            <span className="ml-2">· 通过邀请码加入</span>
                          )}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {req.status === 'pending' ? (
                        <>
                          <Button
                            isIconOnly
                            size="sm"
                            color="success"
                            variant="flat"
                            onPress={() => handleApproveRequest(req.id)}
                          >
                            <Check className="w-4 h-4" />
                          </Button>
                          <Button
                            isIconOnly
                            size="sm"
                            color="danger"
                            variant="flat"
                            onPress={() => handleRejectRequest(req.id)}
                          >
                            <X className="w-4 h-4" />
                          </Button>
                        </>
                      ) : (
                        <Chip
                          size="sm"
                          variant="flat"
                          color={req.status === 'approved' ? 'success' : 'danger'}
                        >
                          {req.status === 'approved' ? '已通过' : '已拒绝'}
                        </Chip>
                      )}
                    </div>
                  </div>
                </CardBody>
              </Card>
            ))
          )}
        </div>
      ) : (
        <div>
          <div className="flex justify-end gap-2 mb-4">
            <Button
              variant="flat"
              startContent={<Upload className="w-4 h-4" />}
              onPress={() => {
                loadPersonalProjects();
                setShowImportModal(true);
              }}
            >
              导入个人项目
            </Button>
            <Button
              color="primary"
              startContent={<Plus className="w-4 h-4" />}
              onPress={() => setShowCreateProjectModal(true)}
            >
              新增工程
            </Button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {teamProjects.length === 0 ? (
            <Card className="col-span-full bg-[var(--bg-card)]">
              <CardBody className="py-8 text-center">
                <FolderOpen className="w-10 h-10 mx-auto mb-3 text-[var(--text-tertiary)]" />
                <p className="text-[var(--text-secondary)]">团队还没有项目</p>
                <p className="text-sm text-[var(--text-tertiary)] mt-1">
                  点击上方"新增工程"按钮创建团队项目，或导入个人项目
                </p>
              </CardBody>
            </Card>
          ) : (
            teamProjects.map((project) => (
              <Card
                key={project.id}
                isPressable={false}
                className="bg-[var(--bg-card)] hover:bg-[var(--bg-elevated)]"
              >
                <CardBody className="p-4">
                  <div className="flex items-start justify-between mb-1">
                    <h3 
                      className="font-semibold text-[var(--text-primary)] cursor-pointer hover:underline flex-1"
                      onClick={() => navigate(`/projects/${project.id}`)}
                    >
                      {project.title}
                    </h3>
                    <Dropdown>
                      <DropdownTrigger>
                        <Button isIconOnly size="sm" variant="light">
                          <MoreVertical className="w-4 h-4" />
                        </Button>
                      </DropdownTrigger>
                      <DropdownMenu
                        aria-label="项目操作"
                        onAction={(key) => {
                          if (key === 'open') navigate(`/projects/${project.id}`);
                          if (key === 'remove') handleRemoveFromTeam(project.id, project.title);
                        }}
                      >
                        <DropdownItem key="open" startContent={<FolderOpen className="w-4 h-4" />}>
                          打开项目
                        </DropdownItem>
                        <DropdownItem key="remove" className="text-warning" color="warning" startContent={<Download className="w-4 h-4" />}>
                          移出到个人
                        </DropdownItem>
                      </DropdownMenu>
                    </Dropdown>
                  </div>
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
  
      {/* 加入团队模态框 - 确保在两个视图中都可用 */}
      <Modal 
        isOpen={showJoinModal} 
        onOpenChange={(open) => setShowJoinModal(open)}
      >
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

      {/* 新增团队工程模态框 */}
      <Modal 
        isOpen={showCreateProjectModal} 
        onClose={() => setShowCreateProjectModal(false)}
      >
        <ModalContent>
          <ModalHeader>新增团队工程</ModalHeader>
          <ModalBody>
            <p className="text-sm text-[var(--text-secondary)] mb-2">
              在团队「{selectedTeam?.name}」中创建工程，所有团队成员均可编辑。
            </p>
            <Input
              label="工程名称"
              placeholder="输入工程名称"
              value={newProjectName}
              onValueChange={setNewProjectName}
              isRequired
              autoFocus
            />
            <Textarea
              label="工程描述"
              placeholder="描述工程内容（可选）"
              value={newProjectDesc}
              onValueChange={setNewProjectDesc}
              minRows={2}
            />
            <Select
              label="工程类型"
              selectedKeys={[newProjectType]}
              onSelectionChange={(keys) => {
                const selected = Array.from(keys)[0] as ProjectType;
                if (selected) setNewProjectType(selected);
              }}
            >
              {Object.values(PROJECT_TYPES).map((pt) => (
                <SelectItem key={pt.code}>{pt.name}</SelectItem>
              ))}
            </Select>
          </ModalBody>
          <ModalFooter>
            <Button variant="light" onPress={() => setShowCreateProjectModal(false)}>
              取消
            </Button>
            <Button color="primary" onPress={handleCreateTeamProject} isLoading={creatingProject}>
              创建
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>

      {/* 导入个人项目模态框 */}
      <Modal 
        isOpen={showImportModal} 
        onClose={() => setShowImportModal(false)}
        size="2xl"
      >
        <ModalContent>
          <ModalHeader>导入个人项目到团队</ModalHeader>
          <ModalBody>
            <p className="text-sm text-[var(--text-secondary)] mb-3">
              选择个人项目移入团队「{selectedTeam?.name}」，移入后所有团队成员均可编辑。
            </p>
            {loadingPersonalProjects ? (
              <div className="flex justify-center py-8">
                <Spinner size="lg" />
              </div>
            ) : personalProjects.length === 0 ? (
              <div className="py-8 text-center">
                <FolderOpen className="w-10 h-10 mx-auto mb-3 text-[var(--text-tertiary)]" />
                <p className="text-[var(--text-secondary)]">没有可导入的个人项目</p>
                <p className="text-xs text-[var(--text-tertiary)] mt-1">
                  所有个人项目都已关联到团队
                </p>
              </div>
            ) : (
              <div className="space-y-2 max-h-[400px] overflow-y-auto">
                {personalProjects.map((project) => (
                  <Card key={project.id} className="bg-[var(--bg-card)]">
                    <CardBody className="p-3 flex items-center justify-between">
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm text-[var(--text-primary)] truncate">
                          {project.name}
                        </p>
                        {project.description && (
                          <p className="text-xs text-[var(--text-tertiary)] truncate mt-0.5">
                            {project.description}
                          </p>
                        )}
                      </div>
                      <Button
                        size="sm"
                        color="primary"
                        variant="flat"
                        startContent={<Upload className="w-3 h-3" />}
                        isLoading={transferring === project.id}
                        onPress={() => handleImportToTeam(project.id)}
                      >
                        移入
                      </Button>
                    </CardBody>
                  </Card>
                ))}
              </div>
            )}
          </ModalBody>
          <ModalFooter>
            <Button variant="light" onPress={() => setShowImportModal(false)}>
              关闭
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </div>
  );
};

export default Teams;
