/**
 * VSCode 式底部任务面板
 * ──────────────────────────────────────────────────────────────
 * 复用 TaskQueueBubble 的 useTaskQueue 数据 Hook 与 TaskItem 渲染，
 * 以底部可折叠面板形式呈现（替代原悬浮球）。
 * 高度可拖拽（上缘手柄），由 WorkbenchContext.bottomPanelOpen 控制显隐。
 */
import React, { useRef, useCallback, useState, useEffect } from 'react';
import { X, RotateCcw, ListTodo } from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';
import { useWorkbench } from '../../contexts/WorkbenchContext';
import { useLanguage } from '../../contexts/LanguageContext';
import { useToast } from '../../contexts/ToastContext';
import { consumeWorkflow, consumeAllFailed } from '../../hooks/useWorkflow';
import { useTaskQueue } from '../TaskQueueBubble/useTaskQueue';
import TaskItem, { getTaskName } from '../TaskQueueBubble/TaskItem';

const MIN_H = 120;
const MAX_H = 480;
const DEFAULT_H = 220;
const STORAGE_KEY = 'vscode_bottom_panel_height';

// 状态样式（与 TaskQueueBubble 一致，Tailwind class）
const getStatusColor = (status: string) => {
  switch (status) {
    case 'running': return 'text-[var(--accent)]';
    case 'pending': return 'text-[var(--warning)]';
    case 'completed': return 'text-[var(--success)]';
    case 'failed': return 'text-[var(--danger)]';
    default: return 'text-[var(--text-muted)]';
  }
};
const BottomTaskPanel: React.FC = () => {
  const { bottomPanelOpen, setBottomPanelOpen } = useWorkbench();
  const { showToast } = useToast();
  const { t } = useLanguage();

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'running': return t.frame.taskPanel.running;
      case 'pending': return t.frame.taskPanel.pending;
      case 'completed': return t.frame.taskPanel.completed;
      case 'failed': return t.frame.taskPanel.failed;
      case 'cancelled': return t.frame.taskPanel.cancelled;
      default: return status;
    }
  };

  // 面板高度（拖拽持久化）
  const [height, setHeight] = useState(() => {
    try {
      const saved = Number(localStorage.getItem(STORAGE_KEY));
      if (Number.isFinite(saved) && saved >= MIN_H && saved <= MAX_H) return saved;
    } catch { /* 忽略 */ }
    return DEFAULT_H;
  });
  const [isDragging, setIsDragging] = useState(false);
  const heightRef = useRef(height);
  heightRef.current = height;

  useEffect(() => {
    if (isDragging) return;
    try { localStorage.setItem(STORAGE_KEY, String(height)); } catch { /* 忽略 */ }
  }, [height, isDragging]);

  const startDrag = useCallback((e: React.PointerEvent) => {
    if (e.button !== 0) return;
    e.preventDefault();
    const startY = e.clientY;
    const startH = heightRef.current;
    setIsDragging(true);
    document.body.style.cursor = 'row-resize';
    document.body.style.userSelect = 'none';
    const onMove = (ev: PointerEvent) => {
      const dy = startY - ev.clientY; // 向上拖增高
      setHeight(Math.min(MAX_H, Math.max(MIN_H, Math.round(startH + dy))));
    };
    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      setIsDragging(false);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  }, []);

  const { jobs, loading, fetchJobs, getJobProgress } = useTaskQueue({
    onJobFailed: (job) => {
      const name = getTaskName(job, t);
      const reason = job.error_message || t.frame.taskPanel.unknownError;
      showToast(
        t.frame.taskPanel.failedToast.replace('{name}', name).replace('{reason}', reason),
        'error',
      );
    },
  });

  const runningCount = jobs.filter(j => j.status === 'running').length;
  const pendingCount = jobs.filter(j => j.status === 'pending').length;
  const failedCount = jobs.filter(j => j.status === 'failed').length;
  const activeCount = runningCount + pendingCount;

  return (
    <AnimatePresence>
      {bottomPanelOpen && (
        <motion.div
          key="bottom-task-panel"
          initial={{ height: 0, opacity: 0 }}
          animate={{ height, opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          transition={{ duration: 0.18, ease: 'easeOut' }}
          className="relative shrink-0 flex flex-col bg-(--bg-nav) border-t border-(--border-color) overflow-hidden"
          style={{ height }}
        >
          {/* 顶部拖拽手柄 */}
          <div
            onPointerDown={startDrag}
            role="separator"
            aria-orientation="horizontal"
            title={t.frame.taskPanel.dragResize}
            className={`absolute top-0 left-0 right-0 h-1.25 z-10 cursor-row-resize transition-colors ${
              isDragging ? 'bg-(--accent)/60' : 'hover:bg-(--accent)/40'
            }`}
          />

          {/* 标题栏 */}
          <div className="flex items-center justify-between px-3 h-9 border-b border-(--border-color) shrink-0 select-none">
            <div className="flex items-center gap-2">
              <ListTodo className="w-4 h-4 text-(--text-secondary)" />
              <span className="text-xs font-medium uppercase tracking-wider text-(--text-muted)">{t.frame.taskPanel.queue}</span>
              {activeCount > 0 && (
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-(--accent) text-white">{activeCount}</span>
              )}
            </div>
            <div className="flex items-center gap-0.5">
              <button
                onClick={() => fetchJobs(true)}
                className="p-1.5 rounded-md text-(--text-muted) hover:text-(--text-primary) hover:bg-white/5 transition-colors"
                title={t.frame.taskPanel.refresh}
              >
                <RotateCcw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
              </button>
              <button
                onClick={() => setBottomPanelOpen(false)}
                className="p-1.5 rounded-md text-(--text-muted) hover:text-(--text-primary) hover:bg-white/5 transition-colors"
                title={t.frame.taskPanel.collapse}
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* 任务列表 */}
          <div className="flex-1 overflow-y-auto p-3 min-h-0">
            {loading && jobs.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 gap-2">
                <div className="w-5 h-5 border-2 border-(--border-color) border-t-(--accent) rounded-full animate-spin" />
                <span className="text-sm text-(--text-muted)">{t.frame.taskPanel.loading}</span>
              </div>
            ) : jobs.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 gap-2">
                <ListTodo className="w-8 h-8 text-(--text-muted) opacity-50" />
                <span className="text-sm text-(--text-muted)">{t.frame.taskPanel.noRunning}</span>
              </div>
            ) : (
              <div className="space-y-1.5">
                {jobs.map((job, index) => (
                  <TaskItem
                    key={job.id}
                    job={job}
                    progress={getJobProgress(job)}
                    statusColor={getStatusColor(job.status)}
                    statusLabel={getStatusLabel(job.status)}
                    onCancelled={() => fetchJobs(false)}
                    onDismiss={async () => {
                      try { await consumeWorkflow(job.id); fetchJobs(false); }
                      catch (err) { console.error('[TaskPanel] 删除任务失败:', err); }
                    }}
                    index={index}
                  />
                ))}
              </div>
            )}
          </div>

          {/* 底部状态条 */}
          <div className="flex items-center justify-between px-3 py-1 shrink-0 border-t border-(--border-color)">
            <span className="text-xs text-(--text-muted) flex items-center gap-1">
              {failedCount > 0 && (
                <>
                  <span className="text-(--danger) font-medium">{t.frame.taskPanel.failedCount.replace('{n}', String(failedCount))}</span>
                  <button
                    onClick={async () => {
                      try { await consumeAllFailed(); fetchJobs(false); }
                      catch (err) { console.error('[TaskPanel] 批量清除失败:', err); }
                    }}
                    className="px-1 rounded text-[10px] text-(--danger) opacity-70 hover:opacity-100"
                    title={t.frame.taskPanel.clearAllFailed}
                  >
                    {t.frame.taskPanel.clear}
                  </button>
                </>
              )}
              {failedCount > 0 && runningCount > 0 && ' · '}
              {runningCount > 0 && t.frame.taskPanel.runningCount.replace('{n}', String(runningCount))}
              {runningCount > 0 && pendingCount > 0 && ' · '}
              {pendingCount > 0 && t.frame.taskPanel.pendingCount.replace('{n}', String(pendingCount))}
              {activeCount === 0 && failedCount === 0 && t.frame.taskPanel.noActive}
            </span>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default BottomTaskPanel;
