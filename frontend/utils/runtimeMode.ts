// 运行时模式判定
// 统一管理「桌面端 / 浏览器端」与「离线模式 / 在线模式」的判定，
// 供各服务与组件在离线一键启动时分流到本地通道。

import { useEffect, useState } from 'react';
import { isTauri } from '../services/localApi';

const OFFLINE_MODE_KEY = 'runtime_offline_mode';

/** 是否运行在 Tauri 桌面壳内 */
export function isDesktop(): boolean {
  return isTauri();
}

/**
 * 是否处于离线模式（不依赖 localhost:4001 后端）。
 * - 桌面端：默认开启离线模式（除非用户显式关闭）
 * - 浏览器端：默认关闭（走 Vite proxy 联调后端）
 */
export function isOfflineMode(): boolean {
  if (typeof localStorage === 'undefined') return isTauri();
  const stored = localStorage.getItem(OFFLINE_MODE_KEY);
  if (stored === '1') return true;
  if (stored === '0') return false;
  return isTauri();
}

/** 切换离线模式，并广播 runtimeModeChanged 事件供 UI 同步 */
export function setOfflineMode(enabled: boolean): void {
  if (typeof localStorage === 'undefined') return;
  localStorage.setItem(OFFLINE_MODE_KEY, enabled ? '1' : '0');
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('runtimeModeChanged', { detail: { offline: enabled } }));
  }
}

/** React Hook：订阅离线模式变化 */
export function useOfflineMode(): boolean {
  const [offline, setOffline] = useState<boolean>(() => isOfflineMode());
  useEffect(() => {
    const sync = () => setOffline(isOfflineMode());
    window.addEventListener('runtimeModeChanged', sync);
    window.addEventListener('storage', sync);
    return () => {
      window.removeEventListener('runtimeModeChanged', sync);
      window.removeEventListener('storage', sync);
    };
  }, []);
  return offline;
}
