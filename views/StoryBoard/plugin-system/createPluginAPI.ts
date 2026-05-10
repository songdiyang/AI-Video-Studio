/**
 * createPluginAPI - 从 StoryBoard 核心状态创建 PluginAPI 实例
 * 将 StoryBoard 内部的 state 和 actions 封装为标准化的 PluginAPI
 */

import { PluginAPI, SharedStateKey } from './types';
import { StoryboardScene, DialogueLine } from '../useSceneManager';

// 简单的 EventEmitter 实现
class SimpleEventEmitter {
  private handlers = new Map<string, Set<(payload: any) => void>>();

  on(event: string, handler: (payload: any) => void): () => void {
    if (!this.handlers.has(event)) {
      this.handlers.set(event, new Set());
    }
    this.handlers.get(event)!.add(handler);
    return () => {
      this.handlers.get(event)?.delete(handler);
    };
  }

  emit(event: string, payload?: any): void {
    this.handlers.get(event)?.forEach(h => {
      try { h(payload); } catch (e) { console.error(`[PluginEvent] ${event} handler error:`, e); }
    });
  }
}

// ==================== 创建 PluginAPI ====================

interface CreatePluginAPIOptions {
  // State refs (使用 ref 避免闭包陷阱)
  stateRefs: {
    scenes: React.MutableRefObject<StoryboardScene[]>;
    selectedScene: React.MutableRefObject<number | null>;
    isLoading: React.MutableRefObject<boolean>;
    projectCharacters: React.MutableRefObject<any[]>;
    projectScenes: React.MutableRefObject<any[]>;
    projectProps: React.MutableRefObject<any[]>;
    projectEnvironments: React.MutableRefObject<any[]>;
    projectBuildings: React.MutableRefObject<any[]>;
    projectCostumes: React.MutableRefObject<any[]>;
    currentProjectId: React.MutableRefObject<number | null>;
    currentScriptId: React.MutableRefObject<number | null>;
    currentEpisode: React.MutableRefObject<number>;
    currentProject: React.MutableRefObject<any>;
    models: React.MutableRefObject<any[]>;
    imageModel: React.MutableRefObject<string>;
    videoModel: React.MutableRefObject<string>;
    textModel: React.MutableRefObject<string>;
    multimodalModel: React.MutableRefObject<string>;
    imageAspectRatio: React.MutableRefObject<string>;
    videoAspectRatio: React.MutableRefObject<string>;
    imageResolution: React.MutableRefObject<string>;
    videoResolution: React.MutableRefObject<string>;
    videoDuration: React.MutableRefObject<number | null>;
    scriptContent: React.MutableRefObject<string | null>;
    scriptTitle: React.MutableRefObject<string>;
    referenceScriptContent: React.MutableRefObject<string | null>;
    referenceScriptTitle: React.MutableRefObject<string>;
    isLoadingScript: React.MutableRefObject<boolean>;
    tasks: React.MutableRefObject<Record<string, any>>;
    isRunning: React.MutableRefObject<boolean>;
    storyboardStates: React.MutableRefObject<Record<number, any>>;
    allCharacters: React.MutableRefObject<string[]>;
    allLocations: React.MutableRefObject<string[]>;
    allProps: React.MutableRefObject<any[]>;
    isBatchFrameSubmitting: React.MutableRefObject<boolean>;
    isBatchVideoSubmitting: React.MutableRefObject<boolean>;
    isOptimizingAllPrompts: React.MutableRefObject<boolean>;
    autoStoryboard: React.MutableRefObject<any>;
    batchResource: React.MutableRefObject<any>;
    standaloneMaxEpisode: React.MutableRefObject<number>;
    scripts: React.MutableRefObject<any[]>;
  };

  // State setters
  setters: {
    setSelectedScene: (id: number | null) => void;
    setLeftPanelTab?: (tab: string) => void;
    setRightPanelOpen?: (open: boolean) => void;
    setLeftPanelOpen?: (open: boolean) => void;
    setBottomPanelOpen?: (open: boolean) => void;
    setCurrentEpisode?: (ep: number) => void;
    setCurrentScriptId?: (id: number | null) => void;
    setReferenceScriptContent?: (content: string | null) => void;
    setReferenceScriptTitle?: (title: string) => void;
  };

  // Actions
  actions: {
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
    generateImage: (sceneId: number, prompt: string, regenerateTarget?: 'first' | 'last' | 'both', forceRegenerate?: boolean) => Promise<{ success: boolean; error?: string }>;
    generateVideo: (sceneId: number) => Promise<{ success: boolean; error?: string }>;
    generateWithCamera: (sceneId: number, prompt: string, config?: any) => Promise<{ success: boolean; error?: string }>;
    generateWithPaint: (sceneId: number, prompt: string, config?: any) => Promise<{ success: boolean; error?: string }>;
    generateWithSketch: (sceneId: number, prompt: string, config?: any) => Promise<{ success: boolean; error?: string }>;
    generateHdRepair: (sceneId: number, prompt: string, config?: any) => Promise<{ success: boolean; error?: string }>;
    batchGenerateFrames: (overwrite?: boolean) => Promise<void>;
    batchGenerateVideos: (overwrite?: boolean) => Promise<void>;
    batchOptimizePrompts: (targetType?: 'image' | 'video') => Promise<void>;
    refreshScenes: () => Promise<void>;
    loadScript: (projectId: number, episode: number) => Promise<void>;
    switchEpisode: (episode: number, scriptId?: number) => void;
    createNextEpisode: () => Promise<void>;
    refreshCharacters: () => Promise<void>;
    refreshProps: () => Promise<void>;
    showToast: (message: string, type?: 'success' | 'error' | 'warning' | 'info') => void;
    getAuthToken: () => string | null;
  };
}

