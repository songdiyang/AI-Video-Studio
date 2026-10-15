import { getAuthToken } from './auth';

// 作品展示接口定义
export interface Showcase {
  id: number;
  userId: number;
  projectId: number;
  title: string;
  description: string | null;
  coverUrl: string | null;
  tags: string | null;
  viewCount: number;
  likeCount: number;
  isFeatured: boolean;
  status: 'draft' | 'published' | 'hidden';
  createdAt: string;
  updatedAt: string;
  // 关联数据
  creatorName: string | null;
  creatorAvatar: string | null;
  hasLiked?: boolean;
}

// 创作者排名接口
export interface CreatorRank {
  rank: number;
  userId: number;
  displayName: string | null;
  avatarUrl: string | null;
  badge: 'newcomer' | 'creator' | 'pro' | 'master';
  worksCount: number;
  totalViews: number;
  totalLikes: number;
}

// 创作者档案接口
export interface CreatorProfile {
  userId: number;
  displayName: string | null;
  bio: string | null;
  avatarUrl: string | null;
  badge: 'newcomer' | 'creator' | 'pro' | 'master';
  worksCount: number;
  totalViews: number;
  totalLikes: number;
  socialLinks: {
    website?: string;
    twitter?: string;
    bilibili?: string;
  } | null;
  createdAt: string;
}

// 创建作品请求数据
export interface CreateShowcaseData {
  projectId: number;
  title: string;
  description?: string;
  coverUrl?: string;
  tags?: string;
  status?: 'draft' | 'published';
}

// 更新作品请求数据
export interface UpdateShowcaseData {
  title?: string;
  description?: string;
  coverUrl?: string;
  tags?: string;
  status?: 'draft' | 'published' | 'hidden';
}

// 更新创作者档案请求数据
export interface UpdateProfileData {
  displayName?: string;
  bio?: string;
  avatarUrl?: string;
  socialLinks?: {
    website?: string;
    twitter?: string;
    bilibili?: string;
  };
}

