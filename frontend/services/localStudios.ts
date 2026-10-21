// 影棚 / 服装 域本地路由（localStudios）
//
// 影棚（Studio）聚合 环境(1:1) + 建筑(1:N) + 场景元素(M:N)。
// 接管 routeRest 通用 CRUD 之外的特殊子路径：
//   详情（StudioDetail）、环境关联/切换面、建筑关联/切换视图、元素关联、
//   九宫组装图生成、从剧本抽取环境/建筑（extract-components）、从剧本拼接影棚（compose-from-script）。
//   服装：设定图生成（generate-views）。
//
// 影棚单条 PUT/PATCH/DELETE 与列表/创建仍由 routeRest 处理。

import { readDoc } from './localStore';
import {
  activePath,
  resolvePath,
  assertProject,
  loadRestDoc,
  saveRestDoc,
  findById,
  jsonResponse,
  pickTextModel,
  chatJson,
  genImageToUrl,
  submitGenJob,
} from './localAssetShared';

// ==================== 影棚详情 ====================
async function handleStudioDetail(studioId: number): Promise<Response | null> {
  const path = activePath();
  if (!path) return null;
  const sdoc = await loadRestDoc(path, 'studios');
  const studio = findById(sdoc.items, studioId);
  if (!studio) return null;
  const edoc = await loadRestDoc(path, 'environments');
  const bdoc = await loadRestDoc(path, 'buildings');
  const eldoc = await loadRestDoc(path, 'sceneElements');
  const environment = studio.environment_id ? findById(edoc.items, studio.environment_id) || null : null;
  const buildingLinks = Array.isArray(studio.building_ids) ? studio.building_ids : [];
  const buildings = buildingLinks
    .map((l: any) => { const b = findById(bdoc.items, l.building_id); return b ? { ...b, building_view: l.view ?? null } : null; })
    .filter(Boolean);
  const elementLinks = Array.isArray(studio.element_ids) ? studio.element_ids : [];
  const elements = elementLinks
    .map((l: any) => findById(eldoc.items, l.element_id))
    .filter(Boolean)
    .map((e: any) => ({ id: e.id, name: e.name, category: e.category, description: e.description ?? null, image_url: e.image_url ?? null, generation_status: e.generation_status, sort_order: e.sort_order ?? 0 }));
  return jsonResponse({ studio, environment, buildings, elements });
}

async function mutateStudio(studioId: number, fn: (studio: any) => void): Promise<Response> {
  const path = activePath();
  if (!path) return jsonResponse({ message: '未打开本地工程' }, 400);
  const doc = await loadRestDoc(path, 'studios');
  const studio = findById(doc.items, studioId);
  if (!studio || !assertProject(studio, path)) return jsonResponse({ message: '影棚不存在' }, 404);
  fn(studio);
  studio.updated_at = new Date().toISOString();
  saveRestDoc(path, 'studios', doc);
  return jsonResponse({ message: 'ok' });
}

function attachEnvironment(studio: any, environmentId: number, view?: string) {
  studio.environment_id = environmentId;
  if (view) studio.environment_view = view;
}
function attachBuilding(studio: any, buildingId: number, body: any) {
  studio.building_ids = Array.isArray(studio.building_ids) ? studio.building_ids : [];
  const existing = studio.building_ids.find((l: any) => Number(l.building_id) === Number(buildingId));
  if (existing) {
    if (body?.view) existing.view = body.view;
    if (body?.sortOrder != null) existing.sort_order = Number(body.sortOrder);
  } else {
    studio.building_ids.push({ building_id: Number(buildingId), view: body?.view ?? null, sort_order: Number(body?.sortOrder ?? studio.building_ids.length) });
  }
}
function attachElement(studio: any, elementId: number, body: any) {
  studio.element_ids = Array.isArray(studio.element_ids) ? studio.element_ids : [];
  if (!studio.element_ids.some((l: any) => Number(l.element_id) === Number(elementId))) {
    studio.element_ids.push({ element_id: Number(elementId), sort_order: Number(body?.sortOrder ?? studio.element_ids.length) });
  }
}

