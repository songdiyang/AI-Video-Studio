import { getAuthToken } from './auth';

/**
 * 将内网 MinIO URL 规范化为 /storage/ 相对路径
 * 例: http://39.105.158.61:9000/nanostory/images/xxx.png → /storage/images/xxx.png
 */
function normalizeStorageUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  // 已经是 /storage/ 开头的相对路径，直接返回
  if (url.startsWith('/storage/')) return url;
  // 匹配 http(s)://{minio-host}:{port}/{bucket}/xxx 格式
  const match = url.match(/^https?:\/\/[^/]+\/nanostory\/(.+)$/);
  if (match) return `/storage/${match[1]}`;
  return url;
}

/** 规范化角色数据中的所有 MinIO URL */
function normalizeCharacterUrls<T extends Record<string, any>>(char: T): T {
  if (!char) return char;
  const urlFields = ['image_url', 'front_view_url', 'side_view_url', 'back_view_url', 'character_sheet_url', 'concept_image_url', 'base_model_image_url', 'active_state_image_url', 'first_state_front_view_url'];
  const result: Record<string, any> = { ...char };
  for (const field of urlFields) {
    if (result[field]) {
      result[field] = normalizeStorageUrl(result[field]);
    }
  }
  return result as T;
}

/** 规范化场景数据中的所有 MinIO URL */
function normalizeSceneUrls<T extends Record<string, any>>(scene: T): T {
  if (!scene) return scene;
  const urlFields = ['image_url', 'reverse_image_url', 'reference_image_url', 'panorama_image_url'];
  const result: Record<string, any> = { ...scene };
  for (const field of urlFields) {
    if (result[field]) {
      result[field] = normalizeStorageUrl(result[field]);
    }
  }
  return result as T;
}

/** 规范化角色状态数据中的所有 MinIO URL */
function normalizeStateUrls<T extends Record<string, any>>(state: T): T {
  if (!state) return state;
  const urlFields = ['image_url', 'front_view_url', 'side_view_url', 'back_view_url'];
  const result: Record<string, any> = { ...state };
  for (const field of urlFields) {
    if (result[field]) {
      result[field] = normalizeStorageUrl(result[field]);
    }
  }
  return result as T;
}

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
  base_appearance?: string;   // 白膜体貌描述（不含服装的身体特征）
  outfit_appearance?: string; // 服装外貌描述（服装、配饰等可更换装饰）
  personality: string;
  gender?: 'male' | 'female' | 'unknown';
  image_url: string;
  front_view_url?: string;
  side_view_url?: string;
  back_view_url?: string;
  character_sheet_url?: string;
  concept_image_url?: string;
  concept_generation_status?: 'idle' | 'generating' | 'completed' | 'failed';
  generation_status?: 'idle' | 'generating' | 'completed' | 'failed';
  generation_prompt?: string;
  tags: string;
  tag_groups_json?: CharacterTagGroupEntry[] | null;
  project_name?: string;
  states_count?: number;
  use_reference_images?: boolean;
  // 白膜/服装状态概要（来自 getByProject API 的 LEFT JOIN）
  base_model_image_url?: string;     // 白膜正面图 URL
  has_base_model_views?: number; // 是否已生成白膜三视图（0/1）
  active_state_name?: string;        // 当前激活状态名称
  active_state_outfit?: string;      // 当前激活状态服装描述
  active_state_image_url?: string;   // 当前激活状态正面图
  first_state_front_view_url?: string; // 第一个角色状态的正面图（白膜优先，列表预览用）
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
  project_id?: number | null;
  script_id?: number | null;
  name: string;
  description: string;
  environment: string;
  lighting: string;
  mood: string;
  image_url: string;
  reverse_image_url?: string;
  sketch_url?: string | null;
  reference_image_url?: string | null;
  panorama_image_url?: string | null;
  tags: string;
  project_name?: string;
  studio_id?: number | null;
  studio_name?: string | null;
  spatial_layout?: SpatialLayout | null;
  camera_defaults?: CameraDefaults | null;
  source?: string;
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
  // 道具系统扩展字段
  prop_type?: 'permanent' | 'interactive';
  is_equipped?: boolean;
  front_view_url?: string;
  side_view_url?: string;
  back_view_url?: string;
  created_at: string;
  updated_at: string;
}

