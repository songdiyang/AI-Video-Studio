import React, { useRef } from 'react';
import { motion, useInView } from 'framer-motion';
import { Link } from 'react-router-dom';
import { 
  Sparkles, ArrowRight, Pencil, Wand2, Film, 
  FileText, Layout, Package, Video, Cpu,
  ChevronRight, Check
} from 'lucide-react';
import { useLanguage } from '../../contexts/LanguageContext';

// 动画变体
const fadeInUp = {
  hidden: { opacity: 0, y: 40 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.6, ease: [0.25, 0.46, 0.45, 0.94] as const } },
};

const fadeIn = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { duration: 0.6 } },
};

const staggerContainer = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.1 },
  },
};

// 功能图标映射
const FEATURE_ICONS = {
  scriptStudio: FileText,
  storyboard: Layout,
  sketchStudio: Pencil,
  assetManager: Package,
  videoComposer: Video,
  aiEngine: Cpu,
};

// 功能卡片颜色
const FEATURE_COLORS = {
  scriptStudio: 'from-violet-500 to-purple-600',
  storyboard: 'from-cyan-500 to-blue-600',
  sketchStudio: 'from-orange-500 to-red-600',
  assetManager: 'from-emerald-500 to-teal-600',
  videoComposer: 'from-pink-500 to-rose-600',
  aiEngine: 'from-indigo-500 to-blue-600',
};

// 定价方案
const PRICING_PLANS = [
  { key: 'free', price: '¥0', features: ['3个项目', '2,000积分/月', '基础模板'] },
  { key: 'basic', price: '¥99', features: ['20个项目', '10,000积分/月', '完整工作流', '首月¥49.9'] },
  { key: 'pro', price: '¥299', popular: true, features: ['无限项目', '30,000积分/月', '团队协作', '优先支持'] },
  { key: 'premium', price: '¥888', features: ['无限项目', '90,000积分/月', '无限团队', 'API接入'] },
  { key: 'enterprise', price: '联系我们', features: ['私有化部署', '无限积分', '定制开发', '专属客户经理'] },
];

// 动画组件包装器
const AnimatedSection: React.FC<{ children: React.ReactNode; className?: string }> = ({ children, className }) => {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, margin: '-100px' });

  return (
    <motion.div
      ref={ref}
      initial="hidden"
      animate={isInView ? 'visible' : 'hidden'}
      variants={staggerContainer}
      className={className}
    >
      {children}
    </motion.div>
  );
};

