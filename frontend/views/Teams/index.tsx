import React, { useState, useEffect, useCallback, useRef } from 'react';
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
  UserPlus,
  ClipboardList,
  Camera,
  BookOpen,
  Edit,
} from 'lucide-react';
import { useToast } from '../../contexts/ToastContext';
import { useConfirm } from '../../contexts/ConfirmContext';
import { useLanguage } from '../../contexts/LanguageContext';
import { useWorkbench } from '../../contexts/WorkbenchContext';
import TeamMembersPanel from '../../components/TeamMembersPanel';
import TaskAssignmentModal from '../../components/TaskAssignmentModal';
import { createProject, updateProject, fetchProjects, Project } from '../../services/projects';
import { PROJECT_TYPES, ProjectType } from '../../types/projectTypes';
import UpgradePrompt from '../../components/UpgradePrompt';
import {
  Team,
  TeamMember,
  JoinRequest,
  fetchTeams,
  fetchTeamDetail,
  fetchTeamProjects,
  fetchTeamMembers,
  createTeam,
  updateTeam,
  deleteTeam,
  leaveTeam,
  joinTeam,
  generateInvite,
  canManageMembers,
  canDelete,
  ROLE_LABELS,
  fetchJoinRequests,
  approveJoinRequest,
  rejectJoinRequest,
  fetchMyJoinRequests,
  uploadTeamAvatar,
} from '../../services/collaboration';

interface TeamsProps {
  /** 内嵌模式：作为编辑区标签页渲染，列表/详情切换用内部状态而非路由 */
  embedded?: boolean;
  /** 内嵌模式下关闭标签页回调（如从团队进入项目时关闭自身） */
  onClose?: () => void;
}

