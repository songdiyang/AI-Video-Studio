import { getAuthToken } from './auth';

// 标签分组接口
export interface TagGroup {
  id: number;
  user_id: number;
  name: string;
  color: string;
  sort_order: number;
  created_at?: string;
  updated_at?: string;
}

// 角色标签分组条目
export interface CharacterTagGroupEntry {
  groupId: number;
  groupName: string;
  tags: string[];
}

export interface Character {
  id: number;
  user_id: number;
  project_id?: number;
  name: string;
  description: string;
  appearance: string;
  personality: string;
  gender?: 'male' | 'female' | 'unknown';
  image_url: string;
  front_view_url?: string;
  side_view_url?: string;
  back_view_url?: string;
  character_sheet_url?: string;
  generation_status?: 'idle' | 'generating' | 'completed' | 'failed';
  generation_prompt?: string;
  tags: string;
  tag_groups_json?: CharacterTagGroupEntry[] | null;
  project_name?: string;
  states_count?: number;
  created_at: string;
  updated_at: string;
}

export interface SpatialLayout {
  foreground?: string;
  midground?: string;
  background?: string;
  depthNotes?: string;
}

export interface CameraDefaults {
  angle?: string;      // 平视/仰视/俑视
  distance?: string;   // 远景/中景/近景/特写
  height?: string;     // 低角度/水平/高角度
  movement?: string;   // 固定/推拉/环绕
}

export interface Scene {
  id: number;
  user_id: number;
  name: string;
  description: string;
  environment: string;
  lighting: string;
  mood: string;
  image_url: string;
  reverse_image_url?: string;
  sketch_url?: string | null;
  tags: string;
  project_name?: string;
  spatial_layout?: SpatialLayout | null;
  camera_defaults?: CameraDefaults | null;
  created_at: string;
  updated_at: string;
}

export interface Prop {
  id: number;
  user_id: number;
  project_id: number;
  name: string;
  description: string;
  category: string;
  image_url: string;
  tags: string;
  generation_status?: 'idle' | 'generating' | 'completed' | 'failed';
  generation_prompt?: string;
  style_config?: PropStyleConfig | null;
  created_at: string;
  updated_at: string;
}

// 道具样式配置接口
export interface PropStyleConfig {
  material?: string;
  primaryColor?: string;
  secondaryColor?: string;
  texture?: string;
  size?: string;
  condition?: string;
  style?: string;
  era?: string;
  details?: string;
}

