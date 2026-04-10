import { useState, useMemo, useCallback } from 'react';
import { useToast } from '../../../../contexts/ToastContext';
import { useConfirm } from '../../../../contexts/ConfirmContext';
import { deleteSketch, generateFromSketch } from '../../../../services/storyboards';
import { SketchType } from '../types/sketch';

// 分镜数据接口（从外部传入）
export interface SketchStoryboard {
  id: number;
  order: number;
  description?: string;
  imageUrl?: string;
  sketchUrl?: string;
  sketchType?: string;
  sketchData?: unknown;
  controlStrength?: number;
}

// 状态筛选类型
export type SketchStatusFilter = 'all' | 'with_sketch' | 'without_sketch';

// 视图模式类型
export type SketchViewMode = 'grid' | 'list';

export interface UseSketchManagerOptions {
  scriptId: number;
  storyboards: SketchStoryboard[];
  onStoryboardUpdate?: (id: number, updates: Partial<SketchStoryboard>) => void;
  onRefresh?: () => void;
}

export interface UseSketchManagerReturn {
  // 过滤后的分镜列表
  filteredStoryboards: SketchStoryboard[];
  // 筛选状态
  typeFilter: SketchType | 'all';
  setTypeFilter: (type: SketchType | 'all') => void;
  statusFilter: SketchStatusFilter;
  setStatusFilter: (status: SketchStatusFilter) => void;
  // 视图模式
  viewMode: SketchViewMode;
  setViewMode: (mode: SketchViewMode) => void;
  // 多选
  selectedIds: Set<number>;
  toggleSelect: (id: number) => void;
  selectAll: () => void;
  clearSelection: () => void;
  isAllSelected: boolean;
  // 批量操作
  batchDelete: () => Promise<void>;
  batchGenerate: (options?: { imageModel?: string }) => Promise<void>;
  // 单项操作
  handleDeleteSketch: (storyboardId: number) => Promise<void>;
  handleGenerateFromSketch: (storyboardId: number) => Promise<void>;
  // 加载状态
  isLoading: boolean;
  isBatchDeleting: boolean;
  isBatchGenerating: boolean;
  // 统计
  totalCount: number;
  withSketchCount: number;
  withoutSketchCount: number;
}

