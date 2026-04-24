import React, { useState, memo, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Loader2, Check, AlertCircle, Clock, RotateCcw, Trash2, ChevronDown, ChevronRight } from 'lucide-react';
import { WorkflowJob, WorkflowTask, cancelWorkflow, retryTask } from '../../hooks/useWorkflow';
import { useConfirm } from '../../contexts/ConfirmContext';

// 任务类型中文映射
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
  // 草图工作流类型
  'sketch_frame_generation': '草图帧生成',
  'batch_sketch_frame_generation': '批量草图帧生成',
  // 并发帧生成
  'parallel_frame_generation': '并发帧生成',
  // 道具生成
  'prop_image_generation': '道具图片生成',
  // 运镜生成
  'camera_run_generation': '精细运镜生成',
  // 批量提示词优化
  'batch_prompt_optimization': '批量提示词优化',
  // 图片/视频提示词优化
  'single_image_prompt_optimization': 'AI优化提示词(图片)',
  'single_video_prompt_optimization': 'AI优化提示词(视频)',
  'batch_image_prompt_optimization': '批量提示词优化(图片)',
  'batch_video_prompt_optimization': '批量提示词优化(视频)',
};

// 相对时间格式化
const formatRelativeTime = (dateStr: string): string => {
  const now = Date.now();
  const created = new Date(dateStr).getTime();
  const diff = Math.max(0, now - created);
  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return '刚刚';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}分钟前`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}小时前`;
  return `${Math.floor(hours / 24)}天前`;
};

