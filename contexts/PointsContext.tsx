/**
 * 全局积分状态管理 Context
 * 
 * 提供积分余额的全局状态、低余额提醒、WebSocket 实时更新、到期提醒等功能。
 * 在 App.tsx 的 Provider 树中使用 <PointsProvider> 包裹。
 */

import React, { createContext, useContext, useState, useCallback, useEffect, useRef, ReactNode } from 'react';
import { fetchBalance, type BalanceInfo, type ResourcePack, fetchResourcePacks } from '../services/billing';
import { getAuthToken } from '../services/auth';
import { useToast } from './ToastContext';

// ============================================================
// 积分不足事件系统（用于跨组件通信）
// ============================================================

export interface InsufficientPointsDetail {
  required: number;
  current: number;
}

type InsufficientPointsHandler = (detail: InsufficientPointsDetail) => void;

let insufficientPointsHandler: InsufficientPointsHandler | null = null;

/** 注册积分不足事件处理器（由 InsufficientPointsModal 注册） */
export function registerInsufficientPointsHandler(handler: InsufficientPointsHandler) {
  insufficientPointsHandler = handler;
}

/** 取消注册 */
export function unregisterInsufficientPointsHandler() {
  insufficientPointsHandler = null;
}

/** 触发积分不足弹窗 */
export function triggerInsufficientPoints(detail: InsufficientPointsDetail) {
  insufficientPointsHandler?.(detail);
}

// ============================================================
// Context 类型定义
// ============================================================

interface PointsContextType {
  /** 当前积分余额 */
  balance: number;
  /** 月度积分配额（-1 表示无限） */
  monthlyQuota: number;
  /** 本月已使用积分 */
  monthlyUsed: number;
  /** 当前套餐名 */
  planName: string;
  /** 当前套餐显示名 */
  planDisplayName: string;
  /** 套餐到期时间 */
  periodEnd: string | null;
  /** 是否正在加载 */
  loading: boolean;
  /** 低余额阈值 */
  lowBalanceThreshold: number;
  /** 是否低余额 */
  isLowBalance: boolean;
  /** 余额等价人民币（充值价格） */
  balanceAsCNY: number;
  /** 刷新余额 */
  refreshBalance: () => Promise<void>;
  /** 直接更新余额（WebSocket 推送用） */
  updateBalance: (newBalance: number, deducted?: number) => void;
  /** 打开充值弹窗 */
  openRechargeModal: () => void;
  /** 关闭充值弹窗 */
  closeRechargeModal: () => void;
  /** 充值弹窗是否打开 */
  isRechargeModalOpen: boolean;
  /** 资源包列表 */
  resourcePacks: ResourcePack[];
}

const PointsContext = createContext<PointsContextType | null>(null);

export const usePoints = () => {
  const context = useContext(PointsContext);
  if (!context) {
    throw new Error('usePoints must be used within a PointsProvider');
  }
  return context;
};

// ============================================================
// Provider
// ============================================================

const LOW_BALANCE_THRESHOLD = 100;
const POINT_PURCHASE_PRICE = 0.02;
// 到期提醒：7天内
const EXPIRY_WARNING_DAYS = 7;

interface PointsProviderProps {
  children: ReactNode;
}

