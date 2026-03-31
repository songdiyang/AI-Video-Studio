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
    throw new Error(data.message || '创建工程失败');
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
