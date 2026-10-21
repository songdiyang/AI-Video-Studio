// 环境 / 建筑 / 环境变体 域本地路由（localEnvironments）
//
// 接管 routeRest 通用 CRUD 之外的特殊子路径：
//   环境：氛围图生成、地貌识别（单/批）、描述清洗（单/批）、地貌类型字典。
//   建筑：结构图生成、删除图片。
//   环境变体：人脸（8 方位）生成。

import {
  activePath,
  loadRestDoc,
  saveRestDoc,
  findById,
  jsonResponse,
  pickTextModel,
  chatJson,
  genImageToUrl,
  submitGenJob,
} from './localAssetShared';

const TERRAIN_TYPES = ['山地', '平原', '丘陵', '森林', '草原', '沙漠', '海洋', '湖泊', '河流', '雪原', '沼泽', '峡谷', '城市', '洞穴', '太空', '其他'];

// ==================== 环境 ====================
async function handleEnvironmentGenerateImage(envId: number, body: any): Promise<Response> {
  const path = activePath();
  if (!path) return jsonResponse({ message: '未打开本地工程' }, 400);
  const doc = await loadRestDoc(path, 'environments');
  const env = findById(doc.items, envId);
  if (!env) return jsonResponse({ message: '环境不存在' }, 404);
  const projectId = Number(env.project_id) || 0;
  const base = String(env.generation_prompt || env.description || env.name || '环境氛围参考图');
  const mode = body?.mode || 'front';
  env.generation_status = 'generating';
  saveRestDoc(path, 'environments', doc);
  const jobId = submitGenJob({
    workflowType: 'environment_image_generation',
    workflowName: '环境氛围图生成',
    projectId,
    inputParams: { environmentId: envId, imageModel: body?.imageModel, environmentName: env.name },
    run: async () => {
      const out: Record<string, string | null> = {};
      if (mode === 'front' || mode === 'both') {
        out.image_url = await genImageToUrl({ imageModel: body?.imageModel, prompt: `${base}，正面视角`, projectId, nameHint: `env${envId}_front` });
      }
      if (mode === 'back' || mode === 'both') {
        out.image_back_url = await genImageToUrl({ imageModel: body?.imageModel, prompt: `${base}，背面视角`, projectId, nameHint: `env${envId}_back` });
      }
      const d2 = await loadRestDoc(path, 'environments');
      const e = findById(d2.items, envId);
      if (e) {
        if (out.image_url) e.image_url = out.image_url;
        if (out.image_back_url) e.image_back_url = out.image_back_url;
        e.generation_status = 'completed';
        e.updated_at = new Date().toISOString();
        saveRestDoc(path, 'environments', d2);
      }
      return out;
    },
  });
  return jsonResponse({ message: 'generating', jobId, environmentId: envId, status: 'generating' });
}

async function recognizeTerrain(env: any, model: Awaited<ReturnType<typeof pickTextModel>>): Promise<string[]> {
  if (!model) return [];
  const sys = `你是地貌识别助手。从场景描述判断地貌类型，只能从以下集合选择：${TERRAIN_TYPES.join('/')}。严格只输出 JSON：{"terrainTypes":["..."]}。`;
  const parsed = await chatJson(model, sys, `环境名称：${env.name || ''}\n描述：${env.description || ''}`);
  const arr = Array.isArray(parsed?.terrainTypes) ? parsed.terrainTypes : [];
  return arr.filter((t: string) => TERRAIN_TYPES.includes(t));
}

async function handleRecognizeTerrain(envId: number): Promise<Response> {
  const path = activePath();
  if (!path) return jsonResponse({ message: '未打开本地工程' }, 400);
  const doc = await loadRestDoc(path, 'environments');
  const env = findById(doc.items, envId);
  if (!env) return jsonResponse({ message: '环境不存在' }, 404);
  const model = await pickTextModel();
  const terrainTypes = await recognizeTerrain(env, model);
  if (terrainTypes.length) {
    env.terrain_type = terrainTypes.join(',');
    env.updated_at = new Date().toISOString();
    saveRestDoc(path, 'environments', doc);
  }
  return jsonResponse({ message: 'ok', environmentId: envId, terrainTypes, availableTypes: TERRAIN_TYPES });
}

