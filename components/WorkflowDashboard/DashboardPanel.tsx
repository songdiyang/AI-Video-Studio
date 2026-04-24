import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, FolderOpen, FileText, Film, Sparkles, RefreshCw } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import StatCard from './StatCard';
import { useDashboardStats } from '../../hooks/useDashboardStats';
import { useLanguage } from '../../contexts/LanguageContext';

interface DashboardPanelProps {
  isOpen: boolean;
  onClose: () => void;
}

// 相对时间计算
function formatRelativeTime(dateStr: string, t: Record<string, string>): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffMins < 1) {
    return t.justNow || '刚刚';
  } else if (diffMins < 60) {
    return `${diffMins} ${t.minutesAgo || '分钟前'}`;
  } else if (diffHours < 24) {
    return `${diffHours} ${t.hoursAgo || '小时前'}`;
  } else {
    return `${diffDays} ${t.daysAgo || '天前'}`;
  }
}

const DashboardPanel: React.FC<DashboardPanelProps> = ({ isOpen, onClose }) => {
  const navigate = useNavigate();
  const { t } = useLanguage();
  const { stats, loading, error, refresh } = useDashboardStats();

  // 获取翻译文本，带降级处理
  const dashboardT = (t as Record<string, unknown>).dashboard as Record<string, unknown> | undefined;
  const statsT = dashboardT?.stats as Record<string, string> | undefined;

  const title = (dashboardT?.title as string) || '工作流概览';
  const refreshText = (dashboardT?.refresh as string) || '刷新数据';
  const recentProjectsText = (dashboardT?.recentProjects as string) || '最近项目';
  const noProjectsText = (dashboardT?.noProjects as string) || '暂无项目，开始创建吧';
  const loadErrorText = (dashboardT?.loadError as string) || '数据加载失败';

  const projectsLabel = statsT?.projects || '项目';
  const scriptsLabel = statsT?.scripts || '剧本';
  const storyboardsLabel = statsT?.storyboards || '分镜';
  const aiCallsLabel = statsT?.aiCalls || 'AI 调用';

  const timeT = {
    justNow: (dashboardT?.justNow as string) || '刚刚',
    minutesAgo: (dashboardT?.minutesAgo as string) || '分钟前',
    hoursAgo: (dashboardT?.hoursAgo as string) || '小时前',
    daysAgo: (dashboardT?.daysAgo as string) || '天前',
  };

  const handleProjectClick = (projectId: string) => {
    onClose();
    navigate(`/?projectId=${projectId}`);
  };

  const handleRefresh = () => {
    refresh();
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* 背景遮罩 */}
          <motion.div
            className="fixed inset-0 bg-black/40 z-[149]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />

          {/* 面板 */}
          <motion.div
            className="fixed top-0 right-0 h-full w-80 bg-[var(--bg-nav)] border-l border-[var(--border-color)] shadow-2xl z-[150] flex flex-col"
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
          >
            {/* 头部 */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border-color)]">
              <h2 className="text-base font-semibold text-[var(--text-primary)]">
                {title}
              </h2>
              <div className="flex items-center gap-2">
                <button
                  onClick={handleRefresh}
                  className="p-1.5 rounded-lg text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-white/5 transition-colors"
                  aria-label={refreshText}
                  title={refreshText}
                  disabled={loading}
                >
                  <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                </button>
                <button
                  onClick={onClose}
                  className="p-1.5 rounded-lg text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-white/5 transition-colors"
                  aria-label="Close"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* 内容区 */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {/* 错误状态 */}
              {error && (
                <div className="p-3 rounded-lg bg-[var(--danger)]/10 border border-[var(--danger)]/30 text-[var(--danger)] text-sm">
                  {loadErrorText}
                </div>
              )}

              {/* 统计卡片网格 */}
              <div className="grid grid-cols-2 gap-3">
                {loading ? (
                  // 骨架屏
                  <>
                    {[0, 1, 2, 3].map((i) => (
                      <div
                        key={i}
                        className="h-[72px] rounded-xl skeleton-shimmer"
                      />
                    ))}
                  </>
                ) : (
                  <>
                    <StatCard
                      icon={<FolderOpen className="w-5 h-5" />}
                      label={projectsLabel}
                      value={stats.projectCount}
                      color="#3b82f6"
                      delay={0}
                    />
                    <StatCard
                      icon={<FileText className="w-5 h-5" />}
                      label={scriptsLabel}
                      value={stats.scriptCount}
                      color="#8b5cf6"
                      delay={100}
                    />
                    <StatCard
                      icon={<Film className="w-5 h-5" />}
                      label={storyboardsLabel}
                      value={stats.storyboardCount}
                      color="#06b6d4"
                      delay={200}
                    />
                    <StatCard
                      icon={<Sparkles className="w-5 h-5" />}
                      label={aiCallsLabel}
                      value={stats.aiCallsCount}
                      color="#f59e0b"
                      delay={300}
                    />
                  </>
                )}
              </div>

              {/* 分割线 */}
              <div className="pro-divider my-4" />

              {/* 最近项目 */}
              <div>
                <h3 className="text-sm font-medium text-[var(--text-secondary)] mb-3">
                  {recentProjectsText}
                </h3>

                {loading ? (
                  // 骨架屏
                  <div className="space-y-2">
                    {[0, 1, 2].map((i) => (
                      <div
                        key={i}
                        className="h-12 rounded-lg skeleton-shimmer"
                      />
                    ))}
                  </div>
                ) : stats.recentProjects.length === 0 ? (
                  // 空状态
                  <div className="text-center py-8">
                    <FolderOpen className="w-10 h-10 mx-auto mb-2 text-[var(--text-muted)] opacity-50" />
                    <p className="text-sm text-[var(--text-muted)]">
                      {noProjectsText}
                    </p>
                    <button
                      onClick={() => {
                        onClose();
                        navigate('/projects');
                      }}
                      className="mt-3 px-4 py-2 text-sm font-medium text-[var(--accent)] bg-[var(--accent)]/10 hover:bg-[var(--accent)]/20 rounded-lg transition-colors"
                    >
                      {t.nav.projects}
                    </button>
                  </div>
                ) : (
                  // 项目列表
                  <div className="space-y-2">
                    {stats.recentProjects.map((project, index) => (
                      <motion.button
                        key={project.id}
                        onClick={() => handleProjectClick(project.id)}
                        className="w-full flex items-center justify-between p-3 rounded-lg bg-[var(--bg-card)] hover:bg-[var(--bg-card-hover)] border border-[var(--border-color)] transition-colors text-left"
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: index * 0.05 }}
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="w-8 h-8 rounded-lg bg-[var(--accent)]/10 flex items-center justify-center flex-shrink-0">
                            <FolderOpen className="w-4 h-4 text-[var(--accent)]" />
                          </div>
                          <span className="text-sm text-[var(--text-primary)] truncate">
                            {project.name}
                          </span>
                        </div>
                        <span className="text-xs text-[var(--text-muted)] flex-shrink-0 ml-2">
                          {formatRelativeTime(project.updatedAt, timeT)}
                        </span>
                      </motion.button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
};

export default DashboardPanel;
