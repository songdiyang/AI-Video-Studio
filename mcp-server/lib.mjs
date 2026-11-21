// AI Video Studio 工程数据读写层（MCP 服务复用）
//
// 工程目录结构（与桌面应用完全一致）：
//   <project>/project.json          清单
//   <project>/data/*.json           业务文档（剧本/分镜/角色/道具/影棚…）
//   <project>/media/                素材（本模块绝不触碰）
//   <project>/snapshots/<id>/       快照（data/+project.json+meta.json，保留 10 份）
//
// 外部智能体通过 MCP 直接读写这些 JSON 文档，因此这里做三件事：
//   1) 路径与字段白名单校验（拒绝逃逸工程目录、拒绝未知字段）；
//   2) 原子写（tmp + rename），避免半截文件；
//   3) 破坏性操作前自动快照（与 Rust snapshots.rs 同目录同 meta 形状，
//      应用内「设置›工程设置›快照与恢复」可直接看到并还原）。
//
// 并发说明：桌面应用对文档有内存缓存 + 300ms 防抖写。外部写入与正在编辑的
// 应用同时操作同一文档时，应用后写会覆盖外部结果——README 明确提示先关闭
// 应用或避免同时编辑；快照保证任何覆盖都可回退。

import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve, sep } from 'node:path';
import { randomUUID } from 'node:crypto';

export const SNAPSHOT_KEEP = 10;
export const MANIFEST = 'project.json';

/** 文档名 → 集合键（不同域的历史命名不一致，此处收敛） */
export const DOCS = {
  scripts: { file: 'scripts.json', listKey: 'scripts' },
  storyboards: { file: 'storyboards.json', listKey: 'scenes' },
  characters: { file: 'characters.json', listKey: 'items' },
  props: { file: 'props.json', listKey: 'props' },
  studios: { file: 'studios.json', listKey: 'items' },
  environments: { file: 'environments.json', listKey: 'items' },
  characterStates: { file: 'character_states.json', listKey: 'items' },
  settings: { file: 'project_settings.json', listKey: null },
};

/** 默认工程根目录：环境变量 > 桌面应用默认位置（文档/AI-Video-Studio作品） */
export function defaultProjectsRoot() {
  if (process.env.AIVS_PROJECTS_ROOT) return process.env.AIVS_PROJECTS_ROOT;
  const home = homedir();
  const candidates = [
    join(home, 'Documents', 'AI-Video-Studio作品'),
    join(home, '文档', 'AI-Video-Studio作品'),
  ];
  return candidates.find((p) => existsSync(p)) || candidates[0];
}

/** 工程目录校验：必须是含 project.json 的目录；返回规范绝对路径 */
export function assertProjectDir(projectPath) {
  if (!projectPath || typeof projectPath !== 'string') throw new Error('缺少 projectPath');
  const dir = resolve(projectPath);
  const manifest = join(dir, MANIFEST);
  if (!existsSync(manifest)) throw new Error(`不是有效的工程目录（缺少 ${MANIFEST}）：${dir}`);
  return dir;
}

export function readManifest(projectPath) {
  const dir = assertProjectDir(projectPath);
  return JSON.parse(readFileSync(join(dir, MANIFEST), 'utf8'));
}

export function writeManifest(projectPath, manifest) {
  const dir = assertProjectDir(projectPath);
  const next = { ...manifest, updated_at: new Date().toISOString() };
  atomicWriteJson(join(dir, MANIFEST), next);
  return next;
}

/** 读取业务文档；不存在返回 fallback（默认按集合形状给空骨架） */
export function readDoc(projectPath, docName, fallback) {
  const dir = assertProjectDir(projectPath);
  const meta = DOCS[docName];
  if (!meta) throw new Error(`未知文档：${docName}`);
  const file = join(dir, 'data', meta.file);
  if (!existsSync(file)) {
    if (fallback !== undefined) return fallback;
    return meta.listKey ? { nextId: 1, [meta.listKey]: [] } : {};
  }
  try {
    return JSON.parse(readFileSync(file, 'utf8'));
  } catch (e) {
    throw new Error(`文档解析失败 ${meta.file}：${e.message}`);
  }
}

