import React, { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, RotateCcw, ListTodo, Minus, GripHorizontal } from 'lucide-react';
import { getAuthToken } from '../../services/auth';
import { consumeWorkflow } from '../../hooks/useWorkflow';
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
const BUBBLE_SIZE = 48;
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
  const hasViewedFailures = useRef(false);

  const {
    jobs,
    loading,
    isExpanded,
    setIsExpanded,
    fetchJobs,
    getJobProgress,
  } = useTaskQueue({
    onJobFailed: (job) => {
      hasViewedFailures.current = false;
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
  const showFailedBadge = hasFailedJobs && !hasViewedFailures.current;

  // 计算整体进度
  const overallProgress = jobs.length > 0
    ? Math.round(jobs.reduce((sum, job) => sum + getJobProgress(job), 0) / jobs.length)
    : 0;

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

  // 未登录不显示 - 必须在所有 Hooks 之后
  if (!getAuthToken()) return null;

  return (
    <>
      <style>{scrollbarStyles}</style>

      <AnimatePresence mode="wait">
        {!isExpanded ? (
          /* 收起态 - 悬浮球 */
          <motion.button
            key="bubble"
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: [0.4, 0, 0.2, 1] }}
            onClick={() => {
              setIsExpanded(true);
              fetchJobs(true);
              if (hasFailedJobs) hasViewedFailures.current = true;
            }}
            className="fixed z-40 flex items-center justify-center rounded-full shadow-lg cursor-pointer"
            style={{
              bottom: STATUS_BAR_HEIGHT + 16,
              right: 20,
              width: BUBBLE_SIZE,
              height: BUBBLE_SIZE,
              background: 'linear-gradient(135deg, #f472b6, #60a5fa)',
            }}
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.95 }}
            title="展开任务队列"
          >
            {/* 图标 */}
            <ListTodo className="w-5 h-5 text-white" />

            {/* 失败红点 */}
            {showFailedBadge && (
              <motion.span
                animate={{ scale: [1, 1.3, 1] }}
                transition={{ duration: 1.2, repeat: Infinity }}
                className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] flex items-center justify-center rounded-full text-[10px] font-bold text-white px-1"
                style={{ backgroundColor: '#ef4444', boxShadow: '0 0 6px rgba(239,68,68,0.5)' }}
              >
                {failedCount}
              </motion.span>
            )}

            {/* 活跃任务角标（无失败时显示） */}
            {!showFailedBadge && activeCount > 0 && (
              <span
                className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] flex items-center justify-center rounded-full text-[10px] font-bold text-white px-1"
                style={{ backgroundColor: 'var(--accent)' }}
              >
                {activeCount}
              </span>
            )}

            {/* 环形进度（运行中时） */}
            {activeCount > 0 && (
              <svg
                className="absolute inset-0"
                width={BUBBLE_SIZE}
                height={BUBBLE_SIZE}
                style={{ transform: 'rotate(-90deg)' }}
              >
                <circle
                  cx={BUBBLE_SIZE / 2}
                  cy={BUBBLE_SIZE / 2}
                  r={BUBBLE_SIZE / 2 - 2}
                  fill="none"
                  stroke="rgba(255,255,255,0.3)"
                  strokeWidth={2.5}
                />
                <motion.circle
                  cx={BUBBLE_SIZE / 2}
                  cy={BUBBLE_SIZE / 2}
                  r={BUBBLE_SIZE / 2 - 2}
                  fill="none"
                  stroke="#fff"
                  strokeWidth={2.5}
                  strokeLinecap="round"
                  strokeDasharray={Math.PI * (BUBBLE_SIZE - 4)}
                  animate={{ strokeDashoffset: Math.PI * (BUBBLE_SIZE - 4) * (1 - overallProgress / 100) }}
                  transition={{ duration: 0.4, ease: 'easeOut' }}
                />
              </svg>
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
              backgroundColor: 'var(--bg-app)',
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
                backgroundColor: 'var(--bg-app)',
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
            {/* 
              [虚拟列表评估] 不适用 useVirtualList，原因：
              1. 使用 AnimatePresence + motion 动画实现任务进出过渡效果，与虚拟列表的绝对定位机制冲突
              2. 任务队列通常数量有限（运行中 + 等待中），不太可能超过 50 项
              3. 面板高度由用户拖拽动态调整，虚拟列表需要稳定的容器高度
            */}
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
                        onDismiss={async () => {
                          try {
                            await consumeWorkflow(job.id);
                            fetchJobs(false);
                          } catch (err) {
                            console.error('[TaskQueue] 删除任务失败:', err);
                          }
                        }}
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
                {failedCount > 0 && (
                  <span style={{ color: 'var(--danger)', fontWeight: 500 }}>{failedCount} 失败</span>
                )}
                {failedCount > 0 && runningCount > 0 && ' · '}
                {runningCount > 0 && `${runningCount} 运行中`}
                {runningCount > 0 && pendingCount > 0 && ' · '}
                {pendingCount > 0 && `${pendingCount} 等待中`}
                {activeCount === 0 && failedCount === 0 && '无活跃任务'}
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