const Landing: React.FC = () => {
  const { t } = useLanguage();

  return (
    <div className="min-h-screen overflow-y-auto overflow-x-hidden" style={{ backgroundColor: 'var(--bg-app)' }}>
      {/* Hero Section */}
      <section className="relative min-h-screen flex items-center justify-center px-4 py-20 overflow-hidden">
        {/* 背景装饰 */}
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-0 left-1/4 w-150 h-150 bg-(--accent)/10 rounded-full blur-[120px]" />
          <div className="absolute bottom-0 right-1/4 w-125 h-125 bg-(--accent-secondary)/10 rounded-full blur-[100px]" />
          {/* 网格背景 */}
          <div 
            className="absolute inset-0 opacity-[0.03]"
            style={{
              backgroundImage: 'linear-gradient(var(--text-primary) 1px, transparent 1px), linear-gradient(90deg, var(--text-primary) 1px, transparent 1px)',
              backgroundSize: '60px 60px',
            }}
          />
        </div>

        <div className="relative z-10 max-w-5xl mx-auto text-center">
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.8, ease: [0.25, 0.46, 0.45, 0.94] }}
          >
            {/* Logo */}
            <motion.div
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
              className="flex justify-center mb-8"
            >
              <div className="relative">
                <div className="absolute inset-0 bg-linear-to-br from-(--accent)/40 to-(--accent-dark)/40 rounded-2xl blur-xl" />
                <div 
                  className="relative p-4 bg-linear-to-br from-(--accent) to-(--accent-dark) rounded-2xl"
                  style={{ boxShadow: '0 20px 40px -10px var(--accent-glow)' }}
                >
                  <Sparkles className="w-10 h-10 text-white" />
                </div>
              </div>
            </motion.div>

            {/* 标题 */}
            <motion.h1
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3, duration: 0.6 }}
              className="text-4xl md:text-5xl lg:text-6xl font-black leading-tight mb-6"
              style={{ color: 'var(--text-primary)' }}
            >
              {t.landing?.hero?.title || '让每个有故事的人，都能做出百万播放的 AI 漫剧'}
            </motion.h1>

            {/* 副标题 */}
            <motion.p
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.4, duration: 0.6 }}
              className="text-lg md:text-xl max-w-2xl mx-auto mb-10"
              style={{ color: 'var(--text-secondary)' }}
            >
              {t.landing?.hero?.subtitle || '草图驱动 AI 生成，100% 锁定分镜与叙事节奏'}
            </motion.p>

            {/* CTA 按钮 */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.5, duration: 0.6 }}
              className="flex flex-col sm:flex-row gap-4 justify-center"
            >
              <Link
                to="/auth"
                className="group inline-flex items-center justify-center gap-2 px-8 py-4 rounded-xl font-bold text-white transition-all"
                style={{
                  background: 'linear-gradient(135deg, var(--accent), var(--accent-dark))',
                  boxShadow: '0 10px 30px -5px var(--accent-glow)',
                }}
              >
                {t.landing?.hero?.cta || '免费开始创作'}
                <ArrowRight className="w-5 h-5 transition-transform group-hover:translate-x-1" />
              </Link>
              <Link
                to="/pricing"
                className="inline-flex items-center justify-center gap-2 px-8 py-4 rounded-xl font-bold transition-all border-2"
                style={{
                  color: 'var(--text-primary)',
                  borderColor: 'var(--border-color)',
                  backgroundColor: 'var(--bg-card)',
                }}
              >
                {t.landing?.hero?.ctaSecondary || '查看定价'}
              </Link>
            </motion.div>
          </motion.div>

          {/* 向下滚动提示 */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 1.2 }}
            className="absolute bottom-8 left-1/2 -translate-x-1/2"
          >
            <motion.div
              animate={{ y: [0, 8, 0] }}
              transition={{ duration: 1.5, repeat: Infinity }}
              className="w-6 h-10 rounded-full border-2 flex items-start justify-center pt-2"
              style={{ borderColor: 'var(--border-color)' }}
            >
              <div className="w-1.5 h-3 rounded-full bg-(--accent)" />
            </motion.div>
          </motion.div>
        </div>
      </section>

      {/* Features Section */}
      <section className="py-24 px-4" style={{ backgroundColor: 'var(--bg-elevated)' }}>
        <div className="max-w-6xl mx-auto">
          <AnimatedSection className="text-center mb-16">
            <motion.h2
              variants={fadeInUp}
              className="text-3xl md:text-4xl font-bold mb-4"
              style={{ color: 'var(--text-primary)' }}
            >
              {t.landing?.features?.title || '强大的创作工具链'}
            </motion.h2>
            <motion.p
              variants={fadeInUp}
              className="text-lg max-w-2xl mx-auto"
              style={{ color: 'var(--text-muted)' }}
            >
              {t.landing?.features?.subtitle || '从剧本到成片，一站式 AI 漫剧创作'}
            </motion.p>
          </AnimatedSection>

          <AnimatedSection className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {(['scriptStudio', 'storyboard', 'sketchStudio', 'assetManager', 'videoComposer', 'aiEngine'] as const).map((key) => {
              const Icon = FEATURE_ICONS[key];
              const colorClass = FEATURE_COLORS[key];
              const feature = t.landing?.features?.[key];

              return (
                <motion.div
                  key={key}
                  variants={fadeInUp}
                  whileHover={{ y: -4, transition: { duration: 0.2 } }}
                  className="group p-6 rounded-2xl border transition-all"
                  style={{
                    backgroundColor: 'var(--bg-card)',
                    borderColor: 'var(--border-color)',
                  }}
                >
                  <div className={`w-12 h-12 rounded-xl bg-linear-to-br ${colorClass} flex items-center justify-center mb-4 group-hover:scale-110 transition-transform`}>
                    <Icon className="w-6 h-6 text-white" />
                  </div>
                  <h3 className="text-lg font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>
                    {feature?.title || key}
                  </h3>
                  <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
                    {feature?.desc || ''}
                  </p>
                </motion.div>
              );
            })}
          </AnimatedSection>
        </div>
      </section>

      {/* Workflow Section */}
      <section className="py-24 px-4">
        <div className="max-w-5xl mx-auto">
          <AnimatedSection className="text-center mb-16">
            <motion.h2
              variants={fadeInUp}
              className="text-3xl md:text-4xl font-bold mb-4"
              style={{ color: 'var(--text-primary)' }}
            >
              {t.landing?.workflow?.title || '三步完成创作'}
            </motion.h2>
          </AnimatedSection>

          <AnimatedSection className="relative">
            {/* 连接线 */}
            <div className="hidden md:block absolute top-1/2 left-0 right-0 h-0.5 -translate-y-1/2" style={{ backgroundColor: 'var(--border-color)' }} />

            <div className="grid grid-cols-1 md:grid-cols-3 gap-8 relative">
              {(['step1', 'step2', 'step3'] as const).map((stepKey, index) => {
                const step = t.landing?.workflow?.[stepKey];
                const icons = [Pencil, Wand2, Film];
                const Icon = icons[index];

                return (
                  <motion.div
                    key={stepKey}
                    variants={fadeInUp}
                    className="relative text-center"
                  >
                    {/* 步骤数字 */}
                    <div className="relative z-10 mx-auto mb-6">
                      <div 
                        className="w-20 h-20 rounded-full flex items-center justify-center mx-auto"
                        style={{
                          background: 'linear-gradient(135deg, var(--accent), var(--accent-dark))',
                          boxShadow: '0 10px 30px -5px var(--accent-glow)',
                        }}
                      >
                        <Icon className="w-8 h-8 text-white" />
                      </div>
                      <div 
                        className="absolute -top-2 -right-2 w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold text-white"
                        style={{ backgroundColor: 'var(--bg-app)', border: '2px solid var(--accent)' }}
                      >
                        <span style={{ color: 'var(--accent)' }}>{index + 1}</span>
                      </div>
                    </div>

                    <h3 className="text-xl font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>
                      {step?.title || `步骤 ${index + 1}`}
                    </h3>
                    <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
                      {step?.desc || ''}
                    </p>

                    {/* 箭头 */}
                    {index < 2 && (
                      <div className="hidden md:flex absolute top-10 -right-4 z-20">
                        <ChevronRight className="w-8 h-8" style={{ color: 'var(--accent)' }} />
                      </div>
                    )}
                  </motion.div>
                );
              })}
            </div>
          </AnimatedSection>
        </div>
      </section>

      {/* Pricing Section */}
      <section className="py-24 px-4" style={{ backgroundColor: 'var(--bg-elevated)' }}>
        <div className="max-w-6xl mx-auto">
          <AnimatedSection className="text-center mb-16">
            <motion.h2
              variants={fadeInUp}
              className="text-3xl md:text-4xl font-bold mb-4"
              style={{ color: 'var(--text-primary)' }}
            >
              {t.pricing?.title || '选择适合您的方案'}
            </motion.h2>
            <motion.p
              variants={fadeInUp}
              className="text-lg"
              style={{ color: 'var(--text-muted)' }}
            >
              {t.pricing?.subtitle || '灵活的定价方案，满足不同创作需求'}
            </motion.p>
          </AnimatedSection>

          <AnimatedSection className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {PRICING_PLANS.map((plan) => {
              const planInfo = t.pricing?.[plan.key as keyof typeof t.pricing] as { name?: string; desc?: string; cta?: string } | undefined;

              return (
                <motion.div
                  key={plan.key}
                  variants={fadeInUp}
                  whileHover={{ y: -4 }}
                  className={`relative p-6 rounded-2xl border transition-all ${
                    plan.popular ? 'border-(--accent)' : ''
                  }`}
                  style={{
                    backgroundColor: 'var(--bg-card)',
                    borderColor: plan.popular ? 'var(--accent)' : 'var(--border-color)',
                  }}
                >
                  {plan.popular && (
                    <div 
                      className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full text-xs font-semibold text-white"
                      style={{ backgroundColor: 'var(--accent)' }}
                    >
                      {t.pricing?.popular || '最受欢迎'}
                    </div>
                  )}

                  <h3 className="text-lg font-semibold mb-1" style={{ color: 'var(--text-primary)' }}>
                    {planInfo?.name || plan.key}
                  </h3>
                  <p className="text-sm mb-4" style={{ color: 'var(--text-muted)' }}>
                    {planInfo?.desc || ''}
                  </p>

                  <div className="text-3xl font-bold mb-6" style={{ color: 'var(--accent)' }}>
                    {plan.price}
                    {plan.price !== '联系我们' && <span className="text-sm font-normal" style={{ color: 'var(--text-muted)' }}>/月</span>}
                  </div>

                  <ul className="space-y-3 mb-6">
                    {plan.features.map((feature, idx) => (
                      <li key={idx} className="flex items-center gap-2 text-sm" style={{ color: 'var(--text-secondary)' }}>
                        <Check className="w-4 h-4 text-(--accent)" />
                        {feature}
                      </li>
                    ))}
                  </ul>

                  <button
                    className={`w-full py-2.5 rounded-lg font-medium transition-all ${
                      plan.popular
                        ? 'text-white'
                        : 'hover:bg-white/5'
                    }`}
                    style={{
                      backgroundColor: plan.popular ? 'var(--accent)' : 'transparent',
                      color: plan.popular ? 'white' : 'var(--text-primary)',
                      border: plan.popular ? 'none' : '1px solid var(--border-color)',
                    }}
                  >
                    {planInfo?.cta || '开始使用'}
                  </button>
                </motion.div>
              );
            })}
          </AnimatedSection>

          <motion.div
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true }}
            className="text-center mt-8"
          >
            <Link
              to="/pricing"
              className="text-sm font-medium hover:underline"
              style={{ color: 'var(--accent)' }}
            >
              {t.pricing?.compareFeatures || '查看完整对比'} →
            </Link>
          </motion.div>
        </div>
      </section>

      {/* Final CTA Section */}
      <section className="relative py-24 px-4 overflow-hidden">
        {/* 背景渐变 */}
        <div className="absolute inset-0">
          <div className="absolute inset-0 bg-linear-to-br from-(--accent)/20 to-(--accent-dark)/20" />
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-200 h-200 bg-(--accent)/10 rounded-full blur-[120px]" />
        </div>

        <AnimatedSection className="relative z-10 max-w-3xl mx-auto text-center">
          <motion.h2
            variants={fadeInUp}
            className="text-3xl md:text-4xl font-bold mb-4"
            style={{ color: 'var(--text-primary)' }}
          >
            {t.landing?.cta?.title || '准备好开始创作了吗？'}
          </motion.h2>
          <motion.p
            variants={fadeInUp}
            className="text-lg mb-8"
            style={{ color: 'var(--text-secondary)' }}
          >
            {t.landing?.cta?.subtitle || '加入数千名创作者，开启您的 AI 漫剧之旅'}
          </motion.p>
          <motion.div variants={fadeInUp}>
            <Link
              to="/auth"
              className="group inline-flex items-center gap-2 px-8 py-4 rounded-xl font-bold text-white transition-all"
              style={{
                background: 'linear-gradient(135deg, var(--accent), var(--accent-dark))',
                boxShadow: '0 10px 30px -5px var(--accent-glow)',
              }}
            >
              {t.landing?.cta?.button || '立即免费试用'}
              <Sparkles className="w-5 h-5 transition-transform group-hover:rotate-12" />
            </Link>
          </motion.div>
        </AnimatedSection>
      </section>

      {/* Footer */}
      <footer className="py-12 px-4 border-t" style={{ borderColor: 'var(--border-color)', backgroundColor: 'var(--bg-nav)' }}>
        <div className="max-w-6xl mx-auto">
          <div className="flex flex-col md:flex-row items-center justify-between gap-6">
            {/* Logo */}
            <div className="flex items-center gap-3">
              <div className="p-2 bg-linear-to-br from-(--accent) to-(--accent-dark) rounded-lg">
                <Sparkles className="w-5 h-5 text-white" />
              </div>
              <span className="font-semibold" style={{ color: 'var(--text-primary)' }}>
                {t.nav?.studioName || '饺子动漫'}
              </span>
            </div>

            {/* 链接 */}
            <nav className="flex flex-wrap items-center justify-center gap-6">
              {(['about', 'pricing', 'community', 'terms', 'privacy'] as const).map((key) => (
                <Link
                  key={key}
                  to={key === 'about' ? '/about' : key === 'pricing' ? '/pricing' : key === 'community' ? '/community' : `/${key}`}
                  className="text-sm transition-colors hover:text-(--accent)"
                  style={{ color: 'var(--text-muted)' }}
                >
                  {t.landing?.footer?.links?.[key] || key}
                </Link>
              ))}
            </nav>

            {/* 版权 */}
            <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
              {t.landing?.footer?.copyright || '© 2026 饺子动漫. 保留所有权利.'}
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default Landing;
