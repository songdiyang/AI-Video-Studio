/**
 * 积分不足拦截弹窗
 * 
 * 当用户尝试使用需要积分的功能但余额不足时显示。
 * 通过 PointsContext 的事件机制触发，展示差额并引导充值或升级套餐。
 */

import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, AlertTriangle, Coins, ArrowRight, Crown } from 'lucide-react';
import { usePoints, registerInsufficientPointsHandler, unregisterInsufficientPointsHandler, type InsufficientPointsDetail } from '../contexts/PointsContext';

const POINT_PURCHASE_PRICE = 0.02;

const InsufficientPointsModal: React.FC = () => {
  const { balance, openRechargeModal } = usePoints();
  const [isOpen, setIsOpen] = useState(false);
  const [detail, setDetail] = useState<InsufficientPointsDetail>({ required: 0, current: 0 });

  // 注册事件处理器
  const handleInsufficientPoints = useCallback((d: InsufficientPointsDetail) => {
    setDetail(d);
    setIsOpen(true);
  }, []);

  useEffect(() => {
    registerInsufficientPointsHandler(handleInsufficientPoints);
    return () => unregisterInsufficientPointsHandler();
  }, [handleInsufficientPoints]);

  const onClose = () => setIsOpen(false);

  const handleRecharge = () => {
    setIsOpen(false);
    openRechargeModal();
  };

  const handleUpgrade = () => {
    setIsOpen(false);
    window.location.href = '#/pricing';
  };

  const shortage = Math.max(0, detail.required - detail.current);
  const shortageCNY = (shortage * POINT_PURCHASE_PRICE).toFixed(2);

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          {/* 遮罩 */}
          <motion.div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={onClose}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          />

          {/* 弹窗 */}
          <motion.div
            className="relative w-full max-w-sm bg-[var(--bg-app)] rounded-2xl shadow-2xl overflow-hidden"
            initial={{ scale: 0.9, opacity: 0, y: 20 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.9, opacity: 0, y: 20 }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
          >
            {/* 顶部红色装饰 */}
            <div className="h-2 bg-linear-to-r from-red-500 to-orange-500" />

            {/* 关闭按钮 */}
            <button
              onClick={onClose}
              className="absolute top-4 right-4 p-2 rounded-full hover:bg-[var(--bg-card-hover)] transition-colors"
            >
              <X className="w-5 h-5 text-(--text-muted)" />
            </button>

            <div className="p-6">
              {/* 图标和标题 */}
              <div className="text-center mb-5">
                <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-red-100 dark:bg-red-900/30 mb-3">
                  <AlertTriangle className="w-7 h-7 text-red-500" />
                </div>
                <h2 className="text-xl font-bold text-(--text-primary) mb-1">积分不足</h2>
                <p className="text-sm text-(--text-muted)">
                  当前积分余额不足以完成此操作
                </p>
              </div>

              {/* 积分详情 */}
              <div className="mb-5 p-4 rounded-xl bg-[var(--bg-input)] space-y-2.5">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-(--text-muted)">需要积分</span>
                  <span className="font-semibold text-(--text-primary)">
                    {detail.required.toLocaleString()} 积分
                  </span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-(--text-muted)">当前余额</span>
                  <span className="font-semibold text-red-500">
                    {detail.current.toLocaleString()} 积分
                  </span>
                </div>
                <div className="border-t border-(--border-color) pt-2">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-(--text-muted)">还需充值</span>
                    <span className="font-bold text-amber-500">
                      {shortage.toLocaleString()} 积分（≈ ¥{shortageCNY}）
                    </span>
                  </div>
                </div>
              </div>

              {/* 操作按钮 */}
              <div className="space-y-2.5">
                <button
                  onClick={handleRecharge}
                  className="w-full py-3 rounded-xl bg-linear-to-r from-amber-500 to-orange-500 text-white font-semibold flex items-center justify-center gap-2 hover:opacity-90 transition-opacity"
                >
                  <Coins className="w-4 h-4" />
                  <span>立即充值积分</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
                <button
                  onClick={handleUpgrade}
                  className="w-full py-3 rounded-xl border border-[var(--border-color)] text-[var(--text-secondary)] font-medium flex items-center justify-center gap-2 hover:bg-[var(--bg-card-hover)] transition-colors"
                >
                  <Crown className="w-4 h-4 text-amber-500" />
                  <span>升级套餐</span>
                </button>
              </div>

              {/* 底部提示 */}
              <p className="mt-4 text-xs text-center text-(--text-muted)">
                升级套餐可获得更多月度积分，享受更大创作空间
              </p>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default InsufficientPointsModal;
