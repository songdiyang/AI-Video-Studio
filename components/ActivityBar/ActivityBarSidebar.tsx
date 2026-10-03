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
import React from 'react';
import { X } from 'lucide-react';
import { useWorkbench } from '../../contexts/WorkbenchContext';
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
};

/** 分镜/资源/大纲：已整合进创作工作台手风琴，这些旧 tab id 统一重定向到 workspace */
const WORKSPACE_SECTION_TABS = new Set(['scenes', 'resources', 'outline']);

const ActivityBarSidebar: React.FC = () => {
  const { leftSidebarTab, setLeftSidebarTab } = useWorkbench();

  const resize = useResizableSidebar({
    storageKey: 'vscode_left_sidebar_width',
    defaultWidth: 280,
    minWidth: 200,
    maxWidth: 560,
    side: 'left',
  });

  if (!leftSidebarTab) return null;

  const renderContent = (): React.ReactNode => {
    // 分镜/资源/大纲：重定向到创作工作台手风琴面板
    if (leftSidebarTab === 'workspace' || WORKSPACE_SECTION_TABS.has(leftSidebarTab)) {
      return <WorkspaceSidePanel />;
    }
    if (leftSidebarTab === 'projects') return <ProjectsSidePanel />;
    if (leftSidebarTab === 'teams') return <TeamsSidePanel />;
    if (leftSidebarTab === 'extensions') return <ExtensionsPanelPlugin />;
    return (
      <div className="flex flex-col items-center justify-center h-full text-(--text-muted) text-xs px-4 text-center">
        <p>该面板需要先进入一个项目的工作台</p>
      </div>
    );
  };

  // 分镜/资源/大纲重定向后，标题统一显示「创作工作台」
  const title = WORKSPACE_SECTION_TABS.has(leftSidebarTab)
    ? TAB_TITLES.workspace
    : (TAB_TITLES[leftSidebarTab] ?? leftSidebarTab);

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
