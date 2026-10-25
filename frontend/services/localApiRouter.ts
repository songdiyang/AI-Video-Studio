// 本地 API 路由拦截器（localApiRouter）
//
// 应用启动时安装一个 fetch 拦截器，把前端对 `/api/*` 的相对请求
// 路由到本地实现（localStore 文档 / localAI 直连厂商 / localWorkflow 队列），
// 使应用无需任何后端服务器即可完整工作。
//
// 设计原则：
//  - 常驻安装（installOfflineRouter 由应用启动时调用）；本地实现是唯一路径。
//  - 只处理明确匹配、且能忠实回放的 `/api` 路由；其余（含 AI 厂商的绝对 https 请求）原样透传给真实 fetch。
//  - 未命中的 `/api` 路由返回中性空响应，绝不会打到任何真实服务器。

import {
  readDoc,
  writeDoc,
  resolveLocalPath,
  getActiveProjectPath,
  projectIdForPath,
} from './localStore';
import { routeAiAssistantSessions } from './localAiAssistant';
import { assertProject } from './localAssetShared';
import { routeAiChatAndModels } from './localAiAssistantChat';
import { routeScripts, resolveScriptReferences } from './localScripts';
import { routeAutoGenerate, ensureStudioByName } from './localStoryboards';
import { routeStyles } from './localStyles';
import { routeWorkflows } from './localWorkflowRouter';
import { routeCharacters } from './localCharacters';
import { routeScenes } from './localScenes';
import { routeEnvironments } from './localEnvironments';
import { routeStudios } from './localStudios';
import { routeProjectsSub } from './localProjectsSub';
import { routeNovels } from './localNovels';
import { routeMisc } from './localMisc';
import { routeRest } from './localRest';
import { routeResourceLibrary } from './localResourceLibrary';
import { routeLocalMail } from './localMail';

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
function saveProps(path: string, doc: PropsDoc): void {
  writeDoc(path, 'props', doc);
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
  const path = await pathFor(body?.projectId);
  if (!path) return jsonResponse({ message: '未打开本地工程' }, 400);
  const doc = await loadStoryboards(path);
  const id = Number(idStr);
  const scene = doc.scenes.find((s) => s.id === id);
  if (!scene || !assertProject(scene, path)) return jsonResponse({ message: '分镜不存在' }, 404);
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
  // 分镜绑定地点与资源面板影棚同源：绑定的地点名若在 studios 集合中不存在则自动补建空壳影棚，
  // 杜绝「分镜里有影棚、资源里没有影棚」（覆盖手动选自定义影棚与 AI 助手绑定两条路径）。
  const locName = typeof body.location === 'string' ? body.location.trim() : '';
  if (locName) {
    const pid = projectIdForPath(path);
    await ensureStudioByName(path, pid, locName);
  }
  return jsonResponse(scene);
}

/**
 * 分镜媒体回写（PATCH /api/storyboards/:id/media）。
 * 消费方（useSceneGeneration.persistStoryboardMedia）在图片/视频工作流完成后调用，
 * payload 形状：{ imageUrl?, startFrame?, endFrame?, videoUrl? }；映射到本地分镜文档字段并落 .jzp。
 */
async function handleSceneMediaPatch(idStr: string, body: any): Promise<Response> {
  const path = await pathFor(body?.projectId);
  if (!path) return jsonResponse({ message: '未打开本地工程' }, 400);
  const doc = await loadStoryboards(path);
  const id = Number(idStr);
  const scene = doc.scenes.find((s) => s.id === id);
  if (!scene || !assertProject(scene, path)) return jsonResponse({ message: '分镜不存在' }, 404);
  const startFrame = body?.startFrame ?? body?.first_frame_url;
  const endFrame = body?.endFrame ?? body?.last_frame_url;
  const videoUrl = body?.videoUrl ?? body?.video_url;
  const imageUrl = body?.imageUrl ?? body?.image_url;
  if (startFrame !== undefined && startFrame !== null) scene.first_frame_url = startFrame;
  if (imageUrl !== undefined && imageUrl !== null) {
    scene.image_ref = imageUrl;
    if (!scene.first_frame_url) scene.first_frame_url = imageUrl;
  }
  if (endFrame !== undefined && endFrame !== null) scene.last_frame_url = endFrame;
  if (videoUrl !== undefined && videoUrl !== null) scene.video_url = videoUrl;
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
  const path = await pathFor(null);
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
  const path = await pathFor(body?.projectId);
  if (!path) return jsonResponse({ message: '未打开本地工程' }, 400);
  const doc = await loadScripts(path);
  const id = Number(idStr);
  const script = doc.scripts.find((s) => s.id === id);
  if (!script || !assertProject(script, path)) return jsonResponse({ message: '剧本不存在' }, 404);
  if (body.title !== undefined) script.title = body.title;
  if (body.content !== undefined && body.content !== '') script.content = body.content;
  script.updated_at = new Date().toISOString();
  saveScripts(path, doc);
  return okJson({ message: 'updated' });
}

