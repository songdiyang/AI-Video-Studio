import React, { useState, useRef, useEffect } from 'react';
import { Camera, Users, Mountain, X, ChevronDown, Play, Box, Settings } from 'lucide-react';

export interface TabItem {
  id: string;
  type: 'scene' | 'character' | 'location' | 'animatic' | 'asset' | 'settings';
  title: string;
  sceneIndex?: number; // 分镜序号
  scriptId?: number;   // 所属集数ID（用于跨集标签页显示）
  assetType?: string; // 资产类型（用于 asset 标签页）
}

interface TabBarProps {
  tabs: TabItem[];
  activeTabId: string | null;
  onTabClick: (tabId: string) => void;
  onTabClose: (tabId: string) => void;
  onCloseOthers: (tabId: string) => void;
  onCloseRight: (tabId: string) => void;
  onTabReorder?: (newTabs: TabItem[]) => void; // 拖拽排序回调
}

const TabBar: React.FC<TabBarProps> = ({
  tabs,
  activeTabId,
  onTabClick,
  onTabClose,
  onCloseOthers,
  onCloseRight,
  onTabReorder,
}) => {
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; tabId: string } | null>(null);
  const contextMenuRef = useRef<HTMLDivElement>(null);
  const [draggedTabId, setDraggedTabId] = useState<string | null>(null);
  const [dragOverTabId, setDragOverTabId] = useState<string | null>(null);

  // 点击其他地方关闭右键菜单
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (contextMenuRef.current && !contextMenuRef.current.contains(e.target as Node)) {
        setContextMenu(null);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const getTabIcon = (tab: TabItem) => {
    switch (tab.type) {
      case 'scene':
        return <Camera size={12} />;
      case 'character':
        return <Users size={12} />;
      case 'location':
        return <Mountain size={12} />;
      case 'animatic':
        return <Play size={12} />;
      case 'asset':
        return <Box size={12} />;
      case 'settings':
        return <Settings size={12} />;
      default:
        return null;
    }
  };

  const getTabLabel = (tab: TabItem) => {
    switch (tab.type) {
      case 'scene':
        if (tab.scriptId !== undefined && tab.sceneIndex !== undefined) {
          return `${tab.scriptId}.${tab.sceneIndex}`;
        }
        return tab.sceneIndex !== undefined ? `#${tab.sceneIndex}` : tab.title;
      case 'character':
        return tab.title;
      case 'location':
        return tab.title;
      default:
        return tab.title;
    }
  };

  const handleContextMenu = (e: React.MouseEvent, tabId: string) => {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY, tabId });
  };

  const handleCloseOthers = () => {
    if (contextMenu) {
      onCloseOthers(contextMenu.tabId);
      setContextMenu(null);
    }
  };

  const handleCloseRight = () => {
    if (contextMenu) {
      onCloseRight(contextMenu.tabId);
      setContextMenu(null);
    }
  };

  const handleCloseTab = (tabId: string) => {
    onTabClose(tabId);
    setContextMenu(null);
  };

  // 拖拽排序处理
  const handleDragStart = (e: React.DragEvent, tabId: string) => {
    setDraggedTabId(tabId);
    e.dataTransfer.effectAllowed = 'move';
    // 设置拖拽时的透明图像
    const dragImage = document.createElement('div');
    dragImage.style.width = '100px';
    dragImage.style.height = '30px';
    dragImage.style.background = 'var(--bg-card)';
    dragImage.style.border = '1px solid var(--border-color)';
    dragImage.style.borderRadius = '4px';
    dragImage.style.position = 'absolute';
    dragImage.style.top = '-1000px';
    document.body.appendChild(dragImage);
    e.dataTransfer.setDragImage(dragImage, 50, 15);
    setTimeout(() => document.body.removeChild(dragImage), 0);
  };

  const handleDragOver = (e: React.DragEvent, tabId: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (tabId !== draggedTabId) {
      setDragOverTabId(tabId);
    }
  };

  const handleDragLeave = () => {
    setDragOverTabId(null);
  };

  const handleDrop = (e: React.DragEvent, targetTabId: string) => {
    e.preventDefault();
    setDragOverTabId(null);
    
    if (!draggedTabId || draggedTabId === targetTabId || !onTabReorder) {
      setDraggedTabId(null);
      return;
    }

    const draggedIndex = tabs.findIndex(t => t.id === draggedTabId);
    const targetIndex = tabs.findIndex(t => t.id === targetTabId);
    
    if (draggedIndex === -1 || targetIndex === -1) {
      setDraggedTabId(null);
      return;
    }

    // 重新排序
    const newTabs = [...tabs];
    const [removed] = newTabs.splice(draggedIndex, 1);
    newTabs.splice(targetIndex, 0, removed);
    
    onTabReorder(newTabs);
    setDraggedTabId(null);
  };

  const handleDragEnd = () => {
    setDraggedTabId(null);
    setDragOverTabId(null);
  };

  if (tabs.length === 0) return null;

  return (
    <>
      <div className="flex items-center h-9 bg-[var(--bg-nav)] border-b border-[var(--border-color)] overflow-x-auto scrollbar-hide tab-bar-scroll">
        {tabs.map((tab) => {
          const isActive = tab.id === activeTabId;
          const isDragged = tab.id === draggedTabId;
          const isDragOver = tab.id === dragOverTabId;
          return (
            <div
              key={tab.id}
              draggable={!!onTabReorder}
              onDragStart={(e) => handleDragStart(e, tab.id)}
              onDragOver={(e) => handleDragOver(e, tab.id)}
              onDragLeave={handleDragLeave}
              onDrop={(e) => handleDrop(e, tab.id)}
              onDragEnd={handleDragEnd}
              className={`
                group flex items-center gap-1.5 px-3 h-full text-xs cursor-pointer border-r border-[var(--border-color)]
                transition-colors select-none rounded-t-md
                ${isActive
                  ? 'bg-[var(--bg-app)] text-[var(--text-primary)] border-b-2 border-b-[var(--accent)]'
                  : 'bg-[var(--bg-nav)] text-[var(--text-muted)] hover:bg-[var(--bg-card)] hover:text-[var(--text-secondary)]'
                }
                ${isDragged ? 'opacity-50' : ''}
                ${isDragOver ? 'border-l-2 border-l-[var(--accent)]' : ''}
              `}
              onClick={() => onTabClick(tab.id)}
              onContextMenu={(e) => handleContextMenu(e, tab.id)}
            >
              <span className="flex-shrink-0 opacity-60">
                {getTabIcon(tab)}
              </span>
              <span className="truncate max-w-[80px]">
                {getTabLabel(tab)}
              </span>
              <button
                className={`
                  flex-shrink-0 p-0.5 rounded hover:bg-[var(--bg-card-hover)] opacity-0 group-hover:opacity-100 transition-all tab-close-btn
                  ${isActive ? 'opacity-100' : ''}
                `}
                onClick={(e) => {
                  e.stopPropagation();
                  onTabClose(tab.id);
                }}
                title="关闭标签"
              >
                <X size={12} />
              </button>
            </div>
          );
        })}
      </div>

      {/* 右键菜单 */}
      {contextMenu && (
        <div
          ref={contextMenuRef}
          className="fixed z-50 bg-[var(--bg-nav)] border border-[var(--border-color)] rounded-lg shadow-lg py-1 min-w-[120px]"
          style={{ left: contextMenu.x, top: contextMenu.y }}
        >
          <button
            className="w-full px-3 py-1.5 text-xs text-left text-[var(--text-secondary)] hover:bg-[var(--bg-card)] hover:text-[var(--text-primary)] transition-colors"
            onClick={() => handleCloseTab(contextMenu.tabId)}
          >
            关闭
          </button>
          <button
            className="w-full px-3 py-1.5 text-xs text-left text-[var(--text-secondary)] hover:bg-[var(--bg-card)] hover:text-[var(--text-primary)] transition-colors"
            onClick={handleCloseOthers}
          >
            关闭其他
          </button>
          <button
            className="w-full px-3 py-1.5 text-xs text-left text-[var(--text-secondary)] hover:bg-[var(--bg-card)] hover:text-[var(--text-primary)] transition-colors"
            onClick={handleCloseRight}
          >
            关闭右侧
          </button>
        </div>
      )}
    </>
  );
};

export default TabBar;
