import React, { useState, useEffect, useCallback, useRef } from 'react';
import ReactDOM from 'react-dom';
import { Mail, X, Check, CheckCheck, Trash2, MessageSquare, Megaphone, Bell, ChevronLeft, ClipboardList, Clock, Flag, ExternalLink, CheckCircle, XCircle } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { getAuthToken } from '../services/auth';

interface TaskData {
  taskId: number;
  title: string;
  description: string;
  priority: 'low' | 'medium' | 'high' | 'urgent';
  priorityLabel: string;
  deadline: string | null;
  teamId: number;
  teamName: string;
  projectId: number | null;
  projectName: string | null;
  storyboardId: number | null;
  storyboardInfo: { id: number; scene_number: number } | null;
}

interface InternalMail {
  id: number;
  sender_type: 'system' | 'admin';
  title: string;
  content: string;
  mail_type: 'reply' | 'announce' | 'system' | 'task';
  related_feedback_id: number | null;
  related_task_id: number | null;
  is_read: number;
  created_at: string;
}

const MAIL_TYPE_CONFIG: Record<string, { label: string; icon: React.ReactNode; color: string }> = {
  reply: { label: '反馈回复', icon: <MessageSquare className="w-3.5 h-3.5" />, color: 'var(--accent-primary)' },
  announce: { label: '系统公告', icon: <Megaphone className="w-3.5 h-3.5" />, color: '#f59e0b' },
  system: { label: '系统通知', icon: <Bell className="w-3.5 h-3.5" />, color: '#10b981' },
  task: { label: '任务指派', icon: <ClipboardList className="w-3.5 h-3.5" />, color: '#8b5cf6' },
};

const PRIORITY_CONFIG: Record<string, { label: string; color: string; bgColor: string }> = {
  low: { label: '低', color: '#10b981', bgColor: '#10b98118' },
  medium: { label: '中', color: '#3b82f6', bgColor: '#3b82f618' },
  high: { label: '高', color: '#f59e0b', bgColor: '#f59e0b18' },
  urgent: { label: '紧急', color: '#ef4444', bgColor: '#ef444418' },
};

