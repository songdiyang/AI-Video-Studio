/**
 * 项目类型定义
 * 定义所有项目类型及其工作台配置
 */

import { LucideIcon } from 'lucide-react';

// ==================== 视觉风格分类 ====================

/**
 * 风格大类
 * - live_action: 真人类
 * - anime: 动漫类
 */
export type StyleCategory = 'live_action' | 'anime';

/**
 * 头身比例（仅动漫类有效）
 * - teen: 少女/少年 6-7头身
 * - adult: 成年角色 7-8头身
 * - chibi: Q版 2.5-4头身
 */
export type BodyProportionRatio = 'h2_5' | 'h3' | 'h4' | 'h6' | 'h6_5' | 'h7' | 'h7_5' | 'h8';

/**
 * 按大类划分的视觉风格键名
 */
export const VISUAL_STYLE_BY_CATEGORY: Record<StyleCategory, string[]> = {
  live_action: ['realisticFilm', 'fashionPhoto', 'documentary', 'cinematicDrama'],
  anime: [
    'animeJapanese', 'pixar3D', 'disney3D', 'chinese3D', 'anime3D',
    'watercolor', 'cyberpunk', 'americanComic', 'pixelArt',
    'chineseInk', 'shoujoManga', 'custom'
  ],
};

/**
 * 头身比例预设元数据
 */
export const BODY_PROPORTION_PRESETS: Record<BodyProportionRatio, {
  code: BodyProportionRatio;
  name: string;
  nameEn: string;
  ratio: string;
  description: string;
  descriptionEn: string;
}> = {
  h2_5: { code: 'h2_5', name: '超Q', nameEn: 'Super Chibi', ratio: '2.5', description: '2.5头身', descriptionEn: '2.5 heads' },
  h3:   { code: 'h3',   name: '萌系', nameEn: 'Moe',         ratio: '3',   description: '3头身',   descriptionEn: '3 heads' },
  h4:   { code: 'h4',   name: '少年/少女感', nameEn: 'Teen', ratio: '4',   description: '4头身',   descriptionEn: '4 heads' },
  h6:   { code: 'h6',   name: '可爱', nameEn: 'Cute',         ratio: '6',   description: '6头身',   descriptionEn: '6 heads' },
  h6_5: { code: 'h6_5', name: '日常', nameEn: 'Casual',       ratio: '6.5', description: '6.5头身', descriptionEn: '6.5 heads' },
  h7:   { code: 'h7',   name: '略修长', nameEn: 'Slim',       ratio: '7',   description: '7头身',   descriptionEn: '7 heads' },
  h7_5: { code: 'h7_5', name: '修长', nameEn: 'Slender',     ratio: '7.5', description: '7.5头身', descriptionEn: '7.5 heads' },
  h8:   { code: 'h8',   name: '超模比例', nameEn: 'Supermodel', ratio: '8', description: '8头身',   descriptionEn: '8 heads' },
};

/**
 * 根据已有 visualStyle 推断 styleCategory（向后兼容）
 */
export function inferStyleCategory(visualStyle: string): StyleCategory {
  if (VISUAL_STYLE_BY_CATEGORY.live_action.includes(visualStyle)) return 'live_action';
  return 'anime';
}

// ==================== 拍摄视角 ====================

/**
 * 拍摄视角类型
 * - first_person: 第一人称视角，以角色主观视角叙事
 * - third_person: 第三人称视角，常规客观叙事（默认）
 */
export type NarrativePerspective = 'first_person' | 'third_person';

/**
 * 拍摄视角元数据
 */
export const NARRATIVE_PERSPECTIVES: Record<NarrativePerspective, {
  code: NarrativePerspective;
  name: string;
  nameEn: string;
  description: string;
  descriptionEn: string;
}> = {
  first_person: {
    code: 'first_person',
    name: '第一人称',
    nameEn: 'First Person',
    description: '以角色的主观视角展开叙事，画面采用角色视点，增强代入感与沉浸感',
    descriptionEn: 'Narrate from the character\'s subjective viewpoint for immersive storytelling',
  },
  third_person: {
    code: 'third_person',
    name: '第三人称',
    nameEn: 'Third Person',
    description: '使用客观叙事视角，自由展示多角色和全景画面，适合复杂剧情',
    descriptionEn: 'Use an objective narrative perspective with flexible camera angles',
  },
};

// ==================== 项目类型枚举 ====================

/**
 * 项目类型枚举
 * 专注漫剧功能,已移除短视频、漫画、小说类型
 */
export type ProjectType = 'comic_drama';

/**
 * 项目类型元数据
 * 专注漫剧功能,已移除其他类型
 */
export const PROJECT_TYPES: Record<ProjectType, {
  code: ProjectType;
  name: string;
  nameEn: string;
  description: string;
  icon: string;
  color: string;
}> = {
  comic_drama: {
    code: 'comic_drama',
    name: '漫剧',
    nameEn: 'Comic Drama',
    description: '基于剧本创作分镜动画的项目类型,适合制作动态漫画、有声漫画等',
    icon: 'Film',
    color: 'from-violet-500 to-purple-600',
  },
};