// 道具状态接口
export interface PropState {
  id: number;
  prop_id: number;
  name: string;
  description: string;
  image_url: string;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

// 道具生成状态响应
export interface PropGenerationStatusResponse {
  status: 'idle' | 'generating' | 'completed' | 'failed';
  imageUrl?: string;
  prompt?: string;
  job?: {
    jobId: string;
    status: string;
    currentStep: number;
    error?: string;
  } | null;
}

// ============================================================
// 角色状态接口
// ============================================================

export interface CharacterState {
  id: number;
  character_id: number;
  is_base_model?: boolean;    // 是否为基础白膜状态
  costume_id?: number | null; // 关联的服装ID
  name: string;
  description: string;
  appearance: string;
  gender?: 'male' | 'female' | 'unknown';
  image_url: string;
  front_view_url: string;
  side_view_url: string;
  back_view_url: string;
  sort_order: number;
  created_at: string;
  updated_at: string;
  // 新增外观属性
  outfit?: string;           // 服装描述
  age_stage?: string;        // 年龄阶段
  hairstyle?: string;        // 发型描述
  accessories?: string;      // 配饰JSON
  use_reference_images?: boolean; // 是否使用参考图生成
  is_active?: boolean;       // 是否激活
  generation_prompt?: string;
  generation_status?: 'idle' | 'generating' | 'completed' | 'failed';
  // 状态分类和标签
  state_category?: StateCategory;  // 状态分类
  tags?: string;                   // 状态标签JSON数组
}

// 状态分类类型
export type StateCategory = 'daily' | 'costume' | 'time' | 'effect';

// 状态分类配置
export const STATE_CATEGORIES: { key: StateCategory; label: string; color: string; icon: string }[] = [
  { key: 'daily', label: '日常状态', color: 'blue', icon: 'User' },
  { key: 'costume', label: '服装变化', color: 'pink', icon: 'Shirt' },
  { key: 'time', label: '时间相关', color: 'purple', icon: 'Clock' },
  { key: 'effect', label: '效果状态', color: 'amber', icon: 'Sparkles' },
];

// 角色状态变更历史记录
export interface CharacterStateHistoryEntry {
  id: number;
  character_id: number;
  state_id: number;
  action: 'created' | 'updated' | 'activated' | 'deactivated' | 'deleted' | 'duplicated';
  changes: Record<string, { from: any; to: any }> | null;
  snapshot: Partial<CharacterState> | null;
  performed_by: number;
  created_at: string;
}

// 历史查询响应
export interface CharacterStateHistoryResponse {
  history: CharacterStateHistoryEntry[];
  total: number;
  limit: number;
  offset: number;
}

// 年龄阶段选项
export const AGE_STAGES = ['童年', '少年', '青年', '中年', '老年'] as const;
export type AgeStage = typeof AGE_STAGES[number];

// ============================================================
// 资产参考图接口
// ============================================================

export type AssetReferenceType = 'character' | 'character_state' | 'prop';

/** 参考图视角类型 */
export type ReferenceViewType = 'front' | 'side' | 'back' | 'other';

/** 视角类型配置：标签、描述、颜色 */
export const VIEW_TYPE_CONFIG: Record<ReferenceViewType, { label: string; desc: string; color: string }> = {
  front: { label: '正面', desc: '角色正面形象，适用于面部特写、正面全身等場景', color: 'text-blue-400' },
  side: { label: '侧面', desc: '角色侧面轮廓，适用于过肩镜头、侧面特写等場景', color: 'text-green-400' },
  back: { label: '背面', desc: '角色背面形象，适用于背影镜头、远景等場景', color: 'text-purple-400' },
  other: { label: '其他', desc: '其他参考图，用于补充角色细节', color: 'text-slate-400' }
};

export interface AssetReferenceImage {
  id: number;
  asset_type: AssetReferenceType;
  asset_id: number;
  image_url: string;
  description: string | null;
  view_type: ReferenceViewType;
  sort_order: number;
  is_enabled: boolean;
  created_at: string;
}

// 角色API
export async function fetchCharacters(): Promise<Character[]> {
  const token = getAuthToken();
  const response = await fetch('/api/characters', {
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    }
  });
  if (!response.ok) {
    throw new Error('获取角色列表失败');
  }
  const data = await response.json();
  return data.characters || [];
}

export async function createCharacter(character: Partial<Character>): Promise<Character> {
  const token = getAuthToken();
  const response = await fetch('/api/characters', {
    method: 'POST',
    headers: { 
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    },
    body: JSON.stringify(character)
  });
  if (!response.ok) {
    const data = await response.json();
    throw new Error(data.message || '创建角色失败');
  }
  const data = await response.json();
  return data.character;
}

export async function updateCharacter(id: number, character: Partial<Character>): Promise<Character> {
  const token = getAuthToken();
  const response = await fetch(`/api/characters/${id}`, {
    method: 'PUT',
    headers: { 
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    },
    body: JSON.stringify(character)
  });
  if (!response.ok) {
    const data = await response.json();
    throw new Error(data.message || '更新角色失败');
  }
  const data = await response.json();
  return data.character;
}

export async function deleteCharacter(id: number): Promise<void> {
  const token = getAuthToken();
  const response = await fetch(`/api/characters/${id}`, {
    method: 'DELETE',
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    }
  });
  if (!response.ok) {
    const data = await response.json();
    throw new Error(data.message || '删除角色失败');
  }
}

/**
 * 获取单个角色详情
 */
export async function fetchCharacter(characterId: number): Promise<Character> {
  const token = getAuthToken();
  const response = await fetch(`/api/characters/${characterId}`, {
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    }
  });
  if (!response.ok) {
    throw new Error('获取角色详情失败');
  }
  const data = await response.json();
  return data.character;
}

/**
 * 上传角色参考图片
 */
export async function uploadCharacterImage(
  characterId: number,
  file: File
): Promise<{ image_url: string }> {
  const token = getAuthToken();
  const formData = new FormData();
  formData.append('image', file);

  const response = await fetch(`/api/characters/${characterId}/upload-image`, {
    method: 'POST',
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    },
    body: formData
  });
  if (!response.ok) {
    const data = await response.json();
    throw new Error(data.message || '上传图片失败');
  }
  return response.json();
}

