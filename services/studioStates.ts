import { getAuthToken } from './auth';

export interface StudioState {
  id: number;
  user_id: number;
  project_id: number;
  studio_id: number;
  name: string;
  description?: string | null;
  time_of_day?: string | null;
  weather?: string | null;
  lighting?: string | null;
  mood?: string | null;
  image_url?: string | null;
  generation_prompt?: string | null;
  generation_status?: 'pending' | 'generating' | 'completed' | 'failed';
  sort_order?: number;
  created_at?: string;
  updated_at?: string;
  studio_name?: string;
}

function authHeaders(): Record<string, string> {
  const token = getAuthToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function handle<T>(resp: Response): Promise<T> {
  if (!resp.ok) {
    let msg = `${resp.status}`;
    try {
      const body = await resp.json();
      msg = body?.message || msg;
    } catch {}
    throw new Error(msg);
  }
  return resp.json() as Promise<T>;
}

export async function listStudioStates(params: { projectId?: number; studioId?: number } = {}): Promise<StudioState[]> {
  const search = new URLSearchParams();
  if (params.projectId) search.set('projectId', String(params.projectId));
  if (params.studioId)  search.set('studioId',  String(params.studioId));
  const resp = await fetch(`/api/studio-states?${search.toString()}`, { headers: { ...authHeaders() } });
  const data = await handle<{ studioStates: StudioState[] }>(resp);
  return data.studioStates;
}

export async function getStudioState(id: number): Promise<StudioState> {
  const resp = await fetch(`/api/studio-states/${id}`, { headers: { ...authHeaders() } });
  const data = await handle<{ studioState: StudioState }>(resp);
  return data.studioState;
}

export async function createStudioState(payload: {
  projectId: number;
  studioId: number;
  name: string;
  description?: string;
  timeOfDay?: string;
  weather?: string;
  lighting?: string;
  mood?: string;
  imageUrl?: string;
}): Promise<StudioState> {
  const resp = await fetch('/api/studio-states', {
    method: 'POST',
    headers: { ...authHeaders(), 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  const data = await handle<{ studioState: StudioState }>(resp);
  return data.studioState;
}

export async function updateStudioState(id: number, payload: Partial<{
  name: string;
  description: string;
  timeOfDay: string;
  weather: string;
  lighting: string;
  mood: string;
  imageUrl: string;
  sortOrder: number;
}>): Promise<StudioState> {
  const resp = await fetch(`/api/studio-states/${id}`, {
    method: 'PATCH',
    headers: { ...authHeaders(), 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  const data = await handle<{ studioState: StudioState }>(resp);
  return data.studioState;
}

export async function deleteStudioState(id: number): Promise<void> {
  const resp = await fetch(`/api/studio-states/${id}`, {
    method: 'DELETE',
    headers: { ...authHeaders() }
  });
  await handle<{ message: string }>(resp);
}
