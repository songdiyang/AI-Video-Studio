import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Trophy, Crown, Medal, Eye, Star, FileText } from 'lucide-react';
import { motion } from 'framer-motion';
import { useLanguage } from '../../contexts/LanguageContext';
import { useToast } from '../../contexts/ToastContext';
import { CreatorRank, fetchLeaderboard } from '../../services/community';
import Skeleton from '../../components/Skeleton';

// 排行榜周期
type PeriodKey = 'weekly' | 'monthly' | 'all_time';

const PERIOD_OPTIONS: PeriodKey[] = ['weekly', 'monthly', 'all_time'];

// 徽章颜色映射
const BADGE_COLORS: Record<CreatorRank['badge'], { bg: string; text: string; border: string }> = {
  newcomer: { bg: 'bg-slate-500/15', text: 'text-slate-400', border: 'border-slate-500/30' },
  creator: { bg: 'bg-blue-500/15', text: 'text-blue-400', border: 'border-blue-500/30' },
  pro: { bg: 'bg-purple-500/15', text: 'text-purple-400', border: 'border-purple-500/30' },
  master: { bg: 'bg-amber-500/15', text: 'text-amber-400', border: 'border-amber-500/30' },
};

// 前三名颜色
const TOP_COLORS = {
  1: { gradient: 'from-amber-400/20 to-yellow-500/20', border: 'border-amber-400/50', icon: 'text-amber-400', shadow: 'shadow-amber-500/20' },
  2: { gradient: 'from-slate-300/20 to-gray-400/20', border: 'border-slate-300/50', icon: 'text-slate-300', shadow: 'shadow-slate-400/20' },
  3: { gradient: 'from-orange-600/20 to-amber-700/20', border: 'border-orange-600/50', icon: 'text-orange-500', shadow: 'shadow-orange-500/20' },
};