// 角色状态关联的道具信息
export interface EquippedProp {
  prop_id: number;
  name: string;
  image_url: string;
  prop_type: 'permanent' | 'interactive';
  hand_position: string;
  usage_mode: string;
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
  body_elements?: string;    // 身体元素（纹身、疤痕、胎记等，白膜专用）
  held_props?: string;       // 手持道具描述（当前状态下角色手里拿着或身上携带的物品）
  use_reference_images?: boolean; // 是否使用参考图生成
  is_active?: boolean;       // 是否激活
  generation_prompt?: string;
  generation_status?: 'idle' | 'generating' | 'completed' | 'failed';
  // 状态分类和标签
  state_category?: StateCategory | StateCategory[];  // 状态分类（支持多选）
  tags?: string;                   // 状态标签JSON数组
  // 关联服装资产信息（LEFT JOIN costumes）
  costume_name?: string | null;
  costume_image_url?: string | null;
  costume_generation_status?: 'pending' | 'generating' | 'completed' | 'failed' | null;
  // 关联道具信息（LEFT JOIN character_state_props + props）
  equipped_props?: EquippedProp[];
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
  return (data.characters || []).map(normalizeCharacterUrls);
}

/** 按项目获取角色列表（支持团队成员访问） */
export async function fetchCharactersByProject(projectId: number): Promise<Character[]> {
  const token = getAuthToken();
  const response = await fetch(`/api/characters/project/${projectId}`, {
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    }
  });
  if (!response.ok) {
    throw new Error('获取项目角色列表失败');
  }
  const data = await response.json();
  return (data.characters || []).map(normalizeCharacterUrls);
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
  return normalizeCharacterUrls(data.character);
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
  return normalizeCharacterUrls(data.character);
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
  return normalizeCharacterUrls(data.character);
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
  return (data.scenes || []).map(normalizeSceneUrls);
}

/** 按项目获取场景列表（支持团队成员访问）；可选 scriptId 按剧本过滤 */
export async function fetchScenesByProject(projectId: number, scriptId?: number): Promise<Scene[]> {
  const token = getAuthToken();
  const url = scriptId
    ? `/api/scenes/project/${projectId}?scriptId=${scriptId}`
    : `/api/scenes/project/${projectId}`;
  const response = await fetch(url, {
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    }
  });
  if (!response.ok) {
    throw new Error('获取项目场景列表失败');
  }
  const data = await response.json();
  return (data.scenes || []).map(normalizeSceneUrls);
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
  return normalizeSceneUrls(data.scene);
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
  return normalizeSceneUrls(data.scene);
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

// ===================== 场景图片提示词生成/优化 =====================

export interface GenerateScenePromptParams {
  /** 文本模型名（必填） */
  textModel: string;
  /** 'A' | 'B' | 'both'，默认 'both' */
  face?: 'A' | 'B' | 'both';
  /** 当前 A 面提示词，传入代表"优化"模式 */
  basePromptA?: string;
  /** 当前 B 面提示词，传入代表"优化"模式 */
  basePromptB?: string;
  /** 用户对优化方向的自然语言建议（可选） */
  userNote?: string;
}

export interface GenerateScenePromptResult {
  message?: string;
  sceneId: number;
  face: 'A' | 'B' | 'both';
  style?: string;
  promptA?: string;
  promptB?: string;
}

/**
 * AI 生成或优化场景图片的提示词（纯文本接口，不生成图片）
 * 未传 basePromptX → 首次生成；传入 basePromptX → 基于当前版本优化
 */
