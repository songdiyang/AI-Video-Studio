import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  MessageSquare, 
  Plus, 
  X, 
  CheckCircle, 
  AlertCircle, 
  ThumbsUp,
  MoreVertical,
  Send,
  Edit2,
  Trash2
} from 'lucide-react';
import { getAuthToken } from '../../services/auth';
import { useToast } from '../../contexts/ToastContext';

interface Annotation {
  id: number;
  project_id: number;
  storyboard_id: number;
  frame_type: 'first' | 'last' | 'video_frame';
  frame_timestamp?: number;
  annotation_type: 'comment' | 'suggestion' | 'issue' | 'approval';
  position_x?: number;
  position_y?: number;
  content: string;
  reply_to?: number;
  status: 'open' | 'resolved' | 'rejected' | 'archived';
  priority: 'low' | 'medium' | 'high' | 'critical';
  tags?: string;
  created_by: number;
  created_by_name?: string;
  created_at: string;
  replies?: Annotation[];
}

interface FrameAnnotationPanelProps {
  storyboardId: number;
  projectId: number;
  frameType: 'first' | 'last';
  isOpen: boolean;
  onClose: () => void;
  onAnnotationClick?: (annotation: Annotation) => void;
}

const annotationTypeConfig = {
  comment: { icon: MessageSquare, color: 'text-blue-400', bg: 'bg-blue-500/10' },
  suggestion: { icon: Edit2, color: 'text-green-400', bg: 'bg-green-500/10' },
  issue: { icon: AlertCircle, color: 'text-red-400', bg: 'bg-red-500/10' },
  approval: { icon: ThumbsUp, color: 'text-emerald-400', bg: 'bg-emerald-500/10' }
};

const priorityConfig = {
  low: 'bg-gray-500',
  medium: 'bg-yellow-500',
  high: 'bg-orange-500',
  critical: 'bg-red-500'
};