async function handleScriptDelete(idStr: string): Promise<Response> {
  const path = await pathFor(null);
  if (!path) return jsonResponse({ message: '未打开本地工程' }, 400);
  const doc = await loadScripts(path);
  const id = Number(idStr);
  const target = doc.scripts.find((s) => s.id === id);
  if (target && !assertProject(target, path)) return jsonResponse({ message: '剧本不存在' }, 404);
  doc.scripts = doc.scripts.filter((s) => s.id !== id);
  saveScripts(path, doc);
  return okJson({ message: 'deleted' });
}

// ==================== 道具路由（本地 CRUD）====================
async function handlePropsList(): Promise<Response> {
  const path = await pathFor(null);
  if (!path) return jsonResponse({ props: [], heldPropsRefs: [] });
  const doc = await loadProps(path);
  return jsonResponse({ props: doc.props, heldPropsRefs: [] });
}

async function handlePropCreate(body: any): Promise<Response> {
  const path = await pathFor(body?.project_id ?? body?.projectId ?? null);
  if (!path) return jsonResponse({ message: '未打开本地工程' }, 400);
  const doc = await loadProps(path);
  const now = new Date().toISOString();
  const id = doc.nextId++;
  const prop: LocalProp = { ...(body || {}), id, project_id: projectIdForPath(path) ?? body?.project_id ?? body?.projectId ?? null, created_at: now, updated_at: now };
  doc.props.push(prop);
  saveProps(path, doc);
  return jsonResponse({ success: true, prop });
}

async function handlePropUpdate(idStr: string, body: any): Promise<Response> {
  const path = await pathFor(body?.project_id ?? body?.projectId ?? null);
  if (!path) return jsonResponse({ message: '未打开本地工程' }, 400);
  const doc = await loadProps(path);
  const id = Number(idStr);
  const idx = doc.props.findIndex((p) => p.id === id);
  if (idx === -1 || !assertProject(doc.props[idx], path)) return jsonResponse({ message: '道具不存在' }, 404);
  doc.props[idx] = { ...doc.props[idx], ...(body || {}), id, updated_at: new Date().toISOString() };
  saveProps(path, doc);
  return jsonResponse({ success: true, prop: doc.props[idx] });
}

async function handlePropDelete(idStr: string): Promise<Response> {
  const path = await pathFor(null);
  if (!path) return jsonResponse({ message: '未打开本地工程' }, 400);
  const doc = await loadProps(path);
  const id = Number(idStr);
  const target = doc.props.find((p) => p.id === id);
  if (target && !assertProject(target, path)) return jsonResponse({ message: '道具不存在' }, 404);
  doc.props = doc.props.filter((p) => p.id !== id);
  saveProps(path, doc);
  return okJson({ message: 'deleted' });
}