export async function generateSceneImagePrompt(
  sceneId: number,
  params: GenerateScenePromptParams
): Promise<GenerateScenePromptResult> {
  const token = getAuthToken();
  const response = await fetch(`/api/scenes/${sceneId}/generate-image-prompt`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    },
    body: JSON.stringify(params)
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.message || '生成场景提示词失败');
  }
  return data as GenerateScenePromptResult;
}

// ===================== 角色图片提示词生成/优化 =====================

export interface GenerateCharacterPromptParams {
  /** 文本模型名（必填） */
  textModel: string;
  /** 'front' | 'side' | 'back' | 'all'，默认 'all' */
  views?: 'front' | 'side' | 'back' | 'all';
  /** 当前正面提示词，传入代表"优化"模式 */
  basePromptFront?: string;
  /** 当前侧面提示词，传入代表"优化"模式 */
  basePromptSide?: string;
  /** 当前背面提示词，传入代表"优化"模式 */
  basePromptBack?: string;
  /** 用户对优化方向的自然语言建议（可选） */
  userNote?: string;
  /** 角色状态 ID（为状态生成时传入） */
  stateId?: number;
}

export interface GenerateCharacterPromptResult {
  message?: string;
  characterId: number;
  style?: string;
  views: string[];
  promptFront?: string;
  promptSide?: string;
  promptBack?: string;
}

/**
 * AI 生成或优化角色三视图的提示词（纯文本接口，不生成图片）
 * 未传 basePromptX → 首次生成；传入 basePromptX → 基于当前版本优化
 */
export async function generateCharacterImagePrompt(
  characterId: number,
  params: GenerateCharacterPromptParams
): Promise<GenerateCharacterPromptResult> {
  const token = getAuthToken();
  const response = await fetch(`/api/characters/${characterId}/generate-image-prompt`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    },
    body: JSON.stringify(params)
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.message || '生成角色提示词失败');
  }
  return data as GenerateCharacterPromptResult;
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

export async function extractPropsFromScript(payload: {
  projectId: number;
  scriptId: number;
  textModel: string;
  imageModel?: string;
}): Promise<{ message: string; jobId?: string; status: string }> {
  const token = getAuthToken();
  const response = await fetch('/api/props/extract-from-script', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    },
    body: JSON.stringify(payload)
  });
  if (!response.ok) {
    const data = await response.json();
    throw new Error(data.message || '提取道具失败');
  }
  return response.json();
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
  return (data.states || []).map(normalizeStateUrls);
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
  const result = await response.json();
  // 规范化 states 和 grouped 中的 URL
  if (result.states) {
    result.states = result.states.map(normalizeStateUrls);
  }
  if (result.grouped) {
    for (const key of Object.keys(result.grouped)) {
      result.grouped[key] = result.grouped[key].map(normalizeStateUrls);
    }
  }
  return result;
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
  return normalizeStateUrls(result.state);
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
  return normalizeStateUrls(result.state);
}

/**
 * 清除白膜角色设定图（让用户可重新生成）
 * 后端会同步清空 character_states 的 image_url/三视图 URL 以及 characters 表的 image_url/character_sheet_url
 */
export async function deleteCharacterStateBaseModelImage(
  characterId: number,
  stateId: number
): Promise<CharacterState> {
  const token = getAuthToken();
  const response = await fetch(`/api/characters/${characterId}/states/${stateId}/base-model-image`, {
    method: 'DELETE',
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    }
  });
  if (!response.ok) {
    const result = await response.json();
    throw new Error(result.message || '清除白膜角色设定图失败');
  }
  const result = await response.json();
  return normalizeStateUrls(result.state);
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
  return normalizeStateUrls(data.state);
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
  return normalizeStateUrls(data.state);
}

/**
 * 为角色状态生成三视图
 * 后端会自动从角色和状态数据中组装外貌属性（appearance/outfit/hairstyle/accessories/age_stage）
 */