async function handleRecognizeAllTerrains(body: any): Promise<Response> {
  const path = activePath();
  if (!path) return jsonResponse({ message: '未打开本地工程', total: 0, changed: 0, results: [] });
  const doc = await loadRestDoc(path, 'environments');
  const projectId = Number(body?.projectId) || null;
  const items = projectId ? doc.items.filter((e) => Number(e.project_id) === projectId) : doc.items;
  const model = await pickTextModel();
  const results: any[] = [];
  let changed = 0;
  for (const env of items) {
    const tt = await recognizeTerrain(env, model);
    const before = env.terrain_type || '';
    const after = tt.join(',');
    const didChange = before !== after && after !== '';
    if (didChange) { env.terrain_type = after; changed++; }
    results.push({ id: env.id, name: env.name, terrainTypes: tt, changed: didChange });
  }
  if (changed) saveRestDoc(path, 'environments', doc);
  return jsonResponse({ message: 'ok', total: items.length, changed, results });
}

async function sanitizeDescription(env: any, model: Awaited<ReturnType<typeof pickTextModel>>): Promise<string> {
  if (!model || !env.description) return env.description || '';
  const sys = '你是文案清洗助手。从环境描述中剔除「角色」与「建筑」相关描述，只保留环境/氛围/地貌/光线。严格只输出 JSON：{"after":"清洗后的描述"}。';
  const parsed = await chatJson(model, sys, env.description);
  return parsed?.after ?? env.description;
}

async function handleSanitizeDescription(envId: number): Promise<Response> {
  const path = activePath();
  if (!path) return jsonResponse({ message: '未打开本地工程' }, 400);
  const doc = await loadRestDoc(path, 'environments');
  const env = findById(doc.items, envId);
  if (!env) return jsonResponse({ message: '环境不存在' }, 404);
  const model = await pickTextModel();
  const before = env.description || '';
  const after = await sanitizeDescription(env, model);
  const changed = before !== after;
  if (changed) { env.description = after; env.updated_at = new Date().toISOString(); saveRestDoc(path, 'environments', doc); }
  return jsonResponse({ message: 'ok', before, after, changed, environment: env });
}

async function handleSanitizeDescriptions(body: any): Promise<Response> {
  const path = activePath();
  if (!path) return jsonResponse({ message: '未打开本地工程', total: 0, changed: 0, results: [] });
  const doc = await loadRestDoc(path, 'environments');
  const projectId = Number(body?.projectId) || null;
  const items = projectId ? doc.items.filter((e) => Number(e.project_id) === projectId) : doc.items;
  const model = await pickTextModel();
  const results: any[] = [];
  let changed = 0;
  for (const env of items) {
    const before = env.description || '';
    const after = await sanitizeDescription(env, model);
    const didChange = before !== after;
    if (didChange) { env.description = after; changed++; }
    results.push({ id: env.id, name: env.name, before, after, changed: didChange });
  }
  if (changed) saveRestDoc(path, 'environments', doc);
  return jsonResponse({ message: 'ok', total: items.length, changed, results });
}

// ==================== 建筑 ====================
async function handleBuildingGenerateImage(id: number, body: any): Promise<Response> {
  const path = activePath();
  if (!path) return jsonResponse({ message: '未打开本地工程' }, 400);
  const doc = await loadRestDoc(path, 'buildings');
  const b = findById(doc.items, id);
  if (!b) return jsonResponse({ message: '建筑不存在' }, 404);
  const projectId = Number(b.project_id) || 0;
  const base = String(b.generation_prompt || b.description || b.name || '建筑结构图');
  const vt = body?.viewType || b.interior_exterior || 'exterior';
  b.generation_status = 'generating';
  saveRestDoc(path, 'buildings', doc);
  const jobId = submitGenJob({
    workflowType: 'building_image_generation',
    workflowName: '建筑结构图生成',
    projectId,
    inputParams: { buildingId: id, imageModel: body?.imageModel, buildingName: b.name },
    run: async () => {
      const out: Record<string, string | null> = {};
      if (vt === 'exterior' || vt === 'both') out.exterior_image_url = await genImageToUrl({ imageModel: body?.imageModel, prompt: `${base}，建筑外观`, projectId, nameHint: `bld${id}_exterior` });
      if (vt === 'interior' || vt === 'both') out.interior_image_url = await genImageToUrl({ imageModel: body?.imageModel, prompt: `${base}，建筑内景`, projectId, nameHint: `bld${id}_interior` });
      const d2 = await loadRestDoc(path, 'buildings');
      const e = findById(d2.items, id);
      if (e) {
        if (out.exterior_image_url) e.exterior_image_url = out.exterior_image_url;
        if (out.interior_image_url) e.interior_image_url = out.interior_image_url;
        e.image_url = e.exterior_image_url || e.interior_image_url || e.image_url;
        e.generation_status = 'completed';
        e.updated_at = new Date().toISOString();
        saveRestDoc(path, 'buildings', d2);
      }
      return out;
    },
  });
  return jsonResponse({ message: 'generating', jobId, buildingId: id, status: 'generating' });
}

