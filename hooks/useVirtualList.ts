import { useState, useCallback, useMemo } from 'react';

interface UseVirtualListOptions {
  /** 列表总条目数 */
  itemCount: number;
  /** 每个条目的固定高度 (px) */
  itemHeight: number;
  /** 容器可见高度 (px) */
  containerHeight: number;
  /** 上下额外渲染的条目数，默认 5 */
  overscan?: number;
}

interface VirtualItem {
  /** 条目在原始列表中的索引 */
  index: number;
  /** 条目相对于容器顶部的偏移量 (px) */
  offsetTop: number;
}

interface UseVirtualListReturn {
  /** 当前视口内需要渲染的虚拟条目列表 */
  virtualItems: VirtualItem[];
  /** 列表的总高度 (px) */
  totalHeight: number;
  /** 需要绑定到滚动容器的 props */
  containerProps: {
    onScroll: (e: React.UIEvent<HTMLElement>) => void;
    style: React.CSSProperties;
  };
  /** 需要绑定到内容包装器的 props */
  wrapperProps: {
    style: React.CSSProperties;
  };
}

/**
 * 轻量级虚拟列表 Hook
 * 
 * 用于大列表渲染优化（如项目列表、资产列表），
 * 只渲染视口内可见的条目，大幅提升渲染性能。
 * 
 * @example
 * ```tsx
 * const { virtualItems, totalHeight, containerProps, wrapperProps } = useVirtualList({
 *   itemCount: items.length,
 *   itemHeight: 60,
 *   containerHeight: 400,
 *   overscan: 5,
 * });
 * 
 * return (
 *   <div {...containerProps}>
 *     <div {...wrapperProps}>
 *       {virtualItems.map(({ index, offsetTop }) => (
 *         <div
 *           key={items[index].id}
 *           style={{ 
 *             position: 'absolute', 
 *             top: offsetTop, 
 *             height: 60,
 *             width: '100%' 
 *           }}
 *         >
 *           {items[index].name}
 *         </div>
 *       ))}
 *     </div>
 *   </div>
 * );
 * ```
 */
export function useVirtualList(options: UseVirtualListOptions): UseVirtualListReturn {
  const { itemCount, itemHeight, containerHeight, overscan = 5 } = options;
  
  // 存储滚动位置
  const [scrollTop, setScrollTop] = useState(0);
  
  // 计算列表总高度
  const totalHeight = itemCount * itemHeight;
  
  // 计算可见条目范围
  const { startIndex, endIndex } = useMemo(() => {
    // 计算第一个可见条目的索引（向下取整，减去 overscan）
    const start = Math.max(0, Math.floor(scrollTop / itemHeight) - overscan);
    // 计算最后一个可见条目的索引（向上取整，加上 overscan）
    const end = Math.min(
      itemCount,
      Math.ceil((scrollTop + containerHeight) / itemHeight) + overscan
    );
    
    return { startIndex: start, endIndex: end };
  }, [scrollTop, itemHeight, containerHeight, itemCount, overscan]);
  
  // 生成虚拟条目列表
  const virtualItems = useMemo<VirtualItem[]>(() => {
    const items: VirtualItem[] = [];
    
    for (let i = startIndex; i < endIndex; i++) {
      items.push({
        index: i,
        offsetTop: i * itemHeight,
      });
    }
    
    return items;
  }, [startIndex, endIndex, itemHeight]);
  
  // 滚动事件处理
  const handleScroll = useCallback((e: React.UIEvent<HTMLElement>) => {
    const target = e.currentTarget;
    setScrollTop(target.scrollTop);
  }, []);
  
  // 容器 props
  const containerProps = useMemo(() => ({
    onScroll: handleScroll,
    style: {
      overflow: 'auto' as const,
      height: containerHeight,
      position: 'relative' as const,
    },
  }), [handleScroll, containerHeight]);
  
  // 内容包装器 props
  const wrapperProps = useMemo(() => ({
    style: {
      position: 'relative' as const,
      height: totalHeight,
      width: '100%',
    },
  }), [totalHeight]);
  
  return {
    virtualItems,
    totalHeight,
    containerProps,
    wrapperProps,
  };
}

export default useVirtualList;

// ===================== useVirtualGrid =====================

interface UseVirtualGridOptions {
  /** 总项目数 */
  itemCount: number;
  /** 当前列数 */
  columns: number;
  /** 每行高度 (px) */
  rowHeight: number;
  /** 容器可见高度 (px) */
  containerHeight: number;
  /** 额外渲染行数，默认 2 */
  overscan?: number;
  /** 行间距 (px)，默认 0 */
  gap?: number;
}