export const useSketchManager = ({
  scriptId,
  storyboards,
  onStoryboardUpdate,
  onRefresh
}: UseSketchManagerOptions): UseSketchManagerReturn => {
  const { showToast } = useToast();
  const { confirm } = useConfirm();

  // 筛选状态
  const [typeFilter, setTypeFilter] = useState<SketchType | 'all'>('all');
  const [statusFilter, setStatusFilter] = useState<SketchStatusFilter>('all');
  
  // 视图模式
  const [viewMode, setViewMode] = useState<SketchViewMode>('grid');
  
  // 多选状态
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  
  // 加载状态
  const [isLoading, setIsLoading] = useState(false);
  const [isBatchDeleting, setIsBatchDeleting] = useState(false);
  const [isBatchGenerating, setIsBatchGenerating] = useState(false);

  // 统计
  const stats = useMemo(() => {
    const withSketch = storyboards.filter(s => !!s.sketchUrl);
    return {
      totalCount: storyboards.length,
      withSketchCount: withSketch.length,
      withoutSketchCount: storyboards.length - withSketch.length
    };
  }, [storyboards]);

  // 过滤后的分镜列表
  const filteredStoryboards = useMemo(() => {
    return storyboards.filter(storyboard => {
      // 状态筛选
      if (statusFilter === 'with_sketch' && !storyboard.sketchUrl) return false;
      if (statusFilter === 'without_sketch' && storyboard.sketchUrl) return false;
      
      // 类型筛选（仅对有草图的分镜生效）
      if (typeFilter !== 'all' && storyboard.sketchUrl) {
        if (storyboard.sketchType !== typeFilter) return false;
      }
      
      return true;
    });
  }, [storyboards, typeFilter, statusFilter]);

  // 是否全选
  const isAllSelected = useMemo(() => {
    if (filteredStoryboards.length === 0) return false;
    return filteredStoryboards.every(s => selectedIds.has(s.id));
  }, [filteredStoryboards, selectedIds]);

  // 切换选择
  const toggleSelect = useCallback((id: number) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  // 全选
  const selectAll = useCallback(() => {
    if (isAllSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredStoryboards.map(s => s.id)));
    }
  }, [isAllSelected, filteredStoryboards]);

  // 清除选择
  const clearSelection = useCallback(() => {
    setSelectedIds(new Set());
  }, []);

  // 单项删除草图
  const handleDeleteSketch = useCallback(async (storyboardId: number) => {
    const confirmed = await confirm({
      title: '删除草图',
      message: '确定要删除该草图吗？此操作不可撤销。',
      type: 'danger',
      confirmText: '删除',
      cancelText: '取消'
    });

    if (!confirmed) return;

    setIsLoading(true);
    try {
      await deleteSketch(storyboardId);
      onStoryboardUpdate?.(storyboardId, {
        sketchUrl: undefined,
        sketchData: undefined,
        sketchType: undefined,
        controlStrength: undefined
      });
      showToast('草图已删除', 'success');
    } catch (error) {
      const message = error instanceof Error ? error.message : '删除失败';
      showToast(message, 'error');
    } finally {
      setIsLoading(false);
    }
  }, [confirm, onStoryboardUpdate, showToast]);

  // 单项基于草图生成
  const handleGenerateFromSketch = useCallback(async (storyboardId: number) => {
    const storyboard = storyboards.find(s => s.id === storyboardId);
    if (!storyboard?.sketchUrl) {
      showToast('该分镜没有草图', 'warning');
      return;
    }

    setIsLoading(true);
    try {
      const result = await generateFromSketch(storyboardId, {
        sketchUrl: storyboard.sketchUrl,
        sketchType: storyboard.sketchType,
        controlStrength: storyboard.controlStrength
      });
      showToast(`草图生成任务已提交，任务ID: ${result.jobId}`, 'success');
    } catch (error) {
      const message = error instanceof Error ? error.message : '生成失败';
      showToast(message, 'error');
    } finally {
      setIsLoading(false);
    }
  }, [storyboards, showToast]);

  // 批量删除
  const batchDelete = useCallback(async () => {
    const selectedStoryboards = storyboards.filter(
      s => selectedIds.has(s.id) && s.sketchUrl
    );

    if (selectedStoryboards.length === 0) {
      showToast('请选择有草图的分镜', 'warning');
      return;
    }

    const confirmed = await confirm({
      title: '批量删除草图',
      message: `确定要删除 ${selectedStoryboards.length} 个分镜的草图吗？此操作不可撤销。`,
      type: 'danger',
      confirmText: '删除',
      cancelText: '取消'
    });

    if (!confirmed) return;

    setIsBatchDeleting(true);
    let successCount = 0;
    let failCount = 0;

    for (const storyboard of selectedStoryboards) {
      try {
        await deleteSketch(storyboard.id);
        onStoryboardUpdate?.(storyboard.id, {
          sketchUrl: undefined,
          sketchData: undefined,
          sketchType: undefined,
          controlStrength: undefined
        });
        successCount++;
      } catch (error) {
        failCount++;
        console.error(`[useSketchManager] 删除草图失败, id=${storyboard.id}:`, error);
      }
    }

    setIsBatchDeleting(false);
    clearSelection();

    if (failCount > 0) {
      showToast(`删除完成: 成功 ${successCount} 个, 失败 ${failCount} 个`, 'warning');
    } else {
      showToast(`成功删除 ${successCount} 个草图`, 'success');
    }
  }, [storyboards, selectedIds, confirm, onStoryboardUpdate, showToast, clearSelection]);

  // 批量生成
  const batchGenerate = useCallback(async (options?: { imageModel?: string }) => {
    const selectedStoryboards = storyboards.filter(
      s => selectedIds.has(s.id) && s.sketchUrl
    );

    if (selectedStoryboards.length === 0) {
      showToast('请选择有草图的分镜', 'warning');
      return;
    }

    const confirmed = await confirm({
      title: '批量生成',
      message: `确定要对 ${selectedStoryboards.length} 个分镜基于草图生成图片吗？`,
      type: 'info',
      confirmText: '开始生成',
      cancelText: '取消'
    });

    if (!confirmed) return;

    setIsBatchGenerating(true);
    let successCount = 0;
    let failCount = 0;

    for (const storyboard of selectedStoryboards) {
      try {
        await generateFromSketch(storyboard.id, {
          sketchUrl: storyboard.sketchUrl,
          sketchType: storyboard.sketchType,
          controlStrength: storyboard.controlStrength
        });
        successCount++;
      } catch (error) {
        failCount++;
        console.error(`[useSketchManager] 生成失败, id=${storyboard.id}:`, error);
      }
    }

    setIsBatchGenerating(false);
    clearSelection();

    if (failCount > 0) {
      showToast(`生成任务提交: 成功 ${successCount} 个, 失败 ${failCount} 个`, 'warning');
    } else {
      showToast(`成功提交 ${successCount} 个生成任务`, 'success');
    }
  }, [storyboards, selectedIds, confirm, showToast, clearSelection]);

  return {
    // 过滤后的分镜列表
    filteredStoryboards,
    // 筛选状态
    typeFilter,
    setTypeFilter,
    statusFilter,
    setStatusFilter,
    // 视图模式
    viewMode,
    setViewMode,
    // 多选
    selectedIds,
    toggleSelect,
    selectAll,
    clearSelection,
    isAllSelected,
    // 批量操作
    batchDelete,
    batchGenerate,
    // 单项操作
    handleDeleteSketch,
    handleGenerateFromSketch,
    // 加载状态
    isLoading,
    isBatchDeleting,
    isBatchGenerating,
    // 统计
    ...stats
  };
};