// 场景API
export async function fetchScenes(): Promise<Scene[]> {
  const token = getAuthToken();
  const response = await fetch('/api/scenes', {
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    }
  });
  if (!response.ok) {
    throw new Error('获取场景列表失败');
  }
  const data = await response.json();
  return data.scenes || [];
}

export async function createScene(scene: Partial<Scene>): Promise<Scene> {
  const token = getAuthToken();
  const response = await fetch('/api/scenes', {
    method: 'POST',
    headers: { 
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    },
    body: JSON.stringify(scene)
  });
  if (!response.ok) {
    const data = await response.json();
    throw new Error(data.message || '创建场景失败');
  }
  const data = await response.json();
  return data.scene;
}

export async function updateScene(id: number, scene: Partial<Scene>): Promise<Scene> {
  const token = getAuthToken();
  const response = await fetch(`/api/scenes/${id}`, {
    method: 'PUT',
    headers: { 
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    },
    body: JSON.stringify(scene)
  });
  if (!response.ok) {
    const data = await response.json();
    throw new Error(data.message || '更新场景失败');
  }
  const data = await response.json();
  return data.scene;
}

export async function deleteScene(id: number): Promise<void> {
  const token = getAuthToken();
  const response = await fetch(`/api/scenes/${id}`, {
    method: 'DELETE',
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    }
  });
  if (!response.ok) {
    const data = await response.json();
    throw new Error(data.message || '删除场景失败');
  }
}

// 道具API
export async function fetchProps(): Promise<Prop[]> {
  const token = getAuthToken();
  const response = await fetch('/api/props', {
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    }
  });
  if (!response.ok) {
    throw new Error('获取道具列表失败');
  }
  const data = await response.json();
  return data.props || [];
}

export async function createProp(prop: Partial<Prop>): Promise<Prop> {
  const token = getAuthToken();
  const response = await fetch('/api/props', {
    method: 'POST',
    headers: { 
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    },
    body: JSON.stringify(prop)
  });
  if (!response.ok) {
    const data = await response.json();
    throw new Error(data.message || '创建道具失败');
  }
  const data = await response.json();
  return data.prop;
}

export async function updateProp(id: number, prop: Partial<Prop>): Promise<Prop> {
  const token = getAuthToken();
  const response = await fetch(`/api/props/${id}`, {
    method: 'PUT',
    headers: { 
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    },
    body: JSON.stringify(prop)
  });
  if (!response.ok) {
    const data = await response.json();
    throw new Error(data.message || '更新道具失败');
  }
  const data = await response.json();
  return data.prop;
}

export async function deleteProp(id: number): Promise<void> {
  const token = getAuthToken();
  const response = await fetch(`/api/props/${id}`, {
    method: 'DELETE',
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    }
  });
  if (!response.ok) {
    const data = await response.json();
    throw new Error(data.message || '删除道具失败');
  }
}

// ============================================================
// 标签分组 API
// ============================================================

// 预设颜色方案 - 优化对比度，符合 WCAG AA 标准
export const TAG_GROUP_COLORS = [
  '#dc2626', // 红 - 更深的红色
  '#ea580c', // 橙 - 更深的橙色
  '#ca8a04', // 黄 - 金黄色
  '#16a34a', // 绿 - 更深的绿色
  '#0891b2', // 青 - 更深的青色
  '#2563eb', // 蓝 - 更深的蓝色
  '#7c3aed', // 紫 - 更深的紫色
  '#db2777', // 粉 - 更深的粉色
  '#4b5563', // 灰 - 更深的灰色
  '#78350f', // 棕 - 更深的棕色
];

export async function fetchTagGroups(): Promise<TagGroup[]> {
  const token = getAuthToken();
  const response = await fetch('/api/characters/tag-groups', {
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    }
  });
  if (!response.ok) {
    throw new Error('获取标签分组失败');
  }
  const data = await response.json();
  return data.tagGroups || [];
}

export async function createTagGroup(data: { name: string; color: string; sort_order?: number }): Promise<TagGroup> {
  const token = getAuthToken();
  const response = await fetch('/api/characters/tag-groups', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    },
    body: JSON.stringify(data)
  });
  if (!response.ok) {
    const result = await response.json();
    throw new Error(result.message || '创建标签分组失败');
  }
  const result = await response.json();
  return result.tagGroup;
}

