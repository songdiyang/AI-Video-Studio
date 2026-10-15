import { getAuthToken } from './auth';

// 模板接口定义
export interface Template {
  id: number;
  creatorId: number;
  name: string;
  description: string;
  category: 'script' | 'storyboard' | 'character' | 'workflow';
  thumbnailUrl: string | null;
  tags: string | null;
  useCount: number;
  isOfficial: boolean;
  isPublic: boolean;
  creatorEmail: string | null;
  createdAt: string;
}

// 创建模板请求数据
export interface CreateTemplateData {
  name: string;
  description?: string;
  category: Template['category'];
  thumbnailUrl?: string;
  tags?: string;
  isPublic?: boolean;
  projectId?: number;
  scriptId?: number;
}

// 模板列表响应
export interface TemplatesResponse {
  templates: Template[];
  total: number;
}

// 使用模板响应
export interface UseTemplateResponse {
  projectId: number;
}

// 获取请求头
const getHeaders = () => {
  const token = getAuthToken();
  return token
    ? {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      }
    : { 'Content-Type': 'application/json' };
};

/**
 * 获取模板列表
 */
export async function fetchTemplates(params: {
  category?: string;
  search?: string;
  sort?: 'popular' | 'newest' | 'most_used';
  page?: number;
  limit?: number;
}): Promise<TemplatesResponse> {
  const searchParams = new URLSearchParams();
  if (params.category && params.category !== 'all') {
    searchParams.set('category', params.category);
  }
  if (params.search) {
    searchParams.set('search', params.search);
  }
  if (params.sort) {
    searchParams.set('sort', params.sort);
  }
  if (params.page) {
    searchParams.set('page', params.page.toString());
  }
  if (params.limit) {
    searchParams.set('limit', params.limit.toString());
  }

  const url = `/api/templates${searchParams.toString() ? `?${searchParams.toString()}` : ''}`;
  const response = await fetch(url, { headers: getHeaders() });
  
  if (!response.ok) {
    throw new Error('获取模板列表失败');
  }
  
  const data = await response.json();
  const templates = (data.templates || []).map((t: any): Template => ({
    id: t.id,
    creatorId: t.creator_id,
    name: t.name,
    description: t.description ?? '',
    category: t.category,
    thumbnailUrl: t.thumbnail_url ?? null,
    tags: t.tags ?? null,
    useCount: t.use_count ?? 0,
    isOfficial: !!t.is_official,
    isPublic: !!t.is_public,
    creatorEmail: t.creator_email ?? null,
    createdAt: t.created_at,
  }));
  return { templates, total: data.pagination?.total ?? 0 };
}

/**
 * 获取单个模板详情
 */
export async function fetchTemplate(id: number): Promise<Template> {
  const response = await fetch(`/api/templates/${id}`, { headers: getHeaders() });
  
  if (!response.ok) {
    throw new Error('获取模板详情失败');
  }
  
  const data = await response.json();
  const t = data.template;
  return {
    id: t.id,
    creatorId: t.creator_id,
    name: t.name,
    description: t.description ?? '',
    category: t.category,
    thumbnailUrl: t.thumbnail_url ?? null,
    tags: t.tags ?? null,
    useCount: t.use_count ?? 0,
    isOfficial: !!t.is_official,
    isPublic: !!t.is_public,
    creatorEmail: t.creator_email ?? null,
    createdAt: t.created_at,
  };
}

/**
 * 创建新模板
 */
export async function createTemplate(data: CreateTemplateData): Promise<Template> {
  const response = await fetch('/api/templates', {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify(data),
  });
  
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.message || '创建模板失败');
  }
  
  const result = await response.json();
  return result.template;
}

/**
 * 使用模板创建项目
 */
export async function useTemplate(id: number): Promise<UseTemplateResponse> {
  const response = await fetch(`/api/templates/${id}/use`, {
    method: 'POST',
    headers: getHeaders(),
  });
  
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.message || '使用模板失败');
  }
  
  return response.json();
}

/**
 * 更新模板
 */
export async function updateTemplate(id: number, data: Partial<CreateTemplateData>): Promise<Template> {
  const response = await fetch(`/api/templates/${id}`, {
    method: 'PUT',
    headers: getHeaders(),
    body: JSON.stringify(data),
  });
  
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.message || '更新模板失败');
  }
  
  const result = await response.json();
  return result.template;
}

/**
 * 删除模板
 */
export async function deleteTemplate(id: number): Promise<void> {
  const response = await fetch(`/api/templates/${id}`, {
    method: 'DELETE',
    headers: getHeaders(),
  });
  
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.message || '删除模板失败');
  }
}
