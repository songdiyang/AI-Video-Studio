import React, { useState, useEffect, useCallback } from 'react';
import { AlertTriangle, Search, Filter, ChevronLeft, ChevronRight, RefreshCw, Clock, XCircle } from 'lucide-react';
import { getAdminAuthHeaders } from '../../services/auth';

interface ErrorJob {
  id: number;
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

const formatDate = (dateStr: string) => {
  const d = new Date(dateStr);
  return d.toLocaleString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
};

const TaskErrorMonitor: React.FC = () => {
  const [jobs, setJobs] = useState<ErrorJob[]>([]);
  const [pagination, setPagination] = useState<Pagination>({ page: 1, limit: 20, total: 0, totalPages: 0 });
  const [loading, setLoading] = useState(false);
  const [typeFilter, setTypeFilter] = useState('');
  const [expandedId, setExpandedId] = useState<number | null>(null);

  const fetchErrors = useCallback(async (page = 1) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), limit: '20' });
      if (typeFilter) params.append('workflowType', typeFilter);
      const res = await fetch(`/api/workflows/admin/errors?${params}`, { headers: getAdminAuthHeaders() });
      if (!res.ok) throw new Error('请求失败');
      const data = await res.json();
      setJobs(data.jobs || []);
      setPagination(data.pagination || { page: 1, limit: 20, total: 0, totalPages: 0 });
    } catch (err) {
      console.error('[TaskErrorMonitor] 获取失败:', err);
    } finally {
      setLoading(false);
    }
  }, [typeFilter]);

  useEffect(() => {
    fetchErrors(1);
  }, [fetchErrors]);

  const uniqueTypes = [...new Set(jobs.map(j => j.workflow_type))];

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
              <h1 className="text-xl font-bold text-white">任务错误监控</h1>
              <p className="text-sm text-white/50">监控所有用户的失败任务</p>
            </div>
          </div>
          <button
            onClick={() => fetchErrors(pagination.page)}
            disabled={loading}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-white/10 text-white/80 hover:bg-white/15 transition-colors text-sm"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            刷新
          </button>
        </div>

        {/* 筛选 */}
        <div className="flex items-center gap-3 mb-4">
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-white/5 border border-white/10">
            <Filter className="w-4 h-4 text-white/40" />
            <select
              value={typeFilter}
              onChange={e => setTypeFilter(e.target.value)}
              className="bg-transparent text-sm text-white/80 outline-none"
            >
              <option value="" className="bg-[#1a1a2e]">全部类型</option>
              {Object.entries(WORKFLOW_TYPE_NAMES).map(([key, label]) => (
                <option key={key} value={key} className="bg-[#1a1a2e]">{label}</option>
              ))}
            </select>
          </div>
          <span className="text-sm text-white/40">
            共 {pagination.total} 条错误记录
          </span>
        </div>

        {/* 表格 */}
        <div className="rounded-xl border border-white/10 overflow-hidden bg-white/[0.03]">
          <table className="w-full">
            <thead>
              <tr className="border-b border-white/10 bg-white/[0.05]">
                <th className="text-left px-4 py-3 text-xs font-semibold text-white/50 uppercase tracking-wider">ID</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-white/50 uppercase tracking-wider">用户</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-white/50 uppercase tracking-wider">任务类型</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-white/50 uppercase tracking-wider">错误信息</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-white/50 uppercase tracking-wider">时间</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-white/50 uppercase tracking-wider">状态</th>
              </tr>
            </thead>
            <tbody>
              {loading && jobs.length === 0 ? (
                <tr>
                  <td colSpan={6} className="text-center py-12 text-white/40">
                    <RefreshCw className="w-5 h-5 animate-spin mx-auto mb-2" />
                    加载中...
                  </td>
                </tr>
              ) : jobs.length === 0 ? (
                <tr>
                  <td colSpan={6} className="text-center py-12 text-white/40">
                    暂无错误记录
                  </td>
                </tr>
              ) : (
                jobs.map(job => (
                  <React.Fragment key={job.id}>
                    <tr
                      className="border-b border-white/5 hover:bg-white/[0.03] cursor-pointer transition-colors"
                      onClick={() => setExpandedId(expandedId === job.id ? null : job.id)}
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
                        <span className={`text-xs px-2 py-1 rounded-full ${
                          job.is_consumed
                            ? 'bg-white/10 text-white/40'
                            : 'bg-red-500/20 text-red-400'
                        }`}>
                          {job.is_consumed ? '已处理' : '未处理'}
                        </span>
                      </td>
                    </tr>
                    {expandedId === job.id && (
                      <tr className="bg-white/[0.02]">
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
        {pagination.totalPages > 1 && (
          <div className="flex items-center justify-between mt-4">
            <span className="text-sm text-white/40">
              第 {pagination.page} / {pagination.totalPages} 页
            </span>
            <div className="flex items-center gap-2">
              <button
                onClick={() => fetchErrors(pagination.page - 1)}
                disabled={pagination.page <= 1}
                className="p-2 rounded-lg bg-white/5 text-white/60 hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                onClick={() => fetchErrors(pagination.page + 1)}
                disabled={pagination.page >= pagination.totalPages}
                className="p-2 rounded-lg bg-white/5 text-white/60 hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
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

export default TaskErrorMonitor;
