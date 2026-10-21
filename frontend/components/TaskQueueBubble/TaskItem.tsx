import React, { useState, memo, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Loader2, Check, AlertCircle, Clock, RotateCcw, Trash2, ChevronDown, ChevronRight } from 'lucide-react';
import { WorkflowJob, WorkflowTask, cancelWorkflow } from '../../hooks/useWorkflow';
import { useConfirm } from '../../contexts/ConfirmContext';
import { useLanguage } from '../../contexts/LanguageContext';
import type { Translations } from '../../locales/zh-CN';

type TaskLabels = Translations['frame']['task'];
type TypeNames = Translations['frame']['taskTypes'];

// 相对时间格式化
const formatRelativeTime = (dateStr: string, tk: TaskLabels): string => {
  const now = Date.now();
  const created = new Date(dateStr).getTime();
  const diff = Math.max(0, now - created);
  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return tk.justNow;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return tk.minutesAgo.replace('{n}', String(minutes));
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return tk.hoursAgo.replace('{n}', String(hours));
  return tk.daysAgo.replace('{n}', String(Math.floor(hours / 24)));
};

// 估算剩余时间
const estimateRemainingTime = (progress: number, createdAt: string, tk: TaskLabels): string | null => {
  if (progress <= 5 || progress >= 100) return null;
  const elapsed = Date.now() - new Date(createdAt).getTime();
  const totalEstimated = (elapsed / progress) * 100;
  const remaining = totalEstimated - elapsed;
  const seconds = Math.floor(remaining / 1000);
  if (seconds < 60) return tk.aboutSeconds.replace('{n}', String(seconds));
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return tk.aboutMinutes.replace('{n}', String(minutes));
  return tk.aboutHours.replace('{n}', String(Math.floor(minutes / 60)));
};

// 解析 input_params
const parseInputParams = (job: WorkflowJob): Record<string, any> => {
  if (!job.input_params) return {};
  if (typeof job.input_params === 'string') {
    try {
      return JSON.parse(job.input_params);
    } catch {
      return {};
    }
  }
  return job.input_params;
};

// 获取任务显示名称（导出供其他组件使用）
export const getTaskName = (job: WorkflowJob, t: Translations): string => {
  const tk = t.frame.task;
  const tn = t.frame.taskTypes as Record<string, string>;
  const params = parseInputParams(job);
  const prefix = params.isRegenerate ? tk.regenerate : '';
  const parts: string[] = [];

  if (params.episodeNumber) parts.push(tk.episode.replace('{n}', String(params.episodeNumber)));
  if (params.storyboardIndex || params.sceneIndex) {
    const idx = params.storyboardIndex || params.sceneIndex;
    parts.push(tk.storyboard.replace('{n}', String(idx)));
  }
  if (params.characterName) parts.push(params.characterName);
  if (params.sceneName) parts.push(params.sceneName);

  // 优先使用 workflowName（后端定义的名称）
  if (job.workflowName && job.workflowName !== job.workflow_type) {
    if (parts.length > 0) {
      return `${parts.join(' ')} ${prefix}${job.workflowName}`;
    }
    return `${prefix}${job.workflowName}`;
  }

  const baseName = tn[job.workflow_type] || job.workflow_type;

  if (parts.length > 0) {
    return `${parts.join(' ')} ${prefix}${baseName}`;
  }

  return `${prefix}${baseName}`;
};

// 状态图标组件
const StatusIcon: React.FC<{ status: string }> = ({ status }) => {
  switch (status) {
    case 'running':
      return (
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
        >
          <Loader2 className="w-4 h-4" style={{ color: 'var(--accent)' }} />
        </motion.div>
      );
    case 'pending':
      return <Clock className="w-4 h-4" style={{ color: 'var(--warning)' }} />;
    case 'completed':
      return <Check className="w-4 h-4" style={{ color: 'var(--success)' }} />;
    case 'failed':
      return <AlertCircle className="w-4 h-4" style={{ color: 'var(--danger)' }} />;
    case 'cancelled':
      return <X className="w-4 h-4" style={{ color: 'var(--text-muted)' }} />;
    default:
      return <Clock className="w-4 h-4" style={{ color: 'var(--text-muted)' }} />;
  }
};

