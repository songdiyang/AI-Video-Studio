import { getAuthToken } from './auth';
import { ProjectType, mapLegacyProjectType } from '../types/projectTypes';
import {
  listProjects as listLocalProjects,
  deleteProject as removeLocalProject,
  updateProjectManifest,
  ProjectMetadata,
} from './localApi';

export interface Project {
  id: number;
  user_id: number;
  team_id?: number | null;
  name: string;
  description: string;
  cover_url: string;
  type: ProjectType;
  status: 'draft' | 'in_progress' | 'completed';
  settings_json: string;
  use_models?: Record<string, string>;
  /** 项目来源标识：'own' 自己创建 / 'local' 本地工程 / 'cloud' 云端 */
  source?: string;
  /** 本地工程文件夹绝对路径（source === 'local' 时存在） */
  local_path?: string;
  /** 团队名称（团队项目时返回） */
  team_name?: string;
  /** 当前用户对该项目的角色 */
  my_role?: 'owner' | 'admin' | 'editor' | 'viewer';
  created_at: string;
  updated_at: string;
}

/**
 * 规范化项目数据，处理旧类型映射
 */
function normalizeProject(project: any): Project {
  return {
    ...project,
    type: mapLegacyProjectType(project.type),
  };
}

const getHeaders = (): Record<string, string> => {
  const token = getAuthToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  return headers;
};

/**
 * 为本地工程生成稳定数字 ID：与云端自增 ID（较小正整数）隔离，
 * 统一落在 2e9 ~ 3e9 区间，供全应用按 Project.id 使用。
 */
export const LOCAL_ID_MIN = 2_000_000_000;

export function localProjectId(path: string): number {
  let h = 5381;
  for (let i = 0; i < path.length; i++) {
    h = ((h << 5) + h + path.charCodeAt(i)) >>> 0;
  }
  return LOCAL_ID_MIN + (h % 1_000_000_000);
}

/** 本地 .jzp 工程元数据 → 应用内 Project 形状 */
export function mapLocalProject(meta: ProjectMetadata): Project {
  const path = meta.path || `local://${meta.id}`;
  return {
    id: localProjectId(path),
    user_id: 0,
    name: meta.name,
    description: meta.description || '',
    cover_url: meta.thumbnail_path || '',
    type: mapLegacyProjectType(meta.project_type) as ProjectType,
    status: 'in_progress',
    settings_json: '{}',
    source: 'local',
    local_path: path,
    created_at: meta.created_at,
    updated_at: meta.updated_at,
  };
}

/** 拉取本地工程列表（Tauri 走 Rust 注册表；浏览器模式走 localStorage 模拟） */
export async function fetchLocalProjects(): Promise<Project[]> {
  const metas = await listLocalProjects();
  return metas.map(mapLocalProject);
}

/**
 * 工程列表 = 本地工程（优先） + 云端工程（只读入口，后端不可用时静默跳过）
 */
export async function fetchProjects(): Promise<Project[]> {
  let local: Project[] = [];
  let localError: Error | null = null;
  try {
    local = await fetchLocalProjects();
  } catch (err: any) {
    localError = err;
    console.warn('[projects] 读取本地工程失败:', err);
  }

  let cloud: Project[] = [];
  let cloudError: Error | null = null;
  try {
    const response = await fetch('/api/projects', { headers: getHeaders() });
    if (!response.ok) {
      throw new Error('获取云端工程列表失败');
    }
    const data = await response.json();
    cloud = (Array.isArray(data.projects) ? data.projects : []).map((p: any) => ({
      ...normalizeProject(p),
      source: p.source || 'cloud',
    }));
  } catch (err: any) {
    cloudError = err;
  }

  // 只有本地与云端两个数据源都读取失败才抛错；
  // 本地读取成功（即使为空）时云端失败被静默忽略，UI 显示"当前没有工程"
  if (localError && cloudError) {
    throw cloudError;
  }
  return [...local, ...cloud];
}

/** 判断是否本地工程 ID（见 localProjectId 的 2e9 区间约定） */
export function isLocalProjectId(id: number): boolean {
  return id >= LOCAL_ID_MIN;
}

