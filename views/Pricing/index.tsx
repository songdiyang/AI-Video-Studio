import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Card, CardBody, Button, Chip, Tooltip } from '@heroui/react';
import { Check, Sparkles, Crown, Building2, Rocket, Mail, Zap, Star, Shield, X, HelpCircle, ChevronRight } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useLanguage } from '../../contexts/LanguageContext';
import { useToast } from '../../contexts/ToastContext';
import { fetchPlans, subscribe, type SubscriptionPlan } from '../../services/subscriptions';
import { getAuthToken } from '../../services/auth';

// 默认套餐图标映射
const planIcons: Record<string, React.ReactNode> = {
  basic: <Rocket className="w-5 h-5" />,
  pro: <Sparkles className="w-5 h-5" />,
  premium: <Crown className="w-5 h-5" />,
  enterprise: <Building2 className="w-5 h-5" />,
};

// 套餐颜色配置（渐变、边框、发光）
const planThemes: Record<string, { gradient: string; border: string; glow: string; badge: string }> = {
  basic: {
    gradient: 'from-slate-500/20 to-slate-600/10',
    border: 'border-slate-500/30',
    glow: 'hover:shadow-slate-500/20',
    badge: 'bg-slate-500/20 text-slate-300',
  },
  pro: {
    gradient: 'from-[var(--accent)]/20 to-purple-600/10',
    border: 'border-[var(--accent)]/50',
    glow: 'hover:shadow-[var(--accent)]/30',
    badge: 'bg-[var(--accent)]/20 text-[var(--accent-light)]',
  },
  premium: {
    gradient: 'from-amber-500/20 to-orange-600/10',
    border: 'border-amber-500/40',
    glow: 'hover:shadow-amber-500/25',
    badge: 'bg-amber-500/20 text-amber-300',
  },
  enterprise: {
    gradient: 'from-blue-600/20 to-indigo-700/10',
    border: 'border-blue-500/40',
    glow: 'hover:shadow-blue-500/25',
    badge: 'bg-blue-500/20 text-blue-300',
  },
};

// 免费版图标
const freeIcon = <Zap className="w-5 h-5" />;

// 免费版主题
const freeTheme = {
  gradient: 'from-emerald-500/20 to-teal-600/10',
  border: 'border-emerald-500/30',
  glow: 'hover:shadow-emerald-500/20',
  badge: 'bg-emerald-500/20 text-emerald-300',
};

// 默认套餐数据（当后端没有返回数据时使用，应与数据库保持一致）
const defaultPlans: SubscriptionPlan[] = [
  {
    id: 0,
    name: 'free',
    display_name: '免费版',
    price_monthly: 0,
    price_yearly: 0,
    first_month_price: null,
    first_year_price: null,
    max_projects: 3,
    max_api_calls_monthly: 2000,
    max_team_members: 1,
    features_json: ['基础AI工具', '3个项目', '2,000积分/月', '社区浏览'],
    sort_order: 0,
    is_active: true,
  },
  {
    id: 1,
    name: 'basic',
    display_name: '基础版',
    price_monthly: 99,
    price_yearly: 990,
    first_month_price: 49.9,   // 新用户首月特惠
    first_year_price: null,
    max_projects: 20,
    max_api_calls_monthly: 10000,
    max_team_members: 5,
    features_json: ['完整工作流', '20个项目', '10,000积分/月', '模板库访问', '社区排行榜'],
    sort_order: 1,
    is_active: true,
  },
  {
    id: 2,
    name: 'pro',
    display_name: '专业版',
    price_monthly: 299,
    price_yearly: 2990,
    first_month_price: null,
    first_year_price: null,
    max_projects: -1,
    max_api_calls_monthly: 30000,
    max_team_members: 15,
    features_json: ['无限项目', '30,000积分/月', '团队协作', '高级AI模型', '优先支持'],
    sort_order: 2,
    is_active: true,
  },
  {
    id: 3,
    name: 'premium',
    display_name: '旗舰版',
    price_monthly: 888,
    price_yearly: 8880,
    first_month_price: null,
    first_year_price: null,
    max_projects: -1,
    max_api_calls_monthly: 90000,
    max_team_members: -1,
    features_json: ['无限项目', '90,000积分/月', '无限团队成员', '全部AI模型', 'API访问权限', '专属客服'],
    sort_order: 3,
    is_active: true,
  },
  {
    id: 4,
    name: 'enterprise',
    display_name: '企业版',
    price_monthly: 0,
    price_yearly: 0,
    first_month_price: null,
    first_year_price: null,
    max_projects: -1,
    max_api_calls_monthly: -1,
    max_team_members: -1,
    features_json: ['定制化接入', '私有部署选项', '优先技术支持', '行业数据反馈', '专属客户经理'],
    sort_order: 4,
    is_active: true,
  },
];

