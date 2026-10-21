// 场景域本地路由（localScenes）
//
// 接管 /api/scenes 与 /api/scene-elements 下 routeRest 通用 CRUD 之外的特殊子路径：
//   场景：项目绑定、元素关联（link）、图片生成、图片提示词生成、草图（sketch）、参考图、元素抽取。
//   场景元素：单元素图片生成（/api/scene-elements/:id/generate）。
//
// 通用列表 / 详情 / 单条 CRUD / /project/:id 由 localRest.routeRest 处理。

import {
  activePath,
  resolvePath,
  assertProject,
  loadRestDoc,
  saveRestDoc,
  findById,
  jsonResponse,
  normalizeKeys,
  pickTextModel,
  chatJson,
  genImageToUrl,
  submitGenJob,
} from './localAssetShared';
import { persistGeneratedMedia } from './localMedia';

// ==================== 元素关联 ====================
async function handleSceneElementsGet(sceneId: number): Promise<Response> {
  const path = activePath();
  if (!path) return jsonResponse({ elements: [] });
  const sdoc = await loadRestDoc(path, 'scenes');
  const scene = findById(sdoc.items, sceneId);
  if (!scene) return jsonResponse({ elements: [] });
  const edoc = await loadRestDoc(path, 'sceneElements');
  const links = Array.isArray(scene.element_links) ? scene.element_links : [];
  const elements = links.map((link: any, i: number) => {
    const el = findById(edoc.items, link.element_id) || {};
    return {
      link_id: link.link_id ?? i + 1,
      position_hint: link.position_hint ?? null,
      sort_order: link.sort_order ?? i,
      id: el.id ?? link.element_id,
      name: el.name ?? '',
      category: el.category ?? 'scenery',
      description: el.description ?? null,
      image_url: el.image_url ?? null,
      generation_status: el.generation_status ?? 'pending',
      generation_prompt: el.generation_prompt ?? null,
      project_id: el.project_id ?? scene.project_id ?? null,
    };
  });
  return jsonResponse({ elements });
}

async function handleSceneElementAdd(sceneId: number, body: any): Promise<Response> {
  const path = await resolvePath(body?.project_id ?? body?.projectId);
  if (!path) return jsonResponse({ message: '未打开本地工程' }, 400);
  const sdoc = await loadRestDoc(path, 'scenes');
  const scene = findById(sdoc.items, sceneId);
  if (!scene || !assertProject(scene, path)) return jsonResponse({ message: '场景不存在' }, 404);
  scene.element_links = Array.isArray(scene.element_links) ? scene.element_links : [];
  const incoming = normalizeKeys(body);
  const linkId = (scene.element_links.reduce((mx: number, l: any) => Math.max(mx, Number(l.link_id) || 0), 0) + 1);
  scene.element_links.push({
    link_id: linkId,
    element_id: Number(incoming.element_id ?? incoming.elementId),
    position_hint: incoming.position_hint ?? null,
    sort_order: Number(incoming.sort_order ?? scene.element_links.length),
  });
  saveRestDoc(path, 'scenes', sdoc);
  return jsonResponse({ linkId });
}

async function handleSceneElementPatch(sceneId: number, elementId: number, body: any): Promise<Response> {
  const path = activePath();
  if (!path) return jsonResponse({ message: '未打开本地工程' }, 400);
  const sdoc = await loadRestDoc(path, 'scenes');
  const scene = findById(sdoc.items, sceneId);
  const link = scene?.element_links?.find((l: any) => Number(l.element_id) === Number(elementId));
  if (!link || !assertProject(scene, path)) return jsonResponse({ message: '关联不存在' }, 404);
  const incoming = normalizeKeys(body);
  if (incoming.position_hint !== undefined) link.position_hint = incoming.position_hint;
  if (incoming.sort_order !== undefined) link.sort_order = Number(incoming.sort_order);
  saveRestDoc(path, 'scenes', sdoc);
  return jsonResponse({ message: 'updated' });
}

async function handleSceneElementRemove(sceneId: number, elementId: number): Promise<Response> {
  const path = activePath();
  if (!path) return jsonResponse({ message: '未打开本地工程' }, 400);
  const sdoc = await loadRestDoc(path, 'scenes');
  const scene = findById(sdoc.items, sceneId);
  if (scene && Array.isArray(scene.element_links) && assertProject(scene, path)) {
    scene.element_links = scene.element_links.filter((l: any) => Number(l.element_id) !== Number(elementId));
    saveRestDoc(path, 'scenes', sdoc);
  }
  return jsonResponse({ message: 'removed' });
}

