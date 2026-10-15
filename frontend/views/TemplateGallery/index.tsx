import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button, Input, Chip, Spinner } from '@heroui/react';
import { Search, LayoutGrid, Sparkles, Users, Clock, TrendingUp } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useLanguage } from '../../contexts/LanguageContext';
import { useToast } from '../../contexts/ToastContext';
import { Template, fetchTemplates, useTemplate } from '../../services/templates';
import Skeleton from '../../components/Skeleton';

// 分类配置
type CategoryKey = 'all' | 'script' | 'storyboard' | 'character' | 'workflow';

const CATEGORIES: CategoryKey[] = ['all', 'script', 'storyboard', 'character', 'workflow'];

// 排序配置
type SortKey = 'popular' | 'newest' | 'mostUsed';

const SORT_OPTIONS: SortKey[] = ['popular', 'newest', 'mostUsed'];

// 前端 SortKey 到后端 sort 参数的映射
const sortMapping: Record<SortKey, string> = {
  popular: 'popular',
  newest: 'newest',
  mostUsed: 'most_used',
};

// 每页数量
const PAGE_SIZE = 12;

// 分类标签名称获取函数
const getCategoryLabel = (cat: CategoryKey, t: any) => {
  return t.templates.categories[cat] || cat;
};

// 排序标签名称获取函数
const getSortLabel = (s: SortKey, t: any) => {
  return t.templates.sortBy[s] || s;
};

