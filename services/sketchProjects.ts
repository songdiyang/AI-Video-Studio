import { getAuthToken } from './auth';

export interface SketchProject {
  id: number;
  user_id: number;
  project_id: number;
  title: string;
  description: string | null;
  thumbnail_url: string | null;
  sketch_url: string | null;
  excalidraw_data: unknown;
  tags: string[] | null;
  created_at: string;
  updated_at: string;
}

export interface SketchProjectListResponse {
  items: SketchProject[];
  total: number;
  page: number;
  limit: number;
}

function authHeaders() {
  const token = getAuthToken();
  return token
    ? {
        Authorization: `Bearer ${token}`,
      }
    : {};
}

/**
 * 获取草图项目列表
 */
export async function getSketchProjects(params?: {
  search?: string;
  page?: number;
  limit?: number;
  project_id?: number;
}): Promise<SketchProjectListResponse> {
  const searchParams = new URLSearchParams();
  if (params?.search) searchParams.set('search', params.search);
  if (params?.page) searchParams.set('page', String(params.page));
  if (params?.limit) searchParams.set('limit', String(params.limit));
  if (params?.project_id) searchParams.set('project_id', String(params.project_id));

  const queryString = searchParams.toString();
  const url = `/api/sketch-projects${queryString ? `?${queryString}` : ''}`;

  const res = await fetch(url, {
    headers: {
      ...authHeaders(),
    },
  });

  const data = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error(data?.message || '获取草图列表失败');
  }

  return data as SketchProjectListResponse;
}

/**
 * 获取单个草图项目
 */
export async function getSketchProject(id: number): Promise<SketchProject> {
  const res = await fetch(`/api/sketch-projects/${id}`, {
    headers: {
      ...authHeaders(),
    },
  });

  const data = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error(data?.message || '获取草图失败');
  }

  return data as SketchProject;
}

/**
 * 创建草图项目
 */
export async function createSketchProject(data: {
  title: string;
  description?: string;
  project_id: number;
}): Promise<SketchProject> {
  const res = await fetch('/api/sketch-projects', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...authHeaders(),
    },
    body: JSON.stringify(data),
  });

  const result = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error(result?.message || '创建草图失败');
  }

  return result.sketchProject as SketchProject;
}

/**
 * 更新草图项目
 */
export async function updateSketchProject(
  id: number,
  data: {
    title?: string;
    description?: string;
    excalidraw_data?: unknown;
    tags?: string[];
  }
): Promise<void> {
  const res = await fetch(`/api/sketch-projects/${id}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      ...authHeaders(),
    },
    body: JSON.stringify(data),
  });

  const result = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error(result?.message || '更新草图失败');
  }
}

/**
 * 删除草图项目
 */
export async function deleteSketchProject(id: number): Promise<void> {
  const res = await fetch(`/api/sketch-projects/${id}`, {
    method: 'DELETE',
    headers: {
      ...authHeaders(),
    },
  });

  const data = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error(data?.message || '删除草图失败');
  }
}

/**
 * 上传草图缩略图
 */
export async function uploadSketchThumbnail(
  id: number,
  file: Blob
): Promise<{ thumbnail_url: string }> {
  const formData = new FormData();
  formData.append('thumbnail', file, 'thumbnail.png');

  const res = await fetch(`/api/sketch-projects/${id}/thumbnail`, {
    method: 'POST',
    headers: {
      ...authHeaders(),
    },
    body: formData,
  });

  const data = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error(data?.message || '上传缩略图失败');
  }

  return data as { thumbnail_url: string };
}

/**
 * 导出草图图片
 */
export async function exportSketchImage(
  id: number,
  format: 'png' | 'svg',
  imageData: string
): Promise<{ url: string }> {
  const res = await fetch(`/api/sketch-projects/${id}/export`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...authHeaders(),
    },
    body: JSON.stringify({ format, imageData }),
  });

  const data = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error(data?.message || '导出图片失败');
  }

  return data as { url: string };
}