async function handleBuildingImageDelete(id: number): Promise<Response> {
  const path = activePath();
  if (!path) return jsonResponse({ message: '未打开本地工程' }, 400);
  const doc = await loadRestDoc(path, 'buildings');
  const b = findById(doc.items, id);
  if (b) {
    b.image_url = null; b.interior_image_url = null; b.exterior_image_url = null;
    b.generation_status = 'pending'; b.updated_at = new Date().toISOString();
    saveRestDoc(path, 'buildings', doc);
  }
  return jsonResponse({ message: 'deleted' });
}

// ==================== 环境变体 ====================
const VARIANT_FACES = ['front', 'right', 'back', 'left'];

async function handleVariantGenerateFaces(id: number, body: any): Promise<Response> {
  const path = activePath();
  if (!path) return jsonResponse({ message: '未打开本地工程' }, 400);
  const doc = await loadRestDoc(path, 'environmentVariants');
  const v = findById(doc.items, id);
  if (!v) return jsonResponse({ message: '变体不存在' }, 404);
  // 环境归属用于解析工程与提示词基线
  const edoc = await loadRestDoc(path, 'environments');
  const env = findById(edoc.items, v.environment_id) || {};
  const projectId = Number(env.project_id) || 0;
  const base = String(v.generation_prompt || env.generation_prompt || env.description || env.name || '环境变体');
  v.generation_status = 'generating';
  saveRestDoc(path, 'environmentVariants', doc);
  const jobId = submitGenJob({
    workflowType: 'environment_variant_faces_generation',
    workflowName: '环境变体人脸生成',
    projectId,
    inputParams: { variantId: id, environmentId: v.environment_id, imageModel: body?.imageModel },
    run: async () => {
      const faces: Record<string, string> = {};
      for (const face of VARIANT_FACES) {
        try {
          faces[face] = await genImageToUrl({ imageModel: body?.imageModel, prompt: `${base}，${face} 视角`, projectId, nameHint: `var${id}_${face}` });
        } catch {
          /* 单方位失败跳过 */
        }
      }
      const d2 = await loadRestDoc(path, 'environmentVariants');
      const vv = findById(d2.items, id);
      if (vv) {
        vv.faces = { ...(vv.faces || {}), ...faces };
        if (faces.front) vv.image_url = faces.front;
        vv.generation_status = 'completed';
        vv.updated_at = new Date().toISOString();
        saveRestDoc(path, 'environmentVariants', d2);
      }
      return { faces };
    },
  });
  return jsonResponse({ jobId, variantId: id, environmentId: v.environment_id, status: 'generating', message: 'generating' });
}

// ==================== 路由入口 ====================
export async function routeEnvironments(url: URL, method: string, body: any): Promise<Response | null> {
  const p = url.pathname;
  const m = method.toUpperCase();
  let mt: RegExpMatchArray | null;

  // 环境固定段
  if (p === '/api/environments/terrain-types' && m === 'GET') {
    return jsonResponse({ terrainTypes: TERRAIN_TYPES, total: TERRAIN_TYPES.length });
  }
  if (p === '/api/environments/recognize-all-terrains' && m === 'POST') return handleRecognizeAllTerrains(body || {});
  if (p === '/api/environments/sanitize-descriptions' && m === 'POST') return handleSanitizeDescriptions(body || {});

  // 环境 :id 子路径
  if ((mt = p.match(/^\/api\/environments\/(\d+)\/generate-image$/)) && m === 'POST') return handleEnvironmentGenerateImage(Number(mt[1]), body || {});
  if ((mt = p.match(/^\/api\/environments\/(\d+)\/recognize-terrain$/)) && m === 'POST') return handleRecognizeTerrain(Number(mt[1]));
  if ((mt = p.match(/^\/api\/environments\/(\d+)\/sanitize-description$/)) && m === 'POST') return handleSanitizeDescription(Number(mt[1]));

  // 建筑 :id 子路径
  if ((mt = p.match(/^\/api\/buildings\/(\d+)\/generate-image$/)) && m === 'POST') return handleBuildingGenerateImage(Number(mt[1]), body || {});
  if ((mt = p.match(/^\/api\/buildings\/(\d+)\/image$/)) && m === 'DELETE') return handleBuildingImageDelete(Number(mt[1]));

  // 环境变体 :id 子路径
  if ((mt = p.match(/^\/api\/environment-variants\/(\d+)\/generate-faces$/)) && m === 'POST') return handleVariantGenerateFaces(Number(mt[1]), body || {});

  return null;
}
