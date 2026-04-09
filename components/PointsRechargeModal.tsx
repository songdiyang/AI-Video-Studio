/**
 * 积分充值弹窗组件
 * 
 * 提供多种积分套餐选择和自定义数量输入，
 * 与 UpgradePrompt（套餐升级）互补，专注于积分充值。
 */

import React, { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Zap, Coins, ArrowRight, Sparkles, ShieldCheck, Clock, Crown, Check } from 'lucide-react';
import { usePoints } from '../contexts/PointsContext';
import { useToast } from '../contexts/ToastContext';

// 积分充值售价
const POINT_PURCHASE_PRICE = 0.02;

// 积分套餐
const RECHARGE_PACKAGES = [
  { points: 100, price: 2, label: '体验包', tag: null },
  { points: 500, price: 10, label: '入门包', tag: null },
  { points: 1000, price: 20, label: '基础包', tag: null },
  { points: 5000, price: 100, label: '进阶包', tag: '热门' },
  { points: 10000, price: 200, label: '专业包', tag: null },
  { points: 50000, price: 1000, label: '旗舰包', tag: '最优惠' },
];

interface PointsRechargeModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const PointsRechargeModal: React.FC<PointsRechargeModalProps> = ({ isOpen, onClose }) => {
  const { balance, planDisplayName } = usePoints();
  const { showToast } = useToast();
  const [selectedPackage, setSelectedPackage] = useState(3); // 默认选中进阶包
  const [customPoints, setCustomPoints] = useState('');
  const [isCustom, setIsCustom] = useState(false);

  // 当前选择的积分数和价格
  const { selectedPoints, selectedPrice } = useMemo(() => {
    if (isCustom) {
      const pts = Math.max(0, parseInt(customPoints) || 0);
      return { selectedPoints: pts, selectedPrice: +(pts * POINT_PURCHASE_PRICE).toFixed(2) };
    }
    const pkg = RECHARGE_PACKAGES[selectedPackage];
    return { selectedPoints: pkg.points, selectedPrice: pkg.price };
  }, [isCustom, customPoints, selectedPackage]);

  const handleSelectPackage = (index: number) => {
    setSelectedPackage(index);
    setIsCustom(false);
  };

  const handleCustomFocus = () => {
    setIsCustom(true);
  };

