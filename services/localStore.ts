// 统一本地数据访问层（localStore）
//
// 桌面离线模式下，工程的剧本 / 分镜 / 道具 / 生成任务等数据以「文档」形式
// 存放在 .jzp 工程目录的 data/ 下（每个文档一个 JSON 文件）。
// 底层复用 localApi 的 saveProjectData / loadProjectData（Rust 原子写 + 浏览器 localStorage 降级），
// 本层在其上叠加：内存缓存、写合并防抖、并发读去重、失效刷新。
//
// 键：工程绝对路径 projectPath。业务侧多以 Project.id 引用，故提供 resolveLocalPath(id) 适配。

import { loadProjectData, saveProjectData } from './localApi';
import { fetchLocalProjects, isLocalProjectId } from './projects';

/** 本工程数据文档名（对应 data/ 下的文件名） */
export const LOCAL_DOCS = {
  scripts: 'scripts.json',
  storyboards: 'storyboards.json',
  props: 'props.json',
  projectMeta: 'project.meta.json',
  generationTasks: 'generation_tasks.json',
} as const;

export type LocalDocName = keyof typeof LOCAL_DOCS;

const WRITE_DEBOUNCE_MS = 300;

// projectPath -> doc -> parsed value
const cache = new Map<string, Map<string, unknown>>();
// projectPath::doc -> in-flight read promise（并发读去重）
const inflightReads = new Map<string, Promise<unknown>>();
// projectPath::doc -> 待写入数据 + 防抖定时器（写合并）
const pendingWrites = new Map<string, { projectPath: string; file: string; data: unknown; timer: ReturnType<typeof setTimeout> }>();

function key(projectPath: string, file: string): string {
  return `${projectPath}::${file}`;
}

function cacheGet(projectPath: string, file: string): { hit: boolean; value?: unknown } {
  const docs = cache.get(projectPath);
  if (docs && docs.has(file)) return { hit: true, value: docs.get(file) };
  return { hit: false };
}

function cacheSet(projectPath: string, file: string, value: unknown): void {
  let docs = cache.get(projectPath);
  if (!docs) {
    docs = new Map();
    cache.set(projectPath, docs);
  }
  docs.set(file, value);
}

/** 立即把某个待写文档落盘（供 flush / 覆盖写前调用） */
async function commitWrite(k: string): Promise<void> {
  const pending = pendingWrites.get(k);
  if (!pending) return;
  clearTimeout(pending.timer);
  pendingWrites.delete(k);
  try {
    await saveProjectData(pending.projectPath, pending.file, JSON.stringify(pending.data));
  } catch (err) {
    console.error('[localStore] 落盘失败', pending.file, err);
    throw err;
  }
}

/**
 * 读取工程文档；不存在或解析失败时返回 fallback（并写入缓存，避免重复读盘）。
 */
export async function readDoc<T>(projectPath: string, doc: LocalDocName, fallback: T): Promise<T> {
  const file = LOCAL_DOCS[doc];
  const cached = cacheGet(projectPath, file);
  if (cached.hit) return cached.value as T;

  const k = key(projectPath, file);
  const running = inflightReads.get(k);
  if (running) return running as Promise<T>;

  const p = (async (): Promise<T> => {
    try {
      const raw = await loadProjectData(projectPath, file);
      const value = raw ? (JSON.parse(raw) as T) : fallback;
      cacheSet(projectPath, file, value);
      return value;
    } catch (err) {
      console.warn('[localStore] 读取文档失败，使用默认值', file, err);
      cacheSet(projectPath, file, fallback);
      return fallback;
    } finally {
      inflightReads.delete(k);
    }
  })();

  inflightReads.set(k, p);
  return p;
}

/**
 * 写入工程文档（内存缓存即时更新 + 300ms 防抖合并落盘）。
 * 同一文档在防抖窗口内的多次写只保留最后一次。
 */
