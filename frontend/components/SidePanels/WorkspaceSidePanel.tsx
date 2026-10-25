/**
 * 创作工作台 - 左侧边栏面板（手风琴整合）
 * ──────────────────────────────────────────────────────────────
 * 点击活动栏「创作工作台」按钮在左侧栏显示，标题固定为「创作工作台」。
 *  - 有工程：以手风琴折叠分组承载 分镜列表 / 资源 / 大纲。
 *    分组标题行（chevron + 图标 + 名称）在本面板渲染；分组内容仍由
 *    StoryBoard 内部渲染，通过 createPortal 送进各分组的内容容器
 *    （Portal 保留 StoryboardProvider 上下文，避免 useStoryboardContext 崩溃）。
 *    折叠时仅用 CSS 隐藏内容容器、不卸载，保留滚动位置与编辑/草稿状态。
 *  - 无工程：提示用户创建工程，提供「新建工程」入口
 */
import React, { useState, useCallback } from 'react';
import { Film, FolderOpen, Plus, LayoutList, Package, FileText, ChevronRight } from 'lucide-react';
import { useWorkbench } from '../../contexts/WorkbenchContext';
import { useStoryboardBridgeSafe } from '../../contexts/StoryboardBridgeContext';
import { useLanguage } from '../../contexts/LanguageContext';

/** 手风琴分组元信息 */
interface SectionMeta {
  id: string;
  icon: React.ComponentType<{ className?: string }>;
}

const SECTIONS: SectionMeta[] = [
  { id: 'scenes', icon: LayoutList },
  { id: 'resources', icon: Package },
  { id: 'outline', icon: FileText },
];

/**
 * 单个手风琴分组：标题行 + 内容容器。
 * 展开时把内容容器 div 注册到 StoryboardBridge（作为 StoryBoard portal 目标），
 * 折叠/卸载时注销。容器注册用 callback ref，确保 DOM 就绪时机准确。
 * 展开的分组按 flex-1 均分侧栏剩余空间；折叠时仅保留标题行高度。
 */
const AccordionSection: React.FC<{
  meta: SectionMeta;
  label: string;
  expanded: boolean;
  enabled: boolean;
  onToggle: (id: string) => void;
}> = ({ meta, label, expanded, enabled, onToggle }) => {
  const bridge = useStoryboardBridgeSafe();
  const { t } = useLanguage();
  // 只依赖稳定的 setContainer / setSectionHeaderSlot（useCallback 空依赖，引用不随
  // containers/slots 变化）。若依赖整个 bridge 对象，其更新会重建 bridge → 重建本
  // callback ref → 重新触发注册 → 无限循环（Maximum update depth exceeded）。
  const setContainer = bridge?.setContainer;
  const setSectionHeaderSlot = bridge?.setSectionHeaderSlot;
  const Icon = meta.icon;

  // callback ref：元素挂载时注册容器（作为 StoryBoard portal 目标）。
  // 折叠时不卸载容器（仅由 CSS hidden 隐藏），确保各面板的滚动位置和编辑状态不丢失。
  const containerRef = useCallback(
    (el: HTMLDivElement | null) => {
      setContainer?.(meta.id, el);
    },
    [setContainer, meta.id],
  );

  // callback ref：注册标题行右侧的操作插槽（供面板 portal 工具栏按钮）
  const headerSlotRef = useCallback(
    (el: HTMLDivElement | null) => {
      setSectionHeaderSlot?.(meta.id, el);
    },
    [setSectionHeaderSlot, meta.id],
  );

  return (
    <div
      className={`relative flex flex-col border-b border-(--border-color) last:border-b-0 ${
        expanded ? 'min-h-9 flex-1' : 'min-h-0 shrink-0'
      }`}
    >
      {/* 分组标题行：左侧可点击的折叠区 + 右侧操作插槽 */}
      <div className="flex items-center gap-1 pr-2">
        <button
          type="button"
          disabled={!enabled}
          onClick={() => onToggle(meta.id)}
          aria-expanded={expanded}
          className={`flex-1 flex items-center gap-2 px-2.5 py-1 text-left text-xs transition-colors duration-150 shrink-0 select-none ${
            enabled
              ? 'text-(--text-primary) hover:bg-(--bg-card-hover) active:bg-white/[0.04]'
              : 'text-(--text-muted) opacity-50 cursor-not-allowed'
          }`}
          title={enabled ? (expanded ? t.frame.workspace.clickCollapse : t.frame.workspace.clickExpand) : t.frame.workspace.availableInWorkspace}
        >
          <ChevronRight className={`w-3.5 h-3.5 opacity-40 transition-transform duration-150 shrink-0 ${expanded ? 'rotate-90' : ''}`} />
          <Icon className="w-4 h-4 shrink-0 opacity-70" />
          <span className="flex-1 font-medium text-left">{label}</span>
        </button>
        {/* 操作插槽：仅展开且可用时可见，面板通过 portal 把工具栏按钮放进来；折叠时保留挂载以维持工具状态 */}
        {enabled && (
          <div ref={headerSlotRef} className={`flex items-center gap-1 shrink-0 ${expanded ? '' : 'hidden'}`} />
        )}
      </div>
      {/* 分组内容容器：StoryBoard 通过 portal 填充。
          折叠时只做 CSS 隐藏、不卸载，保证展开后滚动位置/草稿状态原样恢复。 */}
      {enabled && (
        <div
          ref={containerRef}
          className={`flex-1 min-h-0 overflow-y-auto ${expanded ? '' : 'hidden'}`}
        />
      )}
    </div>
  );
};

