import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button, Tabs, Tab } from '@heroui/react';
import { Heart, Eye, Sparkles, Users, TrendingUp, Clock, Star } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useLanguage } from '../../contexts/LanguageContext';
import { useToast } from '../../contexts/ToastContext';
import { Showcase, fetchShowcases, likeShowcase } from '../../services/community';
import Skeleton from '../../components/Skeleton';
import Leaderboard from './Leaderboard';

// 筛选类型
type FilterKey = 'hot' | 'newest' | 'featured';

const FILTER_OPTIONS: FilterKey[] = ['hot', 'newest', 'featured'];

// 每页数量
const PAGE_SIZE = 12;

const Community: React.FC = () => {
  const navigate = useNavigate();
  const { t } = useLanguage();
  const { showToast } = useToast();

  // Tab 状态
  const [activeTab, setActiveTab] = useState<'showcases' | 'leaderboard'>('showcases');

  // 作品列表状态
  const [showcases, setShowcases] = useState<Showcase[]>([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [filter, setFilter] = useState<FilterKey>('hot');
  const [likingId, setLikingId] = useState<number | null>(null);

  // 加载作品列表
  const loadShowcases = useCallback(async () => {
    setLoading(true);
    try {
      const result = await fetchShowcases({
        filter,
        page,
        limit: PAGE_SIZE,
      });
      setShowcases(result.showcases);
      setTotal(result.total);
    } catch (error) {
      console.error('加载作品失败:', error);
      showToast('加载作品失败', 'error');
    } finally {
      setLoading(false);
    }
  }, [filter, page, showToast]);

  useEffect(() => {
    if (activeTab === 'showcases') {
      loadShowcases();
    }
  }, [activeTab, loadShowcases]);

  // 点赞处理
  const handleLike = async (showcase: Showcase) => {
    setLikingId(showcase.id);
    try {
      const result = await likeShowcase(showcase.id);
      // 更新本地状态
      setShowcases(prev =>
        prev.map(s =>
          s.id === showcase.id
            ? { ...s, hasLiked: result.liked, likeCount: result.likeCount }
            : s
        )
      );
    } catch (error: unknown) {
      console.error('点赞失败:', error);
      showToast(error instanceof Error ? error.message : '点赞失败', 'error');
    } finally {
      setLikingId(null);
    }
  };

  // 跳转创作者主页
  const handleCreatorClick = (userId: number, e: React.MouseEvent) => {
    e.stopPropagation();
    navigate(`/community/creator/${userId}`);
  };

  // 筛选标签名称
  const getFilterLabel = (f: FilterKey) => {
    return t.community.filter[f] || f;
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

  return (
    <div className="h-full bg-[var(--bg-app)] overflow-auto p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* 头部标题区 */}
        <div className="flex items-center gap-3">
          <div className="relative">
            <div className="absolute inset-0 bg-gradient-to-br from-pink-500/30 to-purple-500/30 rounded-xl blur-lg opacity-60" />
            <div className="relative p-2.5 bg-gradient-to-br from-pink-500/20 to-purple-500/30 rounded-xl border border-pink-500/30">
              <Users className="w-6 h-6 text-pink-400" />
            </div>
          </div>
          <div>
            <h1 className="text-2xl font-bold text-[var(--text-primary)]">{t.community.title}</h1>
            <p className="text-sm text-[var(--text-muted)]">{t.community.subtitle}</p>
          </div>
        </div>

        {/* 子导航标签 */}
        <Tabs
          selectedKey={activeTab}
          onSelectionChange={(key) => setActiveTab(key as 'showcases' | 'leaderboard')}
          classNames={{
            tabList: "bg-[var(--bg-card)] border border-[var(--border-color)] shadow-sm rounded-xl p-1",
            tab: "text-[var(--text-muted)] data-[selected=true]:text-[var(--accent)] font-medium px-6",
            cursor: "bg-[var(--accent)]/15 rounded-lg",
          }}
        >
          <Tab
            key="showcases"
            title={
              <div className="flex items-center gap-2">
                <Star className="w-4 h-4" />
                <span>{t.community.showcases}</span>
              </div>
            }
          />
          <Tab
            key="leaderboard"
            title={
              <div className="flex items-center gap-2">
                <TrendingUp className="w-4 h-4" />
                <span>{t.community.leaderboard}</span>
              </div>
            }
          />
        </Tabs>

        {/* 内容区域 */}
        {activeTab === 'showcases' ? (
          <>
            {/* 筛选栏 */}
            <div className="flex items-center gap-2">
              {FILTER_OPTIONS.map((f) => (
                <button
                  key={f}
                  onClick={() => {
                    setFilter(f);
                    setPage(1);
                  }}
                  className={`flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-medium transition-all ${
                    filter === f
                      ? 'bg-[var(--accent)]/20 text-[var(--accent)] border border-[var(--accent)]/40 shadow-sm'
                      : 'bg-[var(--bg-card)] text-[var(--text-muted)] border border-[var(--border-color)] hover:bg-[var(--bg-input)] hover:text-[var(--text-secondary)]'
                  }`}
                >
                  {f === 'hot' && <TrendingUp className="w-3.5 h-3.5" />}
                  {f === 'newest' && <Clock className="w-3.5 h-3.5" />}
                  {f === 'featured' && <Sparkles className="w-3.5 h-3.5" />}
                  {getFilterLabel(f)}
                </button>
              ))}
            </div>

            {/* 作品卡片网格 */}
            {loading ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {Array.from({ length: 6 }).map((_, i) => (
                  <div key={i} className="bg-[var(--bg-card)] rounded-2xl border border-[var(--border-color)] overflow-hidden">
                    <Skeleton className="aspect-video" />
                    <div className="p-4 space-y-3">
                      <Skeleton className="h-5 w-3/4" />
                      <div className="flex items-center gap-3">
                        <Skeleton className="w-8 h-8 rounded-full" />
                        <Skeleton className="h-4 w-24" />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : showcases.length === 0 ? (
              /* 空状态 */
              <div className="text-center py-16">
                <div className="w-20 h-20 mx-auto bg-[var(--bg-card)] rounded-full flex items-center justify-center mb-4 border border-[var(--border-color)]">
                  <Star className="w-10 h-10 text-[var(--text-muted)]" />
                </div>
                <p className="text-[var(--text-secondary)] font-medium">{t.community.showcase.empty}</p>
                <p className="text-[var(--text-muted)] text-sm mt-1">快来发布第一个作品吧</p>
              </div>
            ) : (
              <AnimatePresence mode="wait">
                <motion.div
                  key={`${filter}-${page}`}
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

                        {/* 统计数据 */}
                        <div className="absolute bottom-3 right-3 flex items-center gap-2">
                          <div className="flex items-center gap-1 px-2 py-1 rounded-full bg-black/50 backdrop-blur-sm text-white/90 text-xs">
                            <Eye className="w-3 h-3" />
                            {showcase.viewCount}
                          </div>
                          <div className="flex items-center gap-1 px-2 py-1 rounded-full bg-black/50 backdrop-blur-sm text-white/90 text-xs">
                            <Heart className={`w-3 h-3 ${showcase.hasLiked ? 'fill-pink-500 text-pink-500' : ''}`} />
                            {showcase.likeCount}
                          </div>
                        </div>
                      </div>

                      {/* 信息区域 */}
                      <div className="p-4 space-y-3">
                        <h3 className="text-base font-semibold text-[var(--text-primary)] line-clamp-1 group-hover:text-[var(--accent)] transition-colors">
                          {showcase.title}
                        </h3>

                        {/* 创作者信息 + 点赞按钮 */}
                        <div className="flex items-center justify-between">
                          <button
                            onClick={(e) => handleCreatorClick(showcase.userId, e)}
                            className="flex items-center gap-2 hover:opacity-80 transition-opacity"
                          >
                            {/* 头像 */}
                            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-[var(--accent)]/30 to-purple-500/30 flex items-center justify-center text-sm font-medium text-[var(--accent)] border border-[var(--accent)]/20">
                              {showcase.creatorAvatar ? (
                                <img
                                  src={showcase.creatorAvatar}
                                  alt=""
                                  className="w-full h-full rounded-full object-cover"
                                />
                              ) : (
                                showcase.creatorName?.[0]?.toUpperCase() || 'U'
                              )}
                            </div>
                            <span className="text-sm text-[var(--text-secondary)]">
                              {showcase.creatorName || '匿名用户'}
                            </span>
                          </button>

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
                  isDisabled={page === 1 || loading}
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
                  isDisabled={page === totalPages || loading}
                  onPress={() => setPage(p => p + 1)}
                  className="bg-[var(--bg-card)] text-[var(--text-secondary)] border border-[var(--border-color)]"
                >
                  下一页
                </Button>
              </div>
            )}
          </>
        ) : (
          /* 排行榜 Tab */
          <Leaderboard />
        )}
      </div>
    </div>
  );
};

export default Community;