interface TaskItemProps {
  job: WorkflowJob;
  progress: number;
  statusColor: string;
  statusLabel: string;
  onCancelled?: () => void;
  onDismiss?: () => void;
  index?: number;
}

// 判断是否为有意义的子任务展示（多于 2 个子任务才展开）
const hasExpandableSubTasks = (job: WorkflowJob): boolean => {
  return job.tasks && job.tasks.length > 2;
};

// 获取子任务显示名称
const getSubTaskName = (task: WorkflowTask, t: Translations): string => {
  // 优先使用 task 上的 displayName 属性（工作流引擎注入）
  if (task.displayName) return task.displayName;
  // 其次使用 input_params.displayName（兼容旧模式）
  const params = task.input_params;
  if (params?.displayName) return params.displayName;
  // 回退到 task_type 映射
  const tn = t.frame.taskTypes as Record<string, string>;
  if (task.task_type?.startsWith('batch_scene_')) {
    const idx = parseInt(task.task_type.replace('batch_scene_', ''), 10);
    return t.frame.task.scene.replace('{n}', String(idx + 1));
  }
  return tn[task.task_type] || task.task_type;
};

// 子任务状态图标（较小版）
const SubTaskStatusIcon: React.FC<{ status: string }> = ({ status }) => {
  switch (status) {
    case 'processing':
      return (
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
        >
          <Loader2 className="w-3 h-3" style={{ color: 'var(--accent)' }} />
        </motion.div>
      );
    case 'pending':
      return <Clock className="w-3 h-3" style={{ color: 'var(--text-muted)' }} />;
    case 'completed':
      return <Check className="w-3 h-3" style={{ color: 'var(--success)' }} />;
    case 'failed':
      return <AlertCircle className="w-3 h-3" style={{ color: 'var(--danger)' }} />;
    default:
      return <Clock className="w-3 h-3" style={{ color: 'var(--text-muted)' }} />;
  }
};

// 子任务行组件
const SubTaskRow: React.FC<{ task: WorkflowTask }> = ({ task }) => {
  const { t } = useLanguage();
  const name = getSubTaskName(task, t);
  const statusColor = task.status === 'failed' ? 'var(--danger)' 
    : task.status === 'completed' ? 'var(--success)'
    : task.status === 'processing' ? 'var(--accent)'
    : 'var(--text-muted)';

  return (
    <div className="flex items-center gap-2 py-1 px-2">
      <SubTaskStatusIcon status={task.status} />
      <span className="text-xs flex-1 truncate" style={{ color: 'var(--text-secondary)' }}>
        {name}
      </span>
      {/* 进度条 */}
      <div
        className="w-16 h-1 rounded-full overflow-hidden shrink-0"
        style={{ backgroundColor: 'var(--bg-tertiary)' }}
      >
        <div
          className="h-full rounded-full transition-all duration-300"
          style={{ 
            width: `${task.progress}%`,
            backgroundColor: task.status === 'failed' ? 'var(--danger)' : 'var(--accent)'
          }}
        />
      </div>
      <span className="text-[10px] tabular-nums w-8 text-right shrink-0" style={{ color: statusColor }}>
        {task.progress}%
      </span>
    </div>
  );
};

