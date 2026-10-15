import React, { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence, useMotionValue, useSpring, useTransform } from 'framer-motion';
import { X, RotateCcw, ListTodo } from 'lucide-react';
import { getAuthToken } from '../../services/auth';
import { consumeWorkflow, consumeAllFailed } from '../../hooks/useWorkflow';
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
const BUBBLE_SIZE = 48;
const BUBBLE_HIDDEN = BUBBLE_SIZE / 2 + 4; // 吸边后隐藏的宽度（露出一半）
const POPUP_WIDTH = 360;
const POPUP_MAX_HEIGHT = 420;
const HEADER_HEIGHT = 40;
const DRAG_THRESHOLD = 5;

// 弹簧配置 - QQ弹弹效果
const SNAP_SPRING = { type: 'spring' as const, stiffness: 400, damping: 22, mass: 0.8 };

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

type SnapSide = 'left' | 'right';

const TaskQueueBubble: React.FC = () => {
  // 吸附状态
  const [snapSide, setSnapSide] = useState<SnapSide>('right');
  const [snapY, setSnapY] = useState(0);
  const [initialized, setInitialized] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [isHovering, setIsHovering] = useState(false);
  const hasDragged = useRef(false);
  const dragStartPos = useRef({ x: 0, y: 0 });
  const dragCurrentPos = useRef({ x: 0, y: 0 });

  // 弹簧动画值 - 初始位置设为右下角，避免首帧闪烁
  const defaultX = typeof window !== 'undefined' ? window.innerWidth - BUBBLE_SIZE + BUBBLE_HIDDEN - BUBBLE_SIZE / 2 : 0;
  const defaultY = typeof window !== 'undefined' ? window.innerHeight - STATUS_BAR_HEIGHT - BUBBLE_SIZE - 20 : 0;
  const springX = useSpring(defaultX, SNAP_SPRING);
  const springY = useSpring(defaultY, SNAP_SPRING);

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
      // 积分不足错误显示特殊提示
      const isInsufficientPoints = reason.includes('积分不足') || reason.includes('INSUFFICIENT_POINTS');
      if (isInsufficientPoints) {
        showToast(`「${name}」积分不足，无法完成当前任务`, 'error');
      } else {
        showToast(`「${name}」执行失败：${reason}`, 'error');
      }
    }
  });

  // 计算吸附位置
  const getSnappedX = useCallback((side: SnapSide) => {
    return side === 'right'
      ? window.innerWidth - BUBBLE_SIZE + BUBBLE_HIDDEN - BUBBLE_SIZE / 2
      : -BUBBLE_HIDDEN + BUBBLE_SIZE / 2;
  }, []);

  // 初始化位置 - 直接同步设置，避免首帧闪到左上角
  useEffect(() => {
    if (!initialized) {
      const y = window.innerHeight - STATUS_BAR_HEIGHT - BUBBLE_SIZE - 20;
      setSnapY(y);
      setSnapSide('right');
      springX.jump(getSnappedX('right'));
      springY.jump(y);
      setInitialized(true);
    }
  }, [initialized, springX, springY, getSnappedX]);

  // 窗口大小变化
  useEffect(() => {
    const handleResize = () => {
      const maxY = window.innerHeight - STATUS_BAR_HEIGHT - BUBBLE_SIZE - 8;
      setSnapY(prev => {
        const clamped = Math.min(prev, maxY);
        springY.set(clamped);
        return clamped;
      });
      springX.set(getSnappedX(snapSide));
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [snapSide, springX, springY, getSnappedX]);

  // 计算运行中的任务数
  const runningCount = jobs.filter(j => j.status === 'running').length;
  const pendingCount = jobs.filter(j => j.status === 'pending').length;
  const failedCount = jobs.filter(j => j.status === 'failed').length;
  const activeCount = runningCount + pendingCount;
  const hasFailedJobs = failedCount > 0;
  const showFailedBadge = hasFailedJobs && !hasViewedFailures.current;

  const overallProgress = jobs.length > 0
    ? Math.round(jobs.reduce((sum, job) => sum + getJobProgress(job), 0) / jobs.length)
    : 0;

  // ---- 拖拽逻辑 ----
  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    e.preventDefault();
    hasDragged.current = false;
    dragStartPos.current = { x: e.clientX, y: e.clientY };
    dragCurrentPos.current = { x: springX.get(), y: springY.get() };
    setIsDragging(true);
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }, [springX, springY]);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!isDragging) return;
    const dx = e.clientX - dragStartPos.current.x;
    const dy = e.clientY - dragStartPos.current.y;

    if (!hasDragged.current && (Math.abs(dx) > DRAG_THRESHOLD || Math.abs(dy) > DRAG_THRESHOLD)) {
      hasDragged.current = true;
      // 拖拽开始时，如果面板是展开的，先收起
      if (isExpanded) setIsExpanded(false);
    }

    if (hasDragged.current) {
      const newX = dragCurrentPos.current.x + dx;
      const newY = Math.max(8, Math.min(
        window.innerHeight - STATUS_BAR_HEIGHT - BUBBLE_SIZE - 8,
        dragCurrentPos.current.y + dy
      ));
      // 拖拽时直接设值（跳过弹簧），保持手感跟手
      springX.jump(newX);
      springY.jump(newY);
    }
  }, [isDragging, isExpanded, setIsExpanded, springX, springY]);

  const handlePointerUp = useCallback((e: React.PointerEvent) => {
    setIsDragging(false);
    try { (e.target as HTMLElement).releasePointerCapture(e.pointerId); } catch {}

    if (!hasDragged.current) {
      // 没拖动 → 点击切换面板
      if (!isExpanded) {
        setIsExpanded(true);
        fetchJobs(true);
        if (hasFailedJobs) hasViewedFailures.current = true;
      } else {
        setIsExpanded(false);
      }
      return;
    }

    // 拖动结束 → 吸附到最近的左/右边
    const currentX = springX.get();
    const currentY = springY.get();
    const centerX = currentX + BUBBLE_SIZE / 2;
    const side: SnapSide = centerX < window.innerWidth / 2 ? 'left' : 'right';

    setSnapSide(side);
    setSnapY(currentY);
    // 弹簧动画吸附到边缘（QQ弹弹效果）
    springX.set(getSnappedX(side));
    springY.set(currentY);
  }, [isExpanded, hasFailedJobs, fetchJobs, setIsExpanded, springX, springY, getSnappedX]);

  // ---- 面板拖拽逻辑 ----
  const [panelOffset, setPanelOffset] = useState({ x: 0, y: 0 });
  const [isPanelDragging, setIsPanelDragging] = useState(false);
  const panelDragStart = useRef({ x: 0, y: 0, ox: 0, oy: 0 });

  const handlePanelPointerDown = useCallback((e: React.PointerEvent) => {
    // 只在标题栏拖拽，不拦截按钮点击
    if ((e.target as HTMLElement).closest('button')) return;
    e.preventDefault();
    setIsPanelDragging(true);
    panelDragStart.current = { x: e.clientX, y: e.clientY, ox: panelOffset.x, oy: panelOffset.y };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }, [panelOffset]);

  const handlePanelPointerMove = useCallback((e: React.PointerEvent) => {
    if (!isPanelDragging) return;
    const dx = e.clientX - panelDragStart.current.x;
    const dy = e.clientY - panelDragStart.current.y;
    setPanelOffset({ x: panelDragStart.current.ox + dx, y: panelDragStart.current.oy + dy });
  }, [isPanelDragging]);

  const handlePanelPointerUp = useCallback((e: React.PointerEvent) => {
    setIsPanelDragging(false);
    try { (e.target as HTMLElement).releasePointerCapture(e.pointerId); } catch {}
  }, []);

  // 展开时重置偏移
  useEffect(() => {
    if (isExpanded) setPanelOffset({ x: 0, y: 0 });
  }, [isExpanded]);

  // 计算弹窗位置
  const getPopupPosition = () => {
    const margin = 12;
    const bubbleVisibleX = snapSide === 'right'
      ? window.innerWidth - BUBBLE_SIZE + BUBBLE_HIDDEN - BUBBLE_SIZE / 2
      : -BUBBLE_HIDDEN + BUBBLE_SIZE / 2;

    let left: number;
    if (snapSide === 'right') {
      // 球在右边，弹窗在左边
      left = window.innerWidth - (BUBBLE_SIZE - BUBBLE_HIDDEN + BUBBLE_SIZE / 2) - POPUP_WIDTH - margin;
    } else {
      // 球在左边，弹窗在右边
      left = (BUBBLE_SIZE - BUBBLE_HIDDEN + BUBBLE_SIZE / 2) + margin;
    }
    left = Math.max(margin, Math.min(left, window.innerWidth - POPUP_WIDTH - margin));

    let top = snapY;
    if (top + POPUP_MAX_HEIGHT > window.innerHeight - STATUS_BAR_HEIGHT - margin) {
      top = window.innerHeight - STATUS_BAR_HEIGHT - POPUP_MAX_HEIGHT - margin;
    }
    if (top < margin) top = margin;

    return { left, top };
  };

  // 未登录不显示
  if (!getAuthToken()) return null;
  if (!initialized) return null;

  const popupPos = getPopupPosition();

  return (
    <>
      <style>{scrollbarStyles}</style>

      {/* 悬浮球 - 可拖拽 + 吸边 */}
      <motion.div
        initial={{ scale: 0, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        className="fixed z-[200] flex items-center justify-center rounded-full shadow-lg select-none"
        style={{
          x: springX,
          y: springY,
          width: BUBBLE_SIZE,
          height: BUBBLE_SIZE,
          background: isExpanded
            ? 'linear-gradient(135deg, #a78bfa, #60a5fa)'
            : 'linear-gradient(135deg, #f472b6, #60a5fa)',
          cursor: isDragging ? 'grabbing' : 'pointer',
          touchAction: 'none',
          // 没有拖拽时左右都为 auto，让 x 控制位置
          left: 0,
          top: 0,
        }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerEnter={() => setIsHovering(true)}
        onPointerLeave={() => { if (!isDragging) setIsHovering(false); }}
        title="任务队列（拖拽移动）"
      >
        {/* 悬停时完整显示的过渡效果 */}
        <motion.div
          className="absolute inset-0 rounded-full flex items-center justify-center"
          animate={{
            x: !isDragging && !isExpanded
              ? (isHovering ? (snapSide === 'right' ? -BUBBLE_HIDDEN + BUBBLE_SIZE / 2 : BUBBLE_HIDDEN - BUBBLE_SIZE / 2) : 0)
              : 0,
          }}
          transition={{ type: 'spring', stiffness: 500, damping: 30 }}
        >
          <ListTodo className="w-5 h-5 text-white pointer-events-none" />

          {/* 失败红点 */}
          {showFailedBadge && (
            <motion.span
              animate={{ scale: [1, 1.3, 1] }}
              transition={{ duration: 1.2, repeat: Infinity }}
              className="absolute -top-0.5 -right-0.5 min-w-4.5 h-4.5 flex items-center justify-center rounded-full text-[10px] font-bold text-white px-1 pointer-events-none"
              style={{ backgroundColor: '#ef4444', boxShadow: '0 0 6px rgba(239,68,68,0.5)' }}
            >
              {failedCount}
            </motion.span>
          )}

          {/* 活跃任务角标 */}
          {!showFailedBadge && activeCount > 0 && (
            <span
              className="absolute -top-0.5 -right-0.5 min-w-4.5 h-4.5 flex items-center justify-center rounded-full text-[10px] font-bold text-white px-1 pointer-events-none"
              style={{ backgroundColor: 'var(--accent)' }}
            >
              {activeCount}
            </span>
          )}

          {/* 环形进度 */}
          {activeCount > 0 && (
            <svg
              className="absolute inset-0 pointer-events-none"
              width={BUBBLE_SIZE}
              height={BUBBLE_SIZE}
              style={{ transform: 'rotate(-90deg)' }}
            >
              <circle
                cx={BUBBLE_SIZE / 2} cy={BUBBLE_SIZE / 2} r={BUBBLE_SIZE / 2 - 2}
                fill="none" stroke="rgba(255,255,255,0.3)" strokeWidth={2.5}
              />
              <motion.circle
                cx={BUBBLE_SIZE / 2} cy={BUBBLE_SIZE / 2} r={BUBBLE_SIZE / 2 - 2}
                fill="none" stroke="#fff" strokeWidth={2.5} strokeLinecap="round"
                strokeDasharray={Math.PI * (BUBBLE_SIZE - 4)}
                animate={{ strokeDashoffset: Math.PI * (BUBBLE_SIZE - 4) * (1 - overallProgress / 100) }}
                transition={{ duration: 0.4, ease: 'easeOut' }}
              />
            </svg>
          )}
        </motion.div>
      </motion.div>

      {/* 小窗口弹出面板 */}
      <AnimatePresence>
        {isExpanded && (
          <motion.div
            key="popup"
            initial={{ opacity: 0, scale: 0.9, x: snapSide === 'right' ? 20 : -20 }}
            animate={{ opacity: 1, scale: 1, x: 0 }}
            exit={{ opacity: 0, scale: 0.9, x: snapSide === 'right' ? 20 : -20 }}
            transition={{ duration: 0.2, ease: [0.4, 0, 0.2, 1] }}
            className="fixed z-[190] flex flex-col rounded-xl shadow-2xl overflow-hidden"
            style={{
              left: popupPos.left + panelOffset.x,
              top: popupPos.top + panelOffset.y,
              width: POPUP_WIDTH,
              maxHeight: POPUP_MAX_HEIGHT,
              backgroundColor: 'var(--bg-card)',
              border: '1px solid var(--border)',
              backdropFilter: 'blur(12px)',
            }}
          >
            {/* 标题栏 - 拖拽手柄 */}
            <div
              className="flex items-center justify-between px-4 shrink-0 cursor-grab active:cursor-grabbing select-none"
              style={{ height: HEADER_HEIGHT, borderBottom: '1px solid var(--border)' }}
              onPointerDown={handlePanelPointerDown}
              onPointerMove={handlePanelPointerMove}
              onPointerUp={handlePanelPointerUp}
            >
              <div className="flex items-center gap-2">
                <ListTodo className="w-4 h-4" style={{ color: 'var(--text-secondary)' }} />
                <span className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                  任务队列
                </span>
                {activeCount > 0 && (
                  <span className="text-xs px-1.5 py-0.5 rounded"
                    style={{ backgroundColor: 'var(--accent)', color: '#fff' }}>
                    {activeCount}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-0.5">
                <button onClick={() => fetchJobs(true)}
                  className="p-1.5 rounded-lg hover:bg-white/5 transition-colors"
                  style={{ color: 'var(--text-secondary)' }} title="刷新">
                  <RotateCcw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
                </button>
                <button onClick={() => setIsExpanded(false)}
                  className="p-1.5 rounded-lg hover:bg-white/5 transition-colors"
                  style={{ color: 'var(--text-secondary)' }} title="关闭">
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {/* 任务列表 */}
            <div className="flex-1 overflow-y-auto p-3 task-panel-scrollbar"
              style={{ maxHeight: POPUP_MAX_HEIGHT - HEADER_HEIGHT - 36 }}>
              {loading && jobs.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-8 gap-2">
                  <motion.div animate={{ rotate: 360 }}
                    transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                    className="w-5 h-5 border-2 rounded-full"
                    style={{ borderColor: 'var(--border)', borderTopColor: 'var(--accent)' }} />
                  <span className="text-sm" style={{ color: 'var(--text-muted)' }}>加载中...</span>
                </div>
              ) : jobs.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-8 gap-2">
                  <ListTodo className="w-8 h-8" style={{ color: 'var(--text-muted)', opacity: 0.5 }} />
                  <span className="text-sm" style={{ color: 'var(--text-muted)' }}>暂无运行中的任务</span>
                </div>
              ) : (
                <div className="space-y-1.5">
                  <AnimatePresence mode="popLayout">
                    {jobs.map((job, index) => (
                      <TaskItem key={job.id} job={job}
                        progress={getJobProgress(job)}
                        statusColor={getStatusColor(job.status)}
                        statusLabel={getStatusLabel(job.status)}
                        onCancelled={() => fetchJobs(false)}
                        onDismiss={async () => {
                          try { await consumeWorkflow(job.id); fetchJobs(false); }
                          catch (err) { console.error('[TaskQueue] 删除任务失败:', err); }
                        }}
                        index={index} />
                    ))}
                  </AnimatePresence>
                </div>
              )}
            </div>

            {/* 底部状态栏 */}
            <div className="flex items-center justify-between px-4 py-1.5 shrink-0"
              style={{ borderTop: '1px solid var(--border)', backgroundColor: 'var(--bg-nav)', borderRadius: '0 0 12px 12px' }}>
              <span className="text-xs flex items-center gap-1" style={{ color: 'var(--text-muted)' }}>
                {failedCount > 0 && (
                  <>
                    <span style={{ color: 'var(--danger)', fontWeight: 500 }}>{failedCount} 失败</span>
                    <button
                      onClick={async () => {
                        try {
                          await consumeAllFailed();
                          fetchJobs(false);
                        } catch (err) {
                          console.error('[TaskQueue] 批量清除失败:', err);
                        }
                      }}
                      className="px-1 py-0 rounded text-[10px] hover:opacity-80 transition-opacity cursor-pointer"
                      style={{ color: 'var(--danger)', opacity: 0.7 }}
                      title="清除所有失败任务（仅隐藏，不删除记录）"
                    >
                      清除
                    </button>
                  </>
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
