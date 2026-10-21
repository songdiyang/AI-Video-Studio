import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { Sparkles, X, Send, Paperclip, ImagePlus, Trash2, Wand2, FileText, Settings, Image as ImageIcon, Loader2, History, Plus, Edit3, Check, ChevronDown, MessageSquare, Video, Star, MessageCircle, ClipboardList, Brain } from 'lucide-react';
import { getAuthToken } from '../../services/auth';
import { useToast } from '../../contexts/ToastContext';
import ChatMessageComponent, { ChatMessageData, ChatMessageStep } from './ChatMessage';
import MediaAttachment from './MediaAttachment';
import { isLongTaskCapable } from '../../services/aiAssistant';
import { getWorkflowStatus } from '../../hooks/useWorkflow';
import { analyzeScript, optimizeScript, generateScript, type ScriptAnalysisResult } from '../../services/scripts';

// ─── Types ──────────────────────────────────────────────────────────
interface Attachment {
  type: 'image' | 'video' | 'file' | 'script';
  url: string;
  name?: string;
  /** 剧本附件的文本内容（AI 上下文用） */
  textContent?: string;
}

// ─── Helper Functions ───────────────────────────────────────────────
/** 将 blob URL 转换为 base64 data URL */
async function blobUrlToBase64(blobUrl: string): Promise<string> {
  try {
    const response = await fetch(blobUrl);
    const blob = await response.blob();
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  } catch (error) {
    console.error('Failed to convert blob URL to base64:', error);
    return blobUrl; // 失败时返回原始 URL
  }
}

/** 检查 URL 是否为 blob URL */
function isBlobUrl(url: string): boolean {
  return url.startsWith('blob:');
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
    /** 提示词信息 */
    first_frame_prompt?: string;
    last_frame_prompt?: string;
    video_prompt?: string;
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
  /** 项目剧本清单（含内容） */
  scripts?: { id: number; episode_number: number; title?: string; content?: string }[];
  onClose: () => void;
  onAction?: (action: string, params: any) => void | Promise<void>;
}

// ─── Welcome message ────────────────────────────────────────────────
const getWelcomeMessage = (hasProject: boolean): ChatMessageData => ({
  id: 'welcome',
  role: 'assistant',
  content: hasProject
    ? '你好！我是AI助手，可以帮你分析图片、视频和文档内容。你可以发送当前分镜帧让我进行分析，或者直接提问。'
    : '你好！我是AI助手，可以帮你从零开始创作。试试说"帮我创建一个关于仙侠爱情的项目"，我会为你创建项目并规划后续创作步骤。',
  timestamp: Date.now(),
});

// ─── Token 估算（用于按 token 预算裁剪对话上下文）─────────────────
function estimateTokens(text: string): number {
  if (!text) return 0;
  let cjk = 0;
  for (const ch of text) {
    if (/[\u3400-\u4DBF\u4E00-\u9FFF\u3040-\u30FF\uAC00-\uD7AF\u3000-\u303F\uFF00-\uFFEF]/.test(ch)) cjk++;
  }
  const other = text.length - cjk;
  return Math.ceil(cjk + other / 4);
}
function estimateMessageTokens(m: { content?: string; attachments?: any[] }): number {
  let t = estimateTokens(m.content || '') + 4;
  if (m.attachments?.length) t += m.attachments.length * 512;
  return t;
}

// 上下文窗口候选（token 预算，0=不限）
const CONTEXT_WINDOW_OPTIONS = [2048, 4096, 8192, 16384, 0];

// 标签栏最多同时打开的会话数
const MAX_OPEN_TABS = 5;

/**
 * 步骤跟踪器：编码智能体风格的「边执行边刷新 + 完成后折叠」。
 * 维护内部步骤列表，每次变更把整份列表补丁到同一条助手消息上；
 * 消息渲染层在全部步骤结束后自动折叠为摘要。
 */
