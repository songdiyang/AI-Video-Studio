import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { History, Clock, Trash2, Check, Image } from 'lucide-react';
import { getAuthToken } from '../../services/auth';
import { useConfirm } from '../../contexts/ConfirmContext';

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
  onRestoreVersion: (versionId: number, frameUrl: string, frameType: 'first' | 'last') => void;
}

const FrameHistoryPanel: React.FC<FrameHistoryPanelProps> = ({
  storyboardId,
  frameType,
  isOpen,
  onClose,
  onRestoreVersion
}) => {
  const { confirm } = useConfirm();
  const [versions, setVersions] = useState<FrameVersion[]>([]);
  const [loading, setLoading] = useState(false);

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

  // 点击缩略图直接恢复到该版本（不再预览）
  const handleSwitchVersion = (version: FrameVersion) => {
    console.log('[FrameHistoryPanel] handleSwitchVersion called:', { versionId: version.id, isCurrent: version.is_current, frameUrl: version.frame_url });
    if (version.is_current) {
      console.log('[FrameHistoryPanel] Skipping switch - already current version');
      return; // 当前版本无需切换
    }
    
    // 直接调用恢复功能，不再预览
    handleRestore(version.id);
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
        // 找到被恢复的版本信息，获取其 frame_url
        const restoredVersion = versions.find(v => v.id === versionId);
        await loadHistory();
        onRestoreVersion(versionId, restoredVersion?.frame_url || '', frameType);
      }
    } catch (error) {
      console.error('[FrameHistoryPanel] 恢复版本失败:', error);
    }
  };

  const handleDelete = async (versionId: number) => {
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
          className="absolute top-0 left-0 w-64 h-full bg-(--bg-card) border-r border-(--border-color) shadow-lg z-10 flex flex-col overflow-hidden"
        >
          {/* 头部 */}
          <div className="flex items-center justify-between px-3 py-2 border-b border-(--border-color) shrink-0">
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
                {versions.map((version) => {
                  const isCurrent = version.is_current;
                  
                  return (
                  <div
                    key={version.id}
                    className={`rounded-lg overflow-hidden border transition-all duration-200 ${
                      isCurrent
                        ? 'border-(--accent) bg-(--accent)/5 ring-1 ring-(--accent)'
                        : 'border-(--border-color) bg-(--bg-input) hover:border-(--accent)/50'
                    }`}
                  >
                    {/* 缩略图 - 点击直接恢复 */}
                    <div 
                      className="h-30 bg-(--bg-app) relative cursor-pointer group z-0"
                      onClick={() => {
                        console.log('[FrameHistoryPanel] Thumbnail clicked, version:', version.id, 'is_current:', version.is_current);
                        handleSwitchVersion(version);
                      }}
                      title={version.is_current ? '当前版本' : '点击恢复此版本'}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          handleSwitchVersion(version);
                        }
                      }}
                    >
                      <img
                        src={version.frame_url}
                        alt={`版本 ${version.version_number}`}
                        className="w-full h-full object-cover transition-transform duration-200 group-hover:scale-105 pointer-events-none"
                        draggable={false}
                      />
                      {/* 悬停遮罩提示 */}
                      {!version.is_current && (
                        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors flex items-center justify-center opacity-0 group-hover:opacity-100 pointer-events-none">
                          <span className="text-white text-xs font-medium px-2 py-1 bg-black/50 rounded">
                            点击恢复
                          </span>
                        </div>
                      )}
                      {/* 当前版本标识 */}
                      {isCurrent && (
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
                      
                      {/* 操作按钮 - 仅保留删除 */}
                      {!version.is_current && (
                        <div className="flex items-center justify-end">
                          <button
                            onClick={() => handleDelete(version.id)}
                            className="px-2 py-1 bg-red-500/10 text-red-400 text-[10px] rounded hover:bg-red-500/20"
                            title="删除版本"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                );})}
              </div>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default FrameHistoryPanel;
