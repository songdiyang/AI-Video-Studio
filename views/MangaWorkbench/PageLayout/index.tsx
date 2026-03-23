/**
 * 页面布局组件
 * 漫画分页管理、分格布局编辑器、页面预览和排序
 */

import React, { useState, useCallback, useRef } from 'react';
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

const LayoutEditor: React.FC<LayoutEditorProps> = ({ page, onLayoutChange }) => {
  const [selectedPanel, setSelectedPanel] = useState<string | null>(null);
  const editorRef = useRef<HTMLDivElement>(null);
  
  const panels = page?.layout_data || LAYOUT_TEMPLATES[0].panels;
  
  // 应用布局模板
  const applyTemplate = (template: LayoutTemplate) => {
    onLayoutChange(template.panels);
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
        </div>
      </div>
      
      {/* 编辑区域 */}
      <div className="flex-1 p-4 flex items-center justify-center bg-[var(--bg-app)]">
        <div 
          ref={editorRef}
          className="relative bg-white shadow-xl"
          style={{ width: '300px', height: '400px' }}
        >
          {panels.map((panel) => (
            <div
              key={panel.id}
              className={`absolute border-2 transition-colors cursor-pointer ${
                selectedPanel === panel.id 
                  ? 'border-[var(--accent)] bg-[var(--accent)]/10' 
                  : 'border-gray-300 hover:border-[var(--accent)]/50'
              }`}
              style={{
                left: `${panel.x}%`,
                top: `${panel.y}%`,
                width: `${panel.width}%`,
                height: `${panel.height}%`,
              }}
              onClick={() => setSelectedPanel(panel.id)}
            >
              {/* 分格序号 */}
              <div className="absolute top-1 left-1 w-5 h-5 rounded-full bg-[var(--accent)] text-white text-xs flex items-center justify-center">
                {panels.indexOf(panel) + 1}
              </div>
              
              {/* 删除按钮 */}
              {selectedPanel === panel.id && (
                <button
                  onClick={(e) => { e.stopPropagation(); deletePanel(panel.id); }}
                  className="absolute top-1 right-1 p-1 rounded bg-red-500 text-white hover:bg-red-600"
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              )}
            </div>
          ))}
        </div>
      </div>
      
      {/* 提示 */}
      <div className="p-3 border-t border-[var(--border-color)] text-center text-xs text-[var(--text-muted)]">
        点击分格选中，拖拽边缘调整大小（开发中）
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
