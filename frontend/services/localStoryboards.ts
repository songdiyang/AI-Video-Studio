// 分镜自动拆分的本地实现（localStoryboards）
//
// 桌面离线模式下，接管后端 /api/storyboards/auto-generate* 与 clean-before-regenerate：
// 用 localAI 直连厂商文本模型，把剧本正文拆成有序的分镜（镜头）列表，
// 写入工程 .jzp 的 storyboards 文档（与 localApiRouter 的 StoryboardsDoc / scope 键一致），
// 并返回一个可被 useWorkflowRecovery 轮询的「完成态」jobId（前缀 sbg_，由
// localWorkflowRouter 直接回放为 completed），从而驱动消费方增量刷新分镜列表。
//
// 为什么这样设计：
//  - 云端契约里 auto-generate 是「提交后台工作流 → 轮询 jobId」的异步模式，
//    startGeneration 在「任务刚启动」时就 resolve，不代表场景已落库。
//  - 本地没有 Node 工作流引擎，若沿用未实现的端点会落到中性兜底、不含 jobId，
//    导致 recovery.startJob(undefined) 静默空转，列表永远为空（这正是「假完成」的根因之一）。
//  - 因此这里在返回前「同步完成拆分并落库」，再给一个立即完成的 jobId 让轮询走通刷新闭环。

import { readDoc, writeDoc, resolveLocalPath, getActiveProjectPath } from './localStore';
import { resolveModel, getOfflineModels, chatText, type OfflineModel } from './localAI';
import { resolveScriptReferences } from './localScripts';
import { restStore } from './localRest';

// ==================== 文档类型（对齐 localApiRouter，仅取所需字段） ====================

interface LocalVariables {
  [k: string]: unknown;
}

interface LocalScene {
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

interface StoryboardsDoc {
  nextId: number;
  scenes: LocalScene[];
}

interface LocalScript {
  id: number;
  title: string | null;
  content: string;
  project_id?: number | null;
  episode_number?: number;
  [k: string]: unknown;
}

interface ScriptsDoc {
  nextId: number;
  scripts: LocalScript[];
}

// ==================== 作用域键（与 localApiRouter 保持一致） ====================
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

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

/** 从可能含代码围栏/前后缀的模型输出中提取第一个 JSON 对象 */
function extractJsonObject(text: string): any | null {
  if (!text) return null;
  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(text);
  const candidate = fenced ? fenced[1] : text;
  const start = candidate.indexOf('{');
  const end = candidate.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) return null;
  try {
    return JSON.parse(candidate.slice(start, end + 1));
  } catch {
    return null;
  }
}

/** 归一化单条模型输出为本地分镜文档条目（字段布局对齐 localApiRouter.normalizeIncoming） */
function toScene(raw: any, scope: string, id: number, index: number): LocalScene {
  const description = String(raw.description ?? raw.prompt_template ?? raw.title ?? '').trim();
  const variables: LocalVariables = {};
  const varKeys = [
    'dialogue', 'dialogues', 'voiceover', 'duration', 'characters', 'props',
    'location', 'shotType', 'emotion', 'cameraMovement', 'title',
  ];
  for (const k of varKeys) {
    if (raw[k] !== undefined && raw[k] !== null && raw[k] !== '') variables[k] = raw[k];
  }
  if (raw.variables && typeof raw.variables === 'object') Object.assign(variables, raw.variables);
  return {
    id,
    index,
    _scope: scope,
    prompt_template: String(raw.prompt_template ?? raw.description ?? '').trim(),
    description: description || String(raw.prompt_template ?? '').trim(),
    video_prompt: raw.video_prompt ? String(raw.video_prompt) : undefined,
    first_frame_prompt: raw.first_frame_prompt ? String(raw.first_frame_prompt) : undefined,
    last_frame_prompt: raw.last_frame_prompt ? String(raw.last_frame_prompt) : undefined,
    negative_prompt: raw.negative_prompt ? String(raw.negative_prompt) : undefined,
    spatial_description: raw.spatial_description ? String(raw.spatial_description) : undefined,
    is_locked: false,
    linkedCharacters: Array.isArray(raw.characters) ? raw.characters : [],
    linkedScenes: [],
    variables,
  };
}

// ==================== 文本模型选择 ====================
async function pickTextModel(preferred?: string): Promise<OfflineModel | null> {
  if (preferred) {
    const m = await resolveModel(preferred);
    if (m && (m.type === 'TEXT' || m.type === 'MULTIMODAL')) return m;
  }
  const all = await getOfflineModels();
  return all.find((m) => m.type === 'TEXT') || all.find((m) => m.type === 'MULTIMODAL') || null;
}

