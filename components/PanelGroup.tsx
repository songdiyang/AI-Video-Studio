import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useRef,
  useMemo,
  Children,
  cloneElement,
  isValidElement,
} from 'react';
import { ResizablePanelProps } from './ResizablePanel';

// 响应式断点 Hook
function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(
    () => typeof window !== 'undefined' && window.matchMedia(query).matches
  );
  
  useEffect(() => {
    if (typeof window === 'undefined') return;
    
    const mql = window.matchMedia(query);
    const handler = (e: MediaQueryListEvent) => setMatches(e.matches);
    
    mql.addEventListener('change', handler);
    return () => mql.removeEventListener('change', handler);
  }, [query]);
  
  return matches;
}

export interface PanelGroupProps {
  /** 布局方向：水平(左右分栏)或垂直(上下分栏) */
  direction: 'horizontal' | 'vertical';
  /** 子面板 */
  children: React.ReactNode;
  /** 持久化key，用于localStorage存储面板尺寸 */
  storageKey?: string;
  /** 自定义className */
  className?: string;
  /** 小屏模式下默认显示的面板索引（从0开始） */
  mobileDefaultPanel?: number;
  /** 小屏模式下的面板标签名称 */
  mobilePanelLabels?: string[];
}

interface PanelInfo {
  index: number;
  defaultSize: number;
  minSize: number;
  maxSize: number;
  collapsible: boolean;
  collapsedSize: number;
}

interface PanelState {
  size: number;
  collapsed: boolean;
}

interface PanelGroupContextType {
  direction: 'horizontal' | 'vertical';
  registerPanel: (info: PanelInfo) => void;
  unregisterPanel: (index: number) => void;
  getPanelState: (index: number) => PanelState | undefined;
  setPanelCollapsed: (index: number, collapsed: boolean) => void;
  isMobile: boolean;
  isTablet: boolean;
  activeMobilePanel: number;
  setActiveMobilePanel: (index: number) => void;
}

const PanelGroupContext = createContext<PanelGroupContextType | null>(null);

// 分割条组件
interface DividerProps {
  index: number;
  direction: 'horizontal' | 'vertical';
  onDragStart: (index: number) => void;
  onDoubleClick: (index: number) => void;
}

const Divider: React.FC<DividerProps> = ({ index, direction, onDragStart, onDoubleClick }) => {
  const [isHovered, setIsHovered] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const isHorizontal = direction === 'horizontal';

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsDragging(true);
    onDragStart(index);
  }, [index, onDragStart]);

  const handleDoubleClick = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    onDoubleClick(index);
  }, [index, onDoubleClick]);

  useEffect(() => {
    if (isDragging) {
      const handleMouseUp = () => setIsDragging(false);
      document.addEventListener('mouseup', handleMouseUp);
      return () => document.removeEventListener('mouseup', handleMouseUp);
    }
  }, [isDragging]);

  return (
    <div
      className={`
        relative flex-shrink-0 group
        ${isHorizontal ? 'w-[5px] h-full cursor-col-resize' : 'h-[5px] w-full cursor-row-resize'}
        ${isDragging || isHovered ? 'z-10' : ''}
      `}
      onMouseDown={handleMouseDown}
      onDoubleClick={handleDoubleClick}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* 背景条 */}
      <div
        className={`
          absolute transition-all duration-150
          ${isHorizontal 
            ? 'inset-y-0 left-1/2 -translate-x-1/2 w-[1px]' 
            : 'inset-x-0 top-1/2 -translate-y-1/2 h-[1px]'
          }
          ${isDragging || isHovered
            ? 'bg-[var(--accent)] shadow-[0_0_8px_var(--accent-glow)]'
            : 'bg-[var(--border-color)]'
          }
          ${isDragging 
            ? isHorizontal ? 'w-[3px]' : 'h-[3px]'
            : ''
          }
        `}
      />
      
      {/* 拖拽指示器 - 3个小点 */}
      <div
        className={`
          absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2
          flex gap-[2px] transition-opacity duration-150
          ${isHorizontal ? 'flex-col' : 'flex-row'}
          ${isDragging || isHovered ? 'opacity-100' : 'opacity-0'}
        `}
      >
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className={`
              w-[3px] h-[3px] rounded-full
              ${isDragging || isHovered ? 'bg-[var(--accent)]' : 'bg-[var(--text-muted)]'}
            `}
          />
        ))}
      </div>
      
      {/* 扩大点击区域 */}
      <div
        className={`
          absolute
          ${isHorizontal 
            ? 'inset-y-0 -left-1 -right-1' 
            : 'inset-x-0 -top-1 -bottom-1'
          }
        `}
      />
    </div>
  );
};

