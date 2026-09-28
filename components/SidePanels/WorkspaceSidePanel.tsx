/**
 * 创作工作台 - 左侧边栏面板
 * ──────────────────────────────────────────────────────────────
 * 点击活动栏「创作工作台」按钮在左侧栏显示。
 *  - 有工程：显示当前工程信息 + 工作台快捷入口（分镜/资源/大纲等，
 *    点击切换到对应的桥接面板）
 *  - 无工程：提示用户创建工程，提供「新建工程」入口
 */
import React from 'react';
import { Film, FolderOpen, Plus, LayoutList, Package, FileText, ChevronRight } from 'lucide-react';
import { useWorkbench } from '../../contexts/WorkbenchContext';
import { useStoryboardBridgeSafe } from '../../contexts/StoryboardBridgeContext';

const WorkspaceSidePanel: React.FC = () => {
  const { currentProject, setLeftSidebarTab } = useWorkbench();
  const bridge = useStoryboardBridgeSafe();

  // 工作台快捷入口（分镜/资源/大纲，桥接可用时显示）
  const workbenchEntries = [
    { id: 'scenes', label: '分镜列表', icon: LayoutList },
    { id: 'resources', label: '资源', icon: Package },
    { id: 'outline', label: '大纲', icon: FileText },
  ];
  const bridgeReady = bridge?.isRegistered ?? false;

  // ── 无工程：提示创建 ──
  if (!currentProject) {
    return (
      <div className="flex flex-col h-full">
        <div className="flex-1 flex flex-col items-center justify-center px-6 text-center gap-3">
          <div className="w-14 h-14 rounded-full bg-(--bg-card) flex items-center justify-center">
            <Film className="w-7 h-7 text-(--text-muted) opacity-60" />
          </div>
          <div>
            <p className="text-sm font-medium text-(--text-primary)">还没有打开的工程</p>
            <p className="mt-1 text-xs text-(--text-muted) leading-relaxed">
              创建一个工程，或打开已有工程，开始你的视频创作
            </p>
          </div>
          <button
            onClick={() => setLeftSidebarTab('projects')}
            className="mt-2 flex items-center gap-1.5 px-4 py-2 rounded-lg bg-(--accent) text-white text-xs font-medium hover:bg-(--accent-dark) transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            新建工程
          </button>
          <button
            onClick={() => setLeftSidebarTab('projects')}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs text-(--text-muted) hover:text-(--text-primary) hover:bg-white/5 transition-colors"
          >
            <FolderOpen className="w-3.5 h-3.5" />
            打开已有工程
          </button>
        </div>
      </div>
    );
  }

  // ── 有工程：工程信息 + 快捷入口 ──
  return (
    <div className="flex flex-col h-full">
      {/* 当前工程 */}
      <div className="px-3 py-2.5 border-b border-(--border-color)">
        <div className="text-[11px] text-(--text-muted) uppercase tracking-wider mb-1">当前工程</div>
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-(--accent) shrink-0" />
          <span className="text-sm font-medium text-(--text-primary) truncate">{currentProject.name}</span>
        </div>
        {currentProject.description && (
          <p className="mt-1 text-xs text-(--text-muted) line-clamp-2">{currentProject.description}</p>
        )}
      </div>

      {/* 工作台快捷入口 */}
      <div className="flex-1 overflow-y-auto py-1">
        <div className="px-3 py-1.5 text-[11px] text-(--text-muted) uppercase tracking-wider">工作台</div>
        {workbenchEntries.map((entry) => {
          const Icon = entry.icon;
          const enabled = bridgeReady;
          return (
            <button
              key={entry.id}
              disabled={!enabled}
              onClick={() => setLeftSidebarTab(entry.id)}
              className={`w-full flex items-center gap-2.5 px-3 py-2 text-left text-xs transition-colors ${
                enabled
                  ? 'text-(--text-primary) hover:bg-(--bg-card-hover)'
                  : 'text-(--text-muted) opacity-50 cursor-not-allowed'
              }`}
              title={enabled ? entry.label : '进入工作台后可用'}
            >
              <Icon className="w-4 h-4 shrink-0 opacity-70" />
              <span className="flex-1">{entry.label}</span>
              <ChevronRight className="w-3.5 h-3.5 opacity-40" />
            </button>
          );
        })}
        {!bridgeReady && (
          <p className="px-3 py-2 text-[11px] text-(--text-muted) leading-relaxed">
            进入创作工作台后，可在此快速访问分镜、资源、大纲
          </p>
        )}
      </div>
    </div>
  );
};

export default WorkspaceSidePanel;
