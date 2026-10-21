// ============================================================
// 服装资源接口定义
// ============================================================

export interface Costume {
  id: number;
  user_id: number;
  project_id: number;
  name: string;
  description: string;
  category: string;
  gender: 'male' | 'female' | 'unisex';
  outfit_prompt: string;
  image_url: string;
  front_view_url: string;
  side_view_url: string;
  back_view_url: string;
  tags: string;
  generation_status?: 'pending' | 'generating' | 'completed' | 'failed';
  generation_prompt?: string;
  created_at: string;
  updated_at: string;
  character_name?: string;
  character_id?: number;
}

export interface CharacterCostume {
  id: number;
  character_id: number;
  costume_id: number;
  is_equipped: boolean;
  equipped_at?: string;
  costume?: Costume;
}

export interface CostumeCreateInput {
  projectId: number;
  name: string;
  description?: string;
  category?: string;
  gender?: 'male' | 'female' | 'unisex';
  outfit_prompt?: string;
  image_url?: string;
  front_view_url?: string;
  side_view_url?: string;
  back_view_url?: string;
  tags?: string;
}

export interface CostumeUpdateInput {
  name?: string;
  description?: string;
  category?: string;
  gender?: 'male' | 'female' | 'unisex';
  outfit_prompt?: string;
  image_url?: string;
  front_view_url?: string;
  side_view_url?: string;
  back_view_url?: string;
  tags?: string;
}

// 服装分类选项
export const COSTUME_CATEGORIES = [
  '日常',
  '战斗',
  '礼服',
  '休闲',
  '运动',
  '职业',
  '传统',
  '奇幻',
  '科幻',
  '其他'
] as const;

export type CostumeCategory = typeof COSTUME_CATEGORIES[number];

// ============================================================
// 服装资源 API
// ============================================================

/**
 * 获取项目的服装列表
 */
export async function fetchCostumes(
  projectId?: number | null,
  filters?: { category?: string; gender?: string }
): Promise<Costume[]> {
  const params = new URLSearchParams();
  if (projectId) params.set('projectId', String(projectId));
  if (filters?.category) params.set('category', filters.category);
  if (filters?.gender) params.set('gender', filters.gender);

  const response = await fetch(`/api/costumes?${params}`);

  if (!response.ok) {
    throw new Error('获取服装列表失败');
  }

  const data = await response.json();
  return data.costumes || [];
}

/**
 * 获取单个服装
 */
export async function fetchCostume(id: number): Promise<Costume> {
  const response = await fetch(`/api/costumes/${id}`);

  if (!response.ok) {
    const data = await response.json();
    throw new Error(data.message || '获取服装失败');
  }

  const data = await response.json();
  return data.costume;
}

/**
 * 创建服装
 */
export async function createCostume(input: CostumeCreateInput): Promise<Costume> {
  const response = await fetch('/api/costumes', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(input)
  });

  if (!response.ok) {
    const data = await response.json();
    throw new Error(data.message || '创建服装失败');
  }

  const data = await response.json();
  return data.costume;
}

/**
 * 更新服装
 */
export async function updateCostume(id: number, input: CostumeUpdateInput): Promise<Costume> {
  const response = await fetch(`/api/costumes/${id}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(input)
  });

  if (!response.ok) {
    const data = await response.json();
    throw new Error(data.message || '更新服装失败');
  }

  const data = await response.json();
  return data.costume;
}

/**
 * 删除服装
 */
export async function deleteCostume(id: number): Promise<void> {
  const response = await fetch(`/api/costumes/${id}`, {
    method: 'DELETE',
  });

  if (!response.ok) {
    const data = await response.json();
    throw new Error(data.message || '删除服装失败');
  }
}

// ============================================================
// 角色-服装关联 API
// ============================================================

/**
 * 获取角色的服装列表
 */
export async function fetchCharacterCostumes(characterId: number): Promise<{
  costumes: (Costume & { is_equipped: boolean; equipped_at?: string })[];
  characterGender: string;
}> {
  const response = await fetch(`/api/characters/${characterId}/costumes`);

  if (!response.ok) {
    const data = await response.json();
    throw new Error(data.message || '获取角色服装失败');
  }

  return await response.json();
}

/**
 * 为角色穿戴服装
 */
export async function equipCostume(characterId: number, costumeId: number): Promise<Costume> {
  const response = await fetch(
    `/api/characters/${characterId}/costumes/${costumeId}/equip`,
    {
      method: 'POST',
    }
  );

  if (!response.ok) {
    const data = await response.json();
    throw new Error(data.message || '穿戴服装失败');
  }

  const data = await response.json();
  return data.costume;
}

/**
 * 为角色脱下服装
 */
export async function unequipCostume(characterId: number, costumeId: number): Promise<void> {
  const response = await fetch(
    `/api/characters/${characterId}/costumes/${costumeId}/unequip`,
    {
      method: 'POST',
    }
  );

  if (!response.ok) {
    const data = await response.json();
    throw new Error(data.message || '脱下服装失败');
  }
}

/**
 * 移除角色服装关联
 */
export async function removeCharacterCostume(characterId: number, costumeId: number): Promise<void> {
  const response = await fetch(
    `/api/characters/${characterId}/costumes/${costumeId}`,
    {
      method: 'DELETE',
    }
  );

  if (!response.ok) {
    const data = await response.json();
    throw new Error(data.message || '移除服装关联失败');
  }
}

/**
 * 获取当前穿戴的服装
 */
export async function fetchEquippedCostume(characterId: number): Promise<Costume | null> {
  const response = await fetch(`/api/characters/${characterId}/equipped-costume`);

  if (!response.ok) {
    const data = await response.json();
    throw new Error(data.message || '获取穿戴服装失败');
  }

  const data = await response.json();
  return data.costume;
}

/**
 * 生成服装设定图（异步任务）
 * 基于通用白色 mannequin + outfit 描述，跨角色复用
 */
export async function generateCostumeViews(
  costumeId: number,
  params: { imageModel: string; textModel?: string; aspectRatio?: string }
): Promise<{ jobId: string; status: string; costumeId: number; message?: string }> {
  const response = await fetch(`/api/costumes/${costumeId}/generate-views`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(params)
  });

  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.message || '服装设定图生成失败');
  }

  return await response.json();
}

export async function generatePropViews(
  propId: number,
  params: { imageModel: string; textModel?: string; aspectRatio?: string }
): Promise<{ jobId: string; status: string; propId: number; message?: string }> {
  const response = await fetch(`/api/props/${propId}/generate-views`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(params)
  });

  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.message || '道具设定图生成失败');
  }

  return await response.json();
}