const PanelGroup: React.FC<PanelGroupProps> = ({
  direction,
  children,
  storageKey,
  className = '',
  mobileDefaultPanel = 0,
  mobilePanelLabels,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const panelInfosRef = useRef<Map<number, PanelInfo>>(new Map());
  const [panelStates, setPanelStates] = useState<Map<number, PanelState>>(new Map());
  const [isInitialized, setIsInitialized] = useState(false);
  
  // 响应式断点
  const isMobile = useMediaQuery('(max-width: 767px)');
  const isTablet = useMediaQuery('(min-width: 768px) and (max-width: 1280px)');
  
  // 小屏模式下的活动面板
  const [activeMobilePanel, setActiveMobilePanel] = useState(mobileDefaultPanel);
  
  // 平板模式下第三面板显示状态
  const [tabletThirdPanelVisible, setTabletThirdPanelVisible] = useState(false);
  
  const dragStateRef = useRef<{
    isDragging: boolean;
    dividerIndex: number;
    startPos: number;
    startSizes: number[];
    rafId: number | null;
  }>({
    isDragging: false,
    dividerIndex: -1,
    startPos: 0,
    startSizes: [],
    rafId: null,
  });

  // 获取存储键
  const getStorageKey = useCallback(() => {
    return storageKey ? `panel-sizes-${storageKey}` : null;
  }, [storageKey]);

  // 保存到 localStorage
  const saveToStorage = useCallback((states: Map<number, PanelState>) => {
    const key = getStorageKey();
    if (!key) return;
    
    const data: Record<number, PanelState> = {};
    states.forEach((state, index) => {
      data[index] = state;
    });
    
    try {
      localStorage.setItem(key, JSON.stringify(data));
    } catch (e) {
      console.warn('Failed to save panel sizes to localStorage:', e);
    }
  }, [getStorageKey]);

  // 从 localStorage 加载
  const loadFromStorage = useCallback((): Map<number, PanelState> | null => {
    const key = getStorageKey();
    if (!key) return null;
    
    try {
      const stored = localStorage.getItem(key);
      if (!stored) return null;
      
      const data = JSON.parse(stored) as Record<number, PanelState>;
      const map = new Map<number, PanelState>();
      Object.entries(data).forEach(([k, v]) => {
        const state = v;
        // 防腐化：如果未折叠但 size 为 0 或负数，重置为默认值
        if (!state.collapsed && (state.size <= 0 || isNaN(state.size))) {
          console.warn(`[PanelGroup] 面板 ${k} 状态异常 (size=${state.size}, collapsed=${state.collapsed})，重置存储`);
          localStorage.removeItem(key);
          return null;
        }
        map.set(parseInt(k, 10), state);
      });
      
      // 检查非折叠面板的总尺寸是否合理
      let totalNonCollapsed = 0;
      map.forEach((state) => {
        if (!state.collapsed) totalNonCollapsed += state.size;
      });
      if (totalNonCollapsed > 0 && (totalNonCollapsed < 50 || totalNonCollapsed > 150)) {
        console.warn(`[PanelGroup] 面板总尺寸异常 (${totalNonCollapsed}%)，重置存储`);
        localStorage.removeItem(key);
        return null;
      }
      
      return map;
    } catch (e) {
      console.warn('Failed to load panel sizes from localStorage:', e);
      return null;
    }
  }, [getStorageKey]);

  // 注册面板
  const registerPanel = useCallback((info: PanelInfo) => {
    panelInfosRef.current.set(info.index, info);
  }, []);

  // 注销面板
  const unregisterPanel = useCallback((index: number) => {
    panelInfosRef.current.delete(index);
  }, []);

  // 获取面板状态
  const getPanelState = useCallback((index: number): PanelState | undefined => {
    return panelStates.get(index);
  }, [panelStates]);

  // 设置面板折叠状态
  const setPanelCollapsed = useCallback((index: number, collapsed: boolean) => {
    setPanelStates(prev => {
      const newStates = new Map(prev);
      const currentState = newStates.get(index);
      const panelInfo = panelInfosRef.current.get(index);
      
      if (!currentState || !panelInfo) return prev;
      
      if (collapsed === currentState.collapsed) return prev;

      const collapsedSize = panelInfo.collapsedSize;
      const oldSize = currentState.size;
      
      // 计算释放/需要的空间
      if (collapsed) {
        // 折叠：将面板大小释放给其他面板
        const releasedSize = oldSize;
        let totalOtherSize = 0;
        newStates.forEach((state, idx) => {
          if (idx !== index && !state.collapsed) {
            totalOtherSize += state.size;
          }
        });
        
        if (totalOtherSize > 0) {
          newStates.forEach((state, idx) => {
            if (idx !== index && !state.collapsed) {
              const ratio = state.size / totalOtherSize;
              newStates.set(idx, {
                ...state,
                size: state.size + releasedSize * ratio,
              });
            }
          });
        }
        
        newStates.set(index, { ...currentState, collapsed: true, size: 0 });
      } else {
        // 展开：从其他面板收回空间
        const expandSize = panelInfo.defaultSize;
        let totalOtherSize = 0;
        newStates.forEach((state, idx) => {
          if (idx !== index && !state.collapsed) {
            totalOtherSize += state.size;
          }
        });
        
        if (totalOtherSize > 0) {
          newStates.forEach((state, idx) => {
            if (idx !== index && !state.collapsed) {
              const ratio = state.size / totalOtherSize;
              newStates.set(idx, {
                ...state,
                size: Math.max(
                  panelInfosRef.current.get(idx)?.minSize ?? 0,
                  state.size - expandSize * ratio
                ),
              });
            }
          });
        }
        
        newStates.set(index, { ...currentState, collapsed: false, size: expandSize });
      }
      
      saveToStorage(newStates);
      return newStates;
    });
  }, [saveToStorage]);

  // 初始化面板状态
  useEffect(() => {
    const childrenArray = Children.toArray(children).filter(isValidElement);
    const panelCount = childrenArray.length;
    
    if (panelCount === 0) return;

    // 尝试从存储加载
    const storedStates = loadFromStorage();
    
    const initialStates = new Map<number, PanelState>();
    let totalDefaultSize = 0;
    
    childrenArray.forEach((child, index) => {
      if (isValidElement(child)) {
        const props = child.props as ResizablePanelProps;
        const defaultSize = props.defaultSize ?? (100 / panelCount);
        totalDefaultSize += defaultSize;
        
        const storedState = storedStates?.get(index);
        
        if (storedState) {
          initialStates.set(index, storedState);
        } else {
          initialStates.set(index, {
            size: defaultSize,
            collapsed: false,
          });
        }
        
        panelInfosRef.current.set(index, {
          index,
          defaultSize,
          minSize: props.minSize ?? 0,
          maxSize: props.maxSize ?? 100,
          collapsible: props.collapsible ?? false,
          collapsedSize: props.collapsedSize ?? 32,
        });
      }
    });

    // 归一化大小
    if (!storedStates && totalDefaultSize !== 100) {
      const ratio = 100 / totalDefaultSize;
      initialStates.forEach((state, index) => {
        initialStates.set(index, { ...state, size: state.size * ratio });
      });
    }

    setPanelStates(initialStates);
    setIsInitialized(true);
  }, [children, loadFromStorage]);

  // 处理分割条拖拽开始
  const handleDragStart = useCallback((dividerIndex: number) => {
    if (!containerRef.current) return;
    
    const isHorizontal = direction === 'horizontal';
    const containerRect = containerRef.current.getBoundingClientRect();
    
    // 收集当前所有面板大小
    const sizes: number[] = [];
    panelStates.forEach((state, index) => {
      sizes[index] = state.collapsed ? 0 : state.size;
    });
    
    dragStateRef.current = {
      isDragging: true,
      dividerIndex,
      startPos: 0, // 将在 mousemove 时设置
      startSizes: sizes,
      rafId: null,
    };

    // 添加全局样式
    document.body.style.userSelect = 'none';
    document.body.style.cursor = isHorizontal ? 'col-resize' : 'row-resize';
    
    // 计算容器的可用空间（减去分割条）
    const dividerSize = 5;
    const panelCount = panelStates.size;
    const totalDividerSize = (panelCount - 1) * dividerSize;
    const containerSize = isHorizontal 
      ? containerRect.width - totalDividerSize
      : containerRect.height - totalDividerSize;
    
    const handleMouseMove = (e: MouseEvent) => {
      if (!dragStateRef.current.isDragging) return;
      
      if (dragStateRef.current.rafId !== null) {
        cancelAnimationFrame(dragStateRef.current.rafId);
      }
      
      dragStateRef.current.rafId = requestAnimationFrame(() => {
        const { dividerIndex, startSizes } = dragStateRef.current;
        const currentPos = isHorizontal ? e.clientX : e.clientY;
        const containerStart = isHorizontal ? containerRect.left : containerRect.top;
        
        // 计算分割条左/上侧所有面板的总宽度
        let leftPanelsWidth = 0;
        for (let i = 0; i <= dividerIndex; i++) {
          const panelInfo = panelInfosRef.current.get(i);
          const state = panelStates.get(i);
          if (state?.collapsed) {
            leftPanelsWidth += panelInfo?.collapsedSize ?? 32;
          } else {
            leftPanelsWidth += (startSizes[i] / 100) * containerSize;
          }
          if (i < dividerIndex) {
            leftPanelsWidth += dividerSize;
          }
        }
        
        // 计算分割条的目标位置
        const dividerLeft = containerStart + leftPanelsWidth + dividerSize / 2;
        const delta = currentPos - dividerLeft;
        const deltaPercent = (delta / containerSize) * 100;
        
        // 获取相邻两个面板
        const leftIndex = dividerIndex;
        const rightIndex = dividerIndex + 1;
        const leftInfo = panelInfosRef.current.get(leftIndex);
        const rightInfo = panelInfosRef.current.get(rightIndex);
        const leftState = panelStates.get(leftIndex);
        const rightState = panelStates.get(rightIndex);
        
        if (!leftInfo || !rightInfo || !leftState || !rightState) return;
        if (leftState.collapsed || rightState.collapsed) return;
        
        // 计算新大小
        let newLeftSize = startSizes[leftIndex] + deltaPercent;
        let newRightSize = startSizes[rightIndex] - deltaPercent;
        
        // 应用约束
        if (newLeftSize < leftInfo.minSize) {
          newLeftSize = leftInfo.minSize;
          newRightSize = startSizes[leftIndex] + startSizes[rightIndex] - newLeftSize;
        }
        if (newLeftSize > leftInfo.maxSize) {
          newLeftSize = leftInfo.maxSize;
          newRightSize = startSizes[leftIndex] + startSizes[rightIndex] - newLeftSize;
        }
        if (newRightSize < rightInfo.minSize) {
          newRightSize = rightInfo.minSize;
          newLeftSize = startSizes[leftIndex] + startSizes[rightIndex] - newRightSize;
        }
        if (newRightSize > rightInfo.maxSize) {
          newRightSize = rightInfo.maxSize;
          newLeftSize = startSizes[leftIndex] + startSizes[rightIndex] - newRightSize;
        }
        
        setPanelStates(prev => {
          const newStates = new Map(prev);
          newStates.set(leftIndex, { ...leftState, size: newLeftSize });
          newStates.set(rightIndex, { ...rightState, size: newRightSize });
          return newStates;
        });
      });
    };
    
    const handleMouseUp = () => {
      if (dragStateRef.current.rafId !== null) {
        cancelAnimationFrame(dragStateRef.current.rafId);
      }
      
      dragStateRef.current.isDragging = false;
      document.body.style.userSelect = '';
      document.body.style.cursor = '';
      
      // 保存到 localStorage
      saveToStorage(panelStates);
      
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
    
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  }, [direction, panelStates, saveToStorage]);

  // 双击分割条切换相邻面板的折叠状态
  const handleDividerDoubleClick = useCallback((dividerIndex: number) => {
    // 优先折叠左侧面板，如果左侧已折叠则展开
    const leftIndex = dividerIndex;
    const rightIndex = dividerIndex + 1;
    const leftInfo = panelInfosRef.current.get(leftIndex);
    const rightInfo = panelInfosRef.current.get(rightIndex);
    const leftState = panelStates.get(leftIndex);
    const rightState = panelStates.get(rightIndex);
    
    if (leftInfo?.collapsible && leftState && !leftState.collapsed) {
      setPanelCollapsed(leftIndex, true);
    } else if (leftInfo?.collapsible && leftState?.collapsed) {
      setPanelCollapsed(leftIndex, false);
    } else if (rightInfo?.collapsible && rightState && !rightState.collapsed) {
      setPanelCollapsed(rightIndex, true);
    } else if (rightInfo?.collapsible && rightState?.collapsed) {
      setPanelCollapsed(rightIndex, false);
    }
  }, [panelStates, setPanelCollapsed]);

  // Context 值
  const contextValue = useMemo<PanelGroupContextType>(() => ({
    direction,
    registerPanel,
    unregisterPanel,
    getPanelState,
    setPanelCollapsed,
    isMobile,
    isTablet,
    activeMobilePanel,
    setActiveMobilePanel,
  }), [direction, registerPanel, unregisterPanel, getPanelState, setPanelCollapsed, isMobile, isTablet, activeMobilePanel]);

  // 渲染子面板
  const renderChildren = () => {
    const childrenArray = Children.toArray(children).filter(isValidElement);
    const result: React.ReactNode[] = [];
    
    // 获取面板标签名称
    const panelLabels = mobilePanelLabels || childrenArray.map((child, index) => {
      if (isValidElement(child)) {
        const props = child.props as ResizablePanelProps;
        return props.title || `面板 ${index + 1}`;
      }
      return `面板 ${index + 1}`;
    });
    
    // 小屏模式：显示 Tab 切换器和单个面板
    if (isMobile) {
      return (
        <div className="flex flex-col h-full">
          {/* Tab 切换器 */}
          <div className="panel-mobile-tabs flex-shrink-0 h-10 flex items-center gap-1 px-2 bg-[var(--bg-card)] border-b border-[var(--border-color)]">
            {childrenArray.map((_, index) => (
              <button
                key={index}
                onClick={() => setActiveMobilePanel(index)}
                className={`
                  flex-1 h-8 px-3 text-xs font-medium rounded-md transition-all duration-150
                  ${activeMobilePanel === index
                    ? 'bg-[var(--accent)]/15 text-[var(--accent)] border border-[var(--accent)]/30'
                    : 'text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-card-hover)]'
                  }
                `}
                aria-selected={activeMobilePanel === index}
                role="tab"
              >
                {panelLabels[index]}
              </button>
            ))}
          </div>
          
          {/* 当前活动的面板 */}
          <div className="flex-1 overflow-hidden" role="tabpanel">
            {childrenArray.map((child, index) => {
              if (!isValidElement(child)) return null;
              if (index !== activeMobilePanel) return null;
              
              const state = panelStates.get(index);
              const info = panelInfosRef.current.get(index);
              
              return cloneElement(child as React.ReactElement<any>, {
                key: `panel-${index}`,
                __size: 100,
                __collapsed: false,
                __onCollapse: () => {},
                __direction: 'vertical',
                __index: index,
                __isMobile: true,
              });
            })}
          </div>
        </div>
      );
    }
    
    // 平板模式：双栏布局（第三个面板可切换显示）
    if (isTablet && childrenArray.length > 2) {
      const showThirdPanel = tabletThirdPanelVisible;
      const visiblePanels = showThirdPanel ? childrenArray : childrenArray.slice(0, 2);
      const totalSize = visiblePanels.reduce((sum, child, index) => {
        const state = panelStates.get(index);
        return sum + (state?.size || 50);
      }, 0);
      
      visiblePanels.forEach((child, index) => {
        if (isValidElement(child)) {
          const state = panelStates.get(index);
          const info = panelInfosRef.current.get(index);
          const normalizedSize = ((state?.size || 50) / totalSize) * 100;
          
          const clonedPanel = cloneElement(child as React.ReactElement<any>, {
            __size: normalizedSize,
            __collapsed: state?.collapsed ?? false,
            __onCollapse: (collapsed: boolean) => setPanelCollapsed(index, collapsed),
            __direction: direction,
            __index: index,
            __isTablet: true,
          });
          
          result.push(
            <React.Fragment key={`panel-${index}`}>
              {clonedPanel}
            </React.Fragment>
          );
          
          if (index < visiblePanels.length - 1) {
            result.push(
              <Divider
                key={`divider-${index}`}
                index={index}
                direction={direction}
                onDragStart={handleDragStart}
                onDoubleClick={handleDividerDoubleClick}
              />
            );
          }
        }
      });

      // 平板模式下的第三面板切换按钮
      if (!showThirdPanel) {
        result.push(
          <div
            key="tablet-toggle"
            onClick={() => setTabletThirdPanelVisible(true)}
            className="flex-shrink-0 w-8 flex flex-col items-center justify-center gap-1.5 cursor-pointer bg-[var(--bg-card)] border-l border-[var(--border-color)] hover:bg-[var(--bg-card-hover)] transition-colors"
            title={`显示${panelLabels[2] || '第三面板'}`}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-[var(--text-muted)]">
              <polyline points="15 18 9 12 15 6" />
            </svg>
            <span className="text-xs font-medium text-[var(--text-muted)] uppercase tracking-wider" style={{ writingMode: 'vertical-lr', transform: 'rotate(180deg)' }}>
              {panelLabels[2] || '资源'}
            </span>
          </div>
        );
      }
      
      return result;
    }
    
    // 标准模式：三栏布局
    childrenArray.forEach((child, index) => {
      if (isValidElement(child)) {
        const state = panelStates.get(index);
        const info = panelInfosRef.current.get(index);
        
        // 克隆面板并注入内部属性
        const clonedPanel = cloneElement(child as React.ReactElement<any>, {
          __size: state?.size ?? (child.props as ResizablePanelProps).defaultSize ?? 100 / childrenArray.length,
          __collapsed: state?.collapsed ?? false,
          __onCollapse: (collapsed: boolean) => setPanelCollapsed(index, collapsed),
          __direction: direction,
          __index: index,
        });
        
        result.push(
          <React.Fragment key={`panel-${index}`}>
            {clonedPanel}
          </React.Fragment>
        );
        
        // 在面板之间添加分割条（最后一个面板后不添加）
        if (index < childrenArray.length - 1) {
          result.push(
            <Divider
              key={`divider-${index}`}
              index={index}
              direction={direction}
              onDragStart={handleDragStart}
              onDoubleClick={handleDividerDoubleClick}
            />
          );
        }
      }
    });
    
    return result;
  };

  const isHorizontal = direction === 'horizontal';

  return (
    <PanelGroupContext.Provider value={contextValue}>
      <div
        ref={containerRef}
        className={`
          flex w-full h-full
          ${isMobile ? 'flex-col' : isHorizontal ? 'flex-row' : 'flex-col'}
          ${className}
        `}
        data-panel-group
        data-direction={direction}
        data-mobile={isMobile}
        data-tablet={isTablet}
      >
        {isInitialized && renderChildren()}
      </div>
    </PanelGroupContext.Provider>
  );
};

export { PanelGroup, PanelGroupContext };
export type { PanelGroupContextType };
