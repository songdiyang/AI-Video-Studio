// 小说工作台本地路由（/api/novels/*）
//
// 契约与已删除的原后端 novelRoutes 保持一致：
//   GET    /api/novels/:projectId            → { ...project, stats:{total_chapters,total_words} }
//   PUT    /api/novels/:projectId            → project
//   POST   /api/novels/:projectId/worldview/generate → { world_view }（同步）
//   GET/POST /api/novels/:projectId/characters[/:id] → { characters } / character 裸对象
//   GET/POST /api/novels/:projectId/scenes[/:id]     → { scenes } / scene 裸对象
//   POST   /api/novels/:projectId/chapters/:chapterId/generate → { message, taskId, status }
//   GET    /api/novels/:projectId/chapters/:chapterId/generations → { generations }
//   GET    /api/novels/:projectId/context     → { project, characters, scenes, chapters }
//
// 所有数据统一落在工程目录的 novels.json 文档中：
//   { project, characters, scenes, chapters, outlines, nextCharacterId, nextSceneId, nextChapterId, nextOutlineId }

import { readDoc, writeDoc, resolveLocalPath, getActiveProjectPath } from './localStore';
import { jsonResponse, pickTextModel, chatJson } from './localAssetShared';
import { chatText } from './localAI';

// ==================== 类型 ====================

export interface NovelProject {
  id: number;
  project_id: number;
  world_view?: string | null;
  plot_summary?: string | null;
  genre?: string | null;
  target_word_count?: number | null;
  created_at: string;
  updated_at: string;
  [k: string]: any;
}

export interface NovelDoc {
  project?: NovelProject;
  characters: any[];
  scenes: any[];
  chapters: any[];
  outlines: any[];
  nextCharacterId: number;
  nextSceneId: number;
  nextChapterId: number;
  nextOutlineId: number;
}

const NOVEL_EMPTY: NovelDoc = {
  characters: [], scenes: [], chapters: [], outlines: [],
  nextCharacterId: 1, nextSceneId: 1, nextChapterId: 1, nextOutlineId: 1,
};

// ==================== 文档读写 ====================

async function resolvePath(projectId?: number | string | null): Promise<string | null> {
  if (projectId !== undefined && projectId !== null && projectId !== '') {
    const id = Number(projectId);
    if (Number.isFinite(id)) {
      const p = await resolveLocalPath(id);
      if (p) return p;
    }
  }
  return getActiveProjectPath();
}

export async function loadNovelDoc(path: string): Promise<NovelDoc> {
  const raw = await readDoc<Partial<NovelDoc>>(path, 'novels', NOVEL_EMPTY);
  const characters = Array.isArray(raw.characters) ? raw.characters : [];
  const scenes = Array.isArray(raw.scenes) ? raw.scenes : [];
  const chapters = Array.isArray(raw.chapters) ? raw.chapters : [];
  const outlines = Array.isArray(raw.outlines) ? raw.outlines : [];
  const maxId = (arr: any[]) => arr.reduce((m, it) => Math.max(m, Number((it as any)?.id) || 0), 0);
  return {
    project: raw.project,
    characters, scenes, chapters, outlines,
    nextCharacterId: Math.max(Number(raw.nextCharacterId) || 1, maxId(characters) + 1),
    nextSceneId: Math.max(Number(raw.nextSceneId) || 1, maxId(scenes) + 1),
    nextChapterId: Math.max(Number(raw.nextChapterId) || 1, maxId(chapters) + 1),
    nextOutlineId: Math.max(Number(raw.nextOutlineId) || 1, maxId(outlines) + 1),
  };
}

export function saveNovelDoc(path: string, doc: NovelDoc): void {
  writeDoc(path, 'novels', doc);
}

export function getOrCreateNovelProject(doc: NovelDoc, projectId: number): NovelProject {
  if (!doc.project) {
    const now = new Date().toISOString();
    doc.project = {
      id: projectId,
      project_id: projectId,
      world_view: null,
      plot_summary: null,
      genre: null,
      target_word_count: 100000,
      created_at: now,
      updated_at: now,
    };
  }
  return doc.project;
}

export function computeNovelStats(doc: NovelDoc): { total_chapters: number; total_words: number } {
  let totalWords = 0;
  for (const c of doc.chapters) {
    if (c?.word_count) totalWords += Number(c.word_count) || 0;
    else if (typeof c?.content === 'string') totalWords += c.content.replace(/\s/g, '').length;
  }
  return { total_chapters: doc.chapters.length, total_words: totalWords };
}

// ==================== 内部：子资源处理器 ====================

