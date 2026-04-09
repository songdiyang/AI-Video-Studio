/**
 * 分镜检验结果面板
 *
 * 展示空镜头、重复镜头、叙事冗余和连贯性问题的检测结果，
 * 支持按严重程度分组、点击跳转到对应分镜。
 */

import React, { useMemo } from 'react';
import { Button } from '@heroui/react';
import { ShieldCheck, RefreshCw, ChevronDown, ChevronRight, AlertTriangle, AlertCircle, Info, X } from 'lucide-react';
import type {
  StoryboardValidationResult,
  StoryboardValidationIssue,
  ValidationSeverity,
} from '../utils/validateStoryboardContent';

// ============ 类型定义 ============

export interface StoryboardValidationPanelProps {
  isOpen: boolean;
  result: StoryboardValidationResult | null;
  isValidating: boolean;
  onClose: () => void;
  onRevalidate: () => void;
  onSelectScene: (id: number) => void;
}

// ============ 辅助组件 ============

const SEVERITY_CONFIG: Record<ValidationSeverity, {
  icon: React.ReactNode;
  borderColor: string;
  bgColor: string;
  textColor: string;
  label: string;
}> = {
  error: {
    icon: <AlertCircle className="w-4 h-4" />,
    borderColor: 'border-l-rose-500',
    bgColor: 'bg-rose-500/10',
    textColor: 'text-rose-400',
    label: '错误',
  },
  warning: {
    icon: <AlertTriangle className="w-4 h-4" />,
    borderColor: 'border-l-amber-500',
    bgColor: 'bg-amber-500/10',
    textColor: 'text-amber-400',
    label: '警告',
  },
  info: {
    icon: <Info className="w-4 h-4" />,
    borderColor: 'border-l-sky-500',
    bgColor: 'bg-sky-500/10',
    textColor: 'text-sky-400',
    label: '建议',
  },
};

/** 问题类型中文标签 */
const ISSUE_TYPE_LABELS: Record<string, string> = {
  empty_shot: '空镜头',
  weak_content: '弱内容',
  duplicate_shot: '内容重复',
  composition_duplicate: '构图重复',
  narrative_stagnation: '叙事停滞',
  character_discontinuity: '角色断层',
  scene_jump: '场景跳转',
  continuity_error: '连续性错误',
  transition_missing: '转场缺失',
  duration_anomaly: '时长异常',
};

// ============ 问题卡片 ============

interface IssueCardProps {
  issue: StoryboardValidationIssue;
  onSelectScene: (id: number) => void;
}

