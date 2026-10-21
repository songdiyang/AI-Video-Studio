/**
 * StoryBoard 插件系统类型定义
 * 定义插件注册接口、API 和渲染 props
 */

import React from 'react';
import { StoryboardScene, DialogueLine } from '../useSceneManager';
import { AIModel } from '../../../components/AIModelSelector';

// ==================== 插件位置 ====================

export type PluginPosition = 'left' | 'center' | 'right' | 'modal';

// ==================== 共享状态键 ====================

export type SharedStateKey =
  | 'scenes'
  | 'selectedScene'
  | 'isLoading'
  | 'projectCharacters'
  | 'projectScenes'
  | 'projectProps'
  | 'projectEnvironments'
  | 'projectBuildings'
  | 'projectCostumes'
  | 'currentProjectId'
  | 'currentScriptId'
  | 'currentEpisode'
  | 'currentProject'
  | 'models'
  | 'imageModel'
  | 'videoModel'
  | 'textModel'
  | 'multimodalModel'
  | 'imageAspectRatio'
  | 'videoAspectRatio'
  | 'imageResolution'
  | 'videoResolution'
  | 'videoDuration'
  | 'scriptContent'
  | 'scriptTitle'
  | 'referenceScriptContent'
  | 'referenceScriptTitle'
  | 'isLoadingScript'
  | 'tasks'
  | 'isRunning'
  | 'storyboardStates'
  | 'allCharacters'
  | 'allLocations'
  | 'allProps'
  | 'isBatchFrameSubmitting'
  | 'isBatchVideoSubmitting'
  | 'isOptimizingAllPrompts'
  | 'autoStoryboard'
  | 'batchResource'
  | 'standaloneMaxEpisode'
  | 'scripts';

// ==================== 插件渲染 Props ====================

export interface PluginRenderProps {
  /** 插件实例 ID */
  instanceId: string;
  /** 是否处于激活状态（对应 tab 被选中） */
  isActive: boolean;
  /** 面板是否展开 */
  isOpen: boolean;
}

// ==================== 插件定义 ====================

export interface StoryboardPlugin {
  /** 唯一标识 */
  id: string;
  /** 显示名称 */
  name: string;
  /** Lucide 图标名称 */
  icon: string;
  /** 面板位置 */
  position: PluginPosition;
  /** 排序权重（越小越靠前） */
  priority: number;
  /** 是否默认激活（仅对 left/right 有效） */
  defaultActive?: boolean;
  /** 是否可禁用 */
  disableable?: boolean;
  /** 渲染组件 */
  component: React.ComponentType<PluginRenderProps>;
  /** 激活时调用 */
  activate?: (api: PluginAPI) => void | Promise<void>;
  /** 停用时调用 */
  deactivate?: (api: PluginAPI) => void | Promise<void>;
}

// ==================== 插件 API ====================

export interface PluginAPI {
  // ---- 状态访问 ----
  getState: <T>(key: SharedStateKey) => T | undefined;
  setState: <T>(key: SharedStateKey, value: T) => void;
  useState: <T>(key: SharedStateKey) => T | undefined;

  // ---- 事件总线 ----
  emit: (event: string, payload?: any) => void;
  on: (event: string, handler: (payload: any) => void) => () => void;

  // ---- 面板控制 ----
  openPanel: (pluginId: string) => void;
  closePanel: (pluginId: string) => void;
  togglePanel: (pluginId: string) => void;
  setActiveTab: (pluginId: string) => void;

  // ---- 快捷数据访问 ----
  getScenes: () => StoryboardScene[];
  getSelectedScene: () => StoryboardScene | null;
  getSelectedSceneId: () => number | null;
  getProjectId: () => number | null;
  getScriptId: () => number | null;
  getEpisode: () => number;

