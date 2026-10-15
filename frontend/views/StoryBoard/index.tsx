/**
 * StoryBoard - VSCode 式骨架容器
 * 
 * 职责：
 * 1. 提供三栏布局容器（左侧 Sidebar + 中间 Editor + 右侧 Panel）
 * 2. 管理核心状态（通过 useStoryboardCore）
 * 3. 通过 Context 向插件注入共享能力
 * 4. 顶栏：集数选择器
 * 
 * 扩展方式：
 * - 左侧面板标签：通过 leftPanelTabs 配置注入
 * - 右侧插件：通过 plugins 配置注入
 * - 中间内容：固定为 PreviewEditor（核心编辑区）
 */

import React, { useState, useMemo, Component, ReactNode, useCallback, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Wand2 } from 'lucide-react';
import { useStoryboardCore, StoryboardProvider } from './core';
import type { StoryboardSkeletonProps, StoryboardPlugin } from './core/types';
import { PanelGroup } from '../../components/PanelGroup';
import ResizablePanel, { ResizablePanelRef } from '../../components/ResizablePanel';
import { useToast } from '../../contexts/ToastContext';
import { useWorkbench } from '../../contexts/WorkbenchContext';
import { useStoryboardBridgeSafe } from '../../contexts/StoryboardBridgeContext';
import { Project } from '../../services/projects';
import EpisodeSelector from './EpisodeSelector';

// ===== 默认插件 =====
import SceneListPlugin from './plugins/scene-list';
import ResourcePanelPlugin from './plugins/resource-panel';
import ScriptOutlinePlugin from './plugins/script-outline';
import ExtensionsPanelPlugin from './plugins/extensions-panel';
import PreviewEditorPlugin from './plugins/preview-editor';
import { useStoryboardAIAssistantBridge } from './plugins/ai-assistant';
// ===== 工作台左侧面板扩展（主界面内嵌为标签页） =====
import ProjectsSidePanel from '../../components/SidePanels/ProjectsSidePanel';
import TeamsSidePanel from '../../components/SidePanels/TeamsSidePanel';

// ===== Error Boundary =====
interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

class StoryboardErrorBoundary extends Component<
  { children: ReactNode },
  ErrorBoundaryState
