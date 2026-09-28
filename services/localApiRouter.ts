// 离线 API 路由拦截器（localApiRouter）
//
// 桌面离线模式下，安装一个 fetch 拦截器，把前端对 `/api/*` 的相对请求
// 路由到本地文档存储（localStore），从而在完全没有 localhost:4001 后端时，
// 仍能让「剧本 / 分镜 / 道具」的读写闭环工作。
//
// 设计原则：
//  - 仅离线模式安装（installOfflineRouter 由 App 启动时调用）。
//  - 只处理明确匹配、且能忠实回放的 `/api` 路由；其余（含 AI 厂商的绝对 https 请求）原样透传给真实 fetch。
//  - 不改动任何业务调用点，保持云端/浏览器路径完全不变。

import { isOfflineMode } from '../utils/runtimeMode';
import {
  readDoc,
  writeDoc,
  resolveLocalPath,
  getActiveProjectPath,
} from './localStore';

// ==================== 本地数据模型 ====================

export interface LocalVariables {
  dialogue?: string;
  dialogues?: string[];
  voiceover?: string;
  duration?: number;
  characters?: unknown[];
  props?: unknown[];
  location?: string;
  shotType?: string;
  emotion?: string;
  hasAction?: boolean;
  startFrame?: string;
  endFrame?: string;
  cameraMovement?: string;
  endState?: string;
  directorParams?: unknown;
  characterStates?: Record<string, unknown>;
  [k: string]: unknown;
}

/** 分镜条目：与后端返回形状对齐（mapStoryboardItems 消费），额外用 _scope 标记归属 */
export interface LocalScene {
  id: number;
  index: number;
  _scope: string;
  prompt_template?: string;
  description?: string;
  video_prompt?: string;
  first_frame_prompt?: string;
  last_frame_prompt?: string;
  negative_prompt?: string;
  image_ref?: string;
  video_url?: string;
  first_frame_url?: string;
  last_frame_url?: string;
  spatial_description?: string;
  is_locked?: boolean;
  linkedCharacters?: unknown[];
  linkedScenes?: unknown[];
  variables?: LocalVariables;
}

export interface StoryboardsDoc {
  nextId: number;
  scenes: LocalScene[];
}

export interface LocalScript {
  id: number;
  title: string | null;
  content: string;
  project_id?: number | null;
  episode_number?: number;
  status?: string;
  model_provider?: string | null;
  token_used?: number;
  created_at: string;
  updated_at?: string;
}

export interface ScriptsDoc {
  nextId: number;
  scripts: LocalScript[];
}

export interface LocalProp {
  id: number;
  name: string;
  description?: string;
  [k: string]: unknown;
}

export interface PropsDoc {
  nextId: number;
  props: LocalProp[];
}

const EMPTY_STORYBOARDS: StoryboardsDoc = { nextId: 1, scenes: [] };
const EMPTY_SCRIPTS: ScriptsDoc = { nextId: 1, scripts: [] };
const EMPTY_PROPS: PropsDoc = { nextId: 1, props: [] };

// ==================== 作用域键 ====================
function scopeForScript(scriptId: number): string {
  return `s:${scriptId}`;
}
function scopeForStandalone(projectId: number, episode: number): string {
  return `p:${projectId}:${episode}`;
}

// ==================== 文档读写助手 ====================
async function loadStoryboards(path: string): Promise<StoryboardsDoc> {
  const doc = await readDoc<Partial<StoryboardsDoc>>(path, 'storyboards', {});
  return { nextId: doc.nextId || 1, scenes: Array.isArray(doc.scenes) ? doc.scenes : [] };
}
function saveStoryboards(path: string, doc: StoryboardsDoc): void {
  writeDoc(path, 'storyboards', doc);
}
async function loadScripts(path: string): Promise<ScriptsDoc> {
  const doc = await readDoc<Partial<ScriptsDoc>>(path, 'scripts', {});
  return { nextId: doc.nextId || 1, scripts: Array.isArray(doc.scripts) ? doc.scripts : [] };
}
function saveScripts(path: string, doc: ScriptsDoc): void {
  writeDoc(path, 'scripts', doc);
}
async function loadProps(path: string): Promise<PropsDoc> {
  const doc = await readDoc<Partial<PropsDoc>>(path, 'props', {});
  return { nextId: doc.nextId || 1, props: Array.isArray(doc.props) ? doc.props : [] };
}