export async function generateCharacterStateViews(
  characterId: number,
  stateId: number,
  params: { imageModel: string; textModel?: string; regenerateOnly?: ('front' | 'side' | 'back')[]; generateMode?: 'design_sheet' | 'three_views' }
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
  return data.state ? normalizeStateUrls(data.state) : null;
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

/**
 * 上传场景参考图
 * @param sceneId 场景ID
 * @param file 参考图文件
 * @returns 参考图URL
 */
export async function uploadSceneReferenceImage(
  sceneId: number,
  file: File
): Promise<{ reference_image_url: string }> {
  const token = getAuthToken();
  const formData = new FormData();
  formData.append('reference_image', file);

  const response = await fetch(`/api/scenes/${sceneId}/reference-image`, {
    method: 'POST',
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    },
    body: formData
  });

  if (!response.ok) {
    const result = await response.json();
    throw new Error(result.message || '上传场景参考图失败');
  }
  return response.json();
}

/**
 * 删除场景参考图
 * @param sceneId 场景ID
 */
export async function deleteSceneReferenceImage(sceneId: number): Promise<void> {
  const token = getAuthToken();
  const response = await fetch(`/api/scenes/${sceneId}/reference-image`, {
    method: 'DELETE',
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    }
  });

  if (!response.ok) {
    const result = await response.json();
    throw new Error(result.message || '删除场景参考图失败');
  }
}

/**
 * 启动场景全景图生成（360°×180°等距柱状，球体内壁贴图用）
 * @param sceneId 场景ID
 * @param imageModel 图像模型名称
 * @param options textModel / style 可选
 */
export async function generateScenePanorama(
  sceneId: number,
  imageModel: string,
  options: { textModel?: string; style?: string } = {}
): Promise<{ jobId: string; sceneId: number; status: string; message?: string }> {
  const token = getAuthToken();
  const response = await fetch(`/api/scenes/${sceneId}/generate-panorama`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    },
    body: JSON.stringify({
      imageModel,
      textModel: options.textModel,
      style: options.style
    })
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const err: any = new Error(data.message || '启动全景图生成失败');
    err.status = response.status;
    err.jobId = data.jobId;
    throw err;
  }
  return data;
}

/**
 * 删除场景全景图
 * @param sceneId 场景ID
 */
export async function deleteScenePanorama(sceneId: number): Promise<void> {
  const token = getAuthToken();
  const response = await fetch(`/api/scenes/${sceneId}/panorama`, {
    method: 'DELETE',
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    }
  });

  if (!response.ok) {
    const result = await response.json();
    throw new Error(result.message || '删除场景全景图失败');
  }
}

/**
 * 从全景图裁切透视视图（漫剧正反打 A/B 面工具）
 * @param sceneId 场景ID
 * @param params yaw / pitch / fov / outW / outH / label
 */
export async function cutSceneFromPanorama(
  sceneId: number,
  params: { yaw: number; pitch?: number; fov?: number; outW?: number; outH?: number; label?: string }
): Promise<{ cutUrl: string; yaw: number; pitch: number; fov: number; outW: number; outH: number; durationMs: number }> {
  const token = getAuthToken();
  const response = await fetch(`/api/scenes/${sceneId}/cut-from-panorama`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    },
    body: JSON.stringify(params)
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.message || '裁切全景图失败');
  }
  return data;
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

// ============================================================
// 角色装配 + 合成预览 (T5)
// ============================================================

export interface CharacterLoadout {
  costumeStateId: number | null;
  expressionStateId: number | null;
  costume?: CharacterState | null;
  expression?: CharacterState | null;
}

export interface CharacterCompositeResponse {
  characterId: number;
  characterName: string;
  projectId: number;
  loadout: {
    costumeStateId: number | null;
    expressionStateId: number | null;
    costume: CharacterState | null;
    expression: CharacterState | null;
  };
  baseState: CharacterState;
  previewUrl: string | null;
  compositePrompt: string;
  visualStylePrompt: string | null;
  sources: {
    costumeRawHit: boolean;
  };
}

/** 读取角色当前装配 */
export async function fetchCharacterLoadout(characterId: number): Promise<{ characterId: number; loadout: CharacterLoadout }> {
  const token = getAuthToken();
  const response = await fetch(`/api/characters/${characterId}/loadout`, {
    headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) }
  });
  if (!response.ok) {
    const r = await response.json().catch(() => ({}));
    throw new Error(r.message || '获取装配信息失败');
  }
  return response.json();
}