const Pricing: React.FC = () => {
  const navigate = useNavigate();
  const { t } = useLanguage();
  const { showToast } = useToast();
  const [isYearly, setIsYearly] = useState(false); // 默认月付，展示首月优惠
  const [plans, setPlans] = useState<SubscriptionPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [subscribing, setSubscribing] = useState<number | null>(null);
  const [hoveredPlan, setHoveredPlan] = useState<number | null>(null);

  // 分离免费版和付费套餐
  const { freePlan, paidPlans } = useMemo(() => {
    const free = plans.find(p => p.name.toLowerCase() === 'free' || (p.price_monthly === 0 && p.name.toLowerCase() !== 'enterprise'));
    const paid = plans.filter(p => p.name.toLowerCase() !== 'free' && (p.price_monthly > 0 || p.name.toLowerCase() === 'enterprise'));
    return { freePlan: free, paidPlans: paid };
  }, [plans]);

  useEffect(() => {
    loadPlans();
  }, []);

  const loadPlans = async () => {
    try {
      const data = await fetchPlans();
      console.log('[Pricing] API 返回的套餐数据:', data);
      if (data && data.length > 0) {
        // 打印优惠价格信息
        data.forEach(plan => {
          console.log(`[Pricing] ${plan.name}: 月价=${plan.price_monthly}, 首月优惠=${plan.first_month_price}, 年价=${plan.price_yearly}, 首年优惠=${plan.first_year_price}`);
        });
        setPlans(data.sort((a, b) => a.sort_order - b.sort_order));
      } else {
        // 使用默认套餐展示
        setPlans(defaultPlans);
      }
    } catch (error) {
      console.error('加载套餐失败:', error);
      // 使用默认套餐展示
      setPlans(defaultPlans);
    } finally {
      setLoading(false);
    }
  };

  // 计算年付节省金额
  const calculateSavings = (monthly: number, yearly: number) => {
    if (monthly === 0) return 0;
    const yearlyFromMonthly = monthly * 12;
    return Math.round(((yearlyFromMonthly - yearly) / yearlyFromMonthly) * 100);
  };

  const handleSubscribe = async (plan: SubscriptionPlan) => {
    if (!getAuthToken()) {
      navigate('/auth', { state: { from: '/pricing' } });
      return;
    }

    if (plan.name === 'enterprise') {
      window.open('mailto:contact@jiaozianime.com?subject=Enterprise Plan Inquiry', '_blank');
      return;
    }

    // 免费计划直接跳转到首页开始使用
    if (plan.price_monthly === 0 && plan.price_yearly === 0) {
      showToast('欢迎使用饺子动画！', 'success');
      navigate('/');
      return;
    }

    setSubscribing(plan.id);
    try {
      await subscribe(plan.id, isYearly ? 'yearly' : 'monthly');
      showToast('订阅成功！', 'success');
      navigate('/user-center');
    } catch (error) {
      showToast(error instanceof Error ? error.message : '订阅失败，请稍后重试', 'error');
    } finally {
      setSubscribing(null);
    }
  };

  const getPlanIcon = (name: string) => {
    const lowName = name.toLowerCase();
    if (lowName === 'free') return freeIcon;
    return planIcons[lowName] || <Sparkles className="w-5 h-5" />;
  };
  const getPlanTheme = (name: string) => {
    const lowName = name.toLowerCase();
    if (lowName === 'free') return freeTheme;
    return planThemes[lowName] || planThemes.basic;
  };

  const getPlanTranslation = (planName: string) => {
    const key = planName.toLowerCase() as keyof typeof t.pricing;
    const planTranslation = t.pricing[key];
    if (typeof planTranslation === 'object' && planTranslation !== null) {
      return planTranslation as { name: string; desc: string; cta: string };
    }
    return { name: planName, desc: '', cta: t.pricing.creator.cta };
  };

  const formatPrice = (price: number) => {
    if (price === 0) return '免费';
    return `¥${price.toLocaleString()}`;
  };

  const isPopular = (name: string) => name.toLowerCase() === 'pro';

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[var(--bg-app)]">
        <div className="flex flex-col items-center gap-4">
          <div className="relative">
            <div className="w-12 h-12 border-2 border-[var(--accent)]/30 rounded-full" />
            <div className="absolute inset-0 w-12 h-12 border-2 border-[var(--accent)] border-t-transparent rounded-full animate-spin" />
          </div>
          <div className="text-[var(--text-muted)] text-sm">{t.common.loading}</div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[var(--bg-app)] relative overflow-hidden">
      {/* 背景装饰 */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-[var(--accent)]/5 rounded-full blur-3xl" />
        <div className="absolute top-1/3 right-1/4 w-80 h-80 bg-purple-500/5 rounded-full blur-3xl" />
        <div className="absolute bottom-1/4 left-1/3 w-72 h-72 bg-amber-500/5 rounded-full blur-3xl" />
      </div>

      <div className="relative z-10 py-12 md:py-20 px-4">
        <div className="max-w-7xl mx-auto">
          {/* 页面标题 */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-center mb-10 md:mb-14"
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ delay: 0.1 }}
              className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-[var(--accent)]/10 border border-[var(--accent)]/20 mb-6"
            >
              <Zap className="w-4 h-4 text-[var(--accent)]" />
              <span className="text-sm font-medium text-[var(--accent)]">
                限时优惠 · 年付立省20%
              </span>
            </motion.div>
            
            <h1 className="text-3xl md:text-5xl lg:text-6xl font-bold text-[var(--text-primary)] mb-4 md:mb-6">
              {t.pricing.title}
            </h1>
            <p className="text-base md:text-lg text-[var(--text-secondary)] max-w-2xl mx-auto leading-relaxed">
              {t.pricing.subtitle}
            </p>
          </motion.div>

          {/* 月付/年付切换 - 现代化设计 */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15 }}
            className="flex items-center justify-center mb-10 md:mb-14"
          >
            <div className="inline-flex items-center p-1 rounded-xl bg-[var(--bg-card)] border border-[var(--border-color)] shadow-lg">
              <button
                onClick={() => setIsYearly(false)}
                className={`
                  relative px-5 md:px-6 py-2.5 rounded-lg text-sm font-semibold transition-all duration-300
                  ${!isYearly 
                    ? 'text-white' 
                    : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)]'
                  }
                `}
              >
                {!isYearly && (
                  <motion.div
                    layoutId="billingToggle"
                    className="absolute inset-0 bg-gradient-to-r from-[var(--accent)] to-[var(--accent-dark)] rounded-lg"
                    transition={{ type: 'spring', bounce: 0.2, duration: 0.5 }}
                  />
                )}
                <span className="relative z-10">{t.pricing.monthly}</span>
              </button>
              
              <button
                onClick={() => setIsYearly(true)}
                className={`
                  relative px-5 md:px-6 py-2.5 rounded-lg text-sm font-semibold transition-all duration-300 flex items-center gap-2
                  ${isYearly 
                    ? 'text-white' 
                    : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)]'
                  }
                `}
              >
                {isYearly && (
                  <motion.div
                    layoutId="billingToggle"
                    className="absolute inset-0 bg-gradient-to-r from-[var(--accent)] to-[var(--accent-dark)] rounded-lg"
                    transition={{ type: 'spring', bounce: 0.2, duration: 0.5 }}
                  />
                )}
                <span className="relative z-10">{t.pricing.yearly}</span>
                <span className={`
                  relative z-10 px-2 py-0.5 rounded-full text-xs font-bold
                  ${isYearly ? 'bg-white/20 text-white' : 'bg-emerald-500/20 text-emerald-400'}
                `}>
                  -20%
                </span>
              </button>
            </div>
          </motion.div>

          {/* 付费套餐卡片 - 4列网格 */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6">
            {paidPlans.map((plan, index) => {
              const planTrans = getPlanTranslation(plan.name);
              const popular = isPopular(plan.name);
              const isEnterprise = plan.name.toLowerCase() === 'enterprise';
              const isFree = plan.name.toLowerCase() === 'free';
              const price = isYearly ? plan.price_yearly : plan.price_monthly;
              const monthlyPrice = plan.price_monthly;
              const theme = getPlanTheme(plan.name);
              const savings = calculateSavings(plan.price_monthly, plan.price_yearly);
              const isHovered = hoveredPlan === plan.id;
              
              // 新用户优惠价格
              const discountPrice = isYearly ? plan.first_year_price : plan.first_month_price;
              const hasDiscount = discountPrice != null && discountPrice > 0 && discountPrice < price;

              return (
                <motion.div
                  key={plan.id}
                  initial={{ opacity: 0, y: 30 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.1 + index * 0.08, duration: 0.4 }}
                  className={`relative ${popular ? 'lg:-mt-6 lg:mb-6' : ''}`}
                  onMouseEnter={() => setHoveredPlan(plan.id)}
                  onMouseLeave={() => setHoveredPlan(null)}
                >
                  {/* 热门标签 */}
                  {popular && (
                    <motion.div
                      initial={{ opacity: 0, y: -10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.3 }}
                      className="absolute -top-3 left-1/2 -translate-x-1/2 z-20"
                    >
                      <div className="flex items-center gap-1.5 px-4 py-1.5 rounded-full bg-gradient-to-r from-[var(--accent)] to-purple-600 text-white text-xs font-bold shadow-lg shadow-[var(--accent)]/30">
                        <Star className="w-3.5 h-3.5 fill-current" />
                        <span>{t.pricing.popular}</span>
                      </div>
                    </motion.div>
                  )}

                  <Card
                    className={`
                      relative h-full overflow-hidden transition-all duration-500
                      ${popular
                        ? `bg-gradient-to-b ${theme.gradient} border-2 ${theme.border} shadow-xl shadow-[var(--accent)]/10`
                        : `bg-[var(--bg-card)]/80 backdrop-blur-sm border border-[var(--border-color)] ${theme.glow}`
                      }
                      ${isHovered ? 'scale-[1.02] shadow-2xl' : ''}
                    `}
                  >
                    {/* 背景装饰 */}
                    {popular && (
                      <div className="absolute inset-0 overflow-hidden pointer-events-none">
                        <div className="absolute -top-24 -right-24 w-48 h-48 bg-[var(--accent)]/10 rounded-full blur-3xl" />
                        <div className="absolute -bottom-12 -left-12 w-32 h-32 bg-purple-500/10 rounded-full blur-2xl" />
                      </div>
                    )}

                    <CardBody className="relative z-10 p-5 md:p-6 flex flex-col h-full">
                      {/* 套餐头部 */}
                      <div className="mb-5">
                        <div className="flex items-center gap-3 mb-3">
                          <div className={`
                            w-10 h-10 rounded-xl flex items-center justify-center
                            ${popular 
                              ? 'bg-gradient-to-br from-[var(--accent)] to-purple-600 text-white shadow-lg shadow-[var(--accent)]/30' 
                              : `${theme.badge}`
                            }
                          `}>
                            {getPlanIcon(plan.name)}
                          </div>
                          <div>
                            <h3 className="text-lg font-bold text-[var(--text-primary)]">
                              {plan.display_name || planTrans.name}
                            </h3>
                            {isYearly && savings > 0 && !isEnterprise && !isFree && (
                              <span className="text-xs font-medium text-emerald-400">
                                立省 {savings}%
                              </span>
                            )}
                          </div>
                        </div>
                        <p className="text-sm text-[var(--text-muted)] leading-relaxed">
                          {planTrans.desc}
                        </p>
                      </div>

                      {/* 价格区域 */}
                      <div className="mb-6">
                        {isEnterprise ? (
                          <div className="py-2">
                            <span className="text-2xl font-bold text-[var(--text-primary)]">
                              定制方案
                            </span>
                            <p className="text-sm text-[var(--text-muted)] mt-1">
                              根据企业需求定制
                            </p>
                          </div>
                        ) : hasDiscount ? (
                          /* 有新用户优惠价格时的显示 - 原价删除线 + 优惠价格 */
                          <div className="py-2">
                            <div className="flex items-center gap-2 mb-1">
                              <span className="text-base text-[var(--text-muted)] line-through decoration-rose-400 decoration-2">
                                ¥{isYearly ? price : price}
                              </span>
                              <span className="text-xs px-2 py-0.5 rounded-full bg-gradient-to-r from-rose-500 to-orange-500 text-white font-bold animate-pulse">
                                首次优惠
                              </span>
                            </div>
                            <div className="flex items-baseline gap-1">
                              <span className="text-lg text-[var(--accent)]">¥</span>
                              <AnimatePresence mode="wait">
                                <motion.span
                                  key={isYearly ? 'yearly-discount' : 'monthly-discount'}
                                  initial={{ opacity: 0, y: -10 }}
                                  animate={{ opacity: 1, y: 0 }}
                                  exit={{ opacity: 0, y: 10 }}
                                  className="text-4xl font-bold text-[var(--accent)]"
                                >
                                  {isYearly ? discountPrice : discountPrice}
                                </motion.span>
                              </AnimatePresence>
                              <span className="text-[var(--text-muted)]">
                                {isYearly ? '/年' : '/月'}
                              </span>
                            </div>
                            {isYearly && (
                              <div className="text-xs text-emerald-400 mt-1 font-medium">
                                首年特惠，立省 ¥{price - discountPrice!}
                              </div>
                            )}
                            {!isYearly && (
                              <div className="text-xs text-emerald-400 mt-1 font-medium">
                                首月特惠，立省 ¥{price - discountPrice!}
                              </div>
                            )}
                          </div>
                        ) : (
                          <div className="py-2">
                            <div className="flex items-baseline gap-1">
                              <span className="text-lg text-[var(--text-muted)]">¥</span>
                              <AnimatePresence mode="wait">
                                <motion.span
                                  key={isYearly ? 'yearly' : 'monthly'}
                                  initial={{ opacity: 0, y: -10 }}
                                  animate={{ opacity: 1, y: 0 }}
                                  exit={{ opacity: 0, y: 10 }}
                                  className="text-4xl font-bold text-[var(--text-primary)]"
                                >
                                  {isYearly ? price : price}
                                </motion.span>
                              </AnimatePresence>
                              <span className="text-[var(--text-muted)]">
                                {isYearly ? '/年' : '/月'}
                              </span>
                            </div>
                            {isYearly && monthlyPrice > 0 && (
                              <div className="flex items-center gap-2 mt-1">
                                <span className="text-sm text-[var(--text-muted)] line-through">
                                  ¥{monthlyPrice * 12}/年
                                </span>
                                <span className="text-xs px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-400 font-medium">
                                  省 ¥{monthlyPrice * 12 - price}
                                </span>
                              </div>
                            )}
                          </div>
                        )}
                      </div>

                      {/* 功能列表 */}
                      <div className="flex-1 space-y-2.5 mb-6">
                        {/* 核心指标 */}
                        <div className="flex items-center gap-2.5 text-sm">
                          <div className="w-5 h-5 rounded-full bg-emerald-500/15 flex items-center justify-center flex-shrink-0">
                            <Check className="w-3 h-3 text-emerald-400" />
                          </div>
                          <span className="text-[var(--text-secondary)]">
                            {plan.max_projects === -1 ? '无限' : plan.max_projects} 个项目
                          </span>
                        </div>
                        <div className="flex items-center gap-2.5 text-sm">
                          <div className="w-5 h-5 rounded-full bg-emerald-500/15 flex items-center justify-center flex-shrink-0">
                            <Check className="w-3 h-3 text-emerald-400" />
                          </div>
                          <span className="text-[var(--text-secondary)]">
                            {plan.max_api_calls_monthly === -1 ? '无限' : plan.max_api_calls_monthly.toLocaleString()} 积分/月
                          </span>
                        </div>
                        <div className="flex items-center gap-2.5 text-sm">
                          <div className="w-5 h-5 rounded-full bg-emerald-500/15 flex items-center justify-center flex-shrink-0">
                            <Check className="w-3 h-3 text-emerald-400" />
                          </div>
                          <span className="text-[var(--text-secondary)]">
                            {plan.max_team_members === -1 ? '无限' : plan.max_team_members} 位团队成员
                          </span>
                        </div>
                        
                        {/* 分割线 */}
                        <div className="my-3 border-t border-[var(--border-color)]/50" />
                        
                        {/* 额外功能 */}
                        {plan.features_json?.slice(0, 4).map((feature, i) => (
                          <div key={i} className="flex items-center gap-2.5 text-sm">
                            <div className="w-5 h-5 rounded-full bg-[var(--accent)]/10 flex items-center justify-center flex-shrink-0">
                              <Check className="w-3 h-3 text-[var(--accent)]" />
                            </div>
                            <span className="text-[var(--text-secondary)]">{feature}</span>
                          </div>
                        ))}
                      </div>

                      {/* CTA 按钮 */}
                      <Button
                        className={`
                          w-full font-semibold h-11 text-sm transition-all duration-300
                          ${popular
                            ? 'bg-gradient-to-r from-[var(--accent)] to-purple-600 text-white shadow-lg shadow-[var(--accent)]/25 hover:shadow-xl hover:shadow-[var(--accent)]/30 hover:brightness-110'
                            : isEnterprise
                              ? 'bg-transparent text-[var(--text-primary)] border-2 border-[var(--border-color)] hover:border-[var(--accent)]/50 hover:bg-[var(--accent)]/5'
                              : 'bg-[var(--accent)]/10 text-[var(--accent)] hover:bg-[var(--accent)]/20 border border-[var(--accent)]/30'
                          }
                        `}
                        isLoading={subscribing === plan.id}
                        onPress={() => handleSubscribe(plan)}
                        endContent={!isEnterprise && !subscribing ? <ChevronRight className="w-4 h-4" /> : undefined}
                        startContent={isEnterprise ? <Mail className="w-4 h-4" /> : undefined}
                      >
                        {planTrans.cta}
                      </Button>
                    </CardBody>
                  </Card>
                </motion.div>
              );
            })}
          </div>

          {/* 免费版横幅 - 显示在付费套餐下方 */}
          {freePlan && (
            <motion.div
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.4, duration: 0.4 }}
              className="mt-8"
            >
              <Card className="bg-gradient-to-r from-emerald-500/10 via-teal-500/10 to-cyan-500/10 border border-emerald-500/20 overflow-hidden">
                <CardBody className="p-6 md:p-8">
                  <div className="flex flex-col md:flex-row items-center justify-between gap-6">
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 rounded-xl bg-emerald-500/20 flex items-center justify-center">
                        {freeIcon}
                      </div>
                      <div>
                        <h3 className="text-xl font-bold text-[var(--text-primary)] flex items-center gap-2">
                          {freePlan.display_name || '免费版'}
                          <Chip size="sm" className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30">
                            永久免费
                          </Chip>
                        </h3>
                        <p className="text-sm text-[var(--text-muted)] mt-1">
                          {freePlan.max_projects} 个项目 · {freePlan.max_api_calls_monthly} 积分/月 · {freePlan.features_json?.slice(0, 2).join(' · ')}
                        </p>
                      </div>
                    </div>
                    <Button
                      className="bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 hover:bg-emerald-500/30 font-semibold px-6"
                      onPress={() => handleSubscribe(freePlan)}
                      endContent={<ChevronRight className="w-4 h-4" />}
                    >
                      {getPlanTranslation(freePlan.name).cta}
                    </Button>
                  </div>
                </CardBody>
              </Card>
            </motion.div>
          )}

          {/* 功能对比表格 */}
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.5 }}
            className="mt-16 md:mt-20"
          >
            <div className="text-center mb-8">
              <h2 className="text-2xl md:text-3xl font-bold text-[var(--text-primary)] mb-3">
                {t.pricing.compareFeatures}
              </h2>
              <p className="text-[var(--text-muted)]">
                详细了解各套餐的功能差异
              </p>
            </div>
            
            <Card className="bg-[var(--bg-card)]/80 backdrop-blur-sm border border-[var(--border-color)] overflow-hidden shadow-xl">
              <CardBody className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[640px]">
                    <thead>
                      <tr className="border-b-2 border-[var(--border-color)]">
                        <th className="text-left p-4 md:p-5 text-[var(--text-secondary)] font-semibold bg-[var(--bg-elevated)]/50">
                          功能特性
                        </th>
                        {plans.map(plan => (
                          <th key={plan.id} className={`p-4 md:p-5 text-center ${isPopular(plan.name) ? 'bg-[var(--accent)]/5' : 'bg-[var(--bg-elevated)]/50'}`}>
                            <div className="flex flex-col items-center gap-1">
                              <span className={`text-sm font-bold ${isPopular(plan.name) ? 'text-[var(--accent)]' : 'text-[var(--text-primary)]'}`}>
                                {plan.display_name}
                              </span>
                              {isPopular(plan.name) && (
                                <span className="text-[10px] px-2 py-0.5 rounded-full bg-[var(--accent)]/20 text-[var(--accent)] font-medium">
                                  推荐
                                </span>
                              )}
                            </div>
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[var(--border-color)]/50">
                      {[
                        { key: 'fullWorkflow', label: t.pricing.features.fullWorkflow, all: true },
                        { key: 'templateAccess', label: t.pricing.features.templateAccess, all: true },
                        { key: 'teamCollaboration', label: t.pricing.features.teamCollaboration, fromIndex: 2 },
                        { key: 'prioritySupport', label: t.pricing.features.prioritySupport, fromIndex: 2 },
                        { key: 'apiAccess', label: 'API 访问', fromIndex: 2 },
                        { key: 'customModels', label: '自定义AI模型', fromIndex: 3 },
                        { key: 'privateDeploy', label: t.pricing.features.privateDeploy, onlyLast: true },
                      ].map((feature, rowIdx) => (
                        <tr key={feature.key} className="hover:bg-[var(--bg-elevated)]/30 transition-colors">
                          <td className="p-4 md:p-5 text-[var(--text-secondary)] text-sm">
                            <div className="flex items-center gap-2">
                              <span>{feature.label}</span>
                              <Tooltip content="了解更多" placement="top">
                                <HelpCircle className="w-3.5 h-3.5 text-[var(--text-muted)] cursor-help opacity-50 hover:opacity-100" />
                              </Tooltip>
                            </div>
                          </td>
                          {plans.map((plan, i) => {
                            const hasFeature = feature.all || 
                              (feature.fromIndex !== undefined && i >= feature.fromIndex) ||
                              (feature.onlyLast && i === plans.length - 1);
                            return (
                              <td 
                                key={plan.id} 
                                className={`p-4 md:p-5 text-center ${isPopular(plan.name) ? 'bg-[var(--accent)]/5' : ''}`}
                              >
                                {hasFeature ? (
                                  <div className="w-6 h-6 rounded-full bg-emerald-500/15 flex items-center justify-center mx-auto">
                                    <Check className="w-3.5 h-3.5 text-emerald-400" />
                                  </div>
                                ) : (
                                  <div className="w-6 h-6 rounded-full bg-[var(--bg-elevated)] flex items-center justify-center mx-auto">
                                    <X className="w-3.5 h-3.5 text-[var(--text-muted)]" />
                                  </div>
                                )}
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardBody>
            </Card>
          </motion.div>

          {/* FAQ 部分 */}
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.6 }}
            className="mt-16 md:mt-20"
          >
            <div className="text-center mb-10">
              <h2 className="text-2xl md:text-3xl font-bold text-[var(--text-primary)] mb-3">
                常见问题
              </h2>
              <p className="text-[var(--text-muted)]">
                关于定价和订阅的常见问题解答
              </p>
            </div>
            
            <div className="grid md:grid-cols-2 gap-4 md:gap-6 max-w-4xl mx-auto">
              {[
                { q: '可以随时取消订阅吗？', a: '是的，您可以随时取消订阅。取消后，您仍可使用服务直到当前计费周期结束。' },
                { q: '支持哪些支付方式？', a: '我们支持微信支付、支付宝、银行卡以及企业对公转账等多种支付方式。' },
                { q: '如何升级或降级套餐？', a: '您可以在账户设置中随时更改套餐。升级立即生效，降级在下个计费周期生效。' },
                { q: '企业版包含哪些服务？', a: '企业版包含私有化部署、定制开发、专属技术支持、SLA保障等高级服务。' },
              ].map((faq, idx) => (
                <motion.div
                  key={idx}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.65 + idx * 0.05 }}
                >
                  <Card className="bg-[var(--bg-card)]/60 backdrop-blur-sm border border-[var(--border-color)] hover:border-[var(--accent)]/30 transition-colors">
                    <CardBody className="p-5">
                      <h3 className="text-[var(--text-primary)] font-semibold mb-2 flex items-start gap-2">
                        <HelpCircle className="w-5 h-5 text-[var(--accent)] flex-shrink-0 mt-0.5" />
                        {faq.q}
                      </h3>
                      <p className="text-sm text-[var(--text-muted)] leading-relaxed pl-7">
                        {faq.a}
                      </p>
                    </CardBody>
                  </Card>
                </motion.div>
              ))}
            </div>
          </motion.div>

          {/* 底部 CTA */}
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.7 }}
            className="mt-16 md:mt-20 text-center pb-8"
          >
            <Card className="bg-gradient-to-br from-[var(--accent)]/10 to-purple-600/10 border border-[var(--accent)]/20 max-w-2xl mx-auto">
              <CardBody className="p-8 md:p-10">
                <div className="flex items-center justify-center gap-2 mb-4">
                  <Shield className="w-6 h-6 text-[var(--accent)]" />
                  <span className="text-lg font-semibold text-[var(--text-primary)]">
                    7天无理由退款保障
                  </span>
                </div>
                <p className="text-[var(--text-muted)] mb-6">
                  不满意？7天内无条件全额退款，让您零风险体验
                </p>
                <Button
                  className="bg-gradient-to-r from-[var(--accent)] to-purple-600 text-white font-semibold px-8 h-11 shadow-lg shadow-[var(--accent)]/25"
                  onPress={() => !getAuthToken() && navigate('/auth', { state: { from: '/pricing' } })}
                >
                  立即开始免费试用
                </Button>
              </CardBody>
            </Card>
          </motion.div>
        </div>
      </div>
    </div>
  );
};

export default Pricing;