const TemplateGallery: React.FC = () => {
  const navigate = useNavigate();
  const { t } = useLanguage();
  const { showToast } = useToast();

  // 状态
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [category, setCategory] = useState<CategoryKey>('all');
  const [sort, setSort] = useState<SortKey>('popular');
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [usingTemplateId, setUsingTemplateId] = useState<number | null>(null);

  // 加载模板
  const loadTemplates = useCallback(async () => {
    setLoading(true);
    try {
      const result = await fetchTemplates({
        category: category === 'all' ? undefined : category,
        search: search || undefined,
        sort: sortMapping[sort] as 'popular' | 'newest' | 'most_used',
        page,
        limit: PAGE_SIZE,
      });
      setTemplates(result.templates);
      setTotal(result.total);
    } catch (error) {
      console.error('加载模板失败:', error);
      showToast('加载模板失败', 'error');
    } finally {
      setLoading(false);
    }
  }, [category, search, sort, page, showToast]);

  useEffect(() => {
    loadTemplates();
  }, [loadTemplates]);

  // 搜索防抖
  useEffect(() => {
    const timer = setTimeout(() => {
      setSearch(searchInput);
      setPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchInput]);

  // 使用模板
  const handleUseTemplate = async (template: Template) => {
    setUsingTemplateId(template.id);
    try {
      const result = await useTemplate(template.id);
      showToast(`已使用模板「${template.name}」创建项目`, 'success');
      navigate('/projects');
    } catch (error: unknown) {
      console.error('使用模板失败:', error);
      showToast(error instanceof Error ? error.message : '使用模板失败', 'error');
    } finally {
      setUsingTemplateId(null);
    }
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
    <div className="h-full bg-(--bg-app) overflow-auto p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* 头部标题区 */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="relative">
              <div className="absolute inset-0 bg-linear-to-br from-(--accent)/30 to-purple-500/30 rounded-xl blur-lg opacity-60" />
              <div className="relative p-2.5 bg-linear-to-br from-(--accent)/20 to-purple-500/30 rounded-xl border border-(--accent)/30">
                <LayoutGrid className="w-6 h-6 text-(--accent)" />
              </div>
            </div>
            <div>
              <h1 className="text-2xl font-bold text-(--text-primary)">{t.templates.title}</h1>
              <p className="text-sm text-(--text-muted)">{t.templates.subtitle}</p>
            </div>
          </div>

          {/* 搜索框 */}
          <div className="w-full md:w-80">
            <Input
              placeholder={t.templates.search}
              value={searchInput}
              onValueChange={setSearchInput}
              startContent={<Search className="w-4 h-4 text-(--text-muted)" />}
              classNames={{
                input: "bg-transparent text-(--text-primary) placeholder:text-(--text-muted)",
                inputWrapper: "bg-(--bg-input) border border-(--border-color) hover:border-(--accent)/30 focus-within:border-(--accent)/50 shadow-sm transition-all"
              }}
            />
          </div>
        </div>

        {/* 分类筛选标签条 */}
        <div className="flex flex-wrap items-center gap-2">
          {CATEGORIES.map((cat) => (
            <button
              key={cat}
              onClick={() => {
                setCategory(cat);
                setPage(1);
              }}
              className={`px-4 py-2 rounded-full text-sm font-medium transition-all ${
                category === cat
                  ? 'bg-(--accent)/20 text-(--accent) border border-(--accent)/40 shadow-sm'
                  : 'bg-(--bg-card) text-(--text-muted) border border-(--border-color) hover:bg-(--bg-input) hover:text-(--text-secondary)'
              }`}
            >
              {getCategoryLabel(cat, t)}
            </button>
          ))}
        </div>

        {/* 排序切换 */}
        <div className="flex items-center gap-2">
          <span className="text-sm text-(--text-muted)">排序：</span>
          {SORT_OPTIONS.map((s) => (
            <button
              key={s}
              onClick={() => {
                setSort(s);
                setPage(1);
              }}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                sort === s
                  ? 'bg-(--accent)/15 text-(--accent)'
                  : 'text-(--text-muted) hover:text-(--text-secondary) hover:bg-white/5'
              }`}
            >
              {s === 'popular' && <TrendingUp className="w-3.5 h-3.5" />}
              {s === 'newest' && <Clock className="w-3.5 h-3.5" />}
              {s === 'mostUsed' && <Users className="w-3.5 h-3.5" />}
              {getSortLabel(s, t)}
            </button>
          ))}
        </div>

        {/* 模板卡片网格 */}
        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="bg-(--bg-card) rounded-2xl border border-(--border-color) overflow-hidden">
                <Skeleton className="h-40" />
                <div className="p-4 space-y-3">
                  <Skeleton className="h-5 w-3/4" />
                  <Skeleton className="h-4 w-full" />
                  <Skeleton className="h-4 w-2/3" />
                </div>
              </div>
            ))}
          </div>
        ) : templates.length === 0 ? (
          /* 空状态 */
          <div className="text-center py-16">
            <div className="w-20 h-20 mx-auto bg-(--bg-card) rounded-full flex items-center justify-center mb-4 border border-(--border-color)">
              <LayoutGrid className="w-10 h-10 text-(--text-muted)" />
            </div>
            <p className="text-(--text-secondary) font-medium">{t.templates.empty}</p>
            <p className="text-(--text-muted) text-sm mt-1">尝试更换筛选条件</p>
          </div>
        ) : (
          <AnimatePresence mode="wait">
            <motion.div
              key={`${category}-${sort}-${page}`}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4"
            >
              {templates.map((template, index) => (
                <motion.div
                  key={template.id}
                  custom={index}
                  variants={cardVariants}
                  initial="hidden"
                  animate="visible"
                  className="group bg-(--bg-card) rounded-2xl border border-(--border-color) overflow-hidden hover:border-(--accent)/30 hover:shadow-lg hover:shadow-(--accent)/5 transition-all duration-300"
                >
                  {/* 缩略图 */}
                  <div className="relative h-40 bg-linear-to-br from-(--bg-input) to-(--bg-card) overflow-hidden">
                    {template.thumbnailUrl ? (
                      <img
                        src={template.thumbnailUrl}
                        alt={template.name}
                        className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <LayoutGrid className="w-12 h-12 text-(--text-muted)/30" />
                      </div>
                    )}
                    
                    {/* 官方标签 */}
                    {template.isOfficial && (
                      <div className="absolute top-3 left-3">
                        <Chip
                          size="sm"
                          className="bg-linear-to-r from-amber-500/90 to-orange-500/90 text-white text-xs font-medium shadow-lg"
                          startContent={<Sparkles className="w-3 h-3" />}
                        >
                          {t.templates.official}
                        </Chip>
                      </div>
                    )}

                    {/* 使用次数 */}
                    <div className="absolute bottom-3 right-3">
                      <Chip
                        size="sm"
                        className="bg-black/50 backdrop-blur-sm text-white/90 text-xs"
                        startContent={<Users className="w-3 h-3" />}
                      >
                        {t.templates.usedCount.replace('{count}', template.useCount.toString())}
                      </Chip>
                    </div>
                  </div>

                  {/* 信息区域 */}
                  <div className="p-4 space-y-3">
                    <div>
                      <h3 className="text-base font-semibold text-(--text-primary) line-clamp-1 group-hover:text-(--accent) transition-colors">
                        {template.name}
                      </h3>
                      <p className="text-sm text-(--text-muted) line-clamp-2 mt-1 min-h-10">
                        {template.description || '暂无描述'}
                      </p>
                    </div>

                    {/* 创建者信息 */}
                    {template.creatorEmail && (
                      <div className="flex items-center gap-2 text-xs text-(--text-muted)">
                        <span>{t.templates.createdBy}:</span>
                        <span className="text-(--text-secondary)">
                          {template.creatorEmail.split('@')[0]}
                        </span>
                      </div>
                    )}

                    {/* 操作按钮 */}
                    <Button
                      size="sm"
                      className="w-full bg-(--accent)/15 text-(--accent) font-medium hover:bg-(--accent)/25 border border-(--accent)/30 transition-all"
                      onPress={() => handleUseTemplate(template)}
                      isLoading={usingTemplateId === template.id}
                      isDisabled={usingTemplateId !== null}
                    >
                      {usingTemplateId === template.id ? '创建中...' : t.templates.useTemplate}
                    </Button>
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
              className="bg-(--bg-card) text-(--text-secondary) border border-(--border-color)"
            >
              上一页
            </Button>
            <span className="text-sm text-(--text-muted) px-4">
              {page} / {totalPages}
            </span>
            <Button
              size="sm"
              variant="flat"
              isDisabled={page === totalPages || loading}
              onPress={() => setPage(p => p + 1)}
              className="bg-(--bg-card) text-(--text-secondary) border border-(--border-color)"
            >
              下一页
            </Button>
          </div>
        )}
      </div>
    </div>
  );
};

export default TemplateGallery;
