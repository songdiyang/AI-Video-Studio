// 本地通用 REST CRUD 路由（localRest）
//
// 桌面本地化下，资产域（角色/场景/建筑/环境/服装/影棚/场景元素/环境变体等）
// 后端遵循统一 REST 约定：
//   GET    /api/<base>?<scopeQuery>=        → { [listKey]: items }
//   GET    /api/<base>/project/:id          → { [listKey]: items }（部分域提供项目别名）
//   GET    /api/<base>/:id                  → { [itemKey]: item }
//   POST   /api/<base>                       → { [itemKey]: item }
//   PUT|PATCH /api/<base>/:id                → { [itemKey]: item }
//   DELETE /api/<base>/:id                   → { message }
//
// 本文件仅处理「列表 + 单条 CRUD」这两类形态（路径为 /api/<base> 或 /api/<base>/<数字>）。
// 任何多段特殊子路径（/states、/bindings、/generate-image 等）一律返回 null 交由各域专属处理器接管。
//
// 请求体键为 camelCase，存储/响应回放后端约定的 snake_case；此处做浅层顶层键归一。

import {
  readDoc,
  writeDoc,
  resolveLocalPath,
  getActiveProjectPath,
  type LocalDocName,
} from './localStore';

// ==================== 文档模型 ====================

/** 每个资产域文档：自增 id + 条目数组 */
export interface RestDoc {
  nextId: number;
  items: any[];
}

const EMPTY_DOC: RestDoc = { nextId: 1, items: [] };

// ==================== 域配置 ====================

interface RestDomain {
  /** URL 段，如 scene-elements */
  base: string;
  /** 对应 LOCAL_DOCS 键 */
  doc: LocalDocName;
  /** 单条包裹键，如 character */
  itemKey: string;
  /** 列表包裹键，如 characters */
  listKey: string;
  /** 作用域存储字段（snake），如 project_id / environment_id */
  scopeKey: string;
  /** 作用域查询字段（camel），如 projectId / environmentId */
  scopeQuery: string;
  /** 是否支持 /project/:id 列表别名 */
  allowProjectAlias?: boolean;
}

const REST_DOMAINS: RestDomain[] = [
  { base: 'characters', doc: 'characters', itemKey: 'character', listKey: 'characters', scopeKey: 'project_id', scopeQuery: 'projectId', allowProjectAlias: true },
  { base: 'scenes', doc: 'scenes', itemKey: 'scene', listKey: 'scenes', scopeKey: 'project_id', scopeQuery: 'projectId', allowProjectAlias: true },
  { base: 'buildings', doc: 'buildings', itemKey: 'building', listKey: 'buildings', scopeKey: 'project_id', scopeQuery: 'projectId' },
  { base: 'environments', doc: 'environments', itemKey: 'environment', listKey: 'environments', scopeKey: 'project_id', scopeQuery: 'projectId' },
  { base: 'costumes', doc: 'costumes', itemKey: 'costume', listKey: 'costumes', scopeKey: 'project_id', scopeQuery: 'projectId' },
  { base: 'scene-elements', doc: 'sceneElements', itemKey: 'element', listKey: 'elements', scopeKey: 'project_id', scopeQuery: 'projectId' },
  { base: 'studios', doc: 'studios', itemKey: 'studio', listKey: 'studios', scopeKey: 'project_id', scopeQuery: 'projectId' },
  { base: 'environment-variants', doc: 'environmentVariants', itemKey: 'variant', listKey: 'variants', scopeKey: 'environment_id', scopeQuery: 'environmentId' },
];

// ==================== 工具 ====================

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

/** camelCase 顶层键 → snake_case；已是 snake 的键保持不变（幂等） */
function camelToSnake(key: string): string {
  return key.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);
}

function normalizeIncomingKeys(body: Record<string, any> | null | undefined): Record<string, any> {
  const out: Record<string, any> = {};
  for (const [k, v] of Object.entries(body || {})) {
    out[camelToSnake(k)] = v;
  }
  return out;
}

async function loadDoc(path: string, doc: LocalDocName): Promise<RestDoc> {
  const raw = await readDoc<Partial<RestDoc>>(path, doc, {});
  const items = Array.isArray(raw.items) ? raw.items : [];
  const maxId = items.reduce((mx: number, it: any) => Math.max(mx, Number(it?.id) || 0), 0);
  return { nextId: Math.max(Number(raw.nextId) || 1, maxId + 1), items };
}

/** 解析写/读归属工程路径：优先显式 projectId，其次活动工程。 */
async function resolvePath(projectId?: number | null): Promise<string | null> {
  if (projectId && Number.isFinite(projectId) && projectId > 0) {
    const p = await resolveLocalPath(projectId);
    if (p) return p;
  }
  return getActiveProjectPath();
}

