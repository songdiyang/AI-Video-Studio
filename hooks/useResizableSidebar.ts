/**
 * 侧边栏拖拽伸缩 Hook
 * ──────────────────────────────────────────────────────────────
 * 供 Layout 左侧内容面板与右侧 AI 助手侧边栏共用：
 * - 拖拽手柄 pointer 事件调整宽度（min/max 夹取）
 * - 宽度持久化到 localStorage
 * - 双击手柄恢复默认宽度
 * - 拖拽期间锁定光标为 col-resize 并禁用文本选中
 */
import { useCallback, useEffect, useRef, useState } from 'react';

export interface ResizableSidebarOptions {
  /** localStorage 持久化键 */
  storageKey: string;
  defaultWidth: number;
  minWidth: number;
  maxWidth: number;
  /** 'left'：侧栏在左、向右拖拽变宽；'right'：侧栏在右、向左拖拽变宽 */
  side: 'left' | 'right';
}

export interface ResizableSidebarResult {
  width: number;
  isDragging: boolean;
  /** 展开到拖拽手柄元素上（onPointerDown + onDoubleClick） */
  handleProps: {
    onPointerDown: (e: React.PointerEvent) => void;
    onDoubleClick: () => void;
    title: string;
  };
}

export function useResizableSidebar({
  storageKey,
  defaultWidth,
  minWidth,
  maxWidth,
  side,
}: ResizableSidebarOptions): ResizableSidebarResult {
  const clamp = useCallback(
    (w: number) => Math.min(maxWidth, Math.max(minWidth, Math.round(w))),
    [minWidth, maxWidth]
  );

  const [width, setWidth] = useState(() => {
    try {
      const saved = Number(localStorage.getItem(storageKey));
      if (Number.isFinite(saved) && saved > 0) {
        return Math.min(maxWidth, Math.max(minWidth, saved));
      }
    } catch { /* localStorage 不可用时忽略 */ }
    return defaultWidth;
  });
  const [isDragging, setIsDragging] = useState(false);

  const widthRef = useRef(width);
  widthRef.current = width;

  // 持久化（拖拽中间态不落盘，避免高频写入）
  useEffect(() => {
    if (isDragging) return;
    try {
      localStorage.setItem(storageKey, String(width));
    } catch { /* 忽略 */ }
  }, [storageKey, width, isDragging]);

  const startDrag = useCallback((e: React.PointerEvent) => {
    if (e.button !== 0) return;
    e.preventDefault();
    const startX = e.clientX;
    const startWidth = widthRef.current;
    setIsDragging(true);
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';

    const onMove = (ev: PointerEvent) => {
      const dx = ev.clientX - startX;
      setWidth(clamp(side === 'left' ? startWidth + dx : startWidth - dx));
    };
    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      setIsDragging(false);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  }, [clamp, side]);

  const resetWidth = useCallback(() => setWidth(defaultWidth), [defaultWidth]);

  return {
    width,
    isDragging,
    handleProps: {
      onPointerDown: startDrag,
      onDoubleClick: resetWidth,
      title: '拖拽调整宽度，双击恢复默认',
    },
  };
}
