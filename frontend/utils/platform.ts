/**
 * 平台适配层
 * 
 * 统一管理桌面端（Tauri）与浏览器端的差异，
 * 提供语义化的平台检测和能力判断接口。
 */

import { isTauri } from '../services/localApi';

// ==================== 平台检测 ====================

/** 是否运行在 Tauri 桌面壳内 */
export function isDesktop(): boolean {
  return isTauri();
}

/** 是否运行在浏览器内 */
export function isBrowser(): boolean {
  return !isTauri();
}

/** 是否支持文件系统访问 */
export function hasFileSystemAccess(): boolean {
  return isDesktop();
}

/** 是否支持原生对话框 */
export function hasNativeDialogs(): boolean {
  return isDesktop();
}

/** 是否支持本地存储（localStorage） */
export function hasLocalStorage(): boolean {
  return typeof localStorage !== 'undefined';
}

/** 是否支持 WebSocket */
export function hasWebSocket(): boolean {
  return typeof WebSocket !== 'undefined';
}

// ==================== 运行时模式 ====================

const OFFLINE_MODE_KEY = 'runtime_offline_mode';

/**
 * 是否处于离线模式（不依赖后端服务）
 * - 桌面端：默认开启离线模式（除非用户显式关闭）
 * - 浏览器端：默认关闭（走 Vite proxy 联调后端）
 */
export function isOfflineMode(): boolean {
  if (!hasLocalStorage()) return isDesktop();
  const stored = localStorage.getItem(OFFLINE_MODE_KEY);
  if (stored === '1') return true;
  if (stored === '0') return false;
  return isDesktop();
}

/** 切换离线模式，并广播 runtimeModeChanged 事件供 UI 同步 */
export function setOfflineMode(enabled: boolean): void {
  if (!hasLocalStorage()) return;
  localStorage.setItem(OFFLINE_MODE_KEY, enabled ? '1' : '0');
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('runtimeModeChanged', { detail: { offline: enabled } }));
  }
}

// ==================== 平台能力 ====================

/** 平台能力集合 */
export interface PlatformCapabilities {
  /** 文件系统访问 */
  fileSystem: boolean;
  /** 原生对话框 */
  nativeDialogs: boolean;
  /** 本地存储 */
  localStorage: boolean;
  /** WebSocket */
  webSocket: boolean;
  /** 离线模式 */
  offlineMode: boolean;
  /** 桌面端 */
  desktop: boolean;
  /** 浏览器端 */
  browser: boolean;
}

/** 获取当前平台能力 */
export function getPlatformCapabilities(): PlatformCapabilities {
  return {
    fileSystem: hasFileSystemAccess(),
    nativeDialogs: hasNativeDialogs(),
    localStorage: hasLocalStorage(),
    webSocket: hasWebSocket(),
    offlineMode: isOfflineMode(),
    desktop: isDesktop(),
    browser: isBrowser(),
  };
}

// ==================== 平台特定操作 ====================

/** 平台特定操作接口 */
export interface PlatformOperations {
  /** 选择文件 */
  selectFile(options?: {
    title?: string;
    filters?: { name: string; extensions: string[] }[];
    multiple?: boolean;
  }): Promise<string | string[] | null>;
  
  /** 选择目录 */
  selectDirectory(options?: {
    title?: string;
  }): Promise<string | null>;
  
  /** 在文件管理器中显示 */
  showInExplorer(path: string): Promise<void>;
  
  /** 打开文件 */
  openFile(path: string): Promise<void>;
}

/** 获取平台特定操作 */
export async function getPlatformOperations(): Promise<PlatformOperations> {
  if (isDesktop()) {
    const { open } = await import('@tauri-apps/plugin-dialog');
    const { invoke } = await import('@tauri-apps/api/core');
    
    return {
      async selectFile(options = {}) {
        const result = await open({
          title: options.title,
          filters: options.filters,
          multiple: options.multiple ?? false,
        });
        return result as string | string[] | null;
      },
      
      async selectDirectory(options = {}) {
        const result = await open({
          title: options.title,
          directory: true,
        });
        return result as string | null;
      },
      
      async showInExplorer(path: string) {
        await invoke('show_in_explorer', { path });
      },
      
      async openFile(path: string) {
        await invoke('open_file', { path });
      },
    };
  }
  
  // 浏览器端降级实现
  return {
    async selectFile() {
      console.warn('[Platform] 浏览器端不支持文件选择');
      return null;
    },
    async selectDirectory() {
      console.warn('[Platform] 浏览器端不支持目录选择');
      return null;
    },
    async showInExplorer() {
      console.warn('[Platform] 浏览器端不支持文件管理器操作');
    },
    async openFile() {
      console.warn('[Platform] 浏览器端不支持打开文件');
    },
  };
}

// ==================== React Hooks ====================

import { useEffect, useState } from 'react';

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

/** React Hook：获取平台能力 */
export function usePlatformCapabilities(): PlatformCapabilities {
  const [capabilities] = useState<PlatformCapabilities>(() => getPlatformCapabilities());
  return capabilities;
}

/** React Hook：判断是否为桌面端 */
export function useIsDesktop(): boolean {
  const [desktop] = useState<boolean>(() => isDesktop());
  return desktop;
}

// ==================== 兼容旧 API ====================

export { isTauri };
