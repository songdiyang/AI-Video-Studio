/**
 * 对话内后台任务进度卡片：以轮询方式呈现分镜拆分、分镜图、分镜视频三类任务的执行状态。
 */
import React, { useEffect, useState } from 'react';
import { Progress } from '@heroui/react';
import { Loader2, CheckCircle2, XCircle, Clock, Image as ImageIcon, Video, LayoutList } from 'lucide-react';
import { getWorkflowStatus, ApiError, WorkflowJob } from '../../hooks/useWorkflow';
import type { TaskCardData } from './types';

/** 轮询间隔：与 generate_script 先例、全局任务队列一致 */
const POLL_MS = 2000;
/** 查询失败后的退避上限，避免服务不可用时按固定频率持续打点 */
const MAX_POLL_MS = 30000;
/** 连续失败达到该次数即判定为不可恢复，落失败终态并停止轮询 */
const MAX_CONSECUTIVE_FAILURES = 8;

const TERMINAL_JOB_STATUS: ReadonlySet<WorkflowJob['status']> = new Set([
  'completed',
  'failed',
  'cancelled',
]);

/** 加权进度：与 useTaskQueue.getJobProgress 算法保持一致 */
const computeProgress = (job: WorkflowJob): number => {
  if (!job.tasks || job.tasks.length === 0) return 0;
  return Math.round(job.tasks.reduce((sum, t) => sum + (t.progress || 0), 0) / job.tasks.length);
};

/** 从末任务 result_data 扫描媒体 URL（图片/视频落地字段命名见 localWorkflow） */
const extractMediaUrl = (job: WorkflowJob): string | null => {
  const task = job.tasks?.[job.tasks.length - 1];
  const rd = task?.result_data;
  if (!rd || typeof rd !== 'object') return null;
  const keys =
    job.tasks && task && /video/i.test(task.task_type || '')
      ? ['video_url', 'videoUrl', 'url']
      : ['imageUrl', 'image_url', 'first_frame_url', 'firstFrameUrl', 'url'];
  for (const k of keys) {
    const v = (rd as Record<string, any>)[k];
    if (typeof v === 'string' && v) return v;
  }
  return null;
};

type CardStatus = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';

interface CardState {
  status: CardStatus;
  progress: number;
  current: number;
  total: number;
  mediaUrl: string | null;
  error: string | null;
}

/**
 * 终态结果按 jobId 记忆。
 * 卡片会因会话标签切换、消息列表重建而卸载重挂，若无此记忆则重挂后：
 * 状态回到「运行中」并对已结束的作业重新发一轮请求，表现为「已完成的卡片复活」。
 * 作业终态不可逆，故只需容量上限，无需失效策略。
 */
const terminalMemo = new Map<string, CardState>();
const TERMINAL_MEMO_CAP = 64;

const rememberTerminal = (jobId: string, next: CardState) => {
  if (terminalMemo.size >= TERMINAL_MEMO_CAP) {
    const oldest = terminalMemo.keys().next().value;
    if (oldest !== undefined) terminalMemo.delete(oldest);
  }
  terminalMemo.set(jobId, next);
};

const KIND_META = {
  storyboard: { label: '分镜拆分', Icon: LayoutList },
  image: { label: '分镜图', Icon: ImageIcon },
  video: { label: '分镜视频', Icon: Video },
} as const;

const STATUS_META: Record<CardStatus, { label: string; color: string }> = {
  pending: { label: '等待中', color: 'var(--warning)' },
  running: { label: '运行中', color: 'var(--accent)' },
  completed: { label: '已完成', color: 'var(--success)' },
  failed: { label: '失败', color: 'var(--danger)' },
  cancelled: { label: '已取消', color: 'var(--text-muted)' },
};

const STATUS_ICON: Record<CardStatus, React.ReactNode> = {
  pending: <Clock size={13} />,
  running: <Loader2 size={13} className="animate-spin" />,
  completed: <CheckCircle2 size={13} />,
  failed: <XCircle size={13} />,
  cancelled: <XCircle size={13} />,
};

