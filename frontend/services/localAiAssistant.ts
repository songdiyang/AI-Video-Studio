// AI 助手会话本地持久化（离线模式）
//
// 桌面离线模式下，AI 助手的会话与消息不再依赖云端后端（/api/ai-assistant/sessions），
// 忠实回放后端契约（字段形状与 aiAssistantRoutes.js 对齐）：
//  - GET    /api/ai-assistant/sessions?projectId=      → { success, sessions }
//  - POST   /api/ai-assistant/sessions                 → { success, session }
//  - GET    /api/ai-assistant/sessions/:id/messages    → { success, messages }
//  - POST   /api/ai-assistant/sessions/:id/messages    → { success, messageId }
//  - PATCH  /api/ai-assistant/sessions/:id             → { success }
//  - DELETE /api/ai-assistant/sessions/:id             → { success }
//  - POST   /api/ai-assistant/sessions/:id/generate-title → { success, title }（本地启发式截取）
//
// 存储位置：活动工程 .jzp/data/ai_sessions.json（Rust 原子写 + 防抖合并）；
// 无活动工程时降级到 localStorage 应用级键，保证全局会话同样可持久化。

import { readDoc, writeDoc, resolveLocalPath, getActiveProjectPath } from './localStore';

// ==================== 数据模型 ====================

export interface LocalAssistantSession {
  id: number;
  project_id: number | null;
  title: string;
  model_name: string | null;
  message_count: number;
  last_message_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface StoredAssistantMessage {
  id: number;
  session_id: number;
  role: string;
  content: string;
  reasoning?: string | null;
  attachments?: unknown;
  suggestions?: unknown;
  created_at: string;
}

export interface AiSessionsDoc {
  nextId: number;
  nextMsgId: number;
  sessions: LocalAssistantSession[];
  messages: StoredAssistantMessage[];
}

const EMPTY_DOC: AiSessionsDoc = { nextId: 1, nextMsgId: 1, sessions: [], messages: [] };
const GLOBAL_DOC_KEY = 'ai_sessions_global';
const MAX_LIST = 100;

// ==================== 文档读写（工程文档 / 全局降级） ====================

/** 解析会话文档位置：显式 projectId 优先（本地工程文档），其次活动工程，最后 localStorage 全局档。
 * 注意：读写必须用同一 projectId 路由，切工程后仍能看到旧工程的会话。 */
async function docLocation(projectId?: number | null): Promise<{ path: string | null }> {
  if (projectId != null && Number.isFinite(projectId)) {
    const p = await resolveLocalPath(projectId);
    if (p) return { path: p };
  }
  return { path: getActiveProjectPath() };
}

async function loadDoc(projectId?: number | null): Promise<AiSessionsDoc> {
  const { path } = await docLocation(projectId);
  if (path) {
    const doc = await readDoc<Partial<AiSessionsDoc>>(path, 'aiSessions', {});
    return {
      nextId: doc.nextId || 1,
      nextMsgId: doc.nextMsgId || 1,
      sessions: Array.isArray(doc.sessions) ? doc.sessions : [],
      messages: Array.isArray(doc.messages) ? doc.messages : [],
    };
  }
  return loadGlobalDoc();
}

/** 无工程上下文时的应用级全局档（localStorage） */
async function loadGlobalDoc(): Promise<AiSessionsDoc> {
  try {
    const raw = localStorage.getItem(GLOBAL_DOC_KEY);
    if (raw) {
      const doc = JSON.parse(raw) as Partial<AiSessionsDoc>;
      return {
        nextId: doc.nextId || 1,
        nextMsgId: doc.nextMsgId || 1,
        sessions: Array.isArray(doc.sessions) ? doc.sessions : [],
        messages: Array.isArray(doc.messages) ? doc.messages : [],
      };
    }
  } catch {
    // ignore parse error，退回空文档
  }
  return { ...EMPTY_DOC, sessions: [], messages: [] };
}

function saveGlobalDoc(doc: AiSessionsDoc): void {
  try {
    localStorage.setItem(GLOBAL_DOC_KEY, JSON.stringify(doc));
  } catch {
    // 存储配额不足时静默丢弃（与面板既有 localStorage 策略一致）
  }
}

function saveDoc(doc: AiSessionsDoc, projectId?: number | null): void {
  void docLocation(projectId).then(({ path }) => {
    if (path) {
      writeDoc(path, 'aiSessions', doc);
      return;
    }
    saveGlobalDoc(doc);
  });
}

// ==================== 形状转换（与后端返回对齐） ====================

function toSessionLite(s: LocalAssistantSession) {
  return {
    id: s.id,
    title: s.title,
    model_name: s.model_name,
    message_count: s.message_count,
    last_message_at: s.last_message_at,
    created_at: s.created_at,
  };
}

function safeJson(str: unknown): any {
  if (str == null) return null;
  if (typeof str === 'object') return str;
  try {
    return JSON.parse(String(str));
  } catch {
    return null;
  }
}

function toMessageDto(m: StoredAssistantMessage) {
  const parsed = safeJson(m.content);
  return {
    id: String(m.id),
    role: m.role,
    content: parsed ?? m.content,
    reasoning: m.reasoning || undefined,
    attachments: Array.isArray(m.attachments) ? m.attachments : undefined,
    suggestions: Array.isArray(m.suggestions) ? m.suggestions : undefined,
    timestamp: new Date(m.created_at).getTime(),
  };
}

// ==================== 响应构造 ====================

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

/** 按会话 id 定位文档：先查当前作用域（活动工程），再查全局档；
 * 消息/重命名/删除只携带 sessionId，据此保证跨工程切换后仍能命中。
 * 回写时按会话自身的 project_id 路由（非活动工程时落到全局档，与 loadDoc 的降级读取一致）。 */
async function locateSession(sessionId: number): Promise<{ doc: AiSessionsDoc; projectId: number | null } | null> {
  const activeDoc = await loadDoc();
  if (activeDoc.sessions.some((s) => s.id === sessionId)) {
    const session = activeDoc.sessions.find((s) => s.id === sessionId)!;
    return { doc: activeDoc, projectId: session.project_id };
  }
  const globalDoc = await loadGlobalDoc();
  if (globalDoc.sessions.some((s) => s.id === sessionId)) {
    return { doc: globalDoc, projectId: -1 }; // -1 标记：回写全局档
  }
  return null;
}

async function loadScopedDoc(projectId: number | null): Promise<AiSessionsDoc> {
  if (projectId === -1) return loadGlobalDoc();
  return loadDoc(projectId);
}

function saveScopedDoc(doc: AiSessionsDoc, projectId: number | null): void {
  if (projectId === -1) {
    saveGlobalDoc(doc);
    return;
  }
  saveDoc(doc, projectId);
}

// ==================== 会话处理器 ====================

/** GET /sessions?projectId= —— 后端按 project_id 精确隔离（null 表示全局会话） */
async function handleSessionList(sp: URLSearchParams): Promise<Response> {
  const hasProject = sp.get('projectId') != null && sp.get('projectId') !== '';
  const projectId = hasProject ? Number(sp.get('projectId')) : null;
  const doc = await loadDoc(projectId);
  const filtered = doc.sessions.filter((s) =>
    hasProject ? s.project_id === projectId : s.project_id === null
  );
  const sessions = filtered
    .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime())
    .slice(0, MAX_LIST)
    .map(toSessionLite);
  return jsonResponse({ success: true, sessions });
}

