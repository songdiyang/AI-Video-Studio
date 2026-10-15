/**
 * 页面布局组件
 * 漫画分页管理、分格布局编辑器、页面预览和排序
 */

import React, { useState, useCallback, useRef, useEffect } from 'react';
import { Button, Tooltip } from '@heroui/react';
import { 
  Plus, Trash2, Copy, ChevronLeft, ChevronRight, 
  Grid, LayoutGrid, Square, Columns, Rows, Move, Eye, Maximize2
} from 'lucide-react';
import { MangaPage, PanelLayout as PanelLayoutType } from '../../../types/projectTypes';
import { useToast } from '../../../contexts/ToastContext';
import { getAuthToken } from '../../../services/auth';

// ==================== 类型定义 ====================

interface PageLayoutProps {
  projectId: number;
  episodeNumber: number;
  pages: MangaPage[];
  currentPage: number;
  onPageChange: (page: number) => void;
  onPagesUpdate: (pages: MangaPage[]) => void;
}

interface LayoutTemplate {
  id: string;
  name: string;
  icon: React.ElementType;
  panels: PanelLayoutType[];
}

// ==================== 布局模板 ====================

const LAYOUT_TEMPLATES: LayoutTemplate[] = [
  {
    id: 'single',
    name: '单格',
    icon: Square,
    panels: [{ id: '1', x: 0, y: 0, width: 100, height: 100 }],
  },
  {
    id: 'vertical_2',
    name: '上下两格',
    icon: Rows,
    panels: [
      { id: '1', x: 0, y: 0, width: 100, height: 50 },
      { id: '2', x: 0, y: 50, width: 100, height: 50 },
    ],
  },
  {
    id: 'horizontal_2',
    name: '左右两格',
    icon: Columns,
    panels: [
      { id: '1', x: 0, y: 0, width: 50, height: 100 },
      { id: '2', x: 50, y: 0, width: 50, height: 100 },
    ],
  },
  {
    id: 'grid_4',
    name: '四格',
    icon: Grid,
    panels: [
      { id: '1', x: 0, y: 0, width: 50, height: 50 },
      { id: '2', x: 50, y: 0, width: 50, height: 50 },
      { id: '3', x: 0, y: 50, width: 50, height: 50 },
      { id: '4', x: 50, y: 50, width: 50, height: 50 },
    ],
  },
  {
    id: 'comic_standard',
    name: '标准漫画',
    icon: LayoutGrid,
    panels: [
      { id: '1', x: 0, y: 0, width: 60, height: 40 },
      { id: '2', x: 60, y: 0, width: 40, height: 40 },
      { id: '3', x: 0, y: 40, width: 100, height: 30 },
      { id: '4', x: 0, y: 70, width: 50, height: 30 },
      { id: '5', x: 50, y: 70, width: 50, height: 30 },
    ],
  },
];

// ==================== 页面缩略图组件 ====================

interface PageThumbnailProps {
  page: MangaPage;
  isActive: boolean;
  onClick: () => void;
  onDelete: () => void;
  onDuplicate: () => void;
}

const PageThumbnail: React.FC<PageThumbnailProps> = ({
  page,
  isActive,
  onClick,
  onDelete,
  onDuplicate,
}) => {
  return (
    <div
      className={`relative group cursor-pointer rounded-lg border-2 transition-all ${
        isActive 
          ? 'border-[var(--accent)] shadow-lg shadow-[var(--accent)]/20' 
          : 'border-[var(--border-color)] hover:border-[var(--accent)]/50'
      }`}
      onClick={onClick}
    >
      {/* 缩略图 */}
      <div className="aspect-[3/4] bg-[var(--bg-card)] rounded-md overflow-hidden">
        {page.thumbnail_url ? (
          <img src={page.thumbnail_url} alt={`Page ${page.page_number}`} className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            {/* 渲染分格预览 */}
            <div className="w-full h-full p-1 relative">
              {page.layout_data?.map((panel, idx) => (
                <div
                  key={panel.id || idx}
                  className="absolute bg-[var(--bg-input)] border border-[var(--border-color)]"
                  style={{
                    left: `${panel.x}%`,
                    top: `${panel.y}%`,
                    width: `${panel.width}%`,
                    height: `${panel.height}%`,
                  }}
                />
              )) || (
                <div className="w-full h-full bg-[var(--bg-input)] border border-dashed border-[var(--border-color)]" />
              )}
            </div>
          </div>
        )}
      </div>
      
      {/* 页码 */}
      <div className="text-center py-1 text-xs text-[var(--text-muted)]">
        P{page.page_number}
      </div>
      
      {/* 操作按钮 */}
      <div className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 transition-opacity flex gap-1">
        <Tooltip content="复制">
          <button
            onClick={(e) => { e.stopPropagation(); onDuplicate(); }}
            className="p-1 rounded bg-black/50 hover:bg-black/70 text-white"
          >
            <Copy className="w-3 h-3" />
          </button>
        </Tooltip>
        <Tooltip content="删除">
          <button
            onClick={(e) => { e.stopPropagation(); onDelete(); }}
            className="p-1 rounded bg-red-500/50 hover:bg-red-500/70 text-white"
          >
            <Trash2 className="w-3 h-3" />
          </button>
        </Tooltip>
      </div>
    </div>
  );
};