export function createPluginAPI(options: CreatePluginAPIOptions): PluginAPI {
  const { stateRefs, setters, actions } = options;
  const emitter = new SimpleEventEmitter();

  // 共享状态存储（用于 setState/getState 的通用 KV）
  const sharedStore = new Map<SharedStateKey, any>();

  const api: PluginAPI = {
    // ---- 状态访问 ----
    getState: <T>(key: SharedStateKey): T | undefined => {
      // 优先从 ref 读取实时值
      const ref = stateRefs[key as keyof typeof stateRefs];
      if (ref && 'current' in ref) {
        return ref.current as T;
      }
      return sharedStore.get(key) as T;
    },

    setState: <T>(key: SharedStateKey, value: T): void => {
      sharedStore.set(key, value);
      emitter.emit(`state:${key}`, value);
    },

    useState: <T>(key: SharedStateKey): T | undefined => {
      // 这个在组件内使用，需要通过 hook 实现
      // 这里返回当前值，实际组件中应使用 usePluginState hook
      return api.getState<T>(key);
    },

    // ---- 事件总线 ----
    emit: (event: string, payload?: any) => emitter.emit(event, payload),
    on: (event: string, handler: (payload: any) => void) => emitter.on(event, handler),

    // ---- 面板控制 ----
    openPanel: (pluginId: string) => {
      emitter.emit('panel:open', { pluginId });
    },
    closePanel: (pluginId: string) => {
      emitter.emit('panel:close', { pluginId });
    },
    togglePanel: (pluginId: string) => {
      emitter.emit('panel:toggle', { pluginId });
    },
    setActiveTab: (pluginId: string) => {
      emitter.emit('tab:active', { pluginId });
    },

    // ---- 快捷数据访问 ----
    getScenes: () => stateRefs.scenes.current,
    getSelectedScene: () => {
      const id = stateRefs.selectedScene.current;
      return id ? stateRefs.scenes.current.find(s => s.id === id) || null : null;
    },
    getSelectedSceneId: () => stateRefs.selectedScene.current,
    getProjectId: () => stateRefs.currentProjectId.current,
    getScriptId: () => stateRefs.currentScriptId.current,
    getEpisode: () => stateRefs.currentEpisode.current,

    // ---- 分镜操作 ----
    selectScene: (sceneId: number | null) => {
      setters.setSelectedScene(sceneId);
      emitter.emit('scene:select', { sceneId });
    },
    addScene: actions.addScene,
    insertScene: actions.insertScene,
    deleteScene: async (sceneId: number) => {
      await actions.deleteScene(sceneId);
      emitter.emit('scene:delete', { sceneId });
    },
    moveScene: actions.moveScene,
    reorderScenes: actions.reorderScenes,
    updateScene: actions.updateScene,
    updateDescription: actions.updateDescription,
    updateBaseDescription: actions.updateBaseDescription,
    updateVideoPrompt: actions.updateVideoPrompt,
    updateFirstFramePrompt: actions.updateFirstFramePrompt,
    updateLastFramePrompt: actions.updateLastFramePrompt,
    updateDialogues: actions.updateDialogues,
    updateVoiceover: actions.updateVoiceover,
    updateCharactersAndLocation: actions.updateCharactersAndLocation,
    updateProps: actions.updateProps,
    updateShotType: actions.updateShotType,
    updateDuration: actions.updateDuration,
    updateCharacterStates: actions.updateCharacterStates,

    // ---- 生成操作 ----
    generateImage: actions.generateImage,
    generateVideo: actions.generateVideo,
    generateWithCamera: actions.generateWithCamera,
    generateWithPaint: actions.generateWithPaint,
    generateWithSketch: actions.generateWithSketch,
    generateHdRepair: actions.generateHdRepair,

    // ---- 批量操作 ----
    batchGenerateFrames: actions.batchGenerateFrames,
    batchGenerateVideos: actions.batchGenerateVideos,
    batchOptimizePrompts: actions.batchOptimizePrompts,

    // ---- 项目/剧本操作 ----
    refreshScenes: actions.refreshScenes,
    loadScript: actions.loadScript,
    switchEpisode: actions.switchEpisode,
    createNextEpisode: actions.createNextEpisode,

    // ---- 资源加载 ----
    refreshCharacters: actions.refreshCharacters,
    refreshProps: actions.refreshProps,

    // ---- 工具 ----
    showToast: actions.showToast,
    getAuthToken: actions.getAuthToken,
  };

  return api;
}
