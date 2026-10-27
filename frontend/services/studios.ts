import type { SceneElement } from './sceneElements';
import type { Environment } from './environments';
import type { Building } from './buildings';

/**
 * 场景（Studio）service
 * 聚合环境(1:N) + 建筑(1:N) + 场景元素(M:N) 的创作空间实体
 */

export interface Studio {
  id: number;
  user_id: number;
  project_id: number;
  /** 主环境（= environment_ids 首条链接的镜像，兼容旧数据） */
  environment_id: number | null;
  /** 环境链接数组（1:N，主环境在前）：[{environment_id, view, sort_order}] */
  environment_ids?: { environment_id: number; view?: 'front' | 'back' | null; sort_order?: number }[];
  /** 主环境采用环境的哪一面作为组装参考（front=正面，back=背面） */
  environment_view?: 'front' | 'back' | null;
  name: string;
  description: string | null;
  cover_image_url: string | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
  scene_count?: number;
  element_count?: number;
  /** 影棚九宫组装图 URL（3×3 九机位视角合成图） */
  nine_grid_image_url?: string | null;
  /** 九宫组装图生成状态 */
  nine_grid_generation_status?: 'pending' | 'generating' | 'completed' | 'failed';
}

/** 影棚内建筑关联项：在 Building 基础上附带影棚侧的视图偏好 */
export type StudioBuildingItem = Building & {
  /** 影棚采用此建筑的哪种视图（exterior=外景，interior=内景） */
  building_view?: 'exterior' | 'interior' | null;
};

/** 影棚内环境关联项：在 Environment 基础上附带影棚侧采用面偏好 */
export type StudioEnvironmentItem = Environment & {
  /** 影棚采用此环境的哪一面（front=正面，back=背面） */
  environment_view?: 'front' | 'back' | null;
};

export interface StudioElementSummary {
  id: number;
  name: string;
  category: 'building' | 'scenery';
  description: string | null;
  image_url: string | null;
  generation_status: SceneElement['generation_status'];
  sort_order: number;
}

export interface StudioDetail {
  studio: Studio;
  /** 主环境 = environments[0]（兼容旧单值消费方） */
  environment: Environment | null;
  /** 影棚绑定的全部环境（1:N，主环境在前） */
  environments: StudioEnvironmentItem[];
  buildings: StudioBuildingItem[];
  elements: StudioElementSummary[];
}

async function handle<T>(resp: Response): Promise<T> {
  if (!resp.ok) {
    let msg = `请求失败：${resp.status}`;
    try {
      const j = await resp.json();
      if (j?.message) msg = j.message;
    } catch {
      /* ignore */
    }
    throw new Error(msg);
  }
  return resp.json() as Promise<T>;
}

// ========== CRUD ==========

export async function listStudios(projectId?: number): Promise<Studio[]> {
  const qs = projectId ? `?projectId=${projectId}` : '';
  const resp = await fetch(`/api/studios${qs}`);
  const data = await handle<{ studios: Studio[] }>(resp);
  return data.studios || [];
}

export async function getStudio(id: number): Promise<StudioDetail> {
  const resp = await fetch(`/api/studios/${id}`);
  return handle<StudioDetail>(resp);
}

