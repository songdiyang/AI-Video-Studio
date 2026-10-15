/**
 * ExtensionContext - 扩展运行时上下文
 * 管理已安装扩展的加载、激活、API 注入和生命周期
 * 支持从 IndexedDB 读取本地扩展包，动态加载 JS/CSS
 */

import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { getActiveExtensions, UserExtension } from '../services/extensions';
import {
  getEnabledExtensions,
  getExtensionPackage,
  listRegistryEntries,
  ExtensionRegistryEntry,
  uninstallExtension as uninstallLocalExtension,
  toggleExtensionEnabled,
} from '../utils/extensionStorage';

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

export interface ExtensionLanguageAPI {
  registerTranslations(code: string, name: string, translations: Record<string, any>): void;
  unregisterTranslations(code: string): void;
}

export interface ExtensionAPI {
  storage: ExtensionStorageAPI;
  ui: ExtensionUIAPI;
  workspace: ExtensionWorkspaceAPI;
  language: ExtensionLanguageAPI;
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
  deactivate?: (api: ExtensionAPI) => void | Promise<void>;
  blobUrls?: string[];
}

export interface LocalLoadedExtension {
  name: string;
  display_name: string;
  version: string;
  manifest: Record<string, any>;
  activate?: (api: ExtensionAPI) => void | Promise<void>;
  deactivate?: (api: ExtensionAPI) => void | Promise<void>;
  blobUrls?: string[];
}

// ========== Context 类型 ==========

interface ExtensionContextValue {
  extensions: LoadedExtension[];
  localExtensions: LocalLoadedExtension[];
  isLoading: boolean;
  error: string | null;
  refreshExtensions: () => Promise<void>;
  sidebarItems: SidebarItemConfig[];
  uninstallLocalExtension: (name: string) => Promise<void>;
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
  const [localExtensions, setLocalExtensions] = useState<LocalLoadedExtension[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sidebarItems, setSidebarItems] = useState<SidebarItemConfig[]>([]);
  const eventBus = useRef(new EventBus()).current;
  const extensionsRef = useRef<LoadedExtension[]>([]);
  const localExtensionsRef = useRef<LocalLoadedExtension[]>([]);

  // 保持 ref 同步
  useEffect(() => { extensionsRef.current = extensions; }, [extensions]);
  useEffect(() => { localExtensionsRef.current = localExtensions; }, [localExtensions]);

  // 构建扩展 API
  const buildExtensionAPI = useCallback((extName: string): ExtensionAPI => {
    const storageKeyPrefix = `ext:${extName}:`;

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

    const language: ExtensionLanguageAPI = {
      registerTranslations: (code: string, name: string, translations: Record<string, any>) => {
        console.log('[ExtensionAPI] registerTranslations:', code, name);
        window.dispatchEvent(new CustomEvent('language:register', { detail: { code, name, translations } }));
      },
      unregisterTranslations: (code: string) => {
        console.log('[ExtensionAPI] unregisterTranslations:', code);
        window.dispatchEvent(new CustomEvent('language:unregister', { detail: code }));
      },
    };

    return {
      storage,
      ui,
      workspace,
      language,
      fetch: (url: string, options?: RequestInit) => fetch(url, options),
      on: (event: string, handler: (...args: any[]) => void) => eventBus.on(event, handler),
      off: (event: string, handler: (...args: any[]) => void) => eventBus.off(event, handler),
      emit: (event: string, ...args: any[]) => eventBus.emit(event, ...args),
    };
  }, [eventBus]);