async function handlePropStates(idStr: string): Promise<Response> {
  const path = await pathFor(null);
  if (!path) return jsonResponse({ states: [] });
  const doc = await loadProps(path);
  const prop = doc.props.find((p) => p.id === Number(idStr));
  const states = Array.isArray((prop as any)?.states) ? (prop as any).states : [];
  return jsonResponse({ success: true, states });
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
  // 自动拆分分镜 / 重生成前清理（本地直连厂商模型，同步落库后返回可轮询的完成态 jobId）
  if (
    pathname.startsWith('/api/storyboards/auto-generate') ||
    pathname === '/api/storyboards/clean-before-regenerate'
  ) {
    const res = await routeAutoGenerate(url, m, body);
    if (res) return res;
  }
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
  if ((mt = pathname.match(/^\/api\/storyboards\/(\d+)\/media$/)) && m === 'PATCH') return handleSceneMediaPatch(mt[1], body || {});
  if ((mt = pathname.match(/^\/api\/storyboards\/(\d+)$/))) {
    const scriptId = num(mt[1]);
    const path = await pathFor();
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
    if (!script) return jsonResponse({ script: null });
    // 参考引用项从源工程解析正文（不强制存储，只写参考）
    const hydrated = await resolveScriptReferences([script as any]);
    return jsonResponse({ script: hydrated[0] });
  }
  if ((mt = pathname.match(/^\/api\/scripts\/project\/(\d+)$/)) && m === 'GET') {
    const projectId = num(mt[1]);
    const path = await pathFor(projectId);
    if (!path) return jsonResponse({ scripts: [] });
    const doc = await loadScripts(path);
    const hydrated = await resolveScriptReferences(doc.scripts as any);
    return jsonResponse({ scripts: hydrated });
  }
  if (pathname === '/api/scripts/create' && m === 'POST') return handleScriptCreate(body || {});
  if ((mt = pathname.match(/^\/api\/scripts\/(\d+)$/))) {
    if (m === 'PUT') return handleScriptUpdate(mt[1], body || {});
    if (m === 'DELETE') return handleScriptDelete(mt[1]);
  }

  // ---- 剧本生成/分析/优化/库/绑定/上传（本地直连厂商 + 本地存储）----
  if (
    pathname === '/api/scripts/generate' ||
    pathname === '/api/scripts/analyze' ||
    pathname === '/api/scripts/optimize' ||
    pathname === '/api/scripts/bind' ||
    pathname === '/api/scripts/upload' ||
    pathname === '/api/scripts/library'
  ) {
    const res = await routeScripts(url, m, body);
    if (res) return res;
  }

  // ---- 站内信（本地持久化，供长任务完成通知与未读徽标）----
  if (pathname === '/api/mail' || pathname.startsWith('/api/mail/')) {
    const res = routeLocalMail(url, m);
    if (res) return res;
  }

  // ---- AI 助手会话（本地持久化，回放后端契约）----
  if (pathname.startsWith('/api/ai-assistant/sessions')) {
    const res = await routeAiAssistantSessions(url, m, body);
    if (res) return res;
  }

  // ---- AI 聊天 / 模型目录 / 项目模型选择（直连厂商）----
  if (
    pathname.startsWith('/api/ai-assistant/chat') ||
    pathname === '/api/ai-assistant/enhance-prompt' ||
    pathname === '/api/ai-assistant/compress' ||
    pathname === '/api/ai-models' ||
    /^\/api\/projects\/\d+\/models$/.test(pathname)
  ) {
    const res = await routeAiChatAndModels(url, m, body);
    if (res) return res;
  }

  // ---- 图片/视频生成工作流（本地直连厂商引擎）----
  if (pathname === '/api/workflows' || pathname.startsWith('/api/workflows/')) {
    const res = await routeWorkflows(url, m, body);
    if (res) return res;
  }

  // ---- 道具（本地 CRUD + 集合读取）----
  if ((mt = pathname.match(/^\/api\/props\/project\/(\d+)$/)) && m === 'GET') {
    const projectId = num(mt[1]);
    const path = await pathFor(projectId);
    if (!path) return jsonResponse({ props: [] });
    const doc = await loadProps(path);
    return jsonResponse({ props: doc.props });
  }
  if (pathname === '/api/props' && m === 'GET') return handlePropsList();
  if (pathname === '/api/props' && m === 'POST') return handlePropCreate(body || {});
  if ((mt = pathname.match(/^\/api\/props\/(\d+)\/states$/)) && m === 'GET') return handlePropStates(mt[1]);
  if ((mt = pathname.match(/^\/api\/props\/(\d+)$/))) {
    if (m === 'PUT') return handlePropUpdate(mt[1], body || {});
    if (m === 'DELETE') return handlePropDelete(mt[1]);
  }

  // ---- 用户自定义风格预设（/api/projects/my-styles，本地持久化）----
  if (pathname === '/api/projects/my-styles' || pathname.startsWith('/api/projects/my-styles/')) {
    const res = routeStyles(url, m, body);
    if (res) return res;
  }

  // ---- 资源库聚合（分类配置 + 全量资源，一次返回）----
  if (pathname === '/api/resource-library' || pathname === '/api/resource-library/categories') {
    const res = await routeResourceLibrary(url, m, body);
    if (res) return res;
  }

  // ---- 资产域通用 CRUD（角色/场景/建筑/环境/服装/影棚/场景元素/环境变体）----
  // 先接管各域特殊子路径（状态/绑定/生成/关联…），再落到通用 CRUD。
  if (pathname.startsWith('/api/characters/') || pathname === '/api/characters') {
    const res = await routeCharacters(url, m, body);
    if (res) return res;
  }
  if (pathname.startsWith('/api/scenes/') || pathname.startsWith('/api/scene-elements/')) {
    const res = await routeScenes(url, m, body);
    if (res) return res;
  }
  // 环境/建筑/环境变体 特殊子路径（生成/识别/清洗）
  if (
    pathname.startsWith('/api/environments/') ||
    pathname.startsWith('/api/buildings/') ||
    pathname.startsWith('/api/environment-variants/')
  ) {
    const res = await routeEnvironments(url, m, body);
    if (res) return res;
  }
  // 影棚（列表自愈迁移/详情/关联/剧本工作流/九宫） + 服装设定图生成
  if (pathname === '/api/studios' || pathname.startsWith('/api/studios/') || pathname.startsWith('/api/costumes/')) {
    const res = await routeStudios(url, m, body);
    if (res) return res;
  }

  // ---- projects 子资源（封面/裁剪/AI设置/剧本/小说大纲章节/漫画/短视频）----
  if (pathname.startsWith('/api/projects/')) {
    const res = await routeProjectsSub(url, m, body);
    if (res) return res;
  }
  // ---- 小说工作台（/api/novels/:projectId/*）----
  if (pathname.startsWith('/api/novels/')) {
    const res = await routeNovels(url, m, body);
    if (res) return res;
  }
  // ---- 参考图 / 文件上传 / 用户资料 / 仪表盘统计 ----
  if (
    pathname.startsWith('/api/reference-images') ||
    pathname.startsWith('/api/upload') ||
    pathname.startsWith('/api/users') ||
    pathname.startsWith('/api/stats')
  ) {
    const res = await routeMisc(url, m, body);
    if (res) return res;
  }
  // 通用 CRUD：仅接管 /api/<base> 与 /api/<base>/<数字>；多段特殊子路径返回 null。
  {
    const res = await routeRest(url, m, body);
    if (res) return res;
  }

  // 未命中任何本地已实现域：返回 null，统一交由 routeToResponse 的中性空响应兜底。
  // （商业化/云专属域——社区/市场/订阅/团队/协作/扩展/RAG/后台/计费——已整体删除，不再被请求。）
  return null;
}

