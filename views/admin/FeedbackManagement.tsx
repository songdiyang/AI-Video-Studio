import React, { useState, useEffect, useCallback } from 'react';
import { MessageSquare, Mail, Search, Filter, ChevronLeft, ChevronRight, X, Send, Megaphone, Eye, RefreshCw, Clock, CheckCircle, AlertCircle, XCircle } from 'lucide-react';
import { getAdminAuthHeaders } from '../../services/auth';

interface Feedback {
  id: number;
  user_id: number;
  user_email: string;
  type: 'bug' | 'feature' | 'improvement' | 'other';
  content: string;
  contact: string | null;
  status: 'pending' | 'reviewing' | 'resolved' | 'closed';
  admin_reply: string | null;
  created_at: string;
  updated_at: string;
}

const STATUS_MAP: Record<string, { label: string; color: string; bg: string; icon: React.ReactNode }> = {
  pending: { label: '待处理', color: '#f59e0b', bg: '#fef3c7', icon: <Clock className="w-3.5 h-3.5" /> },
  reviewing: { label: '审核中', color: '#3b82f6', bg: '#dbeafe', icon: <Eye className="w-3.5 h-3.5" /> },
  resolved: { label: '已解决', color: '#10b981', bg: '#d1fae5', icon: <CheckCircle className="w-3.5 h-3.5" /> },
  closed: { label: '已关闭', color: '#6b7280', bg: '#f3f4f6', icon: <XCircle className="w-3.5 h-3.5" /> },
};

const TYPE_MAP: Record<string, { label: string; color: string }> = {
  bug: { label: 'Bug反馈', color: '#ef4444' },
  feature: { label: '功能建议', color: '#8b5cf6' },
  improvement: { label: '体验优化', color: '#06b6d4' },
  other: { label: '其他反馈', color: '#6b7280' },
};