function matchDomain(pathname: string): { domain: RestDomain; id: string | null; aliasProjectId: number | null } | null {
  for (const domain of REST_DOMAINS) {
    if (domain.allowProjectAlias) {
      const alias = pathname.match(new RegExp(`^/api/${domain.base}/project/(\\d+)$`));
      if (alias) return { domain, id: null, aliasProjectId: Number(alias[1]) };
    }
    if (pathname === `/api/${domain.base}`) return { domain, id: null, aliasProjectId: null };
    const one = pathname.match(new RegExp(`^/api/${domain.base}/(\\d+)$`));
    if (one) return { domain, id: one[1], aliasProjectId: null };
  }
  return null;
}

// ==================== 分发 ====================

/**
 * 尝试以通用 CRUD 回放 `/api/<base>` 与 `/api/<base>/:id`（含项目别名列表）。
 * 命中返回 Response；未命中（非资产域、或多段特殊子路径）返回 null。
 */
export async function routeRest(url: URL, method: string, body: any): Promise<Response | null> {
  const pathname = url.pathname;
  const m = method.toUpperCase();
  const hit = matchDomain(pathname);
  if (!hit) return null;
  const { domain, id: idStr, aliasProjectId } = hit;

  // ---- 列表（别名 / project/:id 或 GET /api/<base>）----
  if (idStr === null) {
    // POST 创建（仅 /api/<base>，别名路径不接受创建）
    if (aliasProjectId === null && m === 'POST') {
      const path = await resolvePath(Number(normalizeIncomingKeys(body).project_id) || null);
      if (!path) return jsonResponse({ message: '未打开本地工程' }, 400);
      const doc = await loadDoc(path, domain.doc);
      const now = new Date().toISOString();
      const incoming = normalizeIncomingKeys(body);
      const item = {
        ...incoming,
        id: doc.nextId++,
        [domain.scopeKey]: incoming[domain.scopeKey] ?? aliasProjectId ?? null,
        created_at: incoming.created_at ?? now,
        updated_at: now,
      };
      doc.items.push(item);
      writeDoc(path, domain.doc, doc);
      return jsonResponse({ [domain.itemKey]: item });
    }

    if (m !== 'GET') return jsonResponse({ message: 'method not allowed' }, 405);

    // 作用域值：别名优先，其次查询串
    const scopeVal = aliasProjectId !== null
      ? String(aliasProjectId)
      : url.searchParams.get(domain.scopeQuery);
    const scopeProjectId = domain.scopeQuery === 'projectId' && scopeVal ? Number(scopeVal) : null;
    const path = await resolvePath(scopeProjectId);
    if (!path) return jsonResponse({ [domain.listKey]: [] });
    const doc = await loadDoc(path, domain.doc);
    let items = doc.items;
    if (scopeVal !== null && scopeVal !== undefined && scopeVal !== '') {
      items = items.filter((it: any) => String(it?.[domain.scopeKey]) === String(scopeVal));
    }
    // 附带过滤（scene-elements 的 category、costumes 的 category/gender、buildings 的 interiorExterior）
    for (const extra of ['category', 'gender', 'interiorExterior', 'view']) {
      const v = url.searchParams.get(extra);
      if (v) items = items.filter((it: any) => String(it?.[camelToSnake(extra)]) === String(v));
    }
    return jsonResponse({ [domain.listKey]: items });
  }

  // ---- 单条：GET / PUT / PATCH / DELETE ----
  const id = Number(idStr);
  // 读单条：先活动工程，再尝试按 body/query 的 projectId 解析
  let path = await resolvePath(domain.scopeQuery === 'projectId' ? Number(url.searchParams.get('projectId')) : null);
  if (!path && body) {
    path = await resolvePath(Number(normalizeIncomingKeys(body).project_id) || null);
  }
  if (!path) return jsonResponse({ message: '未打开本地工程' }, 400);
  const doc = await loadDoc(path, domain.doc);
  const idx = doc.items.findIndex((it: any) => Number(it?.id) === id);

  if (m === 'GET') {
    if (idx === -1) return jsonResponse({ message: `${domain.itemKey} 不存在` }, 404);
    return jsonResponse({ [domain.itemKey]: doc.items[idx] });
  }

  if (m === 'PUT' || m === 'PATCH') {
    if (idx === -1) return jsonResponse({ message: `${domain.itemKey} 不存在` }, 404);
    const incoming = normalizeIncomingKeys(body);
    delete incoming.id;
    const merged = {
      ...doc.items[idx],
      ...incoming,
      id,
      updated_at: new Date().toISOString(),
    };
    doc.items[idx] = merged;
    writeDoc(path, domain.doc, doc);
    return jsonResponse({ [domain.itemKey]: merged });
  }

  if (m === 'DELETE') {
    if (idx === -1) return jsonResponse({ message: `${domain.itemKey} 不存在` }, 404);
    doc.items.splice(idx, 1);
    writeDoc(path, domain.doc, doc);
    return jsonResponse({ message: 'deleted' });
  }

  return jsonResponse({ message: 'method not allowed' }, 405);
}

/** 供各域专属处理器复用的文档读写助手（Phase 2） */
export const restStore = {
  loadDoc,
  saveDoc: (path: string, doc: LocalDocName, value: RestDoc) => writeDoc(path, doc, value),
  resolvePath,
  normalizeIncomingKeys,
  jsonResponse,
};
