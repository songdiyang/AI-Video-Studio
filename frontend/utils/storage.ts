/**
 * 统一 localStorage 访问层
 * 
 * 提供类型安全、带前缀、可序列化的 localStorage 访问
 */

/** 存储键前缀，避免冲突 */
const PREFIX = 'aivs_';

/** 存储键常量 */
export const STORAGE_KEYS = {
  // AI 配置
  AI_MODEL_CONFIGS: 'ai_model_configs',
  AI_ASSISTANT_SETTINGS: 'ai_assistant_settings_v1',
  
  // 项目
  LOCAL_PROJECTS: 'local_projects',
  ACTIVE_PROJECT: 'active_project',
  
  // 设置
  APP_SETTINGS: 'app_settings',
  THEME: 'theme',
  LANGUAGE: 'language',
  
  // 面板状态
  PANEL_SIZES: 'panel_sizes',
  SIDEBAR_STATE: 'sidebar_state',
  
  // 运行时
  RUNTIME_MODE: 'runtime_offline_mode',
  
  // 缓存
  MEDIA_CACHE: 'media_cache',
  
  // 临时数据
  DRAFT_PREFIX: 'draft_',
} as const;

export type StorageKey = keyof typeof STORAGE_KEYS;

/**
 * 获取带前缀的完整键名
 */
function getFullKey(key: string): string {
  return key.startsWith(PREFIX) ? key : `${PREFIX}${key}`;
}

/**
 * 序列化值
 */
function serialize<T>(value: T): string {
  if (typeof value === 'string') return value;
  return JSON.stringify(value);
}

/**
 * 反序列化值
 */
function deserialize<T>(value: string | null, defaultValue: T): T {
  if (value === null) return defaultValue;
  try {
    return JSON.parse(value) as T;
  } catch {
    return value as unknown as T;
  }
}

/**
 * 类型安全的 localStorage 访问
 */
export const storage = {
  /**
   * 获取值
   */
  get<T>(key: StorageKey | string, defaultValue: T): T {
    if (typeof localStorage === 'undefined') return defaultValue;
    const fullKey = getFullKey(key);
    const value = localStorage.getItem(fullKey);
    return deserialize(value, defaultValue);
  },

  /**
   * 设置值
   */
  set<T>(key: StorageKey | string, value: T): void {
    if (typeof localStorage === 'undefined') return;
    const fullKey = getFullKey(key);
    localStorage.setItem(fullKey, serialize(value));
  },

  /**
   * 删除值
   */
  remove(key: StorageKey | string): void {
    if (typeof localStorage === 'undefined') return;
    const fullKey = getFullKey(key);
    localStorage.removeItem(fullKey);
  },

  /**
   * 检查键是否存在
   */
  has(key: StorageKey | string): boolean {
    if (typeof localStorage === 'undefined') return false;
    const fullKey = getFullKey(key);
    return localStorage.getItem(fullKey) !== null;
  },

  /**
   * 获取所有键（带前缀）
   */
  keys(): string[] {
    if (typeof localStorage === 'undefined') return [];
    const keys: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key?.startsWith(PREFIX)) {
        keys.push(key.slice(PREFIX.length));
      }
    }
    return keys;
  },

  /**
   * 清空所有带前缀的键
   */
  clear(): void {
    if (typeof localStorage === 'undefined') return;
    const keys = this.keys();
    keys.forEach((key) => this.remove(key));
  },

  /**
   * 获取字符串值（不解析 JSON）
   */
  getString(key: StorageKey | string, defaultValue = ''): string {
    if (typeof localStorage === 'undefined') return defaultValue;
    const fullKey = getFullKey(key);
    return localStorage.getItem(fullKey) ?? defaultValue;
  },

  /**
   * 设置字符串值（不序列化）
   */
  setString(key: StorageKey | string, value: string): void {
    if (typeof localStorage === 'undefined') return;
    const fullKey = getFullKey(key);
    localStorage.setItem(fullKey, value);
  },

  /**
   * 获取数字值
   */
  getNumber(key: StorageKey | string, defaultValue = 0): number {
    const value = this.getString(key);
    const num = Number(value);
    return isNaN(num) ? defaultValue : num;
  },

  /**
   * 设置数字值
   */
  setNumber(key: StorageKey | string, value: number): void {
    this.setString(key, String(value));
  },

  /**
   * 获取布尔值
   */
  getBoolean(key: StorageKey | string, defaultValue = false): boolean {
    const value = this.getString(key);
    if (value === 'true' || value === '1') return true;
    if (value === 'false' || value === '0') return false;
    return defaultValue;
  },

  /**
   * 设置布尔值
   */
  setBoolean(key: StorageKey | string, value: boolean): void {
    this.setString(key, value ? '1' : '0');
  },
};

/**
 * 带命名空间的存储
 * 
 * @example
 * ```typescript
 * const projectStorage = createNamespacedStorage('project_123');
 * projectStorage.set('settings', { theme: 'dark' });
 * ```
 */
export function createNamespacedStorage(namespace: string) {
  const ns = namespace.endsWith('_') ? namespace : `${namespace}_`;
  
  return {
    get<T>(key: string, defaultValue: T): T {
      return storage.get(`${ns}${key}`, defaultValue);
    },
    set<T>(key: string, value: T): void {
      storage.set(`${ns}${key}`, value);
    },
    remove(key: string): void {
      storage.remove(`${ns}${key}`);
    },
    has(key: string): boolean {
      return storage.has(`${ns}${key}`);
    },
  };
}

/**
 * 订阅存储变化
 */
export function subscribeToStorage(
  key: StorageKey | string,
  callback: (newValue: unknown) => void
): () => void {
  const fullKey = getFullKey(key);
  
  const handler = (e: StorageEvent) => {
    if (e.key === fullKey) {
      callback(e.newValue ? deserialize(e.newValue, null) : null);
    }
  };
  
  window.addEventListener('storage', handler);
  return () => window.removeEventListener('storage', handler);
}

// 兼容旧 API
export const getStorageItem = storage.get;
export const setStorageItem = storage.set;
export const removeStorageItem = storage.remove;