const TaskItem: React.FC<TaskItemProps> = ({ 
  job, 
  progress, 
  statusColor, 
  statusLabel, 
  onCancelled,
  onDismiss,
  index = 0 
}) => {
  const { t } = useLanguage();
  const taskName = getTaskName(job, t);
  const [cancelling, setCancelling] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const [isSubTasksExpanded, setIsSubTasksExpanded] = useState(false);
  const canCancel = job.status === 'pending' || job.status === 'running';
  const canDismiss = job.status === 'failed' || job.status === 'cancelled';
  const expandable = hasExpandableSubTasks(job);
  const { confirm } = useConfirm();
  const remainingTime = job.created_at ? estimateRemainingTime(progress, job.created_at, t.frame.task) : null;

  const handleCancel = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (cancelling || !canCancel) return;
    const confirmed = await confirm({
      title: t.frame.task.cancelTask,
      message: t.frame.task.cancelTaskMessage.replace('{name}', getTaskName(job, t)),
      type: 'warning',
      confirmText: t.frame.task.cancelTask
    });
    if (!confirmed) return;
    setCancelling(true);
    try {
      await cancelWorkflow(job.id);
      onCancelled?.();
    } catch (err: any) {
      // 404 表示工作流已不存在（可能已被清理），视为取消成功
      if (err?.status === 404 || err?.message?.includes('不存在')) {
        onCancelled?.();
      } else {
        console.error('[TaskItem] 取消失败:', err);
      }
    } finally {
      setCancelling(false);
    }
  };

  // 获取状态背景色
  const getStatusBgColor = () => {
    switch (job.status) {
      case 'running': return 'rgba(59, 130, 246, 0.1)';
      case 'pending': return 'rgba(234, 179, 8, 0.08)';
      case 'completed': return 'rgba(34, 197, 94, 0.1)';
      case 'failed': return 'rgba(239, 68, 68, 0.1)';
      default: return 'transparent';
    }
  };

  return (
    <motion.div
      layout
      initial={{ opacity: 0, x: 20 }}
      animate={{ 
        opacity: 1, 
        x: 0,
        backgroundColor: getStatusBgColor(),
      }}
      exit={{ opacity: 0, x: -20, height: 0 }}
      transition={{ 
        duration: 0.2, 
        delay: index * 0.03,
        layout: { duration: 0.2 }
      }}
      onHoverStart={() => setIsHovered(true)}
      onHoverEnd={() => setIsHovered(false)}
      className="rounded-lg px-3 py-2 group"
      style={{
        border: '1px solid var(--border)',
      }}
    >
      {/* 主行 */}
      <div className="flex items-center gap-2.5">
        {/* 展开/折叠按钮（仅多子任务时显示） */}
        {expandable ? (
          <button
            onClick={(e) => {
              e.stopPropagation();
              setIsSubTasksExpanded(!isSubTasksExpanded);
            }}
            className="p-0.5 rounded hover:bg-white/10 transition-colors shrink-0"
            style={{ color: 'var(--text-muted)' }}
          >
            {isSubTasksExpanded 
              ? <ChevronDown className="w-3.5 h-3.5" />
              : <ChevronRight className="w-3.5 h-3.5" />
            }
          </button>
        ) : null}

        {/* 状态图标 */}
        <StatusIcon status={job.status} />

        {/* 任务名称和ID */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span 
              className="text-sm font-medium truncate"
              style={{ color: 'var(--text-primary)' }}
            >
              {taskName}
            </span>
            <span 
              className="text-[10px] shrink-0"
              style={{ color: 'var(--text-muted)' }}
            >
              #{job.id}
            </span>
          </div>
        </div>

        {/* 进度百分比 */}
        <span 
          className="text-xs font-medium tabular-nums shrink-0"
          style={{ color: 'var(--text-secondary)' }}
        >
          {Math.round(progress)}%
        </span>

        {/* 状态标签 */}
        <span className={`text-[10px] font-medium shrink-0 ${statusColor}`}>
          {statusLabel}
        </span>

        {/* 操作按钮 */}
        <div className="flex items-center gap-0.5 shrink-0">
          {canCancel && (
            <motion.button
              initial={{ opacity: 0 }}
              animate={{ opacity: isHovered ? 1 : 0 }}
              onClick={handleCancel}
              disabled={cancelling}
              className="p-1 rounded hover:bg-red-500/20 transition-colors"
              style={{ color: 'var(--danger)' }}
              title={t.frame.task.cancelTask}
            >
              <X className="w-3.5 h-3.5" />
            </motion.button>
          )}
          {canDismiss && (
            <motion.button
              initial={{ opacity: 0 }}
              animate={{ opacity: isHovered ? 1 : 0 }}
              onClick={(e) => {
                e.stopPropagation();
                onDismiss?.();
              }}
              className="p-1 rounded hover:bg-red-500/20 transition-colors"
              style={{ color: 'var(--text-muted)' }}
              title={t.frame.task.deleteTask}
            >
              <Trash2 className="w-3.5 h-3.5" />
            </motion.button>
          )}
        </div>
      </div>

      {/* 进度条和附加信息 */}
      <div className="mt-2 flex items-center gap-2">
        {/* 进度条 */}
        <div 
          className="flex-1 h-1 rounded-full overflow-hidden"
          style={{ backgroundColor: 'var(--bg-tertiary)' }}
        >
          <motion.div
            className="h-full rounded-full"
            style={{ 
              backgroundColor: job.status === 'failed' ? 'var(--danger)' : 'var(--accent)'
            }}
            initial={{ width: 0 }}
            animate={{ width: `${progress}%` }}
            transition={{ duration: 0.3, ease: 'easeOut' }}
          />
        </div>

        {/* 时间信息 */}
        <div className="flex items-center gap-1.5 text-[10px] shrink-0" style={{ color: 'var(--text-muted)' }}>
          {remainingTime && job.status === 'running' && (
            <span>{t.frame.task.remaining.replace('{t}', remainingTime)}</span>
          )}
          {job.created_at && !remainingTime && (
            <span>{formatRelativeTime(job.created_at, t.frame.task)}</span>
          )}
        </div>
      </div>

      {/* 子任务展开区域 */}
      <AnimatePresence>
        {expandable && isSubTasksExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div 
              className="mt-2 rounded-md py-1"
              style={{ 
                backgroundColor: 'var(--bg-secondary)',
                border: '1px solid var(--border)'
              }}
            >
              {/* 子任务概要 */}
              <div className="px-2 py-1 flex items-center gap-2 text-[10px]" style={{ color: 'var(--text-muted)', borderBottom: '1px solid var(--border)' }}>
                <span>{t.frame.task.subtask} {job.tasks.filter(x => x.status === 'completed').length}/{job.tasks.length}</span>
                <span>·</span>
                <span>
                  {job.tasks.filter(x => x.status === 'processing').length > 0 && t.frame.taskPanel.runningCount.replace('{n}', String(job.tasks.filter(x => x.status === 'processing').length))}
                  {job.tasks.filter(x => x.status === 'failed').length > 0 && ` ${t.frame.taskPanel.failedCount.replace('{n}', String(job.tasks.filter(x => x.status === 'failed').length))}`}
                  {job.tasks.filter(x => x.status === 'processing').length === 0 && job.tasks.filter(x => x.status === 'failed').length === 0 && t.frame.taskPanel.pendingCount.replace('{n}', String(job.tasks.filter(x => x.status === 'pending').length))}
                </span>
              </div>
              {/* 子任务列表 */}
              <div className="max-h-40 overflow-y-auto task-panel-scrollbar">
                {job.tasks.map((task) => (
                  <SubTaskRow key={task.id} task={task} />
                ))}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 失败/取消错误信息 */}
      {(job.status === 'failed' || job.status === 'cancelled') && (
        <div 
          className="mt-1.5 text-xs line-clamp-2 px-2 py-1 rounded"
          style={{ 
            color: job.status === 'failed' ? 'var(--danger)' : 'var(--text-muted)',
            backgroundColor: job.status === 'failed' ? 'rgba(239, 68, 68, 0.12)' : 'rgba(100, 116, 139, 0.1)',
            border: `1px solid ${job.status === 'failed' ? 'rgba(239, 68, 68, 0.25)' : 'rgba(100, 116, 139, 0.2)'}`,
          }}
          title={job.error_message || undefined}
        >
          {job.status === 'failed' 
            ? `❌ ${job.error_message || t.frame.task.failedDefault}` 
            : `⚠️ ${job.error_message || t.frame.task.cancelledMsg}`}
        </div>
      )}
    </motion.div>
  );
};

// 使用 React.memo 优化渲染性能
export default memo(TaskItem);