// 九宫组装图生成
async function handleNineGrid(studioId: number, body: any): Promise<Response> {
  const path = await resolvePath(body?.project_id ?? body?.projectId);
  if (!path) return jsonResponse({ message: '未打开本地工程' }, 400);
  const doc = await loadRestDoc(path, 'studios');
  const studio = findById(doc.items, studioId);
  if (!studio || !assertProject(studio, path)) return jsonResponse({ message: '影棚不存在' }, 404);
  const projectId = Number(studio.project_id) || 0;
  const prompt = String(studio.description || studio.name || '影棚九宫组装图，3×3 九机位视角');
  studio.nine_grid_generation_status = 'generating';
  saveRestDoc(path, 'studios', doc);
  const jobId = submitGenJob({
    workflowType: 'studio_nine_grid_generation',
    workflowName: '影棚九宫组装图生成',
    projectId,
    inputParams: { studioId, imageModel: body?.imageModel, studioName: studio.name },
    run: async () => {
      const url = await genImageToUrl({ imageModel: body?.imageModel, prompt, projectId, nameHint: `studio${studioId}_ninegrid`, aspectRatio: '1:1' });
      const d2 = await loadRestDoc(path, 'studios');
      const s = findById(d2.items, studioId);
      if (s) {
        s.nine_grid_image_url = url;
        s.nine_grid_generation_status = 'completed';
        s.updated_at = new Date().toISOString();
        saveRestDoc(path, 'studios', d2);
      }
      return { nine_grid_image_url: url };
    },
  });
  return jsonResponse({ message: 'generating', jobId, studioId, status: 'generating' });
}

// 从剧本抽取环境/建筑（文本作业）
async function readScriptContent(path: string, scriptId: number): Promise<string> {
  const doc = await readDoc<{ scripts?: any[] }>(path, 'scripts', { scripts: [] });
  const found = (doc.scripts || []).find((s) => Number(s.id) === Number(scriptId));
  return String(found?.content || '');
}

async function handleExtractComponents(body: any): Promise<Response> {
  const projectId = Number(body?.projectId) || 0;
  const path = await resolvePath(projectId || null);
  if (!path) return jsonResponse({ message: '未打开本地工程' }, 400);
  const scriptId = Number(body?.scriptId) || 0;
  const jobId = submitGenJob({
    workflowType: 'studio_component_extraction',
    workflowName: '影棚要素抽取',
    projectId,
    inputParams: { projectId, scriptId, textModel: body?.textModel },
    run: async () => {
      const content = await readScriptContent(path, scriptId);
      if (!content) throw new Error('剧本内容为空，无法抽取');
      const model = await pickTextModel(body?.textModel);
      if (!model) throw new Error('请先配置可用的文本模型');
      const sys = '你是美术指导。从剧本中抽取「环境」与「建筑」。严格只输出 JSON：{"environments":[{"name","description","terrainType"}],"buildings":[{"name","description","interiorExterior":"interior|exterior|both","structureType"}]}，全部中文。';
      const parsed = await chatJson(model, sys, content.slice(0, 12000));
      const edoc = await loadRestDoc(path, 'environments');
      const bdoc = await loadRestDoc(path, 'buildings');
      const now = new Date().toISOString();
      const envs = Array.isArray(parsed?.environments) ? parsed.environments : [];
      const blds = Array.isArray(parsed?.buildings) ? parsed.buildings : [];
      for (const raw of envs) {
        edoc.items.push({ id: edoc.nextId++, project_id: projectId, name: String(raw.name || '环境'), description: raw.description ?? null, terrain_type: raw.terrainType ?? null, generation_status: 'pending', sort_order: edoc.items.length, created_at: now, updated_at: now });
      }
      for (const raw of blds) {
        bdoc.items.push({ id: bdoc.nextId++, project_id: projectId, name: String(raw.name || '建筑'), description: raw.description ?? null, interior_exterior: raw.interiorExterior || 'exterior', structure_type: raw.structureType ?? null, generation_status: 'pending', sort_order: bdoc.items.length, created_at: now, updated_at: now });
      }
      saveRestDoc(path, 'environments', edoc);
      saveRestDoc(path, 'buildings', bdoc);
      return { environments: envs.length, buildings: blds.length };
    },
  });
  return jsonResponse({ message: 'extracting', jobId, scriptId, status: 'generating' });
}

