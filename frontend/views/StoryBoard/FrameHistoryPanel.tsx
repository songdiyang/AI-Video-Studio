import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { History, Clock, Trash2, Check, Image, Film, X } from 'lucide-react';
import { getAuthToken } from '../../services/auth';
import { useConfirm } from '../../contexts/ConfirmContext';

interface VersionGroup {
  batchId: string | null;
  versionNumber: number;
  firstFrame: { id: number; frame_url: string; version_number: number } | null;
  lastFrame: { id: number; frame_url: string; version_number: number } | null;
  videoUrl: string | null;
  isCurrent: boolean;
  createdAt: string;
  prompt: string;
}

interface FrameHistoryPanelProps {
  storyboardId: number;
  isOpen: boolean;
  onClose: () => void;
  onRestoreVersion: (data: {
    firstFrameUrl?: string;
    lastFrameUrl?: string;
    videoUrl?: string | null;
  }) => void;
}

const FrameHistoryPanel: React.FC<FrameHistoryPanelProps> = ({
  storyboardId,
  isOpen,
  onClose,
  onRestoreVersion
}) => {
  const { confirm } = useConfirm();
  const [versions, setVersions] = useState<VersionGroup[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (isOpen && storyboardId) {
      loadHistory();
    }
  }, [isOpen, storyboardId]);

  const loadHistory = async () => {
    setLoading(true);
    try {
      const token = getAuthToken();
      const res = await fetch(`/api/storyboards/${storyboardId}/frame-history`, {
        headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) }
      });
      if (res.ok) {
        const data = await res.json();
        setVersions(data.versions || []);
      }
    } catch (error) {
      console.error('[FrameHistoryPanel] 加载历史失败:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleRestore = async (version: VersionGroup) => {
    if (version.isCurrent) return;

    try {
      const token = getAuthToken();
      const body: Record<string, unknown> = {};
      if (version.batchId) {
        body.batchId = version.batchId;
      } else {
        // 老数据，使用 firstFrame 的 id
        body.historyId = version.firstFrame?.id || version.lastFrame?.id;
      }

      const res = await fetch(`/api/storyboards/${storyboardId}/frame-history/restore`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        },
        body: JSON.stringify(body)
      });

      if (res.ok) {
        const result = await res.json();
        await loadHistory();
        onRestoreVersion({
          firstFrameUrl: result.restoredFirstFrame || version.firstFrame?.frame_url,
          lastFrameUrl: result.restoredLastFrame || version.lastFrame?.frame_url,
          videoUrl: result.restoredVideoUrl !== undefined ? result.restoredVideoUrl : version.videoUrl
        });
      }
    } catch (error) {
      console.error('[FrameHistoryPanel] 恢复版本失败:', error);
    }
  };

  const handleDelete = async (version: VersionGroup) => {
    const confirmed = await confirm({
      title: '删除历史版本',
      message: '确定要删除这个历史版本吗？删除后将无法恢复。',
      confirmText: '删除',
      cancelText: '取消',
      type: 'danger'
    });

    if (!confirmed) return;

    try {
      const token = getAuthToken();
      const body: Record<string, unknown> = {};
      if (version.batchId) {
        body.batchId = version.batchId;
      } else {
        body.historyId = version.firstFrame?.id || version.lastFrame?.id;
      }

      const res = await fetch(`/api/storyboards/${storyboardId}/frame-history`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        },
        body: JSON.stringify(body)
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
          className="absolute top-0 left-0 w-80 h-full bg-(--bg-card) border-r border-(--border-color) shadow-lg z-10 flex flex-col overflow-hidden"
        >
          {/* 头部 */}
          <div className="flex items-center justify-between px-3 py-2 border-b border-(--border-color) shrink-0">
            <div className="flex items-center gap-2">
              <History className="w-4 h-4 text-(--accent)" />
              <span className="text-xs font-semibold">历史版本</span>
              {versions.length > 0 && (
                <span className="text-[10px] text-(--text-muted)">({versions.length})</span>
              )}
            </div>
            <button onClick={onClose} className="p-1 hover:bg-(--bg-input) rounded">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* 版本列表 */}
          <div className="flex-1 overflow-y-auto min-h-0">
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
              <div className="p-2 space-y-2">
                {versions.map((version, idx) => {
                  const isCurrent = version.isCurrent;
                  const key = version.batchId || `v${version.versionNumber}-${idx}`;

                  return (
                    <div
                      key={key}
                      className={`rounded-lg overflow-hidden border transition-all duration-200 ${
                        isCurrent
                          ? 'border-(--accent) bg-(--accent)/5 ring-1 ring-(--accent)'
                          : 'border-(--border-color) bg-(--bg-input) hover:border-(--accent)/50 cursor-pointer'
                      }`}
                      onClick={() => !isCurrent && handleRestore(version)}
                      title={isCurrent ? '当前版本' : '点击使用此版本'}
                    >
                      {/* 首尾帧缩略图并排 */}
                      <div className="flex gap-0.5 bg-(--bg-app) relative group">
                        {/* 首帧 */}
                        <div className="flex-1 h-24 relative">
                          {version.firstFrame ? (
                            <img
                              src={version.firstFrame.frame_url}
                              alt="首帧"
                              className="w-full h-full object-cover"
                              draggable={false}
                            />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center bg-(--bg-input)">
                              <Image className="w-5 h-5 opacity-20" />
                            </div>
                          )}
                          <span className="absolute bottom-0.5 left-0.5 text-[9px] bg-black/60 text-white px-1 rounded">
                            首帧
                          </span>
                        </div>
                        {/* 尾帧 */}
                        <div className="flex-1 h-24 relative">
                          {version.lastFrame ? (
                            <img
                              src={version.lastFrame.frame_url}
                              alt="尾帧"
                              className="w-full h-full object-cover"
                              draggable={false}
                            />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center bg-(--bg-input)">
                              <Image className="w-5 h-5 opacity-20" />
                            </div>
                          )}
                          <span className="absolute bottom-0.5 left-0.5 text-[9px] bg-black/60 text-white px-1 rounded">
                            尾帧
                          </span>
                        </div>

                        {/* 当前版本标识 */}
                        {isCurrent && (
                          <div className="absolute top-1 right-1 bg-(--accent) text-white text-[10px] px-1.5 py-0.5 rounded flex items-center gap-0.5">
                            <Check className="w-3 h-3" />
                            当前
                          </div>
                        )}

                        {/* 悬停恢复提示 */}
                        {!isCurrent && (
                          <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors flex items-center justify-center opacity-0 group-hover:opacity-100 pointer-events-none">
                            <span className="text-white text-xs font-medium px-2 py-1 bg-black/50 rounded">
                              点击使用此版本
                            </span>
                          </div>
                        )}
                      </div>

                      {/* 视频标识 */}
                      {version.videoUrl && (
                        <div className="px-2 py-1 flex items-center gap-1.5 border-t border-(--border-color)/50">
                          <Film className="w-3 h-3 text-rose-400" />
                          <span className="text-[10px] text-rose-400 font-medium">含视频</span>
                        </div>
                      )}

                      {/* 信息 */}
                      <div className="p-2">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-xs font-medium">版本 {version.versionNumber}</span>
                          <span className="text-[10px] text-(--text-muted)">
                            {formatTime(version.createdAt)}
                          </span>
                        </div>
                        {version.prompt && (
                          <p className="text-[10px] text-(--text-muted) line-clamp-1 mb-1">
                            {version.prompt.substring(0, 60)}...
                          </p>
                        )}

                        {/* 删除按钮 - 仅非当前版本 */}
                        {!isCurrent && (
                          <div className="flex items-center justify-end">
                            <button
                              onClick={(e) => { e.stopPropagation(); handleDelete(version); }}
                              className="px-2 py-1 bg-red-500/10 text-red-400 text-[10px] rounded hover:bg-red-500/20"
                              title="删除版本"
                            >
                              <Trash2 className="w-3 h-3" />
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default FrameHistoryPanel;
