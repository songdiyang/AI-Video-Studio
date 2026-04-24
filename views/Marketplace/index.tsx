import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button, Input, Chip } from '@heroui/react';
import { Search, TrendingUp, Clock, Gift, ShoppingBag, Heart, Eye, Sparkles, Plus, Store } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useLanguage } from '../../contexts/LanguageContext';
import { useToast } from '../../contexts/ToastContext';
import {
  MarketplaceTemplate,
  RecipeType,
  fetchMarketplaceTemplates,
  toggleTemplateLike,
} from '../../services/marketplace';
import Skeleton from '../../components/Skeleton';

// 排序选项
type SortKey = 'hot' | 'newest' | 'free' | 'paid';
const SORT_OPTIONS: { key: SortKey; icon: React.ReactNode }[] = [
  { key: 'hot', icon: <TrendingUp className="w-3.5 h-3.5" /> },
  { key: 'newest', icon: <Clock className="w-3.5 h-3.5" /> },
  { key: 'free', icon: <Gift className="w-3.5 h-3.5" /> },
  { key: 'paid', icon: <ShoppingBag className="w-3.5 h-3.5" /> },
];

// 配方类型
const RECIPE_TYPES: { key: RecipeType | 'all'; label: string }[] = [
  { key: 'all', label: '全部' },
  { key: 'character', label: '角色' },
  { key: 'scene', label: '场景' },
  { key: 'script', label: '剧本' },
];

const PAGE_SIZE = 20;

// 卡片动画
const cardVariants = {
  hidden: { opacity: 0, y: 20, scale: 0.97 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    scale: 1,
    transition: { delay: i * 0.04, duration: 0.3, ease: 'easeOut' as const },
  }),
};