function createStepTracker(
  sid: number | null,
  msgId: string,
  update: (targetSid: number | null, updater: (prev: ChatMessageData[]) => ChatMessageData[]) => void,
) {
  const steps: ChatMessageStep[] = [];
  let seq = 0;
  const patch = (content?: string, running?: boolean) => {
    const snapshot = steps.map((s) => ({ ...s }));
    update(sid, (prev) => prev.map((m) => (m.id === msgId ? {
      ...m,
      ...(content !== undefined ? { content } : {}),
      ...(running !== undefined ? { running } : {}),
      steps: snapshot,
    } : m)));
  };
  return {
    /** 把上一个进行中步骤标为完成，追加新步骤并开始计时 */
    start(title: string): number {
      const prevRunning = steps.find((s) => s.status === 'running');
      if (prevRunning) { prevRunning.status = 'completed'; prevRunning.endedAt = Date.now(); }
      steps.push({ id: `st-${++seq}`, title, status: 'running', startedAt: Date.now() });
      patch();
      return seq - 1;
    },
    /** 仅刷新当前进行中步骤的文案（detail / 标题） */
    touch(detail: string): void {
      const cur = [...steps].reverse().find((s) => s.status === 'running');
      if (cur) cur.detail = detail;
      patch();
    },
    /** 完成当前（或指定标题的进行中）步骤 */
    complete(detail?: string): void {
      const cur = [...steps].reverse().find((s) => s.status === 'running');
      if (cur) { cur.status = 'completed'; cur.endedAt = Date.now(); if (detail) cur.detail = detail; }
      patch();
    },
    /** 当前步骤失败（或按标题匹配），并停止 running 标志 */
    fail(detail?: string): void {
      const cur = [...steps].reverse().find((s) => s.status === 'running');
      if (cur) { cur.status = 'failed'; cur.endedAt = Date.now(); if (detail) cur.detail = detail; }
      patch(undefined, false);
    },
    /** 收尾：所有进行中步骤置为完成（或失败），折叠并停止转圈 */
    finishAll(failed = false): void {
      steps.forEach((s) => { if (s.status === 'running') { s.status = failed ? 'failed' : 'completed'; s.endedAt = Date.now(); } });
      patch(undefined, false);
    },
  };
}

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
  const [messages, setMessages] = useState<ChatMessageData[]>([getWelcomeMessage(!!projectId)]);
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
  // 模型选择弹层：悬停模型项时左侧弹出只读详情预览卡；点击行内「编辑」进入内联参数编辑
  const [hoveredModel, setHoveredModel] = useState<string | null>(null);
  const [editingParams, setEditingParams] = useState(false);
  // 模型下拉弹层：Portal 到 body + fixed 定位，避免被面板 overflow 容器裁切
  const settingsBtnRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const [popoverPos, setPopoverPos] = useState<{ right: number; bottom: number } | null>(null);
  useEffect(() => {
    if (!showSettings) {
      setPopoverPos(null);
      return;
    }
    const compute = () => {
      const el = settingsBtnRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      setPopoverPos({
        right: Math.max(8, window.innerWidth - r.right),
        bottom: Math.max(8, window.innerHeight - r.top + 8),
      });
    };
    compute();
    window.addEventListener('resize', compute);
    window.addEventListener('scroll', compute, true);
    return () => {
      window.removeEventListener('resize', compute);
      window.removeEventListener('scroll', compute, true);
    };
  }, [showSettings]);

  // 点击弹层与触发按钮以外的任意位置时，自动关闭模型切换卡片
  useEffect(() => {
    if (!showSettings) return;
    const onPointerDown = (e: PointerEvent) => {
      const target = e.target as Node;
      if (popoverRef.current?.contains(target)) return;
      if (settingsBtnRef.current?.contains(target)) return;
      setShowSettings(false);
      setHoveredModel(null);
      setEditingParams(false);
    };
    document.addEventListener('pointerdown', onPointerDown, true);
    return () => document.removeEventListener('pointerdown', onPointerDown, true);
  }, [showSettings]);

  // ── 剧本分析面板状态 ──────────────────────────────────────
  const [showScriptAnalysis, setShowScriptAnalysis] = useState(false);
  const [scriptContent, setScriptContent] = useState('');
  const [isAnalyzingScript, setIsAnalyzingScript] = useState(false);
  const lastScriptContentRef = useRef<string>('');
  // agent 循环在 handleSend 中调用动作执行器，而 handleAction 定义在其后；
  // 用 ref 桥接避免 TDZ / 依赖顺序问题（每次渲染后同步为最新的 handleAction）。
  const handleActionRef = useRef<(action: string, params: any, onProgress?: (label: string) => void) => Promise<unknown> | unknown>(() => {});

  // ── 设置项：上下文大小（token）/ 对话模型 ───────────
  // 上下文注入改为智能默认开启（agent 自动携带项目当前状态），不再提供开关
  const SETTINGS_KEY = 'ai_assistant_settings_v1';
  const includeContext = true;
  const [contextTokenLimit, setContextTokenLimit] = useState<number>(4096);
  const [reasoningEffort, setReasoningEffort] = useState<'low' | 'medium' | 'high'>('high');
  const storedChatModelRef = useRef<string>('');

  useEffect(() => {
    try {
      const raw = localStorage.getItem(SETTINGS_KEY);
      if (raw) {
        const s = JSON.parse(raw);
        if (typeof s.contextTokenLimit === 'number') setContextTokenLimit(s.contextTokenLimit);
        if (typeof s.chatModel === 'string') storedChatModelRef.current = s.chatModel;
      }
    } catch { /* ignore */ }
  }, []);

  // 合并写入，保留其它字段（如设置页写入的 chatModel / contextTokenLimit）
  const patchSettings = useCallback((patch: Record<string, any>) => {
    try {
      const raw = localStorage.getItem(SETTINGS_KEY);
      const prev = raw ? JSON.parse(raw) : {};
      localStorage.setItem(SETTINGS_KEY, JSON.stringify({ ...prev, ...patch }));
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    patchSettings({ contextTokenLimit });
  }, [contextTokenLimit, patchSettings]);

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
    setMessages([getWelcomeMessage(!!projectId)]);
  }, [storageKey, projectId]);

  const saveMessages = useCallback((msgs: ChatMessageData[]) => {
    try {
      localStorage.setItem(storageKey, JSON.stringify(msgs));
    } catch {
      // ignore storage error (e.g. quota exceeded)
    }
  }, [storageKey]);

  const clearMessages = useCallback(() => {
    localStorage.removeItem(storageKey);
    setMessages([getWelcomeMessage(!!projectId)]);
    showToast('对话记录已清空', 'info');
  }, [storageKey, showToast, projectId]);

  // ── Sessions 管理（一个项目一个历史记录） ─────────────────────────
  interface SessionLite {
    id: number;
    title: string;
    model_name: string | null;
    message_count: number;
    last_message_at: string | null;
    created_at: string;
  }
  // allSessions = 本地档/后端里的全部历史会话（历史对话面板的数据源）
  // openTabIds  = 标签栏当前打开的会话 id（持久化到 localStorage）
  const [allSessions, setAllSessions] = useState<SessionLite[]>([]);
  const [openTabIds, setOpenTabIds] = useState<number[]>([]);
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
  const openTabsKey = useMemo(
    () => (projectId ? `ai_open_tabs_${projectId}` : 'ai_open_tabs_global'),
    [projectId]
  );

  // 标签栏只渲染「已打开」的会话。此前标签栏直接用 fetchSessions 返回的全量历史，
  // closeSession 只过滤了内存态，下次拉取（重开应用 / 切工程）已关闭的会话又会回来，
  // 表现为「关掉一个、重开还是那几个」。现在关闭写进 openTabIds 并落盘，关闭结果可持久。
  const sessions = useMemo(() => {
    const byId = new Map(allSessions.map((s) => [s.id, s] as const));
    return openTabIds.map((id) => byId.get(id)).filter((s): s is SessionLite => Boolean(s));
  }, [allSessions, openTabIds]);

  const openTabInList = useCallback((sessionId: number) => {
    setOpenTabIds((prev) =>
      prev.includes(sessionId) ? prev : [sessionId, ...prev].slice(0, MAX_OPEN_TABS)
    );
  }, []);

  // 回写闸门：水合完成前不得落盘，否则会用初始空数组覆盖已保存的打开集；
  // 切工程时先关闸，避免把上一个工程的打开集写进新工程的 key
  const hydratedTabsRef = useRef(false);
  useEffect(() => {
    hydratedTabsRef.current = false;
  }, [openTabsKey]);

  useEffect(() => {
    if (!hydratedTabsRef.current) return;
    try {
      localStorage.setItem(openTabsKey, JSON.stringify(openTabIds));
    } catch { /* ignore */ }
  }, [openTabIds, openTabsKey]);

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
        setAllSessions(data.sessions || []);
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
        setAllSessions((prev) => [data.session, ...prev.filter((s) => s.id !== data.session.id)]);
        // 新建的会话直接进标签栏（而不是依赖下一次全量拉取）
        setOpenTabIds((prev) => [data.session.id, ...prev.filter((id: number) => id !== data.session.id)].slice(0, MAX_OPEN_TABS));
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
      if (msg.reasoning) body.reasoning = msg.reasoning;
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
    // 从历史对话打开未加载的会话时，同步把它加回标签栏
    openTabInList(sessionId);
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
        const msgs = loaded.length > 0 ? loaded : [getWelcomeMessage(!!projectId)];
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
  }, [activeSessionKey, showToast, messages, onAction, openTabInList]);

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
      setMessages([getWelcomeMessage(!!projectId)]);
      setIsLoading(false);
      setStreamingId(null);
      setShowHistory(false);
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
        setAllSessions((prev) => prev.filter((s) => s.id !== sessionId));
        setOpenTabIds((prev) => prev.filter((id: number) => id !== sessionId));
        // 清理该会话的缓存和状态
        messagesCacheRef.current.delete(sessionId);
        loadingSessionsRef.current.delete(sessionId);
        streamingSessionsRef.current.delete(sessionId);
        
        // 清理该会话的附件缓存
        try {
          const { deleteConversationAttachments } = await import('../../services/attachmentCache');
          await deleteConversationAttachments(String(sessionId));
          console.log('[AIAssistant] 已清理会话附件:', sessionId);
        } catch (err) {
          console.error('[AIAssistant] 清理会话附件失败:', err);
        }
        
        if (currentSessionIdRef.current === sessionId) {
          setCurrentSessionId(null);
          try { localStorage.removeItem(activeSessionKey); } catch { /* ignore */ }
          setMessages([getWelcomeMessage(!!projectId)]);
          setIsLoading(false);
          setStreamingId(null);
        }
        // 会话已删除，不显示 toast
      }
    } catch (err) {
      console.error('[AIAssistant] delete session failed:', err);
    }
  }, [activeSessionKey, showToast]);

  // 关闭单个会话（仅从标签栏移除并持久化，会话本体保留在历史记录中）
  const closeSession = useCallback(async (sessionId: number) => {
    if (openTabIds.length <= 1) {
      // 至少保留一个会话，不显示 toast
      return;
    }

    const remaining = openTabIds.filter((id: number) => id !== sessionId);

    // 如果关闭的是当前会话，先切换到相邻标签
    if (currentSessionId === sessionId) {
      const fallbackId = remaining[Math.min(openTabIds.indexOf(sessionId), remaining.length - 1)] ?? null;
      if (fallbackId) {
        await switchSession(fallbackId);
      } else {
        setCurrentSessionId(null);
      }
    }

    // 只从标签栏移除（写进持久化的 openTabIds），不删除会话本体
    setOpenTabIds(remaining);

    // 清理该会话的缓存和加载状态（下次从历史打开时重本地加载）
    messagesCacheRef.current.delete(sessionId);
    loadingSessionsRef.current.delete(sessionId);
    streamingSessionsRef.current.delete(sessionId);
    // 会话已从标签栏关闭，不显示 toast
  }, [openTabIds, currentSessionId, switchSession]);

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
        setAllSessions((prev) => prev.map((s) => (s.id === sessionId ? { ...s, title: trimmed } : s)));
      }
    } catch (err) {
      console.error('[AIAssistant] rename session failed:', err);
    }
  }, []);

  // 项目切换时恢复上次的标签栏打开集，并拉取会话列表修正激活会话
  useEffect(() => {
    // 先同步读回已落盘的打开集，让标签栏在 fetch 返回前就有正确内容（避免闪空）
    let stored: number[] | null = null;
    try {
      const rawTabs = localStorage.getItem(openTabsKey);
      if (rawTabs !== null) {
        const parsed = JSON.parse(rawTabs);
        if (Array.isArray(parsed)) {
          stored = parsed.filter((id: unknown) => typeof id === 'number');
        }
      }
    } catch { /* ignore */ }
    if (stored) setOpenTabIds(stored);

    let lastActive: number | null = null;
    try {
      const raw = localStorage.getItem(activeSessionKey);
      if (raw) {
        const id = Number(raw);
        if (Number.isFinite(id) && id > 0) lastActive = id;
      }
    } catch { /* ignore */ }

    let cancelled = false;
    (async () => {
      const list = await fetchSessions();
      if (cancelled) return;
      const validIds = new Set(list.map((s) => s.id));

      // 丢弃已被删除的会话；首次使用（无落盘记录）只打开上次激活/最新一条，不把全部历史铺成标签
      let next = (stored ?? []).filter((id: number) => validIds.has(id));
      if (stored === null && next.length === 0) {
        const firstId = lastActive !== null && validIds.has(lastActive) ? lastActive : (list[0]?.id ?? null);
        next = firstId !== null ? [firstId] : [];
      }
      hydratedTabsRef.current = true;
      setOpenTabIds(next);

      const activeId = lastActive !== null && next.includes(lastActive)
        ? lastActive
        : (next[next.length - 1] ?? null);
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
  const [modelOptions, setModelOptions] = useState<{ name: string; category?: string; description?: string; provider?: string }[]>([]);
  const [modelsLoaded, setModelsLoaded] = useState(false);

  useEffect(() => {
    const fetchModels = async () => {
      try {
        // 优先使用本地配置的模型（离线模式）
        const { getOfflineModels } = await import('../../services/localAI');
        const offlineModels = await getOfflineModels();
        
        // AI 助手只使用 MULTIMODAL 模型（多模态理解模型既能处理文本也能处理图像/视频）
        const multimodalModels = offlineModels
          .filter((m) => m.type === 'MULTIMODAL')
          .map((m) => ({
            name: m.model_name,
            category: m.type,
            provider: m.provider,
            description: `${m.provider} - ${m.model_name}`,
          }));
        
        setModelOptions(multimodalModels);
        if (multimodalModels.length > 0) {
          setSelectedModel((prev) => {
            if (prev) return prev;
            const stored = storedChatModelRef.current;
            if (stored && multimodalModels.some((m) => m.name === stored)) return stored;
            return multimodalModels[0].name;
          });
        }
      } catch (err) {
        console.error('[AIAssistant] Failed to load models:', err);
      } finally {
        setModelsLoaded(true);
      }
    };
    
    fetchModels();
    
    // 监听模型配置更新事件
    const handleModelsUpdated = () => {
      console.log('[AIAssistant] Models updated, reloading...');
      fetchModels();
    };
    window.addEventListener('ai-models-updated', handleModelsUpdated);
    
    return () => {
      window.removeEventListener('ai-models-updated', handleModelsUpdated);
    };
  }, []);

  // ── Attach current frame ─────────────────────────────────────────
  const attachCurrentFrame = useCallback(async () => {
    if (!currentFrame?.first_frame_url) return;
    // Avoid duplicate
    if (attachments.some((a) => a.url === currentFrame.first_frame_url)) {
      showToast('当前帧图片已添加', 'info');
      return;
    }
    
    try {
      // 获取当前模型配置
      const currentModel = modelOptions.find((m) => m.name === selectedModel);
      if (!currentModel) {
        showToast('请先选择模型', 'warning');
        return;
      }

      const { resolveModel, uploadFileToAI } = await import('../../services/localAI');
      const modelConfig = await resolveModel(selectedModel);
      if (!modelConfig) {
        showToast('模型配置未找到', 'error');
        return;
      }

      // 如果是 blob URL，需要先获取 Blob
      let blob: Blob;
      if (isBlobUrl(currentFrame.first_frame_url)) {
        const response = await fetch(currentFrame.first_frame_url);
        blob = await response.blob();
      } else {
        // 如果是 HTTP URL，直接下载
        const response = await fetch(currentFrame.first_frame_url);
        blob = await response.blob();
      }

      // 转换为 File 对象
      const file = new File([blob], `frame-${currentFrame.id}.jpg`, { type: blob.type });

      // 保存到本地缓存
      const conversationId = String(currentSessionIdRef.current || 'default');
      const { saveAttachmentToCache } = await import('../../services/attachmentCache');
      const cachedFileId = await saveAttachmentToCache(file, conversationId);

      // 上传到 AI 服务器
      showToast('正在上传当前帧图片...', 'info');
      const fileId = await uploadFileToAI(file, modelConfig);
      
      setAttachments((prev) => [
        ...prev,
        {
          type: 'image' as const,
          url: `file://${fileId}`,
          name: `帧#${currentFrame.id}`,
          textContent: cachedFileId,
        },
      ]);
      
      showToast('当前帧图片已添加', 'success');
    } catch (error: any) {
      console.error('添加当前帧失败:', error);
      showToast(`添加失败：${error.message}`, 'error');
    }
  }, [currentFrame, attachments, showToast, selectedModel, modelOptions]);

  // ── Attach current video ─────────────────────────────────────────
  const attachCurrentVideo = useCallback(async () => {
    if (!currentFrame?.video_url) {
      showToast('当前分镜没有视频', 'warning');
      return;
    }
    // Avoid duplicate
    if (attachments.some((a) => a.url === currentFrame.video_url)) {
      showToast('当前视频已添加', 'info');
      return;
    }
    
    try {
      // 获取当前模型配置
      const currentModel = modelOptions.find((m) => m.name === selectedModel);
      if (!currentModel) {
        showToast('请先选择模型', 'warning');
        return;
      }

      const { resolveModel, uploadFileToAI } = await import('../../services/localAI');
      const modelConfig = await resolveModel(selectedModel);
      if (!modelConfig) {
        showToast('模型配置未找到', 'error');
        return;
      }

      // 如果是 blob URL，需要先获取 Blob
      let blob: Blob;
      if (isBlobUrl(currentFrame.video_url)) {
        const response = await fetch(currentFrame.video_url);
        blob = await response.blob();
      } else {
        // 如果是 HTTP URL，直接下载
        const response = await fetch(currentFrame.video_url);
        blob = await response.blob();
      }

      // 转换为 File 对象
      const file = new File([blob], `video-${currentFrame.id}.mp4`, { type: blob.type });

      // 保存到本地缓存
      const conversationId = String(currentSessionIdRef.current || 'default');
      const { saveAttachmentToCache } = await import('../../services/attachmentCache');
      const cachedFileId = await saveAttachmentToCache(file, conversationId);

      // 上传到 AI 服务器
      showToast('正在上传当前视频...', 'info');
      const fileId = await uploadFileToAI(file, modelConfig);
      
      setAttachments((prev) => [
        ...prev,
        {
          type: 'video' as const,
          url: `file://${fileId}`,
          name: `视频#分镜${currentFrame.index ?? currentFrame.id}`,
          textContent: cachedFileId,
        },
      ]);
      
      showToast('当前分镜视频已添加', 'success');
    } catch (error: any) {
      console.error('添加当前视频失败:', error);
      showToast(`添加失败：${error.message}`, 'error');
    }
  }, [currentFrame, attachments, showToast, selectedModel, modelOptions]);

  // ── Prompt quality analysis ─────────────────────────────────────────
  const [isAnalyzingPrompt, setIsAnalyzingPrompt] = useState(false);
  const analyzePromptQuality = useCallback(async () => {
    if (!currentFrame?.id) {
      showToast('请先选择一个分镜', 'warning');
      return;
    }
    setIsAnalyzingPrompt(true);
    try {
      const token = getAuthToken();
      // 获取分镜详细信息
      const res = await fetch(`/api/storyboards/${currentFrame.id}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      const storyboardData = await res.json();
      
      // 构建分析请求
      const promptsInfo = [];
      if (storyboardData.first_frame_prompt) promptsInfo.push(`首帧提示词: ${storyboardData.first_frame_prompt}`);
      if (storyboardData.last_frame_prompt) promptsInfo.push(`尾帧提示词: ${storyboardData.last_frame_prompt}`);
      if (storyboardData.video_prompt) promptsInfo.push(`视频提示词: ${storyboardData.video_prompt}`);
      
      if (promptsInfo.length === 0) {
        showToast('当前分镜暂无提示词', 'warning');
        setIsAnalyzingPrompt(false);
        return;
      }
      
      // 自动添加当前帧图片作为附件
      if (currentFrame.first_frame_url && !attachments.some((a) => a.url === currentFrame.first_frame_url)) {
        setAttachments((prev) => [...prev, {
          type: 'image' as const,
          url: currentFrame.first_frame_url,
          name: `帧#${currentFrame.id}`,
        }]);
      }
      
      // 设置分析问题
      const NL = String.fromCharCode(10);
      const promptText = promptsInfo.join(NL + NL);
      const descText = storyboardData.spatial_description || storyboardData.description || '无';
      const analysisPrompt = '请分析以下分镜的提示词质量并给出评分（满分10分）：' + NL + NL +
        promptText + NL + NL +
        '分镜描述: ' + descText + NL + NL +
        '请从以下维度评估：' + NL +
        '1. 清晰度：提示词是否清晰明确，无歧义' + NL +
        '2. 完整性：是否包含必要的元素描述' + NL +
        '3. 创意性：是否有独特的创意表达' + NL +
        '4. 执行性：是否易于AI理解和执行' + NL +
        '5. 与画面一致性：是否与参考画面匹配' + NL + NL +
        '请给出总分和每个维度的具体评分，以及改进建议。';
      
      setInputText(analysisPrompt);
      showToast('提示词分析请求已准备，请发送', 'success');
    } catch (err: any) {
      console.error('[AIAssistant] Analyze prompt failed:', err);
      showToast(err.message || '获取分镜信息失败', 'error');
    } finally {
      setIsAnalyzingPrompt(false);
    }
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
  const handleImageChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;
    
    // 获取当前模型配置
    const currentModel = modelOptions.find((m) => m.name === selectedModel);
    if (!currentModel) {
      showToast('请先选择模型', 'warning');
      e.target.value = '';
      return;
    }

    // 解析模型配置
    const { resolveModel } = await import('../../services/localAI');
    const modelConfig = await resolveModel(selectedModel);
    if (!modelConfig) {
      showToast('模型配置未找到', 'error');
      e.target.value = '';
      return;
    }

    // 获取当前对话 ID
    const conversationId = String(currentSessionIdRef.current || 'default');
    
    for (const file of Array.from(files)) {
      if (!file.type.startsWith('image/')) {
        showToast(`忽略非图片文件：${file.name}`, 'warning');
        continue;
      }
      
      try {
        // 第一步：保存到本地缓存
        const { saveAttachmentToCache } = await import('../../services/attachmentCache');
        const cachedFileId = await saveAttachmentToCache(file, conversationId);
        console.log('[AIAssistant] 图片已缓存:', cachedFileId);
        
        // 第二步：上传到 AI 服务器（所有图片都使用文件上传）
        const { uploadFileToAI } = await import('../../services/localAI');
        
        showToast(`正在上传 ${file.name}...`, 'info');
        const fileId = await uploadFileToAI(file, modelConfig);
        
        setAttachments((prev) => [...prev, { 
          type: 'image', 
          url: `file://${fileId}`, // 使用 file:// 前缀标识服务器文件 ID
          name: file.name,
          // 保存本地缓存 ID，用于后续清理
          textContent: cachedFileId,
        }]);
        
        showToast(`${file.name} 上传成功`, 'success');
      } catch (error: any) {
        console.error('图片处理失败:', error);
        showToast(`图片上传失败：${error.message}`, 'error');
      }
    }
    
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
      showToast('当前没有模型可用，请在「设置 › 模型」中配置', 'warning');
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
      showToast('当前没有模型可用，请在「设置 › 模型」中配置', 'warning');
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
      setMessages([getWelcomeMessage(!!projectId), summaryMsg]);
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
    if (!selectedModel) {
      showToast('当前没有模型可用，请在「设置 › 模型」中配置', 'warning');
      return;
    }

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
        currentSessionIdRef.current = sendSid; // 同步更新 ref，确保后续 updateSessionMessages 能正确匹配
        try { localStorage.setItem(activeSessionKey, String(sendSid)); } catch { /* ignore */ }
      }
    }
    if (sendSid) archiveMessage(sendSid, userMessage);

    // 按 token 预算裁剪历史（contextTokenLimit=0 表示不限）：从最新往回累加，超预算则截断
    const filtered = messages.filter((m) => m.id !== 'welcome');
    let kept = filtered;
    if (contextTokenLimit > 0) {
      let used = estimateMessageTokens(userMessage); // 为当前发送消息预留
      const acc: typeof filtered = [];
      for (let i = filtered.length - 1; i >= 0; i--) {
        const t = estimateMessageTokens(filtered[i]);
        if (used + t > contextTokenLimit) break;
        used += t;
        acc.unshift(filtered[i]);
      }
      kept = acc;
    }
    const apiMessages = [...kept, userMessage].map((m) => ({
      role: m.role,
      content: m.id === userMessage.id ? mergedText : m.content,
      attachments: m.id === userMessage.id ? apiAttachments : m.attachments,
    }));

    // 判断当前模型是否支持流式
    const currentModel = modelOptions.find((m) => m.name === selectedModel);
    const isStream = currentModel?.category?.toUpperCase() === 'MULTIMODAL';

    // 根据 includeContext 开关决定是否注入项目上下文
    // 分层检索策略：RAG 精准片段 + 全剧本目录概览
    let retrievedScriptContext = '';
    if (includeContext && projectId && text) {
      try {
        const ragRes = await fetch('/api/rag/search-with-context', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(getAuthToken() ? { Authorization: `Bearer ${getAuthToken()}` } : {}),
          },
          body: JSON.stringify({
            query: text,
            projectId,
            topK: 8,
          }),
        });
        if (ragRes.ok) {
          const ragData = await ragRes.json();
          if (ragData.success && ragData.context) {
            retrievedScriptContext = ragData.context;
          }
        }
      } catch (e) {
        console.warn('[AIAssistant] RAG 检索失败:', e);
      }
    }

    // 构建剧本上下文：RAG 结果 + 全剧本目录
    const MAX_SCRIPT_CHARS = 4000;
    let scriptsForContext;
    
    if (retrievedScriptContext) {
      // 有 RAG 结果：提供检索片段 + 全剧本目录（供 AI 全局参考）
      const scriptCatalog = scripts?.map(s => 
        `第${s.episode_number}集《${s.title || '未命名'}》(${s.content ? s.content.length + '字符' : '无内容'})`
      ).join('\n');
      
      scriptsForContext = [{
        id: 0,
        episode_number: 0,
        title: '相关剧本内容',
        content: `${retrievedScriptContext}\n\n---\n【全剧本目录】\n${scriptCatalog || '无'}`,
      }];
    } else {
      // 无 RAG 结果：回退到原始剧本内容（截断）
      scriptsForContext = scripts?.map(s => ({
        ...s,
        content: s.content
          ? (s.content.length > MAX_SCRIPT_CHARS
            ? s.content.slice(0, MAX_SCRIPT_CHARS) + `\n[…剧本已截断，原长 ${s.content.length} 字符…]`
            : s.content)
          : undefined,
      }));
    }

    const contextPayload = includeContext ? {
      projectName: projectName || undefined,
      projectDescription: projectDescription || undefined,
      characters,
      locations,
      scripts: scriptsForContext,
      scenes,
      ...(currentFrame ? {
        frameId: currentFrame.id,
        frameIndex: currentFrame.index,
        sceneDescription: currentFrame.scene_description,
      } : {}),
    } : { projectName: projectName || undefined };

    try {
      const token = getAuthToken();

      // ── AI 助手 Agent 模式（前端编排 plan→execute→observe 循环） ──────
      // 触发条件：模型支持工具调用 + 已有 sessionId + 用户没有上传非文本附件。
      // 不依赖后端 /sessions/:id/run：每轮用本地/在线 chat 规划出 action，
      // 由 handleAction 桥接执行（结果落到本地状态/localStore），再回喂观察结果继续规划。
      if (sendSid && isLongTaskCapable(currentModel as any) && apiAttachments.length === 0) {
        const assistantId = `msg-${Date.now()}-ai`;
        updateSessionMessages(sendSid, (prev) => [
          ...prev,
          { id: assistantId, role: 'assistant', content: '思考中…', timestamp: Date.now(), running: true },
        ]);
        // 步骤跟踪器：像编码智能体一样边执行边刷新，收敛后折叠为摘要
        const tracker = createStepTracker(sendSid, assistantId, updateSessionMessages);
        tracker.start('理解需求，连接模型规划…');

        try {
          // 循环中跳过确需人工确认的动作；generate_script 等可自动执行的动作直接跑。
          const AGENT_MANUAL_ACTIONS = new Set(['dismiss', 'inspect_quality', 'optimize_script', 'reanalyze_script']);
          const history: Array<{ role: string; content: string }> = apiMessages.map((m) => ({ role: m.role, content: m.content }));
          const MAX_ROUNDS = 5;
          const executedLog: string[] = [];
          let roundReply = '';

          for (let round = 0; round < MAX_ROUNDS; round++) {
            const planRes = await fetch('/api/ai-assistant/chat', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                ...(token ? { Authorization: `Bearer ${token}` } : {}),
              },
              body: JSON.stringify({
                projectId,
                modelName: selectedModel,
                messages: history,
                context: contextPayload,
              }),
            });
            const planData = await planRes.json().catch(() => ({}));
            if (!planRes.ok || planData.success === false) {
              throw new Error(planData.error || planData.message || `规划请求失败 (${planRes.status})`);
            }

            roundReply = planData.reply || '';
            const rawSuggestions: any[] = Array.isArray(planData.suggestions) ? planData.suggestions : [];
            const actions = rawSuggestions.filter((s) => s && s.action && !AGENT_MANUAL_ACTIONS.has(s.action));
            history.push({ role: 'assistant', content: planData.reply || '' });
            tracker.complete(`第 ${round + 1} 轮规划返回`);

            // 无自动动作 → agent 收敛，结束循环
            if (actions.length === 0) break;

            const planSummary = actions.map((a) => a.label || a.action).join('、');
            updateSessionMessages(sendSid, (prev) => prev.map((m) =>
              m.id === assistantId ? { ...m, content: `第 ${round + 1} 轮：计划执行 ${actions.length} 个任务（${planSummary}）…`, running: true } : m
            ));

            // 执行动作，收集观察结果
            const observations: string[] = [];
            // 这些动作会触发后台生成/拆分任务（离线端同步落库后返回，云端转后台轮询）；
            // 结果会自动刷新到列表，模型不应据此虚构具体数量或宣称「已完成」。
            const ASYNC_START_ACTIONS = new Set(['auto_storyboard', 'generate_frame', 'generate_video']);
            let askedUser = false;
            for (const a of actions) {
              const label = a.label || a.action;
              // ask：向用户提出澄清问题并暂停整个 agent 循环，等待用户在下一条消息中回答。
              // 以问题作为本轮最终回复正文，不再继续执行后续动作。
              if (a.action === 'ask') {
                const question = String(a.params?.question || a.label || '').trim()
                  || '能告诉我你想要一个什么样的故事吗？（题材 / 风格 / 主角 / 篇幅）';
                roundReply = question;
                observations.push(`已向用户提问，等待其回答后再继续：${question}`);
                askedUser = true;
                break;
              }
              try {
                // 执行前把进度刷到对话栏：长任务（如分镜拆分同步等待模型返回）期间显示「正在执行」
                tracker.start(`执行：${label}`);
                const result = await handleActionRef.current(a.action, a.params || {}, (sub) => tracker.touch(sub));
                tracker.complete();
                executedLog.push(`✓ ${label}`);
                if (ASYNC_START_ACTIONS.has(a.action)) {
                  observations.push(
                    `已启动「${label}」：任务已提交，完成后会自动更新到分镜/媒体列表。请如实告知用户「已在后台启动」，不要声称已经完成，也不要虚构具体的分镜/图片/视频数量。`,
                  );
                } else if (typeof result === 'string' && result.trim()) {
                  // 动作返回了实质内容（如 read_script 的剧本正文）：直接回喂给模型作为观察结果。
                  observations.push(result);
                } else {
                  observations.push(`已执行「${label}」`);
                }
              } catch (e: any) {
                tracker.fail(e?.message || String(e));
                executedLog.push(`✗ ${label}`);
                observations.push(`执行「${label}」失败：${e?.message || e}`);
              }
            }

            // 已向用户提问 → 结束本轮循环，把提问作为最终回复交还用户输入。
            if (askedUser) break;

            // 回喂执行结果作为新一轮用户侧上下文
            const obsText = `【执行结果】\n${observations.join('\n')}\n\n请根据以上执行结果继续规划后续步骤；若任务已全部完成，请给出最终总结且不再附带 SUGGESTIONS。`;
            history.push({ role: 'user', content: obsText });

            tracker.start(`汇总执行结果，回喂模型继续规划（第 ${round + 2} 轮）`);
          }

          // 收尾：所有步骤折叠为摘要，正文换回最终回复（保留折叠步骤区供回看）
          tracker.finishAll();
          const finalContent = roundReply
            || (executedLog.length ? `已处理以下任务：\n${executedLog.map((e, i) => `${i + 1}. ${e}`).join('\n')}` : '(无回复)');
          updateSessionMessages(sendSid, (prev) => prev.map((m) => (
            m.id === assistantId
              ? { ...m, content: finalContent, running: false }
              : m
          )));
          const finalMsg: ChatMessageData = {
            id: assistantId,
            role: 'assistant',
            content: finalContent,
            timestamp: Date.now(),
          };
          if (sendSid) archiveMessage(sendSid, finalMsg);
          return;
        } catch (err: any) {
          // 回退到旧的单轮 chat 流程（下面 isStream / 非流式分支处理）
          console.warn('[AIAssistant.Agent] 本地 agent 循环失败，回退到普通聊天:', err?.message);
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
        let fullReasoning = '';

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
                const snapshotContent = fullContent;
                const snapshotReasoning = fullReasoning;
                updateSessionMessages(sendSid, (prev) =>
                  prev.map((m) =>
                    m.id === assistantId ? { ...m, content: snapshotContent, reasoning: snapshotReasoning || undefined } : m
                  )
                );
              }
              if (parsed.reasoningDelta) {
                fullReasoning += parsed.reasoningDelta;
                const snapshotContent = fullContent;
                const snapshotReasoning = fullReasoning;
                updateSessionMessages(sendSid, (prev) =>
                  prev.map((m) =>
                    m.id === assistantId ? { ...m, content: snapshotContent, reasoning: snapshotReasoning || undefined } : m
                  )
                );
              }
            } catch {
              // ignore parse errors for non-delta events
            }
          }
        }

        // 清理模型偶尔臆造的伪工具调用文本块（如   ...），避免原样渲染
        const stripFakeToolCalls = (s: string) =>
          s.replace(/<[^>]*tool_call[^>]*>[\s\S]*?<[^>]*\/\s*tool_call[^>]*>/gi, '')
           .replace(/<[^>]*tool_call[^>]*>/gi, '')
           .trim();
        const safeContent = stripFakeToolCalls(fullContent);
        const safeReasoning = stripFakeToolCalls(fullReasoning);

        // 解析建议
        const suggestionMatch = safeContent.match(/\[SUGGESTIONS\](.*?)\[\/SUGGESTIONS\]/s);
        let suggestions: any[] = [];
        let cleanContent = safeContent;
        if (suggestionMatch) {
          try {
            const parsed = JSON.parse(suggestionMatch[1]);
            suggestions = parsed.suggestions || [];
            cleanContent = safeContent.replace(/\[SUGGESTIONS\].*?\[\/SUGGESTIONS\]/s, '').trim();
          } catch { /* ignore */ }
        }

        // 回复兜底：推理模型（如 DeepSeek Reasoner）可能把答案全部写进 reasoning_content
        // 而正文 content 为空——此时将思考内容提升为正式回复，避免出现"(无回复)"
        let displayContent = cleanContent;
        let displayReasoning = safeReasoning || undefined;
        if (!displayContent && safeReasoning.trim()) {
          displayContent = safeReasoning
            .replace(/\[SUGGESTIONS\].*?\[\/SUGGESTIONS\]/s, '')
            .trim();
          displayReasoning = undefined; // 已作为正文展示，折叠区不再重复
        }
        if (!displayContent) displayContent = '（模型未返回正文，可尝试重新提问）';

        updateSessionMessages(sendSid, (prev) =>
          prev.map((m) =>
            m.id === assistantId
              ? { ...m, content: displayContent, reasoning: displayReasoning, suggestions }
              : m
          )
        );
        setSessionStreaming(sendSid, null);
        setSessionLoading(sendSid, false);
        if (sendSid) {
          archiveMessage(sendSid, {
            id: assistantId,
            role: 'assistant',
            content: displayContent,
            reasoning: displayReasoning,
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

        const data = await res.json().catch(() => ({}));

        if (!res.ok || data.success === false) {
          throw new Error(data.error || data.message || `请求失败 (${res.status})`);
        }

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
  }, [inputText, attachments, isLoading, messages, projectId, selectedModel, currentFrame, modelOptions, scenes, characters, locations, scripts, projectName, projectDescription, includeContext, contextTokenLimit, apiCreateSession, archiveMessage, activeSessionKey, updateSessionMessages, setSessionLoading, setSessionStreaming, showToast]);

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

  const handleAction = useCallback(async (action: string, params: any) => {
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

    // 剧本优化：侧边栏内完成，不走 onAction 回调
    if (action === 'optimize_script') {
      const content = params?.content || lastScriptContentRef.current;
      const weaknesses = params?.weaknesses || [];
      if (!content) {
        showToast('缺少剧本内容，无法优化', 'warning');
        return;
      }
      setIsLoading(true);
      try {
        const result = await optimizeScript({
          content,
          instruction: `请针对以下不足之处进行优化：\n${weaknesses.map((w: string, i: number) => `${i + 1}. ${w}`).join('\n')}`,
        });
        const optimizeMsg: ChatMessageData = {
          id: `script-optimize-${Date.now()}`,
          role: 'assistant',
          content: `**剧本优化完成**\n\n${result.message}\n\n---\n\n**优化后的剧本：**\n\n${result.optimizedContent}`,
          timestamp: Date.now(),
        };
        const currentSid = currentSessionIdRef.current;
        updateSessionMessages(currentSid, (prev) => [...prev, optimizeMsg]);
        if (currentSid) archiveMessage(currentSid, optimizeMsg);
        showToast('优化完成', 'success');
      } catch (err: any) {
        showToast(err?.message || '优化失败', 'error');
      } finally {
        setIsLoading(false);
      }
      return;
    }

    // 重新分析剧本：侧边栏内完成
    if (action === 'reanalyze_script') {
      const content = params?.content || lastScriptContentRef.current;
      if (!content) {
        showToast('缺少剧本内容，无法重新分析', 'warning');
        return;
      }
      setIsAnalyzingScript(true);
      try {
        const result = await analyzeScript({ content });
        const analysis = result.analysis;
        const analysisMsg: ChatMessageData = {
          id: `script-analysis-${Date.now()}`,
          role: 'assistant',
          content: JSON.stringify({
            type: 'scriptAnalysis',
            overallScore: analysis.overallScore,
            dimensions: analysis.dimensions,
            strengths: analysis.strengths,
            weaknesses: analysis.weaknesses,
            suggestions: analysis.suggestions,
            summary: analysis.summary,
          }),
          timestamp: Date.now(),
        };
        const currentSid = currentSessionIdRef.current;
        updateSessionMessages(currentSid, (prev) => [...prev, analysisMsg]);
        if (currentSid) archiveMessage(currentSid, analysisMsg);
        // 追加追问消息
        setTimeout(() => {
          const followUpMsg: ChatMessageData = {
            id: `script-analysis-followup-${Date.now()}`,
            role: 'assistant',
            content: '需要我帮您从不足的地方做修改吗？',
            timestamp: Date.now(),
            suggestions: [
              { label: '帮我优化剧本', action: 'optimize_script', params: { content, weaknesses: analysis.weaknesses } },
              { label: '再分析一次', action: 'reanalyze_script', params: { content } },
              { label: '不用了', action: 'dismiss' },
            ],
          };
          updateSessionMessages(currentSid, (prev) => [...prev, followUpMsg]);
          if (currentSid) archiveMessage(currentSid, followUpMsg);
        }, 500);
        showToast('重新分析完成', 'success');
      } catch (err: any) {
        showToast(err?.message || '重新分析失败', 'error');
      } finally {
        setIsAnalyzingScript(false);
      }
      return;
    }

    // AI生成剧本：侧边栏内启动工作流
    if (action === 'generate_script') {
      const targetProjectId = Number(params?.projectId || projectId);
      const episodeNumber = params?.episodeNumber ? Number(params.episodeNumber) : undefined;
      if (!targetProjectId) {
        showToast('缺少项目ID，无法生成剧本', 'warning');
        return;
      }
      setIsLoading(true);
      const currentSid = currentSessionIdRef.current;
      // 发送启动消息
      const startMsg: ChatMessageData = {
        id: `script-gen-start-${Date.now()}`,
        role: 'assistant',
        content: `正在生成剧本「${params?.title || `第${episodeNumber || '新'}集`}」...`,
        timestamp: Date.now(),
        running: true,
      };
      updateSessionMessages(currentSid, (prev) => [...prev, startMsg]);
      if (currentSid) archiveMessage(currentSid, startMsg);
      // 步骤跟踪：提交 → 等待/轮询 → 完成，折叠在消息内
      const scriptTracker = createStepTracker(currentSid, startMsg.id, updateSessionMessages);
      scriptTracker.start(`提交剧本生成请求（${params?.textModel || selectedModel || '自动选择模型'}）`);

      try {
        const result = await generateScript({
          projectId: targetProjectId,
          title: params?.title,
          description: params?.description,
          style: params?.style,
          length: params?.length,
          episodeNumber,
          provider: params?.textModel || selectedModel,
        });
        const { jobId, scriptId, episodeNumber: resultEp, title: resultTitle } = result;
        scriptTracker.complete(jobId ? `工作流已启动 #${jobId}` : '剧本已同步生成');
        // 本地即时生成（无工作流 jobId）：直接展示结果，不走轮询
        if (!jobId) {
          const localContent = typeof (result as any).content === 'string' ? (result as any).content : '';
          const completeMsg: ChatMessageData = {
            id: `script-gen-complete-${Date.now()}`,
            role: 'assistant',
            content: `**剧本生成完成** 🎉\n\n- 标题：${resultTitle || params?.title || '未命名'}\n- 集数：第${resultEp ?? episodeNumber ?? '新'}集\n- 剧本ID：#${scriptId ?? '-'}`
              + (localContent ? `\n\n---\n\n${localContent.slice(0, 800)}${localContent.length > 800 ? '...' : ''}` : ''),
            timestamp: Date.now(),
          };
          updateSessionMessages(currentSid, (prev) => [...prev.filter((m) => m.id !== startMsg.id), completeMsg]);
          if (currentSid) archiveMessage(currentSid, completeMsg);
          // 关键：把新生成的剧本绑回工作台 currentScriptId，使后续 auto_storyboard 能直接拆分。
          if (scriptId) { try { await onAction?.('bind_script', { scriptId }); } catch { /* 忽略绑定失败 */ } }
          showToast('剧本生成完成', 'success');
          setIsLoading(false);
          return;
        }
        // 更新启动消息为进行中
        const progressMsgId = `script-gen-progress-${Date.now()}`;
        updateSessionMessages(currentSid, (prev) => [
          ...prev,
          {
            id: progressMsgId,
            role: 'assistant',
            content: `剧本「${resultTitle}」生成中（工作流 #${jobId}）...`,
            timestamp: Date.now(),
            running: true,
          },
        ]);
        const pollTracker = createStepTracker(currentSid, progressMsgId, updateSessionMessages);
        pollTracker.start('等待模型输出剧本（每 2 秒轮询工作流状态）');
        let pollTicks = 0;

        // 轮询工作流状态
        const pollInterval = setInterval(async () => {
          try {
            const job = await getWorkflowStatus(jobId);
            pollTicks += 1;
            if (pollTicks % 3 === 1) pollTracker.touch(`工作流状态：${job.status}（已轮询 ${pollTicks} 次）`);
            if (job.status === 'completed') {
              clearInterval(pollInterval);
              pollTracker.complete('工作流完成，回读剧本正文');
              // 获取生成的剧本内容
              const token = getAuthToken();
              const scriptRes = await fetch(`/api/scripts/project/${targetProjectId}`, {
                headers: token ? { Authorization: `Bearer ${token}` } : {},
              });
              let scriptContent = '';
              if (scriptRes.ok) {
                const scriptData = await scriptRes.json();
                const foundScript = scriptData.scripts?.find((s: any) => s.id === scriptId);
                scriptContent = foundScript?.content || '';
              }
              const completeMsg: ChatMessageData = {
                id: `script-gen-complete-${Date.now()}`,
                role: 'assistant',
                content: `**剧本生成完成** 🎉\n\n- 标题：${resultTitle}\n- 集数：第${resultEp}集\n- 剧本ID：#${scriptId}\n\n${scriptContent ? `---\n\n${scriptContent.slice(0, 800)}${scriptContent.length > 800 ? '...' : ''}` : ''}`,
                timestamp: Date.now(),
              };
              updateSessionMessages(currentSid, (prev) => [
                ...prev.map((m) => (m.id === startMsg.id || m.id === progressMsgId ? { ...m, running: false } : m)),
                completeMsg,
              ]);
              if (currentSid) archiveMessage(currentSid, completeMsg);
              // 云端工作流完成后同样绑定新剧本，便于后续 auto_storyboard。
              if (scriptId) { void onAction?.('bind_script', { scriptId }); }
              showToast('剧本生成完成', 'success');
              setIsLoading(false);
            } else if (job.status === 'failed') {
              clearInterval(pollInterval);
              const failMsg: ChatMessageData = {
                id: `script-gen-fail-${Date.now()}`,
                role: 'system',
                content: `⚠️ 剧本生成失败：${job.error_message || '未知错误'}`,
                timestamp: Date.now(),
              };
              pollTracker.finishAll(true);
              updateSessionMessages(currentSid, (prev) => [
                ...prev.map((m) => (m.id === startMsg.id || m.id === progressMsgId ? { ...m, running: false } : m)),
                failMsg,
              ]);
              if (currentSid) archiveMessage(currentSid, failMsg);
              showToast('剧本生成失败', 'error');
              setIsLoading(false);
            }
            // running / pending 继续轮询
          } catch (pollErr: any) {
            console.error('[ScriptGen] 轮询失败:', pollErr);
          }
        }, 2000);

        // 30秒超时保护
        setTimeout(() => {
          clearInterval(pollInterval);
        }, 300000); // 5分钟超时
      } catch (err: any) {
        scriptTracker.fail(err?.message || '启动剧本生成失败');
        showToast(err?.message || '启动剧本生成失败', 'error');
        setIsLoading(false);
      }
      return;
    }

    // 查看/读取剧本正文：返回正文字符串，由 agent 循环作为观察结果回喂给模型。
    if (action === 'read_script') {
      const sid = params?.scriptId != null ? Number(params.scriptId) : null;
      const MAX = 8000;
      try {
        // 1) 优先用已注入的 scripts（含当前绑定剧本正文）
        let target: any = sid
          ? scripts?.find((s) => s.id === sid)
          : (scripts?.find((s) => s.content) || scripts?.[0]);
        let content = (target?.content || '').trim();
        // 2) 若列表未带正文，按项目拉取全部剧本正文兜底
        if (!content && projectId) {
          const token = getAuthToken();
          const res = await fetch(`/api/scripts/project/${projectId}`, {
            headers: token ? { Authorization: `Bearer ${token}` } : {},
          });
          if (res.ok) {
            const data = await res.json();
            const list: any[] = data.scripts || [];
            target = (sid ? list.find((s) => s.id === sid) : (list.find((s) => s.content) || list[0])) || target;
            content = (target?.content || '').trim();
          }
        }
        // 3) 最后兜底：工作台当前已加载的剧本正文
        if (!content && !sid && lastScriptContentRef.current) {
          content = lastScriptContentRef.current.trim();
        }
        if (!content) {
          return sid
            ? `未找到剧本 #${sid} 的正文（可能不存在或为空）。`
            : '当前没有可读取的剧本正文（剧本为空或尚未生成）。请先询问用户想要的故事，用 generate_script 生成后再读。';
        }
        const shown = content.length > MAX
          ? content.slice(0, MAX) + `\n[…正文已截断，原长 ${content.length} 字符…]`
          : content;
        return `剧本《${target?.title || '未命名'}》(ID:${target?.id ?? '-'}) 正文：\n${shown}`;
      } catch (e: any) {
        return `读取剧本失败：${e?.message || e}`;
      }
    }

    // dismiss 不需要任何操作
    if (action === 'dismiss') {
      return;
    }

    await onAction?.(action, params);
  }, [currentFrame, triggerInspectQuality, onAction, showToast, archiveMessage, updateSessionMessages, projectId, selectedModel, scripts]);

  // 每次渲染同步最新 handleAction，供 handleSend 的 agent 循环调用
  handleActionRef.current = handleAction;

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
    // 执行所有非质检类、非剧本分析类的 action（这些需要用户手动点击）
    const MANUAL_ACTIONS = new Set(['inspect_quality', 'optimize_script', 'reanalyze_script', 'dismiss']);
    const targets = last.suggestions.filter((s) => !MANUAL_ACTIONS.has(s.action));
    if (targets.length === 0) return;
    const t = setTimeout(() => {
      targets.forEach((target, i) => {
        setTimeout(() => {
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
            sessions.slice(0, MAX_OPEN_TABS).map((s) => {
              const isActive = s.id === currentSessionId;
              const isBgLoading = !isActive && loadingSessionIds.has(s.id);
              return (
                <div
                  key={s.id}
                  className={`flex-shrink-0 px-1.5 py-1 rounded-md text-[11px] transition-colors truncate max-w-[110px] flex items-center gap-1 group ${
                    isActive
                      ? 'bg-[var(--accent)]/15 text-[var(--accent)] font-medium'
                      : isBgLoading
                        ? 'text-[var(--accent)]/70 bg-[var(--accent)]/5'
                        : 'text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-input)]'
                  }`}
                  title={isBgLoading ? `${s.title}（后台处理中…）` : s.title}
                >
                  <button
                    onClick={() => switchSession(s.id)}
                    className="flex items-center gap-1 flex-1 min-w-0 truncate"
                  >
                    {isBgLoading && (
                      <span className="flex-shrink-0 w-1.5 h-1.5 rounded-full bg-[var(--accent)] animate-pulse" />
                    )}
                    <span className="truncate">{s.title}</span>
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      closeSession(s.id);
                    }}
                    className="flex-shrink-0 p-0.5 rounded hover:bg-red-500/20 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all"
                    title="关闭此对话"
                  >
                    <X size={10} />
                  </button>
                </div>
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
      {/* ─ 剧本分析输入面板 ────────────────────────────────── */}
      {showScriptAnalysis && (
        <div className="shrink-0 px-3 py-2 border-b border-[var(--border-color)] bg-[var(--bg-nav)]">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-1.5 text-xs font-medium text-[var(--text-primary)]">
              <Brain size={13} className="text-emerald-400" />
              <span>剧本分析</span>
            </div>
            <button
              onClick={() => { setShowScriptAnalysis(false); setScriptContent(''); }}
              className="p-0.5 rounded hover:bg-[var(--bg-input)] text-[var(--text-muted)] hover:text-[var(--text-primary)]"
            >
              <X size={12} />
            </button>
          </div>
          <textarea
            value={scriptContent}
            onChange={(e) => setScriptContent(e.target.value)}
            placeholder="在此粘贴剧本内容，AI将从8个维度进行评分分析..."
            rows={3}
            className="w-full bg-[var(--bg-input)] border border-[var(--border-color)] rounded-lg px-2.5 py-2 text-[11px] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--accent)] resize-none overflow-y-auto"
          />
          <div className="flex justify-end mt-2">
            <button
              onClick={async () => {
                if (!scriptContent.trim()) {
                  showToast('请输入剧本内容', 'error');
                  return;
                }
                lastScriptContentRef.current = scriptContent;
                setIsAnalyzingScript(true);
                try {
                  const result = await analyzeScript({ content: scriptContent });
                  const analysis = result.analysis;
                  // 构建分析结果消息
                  const analysisMsg: ChatMessageData = {
                    id: `script-analysis-${Date.now()}`,
                    role: 'assistant',
                    content: JSON.stringify({
                      type: 'scriptAnalysis',
                      overallScore: analysis.overallScore,
                      dimensions: analysis.dimensions,
                      strengths: analysis.strengths,
                      weaknesses: analysis.weaknesses,
                      suggestions: analysis.suggestions,
                      summary: analysis.summary,
                    }),
                    timestamp: Date.now(),
                  };
                  setMessages((prev) => [...prev, analysisMsg]);
                  // 追加追问消息
                  setTimeout(() => {
                    setMessages((prev) => [...prev, {
                      id: `script-analysis-followup-${Date.now()}`,
                      role: 'assistant',
                      content: '需要我帮您从不足的地方做修改吗？',
                      timestamp: Date.now(),
                      suggestions: [
                        { label: '帮我优化剧本', action: 'optimize_script', params: { content: scriptContent, weaknesses: analysis.weaknesses } },
                        { label: '再分析一次', action: 'reanalyze_script', params: { content: scriptContent } },
                        { label: '不用了', action: 'dismiss' },
                      ],
                    }]);
                  }, 500);
                  setShowScriptAnalysis(false);
                  setScriptContent('');
                  showToast('分析完成', 'success');
                } catch (err: any) {
                  showToast(err?.message || '分析失败', 'error');
                } finally {
                  setIsAnalyzingScript(false);
                }
              }}
              disabled={isAnalyzingScript || !scriptContent.trim()}
              className="px-3 py-1.5 rounded-lg text-[11px] font-medium bg-emerald-500 text-white hover:bg-emerald-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-1"
            >
              {isAnalyzingScript ? (
                <>
                  <Loader2 size={12} className="animate-spin" />
                  分析中...
                </>
              ) : (
                <>
                  <Brain size={12} />
                  开始分析
                </>
              )}
            </button>
          </div>
        </div>
      )}
      {/* ─ Messages list ───────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto relative">
        {/* AM logo watermark — only in empty state */}
        {messages.filter((m) => m.id !== 'welcome' && m.id !== 'loading').length === 0 && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <img
              src="/icon.png"
              alt=""
              className="w-16 h-16 opacity-[0.06] select-none"
              draggable={false}
            />
          </div>
        )}
        <div className="px-3 py-3 space-y-3 relative z-[1]">
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
              cacheId={att.textContent} // 传递本地缓存 ID
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
            {currentFrame?.video_url && (
              <button
                onClick={attachCurrentVideo}
                className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] text-purple-400 hover:bg-[var(--bg-app)] transition-colors"
                title="附加当前分镜视频"
              >
                <Video size={11} />
                <span>视频</span>
              </button>
            )}
            {/* 模型选择下拉（含上下文窗口设置，与设置页共享 ai_assistant_settings_v1） */}
            <div className="relative">
              <button
                ref={settingsBtnRef}
                type="button"
                onClick={() => setShowSettings(!showSettings)}
                className={`flex items-center gap-1 text-[10px] pl-2 pr-1.5 py-0.5 rounded-md border transition-colors max-w-[150px] ${showSettings ? 'bg-[var(--bg-app)] text-[var(--text-primary)]' : 'bg-[var(--bg-app)] text-[var(--text-muted)] hover:text-[var(--text-primary)]'}`}
                style={{ borderColor: 'var(--border-color)' }}
                title="选择模型 / 上下文窗口"
              >
                <span className="truncate">{selectedModel || (modelsLoaded ? '无可用模型' : '加载模型中…')}</span>
                <ChevronDown size={11} className="shrink-0" />
              </button>
              {showSettings && popoverPos && createPortal(
                <div
                  ref={popoverRef}
                  className="fixed"
                  style={{ zIndex: 9999, right: popoverPos.right, bottom: popoverPos.bottom }}
                  onMouseLeave={() => { setHoveredModel(null); setEditingParams(false); }}
                >
                  {/* 左侧：模型详情预览卡 / 内联参数编辑卡（与列表分离的独立浮层） */}
                  {(hoveredModel || editingParams) && (() => {
                    const previewName = hoveredModel ?? selectedModel;
                    const preview = modelOptions.find((m) => m.name === previewName);
                    const ctxLabel = contextTokenLimit === 0 ? '不限' : `${contextTokenLimit / 1024}K`;
                    const thinkLabels = { low: '低', medium: '中', high: '高' } as const;
                    return (
                      <div className="absolute bottom-0 right-full mr-2 max-h-[calc(100vh-24px)] w-[200px] overflow-y-auto overflow-x-hidden rounded-xl border border-[var(--border-color)] bg-[var(--bg-card)] shadow-2xl">
                        {/* 头部：模型名 + 描述 */}
                        <div className="p-2.5 border-b border-[var(--border-color)]">
                          <div className="text-[12px] font-semibold text-[var(--text-primary)] truncate">{previewName}</div>
                          {preview?.description && (
                            <div className="mt-0.5 text-[9px] leading-relaxed text-[var(--text-muted)]">{preview.description}</div>
                          )}
                        </div>
                        {!editingParams ? (
                          /* 只读预览 */
                          <div className="p-2.5 space-y-1 text-[10px]">
                            <div className="flex items-center justify-between">
                              <span className="text-[var(--text-muted)]">上下文窗口</span>
                              <span className="text-[var(--text-primary)]">{ctxLabel}</span>
                            </div>
                            <div className="flex items-center justify-between">
                              <span className="text-[var(--text-muted)]">思考模式</span>
                              <span className="text-[var(--text-primary)]">{thinkLabels[reasoningEffort]}</span>
                            </div>
                            <div className="pt-0.5 text-[9px] text-[var(--text-muted)]">点击右侧「编辑」修改参数</div>
                          </div>
                        ) : (
                          /* 内联参数编辑 */
                          <div>
                            <div className="p-2.5 border-b border-[var(--border-color)]">
                              <div className="text-[9px] font-medium uppercase tracking-wide text-[var(--text-muted)] mb-1.5">上下文窗口</div>
                              <div className="space-y-0.5">
                                {CONTEXT_WINDOW_OPTIONS.map((n) => {
                                  const active = n === contextTokenLimit;
                                  return (
                                    <button
                                      key={n}
                                      type="button"
                                      onClick={() => setContextTokenLimit(n)}
                                      className={`w-full flex items-center justify-between gap-2 px-2 py-1 rounded text-left text-[10px] transition-colors ${
                                        active ? 'bg-[var(--accent)]/10 text-[var(--accent)]' : 'text-[var(--text-secondary)] hover:bg-[var(--bg-app)]'
                                      }`}
                                    >
                                      <span>{n === 0 ? '不限' : `${n / 1024}K`}</span>
                                      {active && <Check size={10} className="shrink-0" />}
                                    </button>
                                  );
                                })}
                              </div>
                            </div>
                            <div className="p-2.5">
                              <div className="text-[9px] font-medium uppercase tracking-wide text-[var(--text-muted)] mb-1.5">思考模式</div>
                              <div className="space-y-0.5">
                                {(['low', 'medium', 'high'] as const).map((level) => {
                                  const active = level === reasoningEffort;
                                  return (
                                    <button
                                      key={level}
                                      type="button"
                                      onClick={() => setReasoningEffort(level)}
                                      className={`w-full flex items-center justify-between gap-2 px-2 py-1 rounded text-left text-[10px] transition-colors ${
                                        active ? 'bg-[var(--accent)]/10 text-[var(--accent)]' : 'text-[var(--text-secondary)] hover:bg-[var(--bg-app)]'
                                      }`}
                                    >
                                      <span>{thinkLabels[level]}</span>
                                      {active && <Check size={10} className="shrink-0" />}
                                    </button>
                                  );
                                })}
                              </div>
                            </div>
                            <div className="border-t border-[var(--border-color)] p-2">
                              <button
                                type="button"
                                onClick={() => setEditingParams(false)}
                                className="w-full px-2 py-1 rounded-lg text-[10px] font-medium bg-[var(--accent)] text-white hover:opacity-90 transition-opacity"
                              >
                                完成
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })()}

                  {/* 右侧：模型列表卡 */}
                  <div className="w-[220px] shrink-0 rounded-xl border border-[var(--border-color)] bg-[var(--bg-card)] shadow-2xl overflow-hidden">
                    <div className="py-0.5 max-h-[280px] overflow-y-auto">
                      {!modelsLoaded && modelOptions.length === 0 && (
                        <div className="px-4 py-3 text-[11px] text-[var(--text-muted)] text-center">加载模型中…</div>
                      )}
                      {modelsLoaded && modelOptions.length === 0 && (
                        <div className="px-4 py-6 text-center">
                          <div className="text-[11px] text-[var(--text-secondary)] mb-1">当前没有模型可用</div>
                          <div className="text-[10px] text-[var(--text-muted)] leading-relaxed">请在「设置 › 模型」中配置模型</div>
                        </div>
                      )}
                      {modelOptions.map((m) => {
                        const active = m.name === selectedModel;
                        return (
                          <div
                            key={m.name}
                            onMouseEnter={() => setHoveredModel(m.name)}
                            className={`group relative flex items-center justify-between gap-2 px-3 py-1.5 transition-colors ${
                              active ? 'bg-[var(--accent)]/10' : 'hover:bg-[var(--bg-app)]'
                            }`}
                          >
                            <button
                              type="button"
                              onClick={() => { setSelectedModel(m.name); patchSettings({ chatModel: m.name }); }}
                              className="flex-1 min-w-0 text-left"
                            >
                              <div className={`text-[12px] font-medium truncate ${active ? 'text-[var(--accent)]' : 'text-[var(--text-primary)]'}`}>
                                {m.name}
                              </div>
                            </button>
                            <div className="flex items-center gap-2 shrink-0">
                              {/* 默认显示提供商，悬停时换为「编辑」按钮 */}
                              <div className="text-[10px] text-[var(--text-muted)] group-hover:hidden">
                                {m.description?.split(' - ')[0] || 'Unknown'}
                              </div>
                              <button
                                type="button"
                                onClick={() => { setHoveredModel(m.name); setEditingParams(true); }}
                                className="hidden group-hover:flex items-center gap-1 text-[10px] text-[var(--text-secondary)] hover:text-[var(--accent)]"
                              >
                                <Edit3 size={10} /> 编辑
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>,
                document.body
              )}
            </div>
            <div className="flex-1" />
            {isLoading ? (
              <button
                onClick={() => {
                  // 中断当前流式输出
                  if (streamingId) {
                    // 通过更新消息状态标记为已中断
                    const currentSid = currentSessionIdRef.current;
                    if (currentSid) {
                      updateSessionMessages(currentSid, (prev) => {
                        const lastMsg = prev[prev.length - 1];
                        if (lastMsg?.role === 'assistant' && lastMsg.id === streamingId) {
                          return prev.map((m) =>
                            m.id === streamingId
                              ? { ...m, content: m.content + '\n\n[已中断]' }
                              : m
                          );
                        }
                        return prev;
                      });
                      setSessionStreaming(currentSid, null);
                      setSessionLoading(currentSid, false);
                    }
                  }
                }}
                className="p-1 rounded-md bg-red-500 text-white hover:opacity-90 transition-opacity animate-pulse"
                title="中断输出"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                  <rect x="6" y="6" width="12" height="12" rx="2" />
                </svg>
              </button>
            ) : (
              <button
                onClick={handleSend}
                disabled={!inputText.trim() && attachments.length === 0}
                className="p-1 rounded-md bg-[var(--accent)] text-white hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed transition-opacity"
                title="发送 (Enter)"
              >
                <Send size={14} />
              </button>
            )}
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
                <span className="text-[10px] text-[var(--text-muted)]">({allSessions.length})</span>
              </div>
              <button
                onClick={() => setShowHistory(false)}
                className="p-0.5 rounded hover:bg-[var(--bg-input)] text-[var(--text-muted)]"
              >
                <X size={14} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto">
              {/* 历史列表用全量 allSessions：已关闭的标签仍可从历史重新打开 */}
              {allSessions.length === 0 ? (
                <div className="p-6 text-center text-[11px] text-[var(--text-muted)]">
                  <MessageSquare size={20} className="mx-auto mb-2 opacity-50" />
                  <div>还没有历史对话</div>
                  <div className="mt-1 opacity-70">发送消息或点右上角 + 号开始</div>
                </div>
              ) : (
                <ul className="py-1">
                  {allSessions.map((s) => {
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
                          {openTabIds.includes(s.id) && (
                            <>
                              <span>·</span>
                              <span className="text-[var(--accent)]">已打开</span>
                            </>
                          )}
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
