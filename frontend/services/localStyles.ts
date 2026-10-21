// 用户自定义风格预设（/api/projects/my-styles）的本地实现
//
// 桌面端无 Node 后端时，把用户风格预设持久化到浏览器/WebView 的 localStorage
// （离线为单用户模型，风格预设跨工程复用，故用全局键而非 .jzp 工程文档）。
// 返回形状与 backend 的 aiAssistantRoutes / projectsRoutes 对齐，
// 使 Projects.tsx、QuickStartWizard 的增删改查在本地即时生效。

export interface UserStylePreset {
  id: number;
  name: string;
  prompt: string;
  style_category: 'anime' | 'live_action';
  created_at: string;
  updated_at: string;
}

interface StylesStore {
  nextId: number;
  styles: UserStylePreset[];
}

const STORAGE_KEY = 'jzp.user_styles';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function nowIso(): string {
  return new Date().toISOString();
}

function loadStore(): StylesStore {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<StylesStore>;
      return {
        nextId: Number(parsed.nextId) || 1,
        styles: Array.isArray(parsed.styles) ? parsed.styles : [],
      };
    }
  } catch (err) {
    console.warn('[localStyles] 读取风格预设失败:', err);
  }
  return { nextId: 1, styles: [] };
}

function saveStore(store: StylesStore): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  } catch (err) {
    console.warn('[localStyles] 写入风格预设失败:', err);
  }
}

function normalizeCategory(v: unknown): 'anime' | 'live_action' {
  return v === 'live_action' ? 'live_action' : 'anime';
}

// ---- 各端点处理 ----
function handleList(): Response {
  const store = loadStore();
  return jsonResponse({ success: true, styles: store.styles });
}

function handleCreate(body: any): Response {
  const store = loadStore();
  const id = store.nextId++;
  const now = nowIso();
  const style: UserStylePreset = {
    id,
    name: String(body?.name || '').trim() || '未命名风格',
    prompt: String(body?.prompt || ''),
    style_category: normalizeCategory(body?.style_category),
    created_at: now,
    updated_at: now,
  };
  store.styles.push(style);
  saveStore(store);
  return jsonResponse({ success: true, style });
}

function handleUpdate(idStr: string, body: any): Response {
  const store = loadStore();
  const id = Number(idStr);
  const idx = store.styles.findIndex((s) => s.id === id);
  if (idx === -1) return jsonResponse({ success: false, message: '风格不存在' }, 404);
  const cur = store.styles[idx];
  const next: UserStylePreset = {
    ...cur,
    name: body?.name !== undefined ? String(body.name).trim() || cur.name : cur.name,
    prompt: body?.prompt !== undefined ? String(body.prompt) : cur.prompt,
    style_category: body?.style_category !== undefined ? normalizeCategory(body.style_category) : cur.style_category,
    updated_at: nowIso(),
  };
  store.styles[idx] = next;
  saveStore(store);
  return jsonResponse({ success: true, style: next });
}

function handleDelete(idStr: string): Response {
  const store = loadStore();
  const id = Number(idStr);
  store.styles = store.styles.filter((s) => s.id !== id);
  saveStore(store);
  return jsonResponse({ success: true, message: 'deleted' });
}

/**
 * 路由 /api/projects/my-styles 族端点。
 * 命中返回 Response，否则返回 null 交回上游继续处理。
 */
export function routeStyles(url: URL, method: string, body: any): Response | null {
  const pathname = url.pathname;
  const m = method.toUpperCase();
  let mt: RegExpMatchArray | null;

  if (pathname === '/api/projects/my-styles') {
    if (m === 'GET') return handleList();
    if (m === 'POST') return handleCreate(body || {});
  }
  if ((mt = pathname.match(/^\/api\/projects\/my-styles\/(\d+)$/))) {
    if (m === 'PUT') return handleUpdate(mt[1], body || {});
    if (m === 'DELETE') return handleDelete(mt[1]);
  }
  return null;
}
