import React, { useState, useEffect, useCallback } from 'react';
import { AlertTriangle, Search, Filter, ChevronLeft, ChevronRight, RefreshCw, Clock, XCircle, Check, CheckCircle, Server, Layers } from 'lucide-react';
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

const WORKFLOW_TYPE_NAMES: Record<string, string> = {
  'script_only': '剧本生成',
  'storyboard_generation': '智能分镜',
  'scene_storyboard_generation': '场景分镜',
  'batch_storyboard_generation': '分镜生成',
  'frame_generation': '首尾帧生成',
  'single_frame_generation': '单帧生成',
  'scene_video': '视频生成',
  'character_views_generation': '角色三视图生成',
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

  // 系统错误状态
  const [systemErrors, setSystemErrors] = useState<SystemError[]>([]);
  const [systemPagination, setSystemPagination] = useState<Pagination>({ page: 1, limit: 20, total: 0, totalPages: 0 });
  const [systemLoading, setSystemLoading] = useState(false);
  const [systemTypeFilter, setSystemTypeFilter] = useState('');
  const [systemExpandedId, setSystemExpandedId] = useState<number | null>(null);
  const [systemUpdatingId, setSystemUpdatingId] = useState<number | null>(null);

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
        body: JSON.stringify({ is_consumed: newStatus ? 1 : 0 })
      });
      if (!res.ok) throw new Error('更新失败');
      setTaskErrors(prev => prev.map(j => 
        j.id === jobId ? { ...j, is_consumed: newStatus ? 1 : 0 } : j
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

  // 初始加载
  useEffect(() => {
    if (activeTab === 'task') {
      fetchTaskErrors(1);
    } else {
      fetchSystemErrors(1);
    }
  }, [activeTab, fetchTaskErrors, fetchSystemErrors]);

  // 渲染标签页
  const renderTabs = () => (
    <div className="flex items-center gap-1 p-1 rounded-xl bg-white/5 border border-white/10">
      <button
        onClick={() => setActiveTab('task')}
        className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
          activeTab === 'task'
            ? 'bg-red-500/20 text-red-400'
            : 'text-white/60 hover:text-white/80 hover:bg-white/5'
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
            : 'text-white/60 hover:text-white/80 hover:bg-white/5'
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

  // 渲染任务错误表格
  // [虚拟列表评估] 不适用 useVirtualList：已实现服务端分页（每页 20 条），无需虚拟化
  const renderTaskErrors = () => (
    <>
      {/* 筛选 */}
      <div className="flex items-center gap-3 mb-4">
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-white/5 border border-white/10">
          <Filter className="w-4 h-4 text-white/40" />
          <select
            value={taskTypeFilter}
            onChange={e => setTaskTypeFilter(e.target.value)}
            className="bg-transparent text-sm text-white/80 outline-none"
          >
            <option value="" className="bg-[#1a1a2e]">全部类型</option>
            {Object.entries(WORKFLOW_TYPE_NAMES).map(([key, label]) => (
              <option key={key} value={key} className="bg-[#1a1a2e]">{label}</option>
            ))}
          </select>
        </div>
        <span className="text-sm text-white/40">
          共 {taskPagination.total} 条错误记录
        </span>
      </div>

      {/* 表格 */}
      <div className="rounded-xl border border-white/10 overflow-hidden bg-white/3">
        <table className="w-full">
          <thead>
            <tr className="border-b border-white/10 bg-white/5">
              <th className="text-left px-4 py-3 text-xs font-semibold text-white/50 uppercase tracking-wider">ID</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-white/50 uppercase tracking-wider">用户</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-white/50 uppercase tracking-wider">任务类型</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-white/50 uppercase tracking-wider">错误信息</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-white/50 uppercase tracking-wider">时间</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-white/50 uppercase tracking-wider">状态</th>
            </tr>
          </thead>
          <tbody>
            {taskLoading && taskErrors.length === 0 ? (
              <tr>
                <td colSpan={6} className="text-center py-12 text-white/40">
                  <RefreshCw className="w-5 h-5 animate-spin mx-auto mb-2" />
                  加载中...
                </td>
              </tr>
            ) : taskErrors.length === 0 ? (
              <tr>
                <td colSpan={6} className="text-center py-12 text-white/40">
                  暂无任务错误记录
                </td>
              </tr>
            ) : (
              taskErrors.map(job => (
                <React.Fragment key={job.id}>
                  <tr
                    className="border-b border-white/5 hover:bg-white/3 cursor-pointer transition-colors"
                    onClick={() => setTaskExpandedId(taskExpandedId === job.id ? null : job.id)}
                  >
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
                    <td className="px-4 py-3 text-xs text-white/50">
                      <div className="flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {formatDate(job.created_at)}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleUpdateTaskStatus(job.id, !job.is_consumed);
                        }}
                        disabled={taskUpdatingId === job.id}
                        className={`text-xs px-2.5 py-1.5 rounded-full flex items-center gap-1.5 transition-all cursor-pointer hover:scale-105 ${
                          job.is_consumed
                            ? 'bg-green-500/20 text-green-400 hover:bg-green-500/30'
                            : 'bg-amber-500/20 text-amber-400 hover:bg-amber-500/30'
                        } ${taskUpdatingId === job.id ? 'opacity-50' : ''}`}
                      >
                        {taskUpdatingId === job.id ? (
                          <RefreshCw className="w-3 h-3 animate-spin" />
                        ) : job.is_consumed ? (
                          <CheckCircle className="w-3 h-3" />
                        ) : (
                          <Clock className="w-3 h-3" />
                        )}
                        {job.is_consumed ? '已处理' : '待处理'}
                      </button>
                    </td>
                  </tr>
                  {taskExpandedId === job.id && (
                    <tr className="bg-white/2">
                      <td colSpan={6} className="px-6 py-4">
                        <div className="text-sm space-y-2">
                          <div>
                            <span className="text-white/40">完整错误：</span>
                            <span className="text-red-400">{job.error_message || '无'}</span>
                          </div>
                          <div>
                            <span className="text-white/40">更新时间：</span>
                            <span className="text-white/70">{formatDate(job.updated_at)}</span>
                          </div>
                          {job.input_params && (
                            <div>
                              <span className="text-white/40">输入参数：</span>
                              <pre className="mt-1 text-xs text-white/60 bg-black/30 p-3 rounded-lg overflow-x-auto max-h-40">
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
          <span className="text-sm text-white/40">
            第 {taskPagination.page} / {taskPagination.totalPages} 页
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={() => fetchTaskErrors(taskPagination.page - 1)}
              disabled={taskPagination.page <= 1}
              className="p-2 rounded-lg bg-white/5 text-white/60 hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button
              onClick={() => fetchTaskErrors(taskPagination.page + 1)}
              disabled={taskPagination.page >= taskPagination.totalPages}
              className="p-2 rounded-lg bg-white/5 text-white/60 hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </>
  );

  // 渲染系统错误表格
  // [虚拟列表评估] 不适用 useVirtualList：已实现服务端分页（每页 20 条），无需虚拟化
  const renderSystemErrors = () => (
    <>
      {/* 筛选 */}
      <div className="flex items-center gap-3 mb-4">
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-white/5 border border-white/10">
          <Filter className="w-4 h-4 text-white/40" />
          <select
            value={systemTypeFilter}
            onChange={e => setSystemTypeFilter(e.target.value)}
            className="bg-transparent text-sm text-white/80 outline-none"
          >
            <option value="" className="bg-[#1a1a2e]">全部类型</option>
            {Object.entries(ERROR_TYPE_NAMES).map(([key, label]) => (
              <option key={key} value={key} className="bg-[#1a1a2e]">{label}</option>
            ))}
          </select>
        </div>
        <span className="text-sm text-white/40">
          共 {systemPagination.total} 条错误记录
        </span>
      </div>

      {/* 表格 */}
      <div className="rounded-xl border border-white/10 overflow-hidden bg-white/3">
        <table className="w-full">
          <thead>
            <tr className="border-b border-white/10 bg-white/5">
              <th className="text-left px-4 py-3 text-xs font-semibold text-white/50 uppercase tracking-wider">ID</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-white/50 uppercase tracking-wider">类型</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-white/50 uppercase tracking-wider">来源</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-white/50 uppercase tracking-wider">错误信息</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-white/50 uppercase tracking-wider">时间</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-white/50 uppercase tracking-wider">状态</th>
            </tr>
          </thead>
          <tbody>
            {systemLoading && systemErrors.length === 0 ? (
              <tr>
                <td colSpan={6} className="text-center py-12 text-white/40">
                  <RefreshCw className="w-5 h-5 animate-spin mx-auto mb-2" />
                  加载中...
                </td>
              </tr>
            ) : systemErrors.length === 0 ? (
              <tr>
                <td colSpan={6} className="text-center py-12 text-white/40">
                  暂无系统错误记录
                </td>
              </tr>
            ) : (
              systemErrors.map(error => (
                <React.Fragment key={error.id}>
                  <tr
                    className="border-b border-white/5 hover:bg-white/3 cursor-pointer transition-colors"
                    onClick={() => setSystemExpandedId(systemExpandedId === error.id ? null : error.id)}
                  >
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
                    <td className="px-4 py-3 text-xs text-white/50">
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
                        className={`text-xs px-2.5 py-1.5 rounded-full flex items-center gap-1.5 transition-all cursor-pointer hover:scale-105 ${
                          error.is_resolved
                            ? 'bg-green-500/20 text-green-400 hover:bg-green-500/30'
                            : 'bg-amber-500/20 text-amber-400 hover:bg-amber-500/30'
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
                    <tr className="bg-white/2">
                      <td colSpan={6} className="px-6 py-4">
                        <div className="text-sm space-y-3">
                          <div>
                            <span className="text-white/40">完整错误：</span>
                            <span className="text-red-400">{error.error_message || '无'}</span>
                          </div>
                          {error.error_stack && (
                            <div>
                              <span className="text-white/40">错误堆栈：</span>
                              <pre className="mt-1 text-xs text-white/60 bg-black/30 p-3 rounded-lg overflow-x-auto max-h-40 whitespace-pre-wrap">
                                {error.error_stack}
                              </pre>
                            </div>
                          )}
                          {error.request_url && (
                            <div>
                              <span className="text-white/40">请求：</span>
                              <span className="text-white/70 font-mono">
                                {error.request_method} {error.request_url}
                              </span>
                            </div>
                          )}
                          {error.user_email && (
                            <div>
                              <span className="text-white/40">用户：</span>
                              <span className="text-white/70">{error.user_email}</span>
                            </div>
                          )}
                          {error.resolved_by && (
                            <div>
                              <span className="text-white/40">处理人：</span>
                              <span className="text-white/70">{error.resolved_by}</span>
                              {error.resolved_at && (
                                <span className="text-white/50 ml-2">({formatDate(error.resolved_at)})</span>
                              )}
                            </div>
                          )}
                          {error.extra_context && Object.keys(error.extra_context).length > 0 && (
                            <div>
                              <span className="text-white/40">额外信息：</span>
                              <pre className="mt-1 text-xs text-white/60 bg-black/30 p-3 rounded-lg overflow-x-auto max-h-32">
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
          <span className="text-sm text-white/40">
            第 {systemPagination.page} / {systemPagination.totalPages} 页
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={() => fetchSystemErrors(systemPagination.page - 1)}
              disabled={systemPagination.page <= 1}
              className="p-2 rounded-lg bg-white/5 text-white/60 hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button
              onClick={() => fetchSystemErrors(systemPagination.page + 1)}
              disabled={systemPagination.page >= systemPagination.totalPages}
              className="p-2 rounded-lg bg-white/5 text-white/60 hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </>
  );

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
              <p className="text-sm text-white/50">监控任务错误和系统错误</p>
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
        {activeTab === 'task' ? renderTaskErrors() : renderSystemErrors()}
      </div>
    </div>
  );
};

export default ErrorMonitor;
