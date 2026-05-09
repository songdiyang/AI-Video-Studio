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

import React, { useState, useMemo, Component, ReactNode, lazy, Suspense } from 'react';
import { Wand2 } from 'lucide-react';
import { useStoryboardCore, StoryboardProvider } from './core';
import type { StoryboardSkeletonProps, StoryboardPlugin } from './core/types';
import { PanelGroup } from '../../components/PanelGroup';
import ResizablePanel, { ResizablePanelRef } from '../../components/ResizablePanel';
import { useAIAssistantUI } from '../../contexts/AIAssistantContext';
import { useToast } from '../../contexts/ToastContext';
import EpisodeSelector from './EpisodeSelector';

// ===== 默认插件 =====
import SceneListPlugin from './plugins/scene-list';
import ResourcePanelPlugin from './plugins/resource-panel';
import ScriptOutlinePlugin from './plugins/script-outline';
import PreviewEditorPlugin from './plugins/preview-editor';

// 懒加载 AI 助手
const AIAssistantPlugin = lazy(() => import('./plugins/ai-assistant'));

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
  { id: 'scenes', label: '分镜列表', component: SceneListPlugin },
  { id: 'resources', label: '资源', component: ResourcePanelPlugin },
  { id: 'outline', label: '大纲', component: ScriptOutlinePlugin },
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
    isAssistantOpen,
    leftPanelOpen,
    rightPanelOpen,
    closeLeftPanel,
    closeRightPanel,
    tasks,
    isRunning,
    autoStoryboard,
    showToast,
  } = core;

  // 左侧面板标签状态
  const [leftPanelTab, setLeftPanelTab] = useState(leftPanelTabs[0]?.id || 'scenes');

  // refs
  const resourcePanelRef = React.useRef<ResizablePanelRef>(null);
  const assistantPanelRef = React.useRef<ResizablePanelRef>(null);

  // 当前选中的标签页组件
  const ActiveLeftPanel = useMemo(() => {
    const tab = leftPanelTabs.find(t => t.id === leftPanelTab);
    return tab?.component || leftPanelTabs[0]?.component;
  }, [leftPanelTabs, leftPanelTab]);

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
    tasks,
    isRunning,
  }), [state, scenes, selectedScene, selectedSceneData, isLoading, sceneActions, generationActions, resourceActions, setState, setSelectedScene, setScenes, emit, on, showToast, handleEpisodeSelect, tasks, isRunning]);

  return (
    <StoryboardProvider value={contextValue}>
      <div className="h-full flex flex-col bg-(--bg-app)">
        {/* ===== 顶部工具栏 ===== */}
        <div className="shrink-0 border-b border-(--border-color) bg-(--bg-card)">
          <div className="h-11 px-4 flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <EpisodeSelector
                scripts={scripts}
                currentEpisode={state.currentEpisode}
                currentScriptId={state.currentScriptId}
                projectName={state.currentProject?.name}
                onSelect={handleEpisodeSelect}
                onStandaloneEpisodeChange={handleStandaloneEpisodeChange}
                standaloneMaxEpisode={state.standaloneMaxEpisode}
                onCreateNextEpisode={onCreateNextEpisode || handleCreateNextEpisode}
                onUpdateEpisodeTitle={async (scriptId, title) => {
                  try {
                    const { updateScriptTitle, fetchScripts } = await import('../../services/scripts');
                    await updateScriptTitle(scriptId, title);
                    showToast('标题已更新', 'success');
                    const refreshed = await fetchScripts();
                    const updated = refreshed.find((s: any) => s.id === scriptId);
                    if (updated) {
                      onEpisodeChange?.(updated.episode_number, updated.id);
                    }
                  } catch (err: any) {
                    showToast(err?.message || '更新标题失败', 'error');
                  }
                }}
              />
              {scenes.length > 0 && (
                <span className="text-xs text-(--text-muted) px-2 py-0.5 rounded bg-(--bg-app)">
                  {scenes.length} 个分镜
                </span>
              )}
            </div>
          </div>
        </div>

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
            <div className="flex-1 overflow-hidden relative min-h-0">
              <PanelGroup 
                direction="horizontal" 
                storageKey="storyboard-layout"
                mobileDefaultPanel={1}
                mobilePanelLabels={rightPanelOpen ? ['分镜/资源', '预览编辑', 'AI助手'] : ['分镜/资源', '预览编辑']}
              >
                {/* ===== 左侧：可扩展标签页面板 ===== */}
                <ResizablePanel 
                  ref={resourcePanelRef} 
                  defaultSize={25} 
                  minSize={15} 
                  maxSize={35} 
                  collapsedSize={8} 
                  collapsible={true} 
                  collapsed={!leftPanelOpen} 
                  onCollapse={(collapsed) => { if (collapsed) closeLeftPanel(); }}
                >
                  <div className="flex flex-col h-full overflow-hidden">
                    {/* 标签切换栏 - 动态渲染 */}
                    <div className="flex items-center gap-0.5 px-2 py-1.5 border-b shrink-0" style={{ borderColor: 'var(--border-color)', backgroundColor: 'var(--bg-secondary)' }}>
                      {leftPanelTabs.map(tab => (
                        <button
                          key={tab.id}
                          onClick={() => setLeftPanelTab(tab.id)}
                          className={`flex-1 px-3 py-1 text-xs font-medium rounded-md transition-all ${
                            leftPanelTab === tab.id
                              ? 'text-[var(--accent)]'
                              : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)]'
                          }`}
                          style={leftPanelTab === tab.id ? { backgroundColor: 'color-mix(in srgb, var(--accent) 15%, transparent)' } : {}}
                        >
                          {tab.label}
                        </button>
                      ))}
                    </div>

                    {/* 内容区域 - 渲染当前选中的插件 */}
                    <div className="flex-1 overflow-hidden">
                      <ActiveLeftPanel />
                    </div>
                  </div>
                </ResizablePanel>

                {/* ===== 中间：预览编辑（核心，不可替换） ===== */}
                <ResizablePanel defaultSize={rightPanelOpen ? 50 : 75} minSize={35}>
                  <PreviewEditorPlugin />
                </ResizablePanel>

                {/* ===== 右侧：AI 助手（可扩展为其他插件） ===== */}
                {rightPanelOpen && (
                  <ResizablePanel
                    ref={assistantPanelRef}
                    defaultSize={25}
                    minSize={18}
                    maxSize={40}
                    collapsedSize={8}
                    collapsible={true}
                    collapsed={!rightPanelOpen}
                    onCollapse={(collapsed) => { if (collapsed) closeRightPanel(); }}
                  >
                    <AIAssistantPlugin />
                  </ResizablePanel>
                )}
              </PanelGroup>

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
                        <span className="text-white/40 italic">{autoStoryboard.progress.message || '处理中...'}</span>
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
