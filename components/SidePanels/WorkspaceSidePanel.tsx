/**
 * 创作工作台 - 左侧边栏面板（手风琴整合）
 * ──────────────────────────────────────────────────────────────
 * 点击活动栏「创作工作台」按钮在左侧栏显示，标题固定为「创作工作台」。
 *  - 有工程：以手风琴折叠分组承载 分镜列表 / 资源 / 大纲。
 *    分组标题行（chevron + 图标 + 名称）在本面板渲染；分组内容仍由
 *    StoryBoard 内部渲染，通过 createPortal 送进各分组的内容容器
 *    （Portal 保留 StoryboardProvider 上下文，避免 useStoryboardContext 崩溃）。
 *  - 无工程：提示用户创建工程，提供「新建工程」入口
 */
import React, { useState, useCallback } from 'react';
import { Film, FolderOpen, Plus, LayoutList, Package, FileText, ChevronRight, ChevronDown } from 'lucide-react';
import { useWorkbench } from '../../contexts/WorkbenchContext';
import { useStoryboardBridgeSafe } from '../../contexts/StoryboardBridgeContext';

/** 手风琴分组元信息 */
interface SectionMeta {
  id: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}

const SECTIONS: SectionMeta[] = [
  { id: 'scenes', label: '分镜列表', icon: LayoutList },
  { id: 'resources', label: '资源', icon: Package },
  { id: 'outline', label: '大纲', icon: FileText },
];

/**
 * 单个手风琴分组：标题行 + 内容容器。
 * 展开时把内容容器 div 注册到 StoryboardBridge（作为 StoryBoard portal 目标），
 * 折叠/卸载时注销。容器注册用 callback ref，确保 DOM 就绪时机准确。
 */
const AccordionSection: React.FC<{
  meta: SectionMeta;
  expanded: boolean;
  enabled: boolean;
  onToggle: (id: string) => void;
}> = ({ meta, expanded, enabled, onToggle }) => {
  const bridge = useStoryboardBridgeSafe();
  // 只依赖稳定的 setContainer（useCallback 空依赖，引用不随 containers 变化）。
  // 若依赖整个 bridge 对象，containers 更新会重建 bridge → 重建本 callback ref →
  // 重新触发 setContainer → 无限循环（Maximum update depth exceeded）。
  const setContainer = bridge?.setContainer;
  const Icon = meta.icon;
  const ChevronIcon = expanded ? ChevronDown : ChevronRight;

  // callback ref：元素挂载时注册容器，卸载（折叠）时注销
  const containerRef = useCallback(
    (el: HTMLDivElement | null) => {
      setContainer?.(meta.id, el);
    },
    [setContainer, meta.id],
  );

  return (
    <div className="flex flex-col border-b border-(--border-color) last:border-b-0">
      {/* 分组标题行 */}
      <button
        type="button"
        disabled={!enabled}
        onClick={() => onToggle(meta.id)}
        aria-expanded={expanded}
        className={`w-full flex items-center gap-2.5 px-3 py-1.5 text-left text-xs transition-colors shrink-0 ${
          enabled
            ? 'text-(--text-primary) hover:bg-(--bg-card-hover)'
            : 'text-(--text-muted) opacity-50 cursor-not-allowed'
        }`}
        title={enabled ? (expanded ? '点击折叠' : '点击展开') : '进入工作台后可用'}
      >
        <ChevronIcon className="w-3.5 h-3.5 opacity-40 transition-transform shrink-0" />
        <Icon className="w-4 h-4 shrink-0 opacity-70" />
        <span className="flex-1 font-medium">{meta.label}</span>
      </button>
      {/* 分组内容容器：StoryBoard 通过 portal 填充。限高并内部滚动，避免多个
          展开组在手风琴整列滚动上下文里争抢/压扁高度。 */}
      {expanded && enabled && (
        <div ref={containerRef} className="h-[42vh] min-h-[200px] overflow-hidden shrink-0" />
      )}
    </div>
  );
};

const WorkspaceSidePanel: React.FC = () => {
  const { currentProject, setLeftSidebarTab } = useWorkbench();
  const bridge = useStoryboardBridgeSafe();
  const bridgeReady = bridge?.isRegistered ?? false;

  // 展开/折叠状态管理（默认展开「分镜列表」）
  const [expandedSections, setExpandedSections] = useState<Set<string>>(() => new Set(['scenes']));

  // 切换展开/折叠（只切换折叠，不再跳转侧栏 tab，避免标题与内容跳走）
  const toggleSection = useCallback((sectionId: string) => {
    setExpandedSections(prev => {
      const next = new Set(prev);
      if (next.has(sectionId)) {
        next.delete(sectionId);
      } else {
        next.add(sectionId);
      }
      return next;
    });
  }, []);

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

  // ── 有工程：手风琴分组（分镜列表 / 资源 / 大纲）──
  // 不渲染「工作台」小标题：侧栏头部标题已表明面板身份，避免重复
  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto py-1">
        {SECTIONS.map((meta) => (
          <AccordionSection
            key={meta.id}
            meta={meta}
            expanded={expandedSections.has(meta.id)}
            enabled={bridgeReady}
            onToggle={toggleSection}
          />
        ))}
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
