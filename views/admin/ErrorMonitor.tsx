import React, { useState, useEffect, useCallback } from 'react';
import { AlertTriangle, Search, Filter, ChevronLeft, ChevronRight, RefreshCw, Clock, XCircle, X, CheckCircle, Server, Layers, Square, CheckSquare, Tag, Zap } from 'lucide-react';
import { getAdminAuthHeaders } from '../../services/auth';

// ============ 任务错误相关类型 ============
interface TaskErrorJob {
  id: string;
  user_id: number;
  user_email: string;
  workflow_type: string;
  status: string;
  error_message: string | null;
  input_params: any;
  created_at: string;
  updated_at: string;
  is_consumed: number;
  admin_resolved: number;
}

// ============ 系统错误相关类型 ============
interface SystemError {
  id: number;
  error_type: string;
  error_source: string;
  error_message: string;
  error_stack: string | null;
  request_method: string | null;
  request_url: string | null;
  request_body: any;
  user_id: number | null;
  user_email: string | null;
  extra_context: any;
  is_resolved: number;
  resolved_at: string | null;
  resolved_by: string | null;
  created_at: string;
}

interface Pagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

interface ErrorPattern {
  pattern: string;
  displaySample: string;
  workflowTypes: string[];
  total: number;
  unresolved: number;
}

const WORKFLOW_TYPE_NAMES: Record<string, string> = {
  'script_only': '剧本生成',
  'storyboard_generation': '智能拆分',
  'scene_storyboard_generation': '场景分镜',
  'batch_storyboard_generation': '分镜生成',
  'frame_generation': '首尾帧生成',
  'single_frame_generation': '单帧生成',
  'scene_video': '视频生成',
  'character_views_generation': '角色三视图生成',
  'character_state_views_generation': '角色状态设定图生成',
  'batch_character_views_generation': '批量角色设定图生成',
  'scene_image_generation': '场景图生成',
  'batch_frame_generation': '批量帧生成',
  'batch_scene_video_generation': '批量视频生成',
  'smart_parse': 'AI 智能解析',
  'sketch_frame_generation': '草图帧生成',
  'batch_sketch_frame_generation': '批量草图帧生成',
  'parallel_frame_generation': '并发帧生成',
  'prop_image_generation': '道具图片生成',
  'camera_run_generation': '精细运镜生成',
};

const ERROR_TYPE_NAMES: Record<string, string> = {
  'event_error': '事件错误',
  'unhandled_rejection': 'Promise 拒绝',
  'uncaught_exception': '未捕获异常',
  'api_error': 'API 错误',
  'middleware_error': '中间件错误',
};

const formatDate = (dateStr: string) => {
  const d = new Date(dateStr);
  return d.toLocaleString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
};

type TabType = 'task' | 'system';

