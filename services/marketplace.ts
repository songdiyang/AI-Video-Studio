import { getAuthToken } from './auth';

// =============================================
// 类型定义
// =============================================

export type RecipeType = 'character' | 'scene' | 'script';
export type ListingStatus = 'draft' | 'listed' | 'delisted';
export type ReviewStatus = 'pending' | 'approved' | 'rejected';

export interface MarketplaceTemplate {
  id: number;
  name: string;
  description: string;
  recipeType: RecipeType;
  category: string;
  thumbnailUrl: string | null;
  previewUrls: string[];
  tags: string | null;
  price: number;
  isFree: boolean;
  isOfficial: boolean;
  likeCount: number;
  commentCount: number;
  purchaseCount: number;
  listedAt: string | null;
  createdAt: string;
  sellerId: number;
  sellerName: string | null;
  sellerAvatar: string | null;
  sellerBadge: string | null;
  sellerEmail?: string;
  // 详情页额外字段
  recipeData?: any;
  templateData?: any;
  sellerBio?: string;
  sellerFollowerCount?: number;
  sellerTotalSales?: number;
  totalRevenue?: number;
  listingStatus?: ListingStatus;
  reviewStatus?: ReviewStatus;
}

export interface TemplateDetail extends MarketplaceTemplate {
  hasPurchased: boolean;
  hasLiked: boolean;
}

export interface TemplateComment {
  id: number;
  content: string;
  parentId: number | null;
  likeCount: number;
  createdAt: string;
  userId: number;
  userName: string | null;
  userAvatar: string | null;
  userEmail?: string;
}

export interface CreatorShopInfo {
  userId: number;
  displayName: string | null;
  avatarUrl: string | null;
  bio: string | null;
  badge: string;
  followerCount: number;
  followingCount: number;
  totalSales: number;
  totalEarnings: number;
  shopDescription: string | null;
  socialLinks: Record<string, string> | null;
  email?: string;
}

export interface PurchaseRecord {
  id: number;
  price: number;
  sellerRevenue: number;
  purchasedAt: string;
  templateId: number;
  templateName: string;
  recipeType: RecipeType;
  thumbnailUrl: string | null;
  recipeData: any;
  sellerName: string | null;
  sellerAvatar: string | null;
}

export interface EarningsStats {
  totalEarnings: number;
  totalSalesCount: number;
}

export interface RecentSale {
  price: number;
  sellerRevenue: number;
  createdAt: string;
  templateName: string;
  buyerEmail: string;
}

export interface SellerTemplateStat {
  id: number;
  name: string;
  recipeType: RecipeType;
  price: number;
  isFree: boolean;
  purchaseCount: number;
  totalRevenue: number;
  likeCount: number;
  listingStatus: ListingStatus;
}

// 请求参数
export interface MarketplaceListParams {
  recipeType?: RecipeType;
  search?: string;
  sort?: 'hot' | 'newest' | 'free' | 'paid';
  page?: number;
  limit?: number;
  isFree?: boolean;
}

export interface CreateTemplateParams {
  name: string;
  description?: string;
  recipeType: RecipeType;
  category?: string;
  thumbnailUrl?: string;
  previewUrls?: string[];
  tags?: string;
  recipeData: any;
  templateData?: any;
  price?: number;
  isFree?: boolean;
  isPublic?: boolean;
}

export interface UpdateTemplateParams extends Partial<CreateTemplateParams> {}

export interface CommentListParams {
  page?: number;
  limit?: number;
}

export interface CreateCommentParams {
  content: string;
  parentId?: number;
}

// =============================================
// API 请求工具
// =============================================

const API_BASE = '/api/marketplace';

const getHeaders = () => {
  const token = getAuthToken();
  return token
    ? { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }
    : { 'Content-Type': 'application/json' };
};

async function apiRequest<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    headers: getHeaders(),
    ...options,
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({ error: '请求失败' }));
    throw new Error(errorData.error || `请求失败 (${response.status})`);
  }

  return response.json();
}

// =============================================
// 模板市场 API
// =============================================

/** 浏览市场模板列表 */
export async function fetchMarketplaceTemplates(params: MarketplaceListParams = {}) {
  const searchParams = new URLSearchParams();
  if (params.recipeType) searchParams.set('recipe_type', params.recipeType);
  if (params.search) searchParams.set('search', params.search);
  if (params.sort) searchParams.set('sort', params.sort);
  if (params.page) searchParams.set('page', params.page.toString());
  if (params.limit) searchParams.set('limit', params.limit.toString());
  if (params.isFree !== undefined) searchParams.set('is_free', params.isFree ? '1' : '0');

  const qs = searchParams.toString();
  const data = await apiRequest<{ templates: any[]; pagination: { page: number; limit: number; total: number; totalPages: number } }>(
    `${API_BASE}/templates${qs ? `?${qs}` : ''}`
  );

  return {
    templates: data.templates.map(mapTemplate),
    pagination: data.pagination,
  };
}