/** 更新角色当前装配（传 null 清空） */
export async function updateCharacterLoadout(
  characterId: number,
  data: { costumeStateId?: number | null; expressionStateId?: number | null }
): Promise<{ message: string; characterId: number; loadout: { costumeStateId: number | null; expressionStateId: number | null } }> {
  const token = getAuthToken();
  const response = await fetch(`/api/characters/${characterId}/loadout`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(data),
  });
  if (!response.ok) {
    const r = await response.json().catch(() => ({}));
    throw new Error(r.message || '更新装配失败');
  }
  return response.json();
}

/** 获取角色合成预览（基于项目画风 + 白膜 + 装配） */
export async function fetchCharacterComposite(
  characterId: number,
  projectId: number,
  overrides?: { costumeStateId?: number; expressionStateId?: number }
): Promise<CharacterCompositeResponse> {
  const token = getAuthToken();
  const params = new URLSearchParams({ projectId: String(projectId) });
  if (overrides?.costumeStateId != null) params.append('costumeStateId', String(overrides.costumeStateId));
  if (overrides?.expressionStateId != null) params.append('expressionStateId', String(overrides.expressionStateId));
  const response = await fetch(`/api/characters/${characterId}/composite?${params.toString()}`, {
    headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) }
  });
  if (!response.ok) {
    const r = await response.json().catch(() => ({}));
    const err: any = new Error(r.message || '获取合成预览失败');
    err.code = r.code;
    throw err;
  }
  return response.json();
}

// ============================================================
// 角色-项目 一对多绑定 (T6)
// ============================================================

export interface ProjectBinding {
  project_id: number;
  binding_type: 'owner' | 'reference';
  created_at: string;
  project_title?: string;
  project_type?: string;
}

/** 读取角色绑定的所有项目 */
export async function fetchCharacterBindings(characterId: number): Promise<{ characterId: number; bindings: ProjectBinding[] }> {
  const token = getAuthToken();
  const response = await fetch(`/api/characters/${characterId}/bindings`, {
    headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) }
  });
  if (!response.ok) {
    const r = await response.json().catch(() => ({}));
    throw new Error(r.message || '获取角色绑定失败');
  }
  return response.json();
}

/** 添加角色-项目绑定 */
export async function addCharacterBinding(characterId: number, projectId: number): Promise<{ message: string }> {
  const token = getAuthToken();
  const response = await fetch(`/api/characters/${characterId}/bindings`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify({ projectId }),
  });
  if (!response.ok) {
    const r = await response.json().catch(() => ({}));
    throw new Error(r.message || '添加绑定失败');
  }
  return response.json();
}

/** 解除角色-项目绑定（不能解除 owner） */
export async function removeCharacterBinding(characterId: number, projectId: number): Promise<{ message: string }> {
  const token = getAuthToken();
  const response = await fetch(`/api/characters/${characterId}/bindings/${projectId}`, {
    method: 'DELETE',
    headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) }
  });
  if (!response.ok) {
    const r = await response.json().catch(() => ({}));
    const err: any = new Error(r.message || '解除绑定失败');
    err.code = r.code;
    throw err;
  }
  return response.json();
}

/** 读取场景绑定的所有项目 (T7) */
export async function fetchSceneBindings(sceneId: number): Promise<{ sceneId: number; bindings: ProjectBinding[] }> {
  const token = getAuthToken();
  const response = await fetch(`/api/scenes/${sceneId}/bindings`, {
    headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) }
  });
  if (!response.ok) {
    const r = await response.json().catch(() => ({}));
    throw new Error(r.message || '获取场景绑定失败');
  }
  return response.json();
}