const ROLE_ORDER: Record<string, number> = { protagonist: 0, supporting: 1, antagonist: 2, minor: 3 };
function byRoleType(a: any, b: any): number {
  const ra = ROLE_ORDER[a?.role_type] ?? 9;
  const rb = ROLE_ORDER[b?.role_type] ?? 9;
  if (ra !== rb) return ra - rb;
  return String(a?.created_at || '').localeCompare(String(b?.created_at || ''));
}
const IMPORTANCE_ORDER: Record<string, number> = { key: 0, normal: 1, minor: 2 };
function byImportance(a: any, b: any): number {
  const ra = IMPORTANCE_ORDER[a?.importance] ?? 9;
  const rb = IMPORTANCE_ORDER[b?.importance] ?? 9;
  if (ra !== rb) return ra - rb;
  return String(a?.created_at || '').localeCompare(String(b?.created_at || ''));
}

async function handleWorldviewGenerate(path: string, projectId: number, body: any): Promise<Response> {
  const doc = await loadNovelDoc(path);
  const project = getOrCreateNovelProject(doc, projectId);
  const model = await pickTextModel(body?.modelName);
  if (!model) return jsonResponse({ message: '没有可用的文本模型' }, 500);
  const description = body?.description || project.plot_summary || '暂无描述';
  const prompt = `你是一位专业的小说世界观设计师。请为以下小说设计一个详细的世界观。\n\n小说描述：${description}\n\n请从以下几个方面设计世界观：\n1. 时代背景（古代/现代/未来/架空等）\n2. 地理环境（主要地域、气候特点）\n3. 社会结构（政治体制、社会阶层）\n4. 文化习俗（语言、宗教、节日）\n5. 特殊设定（魔法系统、科技水平、超自然现象等）\n6. 主要势力或组织\n\n请以结构化的方式输出，字数控制在 800-1200 字。`;
  let content = '';
  try {
    const resp = await chatText({ model, temperature: 0.7, messages: [{ role: 'user', content: prompt }] });
    content = resp.content || '';
  } catch (err: any) {
    return jsonResponse({ message: '生成世界观失败: ' + (err?.message || err) }, 500);
  }
  doc.project!.world_view = content;
  doc.project!.updated_at = new Date().toISOString();
  saveNovelDoc(path, doc);
  return jsonResponse({ world_view: content });
}

async function handleNovelCharacters(path: string, projectId: number, rest: string, m: string, body: any): Promise<Response | null> {
  const doc = await loadNovelDoc(path);
  if (!rest) {
    if (m === 'GET') return jsonResponse({ characters: doc.characters.slice().sort(byRoleType) });
    if (m === 'POST') {
      const name = String(body?.name || '').trim();
      if (!name) return jsonResponse({ message: '人物姓名不能为空' }, 400);
      const now = new Date().toISOString();
      const c = {
        id: doc.nextCharacterId++,
        project_id: projectId,
        name,
        gender: body?.gender ?? 'unknown',
        age: body?.age ?? null,
        personality: body?.personality ?? null,
        weight: body?.weight ?? null,
        appearance_face: body?.appearance_face ?? null,
        height: body?.height ?? null,
        outfit: body?.outfit ?? {},
        accessories: body?.accessories ?? {},
        background_story: body?.background_story ?? null,
        role_type: body?.role_type ?? 'supporting',
        created_at: now,
        updated_at: now,
      };
      doc.characters.push(c);
      saveNovelDoc(path, doc);
      return jsonResponse(c, 201);
    }
    return jsonResponse({ message: 'method not allowed' }, 405);
  }
  const idMatch = rest.match(/^\/(\d+)$/);
  if (!idMatch) return null;
  const cid = Number(idMatch[1]);
  const idx = doc.characters.findIndex((x: any) => Number(x.id) === cid);
  if (m === 'GET') {
    if (idx === -1) return jsonResponse({ message: '人物不存在' }, 404);
    return jsonResponse(doc.characters[idx]);
  }
  if (m === 'PUT') {
    if (idx === -1) return jsonResponse({ message: '人物不存在' }, 404);
    const prev = doc.characters[idx];
    const merged = {
      ...prev,
      ...body,
      id: cid,
      project_id: projectId,
      outfit: body?.outfit ?? prev.outfit ?? {},
      accessories: body?.accessories ?? prev.accessories ?? {},
      updated_at: new Date().toISOString(),
    };
    doc.characters[idx] = merged;
    saveNovelDoc(path, doc);
    return jsonResponse(merged);
  }
  if (m === 'DELETE') {
    if (idx !== -1) doc.characters.splice(idx, 1);
    saveNovelDoc(path, doc);
    return jsonResponse({ message: '删除成功' });
  }
  return jsonResponse({ message: 'method not allowed' }, 405);
}