const InternalMailbox: React.FC = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [mails, setMails] = useState<InternalMail[]>([]);
  const [total, setTotal] = useState(0);
  const [unreadCount, setUnreadCount] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [selectedMail, setSelectedMail] = useState<InternalMail | null>(null);
  const [taskStatus, setTaskStatus] = useState<Record<number, string>>({});
  const [taskLoading, setTaskLoading] = useState<number | null>(null);
  const [panelPosition, setPanelPosition] = useState<{ x: number; y: number }>({ x: 200, y: 60 });
  const panelRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const dragState = useRef<{ startX: number; startY: number; origX: number; origY: number } | null>(null);
  const limit = 20;

  const headers = useCallback(() => {
    const token = getAuthToken();
    return {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    };
  }, []);

  const fetchUnreadCount = useCallback(async () => {
    const token = getAuthToken();
    if (!token) return; // 未登录时不获取
    try {
      const res = await fetch('/api/mail/unread-count', { headers: headers() });
      if (res.ok) {
        const data = await res.json();
        setUnreadCount(data.count || 0);
      }
    } catch { /* ignore */ }
  }, [headers]);

  const fetchMails = useCallback(async () => {
    const token = getAuthToken();
    if (!token) return; // 未登录时不获取
    setLoading(true);
    try {
      const res = await fetch(`/api/mail?page=${page}&limit=${limit}`, { headers: headers() });
      if (res.ok) {
        const data = await res.json();
        setMails(data.mails || []);
        setTotal(data.total || 0);
      }
    } catch (err) {
      console.error('获取站内信失败:', err);
    } finally {
      setLoading(false);
    }
  }, [page, headers]);

  // Poll unread count every 30s
  useEffect(() => {
    fetchUnreadCount();
    const interval = setInterval(fetchUnreadCount, 30000);
    return () => clearInterval(interval);
  }, [fetchUnreadCount]);

  // Fetch mails when panel opens
  useEffect(() => {
    if (isOpen) {
      fetchMails();
    }
  }, [isOpen, fetchMails]);



  // Click outside to close
  useEffect(() => {
    if (!isOpen) return;
    const handleClick = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setIsOpen(false);
        setSelectedMail(null);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [isOpen]);

  const markAsRead = async (mailId: number) => {
    try {
      await fetch(`/api/mail/${mailId}/read`, { method: 'PATCH', headers: headers() });
      setMails(prev => prev.map(m => m.id === mailId ? { ...m, is_read: 1 } : m));
      setUnreadCount(prev => Math.max(0, prev - 1));
    } catch { /* ignore */ }
  };

  const markAllRead = async () => {
    try {
      await fetch('/api/mail/read-all', { method: 'PATCH', headers: headers() });
      setMails(prev => prev.map(m => ({ ...m, is_read: 1 })));
      setUnreadCount(0);
    } catch { /* ignore */ }
  };

  const deleteMail = async (mailId: number) => {
    try {
      await fetch(`/api/mail/${mailId}`, { method: 'DELETE', headers: headers() });
      const wasUnread = mails.find(m => m.id === mailId)?.is_read === 0;
      setMails(prev => prev.filter(m => m.id !== mailId));
      setTotal(prev => prev - 1);
      if (wasUnread) setUnreadCount(prev => Math.max(0, prev - 1));
      if (selectedMail?.id === mailId) setSelectedMail(null);
    } catch { /* ignore */ }
  };

  const openMail = (mail: InternalMail) => {
    setSelectedMail(mail);
    if (!mail.is_read) markAsRead(mail.id);
  };

  // 解析任务数据
  const parseTaskData = (content: string): TaskData | null => {
    try {
      return JSON.parse(content);
    } catch {
      return null;
    }
  };

  // 接受任务
  const acceptTask = async (taskId: number) => {
    setTaskLoading(taskId);
    try {
      const res = await fetch(`/api/tasks/${taskId}/accept`, { 
        method: 'PATCH', 
        headers: headers() 
      });
      if (res.ok) {
        setTaskStatus(prev => ({ ...prev, [taskId]: 'accepted' }));
      } else {
        const data = await res.json();
        alert(data.error || '接受任务失败');
      }
    } catch (err) {
      console.error('接受任务失败:', err);
      alert('接受任务失败');
    } finally {
      setTaskLoading(null);
    }
  };

  // 拒绝任务
  const rejectTask = async (taskId: number) => {
    const reason = prompt('请输入拒绝原因（可选）：');
    if (reason === null) return; // 用户取消

    setTaskLoading(taskId);
    try {
      const res = await fetch(`/api/tasks/${taskId}/reject`, { 
        method: 'PATCH', 
        headers: headers(),
        body: JSON.stringify({ reason })
      });
      if (res.ok) {
        setTaskStatus(prev => ({ ...prev, [taskId]: 'rejected' }));
      } else {
        const data = await res.json();
        alert(data.error || '拒绝任务失败');
      }
    } catch (err) {
      console.error('拒绝任务失败:', err);
      alert('拒绝任务失败');
    } finally {
      setTaskLoading(null);
    }
  };

  // 格式化截止时间
  const formatDeadline = (deadline: string | null) => {
    if (!deadline) return null;
    const d = new Date(deadline);
    const now = new Date();
    const diff = d.getTime() - now.getTime();
    const isOverdue = diff < 0;
    const days = Math.abs(Math.floor(diff / 86400000));
    
    return {
      text: d.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }),
      isOverdue,
      urgency: isOverdue ? '已逾期' : days === 0 ? '今天截止' : days <= 3 ? `${days}天后` : null
    };
  };

  const totalPages = Math.max(1, Math.ceil(total / limit));

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

  // Drag handlers
  const onDragStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    const panel = panelRef.current;
    if (!panel) return;
    const rect = panel.getBoundingClientRect();
    dragState.current = { startX: e.clientX, startY: e.clientY, origX: rect.left, origY: rect.top };

    const onMove = (ev: MouseEvent) => {
      if (!dragState.current) return;
      const dx = ev.clientX - dragState.current.startX;
      const dy = ev.clientY - dragState.current.startY;
      setPanelPosition({
        x: Math.max(0, Math.min(window.innerWidth - 380, dragState.current.origX + dx)),
        y: Math.max(0, Math.min(window.innerHeight - 100, dragState.current.origY + dy)),
      });
    };
    const onUp = () => {
      dragState.current = null;
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }, []);

  const panelContent = (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Overlay to capture clicks outside */}
          <div
            className="fixed inset-0 z-9998"
            onClick={() => { setIsOpen(false); setSelectedMail(null); }}
          />
          <motion.div
            ref={panelRef}
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.96 }}
            transition={{ duration: 0.2 }}
            className="fixed w-95 max-h-130 rounded-2xl overflow-hidden shadow-2xl z-9999 flex flex-col"
            style={{
              top: panelPosition.y,
              left: panelPosition.x,
              backgroundColor: 'var(--bg-card)',
              border: '1px solid var(--border-color)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div
              className="flex items-center justify-between px-4 py-3 select-none cursor-move"
              style={{ borderBottom: '1px solid var(--border-color)' }}
              onMouseDown={onDragStart}
            >
              {selectedMail ? (
                <button onClick={() => setSelectedMail(null)} className="flex items-center gap-2 text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                  <ChevronLeft className="w-4 h-4" /> 返回列表
                </button>
              ) : (
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>站内信</span>
                  {unreadCount > 0 && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded-full font-medium" style={{ backgroundColor: 'var(--accent-primary)', color: 'white' }}>
                      {unreadCount} 未读
                    </span>
                  )}
                </div>
              )}
              <div className="flex items-center gap-1">
                {!selectedMail && unreadCount > 0 && (
                  <button onClick={markAllRead} className="p-1.5 rounded-lg hover:bg-(--bg-input) transition-colors" title="全部已读">
                    <CheckCheck className="w-4 h-4" style={{ color: 'var(--text-muted)' }} />
                  </button>
                )}
                <button onClick={() => { setIsOpen(false); setSelectedMail(null); }} className="p-1.5 rounded-lg hover:bg-(--bg-input) transition-colors">
                  <X className="w-4 h-4" style={{ color: 'var(--text-muted)' }} />
                </button>
              </div>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto" style={{ maxHeight: '420px' }}>
              <AnimatePresence mode="wait">
                {selectedMail ? (
                  /* Detail View */
                  <motion.div
                    key="detail"
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -20 }}
                    className="p-4"
                  >
                    <div className="flex items-center gap-2 mb-3">
                      {(() => {
                        const cfg = MAIL_TYPE_CONFIG[selectedMail.mail_type] || MAIL_TYPE_CONFIG.system;
                        return (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium" style={{ color: cfg.color, backgroundColor: `${cfg.color}18` }}>
                            {cfg.icon}{cfg.label}
                          </span>
                        );
                      })()}
                      <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
                        {formatTime(selectedMail.created_at)}
                      </span>
                    </div>
                    <h3 className="text-base font-semibold mb-3" style={{ color: 'var(--text-primary)' }}>
                      {selectedMail.title}
                    </h3>
                    
                    {/* 任务类型特殊展示 */}
                    {selectedMail.mail_type === 'task' ? (
                      (() => {
                        const taskData = parseTaskData(selectedMail.content);
                        if (!taskData) {
                          return <div className="text-sm" style={{ color: 'var(--text-secondary)' }}>无法解析任务数据</div>;
                        }
                        const deadline = formatDeadline(taskData.deadline);
                        const priorityCfg = PRIORITY_CONFIG[taskData.priority] || PRIORITY_CONFIG.medium;
                        const currentStatus = taskStatus[taskData.taskId];
                        
                        return (
                          <div className="space-y-4">
                            {/* 任务信息卡片 */}
                            <div className="p-3 rounded-lg" style={{ backgroundColor: 'var(--bg-input)' }}>
                              {/* 优先级和截止时间 */}
                              <div className="flex items-center gap-3 mb-3">
                                <span 
                                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium"
                                  style={{ color: priorityCfg.color, backgroundColor: priorityCfg.bgColor }}
                                >
                                  <Flag className="w-3 h-3" />
                                  {priorityCfg.label}优先级
                                </span>
                                {deadline && (
                                  <span 
                                    className="inline-flex items-center gap-1 text-[10px]"
                                    style={{ color: deadline.isOverdue ? '#ef4444' : 'var(--text-muted)' }}
                                  >
                                    <Clock className="w-3 h-3" />
                                    {deadline.text}
                                    {deadline.urgency && (
                                      <span className="font-medium" style={{ color: deadline.isOverdue ? '#ef4444' : '#f59e0b' }}>
                                        ({deadline.urgency})
                                      </span>
                                    )}
                                  </span>
                                )}
                              </div>
                              
                              {/* 任务描述 */}
                              {taskData.description && (
                                <div className="text-sm leading-relaxed mb-3" style={{ color: 'var(--text-secondary)' }}>
                                  {taskData.description}
                                </div>
                              )}
                              
                              {/* 关联信息 */}
                              <div className="flex flex-wrap gap-2 text-[10px]" style={{ color: 'var(--text-muted)' }}>
                                <span>团队: {taskData.teamName}</span>
                                {taskData.projectName && (
                                  <span className="inline-flex items-center gap-0.5">
                                    项目: 
                                    <a 
                                      href={`/#/projects/${taskData.projectId}`} 
                                      className="hover:underline"
                                      style={{ color: 'var(--accent-primary)' }}
                                      onClick={(e) => e.stopPropagation()}
                                    >
                                      {taskData.projectName}
                                      <ExternalLink className="w-2.5 h-2.5 inline ml-0.5" />
                                    </a>
                                  </span>
                                )}
                                {taskData.storyboardInfo && (
                                  <span className="inline-flex items-center gap-0.5">
                                    分镜: 
                                    <a 
                                      href={`/#/projects/${taskData.projectId}/storyboard/${taskData.storyboardId}`}
                                      className="hover:underline"
                                      style={{ color: 'var(--accent-primary)' }}
                                      onClick={(e) => e.stopPropagation()}
                                    >
                                      第{taskData.storyboardInfo.scene_number}场
                                      <ExternalLink className="w-2.5 h-2.5 inline ml-0.5" />
                                    </a>
                                  </span>
                                )}
                              </div>
                            </div>
                            
                            {/* 任务状态和操作按钮 */}
                            <div className="flex items-center justify-between pt-3" style={{ borderTop: '1px solid var(--border-color)' }}>
                              {currentStatus === 'accepted' ? (
                                <span className="inline-flex items-center gap-1 text-xs font-medium" style={{ color: '#10b981' }}>
                                  <CheckCircle className="w-4 h-4" /> 已接受任务
                                </span>
                              ) : currentStatus === 'rejected' ? (
                                <span className="inline-flex items-center gap-1 text-xs font-medium" style={{ color: '#ef4444' }}>
                                  <XCircle className="w-4 h-4" /> 已拒绝任务
                                </span>
                              ) : (
                                <div className="flex gap-2">
                                  <button
                                    onClick={() => acceptTask(taskData.taskId)}
                                    disabled={taskLoading === taskData.taskId}
                                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-white transition-colors disabled:opacity-50"
                                    style={{ backgroundColor: '#10b981' }}
                                  >
                                    <CheckCircle className="w-3.5 h-3.5" />
                                    {taskLoading === taskData.taskId ? '处理中...' : '接受任务'}
                                  </button>
                                  <button
                                    onClick={() => rejectTask(taskData.taskId)}
                                    disabled={taskLoading === taskData.taskId}
                                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors hover:bg-red-500/10 disabled:opacity-50"
                                    style={{ color: '#ef4444' }}
                                  >
                                    <XCircle className="w-3.5 h-3.5" /> 拒绝
                                  </button>
                                </div>
                              )}
                              <button
                                onClick={() => deleteMail(selectedMail.id)}
                                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs text-red-400 hover:bg-red-500/10 transition-colors"
                              >
                                <Trash2 className="w-3.5 h-3.5" /> 删除
                              </button>
                            </div>
                          </div>
                        );
                      })()
                    ) : (
                      /* 普通消息展示 */
                      <>
                        <div className="text-sm leading-relaxed whitespace-pre-wrap" style={{ color: 'var(--text-secondary)' }}>
                          {selectedMail.content}
                        </div>
                        <div className="mt-4 pt-3 flex justify-end" style={{ borderTop: '1px solid var(--border-color)' }}>
                          <button
                            onClick={() => deleteMail(selectedMail.id)}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs text-red-400 hover:bg-red-500/10 transition-colors"
                          >
                            <Trash2 className="w-3.5 h-3.5" /> 删除
                          </button>
                        </div>
                      </>
                    )}
                  </motion.div>
                ) : (
                  /* List View */
                  <motion.div
                    key="list"
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 20 }}
                  >
                    {loading ? (
                      <div className="py-12 text-center text-sm" style={{ color: 'var(--text-muted)' }}>加载中...</div>
                    ) : mails.length === 0 ? (
                      <div className="py-12 text-center">
                        <Mail className="w-10 h-10 mx-auto mb-3" style={{ color: 'var(--text-muted)', opacity: 0.3 }} />
                        <p className="text-sm" style={{ color: 'var(--text-muted)' }}>暂无站内信</p>
                      </div>
                    ) : (
                      <>
                        {mails.map(mail => {
                          const cfg = MAIL_TYPE_CONFIG[mail.mail_type] || MAIL_TYPE_CONFIG.system;
                          return (
                            <div
                              key={mail.id}
                              onClick={() => openMail(mail)}
                              className="w-full text-left px-4 py-3 transition-colors hover:bg-(--bg-input) flex gap-3 items-start cursor-pointer"
                              style={{ borderBottom: '1px solid var(--border-color)', opacity: mail.is_read ? 0.7 : 1 }}
                            >
                              {/* Unread dot */}
                              <div className="mt-1.5 shrink-0">
                                {!mail.is_read ? (
                                  <span className="block w-2 h-2 rounded-full bg-(--accent-primary)" />
                                ) : (
                                  <span className="block w-2 h-2 rounded-full" style={{ backgroundColor: 'var(--border-color)' }} />
                                )}
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 mb-1">
                                  <span className="inline-flex items-center gap-0.5 text-[10px] font-medium" style={{ color: cfg.color }}>
                                    {cfg.icon}
                                  </span>
                                  <span className={`text-sm truncate ${!mail.is_read ? 'font-semibold' : 'font-normal'}`} style={{ color: 'var(--text-primary)' }}>
                                    {mail.title}
                                  </span>
                                </div>
                                <p className="text-xs truncate" style={{ color: 'var(--text-muted)' }}>
                                  {mail.content}
                                </p>
                                <span className="text-[10px] mt-1 block" style={{ color: 'var(--text-muted)' }}>
                                  {formatTime(mail.created_at)}
                                </span>
                              </div>
                              <button
                                onClick={e => { e.stopPropagation(); deleteMail(mail.id); }}
                                className="p-1 rounded hover:bg-red-500/10 transition-colors shrink-0 mt-1"
                                title="删除"
                              >
                                <Trash2 className="w-3.5 h-3.5 text-red-400/60 hover:text-red-400" />
                              </button>
                            </div>
                          );
                        })}
                        {/* Pagination */}
                        {totalPages > 1 && (
                          <div className="flex items-center justify-center gap-3 py-3">
                            <button
                              onClick={() => setPage(p => Math.max(1, p - 1))}
                              disabled={page <= 1}
                              className="text-xs px-2 py-1 rounded disabled:opacity-30"
                              style={{ color: 'var(--text-muted)' }}
                            >
                              上一页
                            </button>
                            <span className="text-xs" style={{ color: 'var(--text-muted)' }}>{page}/{totalPages}</span>
                            <button
                              onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                              disabled={page >= totalPages}
                              className="text-xs px-2 py-1 rounded disabled:opacity-30"
                              style={{ color: 'var(--text-muted)' }}
                            >
                              下一页
                            </button>
                          </div>
                        )}
                      </>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </motion.div>
          </>
        )}
      </AnimatePresence>
  );

  return (
    <>
      {/* Trigger Button */}
      <button
        ref={triggerRef}
        onClick={() => {
          if (!isOpen && triggerRef.current) {
            const rect = triggerRef.current.getBoundingClientRect();
            setPanelPosition({
              y: rect.bottom + 8,
              x: Math.max(8, rect.left - 150),
            });
          }
          setIsOpen(!isOpen);
          setSelectedMail(null);
        }}
        className="relative p-1.5 rounded-lg text-(--text-muted) hover:text-(--text-primary) hover:bg-white/5 transition-colors"
        aria-label="站内信"
        title="站内信"
      >
        <Mail className="w-4 h-4" />
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-4 h-4 px-1 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center leading-none">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {/* Portal: render panel at document.body to avoid stacking context issues */}
      {ReactDOM.createPortal(panelContent, document.body)}
    </>
  );
};

export default InternalMailbox;