export async function fetchProject(id: number): Promise<Project> {
  if (isLocalProjectId(id)) {
    const local = await fetchLocalProjects();
    const hit = local.find(p => p.id === id);
    if (!hit) {
      throw new Error('本地工程不存在');
    }
    return hit;
  }
  const response = await fetch(`/api/projects/${id}`, { headers: getHeaders() });
  if (!response.ok) {
    throw new Error('获取工程失败');
  }
  return response.json();
}

export async function createProject(project: Partial<Project>): Promise<Project> {
  const response = await fetch('/api/projects', {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify(project)
  });
  if (!response.ok) {
    const data = await response.json();
    // 创建带有额外属性的错误对象
    const error = new Error(data.message || '创建工程失败') as Error & { code?: string; data?: any };
    if (data.code) {
      error.code = data.code;
    }
    if (data.data) {
      error.data = data.data;
    }
    throw error;
  }
  const data = await response.json();
  return data.project;
}

export async function updateProject(id: number, project: Partial<Project>): Promise<Project> {
  if (isLocalProjectId(id)) {
    // 本地工程：更新 .jzp 清单中的名称/描述（分镜等数据管线后续接入 data/ 文件）
    const local = await fetchLocalProjects();
    const hit = local.find(p => p.id === id);
    if (!hit || !hit.local_path) {
      throw new Error('本地工程不存在');
    }
    const meta = await updateProjectManifest(hit.local_path, {
      name: project.name,
      description: project.description,
    });
    return { ...hit, ...mapLocalProject(meta) };
  }
  const response = await fetch(`/api/projects/${id}`, {
    method: 'PUT',
    headers: getHeaders(),
    body: JSON.stringify(project)
  });
  if (!response.ok) {
    const data = await response.json();
    throw new Error(data.message || '更新工程失败');
  }
  const data = await response.json();
  return data.project;
}

export async function deleteProject(id: number): Promise<void> {
  if (isLocalProjectId(id)) {
    // 本地工程：仅从注册表注销，磁盘文件夹保留
    const local = await fetchLocalProjects();
    const hit = local.find(p => p.id === id);
    if (hit?.local_path) {
      await removeLocalProject(hit.local_path, false);
    }
    return;
  }
  const response = await fetch(`/api/projects/${id}`, {
    method: 'DELETE',
    headers: getHeaders()
  });
  if (!response.ok) {
    const data = await response.json();
    throw new Error(data.message || '删除工程失败');
  }
}

// ========== 用户自定义风格 API ==========

export interface UserStylePreset {
  id: number;
  name: string;
  prompt: string;
  style_category: 'anime' | 'live_action';
  created_at: string;
  updated_at: string;
}

export async function fetchMyStyles(): Promise<UserStylePreset[]> {
  const response = await fetch('/api/projects/my-styles', { headers: getHeaders() });
  if (!response.ok) {
    throw new Error('获取风格列表失败');
  }
  const data = await response.json();
  return Array.isArray(data.styles) ? data.styles : [];
}

export async function createMyStyle(data: Omit<UserStylePreset, 'id' | 'created_at' | 'updated_at'>): Promise<UserStylePreset> {
  const response = await fetch('/api/projects/my-styles', {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify(data)
  });
  if (!response.ok) {
    const err = await response.json();
    throw new Error(err.message || '创建风格失败');
  }
  const result = await response.json();
  return result.style;
}

export async function updateMyStyle(id: number, data: Partial<Omit<UserStylePreset, 'id' | 'created_at' | 'updated_at'>>): Promise<UserStylePreset> {
  const response = await fetch(`/api/projects/my-styles/${id}`, {
    method: 'PUT',
    headers: getHeaders(),
    body: JSON.stringify(data)
  });
  if (!response.ok) {
    const err = await response.json();
    throw new Error(err.message || '更新风格失败');
  }
  const result = await response.json();
  return result.style;
}

export async function deleteMyStyle(id: number): Promise<void> {
  const response = await fetch(`/api/projects/my-styles/${id}`, {
    method: 'DELETE',
    headers: getHeaders()
  });
  if (!response.ok) {
    const err = await response.json();
    throw new Error(err.message || '删除风格失败');
  }
}