async function handleComposeFromScript(body: any): Promise<Response> {
  const projectId = Number(body?.projectId) || 0;
  const path = await resolvePath(projectId || null);
  if (!path) return jsonResponse({ message: '未打开本地工程' }, 400);
  const scriptId = Number(body?.scriptId) || 0;
  const jobId = submitGenJob({
    workflowType: 'studio_composition',
    workflowName: '影棚拼接',
    projectId,
    inputParams: { projectId, scriptId, textModel: body?.textModel },
    run: async () => {
      const content = await readScriptContent(path, scriptId);
      if (!content) throw new Error('剧本内容为空，无法拼接');
      const model = await pickTextModel(body?.textModel);
      if (!model) throw new Error('请先配置可用的文本模型');
      const sys = '你是场景总监。把剧本场景拼接为影棚（环境+建筑+元素）。严格只输出 JSON：{"studios":[{"name","description","environmentName","buildingNames":["..."]}]}，全部中文。';
      const parsed = await chatJson(model, sys, content.slice(0, 12000));
      const edoc = await loadRestDoc(path, 'environments');
      const bdoc = await loadRestDoc(path, 'buildings');
      const sdoc = await loadRestDoc(path, 'studios');
      const now = new Date().toISOString();
      const studios = Array.isArray(parsed?.studios) ? parsed.studios : [];
      for (const raw of studios) {
        const env = edoc.items.find((e) => e.name === raw.environmentName);
        const blinks = (Array.isArray(raw.buildingNames) ? raw.buildingNames : [])
          .map((bn: string) => bdoc.items.find((b) => b.name === bn))
          .filter(Boolean)
          .map((b: any, i: number) => ({ building_id: b.id, view: null, sort_order: i }));
        sdoc.items.push({ id: sdoc.nextId++, project_id: projectId, name: String(raw.name || '影棚'), description: raw.description ?? null, environment_id: env?.id ?? null, building_ids: blinks, element_ids: [], generation_status: 'pending', sort_order: sdoc.items.length, created_at: now, updated_at: now });
      }
      saveRestDoc(path, 'studios', sdoc);
      return { studios: studios.length };
    },
  });
  return jsonResponse({ message: 'composing', jobId, scriptId, status: 'generating' });
}

// ==================== 服装设定图生成 ====================
async function handleCostumeGenerateViews(id: number, body: any): Promise<Response> {
  const path = await resolvePath(body?.project_id ?? body?.projectId);
  if (!path) return jsonResponse({ message: '未打开本地工程' }, 400);
  const doc = await loadRestDoc(path, 'costumes');
  const c = findById(doc.items, id);
  if (!c || !assertProject(c, path)) return jsonResponse({ message: '服装不存在' }, 404);
  const projectId = Number(c.project_id) || 0;
  const base = String(c.outfit_prompt || c.generation_prompt || c.description || c.name || '服装设定图，白色人体模型');
  c.generation_status = 'generating';
  saveRestDoc(path, 'costumes', doc);
  const jobId = submitGenJob({
    workflowType: 'costume_views_generation',
    workflowName: '服装设定图生成',
    projectId,
    inputParams: { costumeId: id, imageModel: body?.imageModel, costumeName: c.name },
    run: async () => {
      const front = await genImageToUrl({ imageModel: body?.imageModel, prompt: `${base}，正面`, projectId, nameHint: `costume${id}_front`, aspectRatio: body?.aspectRatio });
      const side = await genImageToUrl({ imageModel: body?.imageModel, prompt: `${base}，侧面`, projectId, nameHint: `costume${id}_side`, aspectRatio: body?.aspectRatio });
      const back = await genImageToUrl({ imageModel: body?.imageModel, prompt: `${base}，背面`, projectId, nameHint: `costume${id}_back`, aspectRatio: body?.aspectRatio });
      const d2 = await loadRestDoc(path, 'costumes');
      const cc = findById(d2.items, id);
      if (cc) {
        Object.assign(cc, { front_view_url: front, side_view_url: side, back_view_url: back, image_url: front, generation_status: 'completed', updated_at: new Date().toISOString() });
        saveRestDoc(path, 'costumes', d2);
      }
      return { front_view_url: front, side_view_url: side, back_view_url: back };
    },
  });
  return jsonResponse({ jobId, status: 'generating', costumeId: id, message: 'generating' });
}