const FrameAnnotationPanel: React.FC<FrameAnnotationPanelProps> = ({
  storyboardId,
  projectId,
  frameType,
  isOpen,
  onClose,
  onAnnotationClick
}) => {
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedAnnotation, setSelectedAnnotation] = useState<Annotation | null>(null);
  const [replyContent, setReplyContent] = useState('');
  const [newAnnotationType, setNewAnnotationType] = useState<Annotation['annotation_type']>('comment');
  const [newAnnotationContent, setNewAnnotationContent] = useState('');
  const [annotationMode, setAnnotationMode] = useState(false);
  const [clickPosition, setClickPosition] = useState<{ x: number; y: number } | null>(null);
  const imageRef = useRef<HTMLImageElement>(null);
  const { showToast } = useToast();

  useEffect(() => {
    if (isOpen && storyboardId) {
      loadAnnotations();
    }
  }, [isOpen, storyboardId, frameType]);

  const loadAnnotations = async () => {
    setLoading(true);
    try {
      const token = getAuthToken();
      const res = await fetch(`/api/collaboration/annotations/${storyboardId}?frameType=${frameType}`, {
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        }
      });
      if (res.ok) {
        const data = await res.json();
        setAnnotations(data.annotations || []);
      }
    } catch (error) {
      console.error('[FrameAnnotation] 加载批注失败:', error);
      showToast('加载批注失败', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleCreateAnnotation = async (positionX?: number, positionY?: number) => {
    if (!newAnnotationContent.trim()) {
      showToast('请输入批注内容', 'error');
      return;
    }

    try {
      const token = getAuthToken();
      const res = await fetch('/api/collaboration/annotation/create', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        },
        body: JSON.stringify({
          projectId,
          storyboardId,
          frameType,
          annotationType: newAnnotationType,
          positionX,
          positionY,
          content: newAnnotationContent
        })
      });

      if (res.ok) {
        showToast('批注创建成功', 'success');
        setNewAnnotationContent('');
        setAnnotationMode(false);
        setClickPosition(null);
        await loadAnnotations();
      } else {
        const error = await res.json();
        showToast(error.message || '创建批注失败', 'error');
      }
    } catch (error) {
      console.error('[FrameAnnotation] 创建批注失败:', error);
      showToast('创建批注失败', 'error');
    }
  };

  const handleReply = async (annotationId: number) => {
    if (!replyContent.trim()) {
      showToast('请输入回复内容', 'error');
      return;
    }

    try {
      const token = getAuthToken();
      const res = await fetch('/api/collaboration/annotation/create', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        },
        body: JSON.stringify({
          projectId,
          storyboardId,
          frameType,
          content: replyContent,
          replyTo: annotationId
        })
      });

      if (res.ok) {
        showToast('回复成功', 'success');
        setReplyContent('');
        await loadAnnotations();
      } else {
        const error = await res.json();
        showToast(error.message || '回复失败', 'error');
      }
    } catch (error) {
      console.error('[FrameAnnotation] 回复失败:', error);
      showToast('回复失败', 'error');
    }
  };

  const handleResolveAnnotation = async (annotationId: number) => {
    try {
      const token = getAuthToken();
      const res = await fetch(`/api/collaboration/annotation/${annotationId}/resolve`, {
        method: 'PUT',
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        }
      });

      if (res.ok) {
        showToast('批注已解决', 'success');
        await loadAnnotations();
      } else {
        const error = await res.json();
        showToast(error.message || '解决批注失败', 'error');
      }
    } catch (error) {
      console.error('[FrameAnnotation] 解决批注失败:', error);
      showToast('解决批注失败', 'error');
    }
  };

  const handleImageClick = (e: React.MouseEvent<HTMLImageElement>) => {
    if (!annotationMode) return;

    const rect = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;
    setClickPosition({ x, y });
  };

  const formatTime = (dateStr: string) => {
    const d = new Date(dateStr);
    const now = new Date();
    const diff = now.getTime() - d.getTime();
    if (diff < 60000) return '刚刚';
    if (diff < 3600000) return `${Math.floor(diff / 60000)}分钟前`;
    return d.toLocaleDateString('zh-CN');
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
              <MessageSquare className="w-4 h-4 text-[var(--accent)]" />
              <span className="text-sm font-semibold">帧批注</span>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setAnnotationMode(!annotationMode)}
                className={`p-1.5 rounded transition-colors ${
                  annotationMode 
                    ? 'bg-[var(--accent)] text-white' 
                    : 'hover:bg-[var(--bg-input)]'
                }`}
                title={annotationMode ? '取消标注模式' : '进入标注模式'}
              >
                <Plus className="w-4 h-4" />
              </button>
              <button onClick={onClose} className="p-1 hover:bg-[var(--bg-input)] rounded">
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* 批注列表 */}
          <div className="flex-1 overflow-y-auto p-3 space-y-3">
            {loading ? (
              <div className="text-center py-8 text-[var(--text-muted)]">
                <div className="w-6 h-6 border-2 border-[var(--accent)] border-t-transparent rounded-full animate-spin mx-auto mb-2" />
                <p className="text-xs">加载中...</p>
              </div>
            ) : annotations.length === 0 ? (
              <div className="text-center py-8 text-[var(--text-muted)]">
                <MessageSquare className="w-8 h-8 mx-auto mb-2 opacity-30" />
                <p className="text-xs">暂无批注</p>
                <p className="text-[10px] mt-1">点击右上角 + 添加批注</p>
              </div>
            ) : (
              annotations.map((annotation) => {
                const ConfigIcon = annotationTypeConfig[annotation.annotation_type].icon;
                return (
                  <div
                    key={annotation.id}
                    className={`p-3 rounded-lg border transition-all ${
                      annotation.status === 'resolved'
                        ? 'border-green-500/30 bg-green-500/5'
                        : 'border-[var(--border-color)] bg-[var(--bg-input)] hover:border-[var(--accent)]/50'
                    }`}
                  >
                    {/* 批注头部 */}
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <div className={`p-1 rounded ${annotationTypeConfig[annotation.annotation_type].bg}`}>
                          <ConfigIcon className={`w-3 h-3 ${annotationTypeConfig[annotation.annotation_type].color}`} />
                        </div>
                        <div>
                          <div className="text-xs font-medium text-[var(--text-primary)]">
                            {annotation.created_by_name || '未知用户'}
                          </div>
                          <div className="text-[10px] text-[var(--text-muted)]">
                            {formatTime(annotation.created_at)}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-1">
                        <div className={`w-2 h-2 rounded-full ${priorityConfig[annotation.priority]}`} />
                        {annotation.status === 'resolved' && (
                          <CheckCircle className="w-3 h-3 text-green-400" />
                        )}
                      </div>
                    </div>

                    {/* 批注内容 */}
                    <div className="text-xs text-[var(--text-secondary)] mb-2">
                      {annotation.content}
                    </div>

                    {/* 位置信息 */}
                    {annotation.position_x !== undefined && annotation.position_y !== undefined && (
                      <div className="text-[10px] text-[var(--text-muted)] mb-2">
                        位置：({annotation.position_x.toFixed(1)}%, {annotation.position_y.toFixed(1)}%)
                      </div>
                    )}

                    {/* 回复列表 */}
                    {annotation.replies && annotation.replies.length > 0 && (
                      <div className="ml-4 border-l-2 border-[var(--border-color)] pl-3 space-y-2">
                        {annotation.replies.map((reply) => (
                          <div key={reply.id} className="text-xs">
                            <div className="flex items-center gap-2 mb-1">
                              <span className="font-medium text-[var(--text-primary)]">
                                {reply.created_by_name || '未知用户'}
                              </span>
                              <span className="text-[10px] text-[var(--text-muted)]">
                                {formatTime(reply.created_at)}
                              </span>
                            </div>
                            <div className="text-[var(--text-secondary)]">
                              {reply.content}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* 操作按钮 */}
                    <div className="flex items-center gap-1 mt-2">
                      {annotation.status !== 'resolved' && (
                        <button
                          onClick={() => handleResolveAnnotation(annotation.id)}
                          className="flex-1 px-2 py-1 bg-green-500/10 text-green-400 text-[10px] rounded hover:bg-green-500/20 flex items-center justify-center gap-1"
                        >
                          <CheckCircle className="w-3 h-3" />
                          解决
                        </button>
                      )}
                      <button
                        onClick={() => setSelectedAnnotation(annotation)}
                        className="flex-1 px-2 py-1 bg-[var(--accent)]/10 text-[var(--accent)] text-[10px] rounded hover:bg-[var(--accent)]/20"
                      >
                        回复
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* 回复弹窗 */}
          <AnimatePresence>
            {selectedAnnotation && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 20 }}
                className="absolute bottom-0 left-0 right-0 bg-[var(--bg-card)] border-t border-[var(--border-color)] p-3"
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-medium">回复批注</span>
                  <button onClick={() => setSelectedAnnotation(null)} className="p-1 hover:bg-[var(--bg-input)] rounded">
                    <X className="w-3 h-3" />
                  </button>
                </div>
                <textarea
                  value={replyContent}
                  onChange={(e) => setReplyContent(e.target.value)}
                  placeholder="输入回复内容..."
                  rows={3}
                  className="w-full px-2 py-1.5 text-xs bg-[var(--bg-input)] border border-[var(--border-color)] rounded resize-none focus:outline-none focus:ring-1 focus:ring-[var(--accent)] mb-2"
                />
                <button
                  onClick={() => handleReply(selectedAnnotation.id)}
                  disabled={!replyContent.trim()}
                  className="w-full px-3 py-1.5 text-xs bg-[var(--accent)] text-white rounded hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-1"
                >
                  <Send className="w-3 h-3" />
                  发送回复
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default FrameAnnotationPanel;
