import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Sparkles, X, Send, Paperclip, ImagePlus, Trash2 } from 'lucide-react';
import { getAuthToken } from '../../services/auth';
import { useToast } from '../../contexts/ToastContext';
import ChatMessageComponent, { ChatMessageData } from './ChatMessage';
import MediaAttachment from './MediaAttachment';

// ─── Types ──────────────────────────────────────────────────────────
interface Attachment {
  type: 'image' | 'video' | 'file';
  url: string;
  name?: string;
}

export interface AIAssistantPanelProps {
  projectId: number | null;
  currentFrame?: {
    id: number;
    index?: number;
    first_frame_url?: string;
    last_frame_url?: string;
    video_url?: string;
    scene_description?: string;
  } | null;
  /** 项目中所有分镜的简要列表（用于AI识别"第几个分镜"） */
  scenes?: { id: number; index: number; description?: string }[];
  onClose: () => void;
  onAction?: (action: string, params: any) => void;
}

// ─── Welcome message ────────────────────────────────────────────────
const WELCOME_MESSAGE: ChatMessageData = {
  id: 'welcome',
  role: 'assistant',
  content:
    '你好！我是AI助手，可以帮你分析图片、视频和文档内容。你可以发送当前分镜帧让我进行分析，或者直接提问。',
  timestamp: Date.now(),
};

