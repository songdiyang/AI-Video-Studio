import React, { useMemo, useState, useEffect, useRef, useCallback } from 'react';
import {
  Button,
  ButtonGroup,
  Card,
  CardBody,
  Chip,
  Checkbox,
  Select,
  SelectItem,
  Table,
  TableHeader,
  TableColumn,
  TableBody,
  TableRow,
  TableCell,
  Tooltip
} from '@heroui/react';
import {
  Grid,
  List,
  Pencil,
  Wand2,
  Trash2,
  ImageOff,
  PencilLine
} from 'lucide-react';
import {
  useSketchManager,
  SketchStoryboard,
  SketchStatusFilter,
  SketchViewMode
} from '../hooks/useSketchManager';
import { SketchType, SKETCH_TYPE_CONFIGS } from '../types/sketch';
import { useVirtualGrid } from '../../../../hooks/useVirtualList';

export interface SketchManagerProps {
  scriptId: number;
  projectId: number;
  storyboards: SketchStoryboard[];
  onOpenEditor?: (storyboardId: number) => void;
  onGenerateFromSketch?: (storyboardId: number) => void;
  onStoryboardUpdate?: (id: number, updates: Partial<SketchStoryboard>) => void;
  onRefresh?: () => void;
}

// 草图类型标签颜色映射
const SKETCH_TYPE_COLORS: Record<SketchType, 'default' | 'primary' | 'secondary' | 'success' | 'warning' | 'danger'> = {
  stick_figure: 'warning',
  storyboard_sketch: 'primary',
  detailed_lineart: 'success'
};

// 虚拟网格相关常量
const VIRTUAL_GRID_THRESHOLD = 20; // 超过此数量启用虚拟网格
const ROW_HEIGHT = 280; // 卡片高度（缩略图 aspect-video + 信息区 + padding）
const GAP = 16; // gap-4 = 16px

// 根据断点计算列数
const getColumns = (): number => {
  if (typeof window === 'undefined') return 4;
  if (window.innerWidth >= 1024) return 4;  // lg
  if (window.innerWidth >= 768) return 3;   // md
  if (window.innerWidth >= 640) return 2;   // sm
  return 1;
};

// 格式化时间
const formatDate = (dateStr?: string) => {
  if (!dateStr) return '-';
  const date = new Date(dateStr);
  return date.toLocaleDateString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  });
};