export const PointsProvider: React.FC<PointsProviderProps> = ({ children }) => {
  const { showToast } = useToast();

  const [balance, setBalance] = useState(0);
  const [monthlyQuota, setMonthlyQuota] = useState(2000);
  const [monthlyUsed, setMonthlyUsed] = useState(0);
  const [planName, setPlanName] = useState('free');
  const [planDisplayName, setPlanDisplayName] = useState('免费版');
  const [periodEnd, setPeriodEnd] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [isRechargeModalOpen, setIsRechargeModalOpen] = useState(false);
  const [resourcePacks, setResourcePacks] = useState<ResourcePack[]>([]);

  const prevBalanceRef = useRef<number | null>(null);
  const expiryWarnedRef = useRef(false);

  const isLowBalance = balance >= 0 && balance < LOW_BALANCE_THRESHOLD;
  const balanceAsCNY = balance * POINT_PURCHASE_PRICE;

  // 获取余额
  const refreshBalance = useCallback(async () => {
    const token = getAuthToken();
    if (!token) {
      setLoading(false);
      return;
    }

    try {
      const data: BalanceInfo = await fetchBalance();
      setBalance(data.balance);
      setMonthlyQuota(data.monthlyQuota);
      setMonthlyUsed(data.monthlyUsed);
      setPlanName(data.planName);
      setPlanDisplayName(data.planDisplayName);
      setPeriodEnd(data.periodEnd);

      // 低余额横幅和toast已移除，改为仅在任务执行时检测积分不足
      prevBalanceRef.current = data.balance;

      // 到期提醒（每次会话只提醒一次）
      if (!expiryWarnedRef.current && data.periodEnd && data.planName !== 'free') {
        const daysLeft = Math.ceil((new Date(data.periodEnd).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
        if (daysLeft > 0 && daysLeft <= EXPIRY_WARNING_DAYS) {
          expiryWarnedRef.current = true;
          showToast(
            `您的${data.planDisplayName}将于 ${daysLeft} 天后到期，月度积分将重置，建议尽快使用`,
            'warn'
          );
        }
      }

      // 获取资源包列表
      try {
        const packsData = await fetchResourcePacks();
        setResourcePacks(packsData.packs);

        // 资源包到期提醒
        if (!expiryWarnedRef.current) {
          for (const pack of packsData.packs) {
            if (!pack.isActive) continue;
            const daysLeft = Math.ceil((new Date(pack.periodEnd).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
            if (daysLeft > 0 && daysLeft <= EXPIRY_WARNING_DAYS) {
              expiryWarnedRef.current = true;
              showToast(
                `资源包「${pack.name}」将于 ${daysLeft} 天后月末到期，剩余 ${pack.remainingPoints} 积分将清零`,
                'warn'
              );
              break; // 只提醒一次
            }
          }
        }
      } catch (err) {
        console.warn('[PointsContext] 获取资源包列表失败:', err);
      }
    } catch (err) {
      console.error('[PointsContext] 获取余额失败:', err);
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  // WebSocket 推送更新
  const updateBalance = useCallback((newBalance: number, deducted?: number) => {
    setBalance(newBalance);
    prevBalanceRef.current = newBalance;

    if (deducted && deducted > 0) {
      showToast(`-${deducted} 积分，余额 ${newBalance.toLocaleString()}`, 'info');
    }

    // 低余额toast已移除，改为仅在任务执行时检测积分不足
  }, [showToast]);

  // 充值弹窗控制
  const openRechargeModal = useCallback(() => setIsRechargeModalOpen(true), []);
  const closeRechargeModal = useCallback(() => setIsRechargeModalOpen(false), []);

  // 初始化 + 定时刷新（每60秒）
  useEffect(() => {
    refreshBalance();
    const timer = setInterval(refreshBalance, 60000);
    return () => clearInterval(timer);
  }, [refreshBalance]);

  // 监听登录/登出事件
  useEffect(() => {
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === 'auth_token') {
        if (e.newValue) {
          refreshBalance();
        } else {
          setBalance(0);
          setLoading(false);
        }
      }
    };
    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, [refreshBalance]);

  const value: PointsContextType = {
    balance,
    monthlyQuota,
    monthlyUsed,
    planName,
    planDisplayName,
    periodEnd,
    loading,
    lowBalanceThreshold: LOW_BALANCE_THRESHOLD,
    isLowBalance,
    balanceAsCNY,
    refreshBalance,
    updateBalance,
    openRechargeModal,
    closeRechargeModal,
    isRechargeModalOpen,
    resourcePacks,
  };

  return (
    <PointsContext.Provider value={value}>
      {children}
    </PointsContext.Provider>
  );
};
