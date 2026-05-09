/**
 * PluginContext - 插件运行时上下文
 * 提供 PluginAPI 的 React Context 实现
 */

import React, { createContext, useContext, useCallback, useRef, useEffect, useState } from 'react';
import { PluginAPI, SharedStateKey, PanelState, StoryboardPlugin } from './types';

// ==================== Context 定义 ====================

interface PluginContextValue {
  api: PluginAPI;
  panelState: PanelState;
  setPanelState: React.Dispatch<React.SetStateAction<PanelState>>;
  plugins: StoryboardPlugin[];
}

const PluginContext = createContext<PluginContextValue | null>(null);

export function usePluginContext(): PluginContextValue {
  const ctx = useContext(PluginContext);
  if (!ctx) throw new Error('usePluginContext must be used within PluginProvider');
  return ctx;
}

export function usePluginAPI(): PluginAPI {
  return usePluginContext().api;
}

// ==================== Provider 组件 ====================

interface PluginProviderProps {
  children: React.ReactNode;
  api: PluginAPI;
  plugins: StoryboardPlugin[];
}

export const PluginProvider: React.FC<PluginProviderProps> = ({
  children,
  api,
  plugins,
}) => {
  const [panelState, setPanelState] = useState<PanelState>({
    activeLeftPlugin: plugins.find(p => p.position === 'left' && p.defaultActive)?.id || null,
    activeRightPlugin: plugins.find(p => p.position === 'right' && p.defaultActive)?.id || null,
    leftOpen: true,
    rightOpen: true,
    bottomOpen: false,
  });

  return (
    <PluginContext.Provider value={{ api, panelState, setPanelState, plugins }}>
      {children}
    </PluginContext.Provider>
  );
};