// ==================== 工作台配置 ====================

/**
 * 工作台标签页配置
 */
export interface WorkbenchTab {
  key: string;
  label: string;
  labelEn: string;
  icon: string;
  component: string; // 组件路径标识
}

/**
 * 工作台配置
 */
export interface WorkbenchConfig {
  projectType: ProjectType;
  tabs: WorkbenchTab[];
  defaultTab: string;
}

/**
 * 各项目类型的工作台配置
 */
export const WORKBENCH_CONFIGS: Record<ProjectType, WorkbenchConfig> = {
  comic_drama: {
    projectType: 'comic_drama',
    defaultTab: 'script',
    tabs: [
      {
        key: 'script',
        label: '剧本生成',
        labelEn: 'Script',
        icon: 'FileText',
        component: 'ScriptPanel',
      },
      {
        key: 'storyboard',
        label: '分镜设计',
        labelEn: 'Storyboard',
        icon: 'Film',
        component: 'StoryBoard',
      },
      {
        key: 'composition',
        label: '视频合成',
        labelEn: 'Composition',
        icon: 'Clapperboard',
        component: 'VideoComposition',
      },
    ],
  },
};

// ==================== 辅助函数 ====================

/**
 * 获取项目类型的工作台配置
 */
export function getWorkbenchConfig(projectType: ProjectType): WorkbenchConfig {
  return WORKBENCH_CONFIGS[projectType] || WORKBENCH_CONFIGS.comic_drama;
}

/**
 * 获取项目类型元数据
 */
export function getProjectTypeMeta(projectType: ProjectType) {
  return PROJECT_TYPES[projectType] || PROJECT_TYPES.comic_drama;
}

/**
 * 判断是否为有效的项目类型
 */
export function isValidProjectType(type: string): type is ProjectType {
  return type in PROJECT_TYPES;
}

/**
 * 获取所有项目类型列表
 */
export function getAllProjectTypes(): ProjectType[] {
  return Object.keys(PROJECT_TYPES) as ProjectType[];
}

/**
 * 旧类型到新类型的映射（用于数据迁移兼容）
 */
export function mapLegacyProjectType(legacyType: string): ProjectType {
  const mapping: Record<string, ProjectType> = {
    video: 'short_video',
    comic: 'comic_drama',
    script: 'comic_drama', // 脚本类型映射为漫剧
  };
  return mapping[legacyType] || (legacyType as ProjectType) || 'comic_drama';
}

// ==================== 小说相关类型 ====================

/**
 * 小说章节
 */
export interface NovelChapter {
  id: number;
  project_id: number;
  user_id: number;
  chapter_number: number;
  title: string;
  content: string;
  word_count: number;
  status: 'draft' | 'completed' | 'published';
  notes?: string;
  created_at: string;
  updated_at: string;
}

/**
 * 小说大纲
 */
export interface NovelOutline {
  id: number;
  project_id: number;
  user_id: number;
  outline_type: 'main' | 'character' | 'plot' | 'world';
  title: string;
  content: string;
  parent_id?: number;
  sort_order: number;
  children?: NovelOutline[];
  created_at: string;
  updated_at: string;
}

// ==================== 漫画相关类型 ====================

/**
 * 漫画页面
 */
export interface MangaPage {
  id: number;
  project_id: number;
  user_id: number;
  episode_number: number;
  page_number: number;
  layout_type: 'single' | 'grid_2x2' | 'vertical' | 'custom';
  layout_data?: PanelLayout[];
  image_url?: string;
  thumbnail_url?: string;
  panels_data?: PanelData[];
  status: 'draft' | 'sketch' | 'lineart' | 'colored' | 'completed';
  created_at: string;
  updated_at: string;
}

/**
 * 分格布局
 */
export interface PanelLayout {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation?: number;
}

/**
 * 分格内容
 */
export interface PanelData {
  panel_id: string;
  image_url?: string;
  characters?: string[];
  dialogue?: string;
  description?: string;
}

// ==================== 短视频相关类型 ====================

/**
 * 视频特效
 */
export interface VideoEffect {
  id: number;
  project_id: number;
  user_id: number;
  effect_type: 'transition' | 'filter' | 'sticker' | 'text_overlay';
  effect_name: string;
  effect_config: Record<string, any>;
  start_time?: number;
  end_time?: number;
  layer_order: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

/**
 * 转场效果类型
 */
export type TransitionType = 
  | 'fade' 
  | 'dissolve' 
  | 'wipe' 
  | 'slide' 
  | 'zoom' 
  | 'spin' 
  | 'flip';

/**
 * 滤镜类型
 */
export type FilterType = 
  | 'brightness' 
  | 'contrast' 
  | 'saturation' 
  | 'hue' 
  | 'blur' 
  | 'sharpen' 
  | 'vintage' 
  | 'noir';