/** POST /sessions { projectId, title, modelName } */
async function handleSessionCreate(body: any): Promise<Response> {
  const projectId = body?.projectId ? Number(body.projectId) : null;
  const doc = await loadDoc(projectId);
  const now = new Date().toISOString();
  const session: LocalAssistantSession = {
    id: doc.nextId++,
    project_id: projectId,
    title: String(body?.title || '新会话').slice(0, 120),
    model_name: body?.modelName ?? null,
    message_count: 0,
    last_message_at: null,
    created_at: now,
    updated_at: now,
  };
  doc.sessions.push(session);
  saveDoc(doc, projectId);
  return jsonResponse({ success: true, session: toSessionLite(session) });
}

/** PATCH /sessions/:id { title } */
async function handleSessionRename(idStr: string, body: any): Promise<Response> {
  const title = String(body?.title ?? '').trim();
  if (!title) return jsonResponse({ success: false, error: '缺少 title' }, 400);
  const located = await locateSession(Number(idStr));
  if (!located) return jsonResponse({ success: false, error: '会话不存在' }, 404);
  const { doc, projectId } = located;
  const session = doc.sessions.find((s) => s.id === Number(idStr))!;
  session.title = title.slice(0, 120);
  session.updated_at = new Date().toISOString();
  saveScopedDoc(doc, projectId);
  return jsonResponse({ success: true });
}

