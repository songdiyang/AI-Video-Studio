import { getAuthToken } from './auth';
import { ProjectType, mapLegacyProjectType } from '../types/projectTypes';

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
  /** 项目来源标识，API 返回时标记 'own' 表示自己创建的项目 */
  source?: string;
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

export async function fetchProjects(): Promise<Project[]> {
  const response = await fetch('/api/projects', { headers: getHeaders() });
  if (!response.ok) {
    throw new Error('获取工程列表失败');
  }
  const data = await response.json();
  return data.projects || [];
}

export async function fetchProject(id: number): Promise<Project> {
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
  return data.styles || [];
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
