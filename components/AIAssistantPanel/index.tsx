import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { Sparkles, X, Send, Paperclip, ImagePlus, Trash2, Wand2, FileText, Settings, Image as ImageIcon, Loader2, History, Plus, Edit3, Check, MessageSquare } from 'lucide-react';
import { getAuthToken } from '../../services/auth';
import { useToast } from '../../contexts/ToastContext';
import ChatMessageComponent, { ChatMessageData } from './ChatMessage';
import MediaAttachment from './MediaAttachment';
import { runSession as runAssistantSession, cancelSession as cancelAssistantSession, isLongTaskCapable } from '../../services/aiAssistant';
import { getWorkflowStatus, type WorkflowJob } from '../../hooks/useWorkflow';

// ─── Types ──────────────────────────────────────────────────────────
interface Attachment {
  type: 'image' | 'video' | 'file' | 'script';
  url: string;
  name?: string;
  /** 剧本附件的文本内容（AI 上下文用） */
  textContent?: string;
}

export interface AIAssistantPanelProps {
  projectId: number | null;
  /** 项目名称，注入系统提示词供 AI 理解上下文 */
  projectName?: string | null;
  /** 项目描述，注入系统提示词 */
  projectDescription?: string | null;
  currentFrame?: {
    id: number;
    index?: number;
    first_frame_url?: string;
    last_frame_url?: string;
    video_url?: string;
    scene_description?: string;
  } | null;
  /** 项目中所有分镜清单（AI 用来识别"第几个分镜"、质检降级、上下文推理） */
  scenes?: {
    id: number;
    index: number;
    description?: string;
    first_frame_url?: string;
    last_frame_url?: string;
    video_url?: string;
    first_frame_prompt?: string;
    last_frame_prompt?: string;
    video_prompt?: string;
  }[];
  /** 项目角色清单（AI 可基于此推理 action 参数） */
  characters?: { id: number; name: string; description?: string }[];
  /** 项目场景清单 */
  locations?: { id: number; name: string; description?: string }[];
  /** 项目剧本清单 */
  scripts?: { id: number; episode_number: number; title?: string }[];
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
  projectName,
  projectDescription,
  currentFrame,
  scenes,
  characters,
  locations,
  scripts,
  onClose,
  onAction,
}) => {
  const [messages, setMessages] = useState<ChatMessageData[]>([WELCOME_MESSAGE]);
  const [inputText, setInputText] = useState('');
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedModel, setSelectedModel] = useState('');
  const [streamingId, setStreamingId] = useState<string | null>(null);

  // ── Per-session 独立状态 ───────────────────────────────────
  const messagesCacheRef = useRef<Map<number | null, ChatMessageData[]>>(new Map());
  const loadingSessionsRef = useRef<Set<number | null>>(new Set());
  const streamingSessionsRef = useRef<Map<number | null, string>>(new Map());
  // 响应式状态，驱动标签页加载指示器重绘
  const [loadingSessionIds, setLoadingSessionIds] = useState<Set<number | null>>(new Set());

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const scriptInputRef = useRef<HTMLInputElement>(null);
  const { showToast } = useToast();

  // ── 提示词增强 / 压缩 / 设置面板状态 ───────────────
  const [isEnhancing, setIsEnhancing] = useState(false);
  const [isCompressing, setIsCompressing] = useState(false);
  const [showSettings, setShowSettings] = useState(false);

  // ── 设置项：上下文注入开关 / 历史消息上限 ───────────
  const SETTINGS_KEY = 'ai_assistant_settings_v1';
  const [includeContext, setIncludeContext] = useState(true);
  const [historyLimit, setHistoryLimit] = useState<number>(50);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(SETTINGS_KEY);
      if (raw) {
        const s = JSON.parse(raw);
        if (typeof s.includeContext === 'boolean') setIncludeContext(s.includeContext);
        if (typeof s.historyLimit === 'number') setHistoryLimit(s.historyLimit);
      }
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify({ includeContext, historyLimit }));
    } catch { /* ignore */ }
  }, [includeContext, historyLimit]);

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

  // ── Sessions 管理（一个项目一个历史记录） ─────────────────────────
  interface SessionLite {
    id: number;
    title: string;
    model_name: string | null;
    message_count: number;
    last_message_at: string | null;
    created_at: string;
  }
  const [sessions, setSessions] = useState<SessionLite[]>([]);
  const [currentSessionId, setCurrentSessionId] = useState<number | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const [editingTitleId, setEditingTitleId] = useState<number | null>(null);
  const [editingTitleDraft, setEditingTitleDraft] = useState('');
  const currentSessionIdRef = useRef<number | null>(null);
  useEffect(() => { currentSessionIdRef.current = currentSessionId; }, [currentSessionId]);

  const activeSessionKey = useMemo(
    () => (projectId ? `ai_active_session_${projectId}` : 'ai_active_session_global'),
    [projectId]
  );

  const fetchSessions = useCallback(async () => {
    try {
      const token = getAuthToken();
      const url = projectId
        ? `/api/ai-assistant/sessions?projectId=${projectId}`
        : '/api/ai-assistant/sessions';
      const res = await fetch(url, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
      if (!res.ok) return [] as SessionLite[];
      const data = await res.json();
      if (data.success) {
        setSessions(data.sessions || []);
        return (data.sessions || []) as SessionLite[];
      }
    } catch (err) {
      console.error('[AIAssistant] fetch sessions failed:', err);
    }
    return [] as SessionLite[];
  }, [projectId]);

  const apiCreateSession = useCallback(async (title = '新会话'): Promise<number | null> => {
    try {
      const token = getAuthToken();
      const res = await fetch('/api/ai-assistant/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ projectId: projectId || null, title, modelName: selectedModel || null }),
      });
      const data = await res.json();
      if (data.success && data.session) {
        setSessions((prev) => [data.session, ...prev.filter((s) => s.id !== data.session.id)]);
        return data.session.id as number;
      }
    } catch (err) {
      console.error('[AIAssistant] create session failed:', err);
    }
    return null;
  }, [projectId, selectedModel]);

  const archiveMessage = useCallback(async (sessionId: number, msg: ChatMessageData) => {
    try {
      const token = getAuthToken();
      const body: any = {
        role: msg.role,
        content: typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content),
      };
      if (msg.attachments && msg.attachments.length > 0) body.attachments = msg.attachments;
      if (msg.suggestions && msg.suggestions.length > 0) body.suggestions = msg.suggestions;
      await fetch(`/api/ai-assistant/sessions/${sessionId}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify(body),
      });
    } catch (err) {
      console.error('[AIAssistant] archive message failed:', err);
    }
  }, []);

  const switchSession = useCallback(async (sessionId: number) => {
    // 保存当前会话的消息到缓存
    const prevSid = currentSessionIdRef.current;
    if (prevSid !== null) {
      messagesCacheRef.current.set(prevSid, messages);
    }
    // 先尝试从缓存恢复，若缓存有则立即显示
    const cached = messagesCacheRef.current.get(sessionId);
    if (cached && cached.length > 0) {
      setCurrentSessionId(sessionId);
      try { localStorage.setItem(activeSessionKey, String(sessionId)); } catch { /* ignore */ }
      setMessages(cached);
      // 恢复该会话的 loading / streaming 状态
      setIsLoading(loadingSessionsRef.current.has(sessionId));
      setStreamingId(streamingSessionsRef.current.get(sessionId) || null);
      setShowHistory(false);
      return;
    }
    // 无缓存则从后端加载
    try {
      const token = getAuthToken();
      const res = await fetch(`/api/ai-assistant/sessions/${sessionId}/messages`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      const data = await res.json();
      if (data.success) {
        const loaded = (data.messages || []) as ChatMessageData[];
        const msgs = loaded.length > 0 ? loaded : [WELCOME_MESSAGE];
        messagesCacheRef.current.set(sessionId, msgs);
        setCurrentSessionId(sessionId);
        try { localStorage.setItem(activeSessionKey, String(sessionId)); } catch { /* ignore */ }
        setMessages(msgs);
        setIsLoading(loadingSessionsRef.current.has(sessionId));
        setStreamingId(streamingSessionsRef.current.get(sessionId) || null);
        setShowHistory(false);
      } else {
        showToast(data.error || '加载会话失败', 'error');
      }
    } catch (err: any) {
      console.error('[AIAssistant] switch session failed:', err);
      showToast(err.message || '加载会话失败', 'error');
    }
  }, [activeSessionKey, showToast, messages]);

  const createNewSession = useCallback(async () => {
    // 保存当前会话的消息到缓存
    const prevSid = currentSessionIdRef.current;
    if (prevSid !== null) {
      messagesCacheRef.current.set(prevSid, messages);
    }
    const id = await apiCreateSession();
    if (id) {
      setCurrentSessionId(id);
      try { localStorage.setItem(activeSessionKey, String(id)); } catch { /* ignore */ }
      setMessages([WELCOME_MESSAGE]);
      setIsLoading(false);
      setStreamingId(null);
      setShowHistory(false);
      showToast('已创建新对话', 'success');
    } else {
      showToast('创建会话失败', 'error');
    }
  }, [apiCreateSession, activeSessionKey, showToast, messages]);

  const deleteSessionFn = useCallback(async (sessionId: number) => {
    try {
      const token = getAuthToken();
      const res = await fetch(`/api/ai-assistant/sessions/${sessionId}`, {
        method: 'DELETE',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      const data = await res.json();
      if (data.success) {
        setSessions((prev) => prev.filter((s) => s.id !== sessionId));
        // 清理该会话的缓存和状态
        messagesCacheRef.current.delete(sessionId);
        loadingSessionsRef.current.delete(sessionId);
        streamingSessionsRef.current.delete(sessionId);
        if (currentSessionIdRef.current === sessionId) {
          setCurrentSessionId(null);
          try { localStorage.removeItem(activeSessionKey); } catch { /* ignore */ }
          setMessages([WELCOME_MESSAGE]);
          setIsLoading(false);
          setStreamingId(null);
        }
        showToast('会话已删除', 'success');
      }
    } catch (err) {
      console.error('[AIAssistant] delete session failed:', err);
    }
  }, [activeSessionKey, showToast]);

  const renameSessionFn = useCallback(async (sessionId: number, title: string) => {
    const trimmed = title.trim();
    if (!trimmed) return;
    try {
      const token = getAuthToken();
      const res = await fetch(`/api/ai-assistant/sessions/${sessionId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ title: trimmed }),
      });
      const data = await res.json();
      if (data.success) {
        setSessions((prev) => prev.map((s) => (s.id === sessionId ? { ...s, title: trimmed } : s)));
      }
    } catch (err) {
      console.error('[AIAssistant] rename session failed:', err);
    }
  }, []);

  // 项目切换时拉取会话列表，并尝试恢复最近激活的会话
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const list = await fetchSessions();
      if (cancelled) return;
      let activeId: number | null = null;
      try {
        const raw = localStorage.getItem(activeSessionKey);
        if (raw) {
          const id = Number(raw);
          if (id && list.some((s) => s.id === id)) activeId = id;
        }
      } catch { /* ignore */ }
      if (activeId) {
        switchSession(activeId);
      } else {
        setCurrentSessionId(null);
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  // ── Load messages on mount ───────────────────────────────────────
  useEffect(() => {
    loadMessages();
  }, [loadMessages]);

  // ── Persist messages on change ───────────────────────────────────
  useEffect(() => {
    // 不保存只有 welcome message 的空会话
    if (messages.length > 1 || (messages.length === 1 && messages[0].id !== 'welcome')) {
      saveMessages(messages);
      // 同步到 per-session 缓存
      const sid = currentSessionIdRef.current;
      if (sid !== null) messagesCacheRef.current.set(sid, messages);
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
  const openImagePicker = () => imageInputRef.current?.click();
  const openScriptPicker = () => scriptInputRef.current?.click();

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

  // 图片专用（只收 image/*）
  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;
    Array.from(files).forEach((file) => {
      if (!file.type.startsWith('image/')) {
        showToast(`忽略非图片文件：${file.name}`, 'warning');
        return;
      }
      const url = URL.createObjectURL(file);
      setAttachments((prev) => [...prev, { type: 'image', url, name: file.name }]);
    });
    e.target.value = '';
  };

  // 剧本文件专用：读取文本内容并作为上下文 chip
  const handleScriptChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;
    for (const file of Array.from(files)) {
      try {
        const text = await file.text();
        const trimmed = text.trim();
        if (!trimmed) {
          showToast(`剧本文件为空：${file.name}`, 'warning');
          continue;
        }
        // 最多截断 60k 字符防止上下文超载
        const MAX_CHARS = 60000;
        const content = trimmed.length > MAX_CHARS
          ? trimmed.slice(0, MAX_CHARS) + `\n\n[…剧本过长已截断，原文 ${trimmed.length} 字符…]`
          : trimmed;
        setAttachments((prev) => [...prev, {
          type: 'script',
          url: '',
          name: file.name,
          textContent: content,
        }]);
        showToast(`剧本已加载：${file.name}（${trimmed.length} 字符）`, 'success');
      } catch (err) {
        console.error('[AIAssistant] 剧本读取失败:', err);
        showToast(`无法读取剧本：${file.name}`, 'error');
      }
    }
    e.target.value = '';
  };

  // 提示词增强
  const handleEnhancePrompt = useCallback(async () => {
    const text = inputText.trim();
    if (!text) {
      showToast('请先输入想要增强的 prompt', 'info');
      return;
    }
    if (!selectedModel) {
      showToast('请先选择模型', 'warning');
      return;
    }
    setIsEnhancing(true);
    try {
      const token = getAuthToken();
      const res = await fetch('/api/ai-assistant/enhance-prompt', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          projectId,
          modelName: selectedModel,
          prompt: text,
          context: { projectName: projectName || undefined },
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success) {
        throw new Error(data.error || `请求失败 (${res.status})`);
      }
      if (data.enhanced) {
        setInputText(data.enhanced);
        showToast('提示词已增强', 'success');
      }
    } catch (err: any) {
      showToast(err.message || '提示词增强失败', 'error');
    } finally {
      setIsEnhancing(false);
    }
  }, [inputText, selectedModel, projectId, projectName, showToast]);

  // 压缩历史对话
  const handleCompressContext = useCallback(async () => {
    const realMsgs = messages.filter((m) => m.id !== 'welcome' && m.role !== 'system');
    if (realMsgs.length < 2) {
      showToast('对话太短，无需压缩', 'info');
      return;
    }
    if (!selectedModel) {
      showToast('请先选择模型', 'warning');
      return;
    }
    setIsCompressing(true);
    try {
      const token = getAuthToken();
      const res = await fetch('/api/ai-assistant/compress', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          projectId,
          modelName: selectedModel,
          messages: realMsgs.map((m) => ({ role: m.role, content: m.content })),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success) {
        throw new Error(data.error || `请求失败 (${res.status})`);
      }
      const summaryMsg: ChatMessageData = {
        id: `msg-compressed-${Date.now()}`,
        role: 'system',
        content: `📜 已压缩前 ${realMsgs.length} 条对话为摘要：\n\n${data.summary}`,
        timestamp: Date.now(),
      };
      setMessages([WELCOME_MESSAGE, summaryMsg]);
      showToast(`对话已压缩：${realMsgs.length} 条 → 1 段摘要`, 'success');
      setShowSettings(false);
    } catch (err: any) {
      showToast(err.message || '压缩失败', 'error');
    } finally {
      setIsCompressing(false);
    }
  }, [messages, selectedModel, projectId, showToast]);

  const removeAttachment = (index: number) => {
    setAttachments((prev) => prev.filter((_, i) => i !== index));
  };

  // ── Send message ─────────────────────────────────────────────────
  // 辅助函数：更新指定会话的消息（缓存 + 当前显示）
  const updateSessionMessages = useCallback(
    (targetSid: number | null, updater: (prev: ChatMessageData[]) => ChatMessageData[]) => {
      if (targetSid !== null) {
        const prev = messagesCacheRef.current.get(targetSid) || [];
        const next = updater(prev);
        messagesCacheRef.current.set(targetSid, next);
      }
      // 只有当前正在查看的会话才更新界面
      if (currentSessionIdRef.current === targetSid) {
        setMessages(updater);
      }
    },
    []
  );
  const setSessionLoading = useCallback((targetSid: number | null, loading: boolean) => {
    if (loading) loadingSessionsRef.current.add(targetSid);
    else loadingSessionsRef.current.delete(targetSid);
    // 更新响应式状态，驱动标签页重绘
    setLoadingSessionIds(new Set(loadingSessionsRef.current));
    if (currentSessionIdRef.current === targetSid) setIsLoading(loading);
  }, []);
  const setSessionStreaming = useCallback((targetSid: number | null, streamId: string | null) => {
    if (streamId) streamingSessionsRef.current.set(targetSid, streamId);
    else streamingSessionsRef.current.delete(targetSid);
    if (currentSessionIdRef.current === targetSid) setStreamingId(streamId);
  }, []);

  const handleSend = useCallback(async () => {
    const text = inputText.trim();
    if (!text && attachments.length === 0) return;
    if (isLoading) return;

    // 剧本附件的 textContent 自动拼接到消息文本中作为上下文
    const scriptContents = attachments.filter((a) => a.type === 'script' && a.textContent);
    const mergedText = scriptContents.length > 0
      ? scriptContents.map((s) => `【剧本：${s.name}】\n${s.textContent}`).join('\n\n---\n\n') + (text ? `\n\n---\n\n用户问题：\n${text}` : '')
      : text;
    // 附件列表送给后端时，过滤掉 script（已入文本）
    const apiAttachments = attachments.filter((a) => a.type !== 'script');

    const userMessage: ChatMessageData = {
      id: `msg-${Date.now()}`,
      role: 'user',
      content: text || (scriptContents.length > 0 ? `📜 已上传剧本：${scriptContents.map((s) => s.name).join('、')}，请解析内容。` : ''),
      attachments: apiAttachments.length > 0 ? [...apiAttachments] : undefined,
      timestamp: Date.now(),
    };

    // ── 锁定发送时的 sessionId，确保异步全程归属同一会话 ──
    let sendSid = currentSessionIdRef.current;

    // 通过 updateSessionMessages 同时更新显示 + 缓存
    updateSessionMessages(sendSid, (prev) => [...prev, userMessage]);
    setInputText('');
    setAttachments([]);
    setSessionLoading(sendSid, true);

    // 确保存在后端 session，以便归档消息
    if (!sendSid) {
      const autoTitle = (text || scriptContents.map((s) => s.name).join('、') || '新会话').slice(0, 20);
      sendSid = await apiCreateSession(autoTitle);
      if (sendSid) {
        setCurrentSessionId(sendSid);
        try { localStorage.setItem(activeSessionKey, String(sendSid)); } catch { /* ignore */ }
      }
    }
    if (sendSid) archiveMessage(sendSid, userMessage);

    // 应用 historyLimit：仅取最近 N 条非 welcome 消息
    const filtered = messages.filter((m) => m.id !== 'welcome');
    const kept = historyLimit > 0 && filtered.length > historyLimit
      ? filtered.slice(filtered.length - historyLimit)
      : filtered;
    const apiMessages = [...kept, userMessage].map((m) => ({
      role: m.role,
      content: m.id === userMessage.id ? mergedText : m.content,
      attachments: m.id === userMessage.id ? apiAttachments : m.attachments,
    }));

    // 判断当前模型是否支持流式
    const currentModel = modelOptions.find((m) => m.name === selectedModel);
    const isStream = currentModel?.category?.toUpperCase() === 'MULTIMODAL';

    // 根据 includeContext 开关决定是否注入项目上下文
    const contextPayload = includeContext ? {
      projectName: projectName || undefined,
      projectDescription: projectDescription || undefined,
      characters,
      locations,
      scripts,
      scenes,
      ...(currentFrame ? {
        frameId: currentFrame.id,
        frameIndex: currentFrame.index,
        sceneDescription: currentFrame.scene_description,
      } : {}),
    } : { projectName: projectName || undefined };

    try {
      const token = getAuthToken();

      // ── AI 助手长任务模式（function calling + workflow） ──────
      // 触发条件：模型支持 tool_calling + 已有 sessionId + 用户没有上传非文本附件
      if (sendSid && isLongTaskCapable(currentModel as any) && apiAttachments.length === 0) {
        const assistantId = `msg-${Date.now()}-ai`;
        updateSessionMessages(sendSid, (prev) => [
          ...prev,
          { id: assistantId, role: 'assistant', content: '思考中…', timestamp: Date.now() },
        ]);

        try {
          const runResp = await runAssistantSession({
            sessionId: sendSid,
            message: mergedText,
            modelName: selectedModel,
            projectId: projectId || null,
            defaultTextModel: selectedModel,
            defaultImageModel: null
          });

          // 轮询主 workflow 状态直到终态
          const jobId = runResp.jobId;
          const MAX_POLLS = 600;  // ~ 10 分钟 (1s 间隔)
          let polls = 0;
          let finalJob: WorkflowJob | null = null;
          while (polls < MAX_POLLS) {
            polls++;
            try {
              const job = await getWorkflowStatus(jobId);
              finalJob = job;
              // 实时更新消息为进度摘要
              const stepSummary = (job.tasks || []).map((t) => {
                const label = t.displayName || t.task_type;
                const icon = t.status === 'completed' ? '✓' : t.status === 'processing' ? '⏳' : t.status === 'failed' ? '✗' : '·';
                return `${icon} ${label}`;
              }).join(' → ');
              updateSessionMessages(sendSid, (prev) => prev.map((m) =>
                m.id === assistantId ? { ...m, content: `运行中…\n${stepSummary}` } : m
              ));
              if (['completed', 'failed', 'cancelled'].includes(job.status as string)) break;
            } catch (e: any) {
              console.warn('[AIAssistant.LongTask] polling error:', e?.message);
            }
            await new Promise((r) => setTimeout(r, 1000));
          }

          // 从 observer step (step_index=2) 的 result_data 取 final_reply
          let finalReply = '(任务已结束，但未返回回复)';
          if (finalJob && Array.isArray(finalJob.tasks)) {
            const observerTask = finalJob.tasks.find((t) => t.step_index === 2);
            const rd = observerTask?.result_data;
            if (rd) {
              try {
                const parsed = typeof rd === 'string' ? JSON.parse(rd) : rd;
                if (parsed?.final_reply) finalReply = parsed.final_reply;
              } catch { /* ignore */ }
            }
            if (finalJob.status === 'failed') {
              finalReply = `❌ ${finalJob.error_message || '任务执行失败'}`;
            } else if (finalJob.status === 'cancelled') {
              finalReply = '⚠️ 任务已被取消';
            }
          }

          const finalMsg: ChatMessageData = {
            id: assistantId,
            role: 'assistant',
            content: finalReply,
            timestamp: Date.now()
          };
          updateSessionMessages(sendSid, (prev) => prev.map((m) => m.id === assistantId ? finalMsg : m));
          if (sendSid) archiveMessage(sendSid, finalMsg);
          return;
        } catch (err: any) {
          // 503 = feature flag off, 400 = model not supporting tool_calling
          // 降级回避到旧 chat，下面 isStream / 非流式分支处理
          console.warn('[AIAssistant.LongTask] run 失败，回避到旧 chat:', err?.message);
          // 移除占位消息
          updateSessionMessages(sendSid, (prev) => prev.filter((m) => m.id !== assistantId));
          // continue to legacy flow below
        }
      }

      if (isStream) {
        // ── 流式模式 ──────────────────────────────────────
        const assistantId = `msg-${Date.now()}-ai`;
        setSessionStreaming(sendSid, assistantId);
        updateSessionMessages(sendSid, (prev) => [
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
            context: contextPayload,
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
                const snapshot = fullContent;
                updateSessionMessages(sendSid, (prev) =>
                  prev.map((m) =>
                    m.id === assistantId ? { ...m, content: snapshot } : m
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

        updateSessionMessages(sendSid, (prev) =>
          prev.map((m) =>
            m.id === assistantId
              ? { ...m, content: cleanContent || '(无回复)', suggestions }
              : m
          )
        );
        setSessionStreaming(sendSid, null);
        if (sendSid) {
          archiveMessage(sendSid, {
            id: assistantId,
            role: 'assistant',
            content: cleanContent || '(无回复)',
            suggestions,
            timestamp: Date.now(),
          });
        }
      } else {
        // ── 非流式模式 ────────────────────────────────────
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
            context: contextPayload,
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

        updateSessionMessages(sendSid, (prev) => [...prev, assistantMessage]);
        if (sendSid) archiveMessage(sendSid, assistantMessage);
      }
    } catch (err: any) {
      console.error('[AIAssistant] Chat error:', err);

      const errorMessage: ChatMessageData = {
        id: `msg-${Date.now()}-err`,
        role: 'system',
        content: `⚠️ ${err.message || '请求失败，请稍后重试'}`,
        timestamp: Date.now(),
      };

      updateSessionMessages(sendSid, (prev) => [...prev, errorMessage]);
      setSessionStreaming(sendSid, null);
    } finally {
      setSessionLoading(sendSid, false);
    }
  }, [inputText, attachments, isLoading, messages, projectId, selectedModel, currentFrame, modelOptions, scenes, characters, locations, scripts, projectName, projectDescription, includeContext, historyLimit, apiCreateSession, archiveMessage, activeSessionKey, updateSessionMessages, setSessionLoading, setSessionStreaming]);

  // ── 上下文使用量估算（字符/4 作为 token 粗估） ──────────────
  const MAX_CONTEXT_TOKENS = 200000; // 默认 200k window
  const contextUsage = useMemo(() => {
    let chars = 0;
    for (const m of messages) {
      if (m.id === 'welcome') continue;
      if (typeof m.content === 'string') chars += m.content.length;
    }
    // 也计上当前输入框和剧本附件
    chars += inputText.length;
    for (const a of attachments) {
      if (a.type === 'script' && a.textContent) chars += a.textContent.length;
    }
    const tokens = Math.round(chars / 4);
    const percent = Math.min(100, Math.round((tokens / MAX_CONTEXT_TOKENS) * 100));
    const realMsgCount = messages.filter((m) => m.id !== 'welcome').length;
    return { tokens, percent, realMsgCount };
  }, [messages, inputText, attachments]);

  const formatTokens = (n: number) => {
    if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
    return String(n);
  };

  // ── Keyboard shortcut ────────────────────────────────────────────
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // Enter 发送；Shift+Enter 换行；IME 组合中不触发
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      handleSend();
    }
  };

  // ── Handle AI suggestion action ──────────────────────────────────
  /**
   * 质检降级策略：视频 > 图片 > 提示词
   * 点击 inspect_quality 时，前端自动构造一条质检请求消息，便于 AI 基于可见素材作多模态分析
   */
  const triggerInspectQuality = useCallback((sceneId: number) => {
    const target = scenes?.find((s) => s.id === sceneId);
    if (!target) {
      showToast('找不到对应分镜', 'warning');
      return;
    }
    const idxLabel = `第${target.index}个分镜(ID:${target.id})`;
    let hintText = '';
    const autoAttachments: Attachment[] = [];
    if (target.video_url) {
      autoAttachments.push({ type: 'video', url: target.video_url, name: `${idxLabel}-视频` });
      hintText = `请对这段${idxLabel}的视频成品进行质量检查，给出 1-5 星评级与改进建议。`;
    } else if (target.first_frame_url) {
      autoAttachments.push({ type: 'image', url: target.first_frame_url, name: `${idxLabel}-首帧` });
      if (target.last_frame_url && target.last_frame_url !== target.first_frame_url) {
        autoAttachments.push({ type: 'image', url: target.last_frame_url, name: `${idxLabel}-尾帧` });
      }
      hintText = `请对${idxLabel}的首尾帧图片进行质量检查（构图、表现力、不良细节等），给出 1-5 星评级与改进建议。`;
    } else {
      const promptText = target.first_frame_prompt || target.video_prompt || target.description || '';
      hintText = `${idxLabel}尚未生成画面或视频，请基于提示词进行分析，指出潜在问题和改进建议：\n${promptText || '（无提示词）'}`;
    }
    setAttachments((prev) => [...prev, ...autoAttachments]);
    setInputText(hintText);
    showToast('质检请求已填写，点击发送按钮让 AI 开始分析', 'info');
  }, [scenes, showToast]);

  const handleAction = (action: string, params: any) => {
    // 质检：前端自包，不走 onAction 回调
    if (action === 'inspect_quality') {
      const sceneId = Number(params?.sceneId || currentFrame?.id);
      if (!sceneId) {
        showToast('缺少 sceneId，无法质检', 'warning');
        return;
      }
      triggerInspectQuality(sceneId);
      return;
    }
    onAction?.(action, params);
  };

  // ── 自动执行 AI 操作指令（始终开启，执行所有 action） ────
  const autoExecutedRef = useRef<Set<string>>(new Set());
  // 会话基线：记录当前已基线化的 sessionId（null 表示本地模式）
  // 任何时候 sessionId 变化（包括面板重新挂载、切换会话），
  // 会把当前所有历史 assistant 消息的 id 加入已执行集合，避免重复触发历史操作。
  const autoExecBaselineRef = useRef<number | null | undefined>(undefined);
  useEffect(() => {
    if (isLoading) return; // 流式更新中，等待完成
    // 会话基线化：新挂载 / 切换会话后首次执行，将当前消息全部标记为已执行
    if (autoExecBaselineRef.current !== currentSessionId) {
      autoExecBaselineRef.current = currentSessionId;
      messages.forEach((m) => {
        if (m.role === 'assistant' && m.suggestions && m.suggestions.length > 0) {
          autoExecutedRef.current.add(m.id);
        }
      });
      return;
    }
    const last = messages[messages.length - 1];
    if (!last || last.role !== 'assistant') return;
    if (!last.suggestions || last.suggestions.length === 0) return;
    if (autoExecutedRef.current.has(last.id)) return;
    autoExecutedRef.current.add(last.id);
    // 执行所有非质检类 action
    const targets = last.suggestions.filter((s) => s.action !== 'inspect_quality');
    if (targets.length === 0) return;
    const t = setTimeout(() => {
      targets.forEach((target, i) => {
        setTimeout(() => {
          showToast(`执行：${target.label || target.action}`, 'info');
          handleAction(target.action, target.params);
        }, i * 300); // 每个 action 间隔 300ms 依次执行
      });
    }, 200);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages, isLoading, currentSessionId]);

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
      className="relative flex flex-col h-full bg-[var(--bg-app)] border-l border-[var(--border-color)] w-full"
      onDrop={handleDrop}
      onDragOver={handleDragOver}
    >
      <style>{`.ai-tabs-scroll::-webkit-scrollbar { display: none; }`}</style>
      {/* ─ Header ──────────────────────────────────────────── */}
      <div className="flex items-center justify-between px-2 py-1.5 border-b border-[var(--border-color)] bg-[var(--bg-nav)] gap-1">
        <div
          className="ai-tabs-scroll flex items-center gap-1 min-w-0 flex-1 overflow-x-auto"
          style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
        >
          {sessions.length === 0 ? (
            <span className="text-[11px] text-[var(--text-muted)] flex-shrink-0 px-1">新会话</span>
          ) : (
            sessions.slice(0, 5).map((s) => {
              const isActive = s.id === currentSessionId;
              const isBgLoading = !isActive && loadingSessionIds.has(s.id);
              return (
                <button
                  key={s.id}
                  onClick={() => switchSession(s.id)}
                  className={`flex-shrink-0 px-2 py-1 rounded-md text-[11px] transition-colors truncate max-w-[90px] flex items-center gap-1 ${
                    isActive
                      ? 'bg-[var(--accent)]/15 text-[var(--accent)] font-medium'
                      : isBgLoading
                        ? 'text-[var(--accent)]/70 bg-[var(--accent)]/5'
                        : 'text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-input)]'
                  }`}
                  title={isBgLoading ? `${s.title}（后台处理中…）` : s.title}
                >
                  {isBgLoading && (
                    <span className="flex-shrink-0 w-1.5 h-1.5 rounded-full bg-[var(--accent)] animate-pulse" />
                  )}
                  <span className="truncate">{s.title}</span>
                </button>
              );
            })
          )}
        </div>
        <div className="flex items-center gap-0.5 flex-shrink-0">
          <button
            onClick={() => setShowHistory(true)}
            className="p-1 rounded hover:bg-[var(--bg-input)] text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
            title="全部历史对话"
          >
            <History size={13} />
          </button>
          <button
            onClick={createNewSession}
            className="p-1 rounded hover:bg-[var(--bg-input)] text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
            title="新建对话"
          >
            <Plus size={13} />
          </button>
        </div>
      </div>

      {/* Model selector moved to bottom input area */}
      {/* ─ Model selector ──────────────────────────────────── */}
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
      {/* Current frame: moved into bottom toolbar */}

      {/* Context usage bar: always visible with compress/reset buttons */}
      {contextUsage.realMsgCount >= 2 && (() => {
        const canCompress = contextUsage.percent >= 50 && !isCompressing;
        const dotColor = contextUsage.percent >= 80 ? 'bg-red-400' : contextUsage.percent >= 60 ? 'bg-yellow-400' : 'bg-[var(--accent)]';
        const textColor = contextUsage.percent >= 80 ? 'text-red-400' : contextUsage.percent >= 60 ? 'text-yellow-400' : 'text-[var(--accent)]';
        return (
          <div className="px-3 pt-1.5 flex items-center justify-end gap-1.5">
            {/* 小徐章：占用比 + token */}
            <div
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] bg-[var(--bg-input)] border border-[var(--border-color)]"
              title={`已用 ${formatTokens(contextUsage.tokens)} / ${formatTokens(MAX_CONTEXT_TOKENS)} tokens，共 ${contextUsage.realMsgCount} 条消息`}
            >
              <span className={`w-1.5 h-1.5 rounded-full ${dotColor}`} />
              <span className={textColor + ' font-semibold'}>{contextUsage.percent}%</span>
              <span className="text-[var(--text-muted)]">上下文</span>
            </div>
            {/* 压缩按钮：常驻 */}
            <button
              type="button"
              onClick={handleCompressContext}
              disabled={!canCompress}
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] text-[var(--text-muted)] bg-[var(--bg-input)] border border-[var(--border-color)] hover:text-[var(--accent)] hover:border-[var(--accent)] disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:text-[var(--text-muted)] disabled:hover:border-[var(--border-color)] transition-colors"
              title={contextUsage.percent < 50 ? '上下文高于 50% 后可压缩' : '压缩当前会话为摘要'}
            >
              {isCompressing ? <Loader2 size={10} className="animate-spin" /> : <Sparkles size={10} />}
              <span>{isCompressing ? '压缩中' : '压缩'}</span>
            </button>
            {/* 新建会话：常驻 */}
            <button
              type="button"
              onClick={createNewSession}
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] text-[var(--text-muted)] bg-[var(--bg-input)] border border-[var(--border-color)] hover:text-[var(--accent)] hover:border-[var(--accent)] transition-colors"
              title="创建新会话"
            >
              <Plus size={10} />
              <span>新建</span>
            </button>
          </div>
        );
      })()}

      {/* Composer card (Qoder-style) */}
      <div className="px-3 py-2 border-t border-[var(--border-color)]">
        <div className="bg-[var(--bg-input)] border border-[var(--border-color)] rounded-xl focus-within:ring-1 focus-within:ring-[var(--accent)] transition-shadow">
          <textarea
            ref={textareaRef}
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="规划与创作，Enter 发送，Shift+Enter 换行..."
            rows={2}
            className="w-full bg-transparent border-0 resize-none text-xs px-3 pt-2.5 pb-1 text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none max-h-[140px] leading-relaxed"
          />
          <div className="flex items-center gap-1 px-1.5 pb-1.5 pt-0.5">
            <button
              onClick={openMediaPicker}
              className="p-1 rounded hover:bg-[var(--bg-app)] text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
              title="添加附件（任意文件）"
            >
              <Paperclip size={14} />
            </button>
            <button
              onClick={openImagePicker}
              className="p-1 rounded hover:bg-[var(--bg-app)] text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
              title="上传图片"
            >
              <ImageIcon size={14} />
            </button>
            <button
              onClick={openScriptPicker}
              className="p-1 rounded hover:bg-[var(--bg-app)] text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
              title="上传剧本文件让 AI 解析"
            >
              <FileText size={14} />
            </button>
            <button
              onClick={handleEnhancePrompt}
              disabled={isEnhancing || !inputText.trim()}
              className="p-1 rounded hover:bg-[var(--bg-app)] text-[var(--text-muted)] hover:text-[var(--accent)] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              title="提示词增强：自动改写当前输入为更清晰的指令"
            >
              {isEnhancing ? <Loader2 size={14} className="animate-spin" /> : <Wand2 size={14} />}
            </button>
            {currentFrame?.first_frame_url && (
              <button
                onClick={attachCurrentFrame}
                className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] text-[var(--accent)] hover:bg-[var(--bg-app)] transition-colors"
                title="附加当前帧图片"
              >
                <ImagePlus size={11} />
                <span>当前帧</span>
              </button>
            )}
            <div className="relative">
              <select
                value={selectedModel}
                onChange={(e) => setSelectedModel(e.target.value)}
                className="text-[10px] pl-2 pr-5 py-0.5 rounded-md bg-[var(--bg-app)] border border-[var(--border-color)] text-[var(--text-muted)] hover:text-[var(--text-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--accent)] appearance-none cursor-pointer max-w-[140px] truncate"
                title="选择模型"
              >
                {modelOptions.length === 0 && (
                  <option value="" disabled>加载模型中...</option>
                )}
                {modelOptions.map((m) => (
                  <option key={m.name} value={m.name}>{m.name}</option>
                ))}
              </select>
              <span className="pointer-events-none absolute right-1 top-1/2 -translate-y-1/2 text-[9px] text-[var(--text-muted)]">▾</span>
            </div>
            <div className="flex-1" />
            <button
              onClick={handleSend}
              disabled={isLoading || (!inputText.trim() && attachments.length === 0)}
              className="p-1 rounded-md bg-[var(--accent)] text-white hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed transition-opacity"
              title="发送 (Enter)"
            >
              <Send size={14} />
            </button>
          </div>
        </div>
      </div>

      {/* ─ Input area ──────────────────────────────────────── */}
      {/* Model + input consolidated above */}

      {/* Hidden file inputs */}
      <input
        ref={fileInputRef}
        type="file"
        className="hidden"
        multiple
        accept="image/*,video/*,.pdf,.txt,.doc,.docx"
        onChange={handleFileChange}
      />
      <input
        ref={imageInputRef}
        type="file"
        className="hidden"
        multiple
        accept="image/*"
        onChange={handleImageChange}
      />
      <input
        ref={scriptInputRef}
        type="file"
        className="hidden"
        multiple
        accept=".txt,.md,.markdown,.fountain,.fdx,text/plain"
        onChange={handleScriptChange}
      />

      {/* History modal */}
      {showHistory && (
        <div className="absolute inset-0 bg-black/40 flex items-start justify-center pt-10 z-20" onClick={() => setShowHistory(false)}>
          <div
            className="bg-[var(--bg-nav)] border border-[var(--border-color)] rounded-lg shadow-xl w-[320px] max-w-[92%] max-h-[80%] flex flex-col overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-3 py-2 border-b border-[var(--border-color)]">
              <div className="flex items-center gap-2">
                <History size={14} className="text-[var(--accent)]" />
                <span className="font-semibold text-sm text-[var(--text-primary)]">历史对话</span>
                <span className="text-[10px] text-[var(--text-muted)]">({sessions.length})</span>
              </div>
              <button
                onClick={() => setShowHistory(false)}
                className="p-0.5 rounded hover:bg-[var(--bg-input)] text-[var(--text-muted)]"
              >
                <X size={14} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto">
              {sessions.length === 0 ? (
                <div className="p-6 text-center text-[11px] text-[var(--text-muted)]">
                  <MessageSquare size={20} className="mx-auto mb-2 opacity-50" />
                  <div>还没有历史对话</div>
                  <div className="mt-1 opacity-70">发送消息或点右上角 + 号开始</div>
                </div>
              ) : (
                <ul className="py-1">
                  {sessions.map((s) => {
                    const isActive = s.id === currentSessionId;
                    const isEditing = editingTitleId === s.id;
                    const timeStr = s.last_message_at
                      ? new Date(s.last_message_at).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
                      : new Date(s.created_at).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
                    return (
                      <li
                        key={s.id}
                        className={`group px-2 py-1.5 mx-1 rounded-md cursor-pointer transition-colors ${
                          isActive
                            ? 'bg-[var(--accent)]/15 border border-[var(--accent)]/40'
                            : 'hover:bg-[var(--bg-input)] border border-transparent'
                        }`}
                        onClick={() => { if (!isEditing) switchSession(s.id); }}
                      >
                        <div className="flex items-center gap-2">
                          <MessageSquare size={12} className={isActive ? 'text-[var(--accent)]' : 'text-[var(--text-muted)]'} />
                          {isEditing ? (
                            <input
                              autoFocus
                              value={editingTitleDraft}
                              onChange={(e) => setEditingTitleDraft(e.target.value)}
                              onClick={(e) => e.stopPropagation()}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                  renameSessionFn(s.id, editingTitleDraft);
                                  setEditingTitleId(null);
                                } else if (e.key === 'Escape') {
                                  setEditingTitleId(null);
                                }
                              }}
                              className="flex-1 text-xs bg-[var(--bg-app)] border border-[var(--border-color)] rounded px-1.5 py-0.5 text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent)]"
                            />
                          ) : (
                            <span className="flex-1 text-xs text-[var(--text-primary)] truncate" title={s.title}>
                              {s.title}
                            </span>
                          )}
                          <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                            {isEditing ? (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  renameSessionFn(s.id, editingTitleDraft);
                                  setEditingTitleId(null);
                                }}
                                className="p-0.5 rounded hover:bg-[var(--bg-app)] text-[var(--accent)]"
                                title="保存"
                              >
                                <Check size={11} />
                              </button>
                            ) : (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setEditingTitleId(s.id);
                                  setEditingTitleDraft(s.title);
                                }}
                                className="p-0.5 rounded hover:bg-[var(--bg-app)] text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                                title="重命名"
                              >
                                <Edit3 size={11} />
                              </button>
                            )}
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                deleteSessionFn(s.id);
                              }}
                              className="p-0.5 rounded hover:bg-[var(--bg-app)] text-[var(--text-muted)] hover:text-red-400"
                              title="删除"
                            >
                              <Trash2 size={11} />
                            </button>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 mt-0.5 pl-[18px] text-[10px] text-[var(--text-muted)]">
                          <span>{s.message_count} 条</span>
                          <span>·</span>
                          <span>{timeStr}</span>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </div>
        </div>
      )}

    </div>
  );
};

export default AIAssistantPanel;