const Marketplace: React.FC = () => {
  const navigate = useNavigate();
  const { t } = useLanguage();
  const { showToast } = useToast();

  const [templates, setTemplates] = useState<MarketplaceTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [sort, setSort] = useState<SortKey>('hot');
  const [recipeType, setRecipeType] = useState<RecipeType | 'all'>('all');
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [likingId, setLikingId] = useState<number | null>(null);

  const loadTemplates = useCallback(async () => {
    setLoading(true);
    try {
      const result = await fetchMarketplaceTemplates({
        recipeType: recipeType === 'all' ? undefined : recipeType,
        search: search || undefined,
        sort,
        page,
        limit: PAGE_SIZE,
      });
      setTemplates(result.templates);
      setTotal(result.pagination.total);
    } catch (error) {
      console.error('加载市场列表失败:', error);
      showToast('加载市场列表失败', 'error');
    } finally {
      setLoading(false);
    }
  }, [recipeType, search, sort, page, showToast]);

  useEffect(() => {
    loadTemplates();
  }, [loadTemplates]);

  // 点赞处理
  const handleLike = async (template: MarketplaceTemplate, e: React.MouseEvent) => {
    e.stopPropagation();
    setLikingId(template.id);
    try {
      const result = await toggleTemplateLike(template.id);
      setTemplates(prev =>
        prev.map(t =>
          t.id === template.id
            ? { ...t, likeCount: result.likeCount }
            : t
        )
      );
    } catch (error: unknown) {
      showToast(error instanceof Error ? error.message : '点赞失败', 'error');
    } finally {
      setLikingId(null);
    }
  };

  // 搜索
  const handleSearch = () => {
    setSearch(searchInput);
    setPage(1);
  };

  const totalPages = Math.ceil(total / PAGE_SIZE);

  // 获取排序标签
  const getSortLabel = (s: SortKey) => {
    const mp: Record<SortKey, string> = {
      hot: t.marketplace?.sortHot || '热度',
      newest: t.marketplace?.sortNewest || '最新',
      free: t.marketplace?.sortFree || '免费',
      paid: t.marketplace?.sortPaid || '付费',
    };
    return mp[s];
  };

  // 获取配方类型标签
  const getRecipeTypeLabel = (rt: RecipeType) => {
    const mp: Record<RecipeType, string> = {
      character: t.marketplace?.recipeTypeCharacter || '角色',
      scene: t.marketplace?.recipeTypeScene || '场景',
      script: t.marketplace?.recipeTypeScript || '剧本',
    };
    return mp[rt];
  };

  return (
    <div className="h-full bg-[var(--bg-app)] overflow-auto">
      <div className="max-w-7xl mx-auto p-6 space-y-5">
        {/* 头部 */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="relative">
              <div className="absolute inset-0 bg-gradient-to-br from-violet-500/30 to-fuchsia-500/30 rounded-xl blur-lg opacity-60" />
              <div className="relative p-2.5 bg-gradient-to-br from-violet-500/20 to-fuchsia-500/30 rounded-xl border border-violet-500/30">
                <ShoppingBag className="w-6 h-6 text-violet-400" />
              </div>
            </div>
            <div>
              <h1 className="text-2xl font-bold text-[var(--text-primary)]">
                {t.marketplace?.title || '模板市场'}
              </h1>
              <p className="text-sm text-[var(--text-muted)]">
                {t.marketplace?.subtitle || '发现优质提示词配方，解锁创作灵感'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="flat"
              startContent={<Store className="w-4 h-4" />}
              onPress={() => navigate('/marketplace/seller')}
              className="bg-violet-500/10 text-violet-400 border border-violet-500/30 hover:bg-violet-500/20"
            >
              {t.marketplace?.myShop || '我的店铺'}
            </Button>
            <Button
              color="primary"
              startContent={<Plus className="w-4 h-4" />}
              onPress={() => navigate('/marketplace/create')}
              className="bg-gradient-to-r from-violet-500 to-fuchsia-500 text-white shadow-lg shadow-violet-500/25"
            >
              {t.marketplace?.createRecipe || '发布配方'}
            </Button>
          </div>
        </div>

        {/* 搜索栏 */}
        <div className="flex items-center gap-3">
          <div className="flex-1 relative">
            <Input
              placeholder={t.marketplace?.searchPlaceholder || '搜索提示词配方...'}
              value={searchInput}
              onValueChange={setSearchInput}
              onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
              startContent={<Search className="w-4 h-4 text-[var(--text-muted)]" />}
              classNames={{
                inputWrapper: "bg-[var(--bg-card)] border border-[var(--border-color)] hover:border-violet-500/40 group-data-[focus=true]:border-violet-500/60",
              }}
            />
          </div>
          <Button
            color="primary"
            variant="flat"
            onPress={handleSearch}
            className="bg-violet-500/10 text-violet-400 border border-violet-500/30"
          >
            搜索
          </Button>
        </div>

        {/* 配方类型筛选 */}
        <div className="flex items-center gap-2">
          {RECIPE_TYPES.map((rt) => (
            <Chip
              key={rt.key}
              variant={recipeType === rt.key ? 'solid' : 'bordered'}
              color={recipeType === rt.key ? 'secondary' : 'default'}
              onClick={() => { setRecipeType(rt.key); setPage(1); }}
              className="cursor-pointer"
              classNames={{
                base: recipeType === rt.key
                  ? 'bg-violet-500/20 text-violet-300 border-violet-500/40'
                  : 'bg-transparent text-[var(--text-muted)] border-[var(--border-color)] hover:border-violet-500/30',
              }}
            >
              {rt.label}
            </Chip>
          ))}
        </div>

        {/* 排序选项 */}
        <div className="flex items-center gap-2">
          {SORT_OPTIONS.map(({ key, icon }) => (
            <button
              key={key}
              onClick={() => { setSort(key); setPage(1); }}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-medium transition-all ${
                sort === key
                  ? 'bg-violet-500/20 text-violet-300 border border-violet-500/40 shadow-sm'
                  : 'bg-[var(--bg-card)] text-[var(--text-muted)] border border-[var(--border-color)] hover:bg-[var(--bg-input)] hover:text-[var(--text-secondary)]'
              }`}
            >
              {icon}
              {getSortLabel(key)}
            </button>
          ))}
        </div>

        {/* 卡片网格 - pixiv 风格 */}
        {loading ? (
          <div className="columns-2 md:columns-3 lg:columns-4 xl:columns-5 gap-4 space-y-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="break-inside-avoid bg-[var(--bg-card)] rounded-2xl border border-[var(--border-color)] overflow-hidden">
                <Skeleton className="aspect-[3/4]" />
                <div className="p-3 space-y-2">
                  <Skeleton className="h-4 w-3/4" />
                  <Skeleton className="h-3 w-1/2" />
                </div>
              </div>
            ))}
          </div>
        ) : templates.length === 0 ? (
          <div className="text-center py-20">
            <div className="w-20 h-20 mx-auto bg-[var(--bg-card)] rounded-full flex items-center justify-center mb-4 border border-[var(--border-color)]">
              <ShoppingBag className="w-10 h-10 text-[var(--text-muted)]" />
            </div>
            <p className="text-[var(--text-secondary)] font-medium">
              {t.marketplace?.empty || '现在还没有模板呢'}
            </p>
            <p className="text-[var(--text-muted)] text-sm mt-1">
              {t.marketplace?.emptyHint || '快来上传试试看吧'}
            </p>
          </div>
        ) : (
          <AnimatePresence mode="wait">
            <motion.div
              key={`${sort}-${page}-${recipeType}`}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="columns-2 md:columns-3 lg:columns-4 xl:columns-5 gap-4 space-y-4"
            >
              {templates.map((template, index) => (
                <motion.div
                  key={template.id}
                  custom={index}
                  variants={cardVariants}
                  initial="hidden"
                  animate="visible"
                  onClick={() => navigate(`/marketplace/template/${template.id}`)}
                  className="break-inside-avoid group bg-[var(--bg-card)] rounded-2xl border border-[var(--border-color)] overflow-hidden hover:border-violet-500/30 hover:shadow-lg hover:shadow-violet-500/5 transition-all duration-300 cursor-pointer"
                >
                  {/* 封面图 */}
                  <div className="relative bg-gradient-to-br from-violet-500/5 to-fuchsia-500/5 overflow-hidden">
                    {template.thumbnailUrl ? (
                      <img
                        src={template.thumbnailUrl}
                        alt={template.name}
                        className="w-full object-cover transition-transform duration-300 group-hover:scale-105"
                        loading="lazy"
                      />
                    ) : template.previewUrls && template.previewUrls.length > 0 ? (
                      <img
                        src={template.previewUrls[0]}
                        alt={template.name}
                        className="w-full object-cover transition-transform duration-300 group-hover:scale-105"
                        loading="lazy"
                      />
                    ) : (
                      <div className="w-full aspect-square flex items-center justify-center bg-gradient-to-br from-[var(--bg-input)] to-[var(--bg-card)]">
                        <Sparkles className="w-10 h-10 text-[var(--text-muted)]/30" />
                      </div>
                    )}

                    {/* 免费标签 */}
                    {template.isFree && (
                      <div className="absolute top-2 left-2">
                        <div className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-500/90 text-white text-xs font-bold shadow-lg">
                          <Gift className="w-3 h-3" />
                          {t.marketplace?.freeTag || '免费'}
                        </div>
                      </div>
                    )}

                    {/* 价格标签 */}
                    {!template.isFree && template.price > 0 && (
                      <div className="absolute top-2 right-2">
                        <div className="flex items-center px-2 py-0.5 rounded-full bg-amber-500/90 text-white text-xs font-bold shadow-lg">
                          {template.price} 积分
                        </div>
                      </div>
                    )}

                    {/* 底部统计 */}
                    <div className="absolute bottom-2 right-2 flex items-center gap-1.5">
                      <div className="flex items-center gap-0.5 px-1.5 py-0.5 rounded-full bg-black/50 backdrop-blur-sm text-white/90 text-xs">
                        <Heart className="w-3 h-3" />
                        {template.likeCount}
                      </div>
                      <div className="flex items-center gap-0.5 px-1.5 py-0.5 rounded-full bg-black/50 backdrop-blur-sm text-white/90 text-xs">
                        <Eye className="w-3 h-3" />
                        {template.purchaseCount}
                      </div>
                    </div>
                  </div>

                  {/* 信息区域 */}
                  <div className="p-3 space-y-2">
                    <h3 className="text-sm font-semibold text-[var(--text-primary)] line-clamp-2 group-hover:text-violet-400 transition-colors leading-tight">
                      {template.name}
                    </h3>

                    {/* 卖家信息 */}
                    <div
                      className="flex items-center gap-2"
                      onClick={(e) => {
                        e.stopPropagation();
                        navigate(`/marketplace/shop/${template.sellerId}`);
                      }}
                    >
                      <div className="w-6 h-6 rounded-full bg-gradient-to-br from-violet-500/30 to-fuchsia-500/30 flex items-center justify-center text-xs font-medium text-violet-400 border border-violet-500/20 overflow-hidden">
                        {template.sellerAvatar ? (
                          <img src={template.sellerAvatar} alt="" className="w-full h-full rounded-full object-cover" />
                        ) : (
                          template.sellerName?.[0]?.toUpperCase() || 'U'
                        )}
                      </div>
                      <span className="text-xs text-[var(--text-muted)] truncate">
                        {template.sellerName || '匿名卖家'}
                      </span>
                    </div>

                    {/* 配方类型标签 */}
                    <div className="flex items-center gap-1">
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-violet-500/10 text-violet-400 border border-violet-500/20">
                        {getRecipeTypeLabel(template.recipeType)}
                      </span>
                    </div>
                  </div>
                </motion.div>
              ))}
            </motion.div>
          </AnimatePresence>
        )}

        {/* 分页 */}
        {totalPages > 1 && (
          <div className="flex items-center justify-center gap-2 pt-4 pb-6">
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
      </div>
    </div>
  );
};

export default Marketplace;