/** 获取模板详情 */
export async function fetchTemplateDetail(id: number): Promise<TemplateDetail> {
  const data = await apiRequest<{ template: any; hasPurchased: boolean; hasLiked: boolean }>(
    `${API_BASE}/templates/${id}`
  );
  return {
    ...mapTemplate(data.template),
    hasPurchased: data.hasPurchased,
    hasLiked: data.hasLiked,
  };
}

/** 创建配方模板 */
export async function createMarketplaceTemplate(params: CreateTemplateParams) {
  return apiRequest<{ message: string; template: any }>(API_BASE + '/templates', {
    method: 'POST',
    body: JSON.stringify({
      name: params.name,
      description: params.description,
      recipe_type: params.recipeType,
      category: params.category,
      thumbnailUrl: params.thumbnailUrl,
      previewUrls: params.previewUrls,
      tags: params.tags,
      recipeData: params.recipeData,
      templateData: params.templateData,
      price: params.price,
      is_free: params.isFree,
      isPublic: params.isPublic,
    }),
  });
}

/** AI分析文本提取配方参数 */
export async function analyzeRecipeText(params: { text: string; recipeType: 'character' | 'scene'; textModel: string }) {
  return apiRequest<{ result: any }>(API_BASE + '/analyze-recipe', {
    method: 'POST',
    body: JSON.stringify({
      text: params.text,
      recipeType: params.recipeType,
      textModel: params.textModel,
    }),
  });
}

/** 编辑模板 */
export async function updateMarketplaceTemplate(id: number, params: UpdateTemplateParams) {
  return apiRequest<{ message: string; template: any }>(`${API_BASE}/templates/${id}`, {
    method: 'PUT',
    body: JSON.stringify({
      name: params.name,
      description: params.description,
      category: params.category,
      thumbnailUrl: params.thumbnailUrl,
      previewUrls: params.previewUrls,
      tags: params.tags,
      recipeData: params.recipeData,
      price: params.price,
      is_free: params.isFree,
      isPublic: params.isPublic,
    }),
  });
}

/** 删除模板 */
export async function deleteMarketplaceTemplate(id: number) {
  return apiRequest<{ message: string }>(`${API_BASE}/templates/${id}`, {
    method: 'DELETE',
  });
}

/** 购买配方 */
export async function purchaseTemplate(id: number) {
  return apiRequest<{ message: string; purchase: { templateId: number; price: number; platformFee: number; sellerRevenue: number; recipeData: any } }>(
    `${API_BASE}/templates/${id}/purchase`,
    { method: 'POST' }
  );
}

/** 上架模板 */
export async function listTemplate(id: number) {
  return apiRequest<{ message: string }>(`${API_BASE}/templates/${id}/list`, {
    method: 'POST',
  });
}

/** 下架模板 */
export async function delistTemplate(id: number) {
  return apiRequest<{ message: string }>(`${API_BASE}/templates/${id}/delist`, {
    method: 'POST',
  });
}

// =============================================
// 社交互动 API
// =============================================

/** 点赞/取消点赞 */
export async function toggleTemplateLike(id: number) {
  return apiRequest<{ liked: boolean; likeCount: number }>(`${API_BASE}/templates/${id}/like`, {
    method: 'POST',
  });
}

/** 获取评论列表 */
export async function fetchTemplateComments(id: number, params: CommentListParams = {}) {
  const searchParams = new URLSearchParams();
  if (params.page) searchParams.set('page', params.page.toString());
  if (params.limit) searchParams.set('limit', params.limit.toString());

  const qs = searchParams.toString();
  const data = await apiRequest<{ comments: any[]; pagination: { page: number; limit: number; total: number; totalPages: number } }>(
    `${API_BASE}/templates/${id}/comments${qs ? `?${qs}` : ''}`
  );

  return {
    comments: data.comments.map(mapComment),
    pagination: data.pagination,
  };
}

/** 发表评论 */
export async function createTemplateComment(id: number, params: CreateCommentParams) {
  return apiRequest<{ message: string; comment: any }>(`${API_BASE}/templates/${id}/comments`, {
    method: 'POST',
    body: JSON.stringify({
      content: params.content,
      parentId: params.parentId,
    }),
  });
}

/** 删除评论 */
export async function deleteTemplateComment(id: number) {
  return apiRequest<{ message: string }>(`${API_BASE}/comments/${id}`, {
    method: 'DELETE',
  });
}

/** 关注/取消关注 */
export async function toggleFollow(userId: number) {
  return apiRequest<{ following: boolean }>(`${API_BASE}/follow/${userId}`, {
    method: 'POST',
  });
}

/** 获取粉丝列表 */
export async function fetchFollowers() {
  return apiRequest<{ followers: any[]; total: number }>(API_BASE + '/followers');
}

/** 获取关注列表 */
export async function fetchFollowing() {
  return apiRequest<{ following: any[]; total: number }>(API_BASE + '/following');
}

// =============================================
// 卖家管理 API
// =============================================

