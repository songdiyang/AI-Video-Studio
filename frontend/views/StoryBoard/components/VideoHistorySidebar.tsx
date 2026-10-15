import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { History, Film, Image, ChevronLeft, ChevronRight, Check, Loader2, RefreshCw } from 'lucide-react';
import { getAuthToken } from '../../../services/auth';
import { useToast } from '../../../contexts/ToastContext';
import { bustCache } from '../../../services/mediaCache';

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

interface VideoHistorySidebarProps {
  storyboardId: number;
  currentVideoUrl: string | undefined;
  firstFrameUrl: string | undefined;
  lastFrameUrl: string | undefined;
  isOpen: boolean;
  onToggle: () => void;
  onSwitchVersion: (data: { videoUrl?: string | null; firstFrameUrl?: string; lastFrameUrl?: string }) => void;
}

const VideoHistorySidebar: React.FC<VideoHistorySidebarProps> = ({
  storyboardId,
  currentVideoUrl,
  firstFrameUrl,
  lastFrameUrl,
  isOpen,
  onToggle,
  onSwitchVersion
}) => {
  const [versions, setVersions] = useState<VersionGroup[]>([]);
  const [loading, setLoading] = useState(false);
  const [switchingId, setSwitchingId] = useState<string | null>(null);
  const { showToast } = useToast();

  const loadHistory = useCallback(async () => {
    setLoading(true);
    try {
      const token = getAuthToken();
      const res = await fetch(`/api/storyboards/${storyboardId}/frame-history`, {
        headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) }
      });
      if (res.ok) {
        const data = await res.json();
        // 只保留有视频的版本
        const videoOnly = (data.versions || []).filter((v: VersionGroup) => v.videoUrl);
        setVersions(videoOnly);
      }
    } catch (error) {
      console.error('[VideoHistorySidebar] 加载历史失败:', error);
    } finally {
      setLoading(false);
    }
  }, [storyboardId]);

  useEffect(() => {
    if (isOpen && storyboardId) {
      loadHistory();
    }
  }, [isOpen, storyboardId, loadHistory]);

  const handleSwitchVersion = async (version: VersionGroup) => {
    if (version.isCurrent) return;
    const key = version.batchId || `v${version.versionNumber}`;
    setSwitchingId(key);
    try {
      const token = getAuthToken();
      const body: Record<string, unknown> = {};
      if (version.batchId) {
        body.batchId = version.batchId;
      } else {
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
        onSwitchVersion({
          videoUrl: result.restoredVideoUrl !== undefined ? result.restoredVideoUrl : version.videoUrl,
          firstFrameUrl: result.restoredFirstFrame || version.firstFrame?.frame_url,
          lastFrameUrl: result.restoredLastFrame || version.lastFrame?.frame_url
        });
        showToast('已切换到该视频版本', 'success');
      }
    } catch (error) {
      console.error('[VideoHistorySidebar] 切换版本失败:', error);
      showToast('切换视频版本失败', 'error');
    } finally {
      setSwitchingId(null);
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

  // 查找当前版本对应的 videoUrl，用于高亮
  const currentBatchId = versions.find(v => v.isCurrent)?.batchId;

  return (
    <AnimatePresence>
      {isOpen && (
          <motion.div
            initial={{ opacity: 0, x: -20, width: 0 }}
            animate={{ opacity: 1, x: 0, width: 260 }}
            exit={{ opacity: 0, x: -20, width: 0 }}
            transition={{ duration: 0.2 }}
            className="flex-shrink-0 h-full bg-black/40 backdrop-blur-sm border-r border-white/10 flex flex-col overflow-hidden"
          >
            {/* 头部 */}
            <div className="flex items-center justify-between px-3 py-2 border-b border-white/10 shrink-0">
              <div className="flex items-center gap-2">
                <History className="w-3.5 h-3.5 text-rose-400" />
                <span className="text-xs font-semibold text-white/90">视频历史</span>
                {versions.length > 0 && (
                  <span className="text-[10px] text-white/50">({versions.length})</span>
                )}
              </div>
              <div className="flex items-center gap-1">
                <button
                  onClick={loadHistory}
                  disabled={loading}
                  className="p-1 hover:bg-white/10 rounded transition-colors"
                  title="刷新"
                >
                  <RefreshCw className={`w-3 h-3 text-white/60 ${loading ? 'animate-spin' : ''}`} />
                </button>
                <button onClick={onToggle} className="p-1 hover:bg-white/10 rounded transition-colors">
                  <ChevronLeft className="w-3.5 h-3.5 text-white/60" />
                </button>
              </div>
            </div>

            {/* 当前帧缩略图 */}
            <div className="p-2 border-b border-white/10 shrink-0">
              <span className="text-[10px] text-white/50 mb-1.5 block">当前首尾帧</span>
              <div className="flex gap-1.5">
                <div className="flex-1 h-20 rounded overflow-hidden bg-white/5 relative">
                  {firstFrameUrl ? (
                    <img
                      src={bustCache(firstFrameUrl) || firstFrameUrl}
                      alt="首帧"
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <Image className="w-5 h-5 text-white/15" />
                    </div>
                  )}
                  <span className="absolute bottom-0.5 left-0.5 text-[9px] bg-black/60 text-white/70 px-1 rounded">
                    首帧
                  </span>
                </div>
                <div className="flex-1 h-20 rounded overflow-hidden bg-white/5 relative">
                  {lastFrameUrl ? (
                    <img
                      src={bustCache(lastFrameUrl) || lastFrameUrl}
                      alt="尾帧"
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <Image className="w-5 h-5 text-white/15" />
                    </div>
                  )}
                  <span className="absolute bottom-0.5 left-0.5 text-[9px] bg-black/60 text-white/70 px-1 rounded">
                    尾帧
                  </span>
                </div>
              </div>
              {/* 当前视频标识 */}
              {currentVideoUrl && (
                <div className="flex items-center gap-1.5 mt-1.5 text-[10px] text-rose-400/70">
                  <Film className="w-3 h-3" />
                  <span className="truncate">当前视频</span>
                </div>
              )}
            </div>

            {/* 版本列表 */}
            <div className="flex-1 overflow-y-auto min-h-0">
              {loading ? (
                <div className="text-center py-8">
                  <Loader2 className="w-5 h-5 mx-auto mb-2 text-white/40 animate-spin" />
                  <p className="text-xs text-white/40">加载中...</p>
                </div>
              ) : versions.length === 0 ? (
                <div className="text-center py-8">
                  <Film className="w-8 h-8 mx-auto mb-2 text-white/15" />
                  <p className="text-xs text-white/40">暂无视频历史</p>
                </div>
              ) : (
                <div className="p-2 space-y-2">
                  {versions.map((version) => {
                    const isCurrent = version.isCurrent;
                    const key = version.batchId || `v${version.versionNumber}`;
                    const isSwitching = switchingId === key;

                    return (
                      <div
                        key={key}
                        onClick={() => handleSwitchVersion(version)}
                        className={`rounded-lg overflow-hidden border transition-all duration-200 ${
                          isCurrent
                            ? 'border-rose-400/50 bg-rose-400/10 cursor-default'
                            : isSwitching
                            ? 'border-white/20 bg-white/5 cursor-wait opacity-60'
                            : 'border-white/10 bg-white/5 hover:border-rose-400/30 hover:bg-rose-400/5 cursor-pointer'
                        }`}
                      >
                        {/* 首帧缩略图 */}
                        <div className="h-16 relative bg-black/20">
                          {version.firstFrame ? (
                            <img
                              src={version.firstFrame.frame_url}
                              alt={`版本 ${version.versionNumber} 首帧`}
                              className="w-full h-full object-cover"
                              draggable={false}
                            />
                          ) : version.lastFrame ? (
                            <img
                              src={version.lastFrame.frame_url}
                              alt={`版本 ${version.versionNumber} 尾帧`}
                              className="w-full h-full object-cover"
                              draggable={false}
                            />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center">
                              <Film className="w-5 h-5 text-white/20" />
                            </div>
                          )}
                          {/* 视频标识 */}
                          <div className="absolute top-1 left-1 flex items-center gap-1 bg-black/60 rounded px-1 py-0.5">
                            <Film className="w-2.5 h-2.5 text-rose-400" />
                            <span className="text-[9px] text-rose-300">视频</span>
                          </div>
                          {/* 当前标识 */}
                          {isCurrent && (
                            <div className="absolute top-1 right-1 bg-rose-500/80 text-white text-[10px] px-1 py-0.5 rounded flex items-center gap-0.5">
                              <Check className="w-2.5 h-2.5" />
                              当前
                            </div>
                          )}
                          {/* 切换中遮罩 */}
                          {isSwitching && (
                            <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                              <Loader2 className="w-4 h-4 text-white animate-spin" />
                            </div>
                          )}
                        </div>
                        {/* 版本信息 */}
                        <div className="px-2 py-1.5">
                          <div className="flex items-center justify-between">
                            <span className="text-[10px] font-medium text-white/80">
                              版本 {version.versionNumber}
                            </span>
                            <span className="text-[9px] text-white/40">
                              {formatTime(version.createdAt)}
                            </span>
                          </div>
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

export default VideoHistorySidebar;
