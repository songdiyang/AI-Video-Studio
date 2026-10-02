/**
 * VSCode 式左侧栏（内容面板）
 * ──────────────────────────────────────────────────────────────
 * 常驻在活动栏右侧，承载当前激活活动的面板内容：
 *  - projects / teams / extensions：自包含面板，任何页面可用，直接渲染
 *  - scenes / resources / outline：分镜相关，通过 StoryboardBridge 以
 *    Portal 渲染（StoryBoard 在内部 Provider 下把内容传送进来），
 *    仅当 StoryBoard 挂载且有项目时可用
 *
 * 宽度可拖拽调整（useResizableSidebar），可折叠。
 */
import React, { useEffect, useRef } from 'react';
import { X } from 'lucide-react';
import { useWorkbench } from '../../contexts/WorkbenchContext';
import { useStoryboardBridgeSafe } from '../../contexts/StoryboardBridgeContext';
import { useResizableSidebar } from '../../hooks/useResizableSidebar';
import ProjectsSidePanel from '../SidePanels/ProjectsSidePanel';
import TeamsSidePanel from '../SidePanels/TeamsSidePanel';
import WorkspaceSidePanel from '../SidePanels/WorkspaceSidePanel';
import ExtensionsPanelPlugin from '../../views/StoryBoard/plugins/extensions-panel';

/** 活动 id → 中文标题 */
const TAB_TITLES: Record<string, string> = {
  workspace: '创作工作台',
  projects: '我的工程',
  teams: '团队',
  extensions: '扩展',
  scenes: '分镜列表',
  resources: '资源',
  outline: '大纲',
};

const ActivityBarSidebar: React.FC = () => {
  const { leftSidebarTab, setLeftSidebarTab } = useWorkbench();
  const bridge = useStoryboardBridgeSafe();

  const resize = useResizableSidebar({
    storageKey: 'vscode_left_sidebar_width',
    defaultWidth: 280,
    minWidth: 200,
    maxWidth: 560,
    side: 'left',
  });

  // 分镜类标签容器 ref（StoryBoard portal 的目标）
  const bridgeContainerRef = useRef<HTMLDivElement>(null);

  // 当前标签是否为分镜类（桥接）标签
  const isBridgeTab = bridge?.tabs.some(t => t.id === leftSidebarTab) ?? false;

  // 桥接标签激活时，把容器元素注册到桥接，供 StoryBoard portal
  useEffect(() => {
    if (!bridge) return;
    if (isBridgeTab && bridgeContainerRef.current) {
      bridge.setContainerEl(bridgeContainerRef.current);
    } else {
      bridge.setContainerEl(null);
    }
    return () => {
      bridge.setContainerEl(null);
    };
  }, [bridge, isBridgeTab, leftSidebarTab]);

  if (!leftSidebarTab) return null;

  const renderContent = (): React.ReactNode => {
    if (leftSidebarTab === 'workspace') return <WorkspaceSidePanel />;
    if (leftSidebarTab === 'projects') return <ProjectsSidePanel />;
    if (leftSidebarTab === 'teams') return <TeamsSidePanel />;
    if (leftSidebarTab === 'extensions') return <ExtensionsPanelPlugin />;
    if (isBridgeTab) {
      // 分镜类：渲染空容器，由 StoryBoard 通过 portal 填充
      return <div ref={bridgeContainerRef} className="h-full overflow-hidden" />;
    }
    return (
      <div className="flex flex-col items-center justify-center h-full text-(--text-muted) text-xs px-4 text-center">
        <p>该面板需要先进入一个项目的工作台</p>
      </div>
    );
  };

  const title = TAB_TITLES[leftSidebarTab]
    ?? bridge?.tabs.find(t => t.id === leftSidebarTab)?.label
    ?? leftSidebarTab;

  return (
    <div
      className="relative shrink-0 min-w-0 flex flex-col bg-(--bg-nav) border-r border-(--border-color) h-full"
      style={{ width: resize.width }}
    >
      {/* 拖拽手柄（右缘） */}
      <div
        {...resize.handleProps}
        role="separator"
        aria-orientation="vertical"
        className={`absolute right-0 top-0 bottom-0 w-[5px] z-10 cursor-col-resize transition-colors ${
          resize.isDragging ? 'bg-(--accent)/60' : 'hover:bg-(--accent)/40'
        }`}
      />
      {/* 面板头部：标题 + 关闭（扩展面板除外，它有自己的标题栏） */}
      {leftSidebarTab !== 'extensions' && (
        <div className="flex items-center justify-between px-3 h-9 border-b border-(--border-color) shrink-0">
          <span className="text-xs font-medium uppercase tracking-wider text-(--text-muted) truncate">
            {title}
          </span>
          <button
            onClick={() => setLeftSidebarTab(null)}
            className="p-1 rounded-md text-(--text-muted) hover:text-(--text-primary) hover:bg-white/5 transition-colors"
            aria-label="收起侧栏"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}
      {/* 面板内容 */}
      <div className="flex-1 overflow-hidden min-h-0">
        {renderContent()}
      </div>
    </div>
  );
};

export default ActivityBarSidebar;
