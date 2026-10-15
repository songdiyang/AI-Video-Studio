/**
 * 任务指派模态框组件
 * 用于管理员向团队成员分配任务
 */

import React, { useState, useEffect } from 'react';
import { X, ClipboardList, Flag, Clock, User, Folder, Film, Send, Loader2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { getAuthToken } from '../services/auth';

interface TeamMember {
  id: number;
  user_id: number;
  role: string;
  username: string;
  email: string | null;
  avatar?: string | null;
}

interface Project {
  id: number;
  name: string;
}

interface TaskAssignmentModalProps {
  isOpen: boolean;
  onClose: () => void;
  teamId: number;
  teamName: string;
  members: TeamMember[];
  projects?: Project[];
  preSelectedMemberId?: number;
  onSuccess?: () => void;
}

const PRIORITY_OPTIONS = [
  { value: 'low', label: '低', color: '#10b981', bgColor: '#10b98118' },
  { value: 'medium', label: '中', color: '#3b82f6', bgColor: '#3b82f618' },
  { value: 'high', label: '高', color: '#f59e0b', bgColor: '#f59e0b18' },
  { value: 'urgent', label: '紧急', color: '#ef4444', bgColor: '#ef444418' },
];

const TaskAssignmentModal: React.FC<TaskAssignmentModalProps> = ({
  isOpen,
  onClose,
  teamId,
  teamName,
  members,
  projects = [],
  preSelectedMemberId,
  onSuccess,
}) => {
  const [assigneeId, setAssigneeId] = useState<number | ''>(preSelectedMemberId || '');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState('medium');
  const [deadline, setDeadline] = useState('');
  const [projectId, setProjectId] = useState<number | ''>('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // 重置表单
  useEffect(() => {
    if (isOpen) {
      setAssigneeId(preSelectedMemberId || '');
      setTitle('');
      setDescription('');
      setPriority('medium');
      setDeadline('');
      setProjectId('');
      setError('');
    }
  }, [isOpen, preSelectedMemberId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!assigneeId) {
      setError('请选择任务接收者');
      return;
    }
    if (!title.trim()) {
      setError('请输入任务标题');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const token = getAuthToken();
      const res = await fetch('/api/tasks/assign', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          teamId,
          assigneeId,
          title: title.trim(),
          description: description.trim() || null,
          priority,
          deadline: deadline || null,
          projectId: projectId || null,
        }),
      });

      const data = await res.json();

      if (res.ok) {
        onSuccess?.();
        onClose();
      } else {
        setError(data.error || '任务指派失败');
      }
    } catch (err) {
      console.error('任务指派失败:', err);
      setError('网络错误，请稍后重试');
    } finally {
      setLoading(false);
    }
  };

  // 过滤可接收任务的成员（排除 owner，因为通常 owner 是指派者）
  const assignableMembers = members.filter(m => m.role !== 'owner');

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 z-100"
            onClick={onClose}
          />
          
          {/* Modal */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-lg z-101 rounded-2xl overflow-hidden shadow-2xl"
            style={{ backgroundColor: 'var(--bg-card)', border: '1px solid var(--border-color)' }}
          >
            {/* Header */}
            <div 
              className="flex items-center justify-between px-5 py-4"
              style={{ borderBottom: '1px solid var(--border-color)' }}
            >
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg" style={{ backgroundColor: '#8b5cf618' }}>
                  <ClipboardList className="w-5 h-5" style={{ color: '#8b5cf6' }} />
                </div>
                <div>
                  <h2 className="text-base font-semibold" style={{ color: 'var(--text-primary)' }}>
                    指派任务
                  </h2>
                  <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                    团队: {teamName}
                  </p>
                </div>
              </div>
              <button
                onClick={onClose}
                className="p-2 rounded-lg hover:bg-(--bg-input) transition-colors"
              >
                <X className="w-5 h-5" style={{ color: 'var(--text-muted)' }} />
              </button>
            </div>

            {/* Form */}
            <form onSubmit={handleSubmit} className="p-5 space-y-4">
              {/* 错误提示 */}
              {error && (
                <div className="p-3 rounded-lg text-sm" style={{ backgroundColor: '#ef444418', color: '#ef4444' }}>
                  {error}
                </div>
              )}

              {/* 接收者选择 */}
              <div>
                <label className="flex items-center gap-2 text-sm font-medium mb-2" style={{ color: 'var(--text-primary)' }}>
                  <User className="w-4 h-4" style={{ color: 'var(--text-muted)' }} />
                  指派给
                </label>
                <select
                  value={assigneeId}
                  onChange={(e) => setAssigneeId(e.target.value ? Number(e.target.value) : '')}
                  className="w-full px-3 py-2 rounded-lg text-sm outline-none transition-colors"
                  style={{ 
                    backgroundColor: 'var(--bg-input)', 
                    border: '1px solid var(--border-color)',
                    color: 'var(--text-primary)'
                  }}
                  required
                >
                  <option value="">选择团队成员...</option>
                  {assignableMembers.map((member) => (
                    <option key={member.user_id} value={member.user_id}>
                      {member.username || member.email || '未命名用户'} ({member.role})
                    </option>
                  ))}
                </select>
              </div>

              {/* 任务标题 */}
              <div>
                <label className="flex items-center gap-2 text-sm font-medium mb-2" style={{ color: 'var(--text-primary)' }}>
                  <ClipboardList className="w-4 h-4" style={{ color: 'var(--text-muted)' }} />
                  任务标题
                </label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="输入任务标题..."
                  className="w-full px-3 py-2 rounded-lg text-sm outline-none transition-colors"
                  style={{ 
                    backgroundColor: 'var(--bg-input)', 
                    border: '1px solid var(--border-color)',
                    color: 'var(--text-primary)'
                  }}
                  required
                />
              </div>

              {/* 任务描述 */}
              <div>
                <label className="text-sm font-medium mb-2 block" style={{ color: 'var(--text-primary)' }}>
                  任务描述（可选）
                </label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="详细描述任务内容和要求..."
                  rows={3}
                  className="w-full px-3 py-2 rounded-lg text-sm outline-none transition-colors resize-none overflow-y-auto"
                  style={{ 
                    backgroundColor: 'var(--bg-input)', 
                    border: '1px solid var(--border-color)',
                    color: 'var(--text-primary)'
                  }}
                />
              </div>

              {/* 优先级和截止时间 */}
              <div className="grid grid-cols-2 gap-4">
                {/* 优先级 */}
                <div>
                  <label className="flex items-center gap-2 text-sm font-medium mb-2" style={{ color: 'var(--text-primary)' }}>
                    <Flag className="w-4 h-4" style={{ color: 'var(--text-muted)' }} />
                    优先级
                  </label>
                  <div className="flex gap-2">
                    {PRIORITY_OPTIONS.map((opt) => (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => setPriority(opt.value)}
                        className="flex-1 py-1.5 rounded-lg text-xs font-medium transition-all"
                        style={{
                          backgroundColor: priority === opt.value ? opt.bgColor : 'var(--bg-input)',
                          color: priority === opt.value ? opt.color : 'var(--text-muted)',
                          border: `1px solid ${priority === opt.value ? opt.color + '40' : 'var(--border-color)'}`
                        }}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* 截止时间 */}
                <div>
                  <label className="flex items-center gap-2 text-sm font-medium mb-2" style={{ color: 'var(--text-primary)' }}>
                    <Clock className="w-4 h-4" style={{ color: 'var(--text-muted)' }} />
                    截止时间
                  </label>
                  <input
                    type="datetime-local"
                    value={deadline}
                    onChange={(e) => setDeadline(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg text-sm outline-none transition-colors"
                    style={{ 
                      backgroundColor: 'var(--bg-input)', 
                      border: '1px solid var(--border-color)',
                      color: 'var(--text-primary)'
                    }}
                  />
                </div>
              </div>

              {/* 关联项目 */}
              {projects.length > 0 && (
                <div>
                  <label className="flex items-center gap-2 text-sm font-medium mb-2" style={{ color: 'var(--text-primary)' }}>
                    <Folder className="w-4 h-4" style={{ color: 'var(--text-muted)' }} />
                    关联项目（可选）
                  </label>
                  <select
                    value={projectId}
                    onChange={(e) => setProjectId(e.target.value ? Number(e.target.value) : '')}
                    className="w-full px-3 py-2 rounded-lg text-sm outline-none transition-colors"
                    style={{ 
                      backgroundColor: 'var(--bg-input)', 
                      border: '1px solid var(--border-color)',
                      color: 'var(--text-primary)'
                    }}
                  >
                    <option value="">不关联项目</option>
                    {projects.map((project) => (
                      <option key={project.id} value={project.id}>
                        {project.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* 提交按钮 */}
              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 rounded-lg text-sm font-medium transition-colors"
                  style={{ color: 'var(--text-muted)' }}
                >
                  取消
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-white transition-colors disabled:opacity-50"
                  style={{ backgroundColor: '#8b5cf6' }}
                >
                  {loading ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      发送中...
                    </>
                  ) : (
                    <>
                      <Send className="w-4 h-4" />
                      发送任务
                    </>
                  )}
                </button>
              </div>
            </form>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
};

export default TaskAssignmentModal;