/** 解析请求归属的工程路径：优先显式 projectId，其次活动工程。 */
async function pathFor(projectId?: number | string | null): Promise<string | null> {
  if (projectId !== undefined && projectId !== null && projectId !== '') {
    const id = typeof projectId === 'string' ? Number(projectId) : projectId;
    if (Number.isFinite(id)) {
      const p = await resolveLocalPath(id);
      if (p) return p;
    }
  }
  return getActiveProjectPath();
}

// ==================== 响应构造 ====================
function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
function okJson(body: unknown = { message: 'ok' }): Response {
  return jsonResponse(body, 200);
}

// ==================== 分镜路由 ====================
async function scenesInScope(path: string, scope: string): Promise<LocalScene[]> {
  const doc = await loadStoryboards(path);
  return doc.scenes.filter((s) => s._scope === scope).sort((a, b) => a.index - b.index);
}

function normalizeIncoming(raw: any, scope: string, id: number, index: number): LocalScene {
  let variables: LocalVariables = {};
  const vj = raw.variables ?? raw.variables_json;
  if (typeof vj === 'string') {
    try {
      variables = JSON.parse(vj) || {};
    } catch {
      variables = {};
    }
  } else if (vj && typeof vj === 'object') {
    variables = vj;
  }
  return {
    id,
    index,
    _scope: scope,
    prompt_template: raw.prompt_template ?? raw.description ?? '',
    description: raw.description ?? raw.prompt_template ?? '',
    video_prompt: raw.video_prompt,
    first_frame_prompt: raw.first_frame_prompt,
    last_frame_prompt: raw.last_frame_prompt,
    negative_prompt: raw.negative_prompt,
    image_ref: raw.image_ref,
    video_url: raw.video_url,
    first_frame_url: raw.first_frame_url,
    last_frame_url: raw.last_frame_url,
    spatial_description: raw.spatial_description,
    is_locked: raw.is_locked ?? false,
    linkedCharacters: raw.linkedCharacters ?? [],
    linkedScenes: raw.linkedScenes ?? [],
    variables,
  };
}

async function handleSceneAdd(body: any): Promise<Response> {
  const projectId = body.projectId;
  const path = await pathFor(projectId);
  if (!path) return jsonResponse({ message: '未打开本地工程' }, 400);
  const doc = await loadStoryboards(path);
  const scope = body.scriptId
    ? scopeForScript(Number(body.scriptId))
    : scopeForStandalone(Number(projectId), Number(body.episodeNumber || 1));
  const idx = Number.isFinite(body.idx) ? body.idx : doc.scenes.filter((s) => s._scope === scope).length;
  const id = doc.nextId++;
  const scene = normalizeIncoming(body, scope, id, idx);
  doc.scenes.push(scene);
  saveStoryboards(path, doc);
  return jsonResponse(scene);
}

async function handleSceneContentPatch(idStr: string, body: any): Promise<Response> {
  const path = await getActiveProjectPathOr(body?.projectId);
  if (!path) return jsonResponse({ message: '未打开本地工程' }, 400);
  const doc = await loadStoryboards(path);
  const id = Number(idStr);
  const scene = doc.scenes.find((s) => s.id === id);
  if (!scene) return jsonResponse({ message: '分镜不存在' }, 404);
  const scalarFields = [
    'prompt_template', 'description', 'video_prompt', 'first_frame_prompt',
    'last_frame_prompt', 'negative_prompt', 'image_ref', 'video_url',
    'first_frame_url', 'last_frame_url', 'spatial_description', 'is_locked',
  ];
  for (const f of scalarFields) {
    if (body[f] !== undefined) (scene as any)[f] = body[f];
  }
  // hasAction 与其余变量字段并入 variables
  const varKeys = ['dialogue', 'dialogues', 'voiceover', 'duration', 'characters', 'props', 'location', 'shotType', 'emotion', 'hasAction', 'startFrame', 'endFrame', 'cameraMovement', 'endState', 'directorParams', 'characterStates'];
  scene.variables = scene.variables || {};
  for (const k of varKeys) {
    if (body[k] !== undefined) (scene.variables as any)[k] = body[k];
  }
  if (body.variables_json) {
    const parsed = typeof body.variables_json === 'string' ? safeParse(body.variables_json) : body.variables_json;
    if (parsed) scene.variables = { ...scene.variables, ...parsed };
  }
  saveStoryboards(path, doc);
  return jsonResponse(scene);
}

