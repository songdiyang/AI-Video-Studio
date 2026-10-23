/**
 * 侧边栏收起后的「缝隙」拖拽手柄
 * ──────────────────────────────────────────────────────────────
 * 收起状态下在原本的边缘位置保留一条 5px 感应区：
 * 按住并向外拖动超过阈值即可展开对应侧栏（参考 VS Code 的边缘拖拽）。
 * 单击无效，避免误触。
 */

import React, { useCallback, useState } from 'react';

interface ResizeRevealHandleProps {
  side: 'left' | 'right';
  label: string;
  onReveal: () => void;
  /** 向外拖动多少像素后展开 */
  threshold?: number;
}

const ResizeRevealHandle: React.FC<ResizeRevealHandleProps> = ({
  side,
  label,
  onReveal,
  threshold = 40,
}) => {
  const [dragging, setDragging] = useState(false);

  const startDrag = useCallback((e: React.PointerEvent) => {
    if (e.button !== 0) return;
    e.preventDefault();
    const startX = e.clientX;
    setDragging(true);
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';

    function cleanup() {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      setDragging(false);
    }

    function onMove(ev: PointerEvent) {
      // 左侧向右拖、右侧向左拖，达到阈值后展开
      const distance = side === 'left' ? ev.clientX - startX : startX - ev.clientX;
      if (distance >= threshold) {
        cleanup();
        onReveal();
      }
    }

    function onUp() {
      cleanup();
    }

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  }, [side, threshold, onReveal]);

  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label={label}
      title={label}
      onPointerDown={startDrag}
      className={`relative shrink-0 h-full w-1.25 cursor-col-resize transition-colors ${
        dragging ? 'bg-(--accent)/60' : 'hover:bg-(--accent)/40'
      }`}
      style={{ touchAction: 'none' }}
    />
  );
};

export default ResizeRevealHandle;
