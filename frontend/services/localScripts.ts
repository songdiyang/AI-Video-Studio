// 剧本端点的本地实现（localScripts）
//
// 桌面端无 Node 后端时，把 /api/scripts 的生成 / 分析 / 优化 / 剧本库 / 绑定 / 上传
// 接到本地：文本能力走 localAI 直连厂商模型，持久化读写工程 .jzp 的 scripts 文档
// （与 localApiRouter 的 loadScripts/saveScripts 使用同一存储与形状）。
//
// 设计：
//  - 生成默认同步执行；body.stream=true 时返回 SSE，标题 metadata 先行、正文 delta 随后。
//  - 分析/优化仍为「同步」执行（await chatText）；均不产生 workflow jobId，消费方走本地即时分支。
//  - 仅处理新增子路径；create / :id / project 仍由 localApiRouter 内联处理。

import { resolveModel, chatText, chatTextStream, type OfflineModel } from './localAI';
import { readDoc, writeDoc, resolveLocalPath, getActiveProjectPath } from './localStore';
import {
  buildWriterSystem,
  castWriter,
  detectSameTitleWork,
  type SameTitleMatch,
  type WriterCastResult,
  type WriterPreset,
} from './writerStyle';
import {
  loadProjectGenerationSettings,
  loadEffectiveWriter,
  lockWriter,
} from './projectSettings';
import { makeUniqueScriptTitle } from './uniqueName';

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

// ==================== 代笔写手（选角与注入） ====================

/**
 * 本模块自用的 JSON 调用：复用 chatText + extractJsonObject，
 * 不引入 localAssetShared（它会经 localAssetJobs → localWorkflow → localStoryboards 绕回本模块，形成运行时循环引用）。
 */
async function chatJsonLocal(model: OfflineModel, system: string, user: string): Promise<any | null> {
  const { content } = await chatText({
    model,
    temperature: 0.5,
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ],
  });
  return extractJsonObject(content || '');
}

export interface ResolvedScriptWriter {
  /** 命中的写手卡；null = 不注入人格（仅套通用护栏） */
  writer: WriterPreset | null;
  /** 生效风格文本 */
  stylePrompt: string;
  /** 选角/来源说明 */
  note: string;
  /** 本次是否执行了选角（false = 复用工程已锁定写手） */
  recast: boolean;
  candidates: WriterCastResult['candidates'];
  /** 标题/题材与写手代表作同名时的命中结果（null = 未命中），用于追加护栏与回执提示 */
  sameWork: SameTitleMatch | null;
}

/** 从 brief / 标题里挑出与生效写手对应的那条同名命中 */
function pickSameWork(brief: string, title: string, writerKey?: string | null): SameTitleMatch | null {
  const hits = detectSameTitleWork({ title, description: brief });
  return hits.find((h) => h.writerKey === writerKey) || hits[0] || null;
}

/** 把用户填的题材信息拼成给选角用的 brief */
function buildWriterBrief(body: any): string {
  const parts: string[] = [];
  if (body?.title) parts.push(`标题：${body.title}`);
  if (body?.description) parts.push(`题材/故事描述：${body.description}`);
  if (body?.style) parts.push(`用户风格要求：${body.style}`);
  if (body?.length) parts.push(`篇幅：${body.length}`);
  if (body?.storyStyle) parts.push(`工程叙事风格：${body.storyStyle}`);
  return parts.join('\n');
}

/**
 * 解析本集代笔写手。
 *  - 工程 writerKey 已有值（含显式 ''=不限定）且未 force → 直接复用，不调用模型；
 *  - 从未设置过 → 选角一次并写回工程设置，后续集复用（工程级一致）；
 *  - 无文本模型 / 模型返回非法 key → 回落本地确定性打分，绝不阻塞剧本生成。
 */
