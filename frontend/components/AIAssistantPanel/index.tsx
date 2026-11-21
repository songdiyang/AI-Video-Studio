import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { Sparkles, X, Send, Paperclip, ImagePlus, Wand2, FileText, Settings, Image as ImageIcon, Loader2, History, Plus, Edit3, Check, ChevronDown, Video, Star, MessageCircle, ClipboardList, Brain, Shrink } from 'lucide-react';
import { useToast } from '../../contexts/ToastContext';
import { useConfirm } from '../../contexts/ConfirmContext';
import ChatMessageComponent, { AskCardData, ChatMessageData, ChatMessageStep, ChatMessageSuggestion, TaskCardData } from './ChatMessage';
import MediaAttachment from './MediaAttachment';
import { ask as createAskCard } from '../../services/agentAsk';
import { parseSuggestions } from '../../services/localAiChatPayload';
import MemoryPanel from './MemoryPanel';
import { isLongTaskCapable } from '../../services/aiAssistant';
import { getWorkflowStatus } from '../../hooks/useWorkflow';
import { analyzeScript, optimizeScript, generateScriptStream, type ScriptAnalysisResult, type ScriptWriterInfo } from '../../services/scripts';
import { listLongTasks, registerLongTask, LONG_TASK_STATUS_LABEL } from '../../services/longTasks';
import { loadProjectGenerationSettings, loadEffectiveWriter } from '../../services/projectSettings';
import { listActiveMemories, touchMemories, loadMemoryFlags } from '../../services/agentMemory';
import { probeMediaBatch, formatBytes, formatResolution, toVisionImageUrls } from '../../services/mediaInfo';
import { SCRIPT_ANALYSIS_EVENT, consumePendingScriptAnalysis, type ScriptAnalysisRequest } from '../../services/scriptAnalysisBridge';
import { pushInternalMail } from '../../services/localMail';
import { chatStorageKey, activeSessionStorageKey, openTabsStorageKey } from './scopeStorage';
import { getViewportSize } from '../../utils/runtimeMode';
import { toErrorMessage } from '../../utils/errorMessage';

import {
  type Attachment,
  type AISceneSummary,
  type AIAssistantPanelProps,
  type SessionLite,
  needsVisionHydrate,
  blobUrlToBase64,
  isBlobUrl,
  toNameList,
  toAIScene,
  fetchProjectScenes,
  renderScenesForAgent,
  isTaskRequest,
  verifyProjectState,
  annotateUnexecutedIntent,
  getWelcomeMessage,
  estimateTokens,
  estimateMessageTokens,
  CONTEXT_WINDOW_OPTIONS,
  MAX_OPEN_TABS,
  INLINE_RESULT_ACTIONS,
  createStepTracker,
} from './helpers';
export type { AIAssistantPanelProps } from './helpers';
import { actionErrorText, actionSuccessText, actionFail, isActionFailure } from '../../services/agentActionOutcome';
import { IRREVERSIBLE_ACTIONS, MANUAL_ONLY_ACTIONS, getActionConfirmCopy, requiresUserConfirm } from '../../services/agentActionCatalog';
import { refreshAgentContext, truncateScriptContent } from '../../services/agentContextRefresh';
import { snapshotBeforeDestructive } from '../../services/projectSnapshots';
import { runAgentLoop } from '../../services/agentOrchestrator';
import { saveLoopState, loadLoopState, clearLoopState, buildInterruptionNotice } from '../../services/agentLoopState';
import HistoryModal from './HistoryModal';

