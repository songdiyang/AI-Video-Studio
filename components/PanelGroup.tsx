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
        ${isHorizontal ? 'w-[11px] h-full cursor-col-resize' : 'h-[11px] w-full cursor-row-resize'}
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
          absolute transition-colors duration-75
          ${isHorizontal 
            ? 'inset-y-0 left-1/2 -translate-x-1/2' 
            : 'inset-x-0 top-1/2 -translate-y-1/2'
          }
          ${isDragging || isHovered
            ? 'bg-[var(--accent)] shadow-[0_0_8px_var(--accent-glow)]'
            : 'bg-[var(--border-color)]'
          }
          ${isHorizontal ? 'w-[1px]' : 'h-[1px]'}
          ${isDragging 
            ? isHorizontal ? '!w-[3px]' : '!h-[3px]'
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
      
      {/* 扩大点击/拖拽热区：从 5px 扩展到 11px */}
      <div
        className={`
          absolute
          ${isHorizontal 
            ? 'inset-y-0 -left-[3px] -right-[3px]' 
            : 'inset-x-0 -top-[3px] -bottom-[3px]'
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
  // 同步最新 panelStates 到 ref，供拖拽松开时读取最新值（避免闭包 stale）
  const panelStatesRef = useRef<Map<number, PanelState>>(panelStates);
  useEffect(() => {
    panelStatesRef.current = panelStates;
  }, [panelStates]);
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
    _pendingLeftSize?: number;
    _pendingRightSize?: number;
    _pendingLeftIndex?: number;
    _pendingRightIndex?: number;
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
    const dividerSize = 11;
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
        
        // 应用约束——collapsible 面板允许跌破 minSize 到 0，使拖到阻中时容易触发自动折叠
        const leftMinEffective = leftInfo.collapsible ? 0 : leftInfo.minSize;
        const rightMinEffective = rightInfo.collapsible ? 0 : rightInfo.minSize;
        
        if (newLeftSize < leftMinEffective) {
          newLeftSize = leftMinEffective;
          newRightSize = startSizes[leftIndex] + startSizes[rightIndex] - newLeftSize;
        }
        if (newLeftSize > leftInfo.maxSize) {
          newLeftSize = leftInfo.maxSize;
          newRightSize = startSizes[leftIndex] + startSizes[rightIndex] - newLeftSize;
        }
        if (newRightSize < rightMinEffective) {
          newRightSize = rightMinEffective;
          newLeftSize = startSizes[leftIndex] + startSizes[rightIndex] - newRightSize;
        }
        if (newRightSize > rightInfo.maxSize) {
          newRightSize = rightInfo.maxSize;
          newLeftSize = startSizes[leftIndex] + startSizes[rightIndex] - newRightSize;
        }
        
        // 直接操作 DOM 实现零延迟拖拽，松开后再同步 React state
        const leftPanel = containerRef.current?.querySelector(`[data-panel-index="${leftIndex}"]`) as HTMLElement | null;
        const rightPanel = containerRef.current?.querySelector(`[data-panel-index="${rightIndex}"]`) as HTMLElement | null;
        if (leftPanel) leftPanel.style.flexBasis = `${newLeftSize}%`;
        if (rightPanel) rightPanel.style.flexBasis = `${newRightSize}%`;
        
        // 保存到 ref 供 mouseup 时读取
        dragStateRef.current._pendingLeftSize = newLeftSize;
        dragStateRef.current._pendingRightSize = newRightSize;
        dragStateRef.current._pendingLeftIndex = leftIndex;
        dragStateRef.current._pendingRightIndex = rightIndex;
      });
    };
    
    const handleMouseUp = () => {
      if (dragStateRef.current.rafId !== null) {
        cancelAnimationFrame(dragStateRef.current.rafId);
      }

      dragStateRef.current.isDragging = false;
      document.body.style.userSelect = '';
      document.body.style.cursor = '';

      // 读取拖拽过程中保存的 pending 尺寸
      const pendingLeftSize = dragStateRef.current._pendingLeftSize;
      const pendingRightSize = dragStateRef.current._pendingRightSize;
      const pendingLeftIndex = dragStateRef.current._pendingLeftIndex ?? dividerIndex;
      const pendingRightIndex = dragStateRef.current._pendingRightIndex ?? dividerIndex + 1;

      // 同步 React state（从 DOM 读取的实际值）
      if (pendingLeftSize !== undefined && pendingRightSize !== undefined) {
        setPanelStates(prev => {
          const newStates = new Map(prev);
          const leftSt = newStates.get(pendingLeftIndex);
          const rightSt = newStates.get(pendingRightIndex);
          if (leftSt) newStates.set(pendingLeftIndex, { ...leftSt, size: pendingLeftSize });
          if (rightSt) newStates.set(pendingRightIndex, { ...rightSt, size: pendingRightSize });
          return newStates;
        });
      }

      // 延一帧读取最新 state 做后续处理
      setTimeout(() => {
        const latestStates = panelStatesRef.current;

        // 保存到 localStorage
        saveToStorage(latestStates);

        // 自动关闭：检查相邻面板是否小于阈值
        const CLOSE_THRESHOLD = 10; // 10% —— 拖到此值以下松开将自动折叠
        const leftIdx = pendingLeftIndex;
        const rightIdx = pendingRightIndex;
        const leftSt = latestStates.get(leftIdx);
        const rightSt = latestStates.get(rightIdx);
        const leftInf = panelInfosRef.current.get(leftIdx);
        const rightInf = panelInfosRef.current.get(rightIdx);

        if (leftSt && !leftSt.collapsed && leftInf?.collapsible && leftSt.size < CLOSE_THRESHOLD) {
          setPanelCollapsed(leftIdx, true);
        } else if (rightSt && !rightSt.collapsed && rightInf?.collapsible && rightSt.size < CLOSE_THRESHOLD) {
          setPanelCollapsed(rightIdx, true);
        }
      }, 0);

      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
    
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  }, [direction, panelStates, saveToStorage, setPanelCollapsed]);

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

  // 从折叠态缝上按下：仅当鼠标满足拖动位移阈值时才展开并跟随鼠标调整尺寸；纯点击保持折叠
  const startResizeFromCollapsed = useCallback((index: number, startPos: number) => {
    if (!containerRef.current) return;
    const isHorizontal = direction === 'horizontal';
    const containerRect = containerRef.current.getBoundingClientRect();
    const panelInfo = panelInfosRef.current.get(index);
    if (!panelInfo) return;

    const containerSize = isHorizontal ? containerRect.width : containerRect.height;
    const containerStart = isHorizontal ? containerRect.left : containerRect.top;
    const panelsCount = panelInfosRef.current.size;
    const isLeftAligned = index === 0;
    const isRightAligned = index === panelsCount - 1;
    // 只支持首/尾面板的折叠拖拽（典型侧边栏场景）
    if (!isLeftAligned && !isRightAligned) return;

    let rafId: number | null = null;
    let hasMoved = false;
    const MOVE_THRESHOLD = 4; // 像素：超过此位移才视为拖动

    const handleMove = (e: MouseEvent) => {
      if (rafId !== null) cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(() => {
        const currentPos = isHorizontal ? e.clientX : e.clientY;
        if (!hasMoved) {
          if (Math.abs(currentPos - startPos) < MOVE_THRESHOLD) return;
          // 首次超过阈值：激活拖拽状态并改为 resize 光标
          hasMoved = true;
          document.body.style.userSelect = 'none';
          document.body.style.cursor = isHorizontal ? 'col-resize' : 'row-resize';
        }

        let targetPercent: number;
        if (isLeftAligned) {
          targetPercent = ((currentPos - containerStart) / containerSize) * 100;
        } else {
          const containerEnd = containerStart + containerSize;
          targetPercent = ((containerEnd - currentPos) / containerSize) * 100;
        }
        // 约束在 [0, maxSize]
        targetPercent = Math.min(panelInfo.maxSize, Math.max(0, targetPercent));

        setPanelStates(prev => {
          const newStates = new Map(prev);
          const currentSt = newStates.get(index);
          if (!currentSt) return prev;

          const oldSize = currentSt.collapsed ? 0 : currentSt.size;
          const delta = targetPercent - oldSize;

          let totalOther = 0;
          newStates.forEach((st, idx) => {
            if (idx !== index && !st.collapsed) totalOther += st.size;
          });

          if (totalOther > 0) {
            newStates.forEach((st, idx) => {
              if (idx !== index && !st.collapsed) {
                const ratio = st.size / totalOther;
                const otherInfo = panelInfosRef.current.get(idx);
                const minForOther = otherInfo?.minSize ?? 0;
                const proposedSize = st.size - delta * ratio;
                newStates.set(idx, { ...st, size: Math.max(minForOther, proposedSize) });
              }
            });
          }

          newStates.set(index, { collapsed: false, size: targetPercent });
          return newStates;
        });
      });
    };

    const handleUp = () => {
      if (rafId !== null) cancelAnimationFrame(rafId);
      document.body.style.userSelect = '';
      document.body.style.cursor = '';

      // 纯点击（未拖动）：什么都不做，保持折叠
      if (!hasMoved) {
        document.removeEventListener('mousemove', handleMove);
        document.removeEventListener('mouseup', handleUp);
        return;
      }

      // 拖动过：延一帧读最新 ref，若被压到阈值以下则重新折叠
      setTimeout(() => {
        const latest = panelStatesRef.current;
        const fs = latest.get(index);
        const CLOSE_THRESHOLD = 10;
        if (fs && !fs.collapsed && fs.size < CLOSE_THRESHOLD) {
          setPanelCollapsed(index, true);
        } else {
          saveToStorage(latest);
        }
      }, 0);

      document.removeEventListener('mousemove', handleMove);
      document.removeEventListener('mouseup', handleUp);
    };

    document.addEventListener('mousemove', handleMove);
    document.addEventListener('mouseup', handleUp);
  }, [direction, setPanelCollapsed, saveToStorage]);

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
          __startResizeFromCollapsed: (startPos: number) => startResizeFromCollapsed(index, startPos),
        });
        
        result.push(
          <React.Fragment key={`panel-${index}`}>
            {clonedPanel}
          </React.Fragment>
        );
        
        // 在面板之间添加分割条（最后一个面板后不添加）
        if (index < childrenArray.length - 1) {
          // 相邻任一面板处于折叠态时隐藏分割条，避免与折叠缝的点击区域重叠
          const leftCollapsed = state?.collapsed ?? false;
          const rightCollapsed = panelStates.get(index + 1)?.collapsed ?? false;
          if (!leftCollapsed && !rightCollapsed) {
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