async function resolveScriptWriter(opts: {
  projectId: number | null | undefined;
  brief: string;
  model: OfflineModel | null;
  force?: boolean;
  /** 本集/工程标题，用于同名原作判定（brief 里的「标题：」行不算强信号） */
  title?: string;
}): Promise<ResolvedScriptWriter> {
  const settings = await loadProjectGenerationSettings(opts.projectId);
  const settled = settings.writerKey !== undefined;
  const eff = await loadEffectiveWriter(opts.projectId);
  if (settled && !opts.force) {
    return {
      writer: eff.writer,
      stylePrompt: eff.stylePrompt,
      note: eff.note || (eff.writer ? `沿用工程锁定写手：${eff.writer.name}` : '本工程不限定代笔写手'),
      recast: false,
      candidates: [],
      sameWork: eff.writer ? pickSameWork(opts.brief, opts.title || '', eff.writer.key) : null,
    };
  }

  const cast = await castWriter({
    brief: opts.brief,
    title: opts.title,
    chat: opts.model
      ? (system, user) => chatJsonLocal(opts.model!, system, user)
      : undefined,
  });
  const chosen = cast.chosen;
  if (!chosen) {
    return { writer: null, stylePrompt: '', note: cast.rationale, recast: true, candidates: cast.candidates, sameWork: null };
  }
  // 选角结果落库：只写工程设置，不改动任何正文
  if (opts.projectId && !eff.temp) {
    try { await lockWriter(opts.projectId, chosen.key, chosen.voice, cast.rationale); } catch { /* 落库失败不影响本次生成 */ }
  }
  return {
    writer: chosen,
    stylePrompt: chosen.voice,
    note: cast.rationale,
    recast: true,
    candidates: cast.candidates,
    sameWork: cast.sameWork ?? pickSameWork(opts.brief, opts.title || '', chosen.key),
  };
}

// ==================== 生成 ====================

/** 输出契约（人格与护栏由 buildWriterSystem 在此前后拼装，此段优先级最高） */
const SCRIPT_SYSTEM =
  '根据用户提供的题材描述、风格与篇幅要求，创作一集结构完整的中文剧本正文。' +
  '要求：1) 情节连贯、对白自然、有冲突与推进；2) 出场角色与地点名称前后一致，便于后续拆分为分镜；' +
  '3) 只输出剧本正文本身，不要输出解释、创作说明、标题编号前缀或 Markdown 代码围栏。';

function buildScriptPrompt(body: any): string {
  const parts: string[] = [];
  if (body?.title) parts.push(`剧本标题：${body.title}`);
  if (body?.description) parts.push(`题材/故事描述：${body.description}`);
  if (body?.style) parts.push(`用户附加风格要求：${body.style}`);
  if (body?.length) parts.push(`篇幅：${body.length}`);
  const ep = Number(body?.episodeNumber) || 1;
  parts.push(`集数：第${ep}集`);
  parts.push('请据此创作完整剧本正文。');
  return parts.join('\n');
}

const SCRIPT_TITLE_SYSTEM =
  '你是剧本标题策划。根据用户的故事描述拟定一个准确、有辨识度、便于剧集管理的中文剧本标题。' +
  '只输出标题本身，不要书名号、引号、解释或 Markdown；标题不超过 24 个汉字，不得剧透关键反转。';

function fallbackScriptTitle(body: any): string {
  const description = String(body?.description || '').trim();
  const summary = description.split(/[\n。！？!?]/).map(part => part.trim()).find(Boolean) || '';
  const ep = Number(body?.episodeNumber);
  return summary.slice(0, 24) || (ep > 0 ? `第${ep}集剧本` : '未命名剧本');
}

