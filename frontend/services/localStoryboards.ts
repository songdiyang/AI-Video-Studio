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
  // 道具统一存名称字符串数组：模型偶尔会把顶层 {name,description} 结构带进分镜内 props
  if (variables.props != null) {
    const names = (Array.isArray(variables.props) ? variables.props : [variables.props])
      .map((p: any) => String(typeof p === 'string' ? p : (p?.name ?? '')).trim())
      .filter(Boolean);
    variables.props = Array.from(new Set(names));
  }
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
  '"characters":["出场角色"],"props":["该镜头出现的关键道具"],"location":"场景/地点","shotType":"景别，如 远景/全景/中景/近景/特写","duration":3}],' +
  '"characters":[{"name":"角色名","description":"该角色的外形/服装/气质简述，用于出图保持一致"}],' +
  '"props":[{"name":"道具名","description":"该道具的外观/材质/尺寸简述，用于出图保持一致"}],' +
  '"locations":[{"name":"地点名","description":"该地点的环境/氛围/光线简述，用于出图",' +
  '"environmentNames":["该地点涉及的环境名，1个或多个，主环境在前"],' +
  '"buildings":[{"name":"该地点涉及的建筑名","view":"镜头需要的视角 interior=室内/exterior=室外"}],' +
  '"environments":[{"name":"环境名","description":"地形/天气/时段简述，用于出图","terrainType":"地形类型"}],' +
  '"buildingsLibrary":[{"name":"建筑名","description":"外观简述，用于出图","interiorExterior":"interior|exterior|both"}]}]}。' +
  '要求：1) 拆分为 6-15 个镜头，完整覆盖剧本主要情节与转折；2) description / *_prompt 具体、可视化、可直接用于 AI 出图出视频；' +
  '3) 全部使用中文；4) duration 为整数秒；' +
  '5) 顶层 characters / locations 为资源清单，需去重并覆盖所有分镜中出现的角色与地点，每个都给出可视化简述；' +
  '6) props 只列对画面一致性有影响、且在 2 个及以上镜头重复出现的物品（如武器、信物、车辆、招牌菜）；' +
  '只在单个镜头出现的临时物件写进 description 即可，不要列入 props；顶层 props 需与各镜头 props 名称一致，分镜内 props 写名称字符串；' +
  '7) 每个 location 必须把地点拆解为环境与建筑两部分：environmentNames 列出该地点用到的环境（室内场景也要给所属建筑的环境），' +
  'buildings 列出该地点出镜的建筑并标注镜头需要内景还是外景；' +
  'environments / buildingsLibrary 给出这些环境与建筑各自的出图简述（名称与 environmentNames / buildings 对应，跨地点可复用同名）。';

function buildSplitUserPrompt(scriptTitle: string, content: string): string {
  const safe = (content || '').slice(0, 12000);
  return `剧本标题：${scriptTitle || '未命名'}\n\n剧本正文：\n${safe}\n\n请据此拆分分镜并只输出 JSON。`;
}

// ==================== 自动补齐资源（角色 / 影棚地点） ====================
// 拆分出的分镜会引用角色名与地点名，但若资源库里没有对应资产，就会出现
// 「分镜显示资源、实际资源不存在」的问题。这里在写库后按名称去重建资源，
// 已存在（同名，忽略大小写与首尾空白）则跳过，仅补空白项。
// 影棚（地点）与资源面板同源：一律写入 studios 集合（= /api/studios 与
// /api/resource-library 的 locations 数据源），不再落到独立的 scenes 集合，
// 杜绝「分镜里有影棚、资源里没有影棚」的数据分裂。
interface ResourceCandidate {
  name: string;
  description: string;
}

/** 地点候选：除名称/描述外，携带拆分出的环境名与建筑（含内/外景视角） */
interface LocationCandidate extends ResourceCandidate {
  environmentNames: string[];
  buildings: { name: string; view: string | null }[];
}

