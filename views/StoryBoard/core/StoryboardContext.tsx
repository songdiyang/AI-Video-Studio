/**
 * StoryBoard 插件上下文
 * 通过 React Context 向所有插件注入共享状态和能力
 */

import React, { createContext, useContext, useRef, useCallback } from 'react';
import type { 
  StoryboardCoreState, 
  SceneActions, 
  GenerationActions, 
  ResourceActions,
  StoryboardPlugin,
  Script
} from './types';
import { StoryboardScene } from '../useSceneManager';

export interface StoryboardContextValue {
  // 核心状态
  state: StoryboardCoreState;
  
  // 分镜数据
  scenes: StoryboardScene[];
  selectedScene: number | null;
  selectedSceneData: StoryboardScene | null;
  isLoading: boolean;
  
  // 操作
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
  
  // 集数切换
  handleEpisodeSelect: (script: Script | null) => void;
  
  // 已注册插件
  plugins: StoryboardPlugin[];
  registerPlugin: (plugin: StoryboardPlugin) => void;
  unregisterPlugin: (pluginId: string) => void;
}

const StoryboardContext = createContext<StoryboardContextValue | null>(null);

export const useStoryboardContext = () => {
  const ctx = useContext(StoryboardContext);
  if (!ctx) throw new Error('useStoryboardContext must be used within StoryboardProvider');
  return ctx;
};

export const StoryboardProvider: React.FC<{
  children: React.ReactNode;
  value: Omit<StoryboardContextValue, 'plugins' | 'registerPlugin' | 'unregisterPlugin'>;
}> = ({ children, value }) => {
  const pluginsRef = useRef<StoryboardPlugin[]>([]);
  
  const registerPlugin = useCallback((plugin: StoryboardPlugin) => {
    pluginsRef.current = [...pluginsRef.current, plugin].sort((a, b) => a.priority - b.priority);
  }, []);
  
  const unregisterPlugin = useCallback((pluginId: string) => {
    pluginsRef.current = pluginsRef.current.filter(p => p.id !== pluginId);
  }, []);

  return (
    <StoryboardContext.Provider value={{
      ...value,
      plugins: pluginsRef.current,
      registerPlugin,
      unregisterPlugin,
    }}>
      {children}
    </StoryboardContext.Provider>
  );
};

export default StoryboardContext;
