/**
 * 工作台配置管理器
 * 定义各项目类型的工作台标签页配置和组件映射
 */

import React from 'react';
import { 
  FileText, Film, Clapperboard, LayoutGrid, Paintbrush, 
  Clock, Sparkles, Network, List, PenTool, Video, BookOpen 
} from 'lucide-react';
import { ProjectType, WorkbenchConfig, WorkbenchTab, WORKBENCH_CONFIGS } from '../../types/projectTypes';

// ==================== 图标映射 ====================

/**
 * 图标名称到组件的映射
 */
export const ICON_MAP: Record<string, React.ComponentType<{ className?: string }>> = {
  FileText,
  Film,
  Clapperboard,
  LayoutGrid,
  Paintbrush,
  Clock,
  Sparkles,
  Network,
  List,
  PenTool,
  Video,
  BookOpen,
};

/**
 * 获取图标组件
 */
export function getIcon(iconName: string): React.ComponentType<{ className?: string }> {
  return ICON_MAP[iconName] || FileText;
}

// ==================== 工作台配置辅助函数 ====================

/**
 * 获取项目类型的工作台配置
 */
export function getWorkbenchConfigForType(projectType: ProjectType): WorkbenchConfig {
  return WORKBENCH_CONFIGS[projectType] || WORKBENCH_CONFIGS.comic_drama;
}

/**
 * 获取工作台标签页列表
 */
export function getWorkbenchTabs(projectType: ProjectType): WorkbenchTab[] {
  return getWorkbenchConfigForType(projectType).tabs;
}

/**
 * 获取默认标签页
 */
export function getDefaultTab(projectType: ProjectType): string {
  return getWorkbenchConfigForType(projectType).defaultTab;
}

/**
 * 判断标签页是否在指定项目类型中可用
 */
export function isTabAvailable(projectType: ProjectType, tabKey: string): boolean {
  const tabs = getWorkbenchTabs(projectType);
  return tabs.some(tab => tab.key === tabKey);
}

/**
 * 获取标签页配置
 */
export function getTabConfig(projectType: ProjectType, tabKey: string): WorkbenchTab | undefined {
  const tabs = getWorkbenchTabs(projectType);
  return tabs.find(tab => tab.key === tabKey);
}

// ==================== 本地存储键 ====================

const STORAGE_KEYS = {
  LAST_TAB_PREFIX: 'nanostory_workbench_tab_',
  LAST_PROJECT: 'nanostory_last_project_id',
};

/**
 * 获取项目的上次活动标签页
 */
export function getLastActiveTab(projectId: number, projectType: ProjectType): string {
  const key = `${STORAGE_KEYS.LAST_TAB_PREFIX}${projectId}`;
  const savedTab = localStorage.getItem(key);
  
  // 验证保存的标签页在当前项目类型中是否可用
  if (savedTab && isTabAvailable(projectType, savedTab)) {
    return savedTab;
  }
  
  return getDefaultTab(projectType);
}

/**
 * 保存项目的活动标签页
 */
export function saveLastActiveTab(projectId: number, tabKey: string): void {
  const key = `${STORAGE_KEYS.LAST_TAB_PREFIX}${projectId}`;
  localStorage.setItem(key, tabKey);
}

// ==================== 工作台状态管理 ====================

/**
 * 工作台状态接口
 */
export interface WorkbenchState {
  projectId: number | null;
  projectType: ProjectType;
  activeTab: string;
  tabs: WorkbenchTab[];
}

/**
 * 创建初始工作台状态
 */
export function createInitialWorkbenchState(
  projectId: number | null,
  projectType: ProjectType = 'comic_drama'
): WorkbenchState {
  const config = getWorkbenchConfigForType(projectType);
  const activeTab = projectId 
    ? getLastActiveTab(projectId, projectType) 
    : config.defaultTab;
  
  return {
    projectId,
    projectType,
    activeTab,
    tabs: config.tabs,
  };
}

/**
 * 更新工作台状态（项目切换时）
 */
export function updateWorkbenchStateForProject(
  currentState: WorkbenchState,
  newProjectId: number,
  newProjectType: ProjectType
): WorkbenchState {
  // 如果项目类型相同，尝试保持当前标签页
  if (currentState.projectType === newProjectType) {
    const newActiveTab = isTabAvailable(newProjectType, currentState.activeTab)
      ? currentState.activeTab
      : getLastActiveTab(newProjectId, newProjectType);
    
    return {
      ...currentState,
      projectId: newProjectId,
      activeTab: newActiveTab,
    };
  }
  
  // 项目类型不同，重新初始化
  return createInitialWorkbenchState(newProjectId, newProjectType);
}

// ==================== 组件名称映射 ====================

/**
 * 组件标识符到组件路径的映射
 * 用于懒加载
 */
export const COMPONENT_PATHS: Record<string, string> = {
  // 漫剧工作台
  ScriptPanel: 'views/ScriptStudio/ScriptPanel',
  StoryBoard: 'views/StoryBoard',
  VideoComposition: 'views/VideoComposition',
  
  // 漫画工作台
  MangaScriptPanel: 'views/MangaWorkbench/ScriptPanel',
  PageLayout: 'views/MangaWorkbench/PageLayout',
  DrawingTools: 'views/MangaWorkbench/DrawingTools',
  
  // 短视频工作台
  VideoScriptPanel: 'views/ShortVideoWorkbench/ScriptPanel',
  TimelineEditor: 'views/ShortVideoWorkbench/TimelineEditor',
  EffectsEditor: 'views/ShortVideoWorkbench/EffectsEditor',
  
  // 小说工作台
  OutlinePlanner: 'views/NovelWorkbench/OutlinePlanner',
  ChapterManager: 'views/NovelWorkbench/ChapterManager',
  TextEditor: 'views/NovelWorkbench/TextEditor',
  CharacterManager: 'views/NovelWorkbench/CharacterManager',
  SceneManager: 'views/NovelWorkbench/SceneManager',
  WorldViewEditor: 'views/NovelWorkbench/WorldViewEditor',
};

export default {
  getWorkbenchConfigForType,
  getWorkbenchTabs,
  getDefaultTab,
  isTabAvailable,
  getTabConfig,
  getLastActiveTab,
  saveLastActiveTab,
  createInitialWorkbenchState,
  updateWorkbenchStateForProject,
  getIcon,
  ICON_MAP,
  COMPONENT_PATHS,
};
