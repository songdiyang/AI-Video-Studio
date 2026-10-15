import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Save, Trash2, Loader2 } from 'lucide-react';
import SketchCanvas, { SketchCanvasHandle } from '../MagicSpace/SketchCanvas';
import {
  getSketchFrames,
  saveFirstSketchData,
  saveLastSketchData,
  deleteSketchFrame,
  type SketchFrameInfo,
} from '../../../services/storyboards';
import { useToast } from '../../../contexts/ToastContext';

interface SketchFramesPanelProps {
  storyboardId: number;
}

const SketchFramesPanel: React.FC<SketchFramesPanelProps> = ({ storyboardId }) => {
  const { showToast } = useToast();
  const [firstSketchInfo, setFirstSketchInfo] = useState<SketchFrameInfo | null>(null);
  const [lastSketchInfo, setLastSketchInfo] = useState<SketchFrameInfo | null>(null);
  const [loading, setLoading] = useState(false);
  const [savingFirst, setSavingFirst] = useState(false);
  const [savingLast, setSavingLast] = useState(false);

  const firstCanvasRef = useRef<SketchCanvasHandle>(null);
  const lastCanvasRef = useRef<SketchCanvasHandle>(null);

  // 加载草图数据
  const loadSketchFrames = useCallback(async () => {
    if (!storyboardId) return;

    setLoading(true);
    try {
      const data = await getSketchFrames(storyboardId);
      setFirstSketchInfo(data.first);
      setLastSketchInfo(data.last);
    } catch (error) {
      console.error('[SketchFramesPanel] Failed to load sketch frames:', error);
      showToast('加载草图数据失败', 'error');
    } finally {
      setLoading(false);
    }
  }, [storyboardId]);

  useEffect(() => {
    loadSketchFrames();
  }, [loadSketchFrames]);

  // 保存首帧草图
  const handleSaveFirst = async () => {
    if (!firstCanvasRef.current) return;

    const sketchData = firstCanvasRef.current.getSketchData();
    if (!sketchData || !sketchData.elements?.length) {
      showToast('请先绘制首帧草图', 'warning');
      return;
    }

    setSavingFirst(true);
    try {
      const result = await saveFirstSketchData(storyboardId, sketchData);
      setFirstSketchInfo({
        sketch_data: sketchData,
        version: result.version,
        updated_at: new Date().toISOString(),
      });
      showToast(`首帧草图已保存 (v${result.version})`, 'success');
    } catch (error: any) {
      console.error('[SketchFramesPanel] Failed to save first sketch:', error);
      showToast(error.message || '保存首帧草图失败', 'error');
    } finally {
      setSavingFirst(false);
    }
  };

  // 保存尾帧草图
  const handleSaveLast = async () => {
    if (!lastCanvasRef.current) return;

    const sketchData = lastCanvasRef.current.getSketchData();
    if (!sketchData || !sketchData.elements?.length) {
      showToast('请先绘制尾帧草图', 'warning');
      return;
    }

    setSavingLast(true);
    try {
      const result = await saveLastSketchData(storyboardId, sketchData);
      setLastSketchInfo({
        sketch_data: sketchData,
        version: result.version,
        updated_at: new Date().toISOString(),
      });
      showToast(`尾帧草图已保存 (v${result.version})`, 'success');
    } catch (error: any) {
      console.error('[SketchFramesPanel] Failed to save last sketch:', error);
      showToast(error.message || '保存尾帧草图失败', 'error');
    } finally {
      setSavingLast(false);
    }
  };

  // 删除首帧草图
  const handleDeleteFirst = async () => {
    if (!confirm('确定要删除首帧草图吗？此操作不可恢复。')) return;

    try {
      await deleteSketchFrame(storyboardId, 'first');
      setFirstSketchInfo(null);
      firstCanvasRef.current?.resetCanvas();
      showToast('首帧草图已删除', 'success');
    } catch (error: any) {
      console.error('[SketchFramesPanel] Failed to delete first sketch:', error);
      showToast(error.message || '删除首帧草图失败', 'error');
    }
  };

  // 删除尾帧草图
  const handleDeleteLast = async () => {
    if (!confirm('确定要删除尾帧草图吗？此操作不可恢复。')) return;

    try {
      await deleteSketchFrame(storyboardId, 'last');
      setLastSketchInfo(null);
      lastCanvasRef.current?.resetCanvas();
      showToast('尾帧草图已删除', 'success');
    } catch (error: any) {
      console.error('[SketchFramesPanel] Failed to delete last sketch:', error);
      showToast(error.message || '删除尾帧草图失败', 'error');
    }
  };

  // 格式化时间
  const formatTime = (timeStr: string | null) => {
    if (!timeStr) return '';
    const date = new Date(timeStr);
    return date.toLocaleString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-6 h-6 text-[var(--accent)] animate-spin" />
        <span className="ml-2 text-sm text-[var(--text-muted)]">加载草图数据...</span>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 h-full">
      {/* 首帧草图 */}
      <div className="flex-1 flex flex-col min-h-0 border border-[var(--border-color)] rounded-lg overflow-hidden">
        <div className="flex items-center justify-between px-3 py-2 bg-[var(--bg-secondary)] border-b border-[var(--border-color)]">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-[var(--text-primary)]">首帧草图</span>
            {firstSketchInfo && (
              <>
                <span className="text-xs text-[var(--text-muted)]">v{firstSketchInfo.version}</span>
                <span className="text-xs text-[var(--text-muted)]">
                  {formatTime(firstSketchInfo.updated_at)}
                </span>
              </>
            )}
          </div>
          <div className="flex items-center gap-1.5">
            <button
              onClick={handleSaveFirst}
              disabled={savingFirst}
              className="flex items-center gap-1 px-2 py-1 rounded-md bg-green-500/10 text-green-600 text-xs hover:bg-green-500/20 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {savingFirst ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Save className="w-3.5 h-3.5" />
              )}
              保存
            </button>
            {firstSketchInfo && (
              <button
                onClick={handleDeleteFirst}
                className="flex items-center gap-1 px-2 py-1 rounded-md bg-red-500/10 text-red-600 text-xs hover:bg-red-500/20 transition-colors"
              >
                <Trash2 className="w-3.5 h-3.5" />
                删除
              </button>
            )}
          </div>
        </div>
        <div className="flex-1 min-h-0 relative">
          <SketchCanvas
            ref={firstCanvasRef}
            initialData={firstSketchInfo?.sketch_data}
          />
        </div>
      </div>

      {/* 尾帧草图 */}
      <div className="flex-1 flex flex-col min-h-0 border border-[var(--border-color)] rounded-lg overflow-hidden">
        <div className="flex items-center justify-between px-3 py-2 bg-[var(--bg-secondary)] border-b border-[var(--border-color)]">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-[var(--text-primary)]">尾帧草图</span>
            {lastSketchInfo && (
              <>
                <span className="text-xs text-[var(--text-muted)]">v{lastSketchInfo.version}</span>
                <span className="text-xs text-[var(--text-muted)]">
                  {formatTime(lastSketchInfo.updated_at)}
                </span>
              </>
            )}
          </div>
          <div className="flex items-center gap-1.5">
            <button
              onClick={handleSaveLast}
              disabled={savingLast}
              className="flex items-center gap-1 px-2 py-1 rounded-md bg-green-500/10 text-green-600 text-xs hover:bg-green-500/20 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {savingLast ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Save className="w-3.5 h-3.5" />
              )}
              保存
            </button>
            {lastSketchInfo && (
              <button
                onClick={handleDeleteLast}
                className="flex items-center gap-1 px-2 py-1 rounded-md bg-red-500/10 text-red-600 text-xs hover:bg-red-500/20 transition-colors"
              >
                <Trash2 className="w-3.5 h-3.5" />
                删除
              </button>
            )}
          </div>
        </div>
        <div className="flex-1 min-h-0 relative">
          <SketchCanvas
            ref={lastCanvasRef}
            initialData={lastSketchInfo?.sketch_data}
          />
        </div>
      </div>
    </div>
  );
};

export default SketchFramesPanel;