// 估算剩余时间
const estimateRemainingTime = (progress: number, createdAt: string): string | null => {
  if (progress <= 5 || progress >= 100) return null;
  const elapsed = Date.now() - new Date(createdAt).getTime();
  const totalEstimated = (elapsed / progress) * 100;
  const remaining = totalEstimated - elapsed;
  const seconds = Math.floor(remaining / 1000);
  if (seconds < 60) return `约${seconds}秒`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `约${minutes}分钟`;
  return `约${Math.floor(minutes / 60)}小时`;
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
export const getTaskName = (job: WorkflowJob): string => {
  const params = parseInputParams(job);
  const prefix = params.isRegenerate ? '重新' : '';
  const parts: string[] = [];

  if (params.episodeNumber) parts.push(`第${params.episodeNumber}集`);
  if (params.storyboardIndex || params.sceneIndex) {
    const idx = params.storyboardIndex || params.sceneIndex;
    parts.push(`第${idx}个分镜`);
  }
  if (params.characterName) parts.push(`「${params.characterName}」`);
  if (params.sceneName) parts.push(`「${params.sceneName}」`);

  // 优先使用 workflowName（后端定义的名称）
  if (job.workflowName && job.workflowName !== job.workflow_type) {
    if (parts.length > 0) {
      return `${parts.join(' ')} ${prefix}${job.workflowName}`;
    }
    return `${prefix}${job.workflowName}`;
  }

  const baseName = WORKFLOW_TYPE_NAMES[job.workflow_type] || job.workflow_type;

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
const getSubTaskName = (task: WorkflowTask): string => {
  // 优先使用 task 上的 displayName 属性（工作流引擎注入）
  if (task.displayName) return task.displayName;
  // 其次使用 input_params.displayName（兼容旧模式）
  const params = task.input_params;
  if (params?.displayName) return params.displayName;
  // 回退到 task_type 映射
  if (task.task_type === 'character_extraction') return '角色提取';
  if (task.task_type === 'batch_save') return '保存分镜';
  if (task.task_type === 'save_storyboards') return '保存分镜';
  if (task.task_type === 'scene_state_analysis') return '环境分析';
  if (task.task_type === 'frame_generation') return '首尾帧生成';
  if (task.task_type === 'single_frame_generation') return '单帧生成';
  if (task.task_type?.startsWith('batch_scene_')) {
    const idx = parseInt(task.task_type.replace('batch_scene_', ''), 10);
    return `场景 ${idx + 1}`;
  }
  return WORKFLOW_TYPE_NAMES[task.task_type] || task.task_type;
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
const SubTaskRow: React.FC<{ task: WorkflowTask; jobId: string }> = ({ task, jobId }) => {
  const name = getSubTaskName(task);
  const [retrying, setRetrying] = useState(false);
  const statusColor = task.status === 'failed' ? 'var(--danger)' 
    : task.status === 'completed' ? 'var(--success)'
    : task.status === 'processing' ? 'var(--accent)'
    : 'var(--text-muted)';

  const handleRetry = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (retrying) return;
    setRetrying(true);
    try {
      await retryTask(jobId, task.id);
    } catch (err) {
      console.error('[SubTaskRow] 重试失败:', err);
    } finally {
      setRetrying(false);
    }
  };

  return (
    <div className="flex items-center gap-2 py-1 px-2 group/subtask">
      <SubTaskStatusIcon status={task.status} />
      <span className="text-xs flex-1 truncate" style={{ color: 'var(--text-secondary)' }}>
        {name}
      </span>
      {/* 失败任务显示错误提示 + 重试按钮 */}
      {task.status === 'failed' && task.error_message && (
        <span 
          className="text-[10px] truncate max-w-[80px] shrink-0"
          style={{ color: 'var(--danger)' }}
          title={task.error_message}
        >
          {task.error_message}
        </span>
      )}
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
      {task.status === 'failed' && (
        <button
          onClick={handleRetry}
          disabled={retrying}
          className="opacity-0 group-hover/subtask:opacity-100 p-0.5 rounded hover:bg-green-500/20 transition-all shrink-0"
          style={{ color: 'var(--success)' }}
          title="免费重试"
        >
          {retrying ? (
            <Loader2 className="w-3 h-3 animate-spin" />
          ) : (
            <RotateCcw className="w-3 h-3" />
          )}
        </button>
      )}
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
  const taskName = getTaskName(job);
  const [cancelling, setCancelling] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const [isSubTasksExpanded, setIsSubTasksExpanded] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const canCancel = job.status === 'pending' || job.status === 'running';
  const canDismiss = job.status === 'failed' || job.status === 'cancelled';
  const canRetry = job.status === 'failed';
  const expandable = hasExpandableSubTasks(job);
  const { confirm } = useConfirm();
  const remainingTime = job.created_at ? estimateRemainingTime(progress, job.created_at) : null;

  const handleCancel = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (cancelling || !canCancel) return;
    const confirmed = await confirm({
      title: '取消任务',
      message: `确定要取消任务「${getTaskName(job)}」吗？`,
      type: 'warning',
      confirmText: '取消任务'
    });
    if (!confirmed) return;
    setCancelling(true);
    try {
      await cancelWorkflow(job.id);
      onCancelled?.();
    } catch (err: any) {
      if (err?.status === 404 || err?.message?.includes('不存在')) {
        onCancelled?.();
      } else {
        console.error('[TaskItem] 取消失败:', err);
      }
    } finally {
      setCancelling(false);
    }
  };

  const handleRetry = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (retrying || !canRetry) return;
    const confirmed = await confirm({
      title: '重试任务',
      message: `确定要重试任务「${getTaskName(job)}」吗？\n\n重试将不扣除积分，系统会自动尝试恢复失败的任务。`,
      type: 'info',
      confirmText: '免费重试'
    });
    if (!confirmed) return;
    setRetrying(true);
    try {
      // 找到第一个失败的任务进行重试
      const failedTask = job.tasks?.find(t => t.status === 'failed');
      if (!failedTask) {
        console.warn('[TaskItem] 没有可重试的失败任务');
        return;
      }
      await retryTask(job.id, failedTask.id);
      onCancelled?.(); // 通知父组件刷新列表
    } catch (err: any) {
      console.error('[TaskItem] 重试失败:', err);
    } finally {
      setRetrying(false);
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
              title="取消任务"
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
              title="删除任务"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </motion.button>
          )}
          {canRetry && (
            <motion.button
              initial={{ opacity: 0 }}
              animate={{ opacity: isHovered || retrying ? 1 : 0 }}
              onClick={handleRetry}
              disabled={retrying}
              className="p-1 rounded hover:bg-green-500/20 transition-colors"
              style={{ color: 'var(--success)' }}
              title="免费重试（不扣积分）"
            >
              {retrying ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <RotateCcw className="w-3.5 h-3.5" />
              )}
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
            <span>剩余 {remainingTime}</span>
          )}
          {job.created_at && !remainingTime && (
            <span>{formatRelativeTime(job.created_at)}</span>
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
                <span>子任务 {job.tasks.filter(t => t.status === 'completed').length}/{job.tasks.length}</span>
                <span>·</span>
                <span>
                  {job.tasks.filter(t => t.status === 'processing').length > 0 && `${job.tasks.filter(t => t.status === 'processing').length} 运行中`}
                  {job.tasks.filter(t => t.status === 'failed').length > 0 && ` ${job.tasks.filter(t => t.status === 'failed').length} 失败`}
                  {job.tasks.filter(t => t.status === 'processing').length === 0 && job.tasks.filter(t => t.status === 'failed').length === 0 && `${job.tasks.filter(t => t.status === 'pending').length} 等待中`}
                </span>
              </div>
              {/* 子任务列表 */}
              <div className="max-h-40 overflow-y-auto task-panel-scrollbar">
                {job.tasks.map((task) => (
                  <SubTaskRow key={task.id} task={task} jobId={job.id} />
                ))}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 失败/取消错误信息 */}
      {(job.status === 'failed' || job.status === 'cancelled') && (
        <div 
          className="mt-1.5 text-xs px-2 py-1.5 rounded"
          style={{ 
            color: job.status === 'failed' ? 'var(--danger)' : 'var(--text-muted)',
            backgroundColor: job.status === 'failed' ? 'rgba(239, 68, 68, 0.12)' : 'rgba(100, 116, 139, 0.1)',
            border: `1px solid ${job.status === 'failed' ? 'rgba(239, 68, 68, 0.25)' : 'rgba(100, 116, 139, 0.2)'}`,
          }}
        >
          {job.status === 'failed' ? (
            <div className="flex flex-col gap-1">
              <div className="flex items-start gap-1.5">
                <AlertCircle className="w-3 h-3 mt-0.5 shrink-0" style={{ color: 'var(--danger)' }} />
                <div className="flex-1 min-w-0">
                  <p className="leading-relaxed break-words">{job.error_message || '任务执行失败，请检查后重试'}</p>
                </div>
              </div>
              {canRetry && (
                <div className="flex items-center gap-1.5 ml-[18px] mt-1">
                  <button
                    onClick={handleRetry}
                    disabled={retrying}
                    className="text-[10px] px-1.5 py-0.5 rounded transition-colors flex items-center gap-1"
                    style={{ 
                      color: 'var(--success)',
                      backgroundColor: 'rgba(34, 197, 94, 0.15)',
                      border: '1px solid rgba(34, 197, 94, 0.3)'
                    }}
                  >
                    {retrying ? (
                      <Loader2 className="w-2.5 h-2.5 animate-spin" />
                    ) : (
                      <RotateCcw className="w-2.5 h-2.5" />
                    )}
                    免费重试
                  </button>
                  <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
                    重试不消耗积分
                  </span>
                </div>
              )}
            </div>
          ) : (
            `⚠️ ${job.error_message || '任务已被取消'}`
          )}
        </div>
      )}
    </motion.div>
  );
};

// 使用 React.memo 优化渲染性能
export default memo(TaskItem);