const IssueCard: React.FC<IssueCardProps> = ({ issue, onSelectScene }) => {
  const config = SEVERITY_CONFIG[issue.severity];

  return (
    <div
      className={`border-l-2 ${config.borderColor} ${config.bgColor} rounded-r-lg p-3 mb-2 cursor-pointer hover:brightness-110 transition-all`}
      onClick={() => {
        // 点击跳转到第一个涉及的分镜
        if (issue.storyboardIds.length > 0) {
          onSelectScene(issue.storyboardIds[0]);
        }
      }}
    >
      {/* 头部：严重度 + 类型标签 + 分镜序号 */}
      <div className="flex items-center gap-2 mb-1.5">
        <span className={`${config.textColor} flex-shrink-0`}>{config.icon}</span>
        <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${config.bgColor} ${config.textColor}`}>
          {ISSUE_TYPE_LABELS[issue.type] || issue.type}
        </span>
        <div className="flex gap-1 flex-wrap">
          {issue.indices.map(idx => (
            <button
              key={idx}
              className="text-xs px-1.5 py-0.5 rounded bg-(--bg-card) border border-(--border-color) text-(--text-secondary) hover:bg-(--bg-card-hover) transition-colors"
              onClick={(e) => {
                e.stopPropagation();
                if (issue.storyboardIds[issue.indices.indexOf(idx)]) {
                  onSelectScene(issue.storyboardIds[issue.indices.indexOf(idx)]);
                }
              }}
            >
              #{idx + 1}
            </button>
          ))}
        </div>
      </div>

      {/* 问题描述 */}
      <p className="text-sm text-(--text-primary) leading-relaxed mb-1">
        {issue.message}
      </p>

      {/* 修改建议 */}
      <p className="text-xs text-(--text-muted) leading-relaxed">
        <span className="text-(--text-secondary) font-medium">建议：</span>
        {issue.suggestion}
      </p>
    </div>
  );
};

// ============ 分组标题 ============

interface GroupHeaderProps {
  severity: ValidationSeverity;
  count: number;
  isExpanded: boolean;
  onToggle: () => void;
}

const GroupHeader: React.FC<GroupHeaderProps> = ({ severity, count, isExpanded, onToggle }) => {
  const config = SEVERITY_CONFIG[severity];
  return (
    <button
      className="flex items-center gap-2 w-full py-2 px-1 hover:bg-(--bg-card-hover) rounded transition-colors"
      onClick={onToggle}
    >
      {isExpanded ? <ChevronDown className="w-3.5 h-3.5 text-(--text-muted)" /> : <ChevronRight className="w-3.5 h-3.5 text-(--text-muted)" />}
      <span className={`${config.textColor}`}>{config.icon}</span>
      <span className="text-sm font-medium text-(--text-primary)">{config.label}</span>
      <span className={`text-xs px-1.5 py-0.5 rounded-full ${config.bgColor} ${config.textColor}`}>{count}</span>
    </button>
  );
};

// ============ 主面板 ============

const StoryboardValidationPanel: React.FC<StoryboardValidationPanelProps> = ({
  isOpen,
  result,
  isValidating,
  onClose,
  onRevalidate,
  onSelectScene,
}) => {
  const [expandedGroups, setExpandedGroups] = React.useState<Record<ValidationSeverity, boolean>>({
    error: true,
    warning: true,
    info: false,
  });

  const toggleGroup = (severity: ValidationSeverity) => {
    setExpandedGroups(prev => ({ ...prev, [severity]: !prev[severity] }));
  };

  // 按严重程度分组
  const grouped = useMemo(() => {
    if (!result) return { error: [], warning: [], info: [] };
    return {
      error: result.issues.filter(i => i.severity === 'error'),
      warning: result.issues.filter(i => i.severity === 'warning'),
      info: result.issues.filter(i => i.severity === 'info'),
    };
  }, [result]);

  if (!isOpen) return null;

  return (
    <div className="h-full flex flex-col bg-(--bg-app) border-l border-(--border-color)">
      {/* 头部 */}
      <div className="shrink-0 px-4 py-3 border-b border-(--border-color) bg-(--bg-card)">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-cyan-400" />
            <h3 className="text-sm font-semibold text-(--text-primary)">分镜检验</h3>
          </div>
          <div className="flex items-center gap-1">
            <Button
              isIconOnly
              size="sm"
              variant="light"
              className="h-7 w-7 min-w-7"
              onPress={onRevalidate}
              isDisabled={isValidating}
              isLoading={isValidating}
            >
              {!isValidating && <RefreshCw className="w-3.5 h-3.5" />}
            </Button>
            <Button
              isIconOnly
              size="sm"
              variant="light"
              className="h-7 w-7 min-w-7"
              onPress={onClose}
            >
              <X className="w-3.5 h-3.5" />
            </Button>
          </div>
        </div>

        {/* 摘要 */}
        {result && result.totalShots > 0 && (
          <div className="flex gap-3 text-xs text-(--text-muted)">
            <span>{result.totalShots} 个镜头</span>
            {result.summary.emptyShots > 0 && (
              <span className="text-rose-400">{result.summary.emptyShots} 空镜头</span>
            )}
            {result.summary.duplicateShots > 0 && (
              <span className="text-amber-400">{result.summary.duplicateShots} 重复</span>
            )}
            {result.summary.continuityErrors > 0 && (
              <span className="text-rose-400">{result.summary.continuityErrors} 连续性错误</span>
            )}
            {result.issueCount === 0 && (
              <span className="text-emerald-400">全部通过</span>
            )}
          </div>
        )}

        {/* 无结果状态 */}
        {result && result.issueCount === 0 && result.totalShots > 0 && (
          <div className="mt-3 p-4 rounded-lg bg-emerald-500/10 text-center">
            <ShieldCheck className="w-8 h-8 text-emerald-400 mx-auto mb-2" />
            <p className="text-sm text-emerald-400 font-medium">所有分镜检验通过</p>
            <p className="text-xs text-(--text-muted) mt-1">未发现空镜头、重复内容或连贯性问题</p>
          </div>
        )}
      </div>

      {/* 问题列表 */}
      <div className="flex-1 overflow-y-auto p-3">
        {!result && !isValidating && (
          <div className="text-center py-8">
            <ShieldCheck className="w-10 h-10 text-(--text-muted) mx-auto mb-3 opacity-40" />
            <p className="text-sm text-(--text-muted)">点击「检验分镜」按钮开始检验</p>
          </div>
        )}

        {isValidating && !result && (
          <div className="text-center py-8">
            <div className="w-8 h-8 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
            <p className="text-sm text-(--text-muted)">正在检验分镜内容...</p>
          </div>
        )}

        {result && result.issueCount > 0 && (
          <>
            {/* 错误组 */}
            {grouped.error.length > 0 && (
              <div className="mb-3">
                <GroupHeader
                  severity="error"
                  count={grouped.error.length}
                  isExpanded={expandedGroups.error}
                  onToggle={() => toggleGroup('error')}
                />
                {expandedGroups.error && (
                  <div className="mt-1">
                    {grouped.error.map((issue, idx) => (
                      <IssueCard key={`error-${idx}`} issue={issue} onSelectScene={onSelectScene} />
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* 警告组 */}
            {grouped.warning.length > 0 && (
              <div className="mb-3">
                <GroupHeader
                  severity="warning"
                  count={grouped.warning.length}
                  isExpanded={expandedGroups.warning}
                  onToggle={() => toggleGroup('warning')}
                />
                {expandedGroups.warning && (
                  <div className="mt-1">
                    {grouped.warning.map((issue, idx) => (
                      <IssueCard key={`warning-${idx}`} issue={issue} onSelectScene={onSelectScene} />
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* 建议组 */}
            {grouped.info.length > 0 && (
              <div className="mb-3">
                <GroupHeader
                  severity="info"
                  count={grouped.info.length}
                  isExpanded={expandedGroups.info}
                  onToggle={() => toggleGroup('info')}
                />
                {expandedGroups.info && (
                  <div className="mt-1">
                    {grouped.info.map((issue, idx) => (
                      <IssueCard key={`info-${idx}`} issue={issue} onSelectScene={onSelectScene} />
                    ))}
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default StoryboardValidationPanel;
