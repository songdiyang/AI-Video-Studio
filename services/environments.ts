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
import type { EnvironmentVariant } from './environmentVariants';

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
  image_back_url: string | null;
  panorama_image_url: string | null;
  generation_prompt: string | null;
  generation_status: 'pending' | 'generating' | 'completed' | 'failed';
  terrain_type: string | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
  variants?: EnvironmentVariant[];
}

/** 将 terrain_type 字符串转换为数组 */
export function parseTerrainTypes(env: Environment): string[] {
  if (!env.terrain_type) return [];
  return env.terrain_type.split(',').filter(Boolean);
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
  terrainType?: string | null;
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
  mode?: 'front' | 'back' | 'both';
}): Promise<{ jobId: string; environmentId: number; status: string }> {
  const resp = await fetch(`/api/environments/${id}/generate-image`, {
    method: 'POST',
    headers: { ...authHeaders(), 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  return handle<{ jobId: string; environmentId: number; status: string }>(resp);
}

export async function generateEnvironmentPanorama(id: number, payload: {
  imageModel: string;
  textModel?: string;
}): Promise<{ jobId: string; environmentId: number; status: string; message?: string }> {
  const resp = await fetch(`/api/environments/${id}/generate-panorama`, {
    method: 'POST',
    headers: { ...authHeaders(), 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  return handle<{ jobId: string; environmentId: number; status: string; message?: string }>(resp);
}

export async function deleteEnvironmentPanorama(id: number): Promise<{ message: string }> {
  const resp = await fetch(`/api/environments/${id}/panorama`, {
    method: 'DELETE',
    headers: { ...authHeaders() }
  });
  return handle<{ message: string }>(resp);
}

export interface SanitizeDescriptionResult {
  message: string;
  total: number;
  changed: number;
  results: Array<{
    id: number;
    name: string;
    before: string;
    after: string;
    changed: boolean;
  }>;
}

/** 批量清洗项目下所有环境的描述（剔除角色与建筑描述） */
export async function sanitizeEnvironmentDescriptions(projectId: number): Promise<SanitizeDescriptionResult> {
  const resp = await fetch(`/api/environments/sanitize-descriptions`, {
    method: 'POST',
    headers: { ...authHeaders(), 'Content-Type': 'application/json' },
    body: JSON.stringify({ projectId })
  });
  return handle<SanitizeDescriptionResult>(resp);
}

/** 清洗单个环境的描述 */
export async function sanitizeEnvironmentDescription(id: number): Promise<{
  message: string;
  before: string;
  after: string;
  changed: boolean;
  environment: Environment;
}> {
  const resp = await fetch(`/api/environments/${id}/sanitize-description`, {
    method: 'POST',
    headers: { ...authHeaders() }
  });
  return handle<{
    message: string;
    before: string;
    after: string;
    changed: boolean;
    environment: Environment;
  }>(resp);
}

export interface TerrainRecognitionResult {
  message: string;
  environmentId: number;
  terrainTypes: string[];
  availableTypes: string[];
}

/** 识别单个环境的地貌类型 */
export async function recognizeEnvironmentTerrain(id: number): Promise<TerrainRecognitionResult> {
  const resp = await fetch(`/api/environments/${id}/recognize-terrain`, {
    method: 'POST',
    headers: { ...authHeaders() }
  });
  return handle<TerrainRecognitionResult>(resp);
}

export interface BatchTerrainRecognitionResult {
  message: string;
  total: number;
  changed: number;
  results: Array<{
    id: number;
    name: string;
    terrainTypes: string[];
    changed: boolean;
  }>;
}

/** 批量识别项目下所有环境的地貌类型 */
export async function recognizeAllEnvironmentTerrains(projectId: number): Promise<BatchTerrainRecognitionResult> {
  const resp = await fetch('/api/environments/recognize-all-terrains', {
    method: 'POST',
    headers: { ...authHeaders(), 'Content-Type': 'application/json' },
    body: JSON.stringify({ projectId })
  });
  return handle<BatchTerrainRecognitionResult>(resp);
}

/** 获取支持的所有地貌类型列表 */
export async function fetchTerrainTypes(): Promise<{ terrainTypes: string[]; total: number }> {
  const resp = await fetch('/api/environments/terrain-types', { headers: { ...authHeaders() } });
  return handle<{ terrainTypes: string[]; total: number }>(resp);
}