export async function createStudio(payload: {
  projectId: number;
  name: string;
  description?: string;
  coverImageUrl?: string;
  sortOrder?: number;
}): Promise<Studio> {
  const resp = await fetch('/api/studios', {
    method: 'POST',
    headers: {  'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  const data = await handle<{ studio: Studio }>(resp);
  return data.studio;
}

export async function updateStudio(id: number, payload: {
  name?: string;
  description?: string | null;
  coverImageUrl?: string | null;
  sortOrder?: number;
}): Promise<Studio> {
  const resp = await fetch(`/api/studios/${id}`, {
    method: 'PATCH',
    headers: {  'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  const data = await handle<{ studio: Studio }>(resp);
  return data.studio;
}

export async function deleteStudio(id: number): Promise<void> {
  const resp = await fetch(`/api/studios/${id}`, {
    method: 'DELETE',
  });
  await handle<{ message: string }>(resp);
}

// ========== 环境关联（1:N） ==========

/** 关联环境到影棚（已存在则更新采用面） */
export async function attachEnvironmentToStudio(
  studioId: number,
  environmentId: number,
  view?: 'front' | 'back'
): Promise<void> {
  const resp = await fetch(`/api/studios/${studioId}/environment`, {
    method: 'POST',
    headers: {  'Content-Type': 'application/json' },
    body: JSON.stringify(view ? { environmentId, view } : { environmentId })
  });
  await handle<{ message: string }>(resp);
}

/** 解除影棚与某环境的关联；不传 environmentId 时清空全部环境 */
export async function detachEnvironmentFromStudio(studioId: number, environmentId?: number): Promise<void> {
  const qs = environmentId ? `?environmentId=${environmentId}` : '';
  const resp = await fetch(`/api/studios/${studioId}/environment${qs}`, {
    method: 'DELETE',
  });
  await handle<{ message: string }>(resp);
}

/** 切换影棚所用环境面（正/背）；不传 environmentId 时作用于主环境 */
export async function setStudioEnvironmentView(
  studioId: number,
  view: 'front' | 'back',
  environmentId?: number
): Promise<void> {
  const resp = await fetch(`/api/studios/${studioId}/environment-view`, {
    method: 'PATCH',
    headers: {  'Content-Type': 'application/json' },
    body: JSON.stringify(environmentId ? { view, environmentId } : { view })
  });
  await handle<{ message: string }>(resp);
}

// ========== 建筑关联 ==========

export async function attachBuildingToStudio(
  studioId: number,
  buildingId: number,
  sortOrder?: number,
  view?: 'exterior' | 'interior'
): Promise<void> {
  const body: Record<string, unknown> = { sortOrder: sortOrder ?? 0 };
  if (view) body.view = view;
  const resp = await fetch(`/api/studios/${studioId}/buildings/${buildingId}`, {
    method: 'POST',
    headers: {  'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  await handle<{ message: string }>(resp);
}

export async function detachBuildingFromStudio(studioId: number, buildingId: number): Promise<void> {
  const resp = await fetch(`/api/studios/${studioId}/buildings/${buildingId}`, {
    method: 'DELETE',
  });
  await handle<{ message: string }>(resp);
}

/** 切换影棚下某座建筑采用的视图（外景/内景） */
export async function setStudioBuildingView(
  studioId: number,
  buildingId: number,
  view: 'exterior' | 'interior'
): Promise<void> {
  const resp = await fetch(`/api/studios/${studioId}/buildings/${buildingId}/view`, {
    method: 'PATCH',
    headers: {  'Content-Type': 'application/json' },
    body: JSON.stringify({ view })
  });
  await handle<{ message: string }>(resp);
}

// ========== 元素关联 ==========

export async function attachElementToStudio(studioId: number, elementId: number, sortOrder?: number): Promise<void> {
  const resp = await fetch(`/api/studios/${studioId}/elements/${elementId}`, {
    method: 'POST',
    headers: {  'Content-Type': 'application/json' },
    body: JSON.stringify({ sortOrder: sortOrder ?? 0 })
  });
  await handle<{ message: string }>(resp);
}

export async function detachElementFromStudio(studioId: number, elementId: number): Promise<void> {
  const resp = await fetch(`/api/studios/${studioId}/elements/${elementId}`, {
    method: 'DELETE',
  });
  await handle<{ message: string }>(resp);
}

// ========== AI 两阶段工作流 ==========

export interface StudioWorkflowStartResponse {
  message: string;
  jobId?: string | number;
  scriptId?: number;
  status?: string;
}

/** 阶段1：从剧本拆分环境与建筑 */
export async function extractStudioComponentsFromScript(payload: {
  projectId: number;
  scriptId: number;
  textModel: string;
}): Promise<StudioWorkflowStartResponse> {
  const resp = await fetch('/api/studios/extract-components', {
    method: 'POST',
    headers: {  'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  return handle<StudioWorkflowStartResponse>(resp);
}

/** 阶段2：拼接场景（环境 + 建筑 + 元素 → studio） */
export async function composeStudiosFromScript(payload: {
  projectId: number;
  scriptId: number;
  textModel: string;
}): Promise<StudioWorkflowStartResponse> {
  const resp = await fetch('/api/studios/compose-from-script', {
    method: 'POST',
    headers: {  'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  return handle<StudioWorkflowStartResponse>(resp);
}

// ========== 九宫组装图生成 ==========

export interface StudioNineGridGenerateResponse {
  message: string;
  jobId?: string | number;
  studioId: number;
  status?: string;
}

/**
 * 影棚九宫组装图生成
 * 基于影棚绑定的环境（1:1）+ 建筑（1:N），
 * 生成一张 3×3 九机位视角的影棚组装图。
 */
export async function generateStudioNineGrid(
  studioId: number,
  payload: { imageModel: string; textModel?: string }
): Promise<StudioNineGridGenerateResponse> {
  const resp = await fetch(`/api/studios/${studioId}/generate-nine-grid`, {
    method: 'POST',
    headers: {  'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  return handle<StudioNineGridGenerateResponse>(resp);
}
