export interface Character {
  id: number;
  name: string;
  appearance?: string;
  personality?: string;
  description?: string;
  imageUrl?: string;
  source?: string;  // 'ai_extracted' | 'storyboard'
  frontViewUrl?: string;  // 正面视图
  sideViewUrl?: string;   // 侧面视图
  backViewUrl?: string;   // 背面视图
  characterSheetUrl?: string;  // 角色设计稿
  generationPrompt?: string;  // 三视图生成提示词（JSON字符串）
  generationStatus?: string;  // 生成状态
  states?: CharacterState[];  // 角色状态列表
  statesCount?: number;  // 状态数量
  projectId?: number;  // 所属项目ID
  gender?: 'male' | 'female' | 'unknown';  // 性别
}

// 角色状态接口
export interface CharacterState {
  id: number;
  character_id: number;
  name: string;
  description?: string;
  appearance?: string;
  image_url?: string;
  front_view_url?: string;
  side_view_url?: string;
  back_view_url?: string;
  sort_order?: number;
  is_base_model?: boolean;    // 是否为基础白膜状态
  is_active?: boolean;        // 是否为当前激活状态
  generation_status?: 'idle' | 'generating' | 'completed' | 'failed';
  // 外观属性
  outfit?: string;
  age_stage?: string;
  hairstyle?: string;
  accessories?: string;
  generation_prompt?: string;
  gender?: 'male' | 'female' | 'unknown';
  // 状态分类和标签
  state_category?: 'daily' | 'costume' | 'time' | 'effect';
  tags?: string;  // 状态标签JSON数组
}

export interface ResourceItem {
  name: string;
  count?: number;
  imageUrl?: string;
  frontViewUrl?: string;
  sideViewUrl?: string;
  backViewUrl?: string;
  characterSheetUrl?: string;
  generationStatus?: string;
}

export interface ResourcePanelProps {
  characters: string[];
  locations: string[];
  props: string[];
  projectId?: number | null;
  scriptId?: number | null;
  scenes?: any[];
  imageModel: string;
  imageAspectRatio: string;
  textModel: string;
  models?: { name: string; type: string; supportedAspectRatios?: unknown }[];
}

export type TabType = 'characters' | 'locations' | 'props';

// 角色树形节点类型（用于树形视图组件）
export interface CharacterTreeNode {
  id: number;
  type: 'character';
  character: Character;
  states: CharacterState[];
  activeStateId?: number;
  isExpanded: boolean;
}
