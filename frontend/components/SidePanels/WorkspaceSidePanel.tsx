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
import React, { useState, useCallback, useEffect, useRef } from 'react';
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
 */
const AccordionSection: React.FC<{
  meta: SectionMeta;
  label: string;
  expanded: boolean;
  enabled: boolean;
  /** 是否弹性分组（分镜列表/资源）：始终参与剩余空间分配并忽略历史持久化的固定高度，
   * 避免分组下方出现无法吸收的黑色空白；两者同展开时按权重分配 */
  grow: boolean;
  /** 手动拖拽后固定的高度（px）；null 表示自适应/填充 */
  height: number | null;
  /** 底部锚定：折叠时也贴紧侧栏底部（大纲），与上方弹性分组之间的空白由 mt-auto 吸收 */
  pinBottom?: boolean;
  onResize: (id: string, px: number) => void;
  onReset: (id: string) => void;
  onToggle: (id: string) => void;
}> = ({ meta, label, expanded, enabled, grow, height, pinBottom, onResize, onReset, onToggle }) => {
  const bridge = useStoryboardBridgeSafe();
  const { t } = useLanguage();
  // 只依赖稳定的 setContainer / setSectionHeaderSlot（useCallback 空依赖，引用不随
  // containers/slots 变化）。若依赖整个 bridge 对象，其更新会重建 bridge → 重建本
  // callback ref → 重新触发注册 → 无限循环（Maximum update depth exceeded）。
  const setContainer = bridge?.setContainer;
  const setSectionHeaderSlot = bridge?.setSectionHeaderSlot;
  const Icon = meta.icon;
  const localRef = useRef<HTMLDivElement | null>(null);
  // 整个分组（标题 + 内容 + 拖拽条）的根节点，用于拖拽测高与高度约束
  const sectionRef = useRef<HTMLDivElement | null>(null);
  const [resizing, setResizing] = useState(false);

  // callback ref：元素挂载时注册容器（同时留存本地引用用于拖拽测高）。
  // 折叠时不卸载容器（仅由 CSS hidden 隐藏），确保各面板的滚动位置和编辑状态不丢失。
  const containerRef = useCallback(
    (el: HTMLDivElement | null) => {
      localRef.current = el;
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

  // 底部锚定的分组：手柄在顶部，向上拖动 = 撑开（顶部边缘跟随指针，底部保持锚定）
  const handleAtTop = !grow;

  // 拖拽边界调整本分组高度：从当前渲染高度出发，跟手计算新高度。
  // 上限为可用区域高度扣除预留，保证各分组标题/拖拽条始终在可视区内。
  const startResize = useCallback(
    (e: React.PointerEvent) => {
      if (e.button !== 0) return;
      const MIN_H = 80;
      const MIN_RESERVE = 120;
      const startY = e.clientY;
      const startH = sectionRef.current?.offsetHeight ?? 200;
      const handleEl = e.currentTarget as HTMLElement;
      const pointerId = e.pointerId;
      try { handleEl.setPointerCapture(pointerId); } catch { /* 忽略 */ }
      let next = startH;
      let started = false;
      let frame = 0;
      setResizing(true);
      document.body.style.cursor = 'row-resize';
      document.body.style.userSelect = 'none';

      const apply = () => {
        frame = 0;
        onResize(meta.id, next);
      };
      const onMove = (ev: PointerEvent) => {
        const delta = ev.clientY - startY;
        // 未超过阈值视为点击，不把弹性分组转成固定高度
        if (!started && Math.abs(delta) < 2) return;
        started = true;
        // 手风琴列包裹层的可用总高
        const wrapper = sectionRef.current?.parentElement;
        const avail = wrapper ? wrapper.clientHeight : window.innerHeight;
        const maxH = Math.max(MIN_H, avail - MIN_RESERVE);
        // 顶部手柄：向上拖（delta 为负）应增加高度
        next = Math.min(maxH, Math.max(MIN_H, Math.round(startH + (handleAtTop ? -delta : delta))));
        // 用 rAF 合并高频 pointermove，避免拖拽时整栏重渲染掉帧
        if (!frame) frame = requestAnimationFrame(apply);
      };
      const onUp = () => {
        if (frame) cancelAnimationFrame(frame);
        if (started) onResize(meta.id, next);
        try { handleEl.releasePointerCapture(pointerId); } catch { /* 忽略 */ }
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onUp);
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
        setResizing(false);
      };
      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
    },
    [meta.id, onResize],
  );

  const isFlexible = expanded && (height == null || grow);
  const isFixed = expanded && height != null && !grow;
  // 展开的分组共享侧栏高度：分镜列表权重更高，资源分组展开时按权重让位
  const growWeight = grow ? 1.6 : 1;

  return (
    <div
      ref={sectionRef}
      className={`relative flex flex-col border-b border-(--border-color) last:border-b-0 ${
        expanded ? 'min-h-9' : 'min-h-0'
      } ${pinBottom ? 'mt-auto ' : ''}${isFlexible ? 'flex-1' : isFixed ? 'shrink' : 'shrink-0'}`}
      style={
        isFlexible
          ? { flexGrow: growWeight, flexBasis: 0 }
          : isFixed
            ? { height }
            : undefined
      }
    >
      {/* 拖拽手柄：覆盖在分组边界上的 6px 命中区；悬停显示 1px 强调线，双击恢复自动高度 */}
      {expanded && enabled && !grow && (
        <div
          onPointerDown={startResize}
          onDoubleClick={(e) => { e.preventDefault(); onReset(meta.id); }}
          role="separator"
          aria-orientation="horizontal"
          aria-label="拖动调整分组高度，双击恢复自动高度"
          title="拖动调整高度，双击恢复自动高度"
          className="group absolute -top-0.5 left-0 right-0 z-20 h-1.5 cursor-row-resize touch-none"
        >
          <div
            className={`pointer-events-none absolute left-0 right-0 top-1/2 h-px -translate-y-1/2 transition-colors ${
              resizing ? 'bg-(--accent)' : 'bg-transparent group-hover:bg-(--accent)/60'
            }`}
          />
        </div>
      )}
      {/* 分组标题行：左侧可点击的折叠区 + 右侧操作插槽 */}
      <div className="flex items-center gap-1 pr-2">
        <button
          type="button"
          disabled={!enabled}
          onClick={() => onToggle(meta.id)}
          aria-expanded={expanded}
          className={`flex-1 flex items-center gap-2 px-2.5 py-1 text-left text-xs transition-colors shrink-0 select-none ${
            enabled
              ? 'text-(--text-primary) hover:bg-(--bg-card-hover)'
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

  // 展开/折叠状态管理（默认只展开中间的「资源」分组，「大纲」折叠并锚定在底部）
  const [expandedSections, setExpandedSections] = useState<Set<string>>(() => new Set(['resources']));

  // 各分组手动拖拽后固定的高度（px），持久化到 localStorage
  const [sectionHeights, setSectionHeights] = useState<Record<string, number>>(() => {
    try {
      return JSON.parse(localStorage.getItem('workspace_section_heights') || '{}');
    } catch {
      return {};
    }
  });

  const handleResize = useCallback((id: string, px: number) => {
    setSectionHeights(prev => (prev[id] === px ? prev : { ...prev, [id]: px }));
  }, []);

  // 双击拖拽条恢复为自动/弹性高度
  const handleReset = useCallback((id: string) => {
    setSectionHeights(prev => {
      if (!(id in prev)) return prev;
      const next = { ...prev };
      delete next[id];
      return next;
    });
  }, []);

  // 拖拽结束后再落盘（防抖），避免拖动过程中每帧同步写 localStorage 造成掉帧
  useEffect(() => {
    const timer = window.setTimeout(() => {
      try {
        localStorage.setItem('workspace_section_heights', JSON.stringify(sectionHeights));
      } catch {
        /* 忽略 */
      }
    }, 200);
    return () => window.clearTimeout(timer);
  }, [sectionHeights]);

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
            grow={meta.id !== 'outline'}
            height={sectionHeights[meta.id] ?? null}
            pinBottom={meta.id === 'outline'}
            onResize={handleResize}
            onReset={handleReset}
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