const Leaderboard: React.FC = () => {
  const navigate = useNavigate();
  const { t } = useLanguage();
  const { showToast } = useToast();

  // 状态
  const [rankings, setRankings] = useState<CreatorRank[]>([]);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState<PeriodKey>('weekly');

  // 加载排行榜
  const loadLeaderboard = useCallback(async () => {
    setLoading(true);
    try {
      const result = await fetchLeaderboard({
        period,
        limit: 20,
      });
      setRankings(result);
    } catch (error) {
      console.error('加载排行榜失败:', error);
      showToast('加载排行榜失败', 'error');
    } finally {
      setLoading(false);
    }
  }, [period, showToast]);

  useEffect(() => {
    loadLeaderboard();
  }, [loadLeaderboard]);

  // 周期标签名称
  const getPeriodLabel = (p: PeriodKey) => {
    const labels: Record<PeriodKey, string> = {
      weekly: t.community.leaderboardTab.weekly,
      monthly: t.community.leaderboardTab.monthly,
      all_time: t.community.leaderboardTab.allTime,
    };
    return labels[p] || p;
  };

  // 徽章名称
  const getBadgeLabel = (badge: CreatorRank['badge']) => {
    return t.community.creator.badges[badge] || badge;
  };

  // 跳转创作者主页
  const handleCreatorClick = (userId: number) => {
    navigate(`/community/creator/${userId}`);
  };

  // 前三名卡片
  const renderTopThree = () => {
    const top3 = rankings.slice(0, 3);
    if (top3.length === 0) return null;

    return (
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        {top3.map((creator, index) => {
          const rank = index + 1;
          const colors = TOP_COLORS[rank as 1 | 2 | 3];
          const badgeColor = BADGE_COLORS[creator.badge];

          return (
            <motion.div
              key={creator.userId}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.1 }}
              onClick={() => handleCreatorClick(creator.userId)}
              className={`relative p-5 rounded-2xl bg-gradient-to-br ${colors.gradient} border ${colors.border} ${colors.shadow} shadow-lg cursor-pointer hover:scale-[1.02] transition-transform duration-300`}
            >
              {/* 排名图标 */}
              <div className="absolute -top-3 -right-3">
                {rank === 1 ? (
                  <div className={`p-2 rounded-full bg-[var(--bg-card)] border ${colors.border} shadow-lg`}>
                    <Crown className={`w-6 h-6 ${colors.icon}`} />
                  </div>
                ) : (
                  <div className={`p-2 rounded-full bg-[var(--bg-card)] border ${colors.border} shadow-lg`}>
                    <Medal className={`w-6 h-6 ${colors.icon}`} />
                  </div>
                )}
              </div>

              {/* 排名数字 */}
              <div className={`text-5xl font-bold ${colors.icon} opacity-30 absolute top-3 left-4`}>
                #{rank}
              </div>

              {/* 创作者信息 */}
              <div className="relative mt-6 text-center">
                {/* 头像 */}
                <div className="w-16 h-16 mx-auto rounded-full bg-gradient-to-br from-[var(--accent)]/30 to-purple-500/30 flex items-center justify-center text-xl font-bold text-[var(--accent)] border-2 border-[var(--accent)]/30 mb-3">
                  {creator.avatarUrl ? (
                    <img
                      src={creator.avatarUrl}
                      alt=""
                      className="w-full h-full rounded-full object-cover"
                    />
                  ) : (
                    creator.displayName?.[0]?.toUpperCase() || 'U'
                  )}
                </div>

                {/* 名称 */}
                <h3 className="text-lg font-semibold text-[var(--text-primary)] mb-1">
                  {creator.displayName || '匿名用户'}
                </h3>

                {/* 徽章 */}
                <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${badgeColor.bg} ${badgeColor.text} border ${badgeColor.border}`}>
                  {getBadgeLabel(creator.badge)}
                </span>

                {/* 统计 */}
                <div className="flex items-center justify-center gap-4 mt-4 text-sm">
                  <div className="flex items-center gap-1 text-[var(--text-muted)]">
                    <FileText className="w-3.5 h-3.5" />
                    <span>{creator.worksCount}</span>
                  </div>
                  <div className="flex items-center gap-1 text-[var(--text-muted)]">
                    <Eye className="w-3.5 h-3.5" />
                    <span>{creator.totalViews.toLocaleString()}</span>
                  </div>
                </div>
              </div>
            </motion.div>
          );
        })}
      </div>
    );
  };

  // 4-20 名列表
  const renderRestRankings = () => {
    const rest = rankings.slice(3);
    if (rest.length === 0) return null;

    return (
      <div className="space-y-2">
        {rest.map((creator, index) => {
          const rank = index + 4;
          const badgeColor = BADGE_COLORS[creator.badge];

          return (
            <motion.div
              key={creator.userId}
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: (index + 3) * 0.03 }}
              onClick={() => handleCreatorClick(creator.userId)}
              className="flex items-center gap-4 p-4 bg-[var(--bg-card)] rounded-xl border border-[var(--border-color)] hover:border-[var(--accent)]/30 hover:bg-[var(--bg-input)] cursor-pointer transition-all duration-200"
            >
              {/* 排名 */}
              <div className="w-8 text-center">
                <span className="text-lg font-bold text-[var(--text-muted)]">{rank}</span>
              </div>

              {/* 头像 */}
              <div className="w-10 h-10 rounded-full bg-gradient-to-br from-[var(--accent)]/30 to-purple-500/30 flex items-center justify-center text-sm font-medium text-[var(--accent)] border border-[var(--accent)]/20">
                {creator.avatarUrl ? (
                  <img
                    src={creator.avatarUrl}
                    alt=""
                    className="w-full h-full rounded-full object-cover"
                  />
                ) : (
                  creator.displayName?.[0]?.toUpperCase() || 'U'
                )}
              </div>

              {/* 名称和徽章 */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-[var(--text-primary)] truncate">
                    {creator.displayName || '匿名用户'}
                  </span>
                  <span className={`flex-shrink-0 px-2 py-0.5 rounded-full text-xs font-medium ${badgeColor.bg} ${badgeColor.text} border ${badgeColor.border}`}>
                    {getBadgeLabel(creator.badge)}
                  </span>
                </div>
              </div>

              {/* 统计数据 */}
              <div className="flex items-center gap-6 text-sm text-[var(--text-muted)]">
                <div className="flex items-center gap-1.5 min-w-[60px]">
                  <FileText className="w-4 h-4" />
                  <span>{creator.worksCount}</span>
                </div>
                <div className="flex items-center gap-1.5 min-w-[80px]">
                  <Eye className="w-4 h-4" />
                  <span>{creator.totalViews.toLocaleString()}</span>
                </div>
              </div>
            </motion.div>
          );
        })}
      </div>
    );
  };

  return (
    <div className="space-y-6">
      {/* 周期切换 */}
      <div className="flex items-center gap-2">
        {PERIOD_OPTIONS.map((p) => (
          <button
            key={p}
            onClick={() => setPeriod(p)}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-medium transition-all ${
              period === p
                ? 'bg-[var(--accent)]/20 text-[var(--accent)] border border-[var(--accent)]/40 shadow-sm'
                : 'bg-[var(--bg-card)] text-[var(--text-muted)] border border-[var(--border-color)] hover:bg-[var(--bg-input)] hover:text-[var(--text-secondary)]'
            }`}
          >
            {p === 'weekly' && <Trophy className="w-3.5 h-3.5" />}
            {p === 'monthly' && <Star className="w-3.5 h-3.5" />}
            {p === 'all_time' && <Crown className="w-3.5 h-3.5" />}
            {getPeriodLabel(p)}
          </button>
        ))}
      </div>

      {/* 内容区域 */}
      {loading ? (
        <div className="space-y-4">
          {/* 前三名骨架 */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="p-5 bg-[var(--bg-card)] rounded-2xl border border-[var(--border-color)]">
                <div className="text-center">
                  <Skeleton className="w-16 h-16 rounded-full mx-auto mb-3" />
                  <Skeleton className="h-5 w-24 mx-auto mb-2" />
                  <Skeleton className="h-4 w-16 mx-auto" />
                </div>
              </div>
            ))}
          </div>
          {/* 列表骨架 */}
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="flex items-center gap-4 p-4 bg-[var(--bg-card)] rounded-xl border border-[var(--border-color)]">
              <Skeleton className="w-8 h-6" />
              <Skeleton className="w-10 h-10 rounded-full" />
              <Skeleton className="h-5 flex-1" />
              <Skeleton className="w-20 h-4" />
            </div>
          ))}
        </div>
      ) : rankings.length === 0 ? (
        /* 空状态 */
        <div className="text-center py-16">
          <div className="w-20 h-20 mx-auto bg-[var(--bg-card)] rounded-full flex items-center justify-center mb-4 border border-[var(--border-color)]">
            <Trophy className="w-10 h-10 text-[var(--text-muted)]" />
          </div>
          <p className="text-[var(--text-secondary)] font-medium">暂无排行数据</p>
          <p className="text-[var(--text-muted)] text-sm mt-1">快来发布作品，争夺排行榜吧</p>
        </div>
      ) : (
        <>
          {renderTopThree()}
          {renderRestRankings()}
        </>
      )}
    </div>
  );
};

export default Leaderboard;
