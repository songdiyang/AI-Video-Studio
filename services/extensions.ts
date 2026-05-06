/**
 * 扩展市场 API 服务
 */

import { getAuthToken } from './auth';

const API_BASE = '/api';

function getHeaders(): Record<string, string> {
  const token = getAuthToken();
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

async function fetchJson<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...options,
    headers: { ...getHeaders(), ...(options?.headers || {}) },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ message: res.statusText }));
    throw new Error(err.message || `HTTP ${res.status}`);
  }
  return res.json();
}

// ========== 扩展市场 ==========

export interface Extension {
  id: number;
  name: string;
  display_name: string;
  description: string;
  version: string;
  author: string;
  category: string;
  icon_url: string;
  download_count: number;
  rating: number;
  created_at: string;
  updated_at: string;
}

export interface ExtensionDetail extends Extension {
  readme: string;
  manifest: Record<string, any> | null;
  source_url: string;
}

export interface ExtensionVersion {
  id: number;
  version: string;
  changelog: string;
  created_at: string;
}

export function getExtensions(params?: {
  q?: string;
  category?: string;
  sort?: string;
  page?: number;
  limit?: number;
}): Promise<{ extensions: Extension[]; total: number; page: number; limit: number }> {
  const qs = new URLSearchParams();
  if (params?.q) qs.set('q', params.q);
  if (params?.category) qs.set('category', params.category);
  if (params?.sort) qs.set('sort', params.sort);
  if (params?.page) qs.set('page', String(params.page));
  if (params?.limit) qs.set('limit', String(params.limit));
  return fetchJson(`${API_BASE}/extensions?${qs.toString()}`);
}

export function getExtensionCategories(): Promise<{ categories: { category: string; count: number }[] }> {
  return fetchJson(`${API_BASE}/extensions/categories`);
}

export function getExtensionDetail(id: number): Promise<ExtensionDetail> {
  return fetchJson(`${API_BASE}/extensions/${id}`);
}

export function getExtensionVersions(id: number): Promise<{ versions: ExtensionVersion[] }> {
  return fetchJson(`${API_BASE}/extensions/${id}/versions`);
}

// ========== 用户扩展管理 ==========

export interface UserExtension {
  id: number;
  extension_id: number;
  installed_version: string;
  is_enabled: number;
  settings: Record<string, any> | null;
  installed_at: string;
  updated_at: string;
  name: string;
  display_name: string;
  description: string;
  latest_version: string;
  author: string;
  category: string;
  icon_url: string;
  manifest: Record<string, any> | null;
}

export function getUserExtensions(): Promise<{ extensions: UserExtension[] }> {
  return fetchJson(`${API_BASE}/user/extensions`);
}

export function getActiveExtensions(): Promise<{ extensions: UserExtension[] }> {
  return fetchJson(`${API_BASE}/user/extensions/active`);
}

export function installExtension(id: number): Promise<{ message: string; extension_id: number; version: string }> {
  return fetchJson(`${API_BASE}/user/extensions/${id}/install`, { method: 'POST' });
}

export function uninstallExtension(id: number): Promise<{ message: string }> {
  return fetchJson(`${API_BASE}/user/extensions/${id}`, { method: 'DELETE' });
}

export function toggleExtension(id: number, isEnabled: boolean): Promise<{ message: string; is_enabled: boolean }> {
  return fetchJson(`${API_BASE}/user/extensions/${id}/enable`, {
    method: 'PATCH',
    body: JSON.stringify({ is_enabled: isEnabled }),
  });
}

export function updateExtensionSettings(id: number, settings: Record<string, any>): Promise<{ message: string }> {
  return fetchJson(`${API_BASE}/user/extensions/${id}/settings`, {
    method: 'PUT',
    body: JSON.stringify({ settings }),
  });
}

// ========== 扩展发布 ==========

export interface PublishExtensionData {
  name: string;
  display_name: string;
  description?: string;
  version: string;
  category?: string;
  icon_url?: string;
  readme?: string;
  manifest?: Record<string, any>;
  source_url?: string;
}

export function publishExtension(data: PublishExtensionData): Promise<{ message: string; id: number }> {
  return fetchJson(`${API_BASE}/extensions`, {
    method: 'POST',
    body: JSON.stringify(data),
  });
}