export async function updateTagGroup(id: number, data: Partial<TagGroup>): Promise<TagGroup> {
  const token = getAuthToken();
  const response = await fetch(`/api/characters/tag-groups/${id}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    },
    body: JSON.stringify(data)
  });
  if (!response.ok) {
    const result = await response.json();
    throw new Error(result.message || '更新标签分组失败');
  }
  const result = await response.json();
  return result.tagGroup;
}

export async function deleteTagGroup(id: number): Promise<void> {
  const token = getAuthToken();
  const response = await fetch(`/api/characters/tag-groups/${id}`, {
    method: 'DELETE',
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    }
  });
  if (!response.ok) {
    const result = await response.json();
    throw new Error(result.message || '删除标签分组失败');
  }
}

// ============================================================
// 角色三视图 API
// ============================================================

export interface GenerateViewsParams {
  imageModel: string;
  textModel?: string;
  aspectRatio?: string;
  regenerateOnly?: ('front' | 'side' | 'back')[];
}

export interface GenerateViewsResponse {
  message: string;
  jobId: string;
  characterId: number;
  status: 'generating';
}

export interface GenerateConceptParams {
  imageModel: string;
  textModel?: string;
}

export interface GenerateConceptResponse {
  message: string;
  jobId: string;
  characterId: number;
  status: 'generating';
}

export interface GenerationStatusResponse {
  status: 'idle' | 'generating' | 'completed' | 'failed';
  progress?: string;
  error?: string;
  conceptStatus?: 'idle' | 'generating' | 'completed' | 'failed';
  conceptImageUrl?: string | null;
  useReferenceImages?: boolean;
}

/**
 * 生成角色三视图
 */
export async function generateCharacterViews(
  characterId: number,
  params: GenerateViewsParams
): Promise<GenerateViewsResponse> {
  const token = getAuthToken();
  const response = await fetch(`/api/characters/${characterId}/generate-views`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    },
    body: JSON.stringify(params)
  });
  if (!response.ok) {
    const result = await response.json();
    throw new Error(result.message || '启动三视图生成失败');
  }
  return response.json();
}

/**
 * 生成角色概念分解图
 */
export async function generateConceptBreakdown(
  characterId: number,
  params: GenerateConceptParams
): Promise<GenerateConceptResponse> {
  const token = getAuthToken();
  const response = await fetch(`/api/characters/${characterId}/generate-concept`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    },
    body: JSON.stringify(params)
  });
  if (!response.ok) {
    const result = await response.json();
    throw new Error(result.message || '启动概念分解图生成失败');
  }
  return response.json();
}

/**
 * 删除角色单个视图
 */
export async function deleteCharacterViewApi(
  characterId: number,
  viewType: 'front' | 'side' | 'back'
): Promise<{ message: string; front_view_url: string | null; side_view_url: string | null; back_view_url: string | null; image_url: string | null }> {
  const token = getAuthToken();
  const response = await fetch(`/api/characters/${characterId}/views/${viewType}`, {
    method: 'DELETE',
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    }
  });
  if (!response.ok) {
    const result = await response.json();
    throw new Error(result.message || '删除视图失败');
  }
  return response.json();
}

/**
 * 查询角色三视图生成状态
 */
export async function getCharacterViewStatus(
  characterId: number
): Promise<GenerationStatusResponse> {
  const token = getAuthToken();
  const response = await fetch(`/api/characters/${characterId}/generation-status`, {
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    }
  });
  if (!response.ok) {
    const result = await response.json();
    throw new Error(result.message || '查询生成状态失败');
  }
  return response.json();
}

/**
 * 更新角色使用参考图开关
 */
export async function updateCharacterUseReferenceImages(
  characterId: number,
  useReferenceImages: boolean
): Promise<{ message: string; useReferenceImages: boolean }> {
  const token = getAuthToken();
  const response = await fetch(`/api/characters/${characterId}/use-reference-images`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    },
    body: JSON.stringify({ use_reference_images: useReferenceImages })
  });
  if (!response.ok) {
    const result = await response.json();
    throw new Error(result.message || '更新参考图设置失败');
  }
  return response.json();
}

/**
 * 下载单个视图图片
 */
export async function downloadCharacterView(
  url: string,
  fileName: string
): Promise<void> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error('下载图片失败');
  }
  const blob = await response.blob();
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(a.href);
}

/**
 * 批量下载角色三视图为ZIP文件
 */
export async function downloadAllCharacterViews(
  character: Character
): Promise<void> {
  const JSZip = (await import('jszip')).default;
  const zip = new JSZip();
  
  const views = [
    { url: character.front_view_url, name: `${character.name}_正面.png` },
    { url: character.side_view_url, name: `${character.name}_侧面.png` },
    { url: character.back_view_url, name: `${character.name}_背面.png` },
  ].filter(item => item.url);
  
  if (views.length === 0) {
    throw new Error('没有可下载的三视图');
  }
  
  // 下载所有图片并添加到 ZIP
  const downloadPromises = views.map(async (item) => {
    if (!item.url) return;
    try {
      const response = await fetch(item.url);
      if (response.ok) {
        const blob = await response.blob();
        zip.file(item.name, blob);
      }
    } catch (e) {
      console.error(`下载 ${item.name} 失败:`, e);
    }
  });
  
  await Promise.all(downloadPromises);
  
  // 生成并下载 ZIP 文件
  const content = await zip.generateAsync({ type: 'blob' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(content);
  a.download = `${character.name}_三视图.zip`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(a.href);
}

// ============================================================
// 角色状态 API
// ============================================================

/**
 * 获取角色的所有状态
 */
export async function fetchCharacterStates(characterId: number): Promise<CharacterState[]> {
  const token = getAuthToken();
  const response = await fetch(`/api/characters/${characterId}/states`, {
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    }
  });
  if (!response.ok) {
    const result = await response.json();
    throw new Error(result.message || '获取角色状态失败');
  }
  const data = await response.json();
  return data.states || [];
}

/**
 * 按分类获取角色状态
 */
export async function fetchCharacterStatesByCategory(
  characterId: number,
  category?: StateCategory
): Promise<{ states: CharacterState[]; grouped: Record<string, CharacterState[]> }> {
  const token = getAuthToken();
  const queryParams = new URLSearchParams();
  if (category) queryParams.append('category', category);

  const url = `/api/characters/${characterId}/states/by-category${queryParams.toString() ? '?' + queryParams.toString() : ''}`;
  const response = await fetch(url, {
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    }
  });
  if (!response.ok) {
    const result = await response.json();
    throw new Error(result.message || '获取角色状态分类失败');
  }
  return response.json();
}

/**
 * 创建角色状态
 */
export async function createCharacterState(
  characterId: number,
  data: Partial<CharacterState>
): Promise<CharacterState> {
  const token = getAuthToken();
  const response = await fetch(`/api/characters/${characterId}/states`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    },
    body: JSON.stringify(data)
  });
  if (!response.ok) {
    const result = await response.json();
    throw new Error(result.message || '创建角色状态失败');
  }
  const result = await response.json();
  return result.state;
}

/**
 * 更新角色状态
 */
export async function updateCharacterState(
  characterId: number,
  stateId: number,
  data: Partial<CharacterState>
): Promise<CharacterState> {
  const token = getAuthToken();
  const response = await fetch(`/api/characters/${characterId}/states/${stateId}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    },
    body: JSON.stringify(data)
  });
  if (!response.ok) {
    const result = await response.json();
    throw new Error(result.message || '更新角色状态失败');
  }
  const result = await response.json();
  return result.state;
}