/** 环境/建筑库候选：出图简述与类型 */
interface LibraryCandidate extends ResourceCandidate {
  terrainType?: string;
  interiorExterior?: string;
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

/**
 * 收集地点候选及其环境/建筑拆解，同时汇总环境库、建筑库候选（跨地点按名去重）。
 * 兼容模型把 environments / buildingsLibrary 放在地点内或顶层（extraEnvs / extraBlds）的情况。
 */
function collectLocationCandidates(
  manifest: any,
  sceneRefs: string[],
  extraEnvs: any[] = [],
  extraBlds: any[] = [],
): {
  locations: LocationCandidate[];
  envLibrary: LibraryCandidate[];
  bldLibrary: LibraryCandidate[];
} {
  const locations: LocationCandidate[] = [];
  const locSeen = new Map<string, LocationCandidate>();
  const envSeen = new Map<string, LibraryCandidate>();
  const bldSeen = new Map<string, LibraryCandidate>();

  const putEnv = (raw: any) => {
    const n = String(typeof raw === 'string' ? raw : (raw?.name ?? '')).trim();
    if (!n) return;
    const key = n.toLowerCase();
    const d = String(raw?.description ?? '').trim();
    const t = raw?.terrainType ?? raw?.terrain_type ?? undefined;
    const prev = envSeen.get(key);
    if (!prev) envSeen.set(key, { name: n, description: d, terrainType: t });
    else {
      if (!prev.description && d) prev.description = d;
      if (!prev.terrainType && t) prev.terrainType = t;
    }
  };
  const putBld = (raw: any) => {
    const n = String(typeof raw === 'string' ? raw : (raw?.name ?? '')).trim();
    if (!n) return;
    const key = n.toLowerCase();
    const d = String(raw?.description ?? '').trim();
    const ie = raw?.interiorExterior ?? raw?.interior_exterior ?? undefined;
    const prev = bldSeen.get(key);
    if (!prev) bldSeen.set(key, { name: n, description: d, interiorExterior: ie });
    else {
      if (!prev.description && d) prev.description = d;
      if (!prev.interiorExterior && ie) prev.interiorExterior = ie;
    }
  };
  const putLoc = (name: unknown, raw?: any): LocationCandidate | null => {
    const n = String(name ?? '').trim();
    if (!n) return null;
    const key = n.toLowerCase();
    const prev = locSeen.get(key);
    if (prev) return prev;
    const loc: LocationCandidate = { name: n, description: '', environmentNames: [], buildings: [] };
    locSeen.set(key, loc);
    locations.push(loc);
    if (raw && typeof raw === 'object') {
      loc.description = String(raw.description ?? '').trim();
      const envNames = Array.isArray(raw.environmentNames) ? raw.environmentNames : [];
      for (const en of envNames) {
        const s = String(en ?? '').trim();
        if (s && !loc.environmentNames.some((x) => x.toLowerCase() === s.toLowerCase())) loc.environmentNames.push(s);
      }
      const blds = Array.isArray(raw.buildings) ? raw.buildings : [];
      for (const b of blds) {
        const bn = String(typeof b === 'string' ? b : (b?.name ?? '')).trim();
        if (!bn) continue;
        if (!loc.buildings.some((x) => x.name.toLowerCase() === bn.toLowerCase())) {
          const v = String(typeof b === 'object' ? (b?.view ?? '') : '');
          loc.buildings.push({ name: bn, view: v === 'interior' || v === 'exterior' ? v : null });
        }
      }
      // 地点内的环境/建筑库（带简述）
      for (const e of Array.isArray(raw.environments) ? raw.environments : []) { putEnv(e); if (String(e?.name ?? '').trim()) pushEnvName(loc, String(e.name).trim()); }
      for (const b of Array.isArray(raw.buildingsLibrary) ? raw.buildingsLibrary : []) putBld(b);
      // environmentNames 引用的环境即使只在库中给名也要入库兜底
      for (const s of loc.environmentNames) if (![...envSeen.keys()].includes(s.toLowerCase())) envSeen.set(s.toLowerCase(), { name: s, description: '' });
    }
    return loc;
  };
  const pushEnvName = (loc: LocationCandidate, n: string) => {
    if (!loc.environmentNames.some((x) => x.toLowerCase() === n.toLowerCase())) loc.environmentNames.push(n);
  };

  if (Array.isArray(manifest)) {
    for (const it of manifest) {
      if (typeof it === 'string') putLoc(it);
      else if (it && typeof it === 'object') putLoc(it.name ?? it.title, it);
    }
  }
  for (const n of sceneRefs) putLoc(n);
  for (const e of extraEnvs) putEnv(e);
  for (const b of extraBlds) putBld(b);
  return { locations, envLibrary: [...envSeen.values()], bldLibrary: [...bldSeen.values()] };
}

/**
 * 构造影棚（studios）空壳条目：拆分批量补齐与分镜绑定单条补齐共用，
 * 字段形状对齐 localStudios 的 compose-from-script。
 * 影棚 = 环境(1:N) + 建筑(1:N) + 元素(M:N) 的聚合，自动补齐时先建空壳，
 * 再经 bindStudioComponents 把拆分出的环境/建筑绑定为链接（environment_id 为主环境镜像）。
 */
function buildStudioShell(c: ResourceCandidate, id: number, projectId: number, now: string): any {
  return {
    id,
    project_id: projectId,
    name: String(c.name ?? '').trim(),
    description: String(c.description ?? '').trim() || null,
    environment_id: null,
    environment_ids: [],
    building_ids: [],
    element_ids: [],
    generation_status: 'pending',
    sort_order: 0,
    created_at: now,
    updated_at: now,
  };
}

/**
 * 把地点候选拆分出的环境/建筑绑定到影棚（只增不删，不动用户已有偏好）：
 * - 环境写入 environment_ids 链接数组，并把首条镜像到旧字段 environment_id（主环境）；
 *   仅当主环境发生变化时才同步 environment_view，避免覆盖用户手动选的面。
 * - 建筑写入 building_ids 链接（view=interior/exterior 按镜头视角标注，未知则 null）。
 * 返回是否发生了修改。
 */
function bindStudioComponents(
  studio: any,
  loc: LocationCandidate,
  envIds: Map<string, number>,
  bldIds: Map<string, number>,
): boolean {
  let dirty = false;
  const links: { environment_id: number; view: string | null; sort_order: number }[] =
    Array.isArray(studio.environment_ids) ? studio.environment_ids.slice() : [];
  if (!links.length && Number(studio.environment_id) > 0) {
    links.push({
      environment_id: Number(studio.environment_id),
      view: studio.environment_view === 'back' || studio.environment_view === 'front' ? studio.environment_view : null,
      sort_order: 0,
    });
  }
  for (const en of loc.environmentNames) {
    const id = envIds.get(en.toLowerCase());
    if (id && !links.some((l) => Number(l.environment_id) === id)) {
      links.push({ environment_id: id, view: null, sort_order: links.length });
      dirty = true;
    }
  }
  if (links.length) {
    const prevPrimary = Number(studio.environment_id) || null;
    links.sort((a, b) => (Number(a.sort_order) || 0) - (Number(b.sort_order) || 0));
    const newPrimary = Number(links[0].environment_id);
    studio.environment_ids = links;
    if (newPrimary !== prevPrimary) {
      studio.environment_id = newPrimary;
      studio.environment_view = links[0].view ?? null;
      dirty = true;
    }
  }
  const blinks: any[] = Array.isArray(studio.building_ids) ? studio.building_ids : [];
  for (const b of loc.buildings) {
    const id = bldIds.get(b.name.toLowerCase());
    if (id && !blinks.some((l) => Number(l?.building_id) === id)) {
      blinks.push({ building_id: id, view: b.view ?? null, sort_order: blinks.length });
      dirty = true;
    }
  }
  if (blinks.length) studio.building_ids = blinks;
  return dirty;
}

/**
 * 确保工程 studios 集合中存在指定名称的影棚（按名去重，忽略大小写与首尾空白），返回是否新建。
 * 分镜绑定的地点与资源面板影棚同源：任何被分镜引用的地点名都必须能在 studios 里找到，
 * 否则就会出现「分镜里有影棚、资源里没有影棚」的数据分裂。
 */
export async function ensureStudioByName(
  path: string,
  projectId: number | null,
  name: string,
  description?: string,
): Promise<boolean> {
  const n = String(name ?? '').trim();
  if (!n || projectId == null) return false;
  const doc = await restStore.loadDoc(path, 'studios');
  const key = n.toLowerCase();
  const exists = doc.items.some(
    (it: any) =>
      String(it?.project_id) === String(projectId) &&
      String(it?.name ?? '').trim().toLowerCase() === key,
  );
  if (exists) return false;
  doc.items.push(
    buildStudioShell({ name: n, description: description ?? '' }, doc.nextId++, projectId, new Date().toISOString()),
  );
  restStore.saveDoc(path, 'studios', doc);
  return true;
}

/** 在 characters 文档中按名称去重补齐角色，返回新建数量 */
async function ensureCharacters(
  path: string,
  projectId: number | null,
  characters: ResourceCandidate[],
): Promise<number> {
  if (projectId == null || characters.length === 0) return 0;
  const now = new Date().toISOString();
  const doc = await restStore.loadDoc(path, 'characters');
  const existing = new Set(
    doc.items
      .filter((it: any) => String(it?.project_id) === String(projectId))
      .map((it: any) => String(it?.name ?? '').trim().toLowerCase()),
  );
  let created = 0;
  for (const c of characters) {
    const key = c.name.toLowerCase();
    if (existing.has(key)) continue;
    doc.items.push({
      id: doc.nextId++,
      project_id: projectId,
      name: c.name,
      description: c.description,
      base_appearance: c.description,
      appearance: c.description,
      created_at: now,
      updated_at: now,
    });
    existing.add(key);
    created++;
  }
  if (created > 0) restStore.saveDoc(path, 'characters', doc);
  return created;
}

/**
 * 按名称去重补齐资产库文档（environments / buildings），返回 名称(小写)→id 映射与新建数量。
 * 已存在同名条目只复用 id，不覆盖用户编辑过的描述/类型。
 */
async function ensureAssetLibrary(
  path: string,
  projectId: number | null,
  docName: 'environments' | 'buildings',
  candidates: LibraryCandidate[],
): Promise<{ ids: Map<string, number>; created: number }> {
  const ids = new Map<string, number>();
  if (projectId == null) return { ids, created: 0 };
  const doc = await restStore.loadDoc(path, docName);
  for (const it of doc.items) {
    if (String(it?.project_id) !== String(projectId)) continue;
    const key = String(it?.name ?? '').trim().toLowerCase();
    if (key && !ids.has(key)) ids.set(key, Number(it.id));
  }
  const now = new Date().toISOString();
  let created = 0;
  for (const c of candidates) {
    const key = c.name.toLowerCase();
    if (ids.has(key)) continue;
    const id = doc.nextId++;
    doc.items.push(
      docName === 'environments'
        ? { id, project_id: projectId, name: c.name, description: c.description || null, terrain_type: c.terrainType ?? null, generation_status: 'pending', sort_order: doc.items.length, created_at: now, updated_at: now }
        : { id, project_id: projectId, name: c.name, description: c.description || null, interior_exterior: c.interiorExterior || 'exterior', structure_type: null, generation_status: 'pending', sort_order: doc.items.length, created_at: now, updated_at: now },
    );
    ids.set(key, id);
    created++;
  }
  if (created > 0) restStore.saveDoc(path, docName, doc);
  return { ids, created };
}

/**
 * 在 studios 文档中按名称补齐影棚，并把地点拆出的环境/建筑绑定为链接
 * （含存量空壳影棚的回填：已存在但缺链接的也会补上，只增不删）。
 * 返回新建数量与是否发生过任意修改（新建/绑定）。
 */
async function ensureStudiosWithComponents(
  path: string,
  projectId: number | null,
  locations: LocationCandidate[],
  envIds: Map<string, number>,
  bldIds: Map<string, number>,
): Promise<{ created: number; touched: boolean }> {
  if (projectId == null || locations.length === 0) return { created: 0, touched: false };
  const now = new Date().toISOString();
  const doc = await restStore.loadDoc(path, 'studios');
  let created = 0;
  let touched = false;
  for (const loc of locations) {
    const key = loc.name.toLowerCase();
    let studio = doc.items.find(
      (it: any) =>
        String(it?.project_id) === String(projectId) &&
        String(it?.name ?? '').trim().toLowerCase() === key,
    );
    if (!studio) {
      studio = buildStudioShell(loc, doc.nextId++, projectId, now);
      doc.items.push(studio);
      created++;
      touched = true;
    }
    if (bindStudioComponents(studio, loc, envIds, bldIds)) touched = true;
  }
  if (touched) {
    for (const it of doc.items) {
      if (String(it?.project_id) === String(projectId)) it.updated_at = now;
    }
    restStore.saveDoc(path, 'studios', doc);
  }
  return { created, touched };
}

/**
 * 按名称去重补齐道具库（data/props.json：{ nextId, props: [] }），返回新建数量。
 * 与角色/地点不同，道具文档不是 items 结构，故单独实现；已存在同名道具时只跳过，不覆盖用户编辑过的描述。
 */
async function ensureProps(
  path: string,
  projectId: number | null,
  candidates: ResourceCandidate[],
): Promise<number> {
  if (projectId == null || candidates.length === 0) return 0;

  const doc = await readDoc<{ nextId?: number; props?: any[] }>(path, 'props', {});
  const items: any[] = Array.isArray(doc.props) ? doc.props : [];
  let nextId = Number(doc.nextId) || 1;
  const existing = new Set(
    items
      .filter((it) => String(it?.project_id ?? '') === String(projectId))
      .map((it) => String(it?.name ?? '').trim().toLowerCase()),
  );

  const now = new Date().toISOString();
  let created = 0;
  for (const c of candidates) {
    const name = c.name.trim();
    const key = name.toLowerCase();
    if (!key || existing.has(key)) continue;
    items.push({
      id: nextId++,
      project_id: projectId,
      name,
      description: c.description,
      created_at: now,
      updated_at: now,
    });
    existing.add(key);
    created++;
  }

  if (created > 0) writeDoc(path, 'props', { nextId, props: items });
  return created;
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
  const propRefs: string[] = [];
  for (const raw of list) {
    const chars = Array.isArray(raw?.characters) ? raw.characters : raw?.characters != null ? [raw.characters] : [];
    for (const c of chars) charRefs.push(String(c ?? ''));
    if (raw?.location) locRefs.push(String(raw.location));
    const rawProps = Array.isArray(raw?.props) ? raw.props : raw?.props != null ? [raw.props] : [];
    for (const p of rawProps) {
      const name = String(typeof p === 'string' ? p : (p?.name ?? '')).trim();
      if (name) propRefs.push(name);
    }
  }
  const characters = collectResources(parsed?.characters, charRefs);
  // 地点拆解：把每个地点的环境名/建筑（内/外景视角）与出图库候选一并收集，
  // 兼容模型把 environments / buildings 清单放在顶层的情况
  const { locations, envLibrary, bldLibrary } = collectLocationCandidates(
    parsed?.locations ?? parsed?.scenes_locations,
    locRefs,
    Array.isArray(parsed?.environments) ? parsed.environments : [],
    Array.isArray(parsed?.buildings) ? parsed.buildings : [],
  );

  // 道具沉淀：同一物品在 2 个及以上分镜重复出现才入库，一次性小物件留在分镜描述里
  const propHits = new Map<string, number>();
  for (const name of propRefs) {
    const key = name.toLowerCase();
    propHits.set(key, (propHits.get(key) || 0) + 1);
  }
  const repeatedProps = collectResources(parsed?.props, propRefs)
    .filter((p) => (propHits.get(p.name.toLowerCase()) || 0) >= 2);

  // 补齐顺序：环境库/建筑库先落库拿 id → 影棚按地点绑定环境/建筑链接 → 角色/道具独立补齐
  const pid = resolvedProjectId ?? null;
  const createdChars = await ensureCharacters(path, pid, characters);
  const envLib = await ensureAssetLibrary(path, pid, 'environments', envLibrary);
  const bldLib = await ensureAssetLibrary(path, pid, 'buildings', bldLibrary);
  const studioRes = await ensureStudiosWithComponents(path, pid, locations, envLib.ids, bldLib.ids);
  const createdProps = await ensureProps(path, pid, repeatedProps);

  const jobId = `sbg_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  return jsonResponse({
    success: true,
    jobId,
    count: added,
    total: doc.scenes.filter((s) => s._scope === scope).length,
    scriptId: scriptId ?? null,
    projectId: resolvedProjectId ?? null,
    createdCharacters: createdChars,
    createdLocations: studioRes.created,
    createdEnvironments: envLib.created,
    createdBuildings: bldLib.created,
    createdProps,
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
