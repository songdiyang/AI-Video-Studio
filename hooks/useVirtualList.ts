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