// ==================== 分镜拆分提示词 ====================
const SPLIT_SYSTEM =
  '你是一名专业的影视分镜师。请把用户提供的剧本正文，按叙事顺序拆分为若干分镜（镜头）。' +
  '严格只输出一个 JSON 对象（不要任何解释、不要 Markdown 代码围栏），格式为：' +
  '{"scenes":[{"title":"镜头标题","description":"该镜头的画面描述","video_prompt":"视频生成提示词",' +
  '"first_frame_prompt":"首帧画面提示词","last_frame_prompt":"尾帧画面提示词","dialogue":"对白，没有则留空",' +
  '"characters":["出场角色"],"location":"场景/地点","shotType":"景别，如 远景/全景/中景/近景/特写","duration":3}],' +
  '"characters":[{"name":"角色名","description":"该角色的外形/服装/气质简述，用于出图保持一致"}],' +
  '"locations":[{"name":"地点名","description":"该地点的环境/氛围/光线简述，用于出图"}]}。' +
  '要求：1) 拆分为 6-15 个镜头，完整覆盖剧本主要情节与转折；2) description / *_prompt 具体、可视化、可直接用于 AI 出图出视频；' +
  '3) 全部使用中文；4) duration 为整数秒；' +
  '5) 顶层 characters / locations 为资源清单，需去重并覆盖所有分镜中出现的角色与地点，每个都给出可视化简述。';

function buildSplitUserPrompt(scriptTitle: string, content: string): string {
  const safe = (content || '').slice(0, 12000);
  return `剧本标题：${scriptTitle || '未命名'}\n\n剧本正文：\n${safe}\n\n请据此拆分分镜并只输出 JSON。`;
}

// ==================== 自动补齐资源（角色 / 影棚地点） ====================
// 拆分出的分镜会引用角色名与地点名，但若资源库里没有对应资产，就会出现
// 「分镜显示资源、实际资源不存在」的问题。这里在写库后按名称去重建资源，
// 已存在（同名，忽略大小写与首尾空白）则跳过，仅补空白项。
interface ResourceCandidate {
  name: string;
  description: string;
}

/** 归一化资源清单：兼容模型返回 [{name,description}] 或 [string]，并合并分镜内引用到的名称 */
function collectResources(
  manifest: any,
  sceneRefs: string[],
): ResourceCandidate[] {
  const byName = new Map<string, ResourceCandidate>();
  const put = (name: unknown, description?: unknown) => {
    const n = String(name ?? '').trim();
    if (!n) return;
    const key = n.toLowerCase();
    const d = String(description ?? '').trim();
    const prev = byName.get(key);
    if (!prev) byName.set(key, { name: n, description: d });
    else if (!prev.description && d) prev.description = d;
  };
  // 优先资源清单（带简述）
  if (Array.isArray(manifest)) {
    for (const it of manifest) {
      if (typeof it === 'string') put(it);
      else if (it && typeof it === 'object') put(it.name ?? it.title, it.description ?? it.appearance);
    }
  }
  // 再并入分镜内引用（保证不遗漏清单缺失项）
  for (const n of sceneRefs) put(n);
  return [...byName.values()];
}

/** 在 characters / scenes 文档中按名称去重补齐资源，返回新建数量 */
async function ensureResources(
  path: string,
  projectId: number | null,
  characters: ResourceCandidate[],
  locations: ResourceCandidate[],
): Promise<{ characters: number; locations: number }> {
  if (projectId == null) return { characters: 0, locations: 0 };
  const now = new Date().toISOString();

  const addMissing = async (
    docName: 'characters' | 'scenes',
    candidates: ResourceCandidate[],
    build: (c: ResourceCandidate, id: number) => any,
  ): Promise<number> => {
    if (candidates.length === 0) return 0;
    const doc = await restStore.loadDoc(path, docName);
    const existing = new Set(
      doc.items
        .filter((it: any) => String(it?.project_id) === String(projectId))
        .map((it: any) => String(it?.name ?? '').trim().toLowerCase()),
    );
    let created = 0;
    for (const c of candidates) {
      const key = c.name.toLowerCase();
      if (existing.has(key)) continue;
      doc.items.push(build(c, doc.nextId++));
      existing.add(key);
      created++;
    }
    if (created > 0) restStore.saveDoc(path, docName, doc);
    return created;
  };

  const createdChars = await addMissing('characters', characters, (c, id) => ({
    id,
    project_id: projectId,
    name: c.name,
    description: c.description,
    base_appearance: c.description,
    appearance: c.description,
    created_at: now,
    updated_at: now,
  }));
  const createdLocs = await addMissing('scenes', locations, (c, id) => ({
    id,
    project_id: projectId,
    name: c.name,
    description: c.description,
    created_at: now,
    updated_at: now,
  }));
  return { characters: createdChars, locations: createdLocs };
}

