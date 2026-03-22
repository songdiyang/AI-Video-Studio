import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Card, CardBody, Button, Switch, Chip } from '@heroui/react';
import { Check, Sparkles, Crown, Building2, Rocket, Mail } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useLanguage } from '../../contexts/LanguageContext';
import { useToast } from '../../contexts/ToastContext';
import { fetchPlans, subscribe, type SubscriptionPlan } from '../../services/subscriptions';
import { getAuthToken } from '../../services/auth';

// 默认套餐图标映射
const planIcons: Record<string, React.ReactNode> = {
  starter: <Rocket className="w-6 h-6" />,
  creator: <Sparkles className="w-6 h-6" />,
  studio: <Crown className="w-6 h-6" />,
  enterprise: <Building2 className="w-6 h-6" />,
};

// 默认套餐颜色映射
const planColors: Record<string, string> = {
  starter: 'from-slate-500 to-slate-600',
  creator: 'from-[var(--accent)] to-purple-600',
  studio: 'from-amber-500 to-orange-600',
  enterprise: 'from-blue-600 to-indigo-700',
};

const Pricing: React.FC = () => {
  const navigate = useNavigate();
  const { t } = useLanguage();
  const { showToast } = useToast();
  const [isYearly, setIsYearly] = useState(false);
  const [plans, setPlans] = useState<SubscriptionPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [subscribing, setSubscribing] = useState<number | null>(null);

  useEffect(() => {
    loadPlans();
  }, []);

  const loadPlans = async () => {
    try {
      const data = await fetchPlans();
      setPlans(data.sort((a, b) => a.sort_order - b.sort_order));
    } catch (error) {
      console.error('加载套餐失败:', error);
      // 使用默认套餐展示
      setPlans([]);
    } finally {
      setLoading(false);
    }
  };

  const handleSubscribe = async (plan: SubscriptionPlan) => {
    if (!getAuthToken()) {
      navigate('/auth', { state: { from: '/pricing' } });
      return;
    }

    if (plan.name === 'enterprise') {
      window.open('mailto:contact@nanostory.ai?subject=Enterprise Plan Inquiry', '_blank');
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

  const getPlanIcon = (name: string) => planIcons[name.toLowerCase()] || <Sparkles className="w-6 h-6" />;
  const getPlanColor = (name: string) => planColors[name.toLowerCase()] || 'from-slate-500 to-slate-600';

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

  const isPopular = (name: string) => name.toLowerCase() === 'creator';

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[var(--bg-app)]">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 border-2 border-[var(--accent)] border-t-transparent rounded-full animate-spin" />
          <div className="text-[var(--text-muted)]">{t.common.loading}</div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[var(--bg-app)] py-16 px-4">
      <div className="max-w-7xl mx-auto">
        {/* 页面标题 */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center mb-12"
        >
          <h1 className="text-4xl md:text-5xl font-bold text-[var(--text-primary)] mb-4">
            {t.pricing.title}
          </h1>
          <p className="text-lg text-[var(--text-secondary)] max-w-2xl mx-auto">
            {t.pricing.subtitle}
          </p>
        </motion.div>

        {/* 月付/年付切换 */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="flex items-center justify-center gap-4 mb-12"
        >
          <span className={`text-sm font-medium transition-colors ${!isYearly ? 'text-[var(--text-primary)]' : 'text-[var(--text-muted)]'}`}>
            {t.pricing.monthly}
          </span>
          <Switch
            isSelected={isYearly}
            onValueChange={setIsYearly}
            classNames={{
              wrapper: 'group-data-[selected=true]:bg-[var(--accent)]',
            }}
          />
          <span className={`text-sm font-medium transition-colors ${isYearly ? 'text-[var(--text-primary)]' : 'text-[var(--text-muted)]'}`}>
            {t.pricing.yearly}
          </span>
          {isYearly && (
            <Chip size="sm" className="bg-emerald-500/10 text-emerald-400 animate-pulse">
              {t.pricing.yearlyDiscount}
            </Chip>
          )}
        </motion.div>

        {/* 套餐卡片 */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {plans.map((plan, index) => {
            const planTrans = getPlanTranslation(plan.name);
            const popular = isPopular(plan.name);
            const isEnterprise = plan.name.toLowerCase() === 'enterprise';
            const price = isYearly ? plan.price_yearly : plan.price_monthly;

            return (
              <motion.div
                key={plan.id}
                initial={{ opacity: 0, y: 30 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 + index * 0.1 }}
                className={`relative ${popular ? 'lg:-mt-4 lg:mb-4' : ''}`}
              >
                {popular && (
                  <div className="absolute -top-4 left-1/2 -translate-x-1/2 z-10">
                    <Chip
                      className="bg-gradient-to-r from-[var(--accent)] to-purple-600 text-white font-semibold px-4"
                      size="sm"
                    >
                      {t.pricing.popular}
                    </Chip>
                  </div>
                )}

                <Card
                  className={`
                    h-full transition-all duration-300 hover:scale-[1.02]
                    ${popular
                      ? 'bg-gradient-to-b from-[var(--accent)]/10 to-purple-600/5 border-2 border-[var(--accent)]/50 shadow-lg shadow-[var(--accent)]/10'
                      : 'bg-[var(--bg-card)] border border-[var(--border-color)]'
                    }
                  `}
                >
                  <CardBody className="p-6 flex flex-col h-full">
                    {/* 套餐头部 */}
                    <div className="mb-6">
                      <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${getPlanColor(plan.name)} flex items-center justify-center text-white mb-4`}>
                        {getPlanIcon(plan.name)}
                      </div>
                      <h3 className="text-xl font-bold text-[var(--text-primary)] mb-1">
                        {plan.display_name || planTrans.name}
                      </h3>
                      <p className="text-sm text-[var(--text-muted)]">
                        {planTrans.desc}
                      </p>
                    </div>

                    {/* 价格 */}
                    <div className="mb-6">
                      {isEnterprise ? (
                        <div className="text-2xl font-bold text-[var(--text-primary)]">
                          {t.pricing.enterprise.cta}
                        </div>
                      ) : (
                        <div className="flex items-baseline gap-1">
                          <span className="text-4xl font-bold text-[var(--text-primary)]">
                            {formatPrice(price)}
                          </span>
                          <span className="text-[var(--text-muted)]">
                            {isYearly ? t.pricing.perYear : t.pricing.perMonth}
                          </span>
                        </div>
                      )}
                    </div>

                    {/* 功能列表 */}
                    <div className="flex-1 space-y-3 mb-6">
                      <div className="flex items-center gap-2 text-sm">
                        <Check className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                        <span className="text-[var(--text-secondary)]">
                          {t.pricing.features.maxProjects}: <strong className="text-[var(--text-primary)]">{plan.max_projects === -1 ? '无限' : plan.max_projects}</strong>
                        </span>
                      </div>
                      <div className="flex items-center gap-2 text-sm">
                        <Check className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                        <span className="text-[var(--text-secondary)]">
                          {t.pricing.features.maxApiCalls}: <strong className="text-[var(--text-primary)]">{plan.max_api_calls_monthly === -1 ? '无限' : plan.max_api_calls_monthly.toLocaleString()}</strong>
                        </span>
                      </div>
                      <div className="flex items-center gap-2 text-sm">
                        <Check className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                        <span className="text-[var(--text-secondary)]">
                          {t.pricing.features.maxTeamMembers}: <strong className="text-[var(--text-primary)]">{plan.max_team_members === -1 ? '无限' : plan.max_team_members}</strong>
                        </span>
                      </div>
                      {plan.features_json?.map((feature, i) => (
                        <div key={i} className="flex items-center gap-2 text-sm">
                          <Check className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                          <span className="text-[var(--text-secondary)]">{feature}</span>
                        </div>
                      ))}
                    </div>

                    {/* CTA 按钮 */}
                    <Button
                      className={`
                        w-full font-semibold
                        ${popular
                          ? 'bg-gradient-to-r from-[var(--accent)] to-purple-600 text-white'
                          : isEnterprise
                            ? 'bg-[var(--bg-secondary)] text-[var(--text-primary)] border border-[var(--border-color)]'
                            : 'bg-[var(--accent)]/10 text-[var(--accent)] hover:bg-[var(--accent)]/20'
                        }
                      `}
                      isLoading={subscribing === plan.id}
                      onPress={() => handleSubscribe(plan)}
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

        {/* 功能对比表格（简化版） */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5 }}
          className="mt-16"
        >
          <h2 className="text-2xl font-bold text-[var(--text-primary)] text-center mb-8">
            {t.pricing.compareFeatures}
          </h2>
          <Card className="bg-[var(--bg-card)] border border-[var(--border-color)] overflow-hidden">
            <CardBody className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-[var(--border-color)]">
                      <th className="text-left p-4 text-[var(--text-secondary)] font-medium">功能</th>
                      {plans.map(plan => (
                        <th key={plan.id} className="p-4 text-center">
                          <span className={`text-sm font-semibold ${isPopular(plan.name) ? 'text-[var(--accent)]' : 'text-[var(--text-primary)]'}`}>
                            {plan.display_name}
                          </span>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    <tr className="border-b border-[var(--border-color)]/50">
                      <td className="p-4 text-[var(--text-secondary)]">{t.pricing.features.fullWorkflow}</td>
                      {plans.map(plan => (
                        <td key={plan.id} className="p-4 text-center">
                          <Check className="w-5 h-5 text-emerald-400 mx-auto" />
                        </td>
                      ))}
                    </tr>
                    <tr className="border-b border-[var(--border-color)]/50">
                      <td className="p-4 text-[var(--text-secondary)]">{t.pricing.features.templateAccess}</td>
                      {plans.map(plan => (
                        <td key={plan.id} className="p-4 text-center">
                          <Check className="w-5 h-5 text-emerald-400 mx-auto" />
                        </td>
                      ))}
                    </tr>
                    <tr className="border-b border-[var(--border-color)]/50">
                      <td className="p-4 text-[var(--text-secondary)]">{t.pricing.features.teamCollaboration}</td>
                      {plans.map((plan, i) => (
                        <td key={plan.id} className="p-4 text-center">
                          {i >= 2 ? <Check className="w-5 h-5 text-emerald-400 mx-auto" /> : <span className="text-[var(--text-muted)]">—</span>}
                        </td>
                      ))}
                    </tr>
                    <tr className="border-b border-[var(--border-color)]/50">
                      <td className="p-4 text-[var(--text-secondary)]">{t.pricing.features.prioritySupport}</td>
                      {plans.map((plan, i) => (
                        <td key={plan.id} className="p-4 text-center">
                          {i >= 2 ? <Check className="w-5 h-5 text-emerald-400 mx-auto" /> : <span className="text-[var(--text-muted)]">—</span>}
                        </td>
                      ))}
                    </tr>
                    <tr>
                      <td className="p-4 text-[var(--text-secondary)]">{t.pricing.features.privateDeploy}</td>
                      {plans.map((plan, i) => (
                        <td key={plan.id} className="p-4 text-center">
                          {i === plans.length - 1 ? <Check className="w-5 h-5 text-emerald-400 mx-auto" /> : <span className="text-[var(--text-muted)]">—</span>}
                        </td>
                      ))}
                    </tr>
                  </tbody>
                </table>
              </div>
            </CardBody>
          </Card>
        </motion.div>
      </div>
    </div>
  );
};

export default Pricing;
