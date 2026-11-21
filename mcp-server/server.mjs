#!/usr/bin/env node
// AI Video Studio · MCP 服务器（stdio）
//
// 把本地工程的业务数据（剧本/分镜/角色/道具/影棚/快照）以 Model Context Protocol
// 工具开放给任意外部智能体（Claude Desktop / Cursor / Cline / 自研 Agent）。
//
// 设计要点：
//  - 直读写工程目录内的 data/*.json + project.json（与桌面应用同一份数据）；
//  - 所有写入走原子替换；删除类工具要求 confirm=true 且执行前自动打快照
//    （快照布局与 Rust snapshots.rs 一致，应用内「快照与恢复」可直接还原）；
//  - 字段白名单收敛可写面，路径校验拒绝越界；media/ 只读引用不落盘。
//
// 启动：node server.mjs（或 npx aivs-mcp）；工程根可用 AIVS_PROJECTS_ROOT 覆盖。

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import {
  DOCS,
  createSnapshot,
  defaultProjectsRoot,
  listProjects,
  listSnapshots,
  newScene,
  nextIdOf,
  pickFields,
  projectSummary,
  readCollection,
  readDoc,
  readManifest,
  cleanDialogues,
  findById,
  writeCollection,
  writeDoc,
  writeManifest,
} from './lib.mjs';

const SCENE_TOP_FIELDS = ['description', 'prompt_template', 'is_locked'];
const SCENE_VAR_FIELDS = ['duration', 'location', 'shotType', 'emotion', 'dialogue', 'characters', 'props'];
const CHARACTER_FIELDS = ['name', 'description', 'appearance', 'base_appearance', 'personality', 'gender', 'tags'];
const SCRIPT_FIELDS = ['title', 'content'];

const server = new McpServer(
  { name: 'aivs-mcp', version: '1.0.0' },
  {
    instructions:
      'AI Video Studio 本地工程读写服务。先 list_projects 找工程，再 project_summary 看结构；'
      + '删除分镜/角色需 confirm=true，系统会先自动打工程快照（保留最近 10 份）。'
      + '桌面应用打开同一工程时避免同时编辑，应用后写可能覆盖外部结果（快照可回退）。',
  },
);

const json = (data) => ({ content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] });
const fail = (e) => ({ content: [{ type: 'text', text: `错误：${e?.message || e}` }], isError: true });
const wrap = (fn) => async (args) => {
  try {
    return json(await fn(args));
  } catch (e) {
    return fail(e);
  }
};

const projectPathArg = z.string().min(1).describe('工程目录绝对路径（含 project.json 的那个文件夹）');

// ── 工程 ─────────────────────────────────────────────────────────────

server.tool('list_projects', '列出本地工程（默认扫描 文档/AI-Video-Studio作品，可用 AIVS_PROJECTS_ROOT 覆盖）', {
  root: z.string().optional().describe('自定义工程根目录；缺省用 AIVS_PROJECTS_ROOT 或系统默认位置'),
}, wrap(({ root }) => ({ root: root || defaultProjectsRoot(), projects: listProjects(root || defaultProjectsRoot()) })));

server.tool('project_summary', '读取工程清单与各集合数量（剧本/分镜/角色/道具/影棚/快照）', {
  projectPath: projectPathArg,
}, wrap(({ projectPath }) => projectSummary(projectPath)));

server.tool('update_project_meta', '更新工程名称/描述（可空字符串表示清空描述）', {
  projectPath: projectPathArg,
  name: z.string().min(1).optional(),
  description: z.string().nullable().optional(),
}, wrap(({ projectPath, name, description }) => {
  const manifest = readManifest(projectPath);
  const patch = {};
  if (name !== undefined) patch.name = name;
  if (description !== undefined) patch.description = description;
  if (Object.keys(patch).length === 0) throw new Error('没有要更新的字段');
  return writeManifest(projectPath, { ...manifest, ...patch });
}));

// ── 分镜（storyboards.json）──────────────────────────────────────────