/** DELETE /sessions/:id —— 级联删除消息 */
async function handleSessionDelete(idStr: string): Promise<Response> {
  const id = Number(idStr);
  const located = await locateSession(id);
  if (!located) return jsonResponse({ success: false, error: '会话不存在' }, 404);
  const { doc, projectId } = located;
  doc.sessions = doc.sessions.filter((s) => s.id !== id);
  doc.messages = doc.messages.filter((m) => m.session_id !== id);
  saveScopedDoc(doc, projectId);
  return jsonResponse({ success: true });
}

// ==================== 消息处理器 ====================

/** GET /sessions/:id/messages */
async function handleMessagesLoad(idStr: string): Promise<Response> {
  const sessionId = Number(idStr);
  const located = await locateSession(sessionId);
  if (!located) return jsonResponse({ success: false, error: '会话不存在' }, 404);
  const messages = located.doc.messages
    .filter((m) => m.session_id === sessionId)
    .sort((a, b) => a.id - b.id)
    .map(toMessageDto);
  return jsonResponse({ success: true, messages });
}

/** POST /sessions/:id/messages { role, content, reasoning?, attachments?, suggestions? } */
async function handleMessageAppend(idStr: string, body: any): Promise<Response> {
  const sessionId = Number(idStr);
  const located = await locateSession(sessionId);
  if (!located) return jsonResponse({ success: false, error: '会话不存在' }, 404);
  const { doc, projectId } = located;
  const session = doc.sessions.find((s) => s.id === sessionId)!;
  const { role, content } = body || {};
  if (!role || content == null) {
    return jsonResponse({ success: false, error: '缺少 role 或 content' }, 400);
  }
  const now = new Date().toISOString();
  const msg: StoredAssistantMessage = {
    id: doc.nextMsgId++,
    session_id: sessionId,
    role: String(role).slice(0, 16),
    content: typeof content === 'string' ? content : JSON.stringify(content),
    reasoning: body.reasoning || null,
    attachments: body.attachments ?? null,
    suggestions: body.suggestions ?? null,
    created_at: now,
  };
  doc.messages.push(msg);
  session.message_count += 1;
  session.last_message_at = now;
  session.updated_at = now;
  saveScopedDoc(doc, projectId);
  return jsonResponse({ success: true, messageId: msg.id });
}

/** POST /sessions/:id/generate-title —— 离线无法调用 LLM，用首条用户消息启发式截取 */
async function handleGenerateTitle(idStr: string): Promise<Response> {
  const sessionId = Number(idStr);
  const located = await locateSession(sessionId);
  if (!located) return jsonResponse({ success: false, error: '会话不存在' }, 404);
  const { doc, projectId } = located;
  const session = doc.sessions.find((s) => s.id === sessionId)!;
  const firstUser = doc.messages
    .filter((m) => m.session_id === sessionId && m.role === 'user')
    .sort((a, b) => a.id - b.id)[0];
  if (!firstUser) return jsonResponse({ success: true, title: session.title || '新会话' });
  const plain = String(safeJson(firstUser.content) ?? firstUser.content)
    .replace(/\s+/g, ' ')
    .trim();
  const title = plain.slice(0, 12) || '新会话';
  session.title = title;
  session.updated_at = new Date().toISOString();
  saveScopedDoc(doc, projectId);
  return jsonResponse({ success: true, title });
}

// ==================== 路由入口 ====================

/** 匹配 /api/ai-assistant/sessions* 路由；未匹配返回 null（透传给真实 fetch）。 */
export async function routeAiAssistantSessions(
  url: URL,
  method: string,
  body: any
): Promise<Response | null> {
  const pathname = url.pathname;
  const m = method.toUpperCase();
  let mt: RegExpMatchArray | null;

  if (pathname === '/api/ai-assistant/sessions') {
    if (m === 'GET') return handleSessionList(url.searchParams);
    if (m === 'POST') return handleSessionCreate(body);
    return null;
  }
  if ((mt = pathname.match(/^\/api\/ai-assistant\/sessions\/(\d+)\/messages$/))) {
    if (m === 'GET') return handleMessagesLoad(mt[1]);
    if (m === 'POST') return handleMessageAppend(mt[1], body);
    return null;
  }
  if ((mt = pathname.match(/^\/api\/ai-assistant\/sessions\/(\d+)\/generate-title$/)) && m === 'POST') {
    return handleGenerateTitle(mt[1]);
  }
  if ((mt = pathname.match(/^\/api\/ai-assistant\/sessions\/(\d+)$/))) {
    if (m === 'PATCH') return handleSessionRename(mt[1], body);
    if (m === 'DELETE') return handleSessionDelete(mt[1]);
    return null;
  }
  return null;
}
