import React, { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence, PanInfo, useDragControls } from 'framer-motion';
import {
  MessageSquare,
  Plus,
  X,
  AlertCircle,
  Send,
  Edit2,
  Trash2,
  Sparkles,
  Bot,
  User,
  GripHorizontal,
  Image as ImageIcon,
  Video,
  FileText,
  Star,
  Loader2,
  Check,
  Maximize2,
  Search,
} from 'lucide-react';
import { getAuthToken } from '../../services/auth';
import { useToast } from '../../contexts/ToastContext';
import { useAIAssistantUI } from '../../contexts/AIAssistantContext';
import AIModelSelector, { AIModel } from '../../components/AIModelSelector';

interface Comment {
  id: number;
  project_id: number;
  storyboard_id: number;
  annotation_type: 'comment' | 'suggestion' | 'issue';
  content: string;
  reply_to?: number;
  created_by: number;
  created_by_name?: string;
  is_ai?: boolean;
  created_at: string;
  replies?: Comment[];
}

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
  is_ai?: boolean;
  model?: string;
  userName?: string;
}

interface TimelineMessage {
  id: string | number;
  type: 'annotation' | 'chat' | 'ai' | 'system';
  content: string;
  userName: string;
  userAvatar?: string;
  timestamp: number;
  isAI: boolean;
  annotationType?: 'comment' | 'suggestion' | 'issue';
  model?: string;
  replyTo?: number;
  originalId?: number;
}

interface StoryboardCommentPanelProps {
  storyboardId: number;
  projectId: number;
  isOpen: boolean;
  onClose: () => void;
  sceneData?: {
    id?: number;
    index?: number;
    description?: string;
    shotType?: string;
    cameraMovement?: string;
    characters?: string[];
    location?: string;
    startFrame?: string;
    endFrame?: string;
    videoUrl?: string;
    first_frame_url?: string;
    last_frame_url?: string;
    video_url?: string;
    first_frame_prompt?: string;
    last_frame_prompt?: string;
    video_prompt?: string;
    script_content?: string;
  };
}

const commentTypeConfig = {
  comment: { icon: MessageSquare, color: 'text-blue-400', bg: 'bg-blue-500/10', label: '评论' },
  suggestion: { icon: Edit2, color: 'text-green-400', bg: 'bg-green-500/10', label: '建议' },
  issue: { icon: AlertCircle, color: 'text-red-400', bg: 'bg-red-500/10', label: '问题' }
};