async function generateScriptTitle(body: any, model: OfflineModel): Promise<string> {
  const provided = String(body?.title || '').trim();
  if (provided) return provided.slice(0, 40);
  try {
    const { content } = await chatText({
      model,
      temperature: 0.4,
      messages: [
        { role: 'system', content: SCRIPT_TITLE_SYSTEM },
        { role: 'user', content: buildWriterBrief(body) || fallbackScriptTitle(body) },
      ],
    });
    const firstLine = String(content || '').split('\n').map(line => line.trim()).find(Boolean) || '';
    const title = firstLine
      .replace(/^(?:剧本)?标题\s*[:：]\s*/, '')
      .replace(/^[《「『"“']+|[》」』"”']+$/g, '')
      .trim()
      .slice(0, 40);
    return title || fallbackScriptTitle(body);
  } catch {
    // 标题是展示元数据，生成失败不应阻塞正文；用故事摘要兜底。
    return fallbackScriptTitle(body);
  }
}

async function handleGenerate(body: any): Promise<Response> {
  const projectId = body?.projectId ?? null;
  const path = await pathFor(projectId);
  if (!path) return jsonResponse({ message: '未打开本地工程' }, 400);
  const model: OfflineModel | null = await resolveModel(body?.provider || '');
  if (!model) return jsonResponse({ message: NO_MODEL_MSG }, 400);

  // 先定写手（未锁定则选角一次），再以其笔法执笔本集
  const writer = await resolveScriptWriter({
    projectId,
    brief: buildWriterBrief(body),
    model,
    force: Boolean(body?.recastWriter ?? body?.forceRecast),
    title: body?.title ? String(body.title) : '',
  });
  const system = buildWriterSystem({
    base: SCRIPT_SYSTEM,
    writer: writer.writer,
    stylePrompt: writer.stylePrompt,
    extra: body?.style ? String(body.style) : '',
    sameWork: writer.sameWork,
  });

  let gen: { content: string; usage?: any };
  try {
    gen = await chatText({
      model,
      messages: [
        { role: 'system', content: system },
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
  const rawTitle = (body?.title && String(body.title).trim()) || firstLine.slice(0, 40) || '未命名剧本';
  // 同工程内已有同名剧本时追加序号：标题是大纲面板与「按标题绑定」的引用键，
  // 重名会让两集内容互相错挂，所以在这里一次性消歧，并把改名回执带给调用方。
  const title = makeUniqueScriptTitle(rawTitle, doc.scripts.map((s) => s.title));
  const titleRenamed = title !== rawTitle;
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
    titleRenamed,
    content,
    // 执笔者回执：供 UI 与智能体播报「本集由谁执笔」
    writer: {
      key: writer.writer?.key ?? '',
      name: writer.writer?.name ?? '',
      rationale: writer.note,
      recast: writer.recast,
      candidates: writer.candidates,
      // 同名原作命中：供 UI 说明「只是同名，不是改编」，避免用户以为模型抄了原作
      sameWork: writer.sameWork
        ? { writer: writer.sameWork.writerName, work: writer.sameWork.work }
        : null,
    },
  });
}

/** SSE 帧与前端 generateScriptStream 对齐；生成在后台执行，响应立即建立。 */
function makeScriptSseResponse(
  generate: (emit: (payload: unknown) => void) => Promise<void>,
): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let closed = false;
      const emit = (payload: unknown) => {
        if (!closed) controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`));
      };
      const close = () => {
        if (closed) return;
        closed = true;
        controller.close();
      };
      void generate(emit)
        .catch((error: any) => emit({ type: 'error', error: error?.message || '剧本生成失败' }))
        .finally(close);
    },
  });
  return new Response(stream, {
    headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' },
  });
}

/**
 * 流式生成：先写一份只有标题的 generating 草稿并发出 metadata，再逐段输出正文。
 * 最终只落库一次完整正文；若流中断，已生成片段以 failed 状态保留，避免静默丢稿。
 */
function handleGenerateStream(body: any): Response {
  return makeScriptSseResponse(async (emit) => {
    const projectId = body?.projectId ?? null;
    let path: string | null = null;
    let scriptId: number | undefined;
    let partial = '';
    try {
      path = await pathFor(projectId);
      if (!path) throw new Error('未打开本地工程');
      const model: OfflineModel | null = await resolveModel(body?.provider || body?.textModel || '');
      if (!model) throw new Error(NO_MODEL_MSG);

      // 标题是首个对用户可见的成果；完成后立即建稿，绝不等待正文首行。
      const rawTitle = await generateScriptTitle(body, model);
      const draftDoc = await loadScripts(path);
      const id = draftDoc.nextId++;
      scriptId = id;
      const epRaw = body?.episodeNumber;
      const ep: number | undefined = epRaw != null && epRaw !== '' ? Number(epRaw) : undefined;
      const title = makeUniqueScriptTitle(rawTitle, draftDoc.scripts.map((s) => s.title));
      const titleRenamed = title !== rawTitle;
      const createdAt = nowIso();
      const draft: LocalScript = {
        id,
        title,
        content: '',
        project_id: projectId ?? null,
        episode_number: ep,
        status: 'generating',
        model_provider: model.provider ?? null,
        token_used: 0,
        created_at: createdAt,
        updated_at: createdAt,
      };
      draftDoc.scripts.push(draft);
      saveScripts(path, draftDoc);
      emit({
        type: 'metadata',
        metadata: {
          success: true,
          ...draft,
          scriptId: id,
          projectId: projectId ?? null,
          episodeNumber: ep ?? null,
          title,
          titleRenamed,
          content: '',
        },
      });

      const generationBody = { ...body, title };
      const writer = await resolveScriptWriter({
        projectId,
        brief: buildWriterBrief(generationBody),
        model,
        force: Boolean(body?.recastWriter ?? body?.forceRecast),
        title,
      });
      const system = buildWriterSystem({
        base: SCRIPT_SYSTEM,
        writer: writer.writer,
        stylePrompt: writer.stylePrompt,
        extra: body?.style ? String(body.style) : '',
        sameWork: writer.sameWork,
      });
      const messages = [
        { role: 'system', content: system },
        { role: 'user', content: buildScriptPrompt(generationBody) },
      ];

      let usage: any = null;
      try {
        const generated = await chatTextStream({
          model,
          messages,
          onDelta: (delta) => {
            partial += delta;
            emit({ type: 'delta', delta });
          },
        });
        usage = generated.usage;
      } catch (streamError) {
        // ai_proxy 不支持流式；尚未收到任何正文时回退同步调用，避免厂商 CORS 让创作失败。
        if (partial) throw streamError;
        const generated = await chatText({ model, messages });
        partial = generated.content || '';
        usage = generated.usage;
        if (partial) emit({ type: 'delta', delta: partial });
      }

      const content = partial.trim();
      if (!content) throw new Error('模型未返回剧本内容');
      const latestDoc = await loadScripts(path);
      const target = latestDoc.scripts.find((item) => item.id === id);
      if (!target) throw new Error('剧本草稿已被移除，无法保存生成结果');
      target.content = content;
      target.status = 'completed';
      target.token_used = usage?.total_tokens || 0;
      target.updated_at = nowIso();
      saveScripts(path, latestDoc);

      emit({
        type: 'complete',
        result: {
          success: true,
          ...target,
          scriptId: id,
          projectId: projectId ?? null,
          episodeNumber: target.episode_number ?? null,
          title: target.title || title,
          titleRenamed,
          content,
          writer: {
            key: writer.writer?.key ?? '',
            name: writer.writer?.name ?? '',
            rationale: writer.note,
            recast: writer.recast,
            candidates: writer.candidates,
            sameWork: writer.sameWork
              ? { writer: writer.sameWork.writerName, work: writer.sameWork.work }
              : null,
          },
        },
      });
    } catch (error: any) {
      if (path && scriptId) {
        try {
          const failedDoc = await loadScripts(path);
          const target = failedDoc.scripts.find((item) => item.id === scriptId);
          if (target) {
            target.content = partial.trim();
            target.status = 'failed';
            target.updated_at = nowIso();
            saveScripts(path, failedDoc);
          }
        } catch {
          // 保留原始生成错误；失败状态的二次落库异常不覆盖它。
        }
      }
      emit({ type: 'error', error: error?.message || '剧本生成失败', scriptId });
    }
  });
}

// ==================== 选角（供 UI 按钮与智能体动作共用同一实现） ====================

async function handleCastWriter(body: any): Promise<Response> {
  const projectId = body?.projectId ?? null;
  const path = await pathFor(projectId);
  if (!path) return jsonResponse({ message: '未打开本地工程' }, 400);
  const model: OfflineModel | null = await resolveModel(body?.provider || body?.textModel || '');
  const brief = buildWriterBrief(body);
  if (!brief.trim()) return jsonResponse({ message: '缺少题材描述，无法评估写手适配度' }, 400);

  const writer = await resolveScriptWriter({
    projectId,
    brief,
    model,
    // force 或未锁定时都会重选；已锁定且未 force 则直接复用
    force: Boolean(body?.force),
    title: body?.title ? String(body.title) : '',
  });
  return jsonResponse({
    success: true,
    writer: {
      key: writer.writer?.key ?? '',
      name: writer.writer?.name ?? '',
      stylePrompt: writer.stylePrompt,
      rationale: writer.note,
      sameWork: writer.sameWork
        ? { writer: writer.sameWork.writerName, work: writer.sameWork.work }
        : null,
    },
    candidates: writer.candidates,
    recast: writer.recast,
    sameWork: writer.sameWork
      ? { writer: writer.sameWork.writerName, work: writer.sameWork.work }
      : null,
    message: writer.recast
      ? (writer.writer ? `已指派 ${writer.writer.name} 执笔` : '未能确定写手，已按不限定风格处理')
      : `沿用工程锁定写手：${writer.writer?.name || '不限定'}`,
  });
}

// ==================== 分析 ====================

const ANALYZE_SYSTEM =
  '你是资深剧本评估专家。请从「故事结构、人物塑造、对白质量、节奏张力、主题表达、去 AI 味、风格一致性」等维度分析给定剧本。' +
  '其中「去 AI 味」按以下硬标准打分：出现「仿佛/宛如/不禁/缓缓地/深深地/值得一提」等模型腔词、段末升华总结、' +
  '三段排比收束、旁白替角色说心理，每一项都要扣分并在 comment 里举出原文例证；' +
  '「风格一致性」判断全文笔法是否统一于指定写手（无指定时判断是否有稳定个人笔法）。' +
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

  // 有锁定写手时，「风格一致性」就有了具体对标对象
  const eff = await loadEffectiveWriter(body?.projectId ?? null);
  const writerHint = eff.writer
    ? `本工程指定写手：${eff.writer.name}（笔法：${eff.stylePrompt.slice(0, 120)}……）\n\n`
    : '';

  const { content: raw } = await chatText({
    model,
    messages: [
      { role: 'system', content: ANALYZE_SYSTEM },
      { role: 'user', content: `${writerHint}请分析以下剧本：\n\n${content}` },
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
  '根据用户的优化指令对给定剧本进行改写，保留原有故事骨架与人物关系，显著提升质量。' +
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

  // 润色沿用同一写手笔法：只读工程锁定值，不在这里改动选角
  const eff = await loadEffectiveWriter(body?.projectId ?? null);
  // 润色同样要拦住"顺手把原作剧情补回来"：原稿标题/正文点名了原作就追加提醒
  const optimizeTitle = String(body?.title || '').trim();
  const sameWork = eff.writer
    ? pickSameWork(`${optimizeTitle}\n${instruction}\n${original.slice(0, 600)}`, optimizeTitle, eff.writer.key)
    : null;
  const system = buildWriterSystem({
    base: OPTIMIZE_SYSTEM,
    writer: eff.writer,
    stylePrompt: eff.stylePrompt,
    extra: eff.writer
      ? `本次修订由 ${eff.writer.name} 本人按其原有笔法重写，只优化文字与戏，不得改动故事骨架、人物关系与场景顺序。`
      : '',
    sameWork,
  });

  const { content: raw, usage } = await chatText({
    model,
    messages: [
      { role: 'system', content: system },
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
      // 另存为新剧本：与同工程既有标题消歧（overwrite 分支改的是同一条记录，不动标题）
      title = makeUniqueScriptTitle(title, doc.scripts.map((s) => s.title));
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
    // 参考引用的标题同样消歧：绑定关系统一走 source_script_id，改名不影响回溯，
    // 但能让目标工程大纲面板里两本同名剧本一眼分得开。
    title: makeUniqueScriptTitle(
      body?.titleOverride || source.script.title || '参考剧本',
      doc.scripts.map((s) => s.title),
    ),
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
  // 重复导入同一份稿件是常见操作：标题与同工程既有剧本消歧，避免大纲面板出现两本同名
  const uniqueTitle = makeUniqueScriptTitle(title, doc.scripts.map((s) => s.title));
  const script: LocalScript = {
    id,
    title: uniqueTitle,
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
    title: script.title,
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
    if (pathname === '/api/scripts/generate') {
      return body?.stream === true ? handleGenerateStream(body) : handleGenerate(body);
    }
    if (pathname === '/api/scripts/cast-writer') return handleCastWriter(body);
    if (pathname === '/api/scripts/analyze') return handleAnalyze(body);
    if (pathname === '/api/scripts/optimize') return handleOptimize(body);
    if (pathname === '/api/scripts/bind') return handleBind(body);
    if (pathname === '/api/scripts/upload') return handleUpload(body);
  }
  if (m === 'GET' && pathname === '/api/scripts/library') return handleLibrary(url.searchParams.get('projectId'));

  return null;
}
