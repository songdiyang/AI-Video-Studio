/**
 * ExtensionStorage - IndexedDB 存储层
 * 管理扩展包的本地存储：manifest、文件内容、启用状态
 */

const DB_NAME = 'nanostory_extensions';
const DB_VERSION = 1;
const STORE_PACKAGES = 'packages';
const STORE_REGISTRY = 'registry';

export interface ExtensionFile {
  path: string;
  content: string;
  type: 'js' | 'css' | 'json' | 'other';
}

export interface ExtensionPackage {
  name: string;
  manifest: Record<string, any>;
  files: ExtensionFile[];
  installedAt: number;
}

export interface ExtensionRegistryEntry {
  name: string;
  displayName: string;
  version: string;
  enabled: boolean;
  installedAt: number;
  updatedAt: number;
  category: string;
  description: string;
  author: string;
}

let dbPromise: Promise<IDBDatabase> | null = null;

function openDB(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onerror = () => reject(req.error);
    req.onsuccess = () => resolve(req.result);
    req.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_PACKAGES)) {
        db.createObjectStore(STORE_PACKAGES, { keyPath: 'name' });
      }
      if (!db.objectStoreNames.contains(STORE_REGISTRY)) {
        db.createObjectStore(STORE_REGISTRY, { keyPath: 'name' });
      }
    };
  });
  return dbPromise;
}

// ========== packages store ==========

export async function storeExtensionPackage(pkg: ExtensionPackage): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_PACKAGES, 'readwrite');
    const store = tx.objectStore(STORE_PACKAGES);
    const req = store.put(pkg);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

export async function getExtensionPackage(name: string): Promise<ExtensionPackage | undefined> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_PACKAGES, 'readonly');
    const store = tx.objectStore(STORE_PACKAGES);
    const req = store.get(name);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function deleteExtensionPackage(name: string): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_PACKAGES, 'readwrite');
    const store = tx.objectStore(STORE_PACKAGES);
    const req = store.delete(name);
    req.onerror = () => reject(req.error);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function listExtensionPackages(): Promise<ExtensionPackage[]> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_PACKAGES, 'readonly');
    const store = tx.objectStore(STORE_PACKAGES);
    const req = store.getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
}

// ========== registry store ==========

export async function registerExtension(entry: ExtensionRegistryEntry): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_REGISTRY, 'readwrite');
    const store = tx.objectStore(STORE_REGISTRY);
    const req = store.put(entry);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

export async function getRegistryEntry(name: string): Promise<ExtensionRegistryEntry | undefined> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_REGISTRY, 'readonly');
    const store = tx.objectStore(STORE_REGISTRY);
    const req = store.get(name);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function deleteRegistryEntry(name: string): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_REGISTRY, 'readwrite');
    const store = tx.objectStore(STORE_REGISTRY);
    const req = store.delete(name);
    req.onerror = () => reject(req.error);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function listRegistryEntries(): Promise<ExtensionRegistryEntry[]> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_REGISTRY, 'readonly');
    const store = tx.objectStore(STORE_REGISTRY);
    const req = store.getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
}

export async function toggleExtensionEnabled(name: string, enabled: boolean): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_REGISTRY, 'readwrite');
    const store = tx.objectStore(STORE_REGISTRY);
    const getReq = store.get(name);
    getReq.onsuccess = () => {
      const entry = getReq.result as ExtensionRegistryEntry | undefined;
      if (!entry) {
        reject(new Error(`Extension ${name} not found in registry`));
        return;
      }
      entry.enabled = enabled;
      entry.updatedAt = Date.now();
      const putReq = store.put(entry);
      putReq.onsuccess = () => resolve();
      putReq.onerror = () => reject(putReq.error);
    };
    getReq.onerror = () => reject(getReq.error);
  });
}

// ========== 组合操作 ==========

export async function installExtension(
  manifest: Record<string, any>,
  files: ExtensionFile[]
): Promise<void> {
  const name = manifest.name;
  if (!name) throw new Error('Manifest missing required field: name');

  const now = Date.now();
  const pkg: ExtensionPackage = {
    name,
    manifest,
    files,
    installedAt: now,
  };

  const entry: ExtensionRegistryEntry = {
    name,
    displayName: manifest.display_name || manifest.displayName || name,
    version: manifest.version || '0.0.0',
    enabled: true,
    installedAt: now,
    updatedAt: now,
    category: manifest.category || 'other',
    description: manifest.description || '',
    author: manifest.author || '',
  };

  await storeExtensionPackage(pkg);
  await registerExtension(entry);
}

export async function uninstallExtension(name: string): Promise<void> {
  await deleteExtensionPackage(name);
  await deleteRegistryEntry(name);
}

export async function isExtensionInstalled(name: string): Promise<boolean> {
  const entry = await getRegistryEntry(name);
  return !!entry;
}

export async function getEnabledExtensions(): Promise<ExtensionRegistryEntry[]> {
  const entries = await listRegistryEntries();
  return entries.filter(e => e.enabled);
}

export async function getAllLocalExtensions(): Promise<ExtensionRegistryEntry[]> {
  return listRegistryEntries();
}
