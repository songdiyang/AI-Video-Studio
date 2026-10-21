// 剧本端点的本地实现（localScripts）
//
// 桌面端无 Node 后端时，把 /api/scripts 的生成 / 分析 / 优化 / 剧本库 / 绑定 / 上传
// 接到本地：文本能力走 localAI 直连厂商模型，持久化读写工程 .jzp 的 scripts 文档
// （与 localApiRouter 的 loadScripts/saveScripts 使用同一存储与形状）。
//
// 设计：
//  - 生成/分析/优化为「同步」执行（await chatText），完成后直接返回结果，不产生 workflow jobId，
//    消费方（AIAssistantPanel）在无 jobId 时走本地即时分支。
//  - 仅处理新增子路径；create / :id / project 仍由 localApiRouter 内联处理。

import { resolveModel, chatText, type OfflineModel } from './localAI';
import { readDoc, writeDoc, resolveLocalPath, getActiveProjectPath } from './localStore';

const NO_MODEL_MSG = '请先在「设置 › 模型」中配置可用的文本模型';

// ==================== 本地剧本文档（对齐 localApiRouter 的 ScriptsDoc / LocalScript） ====================

interface LocalScript {
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

interface ScriptsDoc {
  nextId: number;
  scripts: LocalScript[];
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
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

async function loadScripts(path: string): Promise<ScriptsDoc> {
  const doc = await readDoc<Partial<ScriptsDoc>>(path, 'scripts', {});
  return { nextId: doc.nextId || 1, scripts: Array.isArray(doc.scripts) ? doc.scripts : [] };
}

function saveScripts(path: string, doc: ScriptsDoc): void {
  writeDoc(path, 'scripts', doc);
}

function nowIso(): string {
  return new Date().toISOString();
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

/** 在若干候选工程路径中按 id 查找剧本（用于 analyze/optimize 仅带 scriptId 的场景） */
async function findScriptById(scriptId: number, projectId?: number | null): Promise<{ path: string; script: LocalScript } | null> {
  const path = await pathFor(projectId);
  if (!path) return null;
  const doc = await loadScripts(path);
  const script = doc.scripts.find((s) => s.id === scriptId);
  return script ? { path, script } : null;
}

/**
 * 对参考引用项从源工程解析正文。
 * 非引用项或已有正文的项直接保留；无源可解时保留空正文（不报错）。
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function resolveScriptReferences<T extends Record<string, any>>(scripts: T[]): Promise<T[]> {
  const out: T[] = [];
  for (const s of scripts) {
    if (s.is_reference && !s.content && s.source_script_id) {
      const src = await findScriptById(Number(s.source_script_id), s.source_project_id ?? null);
      out.push({ ...s, content: src?.script.content || '' } as T);
    } else {
      out.push(s);
    }
  }
  return out;
}

// ==================== 生成 ====================

const SCRIPT_SYSTEM =
  '你是专业的短剧/影视编剧助手。根据用户提供的题材描述、风格与篇幅要求，创作一集结构完整的中文剧本正文。' +
  '要求：1) 使用规范的剧本格式（场景标题、人物动作描写、角色对白）；2) 情节连贯、对白自然、有冲突与推进；' +
  '3) 只输出剧本正文本身，不要输出解释、标题编号前缀或 Markdown 代码围栏。';

function buildScriptPrompt(body: any): string {
  const parts: string[] = [];
  if (body?.title) parts.push(`剧本标题：${body.title}`);
  if (body?.description) parts.push(`题材/故事描述：${body.description}`);
  if (body?.style) parts.push(`风格：${body.style}`);
  if (body?.length) parts.push(`篇幅：${body.length}`);
  const ep = Number(body?.episodeNumber) || 1;
  parts.push(`集数：第${ep}集`);
  parts.push('请据此创作完整剧本正文。');
  return parts.join('\n');
}

async function handleGenerate(body: any): Promise<Response> {
  const projectId = body?.projectId ?? null;
  const path = await pathFor(projectId);
  if (!path) return jsonResponse({ message: '未打开本地工程' }, 400);
  const model: OfflineModel | null = await resolveModel(body?.provider || '');
  if (!model) return jsonResponse({ message: NO_MODEL_MSG }, 400);

  let gen: { content: string; usage?: any };
  try {
    gen = await chatText({
      model,
      messages: [
        { role: 'system', content: SCRIPT_SYSTEM },
        { role: 'user', content: buildScriptPrompt(body) },
      ],
    });
  } catch (err: any) {
    return jsonResponse({ message: err?.message || '剧本生成失败' }, 500);
  }
  const content = (gen.content || '').trim();
  if (!content) return jsonResponse({ message: '模型未返回剧本内容' }, 500);

  const doc = await loadScripts(path);
  const id = doc.nextId++;
  // 集数不再强制绑定：仅当显式传入才写入；否则不默认到 1，作为可选参考标签。
  const epRaw = body?.episodeNumber;
  const ep: number | undefined = epRaw != null && epRaw !== '' ? Number(epRaw) : undefined;
  const firstLine = (content.split('\n')[0] || '').trim();
  const title = (body?.title && String(body.title).trim()) || firstLine.slice(0, 40) || '未命名剧本';
  const script: LocalScript = {
    id,
    title,
    content,
    project_id: projectId ?? null,
    episode_number: ep,
    status: 'completed',
    model_provider: model.provider ?? null,
    token_used: gen.usage?.total_tokens || 0,
    created_at: nowIso(),
    updated_at: nowIso(),
  };
  doc.scripts.push(script);
  saveScripts(path, doc);

  // 同步返回完整剧本（无 jobId，消费方走本地即时分支）
  return jsonResponse({
    success: true,
    ...script,
    scriptId: id,
    projectId: projectId ?? null,
    episodeNumber: ep ?? null,
    title,
    content,
  });
}

// ==================== 分析 ====================

const ANALYZE_SYSTEM =
  '你是资深剧本评估专家。请从「故事结构、人物塑造、对白质量、节奏张力、主题表达」等维度分析给定剧本，' +
  '并严格只输出一个 JSON 对象（不要代码围栏、不要多余文字），字段：' +
  '{"overallScore":0-100整数,"dimensions":[{"name":string,"score":0-100整数,"comment":string}],' +
  '"strengths":[string],"weaknesses":[string],"suggestions":[string],"summary":string}。全部使用中文。';

async function handleAnalyze(body: any): Promise<Response> {
  let content = typeof body?.content === 'string' ? body.content.trim() : '';
  let scriptId: number | undefined = body?.scriptId != null ? Number(body.scriptId) : undefined;
  if (!content && scriptId != null) {
    const found = await findScriptById(scriptId, body?.projectId);
    content = found?.script.content || '';
  }
  if (!content) return jsonResponse({ message: '缺少剧本内容' }, 400);

  const model = await resolveModel(body?.textModel || '');
  if (!model) return jsonResponse({ message: NO_MODEL_MSG }, 400);

  const { content: raw } = await chatText({
    model,
    messages: [
      { role: 'system', content: ANALYZE_SYSTEM },
      { role: 'user', content: `请分析以下剧本：\n\n${content}` },
    ],
  });
  const parsed = extractJsonObject(raw) || {};
  const analysis = {
    overallScore: Number(parsed.overallScore) || 0,
    dimensions: Array.isArray(parsed.dimensions) ? parsed.dimensions : [],
    strengths: Array.isArray(parsed.strengths) ? parsed.strengths : [],
    weaknesses: Array.isArray(parsed.weaknesses) ? parsed.weaknesses : [],
    suggestions: Array.isArray(parsed.suggestions) ? parsed.suggestions : [],
    summary: typeof parsed.summary === 'string' ? parsed.summary : (raw || '').trim(),
  };
  return jsonResponse({ success: true, scriptId, analysis, contentLength: content.length, message: 'analyzed' });
}

// ==================== 优化 ====================

const OPTIMIZE_SYSTEM =
  '你是剧本润色与改写专家。根据用户的优化指令对给定剧本进行改写，保留原有故事骨架与人物关系，显著提升质量。' +
  '严格只输出一个 JSON 对象（不要代码围栏、不要多余文字）：{"optimizedContent":string,"changes":[string]}。中文。';

async function handleOptimize(body: any): Promise<Response> {
  let original = typeof body?.content === 'string' ? body.content.trim() : '';
  const originalScriptId = body?.scriptId != null ? Number(body.scriptId) : undefined;
  if (!original && originalScriptId != null) {
    const found = await findScriptById(originalScriptId, body?.projectId);
    original = found?.script.content || '';
  }
  const instruction = typeof body?.instruction === 'string' ? body.instruction.trim() : '';
  if (!original) return jsonResponse({ message: '缺少剧本内容' }, 400);
  if (!instruction) return jsonResponse({ message: '缺少优化指令' }, 400);

  const model = await resolveModel(body?.textModel || '');
  if (!model) return jsonResponse({ message: NO_MODEL_MSG }, 400);

  const { content: raw, usage } = await chatText({
    model,
    messages: [
      { role: 'system', content: OPTIMIZE_SYSTEM },
      { role: 'user', content: `优化指令：\n${instruction}\n\n原剧本：\n${original}` },
    ],
  });
  const parsed = extractJsonObject(raw) || {};
  const optimizedContent = (typeof parsed.optimizedContent === 'string' ? parsed.optimizedContent : (raw || '')).trim();
  const changes = Array.isArray(parsed.changes) ? parsed.changes : [];
  if (!optimizedContent) return jsonResponse({ message: '优化失败，模型未返回内容' }, 500);

  // 依 saveMode 落库：new=另存为新剧本；overwrite=覆盖原剧本
  let savedScriptId: number | undefined;
  let projectId = body?.projectId ?? null;
  let episodeNumber = 1;
  let title = (original.match(/[^\s，。！？]+/) || ['优化剧本'])[0].slice(0, 24) || '优化剧本';
  const saveMode = body?.saveMode === 'overwrite' ? 'overwrite' : 'new';
  const path = await pathFor(projectId);
  if (path) {
    const doc = await loadScripts(path);
    if (saveMode === 'overwrite' && originalScriptId != null) {
      const target = doc.scripts.find((s) => s.id === originalScriptId);
      if (target) {
        target.content = optimizedContent;
        target.updated_at = nowIso();
        savedScriptId = target.id;
        episodeNumber = target.episode_number || 1;
        title = target.title || title;
      }
    } else {
      const id = doc.nextId++;
      const now = nowIso();
      const script: LocalScript = {
        id,
        title,
        content: optimizedContent,
        project_id: projectId ?? null,
        episode_number: Number(body?.episodeNumber) || 1,
        status: 'completed',
        model_provider: model.provider ?? null,
        token_used: usage?.total_tokens || 0,
        created_at: now,
        updated_at: now,
      };
      doc.scripts.push(script);
      savedScriptId = id;
      episodeNumber = script.episode_number || 1;
    }
    saveScripts(path, doc);
  }

  return jsonResponse({
    success: true,
    originalScriptId,
    savedScriptId,
    projectId: projectId ?? null,
    episodeNumber,
    title,
    originalContent: original,
    optimizedContent,
    changes,
    tokensUsed: usage?.total_tokens || 0,
    model: model.model_name,
    instruction,
    saveMode,
    message: 'optimized',
  });
}

// ==================== 剧本库 ====================

async function handleLibrary(projectId?: number | string | null): Promise<Response> {
  const path = await pathFor(projectId);
  if (!path) return jsonResponse([]);
  const doc = await loadScripts(path);
  const items = doc.scripts.map((s) => ({
    ...s,
    project_id: s.project_id ?? null,
    source_script_id: (s as any).source_script_id ?? null,
    episode_number: s.episode_number || 1,
    status: s.status || 'completed',
    updated_at: s.updated_at || s.created_at,
  }));
  return jsonResponse(items);
}

// ==================== 绑定（仅写入参考引用，不深拷贝正文） ====================
// 剧本与剧情/工程之间不是必要的从属关系：绑定不产生强制副本，
// 只在目标工程写入一条“参考引用”（source_script_id + 源工程），正文按需从源解析。
async function handleBind(body: any): Promise<Response> {
  const sourceScriptId = Number(body?.sourceScriptId);
  const targetProjectId = Number(body?.targetProjectId);
  if (!sourceScriptId || !targetProjectId) return jsonResponse({ message: '缺少 sourceScriptId 或 targetProjectId' }, 400);

  const source = await findScriptById(sourceScriptId, body?.sourceProjectId ?? null);
  const targetPath = await pathFor(targetProjectId);
  if (!source || !targetPath) return jsonResponse({ message: '源剧本或目标工程不可用' }, 400);

  const doc = await loadScripts(targetPath);
  // 幂等：目标工程已存在对同一源剧本的引用则不重复写入
  const existing = doc.scripts.find((s) => (s as any).source_script_id === sourceScriptId);
  if (existing) {
    return jsonResponse({
      success: true,
      scriptId: existing.id,
      projectId: targetProjectId,
      episodeNumber: existing.episode_number ?? null,
      sourceScriptId,
      message: 'already bound',
    });
  }

  const id = doc.nextId++;
  const now = nowIso();
  // 集数不再强制默认为 1：仅当显式传入才绑定，否则沿用源剧本、可为空。
  const ep =
    body?.episodeNumber != null && body.episodeNumber !== ''
      ? Number(body.episodeNumber)
      : (source.script.episode_number ?? undefined);
  const ref: LocalScript = {
    id,
    title: body?.titleOverride || source.script.title || '参考剧本',
    content: '', // 不深拷贝正文，仅作参考引用
    project_id: targetProjectId,
    episode_number: ep,
    status: 'completed',
    model_provider: source.script.model_provider ?? null,
    token_used: 0,
    created_at: now,
    updated_at: now,
  };
  (ref as any).source_script_id = sourceScriptId;
  (ref as any).source_project_id = body?.sourceProjectId ?? source.script.project_id ?? null;
  (ref as any).is_reference = true;
  doc.scripts.push(ref);
  saveScripts(targetPath, doc);

  return jsonResponse({
    success: true,
    scriptId: id,
    projectId: targetProjectId,
    episodeNumber: ep ?? null,
    sourceScriptId,
    message: 'bound',
  });
}

// ==================== 上传（文本内容入库，可选分析） ====================

async function handleUpload(body: any): Promise<Response> {
  const projectId = body?.projectId != null && body.projectId !== '' ? Number(body.projectId) : null;
  const path = await pathFor(projectId);
  if (!path) return jsonResponse({ message: '未打开本地工程' }, 400);
  const content = typeof body?.content === 'string' ? body.content.trim() : '';
  if (!content) return jsonResponse({ message: '上传内容为空' }, 400);
  const mode = body?.mode === 'analyze' ? 'analyze' : 'save';
  const ep = Number(body?.episodeNumber) || 1;
  const title = (body?.title && String(body.title).trim()) || content.split('\n')[0].slice(0, 40) || '导入剧本';

  const doc = await loadScripts(path);
  const id = doc.nextId++;
  const now = nowIso();
  const script: LocalScript = {
    id,
    title,
    content,
    project_id: projectId,
    episode_number: ep,
    status: 'completed',
    created_at: now,
    updated_at: now,
  };
  doc.scripts.push(script);
  saveScripts(path, doc);

  let analysis;
  if (mode === 'analyze') {
    const resp = await handleAnalyze({ content, scriptId: id, projectId, textModel: body?.textModel });
    const data = await resp.json().catch(() => ({}));
    analysis = data?.analysis;
  }

  return jsonResponse({
    success: true,
    scriptId: id,
    projectId,
    episodeNumber: ep,
    title,
    content,
    mode,
    analysis,
    message: 'uploaded',
  });
}

// ==================== 路由入口 ====================

/** 匹配剧本生成/分析/优化/库/绑定/上传端点；未匹配返回 null。 */
export async function routeScripts(url: URL, method: string, body: any): Promise<Response | null> {
  const pathname = url.pathname;
  const m = method.toUpperCase();

  if (m === 'POST') {
    if (pathname === '/api/scripts/generate') return handleGenerate(body);
    if (pathname === '/api/scripts/analyze') return handleAnalyze(body);
    if (pathname === '/api/scripts/optimize') return handleOptimize(body);
    if (pathname === '/api/scripts/bind') return handleBind(body);
    if (pathname === '/api/scripts/upload') return handleUpload(body);
  }
  if (m === 'GET' && pathname === '/api/scripts/library') return handleLibrary(url.searchParams.get('projectId'));

  return null;
}