// ==================== 路由入口 ====================
export async function routeStudios(url: URL, method: string, body: any): Promise<Response | null> {
  const p = url.pathname;
  const m = method.toUpperCase();
  let mt: RegExpMatchArray | null;

  // 影棚：剧本工作流（固定段）
  if (p === '/api/studios/extract-components' && m === 'POST') return handleExtractComponents(body || {});
  if (p === '/api/studios/compose-from-script' && m === 'POST') return handleComposeFromScript(body || {});

  // 影棚：详情 GET（覆盖 routeRest 的单条形状）
  if ((mt = p.match(/^\/api\/studios\/(\d+)$/)) && m === 'GET') return handleStudioDetail(Number(mt[1]));

  // 环境关联 / 切换面
  if ((mt = p.match(/^\/api\/studios\/(\d+)\/environment$/))) {
    if (m === 'POST') return mutateStudio(Number(mt[1]), (s) => attachEnvironment(s, Number(body?.environmentId), body?.view));
    if (m === 'DELETE') return mutateStudio(Number(mt[1]), (s) => { s.environment_id = null; s.environment_view = null; });
  }
  if ((mt = p.match(/^\/api\/studios\/(\d+)\/environment-view$/)) && (m === 'PATCH' || m === 'PUT')) {
    return mutateStudio(Number(mt[1]), (s) => { if (body?.view) s.environment_view = body.view; });
  }

  // 建筑关联 / 切换视图
  if ((mt = p.match(/^\/api\/studios\/(\d+)\/buildings\/(\d+)\/view$/)) && (m === 'PATCH' || m === 'PUT')) {
    return mutateStudio(Number(mt[1]), (s) => {
      s.building_ids = Array.isArray(s.building_ids) ? s.building_ids : [];
      const link = s.building_ids.find((l: any) => Number(l.building_id) === Number(mt![2]));
      if (link && body?.view) link.view = body.view;
    });
  }
  if ((mt = p.match(/^\/api\/studios\/(\d+)\/buildings\/(\d+)$/))) {
    if (m === 'POST') return mutateStudio(Number(mt[1]), (s) => attachBuilding(s, Number(mt![2]), body || {}));
    if (m === 'DELETE') return mutateStudio(Number(mt[1]), (s) => { s.building_ids = (s.building_ids || []).filter((l: any) => Number(l.building_id) !== Number(mt![2])); });
  }

  // 元素关联
  if ((mt = p.match(/^\/api\/studios\/(\d+)\/elements\/(\d+)$/))) {
    if (m === 'POST') return mutateStudio(Number(mt[1]), (s) => attachElement(s, Number(mt![2]), body || {}));
    if (m === 'DELETE') return mutateStudio(Number(mt[1]), (s) => { s.element_ids = (s.element_ids || []).filter((l: any) => Number(l.element_id) !== Number(mt![2])); });
  }

  // 九宫生成
  if ((mt = p.match(/^\/api\/studios\/(\d+)\/generate-nine-grid$/)) && m === 'POST') return handleNineGrid(Number(mt[1]), body || {});

  // 服装设定图生成
  if ((mt = p.match(/^\/api\/costumes\/(\d+)\/generate-views$/)) && m === 'POST') return handleCostumeGenerateViews(Number(mt[1]), body || {});

  return null;
}
