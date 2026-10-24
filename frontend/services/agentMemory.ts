/**
 * 智能体记忆服务
 * ──────────────────────────────────────────────────────────────
 * 记录对项目起决定性作用的用户对话记忆，供 AI 助手在后续会话中注入系统提示词。
 *
 * 作用域：
 *  - user    用户记忆：跨工程共享（如「喜欢水彩风」），存应用数据目录
 *            app_docs/agent_memory_user.json（Tauri 文件；localStorage 作镜像与浏览器兜底）
 *  - project 工程记忆：仅当前工程调用（如「主角必须是红发」），存工程 data/agent_memory.json
 *
 * 重要度三级（high/normal/low）只来自用户与 AI 的显式判断，不做自动升降级：
 * 注入次数（useCount）仅作统计展示——注入只是「每次对话都念一遍」，不代表记忆
 * 真正起过作用，拿它当升级依据会让所有条目在若干轮对话后全部升为 high、排序失效。
 *
 * 新增记忆按归一化内容去重：完全一致，或一方包含另一方且短的一方 ≥6 字，视为
 * 重复；命中重复不新增，若原条目已停用则重新启用。
 *
 * 「一键清理」删除全部 low（次要）记忆。
 *
 * 外部工程包导入的记忆会在文档上带 imported=true 且 reviewed=false 标记
 * （package.rs 导入时写入），前端打开该工程时提示用户决定启用或停用，
 * 防止外部提示词经工程包静默注入对话。
 */

import { readProjectDoc, writeProjectDoc, readDoc, writeDoc } from './localStore';
import { readAppDoc, writeAppDoc } from './localApi';

export type MemoryScope = 'user' | 'project';
export type MemoryImportance = 'high' | 'normal' | 'low';

export interface AgentMemory {
  id: string;
  scope: MemoryScope;
  /** 记忆正文（≤200 字） */
  content: string;
  importance: MemoryImportance;
  /** 用户开关：关闭后不注入上下文但保留数据 */
  enabled: boolean;
  /** 被注入上下文的累计次数（仅统计展示，不参与升降级） */
  useCount: number;
  createdAt: number;
  lastUsedAt: number;
}

interface MemoryDoc {
  memories: AgentMemory[];
  /** 工程记忆文档：来自外部 .jzp 导入（package.rs 标记） */
  imported?: boolean;
  /** 用户已对导入的记忆做出启用/停用决定 */
  reviewed?: boolean;
}

/** 记忆变更事件（detail: { projectId?: number, flags?: boolean }），供管理面板刷新 */
export const AGENT_MEMORY_CHANGED = 'agent-memory-changed';

/** 单条记忆正文上限 */
export const MEMORY_CONTENT_MAX = 200;
/** 注入上下文的最大条数（超出按重要度+使用频次截断） */
export const MEMORY_INJECT_MAX = 20;
/** 去重时「一方包含另一方」要求短方至少达到的字符数，避免短句误判 */
const DEDUP_MIN_CONTAIN = 6;

/** 用户记忆落盘文件（应用数据目录 app_docs/ 下） */
const USER_MEMORY_FILE = 'agent_memory_user.json';
/** 旧版用户记忆 localStorage 键：首次读到应用文件为空时迁移；此后作为镜像备份 */
const USER_MEMORY_KEY = 'agent_memory_user_v1';
/** 记忆全局开关 localStorage 键 */
const MEMORY_FLAGS_KEY = 'agent_memory_flags_v1';

/** 记忆全局开关：自动生成（AI 主动 remember）/ 记忆检索（注入上下文）/ 注入上限 */
export interface MemoryFlags {
  autoLearn: boolean;
  retrieval: boolean;
  /** 每次对话最多注入的记忆条数（1–50） */
  injectMax: number;
}

const DEFAULT_FLAGS: MemoryFlags = { autoLearn: true, retrieval: true, injectMax: MEMORY_INJECT_MAX };

/** 把任意输入收敛为合法的注入上限（1–50 的整数，非法值回默认） */
export function clampInjectMax(v: unknown): number {
  const n = Math.round(Number(v));
  if (!Number.isFinite(n)) return MEMORY_INJECT_MAX;
  return Math.min(50, Math.max(1, n));
}