/** 添加场景-项目绑定 */
export async function addSceneBinding(sceneId: number, projectId: number): Promise<{ message: string }> {
  const token = getAuthToken();
  const response = await fetch(`/api/scenes/${sceneId}/bindings`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify({ projectId }),
  });
  if (!response.ok) {
    const r = await response.json().catch(() => ({}));
    throw new Error(r.message || '添加绑定失败');
  }
  return response.json();
}

/** 解除场景-项目绑定 */
export async function removeSceneBinding(sceneId: number, projectId: number): Promise<{ message: string }> {
  const token = getAuthToken();
  const response = await fetch(`/api/scenes/${sceneId}/bindings/${projectId}`, {
    method: 'DELETE',
    headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) }
  });
  if (!response.ok) {
    const r = await response.json().catch(() => ({}));
    const err: any = new Error(r.message || '解除绑定失败');
    err.code = r.code;
    throw err;
  }
  return response.json();
}

// ============================================================
// （已移除）按项目画风渲染的角色状态 / 场景缓存接口
// 该模块已在 2026-04 下线，渲染通过三视图管线统一处理
// ============================================================

// ============ AI 智能生成角色 ============

export interface AiCharacterDraft {
  name: string;
  gender: 'male' | 'female' | 'unknown';
  base_appearance: string;
  outfit_appearance: string;
  personality: string;
  description: string;
}

export interface AiDraftResponse {
  draft: AiCharacterDraft;
  projectStyle: {
    projectId: number;
    projectName: string;
    visualStyle: string;
    visualStylePrompt: string;
    hasStyle: boolean;
  };
  estimatedResources: {
    character: number;
    costume: number;
    baseState: number;
    costumeState: number;
  };
  estimatedCredits: {
    whiteModel: number;
    styledState: number;
    totalImages: number;
    note: string;
  };
}

export interface AiCommitResponse {
  message: string;
  characterId: number;
  costumeId: number | null;
  baseStateId: number;
  jobId: string;
  followUp: {
    pendingCostumeState: boolean;
    api: string | null;
    note: string | null;
  };
}

/** AI 出角色草稿（不入库） */
export async function aiGenerateCharacterDraft(params: {
  projectId: number;
  userDescription: string;
  textModel?: string;
}): Promise<AiDraftResponse> {
  const token = getAuthToken();
  const response = await fetch('/api/characters/ai-generate-draft', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    },
    body: JSON.stringify(params)
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data?.message || 'AI 生成草稿失败');
  return data;
}

/** 确认草稿 → 落库 + 启动白膜 workflow */
export async function aiCommitCharacterDraft(params: {
  projectId: number;
  draft: AiCharacterDraft;
  imageModel: string;
  textModel?: string;
}): Promise<AiCommitResponse> {
  const token = getAuthToken();
  const response = await fetch('/api/characters/ai-generate-commit', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    },
    body: JSON.stringify(params)
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data?.message || 'AI 提交角色失败');
  return data;
}

/** 白膜完成后，启动默认服装状态画风版 workflow */
export async function generateDefaultCostumeState(
  characterId: number,
  params: { imageModel?: string; textModel?: string } = {}
): Promise<{ message: string; characterId: number; stateId: number; jobId: string; status: string }> {
  const token = getAuthToken();
  const response = await fetch(`/api/characters/${characterId}/generate-default-costume-state`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    },
    body: JSON.stringify(params)
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data?.message || '启动默认服装状态画风版失败');
  return data;
}

/** AI 出场景草稿（轻量模式，不入库，前端自行调 createScene 落库） */
export interface AiSceneDraft {
  name: string;
  description: string;
  environment: string;
  lighting: string;
  mood: string;
}

export async function aiGenerateSceneDraft(params: {
  projectId: number;
  userDescription: string;
  textModel?: string;
}): Promise<{ draft: AiSceneDraft; projectStyle: { projectId: number; projectName: string; visualStylePrompt: string; hasStyle: boolean } }> {
  const token = getAuthToken();
  const response = await fetch('/api/scenes/ai-generate-draft', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    },
    body: JSON.stringify(params)
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data?.message || 'AI 生成场景草稿失败');
  return data;
}
