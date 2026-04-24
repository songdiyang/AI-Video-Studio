import React, { forwardRef, useImperativeHandle, useState, useCallback, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

export interface ResizablePanelProps {
  /** 默认大小（百分比，如 25 表示25%） */
  defaultSize?: number;
  /** 最小大小（百分比） */
  minSize?: number;
  /** 最大大小（百分比） */
  maxSize?: number;
  /** 是否可折叠 */
  collapsible?: boolean;
  /** 折叠后的大小（px） */
  collapsedSize?: number;
  /** 折叠状态变化回调 */
  onCollapse?: (collapsed: boolean) => void;
  /** 面板标题（可选，显示在面板顶部） */
  title?: string;
  /** 面板头部右侧的操作按钮 */
  headerActions?: React.ReactNode;
  /** 子内容 */
  children: React.ReactNode;
  /** 自定义className */
  className?: string;
  /** 面板唯一标识 */
  id?: string;
}

export interface ResizablePanelRef {
  collapse: () => void;
  expand: () => void;
  toggle: () => void;
  isCollapsed: () => boolean;
}

interface InternalPanelProps extends ResizablePanelProps {
  /** 由 PanelGroup 注入的当前大小 */
  __size?: number;
  /** 由 PanelGroup 注入的折叠状态 */
  __collapsed?: boolean;
  /** 由 PanelGroup 注入的折叠回调 */
  __onCollapse?: (collapsed: boolean) => void;
  /** 由 PanelGroup 注入的方向 */
  __direction?: 'horizontal' | 'vertical';
  /** 由 PanelGroup 注入的索引 */
  __index?: number;
  /** 由 PanelGroup 注入的移动端标志 */
  __isMobile?: boolean;
  /** 由 PanelGroup 注入的平板标志 */
  __isTablet?: boolean;
}

const ResizablePanel = forwardRef<ResizablePanelRef, ResizablePanelProps>((props, ref) => {
  const {
    defaultSize = 100,
    minSize = 0,
    maxSize = 100,
    collapsible = false,
    collapsedSize = 32,
    onCollapse,
    title,
    headerActions,
    children,
    className = '',
    id,
    // 内部属性
    __size,
    __collapsed,
    __onCollapse,
    __direction = 'horizontal',
    __index,
    __isMobile,
    __isTablet,
  } = props as InternalPanelProps;

  // 独立使用时的内部折叠状态
  const [internalCollapsed, setInternalCollapsed] = useState(false);
  
  // 判断是否由 PanelGroup 管理
  const isManagedByGroup = __size !== undefined;
  const isCollapsed = isManagedByGroup ? __collapsed ?? false : internalCollapsed;
  
  const handleCollapse = useCallback((collapsed: boolean) => {
    if (isManagedByGroup && __onCollapse) {
      __onCollapse(collapsed);
    } else {
      setInternalCollapsed(collapsed);
    }
    onCollapse?.(collapsed);
  }, [isManagedByGroup, __onCollapse, onCollapse]);

  const collapse = useCallback(() => handleCollapse(true), [handleCollapse]);
  const expand = useCallback(() => handleCollapse(false), [handleCollapse]);
  const toggle = useCallback(() => handleCollapse(!isCollapsed), [handleCollapse, isCollapsed]);

  // 当 PanelGroup 设置折叠状态时，同步通知外部 onCollapse
  const prevCollapsedRef = useRef(isCollapsed);
  useEffect(() => {
    if (isManagedByGroup && prevCollapsedRef.current !== isCollapsed) {
      prevCollapsedRef.current = isCollapsed;
      onCollapse?.(isCollapsed);
    }
  }, [isManagedByGroup, isCollapsed, onCollapse]);

  useImperativeHandle(ref, () => ({
    collapse,
    expand,
    toggle,
    isCollapsed: () => isCollapsed,
  }), [collapse, expand, toggle, isCollapsed]);

  // 计算样式
  const isHorizontal = __direction === 'horizontal';
  const style: React.CSSProperties = {};
  
  // 移动端模式：全屏显示
  if (__isMobile) {
    style.flexBasis = '100%';
    style.flexGrow = 1;
    style.flexShrink = 0;
    style.height = '100%';
  } else if (isManagedByGroup) {
    if (isCollapsed) {
      style.flexBasis = `${collapsedSize}px`;
      style.flexGrow = 0;
      style.flexShrink = 0;
      style.minWidth = isHorizontal ? `${collapsedSize}px` : undefined;
      style.minHeight = !isHorizontal ? `${collapsedSize}px` : undefined;
    } else {
      style.flexBasis = `${__size}%`;
      style.flexGrow = 0;
      style.flexShrink = 0;
      style.minWidth = isHorizontal ? `${minSize}%` : undefined;
      style.minHeight = !isHorizontal ? `${minSize}%` : undefined;
      style.maxWidth = isHorizontal ? `${maxSize}%` : undefined;
      style.maxHeight = !isHorizontal ? `${maxSize}%` : undefined;
    }
  }

  // 折叠箭头图标
  const CollapseIcon = () => {
    const iconRotation = isHorizontal
      ? (isCollapsed ? 0 : 180)
      : (isCollapsed ? 90 : -90);
    
    return (
      <motion.svg
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        animate={{ rotate: iconRotation }}
        transition={{ duration: 0.2 }}
        className="text-[var(--text-muted)]"
      >
        <polyline points="15 18 9 12 15 6" />
      </motion.svg>
    );
  };

  return (
    <motion.div
      data-panel
      data-panel-id={id}
      data-panel-index={__index}
      data-collapsed={isCollapsed}
      data-mobile={__isMobile}
      data-tablet={__isTablet}
      className={`
        relative flex flex-col
        bg-[var(--bg-app)] 
        overflow-hidden
        transition-[flex-basis] duration-200 ease-out
        ${__isMobile ? 'h-full' : ''}
        ${className}
      `}
      style={style}
      layout={!__isMobile}
    >
      {/* 折叠状态下的窄条 */}
      <AnimatePresence mode="wait">
        {isCollapsed ? (
          <motion.div
            key="collapsed"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className={`
              absolute inset-0 flex items-center justify-center
              bg-[var(--bg-card)] border-[var(--border-color)]
              cursor-pointer hover:bg-[var(--bg-card-hover)]
              transition-colors duration-150
              ${isHorizontal ? 'border-r' : 'border-b'}
            `}
            onClick={expand}
          >
            <div className={`flex items-center gap-1.5 ${isHorizontal ? 'flex-col' : 'flex-row'}`}>
              <CollapseIcon />
              {title && (
                <span 
                  className={`
                    text-xs font-medium text-[var(--text-muted)] uppercase tracking-wider
                    ${isHorizontal ? 'writing-mode-vertical-lr rotate-180' : ''}
                  `}
                  style={isHorizontal ? { writingMode: 'vertical-lr' } : undefined}
                >
                  {title}
                </span>
              )}
            </div>
          </motion.div>
        ) : (
          <motion.div
            key="expanded"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="flex flex-col h-full"
          >
            {/* 面板头部 - 移动端隐藏 */}
            {(title || headerActions || collapsible) && !__isMobile && (
              <div 
                className={`
                  flex-shrink-0 h-8 px-3 flex items-center justify-between gap-2
                  bg-[var(--bg-card)] border-b border-[var(--border-color)]
                `}
              >
                <div className="flex items-center gap-2 min-w-0">
                  {collapsible && (
                    <button
                      onClick={collapse}
                      className="
                        p-0.5 rounded hover:bg-[var(--bg-card-hover)]
                        transition-colors duration-150
                      "
                      title="折叠面板"
                    >
                      <CollapseIcon />
                    </button>
                  )}
                  {title && (
                    <span className="text-xs font-medium uppercase tracking-wider text-[var(--text-muted)] truncate">
                      {title}
                    </span>
                  )}
                </div>
                {headerActions && (
                  <div className="flex items-center gap-1 flex-shrink-0">
                    {headerActions}
                  </div>
                )}
              </div>
            )}
            
            {/* 面板内容 */}
            <div className="flex-1 overflow-auto">
              {children}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
});

ResizablePanel.displayName = 'ResizablePanel';

export default ResizablePanel;