// 作品列表响应
export interface ShowcasesResponse {
  showcases: Showcase[];
  total: number;
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
 * 获取作品广场列表
 */
export async function fetchShowcases(params: {
  filter?: 'hot' | 'newest' | 'featured';
  page?: number;
  limit?: number;
  tags?: string;
}): Promise<ShowcasesResponse> {
  const searchParams = new URLSearchParams();
  if (params.filter) {
    searchParams.set('filter', params.filter);
  }
  if (params.page) {
    searchParams.set('page', params.page.toString());
  }
  if (params.limit) {
    searchParams.set('limit', params.limit.toString());
  }
  if (params.tags) {
    searchParams.set('tags', params.tags);
  }

  const url = `/api/community/showcases${searchParams.toString() ? `?${searchParams.toString()}` : ''}`;
  const response = await fetch(url, { headers: getHeaders() });

  if (!response.ok) {
    throw new Error('获取作品列表失败');
  }

  const data = await response.json();
  const showcases = (data.showcases || []).map((s: any): Showcase => ({
    id: s.id,
    userId: s.user_id,
    projectId: s.project_id,
    title: s.title,
    description: s.description,
    coverUrl: s.cover_url,
    tags: s.tags,
    viewCount: s.view_count ?? 0,
    likeCount: s.like_count ?? 0,
    isFeatured: !!s.is_featured,
    status: s.status,
    createdAt: s.published_at || s.created_at,
    updatedAt: s.updated_at,
    creatorName: s.creator_name,
    creatorAvatar: s.creator_avatar,
    hasLiked: false,
  }));
  return { showcases, total: data.pagination?.total ?? 0 };
}

/**
 * 获取单个作品详情
 */
export async function fetchShowcase(id: number): Promise<Showcase> {
  const response = await fetch(`/api/community/showcases/${id}`, {
    headers: getHeaders(),
  });

  if (!response.ok) {
    throw new Error('获取作品详情失败');
  }

  const data = await response.json();
  return data.showcase;
}

/**
 * 发布作品
 */
export async function createShowcase(data: CreateShowcaseData): Promise<Showcase> {
  const response = await fetch('/api/community/showcases', {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify(data),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.message || '发布作品失败');
  }

  const result = await response.json();
  return result.showcase;
}

/**
 * 更新作品
 */
export async function updateShowcase(
  id: number,
  data: UpdateShowcaseData
): Promise<void> {
  const response = await fetch(`/api/community/showcases/${id}`, {
    method: 'PUT',
    headers: getHeaders(),
    body: JSON.stringify(data),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.message || '更新作品失败');
  }
}

/**
 * 删除作品
 */
export async function deleteShowcase(id: number): Promise<void> {
  const response = await fetch(`/api/community/showcases/${id}`, {
    method: 'DELETE',
    headers: getHeaders(),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.message || '删除作品失败');
  }
}

/**
 * 点赞/取消点赞作品
 */
export async function likeShowcase(id: number): Promise<{ liked: boolean; likeCount: number }> {
  const response = await fetch(`/api/community/showcases/${id}/like`, {
    method: 'POST',
    headers: getHeaders(),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.message || '点赞操作失败');
  }

  return response.json();
}

/**
 * 获取排行榜
 */
export async function fetchLeaderboard(params: {
  period?: 'weekly' | 'monthly' | 'all_time';
  limit?: number;
}): Promise<CreatorRank[]> {
  const searchParams = new URLSearchParams();
  if (params.period) {
    searchParams.set('period', params.period);
  }
  if (params.limit) {
    searchParams.set('limit', params.limit.toString());
  }

  const url = `/api/community/leaderboard${searchParams.toString() ? `?${searchParams.toString()}` : ''}`;
  const response = await fetch(url, { headers: getHeaders() });

  if (!response.ok) {
    throw new Error('获取排行榜失败');
  }

  const data = await response.json();
  return (data.leaderboard || []).map((r: any): CreatorRank => ({
    userId: r.user_id,
    displayName: r.display_name,
    avatarUrl: r.avatar_url,
    badge: r.badge,
    worksCount: r.total_works ?? 0,
    totalViews: r.total_views ?? 0,
    totalLikes: r.total_likes ?? 0,
    rank: r.rank,
  }));
}

/**
 * 获取创作者档案
 */
export async function fetchCreatorProfile(userId: number): Promise<CreatorProfile> {
  const response = await fetch(`/api/community/creators/${userId}`, {
    headers: getHeaders(),
  });

  if (!response.ok) {
    throw new Error('获取创作者档案失败');
  }

  const data = await response.json();
  const c = data.creator;
  return {
    userId: c.user_id,
    displayName: c.display_name,
    bio: c.bio,
    avatarUrl: c.avatar_url,
    badge: c.badge,
    worksCount: c.total_works ?? 0,
    totalViews: c.total_views ?? 0,
    totalLikes: c.total_likes ?? 0,
    socialLinks: c.social_links,
    createdAt: c.created_at,
  };
}

/**
 * 更新自己的创作者档案
 */
export async function updateCreatorProfile(data: UpdateProfileData): Promise<void> {
  const response = await fetch('/api/community/profile', {
    method: 'PUT',
    headers: getHeaders(),
    body: JSON.stringify(data),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.message || '更新档案失败');
  }
}

/**
 * 获取创作者的作品列表
 */
export async function fetchCreatorShowcases(
  userId: number,
  params?: { page?: number; limit?: number }
): Promise<ShowcasesResponse> {
  const searchParams = new URLSearchParams();
  if (params?.page) {
    searchParams.set('page', params.page.toString());
  }
  if (params?.limit) {
    searchParams.set('limit', params.limit.toString());
  }

  const url = `/api/community/creators/${userId}/showcases${searchParams.toString() ? `?${searchParams.toString()}` : ''}`;
  const response = await fetch(url, { headers: getHeaders() });

  if (!response.ok) {
    throw new Error('获取创作者作品列表失败');
  }

  const data = await response.json();
  const showcases = (data.showcases || []).map((s: any): Showcase => ({
    id: s.id,
    userId: s.user_id,
    projectId: s.project_id,
    title: s.title,
    description: s.description,
    coverUrl: s.cover_url,
    tags: s.tags,
    viewCount: s.view_count ?? 0,
    likeCount: s.like_count ?? 0,
    isFeatured: !!s.is_featured,
    status: s.status,
    createdAt: s.published_at || s.created_at,
    updatedAt: s.updated_at,
    creatorName: s.creator_name,
    creatorAvatar: s.creator_avatar,
    hasLiked: false,
  }));
  return { showcases, total: data.pagination?.total ?? 0 };
}