async function handleSceneReorder(body: any): Promise<Response> {
  const path = await pathFor(body?.projectId);
  if (!path) return jsonResponse({ message: '未打开本地工程' }, 400);
  const doc = await loadStoryboards(path);
  const order: Array<{ id: number; idx: number }> = Array.isArray(body.order) ? body.order : [];
  for (const entry of order) {
    const scene = doc.scenes.find((s) => s.id === Number(entry.id));
    if (scene) scene.index = Number(entry.idx);
  }
  saveStoryboards(path, doc);
  return okJson({ message: 'reordered' });
}

async function handleSceneDelete(idStr: string): Promise<Response> {
  const path = await getActiveProjectPathOr(null);
  if (!path) return jsonResponse({ message: '未打开本地工程' }, 400);
  const doc = await loadStoryboards(path);
  const id = Number(idStr);
  const before = doc.scenes.length;
  doc.scenes = doc.scenes.filter((s) => s.id !== id);
  saveStoryboards(path, doc);
  return okJson({ message: 'deleted', removed: before - doc.scenes.length });
}

async function handleSceneImport(path: string, scope: string, items: any[]): Promise<Response> {
  const doc = await loadStoryboards(path);
  // 覆盖式导入：清空该 scope 后按 idx 重建
  doc.scenes = doc.scenes.filter((s) => s._scope !== scope);
  items.forEach((raw, i) => {
    const id = doc.nextId++;
    doc.scenes.push(normalizeIncoming(raw, scope, id, raw.idx ?? i + 1));
  });
  saveStoryboards(path, doc);
  return okJson({ message: 'imported', count: items.length });
}

// ==================== 剧本路由 ====================
async function handleScriptCreate(body: any): Promise<Response> {
  const projectId = body.projectId;
  const path = await pathFor(projectId);
  if (!path) return jsonResponse({ message: '未打开本地工程' }, 400);
  const doc = await loadScripts(path);
  const id = doc.nextId++;
  const now = new Date().toISOString();
  const script: LocalScript = {
    id,
    title: body.title ?? null,
    content: body.content ?? '',
    project_id: projectId ?? null,
    episode_number: body.episodeNumber || 1,
    status: 'completed',
    created_at: now,
    updated_at: now,
  };
  doc.scripts.push(script);
  saveScripts(path, doc);
  return jsonResponse({ success: true, scriptId: id, projectId: projectId ?? null, episodeNumber: script.episode_number, message: 'created' });
}

async function handleScriptUpdate(idStr: string, body: any): Promise<Response> {
  const path = await getActiveProjectPathOr(body?.projectId);
  if (!path) return jsonResponse({ message: '未打开本地工程' }, 400);
  const doc = await loadScripts(path);
  const id = Number(idStr);
  const script = doc.scripts.find((s) => s.id === id);
  if (!script) return jsonResponse({ message: '剧本不存在' }, 404);
  if (body.title !== undefined) script.title = body.title;
  if (body.content !== undefined && body.content !== '') script.content = body.content;
  script.updated_at = new Date().toISOString();
  saveScripts(path, doc);
  return okJson({ message: 'updated' });
}

async function handleScriptDelete(idStr: string): Promise<Response> {
  const path = await getActiveProjectPathOr(null);
  if (!path) return jsonResponse({ message: '未打开本地工程' }, 400);
  const doc = await loadScripts(path);
  const id = Number(idStr);
  doc.scripts = doc.scripts.filter((s) => s.id !== id);
  saveScripts(path, doc);
  return okJson({ message: 'deleted' });
}

async function getActiveProjectPathOr(_projectId?: number | null): Promise<string | null> {
  // 内容/更新类操作多发生在活动工程上下文；若有 active 直接用，否则按 projectId 解析。
  const active = getActiveProjectPath();
  if (active) return active;
  return _projectId ? pathFor(_projectId) : null;
}

function safeParse(s: string): any {
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}

// ==================== 路由分发 ====================
const num = (s: string) => Number(s);

