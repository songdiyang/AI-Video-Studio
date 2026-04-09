/**
 * 低余额警告横幅组件
 * 
 * 当积分余额低于阈值时在主内容区域顶部显示可关闭的警告条。
 * 每天最多显示一次（关闭后记录到 localStorage）。
 */

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { AlertTriangle, X, Coins, ArrowRight } from 'lucide-react';
import { usePoints } from '../contexts/PointsContext';

const DISMISS_KEY = 'low_balance_banner_dismissed';
const ONE_DAY_MS = 24 * 60 * 60 * 1000;

const LowBalanceBanner: React.FC = () => {
  const { balance, isLowBalance, loading, openRechargeModal } = usePoints();
  const [dismissed, setDismissed] = useState(true); // 默认隐藏，检查后再显示

  // 检查是否应该显示
  useEffect(() => {
    if (loading) return;
    if (!isLowBalance) {
      setDismissed(true);
      return;
    }

    try {
      const dismissedAt = localStorage.getItem(DISMISS_KEY);
      if (dismissedAt) {
        const elapsed = Date.now() - parseInt(dismissedAt, 10);
        if (elapsed < ONE_DAY_MS) {
          setDismissed(true);
          return;
        }
      }
    } catch {}

    setDismissed(false);
  }, [isLowBalance, loading]);

  const handleDismiss = () => {
    setDismissed(true);
    try {
      localStorage.setItem(DISMISS_KEY, String(Date.now()));
    } catch {}
  };

  const handleRecharge = () => {
    handleDismiss();
    openRechargeModal();
  };

  return (
    <AnimatePresence>
      {!dismissed && (
        <motion.div
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: 'auto', opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          transition={{ duration: 0.3, ease: 'easeInOut' }}
          className="overflow-hidden"
        >
          <div className="flex items-center justify-between gap-3 px-4 py-2.5 bg-amber-500/10 border-b border-amber-500/20">
            <div className="flex items-center gap-2.5 min-w-0">
              <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0" />
              <p className="text-xs text-amber-600 dark:text-amber-400 truncate">
                您的积分余额仅剩 <span className="font-bold">{balance.toLocaleString()}</span> 积分，可能不足以完成下一次 AI 创作
              </p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                onClick={handleRecharge}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-500 text-white text-xs font-medium hover:bg-amber-600 transition-colors"
              >
                <Coins className="w-3.5 h-3.5" />
                立即充值
              </button>
              <button
                onClick={handleDismiss}
                className="p-1 rounded-md text-amber-500 hover:bg-amber-500/10 transition-colors"
                aria-label="关闭提醒"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default LowBalanceBanner;