server.tool('list_scenes', '列出分镜（id/index/描述/生成状态与台词摘要），支持分页', {
  projectPath: projectPathArg,
  offset: z.number().int().min(0).optional().default(0),
  limit: z.number().int().min(1).max(200).optional().default(50),
}, wrap(({ projectPath, offset, limit }) => {
  const { items } = readCollection(projectPath, 'storyboards');
  const rows = items.slice(offset, offset + limit).map((s) => ({
    id: s.id,
    index: s.index,
    description: String(s.description || '').slice(0, 120),
    dialogue: String(s.variables?.dialogue || '').slice(0, 120),
    dialogues: Array.isArray(s.variables?.dialogues) ? s.variables.dialogues.length : 0,
    duration: s.variables?.duration ?? null,
    generated: Boolean(s.first_frame_url || s.video_url || s.variables?.video_url),
  }));
  return { total: items.length, offset, limit, scenes: rows };
}));

server.tool('read_scene', '读取单个分镜完整记录', {
  projectPath: projectPathArg,
  sceneId: z.number().int(),
}, wrap(({ projectPath, sceneId }) => {
  const { items } = readCollection(projectPath, 'storyboards');
  return findById(items, sceneId, '分镜');
}));

server.tool('create_scene', '在末尾新建分镜（description 为画面描述；duration 秒）', {
  projectPath: projectPathArg,
  description: z.string().optional().default(''),
  duration: z.number().min(1).max(600).optional().default(5),
}, wrap(({ projectPath, description, duration }) => {
  const { doc, key, items } = readCollection(projectPath, 'storyboards');
  const id = nextIdOf(doc, key);
  const scene = newScene({ id, index: items.length, description, duration });
  doc[key] = [...items, scene];
  doc.nextId = id + 1;
  writeCollection(projectPath, 'storyboards', doc);
  return { ok: true, scene };
}));

server.tool('update_scene', '更新分镜字段（description/prompt_template/时长/地点/景别/情绪/台词；删除请用 delete_scene）', {
  projectPath: projectPathArg,
  sceneId: z.number().int(),
  patch: z.object({
    description: z.string().optional(),
    prompt_template: z.string().optional(),
    duration: z.number().min(1).max(600).optional(),
    location: z.string().optional(),
    shotType: z.string().optional(),
    emotion: z.string().optional(),
    dialogue: z.string().optional(),
    characters: z.array(z.string()).optional(),
    props: z.array(z.string()).optional(),
  }),
}, wrap(({ projectPath, sceneId, patch }) => {
  const { doc, key, items } = readCollection(projectPath, 'storyboards');
  const scene = findById(items, sceneId, '分镜');
  // 顶层字段与 variables 字段分开白名单校验（合并成允许集合，未知键直接拒绝）
  const allowedAll = [...SCENE_TOP_FIELDS, ...SCENE_VAR_FIELDS];
  const top = {};
  const vars = {};
  for (const [k, v] of Object.entries(patch || {})) {
    if (!allowedAll.includes(k)) throw new Error(`不允许写入字段：${k}（允许：${allowedAll.join(', ')}）`);
    if (SCENE_TOP_FIELDS.includes(k)) top[k] = v;
    else vars[k] = v;
  }
  const next = { ...scene, ...top, variables: { ...(scene.variables || {}), ...vars } };
  doc[key] = items.map((s) => (s.id === scene.id ? next : s));
  writeCollection(projectPath, 'storyboards', doc);
  return { ok: true, scene: next };
}));

server.tool('update_scene_dialogues', '更新分镜台词（一行一个说话人：character 只放名字，line 内不得带「某某：」前缀）', {
  projectPath: projectPathArg,
  sceneId: z.number().int(),
  dialogues: z.array(z.object({ character: z.string().optional(), line: z.string().min(1) })),
}, wrap(({ projectPath, sceneId, dialogues }) => {
  const { doc, key, items } = readCollection(projectPath, 'storyboards');
  const scene = findById(items, sceneId, '分镜');
  const cleaned = cleanDialogues(dialogues);
  const next = { ...scene, variables: { ...(scene.variables || {}), dialogues: cleaned } };
  doc[key] = items.map((s) => (s.id === scene.id ? next : s));
  writeCollection(projectPath, 'storyboards', doc);
  return { ok: true, sceneId, count: cleaned.length, dialogues: cleaned };
}));

