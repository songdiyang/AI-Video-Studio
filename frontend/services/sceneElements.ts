import { getAuthToken } from './auth';

/**
 * 场景元素（影棚元素）service
 */

export interface SceneElement {
  id: number;
  user_id: number;
  project_id: number;
  category: 'building' | 'scenery';
  name: string;
  description: string | null;
  image_url: string | null;
  generation_prompt: string | null;
  generation_status: 'pending' | 'generating' | 'completed' | 'failed';
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface SceneElementLink {
  link_id: number;
  position_hint: string | null;
  sort_order: number;
  id: number;                 // element id
  name: string;
  category: 'building' | 'scenery';
  description: string | null;
  image_url: string | null;
  generation_status: SceneElement['generation_status'];
  generation_prompt: string | null;
  project_id: number;
}

function normalizeStorageUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  if (url.startsWith('/storage/')) return url;
  const m = url.match(/^https?:\/\/[^/]+\/nanostory\/(.+)$/);
  if (m) return `/storage/${m[1]}`;
  return url;
}

function normalizeElement<T extends { image_url?: string | null }>(el: T): T {
  if (!el) return el;
  if (el.image_url) (el as any).image_url = normalizeStorageUrl(el.image_url);
  return el;
}

function authHeaders(extra: Record<string, string> = {}): Record<string, string> {
  const token = getAuthToken();
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...extra,
  };
}

async function handleJson<T>(res: Response): Promise<T> {
  const text = await res.text();
  let data: any = null;
  try { data = text ? JSON.parse(text) : null; } catch { /* noop */ }
  if (!res.ok) {
    const msg = (data && (data.message || data.error)) || `HTTP ${res.status}`;
    throw new Error(msg);
  }
  return data as T;
}

// ============ CRUD ============

export async function listSceneElements(params: {
  projectId?: number;
  category?: 'building' | 'scenery';
}): Promise<SceneElement[]> {
  const q = new URLSearchParams();
  if (params.projectId) q.set('projectId', String(params.projectId));
  if (params.category) q.set('category', params.category);
  const res = await fetch(`/api/scene-elements?${q.toString()}`, {
    headers: authHeaders(),
  });
  const data = await handleJson<{ elements: SceneElement[] }>(res);
  return (data.elements || []).map(normalizeElement);
}

export async function getSceneElement(id: number): Promise<SceneElement> {
  const res = await fetch(`/api/scene-elements/${id}`, {
    headers: authHeaders(),
  });
  const data = await handleJson<{ element: SceneElement }>(res);
  return normalizeElement(data.element);
}

export async function createSceneElement(payload: {
  projectId: number;
  name: string;
  category?: 'building' | 'scenery';
  description?: string;
  sortOrder?: number;
}): Promise<SceneElement> {
  const res = await fetch('/api/scene-elements', {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify(payload),
  });
  const data = await handleJson<{ element: SceneElement }>(res);
  return normalizeElement(data.element);
}

export async function updateSceneElement(
  id: number,
  payload: Partial<{
    name: string;
    category: 'building' | 'scenery';
    description: string | null;
    sortOrder: number;
    imageUrl: string | null;
    generationStatus: SceneElement['generation_status'];
  }>
): Promise<SceneElement> {
  const res = await fetch(`/api/scene-elements/${id}`, {
    method: 'PATCH',
    headers: authHeaders(),
    body: JSON.stringify(payload),
  });
  const data = await handleJson<{ element: SceneElement }>(res);
  return normalizeElement(data.element);
}

export async function deleteSceneElement(id: number): Promise<void> {
  const res = await fetch(`/api/scene-elements/${id}`, {
    method: 'DELETE',
    headers: authHeaders(),
  });
  await handleJson(res);
}

// ============ 生成 ============

export async function generateSceneElementImage(
  id: number,
  body: { imageModel: string; textModel?: string }
): Promise<{ jobId: string | number; elementId: number; status: string }> {
  const res = await fetch(`/api/scene-elements/${id}/generate`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify(body),
  });
  return handleJson(res);
}

// ============ 场景关联（挂在 /api/scenes/:id 下） ============

export async function listSceneElementLinks(sceneId: number): Promise<SceneElementLink[]> {
  const res = await fetch(`/api/scenes/${sceneId}/elements`, {
    headers: authHeaders(),
  });
  const data = await handleJson<{ elements: SceneElementLink[] }>(res);
  return (data.elements || []).map(l => ({
    ...l,
    image_url: normalizeStorageUrl(l.image_url),
  })) as SceneElementLink[];
}

export async function addSceneElementLink(sceneId: number, body: {
  elementId: number;
  positionHint?: string;
  sortOrder?: number;
}): Promise<{ linkId: number }> {
  const res = await fetch(`/api/scenes/${sceneId}/elements`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify(body),
  });
  return handleJson(res);
}

export async function updateSceneElementLink(sceneId: number, elementId: number, body: {
  positionHint?: string;
  sortOrder?: number;
}): Promise<void> {
  const res = await fetch(`/api/scenes/${sceneId}/elements/${elementId}`, {
    method: 'PATCH',
    headers: authHeaders(),
    body: JSON.stringify(body),
  });
  await handleJson(res);
}

export async function removeSceneElementLink(sceneId: number, elementId: number): Promise<void> {
  const res = await fetch(`/api/scenes/${sceneId}/elements/${elementId}`, {
    method: 'DELETE',
    headers: authHeaders(),
  });
  await handleJson(res);
}

// ============ 抽取 ============

export async function extractSceneElements(sceneId: number, body: {
  textModel: string;
}): Promise<{ jobId: string | number; sceneId: number; status: string }> {
  const res = await fetch(`/api/scenes/${sceneId}/extract-elements`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify(body),
  });
  return handleJson(res);
}