// ==================== 安装 ====================
let installed = false;

/** 是否为需本地接管/兜底的同源 /api 请求 */
function isLocalApiUrl(url: string): boolean {
  return url.startsWith('/api/') || /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?\/api\//.test(url);
}

/** 把 fetch/XHR 的请求体归一为对象：字符串 JSON 直解；FormData 文本字段直取，文件字段读为文本并保留原始 File 到 _files。 */
async function buildRequestBody(bodyLike: any): Promise<any> {
  if (bodyLike == null) return null;
  if (typeof bodyLike === 'string') return safeParse(bodyLike);
  if (typeof FormData !== 'undefined' && bodyLike instanceof FormData) {
    const body: any = {};
    for (const [key, value] of (bodyLike as FormData).entries()) {
      if (typeof value === 'string') {
        body[key] = value;
      } else if (value && typeof (value as File).text === 'function') {
        if (!body._files) body._files = {};
        body._files[key] = value;
        try {
          body[key] = await (value as File).text();
        } catch {
          /* 忽略无法读取的文件 */
        }
      }
    }
    return body;
  }
  return null;
}

/** 路由到本地实现；未命中返回中性空形状（不再向用户报「离线」错误）。 */
async function routeToResponse(rawUrl: string, method: string, body: any): Promise<Response> {
  const parsed = new URL(rawUrl, 'http://offline.local');
  try {
    const res = await route(parsed, method, body);
    if (res) return res;
    console.warn('[localRouter] 未处理的本地请求，返回空响应：', method, parsed.pathname);
    return jsonResponse({ success: true, data: null, items: [], results: [], count: 0, total: 0, path: parsed.pathname });
  } catch (err: any) {
    console.error('[localRouter] 处理失败', parsed.pathname, err);
    return jsonResponse({ success: false, error: err?.message || '本地处理失败' }, 500);
  }
}

