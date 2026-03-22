import React, { useState, memo } from 'react';
import { motion } from 'framer-motion';
import { X, Loader2, Check, AlertCircle, Clock, RotateCcw } from 'lucide-react';
import { WorkflowJob, cancelWorkflow } from '../../hooks/useWorkflow';
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
  if (job.workflowName && job.workflowName !== job.workflow_type) {
    const params = parseInputParams(job);
    const prefix = params.isRegenerate ? '重新' : '';
    return `${prefix}${job.workflowName}`;
  }
  
  const baseName = WORKFLOW_TYPE_NAMES[job.workflow_type] || job.workflow_type;
  const params = parseInputParams(job);
  const parts: string[] = [];
  
  if (params.episodeNumber) parts.push(`第${params.episodeNumber}集`);
  if (params.storyboardIndex || params.sceneIndex) {
    const idx = params.storyboardIndex || params.sceneIndex;
    parts.push(`第${idx}个分镜`);
  }
  if (params.characterName) parts.push(`「${params.characterName}」`);
  if (params.sceneName) parts.push(`「${params.sceneName}」`);

  const prefix = params.isRegenerate ? '重新' : '';
  
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
  index?: number;
}

const TaskItem: React.FC<TaskItemProps> = ({ 
  job, 
  progress, 
  statusColor, 
  statusLabel, 
  onCancelled,
  index = 0 
}) => {
  const taskName = getTaskName(job);
  const [cancelling, setCancelling] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const canCancel = job.status === 'pending' || job.status === 'running';
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
    } catch (err) {
      console.error('[TaskItem] 取消失败:', err);
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

      {/* 失败错误信息 */}
      {job.status === 'failed' && job.error_message && (
        <div 
          className="mt-1.5 text-xs line-clamp-2"
          style={{ color: 'var(--danger)' }}
          title={job.error_message}
        >
          {job.error_message}
        </div>
      )}
    </motion.div>
  );
};

// 使用 React.memo 优化渲染性能
export default memo(TaskItem);
