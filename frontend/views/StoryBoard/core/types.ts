/**
 * StoryBoard 核心类型定义
 * 提供插件系统所需的共享类型
 */

import { StoryboardScene, DialogueLine } from '../useSceneManager';
import { StoryboardStateOverride } from '../ResourcePanel';
import { AIModel } from '../../../components/AIModelSelector';
import { CameraGenerateParams, PaintGenerateParams, SketchGenerateParams } from '../MagicSpace';

// ========== 脚本类型 ==========
export interface Script {
  id: number;
  episode_number: number;
  title: string;
  content?: string;
  status: string;
}

// ========== 项目资源类型 ==========
export interface ProjectCharacter {
  id: number;
  name: string;
  image_url?: string;
  front_view_url?: string;
  base_appearance?: string;
  outfit_appearance?: string;
  has_base_model?: number;
  has_base_model_views?: number;
  states_count?: number;
  active_state_name?: string;
  active_state_outfit?: string;
  active_state_image_url?: string;
  base_front_view_url?: string;
}

export interface ProjectScene {
  id: number;
  name: string;
  description?: string;
  image_url?: string;
}

export interface ProjectProp {
  id: number;
  name: string;
  image_url?: string;
  description?: string;
}

// ========== 核心状态 ==========
export interface StoryboardCoreState {
  // 项目/剧本/集数
  currentScriptId: number | null;
  currentProjectId: number | null;
  currentEpisode: number;
  standaloneMaxEpisode: number;
  
  // 项目数据
  currentProject: { id: number; name: string; description?: string; settings_json?: any } | null;
  scripts: Script[];
  
  // 模型配置
  currentImageModel: string;
  currentVideoModel: string;
  currentMultimodalModel: string;
  textModel: string;
  models: AIModel[];
  
  // 生成设置
  imageAspectRatio: string;
  videoAspectRatio: string;
  videoDuration: number | null;
  imageResolution: string;
  videoResolution: string;
  
  // 项目资源
  projectCharacters: ProjectCharacter[];
  projectScenes: ProjectScene[];
  projectProps: ProjectProp[];
  
  // 剧本内容
  scriptContent: string | null;
  scriptTitle: string;
  isLoadingScript: boolean;
  referenceScriptContent: string | null;
  referenceScriptTitle: string;
  
  // UI 状态
  showBatchDownloadModal: boolean;
  isOptimizingAllPrompts: boolean;
  isAnimaticOpen: boolean;
  isCommentPanelOpen: boolean;
  isGenerateScriptOpen: boolean;
  
  // 批量生成状态
  isBatchFrameSubmitting: boolean;
  isBatchVideoSubmitting: boolean;
}

// ========== 分镜操作接口 ==========
export interface SceneActions {
  // CRUD
  addScene: () => Promise<any>;
  insertScene: (atIndex: number) => Promise<any>;
  deleteScene: (id: number) => Promise<any>;
  moveScene: (id: number, direction: 'up' | 'down') => void;
  reorderScenes: (scenes: StoryboardScene[]) => void;
  
  // 更新
  updateDescription: (id: number, description: string) => Promise<boolean>;
  updateBaseDescription: (id: number, baseDescription: string) => Promise<boolean>;
  updateVideoPrompt: (id: number, videoPrompt: string) => Promise<boolean>;
  updateFirstFramePrompt: (id: number, prompt: string) => Promise<boolean>;
  updateLastFramePrompt: (id: number, prompt: string) => Promise<boolean>;
  updateDialogues: (id: number, dialogues: DialogueLine[]) => Promise<boolean>;
  updateVoiceover: (id: number, voiceover: string) => Promise<boolean>;
  updateCharactersAndLocation: (id: number, characters: string[], location: string, characterIds?: number[], locationId?: number) => Promise<boolean>;
  updateProps: (id: number, props: string[]) => Promise<boolean>;
  updateShotType: (id: number, shotType: string) => Promise<boolean>;
  updateCharacterStates: (id: number, states: Record<number, StoryboardStateOverride>) => Promise<boolean>;
  updateDuration: (id: number, duration: number) => Promise<boolean>;
  updateScene: (id: number, updates: Partial<StoryboardScene>) => Promise<boolean>;
  