// ==================== 布局编辑器组件 ====================

interface LayoutEditorProps {
  page: MangaPage | undefined;
  onLayoutChange: (layout: PanelLayoutType[]) => void;
}

type ResizeHandle = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw' | 'move';

const LayoutEditor: React.FC<LayoutEditorProps> = ({ page, onLayoutChange }) => {
  const [selectedPanel, setSelectedPanel] = useState<string | null>(null);
  const editorRef = useRef<HTMLDivElement>(null);
  
  // 拖拽状态
  const [isDragging, setIsDragging] = useState(false);
  const [dragHandle, setDragHandle] = useState<ResizeHandle | null>(null);
  const [dragStartPos, setDragStartPos] = useState({ x: 0, y: 0 });
  const [dragStartPanel, setDragStartPanel] = useState<PanelLayoutType | null>(null);
  
  const panels = page?.layout_data || LAYOUT_TEMPLATES[0].panels;
  
  // 应用布局模板
  const applyTemplate = (template: LayoutTemplate) => {
    onLayoutChange(template.panels);
    setSelectedPanel(null);
  };
  
  // 添加新分格
  const addPanel = () => {
    const newPanel: PanelLayoutType = {
      id: `panel_${Date.now()}`,
      x: 25,
      y: 25,
      width: 50,
      height: 50,
    };
    onLayoutChange([...panels, newPanel]);
  };
  
  // 删除分格
  const deletePanel = (panelId: string) => {
    onLayoutChange(panels.filter(p => p.id !== panelId));
    setSelectedPanel(null);
  };
  
  // 计算编辑器内的百分比位置
  const getPercentPosition = (clientX: number, clientY: number) => {
    if (!editorRef.current) return { x: 0, y: 0 };
    const rect = editorRef.current.getBoundingClientRect();
    const x = Math.max(0, Math.min(100, ((clientX - rect.left) / rect.width) * 100));
    const y = Math.max(0, Math.min(100, ((clientY - rect.top) / rect.height) * 100));
    return { x, y };
  };
  
  // 开始拖拽
  const handleMouseDown = (e: React.MouseEvent, panelId: string, handle: ResizeHandle) => {
    e.stopPropagation();
    e.preventDefault();
    
    const panel = panels.find(p => p.id === panelId);
    if (!panel) return;
    
    setSelectedPanel(panelId);
    setIsDragging(true);
    setDragHandle(handle);
    setDragStartPos({ x: e.clientX, y: e.clientY });
    setDragStartPanel({ ...panel });
  };
  
  // 拖拽中
  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!isDragging || !dragStartPanel || !dragHandle || !editorRef.current) return;
    
    const rect = editorRef.current.getBoundingClientRect();
    const deltaX = ((e.clientX - dragStartPos.x) / rect.width) * 100;
    const deltaY = ((e.clientY - dragStartPos.y) / rect.height) * 100;
    
    let newPanel = { ...dragStartPanel };
    
    // 根据拖拽手柄类型调整分格
    switch (dragHandle) {
      case 'move':
        newPanel.x = Math.max(0, Math.min(100 - newPanel.width, dragStartPanel.x + deltaX));
        newPanel.y = Math.max(0, Math.min(100 - newPanel.height, dragStartPanel.y + deltaY));
        break;
      case 'n':
        newPanel.y = Math.max(0, Math.min(dragStartPanel.y + dragStartPanel.height - 10, dragStartPanel.y + deltaY));
        newPanel.height = dragStartPanel.height - (newPanel.y - dragStartPanel.y);
        break;
      case 's':
        newPanel.height = Math.max(10, Math.min(100 - dragStartPanel.y, dragStartPanel.height + deltaY));
        break;
      case 'e':
        newPanel.width = Math.max(10, Math.min(100 - dragStartPanel.x, dragStartPanel.width + deltaX));
        break;
      case 'w':
        newPanel.x = Math.max(0, Math.min(dragStartPanel.x + dragStartPanel.width - 10, dragStartPanel.x + deltaX));
        newPanel.width = dragStartPanel.width - (newPanel.x - dragStartPanel.x);
        break;
      case 'ne':
        newPanel.y = Math.max(0, Math.min(dragStartPanel.y + dragStartPanel.height - 10, dragStartPanel.y + deltaY));
        newPanel.height = dragStartPanel.height - (newPanel.y - dragStartPanel.y);
        newPanel.width = Math.max(10, Math.min(100 - dragStartPanel.x, dragStartPanel.width + deltaX));
        break;
      case 'nw':
        newPanel.y = Math.max(0, Math.min(dragStartPanel.y + dragStartPanel.height - 10, dragStartPanel.y + deltaY));
        newPanel.height = dragStartPanel.height - (newPanel.y - dragStartPanel.y);
        newPanel.x = Math.max(0, Math.min(dragStartPanel.x + dragStartPanel.width - 10, dragStartPanel.x + deltaX));
        newPanel.width = dragStartPanel.width - (newPanel.x - dragStartPanel.x);
        break;
      case 'se':
        newPanel.height = Math.max(10, Math.min(100 - dragStartPanel.y, dragStartPanel.height + deltaY));
        newPanel.width = Math.max(10, Math.min(100 - dragStartPanel.x, dragStartPanel.width + deltaX));
        break;
      case 'sw':
        newPanel.height = Math.max(10, Math.min(100 - dragStartPanel.y, dragStartPanel.height + deltaY));
        newPanel.x = Math.max(0, Math.min(dragStartPanel.x + dragStartPanel.width - 10, dragStartPanel.x + deltaX));
        newPanel.width = dragStartPanel.width - (newPanel.x - dragStartPanel.x);
        break;
    }
    
    // 四舍五入到整数
    newPanel.x = Math.round(newPanel.x);
    newPanel.y = Math.round(newPanel.y);
    newPanel.width = Math.round(newPanel.width);
    newPanel.height = Math.round(newPanel.height);
    
    const updatedPanels = panels.map(p => p.id === dragStartPanel.id ? newPanel : p);
    onLayoutChange(updatedPanels);
  }, [isDragging, dragStartPanel, dragHandle, dragStartPos, panels, onLayoutChange]);
  
  // 结束拖拽
  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
    setDragHandle(null);
    setDragStartPanel(null);
  }, []);
  
  // 绑定全局鼠标事件
  useEffect(() => {
    if (isDragging) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
      return () => {
        window.removeEventListener('mousemove', handleMouseMove);
        window.removeEventListener('mouseup', handleMouseUp);
      };
    }
  }, [isDragging, handleMouseMove, handleMouseUp]);
  
  // 渲染调整手柄
  const renderResizeHandles = (panel: PanelLayoutType) => {
    if (selectedPanel !== panel.id) return null;
    
    const handleStyle = "absolute w-3 h-3 bg-[var(--accent)] border-2 border-white rounded-sm shadow-md z-10";
    const edgeStyle = "absolute bg-transparent hover:bg-[var(--accent)]/30";
    
    return (
      <>
        {/* 角部手柄 */}
        <div 
          className={`${handleStyle} cursor-nw-resize`}
          style={{ top: -6, left: -6 }}
          onMouseDown={(e) => handleMouseDown(e, panel.id, 'nw')}
        />
        <div 
          className={`${handleStyle} cursor-ne-resize`}
          style={{ top: -6, right: -6 }}
          onMouseDown={(e) => handleMouseDown(e, panel.id, 'ne')}
        />
        <div 
          className={`${handleStyle} cursor-sw-resize`}
          style={{ bottom: -6, left: -6 }}
          onMouseDown={(e) => handleMouseDown(e, panel.id, 'sw')}
        />
        <div 
          className={`${handleStyle} cursor-se-resize`}
          style={{ bottom: -6, right: -6 }}
          onMouseDown={(e) => handleMouseDown(e, panel.id, 'se')}
        />
        {/* 边缘手柄 */}
        <div 
          className={`${edgeStyle} cursor-n-resize`}
          style={{ top: -4, left: 10, right: 10, height: 8 }}
          onMouseDown={(e) => handleMouseDown(e, panel.id, 'n')}
        />
        <div 
          className={`${edgeStyle} cursor-s-resize`}
          style={{ bottom: -4, left: 10, right: 10, height: 8 }}
          onMouseDown={(e) => handleMouseDown(e, panel.id, 's')}
        />
        <div 
          className={`${edgeStyle} cursor-w-resize`}
          style={{ left: -4, top: 10, bottom: 10, width: 8 }}
          onMouseDown={(e) => handleMouseDown(e, panel.id, 'w')}
        />
        <div 
          className={`${edgeStyle} cursor-e-resize`}
          style={{ right: -4, top: 10, bottom: 10, width: 8 }}
          onMouseDown={(e) => handleMouseDown(e, panel.id, 'e')}
        />
      </>
    );
  };

  return (
    <div className="h-full flex flex-col">
      {/* 工具栏 */}
      <div className="p-3 border-b border-[var(--border-color)] flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-sm text-[var(--text-muted)]">布局模板:</span>
          {LAYOUT_TEMPLATES.map((template) => {
            const Icon = template.icon;
            return (
              <Tooltip key={template.id} content={template.name}>
                <button
                  onClick={() => applyTemplate(template)}
                  className="p-2 rounded-lg hover:bg-[var(--bg-input)] transition-colors"
                >
                  <Icon className="w-4 h-4 text-[var(--text-secondary)]" />
                </button>
              </Tooltip>
            );
          })}
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="flat" startContent={<Plus className="w-4 h-4" />} onPress={addPanel}>
            添加分格
          </Button>
          {selectedPanel && (
            <Button 
              size="sm" 
              variant="flat" 
              color="danger"
              startContent={<Trash2 className="w-4 h-4" />} 
              onPress={() => deletePanel(selectedPanel)}
            >
              删除分格
            </Button>
          )}
        </div>
      </div>
      
      {/* 编辑区域 */}
      <div className="flex-1 p-4 flex items-center justify-center bg-[var(--bg-app)]">
        <div 
          ref={editorRef}
          className="relative bg-white shadow-xl select-none"
          style={{ width: '300px', height: '400px' }}
          onClick={() => setSelectedPanel(null)}
        >
          {panels.map((panel) => (
            <div
              key={panel.id}
              className={`absolute border-2 transition-colors ${
                selectedPanel === panel.id 
                  ? 'border-[var(--accent)] bg-[var(--accent)]/10' 
                  : 'border-gray-300 hover:border-[var(--accent)]/50'
              } ${isDragging && selectedPanel === panel.id ? 'cursor-grabbing' : 'cursor-pointer'}`}
              style={{
                left: `${panel.x}%`,
                top: `${panel.y}%`,
                width: `${panel.width}%`,
                height: `${panel.height}%`,
              }}
              onClick={(e) => { e.stopPropagation(); setSelectedPanel(panel.id); }}
              onMouseDown={(e) => { 
                if (selectedPanel === panel.id) {
                  handleMouseDown(e, panel.id, 'move');
                }
              }}
            >
              {/* 分格序号 */}
              <div className="absolute top-1 left-1 w-5 h-5 rounded-full bg-[var(--accent)] text-white text-xs flex items-center justify-center pointer-events-none">
                {panels.indexOf(panel) + 1}
              </div>
              
              {/* 尺寸信息 */}
              {selectedPanel === panel.id && (
                <div className="absolute bottom-1 right-1 text-[10px] text-[var(--accent)] bg-white/80 px-1 rounded pointer-events-none">
                  {Math.round(panel.width)}×{Math.round(panel.height)}%
                </div>
              )}
              
              {/* 调整手柄 */}
              {renderResizeHandles(panel)}
            </div>
          ))}
        </div>
      </div>
      
      {/* 提示 */}
      <div className="p-3 border-t border-[var(--border-color)] text-center text-xs text-[var(--text-muted)]">
        点击分格选中，拖拽移动位置，拖拽边缘或角落调整大小
      </div>
    </div>
  );
};

