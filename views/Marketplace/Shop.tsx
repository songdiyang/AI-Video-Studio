import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Button, Tabs, Tab } from '@heroui/react';
import {
  ArrowLeft, Heart, Eye, ShoppingBag, Gift, UserPlus, UserCheck,
  Sparkles, Globe, ExternalLink, Package
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useLanguage } from '../../contexts/LanguageContext';
import { useToast } from '../../contexts/ToastContext';
import {
  MarketplaceTemplate,
  CreatorShopInfo,
  fetchShop,
  toggleFollow,
} from '../../services/marketplace';
import Skeleton from '../../components/Skeleton';

// 徽章颜色
const BADGE_STYLES: Record<string, { bg: string; text: string; border: string; gradient: string }> = {
  newcomer: { bg: 'bg-slate-500/15', text: 'text-slate-400', border: 'border-slate-500/30', gradient: 'from-slate-500 to-slate-600' },
  creator: { bg: 'bg-blue-500/15', text: 'text-blue-400', border: 'border-blue-500/30', gradient: 'from-blue-500 to-blue-600' },
  pro: { bg: 'bg-purple-500/15', text: 'text-purple-400', border: 'border-purple-500/30', gradient: 'from-purple-500 to-purple-600' },
  master: { bg: 'bg-amber-500/15', text: 'text-amber-400', border: 'border-amber-500/30', gradient: 'from-amber-500 to-amber-600' },
};

const PAGE_SIZE = 12;

