/**
 * StoryBoard 全局桥接 Context（Portal 容器方案）
 * ──────────────────────────────────────────────────────────────
 * 目的：让 Layout 层的 VSCode 式侧栏能渲染分镜/资源/大纲面板，
 * 而不必把 915 行的 useStoryboardCore 状态机全局化。
 *
 * 关键设计（为什么用 Portal 而非传递组件/节点）：
 *  分镜/资源/大纲插件依赖 StoryBoard 内部的 StoryboardProvider
 *  （useStoryboardContext）。React 节点的上下文由「渲染位置」决定，
 *  若把节点交给 Layout 在 Provider 外渲染，会丢失上下文而报错。
 *
 *  因此改用 Portal：
 *   - Layout 侧栏渲染一个空的 DOM 容器，并把容器元素注册到本 Context。
 *   - StoryBoard 在自身 Provider 内部用 createPortal 把左侧面板内容
 *     渲染进该容器。Portal 会保留完整的 Provider 链路（上下文跟随
 *     创建它的组件树，而非 DOM 位置），同时视觉上出现在 Layout 侧栏。
 *
 *  这样：分镜面板在视觉与交互上都位于 Layout 侧栏，状态机与父页面零改动。
 */

import React, { createContext, useContext, useState, useCallback, useMemo } from 'react';

/** 左侧面板标签元信息（id + 标题，供 Layout 侧栏/活动栏显示） */
export interface BridgeLeftPanelTabMeta {
  id: string;
  label: string;
}

interface StoryboardBridgeContextValue {
  /** Layout 侧栏提供的内容容器元素（StoryBoard portal 的目标，单容器旧路径） */
  containerEl: HTMLElement | null;
  /** Layout 侧栏注册容器（单容器旧路径） */
  setContainerEl: (el: HTMLElement | null) => void;

  /** 多容器：按标签 id 注册的内容容器（手风琴分组各自一个 portal 目标） */
  containers: Record<string, HTMLElement | null>;
  /** 注册/注销某个标签的内容容器（el 为 null 表示注销） */
  setContainer: (tabId: string, el: HTMLElement | null) => void;

  /** 手风琴分组标题行右侧的「操作插槽」容器（供面板把工具栏按钮 portal 进来） */
  sectionHeaderSlots: Record<string, HTMLElement | null>;
  /** 注册/注销某个分组的标题操作插槽（el 为 null 表示注销） */
  setSectionHeaderSlot: (sectionId: string, el: HTMLElement | null) => void;

  /** StoryBoard 上报的可用标签（分镜/资源/大纲等） */
  tabs: BridgeLeftPanelTabMeta[];
  /** StoryBoard 上报当前激活标签 */
  activeTab: string | null;
  /** StoryBoard 是否已挂载并注册 */
  isRegistered: boolean;
  /** StoryBoard 注册标签与激活态 */
  registerTabs: (tabs: BridgeLeftPanelTabMeta[], activeTab: string) => void;
  /** StoryBoard 注销 */
  unregisterTabs: () => void;
  /** Layout 侧栏请求切换标签（转发给 StoryBoard） */
  requestSwitchTab: ((tabId: string) => void) | null;
  setRequestSwitchTab: (fn: ((tabId: string) => void) | null) => void;
}

const StoryboardBridgeContext = createContext<StoryboardBridgeContextValue | null>(null);

export const StoryboardBridgeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [containerEl, setContainerEl] = useState<HTMLElement | null>(null);
  const [containers, setContainers] = useState<Record<string, HTMLElement | null>>({});
  const [sectionHeaderSlots, setSectionHeaderSlots] = useState<Record<string, HTMLElement | null>>({});
  const [tabs, setTabs] = useState<BridgeLeftPanelTabMeta[]>([]);
  const [activeTab, setActiveTab] = useState<string | null>(null);
  const [isRegistered, setIsRegistered] = useState(false);
  const [requestSwitchTab, setRequestSwitchTabState] = useState<((tabId: string) => void) | null>(null);

  // 注册/注销某个标签的内容容器（手风琴分组各自的 portal 目标）
  const setContainer = useCallback((tabId: string, el: HTMLElement | null) => {
    setContainers(prev => {
      if (el === null) {
        // 注销：仅在存在时移除，避免无意义的新对象触发重渲染
        if (!(tabId in prev)) return prev;
        const next = { ...prev };
        delete next[tabId];
        return next;
      }
      if (prev[tabId] === el) return prev;
      return { ...prev, [tabId]: el };
    });
  }, []);

  // 注册/注销某个分组的标题操作插槽（与 setContainer 同构：null 注销，同元素跳过）
  const setSectionHeaderSlot = useCallback((sectionId: string, el: HTMLElement | null) => {
    setSectionHeaderSlots(prev => {
      if (el === null) {
        if (!(sectionId in prev)) return prev;
        const next = { ...prev };
        delete next[sectionId];
        return next;
      }
      if (prev[sectionId] === el) return prev;
      return { ...prev, [sectionId]: el };
    });
  }, []);

  const registerTabs = useCallback((t: BridgeLeftPanelTabMeta[], active: string) => {
    setTabs(t);
    setActiveTab(active);
    setIsRegistered(true);
  }, []);

  const unregisterTabs = useCallback(() => {
    setTabs([]);
    setActiveTab(null);
    setIsRegistered(false);
  }, []);

  const setRequestSwitchTab = useCallback((fn: ((tabId: string) => void) | null) => {
    // 函数需用惰性形式包装，避免被 setState 当作 updater 调用
    setRequestSwitchTabState(() => fn);
  }, []);

  const value = useMemo<StoryboardBridgeContextValue>(
    () => ({
      containerEl,
      setContainerEl,
      containers,
      setContainer,
      sectionHeaderSlots,
      setSectionHeaderSlot,
      tabs,
      activeTab,
      isRegistered,
      registerTabs,
      unregisterTabs,
      requestSwitchTab,
      setRequestSwitchTab,
    }),
    [containerEl, containers, setContainer, sectionHeaderSlots, setSectionHeaderSlot, tabs, activeTab, isRegistered, registerTabs, unregisterTabs, requestSwitchTab, setRequestSwitchTab],
  );

  return (
    <StoryboardBridgeContext.Provider value={value}>
      {children}
    </StoryboardBridgeContext.Provider>
  );
};

export function useStoryboardBridge(): StoryboardBridgeContextValue {
  const ctx = useContext(StoryboardBridgeContext);
  if (!ctx) throw new Error('useStoryboardBridge must be used within StoryboardBridgeProvider');
  return ctx;
}

/** 安全版：不抛错，供可选消费方使用 */
export function useStoryboardBridgeSafe(): StoryboardBridgeContextValue | null {
  return useContext(StoryboardBridgeContext);
}

export default StoryboardBridgeContext;