  const handleRecharge = () => {
    if (selectedPoints <= 0) {
      showToast('请选择或输入有效的积分数量', 'warn');
      return;
    }
    // 跳转到支付页面（目前展示提示）
    showToast(`充值 ${selectedPoints.toLocaleString()} 积分（¥${selectedPrice}），支付功能即将上线`, 'info');
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
            className="relative w-full max-w-lg bg-(--bg-primary) rounded-2xl shadow-2xl overflow-hidden"
            initial={{ scale: 0.9, opacity: 0, y: 20 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.9, opacity: 0, y: 20 }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
          >
            {/* 顶部渐变装饰 */}
            <div className="h-2 bg-linear-to-r from-amber-400 via-orange-500 to-rose-500" />

            {/* 关闭按钮 */}
            <button
              onClick={onClose}
              className="absolute top-4 right-4 p-2 rounded-full hover:bg-(--bg-secondary) transition-colors z-10"
            >
              <X className="w-5 h-5 text-(--text-muted)" />
            </button>

            <div className="p-6">
              {/* 标题区域 */}
              <div className="text-center mb-5">
                <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-amber-100 dark:bg-amber-900/30 mb-3">
                  <Coins className="w-7 h-7 text-amber-500" />
                </div>
                <h2 className="text-xl font-bold text-(--text-primary) mb-1">积分充值</h2>
                <p className="text-sm text-(--text-muted)">
                  当前余额：<span className={`font-semibold ${balance < 100 ? 'text-red-500' : 'text-(--accent)'}`}>
                    {balance.toLocaleString()} 积分
                  </span>
                  <span className="mx-1.5">·</span>
                  ≈ ¥{(balance * POINT_PURCHASE_PRICE).toFixed(2)}
                </p>
              </div>

              {/* 积分套餐选择 */}
              <div className="grid grid-cols-3 gap-2.5 mb-4">
                {RECHARGE_PACKAGES.map((pkg, index) => (
                  <button
                    key={pkg.points}
                    onClick={() => handleSelectPackage(index)}
                    className={`relative p-3 rounded-xl border-2 transition-all duration-200 text-center
                      ${!isCustom && selectedPackage === index
                        ? 'border-(--accent) bg-(--accent)/5 shadow-md shadow-(--accent)/10'
                        : 'border-(--border-color) hover:border-(--accent)/40 hover:bg-(--bg-secondary)'
                      }`}
                  >
                    {/* 标签 */}
                    {pkg.tag && (
                      <span className={`absolute -top-2 left-1/2 -translate-x-1/2 px-2 py-0.5 rounded-full text-[10px] font-bold text-white
                        ${pkg.tag === '最优惠' ? 'bg-linear-to-r from-emerald-500 to-teal-500' : 'bg-linear-to-r from-(--accent) to-purple-600'}`}>
                        {pkg.tag}
                      </span>
                    )}
                    <div className="text-lg font-bold text-(--text-primary)">
                      {pkg.points >= 1000 ? `${pkg.points / 1000}k` : pkg.points}
                    </div>
                    <div className="text-xs text-(--text-muted) mb-1">{pkg.label}</div>
                    <div className="text-sm font-semibold text-amber-500">¥{pkg.price}</div>
                  </button>
                ))}
              </div>

              {/* 自定义数量 */}
              <div className="mb-5">
                <div className={`flex items-center gap-2 p-3 rounded-xl border-2 transition-all
                  ${isCustom ? 'border-(--accent) bg-(--accent)/5' : 'border-(--border-color)'}`}>
                  <Zap className="w-4 h-4 text-amber-500 shrink-0" />
                  <input
                    type="number"
                    placeholder="自定义积分数量（最少10积分）"
                    value={customPoints}
                    onChange={(e) => setCustomPoints(e.target.value)}
                    onFocus={handleCustomFocus}
                    min={10}
                    className="flex-1 bg-transparent text-sm text-(--text-primary) placeholder:text-(--text-muted) outline-none"
                  />
                  {isCustom && selectedPoints > 0 && (
                    <span className="text-sm font-semibold text-amber-500 shrink-0">
                      ¥{selectedPrice}
                    </span>
                  )}
                </div>
              </div>

              {/* 充值按钮 */}
              <button
                onClick={handleRecharge}
                disabled={selectedPoints <= 0}
                className="w-full py-3 rounded-xl bg-linear-to-r from-amber-500 to-orange-500 text-white font-semibold flex items-center justify-center gap-2 hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <span>
                  {selectedPoints > 0
                    ? `充值 ${selectedPoints.toLocaleString()} 积分 · ¥${selectedPrice}`
                    : '请选择充值积分'}
                </span>
                {selectedPoints > 0 && <ArrowRight className="w-4 h-4" />}
              </button>

              {/* 说明信息 */}
              <div className="mt-4 space-y-2">
                <div className="flex items-center gap-2 text-xs text-(--text-muted)">
                  <ShieldCheck className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                  <span>充值积分永久有效，不会每月重置</span>
                </div>
                <div className="flex items-center gap-2 text-xs text-(--text-muted)">
                  <Clock className="w-3.5 h-3.5 text-blue-500 shrink-0" />
                  <span>支付成功后积分即时到账</span>
                </div>
              </div>

              {/* 套餐升级入口 */}
              <div className="mt-4 p-3 rounded-xl bg-(--bg-secondary) flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Crown className="w-4 h-4 text-amber-500" />
                  <span className="text-xs text-(--text-secondary)">
                    当前套餐：<span className="font-medium">{planDisplayName}</span>
                  </span>
                </div>
                <a
                  href="#/pricing"
                  className="text-xs text-(--accent) hover:underline flex items-center gap-1"
                  onClick={onClose}
                >
                  升级套餐享更多积分
                  <Sparkles className="w-3 h-3" />
                </a>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default PointsRechargeModal;