server.tool('delete_scene', '删除分镜（破坏性：必须 confirm=true；执行前自动打工程快照）', {
  projectPath: projectPathArg,
  sceneId: z.number().int(),
  confirm: z.boolean().describe('必须显式传 true 才会执行'),
}, wrap(({ projectPath, sceneId, confirm }) => {
  if (confirm !== true) throw new Error('破坏性操作：需 confirm=true 确认');
  const { doc, key, items } = readCollection(projectPath, 'storyboards');
  const scene = findById(items, sceneId, '分镜');
  const snapshot = createSnapshot(projectPath, `外部智能体：删除分镜 #${scene.index}（id=${scene.id}）`, 'agent');
  doc[key] = items.filter((s) => s.id !== scene.id);
  writeCollection(projectPath, 'storyboards', doc);
  return { ok: true, deleted: { id: scene.id, index: scene.index }, snapshot };
}));

// ── 剧本 ─────────────────────────────────────────────────────────────

server.tool('list_scripts', '列出剧本（标题 + 字数 + 内容前 80 字预览）', {
  projectPath: projectPathArg,
}, wrap(({ projectPath }) => {
  const { items } = readCollection(projectPath, 'scripts');
  return {
    scripts: items.map((s) => ({
      id: s.id,
      title: s.title,
      chars: String(s.content || '').length,
      preview: String(s.content || '').replace(/\s+/g, ' ').slice(0, 80),
      updated_at: s.updated_at || null,
    })),
  };
}));

server.tool('read_script', '读取剧本全文', {
  projectPath: projectPathArg,
  scriptId: z.number().int(),
}, wrap(({ projectPath, scriptId }) => {
  const { items } = readCollection(projectPath, 'scripts');
  return findById(items, scriptId, '剧本');
}));

server.tool('update_script', '更新剧本标题/正文（正文整段替换，请先 read_script 备份原文）', {
  projectPath: projectPathArg,
  scriptId: z.number().int(),
  title: z.string().min(1).optional(),
  content: z.string().optional(),
}, wrap(({ projectPath, scriptId, title, content }) => {
  const { doc, key, items } = readCollection(projectPath, 'scripts');
  const script = findById(items, scriptId, '剧本');
  const patch = pickFields({ title, content }, SCRIPT_FIELDS);
  if (Object.keys(patch).length === 0) throw new Error('没有要更新的字段');
  const next = { ...script, ...patch, updated_at: new Date().toISOString() };
  doc[key] = items.map((s) => (s.id === script.id ? next : s));
  writeCollection(projectPath, 'scripts', doc);
  return { ok: true, script: { id: next.id, title: next.title, chars: String(next.content || '').length } };
}));

// ── 角色 ─────────────────────────────────────────────────────────────

server.tool('list_characters', '列出角色（名称/简介/白膜与状态数量）', {
  projectPath: projectPathArg,
}, wrap(({ projectPath }) => {
  const { items } = readCollection(projectPath, 'characters');
  let stateCounts = new Map();
  try {
    const states = readCollection(projectPath, 'characterStates').items;
    for (const st of states) {
      const cid = st.character_id ?? st.characterId;
      if (cid != null) stateCounts.set(Number(cid), (stateCounts.get(Number(cid)) || 0) + 1);
    }
  } catch { /* 无状态文档 */ }
  return {
    characters: items.map((c) => ({
      id: c.id,
      name: c.name,
      description: String(c.description || '').slice(0, 120),
      states: stateCounts.get(Number(c.id)) || 0,
    })),
  };
}));

server.tool('read_character', '读取单个角色完整记录', {
  projectPath: projectPathArg,
  characterId: z.number().int(),
}, wrap(({ projectPath, characterId }) => {
  const { items } = readCollection(projectPath, 'characters');
  return findById(items, characterId, '角色');
}));

server.tool('create_character', '新建角色（只写设定，不触发生图；白膜/状态请在应用内生成）', {
  projectPath: projectPathArg,
  name: z.string().min(1),
  description: z.string().optional(),
  appearance: z.string().optional(),
  base_appearance: z.string().optional(),
  personality: z.string().optional(),
  gender: z.string().optional(),
  tags: z.array(z.string()).optional(),
}, wrap(({ projectPath, ...input }) => {
  const { doc, key, items } = readCollection(projectPath, 'characters');
  const manifest = readManifest(projectPath);
  const id = nextIdOf(doc, key);
  const now = new Date().toISOString();
  const character = {
    id,
    project_id: Number(manifest.id) || null,
    name: input.name,
    description: input.description || '',
    appearance: input.appearance || input.base_appearance || '',
    base_appearance: input.base_appearance || input.appearance || '',
    personality: input.personality || '',
    gender: input.gender || '',
    tags: input.tags || [],
    created_at: now,
    updated_at: now,
  };
  doc[key] = [...items, character];
  doc.nextId = id + 1;
  writeCollection(projectPath, 'characters', doc);
  return { ok: true, character };
}));

