import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useVirtualList } from '../../hooks/useVirtualList';
import { 
  History, 
  GitBranch, 
  Clock, 
  RotateCcw, 
  Trash2, 
  Check, 
  GitCompare,
  Download,
  Upload,
  Plus,
  X,
  ChevronRight,
  ChevronDown
} from 'lucide-react';
import { getAuthToken } from '../../services/auth';
import { useToast } from '../../contexts/ToastContext';

interface Version {
  id: number;
  project_id: number;
  resource_type: string;
  resource_id: number;
  version_number: number;
  parent_version_id?: number;
  branch_name: string;
  version_label?: string;
  change_summary?: string;
  change_details?: any;
  snapshot_data?: any;
  created_by: number;
  created_by_name?: string;
  created_at: string;
  is_current: boolean;
}

interface VersionHistoryPanelProps {
  projectId: number;
  resourceType: 'storyboard' | 'scene' | 'character' | 'frame_sequence';
  resourceId: number;
  isOpen: boolean;
  onClose: () => void;
  onRestoreVersion?: (version: Version) => void;
}

const VersionHistoryPanel: React.FC<VersionHistoryPanelProps> = ({
  projectId,
  resourceType,
  resourceId,
  isOpen,
  onClose,
  onRestoreVersion
}) => {
  const [versions, setVersions] = useState<Version[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedBranch, setSelectedBranch] = useState('main');
  const [branches, setBranches] = useState<string[]>(['main']);
  const [selectedVersions, setSelectedVersions] = useState<number[]>([]);
  const [showCompare, setShowCompare] = useState(false);
  const [creatingVersion, setCreatingVersion] = useState(false);
  const [versionLabel, setVersionLabel] = useState('');
  const [changeSummary, setChangeSummary] = useState('');
  const { showToast } = useToast();
  const versionListRef = useRef<HTMLDivElement>(null);
  const [listHeight, setListHeight] = useState(300);

  // 版本项固定高度（包含内边距、边框等）
  const VERSION_ITEM_HEIGHT = 120;

  // 测量列表容器高度
  useEffect(() => {
    if (!versionListRef.current) return;
    const observer = new ResizeObserver(entries => {
      for (const entry of entries) {
        setListHeight(entry.contentRect.height);
      }
    });
    observer.observe(versionListRef.current);
    return () => observer.disconnect();
  }, [isOpen]);

  const { virtualItems, containerProps, wrapperProps } = useVirtualList({
    itemCount: versions.length,
    itemHeight: VERSION_ITEM_HEIGHT,
    containerHeight: listHeight,
    overscan: 5,
  });

  useEffect(() => {
    if (isOpen && resourceId) {
      loadVersions();
    }
  }, [isOpen, resourceId, selectedBranch]);

  const loadVersions = async () => {
    setLoading(true);
    try {
      const token = getAuthToken();
      const res = await fetch(`/api/version/history/${resourceType}/${resourceId}?branch=${selectedBranch}`, {
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        }
      });
      if (res.ok) {
        const data = await res.json();
        setVersions(data.versions || []);
        
        // 提取所有分支
        const uniqueBranches = Array.from(new Set(data.versions.map((v: Version) => v.branch_name))) as string[];
        setBranches(uniqueBranches);
      }
    } catch (error) {
      console.error('[VersionHistoryPanel] 加载版本失败:', error);
      showToast('加载版本历史失败', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleCreateVersion = async () => {
    if (!versionLabel.trim()) {
      showToast('请输入版本标签', 'error');
      return;
    }

    setCreatingVersion(true);
    try {
      const token = getAuthToken();
      const res = await fetch('/api/version/create', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        },
        body: JSON.stringify({
          projectId,
          resourceType,
          resourceId,
          versionLabel,
          changeSummary,
          branchName: selectedBranch
        })
      });

      if (res.ok) {
        showToast('新版本创建成功', 'success');
        setVersionLabel('');
        setChangeSummary('');
        await loadVersions();
      } else {
        const error = await res.json();
        showToast(error.message || '创建版本失败', 'error');
      }
    } catch (error) {
      console.error('[VersionHistoryPanel] 创建版本失败:', error);
      showToast('创建版本失败', 'error');
    } finally {
      setCreatingVersion(false);
    }
  };

  const handleRestoreVersion = async (version: Version) => {
    try {
      const token = getAuthToken();
      const res = await fetch(`/api/version/restore/${version.id}`, {
        method: 'PUT',
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        }
      });

      if (res.ok) {
        showToast('版本已恢复', 'success');
        await loadVersions();
        onRestoreVersion?.(version);
      } else {
        const error = await res.json();
        showToast(error.message || '恢复版本失败', 'error');
      }
    } catch (error) {
      console.error('[VersionHistoryPanel] 恢复版本失败:', error);
      showToast('恢复版本失败', 'error');
    }
  };

  const handleDeleteVersion = async (versionId: number) => {
    if (!confirm('确定要删除这个版本吗？此操作不可恢复。')) return;
    
    try {
      const token = getAuthToken();
      const res = await fetch(`/api/version/delete/${versionId}`, {
        method: 'DELETE',
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        }
      });

      if (res.ok) {
        showToast('版本已删除', 'success');
        await loadVersions();
      } else {
        const error = await res.json();
        showToast(error.message || '删除版本失败', 'error');
      }
    } catch (error) {
      console.error('[VersionHistoryPanel] 删除版本失败:', error);
      showToast('删除版本失败', 'error');
    }
  };

  const handleCompareVersions = () => {
    if (selectedVersions.length !== 2) {
      showToast('请选择两个版本进行对比', 'info');
      return;
    }
    setShowCompare(true);
  };

  const formatTime = (dateStr: string) => {
    const d = new Date(dateStr);
    const now = new Date();
    const diff = now.getTime() - d.getTime();
    if (diff < 60000) return '刚刚';
    if (diff < 3600000) return `${Math.floor(diff / 60000)}分钟前`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}小时前`;
    return d.toLocaleDateString('zh-CN');
  };

  const toggleVersionSelection = (versionId: number) => {
    setSelectedVersions(prev => {
      if (prev.includes(versionId)) {
        return prev.filter(id => id !== versionId);
      }
      if (prev.length >= 2) {
        return [prev[1], versionId];
      }
        return [...prev, versionId];
    });
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: 20 }}
          className="absolute top-0 right-0 w-80 h-full bg-[var(--bg-card)] border-l border-[var(--border-color)] shadow-lg z-20 overflow-hidden flex flex-col"
        >
          {/* 头部 */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border-color)] bg-[var(--bg-app)]">
            <div className="flex items-center gap-2">
              <GitBranch className="w-4 h-4 text-[var(--accent)]" />
              <span className="text-sm font-semibold">版本历史</span>
            </div>
            <button onClick={onClose} className="p-1 hover:bg-[var(--bg-input)] rounded">
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* 分支选择器 */}
          <div className="px-4 py-2 border-b border-[var(--border-color)]">
            <select
              value={selectedBranch}
              onChange={(e) => setSelectedBranch(e.target.value)}
              className="w-full px-3 py-1.5 text-xs bg-[var(--bg-input)] border border-[var(--border-color)] rounded focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
            >
              {branches.map(branch => (
                <option key={branch} value={branch}>{branch === 'main' ? '主分支' : branch}</option>
              ))}
            </select>
          </div>

          {/* 新建版本 */}
          <div className="px-4 py-3 border-b border-[var(--border-color)] bg-[var(--bg-input)]/50">
            <div className="flex items-center gap-2 mb-2">
              <Plus className="w-3 h-3 text-[var(--accent)]" />
              <span className="text-xs font-medium">创建新版本</span>
            </div>
            <input
              type="text"
              placeholder="版本标签（如：初稿、修改版）"
              value={versionLabel}
              onChange={(e) => setVersionLabel(e.target.value)}
              className="w-full px-2 py-1.5 text-xs bg-[var(--bg-input)] border border-[var(--border-color)] rounded mb-2 focus:outline-none focus:ring-1 focus:ring-[var(--accent)]"
            />
            <textarea
              placeholder="变更说明（可选）"
              value={changeSummary}
              onChange={(e) => setChangeSummary(e.target.value)}
              rows={2}
              className="w-full px-2 py-1.5 text-xs bg-[var(--bg-input)] border border-[var(--border-color)] rounded resize-none focus:outline-none focus:ring-1 focus:ring-[var(--accent)]"
            />
            <button
              onClick={handleCreateVersion}
              disabled={creatingVersion || !versionLabel.trim()}
              className="w-full mt-2 px-3 py-1.5 text-xs bg-[var(--accent)] text-white rounded hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-opacity"
            >
              {creatingVersion ? '创建中...' : '创建版本'}
            </button>
          </div>

          {/* 操作按钮 */}
          <div className="px-4 py-2 border-b border-[var(--border-color)] flex items-center gap-2">
            <button
              onClick={handleCompareVersions}
              disabled={selectedVersions.length !== 2}
              className="flex-1 px-2 py-1 text-xs bg-[var(--bg-input)] border border-[var(--border-color)] rounded hover:bg-[var(--bg-hover)] disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-1"
              title="对比选中的两个版本"
            >
              <GitCompare className="w-3 h-3" />
              对比版本
            </button>
          </div>

          {/* 版本列表 - 使用虚拟列表优化大量版本的渲染性能 */}
          <div ref={versionListRef} className="flex-1 overflow-hidden">
            {loading ? (
              <div className="text-center py-8 text-[var(--text-muted)]">
                <Clock className="w-6 h-6 mx-auto mb-2 animate-spin" />
                <p className="text-xs">加载中...</p>
              </div>
            ) : versions.length === 0 ? (
              <div className="text-center py-8 text-[var(--text-muted)]">
                <History className="w-8 h-8 mx-auto mb-2 opacity-30" />
                <p className="text-xs">暂无版本历史</p>
              </div>
            ) : (
              <div {...containerProps} className="p-3" style={{ ...containerProps.style, overflow: 'auto' }}>
                <div {...wrapperProps}>
                  {virtualItems.map(({ index, offsetTop }) => {
                    const version = versions[index];
                    return (
                      <div
                        key={version.id}
                        style={{
                          position: 'absolute',
                          top: offsetTop,
                          left: 12,
                          right: 12,
                          height: VERSION_ITEM_HEIGHT - 8,
                        }}
                      >
                        <div
                          className={`h-full rounded-lg overflow-hidden border transition-all ${
                            version.is_current
                              ? 'border-[var(--accent)] bg-[var(--accent)]/5'
                              : selectedVersions.includes(version.id)
                              ? 'border-[var(--accent)] bg-[var(--accent)]/10'
                              : 'border-[var(--border-color)] bg-[var(--bg-input)] hover:border-[var(--accent)]/50'
                          }`}
                        >
                          {/* 选择器 */}
                          <div className="absolute top-2 left-2 z-10">
                            <input
                              type="checkbox"
                              checked={selectedVersions.includes(version.id)}
                              onChange={() => toggleVersionSelection(version.id)}
                              className="w-4 h-4 rounded border-[var(--border-color)] text-[var(--accent)] focus:ring-[var(--accent)] focus:ring-offset-0"
                            />
                          </div>

                          {/* 内容 */}
                          <div className="p-3 pl-8">
                            <div className="flex items-center justify-between mb-1">
                              <div className="flex items-center gap-2">
                                <span className="text-xs font-semibold text-[var(--text-primary)]">
                                  v{version.version_number}
                                </span>
                                {version.version_label && (
                                  <span className="text-[10px] px-1.5 py-0.5 bg-[var(--accent)]/10 text-[var(--accent)] rounded">
                                    {version.version_label}
                                  </span>
                                )}
                                {version.is_current && (
                                  <span className="text-[10px] px-1.5 py-0.5 bg-[var(--accent)] text-white rounded flex items-center gap-1">
                                    <Check className="w-3 h-3" />
                                    当前
                                  </span>
                                )}
                              </div>
                              <span className="text-[10px] text-[var(--text-muted)]">
                                {formatTime(version.created_at)}
                              </span>
                            </div>

                            {version.change_summary && (
                              <p className="text-[10px] text-[var(--text-muted)] mb-1 line-clamp-1">
                                {version.change_summary}
                              </p>
                            )}

                            <div className="flex items-center gap-2 text-[10px] text-[var(--text-muted)]">
                              <span>{version.created_by_name || '未知'}</span>
                              <span>•</span>
                              <span>{version.branch_name}</span>
                            </div>

                            {/* 操作按钮 */}
                            <div className="flex items-center gap-1 mt-1">
                              {!version.is_current && (
                                <button
                                  onClick={() => handleRestoreVersion(version)}
                                  className="flex-1 px-2 py-1 bg-[var(--accent)]/10 text-[var(--accent)] text-[10px] rounded hover:bg-[var(--accent)]/20 flex items-center justify-center gap-1"
                                  title="恢复此版本"
                                >
                                  <RotateCcw className="w-3 h-3" />
                                  恢复
                                </button>
                              )}
                              {!version.is_current && (
                                <button
                                  onClick={() => handleDeleteVersion(version.id)}
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

export default VersionHistoryPanel;