// ==================== 生成 / 文本 ====================
async function handleSceneGenerateImage(sceneId: number, body: any): Promise<Response> {
  const path = await resolvePath(body?.project_id ?? body?.projectId);
  if (!path) return jsonResponse({ message: '未打开本地工程' }, 400);
  const doc = await loadRestDoc(path, 'scenes');
  const scene = findById(doc.items, sceneId);
  if (!scene || !assertProject(scene, path)) return jsonResponse({ message: '场景不存在' }, 404);
  const projectId = Number(scene.project_id) || 0;
  const prompt = String(scene.generation_prompt || scene.image_prompt || scene.description || scene.name || '场景概念图');
  scene.generation_status = 'generating';
  saveRestDoc(path, 'scenes', doc);
  const jobId = submitGenJob({
    workflowType: 'scene_image_generation',
    workflowName: '场景图生成',
    projectId,
    inputParams: { sceneId, imageModel: body?.imageModel, sceneName: scene.name },
    run: async () => {
      const url = await genImageToUrl({ imageModel: body?.imageModel, prompt, projectId, nameHint: `scene${sceneId}`, aspectRatio: body?.aspectRatio });
      const d2 = await loadRestDoc(path, 'scenes');
      const s = findById(d2.items, sceneId);
      if (s) {
        Object.assign(s, { image_url: url, generation_status: 'completed', updated_at: new Date().toISOString() });
        saveRestDoc(path, 'scenes', d2);
      }
      return { image_url: url };
    },
  });
  return jsonResponse({ message: 'generating', jobId, sceneId, status: 'generating' });
}

async function handleSceneGeneratePrompt(sceneId: number, body: any): Promise<Response> {
  const path = await resolvePath(body?.project_id ?? body?.projectId);
  if (!path) return jsonResponse({ message: '未打开本地工程' }, 400);
  const doc = await loadRestDoc(path, 'scenes');
  const scene = findById(doc.items, sceneId);
  if (!scene || !assertProject(scene, path)) return jsonResponse({ message: '场景不存在' }, 404);
  const model = await pickTextModel(body?.textModel);
  if (!model) return jsonResponse({ message: '请先配置可用的文本模型' }, 400);
  const sys = '你是专业的 AI 场景绘画提示词工程师。基于场景设定产出 A/B 两版高质量场景图提示词。严格只输出 JSON：{"style":"画风","A":"A面提示词","B":"B面提示词"}，全部中文。';
  const user = `场景名称：${scene.name || ''}\n描述：${scene.description || ''}\n用户补充：${body?.userNote || ''}`;
  const parsed = await chatJson(model, sys, user);
  const promptA = body?.basePromptA || parsed?.A || '';
  const promptB = body?.basePromptB || parsed?.B || '';
  if (parsed) {
    Object.assign(scene, { image_prompt_a: promptA, image_prompt_b: promptB, style: parsed.style || scene.style, updated_at: new Date().toISOString() });
    saveRestDoc(path, 'scenes', doc);
  }
  return jsonResponse({ message: 'ok', sceneId, face: body?.face || 'both', style: parsed?.style || scene.style || '', promptA, promptB });
}

async function handleSceneExtractElements(sceneId: number, body: any): Promise<Response> {
  const path = await resolvePath(body?.project_id ?? body?.projectId);
  if (!path) return jsonResponse({ message: '未打开本地工程' }, 400);
  const sdoc = await loadRestDoc(path, 'scenes');
  const scene = findById(sdoc.items, sceneId);
  if (!scene || !assertProject(scene, path)) return jsonResponse({ message: '场景不存在' }, 404);
  const projectId = Number(scene.project_id) || 0;
  const jobId = submitGenJob({
    workflowType: 'scene_elements_extraction',
    workflowName: '场景元素抽取',
    projectId,
    inputParams: { sceneId, textModel: body?.textModel, sceneName: scene.name },
    run: async () => {
      const model = await pickTextModel(body?.textModel);
      if (!model) throw new Error('请先配置可用的文本模型');
      const sys = '你是场景美术指导。从场景描述中抽取可复用的场景元素（建筑/景物）。严格只输出 JSON：{"elements":[{"name":"元素名","category":"building|scenery","description":"外观描述"}]}，全部中文。';
      const user = `场景名称：${scene.name || ''}\n描述：${scene.description || ''}`;
      const parsed = await chatJson(model, sys, user);
      const list: any[] = Array.isArray(parsed?.elements) ? parsed.elements : [];
      const edoc = await loadRestDoc(path, 'sceneElements');
      sdoc.items = sdoc.items; // keep ref
      const sc = findById(sdoc.items, sceneId)!;
      sc.element_links = Array.isArray(sc.element_links) ? sc.element_links : [];
      let added = 0;
      for (const raw of list) {
        const id = edoc.nextId++;
        const now = new Date().toISOString();
        edoc.items.push({
          id, project_id: projectId, name: String(raw.name || '元素'),
          category: raw.category === 'building' ? 'building' : 'scenery',
          description: raw.description ?? null, image_url: null,
          generation_status: 'pending', sort_order: edoc.items.length,
          created_at: now, updated_at: now,
        });
        sc.element_links.push({ link_id: sc.element_links.length + 1, element_id: id, position_hint: null, sort_order: sc.element_links.length });
        added++;
      }
      saveRestDoc(path, 'sceneElements', edoc);
      saveRestDoc(path, 'scenes', sdoc);
      return { extracted: added };
    },
  });
  return jsonResponse({ message: 'extracting', jobId, sceneId, status: 'generating' });
}