export function loadMemoryFlags(): MemoryFlags {
  try {
    const raw = localStorage.getItem(MEMORY_FLAGS_KEY);
    if (raw) {
      const f = JSON.parse(raw) as Partial<MemoryFlags>;
      return {
        autoLearn: f.autoLearn !== false,
        retrieval: f.retrieval !== false,
        injectMax: clampInjectMax(f.injectMax),
      };
    }
  } catch {
    // ignore
  }
  return { ...DEFAULT_FLAGS };
}

export function saveMemoryFlags(patch: Partial<MemoryFlags>): MemoryFlags {
  const next = { ...loadMemoryFlags(), ...patch };
  try {
    localStorage.setItem(MEMORY_FLAGS_KEY, JSON.stringify(next));
  } catch {
    // ignore
  }
  window.dispatchEvent(new CustomEvent(AGENT_MEMORY_CHANGED, { detail: { flags: true } }));
  return next;
}

let idSeq = 0;
function genId(): string {
  idSeq = (idSeq + 1) % 1000;
  return `mem_${Date.now().toString(36)}_${idSeq}_${Math.random().toString(36).slice(2, 8)}`;
}

/** 归一化正文用于去重比较：忽略大小写、空白与首尾标点 */
function normalizeContent(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/^[-—•·"“”'‘]+/, '')
    .replace(/[。．.!！?？，,、；;：:~～"“”'’]+$/, '')
    .trim();
}

/** 判断两条正文是否视为同一条记忆（归一化后相等，或一方包含另一方且短方足够长） */
function isSameContent(a: string, b: string): boolean {
  const na = normalizeContent(a);
  const nb = normalizeContent(b);
  if (!na || !nb) return false;
  if (na === nb) return true;
  const shorter = na.length <= nb.length ? na : nb;
  const longer = na.length <= nb.length ? nb : na;
  return shorter.length >= DEDUP_MIN_CONTAIN && longer.includes(shorter);
}

// ==================== 用户记忆（应用数据目录文件 + localStorage 镜像） ====================

let userDocCache: MemoryDoc | null = null;
let userDocInit: Promise<MemoryDoc> | null = null;
// 串行化用户记忆的读改写，避免并发交错互相覆盖
let userOpChain: Promise<unknown> = Promise.resolve();

function queueUserOp<T>(op: () => Promise<T>): Promise<T> {
  const next = userOpChain.then(op, op);
  userOpChain = next.catch(() => {});
  return next;
}

async function loadUserDoc(): Promise<MemoryDoc> {
  if (userDocCache) return userDocCache;
  if (!userDocInit) {
    userDocInit = (async () => {
      let doc: MemoryDoc = { memories: [] };
      try {
        const raw = await readAppDoc(USER_MEMORY_FILE);
        if (raw) {
          const parsed = JSON.parse(raw) as Partial<MemoryDoc>;
          doc = { memories: Array.isArray(parsed.memories) ? parsed.memories : [] };
        }
      } catch {
        // 应用文件读取/解析失败按空文档处理
      }
      // 旧版数据迁移：应用文件为空而 localStorage 有记忆（v1 及之前存 localStorage）
      if (doc.memories.length === 0) {
        try {
          const legacy = localStorage.getItem(USER_MEMORY_KEY);
          if (legacy) {
            const parsed = JSON.parse(legacy) as Partial<MemoryDoc>;
            if (Array.isArray(parsed.memories) && parsed.memories.length > 0) {
              doc = { memories: parsed.memories };
              await saveUserDoc(doc).catch(() => {});
            }
          }
        } catch {
          // ignore
        }
      }
      userDocCache = doc;
      return doc;
    })();
  }
  return userDocInit;
}

async function saveUserDoc(doc: MemoryDoc): Promise<void> {
  userDocCache = doc;
  await writeAppDoc(USER_MEMORY_FILE, JSON.stringify(doc));
  // localStorage 镜像：应用文件异常时的兜底备份（浏览器模式即主存储）
  try {
    localStorage.setItem(USER_MEMORY_KEY, JSON.stringify(doc));
  } catch {
    // 存储满等异常静默忽略
  }
}

// ==================== 工程记忆（data/agent_memory.json） ====================

async function loadProjectDoc(projectId: number | null | undefined): Promise<MemoryDoc> {
  if (!projectId) return { memories: [] };
  const doc = await readProjectDoc<Partial<MemoryDoc>>(projectId, 'agentMemory', {});
  // 保留 imported/reviewed 标记：读改写循环不能把「未审阅的外部记忆」状态抹掉
  return {
    imported: doc?.imported,
    reviewed: doc?.reviewed,
    memories: Array.isArray(doc?.memories) ? (doc.memories as AgentMemory[]) : [],
  };
}

async function saveProjectDoc(projectId: number, doc: MemoryDoc): Promise<boolean> {
  return writeProjectDoc(projectId, 'agentMemory', doc);
}

// ==================== 公共 API ====================

const IMPORTANCE_RANK: Record<MemoryImportance, number> = { high: 3, normal: 2, low: 1 };

function sortMemories(list: AgentMemory[]): AgentMemory[] {
  return [...list].sort((a, b) => {
    const r = IMPORTANCE_RANK[b.importance] - IMPORTANCE_RANK[a.importance];
    if (r !== 0) return r;
    if (b.useCount !== a.useCount) return b.useCount - a.useCount;
    return b.createdAt - a.createdAt;
  });
}

function dispatchChanged(projectId?: number | null): void {
  window.dispatchEvent(new CustomEvent(AGENT_MEMORY_CHANGED, { detail: { projectId: projectId ?? null } }));
}

/**
 * 合并列出用户记忆 + 工程记忆（按重要度 > 使用频次 > 创建时间排序）。
 * projectId 为空时只返回用户记忆。
 */
export async function listMemories(projectId?: number | null): Promise<AgentMemory[]> {
  const user = (await loadUserDoc()).memories;
  const project = projectId ? (await loadProjectDoc(projectId)).memories : [];
  return sortMemories([...user, ...project]);
}

/** addMemory 结果：created 新增 / duplicate 命中已有（wasDisabled 表示原本停用、已重新启用） */
export type AddMemoryResult =
  | { status: 'created'; memory: AgentMemory }
  | { status: 'duplicate'; memory: AgentMemory; wasDisabled: boolean }
  | { status: 'invalid' };

/**
 * 新增记忆（AI remember 动作与用户手动添加共用）。
 * 按归一化内容跨作用域去重：命中重复不新增；原条目已停用时重新启用。
 */
export async function addMemory(
  projectId: number | null | undefined,
  input: { content: string; scope?: MemoryScope; importance?: MemoryImportance }
): Promise<AddMemoryResult> {
  const content = (input.content || '').trim().slice(0, MEMORY_CONTENT_MAX);
  if (!content) return { status: 'invalid' };

  // 去重检查：跨两个作用域找同义条目
  const existing = await listMemories(projectId);
  const dup = existing.find((m) => isSameContent(m.content, content));
  if (dup) {
    if (!dup.enabled) {
      const ok = await setMemoryEnabledById(projectId, dup.id, true);
      if (ok) dispatchChanged(projectId);
      return { status: 'duplicate', memory: { ...dup, enabled: true }, wasDisabled: true };
    }
    return { status: 'duplicate', memory: dup, wasDisabled: false };
  }

  const scope: MemoryScope = input.scope === 'user' ? 'user' : 'project';
  // 工程记忆必须有工程上下文；无工程时降级为用户记忆
  const effectiveScope: MemoryScope = scope === 'project' && !projectId ? 'user' : scope;
  const importance: MemoryImportance =
    input.importance === 'high' || input.importance === 'low' ? input.importance : 'normal';
  const mem: AgentMemory = {
    id: genId(),
    scope: effectiveScope,
    content,
    importance,
    enabled: true,
    useCount: 0,
    createdAt: Date.now(),
    lastUsedAt: 0,
  };
  if (effectiveScope === 'user') {
    await queueUserOp(async () => {
      const doc = await loadUserDoc();
      doc.memories.push(mem);
      await saveUserDoc(doc);
    });
  } else {
    const doc = await loadProjectDoc(projectId);
    doc.memories.push(mem);
    await saveProjectDoc(projectId!, doc);
  }
  dispatchChanged(projectId);
  return { status: 'created', memory: mem };
}

/** 按 id 设置启用状态（用户/工程记忆通用；找不到返回 false） */
async function setMemoryEnabledById(
  projectId: number | null | undefined,
  id: string,
  enabled: boolean
): Promise<boolean> {
  const userDoc = await loadUserDoc();
  const userMem = userDoc.memories.find((m) => m.id === id);
  if (userMem) {
    userMem.enabled = enabled;
    await saveUserDoc(userDoc);
    return true;
  }
  if (projectId) {
    const projDoc = await loadProjectDoc(projectId);
    const projMem = projDoc.memories.find((m) => m.id === id);
    if (projMem) {
      projMem.enabled = enabled;
      await saveProjectDoc(projectId, projDoc);
      return true;
    }
  }
  return false;
}

/**
 * 更新记忆字段（内容/重要度/开关）。重要度只在此处由人显式修改，无自动升降级。
 */
export async function updateMemory(
  projectId: number | null | undefined,
  id: string,
  patch: Partial<Pick<AgentMemory, 'content' | 'importance' | 'enabled'>>
): Promise<boolean> {
  const apply = (list: AgentMemory[]): boolean => {
    const mem = list.find((m) => m.id === id);
    if (!mem) return false;
    if (typeof patch.content === 'string') {
      const c = patch.content.trim().slice(0, MEMORY_CONTENT_MAX);
      if (c) mem.content = c;
    }
    if (patch.importance === 'high' || patch.importance === 'normal' || patch.importance === 'low') {
      mem.importance = patch.importance;
    }
    if (typeof patch.enabled === 'boolean') mem.enabled = patch.enabled;
    return true;
  };
  // 先查用户记忆，再查工程记忆
  const userDoc = await loadUserDoc();
  if (apply(userDoc.memories)) {
    await saveUserDoc(userDoc);
    dispatchChanged(projectId);
    return true;
  }
  if (projectId) {
    const projDoc = await loadProjectDoc(projectId);
    if (apply(projDoc.memories)) {
      await saveProjectDoc(projectId, projDoc);
      dispatchChanged(projectId);
      return true;
    }
  }
  return false;
}

/** 删除记忆（按 id） */
export async function deleteMemory(
  projectId: number | null | undefined,
  id: string
): Promise<boolean> {
  const userDoc = await loadUserDoc();
  const userIdx = userDoc.memories.findIndex((m) => m.id === id);
  if (userIdx >= 0) {
    userDoc.memories.splice(userIdx, 1);
    await saveUserDoc(userDoc);
    dispatchChanged(projectId);
    return true;
  }
  if (projectId) {
    const projDoc = await loadProjectDoc(projectId);
    const idx = projDoc.memories.findIndex((m) => m.id === id);
    if (idx >= 0) {
      projDoc.memories.splice(idx, 1);
      await saveProjectDoc(projectId, projDoc);
      dispatchChanged(projectId);
      return true;
    }
  }
  return false;
}

/** 按关键词模糊匹配删除（AI forget 动作用），返回删除条数 */
export async function deleteMemoriesByKeyword(
  projectId: number | null | undefined,
  keyword: string
): Promise<number> {
  const kw = (keyword || '').trim().toLowerCase();
  if (!kw) return 0;
  let removed = 0;
  const userDoc = await loadUserDoc();
  const before = userDoc.memories.length;
  userDoc.memories = userDoc.memories.filter((m) => !m.content.toLowerCase().includes(kw));
  removed += before - userDoc.memories.length;
  if (before !== userDoc.memories.length) await saveUserDoc(userDoc);
  if (projectId) {
    const projDoc = await loadProjectDoc(projectId);
    const pBefore = projDoc.memories.length;
    projDoc.memories = projDoc.memories.filter((m) => !m.content.toLowerCase().includes(kw));
    removed += pBefore - projDoc.memories.length;
    if (pBefore !== projDoc.memories.length) await saveProjectDoc(projectId, projDoc);
  }
  if (removed > 0) dispatchChanged(projectId);
  return removed;
}

/**
 * 记录记忆被注入上下文：useCount+1、lastUsedAt 更新。
 * 仅作统计展示，不改变重要度（注入 ≠ 起作用）。异步调用，不阻塞发送流程。
 */
export async function touchMemories(
  projectId: number | null | undefined,
  ids: string[]
): Promise<void> {
  if (!ids.length) return;
  const idSet = new Set(ids);
  const apply = (list: AgentMemory[]): boolean => {
    let dirty = false;
    for (const mem of list) {
      if (!idSet.has(mem.id)) continue;
      mem.useCount += 1;
      mem.lastUsedAt = Date.now();
      dirty = true;
    }
    return dirty;
  };
  const userDoc = await loadUserDoc();
  if (apply(userDoc.memories)) await saveUserDoc(userDoc);
  if (projectId) {
    const projDoc = await loadProjectDoc(projectId);
    if (apply(projDoc.memories)) await saveProjectDoc(projectId, projDoc);
  }
}

/** 取待注入上下文的记忆：仅 enabled，按排序截断到注入上限（设置页可调） */
export async function listActiveMemories(projectId?: number | null): Promise<AgentMemory[]> {
  const all = await listMemories(projectId);
  return all.filter((m) => m.enabled).slice(0, loadMemoryFlags().injectMax);
}

/** 一键清理次要记忆（low），返回清理条数 */
export async function purgeLowMemories(projectId?: number | null): Promise<number> {
  const isDead = (m: AgentMemory) => m.importance === 'low';
  let removed = 0;
  const userDoc = await loadUserDoc();
  const before = userDoc.memories.length;
  userDoc.memories = userDoc.memories.filter((m) => !isDead(m));
  removed += before - userDoc.memories.length;
  if (before !== userDoc.memories.length) await saveUserDoc(userDoc);
  if (projectId) {
    const projDoc = await loadProjectDoc(projectId);
    const pBefore = projDoc.memories.length;
    projDoc.memories = projDoc.memories.filter((m) => !isDead(m));
    removed += pBefore - projDoc.memories.length;
    if (pBefore !== projDoc.memories.length) await saveProjectDoc(projectId, projDoc);
  }
  if (removed > 0) dispatchChanged(projectId);
  return removed;
}

/**
 * 清空记忆。scope 缺省清空全部（用户 + 当前工程）；
 * 传 'user' 只清用户记忆，传 'project' 只清当前工程记忆。返回清理条数。
 */
export async function clearAllMemories(
  projectId?: number | null,
  scope?: MemoryScope
): Promise<number> {
  let removed = 0;
  if (!scope || scope === 'user') {
    const userDoc = await loadUserDoc();
    removed += userDoc.memories.length;
    if (userDoc.memories.length) await saveUserDoc({ memories: [] });
  }
  if ((!scope || scope === 'project') && projectId) {
    const projDoc = await loadProjectDoc(projectId);
    removed += projDoc.memories.length;
    if (projDoc.memories.length) await saveProjectDoc(projectId, { memories: [] });
  }
  if (removed > 0) dispatchChanged(projectId);
  return removed;
}

// ==================== 外部工程包导入的记忆审阅 ====================

/**
 * 检查工程是否携带未审阅的外部记忆（.jzp 导入时由 Rust 打标记）。
 * 返回记忆条数；未标记、已审阅或无记忆返回 null。
 */
export async function checkImportedMemories(projectPath: string | null | undefined): Promise<number | null> {
  if (!projectPath) return null;
  const doc = await readDoc<MemoryDoc>(projectPath, 'agentMemory', { memories: [] });
  if (!doc.imported || doc.reviewed || doc.memories.length === 0) return null;
  return doc.memories.length;
}

/**
 * 用户对外部记忆做出决定：保留启用或全部停用，并写入 reviewed 标记（只问一次）。
 * 停用不删除数据，可在记忆面板中重新启用。
 */
export async function resolveImportedMemories(projectPath: string, keepEnabled: boolean): Promise<void> {
  const doc = await readDoc<MemoryDoc>(projectPath, 'agentMemory', { memories: [] });
  doc.reviewed = true;
  if (!keepEnabled) {
    doc.memories = doc.memories.map((m) => ({ ...m, enabled: false }));
  }
  writeDoc(projectPath, 'agentMemory', doc);
  dispatchChanged(null);
}