/** 原子写业务文档：tmp + rename，确保读者永远不会看到半截 JSON */
export function writeDoc(projectPath, docName, data) {
  const dir = assertProjectDir(projectPath);
  const meta = DOCS[docName];
  if (!meta) throw new Error(`未知文档：${docName}`);
  atomicWriteJson(join(dir, 'data', meta.file), data);
  return data;
}

export function atomicWriteJson(file, data) {
  mkdirSync(dirname(file), { recursive: true });
  const tmp = `${file}.tmp-${randomUUID().slice(0, 8)}`;
  writeFileSync(tmp, JSON.stringify(data), 'utf8');
  renameSync(tmp, file);
}

/** 列表通用：返回 {nextId, listKey, items} */
export function readCollection(projectPath, docName) {
  const doc = readDoc(projectPath, docName);
  const key = DOCS[docName].listKey;
  return { doc, key, items: Array.isArray(doc[key]) ? doc[key] : [] };
}

export function writeCollection(projectPath, docName, doc) {
  return writeDoc(projectPath, docName, doc);
}

export function nextIdOf(doc, key) {
  const ids = (Array.isArray(doc[key]) ? doc[key] : []).map((x) => Number(x?.id) || 0);
  return Math.max(Number(doc.nextId) || 1, ...ids.map((n) => n + 1), 1);
}

/** 列出工程根目录下所有有效工程（含清单信息），按 updated_at 倒序 */
export function listProjects(root = defaultProjectsRoot()) {
  if (!existsSync(root)) return [];
  const out = [];
  for (const name of readdirSync(root)) {
    const dir = join(root, name);
    try {
      if (!statSync(dir).isDirectory()) continue;
      const manifestPath = join(dir, MANIFEST);
      if (!existsSync(manifestPath)) continue;
      const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
      out.push({
        name: manifest.name || name,
        path: dir,
        id: manifest.id,
        project_type: manifest.project_type,
        updated_at: manifest.updated_at,
      });
    } catch {
      // 坏目录/坏清单跳过，不让单个工程影响整体列表
    }
  }
  return out.sort((a, b) => String(b.updated_at || '').localeCompare(String(a.updated_at || '')));
}

/** 工程摘要：清单 + 各集合数量 + 快照数 */
export function projectSummary(projectPath) {
  const dir = assertProjectDir(projectPath);
  const manifest = readManifest(dir);
  const count = (docName) => {
    try {
      return readCollection(dir, docName).items.length;
    } catch {
      return 0;
    }
  };
  return {
    ...manifest,
    path: dir,
    counts: {
      scripts: count('scripts'),
      scenes: count('storyboards'),
      characters: count('characters'),
      props: count('props'),
      studios: count('studios'),
      environments: count('environments'),
      snapshots: listSnapshots(dir).length,
    },
  };
}

// ── 快照（与 Rust snapshots.rs 同布局，供应用内恢复 UI 识别） ───────────

function snapshotRoot(projectPath) {
  return join(assertProjectDir(projectPath), 'snapshots');
}

/** 创建快照：复制 data/*.json + project.json，写 meta.json，保留最近 10 份 */
export function createSnapshot(projectPath, label = '外部智能体', trigger = 'agent', keep = SNAPSHOT_KEEP) {
  const dir = assertProjectDir(projectPath);
  const now = new Date();
  const stamp = now.toISOString().replace(/[-:T]/g, '').slice(0, 14); // YYYYMMDDhhmmss
  const id = `${formatStamp(now)}-${randomUUID().slice(0, 8)}`;
  const snapDir = join(snapshotRoot(dir), id);
  mkdirSync(join(snapDir, 'data'), { recursive: true });
  const dataDir = join(dir, 'data');
  if (existsSync(dataDir)) {
    for (const f of readdirSync(dataDir)) {
      if (!f.endsWith('.json')) continue;
      writeFileSync(join(snapDir, 'data', f), readFileSync(join(dataDir, f)));
    }
  }
  const manifest = join(dir, MANIFEST);
  if (existsSync(manifest)) writeFileSync(join(snapDir, MANIFEST), readFileSync(manifest));
  writeFileSync(join(snapDir, 'meta.json'), JSON.stringify({
    id,
    created_at: now.toISOString(),
    label,
    trigger,
    source: 'mcp',
    _stamp: stamp,
  }));
  pruneSnapshots(dir, keep);
  return { id, created_at: now.toISOString(), label, trigger };
}