// ==================== 草图 / 参考图 ====================
async function handleSketch(sceneId: number, m: string, body: any): Promise<Response | null> {
  const path = await resolvePath(body?.project_id ?? body?.projectId);
  if (!path) return jsonResponse({ sketch_url: null });
  const doc = await loadRestDoc(path, 'scenes');
  const scene = findById(doc.items, sceneId);
  if (!scene || !assertProject(scene, path)) return jsonResponse({ sketch_url: null });
  if (m === 'GET') return jsonResponse({ sketch_url: scene.sketch_url || null });
  if (m === 'DELETE') {
    scene.sketch_url = null;
    saveRestDoc(path, 'scenes', doc);
    return jsonResponse({ message: 'deleted' });
  }
  if (m === 'POST') {
    const src = body?.sketch || body?.image_url || '';
    if (src) {
      scene.sketch_url = /^(data:|https?:|asset:|blob:)/i.test(src) ? await persistGeneratedMedia(Number(scene.project_id) || 0, src, `scene${sceneId}_sketch`) : src;
      saveRestDoc(path, 'scenes', doc);
    }
    return jsonResponse({ sketch_url: scene.sketch_url });
  }
  return null;
}

async function handleReferenceImage(sceneId: number, m: string, body: any): Promise<Response | null> {
  const path = await resolvePath(body?.project_id ?? body?.projectId);
  if (!path) return jsonResponse({ message: '未打开本地工程' }, 400);
  const doc = await loadRestDoc(path, 'scenes');
  const scene = findById(doc.items, sceneId);
  if (!scene || !assertProject(scene, path)) return jsonResponse({ message: '场景不存在' }, 404);
  if (m === 'DELETE') {
    scene.reference_image_url = null;
    saveRestDoc(path, 'scenes', doc);
    return jsonResponse({ message: 'deleted' });
  }
  if (m === 'POST') {
    const src = body?.reference_image || body?.image_url || '';
    scene.reference_image_url = /^(data:|https?:|asset:|blob:)/i.test(src)
      ? await persistGeneratedMedia(Number(scene.project_id) || 0, src, `scene${sceneId}_ref`)
      : src;
    saveRestDoc(path, 'scenes', doc);
    return jsonResponse({ image_url: scene.reference_image_url });
  }
  return null;
}

// ==================== 场景绑定 ====================
async function handleSceneBindingsGet(sceneId: number): Promise<Response> {
  const path = activePath();
  const doc = path ? await loadRestDoc(path, 'scenes') : { items: [] };
  const scene = findById(doc.items, sceneId) || {};
  const bindings = Array.isArray(scene.bindings) && scene.bindings.length
    ? scene.bindings
    : [{ project_id: Number(scene.project_id) || 0, role: 'owner' }];
  return jsonResponse({ sceneId, bindings });
}

async function handleSceneBindingAdd(sceneId: number, body: any): Promise<Response> {
  const path = activePath();
  if (!path) return jsonResponse({ message: '未打开本地工程' }, 400);
  const doc = await loadRestDoc(path, 'scenes');
  const scene = findById(doc.items, sceneId);
  if (!scene || !assertProject(scene, path)) return jsonResponse({ message: '场景不存在' }, 404);
  const pid = Number(body?.projectId ?? body?.project_id);
  if (!Number.isFinite(pid)) return jsonResponse({ message: '缺少 projectId' }, 400);
  scene.bindings = Array.isArray(scene.bindings) ? scene.bindings : [{ project_id: Number(scene.project_id) || 0, role: 'owner' }];
  if (!scene.bindings.some((b: any) => Number(b.project_id) === pid)) scene.bindings.push({ project_id: pid, role: 'member' });
  saveRestDoc(path, 'scenes', doc);
  return jsonResponse({ message: 'bound' });
}