export function writeDoc<T>(projectPath: string, doc: LocalDocName, data: T): void {
  const file = LOCAL_DOCS[doc];
  cacheSet(projectPath, file, data);
  const k = key(projectPath, file);
  const existing = pendingWrites.get(k);
  if (existing) clearTimeout(existing.timer);
  const timer = setTimeout(() => {
    void commitWrite(k).catch(() => {});
  }, WRITE_DEBOUNCE_MS);
  pendingWrites.set(k, { projectPath, file, data, timer });
}

/** 强制立即落盘指定文档（若有待写） */
export async function flushDoc(projectPath: string, doc: LocalDocName): Promise<void> {
  await commitWrite(key(projectPath, LOCAL_DOCS[doc]));
}

/** 强制落盘所有待写文档（退出/切工程前调用） */
export async function flushAll(): Promise<void> {
  const keys = [...pendingWrites.keys()];
  await Promise.all(keys.map((k) => commitWrite(k).catch(() => {})));
}

/** 失效缓存（工程外部变更 / 需要强制重读时）；不传 doc 则失效整个工程缓存 */
export function invalidate(projectPath: string, doc?: LocalDocName): void {
  if (doc) {
    const file = LOCAL_DOCS[doc];
    cache.get(projectPath)?.delete(file);
    void commitWrite(key(projectPath, file)).catch(() => {});
  } else {
    cache.delete(projectPath);
    for (const k of [...pendingWrites.keys()]) {
      if (k.startsWith(`${projectPath}::`)) void commitWrite(k).catch(() => {});
    }
  }
}

// ==================== project id → path 适配 ====================

// id -> path 解析缓存（含 null 结果，避免重复扫描注册表）
const pathByProjectId = new Map<number, string | null>();

/** 解析本地工程 id 对应的工程文件夹绝对路径；非本地工程返回 null。 */
export async function resolveLocalPath(projectId: number | string | null | undefined): Promise<string | null> {
  if (projectId === null || projectId === undefined) return null;
  const id = typeof projectId === 'string' ? Number(projectId) : projectId;
  if (!Number.isFinite(id) || !isLocalProjectId(id)) return null;
  if (pathByProjectId.has(id)) return pathByProjectId.get(id) ?? null;
  try {
    const locals = await fetchLocalProjects();
    const hit = locals.find((p) => p.id === id);
    const path = hit?.local_path ?? null;
    pathByProjectId.set(id, path);
    return path;
  } catch (err) {
    console.warn('[localStore] 解析本地工程路径失败', id, err);
    return null;
  }
}

/** 工程外部被删除/重注册时清除 id→path 解析缓存 */
export function clearPathCache(): void {
  pathByProjectId.clear();
}

// ==================== 当前活动工程 ====================
// 离线桌面为"单活动工程"模型：路由拦截器据此确定未显式携带 projectId 的请求归属。
let activeProjectPath: string | null = null;
let activeProjectId: number | null = null;

/** 设置当前打开的本地工程（Workbench 切换工程时调用）。传入 Project 形状即可。 */
export function setActiveProject(project: { id?: number; local_path?: string } | null): void {
  if (project && project.local_path) {
    activeProjectPath = project.local_path;
    activeProjectId = typeof project.id === 'number' ? project.id : null;
    if (activeProjectId !== null) pathByProjectId.set(activeProjectId, activeProjectPath);
  } else {
    activeProjectPath = null;
    activeProjectId = null;
  }
}

export function getActiveProjectPath(): string | null {
  return activeProjectPath;
}

export function getActiveProjectId(): number | null {
  return activeProjectId;
}

/** 读取某工程 id 的文档；非本地工程或未找到路径时返回 fallback。 */
export async function readProjectDoc<T>(projectId: number, doc: LocalDocName, fallback: T): Promise<T> {
  const path = await resolveLocalPath(projectId);
  if (!path) return fallback;
  return readDoc(path, doc, fallback);
}

/** 写入某工程 id 的文档；非本地工程时静默忽略。返回是否已受理。 */
export async function writeProjectDoc<T>(projectId: number, doc: LocalDocName, data: T): Promise<boolean> {
  const path = await resolveLocalPath(projectId);
  if (!path) return false;
  writeDoc(path, doc, data);
  return true;
}