const ErrorMonitor: React.FC = () => {
  const [activeTab, setActiveTab] = useState<TabType>('task');
  
  // 任务错误状态
  const [taskErrors, setTaskErrors] = useState<TaskErrorJob[]>([]);
  const [taskPagination, setTaskPagination] = useState<Pagination>({ page: 1, limit: 20, total: 0, totalPages: 0 });
  const [taskLoading, setTaskLoading] = useState(false);
  const [taskTypeFilter, setTaskTypeFilter] = useState('');
  const [taskExpandedId, setTaskExpandedId] = useState<string | null>(null);
  const [taskUpdatingId, setTaskUpdatingId] = useState<string | null>(null);
  const [taskSearchQuery, setTaskSearchQuery] = useState('');

  // 系统错误状态
  const [systemErrors, setSystemErrors] = useState<SystemError[]>([]);
  const [systemPagination, setSystemPagination] = useState<Pagination>({ page: 1, limit: 20, total: 0, totalPages: 0 });
  const [systemLoading, setSystemLoading] = useState(false);
  const [systemTypeFilter, setSystemTypeFilter] = useState('');
  const [systemExpandedId, setSystemExpandedId] = useState<number | null>(null);
  const [systemUpdatingId, setSystemUpdatingId] = useState<number | null>(null);
  const [systemSearchQuery, setSystemSearchQuery] = useState('');

  // 批量选择与错误种类
  const [selectedTaskIds, setSelectedTaskIds] = useState<Set<string>>(new Set());
  const [selectedSystemIds, setSelectedSystemIds] = useState<Set<number>>(new Set());
  const [taskErrorStats, setTaskErrorStats] = useState<ErrorPattern[]>([]);
  const [systemErrorStats, setSystemErrorStats] = useState<ErrorPattern[]>([]);
  const [selectedTaskPattern, setSelectedTaskPattern] = useState('');
  const [selectedSystemPattern, setSelectedSystemPattern] = useState('');
  const [batchProcessing, setBatchProcessing] = useState(false);
  const [showSidebar, setShowSidebar] = useState(true);

  // ============ 任务错误 API ============
  const fetchTaskErrors = useCallback(async (page = 1) => {
    setTaskLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), limit: '20' });
      if (taskTypeFilter) params.append('workflowType', taskTypeFilter);
      const res = await fetch(`/api/workflows/admin/errors?${params}`, { headers: getAdminAuthHeaders() });
      if (!res.ok) throw new Error('请求失败');
      const data = await res.json();
      setTaskErrors(data.jobs || []);
      setTaskPagination(data.pagination || { page: 1, limit: 20, total: 0, totalPages: 0 });
    } catch (err) {
      console.error('[ErrorMonitor] 获取任务错误失败:', err);
    } finally {
      setTaskLoading(false);
    }
  }, [taskTypeFilter]);

  const handleUpdateTaskStatus = async (jobId: string, newStatus: boolean) => {
    setTaskUpdatingId(jobId);
    try {
      const res = await fetch(`/api/workflows/admin/errors/${jobId}/status`, {
        method: 'PATCH',
        headers: { ...getAdminAuthHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ admin_resolved: newStatus ? 1 : 0 })
      });
      if (!res.ok) throw new Error('更新失败');
      setTaskErrors(prev => prev.map(j => 
        j.id === jobId ? { ...j, admin_resolved: newStatus ? 1 : 0 } : j
      ));
    } catch (err) {
      console.error('[ErrorMonitor] 更新任务状态失败:', err);
    } finally {
      setTaskUpdatingId(null);
    }
  };

  // ============ 系统错误 API ============
  const fetchSystemErrors = useCallback(async (page = 1) => {
    setSystemLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), limit: '20' });
      if (systemTypeFilter) params.append('errorType', systemTypeFilter);
      const res = await fetch(`/api/admin/system-errors?${params}`, { headers: getAdminAuthHeaders() });
      if (!res.ok) throw new Error('请求失败');
      const data = await res.json();
      setSystemErrors(data.errors || []);
      setSystemPagination(data.pagination || { page: 1, limit: 20, total: 0, totalPages: 0 });
    } catch (err) {
      console.error('[ErrorMonitor] 获取系统错误失败:', err);
    } finally {
      setSystemLoading(false);
    }
  }, [systemTypeFilter]);

  const handleUpdateSystemStatus = async (errorId: number, newStatus: boolean) => {
    setSystemUpdatingId(errorId);
    try {
      const res = await fetch(`/api/admin/system-errors/${errorId}/status`, {
        method: 'PATCH',
        headers: { ...getAdminAuthHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_resolved: newStatus ? 1 : 0 })
      });
      if (!res.ok) throw new Error('更新失败');
      setSystemErrors(prev => prev.map(e => 
        e.id === errorId ? { ...e, is_resolved: newStatus ? 1 : 0 } : e
      ));
    } catch (err) {
      console.error('[ErrorMonitor] 更新系统错误状态失败:', err);
    } finally {
      setSystemUpdatingId(null);
    }
  };

  // ============ 错误种类统计 ============
  const fetchTaskErrorStats = useCallback(async () => {
    try {
      const res = await fetch('/api/workflows/admin/errors/stats', { headers: getAdminAuthHeaders() });
      if (!res.ok) throw new Error('请求失败');
      const data = await res.json();
      setTaskErrorStats(data.patterns || []);
    } catch (err) {
      console.error('[ErrorMonitor] 获取任务错误统计失败:', err);
    }
  }, []);

  const fetchSystemErrorStats = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/system-errors/stats', { headers: getAdminAuthHeaders() });
      if (!res.ok) throw new Error('请求失败');
      const data = await res.json();
      // 转换系统错误 stats 为统一格式
      const patterns: ErrorPattern[] = (data.stats || []).map((s: any) => ({
        pattern: s.error_type,
        displaySample: s.error_type,
        workflowTypes: [],
        total: s.total,
        unresolved: s.unresolved
      }));
      setSystemErrorStats(patterns);
    } catch (err) {
      console.error('[ErrorMonitor] 获取系统错误统计失败:', err);
    }
  }, []);

  // ============ 批量处理 ============
  const batchResolveTasks = async (pattern?: string) => {
    if (batchProcessing) return;
    setBatchProcessing(true);
    try {
      const body: any = {};
      if (selectedTaskIds.size > 0) {
        body.jobIds = [...selectedTaskIds];
      } else if (pattern) {
        body.errorPattern = pattern;
      } else if (taskTypeFilter) {
        body.workflowType = taskTypeFilter;
      }
      const res = await fetch('/api/workflows/admin/errors/batch-resolve', {
        method: 'POST',
        headers: { ...getAdminAuthHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      if (!res.ok) throw new Error('批量处理失败');
      const data = await res.json();
      alert(data.message || `已批量处理 ${data.resolved} 个任务`);
      setSelectedTaskIds(new Set());
      setSelectedTaskPattern('');
      fetchTaskErrors(taskPagination.page);
      fetchTaskErrorStats();
    } catch (err) {
      console.error('[ErrorMonitor] 批量处理任务失败:', err);
      alert('批量处理失败，请重试');
    } finally {
      setBatchProcessing(false);
    }
  };

  const batchResolveSystemErrors = async (pattern?: string) => {
    if (batchProcessing) return;
    setBatchProcessing(true);
    try {
      const body: any = {};
      if (selectedSystemIds.size > 0) {
        body.errorIds = [...selectedSystemIds];
      } else if (pattern) {
        body.errorPattern = pattern;
      } else if (systemTypeFilter) {
        body.errorType = systemTypeFilter;
      }
      const res = await fetch('/api/admin/system-errors/batch-resolve', {
        method: 'POST',
        headers: { ...getAdminAuthHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      if (!res.ok) throw new Error('批量处理失败');
      const data = await res.json();
      alert(data.message || `已批量处理 ${data.resolved} 个错误`);
      setSelectedSystemIds(new Set());
      setSelectedSystemPattern('');
      fetchSystemErrors(systemPagination.page);
      fetchSystemErrorStats();
    } catch (err) {
      console.error('[ErrorMonitor] 批量处理系统错误失败:', err);
      alert('批量处理失败，请重试');
    } finally {
      setBatchProcessing(false);
    }
  };

  // 初始加载
  useEffect(() => {
    if (activeTab === 'task') {
      fetchTaskErrors(1);
      fetchTaskErrorStats();
    } else {
      fetchSystemErrors(1);
      fetchSystemErrorStats();
    }
  }, [activeTab, fetchTaskErrors, fetchSystemErrors, fetchTaskErrorStats, fetchSystemErrorStats]);

  // 渲染标签页
  const renderTabs = () => (
    <div className="flex items-center gap-1 p-1 rounded-xl bg-white/10 border border-white/15">
      <button
        onClick={() => setActiveTab('task')}
        className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
          activeTab === 'task'
            ? 'bg-red-500/20 text-red-400'
            : 'text-white/80 hover:text-white hover:bg-white/10'
        }`}
      >
        <Layers className="w-4 h-4" />
        任务错误
        {taskPagination.total > 0 && (
          <span className="ml-1 px-1.5 py-0.5 rounded-full bg-red-500/30 text-xs">
            {taskPagination.total}
          </span>
        )}
      </button>
      <button
        onClick={() => setActiveTab('system')}
        className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
          activeTab === 'system'
            ? 'bg-orange-500/20 text-orange-400'
            : 'text-white/80 hover:text-white hover:bg-white/10'
        }`}
      >
        <Server className="w-4 h-4" />
        系统错误
        {systemPagination.total > 0 && (
          <span className="ml-1 px-1.5 py-0.5 rounded-full bg-orange-500/30 text-xs">
            {systemPagination.total}
          </span>
        )}
      </button>
    </div>
  );

  // 渲染错误种类侧边栏
  const renderErrorPatternSidebar = () => {
    const patterns = activeTab === 'task' ? taskErrorStats : systemErrorStats;
    const selectedPattern = activeTab === 'task' ? selectedTaskPattern : selectedSystemPattern;
    const onSelect = activeTab === 'task'
      ? (p: string) => { setSelectedTaskPattern(p === selectedTaskPattern ? '' : p); setSelectedTaskIds(new Set()); }
      : (p: string) => { setSelectedSystemPattern(p === selectedSystemPattern ? '' : p); setSelectedSystemIds(new Set()); };
    const onBatchResolve = activeTab === 'task'
      ? (p: string) => batchResolveTasks(p)
      : (p: string) => batchResolveSystemErrors(p);

    return (
      <div className="w-64 shrink-0">
        <div className="rounded-xl border border-white/10 bg-white/[0.05] overflow-hidden">
          <div className="px-4 py-3 border-b border-white/10 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Tag className="w-4 h-4 text-purple-400" />
              <span className="text-sm font-semibold text-white">错误种类</span>
            </div>
            <button
              onClick={() => {
                activeTab === 'task'
                  ? (fetchTaskErrorStats(), fetchTaskErrors(taskPagination.page))
                  : (fetchSystemErrorStats(), fetchSystemErrors(systemPagination.page));
              }}
              className="p-1 rounded hover:bg-white/10 transition-colors"
              title="刷新统计"
            >
              <RefreshCw className="w-3.5 h-3.5 text-white/60" />
            </button>
          </div>
          <div className="max-h-[60vh] overflow-y-auto">
            {patterns.length === 0 ? (
              <div className="px-4 py-6 text-center text-sm text-white/50">
                暂无错误记录
              </div>
            ) : (
              patterns.map((p, idx) => {
                const isActive = selectedPattern === p.pattern;
                const displayLabel = activeTab === 'task'
                  ? (p.displaySample.length > 50 ? p.displaySample.substring(0, 50) + '…' : p.displaySample)
                  : (ERROR_TYPE_NAMES[p.pattern] || p.pattern);
                return (
                  <div
                    key={idx}
                    className={`px-4 py-2.5 border-b border-white/5 cursor-pointer transition-colors hover:bg-white/[0.06] ${
                      isActive ? 'bg-purple-500/10 border-l-2 border-l-purple-400' : ''
                    }`}
                    onClick={() => onSelect(p.pattern)}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="text-xs text-white/80 truncate" title={p.displaySample}>
                          {displayLabel}
                        </div>
                        {p.workflowTypes && p.workflowTypes.length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-1">
                            {p.workflowTypes.slice(0, 2).map(wt => (
                              <span key={wt} className="text-[10px] px-1.5 py-0.5 rounded bg-white/10 text-white/50">
                                {WORKFLOW_TYPE_NAMES[wt] || wt}
                              </span>
                            ))}
                            {p.workflowTypes.length > 2 && (
                              <span className="text-[10px] text-white/40">+{p.workflowTypes.length - 2}</span>
                            )}
                          </div>
                        )}
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <span className="text-[11px] font-mono text-red-400 font-semibold">{p.unresolved}</span>
                        {p.total !== p.unresolved && (
                          <span className="text-[11px] font-mono text-white/40">/{p.total}</span>
                        )}
                      </div>
                    </div>
                    {p.unresolved > 0 && (
                      <button
                        onClick={(e) => { e.stopPropagation(); onBatchResolve(p.pattern); }}
                        disabled={batchProcessing}
                        className="mt-1.5 flex items-center gap-1 text-[11px] px-2 py-1 rounded-md bg-amber-500/15 text-amber-400 hover:bg-amber-500/25 transition-colors disabled:opacity-50"
                      >
                        <Zap className="w-3 h-3" />
                        一键处理 ({p.unresolved})
                      </button>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    );
  };

  // 渲染任务错误表格
  // [虚拟列表评估] 不适用 useVirtualList：已实现服务端分页（每页 20 条），无需虚拟化
  const renderTaskErrors = () => {
    const query = taskSearchQuery.trim().toLowerCase();
    // 先按搜索关键词过滤，再按选中的错误模式过滤
    let filteredTaskErrors = query
      ? taskErrors.filter(job =>
          (job.error_message || '').toLowerCase().includes(query)
        )
      : taskErrors;
    if (selectedTaskPattern) {
      // 客户端模式匹配：标准化后比较
      filteredTaskErrors = filteredTaskErrors.filter(job => {
        const msg = job.error_message || '';
        const normalized = msg.replace(/\d+/g, '{N}').replace(/\s+/g, ' ').trim();
        return normalized === selectedTaskPattern;
      });
    }

    const allSelected = filteredTaskErrors.length > 0 && filteredTaskErrors.every(j => selectedTaskIds.has(j.id));
    const toggleSelectAll = () => {
      if (allSelected) {
        setSelectedTaskIds(new Set());
      } else {
        setSelectedTaskIds(new Set(filteredTaskErrors.map(j => j.id)));
      }
    };
    const toggleSelect = (id: string) => {
      setSelectedTaskIds(prev => {
        const next = new Set(prev);
        if (next.has(id)) next.delete(id); else next.add(id);
        return next;
      });
    };

    return (
    <>
      {/* 筛选 */}
      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-white/10 border border-white/15">
          <Filter className="w-4 h-4 text-white/70" />
          <select
            value={taskTypeFilter}
            onChange={e => setTaskTypeFilter(e.target.value)}
            className="bg-transparent text-sm text-white/80 outline-none"
          >
            <option value="">全部类型</option>
            {Object.entries(WORKFLOW_TYPE_NAMES).map(([key, label]) => (
              <option key={key} value={key}>{label}</option>
            ))}
          </select>
        </div>
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-white/10 border border-white/15 flex-1 min-w-[200px] max-w-md">
          <Search className="w-4 h-4 text-white/70 shrink-0" />
          <input
            type="text"
            value={taskSearchQuery}
            onChange={e => setTaskSearchQuery(e.target.value)}
            placeholder="搜索错误信息关键词..."
            className="bg-transparent text-sm text-white/80 outline-none w-full placeholder:text-white/40"
          />
          {taskSearchQuery && (
            <button
              onClick={() => setTaskSearchQuery('')}
              className="shrink-0 p-0.5 rounded hover:bg-white/10 transition-colors"
            >
              <X className="w-3.5 h-3.5 text-white/60" />
            </button>
          )}
        </div>
        <span className="text-sm text-white/70">
          {query
            ? `匹配 ${filteredTaskErrors.length} / ${taskErrors.length} 条（共 ${taskPagination.total} 条）`
            : `共 ${taskPagination.total} 条错误记录`
          }
        </span>
      </div>

      {/* 批量操作栏 */}
      {(selectedTaskIds.size > 0 || selectedTaskPattern || taskTypeFilter) && (
        <div className="flex items-center gap-3 mb-3 px-3 py-2 rounded-lg bg-amber-500/8 border border-amber-500/20">
          <span className="text-sm text-amber-300">
            {selectedTaskIds.size > 0
              ? `已选中 ${selectedTaskIds.size} 条错误`
              : selectedTaskPattern
                ? `按错误种类筛选`
                : `筛选类型: ${WORKFLOW_TYPE_NAMES[taskTypeFilter] || taskTypeFilter}`}
          </span>
          <button
            onClick={() => batchResolveTasks()}
            disabled={batchProcessing || (selectedTaskIds.size === 0 && !selectedTaskPattern && !taskTypeFilter)}
            className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md bg-amber-500/20 text-amber-400 hover:bg-amber-500/30 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Zap className="w-3.5 h-3.5" />
            {batchProcessing ? '处理中…' : selectedTaskIds.size > 0 ? `批量处理 (${selectedTaskIds.size})` : '一键处理全部'}
          </button>
          {selectedTaskIds.size > 0 && (
            <button
              onClick={() => setSelectedTaskIds(new Set())}
              className="text-xs px-2 py-1 rounded text-white/50 hover:text-white/80 transition-colors"
            >
              取消选择
            </button>
          )}
        </div>
      )}

      {/* 表格 */}
      <div className="rounded-xl border border-white/10 overflow-x-auto bg-white/[0.06]">
        <table className="w-full min-w-[900px]">
          <thead>
            <tr className="border-b border-white/10 bg-white/10">
              <th className="text-center px-3 py-3 w-10">
                <button onClick={toggleSelectAll} className="text-white/60 hover:text-white/90 transition-colors">
                  {allSelected ? <CheckSquare className="w-4 h-4 text-purple-400" /> : <Square className="w-4 h-4" />}
                </button>
              </th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-white/80 uppercase tracking-wider">ID</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-white/80 uppercase tracking-wider">用户</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-white/80 uppercase tracking-wider">任务类型</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-white/80 uppercase tracking-wider">错误信息</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-white/80 uppercase tracking-wider">时间</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-white/80 uppercase tracking-wider w-24">状态</th>
            </tr>
          </thead>
          <tbody>
            {taskLoading && taskErrors.length === 0 ? (
              <tr>
                <td colSpan={7} className="text-center py-12 text-white/70">
                  <RefreshCw className="w-5 h-5 animate-spin mx-auto mb-2" />
                  加载中...
                </td>
              </tr>
            ) : taskErrors.length === 0 ? (
              <tr>
                <td colSpan={7} className="text-center py-12 text-white/70">
                  暂无任务错误记录
                </td>
              </tr>
            ) : filteredTaskErrors.length === 0 ? (
              <tr>
                <td colSpan={7} className="text-center py-12 text-white/70">
                  <Search className="w-5 h-5 mx-auto mb-2 opacity-50" />
                  未找到匹配「{taskSearchQuery}」的错误记录
                </td>
              </tr>
            ) : (
              filteredTaskErrors.map(job => (
                <React.Fragment key={job.id}>
                  <tr
                    className="border-b border-white/10 hover:bg-white/[0.06] cursor-pointer transition-colors"
                    onClick={() => setTaskExpandedId(taskExpandedId === job.id ? null : job.id)}
                  >
                    <td className="px-3 py-3 text-center" onClick={(e) => e.stopPropagation()}>
                      <button onClick={() => toggleSelect(job.id)} className="text-white/50 hover:text-white/90 transition-colors">
                        {selectedTaskIds.has(job.id) ? <CheckSquare className="w-4 h-4 text-purple-400" /> : <Square className="w-4 h-4" />}
                      </button>
                    </td>
                    <td className="px-4 py-3 text-sm text-white/70 font-mono">#{job.id}</td>
                    <td className="px-4 py-3 text-sm text-white/80">{job.user_email || `User #${job.user_id}`}</td>
                    <td className="px-4 py-3">
                      <span className="text-xs px-2 py-1 rounded-full bg-purple-500/20 text-purple-300">
                        {WORKFLOW_TYPE_NAMES[job.workflow_type] || job.workflow_type}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-red-400 max-w-xs truncate">
                      {job.error_message || '未知错误'}
                    </td>
                    <td className="px-4 py-3 text-xs text-white/80">
                      <div className="flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {formatDate(job.created_at)}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleUpdateTaskStatus(job.id, !job.admin_resolved);
                        }}
                        disabled={taskUpdatingId === job.id}
                        className={`inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded transition-all cursor-pointer whitespace-nowrap min-w-[64px] justify-center ${
                          job.admin_resolved
                            ? 'bg-green-500/15 text-green-400 border border-green-500/30 hover:bg-green-500/25'
                            : 'bg-amber-500/15 text-amber-400 border border-amber-500/30 hover:bg-amber-500/25'
                        } ${taskUpdatingId === job.id ? 'opacity-50' : ''}`}
                      >
                        {taskUpdatingId === job.id ? (
                          <RefreshCw className="w-3 h-3 animate-spin" />
                        ) : job.admin_resolved ? (
                          <CheckCircle className="w-3 h-3" />
                        ) : (
                          <Clock className="w-3 h-3" />
                        )}
                        {job.admin_resolved ? '已处理' : '待处理'}
                      </button>
                    </td>
                  </tr>
                  {taskExpandedId === job.id && (
                    <tr className="bg-white/[0.06]">
                      <td colSpan={7} className="px-6 py-4">
                        <div className="text-sm space-y-2">
                          <div>
                            <span className="text-white/70">完整错误：</span>
                            <span className="text-red-400">{job.error_message || '无'}</span>
                          </div>
                          <div>
                            <span className="text-white/70">更新时间：</span>
                            <span className="text-white/70">{formatDate(job.updated_at)}</span>
                          </div>
                          {job.input_params && (
                            <div>
                              <span className="text-white/70">输入参数：</span>
                              <pre className="mt-1 text-xs text-white/80 bg-black/30 p-3 rounded-lg overflow-x-auto max-h-40">
                                {typeof job.input_params === 'string' ? job.input_params : JSON.stringify(job.input_params, null, 2)}
                              </pre>
                            </div>
                          )}
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* 分页 */}
      {taskPagination.totalPages > 1 && (
        <div className="flex items-center justify-between mt-4">
          <span className="text-sm text-white/70">
            第 {taskPagination.page} / {taskPagination.totalPages} 页
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={() => fetchTaskErrors(taskPagination.page - 1)}
              disabled={taskPagination.page <= 1}
              className="p-2 rounded-lg bg-white/10 text-white/80 hover:bg-white/15 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button
              onClick={() => fetchTaskErrors(taskPagination.page + 1)}
              disabled={taskPagination.page >= taskPagination.totalPages}
              className="p-2 rounded-lg bg-white/10 text-white/80 hover:bg-white/15 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </>
    );
  };

  // 渲染系统错误表格
  // [虚拟列表评估] 不适用 useVirtualList：已实现服务端分页（每页 20 条），无需虚拟化
  const renderSystemErrors = () => {
    const query = systemSearchQuery.trim().toLowerCase();
    let filteredSystemErrors = query
      ? systemErrors.filter(error =>
          (error.error_message || '').toLowerCase().includes(query) ||
          (error.error_stack || '').toLowerCase().includes(query)
        )
      : systemErrors;
    // 按选中的错误模式过滤（系统错误用 error_type 过滤）
    if (selectedSystemPattern) {
      filteredSystemErrors = filteredSystemErrors.filter(error =>
        error.error_type === selectedSystemPattern
      );
    }

    const allSelected = filteredSystemErrors.length > 0 && filteredSystemErrors.every(e => selectedSystemIds.has(e.id));
    const toggleSelectAll = () => {
      if (allSelected) {
        setSelectedSystemIds(new Set());
      } else {
        setSelectedSystemIds(new Set(filteredSystemErrors.map(e => e.id)));
      }
    };
    const toggleSelect = (id: number) => {
      setSelectedSystemIds(prev => {
        const next = new Set(prev);
        if (next.has(id)) next.delete(id); else next.add(id);
        return next;
      });
    };

    return (
    <>
      {/* 筛选 */}
      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-white/10 border border-white/15">
          <Filter className="w-4 h-4 text-white/70" />
          <select
            value={systemTypeFilter}
            onChange={e => setSystemTypeFilter(e.target.value)}
            className="bg-transparent text-sm text-white/80 outline-none"
          >
            <option value="">全部类型</option>
            {Object.entries(ERROR_TYPE_NAMES).map(([key, label]) => (
              <option key={key} value={key}>{label}</option>
            ))}
          </select>
        </div>
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-white/10 border border-white/15 flex-1 min-w-[200px] max-w-md">
          <Search className="w-4 h-4 text-white/70 shrink-0" />
          <input
            type="text"
            value={systemSearchQuery}
            onChange={e => setSystemSearchQuery(e.target.value)}
            placeholder="搜索错误信息或堆栈关键词..."
            className="bg-transparent text-sm text-white/80 outline-none w-full placeholder:text-white/40"
          />
          {systemSearchQuery && (
            <button
              onClick={() => setSystemSearchQuery('')}
              className="shrink-0 p-0.5 rounded hover:bg-white/10 transition-colors"
            >
              <X className="w-3.5 h-3.5 text-white/60" />
            </button>
          )}
        </div>
        <span className="text-sm text-white/70">
          {query
            ? `匹配 ${filteredSystemErrors.length} / ${systemErrors.length} 条（共 ${systemPagination.total} 条）`
            : `共 ${systemPagination.total} 条错误记录`
          }
        </span>
      </div>

      {/* 批量操作栏 */}
      {(selectedSystemIds.size > 0 || selectedSystemPattern || systemTypeFilter) && (
        <div className="flex items-center gap-3 mb-3 px-3 py-2 rounded-lg bg-amber-500/8 border border-amber-500/20">
          <span className="text-sm text-amber-300">
            {selectedSystemIds.size > 0
              ? `已选中 ${selectedSystemIds.size} 条错误`
              : selectedSystemPattern
                ? `筛选: ${ERROR_TYPE_NAMES[selectedSystemPattern] || selectedSystemPattern}`
                : `筛选类型: ${ERROR_TYPE_NAMES[systemTypeFilter] || systemTypeFilter}`}
          </span>
          <button
            onClick={() => batchResolveSystemErrors()}
            disabled={batchProcessing || (selectedSystemIds.size === 0 && !selectedSystemPattern && !systemTypeFilter)}
            className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md bg-amber-500/20 text-amber-400 hover:bg-amber-500/30 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Zap className="w-3.5 h-3.5" />
            {batchProcessing ? '处理中…' : selectedSystemIds.size > 0 ? `批量处理 (${selectedSystemIds.size})` : '一键处理全部'}
          </button>
          {selectedSystemIds.size > 0 && (
            <button
              onClick={() => setSelectedSystemIds(new Set())}
              className="text-xs px-2 py-1 rounded text-white/50 hover:text-white/80 transition-colors"
            >
              取消选择
            </button>
          )}
        </div>
      )}

      {/* 表格 */}
      <div className="rounded-xl border border-white/10 overflow-x-auto bg-white/[0.06]">
        <table className="w-full min-w-[900px]">
          <thead>
            <tr className="border-b border-white/10 bg-white/10">
              <th className="text-center px-3 py-3 w-10">
                <button onClick={toggleSelectAll} className="text-white/60 hover:text-white/90 transition-colors">
                  {allSelected ? <CheckSquare className="w-4 h-4 text-purple-400" /> : <Square className="w-4 h-4" />}
                </button>
              </th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-white/80 uppercase tracking-wider">ID</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-white/80 uppercase tracking-wider">类型</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-white/80 uppercase tracking-wider">来源</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-white/80 uppercase tracking-wider">错误信息</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-white/80 uppercase tracking-wider">时间</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-white/80 uppercase tracking-wider w-24">状态</th>
            </tr>
          </thead>
          <tbody>
            {systemLoading && systemErrors.length === 0 ? (
              <tr>
                <td colSpan={7} className="text-center py-12 text-white/70">
                  <RefreshCw className="w-5 h-5 animate-spin mx-auto mb-2" />
                  加载中...
                </td>
              </tr>
            ) : systemErrors.length === 0 ? (
              <tr>
                <td colSpan={7} className="text-center py-12 text-white/70">
                  暂无系统错误记录
                </td>
              </tr>
            ) : filteredSystemErrors.length === 0 ? (
              <tr>
                <td colSpan={7} className="text-center py-12 text-white/70">
                  <Search className="w-5 h-5 mx-auto mb-2 opacity-50" />
                  未找到匹配「{systemSearchQuery}」的错误记录
                </td>
              </tr>
            ) : (
              filteredSystemErrors.map(error => (
                <React.Fragment key={error.id}>
                  <tr
                    className="border-b border-white/10 hover:bg-white/[0.06] cursor-pointer transition-colors"
                    onClick={() => setSystemExpandedId(systemExpandedId === error.id ? null : error.id)}
                  >
                    <td className="px-3 py-3 text-center" onClick={(e) => e.stopPropagation()}>
                      <button onClick={() => toggleSelect(error.id)} className="text-white/50 hover:text-white/90 transition-colors">
                        {selectedSystemIds.has(error.id) ? <CheckSquare className="w-4 h-4 text-purple-400" /> : <Square className="w-4 h-4" />}
                      </button>
                    </td>
                    <td className="px-4 py-3 text-sm text-white/70 font-mono">#{error.id}</td>
                    <td className="px-4 py-3">
                      <span className={`text-xs px-2 py-1 rounded-full ${
                        error.error_type === 'uncaught_exception' || error.error_type === 'unhandled_rejection'
                          ? 'bg-red-500/20 text-red-300'
                          : error.error_type === 'api_error'
                          ? 'bg-blue-500/20 text-blue-300'
                          : 'bg-orange-500/20 text-orange-300'
                      }`}>
                        {ERROR_TYPE_NAMES[error.error_type] || error.error_type}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-white/70 max-w-50 truncate">
                      {error.error_source || '-'}
                    </td>
                    <td className="px-4 py-3 text-sm text-red-400 max-w-xs truncate">
                      {error.error_message || '未知错误'}
                    </td>
                    <td className="px-4 py-3 text-xs text-white/80">
                      <div className="flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {formatDate(error.created_at)}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleUpdateSystemStatus(error.id, !error.is_resolved);
                        }}
                        disabled={systemUpdatingId === error.id}
                        className={`inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded transition-all cursor-pointer whitespace-nowrap min-w-[64px] justify-center ${
                          error.is_resolved
                            ? 'bg-green-500/15 text-green-400 border border-green-500/30 hover:bg-green-500/25'
                            : 'bg-amber-500/15 text-amber-400 border border-amber-500/30 hover:bg-amber-500/25'
                        } ${systemUpdatingId === error.id ? 'opacity-50' : ''}`}
                      >
                        {systemUpdatingId === error.id ? (
                          <RefreshCw className="w-3 h-3 animate-spin" />
                        ) : error.is_resolved ? (
                          <CheckCircle className="w-3 h-3" />
                        ) : (
                          <Clock className="w-3 h-3" />
                        )}
                        {error.is_resolved ? '已解决' : '待处理'}
                      </button>
                    </td>
                  </tr>
                  {systemExpandedId === error.id && (
                    <tr className="bg-white/[0.06]">
                      <td colSpan={7} className="px-6 py-4">
                        <div className="text-sm space-y-3">
                          <div>
                            <span className="text-white/70">完整错误：</span>
                            <span className="text-red-400">{error.error_message || '无'}</span>
                          </div>
                          {error.error_stack && (
                            <div>
                              <span className="text-white/70">错误堆栈：</span>
                              <pre className="mt-1 text-xs text-white/80 bg-black/30 p-3 rounded-lg overflow-x-auto max-h-40 whitespace-pre-wrap">
                                {error.error_stack}
                              </pre>
                            </div>
                          )}
                          {error.request_url && (
                            <div>
                              <span className="text-white/70">请求：</span>
                              <span className="text-white/70 font-mono">
                                {error.request_method} {error.request_url}
                              </span>
                            </div>
                          )}
                          {error.user_email && (
                            <div>
                              <span className="text-white/70">用户：</span>
                              <span className="text-white/70">{error.user_email}</span>
                            </div>
                          )}
                          {error.resolved_by && (
                            <div>
                              <span className="text-white/70">处理人：</span>
                              <span className="text-white/70">{error.resolved_by}</span>
                              {error.resolved_at && (
                                <span className="text-white/80 ml-2">({formatDate(error.resolved_at)})</span>
                              )}
                            </div>
                          )}
                          {error.extra_context && Object.keys(error.extra_context).length > 0 && (
                            <div>
                              <span className="text-white/70">额外信息：</span>
                              <pre className="mt-1 text-xs text-white/80 bg-black/30 p-3 rounded-lg overflow-x-auto max-h-32">
                                {JSON.stringify(error.extra_context, null, 2)}
                              </pre>
                            </div>
                          )}
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* 分页 */}
      {systemPagination.totalPages > 1 && (
        <div className="flex items-center justify-between mt-4">
          <span className="text-sm text-white/70">
            第 {systemPagination.page} / {systemPagination.totalPages} 页
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={() => fetchSystemErrors(systemPagination.page - 1)}
              disabled={systemPagination.page <= 1}
              className="p-2 rounded-lg bg-white/10 text-white/80 hover:bg-white/15 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button
              onClick={() => fetchSystemErrors(systemPagination.page + 1)}
              disabled={systemPagination.page >= systemPagination.totalPages}
              className="p-2 rounded-lg bg-white/10 text-white/80 hover:bg-white/15 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </>
    );
  };

  return (
    <div className="p-6 min-h-screen" style={{ backgroundColor: '#0a0a0f' }}>
      <div className="max-w-7xl mx-auto">
        {/* 标题 */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-red-500/20 rounded-xl flex items-center justify-center">
              <AlertTriangle className="w-5 h-5 text-red-400" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-white">错误监控</h1>
              <p className="text-sm text-white/80">监控任务错误和系统错误</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {renderTabs()}
            <button
              onClick={() => activeTab === 'task' ? fetchTaskErrors(taskPagination.page) : fetchSystemErrors(systemPagination.page)}
              disabled={activeTab === 'task' ? taskLoading : systemLoading}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-white/10 text-white/80 hover:bg-white/15 transition-colors text-sm"
            >
              <RefreshCw className={`w-4 h-4 ${(activeTab === 'task' ? taskLoading : systemLoading) ? 'animate-spin' : ''}`} />
              刷新
            </button>
          </div>
        </div>

        {/* 内容区域 */}
        <div className="flex gap-4">
          {renderErrorPatternSidebar()}
          <div className="flex-1 min-w-0">
            {activeTab === 'task' ? renderTaskErrors() : renderSystemErrors()}
          </div>
        </div>
      </div>
    </div>
  );
};

export default ErrorMonitor;
