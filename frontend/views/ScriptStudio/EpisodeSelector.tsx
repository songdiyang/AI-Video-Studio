/**
 * 集数选择器组件
 * 显示已有集数（包括草稿、生成中、已完成），允许快速切换和生成新集
 */

import React from 'react';
import { Script } from './hooks/useScriptManagement';

interface EpisodeSelectorProps {
  scripts: Script[];
  currentEpisode: number;
  nextEpisode: number;
  loading: boolean;
  onEpisodeChange: (episode: number) => void;
  onNewEpisode: () => void;
  /** 当前草稿集数（从数据库中获取） */
  draftEpisode?: number | null;
}

const EpisodeSelector: React.FC<EpisodeSelectorProps> = ({
  scripts,
  currentEpisode,
  nextEpisode,
  loading,
  onEpisodeChange,
  onNewEpisode,
  draftEpisode
}) => {
  // 检查是否存在草稿
  const hasDraft = !!draftEpisode;

  if (scripts.length === 0) return null;

  // 根据状态获取按钮样式
  const getButtonStyle = (script: Script, isActive: boolean) => {
    if (script.status === 'draft') {
      // 草稿状态 - 警告色
      return isActive
        ? 'bg-gradient-to-r from-[var(--warning)] to-orange-500 text-white shadow-md shadow-[var(--warning-glow)]'
        : 'bg-[var(--warning)]/10 text-[var(--warning)] hover:bg-[var(--warning)]/20 border border-[var(--warning)]/30';
    } else if (script.status === 'generating') {
      // 生成中 - 强调色动画
      return isActive
        ? 'bg-gradient-to-r from-[var(--accent)] to-[var(--accent-secondary)] text-white shadow-md shadow-[var(--accent-glow)] animate-pulse'
        : 'bg-[var(--bg-input)] text-[var(--text-secondary)] hover:bg-[var(--bg-card-hover)] border border-[var(--border-color)] animate-pulse';
    } else {
      // 已完成/失败 - 标准强调色
      return isActive
        ? 'bg-gradient-to-r from-[var(--accent)] to-[var(--accent-secondary)] text-white shadow-md shadow-[var(--accent-glow)]'
        : 'bg-[var(--bg-input)] text-[var(--text-secondary)] hover:bg-[var(--bg-card-hover)] border border-[var(--border-color)]';
    }
  };

  // 获取状态标签
  const getStatusLabel = (status: Script['status']) => {
    switch (status) {
      case 'draft': return ' (草稿)';
      case 'generating': return ' (生成中)';
      case 'failed': return ' (失败)';
      default: return '';
    }
  };

  return (
    <div className="flex items-center gap-3 pb-4 border-b border-[var(--border-color)]">
      <span className="text-sm text-[var(--text-muted)] font-medium">集数:</span>
      <div className="flex gap-2 flex-wrap flex-1">
        {scripts.map((s) => (
          <button
            key={s.id}
            onClick={() => onEpisodeChange(s.episode_number)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${getButtonStyle(s, currentEpisode === s.episode_number)}`}
          >
            第{s.episode_number}集{getStatusLabel(s.status)}
          </button>
        ))}
      </div>
      <button
        onClick={onNewEpisode}
        disabled={loading || hasDraft}
        className="px-3 py-1.5 rounded-lg text-sm font-semibold bg-[var(--success)] text-white hover:bg-[var(--success)]/80 transition-all flex items-center gap-1 disabled:opacity-50 shadow-md shadow-[var(--success-glow)]"
      >
        <span className="text-lg leading-none">+</span> 生成第{nextEpisode}集
      </button>
    </div>
  );
};

export default EpisodeSelector;