const Teams: React.FC<TeamsProps> = ({ embedded = false, onClose }) => {
  const navigate = useNavigate();
  const { id: teamIdParam } = useParams<{ id: string }>();
  const { showToast } = useToast();
  const { confirm } = useConfirm();
  const { t } = useLanguage();
  const { setCurrentProject } = useWorkbench();

  // 内嵌模式下的当前团队 id（路由模式下由 teamIdParam 驱动）
  const [internalTeamId, setInternalTeamId] = useState<number | null>(null);
  const activeTeamId = embedded ? internalTeamId : (teamIdParam ? parseInt(teamIdParam, 10) : null);

  // 打开团队详情：内嵌用状态，路由用 navigate
  const openTeam = useCallback((id: number) => {
    if (embedded) setInternalTeamId(id);
    else navigate(`/teams/${id}`);
  }, [embedded, navigate]);
  // 返回团队列表
  const backToList = useCallback(() => {
    if (embedded) setInternalTeamId(null);
    else navigate('/teams');
  }, [embedded, navigate]);

  // 项目打开
  const LAST_PROJECT_KEY = 'nanostory_last_project_id';
  const handleEnterProject = (project: any) => {
    localStorage.setItem(LAST_PROJECT_KEY, project.id.toString());
    setCurrentProject({ ...project, name: project.name || project.title });
    if (embedded) onClose?.();
    else navigate('/');
  };

  // 辅助函数：与 Projects.tsx 保持一致
  const getStatusColor = (status: string) => {
    switch (status) {
      case 'draft': return 'bg-slate-500/20 text-slate-600 dark:text-slate-300 border border-slate-400/30';
      case 'in_progress': return 'bg-blue-500/20 text-blue-600 dark:text-blue-300 border border-blue-400/30';
      case 'completed': return 'bg-emerald-500/20 text-emerald-600 dark:text-emerald-300 border border-emerald-400/30';
      default: return 'bg-slate-500/20 text-slate-600 dark:text-slate-300 border border-slate-400/30';
    }
  };
  const getStatusText = (status: string) => {
    switch (status) {
      case 'draft': return '草稿';
      case 'in_progress': return '进行中';
      case 'completed': return '已完成';
      default: return '草稿';
    }
  };
  const getProjectTypeLabel = (type: string) => {
    switch (type) {
      case 'comic_drama': return '漫剧';
      default: return type;
    }
  };
  const getProjectTypeColor = (type: string) => {
    switch (type) {
      case 'comic_drama': return 'bg-violet-500/20 text-violet-600 dark:text-violet-300 border border-violet-400/30';
      default: return 'bg-slate-500/20 text-slate-600 dark:text-slate-300 border border-slate-400/30';
    }
  };
  const formatDate = (dateString: string) => new Date(dateString).toLocaleDateString('zh-CN');

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
  
    // 升级提示状态
    const [showUpgrade, setShowUpgrade] = useState(false);
    const [upgradeData, setUpgradeData] = useState<{
      currentPlan: { name: string; displayName: string; level: number };
      currentUsage: { current: number; max: number };
      nextPlan?: { name: string; displayName: string; maxProjects: number | string; price?: { monthly: number; yearly: number; firstMonth?: number } };
    } | null>(null);

  // 导入个人项目到团队
  const [showImportModal, setShowImportModal] = useState(false);
  const [personalProjects, setPersonalProjects] = useState<Project[]>([]);
  const [loadingPersonalProjects, setLoadingPersonalProjects] = useState(false);
  const [transferring, setTransferring] = useState<number | null>(null);

  // 任务指派模态框
  const [showTaskAssignModal, setShowTaskAssignModal] = useState(false);
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);

  // 团队头像上传
  const avatarInputRef = useRef<HTMLInputElement>(null);
  const [uploadingAvatarTeamId, setUploadingAvatarTeamId] = useState<number | null>(null);

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
      setLoading(true);
      const { team, myRole } = await fetchTeamDetail(teamId);
      setSelectedTeam({ ...team, my_role: myRole || team.my_role });
      // 加载团队项目
      const { projects } = await fetchTeamProjects(teamId);
      setTeamProjects(projects);
      // 加载团队成员
      const { members } = await fetchTeamMembers(teamId);
      setTeamMembers(members);
    } catch (error) {
      const msg = error instanceof Error ? error.message : '加载团队详情失败';
      // 非成员拦截：后端返回 "您不是该团队成员" 或权限不足
      if (msg.includes('不是该团队成员') || msg.includes('权限不足')) {
        showToast('您没有权限访问该团队', 'error');
      } else {
        showToast(msg, 'error');
      }
      backToList();
    } finally {
      setLoading(false);
    }
  }, [showToast, navigate, backToList]);

  useEffect(() => {
    loadTeams();
  }, [loadTeams]);

  useEffect(() => {
    if (activeTeamId) {
      loadTeamDetail(activeTeamId);
    } else {
      setSelectedTeam(null);
    }
  }, [activeTeamId, loadTeamDetail]);

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
        openTeam(team.id);
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
          backToList();
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
          backToList();
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
      await loadTeams();
      // 加入成功后直接跳转到团队详情页
      if (result.team?.id) {
        openTeam(result.team.id);
      }
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
      setInviteLink(invite.code);
      setShowInviteModal(true);
    } catch (error) {
      showToast(error instanceof Error ? error.message : '生成邀请失败', 'error');
    } finally {
      setGeneratingInvite(false);
    }
  };

  // 复制邀请链接（兼容 HTTP 环境）
  const handleCopyInviteLink = async () => {
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(inviteLink);
      } else {
        // HTTP 降级：使用临时 textarea + execCommand
        const ta = document.createElement('textarea');
        ta.value = inviteLink;
        ta.style.position = 'fixed';
        ta.style.left = '-9999px';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
      }
      showToast('邀请码已复制', 'success');
    } catch {
      showToast('复制失败，请手动复制', 'error');
    }
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
    } catch (error: any) {
      // 项目数量达到上限时弹出升级提示
      if (error.code === 'PROJECT_LIMIT_REACHED' && error.data) {
        const { currentCount, maxCount, planName, planDisplayName, planLevel, upgrade } = error.data;
        setUpgradeData({
          currentPlan: { name: planName, displayName: planDisplayName, level: planLevel },
          currentUsage: { current: currentCount, max: maxCount },
          nextPlan: upgrade?.available ? upgrade.nextPlan : undefined
        });
        setShowUpgrade(true);
      } else {
        showToast(error.message || '创建工程失败', 'error');
      }
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
      setPersonalProjects(projects.filter(p => p.source === 'own' && !p.team_id));
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
      await updateProject(projectId, { team_id: selectedTeam.id });
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
      await updateProject(projectId, { team_id: null });
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
      const loadPendingCount = async () => {
        try {
          const { requests } = await fetchJoinRequests(selectedTeam.id, 'pending');
          setPendingCount(requests.length);
        } catch (error) {
          console.error('获取待审核数量失败:', error);
        }
      };
      loadPendingCount();
    }
  }, [selectedTeam]);

  // 上传团队头像
  const handleAvatarUpload = async (teamId: number, file: File) => {
    try {
      setUploadingAvatarTeamId(teamId);
      const { avatar_url } = await uploadTeamAvatar(teamId, file);
      showToast('团队头像更新成功', 'success');
      // 刷新列表和详情
      await loadTeams();
      if (selectedTeam?.id === teamId) {
        loadTeamDetail(teamId);
      }
    } catch (error) {
      showToast(error instanceof Error ? error.message : '头像上传失败', 'error');
    } finally {
      setUploadingAvatarTeamId(null);
      if (avatarInputRef.current) avatarInputRef.current.value = '';
    }
  };

  // 点击头像触发文件选择
  const triggerAvatarUpload = (teamId: number, e: React.MouseEvent) => {
    e.stopPropagation();
    if (avatarInputRef.current) {
      avatarInputRef.current.dataset.teamId = String(teamId);
      avatarInputRef.current.click();
    }
  };

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
        {/* 隐藏的文件输入 */}
        <input
          ref={avatarInputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            const teamId = avatarInputRef.current?.dataset.teamId;
            if (file && teamId) handleAvatarUpload(Number(teamId), file);
          }}
        />
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-(--text-primary)">我的团队</h1>
            <p className="text-(--text-secondary) mt-1">管理和参与团队协作</p>
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
          <Card className="bg-(--bg-card)">
            <CardBody className="py-12 text-center">
              <Users className="w-12 h-12 mx-auto mb-4 text-(--text-tertiary)" />
              <p className="text-(--text-secondary)">还没有加入任何团队</p>
              <p className="text-sm text-(--text-tertiary) mt-1">创建一个团队或通过邀请链接加入</p>
            </CardBody>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {teams.map((team) => (
              <Card
                key={team.id}
                isPressable={false}
                className="
                  bg-(--bg-card) border border-(--border-subtle)
                  shadow-[0_2px_8px_var(--shadow-color)]
                  cursor-pointer
                  transition-all duration-250 ease-[cubic-bezier(0.4,0,0.2,1)]
                  hover:shadow-[0_8px_24px_var(--shadow-color),0_0_12px_var(--shadow-glow)]
                  hover:border-[rgba(78,142,247,0.25)]
                  hover:-translate-y-0.5
                  group
                "
              >
                <CardBody className="p-5">
                  {/* 上部：头像 + 信息 + 菜单 */}
                  <div
                    className="flex items-start justify-between mb-3"
                    onClick={() => openTeam(team.id)}
                  >
                    <div className="flex items-center gap-3.5">
                      {/* 头像 + 强调色装饰背景 */}
                      <div
                        className={`relative${team.my_role === 'owner' ? ' cursor-pointer group/avatar' : ''}`}
                        onClick={team.my_role === 'owner' ? (e) => triggerAvatarUpload(team.id, e) : undefined}
                        title={team.my_role === 'owner' ? '点击更换团队头像' : undefined}
                      >
                        <div className="absolute -inset-1 rounded-full bg-(--accent)/8 group-hover:bg-(--accent)/15 transition-colors duration-300" />
                        <Avatar
                          src={team.avatar_url || undefined}
                          name={team.name}
                          className="w-12 h-12 relative z-[1] ring-2 ring-(--bg-card)"
                        />
                        {team.my_role === 'owner' && (
                          <div className="absolute inset-0 z-[2] flex items-center justify-center rounded-full bg-black/0 group-hover/avatar:bg-black/40 transition-all duration-200">
                            {uploadingAvatarTeamId === team.id ? (
                              <Spinner size="sm" color="white" />
                            ) : (
                              <Camera className="w-4 h-4 text-white opacity-0 group-hover/avatar:opacity-100 transition-opacity duration-200" />
                            )}
                          </div>
                        )}
                      </div>
                      <div className="min-w-0">
                        <h3 className="font-semibold text-base text-(--text-primary) truncate leading-tight">{team.name}</h3>
                        <div className="flex items-center gap-2 mt-1.5">
                          {/* 角色标签 */}
                          <span
                            className={
                              `inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ` +
                              (team.my_role === 'owner'
                                ? 'bg-[var(--warning-glow)] text-[var(--warning)] ring-1 ring-[var(--warning)]/20'
                                : team.my_role === 'admin'
                                  ? 'bg-(--accent)/10 text-(--accent) ring-1 ring-(--accent)/20'
                                  : 'bg-(--bg-input) text-(--text-secondary) ring-1 ring-(--border-subtle)'
                              )
                            }
                          >
                            {team.my_role === 'owner' && <Crown className="w-3.5 h-3.5 shrink-0" />}
                            {ROLE_LABELS[team.my_role || 'viewer']}
                          </span>
                        </div>
                      </div>
                    </div>
                    {/* 下拉菜单按钮 */}
                    <Dropdown>
                      <DropdownTrigger>
                        <Button
                          isIconOnly
                          size="sm"
                          variant="light"
                          className="
                            text-(--text-muted)
                            hover:text-(--text-secondary)
                            hover:bg-(--bg-input)
                            rounded-lg
                            transition-all duration-150
                          "
                          onClick={(e) => e.stopPropagation()}
                        >
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

                  {/* 描述 */}
                  {team.description && (
                    <p className="text-sm text-(--text-secondary) line-clamp-2 mb-3 leading-relaxed" onClick={() => openTeam(team.id)}>
                      {team.description}
                    </p>
                  )}

                  {/* 分割线 + 统计信息 */}
                  <div className="pt-3 mt-1 border-t border-(--border-subtle)" onClick={() => openTeam(team.id)}>
                    <div className="flex items-center gap-3">
                      <span className="inline-flex items-center gap-1.5 text-sm text-(--text-secondary) bg-(--bg-input)/60 rounded-md px-2 py-1">
                        <Users className="w-3.5 h-3.5 text-(--accent)/70" />
                        <span className="font-medium text-(--text-primary)">{team.members_count}</span> 成员
                      </span>
                      <span className="inline-flex items-center gap-1.5 text-sm text-(--text-secondary) bg-(--bg-input)/60 rounded-md px-2 py-1">
                        <FolderOpen className="w-3.5 h-3.5 text-(--accent)/70" />
                        <span className="font-medium text-(--text-primary)">{team.projects_count}</span> 项目
                      </span>
                    </div>
                  </div>
                </CardBody>
              </Card>
            ))}
          </div>
        )}

        {/* 邀请历史 */}
        {myJoinRequests.length > 0 && (
          <div className="mt-8">
            <h2 className="text-lg font-semibold text-(--text-primary) mb-4 flex items-center gap-2">
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
                  <Card key={req.id} className="bg-(--bg-card)">
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
                          <p className="text-sm text-(--text-primary)">
                            {req.inviter_email ? (
                              <><span className="font-medium">{req.inviter_email}</span> 邀请您加入团队 </>
                            ) : (
                              <>您申请加入团队 </>
                            )}
                            <span className="font-semibold">{req.team_name}</span>
                          </p>
                          <p className="text-xs text-(--text-tertiary) mt-0.5">
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
              <p className="text-sm text-(--text-secondary) mb-4">
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
      {/* 隐藏的文件输入（详情视图） */}
      <input
        ref={avatarInputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          const teamId = avatarInputRef.current?.dataset.teamId;
          if (file && teamId) handleAvatarUpload(Number(teamId), file);
        }}
      />
      {/* 头部 */}
      <div className="flex items-center gap-4 mb-6">
        <Button
          isIconOnly
          variant="light"
          className="text-(--text-secondary) hover:text-(--text-primary) hover:bg-(--bg-input) rounded-lg transition-all duration-150"
          onPress={() => backToList()}
        >
          <ArrowLeft className="w-5 h-5" />
        </Button>
        {/* 头像 + 强调色装饰 */}
        <div
          className={`relative${selectedTeam.my_role === 'owner' ? ' cursor-pointer group/avatar' : ''}`}
          onClick={selectedTeam.my_role === 'owner' ? (e) => triggerAvatarUpload(selectedTeam.id, e) : undefined}
          title={selectedTeam.my_role === 'owner' ? '点击更换团队头像' : undefined}
        >
          <div className="absolute -inset-1.5 rounded-full bg-(--accent)/8" />
          <Avatar
            src={selectedTeam.avatar_url || undefined}
            name={selectedTeam.name}
            className="w-14 h-14 relative z-[1] ring-2 ring-(--bg-card)"
          />
          {selectedTeam.my_role === 'owner' && (
            <div className="absolute inset-0 z-[2] flex items-center justify-center rounded-full bg-black/0 group-hover/avatar:bg-black/40 transition-all duration-200">
              {uploadingAvatarTeamId === selectedTeam.id ? (
                <Spinner size="sm" color="white" />
              ) : (
                <Camera className="w-5 h-5 text-white opacity-0 group-hover/avatar:opacity-100 transition-opacity duration-200" />
              )}
            </div>
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2.5">
            <h1 className="text-2xl font-bold text-(--text-primary)">{selectedTeam.name}</h1>
            {/* 角色标签 - 与列表卡片风格一致 */}
            <span
              className={
                `inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium ` +
                (selectedTeam.my_role === 'owner'
                  ? 'bg-[var(--warning-glow)] text-[var(--warning)] ring-1 ring-[var(--warning)]/20'
                  : selectedTeam.my_role === 'admin'
                    ? 'bg-(--accent)/10 text-(--accent) ring-1 ring-(--accent)/20'
                    : 'bg-(--bg-input) text-(--text-secondary) ring-1 ring-(--border-subtle)'
                )
              }
            >
              {selectedTeam.my_role === 'owner' && <Crown className="w-3.5 h-3.5 shrink-0" />}
              {ROLE_LABELS[selectedTeam.my_role || 'viewer']}
            </span>
          </div>
          {selectedTeam.description && (
            <p className="text-(--text-secondary) mt-1 text-sm leading-relaxed">{selectedTeam.description}</p>
          )}
        </div>
        <div className="flex gap-2">
          {canManageMembers(selectedTeam.my_role) && (
            <>
              <Button
                variant="bordered"
                className="border-(--border-color) text-(--text-secondary) hover:text-(--text-primary) hover:border-(--accent)/40 hover:bg-(--accent)/5 transition-all duration-200"
                startContent={<LinkIcon className="w-4 h-4" />}
                onPress={handleGenerateInvite}
                isLoading={generatingInvite}
              >
                邀请码
              </Button>
              <Button
                variant="bordered"
                className="border-(--border-color) text-(--text-secondary) hover:text-(--text-primary) hover:border-(--accent)/40 hover:bg-(--accent)/5 transition-all duration-200"
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
        <div>
          <TeamMembersPanel
            teamId={selectedTeam.id}
            myRole={selectedTeam.my_role || 'viewer'}
            onMemberChange={() => loadTeamDetail(selectedTeam.id)}
            onAssignTask={canManageMembers(selectedTeam.my_role) ? () => setShowTaskAssignModal(true) : undefined}
          />
        </div>
      ) : activeTab === 'review' ? (
        <div className="space-y-3">
          {loadingRequests ? (
            <div className="flex justify-center py-12">
              <Spinner size="lg" />
            </div>
          ) : joinRequests.length === 0 ? (
            <Card className="bg-(--bg-card) border border-(--border-subtle) shadow-[0_2px_8px_var(--shadow-color)]">
              <CardBody className="py-12 text-center">
                <ShieldCheck className="w-10 h-10 mx-auto mb-3 text-(--text-muted)" />
                <p className="text-(--text-secondary)">暂无加入申请</p>
                <p className="text-xs text-(--text-muted) mt-1">当有人申请加入团队时将在此显示</p>
              </CardBody>
            </Card>
          ) : (
            joinRequests.map((req) => (
              <Card key={req.id} className="bg-(--bg-card) border border-(--border-subtle) shadow-[0_2px_8px_var(--shadow-color)] hover:border-(--border-color) transition-colors duration-150">
                <CardBody className="p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <Avatar name={req.user_email} className="w-10 h-10" />
                      <div>
                        <p className="text-sm font-medium text-(--text-primary)">
                          {req.user_email}
                        </p>
                        <p className="text-xs text-(--text-muted)">
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
              variant="bordered"
              className="border-(--border-color) text-(--text-secondary) hover:text-(--text-primary) hover:border-(--accent)/40 hover:bg-(--accent)/5 transition-all duration-200"
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
            <Card className="col-span-full bg-(--bg-card)">
              <CardBody className="py-8 text-center">
                <FolderOpen className="w-10 h-10 mx-auto mb-3 text-(--text-tertiary)" />
                <p className="text-(--text-secondary)">团队还没有项目</p>
                <p className="text-sm text-(--text-tertiary) mt-1">
                  点击上方"新增工程"按钮创建团队项目，或导入个人项目
                </p>
              </CardBody>
            </Card>
          ) : (
            teamProjects.map((project) => (
              <Card
                key={project.id}
                className="pro-card cursor-pointer group"
                onDoubleClick={() => handleEnterProject(project)}
              >
                <CardBody className="p-0">
                  {/* 封面区域 */}
                  <div
                    className="h-32 bg-linear-to-br from-(--bg-card) to-(--bg-input) relative overflow-hidden rounded-t-2xl"
                    onClick={() => handleEnterProject(project)}
                  >
                    {project.cover_url ? (
                      <img src={project.cover_url} alt={project.name} className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <BookOpen className="w-12 h-12 text-(--accent)/30" />
                      </div>
                    )}
                    {/* 悬停操作按钮 */}
                    <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <Button
                        size="sm"
                        isIconOnly
                        className="bg-(--bg-elevated) backdrop-blur-sm hover:bg-(--bg-card) shadow-lg border border-(--border-color) cursor-pointer"
                        onPress={() => handleEnterProject(project)}
                      >
                        <FolderOpen className="w-4 h-4 text-(--text-primary)" />
                      </Button>
                      <Button
                        size="sm"
                        isIconOnly
                        className="bg-(--bg-elevated) backdrop-blur-sm hover:bg-amber-500/20 shadow-lg border border-(--border-color) cursor-pointer"
                        onPress={() => handleRemoveFromTeam(project.id, project.name)}
                      >
                        <Download className="w-4 h-4 text-amber-400" />
                      </Button>
                    </div>
                  </div>

                  {/* 信息区域 */}
                  <div className="p-4 space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <h3 className="text-lg font-semibold text-(--text-primary) line-clamp-1">{project.name}</h3>
                      <div className="flex items-center gap-1 shrink-0">
                        {project.type && (
                          <Chip size="sm" className={getProjectTypeColor(project.type)}>
                            {getProjectTypeLabel(project.type)}
                          </Chip>
                        )}
                        {project.status && (
                          <Chip size="sm" className={getStatusColor(project.status)}>
                            {getStatusText(project.status)}
                          </Chip>
                        )}
                      </div>
                    </div>
                    <p className="text-sm text-(--text-muted) line-clamp-2 min-h-10">
                      {project.description || '暂无描述'}
                    </p>
                    <div className="flex items-center justify-between text-xs text-(--text-muted) pt-2 border-t border-(--border-color)">
                      <div className="flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        <span>更新于 {formatDate(project.updated_at)}</span>
                      </div>
                      {project.owner_username && (
                        <span>{project.owner_username}</span>
                      )}
                    </div>
                  </div>
                </CardBody>
              </Card>
            ))
          )}
          </div>
        </div>
      )}
  
      {/* 邀请码模态框 */}
      <Modal isOpen={showInviteModal} onClose={() => setShowInviteModal(false)}>
        <ModalContent>
          <ModalHeader>邀请码</ModalHeader>
          <ModalBody>
            <p className="text-sm text-(--text-secondary) mb-4">
              分享此邀请码邀请他人加入团队，7天内有效，最多可使用10次。
            </p>
            <div className="flex gap-2">
              <Input
                value={inviteLink}
                isReadOnly
                classNames={{
                  input: 'text-base font-mono tracking-wider text-center',
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
            <p className="text-sm text-(--text-secondary) mb-4">
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
            <p className="text-sm text-(--text-secondary) mb-2">
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
            <p className="text-sm text-(--text-secondary) mb-3">
              选择个人项目移入团队「{selectedTeam?.name}」，移入后所有团队成员均可编辑。
            </p>
            {loadingPersonalProjects ? (
              <div className="flex justify-center py-8">
                <Spinner size="lg" />
              </div>
            ) : personalProjects.length === 0 ? (
              <div className="py-8 text-center">
                <FolderOpen className="w-10 h-10 mx-auto mb-3 text-(--text-tertiary)" />
                <p className="text-(--text-secondary)">没有可导入的个人项目</p>
                <p className="text-xs text-(--text-tertiary) mt-1">
                  所有个人项目都已关联到团队
                </p>
              </div>
            ) : (
              <div className="space-y-2 max-h-100 overflow-y-auto pr-1">
                {personalProjects.map((project) => (
                  <Card key={project.id} className="bg-(--bg-card) border border-(--border-color)">
                    <CardBody className="p-3">
                      <div className="flex items-center gap-3">
                        {/* 项目封面 */}
                        <div className="w-14 h-14 rounded-lg overflow-hidden bg-(--bg-input) shrink-0">
                          {project.cover_url ? (
                            <img
                              src={project.cover_url}
                              alt={project.name}
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center text-(--text-tertiary)">
                              <FolderOpen className="w-6 h-6" />
                            </div>
                          )}
                        </div>
                        {/* 项目信息 */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <p className="font-medium text-sm text-(--text-primary) truncate">
                              {project.name}
                            </p>
                            {project.type && (
                              <span className="shrink-0 px-1.5 py-0.5 rounded text-[10px] bg-(--accent)/10 text-(--accent)">
                                {{ comic_drama: '漫剧', short_video: '短视频', manga: '漫画', novel: '小说' }[project.type] || project.type}
                              </span>
                            )}
                          </div>
                          {project.description && (
                            <p className="text-xs text-(--text-tertiary) line-clamp-2 mt-1">
                              {project.description}
                            </p>
                          )}
                        </div>
                        {/* 移入按钮 */}
                        <Button
                          size="sm"
                          color="primary"
                          variant="flat"
                          startContent={<Upload className="w-3 h-3" />}
                          isLoading={transferring === project.id}
                          onPress={() => handleImportToTeam(project.id)}
                          className="shrink-0"
                        >
                          移入
                        </Button>
                      </div>
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

      {/* 任务指派模态框 */}
      {selectedTeam && (
        <TaskAssignmentModal
          isOpen={showTaskAssignModal}
          onClose={() => setShowTaskAssignModal(false)}
          teamId={selectedTeam.id}
          teamName={selectedTeam.name}
          members={teamMembers}
          onSuccess={() => {
            showToast('任务指派成功', 'success');
            setShowTaskAssignModal(false);
          }}
        />
      )}

      {/* 升级提示弹窗 */}
      {upgradeData && (
        <UpgradePrompt
          isOpen={showUpgrade}
          onClose={() => setShowUpgrade(false)}
          limitType="project"
          currentPlan={upgradeData.currentPlan}
          currentUsage={upgradeData.currentUsage}
          nextPlan={upgradeData.nextPlan}
        />
      )}
    </div>
  );
};

export default Teams;
