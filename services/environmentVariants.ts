/**
 * 环境时间变体（EnvironmentVariant）service
 *   GET    /api/environment-variants               列表 ?environmentId=
 *   POST   /api/environment-variants               创建
 *   PATCH  /api/environment-variants/:id           更新
 *   DELETE /api/environment-variants/:id           删除
 *   POST   /api/environment-variants/:id/generate-panorama  生成全景图
 */
import { getAuthToken } from './auth';

export interface EnvironmentVariant {
  id: number;
  environment_id: number;
  time_of_day: string | null;
  weather: string | null;
  lighting: string | null;
  mood: string | null;
  image_url: string | null;
  panorama_image_url: string | null;
  faces: Record<string, string> | null;
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

export async function listEnvironmentVariants(environmentId: number): Promise<EnvironmentVariant[]> {
  const resp = await fetch(`/api/environment-variants?environmentId=${environmentId}`, {
    headers: { ...authHeaders() }
  });
  const data = await handle<{ variants: EnvironmentVariant[] }>(resp);
  return data.variants || [];
}

export async function createEnvironmentVariant(payload: {
  environmentId: number;
  timeOfDay: string;
  weather?: string;
  lighting?: string;
  mood?: string;
}): Promise<EnvironmentVariant> {
  const resp = await fetch('/api/environment-variants', {
    method: 'POST',
    headers: { ...authHeaders(), 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  const data = await handle<{ variant: EnvironmentVariant }>(resp);
  return data.variant;
}

export async function updateEnvironmentVariant(id: number, payload: {
  timeOfDay?: string | null;
  weather?: string | null;
  lighting?: string | null;
  mood?: string | null;
  imageUrl?: string | null;
  panoramaImageUrl?: string | null;
  generationStatus?: EnvironmentVariant['generation_status'];
}): Promise<EnvironmentVariant> {
  const resp = await fetch(`/api/environment-variants/${id}`, {
    method: 'PATCH',
    headers: { ...authHeaders(), 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  const data = await handle<{ variant: EnvironmentVariant }>(resp);
  return data.variant;
}

export async function deleteEnvironmentVariant(id: number): Promise<void> {
  const resp = await fetch(`/api/environment-variants/${id}`, {
    method: 'DELETE',
    headers: { ...authHeaders() }
  });
  await handle<{ message: string }>(resp);
}

export async function generateVariantPanorama(id: number, payload: {
  imageModel: string;
  textModel?: string;
}): Promise<{ jobId: string; variantId: number; environmentId: number; status: string }> {
  const resp = await fetch(`/api/environment-variants/${id}/generate-panorama`, {
    method: 'POST',
    headers: { ...authHeaders(), 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  return handle<{ jobId: string; variantId: number; environmentId: number; status: string }>(resp);
}

export async function generateVariantFaces(id: number, payload: {
  imageModel: string;
  textModel?: string;
}): Promise<{ jobId: string; variantId: number; environmentId: number; status: string; message: string }> {
  const resp = await fetch(`/api/environment-variants/${id}/generate-faces`, {
    method: 'POST',
    headers: { ...authHeaders(), 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  return handle<{ jobId: string; variantId: number; environmentId: number; status: string; message: string }>(resp);
}

/** 8方位定义，与后端 FACE_DEFS 一致 */
export const FACE_DEFS = [
  { key: 'front',       angle: 0,   label: '前(0°)' },
  { key: 'right',       angle: 60,  label: '右(60°)' },
  { key: 'back',        angle: 120, label: '后(120°)' },
  { key: 'left',        angle: 180, label: '左(180°)' },
  { key: 'right_front', angle: 240, label: '右前(240°)' },
  { key: 'left_front',  angle: 300, label: '左前(300°)' },
  { key: 'top',         angle: -1,  label: '天顶' },
  { key: 'bottom',      angle: -2,  label: '地面' },
] as const;