// ─── Component ──────────────────────────────────────────────────────
const AIAssistantPanel: React.FC<AIAssistantPanelProps> = ({
  projectId,
  projectName,
  projectDescription,
  currentFrame,
  scenes,
  characters,
  locations,
  studios,
  props,
  scripts,
  onClose,
  onAction,
}) => {
  const [messages, setMessages] = useState<ChatMessageData[]>([getWelcomeMessage(!!projectId)]);
  // 工程 ID 快照：长任务登记/查询用 ref 读取，避免闭包过期与依赖数组频繁重建
  const projectIdRef = useRef<number | null>(projectId);
  projectIdRef.current = projectId ?? null;
  // 实体实时快照：agent 多轮循环里 contextPayload 是发送瞬间的闭包快照，会随动作执行过期。
  // 工作台每次把最新实体推回 props 时同步到此 ref，循环每轮请求前据此重建上下文，
  // 避免模型照着旧清单重复创建或误判「不存在」。
  const liveEntitiesRef = useRef({ scenes, characters, locations, studios, props, scripts });
  liveEntitiesRef.current = { scenes, characters, locations, studios, props, scripts };
  // 对话持久化闸门：切工程时先关闸并把 messages 重置为新工程初始态，再放行写入。
  // 防止「messages 落盘 effect」在同一 commit 内用上一个工程的旧消息写入新工程的
  // 存储键（ai_chat_${projectId}），造成跨工程对话串味。
  const messagesReadyRef = useRef(false);
  const [inputText, setInputText] = useState('');
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedModel, setSelectedModel] = useState('');
  const [streamingId, setStreamingId] = useState<string | null>(null);

  // ── Per-session 独立状态 ───────────────────────────────────
  const messagesCacheRef = useRef<Map<number | null, ChatMessageData[]>>(new Map());
  // 会话消息加载/更新序列号：用于丢弃过期的异步水合响应（见 switchSession / updateSessionMessages）
  const sessionLoadSeqRef = useRef(0);
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
  const { confirm } = useConfirm();

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
        right: Math.max(8, getViewportSize().width - r.right),
        bottom: Math.max(8, getViewportSize().height - r.top + 8),
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

  // ── 智能体记忆面板状态（独立 Portal 弹层，避免被裁切） ──────────
  const [showMemory, setShowMemory] = useState(false);
  const memoryBtnRef = useRef<HTMLButtonElement>(null);
  const memoryPopRef = useRef<HTMLDivElement>(null);
  const [memoryPopPos, setMemoryPopPos] = useState<{ right: number; bottom: number } | null>(null);
  useEffect(() => {
    if (!showMemory) { setMemoryPopPos(null); return; }
    const compute = () => {
      const el = memoryBtnRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      setMemoryPopPos({
        right: Math.max(8, getViewportSize().width - r.right),
        bottom: Math.max(8, getViewportSize().height - r.top + 8),
      });
    };
    compute();
    window.addEventListener('resize', compute);
    window.addEventListener('scroll', compute, true);
    return () => {
      window.removeEventListener('resize', compute);
      window.removeEventListener('scroll', compute, true);
    };
  }, [showMemory]);
  useEffect(() => {
    if (!showMemory) return;
    const onPointerDown = (e: PointerEvent) => {
      const target = e.target as Node;
      if (memoryPopRef.current?.contains(target)) return;
      if (memoryBtnRef.current?.contains(target)) return;
      setShowMemory(false);
    };
    document.addEventListener('pointerdown', onPointerDown, true);
    return () => document.removeEventListener('pointerdown', onPointerDown, true);
  }, [showMemory]);
  // agent 循环在 handleSend 中调用动作执行器，而 handleAction 定义在其后；
  // 用 ref 桥接避免 TDZ / 依赖顺序问题（每次渲染后同步为最新的 handleAction）。
  const handleActionRef = useRef<(action: string, params: any, onProgress?: (label: string) => void, originSid?: number | null, options?: { inlineResult?: boolean }) => Promise<unknown> | unknown>(() => {});

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
  // 显示作用域键统一由 scopeStorage 提供（工程 id 为路径哈希，可能复用，见该模块注释）
  const storageKey = chatStorageKey(projectId);

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
  // SessionLite 已移至 helpers.ts（历史弹窗与主组件共用）
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
    () => activeSessionStorageKey(projectId),
    [projectId]
  );
  const openTabsKey = useMemo(
    () => openTabsStorageKey(projectId),
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
      const url = projectId
        ? `/api/ai-assistant/sessions?projectId=${projectId}`
        : '/api/ai-assistant/sessions';
      const res = await fetch(url);
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
      const res = await fetch('/api/ai-assistant/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId: projectId || null, title, modelName: selectedModel || null }),
      });
      const data = await res.json();
      if (data.success && data.session) {
        // const 提取：函数式 setState 闭包内不能依赖对外层对象属性的收窄
        const session = data.session as SessionLite;
        setAllSessions((prev) => [session, ...prev.filter((s) => s.id !== session.id)]);
        // 新建的会话直接进标签栏（而不是依赖下一次全量拉取）
        setOpenTabIds((prev) => [session.id, ...prev.filter((id: number) => id !== session.id)].slice(0, MAX_OPEN_TABS));
        return session.id as number;
      }
    } catch (err) {
      console.error('[AIAssistant] create session failed:', err);
    }
    return null;
  }, [projectId, selectedModel]);

  const archiveMessage = useCallback(async (sessionId: number, msg: ChatMessageData) => {
    try {
      const body: any = {
        role: msg.role,
        content: typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content),
      };
      if (msg.reasoning) body.reasoning = msg.reasoning;
      if (msg.attachments && msg.attachments.length > 0) body.attachments = msg.attachments;
      if (msg.suggestions && msg.suggestions.length > 0) body.suggestions = msg.suggestions;
      // 后台任务卡片必须落盘，否则重开会话后卡片消失、只剩一条空消息；
      // jobId 一并保存，重开时由卡片按幂等语义重新查询一次工作流状态。
      if (msg.task) body.task = msg.task;
      if (msg.ask) body.ask = msg.ask;
      await fetch(`/api/ai-assistant/sessions/${sessionId}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
    } catch (err) {
      console.error('[AIAssistant] archive message failed:', err);
    }
  }, []);

  /** 重启续跑：水合会话消息时注入中断告知（纯注入，不做标记/归档）。
   *  标记与归档交给下方收敛式 effect，避免双重 restore 的异步覆盖把告知冲掉后误标 interrupted。 */
  const consumeInterruptionNotice = useCallback((sid: number, msgs: ChatMessageData[]): ChatMessageData[] => {
    const state = loadLoopState(projectId, sid);
    if (!state || state.status !== 'running') return msgs;
    if (msgs.some((m) => m.id.endsWith('-interrupted'))) return msgs;
    const notice: ChatMessageData = {
      id: `msg-${Date.now()}-interrupted`,
      role: 'assistant',
      content: buildInterruptionNotice(state),
      timestamp: Date.now(),
      suggestions: [{ action: 'resume_agent_loop', label: '继续未完成任务', params: {} }],
    };
    return [...msgs, notice];
  }, [projectId]);

  const switchSession = useCallback(async (sessionId: number) => {
    // 会话加载序列号：丢弃过期响应。双重 restore / 压缩等更新会把序列号推进，
    // 先发起但后返回的 fetch 不得覆盖更新的消息（否则压缩摘要/中断告知会被冲掉）。
    const seq = ++sessionLoadSeqRef.current;
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
      const withNotice = consumeInterruptionNotice(sessionId, cached);
      messagesCacheRef.current.set(sessionId, withNotice);
      setCurrentSessionId(sessionId);
      try { localStorage.setItem(activeSessionKey, String(sessionId)); } catch { /* ignore */ }
      setMessages(withNotice);
      // 恢复该会话的 loading / streaming 状态
      setIsLoading(loadingSessionsRef.current.has(sessionId));
      setStreamingId(streamingSessionsRef.current.get(sessionId) || null);
      setShowHistory(false);
      return;
    }
    // 无缓存则从后端加载
    try {
      const res = await fetch(`/api/ai-assistant/sessions/${sessionId}/messages`);
      const data = await res.json();
      // 过期响应丢弃：期间已有更新的加载或消息更新（压缩/发送/中断告知）
      if (sessionLoadSeqRef.current !== seq) return;
      if (data.success) {
        const loaded = (data.messages || []) as ChatMessageData[];
        const msgs = consumeInterruptionNotice(sessionId, loaded.length > 0 ? loaded : [getWelcomeMessage(!!projectId)]);
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
    } catch (err) {
      console.error('[AIAssistant] switch session failed:', err);
      showToast(toErrorMessage(err) || '加载会话失败', 'error');
    }
  }, [activeSessionKey, showToast, messages, onAction, openTabInList, consumeInterruptionNotice]);

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
      const res = await fetch(`/api/ai-assistant/sessions/${sessionId}`, {
        method: 'DELETE',
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
      const res = await fetch(`/api/ai-assistant/sessions/${sessionId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
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
    // 切工程 = 与上一个工程彻底隔离：先关持久化闸门，清掉上一个工程的会话缓存，
    // 显示重置为空白欢迎对话，再按新工程水合标签栏/会话（新建工程即为空白）。
    messagesReadyRef.current = false;
    messagesCacheRef.current.clear();
    setCurrentSessionId(null);
    setMessages([getWelcomeMessage(!!projectId)]);
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
    // 显式替换：没有落盘记录时也要清空，避免上一个工程的打开集残留
    setOpenTabIds(stored ?? []);

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
    // 切工程水合期间（闸门关闭）不落盘，避免把上一个工程的消息写进新工程的存储键
    if (!messagesReadyRef.current) return;
    // 不保存只有 welcome message 的空会话
    if (messages.length > 1 || (messages.length === 1 && messages[0].id !== 'welcome')) {
      saveMessages(messages);
      // 同步到 per-session 缓存
      const sid = currentSessionIdRef.current;
      if (sid !== null) messagesCacheRef.current.set(sid, messages);
    }
  }, [messages, saveMessages]);

  // messages 已切换到当前工程的内容（重置/水合后的那一次 commit）后，再放行持久化写入。
  // 声明在落盘 effect 之后：同一 commit 内落盘 effect 先跑，仍看到关闸状态。
  useEffect(() => {
    messagesReadyRef.current = true;
  }, [messages]);

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

  // ── 智能体看图：附件图片本地化 ──────────────────────────────────
  // asset/blob 图片只有本机能访问，送给厂商前必须转 data URL；
  // 会话存档/输入芯片仍用原始 URL，避免 base64 撑爆工程文档。
  const hydrateImageAttachments = useCallback(async (atts: Attachment[]): Promise<Attachment[]> => {
    const need = atts.filter(needsVisionHydrate);
    if (need.length === 0) return atts;
    const converted = await toVisionImageUrls(need.map((a) => a.url));
    const bySrc = new Map(converted.map((r) => [r.src, r]));
    return atts.map((a) => {
      const hit = needsVisionHydrate(a) ? bySrc.get(a.url) : undefined;
      // 读取失败时保留原地址（远程 http 图厂商或许自己能取）
      return hit?.dataUrl ? { ...a, url: hit.dataUrl } : a;
    });
  }, []);

  // 项目内可查看的图片清单（按业务语义命名，供 view_image 定位）
  const projectImageIndex = useMemo(() => {
    const out: Array<{ group: string; label: string; url: string; id?: number }> = [];
    (characters || []).forEach((c: any) => {
      if (c.image_url) out.push({ group: '角色', label: `角色「${c.name}」主图`, url: c.image_url });
    });
    (studios || []).forEach((s: any) => {
      if (s.cover_image_url) out.push({ group: '场景库', label: `场景「${s.name}」封面`, url: s.cover_image_url });
      if (s.nine_grid_image_url) out.push({ group: '场景库', label: `场景「${s.name}」九宫格`, url: s.nine_grid_image_url });
    });
    (locations || []).forEach((l: any) => {
      if (l.image_url) out.push({ group: '分镜地点', label: `地点「${l.name}」图`, url: l.image_url });
    });
    (props || []).forEach((p: any) => {
      if (p.image_url) out.push({ group: '道具', label: `道具「${p.name}」图`, url: p.image_url });
    });
    (scenes || []).forEach((s: any) => {
      if (s.first_frame_url) out.push({ group: '分镜', label: `分镜#${s.index} 首帧`, url: s.first_frame_url, id: s.id });
      if (s.last_frame_url && s.last_frame_url !== s.first_frame_url) {
        out.push({ group: '分镜', label: `分镜#${s.index} 尾帧`, url: s.last_frame_url, id: s.id });
      }
    });
    return out;
  }, [characters, studios, locations, props, scenes]);

  /** 按 sceneId / urls / scope / keyword 定位待看的图片（sceneId 只对应分镜，避免与资产 id 歧义） */
  const resolveImageTargets = useCallback((params: any): Array<{ label: string; url: string }> => {
    const explicit: string[] = Array.isArray(params?.urls)
      ? params.urls.filter((u: any) => typeof u === 'string' && u.trim())
      : (typeof params?.url === 'string' && params.url.trim() ? [params.url.trim()] : []);
    if (explicit.length > 0) {
      return explicit.slice(0, 6).map((u, i) => {
        const known = projectImageIndex.find((e) => e.url === u);
        return { label: known?.label || `图片${i + 1}`, url: u };
      });
    }
    const sceneId = Number(params?.sceneId) || Number(currentFrame?.id) || 0;
    if (sceneId) {
      const frames = projectImageIndex.filter((e) => e.group === '分镜' && e.id === sceneId);
      if (frames.length > 0) return frames.slice(0, 4).map((f) => ({ label: f.label, url: f.url }));
      const target = (scenes || []).find((s) => s.id === sceneId) || (currentFrame && currentFrame.id === sceneId ? currentFrame : null);
      if (target) return []; // 分镜存在但尚无画面
    }
    const SCOPE_ALIAS: Record<string, string> = {
      character: '角色', characters: '角色', studio: '场景库', studios: '场景库',
      location: '分镜地点', locations: '分镜地点', prop: '道具', props: '道具',
      storyboard: '分镜', storyboards: '分镜', frame: '分镜', frames: '分镜',
    };
    const group = SCOPE_ALIAS[String(params?.scope || '').trim().toLowerCase()];
    if (params?.scope && !group && String(params.scope).trim().toLowerCase() !== 'all') {
      return [];
    }
    const keyword = String(params?.keyword || '').trim().toLowerCase();
    const cap = Math.min(Math.max(Number(params?.max) || 4, 1), 6);
    const matched = projectImageIndex.filter((e) => {
      if (group && e.group !== group) return false;
      if (keyword && !e.label.toLowerCase().includes(keyword)) return false;
      return true;
    });
    return matched.slice(0, cap);
  }, [projectImageIndex, scenes, currentFrame]);

  // ── Attach current frame ─────────────────────────────────────────
  // 附件芯片已在输入区可见，成功/进行中不再弹右下角 toast，仅保留需要用户处理的警告/错误
  const attachCurrentFrame = useCallback(async () => {
    if (!currentFrame?.first_frame_url) return;
    // Avoid duplicate
    if (attachments.some((a) => a.url === currentFrame.first_frame_url)) {
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
      
    } catch (error) {
      console.error('添加当前帧失败:', error);
      showToast(`添加失败：${toErrorMessage(error)}`, 'error');
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
      
    } catch (error) {
      console.error('添加当前视频失败:', error);
      showToast(`添加失败：${toErrorMessage(error)}`, 'error');
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
      // 获取分镜详细信息
      const res = await fetch(`/api/storyboards/${currentFrame.id}`);
      const storyboardData = await res.json();
      
      // 构建分析请求
      const promptsInfo: string[] = [];
      if (storyboardData.first_frame_prompt) promptsInfo.push(`首帧提示词: ${storyboardData.first_frame_prompt}`);
      if (storyboardData.last_frame_prompt) promptsInfo.push(`尾帧提示词: ${storyboardData.last_frame_prompt}`);
      if (storyboardData.video_prompt) promptsInfo.push(`视频提示词: ${storyboardData.video_prompt}`);
      
      if (promptsInfo.length === 0) {
        showToast('当前分镜暂无提示词', 'warning');
        setIsAnalyzingPrompt(false);
        return;
      }
      
      // 自动添加当前帧图片作为附件
      const frameImageUrl = currentFrame.first_frame_url;
      if (frameImageUrl && !attachments.some((a) => a.url === frameImageUrl)) {
        setAttachments((prev) => [...prev, {
          type: 'image' as const,
          url: frameImageUrl,
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
    } catch (err) {
      console.error('[AIAssistant] Analyze prompt failed:', err);
      showToast(toErrorMessage(err) || '获取分镜信息失败', 'error');
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
      } catch (error) {
        console.error('图片处理失败:', error);
        showToast(`图片上传失败：${toErrorMessage(error)}`, 'error');
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

  // ── 外部剧本分析请求（大纲面板上传后提交）：填入剧本附件与提问，由用户确认发送 ──
  useEffect(() => {
    const applyRequest = (request: ScriptAnalysisRequest | null | undefined) => {
      const trimmed = request?.content?.trim();
      if (!request || !trimmed) return;
      const MAX_CHARS = 60000;
      const content = trimmed.length > MAX_CHARS
        ? trimmed.slice(0, MAX_CHARS) + `\n\n[…剧本过长已截断，原文 ${trimmed.length} 字符…]`
        : trimmed;
      setAttachments((prev) => [...prev, { type: 'script', url: '', name: request.name, textContent: content }]);
      setInputText((prev) => (prev.trim()
        ? prev
        : `请分析剧本《${request.name.replace(/\.[^.]+$/, '')}》：梳理结构与节奏、人物弧光与对白质量，指出问题并给出改进建议。`));
      showToast('剧本已添加到对话框，点击发送即可开始分析', 'info');
    };
    const handler = (event: Event) => applyRequest((event as CustomEvent<ScriptAnalysisRequest>).detail);
    // 面板懒加载：事件可能先于挂载到达，挂载时消费 pending 兜底。
    applyRequest(consumePendingScriptAnalysis());
    window.addEventListener(SCRIPT_ANALYSIS_EVENT, handler);
    return () => window.removeEventListener(SCRIPT_ANALYSIS_EVENT, handler);
  }, [showToast]);

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
      const res = await fetch('/api/ai-assistant/enhance-prompt', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
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
    } catch (err) {
      showToast(toErrorMessage(err) || '提示词增强失败', 'error');
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
      const res = await fetch('/api/ai-assistant/compress', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
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
      // 先整段替换会话档再改界面：只 setMessages 的话，重开/切换会话时缓存为空，
      // switchSession 会从后端归档拉回完整历史，把压缩结果冲掉。落盘失败则保留原历史不动。
      const sid = currentSessionIdRef.current;
      if (sid !== null) {
        const putRes = await fetch(`/api/ai-assistant/sessions/${sid}/messages`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ messages: [{ role: summaryMsg.role, content: summaryMsg.content }] }),
        });
        const putData = await putRes.json().catch(() => ({}));
        if (!putRes.ok || putData.success === false) {
          throw new Error(putData.error || `压缩结果保存失败 (${putRes.status})`);
        }
      }
      const nextMessages = [getWelcomeMessage(!!projectId), summaryMsg];
      // updateSessionMessages 为稳定回调（点击时已初始化），同步 per-session 缓存与当前界面
      if (sid !== null) updateSessionMessages(sid, () => nextMessages);
      else setMessages(nextMessages);
      showToast(`对话已压缩：${realMsgs.length} 条 → 1 段摘要`, 'success');
      setShowSettings(false);
    } catch (err) {
      showToast(toErrorMessage(err) || '压缩失败', 'error');
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
      // 任何显式消息更新都推进序列号，使在途的过期水合 fetch 失效
      sessionLoadSeqRef.current++;
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

  // ── 重启续跑：收敛式消费中断 checkpoint ─────────────────────────
  // status=running 的残留只可能来自应用退出/崩溃（正常收敛会清除）。
  // 水合存在双重 restore 的异步覆盖竞态：告知可能被后到的 setMessages 冲掉。
  // 这里盯着 messages 收敛——缺告知就补（state 仍 running），告知在位才标记
  // interrupted + 归档，保证「如实告知中断点」最终一定成立且只告知一次。
  useEffect(() => {
    if (projectId == null || currentSessionId == null) return;
    const state = loadLoopState(projectId, currentSessionId);
    if (!state || state.status !== 'running') return;
    const existing = messages.find((m) => m.id.endsWith('-interrupted'));
    if (existing) {
      saveLoopState(projectId, currentSessionId, { ...state, status: 'interrupted' });
      void archiveMessage(currentSessionId, existing);
      return;
    }
    const notice: ChatMessageData = {
      id: `msg-${Date.now()}-interrupted`,
      role: 'assistant',
      content: buildInterruptionNotice(state),
      timestamp: Date.now(),
      suggestions: [{ action: 'resume_agent_loop', label: '继续未完成任务', params: {} }],
    };
    updateSessionMessages(currentSessionId, (prev) => (
      prev.some((m) => m.id.endsWith('-interrupted')) ? prev : [...prev, notice]
    ));
  }, [projectId, currentSessionId, messages, updateSessionMessages, archiveMessage]);

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

  const handleSend = useCallback(async (askReply?: { text: string; askMessageId?: string; resumeLoop?: boolean }) => {
    const text = (askReply?.text ?? inputText).trim();
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

    // 卡片选项与自定义回答共用正常发送链路；先把对应卡片标记为已回答，避免重复提交。
    updateSessionMessages(sendSid, (prev) => {
      const next = askReply
        ? prev.map((m) => (
          m.id === askReply.askMessageId && m.ask?.status === 'pending'
            ? { ...m, ask: { ...m.ask, status: 'answered' as const, answer: text, answeredAt: Date.now() } }
            : m
        ))
        : prev;
      return [...next, userMessage];
    });
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
    // 送给厂商前把本地图片附件内联为 data URL（仅 API 载荷，消息本身仍存原始 URL）：
    // 工程内图片是 asset 协议地址，厂商 API 访问不到，不内联就“看不见图”。
    let payloadAttachments = apiAttachments;
    if (apiAttachments.some(needsVisionHydrate)) {
      try {
        payloadAttachments = await hydrateImageAttachments(apiAttachments);
      } catch (e) {
        console.warn('[AIAssistant] 图片附件内联失败，按原地址发送:', toErrorMessage(e));
      }
    }

    const apiMessages = [...kept, userMessage].map((m) => ({
      role: m.role,
      content: m.id === userMessage.id ? mergedText : m.content,
      attachments: m.id === userMessage.id ? payloadAttachments : m.attachments,
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
        content: truncateScriptContent(s.content, MAX_SCRIPT_CHARS),
      }));
    }

    // 工程级美术风格：注入上下文，供模型判断是否需要先与用户确认风格
    const artStyleSettings = projectIdRef.current
      ? await loadProjectGenerationSettings(projectIdRef.current)
      : {};
    // 工程级代笔写手：区分「未指派」与「不限定」，故 raw writerKey 与生效结果都要传
    const effectiveWriter = projectIdRef.current
      ? await loadEffectiveWriter(projectIdRef.current).catch(() => null)
      : null;

    // 智能体记忆：遵循「记忆检索」总开关，注入启用中的用户记忆（跨工程）+ 工程记忆，发送后异步累计调用次数
    const memoryFlags = loadMemoryFlags();
    const activeMemories = memoryFlags.retrieval ? await listActiveMemories(projectIdRef.current) : [];
    if (activeMemories.length > 0) {
      void touchMemories(projectIdRef.current, activeMemories.map((m) => m.id)).catch(() => {});
    }

    // 分镜兜底：分镜工作台未挂载（剧本工坊、资源页等）时注入的 context.scenes 为空，
    // 模型会误判「工程里没有分镜」，转而向用户索要 sceneId。这里直接读工程文档补全，
    // 保证智能体在任意页面都能看见当前工程真实分镜。
    let scenesForContext = scenes;
    if (includeContext && (!scenesForContext || scenesForContext.length === 0) && projectId) {
      scenesForContext = await fetchProjectScenes(projectId);
    }

    const contextPayload = includeContext ? {
      projectName: projectName || undefined,
      projectDescription: projectDescription || undefined,
      artStyle: artStyleSettings.artStyle ?? '',
      artStylePrompt: artStyleSettings.artStylePrompt ?? '',
      tempArtStylePrompt: artStyleSettings.tempArtStylePrompt ?? '',
      tempArtStyleNote: artStyleSettings.tempArtStyleNote ?? '',
      // 写手：writerKey 保持 undefined（工程从未设置）以触发「未指派」提示；
      // 临时覆盖优先，故署名/笔法取 effectiveWriter（内部已按 temp 优先解析）
      writerKey: artStyleSettings.writerKey,
      writerName: effectiveWriter?.writer?.name ?? '',
      writerStylePrompt: effectiveWriter?.stylePrompt ?? '',
      writerNote: effectiveWriter?.note ?? '',
      tempWriterKey: effectiveWriter?.temp ? effectiveWriter.key : '',
      tempWriterName: effectiveWriter?.temp ? (effectiveWriter.writer?.name ?? '') : '',
      tempWriterNote: effectiveWriter?.temp ? effectiveWriter.note : '',
      memories: activeMemories.map((m) => ({ scope: m.scope, content: m.content, importance: m.importance })),
      characters,
      locations,
      studios,
      props,
      scripts: scriptsForContext,
      scenes: scenesForContext,
      longTasks: listLongTasks(projectIdRef.current).slice(0, 10),
      ...(currentFrame ? {
        frameId: currentFrame.id,
        frameIndex: currentFrame.index,
        sceneDescription: currentFrame.scene_description,
      } : {}),
    } : { projectName: projectName || undefined };

    try {
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
        let scriptStarted = false;

        try {
          // 编排逻辑已抽到 services/agentOrchestrator（纯模块、端口可注入、可编排级测试）；
          // 这里只负责把 React 侧副作用接成端口，并处理最终消息/落盘/回退。
          // 质检素材报告：汇总分镜的提示词、生成情况与本地文件元数据（分辨率/大小），并交出画面图片供模型真看
          const buildInspectionReport = async (sceneId: number): Promise<{ text: string; images: Array<{ label: string; url: string }> }> => {
            const target = scenes?.find((s) => s.id === sceneId)
              || (currentFrame && currentFrame.id === sceneId ? currentFrame : null);
            if (!target) return { text: '质检失败：找不到对应分镜（sceneId 无效）。请告知用户先选中一个分镜。', images: [] };
            const mediaEntries: Array<{ key: string; url: string; kind: 'image' | 'video' }> = [];
            if (target.first_frame_url) mediaEntries.push({ key: '首帧', url: target.first_frame_url, kind: 'image' });
            if (target.last_frame_url && target.last_frame_url !== target.first_frame_url) mediaEntries.push({ key: '尾帧', url: target.last_frame_url, kind: 'image' });
            if (target.video_url) mediaEntries.push({ key: '视频', url: target.video_url, kind: 'video' });
            const probes = mediaEntries.length > 0
              ? await probeMediaBatch(mediaEntries.map((m) => ({ src: m.url, kind: m.kind })))
              : [];
            const mediaLines = mediaEntries.map((m, i) => {
              const p = probes[i];
              if (p?.missing) return `- ${m.key}：文件缺失（清单有引用但工程 media/ 无实体）`;
              return `- ${m.key}：${formatResolution(p?.width, p?.height)} · ${formatBytes(p?.bytes)}`;
            });
            if (mediaLines.length === 0) mediaLines.push('- 尚未生成任何画面/视频');
            const images = mediaEntries
              .map((m, i) => ({ m, missing: !!probes[i]?.missing }))
              .filter(({ m, missing }) => m.kind === 'image' && !missing)
              .map(({ m }) => ({ label: `分镜#${target.index} ${m.key}`, url: m.url }));
            const sight = images.length > 0
              ? '本条消息已附带该分镜的真实画面图片，你必须看清画面后再评价构图/色彩/人物一致性，不得臆测图中没有的内容。'
              : '该分镜没有可用画面，请仅基于提示词分析，并如实告知用户看不到画面。';
            return {
              text: [
                `【分镜质检素材 #${target.index}（ID:${target.id}）】`,
                `描述：${(target as any).description || (target as any).scene_description || '（无）'}`,
                ...mediaLines,
                `首帧提示词：${(target as any).first_frame_prompt || '（无）'}`,
                `尾帧提示词：${(target as any).last_frame_prompt || '（无）'}`,
                `视频提示词：${(target as any).video_prompt || '（无）'}`,
                `请基于以上真实素材给出 1-5 星评级与具体改进建议，并把反馈直接写进回复正文交给用户。${sight}`,
              ].join('\n'),
              images,
            };
          };

          // 多轮上下文刷新：contextPayload 是发送瞬间的快照，循环内 create/update/delete
          // 会让它过期。每轮请求前用工作台实时实体重建（工程级设置/记忆/写手沿用 base），
          // 第 0 轮保持发送瞬间的 RAG 剧本片段，后续轮改用最新全量截断清单。
          let liveContext: any = contextPayload;
          const refreshLiveContext = async () => {
            if (!includeContext) return;
            const live = liveEntitiesRef.current;
            let resolvedScenes = live.scenes;
            if ((!resolvedScenes || resolvedScenes.length === 0) && projectId) {
              resolvedScenes = await fetchProjectScenes(projectId);
            }
            liveContext = refreshAgentContext(contextPayload as any, live, {
              scenes: resolvedScenes || [],
              longTasks: listLongTasks(projectIdRef.current).slice(0, 10),
              maxScriptChars: MAX_SCRIPT_CHARS,
            });
          };

          // 续跑入口：中断告知卡片上的「继续未完成任务」按钮带 resumeLoop 标志进入发送链路，
          // 从落盘 checkpoint 恢复 history/round/标志位接着规划。
          const resumeState = askReply?.resumeLoop ? loadLoopState(projectId, sendSid) : null;
          const result = await runAgentLoop({
            userText: text,
            initialHistory: apiMessages.map((m) => ({ role: m.role, content: m.content, attachments: m.attachments as any })),
            initialContext: contextPayload,
            hasProject: !!projectId,
            currentFrameId: currentFrame?.id ?? null,
            resume: resumeState,
          }, {
            plan: async (messages, context) => {
              const planRes = await fetch('/api/ai-assistant/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ projectId, modelName: selectedModel, messages, context }),
              });
              const planData = await planRes.json().catch(() => ({}));
              if (!planRes.ok || planData.success === false) {
                throw new Error(planData.error || planData.message || `规划请求失败 (${planRes.status})`);
              }
              return planData;
            },
            refreshContext: async () => { await refreshLiveContext(); return liveContext; },
            // 传入 sendSid：agent 循环是异步长流程，期间用户可能切换会话，卡片须归属发起会话
            execute: async (action, params, onSub) => handleActionRef.current(action, params, onSub, sendSid, { inlineResult: false }),
            inspectQuality: buildInspectionReport,
            resolveImageTargets,
            toVisionImageUrls,
            verifyProjectState: () => verifyProjectState(projectId ?? null),
            fetchScenes: () => fetchProjectScenes(projectId as number),
            isTaskRequest,
            tracker,
            onRoundPlan: (round, count, summary) => {
              updateSessionMessages(sendSid, (prev) => prev.map((m) =>
                m.id === assistantId ? { ...m, content: `第 ${round + 1} 轮：计划执行 ${count} 个任务（${summary}）…`, running: true } : m
              ));
            },
            onScriptGenerationStart: () => {
              scriptStarted = true;
              // 行为卡片接管后移除 Agent 规划消息，避免对话区同时出现两套进度反馈。
              updateSessionMessages(sendSid, (prev) => prev.filter((m) => m.id !== assistantId));
            },
            // 循环状态随会话落盘：应用退出后重启可续跑或如实告知中断点
            onState: (state) => saveLoopState(projectId, sendSid, state),
          });

          // 正常收敛（含 ask/script 接管）：清除落盘 checkpoint，重启不再误报中断
          clearLoopState(projectId, sendSid);
          // 剧本生成由独立行为卡片完整反馈；丢弃规划消息与模型最终正文，避免剧本再次进入对话历史。
          if (result.scriptGenerationHandled && !result.askCard) {
            updateSessionMessages(sendSid, (prev) => prev.filter((m) => m.id !== assistantId));
            return;
          }
          const finalMsg: ChatMessageData = {
            id: assistantId,
            role: 'assistant',
            content: result.finalContent,
            timestamp: Date.now(),
            ask: result.askCard ?? undefined,
            suggestions: result.pendingConfirm.length ? result.pendingConfirm as ChatMessageSuggestion[] : undefined,
          };
          updateSessionMessages(sendSid, (prev) => (
            prev.some((m) => m.id === assistantId)
              ? prev.map((m) => (
                m.id === assistantId
                  ? {
                    ...m,
                    content: result.finalContent,
                    running: false,
                    ask: result.askCard ?? undefined,
                    suggestions: result.pendingConfirm.length ? result.pendingConfirm as ChatMessageSuggestion[] : undefined,
                  }
                  : m
              ))
              // 剧本卡片接管期间规划消息已移除；若后续还有澄清提问，则单独挂回提问卡片。
              : [...prev, finalMsg]
          ));
          if (sendSid) archiveMessage(sendSid, finalMsg);
          return;
        } catch (err) {
          // 已进入剧本生成流程时不得回退到普通聊天，否则可能把正文或错误详情重新追加回来。
          if (scriptStarted) {
            updateSessionMessages(sendSid, (prev) => prev.filter((m) => m.id !== assistantId));
            return;
          }
          // 循环异常：保留落盘 checkpoint（status=running），重开会话时如实告知中断点并可续跑。
          // 回退到旧的单轮 chat 流程（下面 isStream / 非流式分支处理）
          console.warn('[AIAssistant.Agent] 本地 agent 循环失败，回退到普通聊天:', toErrorMessage(err));
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

        // action 标记位于流末尾，看到 generate_script 之前不能安全地逐字上屏。
        // 先在内存缓冲；终态确认不是剧本生成后才渲染普通回复，否则只保留行为卡片。
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
              if (parsed.delta) fullContent += parsed.delta;
              if (parsed.reasoningDelta) fullReasoning += parsed.reasoningDelta;
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

        // 解析建议：统一走服务层的容错解析（兼容 [S] 等简写标签并保证协议原文不泄漏到正文）
        const { cleanReply: parsedClean, suggestions } = parseSuggestions(safeContent);
        let cleanContent = parsedClean;

        // 回复兜底：推理模型（如 DeepSeek Reasoner）可能把答案全部写进 reasoning_content
        // 而正文 content 为空——此时将思考内容提升为正式回复，避免出现"(无回复)"
        let displayContent = cleanContent;
        let displayReasoning = safeReasoning || undefined;
        if (!displayContent && safeReasoning.trim()) {
          displayContent = parseSuggestions(safeReasoning).cleanReply.trim();
          displayReasoning = undefined; // 已作为正文展示，折叠区不再重复
        }
        if (!displayContent) displayContent = '（模型未返回正文，可尝试重新提问）';

        const isScriptGeneration = suggestions.some((s) => s?.action === 'generate_script');
        if (isScriptGeneration) {
          displayContent = '';
          displayReasoning = undefined;
        } else {
          // 单轮路径无法再回喂模型，至少把“没触发任何动作”这个事实标注到回复上
          displayContent = annotateUnexecutedIntent(text, displayContent, suggestions);
        }

        updateSessionMessages(sendSid, (prev) =>
          prev.map((m) =>
            m.id === assistantId
              ? { ...m, content: displayContent, reasoning: displayReasoning, suggestions }
              : m
          )
        );
        setSessionStreaming(sendSid, null);
        setSessionLoading(sendSid, false);
        if (sendSid && !isScriptGeneration) {
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

        const isScriptGeneration = Array.isArray(data.suggestions)
          && data.suggestions.some((s: any) => s?.action === 'generate_script');
        const rawReply = data.reply || data.content || data.message || '(无回复)';
        const assistantMessage: ChatMessageData = {
          id: `msg-${Date.now()}-ai`,
          role: 'assistant',
          content: isScriptGeneration
            ? ''
            : annotateUnexecutedIntent(text, rawReply, Array.isArray(data.suggestions) ? data.suggestions : []),
          suggestions: data.suggestions,
          timestamp: Date.now(),
        };

        updateSessionMessages(sendSid, (prev) => [...prev, assistantMessage]);
        if (sendSid && !isScriptGeneration) archiveMessage(sendSid, assistantMessage);
      }
    } catch (err) {
      console.error('[AIAssistant] Chat error:', err);

      const errorMessage: ChatMessageData = {
        id: `msg-${Date.now()}-err`,
        role: 'system',
        content: `⚠️ ${toErrorMessage(err) || '请求失败，请稍后重试'}`,
        timestamp: Date.now(),
      };

      updateSessionMessages(sendSid, (prev) => [...prev, errorMessage]);
      setSessionStreaming(sendSid, null);
    } finally {
      setSessionLoading(sendSid, false);
    }
  }, [inputText, attachments, isLoading, messages, projectId, selectedModel, currentFrame, modelOptions, scenes, characters, locations, studios, props, scripts, projectName, projectDescription, includeContext, contextTokenLimit, apiCreateSession, archiveMessage, activeSessionKey, updateSessionMessages, setSessionLoading, setSessionStreaming, showToast, hydrateImageAttachments, resolveImageTargets]);

  const handleAskAnswer = useCallback((messageId: string, answer: string) => {
    const text = answer.trim();
    if (!text) return;
    void handleSend({ text, askMessageId: messageId });
  }, [handleSend]);

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

  // ── 后台任务进度卡片：动作→类别映射与挂载辅助 ──
  // 提交长任务（分镜图/视频）返回 jobId、离线分镜拆分同步完成返回 sceneCount 时，
  // 在对话内挂载一张自轮询进度卡片；任务未完成时同样挂载。适用于单次点击建议动作与 agent 循环两条路径。
  const TASK_CARD_KIND: Record<string, TaskCardData['kind']> = useMemo(() => ({
    auto_storyboard: 'storyboard',
    generate_frame: 'image',
    generate_video: 'video',
  }), []);
  const TASK_ACTION_LABEL: Record<string, string> = useMemo(() => ({
    auto_storyboard: '自动分镜拆分',
    generate_frame: '分镜图生成',
    generate_video: '分镜视频生成',
    delete_scene: '删除分镜',
    delete_script: '删除剧本',
    update_scene: '更新分镜',
  }), []);
  const TASK_KIND_LABEL: Record<TaskCardData['kind'], string> = useMemo(() => ({
    storyboard: '分镜拆分',
    image: '分镜图',
    video: '分镜视频',
    generic: '任务',
    script: '剧本生成',
  }), []);
  const mountTaskCard = useCallback((action: string, result: any, labelText?: string, originSid?: number | null) => {
    if (!result || typeof result !== 'object') return;
    if (result.success === false || result.error) return; // 明确失败：不挂卡片
    const jobId = result.jobId != null ? String(result.jobId) : undefined;
    const sceneCount = result.sceneCount != null ? Number(result.sceneCount) : undefined;
    if (!jobId && sceneCount == null) return; // 既非后台任务，也非同步完成

    const mappedKind = TASK_CARD_KIND[action];
    if (!jobId && !mappedKind) return;
    // 未显式映射但返回了 jobId 的工具，一律按通用长任务处理
    const kind: TaskCardData['kind'] = mappedKind ?? 'generic';
    const kindLabel = TASK_KIND_LABEL[kind];
    const label = labelText || TASK_ACTION_LABEL[action] || action;
    const title = mappedKind ? `${kindLabel} · ${label}` : label;

    const cardId = `msg-${Date.now()}-task-${Math.random().toString(36).slice(2, 7)}`;
    const cardTask: TaskCardData = { kind, jobId, sceneCount, title };
    const cardMsg: ChatMessageData = { id: cardId, role: 'assistant', content: '', timestamp: Date.now(), task: cardTask };
    // 卡片归属发起动作时的会话：延迟执行路径（自动执行建议动作、agent 异步循环）若在期间发生会话切换，
    // 读取实时的 currentSessionIdRef 会把卡片串写到另一个对话里。缺省时才退回当前会话。
    const sid = originSid === undefined ? currentSessionIdRef.current : originSid;

    // 登记本工程长任务：站内信任务区展示、后台轮询与模型上下文共用（其它工程不可见）
    if (jobId) registerLongTask({ jobId, title, kind, sessionId: sid, projectId: projectIdRef.current });

    // 同一 jobId 只挂一张卡：单次点击、自动执行建议、agent 循环共用 handleAction，
    // 若同一作业结果被重复回报不应产生两张并行的轮询卡片。
    const existing = sid === null ? undefined : messagesCacheRef.current.get(sid);
    if (existing && jobId && existing.some((m) => m.task && m.task.jobId === jobId)) return;
    updateSessionMessages(sid, (prev) => [...prev, cardMsg]);
    if (sid) archiveMessage(sid, cardMsg);
  }, [TASK_CARD_KIND, TASK_ACTION_LABEL, TASK_KIND_LABEL, updateSessionMessages, archiveMessage]);

  // 将动作结果作为一条对话消息挂载到发起会话，避免全局 toast 弹窗
  const appendActionResult = useCallback((text: string, originSid?: number | null) => {
    if (!text.trim()) return;
    const sid = originSid === undefined ? currentSessionIdRef.current : originSid;
    const resultMsg: ChatMessageData = {
      id: `msg-${Date.now()}-action-${Math.random().toString(36).slice(2, 7)}`,
      role: 'assistant',
      content: text,
      timestamp: Date.now(),
    };
    updateSessionMessages(sid, (prev) => [...prev, resultMsg]);
    if (sid) archiveMessage(sid, resultMsg);
  }, [updateSessionMessages, archiveMessage]);

  const handleAction = useCallback(async (action: string, params: any, onProgress?: (label: string) => void, originSid?: number | null, options?: { inlineResult?: boolean }) => {
    // 续跑入口：中断告知卡片上的按钮，走正常发送链路并带 resumeLoop 标志，
    // 编排器从落盘 checkpoint 恢复 history/round 接着规划。
    if (action === 'resume_agent_loop') {
      void handleSend({ text: '继续上次中断的任务', resumeLoop: true });
      return '正在从中断点继续上次的任务…';
    }
    // 不可逆动作必须二次确认：智能体循环已拦截，这里覆盖「用户点击气泡按钮」的路径。
    // 取消也要留回执，否则用户点完不知道是不小心取消了还是根本没生效。
    if (requiresUserConfirm(action)) {
      const copy = getActionConfirmCopy(action);
      const accepted = await confirm({ type: 'danger', ...copy });
      if (!accepted) {
        const canceled = `已取消「${copy.title}」`;
        if (INLINE_RESULT_ACTIONS.has(action) && options?.inlineResult !== false) {
          appendActionResult(`✗ ${canceled}`, originSid);
        }
        return actionFail(canceled);
      }
      // 后悔药：执行前自动打工程快照（保留最近 10 份，设置›工程设置可恢复）。
      // 备份失败则阻止执行——宁可不做，也不做没有备份的不可逆操作。
      try {
        await snapshotBeforeDestructive(projectIdRef.current, copy.title);
      } catch (e) {
        const blocked = `快照备份失败，已阻止「${copy.title}」：${toErrorMessage(e) || e}`;
        showToast(blocked, 'error');
        if (INLINE_RESULT_ACTIONS.has(action) && options?.inlineResult !== false) {
          appendActionResult(`✗ ${blocked}`, originSid);
        }
        return actionFail(blocked);
      }
    }
    // 查询后台长任务状态：完成态必须同时核验工作流终态与资产落地，防止只凭注册表误报完成。
    if (action === 'get_task_status') {
      const requestedJobId = params?.jobId ? String(params.jobId) : undefined;
      const records = listLongTasks(projectIdRef.current).filter((task) => !requestedJobId || task.jobId === requestedJobId);
      if (!records.length) return requestedJobId ? `未找到工作流 #${requestedJobId} 的记录。` : '当前没有后台长任务。';
      const lines = await Promise.all(records.map(async (record) => {
        let status = record.status;
        let note = '';
        if (status === 'completed') {
          try {
            const actual = await getWorkflowStatus(record.jobId);
            if (actual.status !== 'completed') {
              status = actual.status;
              note = '工作流实际未完成';
            } else {
              let input = actual.input_params || {};
              if (typeof input === 'string') { try { input = JSON.parse(input); } catch { input = {}; } }
              const stateId = Number(input.stateId);
              const characterId = Number(input.characterId);
              if (stateId > 0 && characterId > 0) {
                const response = await fetch(`/api/characters/${characterId}/states`);
                const payload = response.ok ? await response.json() : { states: [] };
                const state = (payload.states || []).find((item: any) => Number(item.id) === stateId);
                if (!state || !state.front_view_url || !state.side_view_url || !state.back_view_url) {
                  status = 'failed';
                  note = '工作流虽完成，但角色状态未写入完整三视图，必须重新生成';
                }
              }
            }
          } catch {
            status = 'failed';
            note = '任务记录已失效或无法核验，不得宣称完成';
          }
        } else if (status === 'failed') {
          // 失败不是终点：把回写的失败原因说清楚，智能体才能自己重做而不是只汇报“失败了”。
          note = `${record.error ? `${record.error}；` : ''}该任务未产出可用资产，应重新生成后继续，不得宣称完成`;
        }
        const count = record.total > 0 ? `（${record.current}/${record.total}）` : '';
        return `- [${record.jobId}] ${record.title}：${LONG_TASK_STATUS_LABEL[status]} ${record.progress}%${count}${note ? `，${note}` : ''}`;
      }));
      const hasInvalid = lines.some((line) => line.includes('不得宣称完成') || line.includes('必须重新生成') || line.includes('应重新生成') || line.includes('实际未完成'));
      return `后台长任务（已核验工作流与资产落地）：\n${lines.join('\n')}${hasInvalid ? '\n\n上述失败或未完成记录以本次核验为准，禁止向用户宣称全部完成。' : ''}`;
    }

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

    // 看图：非 agent 循环路径（用户直接点击建议）下，把图片作为附件填入输入区，发送后 AI 才能看到画面
    if (action === 'view_image') {
      const targets = resolveImageTargets(params);
      if (targets.length === 0) {
        showToast('没找到匹配的图片', 'warning');
        return;
      }
      setAttachments((prev) => [
        ...prev,
        ...targets.filter((t) => !prev.some((p) => p.url === t.url)).map((t) => ({ type: 'image' as const, url: t.url, name: t.label })),
      ]);
      setInputText((prev) => prev || `请仔细查看这 ${targets.length} 张图（${targets.map((t) => t.label).join('、')}），描述实际画面内容并指出与分镜要求的差距。`);
      showToast(`已附加 ${targets.length} 张图片，点击发送让 AI 查看`, 'info');
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
      } catch (err) {
        showToast(toErrorMessage(err) || '优化失败', 'error');
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
      } catch (err) {
        showToast(toErrorMessage(err) || '重新分析失败', 'error');
      } finally {
        setIsAnalyzingScript(false);
      }
      return;
    }

    // AI 生成剧本：正文只写入剧本服务；对话内始终只保留一张受控行为卡片。
    if (action === 'generate_script') {
      const targetProjectId = Number(params?.projectId || projectId);
      const episodeNumber = params?.episodeNumber ? Number(params.episodeNumber) : undefined;
      const currentSid = originSid === undefined ? currentSessionIdRef.current : originSid;
      const cardId = `script-gen-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      const timestamp = Date.now();
      const initialTitle = params?.title || `第${episodeNumber || '新'}集剧本`;
      let activeStreamScriptId: number | undefined;
      let streamedContent = '';
      const finishScriptTab = (content?: string, error?: string) => {
        if (!activeStreamScriptId) return;
        window.dispatchEvent(new CustomEvent('streamScriptGeneration', {
          detail: { scriptId: activeStreamScriptId, content, streaming: false, error: error || '' },
        }));
        if (error) {
          window.dispatchEvent(new CustomEvent('reload-scripts', {
            detail: { projectId: targetProjectId, episodeNumber },
          }));
        }
        activeStreamScriptId = undefined;
      };
      let cardTask: TaskCardData = { kind: 'script', status: 'planning', title: `剧本 · ${initialTitle}` };

      const patchCard = (patch: Partial<TaskCardData>) => {
        cardTask = { ...cardTask, ...patch };
        updateSessionMessages(currentSid, (prev) => prev.map((m) => (
          m.id === cardId ? { ...m, content: '', running: false, task: { ...cardTask } } : m
        )));
      };
      const archiveCard = () => {
        if (!currentSid) return;
        void archiveMessage(currentSid, {
          id: cardId,
          role: 'assistant',
          content: '',
          timestamp,
          task: { ...cardTask },
        });
      };
      const stopLoading = () => {
        if (options?.inlineResult !== false && currentSessionIdRef.current === currentSid) setIsLoading(false);
      };
      const notifyTerminal = (terminal: 'completed' | 'failed', error?: string) => {
        const completed = terminal === 'completed';
        pushInternalMail({
          title: completed ? `任务完成：${cardTask.title}` : `任务未完成：${cardTask.title}`,
          content: completed
            ? `「${cardTask.title}」已完成，剧本已保存到左侧面板。`
            : `「${cardTask.title}」生成失败${error ? `：${error}` : '。'}`,
          mail_type: completed ? 'system' : 'warning',
          dedupe_key: cardTask.jobId ? `job:${cardTask.jobId}:${terminal}` : `script:${cardId}:${terminal}`,
        });
      };
      const failGeneration = (error: string, notify = true) => {
        finishScriptTab(undefined, error);
        patchCard({ status: 'failed' });
        archiveCard();
        if (notify) notifyTerminal('failed', error);
        onProgress?.('✗ 生成失败');
        stopLoading();
        return { success: false, error, scriptGeneration: true };
      };
      // 剧本创作完成后必问拆分：以澄清卡片落回发起会话，用户的选择作为下一条消息回传，
      // 由 agent 循环按回答决定是否执行 auto_storyboard（模型未获确认不得自行拆分）。
      // 卡片 id 按剧本 ID 生成，配合更新函数去重，避免同一剧本重复追问。
      const pushSplitInquiry = (scriptId?: number, title?: string) => {
        const inquiry: ChatMessageData = {
          id: `script-split-${scriptId || Date.now()}`,
          role: 'assistant',
          content: '',
          timestamp: Date.now(),
          ask: createAskCard(
            {
              question: `剧本《${title || initialTitle}》已写好，要不要现在就拆成分镜？`,
              options: ['立即拆分为分镜', '先修改剧本再拆分', '暂时不用拆分'],
            },
            '剧本已写好，是否拆分为分镜？',
          ),
        };
        updateSessionMessages(currentSid, (prev) =>
          prev.some((m) => m.id === inquiry.id) ? prev : [...prev, inquiry],
        );
        if (currentSid) archiveMessage(currentSid, inquiry);
      };
      const completeGeneration = async (
        scriptId?: number,
        resultEp?: number | null,
        resultTitle?: string | null,
        writer?: ScriptWriterInfo,
      ) => {
        const title = resultTitle || initialTitle;
        finishScriptTab(streamedContent || undefined);
        patchCard({ status: 'completed', title: `剧本 · ${title}`, scriptId });
        notifyTerminal('completed');
        archiveCard();
        // 保存接口已成功后才通知左侧列表刷新；事件只携带元数据，不携带正文。
        const detail: { projectId: number; episodeNumber?: number } = { projectId: targetProjectId };
        const ep = Number(resultEp ?? episodeNumber);
        if (Number.isFinite(ep) && ep > 0) detail.episodeNumber = ep;
        window.dispatchEvent(new CustomEvent('reload-scripts', { detail }));
        // 绑定新剧本供后续 auto_storyboard 使用；绑定失败不影响已保存结果。
        if (scriptId) { try { await onAction?.('bind_script', { scriptId }); } catch { /* 忽略绑定失败 */ } }
        onProgress?.('创作完毕 ✓');
        stopLoading();
        pushSplitInquiry(scriptId, title);
        return {
          success: true,
          scriptGeneration: true,
          status: 'completed',
          scriptId,
          episodeNumber: detail.episodeNumber,
          title,
          // 执笔者回执：模型据此如实播报「本轮由谁执笔」，不得虚构
          writer,
          // 观察结果里讲清「已追问」，否则模型会把追问当成自己的事再补一次或直接拆分
          nextStep: '系统已在对话中追问用户是否需要拆分为分镜。除非用户本轮已明确要求拆分，在用户回答之前禁止执行 auto_storyboard。'
            + (writer?.name ? ` 本轮剧本由 ${writer.name} 执笔${writer.recast ? '（本轮为重新选角）' : ''}，请在回复中如实播报执笔者并引用回执中的 writer 字段。` : '')
            // 同名原作：把结论交给模型转述，避免用户看到名著标题就以为系统在改编原作
            + (writer?.sameWork?.work
              ? ` 标题与 ${writer.sameWork.writer || writer.name} 的代表作《${writer.sameWork.work}》同名：系统只沿用笔法，未移植原作人物与情节，请用一句话向用户说明这是同名而非改编。`
              : ''),
        };
      };

      updateSessionMessages(currentSid, (prev) => [
        ...prev,
        { id: cardId, role: 'assistant', content: '', timestamp, task: { ...cardTask } },
      ]);
      if (options?.inlineResult !== false && currentSessionIdRef.current === currentSid) setIsLoading(true);
      onProgress?.('创作构想中…');

      if (!targetProjectId) return failGeneration('缺少项目ID，无法生成剧本');

      try {
        patchCard({ status: 'writing' });
        onProgress?.('内容写入中…');
        const result = await generateScriptStream({
          projectId: targetProjectId,
          title: params?.title,
          description: params?.description,
          style: params?.style,
          length: params?.length,
          episodeNumber,
          provider: params?.textModel || selectedModel,
          recastWriter: params?.recastWriter === true || String(params?.recastWriter) === 'true',
        }, {
          onMetadata: (metadata) => {
            const metadataId = Number(metadata.scriptId);
            const title = metadata.title || initialTitle;
            patchCard({ title: `剧本 · ${title}` });
            if (!Number.isFinite(metadataId) || metadataId <= 0) return;
            activeStreamScriptId = metadataId;
            window.dispatchEvent(new CustomEvent('openScriptGenerateTab', {
              detail: {
                episodeNumber: metadata.episodeNumber ?? episodeNumber,
                scriptId: metadataId,
                scriptTitle: title,
                scriptContent: '',
                scriptStreaming: true,
              },
            }));
            window.dispatchEvent(new CustomEvent('reload-scripts', {
              detail: { projectId: targetProjectId, episodeNumber: metadata.episodeNumber ?? episodeNumber },
            }));
          },
          onDelta: (delta) => {
            streamedContent += delta;
            if (!activeStreamScriptId) return;
            window.dispatchEvent(new CustomEvent('streamScriptGeneration', {
              detail: { scriptId: activeStreamScriptId, delta, streaming: true },
            }));
          },
        });
        const { jobId, scriptId, episodeNumber: resultEp, title: resultTitle, writer: resultWriter } = result;
        patchCard({ title: `剧本 · ${resultTitle || initialTitle}`, jobId });

        // 本地生成在 generateScript 返回时已持久化，无需回读或展示正文。
        if (!jobId) return completeGeneration(scriptId, resultEp, resultTitle, resultWriter);

        registerLongTask({
          jobId,
          title: `剧本 · ${resultTitle || initialTitle}`,
          kind: 'script',
          sessionId: currentSid,
          projectId: targetProjectId,
        });

        // 云端工作流在同一张卡片上轮询到终态；完成前不把控制权交给模型输出总结。
        return await new Promise((resolve) => {
          let settled = false;
          let polling = false;
          let pollInterval: ReturnType<typeof setInterval> | undefined;
          let timeout: ReturnType<typeof setTimeout> | undefined;
          const finish = (value: unknown) => {
            if (settled) return;
            settled = true;
            if (pollInterval) clearInterval(pollInterval);
            if (timeout) clearTimeout(timeout);
            resolve(value);
          };
          const poll = async () => {
            if (settled || polling) return;
            polling = true;
            try {
              const job = await getWorkflowStatus(jobId);
              if (job.status === 'completed') {
                finish(await completeGeneration(scriptId, resultEp, resultTitle, resultWriter));
              } else if (job.status === 'failed' || job.status === 'cancelled') {
                finish(failGeneration(job.error_message || '剧本生成失败'));
              }
            } catch (pollErr: any) {
              console.error('[ScriptGen] 轮询失败:', pollErr);
            } finally {
              polling = false;
            }
          };
          pollInterval = setInterval(() => { void poll(); }, 2000);
          timeout = setTimeout(() => finish(failGeneration('剧本生成超时', false)), 300000);
          void poll();
        });
      } catch (err) {
        return failGeneration(toErrorMessage(err) || '剧本生成失败');
      }
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
          const res = await fetch(`/api/scripts/project/${projectId}`);
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
      } catch (e) {
        return `读取剧本失败：${toErrorMessage(e) || e}`;
      }
    }

    // dismiss 不需要任何操作
    if (action === 'dismiss') {
      return;
    }

    // 主动读取当前工程分镜：直接读工程文档，不依赖分镜工作台是否挂载。
    // 需要真实 sceneId、核实拆分是否落地、回答「有哪些分镜」时都用它，不得让用户去分镜列表里点选。
    if (action === 'read_storyboards') {
      if (!projectId) return '当前没有打开的工程，无法读取分镜。';
      const sid = params?.scriptId != null ? Number(params.scriptId) : null;
      const ep = params?.episode != null ? Number(params.episode) : null;
      const keyword = String(params?.keyword || '').trim().toLowerCase();
      // 工作台已注册的分镜优先（内存态最新，含刚拆分/刚改名的结果）；
      // 若清单为空、或要按剧本/集数过滤但内存态没有作用域信息，则回落到工程文档，保证过滤条件有意义。
      let list: AISceneSummary[] = ((scenes as AISceneSummary[] | undefined) || []).filter(Boolean);
      const needScope = sid !== null || ep !== null;
      if (list.length === 0 || (needScope && list.every((s) => !s.scope))) {
        list = await fetchProjectScenes(projectId);
      }
      if (sid) list = list.filter((s) => !s.scope || s.scope === `s:${sid}`);
      if (ep) list = list.filter((s) => !s.scope || s.scope === `p:${projectId}:${ep}`);
      if (keyword) {
        list = list.filter((s) => `${s.description || ''} ${s.location || ''} ${(s.characters || []).join(' ')} ${(s.props || []).join(' ')}`.toLowerCase().includes(keyword));
      }
      if (list.length === 0) {
        return sid || ep || keyword
          ? `【工程分镜清单】按条件（scriptId=${sid ?? '-'} / episode=${ep ?? '-'} / keyword=${keyword || '-'}）未找到分镜。可去掉条件重试一次读全量。`
          : '【工程分镜清单】空：当前工程没有任何分镜（说明拆分尚未落库）。不要让用户去分镜列表里点选 ID；请先 read_script 取剧本正文，再执行 auto_storyboard 拆分，完成后用本动作复核数量。';
      }
      const scopeCount = new Map<string, number>();
      list.forEach((s) => {
        const k = s.scope || '未标注作用域';
        scopeCount.set(k, (scopeCount.get(k) || 0) + 1);
      });
      const groups = [...scopeCount.entries()].map(([sc, n]) => `${sc}：${n} 个`).join('，');
      return `【工程分镜清单】共 ${list.length} 个（${groups}）\n${renderScenesForAgent(list, Number(params?.max) || 80)}\n以上 ID 为工程内真实分镜 ID，可直接用于 generate_frame / generate_video / inspect_quality / update_scene 等动作的 sceneId。`;
    }

    // 工作台动作执行器未注册（当前页面没挂载分镜工作台/资源面板）时，
    // 绝不能把「根本没执行」回报成「已执行」——否则智能体会宣称拆分完成而工程里空无一物。
    if (!onAction) {
      const message = `当前页面未挂载可执行「${action}」的工作台，动作没有执行。请提示用户切到分镜工作台（或资源面板）后重试；只读动作（read_script / read_storyboards / get_task_status）在本面板内直接完成，不受此限制。`;
      if (options?.inlineResult !== false) appendActionResult(`✗ ${message}`, originSid);
      return { success: false, error: message };
    }

    // 桥接执行：第三参 onProgress 让工作台回报子步骤（步骤流细粒度反馈依赖它），
    // 返回值是动作执行结果，必须显式回传上层，否则 agent 循环拿不到 jobId。
    let result: any;
    try {
      result = await onAction?.(action, params, onProgress);
    } catch (err) {
      // 桥接抛错转为结构化失败结果：既让单次点击路径有明确反馈（不产生游离 Promise rejection），
      // 也让 agent 循环据实回报失败原因，避免误报成功。
      const message = toErrorMessage(err) || String(err) || '动作执行失败';
      if (INLINE_RESULT_ACTIONS.has(action)) {
        if (options?.inlineResult !== false) {
          appendActionResult(`✗ ${TASK_ACTION_LABEL[action] || action}失败：${message}`, originSid);
        }
      } else {
        showToast(`${TASK_ACTION_LABEL[action] || action}失败：${message}`, 'error');
      }
      return { success: false, error: message };
    }
    // 资源库与删除类动作：把成功/失败结果直接挂到对话中，和 agent 步骤流一起构成完整反馈。
    if (INLINE_RESULT_ACTIONS.has(action) && options?.inlineResult !== false) {
      const errorText = actionErrorText(result);
      const successText = actionSuccessText(result);
      if (errorText) {
        appendActionResult(`✗ ${TASK_ACTION_LABEL[action] || action}失败：${errorText}`, originSid);
      } else if (successText) {
        appendActionResult(`✓ ${successText}`, originSid);
      }
    }
    // 后台任务（分镜图/视频）提交后返回 jobId、离线分镜拆分同步完成返回 sceneCount：
    // 在对话内挂载进度卡片（任务未完成时同样挂载）；同时把结果回传供 agent 循环构造观察。
    mountTaskCard(action, result, undefined, originSid);
    return result;
  }, [currentFrame, triggerInspectQuality, resolveImageTargets, onAction, showToast, confirm, archiveMessage, updateSessionMessages, projectId, selectedModel, scripts, mountTaskCard, TASK_ACTION_LABEL, appendActionResult, handleSend]);

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
    // 人工动作（质检/优化/剧本分析）需要用户手动点击；
    // 删除类不可逆动作同样不自动执行——气泡上会显示按钮，用户点击后还要二次确认。
    const targets = last.suggestions.filter((s) =>
      !MANUAL_ONLY_ACTIONS.has(s.action) && s.action !== 'inspect_quality' && !requiresUserConfirm(s.action)
    );
    if (targets.length === 0) return;
    // 锁定发起会话：内层定时器不在本 effect 的清理范围内（取消会丢失已标记执行的动作），
    // 期间用户可能切换会话，故把 sid 随动作一起透传，卡片只落回发起它的那个对话。
    const originSid = currentSessionIdRef.current;
    const t = setTimeout(() => {
      // 旧流式/单轮路径：动作原始回复不归档，这里移除其空壳，再由 generate_script 自建唯一行为卡片。
      if (targets.some((target) => target.action === 'generate_script')) {
        updateSessionMessages(originSid, (prev) => prev.filter((m) => m.id !== last.id));
      }
      targets.forEach((target, i) => {
        setTimeout(() => {
          void handleAction(target.action, target.params, undefined, originSid);
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
      className="relative flex flex-col h-full bg-(--bg-app) border-l border-(--border-color) w-full"
      onDrop={handleDrop}
      onDragOver={handleDragOver}
    >
      <style>{`.ai-tabs-scroll::-webkit-scrollbar { display: none; }`}</style>
      {/* ─ Header ──────────────────────────────────────────── */}
      <div className="flex items-center justify-between px-2 py-1.5 border-b border-(--border-color) bg-(--bg-nav) gap-1">
        <div
          className="ai-tabs-scroll flex items-center gap-1 min-w-0 flex-1 overflow-x-auto"
          style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
        >
          {sessions.length === 0 ? (
            <span className="text-[11px] text-(--text-muted) shrink-0 px-1">新会话</span>
          ) : (
            sessions.slice(0, MAX_OPEN_TABS).map((s) => {
              const isActive = s.id === currentSessionId;
              const isBgLoading = !isActive && loadingSessionIds.has(s.id);
              return (
                <div
                  key={s.id}
                  className={`shrink-0 px-1.5 py-1 rounded-md text-[11px] transition-colors truncate max-w-27.5 flex items-center gap-1 group ${
                    isActive
                      ? 'bg-(--accent)/15 text-(--accent) font-medium'
                      : isBgLoading
                        ? 'text-(--accent)/70 bg-(--accent)/5'
                        : 'text-(--text-muted) hover:text-(--text-primary) hover:bg-(--bg-input)'
                  }`}
                  title={isBgLoading ? `${s.title}（后台处理中…）` : s.title}
                >
                  <button
                    onClick={() => switchSession(s.id)}
                    className="flex items-center gap-1 flex-1 min-w-0 truncate"
                  >
                    {isBgLoading && (
                      <span className="shrink-0 w-1.5 h-1.5 rounded-full bg-(--accent) animate-pulse" />
                    )}
                    <span className="truncate">{s.title}</span>
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      closeSession(s.id);
                    }}
                    className="shrink-0 p-0.5 rounded hover:bg-red-500/20 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all"
                    title="关闭此对话"
                  >
                    <X size={10} />
                  </button>
                </div>
              );
            })
          )}
        </div>
        <div className="flex items-center gap-0.5 shrink-0">
          <button
            onClick={() => setShowHistory(true)}
            className="p-1 rounded hover:bg-(--bg-input) text-(--text-muted) hover:text-(--text-primary) transition-colors"
            title="全部历史对话"
          >
            <History size={13} />
          </button>
          <button
            onClick={createNewSession}
            className="p-1 rounded hover:bg-(--bg-input) text-(--text-muted) hover:text-(--text-primary) transition-colors"
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
        <div className="shrink-0 px-3 py-2 border-b border-(--border-color) bg-(--bg-nav)">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-1.5 text-xs font-medium text-(--text-primary)">
              <Brain size={13} className="text-emerald-400" />
              <span>剧本分析</span>
            </div>
            <button
              onClick={() => { setShowScriptAnalysis(false); setScriptContent(''); }}
              className="p-0.5 rounded hover:bg-(--bg-input) text-(--text-muted) hover:text-(--text-primary)"
            >
              <X size={12} />
            </button>
          </div>
          <textarea
            value={scriptContent}
            onChange={(e) => setScriptContent(e.target.value)}
            placeholder="在此粘贴剧本内容，AI将从8个维度进行评分分析..."
            rows={3}
            className="w-full bg-(--bg-input) border border-(--border-color) rounded-lg px-2.5 py-2 text-[11px] text-(--text-primary) placeholder:text-(--text-muted) focus:outline-none focus:border-(--accent) resize-none overflow-y-auto"
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
                } catch (err) {
                  showToast(toErrorMessage(err) || '分析失败', 'error');
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
        <div className="px-3 py-3 space-y-3 relative z-1">
          {messages.map((msg) => (
            <ChatMessageComponent
              key={msg.id}
              message={msg}
              onAction={handleAction}
              onAskAnswer={handleAskAnswer}
              askDisabled={isLoading}
            />
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
        <div className="px-3 py-2 border-t border-(--border-color) flex gap-2 flex-wrap">
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
        const dotColor = contextUsage.percent >= 80 ? 'bg-red-400' : contextUsage.percent >= 60 ? 'bg-yellow-400' : 'bg-(--accent)';
        const textColor = contextUsage.percent >= 80 ? 'text-red-400' : contextUsage.percent >= 60 ? 'text-yellow-400' : 'text-(--accent)';
        return (
          <div className="px-3 pt-1.5 flex items-center justify-end gap-1.5">
            {/* 小徐章：占用比 + token */}
            <div
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] bg-(--bg-input) border border-(--border-color)"
              title={`已用 ${formatTokens(contextUsage.tokens)} / ${formatTokens(MAX_CONTEXT_TOKENS)} tokens，共 ${contextUsage.realMsgCount} 条消息`}
            >
              <span className={`w-1.5 h-1.5 rounded-full ${dotColor}`} />
              <span className={textColor + ' font-semibold'}>{contextUsage.percent}%</span>
              <span className="text-(--text-muted)">上下文</span>
            </div>
            {/* 新建会话：常驻 */}
            <button
              type="button"
              onClick={createNewSession}
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] text-(--text-muted) bg-(--bg-input) border border-(--border-color) hover:text-(--accent) hover:border-(--accent) transition-colors"
              title="创建新会话"
            >
              <Plus size={10} />
              <span>新建</span>
            </button>
          </div>
        );
      })()}

      {/* Composer card (Qoder-style) */}
      <div className="px-3 py-2 border-t border-(--border-color)">
        <div className="bg-(--bg-input) border border-(--border-color) rounded-xl focus-within:ring-1 focus-within:ring-(--accent) transition-shadow">
          <textarea
            ref={textareaRef}
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="规划与创作，Enter 发送，Shift+Enter 换行..."
            rows={2}
            className="w-full bg-transparent border-0 resize-none text-xs px-3 pt-2.5 pb-1 text-(--text-primary) placeholder:text-(--text-muted) focus:outline-none max-h-35 leading-relaxed"
          />
          <div className="flex items-center gap-1 px-1.5 pb-1.5 pt-0.5">
            <button
              onClick={openMediaPicker}
              className="p-1 rounded hover:bg-(--bg-app) text-(--text-muted) hover:text-(--text-primary) transition-colors"
              title="添加附件（任意文件）"
            >
              <Paperclip size={14} />
            </button>
            <button
              onClick={openImagePicker}
              className="p-1 rounded hover:bg-(--bg-app) text-(--text-muted) hover:text-(--text-primary) transition-colors"
              title="上传图片"
            >
              <ImageIcon size={14} />
            </button>
            <button
              onClick={openScriptPicker}
              className="p-1 rounded hover:bg-(--bg-app) text-(--text-muted) hover:text-(--text-primary) transition-colors"
              title="上传剧本文件让 AI 解析"
            >
              <FileText size={14} />
            </button>
            <button
              onClick={handleEnhancePrompt}
              disabled={isEnhancing || !inputText.trim()}
              className="p-1 rounded hover:bg-(--bg-app) text-(--text-muted) hover:text-(--accent) disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              title="提示词增强：自动改写当前输入为更清晰的指令"
            >
              {isEnhancing ? <Loader2 size={14} className="animate-spin" /> : <Wand2 size={14} />}
            </button>
            {currentFrame?.first_frame_url && (
              <button
                onClick={attachCurrentFrame}
                className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] text-(--accent) hover:bg-(--bg-app) transition-colors"
                title="附加当前帧图片"
              >
                <ImagePlus size={11} />
                <span>当前帧</span>
              </button>
            )}
            {currentFrame?.video_url && (
              <button
                onClick={attachCurrentVideo}
                className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] text-purple-400 hover:bg-(--bg-app) transition-colors"
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
                className={`flex items-center gap-1 text-[10px] pl-2 pr-1.5 py-0.5 rounded-md border transition-colors max-w-37.5 ${showSettings ? 'bg-(--bg-app) text-(--text-primary)' : 'bg-(--bg-app) text-(--text-muted) hover:text-(--text-primary)'}`}
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
                      <div className="absolute bottom-0 right-full mr-2 max-h-[calc(100vh-24px)] w-50 overflow-y-auto overflow-x-hidden rounded-xl border border-(--border-color) bg-(--bg-card) shadow-2xl">
                        {/* 头部：模型名 + 描述 */}
                        <div className="p-2.5 border-b border-(--border-color)">
                          <div className="text-[12px] font-semibold text-(--text-primary) truncate">{previewName}</div>
                          {preview?.description && (
                            <div className="mt-0.5 text-[9px] leading-relaxed text-(--text-muted)">{preview.description}</div>
                          )}
                        </div>
                        {!editingParams ? (
                          /* 只读预览 */
                          <div className="p-2.5 space-y-1 text-[10px]">
                            <div className="flex items-center justify-between">
                              <span className="text-(--text-muted)">上下文窗口</span>
                              <span className="text-(--text-primary)">{ctxLabel}</span>
                            </div>
                            <div className="flex items-center justify-between">
                              <span className="text-(--text-muted)">思考模式</span>
                              <span className="text-(--text-primary)">{thinkLabels[reasoningEffort]}</span>
                            </div>
                            <div className="pt-0.5 text-[9px] text-(--text-muted)">点击右侧「编辑」修改参数</div>
                          </div>
                        ) : (
                          /* 内联参数编辑 */
                          <div>
                            <div className="p-2.5 border-b border-(--border-color)">
                              <div className="text-[9px] font-medium uppercase tracking-wide text-(--text-muted) mb-1.5">上下文窗口</div>
                              <div className="space-y-0.5">
                                {CONTEXT_WINDOW_OPTIONS.map((n) => {
                                  const active = n === contextTokenLimit;
                                  return (
                                    <button
                                      key={n}
                                      type="button"
                                      onClick={() => setContextTokenLimit(n)}
                                      className={`w-full flex items-center justify-between gap-2 px-2 py-1 rounded text-left text-[10px] transition-colors ${
                                        active ? 'bg-(--accent)/10 text-(--accent)' : 'text-(--text-secondary) hover:bg-(--bg-app)'
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
                              <div className="text-[9px] font-medium uppercase tracking-wide text-(--text-muted) mb-1.5">思考模式</div>
                              <div className="space-y-0.5">
                                {(['low', 'medium', 'high'] as const).map((level) => {
                                  const active = level === reasoningEffort;
                                  return (
                                    <button
                                      key={level}
                                      type="button"
                                      onClick={() => setReasoningEffort(level)}
                                      className={`w-full flex items-center justify-between gap-2 px-2 py-1 rounded text-left text-[10px] transition-colors ${
                                        active ? 'bg-(--accent)/10 text-(--accent)' : 'text-(--text-secondary) hover:bg-(--bg-app)'
                                      }`}
                                    >
                                      <span>{thinkLabels[level]}</span>
                                      {active && <Check size={10} className="shrink-0" />}
                                    </button>
                                  );
                                })}
                              </div>
                            </div>
                            <div className="border-t border-(--border-color) p-2">
                              <button
                                type="button"
                                onClick={() => setEditingParams(false)}
                                className="w-full px-2 py-1 rounded-lg text-[10px] font-medium bg-(--accent) text-white hover:opacity-90 transition-opacity"
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
                  <div className="w-55 shrink-0 rounded-xl border border-(--border-color) bg-(--bg-card) shadow-2xl overflow-hidden">
                    <div className="py-0.5 max-h-70 overflow-y-auto">
                      {!modelsLoaded && modelOptions.length === 0 && (
                        <div className="px-4 py-3 text-[11px] text-(--text-muted) text-center">加载模型中…</div>
                      )}
                      {modelsLoaded && modelOptions.length === 0 && (
                        <div className="px-4 py-6 text-center">
                          <div className="text-[11px] text-(--text-secondary) mb-1">当前没有模型可用</div>
                          <div className="text-[10px] text-(--text-muted) leading-relaxed">请在「设置 › 模型」中配置模型</div>
                        </div>
                      )}
                      {modelOptions.map((m) => {
                        const active = m.name === selectedModel;
                        return (
                          <div
                            key={m.name}
                            onMouseEnter={() => setHoveredModel(m.name)}
                            className={`group relative flex items-center justify-between gap-2 px-3 py-1.5 transition-colors ${
                              active ? 'bg-(--accent)/10' : 'hover:bg-(--bg-app)'
                            }`}
                          >
                            <button
                              type="button"
                              onClick={() => { setSelectedModel(m.name); patchSettings({ chatModel: m.name }); }}
                              className="flex-1 min-w-0 text-left"
                            >
                              <div className={`text-[12px] font-medium truncate ${active ? 'text-(--accent)' : 'text-(--text-primary)'}`}>
                                {m.name}
                              </div>
                            </button>
                            <div className="flex items-center gap-2 shrink-0">
                              {/* 默认显示提供商，悬停时换为「编辑」按钮 */}
                              <div className="text-[10px] text-(--text-muted) group-hover:hidden">
                                {m.description?.split(' - ')[0] || 'Unknown'}
                              </div>
                              <button
                                type="button"
                                onClick={() => { setHoveredModel(m.name); setEditingParams(true); }}
                                className="hidden group-hover:flex items-center gap-1 text-[10px] text-(--text-secondary) hover:text-(--accent)"
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
            {/* 智能体记忆入口：查看/管理 AI 记住的用户偏好与工程决策 */}
            <button
              ref={memoryBtnRef}
              type="button"
              onClick={() => setShowMemory(!showMemory)}
              className={`p-1 rounded-md transition-colors ${showMemory ? 'text-(--accent) bg-(--bg-app)' : 'text-(--text-muted) hover:text-(--accent) hover:bg-(--bg-app)'}`}
              title="智能体记忆：查看/管理 AI 记住的偏好与决策"
              aria-label="智能体记忆"
            >
              <Brain size={14} />
            </button>
            {showMemory && memoryPopPos && createPortal(
              <div
                ref={memoryPopRef}
                className="fixed w-72 max-h-[calc(100vh-24px)] overflow-hidden rounded-xl border border-(--border-color) bg-(--bg-card) shadow-2xl"
                style={{ zIndex: 9999, right: memoryPopPos.right, bottom: memoryPopPos.bottom }}
              >
                <MemoryPanel projectId={projectId} projectName={projectName} showToast={showToast} />
              </div>,
              document.body
            )}
            {/* 压缩上下文：单图标，上下文达阈值后可点 */}
            <button
              type="button"
              onClick={handleCompressContext}
              disabled={contextUsage.percent < 50 || isCompressing}
              className="p-1 rounded-md text-(--text-muted) hover:text-(--accent) hover:bg-(--bg-app) disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:text-(--text-muted) disabled:hover:bg-transparent transition-colors"
              title={isCompressing ? '正在压缩上下文' : contextUsage.percent < 50 ? '上下文高于 50% 后可压缩' : '压缩当前会话为摘要'}
              aria-label="压缩上下文"
            >
              {isCompressing ? <Loader2 size={14} className="animate-spin" /> : <Shrink size={14} />}
            </button>
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
                onClick={() => handleSend()}
                disabled={!inputText.trim() && attachments.length === 0}
                className="p-1 rounded-md bg-(--accent) text-white hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed transition-opacity"
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
      {/* History modal */}
      {showHistory && (
        <HistoryModal
          sessions={allSessions}
          currentSessionId={currentSessionId}
          editingTitleId={editingTitleId}
          editingTitleDraft={editingTitleDraft}
          openTabIds={openTabIds}
          onClose={() => setShowHistory(false)}
          onSwitchSession={switchSession}
          onStartEdit={(id, title) => { setEditingTitleId(id); setEditingTitleDraft(title); }}
          onDraftChange={setEditingTitleDraft}
          onCommitEdit={(id, draft) => { renameSessionFn(id, draft); setEditingTitleId(null); }}
          onCancelEdit={() => setEditingTitleId(null)}
          onDelete={deleteSessionFn}
        />
      )}

    </div>
  );
};

export default AIAssistantPanel;