  // 加载本地扩展（从 IndexedDB）
  const loadLocalExtensions = useCallback(async () => {
    const enabled = await getEnabledExtensions();
    const loaded: LocalLoadedExtension[] = [];

    // 1. 先停用旧本地扩展（避免新扩展activate后被旧扩展deactivate覆盖）
    for (const oldExt of localExtensionsRef.current) {
      if (oldExt.deactivate) {
        try {
          const api = buildExtensionAPI(oldExt.name);
          await oldExt.deactivate(api);
        } catch (e) { console.error(`[Extension] Local deactivation error:`, e); }
      }
      // 清理 CSS
      document.querySelectorAll(`style[data-extension="${oldExt.name}"]`).forEach(el => el.remove());
      // 释放 Blob URL
      if (oldExt.blobUrls) {
        oldExt.blobUrls.forEach(url => URL.revokeObjectURL(url));
      }
    }

    for (const entry of enabled) {
      const pkg = await getExtensionPackage(entry.name);
      if (!pkg) continue;

      const ext: LocalLoadedExtension = {
        name: entry.name,
        display_name: entry.displayName,
        version: entry.version,
        manifest: pkg.manifest,
        blobUrls: [],
      };

      // 注入 CSS 文件
      for (const file of pkg.files) {
        if (file.type === 'css') {
          const style = document.createElement('style');
          style.textContent = file.content;
          style.dataset.extension = entry.name;
          document.head.appendChild(style);
        }
      }

      // 加载 JS 入口文件
      const mainFile = pkg.manifest.main;
      if (mainFile) {
        const jsFile = pkg.files.find(f => f.path === mainFile);
        if (jsFile) {
          try {
            const blob = new Blob([jsFile.content], { type: 'application/javascript' });
            const blobUrl = URL.createObjectURL(blob);
            ext.blobUrls = [blobUrl];
            const module = await import(/* @vite-ignore */ blobUrl);
            if (module.activate) ext.activate = module.activate;
            if (module.deactivate) ext.deactivate = module.deactivate;
          } catch (e) {
            console.warn(`[Extension] Failed to load local module for ${entry.name}:`, e);
          }
        }
      }

      // 激活扩展
      if (ext.activate) {
        try {
          const api = buildExtensionAPI(entry.name);
          await ext.activate(api);
        } catch (e) {
          console.error(`[Extension] Local activation failed for ${entry.name}:`, e);
        }
      }

      loaded.push(ext);
    }

    setLocalExtensions(loaded);
  }, [buildExtensionAPI]);

  // 同步后端扩展启用状态到本地 IndexedDB
  const syncBackendStateToLocal = useCallback(async (userExts: UserExtension[]) => {
    const backendEnabledMap = new Map(userExts.map(ue => [ue.name, ue.is_enabled === 1]));
    // 获取所有本地注册表条目
    const registryEntries = await listRegistryEntries();

    for (const entry of registryEntries) {
      const backendEnabled = backendEnabledMap.get(entry.name);
      if (backendEnabled !== undefined && entry.enabled !== backendEnabled) {
        console.log(`[Extension] Syncing ${entry.name}: local=${entry.enabled} -> backend=${backendEnabled}`);
        await toggleExtensionEnabled(entry.name, backendEnabled);
      }
    }
  }, []);

  // 加载并激活扩展（后端 + 本地）
  const loadExtensions = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      // 1. 加载后端扩展
      const { extensions: userExts } = await getActiveExtensions();
      const loaded: LoadedExtension[] = [];

      // 1.1 同步后端状态到本地 IndexedDB（以后端为准）
      await syncBackendStateToLocal(userExts);

      // 先停用旧扩展
      for (const oldExt of extensionsRef.current) {
        if (oldExt.deactivate) {
          try {
            const api = buildExtensionAPI(oldExt.name);
            await oldExt.deactivate(api);
          } catch (e) { console.error(`[Extension] Deactivation error:`, e); }
        }
      }

      for (const ue of userExts) {
        // 如果有 package_url，说明应该走本地 ZIP 加载流程，跳过直接 import
        if (ue.package_url) {
          console.log(`[Extension] Skipping backend load for ${ue.name}, will load via local ZIP flow`);
          continue;
        }

        const ext: LoadedExtension = {
          id: ue.extension_id,
          name: ue.name,
          display_name: ue.display_name,
          version: ue.installed_version,
          manifest: ue.manifest,
          settings: ue.settings,
        };

        if (ue.manifest?.main) {
          try {
            const module = await import(/* @vite-ignore */ ue.manifest.main);
            if (module.activate) ext.activate = module.activate;
            if (module.deactivate) ext.deactivate = module.deactivate;
          } catch (e) {
            console.warn(`[Extension] Failed to load module for ${ue.name}:`, e);
          }
        }

        if (ext.activate) {
          try {
            const api = buildExtensionAPI(ue.name);
            await ext.activate(api);
          } catch (e) {
            console.error(`[Extension] Activation failed for ${ue.name}:`, e);
          }
        }

        loaded.push(ext);
      }

