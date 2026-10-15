import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Button } from '@heroui/react';
import { ArrowLeft, Eye, Heart, FileText, Globe, Twitter, ExternalLink, Star, Sparkles } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useLanguage } from '../../contexts/LanguageContext';
import { useToast } from '../../contexts/ToastContext';
import {
  CreatorProfile as CreatorProfileType,
  Showcase,
  fetchCreatorProfile,
  fetchCreatorShowcases,
  likeShowcase,
} from '../../services/community';
import Skeleton from '../../components/Skeleton';

// 徽章颜色映射
const BADGE_COLORS: Record<CreatorProfileType['badge'], { bg: string; text: string; border: string; gradient: string }> = {
  newcomer: { bg: 'bg-slate-500/15', text: 'text-slate-400', border: 'border-slate-500/30', gradient: 'from-slate-500 to-slate-600' },
  creator: { bg: 'bg-blue-500/15', text: 'text-blue-400', border: 'border-blue-500/30', gradient: 'from-blue-500 to-blue-600' },
  pro: { bg: 'bg-purple-500/15', text: 'text-purple-400', border: 'border-purple-500/30', gradient: 'from-purple-500 to-purple-600' },
  master: { bg: 'bg-amber-500/15', text: 'text-amber-400', border: 'border-amber-500/30', gradient: 'from-amber-500 to-amber-600' },
};

// 每页数量
const PAGE_SIZE = 9;

