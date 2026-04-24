import React, { useState, useEffect, useCallback } from 'react';
import { getAdminLogs, getAdminLogActions, getAdminLogTargetTypes, type AdminLog } from '../../services/admin';
import { useToast } from '../../contexts/ToastContext';
import {
  Clock, Filter, Search, ChevronLeft, ChevronRight,
  User, ArrowRightCircle, Target, FileText, Hash, RefreshCw
} from 'lucide-react';

const ACTION_LABELS: Record<string, string> = {
  login: '登录',
  create: '创建',
  update: '更新',
  delete: '删除',
  toggle: '切换状态',
  adjust_points: '调整积分',
};

const ACTION_COLORS: Record<string, string> = {
  login: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
  create: 'bg-green-500/10 text-green-400 border-green-500/20',
  update: 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20',
  delete: 'bg-red-500/10 text-red-400 border-red-500/20',
  toggle: 'bg-purple-500/10 text-purple-400 border-purple-500/20',
  adjust_points: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
};

const AdminLogPage: React.FC = () => {
  const { showToast } = useToast();
  const [logs, setLogs] = useState<AdminLog[]>([]);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [limit] = useState(20);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);

  const [actions, setActions] = useState<string[]>([]);
  const [targetTypes, setTargetTypes] = useState<string[]>([]);

  const [search, setSearch] = useState('');
  const [actionFilter, setActionFilter] = useState('');
  const [targetTypeFilter, setTargetTypeFilter] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    try {
      const result = await getAdminLogs({
        page,
        limit,
        action: actionFilter || undefined,
        targetType: targetTypeFilter || undefined,
        startDate: startDate || undefined,
        endDate: endDate || undefined,
        search: search || undefined,
      });
      setLogs(result.logs);
      setTotal(result.pagination.total);
      setTotalPages(result.pagination.totalPages);
    } catch (err: any) {
      showToast(err.message || '获取日志失败', 'error');
    } finally {
      setLoading(false);
    }
  }, [page, limit, actionFilter, targetTypeFilter, startDate, endDate, search, showToast]);

  const fetchFilters = useCallback(async () => {
    try {
      const [a, t] = await Promise.all([getAdminLogActions(), getAdminLogTargetTypes()]);
      setActions(a);
      setTargetTypes(t);
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  useEffect(() => {
    fetchFilters();
  }, [fetchFilters]);

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr);
    return d.toLocaleString('zh-CN', {
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit'
    });
  };

  const handleSearch = () => {
    setPage(1);
    fetchLogs();
  };

  const handleReset = () => {
    setSearch('');
    setActionFilter('');
    setTargetTypeFilter('');
    setStartDate('');
    setEndDate('');
    setPage(1);
    fetchLogs();
  };

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* 头部 */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-[var(--text-primary)]">操作日志</h1>
        <p className="text-sm text-[var(--text-muted)] mt-1">记录所有管理员的操作行为，便于审计和追溯</p>
      </div>

      {/* 筛选栏 */}
      <div className="bg-[var(--bg-card)] border border-[var(--border-color)] rounded-xl p-4 mb-6">
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex-1 min-w-[200px]">
            <label className="text-xs text-[var(--text-muted)] mb-1 block">关键词搜索</label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-muted)]" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                placeholder="搜索操作人、对象..."
                className="w-full pl-9 pr-3 py-2 rounded-lg bg-[var(--bg-app)] border border-[var(--border-color)] text-sm text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent)]"
              />
            </div>
          </div>

          <div className="w-36">
            <label className="text-xs text-[var(--text-muted)] mb-1 block">操作类型</label>
            <select
              value={actionFilter}
              onChange={(e) => { setActionFilter(e.target.value); setPage(1); }}
              className="w-full px-3 py-2 rounded-lg bg-[var(--bg-app)] border border-[var(--border-color)] text-sm text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent)]"
            >
              <option value="">全部类型</option>
              {actions.map(a => (
                <option key={a} value={a}>{ACTION_LABELS[a] || a}</option>
              ))}
            </select>
          </div>

          <div className="w-36">
            <label className="text-xs text-[var(--text-muted)] mb-1 block">目标类型</label>
            <select
              value={targetTypeFilter}
              onChange={(e) => { setTargetTypeFilter(e.target.value); setPage(1); }}
              className="w-full px-3 py-2 rounded-lg bg-[var(--bg-app)] border border-[var(--border-color)] text-sm text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent)]"
            >
              <option value="">全部目标</option>
              {targetTypes.map(t => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </div>

          <div className="w-40">
            <label className="text-xs text-[var(--text-muted)] mb-1 block">开始日期</label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => { setStartDate(e.target.value); setPage(1); }}
              className="w-full px-3 py-2 rounded-lg bg-[var(--bg-app)] border border-[var(--border-color)] text-sm text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent)]"
            />
          </div>

          <div className="w-40">
            <label className="text-xs text-[var(--text-muted)] mb-1 block">结束日期</label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => { setEndDate(e.target.value); setPage(1); }}
              className="w-full px-3 py-2 rounded-lg bg-[var(--bg-app)] border border-[var(--border-color)] text-sm text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent)]"
            />
          </div>

          <div className="flex gap-2">
            <button
              onClick={handleSearch}
              className="px-4 py-2 rounded-lg bg-[var(--accent)] text-white text-sm font-medium hover:opacity-90 transition-opacity"
            >
              搜索
            </button>
            <button
              onClick={handleReset}
              className="px-4 py-2 rounded-lg bg-[var(--bg-app)] border border-[var(--border-color)] text-[var(--text-secondary)] text-sm hover:bg-[var(--bg-elevated)] transition-colors"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* 日志列表 */}
      <div className="bg-[var(--bg-card)] border border-[var(--border-color)] rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--border-color)] bg-[var(--bg-app)]/50">
                <th className="px-4 py-3 text-left text-[var(--text-muted)] font-medium">ID</th>
                <th className="px-4 py-3 text-left text-[var(--text-muted)] font-medium">操作人</th>
                <th className="px-4 py-3 text-left text-[var(--text-muted)] font-medium">操作类型</th>
                <th className="px-4 py-3 text-left text-[var(--text-muted)] font-medium">操作对象</th>
                <th className="px-4 py-3 text-left text-[var(--text-muted)] font-medium">详情</th>
                <th className="px-4 py-3 text-left text-[var(--text-muted)] font-medium">IP地址</th>
                <th className="px-4 py-3 text-left text-[var(--text-muted)] font-medium">操作时间</th>
              </tr>
            </thead>
            <tbody>
              {loading && logs.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center text-[var(--text-muted)]">
                    加载中...
                  </td>
                </tr>
              ) : logs.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center text-[var(--text-muted)]">
                    暂无操作日志
                  </td>
                </tr>
              ) : (
                logs.map((log) => (
                  <tr
                    key={log.id}
                    className="border-b border-[var(--border-color)] hover:bg-[var(--bg-app)]/30 transition-colors"
                  >
                    <td className="px-4 py-3 text-[var(--text-secondary)] font-mono text-xs">#{log.id}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <User className="w-3.5 h-3.5 text-[var(--text-muted)]" />
                        <div>
                          <div className="text-[var(--text-primary)] text-sm">{log.admin_email}</div>
                          {log.admin_employee_id && (
                            <div className="text-[var(--text-muted)] text-xs flex items-center gap-1">
                              <Hash className="w-3 h-3" />
                              {log.admin_employee_id}
                            </div>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium border ${ACTION_COLORS[log.action] || 'bg-gray-500/10 text-gray-400 border-gray-500/20'}`}>
                        <ArrowRightCircle className="w-3 h-3" />
                        {ACTION_LABELS[log.action] || log.action}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {log.target_type && (
                        <div className="flex items-center gap-1.5">
                          <Target className="w-3.5 h-3.5 text-[var(--text-muted)]" />
                          <span className="text-[var(--text-secondary)] text-xs">{log.target_type}</span>
                          {log.target_id && (
                            <span className="text-[var(--text-muted)] text-xs">#{log.target_id}</span>
                          )}
                          {log.target_name && (
                            <span className="text-[var(--text-primary)] text-xs ml-1">{log.target_name}</span>
                          )}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {log.details ? (
                        <div className="text-xs text-[var(--text-secondary)] max-w-[200px] truncate" title={JSON.stringify(log.details)}>
                          <FileText className="w-3 h-3 inline mr-1" />
                          {JSON.stringify(log.details)}
                        </div>
                      ) : (
                        <span className="text-[var(--text-muted)] text-xs">-</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-[var(--text-secondary)] text-xs font-mono">{log.ip_address || '-'}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5 text-[var(--text-secondary)] text-xs">
                        <Clock className="w-3.5 h-3.5" />
                        {formatDate(log.created_at)}
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
          <div className="flex items-center justify-between px-4 py-3 border-t border-[var(--border-color)]">
            <div className="text-xs text-[var(--text-muted)]">
              共 {total} 条记录，第 {page} / {totalPages} 页
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page <= 1}
                className="px-3 py-1.5 rounded-lg border border-[var(--border-color)] text-sm text-[var(--text-secondary)] disabled:opacity-40 hover:bg-[var(--bg-app)] transition-colors"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="text-sm text-[var(--text-secondary)]">{page}</span>
              <button
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
                className="px-3 py-1.5 rounded-lg border border-[var(--border-color)] text-sm text-[var(--text-secondary)] disabled:opacity-40 hover:bg-[var(--bg-app)] transition-colors"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default AdminLogPage;
