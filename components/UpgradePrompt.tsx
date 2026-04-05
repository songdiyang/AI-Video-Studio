/**
 * 升级提示弹窗组件
 * 当用户达到会员等级限制时，显示友好的升级提示
 */

import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Zap, Check, ArrowRight, Star, Crown, Sparkles } from 'lucide-react';

interface UpgradePromptProps {
  isOpen: boolean;
  onClose: () => void;
  limitType: 'project' | 'points' | 'team';
  currentPlan: {
    name: string;
    displayName: string;
    level: number;
  };
  currentUsage: {
    current: number;
    max: number;
  };
  nextPlan?: {
    name: string;
    displayName: string;
    maxProjects: number | string;
    price?: {
      monthly: number;
      yearly: number;
      firstMonth?: number;
    };
  };
}

const PLAN_ICONS: Record<string, React.ReactNode> = {
  free: <span className="text-2xl">🌱</span>,
  basic: <span className="text-2xl">🚀</span>,
  pro: <span className="text-2xl">✨</span>,
  premium: <span className="text-2xl">🎬</span>,
  enterprise: <span className="text-2xl">🏢</span>
};

const PLAN_COLORS: Record<string, string> = {
  free: 'from-emerald-400 to-teal-500',
  basic: 'from-gray-400 to-gray-500',
  pro: 'from-purple-500 to-indigo-600',
  premium: 'from-amber-500 to-orange-600',
  enterprise: 'from-blue-600 to-cyan-500'
};

const PLAN_FEATURES: Record<string, string[]> = {
  basic: [
    '20 个项目',
    '10,000 积分/月',
    '5 位团队成员',
    '完整工作流',
    '模板库访问',
    '社区排行榜'
  ],
  pro: [
    '无限项目',
    '30,000 积分/月',
    '15 位团队成员',
    '高级 AI 模型',
    '团队协作',
    '优先支持'
  ],
  premium: [
    '无限项目',
    '90,000 积分/月',
    '无限团队成员',
    '全部 AI 模型',
    'API 访问权限',
    '专属客服'
  ],
  enterprise: [
    '无限项目',
    '无限 AI 调用',
    '无限团队成员',
    '私有化部署',
    '定制开发',
    '专属客户经理'
  ]
};

const UpgradePrompt: React.FC<UpgradePromptProps> = ({
  isOpen,
  onClose,
  limitType,
  currentPlan,
  currentUsage,
  nextPlan
}) => {
  const limitMessages: Record<string, { title: string; desc: string }> = {
    project: {
      title: '项目数量已达上限',
      desc: `您当前的${currentPlan.displayName}最多可创建 ${currentUsage.max} 个项目`
    },
    points: {
      title: '本月积分已用完',
      desc: `您当前的${currentPlan.displayName}每月有 ${currentUsage.max} 积分`
    },
    team: {
      title: '团队成员已达上限',
      desc: `您当前的${currentPlan.displayName}最多可邀请 ${currentUsage.max} 位成员`
    }
  };

  const message = limitMessages[limitType];
  const features = nextPlan ? PLAN_FEATURES[nextPlan.name] || [] : [];
  const gradientClass = nextPlan ? PLAN_COLORS[nextPlan.name] : PLAN_COLORS.pro;

  const handleUpgrade = () => {
    // 跳转到订阅页面
    window.location.href = '/settings?tab=subscription';
    onClose();
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          {/* 背景遮罩 */}
          <motion.div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={onClose}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          />

          {/* 弹窗内容 */}
          <motion.div
            className="relative w-full max-w-md bg-[var(--bg-primary)] rounded-2xl shadow-2xl overflow-hidden"
            initial={{ scale: 0.9, opacity: 0, y: 20 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.9, opacity: 0, y: 20 }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
          >
            {/* 顶部渐变装饰 */}
            <div className={`h-2 bg-gradient-to-r ${gradientClass}`} />

            {/* 关闭按钮 */}
            <button
              onClick={onClose}
              className="absolute top-4 right-4 p-2 rounded-full hover:bg-[var(--bg-secondary)] transition-colors"
            >
              <X className="w-5 h-5 text-[var(--text-muted)]" />
            </button>

            {/* 内容区域 */}
            <div className="p-6">
              {/* 图标和标题 */}
              <div className="text-center mb-6">
                <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-amber-100 dark:bg-amber-900/30 mb-4">
                  <Zap className="w-8 h-8 text-amber-500" />
                </div>
                <h2 className="text-xl font-bold text-[var(--text-primary)] mb-2">
                  {message.title}
                </h2>
                <p className="text-sm text-[var(--text-muted)]">
                  {message.desc}
                </p>
              </div>

              {/* 当前状态 */}
              <div className="mb-6 p-4 rounded-xl bg-[var(--bg-secondary)]">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm text-[var(--text-muted)]">当前使用</span>
                  <span className="text-sm font-medium text-[var(--text-primary)]">
                    {currentUsage.current} / {currentUsage.max}
                  </span>
                </div>
                <div className="h-2 rounded-full bg-[var(--bg-tertiary)] overflow-hidden">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-red-500 to-orange-500"
                    style={{ width: '100%' }}
                  />
                </div>
              </div>

              {/* 升级推荐 */}
              {nextPlan && (
                <div className={`p-4 rounded-xl bg-gradient-to-br ${gradientClass} text-white mb-6`}>
                  <div className="flex items-center gap-3 mb-3">
                    {PLAN_ICONS[nextPlan.name]}
                    <div>
                      <div className="font-bold">{nextPlan.displayName}</div>
                      {nextPlan.price && (
                        <div className="text-sm opacity-90">
                          {nextPlan.price.firstMonth && (
                            <span className="mr-2">
                              首月 ¥{nextPlan.price.firstMonth}
                            </span>
                          )}
                          <span>¥{nextPlan.price.monthly}/月</span>
                        </div>
                      )}
                    </div>
                    <Star className="ml-auto w-5 h-5" />
                  </div>

                  {/* 特性列表 */}
                  <div className="grid grid-cols-2 gap-2">
                    {features.slice(0, 6).map((feature, i) => (
                      <div key={i} className="flex items-center gap-2 text-sm">
                        <Check className="w-4 h-4 flex-shrink-0" />
                        <span className="opacity-90">{feature}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* 操作按钮 */}
              <div className="flex gap-3">
                <button
                  onClick={onClose}
                  className="flex-1 px-4 py-3 rounded-xl border border-[var(--border-primary)] text-[var(--text-secondary)] hover:bg-[var(--bg-secondary)] transition-colors"
                >
                  稍后再说
                </button>
                <button
                  onClick={handleUpgrade}
                  className={`flex-1 px-4 py-3 rounded-xl bg-gradient-to-r ${gradientClass} text-white font-medium flex items-center justify-center gap-2 hover:opacity-90 transition-opacity`}
                >
                  <span>升级套餐</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>

              {/* 底部提示 */}
              <p className="mt-4 text-xs text-center text-[var(--text-muted)]">
                升级后立即生效，享受更多创作空间
              </p>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default UpgradePrompt;