// ==================== 主处理：自动拆分 ====================
interface AutoGenArgs {
  scriptId?: number;
  projectId?: number;
  byScene: boolean;
  body: any;
}

async function handleAutoGenerate({ scriptId, projectId, body }: AutoGenArgs): Promise<Response> {
  const ep = Number(body?.episodeNumber || body?.episode || 1) || 1;
  // 解析工程路径：优先 projectId，其次活动工程
  const path = await pathFor(projectId ?? null);
  if (!path) return jsonResponse({ success: false, message: '未打开本地工程，无法拆分分镜' }, 400);

  // 解析剧本正文与归属
  let content = typeof body?.referenceScriptContent === 'string' ? body.referenceScriptContent.trim() : '';
  let scriptTitle = typeof body?.referenceScriptTitle === 'string' ? body.referenceScriptTitle : '';
  let resolvedProjectId = projectId ?? null;
  let scope: string;

  if (scriptId) {
    scope = scopeForScript(scriptId);
    if (!content) {
      const doc = await loadScripts(path);
      const found = doc.scripts.find((s) => s.id === scriptId) || null;
      if (found) {
        const [hydrated] = await resolveScriptReferences([found as any]);
        content = (hydrated as any).content || '';
        scriptTitle = scriptTitle || (hydrated as any).title || '';
        resolvedProjectId = resolvedProjectId ?? (hydrated as any).project_id ?? null;
      }
    }
  } else {
    scope = scopeForStandalone(Number(resolvedProjectId), ep);
    if (!content) {
      // 无显式正文时，回退到该工程第一条有正文的剧本作为参考
      const doc = await loadScripts(path);
      const [hydrated] = await resolveScriptReferences((doc.scripts || []).slice(0, 1) as any);
      content = (hydrated as any)?.content || '';
      scriptTitle = scriptTitle || (hydrated as any)?.title || '';
    }
  }

  if (!content) {
    return jsonResponse({ success: false, message: '缺少可拆分的剧本内容，请先生成或绑定剧本' }, 400);
  }

  const model = await pickTextModel(body?.textModel);
  if (!model) {
    return jsonResponse({ success: false, message: '请先在「设置 › 模型」中配置可用的文本模型' }, 400);
  }

  // 同步调用模型拆分（完成后才落库并返回，避免「假完成」）
  let rawContent = '';
  try {
    const gen = await chatText({
      model,
      messages: [
        { role: 'system', content: SPLIT_SYSTEM },
        { role: 'user', content: buildSplitUserPrompt(scriptTitle, content) },
      ],
      temperature: 0.6,
    });
    rawContent = gen.content || '';
  } catch (err: any) {
    return jsonResponse({ success: false, message: err?.message || '分镜拆分失败' }, 500);
  }

  const parsed = extractJsonObject(rawContent);
  const list: any[] = Array.isArray(parsed?.scenes)
    ? parsed.scenes
    : Array.isArray(parsed)
      ? parsed
      : [];
  if (!list.length) {
    return jsonResponse({ success: false, message: '模型未能拆分出有效分镜，请更换文本模型或精简剧本后重试' }, 500);
  }

  // 依冲突策略 / 追加模式写入 storyboards 文档
  const doc = await loadStoryboards(path);
  const conflictStrategy = String(body?.conflictStrategy || (body?.appendMode ? 'skip' : 'overwrite'));
  const appendMode = !!body?.appendMode;
  const doOverwrite = !appendMode || conflictStrategy === 'overwrite';

  // 既有同 scope 分镜（追加 / skip 去重据此判断）
  const currentInScope = doc.scenes.filter((s) => s._scope === scope);
  const existingDescs = new Set(currentInScope.map((s) => (s.description || '').trim()));
  const baseIndex = doOverwrite ? 0 : currentInScope.length;

  // 覆盖式：先清空该 scope 再重建
  if (doOverwrite) {
    doc.scenes = doc.scenes.filter((s) => s._scope !== scope);
  }

  let added = 0;
  list.forEach((raw, i) => {
    const description = String(raw?.description ?? raw?.prompt_template ?? raw?.title ?? '').trim();
    if (conflictStrategy === 'skip' && description && existingDescs.has(description)) return;
    const id = doc.nextId++;
    const index = Number.isFinite(raw?.index) ? Number(raw.index) : baseIndex + i + 1;
    doc.scenes.push(toScene(raw, scope, id, index));
    if (description) existingDescs.add(description);
    added++;
  });
  // 覆盖式时 index 连续重排（1..n）
  if (doOverwrite) {
    let n = 0;
    for (const s of doc.scenes) {
      if (s._scope === scope) s.index = ++n;
    }
  }

  saveStoryboards(path, doc);

  // 自动补齐资源：把分镜引用到的角色 / 地点落为真实资产，避免「分镜显示资源但资源不存在」。
  const charRefs: string[] = [];
  const locRefs: string[] = [];
  for (const raw of list) {
    const chars = Array.isArray(raw?.characters) ? raw.characters : raw?.characters != null ? [raw.characters] : [];
    for (const c of chars) charRefs.push(String(c ?? ''));
    if (raw?.location) locRefs.push(String(raw.location));
  }
  const characters = collectResources(parsed?.characters, charRefs);
  const locations = collectResources(parsed?.locations ?? parsed?.scenes_locations, locRefs);
  const createdResources = await ensureResources(path, resolvedProjectId ?? null, characters, locations);

  const jobId = `sbg_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  return jsonResponse({
    success: true,
    jobId,
    count: added,
    total: doc.scenes.filter((s) => s._scope === scope).length,
    scriptId: scriptId ?? null,
    projectId: resolvedProjectId ?? null,
    createdCharacters: createdResources.characters,
    createdLocations: createdResources.locations,
    message: 'storyboards generated',
  });
}

// ==================== 清理旧数据（重生成前） ====================
async function handleCleanBeforeRegenerate(body: any): Promise<Response> {
  const scriptId = body?.scriptId != null ? Number(body.scriptId) : undefined;
  const projectId = body?.projectId != null ? Number(body.projectId) : null;
  const path = await pathFor(projectId);
  if (!path) return jsonResponse({ success: false, message: '未打开本地工程' }, 400);
  const doc = await loadStoryboards(path);
  const scope = scriptId
    ? scopeForScript(scriptId)
    : scopeForStandalone(Number(projectId), Number(body?.episodeNumber || 1));
  const before = doc.scenes.length;
  doc.scenes = doc.scenes.filter((s) => s._scope !== scope);
  saveStoryboards(path, doc);
  return jsonResponse({
    success: true,
    deletedStoryboards: before - doc.scenes.length,
    deletedCharacters: 0,
    deletedScenes: 0,
    message: 'cleaned',
  });
}

// ==================== 路由入口 ====================

/**
 * 匹配分镜自动拆分 / 重生成前清理端点；未匹配返回 null（交回上层继续分发）。
 * 覆盖：
 *   POST /api/storyboards/auto-generate-by-scene/:scriptId
 *   POST /api/storyboards/auto-generate-by-scene/project/:projectId
 *   POST /api/storyboards/auto-generate/:scriptId
 *   POST /api/storyboards/auto-generate/project/:projectId
 *   POST /api/storyboards/clean-before-regenerate
 */
export async function routeAutoGenerate(url: URL, method: string, body: any): Promise<Response | null> {
  const pathname = url.pathname;
  const m = method.toUpperCase();
  if (m !== 'POST') return null;

  if (pathname === '/api/storyboards/clean-before-regenerate') {
    return handleCleanBeforeRegenerate(body || {});
  }

  let mt: RegExpMatchArray | null;
  if ((mt = pathname.match(/^\/api\/storyboards\/auto-generate-by-scene\/project\/(\d+)$/))) {
    return handleAutoGenerate({ projectId: Number(mt[1]), byScene: true, body: body || {} });
  }
  if ((mt = pathname.match(/^\/api\/storyboards\/auto-generate-by-scene\/(\d+)$/))) {
    return handleAutoGenerate({ scriptId: Number(mt[1]), byScene: true, body: body || {} });
  }
  if ((mt = pathname.match(/^\/api\/storyboards\/auto-generate\/project\/(\d+)$/))) {
    return handleAutoGenerate({ projectId: Number(mt[1]), byScene: false, body: body || {} });
  }
  if ((mt = pathname.match(/^\/api\/storyboards\/auto-generate\/(\d+)$/))) {
    return handleAutoGenerate({ scriptId: Number(mt[1]), byScene: false, body: body || {} });
  }

  return null;
}