interface TaskProgressCardProps {
  task: TaskCardData;
}

/**
 * 对话内后台任务进度卡片。
 * - 只读：不调用 consumeWorkflow，避免与右下角全局 TaskQueueBubble 抢消费。
 * - 幂等：挂载后先查一次，取到终态即停止轮询；终态按 jobId 记忆，重挂时直接复原不再发请求。
 * - 无 jobId（离线分镜拆分同步完成）时直接进入完成态，显示 sceneCount。
 * - 每张卡片只服务一个 jobId，同一 jobId 的卡片由挂载侧去重，因此并发任务不会重复轮询同一作业。
 */
const TaskProgressCard: React.FC<TaskProgressCardProps> = ({ task }) => {
  const isStoryboardSync = task.kind === 'storyboard' && !task.jobId;

  const [state, setState] = useState<CardState>(() => {
    if (isStoryboardSync) {
      return {
        status: 'completed',
        progress: 100,
        current: task.sceneCount ?? 0,
        total: task.sceneCount ?? 0,
        mediaUrl: null,
        error: null,
      };
    }
    // 重挂命中终态记忆时直接复原，不重新经历「运行中」
    const memo = task.jobId ? terminalMemo.get(task.jobId) : undefined;
    if (memo) return memo;
    // 首次查询尚未返回：以「等待中」如实表达未知，不预先断言运行中
    return { status: 'pending', progress: 0, current: 0, total: 0, mediaUrl: null, error: null };
  });

  useEffect(() => {
    const jobId = task.jobId;
    // 同步完成态（离线拆分）无需轮询
    if (!jobId) return;
    // 已知终态：本代 effect 不再发起任何请求
    const memo = terminalMemo.get(jobId);
    if (memo) {
      setState(memo);
      return;
    }

    // 每一代 effect 持有独立的取消标记与定时器句柄：
    // StrictMode 的双触发、或 jobId 变化时，旧代的在途响应既不能写入状态，也不能续排定时器，
    // 避免出现两代轮询链共用同一个 ref（旧链会覆盖句柄导致清不掉、并把旧 jobId 的结果写进新卡片）。
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let delay = POLL_MS;
    let failures = 0;

    const deriveStatus = (job: WorkflowJob): CardStatus => {
      if (job.status === 'completed') return 'completed';
      if (job.status === 'failed') return 'failed';
      if (job.status === 'cancelled') return 'cancelled';
      if (job.status === 'pending') return 'pending';
      return 'running';
    };

    const commit = (next: CardState, memoize: boolean) => {
      if (memoize) rememberTerminal(jobId, next);
      setState(next);
    };

    const tick = async () => {
      if (stopped) return;
      try {
        const job = await getWorkflowStatus(jobId);
        if (stopped) return;
        const status = deriveStatus(job);
        const total = job.tasks?.length ?? job.total_steps ?? 0;
        const current = job.tasks
          ? job.tasks.filter((t) => t.status === 'completed' || t.status === 'failed').length
          : job.current_step_index ?? 0;
        const isTerminal = TERMINAL_JOB_STATUS.has(job.status);
        commit(
          {
            status,
            progress: status === 'completed' ? 100 : computeProgress(job),
            current,
            total,
            mediaUrl: status === 'completed' ? extractMediaUrl(job) : null,
            error: status === 'failed' ? job.error_message || '任务失败' : null,
          },
          isTerminal,
        );
        // 终态：停止轮询
        if (isTerminal) return;
        delay = POLL_MS;
        failures = 0;
      } catch (err: any) {
        if (stopped) return;
        // 作业记录已不存在（本地注册表重启后清空等）：永远等不到结果，落失败终态而不是无限打点
        if (err instanceof ApiError && err.status === 404) {
          commit(
            { status: 'failed', progress: 0, current: 0, total: 0, mediaUrl: null, error: '任务记录已失效，无法继续查询进度' },
            false,
          );
          return;
        }
        failures += 1;
        if (failures >= MAX_CONSECUTIVE_FAILURES) {
          commit(
            { status: 'failed', progress: 0, current: 0, total: 0, mediaUrl: null, error: err?.message || '进度查询失败' },
            false,
          );
          return;
        }
        // 瞬时故障：保持当前状态视图，指数退避后重试
        delay = Math.min(delay * 2, MAX_POLL_MS);
      }
      if (!stopped) {
        timer = setTimeout(tick, delay);
      }
    };

    void tick();

    return () => {
      stopped = true;
      if (timer) clearTimeout(timer);
    };
  }, [task.jobId]);

  const meta = KIND_META[task.kind];
  const statusMeta = STATUS_META[state.status];
  const KindIcon = meta.Icon;
  const showBar = state.status === 'running' || state.status === 'pending';

  return (
    <div
      className="mt-2 rounded-lg overflow-hidden"
      style={{ border: '1px solid var(--border)', backgroundColor: 'var(--bg-secondary)' }}
    >
      {/* 头部：类别图标 + 标题 + 状态徽标 */}
      <div className="flex items-center gap-2 px-3 py-2">
        <KindIcon size={13} style={{ color: 'var(--text-secondary)' }} className="shrink-0" />
        <span className="text-xs font-medium truncate flex-1" style={{ color: 'var(--text-primary)' }}>
          {task.title}
        </span>
        <span
          className="inline-flex items-center gap-1 text-[10px] font-medium shrink-0 px-1.5 py-0.5 rounded"
          style={{ color: statusMeta.color, backgroundColor: 'var(--bg-tertiary)' }}
        >
          {STATUS_ICON[state.status]}
          {statusMeta.label}
        </span>
      </div>

      {/* 进度条 + 计数 */}
      {showBar && (
        <div className="px-3 pb-2 flex items-center gap-2">
          <Progress
            size="sm"
            value={state.progress}
            maxValue={100}
            className="flex-1"
            classNames={{
              track: 'bg-[var(--bg-tertiary)]',
              indicator: 'bg-[var(--accent)]',
            }}
          />
          <span className="text-[10px] tabular-nums shrink-0" style={{ color: 'var(--text-muted)' }}>
            {state.progress}%
            {state.total > 0 ? ` · [${state.current}/${state.total}]` : ''}
          </span>
        </div>
      )}

      {/* 完成态：分镜数 / 媒体缩略图 */}
      {state.status === 'completed' && (
        <div className="px-3 pb-2.5">
          {task.kind === 'storyboard' ? (
            <span className="text-[11px]" style={{ color: 'var(--success)' }}>
              已完成 · 写入 {task.sceneCount ?? state.current} 个分镜
            </span>
          ) : state.mediaUrl ? (
            <div className="relative group">
              {task.kind === 'video' ? (
                <video
                  src={state.mediaUrl}
                  className="w-full max-h-48 rounded-md object-cover"
                  style={{ border: '1px solid var(--border)' }}
                  controls
                  muted
                  playsInline
                />
              ) : (
                <img
                  src={state.mediaUrl}
                  alt={task.title}
                  className="w-full max-h-48 rounded-md object-cover"
                  style={{ border: '1px solid var(--border)' }}
                  loading="lazy"
                />
              )}
            </div>
          ) : (
            <span className="text-[11px]" style={{ color: 'var(--success)' }}>
              {meta.label}已完成
            </span>
          )}
        </div>
      )}

      {/* 失败/取消态：错误信息 */}
      {(state.status === 'failed' || state.status === 'cancelled') && (
        <div
          className="mx-3 mb-2.5 text-[11px] line-clamp-2 px-2 py-1 rounded"
          style={{
            color: state.status === 'failed' ? 'var(--danger)' : 'var(--text-muted)',
            backgroundColor: state.status === 'failed' ? 'rgba(239, 68, 68, 0.12)' : 'rgba(100, 116, 139, 0.1)',
          }}
          title={state.error || undefined}
        >
          {state.error || (state.status === 'failed' ? `${meta.label}失败` : `${meta.label}已取消`)}
        </div>
      )}
    </div>
  );
};

export default TaskProgressCard;