// ==================== 场景元素图片生成 ====================
async function handleElementGenerate(elementId: number, body: any): Promise<Response> {
  const path = await resolvePath(body?.project_id ?? body?.projectId);
  if (!path) return jsonResponse({ message: '未打开本地工程' }, 400);
  const doc = await loadRestDoc(path, 'sceneElements');
  const el = findById(doc.items, elementId);
  if (!el || !assertProject(el, path)) return jsonResponse({ message: '元素不存在' }, 404);
  const projectId = Number(el.project_id) || 0;
  const prompt = String(el.generation_prompt || el.description || el.name || '场景元素图');
  el.generation_status = 'generating';
  saveRestDoc(path, 'sceneElements', doc);
  const jobId = submitGenJob({
    workflowType: 'scene_element_generation',
    workflowName: '场景元素图生成',
    projectId,
    inputParams: { elementId, imageModel: body?.imageModel, elementName: el.name },
    run: async () => {
      const url = await genImageToUrl({ imageModel: body?.imageModel, prompt, projectId, nameHint: `element${elementId}` });
      const d2 = await loadRestDoc(path, 'sceneElements');
      const e = findById(d2.items, elementId);
      if (e) {
        Object.assign(e, { image_url: url, generation_status: 'completed', updated_at: new Date().toISOString() });
        saveRestDoc(path, 'sceneElements', d2);
      }
      return { image_url: url };
    },
  });
  return jsonResponse({ message: 'generating', jobId, elementId, status: 'generating' });
}

// ==================== 路由入口 ====================
export async function routeScenes(url: URL, method: string, body: any): Promise<Response | null> {
  const p = url.pathname;
  const m = method.toUpperCase();
  let mt: RegExpMatchArray | null;

  // 场景元素图片生成（挂在 scene-elements 下）
  if ((mt = p.match(/^\/api\/scene-elements\/(\d+)\/generate$/)) && m === 'POST') return handleElementGenerate(Number(mt[1]), body || {});

  // 场景元素关联：/api/scenes/:id/elements(/:elementId)
  if ((mt = p.match(/^\/api\/scenes\/(\d+)\/elements\/(\d+)$/))) {
    if (m === 'PATCH' || m === 'PUT') return handleSceneElementPatch(Number(mt[1]), Number(mt[2]), body || {});
    if (m === 'DELETE') return handleSceneElementRemove(Number(mt[1]), Number(mt[2]));
  }
  if ((mt = p.match(/^\/api\/scenes\/(\d+)\/elements$/))) {
    if (m === 'GET') return handleSceneElementsGet(Number(mt[1]));
    if (m === 'POST') return handleSceneElementAdd(Number(mt[1]), body || {});
  }

  // 场景生成 / 文本
  if ((mt = p.match(/^\/api\/scenes\/(\d+)\/generate-image$/)) && m === 'POST') return handleSceneGenerateImage(Number(mt[1]), body || {});
  if ((mt = p.match(/^\/api\/scenes\/(\d+)\/generate-image-prompt$/)) && m === 'POST') return handleSceneGeneratePrompt(Number(mt[1]), body || {});
  if ((mt = p.match(/^\/api\/scenes\/(\d+)\/extract-elements$/)) && m === 'POST') return handleSceneExtractElements(Number(mt[1]), body || {});

  // 草图 / 参考图
  if ((mt = p.match(/^\/api\/scenes\/(\d+)\/sketch$/))) return handleSketch(Number(mt[1]), m, body || {});
  if ((mt = p.match(/^\/api\/scenes\/(\d+)\/reference-image$/))) return handleReferenceImage(Number(mt[1]), m, body || {});

  // ai-generate-draft（草稿生成，回放中性响应，避免打到不存在的后端）
  if ((mt = p.match(/^\/api\/scenes\/(\d+)\/ai-generate-draft$/)) && m === 'POST') {
    return jsonResponse({ message: 'ok', sceneId: Number(mt[1]), draft: null });
  }

  // 绑定
  if ((mt = p.match(/^\/api\/scenes\/(\d+)\/bindings$/))) {
    if (m === 'GET') return handleSceneBindingsGet(Number(mt[1]));
    if (m === 'POST') return handleSceneBindingAdd(Number(mt[1]), body || {});
  }

  return null;
}