  // ---- 分镜操作 ----
  selectScene: (sceneId: number | null) => void;
  addScene: () => Promise<void>;
  insertScene: (atIndex?: number) => Promise<void>;
  deleteScene: (sceneId: number) => Promise<void>;
  moveScene: (sceneId: number, direction: 'up' | 'down') => void;
  reorderScenes: (scenes: StoryboardScene[]) => void;
  updateScene: (sceneId: number, updates: Partial<StoryboardScene>) => Promise<boolean>;
  updateDescription: (sceneId: number, description: string) => Promise<boolean>;
  updateBaseDescription: (sceneId: number, description: string) => Promise<boolean>;
  updateVideoPrompt: (sceneId: number, prompt: string) => Promise<boolean>;
  updateFirstFramePrompt: (sceneId: number, prompt: string) => Promise<boolean>;
  updateLastFramePrompt: (sceneId: number, prompt: string) => Promise<boolean>;
  updateDialogues: (sceneId: number, dialogues: DialogueLine[]) => Promise<boolean>;
  updateVoiceover: (sceneId: number, voiceover: string) => Promise<boolean>;
  updateCharactersAndLocation: (sceneId: number, characters: string[], location: string, characterIds?: number[], locationId?: number) => Promise<boolean>;
  updateProps: (sceneId: number, props: string[]) => Promise<boolean>;
  updateShotType: (sceneId: number, shotType: string) => Promise<boolean>;
  updateDuration: (sceneId: number, duration: number) => Promise<boolean>;
  updateCharacterStates: (sceneId: number, states: Record<number, any>) => Promise<boolean>;

  // ---- 生成操作 ----
  generateImage: (sceneId: number, prompt: string, regenerateTarget?: 'first' | 'last' | 'both', forceRegenerate?: boolean) => Promise<{ success: boolean; error?: string }>;
  generateVideo: (sceneId: number) => Promise<{ success: boolean; error?: string }>;
  generateWithCamera: (sceneId: number, prompt: string, config?: any) => Promise<{ success: boolean; error?: string }>;
  generateWithPaint: (sceneId: number, prompt: string, config?: any) => Promise<{ success: boolean; error?: string }>;
  generateWithSketch: (sceneId: number, prompt: string, config?: any) => Promise<{ success: boolean; error?: string }>;
  generateHdRepair: (sceneId: number, prompt: string, config?: any) => Promise<{ success: boolean; error?: string }>;

  // ---- 批量操作 ----
  batchGenerateFrames: (overwrite?: boolean) => Promise<void>;
  batchGenerateVideos: (overwrite?: boolean) => Promise<void>;
  batchOptimizePrompts: (targetType?: 'image' | 'video') => Promise<void>;

  // ---- 项目/剧本操作 ----
  refreshScenes: () => Promise<void>;
  loadScript: (projectId: number, episode: number) => Promise<void>;
  switchEpisode: (episode: number, scriptId?: number) => void;
  createNextEpisode: () => Promise<void>;

  // ---- 资源加载 ----
  refreshCharacters: () => Promise<void>;
  refreshProps: () => Promise<void>;

  // ---- 工具 ----
  showToast: (message: string, type?: 'success' | 'error' | 'warning' | 'info') => void;
  getAuthToken: () => string | null;
}

// ==================== 插件注册表 ====================

export interface PluginRegistry {
  plugins: Map<string, StoryboardPlugin>;
  register: (plugin: StoryboardPlugin) => void;
  unregister: (pluginId: string) => void;
  getByPosition: (position: PluginPosition) => StoryboardPlugin[];
  getById: (id: string) => StoryboardPlugin | undefined;
}

// ==================== 面板状态 ====================

export interface PanelState {
  /** 当前激活的 left 插件 ID */
  activeLeftPlugin: string | null;
  /** 当前激活的 right 插件 ID */
  activeRightPlugin: string | null;
  /** 是否展开左侧面板 */
  leftOpen: boolean;
  /** 是否展开右侧面板 */
  rightOpen: boolean;
  /** 是否展开底部面板 */
  bottomOpen: boolean;
}