const CreatorProfile: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { t } = useLanguage();
  const { showToast } = useToast();

  // 状态
  const [profile, setProfile] = useState<CreatorProfileType | null>(null);
  const [showcases, setShowcases] = useState<Showcase[]>([]);
  const [loadingProfile, setLoadingProfile] = useState(true);
  const [loadingShowcases, setLoadingShowcases] = useState(true);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [likingId, setLikingId] = useState<number | null>(null);

  const userId = id ? parseInt(id, 10) : null;

  // 加载创作者档案
  const loadProfile = useCallback(async () => {
    if (!userId) return;
    setLoadingProfile(true);
    setError(null);
    try {
      const result = await fetchCreatorProfile(userId);
      setProfile(result);
    } catch (err) {
      console.error('加载创作者档案失败:', err);
      setError('加载创作者档案失败');
    } finally {
      setLoadingProfile(false);
    }
  }, [userId]);

  // 加载创作者作品
  const loadShowcases = useCallback(async () => {
    if (!userId) return;
    setLoadingShowcases(true);
    try {
      const result = await fetchCreatorShowcases(userId, { page, limit: PAGE_SIZE });
      setShowcases(result.showcases);
      setTotal(result.total);
    } catch (err) {
      console.error('加载作品列表失败:', err);
    } finally {
      setLoadingShowcases(false);
    }
  }, [userId, page]);

  useEffect(() => {
    loadProfile();
  }, [loadProfile]);

  useEffect(() => {
    loadShowcases();
  }, [loadShowcases]);

  // 点赞处理
  const handleLike = async (showcase: Showcase) => {
    setLikingId(showcase.id);
    try {
      const result = await likeShowcase(showcase.id);
      setShowcases(prev =>
        prev.map(s =>
          s.id === showcase.id
            ? { ...s, hasLiked: result.liked, likeCount: result.likeCount }
            : s
        )
      );
    } catch (err: unknown) {
      console.error('点赞失败:', err);
      showToast(err instanceof Error ? err.message : '点赞失败', 'error');
    } finally {
      setLikingId(null);
    }
  };

  // 徽章名称
  const getBadgeLabel = (badge: CreatorProfileType['badge']) => {
    return t.community.creator.badges[badge] || badge;
  };

  // 总页数
  const totalPages = Math.ceil(total / PAGE_SIZE);

  // 卡片动画变体
  const cardVariants = {
    hidden: { opacity: 0, y: 20 },
    visible: (i: number) => ({
      opacity: 1,
      y: 0,
      transition: {
        delay: i * 0.05,
        duration: 0.3,
        ease: 'easeOut' as const,
      },
    }),
  };

  // 错误状态
  if (error && !loadingProfile) {
    return (
      <div className="h-full bg-[var(--bg-app)] overflow-auto p-6">
        <div className="max-w-4xl mx-auto">
          <Button
            variant="light"
            startContent={<ArrowLeft className="w-4 h-4" />}
            onPress={() => navigate(-1)}
            className="mb-6 text-[var(--text-secondary)]"
          >
            返回
          </Button>
          <div className="text-center py-16">
            <div className="w-20 h-20 mx-auto bg-[var(--bg-card)] rounded-full flex items-center justify-center mb-4 border border-[var(--border-color)]">
              <FileText className="w-10 h-10 text-[var(--text-muted)]" />
            </div>
            <p className="text-[var(--text-secondary)] font-medium">{error}</p>
            <Button
              className="mt-4"
              variant="flat"
              onPress={loadProfile}
            >
              重试
            </Button>
          </div>
        </div>
      </div>
    );
  }

  const badgeColors = profile ? BADGE_COLORS[profile.badge] : BADGE_COLORS.newcomer;

  return (
    <div className="h-full bg-[var(--bg-app)] overflow-auto p-6">
      <div className="max-w-4xl mx-auto space-y-6">
        {/* 返回按钮 */}
        <Button
          variant="light"
          startContent={<ArrowLeft className="w-4 h-4" />}
          onPress={() => navigate(-1)}
          className="text-[var(--text-secondary)]"
        >
          返回
        </Button>

        {/* 创作者信息卡片 */}
        {loadingProfile ? (
          <div className="bg-[var(--bg-card)] rounded-2xl border border-[var(--border-color)] p-6">
            <div className="flex flex-col md:flex-row items-center md:items-start gap-6">
              <Skeleton className="w-24 h-24 rounded-full" />
              <div className="flex-1 space-y-3 text-center md:text-left">
                <Skeleton className="h-7 w-40 mx-auto md:mx-0" />
                <Skeleton className="h-4 w-64 mx-auto md:mx-0" />
                <Skeleton className="h-5 w-20 mx-auto md:mx-0" />
              </div>
            </div>
          </div>
        ) : profile ? (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-[var(--bg-card)] rounded-2xl border border-[var(--border-color)] overflow-hidden"
          >
            {/* 背景装饰 */}
            <div className={`h-24 bg-gradient-to-r ${badgeColors.gradient} opacity-20`} />
            
            <div className="px-6 pb-6 -mt-12">
              <div className="flex flex-col md:flex-row items-center md:items-end gap-6">
                {/* 大头像 */}
                <div className="relative">
                  <div className="w-24 h-24 rounded-full bg-gradient-to-br from-[var(--accent)]/30 to-purple-500/30 flex items-center justify-center text-3xl font-bold text-[var(--accent)] border-4 border-[var(--bg-card)] shadow-lg">
                    {profile.avatarUrl ? (
                      <img
                        src={profile.avatarUrl}
                        alt=""
                        className="w-full h-full rounded-full object-cover"
                      />
                    ) : (
                      profile.displayName?.[0]?.toUpperCase() || 'U'
                    )}
                  </div>
                </div>

                {/* 基本信息 */}
                <div className="flex-1 text-center md:text-left">
                  <div className="flex flex-col md:flex-row items-center gap-3">
                    <h1 className="text-2xl font-bold text-[var(--text-primary)]">
                      {profile.displayName || '匿名用户'}
                    </h1>
                    <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-medium ${badgeColors.bg} ${badgeColors.text} border ${badgeColors.border}`}>
                      <Sparkles className="w-3.5 h-3.5" />
                      {getBadgeLabel(profile.badge)}
                    </span>
                  </div>
                  {profile.bio && (
                    <p className="text-[var(--text-muted)] mt-2 max-w-lg">
                      {profile.bio}
                    </p>
                  )}
                </div>

                {/* 社交链接 */}
                {profile.socialLinks && (
                  <div className="flex items-center gap-2">
                    {profile.socialLinks.website && (
                      <a
                        href={profile.socialLinks.website}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="p-2 rounded-lg bg-[var(--bg-input)] text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-white/10 transition-colors"
                      >
                        <Globe className="w-5 h-5" />
                      </a>
                    )}
                    {profile.socialLinks.twitter && (
                      <a
                        href={`https://twitter.com/${profile.socialLinks.twitter}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="p-2 rounded-lg bg-[var(--bg-input)] text-[var(--text-muted)] hover:text-blue-400 hover:bg-blue-500/10 transition-colors"
                      >
                        <Twitter className="w-5 h-5" />
                      </a>
                    )}
                    {profile.socialLinks.bilibili && (
                      <a
                        href={profile.socialLinks.bilibili}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="p-2 rounded-lg bg-[var(--bg-input)] text-[var(--text-muted)] hover:text-pink-400 hover:bg-pink-500/10 transition-colors"
                      >
                        <ExternalLink className="w-5 h-5" />
                      </a>
                    )}
                  </div>
                )}
              </div>

              {/* 统计数据 */}
              <div className="flex items-center justify-center md:justify-start gap-8 mt-6 pt-6 border-t border-[var(--border-color)]">
                <div className="text-center">
                  <div className="text-2xl font-bold text-[var(--text-primary)]">
                    {profile.worksCount}
                  </div>
                  <div className="text-sm text-[var(--text-muted)]">{t.community.creator.works}</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-[var(--text-primary)]">
                    {profile.totalViews.toLocaleString()}
                  </div>
                  <div className="text-sm text-[var(--text-muted)]">{t.community.creator.totalViews}</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-[var(--text-primary)]">
                    {profile.totalLikes.toLocaleString()}
                  </div>
                  <div className="text-sm text-[var(--text-muted)]">{t.community.creator.totalLikes}</div>
                </div>
              </div>
            </div>
          </motion.div>
        ) : null}

        {/* 作品列表标题 */}
        <div className="flex items-center gap-2">
          <FileText className="w-5 h-5 text-[var(--accent)]" />
          <h2 className="text-lg font-semibold text-[var(--text-primary)]">
            {t.community.creator.works} ({total})
          </h2>
        </div>

        {/* 作品卡片网格 */}
        {loadingShowcases ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="bg-[var(--bg-card)] rounded-2xl border border-[var(--border-color)] overflow-hidden">
                <Skeleton className="aspect-video" />
                <div className="p-4 space-y-3">
                  <Skeleton className="h-5 w-3/4" />
                  <div className="flex items-center gap-4">
                    <Skeleton className="h-4 w-16" />
                    <Skeleton className="h-4 w-16" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : showcases.length === 0 ? (
          <div className="text-center py-12">
            <div className="w-16 h-16 mx-auto bg-[var(--bg-card)] rounded-full flex items-center justify-center mb-4 border border-[var(--border-color)]">
              <Star className="w-8 h-8 text-[var(--text-muted)]" />
            </div>
            <p className="text-[var(--text-muted)]">暂无作品</p>
          </div>
        ) : (
          <AnimatePresence mode="wait">
            <motion.div
              key={page}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4"
            >
              {showcases.map((showcase, index) => (
                <motion.div
                  key={showcase.id}
                  custom={index}
                  variants={cardVariants}
                  initial="hidden"
                  animate="visible"
                  className="group bg-[var(--bg-card)] rounded-2xl border border-[var(--border-color)] overflow-hidden hover:border-[var(--accent)]/30 hover:shadow-lg hover:shadow-[var(--accent)]/5 transition-all duration-300 cursor-pointer"
                >
                  {/* 封面图 */}
                  <div className="relative aspect-video bg-gradient-to-br from-[var(--bg-input)] to-[var(--bg-card)] overflow-hidden">
                    {showcase.coverUrl ? (
                      <img
                        src={showcase.coverUrl}
                        alt={showcase.title}
                        className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <Star className="w-12 h-12 text-[var(--text-muted)]/30" />
                      </div>
                    )}

                    {/* 精选标签 */}
                    {showcase.isFeatured && (
                      <div className="absolute top-3 left-3">
                        <div className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-gradient-to-r from-amber-500/90 to-orange-500/90 text-white text-xs font-medium shadow-lg">
                          <Sparkles className="w-3 h-3" />
                          {t.community.showcase.featured}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* 信息区域 */}
                  <div className="p-4 space-y-3">
                    <h3 className="text-base font-semibold text-[var(--text-primary)] line-clamp-1 group-hover:text-[var(--accent)] transition-colors">
                      {showcase.title}
                    </h3>

                    {/* 统计和点赞 */}
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-4 text-sm text-[var(--text-muted)]">
                        <div className="flex items-center gap-1">
                          <Eye className="w-4 h-4" />
                          <span>{showcase.viewCount}</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <Heart className={`w-4 h-4 ${showcase.hasLiked ? 'fill-pink-500 text-pink-500' : ''}`} />
                          <span>{showcase.likeCount}</span>
                        </div>
                      </div>

                      {/* 点赞按钮 */}
                      <Button
                        size="sm"
                        variant="light"
                        isIconOnly
                        isLoading={likingId === showcase.id}
                        onPress={() => handleLike(showcase)}
                        className={`rounded-full transition-all ${
                          showcase.hasLiked
                            ? 'text-pink-500 bg-pink-500/10 hover:bg-pink-500/20'
                            : 'text-[var(--text-muted)] hover:text-pink-500 hover:bg-pink-500/10'
                        }`}
                      >
                        <Heart
                          className={`w-4 h-4 ${showcase.hasLiked ? 'fill-current' : ''}`}
                        />
                      </Button>
                    </div>
                  </div>
                </motion.div>
              ))}
            </motion.div>
          </AnimatePresence>
        )}

        {/* 分页 */}
        {totalPages > 1 && (
          <div className="flex items-center justify-center gap-2 pt-4">
            <Button
              size="sm"
              variant="flat"
              isDisabled={page === 1 || loadingShowcases}
              onPress={() => setPage(p => p - 1)}
              className="bg-[var(--bg-card)] text-[var(--text-secondary)] border border-[var(--border-color)]"
            >
              上一页
            </Button>
            <span className="text-sm text-[var(--text-muted)] px-4">
              {page} / {totalPages}
            </span>
            <Button
              size="sm"
              variant="flat"
              isDisabled={page === totalPages || loadingShowcases}
              onPress={() => setPage(p => p + 1)}
              className="bg-[var(--bg-card)] text-[var(--text-secondary)] border border-[var(--border-color)]"
            >
              下一页
            </Button>
          </div>
        )}
      </div>
    </div>
  );
};

export default CreatorProfile;
