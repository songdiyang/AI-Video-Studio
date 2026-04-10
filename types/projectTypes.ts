/**
 * 项目类型定义
 * 定义所有项目类型及其工作台配置
 */

import { LucideIcon } from 'lucide-react';

// ==================== 项目类型枚举 ====================

/**
 * 项目类型枚举
 */
export type ProjectType = 'comic_drama' | 'manga' | 'short_video' | 'novel';

/**
 * 项目类型元数据
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
    description: '基于剧本创作分镜动画的项目类型，适合制作动态漫画、有声漫画等',
    icon: 'Film',
    color: 'from-violet-500 to-purple-600',
  },
  manga: {
    code: 'manga',
    name: '漫画',
    nameEn: 'Manga',
    description: '传统漫画/条漫创作项目类型，支持分页布局和绘图工具',
    icon: 'BookImage',
    color: 'from-orange-500 to-red-600',
  },
  short_video: {
    code: 'short_video',
    name: '短视频',
    nameEn: 'Short Video',
    description: '短视频创作项目类型，专注于视频剪辑和特效制作',
    icon: 'Video',
    color: 'from-cyan-500 to-blue-600',
  },
  novel: {
    code: 'novel',
    name: '小说',
    nameEn: 'Novel',
    description: '小说/网文创作项目类型，提供大纲规划和章节管理功能',
    icon: 'BookOpen',
    color: 'from-emerald-500 to-teal-600',
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
  manga: {
    projectType: 'manga',
    defaultTab: 'script',
    tabs: [
      {
        key: 'script',
        label: '剧本/脚本',
        labelEn: 'Script',
        icon: 'FileText',
        component: 'MangaScriptPanel',
      },
      {
        key: 'layout',
        label: '页面布局',
        labelEn: 'Page Layout',
        icon: 'LayoutGrid',
        component: 'PageLayout',
      },
      {
        key: 'drawing',
        label: '绘图工具',
        labelEn: 'Drawing Tools',
        icon: 'Paintbrush',
        component: 'DrawingTools',
      },
    ],
  },
  short_video: {
    projectType: 'short_video',
    defaultTab: 'script',
    tabs: [
      {
        key: 'script',
        label: '视频脚本',
        labelEn: 'Script',
        icon: 'FileText',
        component: 'VideoScriptPanel',
      },
      {
        key: 'timeline',
        label: '时间轴编辑',
        labelEn: 'Timeline',
        icon: 'Clock',
        component: 'TimelineEditor',
      },
      {
        key: 'effects',
        label: '特效添加',
        labelEn: 'Effects',
        icon: 'Sparkles',
        component: 'EffectsEditor',
      },
    ],
  },
  novel: {
    projectType: 'novel',
    defaultTab: 'outline',
    tabs: [
      {
        key: 'outline',
        label: '大纲规划',
        labelEn: 'Outline',
        icon: 'Network',
        component: 'OutlinePlanner',
      },
      {
        key: 'chapters',
        label: '章节管理',
        labelEn: 'Chapters',
        icon: 'List',
        component: 'ChapterManager',
      },
      {
        key: 'editor',
        label: '文本编辑',
        labelEn: 'Editor',
        icon: 'PenTool',
        component: 'TextEditor',
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