/** 拦截 XMLHttpRequest（如参考图上传走 XHR），对同源 /api 请求由本地路由接管并模拟完成事件。 */
function installXhrRouter(): void {
  if (typeof XMLHttpRequest === 'undefined') return;
  const proto = XMLHttpRequest.prototype;
  const nativeOpen = proto.open;
  const nativeSend = proto.send;
  const nativeSetHeader = proto.setRequestHeader;

  (proto as any).open = function (this: any, method: string, url: string, ...rest: any[]) {
    const u = String(url);
    if (isLocalApiUrl(u)) {
      this.__localApi = { method: (method || 'GET').toUpperCase(), url: u };
      return;
    }
    return (nativeOpen as any).apply(this, [method, url, ...rest]);
  };

  (proto as any).setRequestHeader = function (this: any, k: string, v: string) {
    if (this.__localApi) return; // 本地接管：忽略鉴权等头
    return (nativeSetHeader as any).call(this, k, v);
  };

  (proto as any).send = function (this: any, payload?: any) {
    if (!this.__localApi) return (nativeSend as any).call(this, payload);
    const self = this;
    void (async () => {
      let response: Response;
      try {
        const body = await buildRequestBody(payload);
        response = await routeToResponse(self.__localApi.url, self.__localApi.method, body);
      } catch (err: any) {
        response = jsonResponse({ message: err?.message || '上传失败' }, 500);
      }
      let text = '';
      try { text = await response.clone().text(); } catch { text = ''; }
      const define = (name: string, val: unknown) => {
        try { Object.defineProperty(self, name, { configurable: true, get: () => val }); } catch { /* noop */ }
      };
      define('status', response.status);
      define('statusText', response.statusText || '');
      define('readyState', 4);
      define('responseText', text);
      define('response', text);
      define('responseURL', self.__localApi.url);
      self.getAllResponseHeaders = () => 'content-type: application/json';
      self.getResponseHeader = (h: string) => (String(h).toLowerCase() === 'content-type' ? 'application/json' : null);
      try { self.upload?.dispatchEvent(new ProgressEvent('progress', { lengthComputable: true, loaded: 1, total: 1 })); } catch { /* noop */ }
      try { self.upload?.dispatchEvent(new ProgressEvent('load')); } catch { /* noop */ }
      self.dispatchEvent(new Event('readystatechange'));
      if (response.ok) {
        self.dispatchEvent(new Event('load'));
        if (typeof self.onload === 'function') { try { self.onload(new Event('load')); } catch { /* noop */ } }
      } else {
        self.dispatchEvent(new Event('error'));
        if (typeof self.onerror === 'function') { try { self.onerror(new Event('error')); } catch { /* noop */ } }
      }
      self.dispatchEvent(new Event('loadend'));
      if (typeof self.onloadend === 'function') { try { self.onloadend(new Event('loadend')); } catch { /* noop */ } }
    })();
  };
}

export function installOfflineRouter(): void {
  if (installed || typeof window === 'undefined') return;
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
    if (!isLocalApiUrl(url)) {
      return originalFetch(input as any, init);
    }

    const method = (init?.method || (input as Request)?.method || 'GET').toUpperCase();
    const body = await buildRequestBody(init?.body);
    return routeToResponse(url, method, body);
  };

  installXhrRouter();
}