server.tool('update_character', '更新角色字段（白名单：名称/描述/外貌/基础外貌/性格/性别/标签）', {
  projectPath: projectPathArg,
  characterId: z.number().int(),
  patch: z.object({
    name: z.string().min(1).optional(),
    description: z.string().optional(),
    appearance: z.string().optional(),
    base_appearance: z.string().optional(),
    personality: z.string().optional(),
    gender: z.string().optional(),
    tags: z.array(z.string()).optional(),
  }),
}, wrap(({ projectPath, characterId, patch }) => {
  const { doc, key, items } = readCollection(projectPath, 'characters');
  const character = findById(items, characterId, '角色');
  const clean = pickFields(patch, CHARACTER_FIELDS);
  if (Object.keys(clean).length === 0) throw new Error('没有要更新的字段');
  const next = { ...character, ...clean, updated_at: new Date().toISOString() };
  doc[key] = items.map((c) => (c.id === character.id ? next : c));
  writeCollection(projectPath, 'characters', doc);
  return { ok: true, character: next };
}));

server.tool('delete_character', '删除角色（破坏性：必须 confirm=true；执行前自动打工程快照）', {
  projectPath: projectPathArg,
  characterId: z.number().int(),
  confirm: z.boolean(),
}, wrap(({ projectPath, characterId, confirm }) => {
  if (confirm !== true) throw new Error('破坏性操作：需 confirm=true 确认');
  const { doc, key, items } = readCollection(projectPath, 'characters');
  const character = findById(items, characterId, '角色');
  const snapshot = createSnapshot(projectPath, `外部智能体：删除角色「${character.name}」`, 'agent');
  doc[key] = items.filter((c) => c.id !== character.id);
  writeCollection(projectPath, 'characters', doc);
  return { ok: true, deleted: { id: character.id, name: character.name }, snapshot };
}));

// ── 道具 / 影棚 / 设置（只读摘要）────────────────────────────────────

server.tool('list_props', '列出道具（id/名称/简介）', {
  projectPath: projectPathArg,
}, wrap(({ projectPath }) => ({
  props: readCollection(projectPath, 'props').items.map((p) => ({
    id: p.id, name: p.name, description: String(p.description || '').slice(0, 120),
  })),
})));

server.tool('list_studios', '列出影棚/场景库（id/名称/简介）', {
  projectPath: projectPathArg,
}, wrap(({ projectPath }) => ({
  studios: readCollection(projectPath, 'studios').items.map((s) => ({
    id: s.id, name: s.name, description: String(s.description || '').slice(0, 120),
  })),
})));

server.tool('read_project_settings', '读取工程生成设置（美术风格/写手/分辨率等）', {
  projectPath: projectPathArg,
}, wrap(({ projectPath }) => readDoc(projectPath, 'settings', {})));

// ── 快照 ─────────────────────────────────────────────────────────────

server.tool('create_snapshot', '手动创建工程快照（data/+project.json，保留最近 10 份）', {
  projectPath: projectPathArg,
  label: z.string().optional(),
}, wrap(({ projectPath, label }) => ({
  ok: true,
  snapshot: createSnapshot(projectPath, label || '外部智能体：手动快照', 'manual'),
})));

server.tool('list_snapshots', '列出工程快照（应用内「设置›工程设置›快照与恢复」可见并可还原）', {
  projectPath: projectPathArg,
}, wrap(({ projectPath }) => ({ snapshots: listSnapshots(projectPath) })));

// ── 资源：工程目录列表（供支持 Resources 的客户端直接挂载） ────────────

server.resource('projects', 'aivs://projects', {
  description: '本地 AI Video Studio 工程列表（JSON）',
  mimeType: 'application/json',
}, async (uri) => ({
  contents: [{ uri: uri.href, mimeType: 'application/json', text: JSON.stringify(listProjects(), null, 2) }],
}));

const transport = new StdioServerTransport();
await server.connect(transport);
// stdout 是 MCP 协议通道：诊断信息一律走 stderr
console.error('[aivs-mcp] ready · projectsRoot=', defaultProjectsRoot());