  // 数据
  refreshScenes: () => Promise<void>;
  loadStoryboards: (targetScriptId: number) => Promise<void>;
}

// ========== 生成操作接口 ==========
export interface GenerationActions {
  generateImage: (sceneId: number, prompt?: string, regenerateTarget?: 'first' | 'last' | 'both', forceRegenerate?: boolean) => Promise<{ success: boolean; error?: string }>;
  generateVideo: (sceneId: number) => Promise<{ success: boolean; error?: string }>;
  generateWithCamera: (sceneId: number, cameraParams: CameraGenerateParams) => Promise<{ success: boolean; error?: string }>;
  generateWithPaint: (sceneId: number, paintParams: PaintGenerateParams) => Promise<{ success: boolean; error?: string }>;
  generateWithSketch: (sceneId: number, sketchParams: SketchGenerateParams) => Promise<{ success: boolean; error?: string }>;
  generateHdRepair: (sceneId: number) => Promise<{ success: boolean; error?: string }>;
  handleBatchFrameGeneration: (overwrite?: boolean) => Promise<void>;
  handleBatchVideoGeneration: (overwrite?: boolean) => Promise<void>;
  handleBatchOptimizePrompts: (targetType?: 'image' | 'video') => Promise<void>;
}

// ========== 资源操作接口 ==========
export interface ResourceActions {
  fetchProjectCharacters: () => Promise<void>;
  fetchProjectScenes: () => Promise<void>;
  fetchProjectProps: () => Promise<void>;
  createCharacter: (data: any) => Promise<any>;
  updateCharacter: (id: number, fields: any) => Promise<any>;
  deleteCharacter: (id: number) => Promise<any>;
  createLocation: (data: any) => Promise<any>;
  updateLocation: (id: number, fields: any) => Promise<any>;
  deleteLocation: (id: number) => Promise<any>;
}

// ========== 插件注册接口 ==========
export type PanelPosition = 'left' | 'center' | 'right' | 'bottom' | 'modal';

export interface StoryboardPlugin {
  id: string;
  name: string;
  icon: string;
  position: PanelPosition;
  priority: number;
  defaultActive?: boolean;
  component: React.ComponentType<PluginRenderProps>;
}

export interface PluginRenderProps {
  // 核心状态（只读）
  state: StoryboardCoreState;
  
  // 分镜数据
  scenes: StoryboardScene[];
  selectedScene: number | null;
  selectedSceneData: StoryboardScene | null;
  isLoading: boolean;
  
  // 操作委托
  sceneActions: SceneActions;
  generationActions: GenerationActions;
  resourceActions: ResourceActions;
  
  // 状态更新
  setState: <K extends keyof StoryboardCoreState>(key: K, value: StoryboardCoreState[K]) => void;
  setSelectedScene: (id: number | null) => void;
  setScenes: React.Dispatch<React.SetStateAction<StoryboardScene[]>>;
  
  // 事件总线
  emit: (event: string, payload?: any) => void;
  on: (event: string, handler: (payload: any) => void) => () => void;
  
  // 工具
  showToast: (message: string, type?: 'success' | 'error' | 'warning' | 'info') => void;
}

// ========== 骨架 Props ==========
export interface StoryboardSkeletonProps {
  scriptId?: number | null;
  projectId?: number | null;
  episodeNumber?: number;
  scripts?: Script[];
  models?: AIModel[];
  textModel: string;
  imageModel: string;
  videoModel: string;
  onEpisodeChange?: (episodeNumber: number, scriptId: number) => void;
  onCreateNextEpisode?: () => void | Promise<void>;
  projectSettings?: {
    imageAspectRatio?: string;
    imageResolution?: string;
    videoAspectRatio?: string;
    videoResolution?: string;
  };
  
  // 插件注册
  plugins?: StoryboardPlugin[];
  
  // 左侧面板扩展
  // 组件通过 useStoryboardContext 获取数据，不需要接收 props
  leftPanelTabs?: {
    id: string;
    label: string;
    icon?: string;
    component: React.ComponentType<object>;
  }[];
}
