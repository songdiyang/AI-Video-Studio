/**
 * 本地站内信存储与服务
 * ──────────────────────────────────────────────────────────────
 * 纯离线架构下 InternalMailbox 走 /api/mail，本模块负责本地实现：
 *  - localStorage 持久化（应用级，不区分工程）
 *  - 提供推送接口（长任务完成等）
 *  - 提供 /api/mail* 路由，供 fetch 拦截器调用
 * 写入后派发 internal-mailbox:updated，让未读徽标与列表即时刷新。
 */

export interface LocalMailRecord {
  id: number;
  sender_type: 'system' | 'admin';
  title: string;
  content: string;
  mail_type: 'reply' | 'announce' | 'system' | 'task' | 'points_change';
  related_feedback_id: number | null;
  related_task_id: number | null;
  is_read: 0 | 1;
  created_at: string;
  /** 内部去重键（如长任务 jobId），仅本地使用，不展示 */
  dedupe_key?: string;
}

const STORAGE_KEY = 'nanostory_internal_mails_v1';
const MAX_MAILS = 200;

function read(): LocalMailRecord[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const list = JSON.parse(raw);
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

function write(list: LocalMailRecord[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list.slice(0, MAX_MAILS)));
  } catch {
    // 忽略配额/序列化失败
  }
  window.dispatchEvent(new CustomEvent('internal-mailbox:updated'));
}

export interface PushMailInput {
  title: string;
  content: string;
  mail_type?: LocalMailRecord['mail_type'];
  dedupe_key?: string;
}

/** 推送一条站内信；dedupe_key 相同的消息不会重复写入 */
export function pushInternalMail(input: PushMailInput): LocalMailRecord | null {
  const list = read();
  if (input.dedupe_key && list.some((m) => m.dedupe_key === input.dedupe_key)) {
    return null;
  }
  const nextId = list.reduce((max, m) => Math.max(max, m.id || 0), 0) + 1;
  const mail: LocalMailRecord = {
    id: nextId,
    sender_type: 'system',
    title: input.title,
    content: input.content,
    mail_type: input.mail_type || 'system',
    related_feedback_id: null,
    related_task_id: null,
    is_read: 0,
    created_at: new Date().toISOString(),
    ...(input.dedupe_key ? { dedupe_key: input.dedupe_key } : {}),
  };
  write([mail, ...list]);
  return mail;
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

/** 处理 /api/mail* 的本地路由；未匹配返回 null */
export function routeLocalMail(url: URL, method: string): Response | null {
  const m = method.toUpperCase();
  const pathname = url.pathname;

  if (pathname === '/api/mail/unread-count' && m === 'GET') {
    const count = read().filter((mail) => mail.is_read === 0).length;
    return jsonResponse({ count });
  }

  if (pathname === '/api/mail' && m === 'GET') {
    const page = Math.max(1, Number(url.searchParams.get('page')) || 1);
    const limit = Math.max(1, Number(url.searchParams.get('limit')) || 20);
    const list = read();
    const start = (page - 1) * limit;
    return jsonResponse({
      mails: list.slice(start, start + limit),
      total: list.length,
      page,
      limit,
    });
  }

  const readMatch = /^\/api\/mail\/(\d+)\/read$/.exec(pathname);
  if (readMatch && m === 'PATCH') {
    const id = Number(readMatch[1]);
    const list = read().map((mail) => (mail.id === id ? { ...mail, is_read: 1 as const } : mail));
    write(list);
    return jsonResponse({ success: true });
  }

  if (pathname === '/api/mail/read-all' && m === 'PATCH') {
    write(read().map((mail) => ({ ...mail, is_read: 1 as const })));
    return jsonResponse({ success: true });
  }

  const deleteMatch = /^\/api\/mail\/(\d+)$/.exec(pathname);
  if (deleteMatch && m === 'DELETE') {
    const id = Number(deleteMatch[1]);
    write(read().filter((mail) => mail.id !== id));
    return jsonResponse({ success: true });
  }

  return null;
}
