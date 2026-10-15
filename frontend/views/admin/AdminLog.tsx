import React, { useState, useEffect, useCallback } from 'react';
import { getAdminLogs, getAdminLogActions, getAdminLogTargetTypes, type AdminLog } from '../../services/admin';
import { useToast } from '../../contexts/ToastContext';
import {
  Clock, Filter, Search, ChevronLeft, ChevronRight,
  User, ArrowRightCircle, Target, FileText, Hash, RefreshCw
} from 'lucide-react';

const ACTION_LABELS: Record<string, string> = {
  login: '登录',
  logout: '登出',
  create: '创建',
  update: '更新',
  delete: '删除',
  toggle: '切换状态',
  adjust_points: '调整积分',
  enable: '启用',
  disable: '禁用',
  reset_password: '重置密码',
  assign_role: '分配角色',
  grant: '授权',
  revoke: '撤销授权',
  export: '导出',
  import: '导入',
};

const ACTION_COLORS: Record<string, string> = {
  login: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
  logout: 'bg-slate-500/10 text-slate-400 border-slate-500/20',
  create: 'bg-green-500/10 text-green-400 border-green-500/20',
  update: 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20',
  delete: 'bg-red-500/10 text-red-400 border-red-500/20',
  toggle: 'bg-purple-500/10 text-purple-400 border-purple-500/20',
  adjust_points: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
  enable: 'bg-green-500/10 text-green-400 border-green-500/20',
  disable: 'bg-gray-500/10 text-gray-400 border-gray-500/20',
  reset_password: 'bg-orange-500/10 text-orange-400 border-orange-500/20',
  assign_role: 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20',
  grant: 'bg-cyan-500/10 text-cyan-400 border-cyan-500/20',
  revoke: 'bg-rose-500/10 text-rose-400 border-rose-500/20',
  export: 'bg-teal-500/10 text-teal-400 border-teal-500/20',
  import: 'bg-sky-500/10 text-sky-400 border-sky-500/20',
};

// 目标类型中文映射
const TARGET_TYPE_LABELS: Record<string, string> = {
  system: '系统',
  user: '用户',
  admin: '管理员',
  ai_model: 'AI 模型',
  ai_model_config: 'AI 模型配置',
  prop: '道具',
  script: '剧本',
  storyboard: '分镜',
  characters: '角色',
  character: '角色',
  scene: '场景',
  scenes: '场景',
  costume: '服装',
  costumes: '服装',
  project: '项目',
  projects: '项目',
  role: '角色权限',
  permission: '权限',
  notification: '通知',
  subscription: '订阅',
  points: '积分',
  order: '订单',
  invoice: '账单',
  template: '模板',
  marketplace: '市场',
};

// 详情字段中文映射
const DETAIL_FIELD_LABELS: Record<string, string> = {
  adjustmentType: '调整类型',
  amount: '金额',
  reason: '原因',
  role: '角色',
  balance: '余额',
  points: '积分',
  email: '邮箱',
  username: '用户名',
  password: '密码',
  status: '状态',
  enabled: '启用',
  disabled: '禁用',
  name: '名称',
  description: '描述',
  category: '分类',
  type: '类型',
  provider: '提供商',
  model: '模型',
  reset: '重置',
  employee_id: '员工号',
  employeeId: '员工号',
  old: '旧值',
  new: '新值',
  before: '变更前',
  after: '变更后',
  count: '数量',
  ip: 'IP',
  userAgent: '浏览器',
};

// 详情字段值中文映射
const DETAIL_VALUE_LABELS: Record<string, string> = {
  add: '增加',
  deduct: '扣除',
  set: '设置',
  admin: '管理员',
  user: '普通用户',
  operator: '运营',
  editor: '编辑',
  viewer: '查看者',
  owner: '所有者',
  active: '启用',
  inactive: '停用',
  enabled: '启用',
  disabled: '禁用',
  true: '是',
  false: '否',
};

/** 把一个 details 对象转成中文可读字符串 */
function formatDetails(details: any): string {
  if (details === null || details === undefined) return '';
  let obj: any = details;
  if (typeof details === 'string') {
    try {
      obj = JSON.parse(details);
    } catch {
      return details;
    }
  }
  if (typeof obj !== 'object' || Array.isArray(obj)) {
    return JSON.stringify(obj);
  }
  const parts: string[] = [];
  for (const [k, v] of Object.entries(obj)) {
    const label = DETAIL_FIELD_LABELS[k] || k;
    let valueStr: string;
    if (v === null || v === undefined) {
      valueStr = '-';
    } else if (typeof v === 'boolean') {
      valueStr = v ? '是' : '否';
    } else if (typeof v === 'object') {
      valueStr = JSON.stringify(v);
    } else {
      const s = String(v);
      valueStr = DETAIL_VALUE_LABELS[s] || s;
    }
    parts.push(`${label}：${valueStr}`);
  }
  return parts.join('；');
}

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
                <option key={t} value={t}>{TARGET_TYPE_LABELS[t] || t}</option>
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
                          <span className="text-[var(--text-secondary)] text-xs">{TARGET_TYPE_LABELS[log.target_type] || log.target_type}</span>
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
                      {log.details ? (() => {
                        const cn = formatDetails(log.details);
                        const raw = typeof log.details === 'string' ? log.details : JSON.stringify(log.details);
                        return (
                          <div className="text-xs text-[var(--text-secondary)] max-w-[240px] truncate" title={cn || raw}>
                            <FileText className="w-3 h-3 inline mr-1" />
                            {cn || raw}
                          </div>
                        );
                      })() : (
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
