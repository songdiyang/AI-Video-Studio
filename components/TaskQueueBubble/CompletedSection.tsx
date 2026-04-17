import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown, ChevronUp, Check, X, AlertCircle } from 'lucide-react';
import { WorkflowJob } from '../../hooks/useWorkflow';

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
  'batch_prompt_optimization': '批量提示词优化',
};

const getTaskName = (job: WorkflowJob): string => {
  if (job.workflowName && job.workflowName !== job.workflow_type) {
    return job.workflowName;
  }
  return WORKFLOW_TYPE_NAMES[job.workflow_type] || job.workflow_type;
};

const getStatusIcon = (status: string) => {
  switch (status) {
    case 'completed':
      return <Check className="w-3.5 h-3.5" style={{ color: 'var(--success)' }} />;
    case 'failed':
      return <AlertCircle className="w-3.5 h-3.5" style={{ color: 'var(--danger)' }} />;
    case 'cancelled':
      return <X className="w-3.5 h-3.5" style={{ color: 'var(--text-muted)' }} />;
    default:
      return <Check className="w-3.5 h-3.5" style={{ color: 'var(--success)' }} />;
  }
};

const getStatusLabel = (status: string) => {
  switch (status) {
    case 'completed': return '已完成';
    case 'failed': return '失败';
    case 'cancelled': return '已取消';
    default: return status;
  }
};

interface CompletedSectionProps {
  jobs: WorkflowJob[];
  getStatusColor: (status: string) => string;
}

const CompletedSection: React.FC<CompletedSectionProps> = ({ jobs, getStatusColor }) => {
  const [expanded, setExpanded] = useState(false);

  if (jobs.length === 0) return null;

  const completedCount = jobs.filter(j => j.status === 'completed').length;
  const failedCount = jobs.filter(j => j.status === 'failed').length;

  return (
    <div className="mt-2 pt-2" style={{ borderTop: '1px solid var(--border)' }}>
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-2 text-xs py-1.5 px-2 w-full rounded hover:bg-white/5 transition-colors"
        style={{ color: 'var(--text-secondary)' }}
      >
        <motion.div
          animate={{ rotate: expanded ? 180 : 0 }}
          transition={{ duration: 0.2 }}
        >
          <ChevronDown className="w-3.5 h-3.5" />
        </motion.div>
        <span>历史任务</span>
        <span 
          className="px-1.5 py-0.5 rounded text-[10px]"
          style={{ 
            backgroundColor: 'var(--bg-tertiary)',
            color: 'var(--text-muted)'
          }}
        >
          {jobs.length}
        </span>
        {failedCount > 0 && (
          <span 
            className="px-1.5 py-0.5 rounded text-[10px]"
            style={{ 
              backgroundColor: 'rgba(239, 68, 68, 0.15)',
              color: 'var(--danger)'
            }}
          >
            {failedCount} 失败
          </span>
        )}
      </button>

      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="space-y-1 mt-1.5">
              {jobs.slice(0, 10).map((job, index) => (
                <motion.div
                  key={job.id}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: index * 0.03 }}
                  className="flex items-center gap-2 px-2 py-1.5 rounded"
                  style={{ 
                    backgroundColor: job.status === 'failed' 
                      ? 'rgba(239, 68, 68, 0.08)' 
                      : job.status === 'cancelled'
                        ? 'rgba(100, 116, 139, 0.08)'
                        : 'rgba(34, 197, 94, 0.08)',
                    border: '1px solid var(--border)'
                  }}
                >
                  {getStatusIcon(job.status)}
                  <span 
                    className="text-xs truncate flex-1"
                    style={{ color: 'var(--text-primary)' }}
                  >
                    {getTaskName(job)}
                  </span>
                  <span 
                    className="text-[10px]"
                    style={{ color: 'var(--text-muted)' }}
                  >
                    #{job.id}
                  </span>
                  <span className={`text-[10px] font-medium ${getStatusColor(job.status)}`}>
                    {getStatusLabel(job.status)}
                  </span>
                </motion.div>
              ))}
              {jobs.length > 10 && (
                <div 
                  className="text-[10px] text-center py-1"
                  style={{ color: 'var(--text-muted)' }}
                >
                  还有 {jobs.length - 10} 条历史记录
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default CompletedSection;