const StoryboardCommentPanel: React.FC<StoryboardCommentPanelProps> = ({
  storyboardId,
  projectId,
  isOpen,
  onClose,
  sceneData
}) => {
  const [comments, setComments] = useState<Comment[]>([]);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedComment, setSelectedComment] = useState<Comment | null>(null);
  const [replyContent, setReplyContent] = useState('');
  const [newCommentType, setNewCommentType] = useState<Comment['annotation_type']>('comment');
  const [newCommentContent, setNewCommentContent] = useState('');
  const [showNewCommentForm, setShowNewCommentForm] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [inputText, setInputText] = useState('');
  const [isAILoading, setIsAILoading] = useState(false);
  const [selectedModel, setSelectedModel] = useState<string>('');
  const [showModelSelector, setShowModelSelector] = useState(false);
  const [availableModels, setAvailableModels] = useState<AIModel[]>([]);
  const [currentUserName, setCurrentUserName] = useState<string>('我');
  const [currentUserAvatar, setCurrentUserAvatar] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState<string>('');
  // 窗口尺寸状态
  const [windowSize, setWindowSize] = useState({ width: 520, height: 600 });
  const [isResizing, setIsResizing] = useState(false);
  const resizeStartRef = useRef({ x: 0, y: 0, width: 0, height: 0 });
  const { showToast } = useToast();
  const { open: openAIAssistant } = useAIAssistantUI();
  const listRef = useRef<HTMLDivElement>(null);
  const dragControls = useDragControls();
  const constraintsRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (isOpen && storyboardId) {
      loadComments();
      loadModels();
    }
  }, [isOpen, storyboardId]);

  // 获取当前用户昵称和头像
  useEffect(() => {
    try {
      const stored = localStorage.getItem('auth_user');
      if (stored) {
        const user = JSON.parse(stored);
        if (user.nickname) setCurrentUserName(user.nickname);
        else if (user.email) setCurrentUserName(user.email.split('@')[0]);
        if (user.avatar_url) setCurrentUserAvatar(user.avatar_url);
      }
    } catch {}
  }, []);

  const loadComments = async () => {
    setLoading(true);
    try {
      const token = getAuthToken();
      const res = await fetch(`/api/collaboration/annotations/${storyboardId}`, {
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        }
      });
      if (res.ok) {
        const data = await res.json();
        setComments(data.annotations || []);
      }
    } catch (error) {
      console.error('[StoryboardComment] 加载评论失败:', error);
      showToast('加载评论失败', 'error');
    } finally {
      setLoading(false);
    }
  };

  const loadModels = async () => {
    try {
      const token = getAuthToken();
      const res = await fetch('/api/ai-models', {
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        }
      });
      if (res.ok) {
        const data = await res.json();
        // 支持文本对话和多模态模型(用于识别图片)
        const textAndMultimodalModels = (data.models || []).filter((m: AIModel) => 
          m.type === 'TEXT' || m.category === 'TEXT' || 
          m.type === 'MULTIMODAL' || m.category === 'MULTIMODAL'
        );
        setAvailableModels(textAndMultimodalModels);
      }
    } catch (error) {
      console.error('[StoryboardComment] 加载模型列表失败:', error);
    }
  };

  const handleCreateComment = async () => {
    if (!newCommentContent.trim()) {
      showToast('请输入评论内容', 'error');
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
          frameType: 'first',
          annotationType: newCommentType,
          content: newCommentContent
        })
      });

      if (res.ok) {
        showToast('评论创建成功', 'success');
        setNewCommentContent('');
        setShowNewCommentForm(false);
        await loadComments();
      } else {
        const error = await res.json();
        showToast(error.message || '创建评论失败', 'error');
      }
    } catch (error) {
      console.error('[StoryboardComment] 创建评论失败:', error);
      showToast('创建评论失败', 'error');
    }
  };

  const handleReply = async (commentId: number) => {
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
          frameType: 'first',
          annotationType: 'comment',
          content: replyContent,
          replyTo: commentId
        })
      });

      if (res.ok) {
        showToast('回复成功', 'success');
        setReplyContent('');
        setSelectedComment(null);
        await loadComments();
      } else {
        const error = await res.json();
        showToast(error.message || '回复失败', 'error');
      }
    } catch (error) {
      console.error('[StoryboardComment] 回复失败:', error);
      showToast('回复失败', 'error');
    }
  };

  const handleDeleteComment = async (commentId: number) => {
    if (!confirm('确定要删除这条评论吗？')) return;

    try {
      const token = getAuthToken();
      const res = await fetch(`/api/collaboration/annotation/${commentId}`, {
        method: 'DELETE',
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        }
      });

      if (res.ok) {
        showToast('评论已删除', 'success');
        await loadComments();
      } else {
        const error = await res.json();
        showToast(error.message || '删除评论失败', 'error');
      }
    } catch (error) {
      console.error('[StoryboardComment] 删除评论失败:', error);
      showToast('删除评论失败', 'error');
    }
  };

  const handleOpenAIAssistant = () => {
    // 关闭批注面板，打开AI助手
    onClose();
    openAIAssistant();
    showToast('请在AI助手面板中使用「批注」和「评分」功能', 'info');
  };

  // 检测输入中是否包含 @AI
  const checkForAIMention = useCallback((text: string): boolean => {
    return /@ai\b/i.test(text);
  }, []);

  // 发送消息（普通评论或AI对话）
  const handleSendMessage = useCallback(async () => {
    if (!inputText.trim()) return;

    const isAIMention = checkForAIMention(inputText);
    
    // 添加用户消息到聊天列表
    const userMessage: ChatMessage = {
      id: `msg-${Date.now()}-user`,
      role: 'user',
      content: inputText,
      timestamp: Date.now(),
      userName: currentUserName,
    };
    setChatMessages((prev) => [...prev, userMessage]);
    
    // 清空输入框
    setInputText('');
    
    if (isAIMention) {
      // 调用AI
      await handleAIChat(inputText);
    } else {
      // 普通评论，保存到后端
      await handleCreateCommentFromChat(inputText);
    }
  }, [inputText, checkForAIMention]);

  // AI聊天功能
  const handleAIChat = useCallback(async (userInput: string) => {
    setIsAILoading(true);
    
    try {
      const token = getAuthToken();
      
      // 构建上下文信息
      const contextInfo = [];
      
      // 分镜信息
      if (sceneData) {
        contextInfo.push('🎬 当前分镜信息：');
        if (sceneData.index) contextInfo.push(`- 分镜序号：${sceneData.index}`);
        if (sceneData.description) contextInfo.push(`- 描述：${sceneData.description}`);
        if (sceneData.shotType) contextInfo.push(`- 景别：${sceneData.shotType}`);
        if (sceneData.cameraMovement) contextInfo.push(`- 运镜：${sceneData.cameraMovement}`);
        if (sceneData.characters?.length) contextInfo.push(`- 角色：${sceneData.characters.join(', ')}`);
        if (sceneData.location) contextInfo.push(`- 场景：${sceneData.location}`);
        
        // 提示词
        if (sceneData.first_frame_prompt) contextInfo.push(`- 首帧提示词：${sceneData.first_frame_prompt}`);
        if (sceneData.video_prompt) contextInfo.push(`- 视频提示词：${sceneData.video_prompt}`);
      }
      
      // 批注历史
      if (comments.length > 0) {
        contextInfo.push('\n💬 批注历史：');
        comments.slice(0, 10).forEach((c, i) => {
          contextInfo.push(`${i + 1}. [${c.created_by_name}] ${c.content}`);
          if (c.replies?.length) {
            c.replies.forEach((r, j) => {
              contextInfo.push(`   ↳ [${r.created_by_name}] ${r.content}`);
            });
          }
        });
      }
      
      // 去除@AI标记
      const cleanInput = userInput.replace(/@ai\b/i, '').trim();
      
      const res = await fetch('/api/ai-assistant/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          projectId,
          modelName: selectedModel || undefined,
          messages: [
            {
              role: 'user',
              content: `你是分镜助手，请帮助用户分析当前分镜。\n\n${contextInfo.join('\n')}\n\n用户问题：${cleanInput}`,
            },
          ],
          context: {
            storyboardId,
            sceneData,
          },
        }),
      });
      
      if (!res.ok) {
        throw new Error('AI请求失败');
      }
      
      const data = await res.json();
      
      // 添加AI回复
      const aiMessage: ChatMessage = {
        id: `msg-${Date.now()}-ai`,
        role: 'assistant',
        content: data.reply || data.content || '(无回复)',
        timestamp: Date.now(),
        is_ai: true,
        model: selectedModel || '默认模型',
      };
      setChatMessages((prev) => [...prev, aiMessage]);
      
    } catch (error: any) {
      console.error('[StoryboardComment] AI聊天失败:', error);
      showToast('AI回复失败：' + error.message, 'error');
      
      // 添加错误消息
      const errorMessage: ChatMessage = {
        id: `msg-${Date.now()}-err`,
        role: 'system',
        content: `⚠️ AI回复失败：${error.message}`,
        timestamp: Date.now(),
      };
      setChatMessages((prev) => [...prev, errorMessage]);
    } finally {
      setIsAILoading(false);
    }
  }, [projectId, storyboardId, sceneData, comments, selectedModel, showToast]);

  // 从聊天框创建普通评论
  const handleCreateCommentFromChat = useCallback(async (content: string) => {
    try {
      const token = getAuthToken();
      const res = await fetch('/api/collaboration/annotation/create', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          projectId: projectId,
          storyboardId: storyboardId,
          frameType: 'first',
          annotationType: 'comment',
          content: content.trim(),
        }),
      });
      
      if (res.ok) {
        // 重新加载评论列表
        await loadComments();
        showToast('评论已发布', 'success');
      } else {
        throw new Error('发布失败');
      }
    } catch (error: any) {
      console.error('[StoryboardComment] 发布评论失败:', error);
      showToast('发布评论失败', 'error');
    }
  }, [projectId, storyboardId, showToast, loadComments]);

  const formatTime = (dateStr: string) => {
    const d = new Date(dateStr);
    const now = new Date();
    const diff = now.getTime() - d.getTime();
    if (diff < 60000) return '刚刚';
    if (diff < 3600000) return `${Math.floor(diff / 60000)}分钟前`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}小时前`;
    return d.toLocaleDateString('zh-CN');
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* 拖拽边界容器 */}
          <div 
            ref={constraintsRef}
            className="fixed inset-0 z-40 pointer-events-none"
          />
          
          {/* 小窗口 */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            drag
            dragControls={dragControls}
            dragListener={false}
            dragMomentum={false}
            dragElastic={0}
            dragConstraints={constraintsRef}
            onDragStart={() => setIsDragging(true)}
            onDragEnd={() => setIsDragging(false)}
            className="fixed top-1/2 left-1/2 bg-[var(--bg-card)] rounded-2xl shadow-2xl z-40 overflow-hidden flex flex-col border border-[var(--border-color)]"
            style={{ 
              width: windowSize.width,
              height: windowSize.height,
              minWidth: 400,
              minHeight: 400,
              maxWidth: '90vw',
              maxHeight: '90vh',
              willChange: 'transform',
              userSelect: (isDragging || isResizing) ? 'none' : 'auto'
            }}
          >
          {/* 拖拽头部 */}
          <div 
            onPointerDown={(e) => {
              e.currentTarget.setPointerCapture(e.pointerId);
              dragControls.start(e);
            }}
            className="flex items-center justify-between px-4 py-3 bg-gradient-to-r from-[var(--bg-app)] to-[var(--bg-card)] border-b border-[var(--border-color)] select-none"
            style={{ 
              cursor: isDragging ? 'grabbing' : 'grab',
              touchAction: 'none'
            }}
          >
            {/* 拖拽指示器 */}
            <div className="absolute left-1/2 -translate-x-1/2 top-1.5 w-10 h-1 bg-[var(--border-color)] rounded-full" />
            
            <div className="flex items-center gap-2 mt-1">
              <div className="p-1.5 rounded-lg bg-[var(--accent)]/10">
                <MessageSquare className="w-4 h-4 text-[var(--accent)]" />
              </div>
              <div>
                <span className="text-sm font-semibold text-[var(--text-primary)]">分镜批注</span>
                <div className="flex items-center gap-1 text-[10px] text-[var(--text-muted)]">
                  <GripHorizontal className="w-3 h-3" />
                  <span>拖拽移动</span>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-1 mt-1">
              <button
                onClick={handleOpenAIAssistant}
                className="p-2 rounded-lg transition-all hover:bg-purple-500/10 text-purple-400 hover:text-purple-300 group relative"
                title="在AI助手面板中分析分镜和提示词"
              >
                <Sparkles className="w-4 h-4 group-hover:scale-110 transition-transform" />
              </button>
              <button
                onClick={() => setShowNewCommentForm(!showNewCommentForm)}
                className={`p-2 rounded-lg transition-all ${
                  showNewCommentForm
                    ? 'bg-[var(--accent)] text-white shadow-lg shadow-[var(--accent)]/20'
                    : 'hover:bg-[var(--bg-input)] text-[var(--text-secondary)]'
                }`}
                title={showNewCommentForm ? '取消' : '添加评论'}
              >
                <Plus className="w-4 h-4" />
              </button>
              <button 
                onClick={onClose} 
                className="p-2 rounded-lg hover:bg-red-500/10 text-[var(--text-muted)] hover:text-red-400 transition-all"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* 右下角调整大小手柄 */}
          <div
            className="absolute bottom-0 right-0 w-5 h-5 cursor-nwse-resize z-50"
            onPointerDown={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setIsResizing(true);
              resizeStartRef.current = {
                x: e.clientX,
                y: e.clientY,
                width: windowSize.width,
                height: windowSize.height
              };
              
              const handlePointerMove = (e: PointerEvent) => {
                const dx = e.clientX - resizeStartRef.current.x;
                const dy = e.clientY - resizeStartRef.current.y;
                const newWidth = Math.max(400, Math.min(window.innerWidth * 0.9, resizeStartRef.current.width + dx));
                const newHeight = Math.max(400, Math.min(window.innerHeight * 0.9, resizeStartRef.current.height + dy));
                setWindowSize({ width: newWidth, height: newHeight });
              };
              
              const handlePointerUp = () => {
                setIsResizing(false);
                window.removeEventListener('pointermove', handlePointerMove);
                window.removeEventListener('pointerup', handlePointerUp);
              };
              
              window.addEventListener('pointermove', handlePointerMove);
              window.addEventListener('pointerup', handlePointerUp);
            }}
          >
            <Maximize2 className="w-3 h-3 text-[var(--text-muted)] absolute bottom-1 right-1 pointer-events-none" />
          </div>

          {/* 新建评论表单 */}
          <AnimatePresence>
            {showNewCommentForm && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ type: 'spring', damping: 25, stiffness: 300 }}
                className="border-b border-[var(--border-color)] bg-gradient-to-b from-[var(--bg-app)] to-[var(--bg-card)] overflow-hidden"
              >
                <div className="p-4 space-y-3">
                  {/* 类型选择 */}
                  <div className="flex gap-2">
                    {(Object.keys(commentTypeConfig) as Array<keyof typeof commentTypeConfig>).map((type) => {
                      const config = commentTypeConfig[type];
                      return (
                        <button
                          key={type}
                          onClick={() => setNewCommentType(type)}
                          className={`flex-1 px-3 py-2 text-xs rounded-lg flex items-center justify-center gap-1.5 transition-all ${
                            newCommentType === type
                              ? `${config.bg} ${config.color} border border-current shadow-sm`
                              : 'bg-[var(--bg-input)] text-[var(--text-muted)] hover:text-[var(--text-secondary)] hover:bg-[var(--bg-card)]'
                          }`}
                        >
                          <config.icon className="w-3.5 h-3.5" />
                          {config.label}
                        </button>
                      );
                    })}
                  </div>
                  <textarea
                    value={newCommentContent}
                    onChange={(e) => setNewCommentContent(e.target.value)}
                    placeholder="输入你的评论或建议..."
                    rows={3}
                    className="w-full px-3 py-2 text-sm bg-[var(--bg-input)] border border-[var(--border-color)] rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-[var(--accent)] focus:border-transparent transition-all overflow-y-auto"
                  />
                  <button
                    onClick={handleCreateComment}
                    disabled={!newCommentContent.trim()}
                    className="w-full px-4 py-2 text-sm bg-[var(--accent)] text-white rounded-lg hover:bg-[var(--accent)]/90 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 transition-all shadow-sm hover:shadow-md disabled:shadow-none"
                  >
                    <Send className="w-4 h-4" />
                    发布评论
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* 搜索栏 */}
          {(comments.length > 0 || chatMessages.length > 0) && (
            <div className="px-4 pt-3 pb-1">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[var(--text-muted)]" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="搜索历史对话..."
                  className="w-full pl-8 pr-3 py-1.5 text-xs bg-[var(--bg-input)] border border-[var(--border-color)] rounded-lg focus:outline-none focus:ring-1 focus:ring-[var(--accent)] focus:border-transparent transition-all"
                />
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery('')}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                  >
                    <X className="w-3 h-3" />
                  </button>
                )}
              </div>
            </div>
          )}

          {/* 消息列表 */}
          <div ref={listRef} className="flex-1 overflow-y-auto p-4 space-y-3 scrollbar-thin scrollbar-thumb-[var(--border-color)] scrollbar-track-transparent">
            {loading ? (
              <div className="text-center py-12 text-[var(--text-muted)]">
                <div className="w-8 h-8 border-2 border-[var(--accent)] border-t-transparent rounded-full animate-spin mx-auto mb-3" />
                <p className="text-sm">加载中...</p>
              </div>
            ) : (() => {
              // 合并所有消息为统一时间线
              const timeline: TimelineMessage[] = [];

              // 添加批注消息
              comments.forEach((c) => {
                const isAI = c.is_ai || c.created_by_name === 'AI导演';
                timeline.push({
                  id: `annotation-${c.id}`,
                  type: 'annotation',
                  content: c.content,
                  userName: isAI ? 'AI导演' : (c.created_by_name || '未知用户'),
                  timestamp: new Date(c.created_at).getTime(),
                  isAI,
                  annotationType: c.annotation_type,
                  originalId: c.id,
                });
              });

              // 添加聊天消息
              chatMessages.forEach((msg) => {
                if (msg.role === 'system') {
                  timeline.push({
                    id: msg.id,
                    type: 'system',
                    content: msg.content,
                    userName: '系统',
                    timestamp: msg.timestamp,
                    isAI: false,
                  });
                } else {
                  const isAI = msg.role === 'assistant';
                  timeline.push({
                    id: msg.id,
                    type: isAI ? 'ai' : 'chat',
                    content: msg.content,
                    userName: isAI ? 'AI导演' : (msg.userName || currentUserName),
                    timestamp: msg.timestamp,
                    isAI,
                    model: msg.model,
                  });
                }
              });

              // 按时间排序
              timeline.sort((a, b) => a.timestamp - b.timestamp);

              // 搜索过滤
              const filtered = searchQuery.trim()
                ? timeline.filter((m) =>
                    m.content.toLowerCase().includes(searchQuery.toLowerCase()) ||
                    m.userName.toLowerCase().includes(searchQuery.toLowerCase())
                  )
                : timeline;

              if (filtered.length === 0) {
                return searchQuery.trim() ? (
                  <div className="text-center py-12 text-[var(--text-muted)]">
                    <Search className="w-8 h-8 mx-auto mb-3 opacity-40" />
                    <p className="text-sm">无匹配结果</p>
                    <p className="text-xs mt-1 opacity-70">尝试其他关键词</p>
                  </div>
                ) : (
                  <div className="text-center py-12 text-[var(--text-muted)]">
                    <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-[var(--bg-input)] flex items-center justify-center">
                      <MessageSquare className="w-8 h-8 opacity-40" />
                    </div>
                    <p className="text-sm font-medium">暂无批注</p>
                    <p className="text-xs mt-2 opacity-70">输入 @AI 召唤智能助手</p>
                    <p className="text-xs mt-1 opacity-70">或直接输入评论与团队交流</p>
                  </div>
                );
              }

              return (
                <>
                  {filtered.map((msg) => {
                    if (msg.type === 'system') {
                      return (
                        <div key={msg.id} className="text-center text-xs text-red-400 py-1">
                          {msg.content}
                        </div>
                      );
                    }

                    if (msg.isAI) {
                      // AI 消息 - 右侧
                      return (
                        <motion.div
                          key={msg.id}
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          className="flex justify-end"
                        >
                          <div className="max-w-[85%] rounded-2xl rounded-br-sm px-4 py-2.5 bg-purple-500/10 text-[var(--text-primary)] border border-purple-500/20">
                            <div className="flex items-center gap-1.5 mb-1 text-xs text-purple-400">
                              <Bot className="w-3.5 h-3.5" />
                              <span className="font-medium">AI导演</span>
                              {msg.model && <span className="opacity-60">· {msg.model}</span>}
                            </div>
                            <div className="text-sm whitespace-pre-wrap leading-relaxed text-[var(--text-secondary)]">
                              {msg.content}
                            </div>
                            <div className="text-[10px] mt-1.5 text-[var(--text-muted)]">
                              {new Date(msg.timestamp).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}
                            </div>
                          </div>
                        </motion.div>
                      );
                    }

                    // 用户消息 - 左侧卡片格式
                    return (
                      <motion.div
                        key={msg.id}
                        initial={{ opacity: 0, x: -10 }}
                        animate={{ opacity: 1, x: 0 }}
                        className="flex justify-start"
                      >
                        <div className="flex items-start gap-2 max-w-[90%]">
                          {/* 头像 */}
                          <div className="flex-shrink-0 w-7 h-7 rounded-full bg-[var(--bg-input)] border border-[var(--border-color)] flex items-center justify-center overflow-hidden">
                            {msg.userAvatar ? (
                              <img src={msg.userAvatar} alt={msg.userName} className="w-full h-full object-cover" />
                            ) : (
                              <User className="w-4 h-4 text-[var(--text-muted)]" />
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            {/* 用户名和时间 */}
                            <div className="flex items-center gap-2 text-xs mb-0.5">
                              <span className="font-medium text-[var(--text-primary)]">{msg.userName}</span>
                              <span className="text-[var(--text-muted)]">
                                {new Date(msg.timestamp).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}
                              </span>
                            </div>
                            {/* 内容卡片 */}
                            <div className="p-2.5 rounded-lg bg-[var(--bg-input)] border border-[var(--border-color)]">
                              <p className="text-sm text-[var(--text-secondary)] whitespace-pre-wrap">{msg.content}</p>
                            </div>
                          </div>
                        </div>
                      </motion.div>
                    );
                  })}

                  {/* AI加载中 */}
                  {isAILoading && (
                    <motion.div
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="flex justify-end"
                    >
                      <div className="max-w-[85%] rounded-2xl rounded-br-sm px-4 py-2.5 bg-purple-500/10 border border-purple-500/20">
                        <div className="flex items-center gap-2 text-sm text-[var(--text-muted)]">
                          <Loader2 className="w-4 h-4 animate-spin text-purple-400" />
                          <span className="text-purple-400">AI导演思考中...</span>
                        </div>
                      </div>
                    </motion.div>
                  )}
                </>
              );
            })()}
          </div>

          {/* 底部输入框 */}
          <div className="border-t border-[var(--border-color)] bg-[var(--bg-app)] p-3">
            {/* 模型选择器 */}
            <div className="mb-2 flex items-center justify-between">
              <div className="flex items-center gap-2 relative">
                <button
                  onClick={() => setShowModelSelector(!showModelSelector)}
                  className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs transition-all ${
                    selectedModel 
                      ? 'bg-purple-500/10 text-purple-400 border border-purple-500/30' 
                      : 'bg-[var(--bg-input)] text-[var(--text-muted)] hover:text-[var(--text-primary)] border border-[var(--border-color)]'
                  }`}
                  title="选择AI模型"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>{selectedModel || '选择模型'}</span>
                </button>
                {/* 模型选择器 - 悬浮小弹窗 */}
                <AnimatePresence>
                  {showModelSelector && (
                    <motion.div
                      initial={{ opacity: 0, scale: 0.9, y: 5 }}
                      animate={{ opacity: 1, scale: 1, y: 0 }}
                      exit={{ opacity: 0, scale: 0.9, y: 5 }}
                      transition={{ type: 'spring', damping: 20, stiffness: 400 }}
                      className="absolute bottom-full left-0 mb-2 bg-[var(--bg-card)] border border-[var(--border-color)] rounded-lg shadow-xl z-50 min-w-[200px] max-w-[280px]"
                    >
                      {/* 模型列表 */}
                      <div className="py-1 max-h-[300px] overflow-y-auto scrollbar-thin scrollbar-thumb-[var(--border-color)] scrollbar-track-transparent">
                        {availableModels.length === 0 ? (
                          <div className="text-center py-3 text-[var(--text-muted)] text-xs">
                            暂无可用模型
                          </div>
                        ) : (
                          <div className="space-y-0.5">
                            {availableModels.map((model) => {
                              const isSelected = selectedModel === model.name;
                              return (
                                <button
                                  key={model.id}
                                  onClick={() => {
                                    setSelectedModel(model.name);
                                    setShowModelSelector(false);
                                  }}
                                  className={`w-full text-left px-3 py-2 text-xs transition-all rounded-md mx-1 ${
                                    isSelected
                                      ? 'bg-purple-500/20 text-purple-400 font-medium'
                                      : 'text-[var(--text-primary)] hover:bg-[var(--bg-input)]'
                                  }`}
                                >
                                  {model.name}
                                </button>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
              <div className="text-xs text-[var(--text-muted)]">
                输入 @AI 召唤助手
              </div>
            </div>
            
            {/* 输入框 */}
            <div className="flex gap-2">
              <textarea
                ref={textareaRef}
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleSendMessage();
                  }
                }}
                placeholder="输入评论或 @AI 提问..."
                rows={2}
                className="flex-1 px-3 py-2 text-sm bg-[var(--bg-input)] border border-[var(--border-color)] rounded-xl resize-none focus:outline-none focus:ring-2 focus:ring-[var(--accent)] focus:border-transparent transition-all overflow-y-auto"
              />
              <button
                onClick={handleSendMessage}
                disabled={!inputText.trim() || isAILoading}
                className="px-4 py-2 bg-[var(--accent)] text-white rounded-xl hover:bg-[var(--accent)]/90 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center transition-all shadow-sm hover:shadow-md disabled:shadow-none"
                title="发送"
              >
                {isAILoading ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Send className="w-4 h-4" />
                )}
              </button>
            </div>
          </div>

          {/* 回复弹窗 */}
          <AnimatePresence>
            {selectedComment && (
              <motion.div
                initial={{ opacity: 0, y: 20, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 20, scale: 0.98 }}
                transition={{ type: 'spring', damping: 25, stiffness: 300 }}
                className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-[var(--bg-card)] to-[var(--bg-app)] border-t border-[var(--border-color)] p-4 shadow-lg"
              >
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <MessageSquare className="w-4 h-4 text-[var(--accent)]" />
                    <span className="text-sm font-medium text-[var(--text-primary)]">
                      回复 <span className="text-[var(--accent)]">{selectedComment.created_by_name || '评论'}</span>
                    </span>
                  </div>
                  <button 
                    onClick={() => { setSelectedComment(null); setReplyContent(''); }} 
                    className="p-1.5 rounded-lg hover:bg-[var(--bg-input)] text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-all"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
                <textarea
                  value={replyContent}
                  onChange={(e) => setReplyContent(e.target.value)}
                  placeholder="输入回复内容..."
                  rows={3}
                  className="w-full px-3 py-2 text-sm bg-[var(--bg-input)] border border-[var(--border-color)] rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-[var(--accent)] focus:border-transparent transition-all mb-3 overflow-y-auto"
                />
                <button
                  onClick={() => handleReply(selectedComment.id)}
                  disabled={!replyContent.trim()}
                  className="w-full px-4 py-2 text-sm bg-[var(--accent)] text-white rounded-lg hover:bg-[var(--accent)]/90 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 transition-all shadow-sm hover:shadow-md disabled:shadow-none"
                >
                  <Send className="w-4 h-4" />
                  发送回复
                </button>
              </motion.div>
            )}
          </AnimatePresence>
          </motion.div>


        </>
      )}
    </AnimatePresence>
  );
};

export default StoryboardCommentPanel;