/**
 * 删除角色状态
 */
export async function deleteCharacterState(
  characterId: number,
  stateId: number
): Promise<void> {
  const token = getAuthToken();
  const response = await fetch(`/api/characters/${characterId}/states/${stateId}`, {
    method: 'DELETE',
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    }
  });
  if (!response.ok) {
    const result = await response.json();
    throw new Error(result.message || '删除角色状态失败');
  }
}

/**
 * 激活角色状态
 */
export async function activateCharacterState(
  characterId: number,
  stateId: number
): Promise<CharacterState> {
  const token = getAuthToken();
  const response = await fetch(`/api/characters/${characterId}/states/${stateId}/activate`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    }
  });
  if (!response.ok) {
    const result = await response.json();
    throw new Error(result.message || '激活状态失败');
  }
  const data = await response.json();
  return data.state;
}

/**
 * 复制角色状态
 */
export async function duplicateCharacterState(
  characterId: number,
  stateId: number,
  newName?: string
): Promise<CharacterState> {
  const token = getAuthToken();
  const response = await fetch(`/api/characters/${characterId}/states/${stateId}/duplicate`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    },
    body: JSON.stringify({ newName })
  });
  if (!response.ok) {
    const result = await response.json();
    throw new Error(result.message || '复制状态失败');
  }
  const data = await response.json();
  return data.state;
}

