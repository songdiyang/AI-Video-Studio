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
import { useWorkbench } from '../../contexts/WorkbenchContext';
import { useLanguage } from '../../contexts/LanguageContext';
import { useResizableSidebar } from '../../hooks/useResizableSidebar';
import ProjectsSidePanel from '../SidePanels/ProjectsSidePanel';
import WorkspaceSidePanel from '../SidePanels/WorkspaceSidePanel';

/** 分镜/资源/大纲：已整合进创作工作台手风琴，这些旧 tab id 统一重定向到 workspace */
const WORKSPACE_SECTION_TABS = new Set(['scenes', 'resources', 'outline']);

const ActivityBarSidebar: React.FC = () => {
  const { leftSidebarTab } = useWorkbench();
  const { t } = useLanguage();

  /** 活动 id → 标题 */
  const TAB_TITLES: Record<string, string> = {
    workspace: t.frame.activityBar.workspace,
    projects: t.frame.activityBar.projects,
  };

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
    return (
      <div className="flex flex-col items-center justify-center h-full text-(--text-muted) text-xs px-4 text-center">
        <p>{t.frame.activityBar.panelNeedProject}</p>
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
        className={`absolute right-0 top-0 bottom-0 w-1.25 z-10 cursor-col-resize transition-colors ${
          resize.isDragging ? 'bg-(--accent)/60' : 'hover:bg-(--accent)/40'
        }`}
      />
      {/* 面板头部：仅标题（收起由活动栏图标点击/Ctrl+B 承担，不再显示叉叉） */}
      <div className="flex items-center px-3 h-9 border-b border-(--border-color) shrink-0">
        <span className="text-xs font-medium uppercase tracking-wider text-(--text-muted) truncate">
          {title}
        </span>
      </div>
      {/* 面板内容 */}
      <div className="flex-1 overflow-hidden min-h-0">
        {renderContent()}
      </div>
    </div>
  );
};

export default ActivityBarSidebar;