async function route(url: URL, method: string, body: any): Promise<Response | null> {
  const pathname = url.pathname;
  const m = method.toUpperCase();
  let mt: RegExpMatchArray | null;

  // ---- 分镜 ----
  if ((mt = pathname.match(/^\/api\/storyboards\/project\/(\d+)\/standalone$/))) {
    const projectId = num(mt[1]);
    const path = await pathFor(projectId);
    if (!path) return jsonResponse([]);
    if (m === 'GET') {
      const ep = num(url.searchParams.get('episode') || '1');
      return jsonResponse(await scenesInScope(path, scopeForStandalone(projectId, ep)));
    }
    if (m === 'POST') {
      const ep = Number(body?.episodeNumber || url.searchParams.get('episode') || 1);
      return handleSceneImport(path, scopeForStandalone(projectId, ep), body?.items || []);
    }
  }
  if (pathname === '/api/storyboards/add' && m === 'POST') return handleSceneAdd(body || {});
  if (pathname === '/api/storyboards/reorder' && m === 'PATCH') return handleSceneReorder(body || {});
  if ((mt = pathname.match(/^\/api\/storyboards\/scene\/(\d+)$/)) && m === 'DELETE') return handleSceneDelete(mt[1]);
  if ((mt = pathname.match(/^\/api\/storyboards\/(\d+)\/content$/)) && m === 'PATCH') return handleSceneContentPatch(mt[1], body || {});
  if ((mt = pathname.match(/^\/api\/storyboards\/(\d+)$/))) {
    const scriptId = num(mt[1]);
    const path = await getActiveProjectPathOr();
    if (!path) return jsonResponse([]);
    if (m === 'GET') return jsonResponse(await scenesInScope(path, scopeForScript(scriptId)));
    if (m === 'POST') return handleSceneImport(path, scopeForScript(scriptId), body?.items || []);
  }

  // ---- 剧本 ----
  if ((mt = pathname.match(/^\/api\/scripts\/project\/(\d+)\/episode\/(\d+)$/)) && m === 'GET') {
    const projectId = num(mt[1]);
    const ep = num(mt[2]);
    const path = await pathFor(projectId);
    if (!path) return jsonResponse({ script: null });
    const doc = await loadScripts(path);
    const script = doc.scripts.find((s) => (s.episode_number || 1) === ep) || null;
    return jsonResponse({ script });
  }
  if ((mt = pathname.match(/^\/api\/scripts\/project\/(\d+)$/)) && m === 'GET') {
    const projectId = num(mt[1]);
    const path = await pathFor(projectId);
    if (!path) return jsonResponse({ scripts: [] });
    const doc = await loadScripts(path);
    return jsonResponse({ scripts: doc.scripts });
  }
  if (pathname === '/api/scripts/create' && m === 'POST') return handleScriptCreate(body || {});
  if ((mt = pathname.match(/^\/api\/scripts\/(\d+)$/))) {
    if (m === 'PUT') return handleScriptUpdate(mt[1], body || {});
    if (m === 'DELETE') return handleScriptDelete(mt[1]);
  }

  // ---- 道具（离线返回空集合，避免阻塞；增删改后续接入）----
  if ((mt = pathname.match(/^\/api\/props\/project\/(\d+)$/)) && m === 'GET') {
    const projectId = num(mt[1]);
    const path = await pathFor(projectId);
    if (!path) return jsonResponse({ props: [] });
    const doc = await loadProps(path);
    return jsonResponse({ props: doc.props });
  }

  return null; // 未匹配 → 透传
}

// ==================== 安装 ====================
let installed = false;

export function installOfflineRouter(): void {
  if (installed || typeof window === 'undefined' || !isOfflineMode()) return;
  installed = true;
  const originalFetch = window.fetch.bind(window);

  window.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    let url: string;
    try {
      url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : (input as Request).url;
    } catch {
      return originalFetch(input as any, init);
    }

    // 仅拦截同源相对 /api/ 请求
    const isRelativeApi = url.startsWith('/api/');
    const isSameOriginApi = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?\/api\//.test(url);
    if (!isRelativeApi && !isSameOriginApi) {
      return originalFetch(input as any, init);
    }

    const parsed = new URL(url, 'http://offline.local');
    const method = (init?.method || (input as Request)?.method || 'GET').toUpperCase();

    let body: any = null;
    if (init?.body && typeof init.body === 'string') {
      body = safeParse(init.body);
    }

    try {
      const res = await route(parsed, method, body);
      if (res) return res;
      // 未匹配的同源 /api 请求：离线模式下后端不可用，返回 501 明确降级（避免挂起/跨源报错）
      return jsonResponse({ message: '离线模式：该接口不支持本地执行', path: parsed.pathname }, 501);
    } catch (err: any) {
      console.error('[offlineRouter] 处理失败', parsed.pathname, err);
      return jsonResponse({ message: err?.message || '离线处理失败' }, 500);
    }
  };
}