const WorkspaceSidePanel: React.FC = () => {
  const { currentProject, setLeftSidebarTab } = useWorkbench();
  const bridge = useStoryboardBridgeSafe();
  const bridgeReady = bridge?.isRegistered ?? false;
  const { t } = useLanguage();

  // 展开/折叠状态管理（默认只展开中间的「资源」分组，三个分组均从顶部向下堆叠）
  const [expandedSections, setExpandedSections] = useState<Set<string>>(() => new Set(['resources']));

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
            <p className="text-sm font-medium text-(--text-primary)">{t.frame.workspace.noProject}</p>
            <p className="mt-1 text-xs text-(--text-muted) leading-relaxed">
              {t.frame.workspace.noProjectHint}
            </p>
          </div>
          <button
            onClick={() => setLeftSidebarTab('projects')}
            className="mt-2 flex items-center gap-1.5 px-4 py-2 rounded-lg bg-(--accent) text-white text-xs font-medium hover:bg-(--accent-dark) transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            {t.frame.workspace.newProject}
          </button>
          <button
            onClick={() => setLeftSidebarTab('projects')}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs text-(--text-muted) hover:text-(--text-primary) hover:bg-white/5 transition-colors"
          >
            <FolderOpen className="w-3.5 h-3.5" />
            {t.frame.workspace.openExisting}
          </button>
        </div>
      </div>
    );
  }

  // ── 有工程：手风琴分组（分镜列表 / 资源 / 大纲）──
  // 不渲染「工作台」小标题：侧栏头部标题已表明面板身份，避免重复
  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 flex flex-col min-h-0 overflow-hidden py-1">
        {SECTIONS.map((meta) => (
          <AccordionSection
            key={meta.id}
            meta={meta}
            label={(t.frame.workspace as Record<string, string>)[meta.id]}
            expanded={expandedSections.has(meta.id)}
            enabled={bridgeReady}
            onToggle={toggleSection}
          />
        ))}
        {!bridgeReady && (
          <p className="px-3 py-2 text-[11px] text-(--text-muted) leading-relaxed">
            {t.frame.workspace.enterHint}
          </p>
        )}
      </div>
    </div>
  );
};

export default WorkspaceSidePanel;
