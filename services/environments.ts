/**
 * 环境（Environment）service
 *   GET    /api/environments        列表
 *   GET    /api/environments/:id    详情
 *   POST   /api/environments        创建
 *   PATCH  /api/environments/:id    更新
 *   DELETE /api/environments/:id    删除
 *   POST   /api/environments/:id/generate-image  氛围参考图生成
 */
import { getAuthToken } from './auth';

export interface Environment {
  id: number;
  user_id: number;
  project_id: number;
  name: string;
  description: string | null;
  time_of_day: string | null;
  weather: string | null;
  lighting: string | null;
  mood: string | null;
  image_url: string | null;
  generation_prompt: string | null;
  generation_status: 'pending' | 'generating' | 'completed' | 'failed';
  sort_order: number;
  created_at: string;
  updated_at: string;
}

function authHeaders() {
  const token = getAuthToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function handle<T>(resp: Response): Promise<T> {
  if (!resp.ok) {
    let msg = `请求失败：${resp.status}`;
    try {
      const j = await resp.json();
      if (j?.message) msg = j.message;
    } catch { /* ignore */ }
    throw new Error(msg);
  }
  return resp.json() as Promise<T>;
}

export async function listEnvironments(projectId?: number): Promise<Environment[]> {
  const qs = projectId ? `?projectId=${projectId}` : '';
  const resp = await fetch(`/api/environments${qs}`, { headers: { ...authHeaders() } });
  const data = await handle<{ environments: Environment[] }>(resp);
  return data.environments || [];
}

export async function getEnvironment(id: number): Promise<Environment> {
  const resp = await fetch(`/api/environments/${id}`, { headers: { ...authHeaders() } });
  const data = await handle<{ environment: Environment }>(resp);
  return data.environment;
}

export async function createEnvironment(payload: {
  projectId: number;
  name: string;
  description?: string;
  timeOfDay?: string;
  weather?: string;
  lighting?: string;
  mood?: string;
  sortOrder?: number;
}): Promise<Environment> {
  const resp = await fetch('/api/environments', {
    method: 'POST',
    headers: { ...authHeaders(), 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  const data = await handle<{ environment: Environment }>(resp);
  return data.environment;
}

export async function updateEnvironment(id: number, payload: {
  name?: string;
  description?: string | null;
  timeOfDay?: string | null;
  weather?: string | null;
  lighting?: string | null;
  mood?: string | null;
  imageUrl?: string | null;
  generationPrompt?: string | null;
  generationStatus?: Environment['generation_status'];
  sortOrder?: number;
}): Promise<Environment> {
  const resp = await fetch(`/api/environments/${id}`, {
    method: 'PATCH',
    headers: { ...authHeaders(), 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  const data = await handle<{ environment: Environment }>(resp);
  return data.environment;
}

export async function deleteEnvironment(id: number): Promise<void> {
  const resp = await fetch(`/api/environments/${id}`, {
    method: 'DELETE',
    headers: { ...authHeaders() }
  });
  await handle<{ message: string }>(resp);
}

export async function generateEnvironmentImage(id: number, payload: {
  imageModel: string;
  textModel?: string;
}): Promise<{ jobId: string; environmentId: number; status: string }> {
  const resp = await fetch(`/api/environments/${id}/generate-image`, {
    method: 'POST',
    headers: { ...authHeaders(), 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  return handle<{ jobId: string; environmentId: number; status: string }>(resp);
}