// ─── Component ──────────────────────────────────────────────────────
const AIAssistantPanel: React.FC<AIAssistantPanelProps> = ({
  projectId,
  currentFrame,
  scenes,
  onClose,
  onAction,
}) => {
  const [messages, setMessages] = useState<ChatMessageData[]>([WELCOME_MESSAGE]);
  const [inputText, setInputText] = useState('');
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedModel, setSelectedModel] = useState('');
  const [streamingId, setStreamingId] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { showToast } = useToast();

  // ── localStorage key ─────────────────────────────────────────────
  const storageKey = projectId ? `ai_chat_${projectId}` : 'ai_chat_global';

  const loadMessages = useCallback(() => {
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw) {
        const parsed = JSON.parse(raw) as ChatMessageData[];
        if (Array.isArray(parsed) && parsed.length > 0) {
          setMessages(parsed);
          return;
        }
      }
    } catch {
      // ignore parse error
    }
    setMessages([WELCOME_MESSAGE]);
  }, [storageKey]);

  const saveMessages = useCallback((msgs: ChatMessageData[]) => {
    try {
      localStorage.setItem(storageKey, JSON.stringify(msgs));
    } catch {
      // ignore storage error (e.g. quota exceeded)
    }
  }, [storageKey]);

  const clearMessages = useCallback(() => {
    localStorage.removeItem(storageKey);
    setMessages([WELCOME_MESSAGE]);
    showToast('对话记录已清空', 'info');
  }, [storageKey, showToast]);

  // ── Load messages on mount ───────────────────────────────────────
  useEffect(() => {
    loadMessages();
  }, [loadMessages]);

  // ── Persist messages on change ───────────────────────────────────
  useEffect(() => {
    // 不保存只有 welcome message 的空会话
    if (messages.length > 1 || (messages.length === 1 && messages[0].id !== 'welcome')) {
      saveMessages(messages);
    }
  }, [messages, saveMessages]);

  // ── Auto-scroll to bottom ────────────────────────────────────────
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading, streamingId]);

  // ── Auto-resize textarea (max 3 rows) ────────────────────────────
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 72)}px`; // ~3 rows
  }, [inputText]);

  // ── Load available multimodal models ─────────────────────────────
  const [modelOptions, setModelOptions] = useState<{ name: string; category?: string; description?: string }[]>([]);

  useEffect(() => {
    const fetchModels = async () => {
      try {
        const token = getAuthToken();
        const res = await fetch('/api/ai-models', {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        if (res.ok) {
          const data = await res.json();
          const all: { name: string; type?: string; category?: string; description?: string }[] =
            data.models || [];
          // AI 助手只使用 MULTIMODAL 模型（多模态理解模型既能处理文本也能处理图像/视频）
          const multimodalModels = all.filter(
            (m) => (m.type || m.category || '').toUpperCase() === 'MULTIMODAL'
          );
          setModelOptions(multimodalModels);
          if (multimodalModels.length > 0 && !selectedModel) {
            setSelectedModel(multimodalModels[0].name);
          }
        }
      } catch (err) {
        console.error('[AIAssistant] Failed to load models:', err);
      }
    };
    fetchModels();
  }, []);

  // ── Attach current frame ─────────────────────────────────────────
  const attachCurrentFrame = useCallback(() => {
    if (!currentFrame?.first_frame_url) return;
    // Avoid duplicate
    if (attachments.some((a) => a.url === currentFrame.first_frame_url)) {
      showToast('当前帧图片已添加', 'info');
      return;
    }
    setAttachments((prev) => [
      ...prev,
      {
        type: 'image' as const,
        url: currentFrame.first_frame_url!,
        name: `帧#${currentFrame.id}`,
      },
    ]);
  }, [currentFrame, attachments, showToast]);

  // ── File picker ──────────────────────────────────────────────────
  const openMediaPicker = () => fileInputRef.current?.click();

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;
    Array.from(files).forEach((file) => {
      const url = URL.createObjectURL(file);
      let type: Attachment['type'] = 'file';
      if (file.type.startsWith('image/')) type = 'image';
      else if (file.type.startsWith('video/')) type = 'video';
      setAttachments((prev) => [...prev, { type, url, name: file.name }]);
    });
    e.target.value = '';
  };

  const removeAttachment = (index: number) => {
    setAttachments((prev) => prev.filter((_, i) => i !== index));
  };

  // ── Send message ─────────────────────────────────────────────────
  const handleSend = useCallback(async () => {
    const text = inputText.trim();
    if (!text && attachments.length === 0) return;
    if (isLoading) return;

    const userMessage: ChatMessageData = {
      id: `msg-${Date.now()}`,
      role: 'user',
      content: text,
      attachments: attachments.length > 0 ? [...attachments] : undefined,
      timestamp: Date.now(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInputText('');
    setAttachments([]);
    setIsLoading(true);

    // Build messages payload for API
    const apiMessages = [...messages.filter((m) => m.id !== 'welcome'), userMessage].map((m) => ({
      role: m.role,
      content: m.content,
      attachments: m.attachments,
    }));

    // 判断当前模型是否支持流式
    const currentModel = modelOptions.find((m) => m.name === selectedModel);
    const isStream = currentModel?.category?.toUpperCase() === 'MULTIMODAL';

    try {
      const token = getAuthToken();

      if (isStream) {
        // ── 流式模式 ──────────────────────────────────────────────
        const assistantId = `msg-${Date.now()}-ai`;
        setStreamingId(assistantId);
        setMessages((prev) => [
          ...prev,
          { id: assistantId, role: 'assistant', content: '', timestamp: Date.now() },
        ]);

        const res = await fetch('/api/ai-assistant/chat/stream', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({
            projectId,
            modelName: selectedModel,
            messages: apiMessages,
            context: currentFrame
              ? {
                  frameId: currentFrame.id,
                  frameIndex: currentFrame.index,
                  sceneDescription: currentFrame.scene_description,
                  scenes: scenes?.map((s) => ({
                    id: s.id,
                    index: s.index,
                    description: s.description,
                  })),
                }
              : undefined,
          }),
        });

        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          throw new Error(errData.message || `请求失败 (${res.status})`);
        }

        const reader = res.body?.getReader();
        if (!reader) throw new Error('无法读取响应流');

        const decoder = new TextDecoder('utf-8');
        let buffer = '';
        let fullContent = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            if (!line.trim() || !line.startsWith('data: ')) continue;
            const data = line.slice(6);
            if (data === '[DONE]') continue;
            try {
              const parsed = JSON.parse(data);
              if (parsed.error) {
                throw new Error(parsed.error);
              }
              if (parsed.delta) {
                fullContent += parsed.delta;
                setMessages((prev) =>
                  prev.map((m) =>
                    m.id === assistantId ? { ...m, content: fullContent } : m
                  )
                );
              }
            } catch {
              // ignore parse errors for non-delta events
            }
          }
        }

        // 解析建议
        const suggestionMatch = fullContent.match(/\[SUGGESTIONS\](.*?)\[\/SUGGESTIONS\]/s);
        let suggestions: any[] = [];
        let cleanContent = fullContent;
        if (suggestionMatch) {
          try {
            const parsed = JSON.parse(suggestionMatch[1]);
            suggestions = parsed.suggestions || [];
            cleanContent = fullContent.replace(/\[SUGGESTIONS\].*?\[\/SUGGESTIONS\]/s, '').trim();
          } catch { /* ignore */ }
        }

        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantId
              ? { ...m, content: cleanContent || '(无回复)', suggestions }
              : m
          )
        );
        setStreamingId(null);

        // 自动执行生成类 action
        for (const sug of suggestions) {
          if (sug.action === 'generate_frame' || sug.action === 'generate_video') {
            onAction?.(sug.action, sug.params || {});
          }
        }
      } else {
        // ── 非流式模式 ────────────────────────────────────────────
        const res = await fetch('/api/ai-assistant/chat', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({
            projectId,
            modelName: selectedModel,
            messages: apiMessages,
            context: currentFrame
              ? {
                  frameId: currentFrame.id,
                  frameIndex: currentFrame.index,
                  sceneDescription: currentFrame.scene_description,
                  scenes: scenes?.map((s) => ({
                    id: s.id,
                    index: s.index,
                    description: s.description,
                  })),
                }
              : undefined,
          }),
        });

        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          throw new Error(errData.message || `请求失败 (${res.status})`);
        }

        const data = await res.json();

        const assistantMessage: ChatMessageData = {
          id: `msg-${Date.now()}-ai`,
          role: 'assistant',
          content: data.reply || data.content || data.message || '(无回复)',
          suggestions: data.suggestions,
          timestamp: Date.now(),
        };

        setMessages((prev) => [...prev, assistantMessage]);

        // 自动执行生成类 action
        for (const sug of data.suggestions || []) {
          if (sug.action === 'generate_frame' || sug.action === 'generate_video') {
            onAction?.(sug.action, sug.params || {});
          }
        }
      }
    } catch (err: any) {
      console.error('[AIAssistant] Chat error:', err);

      const errorMessage: ChatMessageData = {
        id: `msg-${Date.now()}-err`,
        role: 'system',
        content: `⚠️ ${err.message || '请求失败，请稍后重试'}`,
        timestamp: Date.now(),
      };

      setMessages((prev) => [...prev, errorMessage]);
      setStreamingId(null);
    } finally {
      setIsLoading(false);
    }
  }, [inputText, attachments, isLoading, messages, projectId, selectedModel, currentFrame, modelOptions]);

  // ── Keyboard shortcut ────────────────────────────────────────────
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      handleSend();
    }
  };

  // ── Handle AI suggestion action ──────────────────────────────────
  const handleAction = (action: string, params: any) => {
    onAction?.(action, params);
  };

  // ── Drag & Drop ──────────────────────────────────────────────────
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const files = e.dataTransfer.files;
    if (!files.length) return;
    Array.from(files).forEach((file) => {
      const url = URL.createObjectURL(file);
      let type: Attachment['type'] = 'file';
      if (file.type.startsWith('image/')) type = 'image';
      else if (file.type.startsWith('video/')) type = 'video';
      setAttachments((prev) => [...prev, { type, url, name: file.name }]);
    });
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  // ── Render ───────────────────────────────────────────────────────
  return (
    <div
      className="flex flex-col h-full bg-[var(--bg-app)] border-l border-[var(--border-color)] w-full"
      onDrop={handleDrop}
      onDragOver={handleDragOver}
    >
      {/* ─ Header ──────────────────────────────────────────── */}
      <div className="flex items-center justify-between px-3 py-2.5 border-b border-[var(--border-color)] bg-[var(--bg-nav)]">
        <div className="flex items-center gap-2">
          <Sparkles size={15} className="text-[var(--accent)]" />
          <span className="font-semibold text-sm text-[var(--text-primary)]">AI 助手</span>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={clearMessages}
            className="p-1 rounded hover:bg-[var(--bg-input)] text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
            title="清空对话"
          >
            <Trash2 size={14} />
          </button>
          <button
            onClick={onClose}
            className="p-1 rounded hover:bg-[var(--bg-input)] text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
            title="关闭"
          >
            <X size={15} />
          </button>
        </div>
      </div>

      {/* ─ Model selector ──────────────────────────────────── */}
      <div className="px-3 py-2 border-b border-[var(--border-color)]">
        <select
          value={selectedModel}
          onChange={(e) => setSelectedModel(e.target.value)}
          className="w-full text-xs px-2 py-1.5 rounded-md bg-[var(--bg-input)] border border-[var(--border-color)] text-[var(--text-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--accent)] appearance-none cursor-pointer"
        >
          {modelOptions.length === 0 && (
            <option value="" disabled>
              加载模型中...
            </option>
          )}
          {modelOptions.map((m) => (
            <option key={m.name} value={m.name}>
              {m.name}
            </option>
          ))}
        </select>
      </div>

      {/* ─ Messages list ───────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto px-3 py-3 space-y-3">
        {messages.map((msg) => (
          <ChatMessageComponent key={msg.id} message={msg} onAction={handleAction} />
        ))}
        {isLoading && (
          <ChatMessageComponent
            message={{
              id: 'loading',
              role: 'assistant',
              content: '',
              timestamp: Date.now(),
              isLoading: true,
            }}
          />
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* ─ Attachments preview ─────────────────────────────── */}
      {attachments.length > 0 && (
        <div className="px-3 py-2 border-t border-[var(--border-color)] flex gap-2 flex-wrap">
          {attachments.map((att, idx) => (
            <MediaAttachment
              key={`${att.url}-${idx}`}
              type={att.type}
              url={att.url}
              name={att.name}
              removable
              onRemove={() => removeAttachment(idx)}
              size="sm"
            />
          ))}
        </div>
      )}

      {/* ─ Current frame quick attach ──────────────────────── */}
      {currentFrame?.first_frame_url && (
        <div className="px-3 py-1.5 border-t border-[var(--border-color)]">
          <button
            onClick={attachCurrentFrame}
            className="flex items-center gap-1 text-xs text-[var(--accent)] hover:text-[var(--accent-light)] transition-colors"
          >
            <ImagePlus size={12} />
            附加当前帧图片
          </button>
        </div>
      )}

      {/* ─ Input area ──────────────────────────────────────── */}
      <div className="px-3 py-2 border-t border-[var(--border-color)] flex items-end gap-2">
        <button
          onClick={openMediaPicker}
          className="p-1.5 rounded hover:bg-[var(--bg-input)] text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors flex-shrink-0 mb-0.5"
          title="添加附件"
        >
          <Paperclip size={15} />
        </button>

        <textarea
          ref={textareaRef}
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="输入消息，Ctrl+Enter 发送..."
          rows={1}
          className="flex-1 resize-none text-xs px-2.5 py-1.5 rounded-lg bg-[var(--bg-input)] border border-[var(--border-color)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:ring-1 focus:ring-[var(--accent)] max-h-[72px] leading-relaxed"
        />

        <button
          onClick={handleSend}
          disabled={isLoading || (!inputText.trim() && attachments.length === 0)}
          className="p-1.5 rounded-lg bg-[var(--accent)] text-white hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed transition-opacity flex-shrink-0 mb-0.5"
          title="发送 (Ctrl+Enter)"
        >
          <Send size={15} />
        </button>
      </div>

      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        className="hidden"
        multiple
        accept="image/*,video/*,.pdf,.txt,.doc,.docx"
        onChange={handleFileChange}
      />
    </div>
  );
};

export default AIAssistantPanel;