      setExtensions(loaded);

      // 2. 加载本地 IndexedDB 扩展（已同步状态）
      await loadLocalExtensions();
    } catch (err: any) {
      setError(err.message || '加载扩展失败');
      console.error('[ExtensionContext] Load error:', err);
    } finally {
      setIsLoading(false);
    }
  }, [buildExtensionAPI, loadLocalExtensions, syncBackendStateToLocal]);

  // 内置扩展不再自动安装，用户需手动通过扩展市场上传安装
  const installBuiltinExtensions = useCallback(async () => {
    // 不再自动安装任何内置扩展
  }, []);

  // 卸载本地扩展（完整清理：deactivate + CSS + Blob URL + localStorage + IndexedDB）
  const handleUninstallLocal = useCallback(async (name: string) => {
    // 1. 找到已加载的扩展实例，调用 deactivate
    const loadedExt = localExtensionsRef.current.find(e => e.name === name);
    console.log('[Extension] Uninstalling:', name, 'loadedExt:', loadedExt, 'deactivate:', !!loadedExt?.deactivate);
    if (loadedExt?.deactivate) {
      try {
        const api = buildExtensionAPI(name);
        console.log('[Extension] Calling deactivate for:', name);
        await loadedExt.deactivate(api);
        console.log('[Extension] Deactivate completed for:', name);
      } catch (e) {
        console.error(`[Extension] Deactivate before uninstall failed for ${name}:`, e);
      }
    }

    // 2. 清理 CSS
    document.querySelectorAll(`style[data-extension="${name}"]`).forEach(el => el.remove());

    // 3. 释放 Blob URL
    if (loadedExt?.blobUrls) {
      loadedExt.blobUrls.forEach(url => URL.revokeObjectURL(url));
    }

    // 4. 清理 localStorage 中该扩展的数据
    const storagePrefix = `ext:${name}:`;
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const key = localStorage.key(i);
      if (key?.startsWith(storagePrefix)) {
        localStorage.removeItem(key);
      }
    }

    // 5. 从 IndexedDB 删除扩展数据
    try {
      console.log('[Extension] Deleting from IndexedDB:', name);
      await uninstallLocalExtension(name);
      console.log('[Extension] IndexedDB delete success:', name);
    } catch (e) {
      console.error('[Extension] IndexedDB delete failed:', name, e);
      throw e;
    }

    // 6. 从状态移除
    setLocalExtensions(prev => prev.filter(e => e.name !== name));

    // 7. 清理 sidebar items（如果该扩展注册了）
    setSidebarItems(prev => prev.filter(item => !item.id.startsWith(`${name}:`)));

    // 8. 如果是语言包扩展，重置语言为默认（中文）
    try {
      const savedLang = localStorage.getItem('nanostory-language');
      // 检查当前语言是否由该扩展提供（扩展名映射到语言代码）
      const langCode = loadedExt?.manifest?.language_code as string | undefined;
      if (savedLang && langCode && savedLang === langCode) {
        localStorage.setItem('nanostory-language', 'zh-CN');
        // 触发页面刷新以应用新语言
        window.location.reload();
      }
    } catch { /* ignore */ }
  }, [buildExtensionAPI]);

  useEffect(() => {
    // 先尝试安装内置扩展，然后加载所有扩展
    installBuiltinExtensions().then(() => loadExtensions());
    const interval = setInterval(loadExtensions, 60000);
    // 监听扩展刷新事件（如本地扩展启用/禁用后触发）
    const handleRefresh = () => loadExtensions();
    window.addEventListener('extensions:refresh', handleRefresh);
    return () => {
      clearInterval(interval);
      window.removeEventListener('extensions:refresh', handleRefresh);
    };
  }, [loadExtensions, installBuiltinExtensions]);

  return (
    <ExtensionContext.Provider value={{ extensions, localExtensions, isLoading, error, refreshExtensions: loadExtensions, sidebarItems, uninstallLocalExtension: handleUninstallLocal }}>
      {children}
    </ExtensionContext.Provider>
  );
};