const FeedbackManagement: React.FC = () => {
  const [feedbacks, setFeedbacks] = useState<Feedback[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [filterStatus, setFilterStatus] = useState('');
  const [filterType, setFilterType] = useState('');
  const limit = 15;

  // Detail modal
  const [selectedFeedback, setSelectedFeedback] = useState<Feedback | null>(null);
  const [editStatus, setEditStatus] = useState('');
  const [editReply, setEditReply] = useState('');
  const [saving, setSaving] = useState(false);

  // Mail modal (站内信)
  const [mailModal, setMailModal] = useState<{ feedbackId: number; userId: number } | null>(null);
  const [mailTitle, setMailTitle] = useState('');
  const [mailContent, setMailContent] = useState('');
  const [sendingMail, setSendingMail] = useState(false);

  // Announce modal
  const [showAnnounce, setShowAnnounce] = useState(false);
  const [announceTitle, setAnnounceTitle] = useState('');
  const [announceContent, setAnnounceContent] = useState('');
  const [sendingAnnounce, setSendingAnnounce] = useState(false);

  const headers = useCallback(() => {
    return {
      'Content-Type': 'application/json',
      ...getAdminAuthHeaders(),
    };
  }, []);

  const fetchFeedbacks = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), limit: String(limit) });
      if (filterStatus) params.set('status', filterStatus);
      if (filterType) params.set('type', filterType);

      const res = await fetch(`/api/feedback/admin?${params}`, { headers: headers() });
      if (res.ok) {
        const data = await res.json();
        setFeedbacks(data.feedbacks || []);
        setTotal(data.total || 0);
      }
    } catch (err) {
      console.error('获取反馈列表失败:', err);
    } finally {
      setLoading(false);
    }
  }, [page, filterStatus, filterType, headers]);

  useEffect(() => { fetchFeedbacks(); }, [fetchFeedbacks]);

  const totalPages = Math.max(1, Math.ceil(total / limit));

  const handleSave = async () => {
    if (!selectedFeedback) return;
    setSaving(true);
    try {
      const body: Record<string, string> = {};
      if (editStatus && editStatus !== selectedFeedback.status) body.status = editStatus;
      if (editReply !== (selectedFeedback.admin_reply || '')) body.admin_reply = editReply;

      if (Object.keys(body).length === 0) { setSaving(false); return; }

      const res = await fetch(`/api/feedback/${selectedFeedback.id}`, {
        method: 'PATCH',
        headers: headers(),
        body: JSON.stringify(body),
      });
      if (res.ok) {
        setSelectedFeedback(null);
        fetchFeedbacks();
      }
    } catch (err) {
      console.error('更新反馈失败:', err);
    } finally {
      setSaving(false);
    }
  };

  const handleSendMail = async () => {
    if (!mailModal || !mailTitle.trim() || !mailContent.trim()) return;
    setSendingMail(true);
    try {
      const res = await fetch(`/api/feedback/admin/${mailModal.feedbackId}/mail`, {
        method: 'POST',
        headers: headers(),
        body: JSON.stringify({ title: mailTitle, content: mailContent }),
      });
      if (res.ok) {
        setMailModal(null);
        setMailTitle('');
        setMailContent('');
      } else {
        const data = await res.json();
        alert(data.error || '发送失败');
      }
    } catch (err) {
      console.error('发送站内信失败:', err);
    } finally {
      setSendingMail(false);
    }
  };

  const handleSendAnnounce = async () => {
    if (!announceTitle.trim() || !announceContent.trim()) return;
    setSendingAnnounce(true);
    try {
      const res = await fetch('/api/feedback/admin/announce', {
        method: 'POST',
        headers: headers(),
        body: JSON.stringify({ title: announceTitle, content: announceContent }),
      });
      const data = await res.json();
      if (res.ok) {
        alert(`公告已发送！成功: ${data.sent}, 共: ${data.total}`);
        setShowAnnounce(false);
        setAnnounceTitle('');
        setAnnounceContent('');
      } else {
        alert(data.error || '发送失败');
      }
    } catch (err) {
      console.error('群发公告失败:', err);
    } finally {
      setSendingAnnounce(false);
    }
  };

  const openDetail = (fb: Feedback) => {
    setSelectedFeedback(fb);
    setEditStatus(fb.status);
    setEditReply(fb.admin_reply || '');
  };

  return (
    <div className="p-6 min-h-screen">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-purple-100 rounded-xl">
            <MessageSquare className="w-6 h-6 text-purple-600" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-800">反馈管理</h1>
            <p className="text-sm text-slate-400">查看和管理用户反馈，发送站内信回复</p>
          </div>
        </div>
        <div className="flex gap-2">
          <button onClick={() => fetchFeedbacks()} className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 hover:bg-slate-50 rounded-xl text-sm text-slate-700 transition-all">
            <RefreshCw className="w-4 h-4" /> 刷新
          </button>
          <button onClick={() => setShowAnnounce(true)} className="flex items-center gap-2 px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white rounded-xl text-sm transition-all">
            <Megaphone className="w-4 h-4" /> 群发公告
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 mb-4">
        <div className="flex items-center gap-2 px-3 py-2 bg-white border border-slate-200 rounded-xl">
          <Filter className="w-4 h-4 text-slate-400" />
          <select
            value={filterStatus}
            onChange={e => { setFilterStatus(e.target.value); setPage(1); }}
            className="bg-transparent text-sm text-slate-600 outline-none cursor-pointer"
          >
            <option value="">全部状态</option>
            {Object.entries(STATUS_MAP).map(([k, v]) => (
              <option key={k} value={k}>{v.label}</option>
            ))}
          </select>
        </div>
        <div className="flex items-center gap-2 px-3 py-2 bg-white border border-slate-200 rounded-xl">
          <Search className="w-4 h-4 text-slate-400" />
          <select
            value={filterType}
            onChange={e => { setFilterType(e.target.value); setPage(1); }}
            className="bg-transparent text-sm text-slate-600 outline-none cursor-pointer"
          >
            <option value="">全部类型</option>
            {Object.entries(TYPE_MAP).map(([k, v]) => (
              <option key={k} value={k}>{v.label}</option>
            ))}
          </select>
        </div>
        <div className="ml-auto text-sm text-slate-400 flex items-center">
          共 {total} 条反馈
        </div>
      </div>

      {/* Table */}
      <div className="rounded-2xl overflow-hidden border border-slate-200 bg-white shadow-[0_18px_60px_rgba(15,23,42,0.05)]">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-100 text-slate-500 bg-slate-50/60">
              <th className="px-4 py-3 text-left font-medium">ID</th>
              <th className="px-4 py-3 text-left font-medium">用户邮箱</th>
              <th className="px-4 py-3 text-left font-medium">类型</th>
              <th className="px-4 py-3 text-left font-medium">内容摘要</th>
              <th className="px-4 py-3 text-left font-medium">联系方式</th>
              <th className="px-4 py-3 text-left font-medium">状态</th>
              <th className="px-4 py-3 text-left font-medium">提交时间</th>
              <th className="px-4 py-3 text-center font-medium">操作</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={8} className="text-center py-12 text-slate-400">加载中...</td></tr>
            ) : feedbacks.length === 0 ? (
              <tr><td colSpan={8} className="text-center py-12 text-slate-400">暂无反馈数据</td></tr>
            ) : feedbacks.map(fb => {
              const st = STATUS_MAP[fb.status] || STATUS_MAP.pending;
              const tp = TYPE_MAP[fb.type] || TYPE_MAP.other;
              return (
                <tr key={fb.id} className="border-b border-slate-100 hover:bg-slate-50/50 transition-colors">
                  <td className="px-4 py-3 text-slate-500">#{fb.id}</td>
                  <td className="px-4 py-3 text-slate-700 max-w-[160px] truncate">{fb.user_email || '-'}</td>
                  <td className="px-4 py-3">
                    <span className="px-2 py-0.5 rounded-full text-xs font-medium" style={{ color: tp.color, background: `${tp.color}15` }}>
                      {tp.label}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-slate-600 max-w-[240px] truncate">{fb.content}</td>
                  <td className="px-4 py-3 text-slate-500 max-w-[120px] truncate">{fb.contact || '-'}</td>
                  <td className="px-4 py-3">
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium" style={{ color: st.color, background: st.bg }}>
                      {st.icon}{st.label}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-slate-400 text-xs whitespace-nowrap">
                    {new Date(fb.created_at).toLocaleString('zh-CN')}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-center gap-1">
                      <button onClick={() => openDetail(fb)} className="p-1.5 hover:bg-slate-100 rounded-lg transition-colors" title="查看详情">
                        <Eye className="w-4 h-4 text-blue-500" />
                      </button>
                      <button
                        onClick={() => {
                          setMailModal({ feedbackId: fb.id, userId: fb.user_id });
                          setMailTitle(`关于您的反馈 #${fb.id} 的回复`);
                          setMailContent('');
                        }}
                        className="p-1.5 hover:bg-slate-100 rounded-lg transition-colors"
                        title="发送站内信"
                      >
                        <Mail className="w-4 h-4 text-emerald-500" />
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 mt-4">
          <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page <= 1} className="p-2 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg disabled:opacity-30 transition-all">
            <ChevronLeft className="w-4 h-4 text-slate-600" />
          </button>
          <span className="text-sm text-slate-500 px-3">{page} / {totalPages}</span>
          <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page >= totalPages} className="p-2 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg disabled:opacity-30 transition-all">
            <ChevronRight className="w-4 h-4 text-slate-600" />
          </button>
        </div>
      )}

      {/* Detail Modal */}
      {selectedFeedback && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={() => setSelectedFeedback(null)}>
          <div className="bg-white rounded-2xl w-full max-w-xl mx-4 max-h-[85vh] overflow-y-auto border border-slate-200 shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-5 border-b border-slate-100">
              <h2 className="text-lg font-bold text-slate-800">反馈详情 #{selectedFeedback.id}</h2>
              <button onClick={() => setSelectedFeedback(null)} className="p-1.5 hover:bg-slate-100 rounded-lg"><X className="w-5 h-5 text-slate-400" /></button>
            </div>
            <div className="p-5 space-y-4">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-slate-400">用户邮箱</span>
                  <p className="text-slate-700 mt-1">{selectedFeedback.user_email || '-'}</p>
                </div>
                <div>
                  <span className="text-slate-400">联系方式</span>
                  <p className="text-slate-700 mt-1">{selectedFeedback.contact || '-'}</p>
                </div>
                <div>
                  <span className="text-slate-400">反馈类型</span>
                  <p className="mt-1"><span className="px-2 py-0.5 rounded-full text-xs font-medium" style={{ color: (TYPE_MAP[selectedFeedback.type] || TYPE_MAP.other).color, background: `${(TYPE_MAP[selectedFeedback.type] || TYPE_MAP.other).color}15` }}>{(TYPE_MAP[selectedFeedback.type] || TYPE_MAP.other).label}</span></p>
                </div>
                <div>
                  <span className="text-slate-400">提交时间</span>
                  <p className="text-slate-700 mt-1 text-xs">{new Date(selectedFeedback.created_at).toLocaleString('zh-CN')}</p>
                </div>
              </div>

              <div>
                <span className="text-sm text-slate-400">反馈内容</span>
                <div className="mt-2 p-4 bg-slate-50 rounded-xl text-sm text-slate-700 whitespace-pre-wrap leading-relaxed max-h-48 overflow-y-auto border border-slate-100">
                  {selectedFeedback.content}
                </div>
              </div>

              <div>
                <span className="text-sm text-slate-400">处理状态</span>
                <div className="flex gap-2 mt-2">
                  {Object.entries(STATUS_MAP).map(([k, v]) => (
                    <button
                      key={k}
                      onClick={() => setEditStatus(k)}
                      className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium transition-all"
                      style={{
                        background: editStatus === k ? v.bg : '#f8fafc',
                        color: editStatus === k ? v.color : '#94a3b8',
                        border: editStatus === k ? `1px solid ${v.color}40` : '1px solid #e2e8f0',
                      }}
                    >
                      {v.icon}{v.label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <span className="text-sm text-slate-400">管理员回复</span>
                <textarea
                  value={editReply}
                  onChange={e => setEditReply(e.target.value)}
                  placeholder="输入回复内容..."
                  rows={3}
                  className="w-full mt-2 p-3 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-700 resize-none outline-none focus:border-purple-400 focus:ring-1 focus:ring-purple-200 transition-colors"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 p-5 border-t border-slate-100">
              <button onClick={() => setSelectedFeedback(null)} className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-xl text-sm transition-all">取消</button>
              <button onClick={handleSave} disabled={saving} className="px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white rounded-xl text-sm transition-all disabled:opacity-50">
                {saving ? '保存中...' : '保存修改'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Mail Modal (站内信) */}
      {mailModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={() => setMailModal(null)}>
          <div className="bg-white rounded-2xl w-full max-w-lg mx-4 border border-slate-200 shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-5 border-b border-slate-100">
              <div>
                <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2"><Mail className="w-5 h-5 text-emerald-500" />发送站内信</h2>
                <p className="text-xs text-slate-400 mt-1">消息将发送到用户的站内邮箱</p>
              </div>
              <button onClick={() => setMailModal(null)} className="p-1.5 hover:bg-slate-100 rounded-lg"><X className="w-5 h-5 text-slate-400" /></button>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <label className="text-sm text-slate-500 mb-1 block">消息标题</label>
                <input
                  value={mailTitle}
                  onChange={e => setMailTitle(e.target.value)}
                  className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-700 outline-none focus:border-emerald-400 focus:ring-1 focus:ring-emerald-200 transition-colors"
                />
              </div>
              <div>
                <label className="text-sm text-slate-500 mb-1 block">消息内容</label>
                <textarea
                  value={mailContent}
                  onChange={e => setMailContent(e.target.value)}
                  placeholder="输入消息内容..."
                  rows={5}
                  className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-700 resize-none outline-none focus:border-emerald-400 focus:ring-1 focus:ring-emerald-200 transition-colors"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 p-5 border-t border-slate-100">
              <button onClick={() => setMailModal(null)} className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-xl text-sm transition-all">取消</button>
              <button onClick={handleSendMail} disabled={sendingMail || !mailTitle.trim() || !mailContent.trim()} className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-sm transition-all disabled:opacity-50">
                <Send className="w-4 h-4" />{sendingMail ? '发送中...' : '发送站内信'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Announce Modal */}
      {showAnnounce && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={() => setShowAnnounce(false)}>
          <div className="bg-white rounded-2xl w-full max-w-lg mx-4 border border-slate-200 shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-5 border-b border-slate-100">
              <div>
                <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2"><Megaphone className="w-5 h-5 text-amber-500" />群发公告</h2>
                <p className="text-xs text-slate-400 mt-1">将发送到所有用户的站内邮箱</p>
              </div>
              <button onClick={() => setShowAnnounce(false)} className="p-1.5 hover:bg-slate-100 rounded-lg"><X className="w-5 h-5 text-slate-400" /></button>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <label className="text-sm text-slate-500 mb-1 block">公告标题</label>
                <input
                  value={announceTitle}
                  onChange={e => setAnnounceTitle(e.target.value)}
                  placeholder="如：系统维护通知、新功能上线..."
                  className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-700 outline-none focus:border-amber-400 focus:ring-1 focus:ring-amber-200 transition-colors"
                />
              </div>
              <div>
                <label className="text-sm text-slate-500 mb-1 block">公告内容</label>
                <textarea
                  value={announceContent}
                  onChange={e => setAnnounceContent(e.target.value)}
                  placeholder="输入公告内容..."
                  rows={6}
                  className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-700 resize-none outline-none focus:border-amber-400 focus:ring-1 focus:ring-amber-200 transition-colors"
                />
              </div>
              <div className="flex items-center gap-2 p-3 bg-amber-50 border border-amber-200 rounded-xl">
                <AlertCircle className="w-4 h-4 text-amber-500 shrink-0" />
                <p className="text-xs text-amber-700">注意：此操作将向所有用户的站内邮箱发送公告，请确认内容无误后再发送。</p>
              </div>
            </div>
            <div className="flex justify-end gap-2 p-5 border-t border-slate-100">
              <button onClick={() => setShowAnnounce(false)} className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-xl text-sm transition-all">取消</button>
              <button onClick={handleSendAnnounce} disabled={sendingAnnounce || !announceTitle.trim() || !announceContent.trim()} className="flex items-center gap-2 px-4 py-2 bg-amber-500 hover:bg-amber-400 text-white rounded-xl text-sm transition-all disabled:opacity-50">
                <Megaphone className="w-4 h-4" />{sendingAnnounce ? '发送中...' : '发送公告'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default FeedbackManagement;
