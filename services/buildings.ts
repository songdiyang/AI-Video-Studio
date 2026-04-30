/**
 * 建筑（Building）service
 *   GET    /api/buildings        列表
 *   GET    /api/buildings/:id    详情
 *   POST   /api/buildings        创建
 *   PATCH  /api/buildings/:id    更新
 *   DELETE /api/buildings/:id    删除
 *   POST   /api/buildings/:id/generate-image  建筑结构图生成
 */
import { getAuthToken } from './auth';

export interface Building {
  id: number;
  user_id: number;
  project_id: number;
  name: string;
  description: string | null;
  interior_exterior: 'interior' | 'exterior' | 'both';
  structure_type: string | null;
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

export async function listBuildings(projectId?: number, interiorExterior?: string): Promise<Building[]> {
  const params = new URLSearchParams();
  if (projectId) params.set('projectId', String(projectId));
  if (interiorExterior) params.set('interiorExterior', interiorExterior);
  const qs = params.toString();
  const resp = await fetch(`/api/buildings${qs ? '?' + qs : ''}`, { headers: { ...authHeaders() } });
  const data = await handle<{ buildings: Building[] }>(resp);
  return data.buildings || [];
}

export async function getBuilding(id: number): Promise<Building> {
  const resp = await fetch(`/api/buildings/${id}`, { headers: { ...authHeaders() } });
  const data = await handle<{ building: Building }>(resp);
  return data.building;
}

export async function createBuilding(payload: {
  projectId: number;
  name: string;
  description?: string;
  interiorExterior?: 'interior' | 'exterior' | 'both';
  structureType?: string;
  sortOrder?: number;
}): Promise<Building> {
  const resp = await fetch('/api/buildings', {
    method: 'POST',
    headers: { ...authHeaders(), 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  const data = await handle<{ building: Building }>(resp);
  return data.building;
}

export async function updateBuilding(id: number, payload: {
  name?: string;
  description?: string | null;
  interiorExterior?: 'interior' | 'exterior' | 'both';
  structureType?: string | null;
  imageUrl?: string | null;
  generationPrompt?: string | null;
  generationStatus?: Building['generation_status'];
  sortOrder?: number;
}): Promise<Building> {
  const resp = await fetch(`/api/buildings/${id}`, {
    method: 'PATCH',
    headers: { ...authHeaders(), 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  const data = await handle<{ building: Building }>(resp);
  return data.building;
}

export async function deleteBuilding(id: number): Promise<void> {
  const resp = await fetch(`/api/buildings/${id}`, {
    method: 'DELETE',
    headers: { ...authHeaders() }
  });
  await handle<{ message: string }>(resp);
}

export async function generateBuildingImage(id: number, payload: {
  imageModel: string;
  textModel?: string;
}): Promise<{ jobId: string; buildingId: number; status: string }> {
  const resp = await fetch(`/api/buildings/${id}/generate-image`, {
    method: 'POST',
    headers: { ...authHeaders(), 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  return handle<{ jobId: string; buildingId: number; status: string }>(resp);
}
