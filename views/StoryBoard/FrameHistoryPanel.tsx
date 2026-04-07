import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { History, Clock, RotateCcw, Trash2, Check, Image } from 'lucide-react';
import { getAuthToken } from '../../services/auth';
import { useVirtualList } from '../../hooks/useVirtualList';

interface FrameVersion {
  id: number;
  storyboard_id: number;
  frame_type: 'first' | 'last';
  frame_url: string;
  generation_prompt?: string;
  version_number: number;
  is_current: boolean;
  created_at: string;
  created_by_name?: string;
}

interface FrameHistoryPanelProps {
  storyboardId: number;
  frameType: 'first' | 'last';
  isOpen: boolean;
  onClose: () => void;
  onRestoreVersion: (versionId: number) => void;
}

const FrameHistoryPanel: React.FC<FrameHistoryPanelProps> = ({
  storyboardId,
  frameType,
  isOpen,
  onClose,
  onRestoreVersion
}) => {
  const [versions, setVersions] = useState<FrameVersion[]>([]);
  const [loading, setLoading] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const [listHeight, setListHeight] = useState(300);

  // 帧历史项固定高度：缩略图(aspect-video ~144px for w-64) + 信息区域 + 操作按钮
  const FRAME_ITEM_HEIGHT = 220;

  // 测量列表容器高度
  useEffect(() => {
    if (!listRef.current) return;
    const observer = new ResizeObserver(entries => {
      for (const entry of entries) {
        setListHeight(entry.contentRect.height);
      }
    });
    observer.observe(listRef.current);
    return () => observer.disconnect();
  }, [isOpen]);

  const { virtualItems, containerProps, wrapperProps } = useVirtualList({
    itemCount: versions.length,
    itemHeight: FRAME_ITEM_HEIGHT,
    containerHeight: listHeight,
    overscan: 5,
  });

  useEffect(() => {
    if (isOpen && storyboardId) {
      loadHistory();
    }
  }, [isOpen, storyboardId, frameType]);

  const loadHistory = async () => {
    setLoading(true);
    try {
      const token = getAuthToken();
      const res = await fetch(`/api/storyboards/${storyboardId}/frame-history?frameType=${frameType}`, {
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        }
      });
      if (res.ok) {
        const data = await res.json();
        setVersions(data.history[frameType] || []);
      }
    } catch (error) {
      console.error('[FrameHistoryPanel] 加载历史失败:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleRestore = async (versionId: number) => {
    try {
      const token = getAuthToken();
      const res = await fetch(`/api/storyboards/${storyboardId}/frame-history/${versionId}/restore`, {
        method: 'PUT',
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        }
      });
      if (res.ok) {
        await loadHistory();
        onRestoreVersion(versionId);
      }
    } catch (error) {
      console.error('[FrameHistoryPanel] 恢复版本失败:', error);
    }
  };

  const handleDelete = async (versionId: number) => {
    if (!confirm('确定要删除这个历史版本吗？')) return;
    
    try {
      const token = getAuthToken();
      const res = await fetch(`/api/storyboards/${storyboardId}/frame-history/${versionId}`, {
        method: 'DELETE',
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        }
      });
      if (res.ok) {
        await loadHistory();
      }
    } catch (error) {
      console.error('[FrameHistoryPanel] 删除版本失败:', error);
    }
  };

  const formatTime = (dateStr: string) => {
    const d = new Date(dateStr);
    const now = new Date();
    const diff = now.getTime() - d.getTime();
    if (diff < 60000) return '刚刚';
    if (diff < 3600000) return `${Math.floor(diff / 60000)} 分钟前`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)} 小时前`;
    return d.toLocaleDateString('zh-CN');
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: 20 }}
          className="absolute top-0 left-0 w-64 h-full bg-(--bg-card) border-r border-(--border-color) shadow-lg z-10 overflow-hidden"
        >
          {/* 头部 */}
          <div className="flex items-center justify-between px-3 py-2 border-b border-(--border-color)">
            <div className="flex items-center gap-2">
              <History className="w-4 h-4 text-(--accent)" />
              <span className="text-xs font-semibold">
                {frameType === 'first' ? '首帧' : '尾帧'}历史
              </span>
            </div>
            <button onClick={onClose} className="p-1 hover:bg-(--bg-input) rounded">
              <span className="text-xs">×</span>
            </button>
          </div>

          {/* 版本列表 - 使用虚拟列表优化大量帧历史的渲染性能 */}
          <div ref={listRef} className="flex-1 overflow-hidden">
            {loading ? (
              <div className="text-center py-8 text-(--text-muted)">
                <Clock className="w-6 h-6 mx-auto mb-2 animate-spin" />
                <p className="text-xs">加载中...</p>
              </div>
            ) : versions.length === 0 ? (
              <div className="text-center py-8 text-(--text-muted)">
                <Image className="w-8 h-8 mx-auto mb-2 opacity-30" />
                <p className="text-xs">暂无历史版本</p>
              </div>
            ) : (
              <div {...containerProps} className="p-2" style={{ ...containerProps.style, overflow: 'auto' }}>
                <div {...wrapperProps}>
                  {virtualItems.map(({ index, offsetTop }) => {
                    const version = versions[index];
                    return (
                      <div
                        key={version.id}
                        style={{
                          position: 'absolute',
                          top: offsetTop,
                          left: 8,
                          right: 8,
                          height: FRAME_ITEM_HEIGHT - 8,
                        }}
                      >
                        <div
                          className={`h-full rounded-lg overflow-hidden border ${
                            version.is_current
                              ? 'border-(--accent) bg-(--accent)/5'
                              : 'border-(--border-color) bg-(--bg-input)'
                          }`}
                        >
                          {/* 缩略图 */}
                          <div className="h-30 bg-(--bg-app) relative group">
                            <img
                              src={version.frame_url}
                              alt={`版本 ${version.version_number}`}
                              className="w-full h-full object-cover"
                            />
                            {version.is_current && (
                              <div className="absolute top-1 right-1 bg-(--accent) text-white text-[10px] px-1.5 py-0.5 rounded flex items-center gap-1">
                                <Check className="w-3 h-3" />
                                当前
                              </div>
                            )}
                          </div>

                          {/* 信息 */}
                          <div className="p-2">
                            <div className="flex items-center justify-between mb-1">
                              <span className="text-xs font-medium">版本 {version.version_number}</span>
                              <span className="text-[10px] text-(--text-muted)">
                                {formatTime(version.created_at)}
                              </span>
                            </div>
                            {version.generation_prompt && (
                              <p className="text-[10px] text-(--text-muted) line-clamp-1 mb-1">
                                {version.generation_prompt.substring(0, 60)}...
                              </p>
                            )}
                            
                            {/* 操作按钮 */}
                            <div className="flex items-center gap-1">
                              {!version.is_current && (
                                <button
                                  onClick={() => handleRestore(version.id)}
                                  className="flex-1 px-2 py-1 bg-(--accent)/10 text-(--accent) text-[10px] rounded hover:bg-(--accent)/20 flex items-center justify-center gap-1"
                                  title="恢复此版本"
                                >
                                  <RotateCcw className="w-3 h-3" />
                                  恢复
                                </button>
                              )}
                              {!version.is_current && (
                                <button
                                  onClick={() => handleDelete(version.id)}
                                  className="px-2 py-1 bg-red-500/10 text-red-400 text-[10px] rounded hover:bg-red-500/20"
                                  title="删除版本"
                                >
                                  <Trash2 className="w-3 h-3" />
                                </button>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default FrameHistoryPanel;
