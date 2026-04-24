import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Sparkles, Send, Paperclip, ImagePlus, Plus, History } from 'lucide-react';
import { getAuthToken } from '../../services/auth';
import { useToast } from '../../contexts/ToastContext';
import ChatMessageComponent, { ChatMessageData } from './ChatMessage';
import MediaAttachment from './MediaAttachment';
import HistoryPanel from './HistoryPanel';
import { useAIAssistantSessions } from '../../hooks/useAIAssistantSessions';

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
  scenes?: { id: number; index: number; description?: string }[];
  onClose: () => void;
  onAction?: (action: string, params: any) => void;
}

// ─── Component ──────────────────────────────────────────────────────
const AIAssistantPanel: React.FC<AIAssistantPanelProps> = ({
  projectId,
  currentFrame,
  scenes,
  onClose,
  onAction,
}) => {
  const {
    sessions,
    openTabs,
    activeId,
    activeTab,
    isHistoryOpen,
    setIsHistoryOpen,
    createSession,
    openSession,
    closeTab,
    deleteSession,
    generateTitle,
    appendMessage,
    setTabMessages,
    setTabLoading,
  } = useAIAssistantSessions(projectId);

  const [inputText, setInputText] = useState('');
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [selectedModel, setSelectedModel] = useState('');
  const [modelOptions, setModelOptions] = useState<{ name: string; category?: string; description?: string }[]>([]);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const titleGeneratedRef = useRef<Set<number>>(new Set());
  const { showToast } = useToast();

  const activeMessages = activeTab?.messages || [];
  const isLoading = activeTab?.isLoading || false;
  const streamingId = activeTab?.streamingId || null;

  // ── Auto-scroll ──────────────────────────────────────────────────
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [activeMessages, isLoading, streamingId]);

  // ── Auto-resize textarea ─────────────────────────────────────────
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 72)}px`;
  }, [inputText]);

  // ── Load models ──────────────────────────────────────────────────
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

  // ── Auto-create first session if none open ───────────────────────
  useEffect(() => {
    if (openTabs.length === 0 && !activeId) {
      createSession();
    }
  }, [openTabs.length, activeId]);

  // ── Attach current frame ─────────────────────────────────────────
  const attachCurrentFrame = useCallback(() => {
    if (!currentFrame?.first_frame_url) return;
    if (attachments.some((a) => a.url === currentFrame.first_frame_url)) {
      showToast('当前帧图片已添加', 'info');
      return;
    }
    setAttachments((prev) => [
      ...prev,
      { type: 'image' as const, url: currentFrame.first_frame_url!, name: `帧#${currentFrame.id}` },
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
    if (isLoading || !activeId) return;

    const sessionId = activeId;
    const userMessage: ChatMessageData = {
      id: `msg-${Date.now()}`,
      role: 'user',
      content: text,
      attachments: attachments.length > 0 ? [...attachments] : undefined,
      timestamp: Date.now(),
    };

    appendMessage(sessionId, userMessage as any);
    setInputText('');
    setAttachments([]);
    setTabLoading(sessionId, true);

    const apiMessages = [...activeMessages, userMessage].map((m) => ({
      role: m.role,
      content: m.content,
      attachments: m.attachments,
    }));

    const currentModel = modelOptions.find((m) => m.name === selectedModel);
    const isStream = currentModel?.category?.toUpperCase() === 'MULTIMODAL';

    try {
      const token = getAuthToken();

      if (isStream) {
        const assistantId = `msg-${Date.now()}-ai`;
        setTabLoading(sessionId, true, assistantId);
        appendMessage(sessionId, { id: assistantId, role: 'assistant', content: '', timestamp: Date.now() } as any);

        const res = await fetch('/api/ai-assistant/chat/stream', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({
            sessionId,
            projectId,
            modelName: selectedModel,
            messages: apiMessages,
            context: currentFrame
              ? {
                  frameId: currentFrame.id,
                  frameIndex: currentFrame.index,
                  sceneDescription: currentFrame.scene_description,
                  scenes: scenes?.map((s) => ({ id: s.id, index: s.index, description: s.description })),
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
              if (parsed.error) throw new Error(parsed.error);
              if (parsed.delta) {
                fullContent += parsed.delta;
                setTabMessages(sessionId,
                  activeMessages.concat([
                    userMessage,
                    { id: assistantId, role: 'assistant', content: fullContent, timestamp: Date.now() },
                  ])
                );
              }
            } catch {
              // ignore
            }
          }
        }

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

        setTabMessages(sessionId,
          activeMessages.concat([
            userMessage,
            { id: assistantId, role: 'assistant', content: cleanContent || '(无回复)', suggestions, timestamp: Date.now() },
          ])
        );
        setTabLoading(sessionId, false, null);

        for (const sug of suggestions) {
          if (sug.action === 'generate_frame' || sug.action === 'generate_video') {
            onAction?.(sug.action, sug.params || {});
          }
        }

        // 首次对话后生成标题
        if (!titleGeneratedRef.current.has(sessionId)) {
          titleGeneratedRef.current.add(sessionId);
          generateTitle(sessionId, selectedModel);
        }
      } else {
        const res = await fetch('/api/ai-assistant/chat', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({
            sessionId,
            projectId,
            modelName: selectedModel,
            messages: apiMessages,
            context: currentFrame
              ? {
                  frameId: currentFrame.id,
                  frameIndex: currentFrame.index,
                  sceneDescription: currentFrame.scene_description,
                  scenes: scenes?.map((s) => ({ id: s.id, index: s.index, description: s.description })),
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

        setTabMessages(sessionId, [...activeMessages, userMessage, assistantMessage]);
        setTabLoading(sessionId, false);

        for (const sug of data.suggestions || []) {
          if (sug.action === 'generate_frame' || sug.action === 'generate_video') {
            onAction?.(sug.action, sug.params || {});
          }
        }

        if (!titleGeneratedRef.current.has(sessionId)) {
          titleGeneratedRef.current.add(sessionId);
          generateTitle(sessionId, selectedModel);
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
      setTabMessages(sessionId, [...activeMessages, userMessage, errorMessage]);
      setTabLoading(sessionId, false, null);
    }
  }, [inputText, attachments, isLoading, activeId, activeMessages, projectId, selectedModel, currentFrame, modelOptions]);

  // ── Keyboard shortcut ────────────────────────────────────────────
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      handleSend();
    }
  };

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
      className="flex flex-col h-full bg-[var(--bg-app)] border-l border-[var(--border-color)] w-full relative"
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
            onClick={() => createSession()}
            className="p-1 rounded hover:bg-[var(--bg-input)] text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
            title="新建会话"
          >
            <Plus size={15} />
          </button>
          <button
            onClick={() => setIsHistoryOpen(true)}
            className="p-1 rounded hover:bg-[var(--bg-input)] text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
            title="历史会话"
          >
            <History size={15} />
          </button>
        </div>
      </div>

      {/* ─ Tab bar ─────────────────────────────────────────── */}
      {openTabs.length > 0 && (
        <div className="flex items-center gap-1 px-2 py-1.5 border-b border-[var(--border-color)] overflow-x-auto">
          {openTabs.map((tab) => {
            const session = sessions.find((s) => s.id === tab.id);
            const isActive = tab.id === activeId;
            return (
              <div
                key={tab.id}
                onClick={() => openSession(tab.id)}
                className={`group flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] cursor-pointer whitespace-nowrap transition-colors max-w-[120px] ${
                  isActive
                    ? 'bg-[var(--accent)]/15 text-[var(--accent)] font-medium'
                    : 'bg-[var(--bg-input)] text-[var(--text-muted)] hover:text-[var(--text-primary)]'
                }`}
              >
                <span className="truncate">{session?.title || '新会话'}</span>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    closeTab(tab.id);
                  }}
                  className="opacity-0 group-hover:opacity-100 p-0.5 rounded hover:bg-black/10 transition-opacity"
                >
                  <span className="text-[10px] leading-none">&times;</span>
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/* ─ Messages list ───────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto px-3 py-3 space-y-3">
        {activeMessages.map((msg) => (
          <ChatMessageComponent key={msg.id} message={msg as ChatMessageData} onAction={handleAction} />
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

      {/* ─ Current frame quick attach ──────────────────────── */}
      {currentFrame?.first_frame_url && (
        <div className="px-3 pt-2">
          <button
            onClick={attachCurrentFrame}
            className="flex items-center gap-1 text-xs text-[var(--accent)] hover:text-[var(--accent-light)] transition-colors"
          >
            <ImagePlus size={12} />
            附加当前帧图片
          </button>
        </div>
      )}

      {/* ─ Unified Input container (Qoder-like) ─────────────── */}
      <div className="p-3">
        <div className="rounded-xl border border-[var(--border-color)] bg-[var(--bg-input)] focus-within:ring-1 focus-within:ring-[var(--accent)] focus-within:border-[var(--accent)] transition-all overflow-hidden">
          {attachments.length > 0 && (
            <div className="px-2.5 pt-2.5 pb-1 flex gap-2 flex-wrap">
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

          <textarea
            ref={textareaRef}
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={activeId ? '输入消息，Ctrl+Enter 发送...' : '请先新建会话'}
            rows={1}
            disabled={!activeId}
            className="w-full resize-none text-xs px-3 py-2 bg-transparent border-none text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none max-h-[96px] leading-relaxed disabled:opacity-50"
          />

          <div className="flex items-center justify-between gap-2 px-2 pb-2 pt-0.5">
            <div className="flex items-center min-w-0 flex-1">
              <select
                value={selectedModel}
                onChange={(e) => setSelectedModel(e.target.value)}
                disabled={!activeId}
                className="max-w-full text-[11px] px-2 py-1 rounded-md bg-transparent hover:bg-[var(--bg-app)] border border-[var(--border-color)]/60 text-[var(--text-muted)] hover:text-[var(--text-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--accent)] cursor-pointer truncate disabled:opacity-50"
              >
                {modelOptions.length === 0 && <option value="" disabled>加载模型中...</option>}
                {modelOptions.map((m) => (
                  <option key={m.name} value={m.name}>{m.name}</option>
                ))}
              </select>
            </div>

            <div className="flex items-center gap-1 flex-shrink-0">
              <button
                onClick={openMediaPicker}
                disabled={!activeId}
                className="p-1.5 rounded-md hover:bg-[var(--bg-app)] text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors disabled:opacity-50"
              >
                <Paperclip size={14} />
              </button>
              <button
                onClick={handleSend}
                disabled={isLoading || !activeId || (!inputText.trim() && attachments.length === 0)}
                className="p-1.5 rounded-md bg-[var(--accent)] text-white hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed transition-opacity"
              >
                <Send size={14} />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* History panel overlay */}
      {isHistoryOpen && (
        <HistoryPanel
          sessions={sessions}
          openTabIds={openTabs.map((t) => t.id)}
          onOpen={openSession}
          onDelete={deleteSession}
          onClose={() => setIsHistoryOpen(false)}
        />
      )}

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
