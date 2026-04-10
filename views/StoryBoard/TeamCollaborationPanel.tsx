import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Users, 
  UserPlus, 
  Mail, 
  Shield, 
  Edit2, 
  Eye, 
  CheckCircle, 
  XCircle,
  Clock,
  MoreVertical,
  Trash2,
  X
} from 'lucide-react';
import { getAuthToken } from '../../services/auth';
import { useToast } from '../../contexts/ToastContext';

interface TeamMember {
  id: number;
  user_id: number;
  project_id: number;
  role: 'owner' | 'admin' | 'editor' | 'viewer' | 'reviewer';
  email?: string;
  username?: string;
  avatar_url?: string;
  joined_at: string;
  status: 'pending' | 'active' | 'removed';
  last_active_at?: string;
}

interface TeamCollaborationPanelProps {
  projectId: number;
  isOpen: boolean;
  onClose: () => void;
}

const roleLabels = {
  owner: '所有者',
  admin: '管理员',
  editor: '编辑者',
  viewer: '查看者',
  reviewer: '审核者'
};

const roleColors = {
  owner: 'bg-purple-500',
  admin: 'bg-blue-500',
  editor: 'bg-green-500',
  viewer: 'bg-gray-400',
  reviewer: 'bg-orange-500'
};

const TeamCollaborationPanel: React.FC<TeamCollaborationPanelProps> = ({
  projectId,
  isOpen,
  onClose
}) => {
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<TeamMember['role']>('viewer');
  const [inviting, setInviting] = useState(false);
  const { showToast } = useToast();

  useEffect(() => {
    if (isOpen && projectId) {
      loadMembers();
    }
  }, [isOpen, projectId]);

  const loadMembers = async () => {
    setLoading(true);
    try {
      const token = getAuthToken();
      const res = await fetch(`/api/collaboration/team/${projectId}`, {
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        }
      });
      if (res.ok) {
        const data = await res.json();
        setMembers(data.members || []);
      }
    } catch (error) {
      console.error('[TeamCollaboration] 加载成员失败:', error);
      showToast('加载团队成员失败', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleInvite = async () => {
    if (!inviteEmail.trim()) {
      showToast('请输入邮箱地址', 'error');
      return;
    }

    setInviting(true);
    try {
      const token = getAuthToken();
      const res = await fetch('/api/collaboration/invite', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        },
        body: JSON.stringify({
          projectId,
          email: inviteEmail,
          role: inviteRole
        })
      });

      if (res.ok) {
        showToast('邀请成功', 'success');
        setInviteEmail('');
        setInviteRole('viewer');
        await loadMembers();
      } else {
        const error = await res.json();
        showToast(error.message || '邀请失败', 'error');
      }
    } catch (error) {
      console.error('[TeamCollaboration] 邀请失败:', error);
      showToast('邀请失败', 'error');
    } finally {
      setInviting(false);
    }
  };

  const handleUpdateRole = async (memberId: number, newRole: TeamMember['role']) => {
    try {
      const token = getAuthToken();
      const res = await fetch(`/api/collaboration/member/${memberId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        },
        body: JSON.stringify({ role: newRole })
      });

      if (res.ok) {
        showToast('角色已更新', 'success');
        await loadMembers();
      } else {
        const error = await res.json();
        showToast(error.message || '更新角色失败', 'error');
      }
    } catch (error) {
      console.error('[TeamCollaboration] 更新角色失败:', error);
      showToast('更新角色失败', 'error');
    }
  };

  const handleRemoveMember = async (memberId: number) => {
    if (!confirm('确定要移除这位成员吗？')) return;
    
    try {
      const token = getAuthToken();
      const res = await fetch(`/api/collaboration/member/${memberId}`, {
        method: 'DELETE',
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        }
      });

      if (res.ok) {
        showToast('成员已移除', 'success');
        await loadMembers();
      } else {
        const error = await res.json();
        showToast(error.message || '移除成员失败', 'error');
      }
    } catch (error) {
      console.error('[TeamCollaboration] 移除成员失败:', error);
      showToast('移除成员失败', 'error');
    }
  };

  const formatTime = (dateStr: string) => {
    const d = new Date(dateStr);
    return d.toLocaleDateString('zh-CN');
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: 20 }}
          className="absolute top-0 right-0 w-80 h-full bg-[var(--bg-card)] border-l border-[var(--border-color)] shadow-lg z-20 overflow-hidden flex flex-col"
        >
          {/* 头部 */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border-color)] bg-[var(--bg-app)]">
            <div className="flex items-center gap-2">
              <Users className="w-4 h-4 text-[var(--accent)]" />
              <span className="text-sm font-semibold">团队协作</span>
            </div>
            <button onClick={onClose} className="p-1 hover:bg-[var(--bg-input)] rounded">
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* 邀请成员 */}
          <div className="px-4 py-3 border-b border-[var(--border-color)] bg-[var(--bg-input)]/50">
            <div className="flex items-center gap-2 mb-2">
              <UserPlus className="w-3 h-3 text-[var(--accent)]" />
              <span className="text-xs font-medium">邀请成员</span>
            </div>
            <div className="flex gap-2 mb-2">
              <input
                type="email"
                placeholder="邮箱地址"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                className="flex-1 px-2 py-1.5 text-xs bg-[var(--bg-input)] border border-[var(--border-color)] rounded focus:outline-none focus:ring-1 focus:ring-[var(--accent)]"
              />
              <select
                value={inviteRole}
                onChange={(e) => setInviteRole(e.target.value as TeamMember['role'])}
                className="px-2 py-1.5 text-xs bg-[var(--bg-input)] border border-[var(--border-color)] rounded focus:outline-none focus:ring-1 focus:ring-[var(--accent)]"
              >
                {Object.entries(roleLabels).map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
            </div>
            <button
              onClick={handleInvite}
              disabled={inviting || !inviteEmail.trim()}
              className="w-full px-3 py-1.5 text-xs bg-[var(--accent)] text-white rounded hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-opacity"
            >
              {inviting ? '邀请中...' : '发送邀请'}
            </button>
          </div>

          {/* 成员列表 */}
          <div className="flex-1 overflow-y-auto p-3 space-y-2">
            {loading ? (
              <div className="text-center py-8 text-[var(--text-muted)]">
                <Clock className="w-6 h-6 mx-auto mb-2 animate-spin" />
                <p className="text-xs">加载中...</p>
              </div>
            ) : members.length === 0 ? (
              <div className="text-center py-8 text-[var(--text-muted)]">
                <Users className="w-8 h-8 mx-auto mb-2 opacity-30" />
                <p className="text-xs">暂无团队成员</p>
              </div>
            ) : (
              members.map((member) => (
                <div
                  key={member.id}
                  className="p-3 rounded-lg border border-[var(--border-color)] bg-[var(--bg-input)] hover:border-[var(--accent)]/50 transition-colors"
                >
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex items-center gap-2 flex-1">
                      <div className={`w-2 h-2 rounded-full ${roleColors[member.role]}`} />
                      <div className="flex-1">
                        <div className="text-xs font-medium text-[var(--text-primary)]">
                          {member.username || member.email || '未知用户'}
                        </div>
                        <div className="text-[10px] text-[var(--text-muted)]">
                          加入于 {formatTime(member.joined_at)}
                        </div>
                      </div>
                    </div>
                    <span className="text-[10px] px-1.5 py-0.5 bg-[var(--accent)]/10 text-[var(--accent)] rounded">
                      {roleLabels[member.role]}
                    </span>
                  </div>

                  {/* 操作 */}
                  <div className="flex items-center gap-1">
                    <select
                      value={member.role}
                      onChange={(e) => handleUpdateRole(member.id, e.target.value as TeamMember['role'])}
                      disabled={member.role === 'owner'}
                      className="flex-1 px-2 py-1 text-xs bg-[var(--bg-app)] border border-[var(--border-color)] rounded focus:outline-none disabled:opacity-50"
                    >
                      {Object.entries(roleLabels).map(([value, label]) => (
                        <option key={value} value={value} disabled={value === 'owner'}>
                          {label}
                        </option>
                      ))}
                    </select>
                    {member.role !== 'owner' && (
                      <button
                        onClick={() => handleRemoveMember(member.id)}
                        className="px-2 py-1 bg-red-500/10 text-red-400 text-xs rounded hover:bg-red-500/20"
                        title="移除成员"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default TeamCollaborationPanel;