async function handleNovelScenes(path: string, projectId: number, rest: string, m: string, body: any): Promise<Response | null> {
  const doc = await loadNovelDoc(path);
  if (!rest) {
    if (m === 'GET') return jsonResponse({ scenes: doc.scenes.slice().sort(byImportance) });
    if (m === 'POST') {
      const name = String(body?.name || '').trim();
      if (!name) return jsonResponse({ message: '场景名称不能为空' }, 400);
      const now = new Date().toISOString();
      const s = {
        id: doc.nextSceneId++,
        project_id: projectId,
        name,
        location: body?.location ?? null,
        space_description: body?.space_description ?? null,
        close_up_details: body?.close_up_details ?? [],
        history: body?.history ?? null,
        status: body?.status ?? null,
        importance: body?.importance ?? 'normal',
        created_at: now,
        updated_at: now,
      };
      doc.scenes.push(s);
      saveNovelDoc(path, doc);
      return jsonResponse(s, 201);
    }
    return jsonResponse({ message: 'method not allowed' }, 405);
  }
  const idMatch = rest.match(/^\/(\d+)$/);
  if (!idMatch) return null;
  const sid = Number(idMatch[1]);
  const idx = doc.scenes.findIndex((x: any) => Number(x.id) === sid);
  if (m === 'GET') {
    if (idx === -1) return jsonResponse({ message: '场景不存在' }, 404);
    return jsonResponse(doc.scenes[idx]);
  }
  if (m === 'PUT') {
    if (idx === -1) return jsonResponse({ message: '场景不存在' }, 404);
    const prev = doc.scenes[idx];
    const merged = {
      ...prev,
      ...body,
      id: sid,
      project_id: projectId,
      close_up_details: body?.close_up_details ?? prev.close_up_details ?? [],
      updated_at: new Date().toISOString(),
    };
    doc.scenes[idx] = merged;
    saveNovelDoc(path, doc);
    return jsonResponse(merged);
  }
  if (m === 'DELETE') {
    if (idx !== -1) doc.scenes.splice(idx, 1);
    saveNovelDoc(path, doc);
    return jsonResponse({ message: '删除成功' });
  }
  return jsonResponse({ message: 'method not allowed' }, 405);
}

async function handleNovelChaptersAux(path: string, projectId: number, rest: string, m: string): Promise<Response | null> {
  const doc = await loadNovelDoc(path);
  // /chapters/:chapterId/generate | /chapters/:chapterId/generations
  const gen = rest.match(/^\/(\d+)\/generate$/);
  if (gen && m === 'POST') {
    const chapterId = Number(gen[1]);
    const chapter = doc.chapters.find((c: any) => Number(c.id) === chapterId);
    if (!chapter) return jsonResponse({ message: '章节不存在' }, 404);
    // 与 backend 契约形状一致：返回一个可轮询的 jobId（本地以合成 ag_ 完成态回放）
    const taskId = `novel_ch_${chapterId}_${Date.now()}`;
    return jsonResponse({ message: '章节生成任务已创建', taskId, status: 'pending' });
  }
  const gens = rest.match(/^\/(\d+)\/generations$/);
  if (gens && m === 'GET') {
    return jsonResponse({ generations: [] });
  }
  return null;
}

// ==================== 路由入口 ====================

export async function routeNovels(url: URL, method: string, body: any): Promise<Response | null> {
  const pathname = url.pathname;
  const m = method.toUpperCase();
  const mt = pathname.match(/^\/api\/novels\/(\d+)(\/.*)?$/);
  if (!mt) return null;
  const projectId = Number(mt[1]);
  const sub = mt[2] || '';
  const path = await resolvePath(projectId);
  if (!path) return jsonResponse({ message: '未打开本地工程' }, 400);

  if (!sub) {
    if (m === 'GET') {
      const doc = await loadNovelDoc(path);
      const project = getOrCreateNovelProject(doc, projectId);
      saveNovelDoc(path, doc);
      return jsonResponse({ ...project, stats: computeNovelStats(doc) });
    }
    if (m === 'PUT') {
      const doc = await loadNovelDoc(path);
      const project = getOrCreateNovelProject(doc, projectId);
      const fields = ['world_view', 'plot_summary', 'genre', 'target_word_count'];
      for (const f of fields) if (body && body[f] !== undefined) (project as any)[f] = body[f];
      project.updated_at = new Date().toISOString();
      saveNovelDoc(path, doc);
      return jsonResponse(project);
    }
    return jsonResponse({ message: 'method not allowed' }, 405);
  }

  if (sub === '/worldview/generate' && m === 'POST') return handleWorldviewGenerate(path, projectId, body);
  if (sub === '/context' && m === 'GET') {
    const doc = await loadNovelDoc(path);
    return jsonResponse({
      project: getOrCreateNovelProject(doc, projectId),
      characters: doc.characters,
      scenes: doc.scenes,
      chapters: doc.chapters.map((c: any) => ({
        id: c.id,
        chapterNumber: c.chapter_number,
        title: c.title,
        summary: c.summary,
      })),
    });
  }
  if (sub.startsWith('/characters')) return handleNovelCharacters(path, projectId, sub.slice('/characters'.length), m, body);
  if (sub.startsWith('/scenes')) return handleNovelScenes(path, projectId, sub.slice('/scenes'.length), m, body);
  if (sub.startsWith('/chapters')) return handleNovelChaptersAux(path, projectId, sub.slice('/chapters'.length), m);
  return null;
}

// 供 localProjectsSub 复用（novel chapters/outlines 也走同一份 doc）
export { chatJson };