/** 获取我发布的模板 */
export async function fetchMyTemplates(params: { page?: number; limit?: number; status?: ListingStatus } = {}) {
  const searchParams = new URLSearchParams();
  if (params.page) searchParams.set('page', params.page.toString());
  if (params.limit) searchParams.set('limit', params.limit.toString());
  if (params.status) searchParams.set('status', params.status);

  const qs = searchParams.toString();
  const data = await apiRequest<{ templates: any[]; pagination: any }>(
    `${API_BASE}/my-templates${qs ? `?${qs}` : ''}`
  );

  return {
    templates: data.templates.map(mapTemplate),
    pagination: data.pagination,
  };
}

/** 获取我购买的配方 */
export async function fetchMyPurchases(params: { page?: number; limit?: number } = {}) {
  const searchParams = new URLSearchParams();
  if (params.page) searchParams.set('page', params.page.toString());
  if (params.limit) searchParams.set('limit', params.limit.toString());

  const qs = searchParams.toString();
  const data = await apiRequest<{ purchases: any[]; pagination: any }>(
    `${API_BASE}/my-purchases${qs ? `?${qs}` : ''}`
  );

  return {
    purchases: data.purchases.map(mapPurchase),
    pagination: data.pagination,
  };
}

/** 获取收入统计 */
export async function fetchEarnings() {
  return apiRequest<{
    stats: EarningsStats;
    recentSales: RecentSale[];
    templateStats: SellerTemplateStat[];
  }>(API_BASE + '/earnings');
}

/** 获取用户小店 */
export async function fetchShop(userId: number, params: { page?: number; limit?: number } = {}) {
  const searchParams = new URLSearchParams();
  if (params.page) searchParams.set('page', params.page.toString());
  if (params.limit) searchParams.set('limit', params.limit.toString());

  const qs = searchParams.toString();
  const data = await apiRequest<{
    creator: any;
    isFollowing: boolean;
    templates: any[];
    pagination: any;
  }>(`${API_BASE}/shop/${userId}${qs ? `?${qs}` : ''}`);

  return {
    creator: mapCreator(data.creator),
    isFollowing: data.isFollowing,
    templates: data.templates.map(mapTemplate),
    pagination: data.pagination,
  };
}

// =============================================
// 数据映射工具
// =============================================

function mapTemplate(t: any): MarketplaceTemplate {
  return {
    id: t.id,
    name: t.name,
    description: t.description || '',
    recipeType: t.recipe_type || 'character',
    category: t.category || '',
    thumbnailUrl: t.thumbnail_url || null,
    previewUrls: Array.isArray(t.preview_urls) ? t.preview_urls : (typeof t.preview_urls === 'string' ? JSON.parse(t.preview_urls || '[]') : []),
    tags: t.tags || null,
    price: t.price || 0,
    isFree: !!t.is_free,
    isOfficial: !!t.is_official,
    likeCount: t.like_count || 0,
    commentCount: t.comment_count || 0,
    purchaseCount: t.purchase_count || 0,
    listedAt: t.listed_at || null,
    createdAt: t.created_at,
    sellerId: t.seller_id,
    sellerName: t.seller_name || null,
    sellerAvatar: t.seller_avatar || null,
    sellerBadge: t.seller_badge || null,
    sellerEmail: t.seller_email,
    recipeData: t.recipe_data,
    templateData: t.template_data,
    sellerBio: t.seller_bio,
    sellerFollowerCount: t.seller_follower_count,
    sellerTotalSales: t.seller_total_sales,
    totalRevenue: t.total_revenue,
    listingStatus: t.listing_status,
    reviewStatus: t.review_status,
  };
}

function mapComment(c: any): TemplateComment {
  return {
    id: c.id,
    content: c.content,
    parentId: c.parent_id,
    likeCount: c.like_count || 0,
    createdAt: c.created_at,
    userId: c.user_id,
    userName: c.user_name || null,
    userAvatar: c.user_avatar || null,
    userEmail: c.user_email,
  };
}

function mapPurchase(p: any): PurchaseRecord {
  return {
    id: p.id,
    price: p.price || 0,
    sellerRevenue: p.seller_revenue || 0,
    purchasedAt: p.purchased_at,
    templateId: p.template_id,
    templateName: p.template_name,
    recipeType: p.recipe_type,
    thumbnailUrl: p.thumbnail_url || null,
    recipeData: p.recipe_data,
    sellerName: p.seller_name || null,
    sellerAvatar: p.seller_avatar || null,
  };
}

function mapCreator(c: any): CreatorShopInfo {
  return {
    userId: c.user_id,
    displayName: c.display_name || null,
    avatarUrl: c.avatar_url || null,
    bio: c.bio || null,
    badge: c.badge || 'newcomer',
    followerCount: c.follower_count || 0,
    followingCount: c.following_count || 0,
    totalSales: c.total_sales || 0,
    totalEarnings: c.total_earnings || 0,
    shopDescription: c.shop_description || null,
    socialLinks: c.social_links,
    email: c.email,
  };
}