interface VirtualGridItem {
  /** 原始数据索引 */
  index: number;
  /** 所在行 */
  row: number;
  /** 所在列 */
  col: number;
  /** 顶部偏移 */
  offsetTop: number;
}

interface UseVirtualGridReturn {
  /** 当前视口内需要渲染的虚拟网格项 */
  virtualItems: VirtualGridItem[];
  /** 网格的总高度 (px) */
  totalHeight: number;
  /** 需要绑定到滚动容器的 props */
  containerProps: {
    onScroll: (e: React.UIEvent<HTMLElement>) => void;
    style: React.CSSProperties;
  };
  /** 需要绑定到内容包装器的 props */
  wrapperProps: {
    style: React.CSSProperties;
  };
}

/**
 * 虚拟网格 Hook
 * 
 * 用于大型网格布局的渲染优化，采用行级虚拟化策略，
 * 将每一行视为一个虚拟项目，只渲染视口内可见的行。
 * 
 * @example
 * ```tsx
 * const { virtualItems, totalHeight, containerProps, wrapperProps } = useVirtualGrid({
 *   itemCount: items.length,
 *   columns: 4,
 *   rowHeight: 320,
 *   containerHeight: 600,
 *   overscan: 2,
 *   gap: 16,
 * });
 * 
 * return (
 *   <div {...containerProps}>
 *     <div {...wrapperProps}>
 *       <div className="grid grid-cols-4 gap-4">
 *         {virtualItems.map(({ index, offsetTop }) => (
 *           <div
 *             key={items[index].id}
 *             style={{ 
 *               position: 'absolute', 
 *               top: offsetTop,
 *               left: `calc(${(index % columns) * 25}% + ${gap / 2}px)`,
 *               width: `calc(25% - ${gap}px)`,
 *             }}
 *           >
 *             {items[index].name}
 *           </div>
 *         ))}
 *       </div>
 *     </div>
 *   </div>
 * );
 * ```
 */
export function useVirtualGrid(options: UseVirtualGridOptions): UseVirtualGridReturn {
  const { 
    itemCount, 
    columns, 
    rowHeight, 
    containerHeight, 
    overscan = 2,
    gap = 0 
  } = options;
  
  // 存储滚动位置
  const [scrollTop, setScrollTop] = useState(0);
  
  // 计算总行数
  const totalRows = Math.ceil(itemCount / columns);
  
  // 计算每行的实际高度（包含间距）
  const rowHeightWithGap = rowHeight + gap;
  
  // 计算网格总高度（最后一行不需要底部间距）
  const totalHeight = totalRows > 0 ? totalRows * rowHeightWithGap - gap : 0;
  
  // 计算可见行范围
  const { startRow, endRow } = useMemo(() => {
    // 计算第一个可见行的索引
    const start = Math.max(0, Math.floor(scrollTop / rowHeightWithGap) - overscan);
    // 计算最后一个可见行的索引
    const end = Math.min(
      totalRows,
      Math.ceil((scrollTop + containerHeight) / rowHeightWithGap) + overscan
    );
    
    return { startRow: start, endRow: end };
  }, [scrollTop, rowHeightWithGap, containerHeight, totalRows, overscan]);
  
  // 生成虚拟网格项列表
  const virtualItems = useMemo<VirtualGridItem[]>(() => {
    const items: VirtualGridItem[] = [];
    
    for (let row = startRow; row < endRow; row++) {
      for (let col = 0; col < columns; col++) {
        const index = row * columns + col;
        // 确保不超出总项目数
        if (index >= itemCount) break;
        
        items.push({
          index,
          row,
          col,
          offsetTop: row * rowHeightWithGap,
        });
      }
    }
    
    return items;
  }, [startRow, endRow, columns, itemCount, rowHeightWithGap]);
  
  // 滚动事件处理
  const handleScroll = useCallback((e: React.UIEvent<HTMLElement>) => {
    const target = e.currentTarget;
    setScrollTop(target.scrollTop);
  }, []);
  
  // 容器 props
  const containerProps = useMemo(() => ({
    onScroll: handleScroll,
    style: {
      overflow: 'auto' as const,
      height: containerHeight,
      position: 'relative' as const,
    },
  }), [handleScroll, containerHeight]);
  
  // 内容包装器 props
  const wrapperProps = useMemo(() => ({
    style: {
      position: 'relative' as const,
      height: totalHeight,
      width: '100%',
    },
  }), [totalHeight]);
  
  return {
    virtualItems,
    totalHeight,
    containerProps,
    wrapperProps,
  };
}

// 导出类型供外部使用
export type { 
  UseVirtualListOptions, 
  VirtualItem, 
  UseVirtualListReturn,
  UseVirtualGridOptions,
  VirtualGridItem,
  UseVirtualGridReturn
};