> {
  state: ErrorBoundaryState = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('[StoryboardErrorBoundary] Caught error:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center h-full gap-4 bg-(--bg-app)">
          <p className="text-lg font-medium text-(--text-secondary)">Something went wrong loading the storyboard.</p>
          <p className="text-sm text-(--text-muted)">{this.state.error?.message}</p>
          <button
            onClick={() => this.setState({ hasError: false, error: null })}
            className="pro-btn-primary px-4 py-2"
          >
            Retry
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

// ===== 默认左侧标签页配置 =====
const DEFAULT_LEFT_TABS = [
  { id: 'projects', label: '工程', component: ProjectsSidePanel },
  { id: 'scenes', label: '分镜列表', component: SceneListPlugin },
  { id: 'resources', label: '资源', component: ResourcePanelPlugin },
  { id: 'outline', label: '大纲', component: ScriptOutlinePlugin },
  { id: 'teams', label: '团队', component: TeamsSidePanel },
  { id: 'extensions', label: '扩展', component: ExtensionsPanelPlugin },
];

// ===== 骨架组件 =====
const StoryboardSkeleton: React.FC<StoryboardSkeletonProps> = ({
  scriptId,
  projectId,
  episodeNumber = 1,
  scripts = [],
  models = [],
  textModel,
  imageModel,
  videoModel,
  onEpisodeChange,
  onCreateNextEpisode,
  projectSettings,
  plugins = [],
  leftPanelTabs = DEFAULT_LEFT_TABS,
}) => {
  // 核心状态管理
  const core = useStoryboardCore({
    scriptId, projectId, episodeNumber,
    scripts, models, textModel, imageModel, videoModel,
    onEpisodeChange, projectSettings,
  });

  const {
    state,
    scenes,
    setScenes,
    selectedScene,
    setSelectedScene,
    selectedSceneData,
    isLoading,
    sceneActions,
    generationActions,
    resourceActions,
    handleEpisodeSelect,
    handleStandaloneEpisodeChange,
    handleCreateNextEpisode,
    handleImportScenes,
    emit,
    on,
    setState,
    leftPanelOpen,
    openLeftPanel,
    closeLeftPanel,
    tasks,
    isRunning,
    autoStoryboard,
    showToast,
  } = core;

  // 左侧面板标签状态
  const [leftPanelTab, setLeftPanelTab] = useState(() => {
    const stored = localStorage.getItem('nanostory_left_panel_tab');
    return stored && leftPanelTabs.some(t => t.id === stored) ? stored : (leftPanelTabs[0]?.id || 'scenes');
  });

  // 切换左侧面板标签（展开面板 + 持久化 + 通知图标栏激活态）
  const switchLeftPanelTab = useCallback((tabId: string) => {
    if (!leftPanelTabs.some(t => t.id === tabId)) return;
    setLeftPanelTab(tabId);
    localStorage.setItem('nanostory_left_panel_tab', tabId);
    window.dispatchEvent(new CustomEvent('leftPanelTabChanged'));
    openLeftPanel();
  }, [leftPanelTabs, openLeftPanel]);

  // 监听外部切换左侧面板标签事件（Layout 图标栏/命令面板/快捷键触发）
  useEffect(() => {
    const handleSwitchLeftPanelTab = (e: CustomEvent<{ tabId: string }>) => {
      switchLeftPanelTab(e.detail.tabId);
    };
    window.addEventListener('switchLeftPanelTab', handleSwitchLeftPanelTab as EventListener);
    return () => {
      window.removeEventListener('switchLeftPanelTab', handleSwitchLeftPanelTab as EventListener);
    };
  }, [switchLeftPanelTab]);

  // ===== 当前项目（从 Workbench 读取，用于集数选择器等） =====
  const { currentProject } = useWorkbench();

  // refs
  const resourcePanelRef = React.useRef<ResizablePanelRef>(null);

  // 注册外部插件
  React.useEffect(() => {
    plugins.forEach(plugin => {
      // 插件注册逻辑（通过 Context）
    });
  }, [plugins]);

  // Context value
  const contextValue = useMemo(() => ({
    state,
    scenes,
    selectedScene,
    selectedSceneData,
    isLoading,
    sceneActions,
    generationActions,
    resourceActions,
    setState,
    setSelectedScene,
    setScenes,
    emit,
    on,
    showToast,
    handleEpisodeSelect,
    handleStandaloneEpisodeChange,
    handleCreateNextEpisode,
    tasks,
    isRunning,
    autoStoryboard,
  }), [state, scenes, selectedScene, selectedSceneData, isLoading, sceneActions, generationActions, resourceActions, setState, setSelectedScene, setScenes, emit, on, showToast, handleEpisodeSelect, handleStandaloneEpisodeChange, handleCreateNextEpisode, tasks, isRunning, autoStoryboard]);

  // 将工作台数据/动作桥接到全局 AI 助手侧边栏
  useStoryboardAIAssistantBridge({
    state,
    scenes,
    selectedScene,
    sceneActions,
    generationActions,
    resourceActions,
    setState,
    showToast,
    autoStoryboard,
  });

  // ===== 桥接到 Layout 侧栏（VSCode 式）：上报标签 + 提供 portal 容器 =====
  const bridge = useStoryboardBridgeSafe();
  // 解构出稳定方法（均为 useCallback 空依赖，引用不随 containers 变化），
  // 避免下方 effect 依赖整个 bridge 对象：手风琴展开/折叠会更新 containers →
  // 重建 bridge → 触发本 effect 清理重跑 → isRegistered 瞬时为 false →
  // 创作工作台分组内容容器被卸载又挂载，造成抖动。
  const registerTabs = bridge?.registerTabs;
  const unregisterTabs = bridge?.unregisterTabs;
  const setRequestSwitchTab = bridge?.setRequestSwitchTab;
  const bridgeTabs = useMemo(
    () => leftPanelTabs.map(t => ({ id: t.id, label: t.label })),
    [leftPanelTabs],
  );
  // 注册标签与切换函数；卸载时注销
  useEffect(() => {
    if (!registerTabs || !unregisterTabs || !setRequestSwitchTab) return;
    registerTabs(bridgeTabs, leftPanelTab);
    // 传入切换函数本身（Context 内部已用惰性形式包装，防止 setState 误判 updater）。
    // 若再包一层 () => switchLeftPanelTab，requestSwitchTab 会变成“返回函数的函数”，
    // 调用它不会真正执行切换，导致 StoryBoard 内部 leftPanelTab 不更新、
    // Layout 侧栏标题与 Portal 内容错位（如标题“大纲”却显示团队面板）。
    setRequestSwitchTab(switchLeftPanelTab);
    return () => {
      unregisterTabs();
      setRequestSwitchTab(null);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [registerTabs, unregisterTabs, setRequestSwitchTab, bridgeTabs, switchLeftPanelTab]);
  // 激活标签变化时同步给桥接（用于活动栏高亮）
  useEffect(() => {
    if (!registerTabs || !bridge?.isRegistered) return;
    registerTabs(bridgeTabs, leftPanelTab);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leftPanelTab]);

  // 渲染到 Layout 侧栏容器的面板内容（portal 保留 StoryboardProvider 上下文）
  // 手风琴整合：分镜/资源/大纲三个面板同时挂载，各自 portal 到创作工作台
  // 侧栏对应分组的容器（bridge.containers[id]）。projects/teams 整面板由
  // ActivityBarSidebar 直接渲染（不经过本 portal），故此处无需单容器旧路径。
  const containers = bridge?.containers ?? {};
  const accordionPanels = [
    { id: 'scenes', node: <SceneListPlugin /> },
    { id: 'resources', node: <ResourcePanelPlugin /> },
    { id: 'outline', node: <ScriptOutlinePlugin /> },
  ];

  return (
    <StoryboardProvider value={contextValue}>
      <div className="h-full flex flex-col bg-(--bg-app)">

        {/* ===== 无项目提示 ===== */}
        {!state.currentProjectId && (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <Wand2 className="w-16 h-16 mx-auto mb-4 text-(--text-muted) opacity-30" />
              <p className="text-lg font-medium text-(--text-secondary)">请先选择项目</p>
              <p className="text-sm mt-1 text-(--text-muted)">选择项目后即可开始分镜创作</p>
            </div>
          </div>
        )}

        {/* ===== 主内容区 - 三栏布局 ===== */}
        {state.currentProjectId && (
          <div className="flex-1 overflow-hidden flex flex-col min-h-0">
            {/* 手风琴三分组：分镜/资源/大纲分别 portal 到创作工作台侧栏对应容器 */}
            {accordionPanels.map(p =>
              containers[p.id]
                ? createPortal(
                    <div className="flex flex-col h-full overflow-hidden">{p.node}</div>,
                    containers[p.id] as HTMLElement,
                  )
                : null,
            )}
            <div className="flex-1 overflow-hidden relative min-h-0">
              <PreviewEditorPlugin />

              {/* 智能拆分中遮罩 */}
              {autoStoryboard.isGenerating && (
                <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-black/60 backdrop-blur-sm">
                  <div className="w-12 h-12 border-4 border-(--accent) border-t-transparent rounded-full animate-spin mb-4" />
                  <div className="text-lg font-semibold text-white mb-1">正在智能拆分中</div>
                  <div className="text-sm text-white/70">请稍候，AI 正在分析剧本并生成分镜与影棚...</div>
                  {autoStoryboard.progress && (
                    <div className="mt-4 w-64">
                      <div className="h-1.5 bg-white/20 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-(--accent) rounded-full transition-all duration-500"
                          style={{ width: `${autoStoryboard.progress.overallProgress || 0}%` }}
                        />
                      </div>
                      <div className="text-xs text-white/60 mt-1.5 flex items-center justify-between">
                        <span className="text-white/40 italic">{autoStoryboard.progress.stepName || '处理中...'}</span>
                        <span>{autoStoryboard.progress.overallProgress ? `${autoStoryboard.progress.overallProgress}%` : ''}</span>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </StoryboardProvider>
  );
};

// ===== 带 Error Boundary 的导出 =====
const StoryBoard: React.FC<StoryboardSkeletonProps> = (props) => (
  <StoryboardErrorBoundary>
    <StoryboardSkeleton {...props} />
  </StoryboardErrorBoundary>
);

export default StoryBoard;
