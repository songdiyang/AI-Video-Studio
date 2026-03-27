import React, { useState, useEffect, useCallback } from 'react';
import { Megaphone, Send, Clock, CheckCircle, AlertCircle, RefreshCw, Search, X, ChevronLeft, ChevronRight, Eye, Trash2 } from 'lucide-react';
import { getAdminAuthHeaders } from '../../services/auth';
import { useToast } from '../../contexts/ToastContext';

interface Announcement {
  id: number;
  title: string;
  content: string;
  sent_count: number;
  total_count: number;
  created_by: number;
  created_by_email: string;
  created_at: string;
}

const AnnouncementManagement: React.FC = () => {
  const { showToast } = useToast();
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const limit = 10;

  // 发布公告模态框
  const [showModal, setShowModal] = useState(false);
  const [announceTitle, setAnnounceTitle] = useState('');
  const [announceContent, setAnnounceContent] = useState('');
  const [sending, setSending] = useState(false);

  // 详情模态框
  const [detailModal, setDetailModal] = useState<Announcement | null>(null);

  // 删除确认
  const [deletingId, setDeletingId] = useState<number | null>(null);

  const headers = useCallback(() => {
    return {
      'Content-Type': 'application/json',
      ...getAdminAuthHeaders(),
    };
  }, []);

  // 获取公告历史列表
  const fetchAnnouncements = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), limit: String(limit) });
      if (searchQuery) params.set('q', searchQuery);

      const res = await fetch(`/api/feedback/admin/announcements?${params}`, { headers: headers() });
      if (res.ok) {
        const data = await res.json();
        setAnnouncements(data.announcements || []);
        setTotal(data.total || 0);
      }
    } catch (err) {
      console.error('获取公告列表失败:', err);
    } finally {
      setLoading(false);
    }
  }, [page, searchQuery, headers]);

  useEffect(() => { fetchAnnouncements(); }, [fetchAnnouncements]);

  const totalPages = Math.max(1, Math.ceil(total / limit));

  // 发送公告
  const handleSendAnnounce = async () => {
    if (!announceTitle.trim() || !announceContent.trim()) {
      showToast('请填写标题和内容', 'warning');
      return;
    }
    setSending(true);
    try {
      const res = await fetch('/api/feedback/admin/announce', {
        method: 'POST',
        headers: headers(),
        body: JSON.stringify({ title: announceTitle, content: announceContent }),
      });
      const data = await res.json();
      if (res.ok) {
        showToast(`公告已发送！成功: ${data.sent}, 共: ${data.total}`, 'success');
        setShowModal(false);
        setAnnounceTitle('');
        setAnnounceContent('');
        fetchAnnouncements(); // 刷新列表
      } else {
        showToast(data.error || '发送失败', 'error');
      }
    } catch (err) {
      console.error('群发公告失败:', err);
      showToast('群发公告失败，请稍后重试', 'error');
    } finally {
      setSending(false);
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  // 删除公告
  const handleDelete = async (id: number) => {
    if (!confirm('确定要删除这条公告吗？此操作不可恢复。')) return;
    
    try {
      const res = await fetch(`/api/feedback/admin/announcements/${id}`, {
        method: 'DELETE',
        headers: headers(),
      });
      
      if (res.ok) {
        showToast('公告已删除', 'success');
        fetchAnnouncements(); // 刷新列表
      } else {
        const data = await res.json();
        showToast(data.error || '删除失败', 'error');
      }
    } catch (err) {
      console.error('删除公告失败:', err);
      showToast('删除失败，请稍后重试', 'error');
    }
  };

  return (
    <div className="p-6 min-h-screen">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-amber-100 rounded-xl">
            <Megaphone className="w-6 h-6 text-amber-600" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-800">公告管理</h1>
            <p className="text-sm text-slate-400">发布公告并查看历史记录</p>
          </div>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => fetchAnnouncements()}
            className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 hover:bg-slate-50 rounded-xl text-sm text-slate-700 transition-all"
          >
            <RefreshCw className="w-4 h-4" /> 刷新
          </button>
          <button
            onClick={() => setShowModal(true)}
            className="flex items-center gap-2 px-4 py-2 bg-amber-500 hover:bg-amber-400 text-white rounded-xl text-sm transition-all"
          >
            <Send className="w-4 h-4" /> 发布公告
          </button>
        </div>
      </div>

      {/* 搜索栏 */}
      <div className="flex gap-3 mb-4">
        <div className="flex-1 flex items-center gap-2 px-3 py-2 bg-white border border-slate-200 rounded-xl">
          <Search className="w-4 h-4 text-slate-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="搜索公告标题..."
            className="flex-1 bg-transparent text-sm text-slate-700 outline-none"
          />
          {searchQuery && (
            <button onClick={() => setSearchQuery('')} className="p-1 hover:bg-slate-100 rounded">
              <X className="w-3 h-3 text-slate-400" />
            </button>
          )}
        </div>
      </div>

      {/* 公告列表 */}
      <div className="rounded-2xl overflow-hidden border border-slate-200 bg-white shadow-[0_18px_60px_rgba(15,23,42,0.05)]">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-100 text-slate-500 bg-slate-50/60">
              <th className="px-4 py-3 text-left font-medium">ID</th>
              <th className="px-4 py-3 text-left font-medium">公告标题</th>
              <th className="px-4 py-3 text-left font-medium">内容摘要</th>
              <th className="px-4 py-3 text-left font-medium">发送情况</th>
              <th className="px-4 py-3 text-left font-medium">发布人</th>
              <th className="px-4 py-3 text-left font-medium">发布时间</th>
              <th className="px-4 py-3 text-center font-medium">操作</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={6} className="text-center py-12 text-slate-400">
                  <div className="flex items-center justify-center gap-2">
                    <div className="w-5 h-5 border-2 border-slate-300 border-t-transparent rounded-full animate-spin" />
                    加载中...
                  </div>
                </td>
              </tr>
            ) : announcements.length === 0 ? (
              <tr>
                <td colSpan={6} className="text-center py-12 text-slate-400">
                  <div className="w-20 h-20 mx-auto bg-slate-50 rounded-full flex items-center justify-center mb-4">
                    <Megaphone className="w-10 h-10 text-slate-300" />
                  </div>
                  <p className="text-slate-500 font-medium">暂无公告记录</p>
                  <p className="text-slate-400 text-sm mt-1">点击右上角按钮发布公告</p>
                </td>
              </tr>
            ) : (
              announcements.map((item) => (
                <tr key={item.id} className="border-b border-slate-100 hover:bg-slate-50/50 transition-colors">
                  <td className="px-4 py-3 text-slate-500">#{item.id}</td>
                  <td className="px-4 py-3">
                    <div className="font-medium text-slate-700">{item.title}</div>
                  </td>
                  <td className="px-4 py-3 text-slate-600 max-w-[300px] truncate">
                    {item.content}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <CheckCircle className="w-4 h-4 text-emerald-500" />
                      <span className="text-sm text-slate-600">
                        {item.sent_count} / {item.total_count}
                      </span>
                      <span className="text-xs text-slate-400">
                        ({Math.round((item.sent_count / item.total_count) * 100)}%)
                      </span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-slate-600">{item.created_by_email || '-'}</td>
                  <td className="px-4 py-3 text-slate-400 text-xs whitespace-nowrap">
                    <div className="flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {formatDate(item.created_at)}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-center gap-1">
                      <button
                        onClick={() => setDetailModal(item)}
                        className="p-1.5 hover:bg-slate-100 rounded-lg transition-colors"
                        title="查看详情"
                      >
                        <Eye className="w-4 h-4 text-blue-500" />
                      </button>
                      <button
                        onClick={() => handleDelete(item.id)}
                        className="p-1.5 hover:bg-slate-100 rounded-lg transition-colors"
                        title="删除公告"
                      >
                        <Trash2 className="w-4 h-4 text-red-500" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* 分页 */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 mt-4">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page <= 1}
            className="p-2 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg disabled:opacity-30 transition-all"
          >
            <ChevronLeft className="w-4 h-4 text-slate-600" />
          </button>
          <span className="text-sm text-slate-500 px-3">
            {page} / {totalPages}
          </span>
          <button
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page >= totalPages}
            className="p-2 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg disabled:opacity-30 transition-all"
          >
            <ChevronRight className="w-4 h-4 text-slate-600" />
          </button>
        </div>
      )}

      {/* 发布公告模态框 */}
      {showModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
          onClick={() => setShowModal(false)}
        >
          <div
            className="bg-white rounded-2xl w-full max-w-lg mx-4 border border-slate-200 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between p-5 border-b border-slate-100">
              <div>
                <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                  <Megaphone className="w-5 h-5 text-amber-500" />
                  发布公告
                </h2>
                <p className="text-xs text-slate-400 mt-1">将发送到所有用户的站内邮箱</p>
              </div>
              <button
                onClick={() => setShowModal(false)}
                className="p-1.5 hover:bg-slate-100 rounded-lg"
              >
                <X className="w-5 h-5 text-slate-400" />
              </button>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <label className="text-sm text-slate-500 mb-1 block">公告标题</label>
                <input
                  value={announceTitle}
                  onChange={(e) => setAnnounceTitle(e.target.value)}
                  placeholder="如：系统维护通知、新功能上线..."
                  className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-700 outline-none focus:border-amber-400 focus:ring-1 focus:ring-amber-200 transition-colors"
                />
              </div>
              <div>
                <label className="text-sm text-slate-500 mb-1 block">公告内容</label>
                <textarea
                  value={announceContent}
                  onChange={(e) => setAnnounceContent(e.target.value)}
                  placeholder="输入公告内容..."
                  rows={6}
                  className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-700 resize-none outline-none focus:border-amber-400 focus:ring-1 focus:ring-amber-200 transition-colors"
                />
              </div>
              <div className="flex items-center gap-2 p-3 bg-amber-50 border border-amber-200 rounded-xl">
                <AlertCircle className="w-4 h-4 text-amber-500 shrink-0" />
                <p className="text-xs text-amber-700">
                  注意：此操作将向所有用户的站内邮箱发送公告，请确认内容无误后再发送。
                </p>
              </div>
            </div>
            <div className="flex justify-end gap-2 p-5 border-t border-slate-100">
              <button
                onClick={() => setShowModal(false)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-xl text-sm transition-all"
              >
                取消
              </button>
              <button
                onClick={handleSendAnnounce}
                disabled={sending || !announceTitle.trim() || !announceContent.trim()}
                className="flex items-center gap-2 px-4 py-2 bg-amber-500 hover:bg-amber-400 text-white rounded-xl text-sm transition-all disabled:opacity-50"
              >
                <Send className="w-4 h-4" />
                {sending ? '发送中...' : '发送公告'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 详情模态框 */}
      {detailModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
          onClick={() => setDetailModal(null)}
        >
          <div
            className="bg-white rounded-2xl w-full max-w-lg mx-4 border border-slate-200 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between p-5 border-b border-slate-100">
              <div>
                <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                  <Eye className="w-5 h-5 text-blue-500" />
                  公告详情
                </h2>
                <p className="text-xs text-slate-400 mt-1">ID: #{detailModal.id}</p>
              </div>
              <button
                onClick={() => setDetailModal(null)}
                className="p-1.5 hover:bg-slate-100 rounded-lg"
              >
                <X className="w-5 h-5 text-slate-400" />
              </button>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <label className="text-sm text-slate-500 mb-1 block">公告标题</label>
                <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-700">
                  {detailModal.title}
                </div>
              </div>
              <div>
                <label className="text-sm text-slate-500 mb-1 block">公告内容</label>
                <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-700 whitespace-pre-wrap max-h-60 overflow-y-auto">
                  {detailModal.content}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm text-slate-500 mb-1 block">发送情况</label>
                  <div className="flex items-center gap-2 p-3 bg-slate-50 border border-slate-200 rounded-xl">
                    <CheckCircle className="w-4 h-4 text-emerald-500" />
                    <span className="text-sm text-slate-700">
                      {detailModal.sent_count} / {detailModal.total_count}
                    </span>
                    <span className="text-xs text-slate-400">
                      ({Math.round((detailModal.sent_count / detailModal.total_count) * 100)}%)
                    </span>
                  </div>
                </div>
                <div>
                  <label className="text-sm text-slate-500 mb-1 block">发布人</label>
                  <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-700">
                    {detailModal.created_by_email || '-'}
                  </div>
                </div>
              </div>
              <div>
                <label className="text-sm text-slate-500 mb-1 block">发布时间</label>
                <div className="flex items-center gap-2 p-3 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-700">
                  <Clock className="w-4 h-4 text-slate-400" />
                  {formatDate(detailModal.created_at)}
                </div>
              </div>
            </div>
            <div className="flex justify-end gap-2 p-5 border-t border-slate-100">
              <button
                onClick={() => setDetailModal(null)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-xl text-sm transition-all"
              >
                关闭
              </button>
              <button
                onClick={() => {
                  setDetailModal(null);
                  handleDelete(detailModal.id);
                }}
                className="flex items-center gap-2 px-4 py-2 bg-red-500 hover:bg-red-400 text-white rounded-xl text-sm transition-all"
              >
                <Trash2 className="w-4 h-4" />
                删除公告
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AnnouncementManagement;