/**
 * 为角色状态生成三视图
 * 后端会自动从角色和状态数据中组装外貌属性（appearance/outfit/hairstyle/accessories/age_stage）
 */
export async function generateCharacterStateViews(
  characterId: number,
  stateId: number,
  params: { imageModel: string; textModel?: string; regenerateOnly?: ('front' | 'side' | 'back')[] }
): Promise<{ message: string; jobId: string; characterId: number; stateId: number; status: string }> {
  const token = getAuthToken();
  const response = await fetch(`/api/characters/${characterId}/states/${stateId}/generate-views`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    },
    body: JSON.stringify(params)
  });
  if (!response.ok) {
    const result = await response.json();
    throw new Error(result.message || '启动生成失败');
  }
  return await response.json();
}

/**
 * 获取角色的激活状态
 */
export async function getActiveCharacterState(
  characterId: number
): Promise<CharacterState | null> {
  const token = getAuthToken();
  const response = await fetch(`/api/characters/${characterId}/active-state`, {
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    }
  });
  if (!response.ok) {
    const result = await response.json();
    throw new Error(result.message || '获取激活状态失败');
  }
  const data = await response.json();
  return data.state;
}

/**
 * 获取角色状态变更历史
 */
export async function fetchCharacterStateHistory(
  characterId: number,
  params?: { stateId?: number; action?: string; limit?: number; offset?: number }
): Promise<CharacterStateHistoryResponse> {
  const token = getAuthToken();
  const queryParams = new URLSearchParams();
  if (params?.action) queryParams.append('action', params.action);
  if (params?.limit) queryParams.append('limit', String(params.limit));
  if (params?.offset) queryParams.append('offset', String(params.offset));

  const queryString = queryParams.toString();
  let url: string;

  if (params?.stateId) {
    url = `/api/characters/${characterId}/states/${params.stateId}/history`;
  } else {
    url = `/api/characters/${characterId}/states/history`;
  }

  if (queryString) url += `?${queryString}`;

  const response = await fetch(url, {
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    }
  });
  if (!response.ok) {
    const result = await response.json();
    throw new Error(result.message || '获取状态历史失败');
  }
  return response.json();
}

// ============================================================
// 参考图 API
// ============================================================

/**
 * 获取资产的参考图
 * @param enabledOnly 是否只获取启用的参考图
 */
export async function fetchReferenceImages(
  assetType: AssetReferenceType,
  assetId: number,
  enabledOnly: boolean = false
): Promise<AssetReferenceImage[]> {
  const token = getAuthToken();
  const params = new URLSearchParams({
    asset_type: assetType,
    asset_id: assetId.toString()
  });
  if (enabledOnly) {
    params.append('enabled_only', 'true');
  }
  
  const response = await fetch(
    `/api/reference-images?${params.toString()}`,
    {
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {})
      }
    }
  );
  if (!response.ok) {
    const result = await response.json();
    throw new Error(result.message || '获取参考图失败');
  }
  const data = await response.json();
  return data.images || [];
}

/**
 * 上传参考图
 */
export async function uploadReferenceImage(
  assetType: AssetReferenceType,
  assetId: number,
  imageUrl: string,
  description?: string,
  viewType?: ReferenceViewType,
  isEnabled: boolean = true
): Promise<AssetReferenceImage> {
  const token = getAuthToken();
  const response = await fetch('/api/reference-images', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    },
    body: JSON.stringify({
      asset_type: assetType,
      asset_id: assetId,
      image_url: imageUrl,
      description,
      view_type: viewType || 'other',
      is_enabled: isEnabled
    })
  });
  if (!response.ok) {
    const result = await response.json();
    throw new Error(result.message || '上传参考图失败');
  }
  const result = await response.json();
  return result.image;
}

/**
 * 更新参考图
 */
