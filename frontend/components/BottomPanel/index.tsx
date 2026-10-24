import React, { useEffect, useRef, useState } from 'react';
import { Maximize2, Minimize2 } from 'lucide-react';

interface BottomPanelProps {
  children: React.ReactNode;
  defaultHeight?: number;
  minHeight?: number;
  maxHeight?: number;
  /** 是否折叠（受控模式） */
  collapsed?: boolean;
  /** 折叠状态变化回调 */
  onCollapsedChange?: (collapsed: boolean) => void;
  /** 是否允许向上挤压到最大高度（用于画布模式时全屏创作） */
  allowFullExpand?: boolean;
}

const COLLAPSE_THRESHOLD = 24; // 小于此高度自动折叠
const COLLAPSED_HEIGHT = 11;   // 折叠后只保留拖拽条高度

const BottomPanel: React.FC<BottomPanelProps> = ({
  children,
  defaultHeight = 200,
  minHeight = 100,
  maxHeight = 400,
  collapsed = false,
  onCollapsedChange,
  allowFullExpand = false,
}) => {
  const [height, setHeight] = useState(defaultHeight);
  const [isCollapsed, setIsCollapsed] = useState(collapsed);
  const isDraggingRef = useRef(false);
  // 拖拽回调在 mousedown 时闭包捕获，用 ref 读取最新状态，避免折叠/拉起后父级开关不同步
  const isCollapsedRef = useRef(isCollapsed);
  const heightRef = useRef(height);
  // 缝上伸缩：记录最大化前的高度，供再次点击还原
  const rootRef = useRef<HTMLDivElement>(null);
  const prevHeightRef = useRef<number | null>(null);
  const [isExpanded, setIsExpanded] = useState(false);

  useEffect(() => {
    heightRef.current = height;
  }, [height]);

  // 最大化态跟随窗口尺寸，避免缩放后高度超出父容器
  useEffect(() => {
    if (!isExpanded) return;
    const syncHeight = () => {
      const containerHeight = rootRef.current?.parentElement?.clientHeight;
      const target = Math.max(minHeight, (containerHeight ?? window.innerHeight) - COLLAPSED_HEIGHT);
      setHeight(target);
      heightRef.current = target;
    };
    window.addEventListener('resize', syncHeight);
    return () => window.removeEventListener('resize', syncHeight);
  }, [isExpanded, minHeight]);

  // 同步外部 collapsed prop
  useEffect(() => {
    setIsCollapsed(collapsed);
    isCollapsedRef.current = collapsed;
  }, [collapsed]);

  const handleCollapseChange = (newCollapsed: boolean) => {
    isCollapsedRef.current = newCollapsed;
    setIsCollapsed(newCollapsed);
    onCollapsedChange?.(newCollapsed);
  };

  // 缝上伸缩：面板高度撑满父容器（扣除拖拽条），再次点击回到原高度
  const toggleExpanded = () => {
    if (isExpanded) {
      const prev = prevHeightRef.current ?? defaultHeight;
      prevHeightRef.current = null;
      setIsExpanded(false);
      setHeight(prev);
      heightRef.current = prev;
      return;
    }
    prevHeightRef.current = heightRef.current;
    const containerHeight = rootRef.current?.parentElement?.clientHeight;
    const target = Math.max(minHeight, (containerHeight ?? window.innerHeight) - COLLAPSED_HEIGHT);
    setIsExpanded(true);
    setHeight(target);
    heightRef.current = target;
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    const startY = e.clientY;
    const startHeight = heightRef.current;
    const wasCollapsed = isCollapsedRef.current;
    isDraggingRef.current = true;

    const handleMouseMove = (moveEvent: MouseEvent) => {
      moveEvent.preventDefault();
      const deltaY = startY - moveEvent.clientY;

      if (wasCollapsed) {
        // 从折叠状态拉起：以鼠标位置决定新高度
        const newHeight = Math.min(maxHeight, Math.max(minHeight, deltaY));
        if (newHeight >= COLLAPSE_THRESHOLD) {
          setHeight(newHeight);
          setIsCollapsed(false);
          isCollapsedRef.current = false;
        }
      } else {
        // 正常拖拽调整高度
        // allowFullExpand 模式下，允许向上拖拽到接近容器顶部（只留拖拽条空间）
        const effectiveMaxHeight = allowFullExpand
          ? window.innerHeight - COLLAPSED_HEIGHT
          : maxHeight;
        const newHeight = Math.min(effectiveMaxHeight, Math.max(0, startHeight + deltaY));
        if (newHeight < COLLAPSE_THRESHOLD) {
          setIsCollapsed(true);
          isCollapsedRef.current = true;
        } else {
          setHeight(newHeight);
          setIsCollapsed(false);
          isCollapsedRef.current = false;
        }
      }
    };

    const handleMouseUp = () => {
      isDraggingRef.current = false;
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);

      // 只在实际发生变化时通知外部，保证顶部工具栏开关与面板状态一致
      const endedCollapsed = isCollapsedRef.current;
      if (endedCollapsed !== wasCollapsed) {
        onCollapsedChange?.(endedCollapsed);
      } else if (!endedCollapsed && heightRef.current < minHeight) {
        // 如果高度在阈值和 minHeight 之间，恢复到 minHeight
        setHeight(minHeight);
      }
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  };

  // 折叠状态只显示拖拽条
  if (isCollapsed) {
    return (
      <div
        className="flex flex-col border-t border-[var(--border-color)] bg-[var(--bg-nav)] shrink-0"
        style={{ height: `${COLLAPSED_HEIGHT}px` }}
      >
        {/* 拖拽条 - 可以拉起来 */}
        <div
          className="h-[11px] cursor-row-resize hover:bg-[var(--accent)]/30 transition-colors flex items-center justify-center group"
          onMouseDown={handleMouseDown}
        >
          <div className="w-8 h-[3px] rounded-full bg-[var(--border-color)] group-hover:bg-[var(--accent)] transition-colors" />
        </div>
      </div>
    );
  }

  return (
    <div
      ref={rootRef}
      className="flex flex-col border-t border-[var(--border-color)] bg-[var(--bg-nav)] shrink-0"
      style={{ height: `${height}px` }}
    >
      {/* 拖拽条 */}
      <div
        className="h-[11px] relative cursor-row-resize hover:bg-[var(--accent)]/30 transition-colors flex items-center justify-center group"
        onMouseDown={handleMouseDown}
      >
        <div className="w-8 h-[3px] rounded-full bg-[var(--border-color)] group-hover:bg-[var(--accent)] transition-colors" />
        {/* 缝上伸缩按钮（VSCode 面板 [ ] 同款）：hover 显现，点击最大化/还原高度 */}
        <button
          type="button"
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation();
            toggleExpanded();
          }}
          title={isExpanded ? '还原面板高度' : '最大化面板'}
          aria-label={isExpanded ? '还原面板高度' : '最大化面板'}
          aria-pressed={isExpanded}
          className={`
            absolute right-2 top-1/2 -translate-y-1/2 z-10
            flex items-center justify-center w-4 h-4 rounded-[3px] cursor-pointer
            bg-[var(--bg-nav)] border border-[var(--border-color)]
            text-[var(--text-muted)] hover:text-[var(--accent)] hover:border-[var(--accent)]
            transition-opacity duration-150
            ${isExpanded ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}
          `}
        >
          {isExpanded
            ? <Minimize2 className="w-2.5 h-2.5" />
            : <Maximize2 className="w-2.5 h-2.5" />}
        </button>
      </div>
      {/* 内容区域 */}
      <div className="flex-1 overflow-auto px-3 pb-3">
        {children}
      </div>
    </div>
  );
};

export default BottomPanel;