const Shop: React.FC = () => {
  const { userId: userIdParam } = useParams<{ userId: string }>();
  const navigate = useNavigate();
  const { t } = useLanguage();
  const { showToast } = useToast();

  const userId = userIdParam ? parseInt(userIdParam, 10) : null;
  const [creator, setCreator] = useState<CreatorShopInfo | null>(null);
  const [templates, setTemplates] = useState<MarketplaceTemplate[]>([]);
  const [isFollowing, setIsFollowing] = useState(false);
  const [followLoading, setFollowLoading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);

  const loadShop = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    try {
      const data = await fetchShop(userId, { page, limit: PAGE_SIZE });
      setCreator(data.creator);
      setTemplates(data.templates);
      setIsFollowing(data.isFollowing);
      setTotal(data.pagination.total);
    } catch (error) {
      console.error('加载小店失败:', error);
      showToast('加载小店失败', 'error');
    } finally {
      setLoading(false);
    }
  }, [userId, page, showToast]);

  useEffect(() => {
    loadShop();
  }, [loadShop]);

  const handleFollow = async () => {
    if (!userId) return;
    setFollowLoading(true);
    try {
      const result = await toggleFollow(userId);
      setIsFollowing(result.following);
      if (creator) {
        setCreator({
          ...creator,
          followerCount: creator.followerCount + (result.following ? 1 : -1),
        });
      }
      showToast(result.following ? '关注成功' : '已取消关注', 'success');
    } catch (error: unknown) {
      showToast(error instanceof Error ? error.message : '操作失败', 'error');
    } finally {
      setFollowLoading(false);
    }
  };

  const getBadgeLabel = (badge: string) => {
    const mp: Record<string, string> = { newcomer: '新人', creator: '创作者', pro: '专业', master: '大师' };
    return mp[badge] || badge;
  };

  const totalPages = Math.ceil(total / PAGE_SIZE);
  const badgeStyle = creator ? (BADGE_STYLES[creator.badge] || BADGE_STYLES.newcomer) : BADGE_STYLES.newcomer;

  if (loading && !creator) {
    return (
      <div className="h-full bg-[var(--bg-app)] overflow-auto p-6">
        <div className="max-w-4xl mx-auto space-y-6">
          <Skeleton className="h-8 w-24" />
          <Skeleton className="h-40 w-full rounded-2xl" />
        </div>
      </div>
    );
  }

  if (!creator) {
    return (
      <div className="h-full bg-[var(--bg-app)] overflow-auto p-6">
        <div className="max-w-4xl mx-auto text-center py-20">
          <Package className="w-16 h-16 text-[var(--text-muted)] mx-auto mb-4" />
          <p className="text-[var(--text-secondary)]">用户不存在</p>
          <Button className="mt-4" onPress={() => navigate('/marketplace')}>返回市场</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full bg-[var(--bg-app)] overflow-auto">
      <div className="max-w-4xl mx-auto p-6 space-y-6">
        <Button
          variant="light"
          startContent={<ArrowLeft className="w-4 h-4" />}
          onPress={() => navigate(-1)}
          className="text-[var(--text-secondary)]"
        >
          返回
        </Button>

        {/* 创作者信息卡 */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-[var(--bg-card)] rounded-2xl border border-[var(--border-color)] overflow-hidden"
        >
          <div className={`h-20 bg-gradient-to-r ${badgeStyle.gradient} opacity-20`} />
          <div className="px-6 pb-6 -mt-10">
            <div className="flex flex-col md:flex-row items-center md:items-end gap-4">
              <div className="w-20 h-20 rounded-full bg-gradient-to-br from-violet-500/30 to-fuchsia-500/30 flex items-center justify-center text-2xl font-bold text-violet-400 border-4 border-[var(--bg-card)] shadow-lg overflow-hidden">
                {creator.avatarUrl ? (
                  <img src={creator.avatarUrl} alt="" className="w-full h-full rounded-full object-cover" />
                ) : (
                  creator.displayName?.[0]?.toUpperCase() || 'U'
                )}
              </div>
              <div className="flex-1 text-center md:text-left">
                <div className="flex flex-col md:flex-row items-center gap-2">
                  <h1 className="text-xl font-bold text-[var(--text-primary)]">
                    {creator.displayName || '匿名卖家'}
                  </h1>
                  <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium ${badgeStyle.bg} ${badgeStyle.text} border ${badgeStyle.border}`}>
                    <Sparkles className="w-3 h-3" />
                    {getBadgeLabel(creator.badge)}
                  </span>
                </div>
                {creator.shopDescription && (
                  <p className="text-[var(--text-muted)] text-sm mt-1 max-w-lg">{creator.shopDescription}</p>
                )}
                {creator.bio && !creator.shopDescription && (
                  <p className="text-[var(--text-muted)] text-sm mt-1 max-w-lg">{creator.bio}</p>
                )}
              </div>
              <Button
                variant={isFollowing ? 'flat' : 'solid'}
                color={isFollowing ? 'default' : 'secondary'}
                startContent={isFollowing ? <UserCheck className="w-4 h-4" /> : <UserPlus className="w-4 h-4" />}
                isLoading={followLoading}
                onPress={handleFollow}
                className={isFollowing ? '' : 'bg-violet-500 text-white'}
              >
                {isFollowing ? '已关注' : '关注'}
              </Button>
            </div>

            {/* 统计 */}
            <div className="flex items-center justify-center md:justify-start gap-8 mt-5 pt-5 border-t border-[var(--border-color)]">
              <div className="text-center">
                <div className="text-xl font-bold text-[var(--text-primary)]">{creator.followerCount}</div>
                <div className="text-xs text-[var(--text-muted)]">粉丝</div>
              </div>
              <div className="text-center">
                <div className="text-xl font-bold text-[var(--text-primary)]">{creator.totalSales}</div>
                <div className="text-xs text-[var(--text-muted)]">销量</div>
              </div>
              <div className="text-center">
                <div className="text-xl font-bold text-[var(--text-primary)]">{total}</div>
                <div className="text-xs text-[var(--text-muted)]">在售配方</div>
              </div>
            </div>
          </div>
        </motion.div>

        {/* 配方列表 */}
        <h2 className="text-lg font-semibold text-[var(--text-primary)] flex items-center gap-2">
          <Package className="w-5 h-5 text-violet-400" />
          在售配方 ({total})
        </h2>

        {templates.length === 0 ? (
          <div className="text-center py-12">
            <ShoppingBag className="w-12 h-12 text-[var(--text-muted)] mx-auto mb-3" />
            <p className="text-[var(--text-muted)]">暂无在售配方</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <AnimatePresence mode="wait">
              {templates.map((template, index) => (
                <motion.div
                  key={template.id}
                  initial={{ opacity: 0, y: 15 }}
                  animate={{ opacity: 1, y: 0, transition: { delay: index * 0.05 } }}
                  onClick={() => navigate(`/marketplace/template/${template.id}`)}
                  className="group bg-[var(--bg-card)] rounded-2xl border border-[var(--border-color)] overflow-hidden hover:border-violet-500/30 hover:shadow-lg hover:shadow-violet-500/5 transition-all duration-300 cursor-pointer"
                >
                  <div className="relative aspect-square bg-gradient-to-br from-violet-500/5 to-fuchsia-500/5 overflow-hidden">
                    {template.thumbnailUrl ? (
                      <img src={template.thumbnailUrl} alt={template.name} className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105" loading="lazy" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <Sparkles className="w-10 h-10 text-[var(--text-muted)]/30" />
                      </div>
                    )}
                    {template.isFree && (
                      <div className="absolute top-2 left-2 flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-500/90 text-white text-xs font-bold">
                        <Gift className="w-3 h-3" /> 免费
                      </div>
                    )}
                    {!template.isFree && template.price > 0 && (
                      <div className="absolute top-2 right-2 px-2 py-0.5 rounded-full bg-amber-500/90 text-white text-xs font-bold">
                        {template.price} 积分
                      </div>
                    )}
                    <div className="absolute bottom-2 right-2 flex items-center gap-1.5">
                      <div className="flex items-center gap-0.5 px-1.5 py-0.5 rounded-full bg-black/50 backdrop-blur-sm text-white/90 text-xs">
                        <Heart className="w-3 h-3" /> {template.likeCount}
                      </div>
                    </div>
                  </div>
                  <div className="p-3">
                    <h3 className="text-sm font-semibold text-[var(--text-primary)] line-clamp-1 group-hover:text-violet-400 transition-colors">
                      {template.name}
                    </h3>
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        )}

        {/* 分页 */}
        {totalPages > 1 && (
          <div className="flex items-center justify-center gap-2 pt-4">
            <Button size="sm" variant="flat" isDisabled={page === 1} onPress={() => setPage(p => p - 1)}
              className="bg-[var(--bg-card)] text-[var(--text-secondary)] border border-[var(--border-color)]">
              上一页
            </Button>
            <span className="text-sm text-[var(--text-muted)] px-4">{page} / {totalPages}</span>
            <Button size="sm" variant="flat" isDisabled={page === totalPages} onPress={() => setPage(p => p + 1)}
              className="bg-[var(--bg-card)] text-[var(--text-secondary)] border border-[var(--border-color)]">
              下一页
            </Button>
          </div>
        )}
      </div>
    </div>
  );
};

export default Shop;