export async function updateReferenceImage(
  imageId: number,
  data: { image_url?: string; description?: string; sort_order?: number; view_type?: ReferenceViewType; is_enabled?: boolean }
): Promise<AssetReferenceImage> {
  const token = getAuthToken();
  const response = await fetch(`/api/reference-images/${imageId}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    },
    body: JSON.stringify(data)
  });
  if (!response.ok) {
    const result = await response.json();
    throw new Error(result.message || '更新参考图失败');
  }
  const result = await response.json();
  return result.image;
}

/**
 * 删除参考图
 */
export async function deleteReferenceImage(imageId: number): Promise<void> {
  const token = getAuthToken();
  const response = await fetch(`/api/reference-images/${imageId}`, {
    method: 'DELETE',
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    }
  });
  if (!response.ok) {
    const result = await response.json();
    throw new Error(result.message || '删除参考图失败');
  }
}

/**
 * 批量重排序参考图
 */
export async function batchReorderReferenceImages(
  orders: { id: number; sort_order: number }[]
): Promise<void> {
  const token = getAuthToken();
  const response = await fetch('/api/reference-images/batch-reorder', {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    },
    body: JSON.stringify({ orders })
  });
  if (!response.ok) {
    const result = await response.json();
    throw new Error(result.message || '重排序参考图失败');
  }
}

// ============================================================
// 道具生成 API
// ============================================================

/**
 * 生成道具图片
 */
export async function generatePropImage(
  propId: number,
  params: {
    imageModel: string;
    textModel?: string;
    styleConfig?: PropStyleConfig;
  }
): Promise<{ jobId: string; propId: number; status: string }> {
  const token = getAuthToken();
  const response = await fetch(`/api/props/${propId}/generate-image`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    },
    body: JSON.stringify(params)
  });
  if (!response.ok) {
    const result = await response.json();
    throw new Error(result.message || '启动道具图片生成失败');
  }
  return response.json();
}

/**
 * 获取道具生成状态
 */
export async function getPropGenerationStatus(
  propId: number
): Promise<PropGenerationStatusResponse> {
  const token = getAuthToken();
  const response = await fetch(`/api/props/${propId}/generation-status`, {
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    }
  });
  if (!response.ok) {
    const result = await response.json();
    throw new Error(result.message || '查询道具生成状态失败');
  }
  return response.json();
}

/**
 * 更新道具样式配置
 */
export async function updatePropStyleConfig(
  propId: number,
  styleConfig: PropStyleConfig
): Promise<{ styleConfig: PropStyleConfig }> {
  const token = getAuthToken();
  const response = await fetch(`/api/props/${propId}/style-config`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    },
    body: JSON.stringify({ styleConfig })
  });
  if (!response.ok) {
    const result = await response.json();
    throw new Error(result.message || '更新道具样式配置失败');
  }
  return response.json();
}

// ============================================================
// 道具状态 API
// ============================================================

/**
 * 获取道具的所有状态
 */
export async function fetchPropStates(propId: number): Promise<PropState[]> {
  const token = getAuthToken();
  const response = await fetch(`/api/props/${propId}/states`, {
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    }
  });
  if (!response.ok) {
    const result = await response.json();
    throw new Error(result.message || '获取道具状态失败');
  }
  const data = await response.json();
  return data.states || [];
}

/**
 * 创建道具状态
 */
export async function createPropState(
  propId: number,
  data: Partial<PropState>
): Promise<PropState> {
  const token = getAuthToken();
  const response = await fetch(`/api/props/${propId}/states`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    },
    body: JSON.stringify(data)
  });
  if (!response.ok) {
    const result = await response.json();
    throw new Error(result.message || '创建道具状态失败');
  }
  const result = await response.json();
  return result.state;
}

/**
 * 更新道具状态
 */
export async function updatePropState(
  propId: number,
  stateId: number,
  data: Partial<PropState>
): Promise<PropState> {
  const token = getAuthToken();
  const response = await fetch(`/api/props/${propId}/states/${stateId}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    },
    body: JSON.stringify(data)
  });
  if (!response.ok) {
    const result = await response.json();
    throw new Error(result.message || '更新道具状态失败');
  }
  const result = await response.json();
  return result.state;
}

/**
 * 删除道具状态
 */
