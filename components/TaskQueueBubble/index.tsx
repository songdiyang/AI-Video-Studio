import React, { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, RotateCcw, ListTodo, Minus, GripHorizontal } from 'lucide-react';
import { getAuthToken } from '../../services/auth';
import { useToast } from '../../contexts/ToastContext';
import { useTaskQueue } from './useTaskQueue';
import TaskItem, { getTaskName } from './TaskItem';
import CompletedSection from './CompletedSection';

// 自定义滚动条样式
const scrollbarStyles = `
  .task-panel-scrollbar::-webkit-scrollbar {
    width: 6px;
  }
  .task-panel-scrollbar::-webkit-scrollbar-track {
    background: transparent;
  }
  .task-panel-scrollbar::-webkit-scrollbar-thumb {
    background: rgba(100, 116, 139, 0.4);
    border-radius: 3px;
  }
  .task-panel-scrollbar::-webkit-scrollbar-thumb:hover {
    background: rgba(100, 116, 139, 0.6);
  }
`;

// 布局常量
const STATUS_BAR_HEIGHT = 28;
const SIDEBAR_WIDTH = 56;
const MIN_PANEL_HEIGHT = 150;
const MAX_PANEL_HEIGHT = 500;
const DEFAULT_PANEL_HEIGHT = 250;
const INDICATOR_WIDTH = 180;
const INDICATOR_HEIGHT = 32;
const HEADER_HEIGHT = 36;

// 状态颜色
const getStatusColor = (status: string) => {
  switch (status) {
    case 'running': return 'text-[var(--accent)]';
    case 'pending': return 'text-[var(--warning)]';
    case 'completed': return 'text-[var(--success)]';
    case 'failed': return 'text-[var(--danger)]';
    case 'cancelled': return 'text-[var(--text-muted)]';
    default: return 'text-[var(--text-muted)]';
  }
};

const getStatusLabel = (status: string) => {
  switch (status) {
    case 'running': return '运行中';
    case 'pending': return '等待中';
    case 'completed': return '已完成';
    case 'failed': return '失败';
    case 'cancelled': return '已取消';
    default: return status;
  }
};