function formatStamp(d) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

function pruneSnapshots(projectPath, keep) {
  const root = snapshotRoot(projectPath);
  if (!existsSync(root)) return;
  const dirs = readdirSync(root).filter((n) => existsSync(join(root, n, 'meta.json')));
  dirs.sort().reverse();
  for (const stale of dirs.slice(Math.max(keep, 1))) {
    rmSync(join(root, stale), { recursive: true, force: true });
  }
}

export function listSnapshots(projectPath) {
  const root = snapshotRoot(projectPath);
  if (!existsSync(root)) return [];
  const out = [];
  for (const name of readdirSync(root)) {
    const metaPath = join(root, name, 'meta.json');
    if (!existsSync(metaPath)) continue;
    try {
      out.push(JSON.parse(readFileSync(metaPath, 'utf8')));
    } catch {
      // 跳过坏 meta
    }
  }
  return out.sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')));
}

/** 校验 id 属于工程数据（防跨工程误操作） */
export function findById(items, id, what = '记录') {
  const target = items.find((x) => Number(x?.id) === Number(id));
  if (!target) throw new Error(`找不到${what} id=${id}`);
  return target;
}

/** 白名单合并字段：拒绝未知字段与原型污染键 */
export function pickFields(patch, allowed) {
  const out = {};
  for (const key of allowed) {
    if (patch && Object.prototype.hasOwnProperty.call(patch, key)) out[key] = patch[key];
  }
  for (const key of Object.keys(patch || {})) {
    if (!allowed.includes(key)) throw new Error(`不允许写入字段：${key}（允许：${allowed.join(', ')}）`);
    if (key === '__proto__' || key === 'constructor') throw new Error('非法字段');
  }
  return out;
}

/** 分镜场景默认形状（与 storyboards.json 既有记录一致） */
export function newScene({ id, index, description = '', duration = 5 }) {
  return {
    id,
    index,
    _scope: null,
    prompt_template: '',
    description,
    is_locked: false,
    linkedCharacters: [],
    linkedScenes: [],
    variables: {
      dialogue: '',
      duration,
      characters: [],
      props: [],
      location: '',
      shotType: '中景',
      emotion: '',
      dialogues: [],
    },
  };
}

/** 校验路径位于工程目录内（media 等绝对路径只允许读引用，不允许写入） */
export function assertInsideProject(projectPath, candidate) {
  const dir = assertProjectDir(projectPath);
  const abs = resolve(dir, candidate);
  if (abs !== dir && !abs.startsWith(dir + sep)) throw new Error('路径越界：拒绝访问工程目录之外的文件');
  return abs;
}

/** 台词数组清洗：一行一个说话人（与智能体 update_scene_dialogues 同口径） */
export function cleanDialogues(input) {
  if (!Array.isArray(input)) throw new Error('dialogues 必须是数组');
  return input.map((d) => {
    if (!d || typeof d !== 'object') throw new Error('dialogues 项必须是对象');
    const line = String(d.line || '').replace(/\s+/g, ' ').trim();
    if (!line) throw new Error('台词 line 不能为空');
    if (/：/.test(line)) throw new Error('line 内不得再带「某某：」前缀，说话人只放 character');
    const character = String(d.character || '').trim();
    return character ? { character, line } : { line };
  });
}