// ==================== 主组件 ====================

const PageLayout: React.FC<PageLayoutProps> = ({
  projectId,
  episodeNumber,
  pages,
  currentPage,
  onPageChange,
  onPagesUpdate,
}) => {
  const { showToast } = useToast();
  
  // 获取当前页面
  const currentPageData = pages.find(p => p.page_number === currentPage);
  
  // 添加新页面
  const handleAddPage = async () => {
    const newPageNumber = pages.length > 0 ? Math.max(...pages.map(p => p.page_number)) + 1 : 1;
    const newPage: MangaPage = {
      id: Date.now(),
      project_id: projectId,
      user_id: 0,
      episode_number: episodeNumber,
      page_number: newPageNumber,
      layout_type: 'single',
      layout_data: LAYOUT_TEMPLATES[0].panels,
      status: 'draft',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    
    onPagesUpdate([...pages, newPage]);
    onPageChange(newPageNumber);
    showToast('已添加新页面', 'success');
  };
  
  // 删除页面
  const handleDeletePage = (pageNumber: number) => {
    const updatedPages = pages.filter(p => p.page_number !== pageNumber);
    onPagesUpdate(updatedPages);
    if (currentPage === pageNumber && updatedPages.length > 0) {
      onPageChange(updatedPages[0].page_number);
    }
    showToast('已删除页面', 'success');
  };
  
  // 复制页面
  const handleDuplicatePage = (pageNumber: number) => {
    const pageToCopy = pages.find(p => p.page_number === pageNumber);
    if (!pageToCopy) return;
    
    const newPageNumber = pages.length > 0 ? Math.max(...pages.map(p => p.page_number)) + 1 : 1;
    const newPage: MangaPage = {
      ...pageToCopy,
      id: Date.now(),
      page_number: newPageNumber,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    
    onPagesUpdate([...pages, newPage]);
    showToast('已复制页面', 'success');
  };
  
  // 更新布局
  const handleLayoutChange = (layout: PanelLayoutType[]) => {
    const updatedPages = pages.map(p => 
      p.page_number === currentPage 
        ? { ...p, layout_data: layout, layout_type: 'custom' as const, updated_at: new Date().toISOString() }
        : p
    );
    onPagesUpdate(updatedPages);
  };

  return (
    <div className="h-full flex">
      {/* 左侧页面列表 */}
      <div className="w-48 border-r border-[var(--border-color)] bg-[var(--bg-nav)] flex flex-col">
        <div className="p-3 border-b border-[var(--border-color)] flex items-center justify-between">
          <span className="text-sm font-medium text-[var(--text-primary)]">页面列表</span>
          <Button size="sm" isIconOnly variant="light" onPress={handleAddPage}>
            <Plus className="w-4 h-4" />
          </Button>
        </div>
        
        <div className="flex-1 overflow-y-auto p-2 space-y-2">
          {pages.length === 0 ? (
            <div className="text-center py-8 text-sm text-[var(--text-muted)]">
              <p>暂无页面</p>
              <Button size="sm" className="mt-2" onPress={handleAddPage}>
                添加第一页
              </Button>
            </div>
          ) : (
            pages
              .sort((a, b) => a.page_number - b.page_number)
              .map((page) => (
                <PageThumbnail
                  key={page.id}
                  page={page}
                  isActive={page.page_number === currentPage}
                  onClick={() => onPageChange(page.page_number)}
                  onDelete={() => handleDeletePage(page.page_number)}
                  onDuplicate={() => handleDuplicatePage(page.page_number)}
                />
              ))
          )}
        </div>
      </div>
      
      {/* 右侧布局编辑器 */}
      <div className="flex-1">
        {currentPageData ? (
          <LayoutEditor page={currentPageData} onLayoutChange={handleLayoutChange} />
        ) : (
          <div className="h-full flex items-center justify-center text-[var(--text-muted)]">
            选择或添加一个页面开始编辑
          </div>
        )}
      </div>
    </div>
  );
};

export default PageLayout;