const TaskQueueBubble: React.FC = () => {
  const [panelHeight, setPanelHeight] = useState(DEFAULT_PANEL_HEIGHT);
  const [isResizing, setIsResizing] = useState(false);
  const resizeStartY = useRef(0);
  const resizeStartHeight = useRef(0);
  const { showToast } = useToast();

  const {
    jobs,
    loading,
    isExpanded,
    setIsExpanded,
    fetchJobs,
    getJobProgress,
  } = useTaskQueue({
    onJobFailed: (job) => {
      const name = getTaskName(job);
      const reason = job.error_message || '未知错误';
      showToast(`「${name}」执行失败：${reason}`, 'error');
    }
  });

  // 计算运行中的任务数
  const runningCount = jobs.filter(j => j.status === 'running').length;
  const pendingCount = jobs.filter(j => j.status === 'pending').length;
  const failedCount = jobs.filter(j => j.status === 'failed').length;
  const activeCount = runningCount + pendingCount;
  const hasFailedJobs = failedCount > 0;

  // 计算整体进度
  const overallProgress = jobs.length > 0
    ? Math.round(jobs.reduce((sum, job) => sum + getJobProgress(job), 0) / jobs.length)
    : 0;

  // 未登录不显示
  if (!getAuthToken()) return null;

  // 面板高度调整
  const handleResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsResizing(true);
    resizeStartY.current = e.clientY;
    resizeStartHeight.current = panelHeight;
  }, [panelHeight]);

  const handleResizeMove = useCallback((e: MouseEvent) => {
    if (!isResizing) return;
    const deltaY = resizeStartY.current - e.clientY;
    const newHeight = Math.min(MAX_PANEL_HEIGHT, Math.max(MIN_PANEL_HEIGHT, resizeStartHeight.current + deltaY));
    setPanelHeight(newHeight);
  }, [isResizing]);

  const handleResizeEnd = useCallback(() => {
    setIsResizing(false);
  }, []);

  useEffect(() => {
    if (isResizing) {
      document.addEventListener('mousemove', handleResizeMove);
      document.addEventListener('mouseup', handleResizeEnd);
      document.body.style.cursor = 'ns-resize';
      document.body.style.userSelect = 'none';
      return () => {
        document.removeEventListener('mousemove', handleResizeMove);
        document.removeEventListener('mouseup', handleResizeEnd);
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
      };
    }
  }, [isResizing, handleResizeMove, handleResizeEnd]);

  return (
    <>
      <style>{scrollbarStyles}</style>

      <AnimatePresence mode="wait">
        {!isExpanded ? (
          /* 收起态 - 状态指示器 */
          <motion.button
            key="indicator"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 10 }}
            transition={{ duration: 0.2 }}
            onClick={() => {
              setIsExpanded(true);
              fetchJobs(true);
            }}
            className="fixed z-40 flex items-center gap-2 px-3 rounded-t-lg transition-colors"
            style={{
              bottom: STATUS_BAR_HEIGHT,
              right: 16,
              width: INDICATOR_WIDTH,
              height: INDICATOR_HEIGHT,
              backgroundColor: 'var(--bg-nav)',
              borderTop: '1px solid var(--border)',
              borderLeft: '1px solid var(--border)',
              borderRight: '1px solid var(--border)',
            }}
            title="展开任务队列"
          >
            {/* 任务图标 */}
            <div className="relative">
              <ListTodo className="w-4 h-4" style={{ color: 'var(--text-secondary)' }} />
              {/* 失败任务指示器（优先显示） */}
              {hasFailedJobs && (
                <motion.span
                  animate={{ scale: [1, 1.2, 1] }}
                  transition={{ duration: 1.5, repeat: Infinity }}
                  className="absolute -top-1 -right-1 w-2 h-2 rounded-full"
                  style={{ backgroundColor: 'var(--danger)' }}
                />
              )}
              {/* 活跃任务指示器（仅在无失败任务时显示） */}
              {!hasFailedJobs && activeCount > 0 && (
                <motion.span
                  animate={{ scale: [1, 1.2, 1] }}
                  transition={{ duration: 2, repeat: Infinity }}
                  className="absolute -top-1 -right-1 w-2 h-2 rounded-full"
                  style={{ backgroundColor: 'var(--accent)' }}
                />
              )}
            </div>

            {/* 任务数量 */}
            <span className="text-xs font-medium" style={{ color: 'var(--text-primary)' }}>
              {activeCount > 0 ? `${activeCount} 任务` : '无任务'}
            </span>

            {/* 微型进度条 */}
            {activeCount > 0 && (
              <div className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ backgroundColor: 'var(--bg-secondary)' }}>
                <motion.div
                  className="h-full rounded-full"
                  style={{ backgroundColor: 'var(--accent)' }}
                  initial={{ width: 0 }}
                  animate={{ width: `${overallProgress}%` }}
                  transition={{ duration: 0.3, ease: 'easeOut' }}
                />
              </div>
            )}
          </motion.button>
        ) : (
          /* 展开态 - 任务面板 */
          <motion.div
            key="panel"
            initial={{ y: '100%', opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: '100%', opacity: 0 }}
            transition={{ duration: 0.25, ease: [0.4, 0, 0.2, 1] }}
            className="fixed z-40 flex flex-col shadow-2xl"
            style={{
              bottom: STATUS_BAR_HEIGHT,
              left: SIDEBAR_WIDTH,
              right: 0,
              height: panelHeight,
              backgroundColor: 'var(--bg-secondary)',
              borderTop: '1px solid var(--border)',
            }}
          >
            {/* 调整大小手柄 */}
            <div
              onMouseDown={handleResizeStart}
              className="absolute top-0 left-0 right-0 h-1.5 cursor-ns-resize group flex items-center justify-center"
              style={{ marginTop: -3 }}
            >
              <div
                className="w-12 h-1 rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                style={{ backgroundColor: 'var(--border)' }}
              />
            </div>

            {/* 标题栏 */}
            <div
              className="flex items-center justify-between px-4 shrink-0"
              style={{
                height: HEADER_HEIGHT,
                backgroundColor: 'var(--bg-nav)',
                borderBottom: '1px solid var(--border)',
              }}
            >
              <div className="flex items-center gap-2">
                <ListTodo className="w-4 h-4" style={{ color: 'var(--text-secondary)' }} />
                <span className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                  任务队列
                </span>
                {activeCount > 0 && (
                  <span
                    className="text-xs px-1.5 py-0.5 rounded"
                    style={{
                      backgroundColor: 'var(--accent)',
                      color: '#fff',
                    }}
                  >
                    {activeCount}
                  </span>
                )}
              </div>

              <div className="flex items-center gap-1">
                <button
                  onClick={() => fetchJobs(true)}
                  className="p-1.5 rounded hover:bg-white/5 transition-colors"
                  style={{ color: 'var(--text-secondary)' }}
                  title="刷新"
                >
                  <RotateCcw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
                </button>
                <button
                  onClick={() => setIsExpanded(false)}
                  className="p-1.5 rounded hover:bg-white/5 transition-colors"
                  style={{ color: 'var(--text-secondary)' }}
                  title="收起"
                >
                  <Minus className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {/* 任务列表 */}
            <div className="flex-1 overflow-y-auto p-3 task-panel-scrollbar">
              {loading && jobs.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full gap-2">
                  <motion.div
                    animate={{ rotate: 360 }}
                    transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                    className="w-5 h-5 border-2 rounded-full"
                    style={{
                      borderColor: 'var(--border)',
                      borderTopColor: 'var(--accent)',
                    }}
                  />
                  <span className="text-sm" style={{ color: 'var(--text-muted)' }}>加载中...</span>
                </div>
              ) : jobs.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full gap-2">
                  <ListTodo className="w-8 h-8" style={{ color: 'var(--text-muted)', opacity: 0.5 }} />
                  <span className="text-sm" style={{ color: 'var(--text-muted)' }}>暂无运行中的任务</span>
                </div>
              ) : (
                <div className="space-y-1.5">
                  <AnimatePresence mode="popLayout">
                    {jobs.map((job, index) => (
                      <TaskItem
                        key={job.id}
                        job={job}
                        progress={getJobProgress(job)}
                        statusColor={getStatusColor(job.status)}
                        statusLabel={getStatusLabel(job.status)}
                        onCancelled={() => fetchJobs(false)}
                        index={index}
                      />
                    ))}
                  </AnimatePresence>
                </div>
              )}
            </div>

            {/* 底部状态栏 */}
            <div
              className="flex items-center justify-between px-4 py-1.5 shrink-0"
              style={{
                borderTop: '1px solid var(--border)',
                backgroundColor: 'var(--bg-nav)',
              }}
            >
              <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
                {runningCount > 0 && `${runningCount} 运行中`}
                {runningCount > 0 && pendingCount > 0 && ' · '}
                {pendingCount > 0 && `${pendingCount} 等待中`}
                {activeCount === 0 && '无活跃任务'}
              </span>
              {activeCount > 0 && (
                <span className="text-xs font-medium" style={{ color: 'var(--accent)' }}>
                  {overallProgress}%
                </span>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
};

export default TaskQueueBubble;
