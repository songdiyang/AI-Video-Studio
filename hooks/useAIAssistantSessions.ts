import { useState, useEffect, useCallback, useRef } from 'react';
import { getAuthToken } from '../services/auth';

export interface Session {
  id: number;
  title: string;
  model_name: string | null;
  message_count: number;
  last_message_at: string | null;
  created_at: string;
}

export interface SessionMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  attachments?: any[];
  suggestions?: any[];
  timestamp: number;
}

interface TabState {
  id: number;
  messages: SessionMessage[];
  isLoading?: boolean;
  streamingId?: string | null;
}

const MAX_TABS = 5;

function getStorageKey(projectId: number | null) {
  return projectId ? `ai_tabs_${projectId}` : 'ai_tabs_global';
}

export function useAIAssistantSessions(projectId: number | null) {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [openTabs, setOpenTabs] = useState<TabState[]>([]);
  const [activeId, setActiveId] = useState<number | null>(null);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const fetchingRef = useRef<Set<number>>(new Set());

  const token = getAuthToken();
  const headers = token ? { Authorization: `Bearer ${token}` } : {};

  // ── Load sessions list ────────────────────────────────
  const fetchSessions = useCallback(async () => {
    try {
      const url = projectId
        ? `/api/ai-assistant/sessions?projectId=${projectId}`
        : '/api/ai-assistant/sessions';
      const res = await fetch(url, { headers });
      const data = await res.json();
      if (data.success) {
        setSessions(data.sessions || []);
      }
    } catch (err) {
      console.error('[useAIAssistantSessions] fetchSessions error:', err);
    }
  }, [projectId]);

  useEffect(() => {
    fetchSessions();
  }, [fetchSessions]);

  // ── Restore tabs from localStorage ────────────────────
  useEffect(() => {
    try {
      const raw = localStorage.getItem(getStorageKey(projectId));
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed.tabIds && Array.isArray(parsed.tabIds) && parsed.tabIds.length > 0) {
          // 只恢复 tab 结构，消息从数据库重新加载
          setOpenTabs(parsed.tabIds.map((id: number) => ({ id, messages: [] })));
          setActiveId(parsed.activeId || parsed.tabIds[0]);
        }
      }
    } catch {
      // ignore
    }
  }, [projectId]);

  // ── Persist tabs to localStorage ──────────────────────
  useEffect(() => {
    const tabIds = openTabs.map((t) => t.id);
    localStorage.setItem(
      getStorageKey(projectId),
      JSON.stringify({ tabIds, activeId })
    );
  }, [openTabs, activeId, projectId]);

  // ── Load messages for a tab ───────────────────────────
  const loadMessages = useCallback(
    async (sessionId: number) => {
      if (fetchingRef.current.has(sessionId)) return;
      fetchingRef.current.add(sessionId);
      try {
        const res = await fetch(`/api/ai-assistant/sessions/${sessionId}/messages`, {
          headers,
        });
        const data = await res.json();
        if (data.success) {
          setOpenTabs((prev) =>
            prev.map((t) => (t.id === sessionId ? { ...t, messages: data.messages } : t))
          );
        }
      } catch (err) {
        console.error('[useAIAssistantSessions] loadMessages error:', err);
      } finally {
        fetchingRef.current.delete(sessionId);
      }
    },
    []
  );

  // ── Create new session ────────────────────────────────
  const createSession = useCallback(async () => {
    try {
      const res = await fetch('/api/ai-assistant/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...headers },
        body: JSON.stringify({ projectId }),
      });
      const data = await res.json();
      if (data.success && data.session) {
        const newSession: Session = data.session;
        setSessions((prev) => [newSession, ...prev]);
        setOpenTabs((prev) => {
          let next = [...prev, { id: newSession.id, messages: [] }];
          if (next.length > MAX_TABS) {
            next = next.slice(next.length - MAX_TABS);
          }
          return next;
        });
        setActiveId(newSession.id);
        return newSession.id;
      }
    } catch (err) {
      console.error('[useAIAssistantSessions] createSession error:', err);
    }
    return null;
  }, [projectId]);

  // ── Open a session (switch or load) ──────────────────
  const openSession = useCallback(
    async (sessionId: number) => {
      const existing = openTabs.find((t) => t.id === sessionId);
      if (existing) {
        setActiveId(sessionId);
        if (existing.messages.length === 0) {
          await loadMessages(sessionId);
        }
        return;
      }
      // 新建 tab，超过限制时移除最早的
      setOpenTabs((prev) => {
        let next = [...prev, { id: sessionId, messages: [] }];
        if (next.length > MAX_TABS) {
          next = next.slice(next.length - MAX_TABS);
        }
        return next;
      });
      setActiveId(sessionId);
      await loadMessages(sessionId);
    },
    [openTabs, loadMessages]
  );

  // ── Close a tab (not delete session) ──────────────────
  const closeTab = useCallback(
    (sessionId: number) => {
      setOpenTabs((prev) => {
        const next = prev.filter((t) => t.id !== sessionId);
        if (activeId === sessionId) {
          setActiveId(next.length > 0 ? next[next.length - 1].id : null);
        }
        return next;
      });
    },
    [activeId]
  );

  // ── Delete a session ──────────────────────────────────
  const deleteSession = useCallback(
    async (sessionId: number) => {
      try {
        const res = await fetch(`/api/ai-assistant/sessions/${sessionId}`, {
          method: 'DELETE',
          headers,
        });
        const data = await res.json();
        if (data.success) {
          setSessions((prev) => prev.filter((s) => s.id !== sessionId));
          setOpenTabs((prev) => {
            const next = prev.filter((t) => t.id !== sessionId);
            if (activeId === sessionId) {
              setActiveId(next.length > 0 ? next[next.length - 1].id : null);
            }
            return next;
          });
        }
      } catch (err) {
        console.error('[useAIAssistantSessions] deleteSession error:', err);
      }
    },
    [activeId]
  );

  // ── Rename a session ──────────────────────────────────
  const renameSession = useCallback(async (sessionId: number, title: string) => {
    try {
      const res = await fetch(`/api/ai-assistant/sessions/${sessionId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...headers },
        body: JSON.stringify({ title: title.trim().substring(0, 120) }),
      });
      const data = await res.json();
      if (data.success) {
        setSessions((prev) =>
          prev.map((s) => (s.id === sessionId ? { ...s, title: title.trim().substring(0, 120) } : s))
        );
      }
    } catch (err) {
      console.error('[useAIAssistantSessions] renameSession error:', err);
    }
  }, []);

  // ── Generate title after first message ────────────────
  const generateTitle = useCallback(
    async (sessionId: number, modelName: string) => {
      try {
        const res = await fetch(`/api/ai-assistant/sessions/${sessionId}/generate-title`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...headers },
          body: JSON.stringify({ modelName }),
        });
        const data = await res.json();
        if (data.success && data.title) {
          setSessions((prev) =>
            prev.map((s) => (s.id === sessionId ? { ...s, title: data.title } : s))
          );
        }
      } catch (err) {
        console.error('[useAIAssistantSessions] generateTitle error:', err);
      }
    },
    []
  );

  // ── Append message locally (for optimistic UI / streaming) ──
  const appendMessage = useCallback((sessionId: number, message: SessionMessage) => {
    setOpenTabs((prev) =>
      prev.map((t) => (t.id === sessionId ? { ...t, messages: [...t.messages, message] } : t))
    );
  }, []);

  const setTabMessages = useCallback((sessionId: number, messages: SessionMessage[]) => {
    setOpenTabs((prev) =>
      prev.map((t) => (t.id === sessionId ? { ...t, messages } : t))
    );
  }, []);

  const setTabLoading = useCallback((sessionId: number, isLoading: boolean, streamingId?: string | null) => {
    setOpenTabs((prev) =>
      prev.map((t) => (t.id === sessionId ? { ...t, isLoading, streamingId } : t))
    );
  }, []);

  const activeTab = openTabs.find((t) => t.id === activeId) || null;

  return {
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
    renameSession,
    generateTitle,
    appendMessage,
    setTabMessages,
    setTabLoading,
    loadMessages,
    refreshSessions: fetchSessions,
  };
}