export async function deletePropState(
  propId: number,
  stateId: number
): Promise<void> {
  const token = getAuthToken();
  const response = await fetch(`/api/props/${propId}/states/${stateId}`, {
    method: 'DELETE',
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    }
  });
  if (!response.ok) {
    const result = await response.json();
    throw new Error(result.message || '删除道具状态失败');
  }
}

// ============================================================
// 场景草图 API
// ============================================================

/**
 * 上传场景草图
 * @param sceneId 场景ID
 * @param file 草图文件
 * @returns 草图URL
 */
export async function uploadSceneSketch(
  sceneId: number,
  file: File
): Promise<{ sketch_url: string }> {
  const token = getAuthToken();
  const formData = new FormData();
  formData.append('sketch', file);

  const response = await fetch(`/api/scenes/${sceneId}/sketch`, {
    method: 'POST',
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    },
    body: formData
  });

  if (!response.ok) {
    const result = await response.json();
    throw new Error(result.message || '上传场景草图失败');
  }
  return response.json();
}

/**
 * 删除场景草图
 * @param sceneId 场景ID
 */
export async function deleteSceneSketch(sceneId: number): Promise<void> {
  const token = getAuthToken();
  const response = await fetch(`/api/scenes/${sceneId}/sketch`, {
    method: 'DELETE',
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    }
  });

  if (!response.ok) {
    const result = await response.json();
    throw new Error(result.message || '删除场景草图失败');
  }
}

/**
 * 获取场景草图
 * @param sceneId 场景ID
 * @returns 草图URL
 */
export async function getSceneSketch(
  sceneId: number
): Promise<{ sketch_url: string | null }> {
  const token = getAuthToken();
  const response = await fetch(`/api/scenes/${sceneId}/sketch`, {
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    }
  });

  if (!response.ok) {
    const result = await response.json();
    throw new Error(result.message || '获取场景草图失败');
  }
  return response.json();
}

// ============================================================
// 文件上传 API
// ============================================================

/**
 * 上传文件到 MinIO（直接上传本地文件）
 * @param file 本地文件对象
 * @param assetType 资产类型
 * @param assetId 资产ID
 * @param viewType 视角类型
 * @param description 图片描述
 * @param onProgress 上传进度回调 (0-100)
 * @returns 上传结果
 */
export async function uploadFileToMinIO(
  file: File,
  assetType: AssetReferenceType,
  assetId: number,
  viewType: ReferenceViewType = 'other',
  description?: string,
  onProgress?: (progress: number) => void
): Promise<{ image: AssetReferenceImage; url: string }> {
  const token = getAuthToken();
  const formData = new FormData();
  formData.append('file', file);
  formData.append('asset_type', assetType);
  formData.append('asset_id', assetId.toString());
  formData.append('view_type', viewType);
  if (description) {
    formData.append('description', description);
  }

  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();

    // 上传进度监听
    if (onProgress) {
      xhr.upload.addEventListener('progress', (event) => {
        if (event.lengthComputable) {
          const progress = Math.round((event.loaded / event.total) * 100);
          onProgress(progress);
        }
      });
    }

    xhr.addEventListener('load', () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          const result = JSON.parse(xhr.responseText);
          resolve(result);
        } catch (error) {
          reject(new Error('解析响应失败'));
        }
      } else {
        try {
          const result = JSON.parse(xhr.responseText);
          reject(new Error(result.message || '上传失败'));
        } catch {
          reject(new Error(`上传失败 (${xhr.status})`));
        }
      }
    });

    xhr.addEventListener('error', () => {
      reject(new Error('网络错误，上传失败'));
    });

    xhr.addEventListener('abort', () => {
      reject(new Error('上传已取消'));
    });

    xhr.open('POST', '/api/upload');
    if (token) {
      xhr.setRequestHeader('Authorization', `Bearer ${token}`);
    }
    xhr.send(formData);
  });
}

/**
 * 检查上传服务状态
 * @returns 服务状态
 */
export async function checkUploadStatus(): Promise<{
  ready: boolean;
  maxFileSize: number;
  allowedTypes: string[];
}> {
  const token = getAuthToken();
  const response = await fetch('/api/upload/status', {
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    }
  });

  if (!response.ok) {
    const result = await response.json();
    throw new Error(result.message || '检查上传服务状态失败');
  }
  return response.json();
}
