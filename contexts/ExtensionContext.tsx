/**
 * ExtensionContext - 扩展运行时上下文
 * 管理已安装扩展的加载、激活、API 注入和生命周期
 */

import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { getActiveExtensions, UserExtension } from '../services/extensions';

// ========== 扩展 API 接口 ==========

export interface ExtensionStorageAPI {
  get(key: string): Promise<any>;
  set(key: string, value: any): Promise<void>;
}

export interface SidebarItemConfig {
  id: string;
  label: string;
  icon?: string;
  onClick: () => void;
}

export interface ExtensionUIAPI {
  registerSidebarItem(config: SidebarItemConfig): void;
  unregisterSidebarItem(id: string): void;
  showNotification(message: string, type?: 'info' | 'success' | 'warning' | 'error'): void;
}

export interface ExtensionWorkspaceAPI {
  getCurrentProject(): Promise<any | null>;
  onProjectChange(handler: (project: any | null) => void): () => void;
}

export interface ExtensionAPI {
  storage: ExtensionStorageAPI;
  ui: ExtensionUIAPI;
  workspace: ExtensionWorkspaceAPI;
  fetch(url: string, options?: RequestInit): Promise<Response>;
  on(event: string, handler: (...args: any[]) => void): void;
  off(event: string, handler: (...args: any[]) => void): void;
  emit(event: string, ...args: any[]): void;
}

// ========== 扩展实例 ==========

export interface LoadedExtension {
  id: number;
  name: string;
  display_name: string;
  version: string;
  manifest: Record<string, any> | null;
  settings: Record<string, any> | null;
  activate?: (api: ExtensionAPI) => void | Promise<void>;
  deactivate?: () => void | Promise<void>;
}

// ========== Context 类型 ==========

interface ExtensionContextValue {
  extensions: LoadedExtension[];
  isLoading: boolean;
  error: string | null;
  refreshExtensions: () => Promise<void>;
  sidebarItems: SidebarItemConfig[];
}

const ExtensionContext = createContext<ExtensionContextValue | null>(null);

export function useExtensions(): ExtensionContextValue {
  const ctx = useContext(ExtensionContext);
  if (!ctx) throw new Error('useExtensions must be used within ExtensionProvider');
  return ctx;
}

// ========== 事件总线 ==========

class EventBus {
  private listeners: Map<string, Set<(...args: any[]) => void>> = new Map();

  on(event: string, handler: (...args: any[]) => void) {
    if (!this.listeners.has(event)) this.listeners.set(event, new Set());
    this.listeners.get(event)!.add(handler);
  }

  off(event: string, handler: (...args: any[]) => void) {
    this.listeners.get(event)?.delete(handler);
  }

  emit(event: string, ...args: any[]) {
    this.listeners.get(event)?.forEach(h => {
      try { h(...args); } catch (e) { console.error(`[Extension] Event handler error for ${event}:`, e); }
    });
  }
}

// ========== Provider ==========

export const ExtensionProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [extensions, setExtensions] = useState<LoadedExtension[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sidebarItems, setSidebarItems] = useState<SidebarItemConfig[]>([]);
  const eventBus = useRef(new EventBus()).current;
  const extensionsRef = useRef<LoadedExtension[]>([]);

  // 保持 ref 同步
  useEffect(() => { extensionsRef.current = extensions; }, [extensions]);

  // 构建扩展 API
  const buildExtensionAPI = useCallback((ext: UserExtension): ExtensionAPI => {
    const storageKeyPrefix = `ext:${ext.name}:`;

    const storage: ExtensionStorageAPI = {
      get: async (key: string) => {
        const raw = localStorage.getItem(`${storageKeyPrefix}${key}`);
        if (raw === null) return undefined;
        try { return JSON.parse(raw); } catch { return raw; }
      },
      set: async (key: string, value: any) => {
        localStorage.setItem(`${storageKeyPrefix}${key}`, JSON.stringify(value));
      },
    };

    const ui: ExtensionUIAPI = {
      registerSidebarItem: (config: SidebarItemConfig) => {
        setSidebarItems(prev => {
          const filtered = prev.filter(i => i.id !== config.id);
          return [...filtered, config];
        });
      },
      unregisterSidebarItem: (id: string) => {
        setSidebarItems(prev => prev.filter(i => i.id !== id));
      },
      showNotification: (message: string, type: 'info' | 'success' | 'warning' | 'error' = 'info') => {
        // 通过事件总线通知 ToastContext
        eventBus.emit('notification', { message, type });
      },
    };

    const workspace: ExtensionWorkspaceAPI = {
      getCurrentProject: async () => {
        const raw = localStorage.getItem('current_project');
        return raw ? JSON.parse(raw) : null;
      },
      onProjectChange: (handler: (project: any | null) => void) => {
        const wrapped = () => {
          const raw = localStorage.getItem('current_project');
          handler(raw ? JSON.parse(raw) : null);
        };
        window.addEventListener('storage', wrapped);
        return () => window.removeEventListener('storage', wrapped);
      },
    };

    return {
      storage,
      ui,
      workspace,
      fetch: (url: string, options?: RequestInit) => fetch(url, options),
      on: (event: string, handler: (...args: any[]) => void) => eventBus.on(event, handler),
      off: (event: string, handler: (...args: any[]) => void) => eventBus.off(event, handler),
      emit: (event: string, ...args: any[]) => eventBus.emit(event, ...args),
    };
  }, [eventBus]);

  // 加载并激活扩展
  const loadExtensions = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const { extensions: userExts } = await getActiveExtensions();
      const loaded: LoadedExtension[] = [];

      for (const ue of userExts) {
        const ext: LoadedExtension = {
          id: ue.extension_id,
          name: ue.name,
          display_name: ue.display_name,
          version: ue.installed_version,
          manifest: ue.manifest,
          settings: ue.settings,
        };

        // 如果 manifest 指定了 main 脚本 URL，尝试动态加载
        if (ue.manifest?.main) {
          try {
            // 通过 import() 动态加载 ESM 模块
            const module = await import(/* @vite-ignore */ ue.manifest.main);
            if (module.activate) ext.activate = module.activate;
            if (module.deactivate) ext.deactivate = module.deactivate;
          } catch (e) {
            console.warn(`[Extension] Failed to load module for ${ue.name}:`, e);
          }
        }

        // 激活扩展
        if (ext.activate) {
          try {
            const api = buildExtensionAPI(ue);
            await ext.activate(api);
          } catch (e) {
            console.error(`[Extension] Activation failed for ${ue.name}:`, e);
          }
        }

        loaded.push(ext);
      }

      // 先停用旧扩展
      for (const oldExt of extensionsRef.current) {
        if (oldExt.deactivate) {
          try { await oldExt.deactivate(); } catch (e) { console.error(`[Extension] Deactivation error:`, e); }
        }
      }

      setExtensions(loaded);
    } catch (err: any) {
      setError(err.message || '加载扩展失败');
      console.error('[ExtensionContext] Load error:', err);
    } finally {
      setIsLoading(false);
    }
  }, [buildExtensionAPI]);

  useEffect(() => {
    loadExtensions();
    // 每 60 秒刷新一次扩展列表
    const interval = setInterval(loadExtensions, 60000);
    return () => clearInterval(interval);
  }, [loadExtensions]);

  return (
    <ExtensionContext.Provider value={{ extensions, isLoading, error, refreshExtensions: loadExtensions, sidebarItems }}>
      {children}
    </ExtensionContext.Provider>
  );
};