const SketchManager: React.FC<SketchManagerProps> = ({
  scriptId,
  projectId,
  storyboards,
  onOpenEditor,
  onGenerateFromSketch,
  onStoryboardUpdate,
  onRefresh
}) => {
  // 虚拟网格相关状态
  const [columns, setColumns] = useState(getColumns());
  const gridContainerRef = useRef<HTMLDivElement>(null);
  const [containerHeight, setContainerHeight] = useState(600);

  // 监听窗口大小变化，更新列数
  useEffect(() => {
    const handleResize = () => {
      setColumns(getColumns());
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // 监听容器高度变化
  useEffect(() => {
    const updateContainerHeight = () => {
      if (gridContainerRef.current) {
        const rect = gridContainerRef.current.getBoundingClientRect();
        setContainerHeight(rect.height || 600);
      }
    };
    
    updateContainerHeight();
    window.addEventListener('resize', updateContainerHeight);
    
    // 使用 ResizeObserver 监听容器尺寸变化
    const resizeObserver = new ResizeObserver(updateContainerHeight);
    if (gridContainerRef.current) {
      resizeObserver.observe(gridContainerRef.current);
    }
    
    return () => {
      window.removeEventListener('resize', updateContainerHeight);
      resizeObserver.disconnect();
    };
  }, []);

  const {
    filteredStoryboards,
    typeFilter,
    setTypeFilter,
    statusFilter,
    setStatusFilter,
    viewMode,
    setViewMode,
    selectedIds,
    toggleSelect,
    selectAll,
    clearSelection,
    isAllSelected,
    batchDelete,
    batchGenerate,
    handleDeleteSketch,
    handleGenerateFromSketch,
    isLoading,
    isBatchDeleting,
    isBatchGenerating,
    totalCount,
    withSketchCount,
    withoutSketchCount
  } = useSketchManager({
    scriptId,
    storyboards,
    onStoryboardUpdate,
    onRefresh
  });

  // 是否启用虚拟网格
    const enableVirtualGrid = filteredStoryboards.length > VIRTUAL_GRID_THRESHOLD;
  
    // 虚拟网格 hook
    const virtualGrid = useVirtualGrid({
      itemCount: filteredStoryboards.length,
      columns,
      rowHeight: ROW_HEIGHT,
      containerHeight,
      overscan: 2,
      gap: GAP,
    });
  
    // 选中数量
  const selectedCount = selectedIds.size;
  const hasSelection = selectedCount > 0;

  // 选中的有草图分镜数量
  const selectedWithSketchCount = useMemo(() => {
    return Array.from(selectedIds).filter(id => {
      const s = storyboards.find(sb => sb.id === id);
      return s?.sketchUrl;
    }).length;
  }, [selectedIds, storyboards]);

  // 处理编辑按钮点击
  const handleEdit = (storyboardId: number) => {
    if (onOpenEditor) {
      onOpenEditor(storyboardId);
    }
  };

  // 处理生成按钮点击
  const handleGenerate = async (storyboardId: number) => {
    if (onGenerateFromSketch) {
      onGenerateFromSketch(storyboardId);
    } else {
      await handleGenerateFromSketch(storyboardId);
    }
  };

  // 渲染草图类型标签
  const renderSketchTypeChip = (sketchType?: string) => {
    if (!sketchType) return null;
    const config = SKETCH_TYPE_CONFIGS[sketchType as SketchType];
    if (!config) return null;
    
    return (
      <Chip
        size="sm"
        variant="flat"
        color={SKETCH_TYPE_COLORS[sketchType as SketchType] || 'default'}
        classNames={{
          base: 'h-5',
          content: 'text-[10px] px-1'
        }}
      >
        {config.label}
      </Chip>
    );
  };

  // 渲染空状态
  const renderEmptyState = () => (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="w-20 h-20 rounded-full bg-[var(--bg-app)] flex items-center justify-center mb-4">
        <ImageOff className="w-10 h-10 text-[var(--text-muted)]" />
      </div>
      <h3 className="text-lg font-medium text-[var(--text-secondary)] mb-2">
        {statusFilter === 'with_sketch' ? '暂无草图' : '暂无分镜'}
      </h3>
      <p className="text-sm text-[var(--text-muted)] mb-6 max-w-md">
        {statusFilter === 'with_sketch' 
          ? '当前筛选条件下没有找到有草图的分镜，可以在分镜卡片中添加草图'
          : '当前脚本下没有分镜数据，请先生成分镜'
        }
      </p>
      {statusFilter !== 'all' && (
        <Button
          variant="flat"
          className="bg-[var(--bg-card)] text-[var(--text-secondary)]"
          onPress={() => setStatusFilter('all')}
        >
          查看全部分镜
        </Button>
      )}
    </div>
  );

  // 渲染单个网格卡片
    const renderGridCard = useCallback((storyboard: SketchStoryboard, style?: React.CSSProperties) => (
      <Card
        key={storyboard.id}
        className={`
          bg-[var(--bg-card)] border border-[var(--border-color)] overflow-hidden
          transition-all duration-200 group
          ${selectedIds.has(storyboard.id) ? 'ring-2 ring-[var(--accent)]' : ''}
        `}
        style={style}
      >
        <CardBody className="p-0">
          {/* 缩略图区域 */}
          <div className="relative aspect-video bg-[var(--bg-app)]">
            {storyboard.sketchUrl ? (
              <img
                src={storyboard.sketchUrl}
                alt={`分镜 ${storyboard.order} 草图`}
                className="w-full h-full object-contain"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center">
                <PencilLine className="w-8 h-8 text-[var(--text-muted)] opacity-30" />
              </div>
            )}
  
            {/* 左上角：选择框 + 序号 */}
            <div className="absolute top-2 left-2 flex items-center gap-2">
              <Checkbox
                isSelected={selectedIds.has(storyboard.id)}
                onValueChange={() => toggleSelect(storyboard.id)}
                classNames={{
                  wrapper: 'bg-black/40 backdrop-blur-sm rounded'
                }}
              />
              <span className="px-2 py-0.5 rounded bg-black/60 text-white text-xs font-medium">
                #{storyboard.order}
              </span>
            </div>
  
            {/* 右上角：草图类型标签 */}
            {storyboard.sketchType && (
              <div className="absolute top-2 right-2">
                {renderSketchTypeChip(storyboard.sketchType)}
              </div>
            )}
  
            {/* 悬浮操作栏 */}
            <div className="absolute inset-x-0 bottom-0 p-2 bg-gradient-to-t from-black/80 to-transparent opacity-0 group-hover:opacity-100 transition-opacity">
              <div className="flex justify-center gap-2">
                <Tooltip content="编辑草图">
                  <Button
                    size="sm"
                    isIconOnly
                    variant="flat"
                    className="bg-white/20 text-white hover:bg-white/30 min-w-8 w-8 h-8"
                    onPress={() => handleEdit(storyboard.id)}
                  >
                    <Pencil className="w-4 h-4" />
                  </Button>
                </Tooltip>
                {storyboard.sketchUrl && (
                  <>
                    <Tooltip content="基于草图生成">
                      <Button
                        size="sm"
                        isIconOnly
                        variant="flat"
                        className="bg-emerald-500/30 text-emerald-300 hover:bg-emerald-500/50 min-w-8 w-8 h-8"
                        onPress={() => handleGenerate(storyboard.id)}
                        isLoading={isLoading}
                      >
                        <Wand2 className="w-4 h-4" />
                      </Button>
                    </Tooltip>
                    <Tooltip content="删除草图">
                      <Button
                        size="sm"
                        isIconOnly
                        variant="flat"
                        className="bg-red-500/30 text-red-300 hover:bg-red-500/50 min-w-8 w-8 h-8"
                        onPress={() => handleDeleteSketch(storyboard.id)}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </Tooltip>
                  </>
                )}
              </div>
            </div>
          </div>
  
          {/* 描述区域 */}
          <div className="p-3">
            <p className="text-xs text-[var(--text-muted)] line-clamp-2 min-h-[2.5rem]">
              {storyboard.description || '暂无描述'}
            </p>
            {storyboard.controlStrength !== undefined && storyboard.sketchUrl && (
              <div className="mt-2 flex items-center gap-1">
                <span className="text-[10px] text-[var(--text-muted)]">控制强度:</span>
                <span className="text-[10px] text-[var(--text-secondary)] font-medium">
                  {Math.round(storyboard.controlStrength * 100)}%
                </span>
              </div>
            )}
          </div>
        </CardBody>
      </Card>
    ), [selectedIds, toggleSelect, handleEdit, handleGenerate, handleDeleteSketch, isLoading, renderSketchTypeChip]);
  
    // 渲染网格视图（普通模式）
    const renderNormalGridView = () => (
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 p-4">
        {filteredStoryboards.map((storyboard) => renderGridCard(storyboard))}
      </div>
    );
  
    // 渲染网格视图（虚拟滚动模式）
    const renderVirtualGridView = () => (
      <div 
        {...virtualGrid.containerProps}
        style={{
          ...virtualGrid.containerProps.style,
          height: '100%',
        }}
      >
        <div {...virtualGrid.wrapperProps}>
          <div 
            className="grid gap-4 p-4"
            style={{
              gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
              position: 'relative',
            }}
          >
            {virtualGrid.virtualItems.map(({ index, row, col, offsetTop }) => {
              const storyboard = filteredStoryboards[index];
              if (!storyboard) return null;
              
              return (
                <div
                  key={storyboard.id}
                  style={{
                    position: 'absolute',
                    top: offsetTop + GAP, // 加上顶部 padding
                    left: `calc(${(col / columns) * 100}% + ${GAP}px)`,
                    width: `calc(${100 / columns}% - ${GAP + GAP / columns}px)`,
                    height: ROW_HEIGHT - GAP,
                  }}
                >
                  {renderGridCard(storyboard)}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    );
  
    // 渲染网格视图
  const renderGridView = () => (
    enableVirtualGrid ? renderVirtualGridView() : renderNormalGridView()
  );

  // 渲染列表视图
  const renderListView = () => (
    <div className="p-4 overflow-x-auto">
      <Table
        aria-label="草图管理列表"
        selectionMode="multiple"
        selectedKeys={selectedIds}
        onSelectionChange={(keys) => {
          if (keys === 'all') {
            selectAll();
          } else {
            const newSet = new Set<number>();
            (keys as Set<React.Key>).forEach(k => newSet.add(Number(k)));
            // 直接更新选择状态
            filteredStoryboards.forEach(s => {
              if (newSet.has(s.id) && !selectedIds.has(s.id)) {
                toggleSelect(s.id);
              } else if (!newSet.has(s.id) && selectedIds.has(s.id)) {
                toggleSelect(s.id);
              }
            });
          }
        }}
        classNames={{
          wrapper: 'bg-[var(--bg-card)] border border-[var(--border-color)] rounded-lg',
          th: 'bg-[var(--bg-app)] text-[var(--text-muted)] text-xs',
          td: 'text-sm'
        }}
      >
        <TableHeader>
          <TableColumn width={80}>缩略图</TableColumn>
          <TableColumn width={60}>序号</TableColumn>
          <TableColumn width={100}>草图类型</TableColumn>
          <TableColumn width={100}>控制强度</TableColumn>
          <TableColumn>描述</TableColumn>
          <TableColumn width={150}>操作</TableColumn>
        </TableHeader>
        <TableBody emptyContent="暂无数据">
          {filteredStoryboards.map((storyboard) => (
            <TableRow key={storyboard.id}>
              <TableCell>
                <div className="w-16 h-10 rounded overflow-hidden bg-[var(--bg-app)]">
                  {storyboard.sketchUrl ? (
                    <img
                      src={storyboard.sketchUrl}
                      alt={`分镜 ${storyboard.order}`}
                      className="w-full h-full object-contain"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <PencilLine className="w-4 h-4 text-[var(--text-muted)] opacity-30" />
                    </div>
                  )}
                </div>
              </TableCell>
              <TableCell>
                <span className="font-medium text-[var(--text-primary)]">#{storyboard.order}</span>
              </TableCell>
              <TableCell>
                {storyboard.sketchUrl ? renderSketchTypeChip(storyboard.sketchType) : (
                  <span className="text-[var(--text-muted)]">-</span>
                )}
              </TableCell>
              <TableCell>
                {storyboard.sketchUrl && storyboard.controlStrength !== undefined ? (
                  <span className="text-[var(--text-secondary)]">
                    {Math.round(storyboard.controlStrength * 100)}%
                  </span>
                ) : (
                  <span className="text-[var(--text-muted)]">-</span>
                )}
              </TableCell>
              <TableCell>
                <p className="text-[var(--text-muted)] line-clamp-1 max-w-[200px] lg:max-w-xs">
                  {storyboard.description || '暂无描述'}
                </p>
              </TableCell>
              <TableCell>
                <div className="flex items-center gap-1">
                  <Tooltip content="编辑草图">
                    <Button
                      size="sm"
                      isIconOnly
                      variant="flat"
                      className="bg-[var(--bg-app)] text-[var(--text-secondary)] min-w-7 w-7 h-7"
                      onPress={() => handleEdit(storyboard.id)}
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </Button>
                  </Tooltip>
                  {storyboard.sketchUrl && (
                    <>
                      <Tooltip content="基于草图生成">
                        <Button
                          size="sm"
                          isIconOnly
                          variant="flat"
                          className="bg-emerald-500/10 text-emerald-400 min-w-7 w-7 h-7"
                          onPress={() => handleGenerate(storyboard.id)}
                        >
                          <Wand2 className="w-3.5 h-3.5" />
                        </Button>
                      </Tooltip>
                      <Tooltip content="删除草图">
                        <Button
                          size="sm"
                          isIconOnly
                          variant="flat"
                          className="bg-red-500/10 text-red-400 min-w-7 w-7 h-7"
                          onPress={() => handleDeleteSketch(storyboard.id)}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </Tooltip>
                    </>
                  )}
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );

  return (
    <div className="flex flex-col h-full bg-[var(--bg-app)]">
      {/* 工具栏 */}
      <div className="flex-shrink-0 p-4 border-b border-[var(--border-color)] bg-[var(--bg-card)]">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          {/* 左侧：筛选器 */}
          <div className="flex items-center gap-3">
            {/* 状态筛选 */}
            <Select
              size="sm"
              aria-label="状态筛选"
              selectedKeys={[statusFilter]}
              onChange={(e) => setStatusFilter(e.target.value as SketchStatusFilter)}
              className="w-32"
              classNames={{
                trigger: 'h-8 min-h-8 bg-[var(--bg-app)] border-[var(--border-color)]',
                value: 'text-xs'
              }}
            >
              <SelectItem key="all">全部 ({totalCount})</SelectItem>
              <SelectItem key="with_sketch">有草图 ({withSketchCount})</SelectItem>
              <SelectItem key="without_sketch">无草图 ({withoutSketchCount})</SelectItem>
            </Select>

            {/* 类型筛选 */}
            <Select
              size="sm"
              aria-label="类型筛选"
              selectedKeys={[typeFilter]}
              onChange={(e) => setTypeFilter(e.target.value as SketchType | 'all')}
              className="w-32"
              classNames={{
                trigger: 'h-8 min-h-8 bg-[var(--bg-app)] border-[var(--border-color)]',
                value: 'text-xs'
              }}
            >
              <SelectItem key="all">全部类型</SelectItem>
              <SelectItem key="stick_figure">火柴人草稿</SelectItem>
              <SelectItem key="storyboard_sketch">分镜草图</SelectItem>
              <SelectItem key="detailed_lineart">精细线稿</SelectItem>
            </Select>

            {/* 视图切换 */}
            <ButtonGroup size="sm">
              <Button
                isIconOnly
                variant={viewMode === 'grid' ? 'solid' : 'flat'}
                className={viewMode === 'grid' 
                  ? 'bg-[var(--accent)] text-white' 
                  : 'bg-[var(--bg-app)] text-[var(--text-secondary)]'
                }
                onPress={() => setViewMode('grid')}
              >
                <Grid className="w-4 h-4" />
              </Button>
              <Button
                isIconOnly
                variant={viewMode === 'list' ? 'solid' : 'flat'}
                className={viewMode === 'list' 
                  ? 'bg-[var(--accent)] text-white' 
                  : 'bg-[var(--bg-app)] text-[var(--text-secondary)]'
                }
                onPress={() => setViewMode('list')}
              >
                <List className="w-4 h-4" />
              </Button>
            </ButtonGroup>
          </div>

          {/* 右侧：批量操作 */}
          {hasSelection ? (
            <div className="flex items-center gap-2">
              <span className="text-xs text-[var(--text-muted)]">
                已选择 {selectedCount} 项
                {selectedWithSketchCount > 0 && ` (${selectedWithSketchCount} 个有草图)`}
              </span>
              <Button
                size="sm"
                variant="flat"
                className="bg-emerald-500/10 text-emerald-400 h-8"
                startContent={<Wand2 className="w-3.5 h-3.5" />}
                onPress={() => batchGenerate()}
                isLoading={isBatchGenerating}
                isDisabled={selectedWithSketchCount === 0 || isBatchGenerating}
              >
                批量生成
              </Button>
              <Button
                size="sm"
                variant="flat"
                className="bg-red-500/10 text-red-400 h-8"
                startContent={<Trash2 className="w-3.5 h-3.5" />}
                onPress={batchDelete}
                isLoading={isBatchDeleting}
                isDisabled={selectedWithSketchCount === 0 || isBatchDeleting}
              >
                批量删除
              </Button>
              <Button
                size="sm"
                variant="flat"
                className="bg-[var(--bg-app)] text-[var(--text-muted)] h-8"
                onPress={clearSelection}
              >
                取消选择
              </Button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant="flat"
                className="bg-[var(--bg-app)] text-[var(--text-secondary)] h-8"
                onPress={selectAll}
                isDisabled={filteredStoryboards.length === 0}
              >
                {isAllSelected ? '取消全选' : '全选'}
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* 内容区域 */}
      <div ref={gridContainerRef} className="flex-1 overflow-auto">
        {filteredStoryboards.length === 0 ? (
          renderEmptyState()
        ) : viewMode === 'grid' ? (
          renderGridView()
        ) : (
          renderListView()
        )}
      </div>
    </div>
  );
};

export default SketchManager;
