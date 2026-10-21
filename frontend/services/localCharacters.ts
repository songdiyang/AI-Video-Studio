// 角色域本地路由（localCharacters）
//
// 接管 /api/characters 下 routeRest 通用 CRUD 之外的所有特殊子路径：
//   状态（states）、按分类、激活、复制、历史、白膜图、三视图/概念图生成、状态视图生成、
//   提示词生成、上传参考图、视图删除、参考图开关、生成状态、项目绑定、装配（loadout）、
//   穿戴服装（equipped-costume / costumes）、标签分组（tag-groups）。
//
// 通用列表 / 详情 / 单条 CRUD / /project/:id 由 localRest.routeRest 处理，这里不重复匹配。

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

// ==================== 视图提示词组装 ====================
function buildViewPrompts(ch: any): { front: string; side: string; back: string } {
  const base = String(ch.front_prompt || ch.generation_prompt || ch.base_appearance || ch.description || ch.name || '角色设定图');
  return {
    front: ch.front_prompt || `${base}，正面全身设定图，白色背景`,
    side: ch.side_prompt || `${base}，侧面全身设定图，白色背景`,
    back: ch.back_prompt || `${base}，背面全身设定图，白色背景`,
  };
}

// ==================== 处理器 ====================

async function handleStatesList(charId: number, byCategory: boolean, category?: string): Promise<Response> {
  const path = activePath();
  if (!path) return jsonResponse({ states: [], grouped: {} });
  const doc = await loadRestDoc(path, 'characterStates');
  let states = doc.items.filter((s) => Number(s.character_id) === charId);
  if (byCategory && category) states = states.filter((s) => s.state_category === category);
  if (!byCategory) return jsonResponse({ states });
  const grouped: Record<string, any[]> = {};
  for (const s of states) {
    const key = s.state_category || 'other';
    (grouped[key] ||= []).push(s);
  }
  return jsonResponse({ states, grouped });
}

async function handleStateCreate(charId: number, body: any): Promise<Response> {
  const path = await resolvePath(body?.project_id ?? body?.projectId);
  if (!path) return jsonResponse({ message: '未打开本地工程' }, 400);
  const doc = await loadRestDoc(path, 'characterStates');
  const now = new Date().toISOString();
  const incoming = normalizeKeys(body);
  const state = {
    ...incoming,
    id: doc.nextId++,
    character_id: charId,
    state_category: incoming.state_category || 'daily',
    is_base_model: !!incoming.is_base_model,
    is_active: !!incoming.is_active,
    created_at: now,
    updated_at: now,
  };
  doc.items.push(state);
  saveRestDoc(path, 'characterStates', doc);
  return jsonResponse({ state });
}

async function handleStateUpdate(charId: number, stateId: number, body: any): Promise<Response> {
  const path = await resolvePath(body?.project_id ?? body?.projectId);
  if (!path) return jsonResponse({ message: '未打开本地工程' }, 400);
  const doc = await loadRestDoc(path, 'characterStates');
  const state = findById(doc.items, stateId);
  if (!state || !assertProject(state, path)) return jsonResponse({ message: '状态不存在' }, 404);
  const incoming = normalizeKeys(body);
  delete incoming.id;
  Object.assign(state, incoming, { updated_at: new Date().toISOString() });
  saveRestDoc(path, 'characterStates', doc);
  return jsonResponse({ state });
}

async function handleStateDelete(charId: number, stateId: number): Promise<Response> {
  const path = activePath();
  if (!path) return jsonResponse({ message: '未打开本地工程' }, 400);
  const doc = await loadRestDoc(path, 'characterStates');
  doc.items = doc.items.filter((s) => !(Number(s.id) === stateId && Number(s.character_id) === charId));
  saveRestDoc(path, 'characterStates', doc);
  return jsonResponse({ message: 'deleted' });
}

async function handleStateActivate(charId: number, stateId: number): Promise<Response> {
  const path = activePath();
  if (!path) return jsonResponse({ message: '未打开本地工程' }, 400);
  const doc = await loadRestDoc(path, 'characterStates');
  let activated: any = null;
  for (const s of doc.items) {
    if (Number(s.character_id) !== charId) continue;
    const on = Number(s.id) === stateId;
    s.is_active = on;
    if (on) activated = s;
  }
  if (!activated) return jsonResponse({ message: '状态不存在' }, 404);
  activated.updated_at = new Date().toISOString();
  saveRestDoc(path, 'characterStates', doc);
  // 同步角色激活状态指针
  const cdoc = await loadRestDoc(path, 'characters');
  const ch = findById(cdoc.items, charId);
  if (ch) {
    ch.active_state_id = stateId;
    saveRestDoc(path, 'characters', cdoc);
  }
  return jsonResponse({ state: activated });
}

async function handleStateDuplicate(charId: number, stateId: number, body: any): Promise<Response> {
  const path = await resolvePath(body?.project_id ?? body?.projectId);
  if (!path) return jsonResponse({ message: '未打开本地工程' }, 400);
  const doc = await loadRestDoc(path, 'characterStates');
  const src = findById(doc.items, stateId);
  if (!src || !assertProject(src, path)) return jsonResponse({ message: '状态不存在' }, 404);
  const now = new Date().toISOString();
  const clone = {
    ...src,
    id: doc.nextId++,
    name: body?.newName || `${src.name || '状态'} 副本`,
    is_active: false,
    created_at: now,
    updated_at: now,
  };
  doc.items.push(clone);
  saveRestDoc(path, 'characterStates', doc);
  return jsonResponse({ state: clone });
}

async function handleStateBaseModelImageDelete(charId: number, stateId: number): Promise<Response> {
  const path = activePath();
  if (!path) return jsonResponse({ message: '未打开本地工程' }, 400);
  const doc = await loadRestDoc(path, 'characterStates');
  const state = findById(doc.items, stateId);
  if (!state || !assertProject(state, path)) return jsonResponse({ message: '状态不存在' }, 404);
  for (const f of ['image_url', 'front_view_url', 'side_view_url', 'back_view_url']) state[f] = null;
  state.updated_at = new Date().toISOString();
  saveRestDoc(path, 'characterStates', doc);
  return jsonResponse({ state });
}

// 状态三视图生成（作用于 characterStates）
async function handleStateGenerateViews(charId: number, stateId: number, body: any): Promise<Response> {
  const path = await resolvePath(body?.project_id ?? body?.projectId);
  if (!path) return jsonResponse({ message: '未打开本地工程' }, 400);
  const doc = await loadRestDoc(path, 'characterStates');
  const state = findById(doc.items, stateId);
  if (!state || !assertProject(state, path)) return jsonResponse({ message: '状态不存在' }, 404);
  const cdoc = await loadRestDoc(path, 'characters');
  const ch = findById(cdoc.items, charId) || {};
  if (!assertProject(ch, path)) return jsonResponse({ message: '角色不存在' }, 404);
  const projectId = Number(ch.project_id) || 0;
  const prompts = buildViewPrompts({ ...ch, ...state });
  state.generation_status = 'generating';
  saveRestDoc(path, 'characterStates', doc);
  const jobId = submitGenJob({
    workflowType: 'character_state_views_generation',
    workflowName: '角色状态三视图生成',
    projectId,
    inputParams: { characterId: charId, stateId, imageModel: body?.imageModel, characterName: ch.name, stateName: state.name },
    run: async () => {
      const front = await genImageToUrl({ imageModel: body?.imageModel, prompt: prompts.front, projectId, nameHint: `char${charId}_state${stateId}_front` });
      const side = await genImageToUrl({ imageModel: body?.imageModel, prompt: prompts.side, projectId, nameHint: `char${charId}_state${stateId}_side` });
      const back = await genImageToUrl({ imageModel: body?.imageModel, prompt: prompts.back, projectId, nameHint: `char${charId}_state${stateId}_back` });
      const d2 = await loadRestDoc(path, 'characterStates');
      const st = findById(d2.items, stateId);
      if (st) {
        Object.assign(st, { front_view_url: front, side_view_url: side, back_view_url: back, image_url: front, generation_status: 'completed', updated_at: new Date().toISOString() });
        saveRestDoc(path, 'characterStates', d2);
      }
      return { front_view_url: front, side_view_url: side, back_view_url: back };
    },
  });
  return jsonResponse({ message: 'generating', jobId, characterId: charId, stateId, status: 'generating' });
}

// 角色三视图生成（作用于 character 本体，白膜降级路径）
async function handleGenerateViews(charId: number, body: any): Promise<Response> {
  const path = await resolvePath(body?.project_id ?? body?.projectId);
  if (!path) return jsonResponse({ message: '未打开本地工程' }, 400);
  const doc = await loadRestDoc(path, 'characters');
  const ch = findById(doc.items, charId);
  if (!ch || !assertProject(ch, path)) return jsonResponse({ message: '角色不存在' }, 404);
  const projectId = Number(ch.project_id) || 0;
  const prompts = buildViewPrompts(ch);
  ch.generation_status = 'generating';
  saveRestDoc(path, 'characters', doc);
  const jobId = submitGenJob({
    workflowType: 'character_views_generation',
    workflowName: '角色三视图生成',
    projectId,
    inputParams: { characterId: charId, imageModel: body?.imageModel, characterName: ch.name },
    run: async () => {
      const front = await genImageToUrl({ imageModel: body?.imageModel, prompt: prompts.front, projectId, nameHint: `char${charId}_front` });
      const side = await genImageToUrl({ imageModel: body?.imageModel, prompt: prompts.side, projectId, nameHint: `char${charId}_side` });
      const back = await genImageToUrl({ imageModel: body?.imageModel, prompt: prompts.back, projectId, nameHint: `char${charId}_back` });
      const d2 = await loadRestDoc(path, 'characters');
      const c = findById(d2.items, charId);
      if (c) {
        Object.assign(c, { front_view_url: front, side_view_url: side, back_view_url: back, image_url: front, generation_status: 'completed', updated_at: new Date().toISOString() });
        saveRestDoc(path, 'characters', d2);
      }
      return { front_view_url: front, side_view_url: side, back_view_url: back, image_url: front };
    },
  });
  return jsonResponse({ message: 'generating', jobId, characterId: charId, status: 'generating' });
}

async function handleGenerateConcept(charId: number, body: any): Promise<Response> {
  const path = await resolvePath(body?.project_id ?? body?.projectId);
  if (!path) return jsonResponse({ message: '未打开本地工程' }, 400);
  const doc = await loadRestDoc(path, 'characters');
  const ch = findById(doc.items, charId);
  if (!ch || !assertProject(ch, path)) return jsonResponse({ message: '角色不存在' }, 404);
  const projectId = Number(ch.project_id) || 0;
  const prompt = String(ch.generation_prompt || ch.concept_prompt || ch.base_appearance || ch.description || ch.name || '角色概念分解图');
  ch.concept_status = 'generating';
  saveRestDoc(path, 'characters', doc);
  const jobId = submitGenJob({
    workflowType: 'character_concept_generation',
    workflowName: '角色概念分解图生成',
    projectId,
    inputParams: { characterId: charId, imageModel: body?.imageModel, characterName: ch.name },
    run: async () => {
      const url = await genImageToUrl({ imageModel: body?.imageModel, prompt, projectId, nameHint: `char${charId}_concept` });
      const d2 = await loadRestDoc(path, 'characters');
      const c = findById(d2.items, charId);
      if (c) {
        Object.assign(c, { concept_image_url: url, concept_status: 'completed', updated_at: new Date().toISOString() });
        saveRestDoc(path, 'characters', d2);
      }
      return { concept_image_url: url };
    },
  });
  return jsonResponse({ message: 'generating', jobId, characterId: charId, status: 'generating' });
}

// 角色三视图提示词生成（纯文本）
async function handleGenerateImagePrompt(charId: number, body: any): Promise<Response> {
  const path = await resolvePath(body?.project_id ?? body?.projectId);
  if (!path) return jsonResponse({ message: '未打开本地工程' }, 400);
  const doc = await loadRestDoc(path, 'characters');
  const ch = findById(doc.items, charId);
  if (!ch || !assertProject(ch, path)) return jsonResponse({ message: '角色不存在' }, 404);
  const model = await pickTextModel(body?.textModel);
  if (!model) return jsonResponse({ message: '请先配置可用的文本模型' }, 400);
  const sys =
    '你是专业的 AI 绘画提示词工程师。基于角色设定，产出正面/侧面/背面三视图的高质量提示词。' +
    '严格只输出 JSON：{"style":"画风","front":"正面提示词","side":"侧面提示词","back":"背面提示词"}，全部中文。';
  const user = `角色名称：${ch.name || ''}\n基础外貌/设定：${ch.base_appearance || ch.description || ''}\n用户补充：${body?.userNote || ''}`;
  const parsed = await chatJson(model, sys, user);
  const promptFront = body?.basePromptFront || parsed?.front || '';
  const promptSide = body?.basePromptSide || parsed?.side || '';
  const promptBack = body?.basePromptBack || parsed?.back || '';
  const views = ['front', 'side', 'back'];
  if (parsed) {
    Object.assign(ch, {
      front_prompt: promptFront, side_prompt: promptSide, back_prompt: promptBack,
      style: parsed.style || ch.style, updated_at: new Date().toISOString(),
    });
    saveRestDoc(path, 'characters', doc);
  }
  return jsonResponse({ message: 'ok', characterId: charId, style: parsed?.style || ch.style || '', views, promptFront, promptSide, promptBack });
}

async function handleUploadImage(charId: number, body: any): Promise<Response> {
  const path = await resolvePath(body?.project_id ?? body?.projectId);
  if (!path) return jsonResponse({ message: '未打开本地工程' }, 400);
  const doc = await loadRestDoc(path, 'characters');
  const ch = findById(doc.items, charId);
  if (!ch || !assertProject(ch, path)) return jsonResponse({ message: '角色不存在' }, 404);
  const dataUrl = body?.image || body?.image_url || '';
  let imageUrl = String(dataUrl);
  if (/^(data:|https?:)/i.test(imageUrl)) {
    try {
      imageUrl = await genPersistFromSrc(Number(ch.project_id) || 0, imageUrl);
    } catch {
      /* 落地失败保留原值 */
    }
  }
  ch.image_url = imageUrl;
  ch.updated_at = new Date().toISOString();
  saveRestDoc(path, 'characters', doc);
  return jsonResponse({ image_url: imageUrl });
}

async function genPersistFromSrc(projectId: number, src: string): Promise<string> {
  // 复用出图落地：直接把已有 URL/data 落地到工程 media/
  const { persistGeneratedMedia } = await import('./localMedia');
  return persistGeneratedMedia(projectId, src, 'upload');
}

async function handleDeleteView(charId: number, viewType: string): Promise<Response> {
  const path = activePath();
  if (!path) return jsonResponse({ message: '未打开本地工程' }, 400);
  const doc = await loadRestDoc(path, 'characters');
  const ch = findById(doc.items, charId);
  if (!ch || !assertProject(ch, path)) return jsonResponse({ message: '角色不存在' }, 404);
  const field = `${viewType}_view_url`;
  if (['front', 'side', 'back'].includes(viewType)) ch[field] = null;
  ch.image_url = ch.front_view_url || ch.side_view_url || ch.back_view_url || null;
  ch.updated_at = new Date().toISOString();
  saveRestDoc(path, 'characters', doc);
  return jsonResponse({
    message: 'deleted',
    front_view_url: ch.front_view_url || null,
    side_view_url: ch.side_view_url || null,
    back_view_url: ch.back_view_url || null,
    image_url: ch.image_url || null,
  });
}

async function handleGenerationStatus(charId: number): Promise<Response> {
  const path = activePath();
  if (!path) return jsonResponse({ status: 'idle' });
  const doc = await loadRestDoc(path, 'characters');
  const ch = findById(doc.items, charId) || {};
  return jsonResponse({
    status: ch.generation_status || 'idle',
    conceptStatus: ch.concept_status || 'idle',
    conceptImageUrl: ch.concept_image_url || null,
    useReferenceImages: !!ch.use_reference_images,
  });
}

async function handleUseReferenceImages(charId: number, body: any): Promise<Response> {
  const path = await resolvePath(body?.project_id ?? body?.projectId);
  if (!path) return jsonResponse({ message: '未打开本地工程' }, 400);
  const doc = await loadRestDoc(path, 'characters');
  const ch = findById(doc.items, charId);
  if (!ch || !assertProject(ch, path)) return jsonResponse({ message: '角色不存在' }, 404);
  ch.use_reference_images = !!(body?.use_reference_images ?? body?.useReferenceImages);
  saveRestDoc(path, 'characters', doc);
  return jsonResponse({ message: 'updated', useReferenceImages: ch.use_reference_images });
}

// 绑定：把角色暴露到更多项目
async function handleBindingsGet(charId: number): Promise<Response> {
  const path = activePath();
  if (!path) return jsonResponse({ characterId: charId, bindings: [] });
  const doc = await loadRestDoc(path, 'characters');
  const ch = findById(doc.items, charId);
  if (!ch) return jsonResponse({ characterId: charId, bindings: [] });
  const bindings = Array.isArray(ch.bindings) && ch.bindings.length
    ? ch.bindings
    : [{ project_id: Number(ch.project_id) || 0, role: 'owner' }];
  return jsonResponse({ characterId: charId, bindings });
}

async function handleBindingAdd(charId: number, body: any): Promise<Response> {
  const path = activePath();
  if (!path) return jsonResponse({ message: '未打开本地工程' }, 400);
  const doc = await loadRestDoc(path, 'characters');
  const ch = findById(doc.items, charId);
  if (!ch) return jsonResponse({ message: '角色不存在' }, 404);
  const pid = Number(body?.projectId ?? body?.project_id);
  if (!Number.isFinite(pid)) return jsonResponse({ message: '缺少 projectId' }, 400);
  ch.bindings = Array.isArray(ch.bindings) ? ch.bindings : [{ project_id: Number(ch.project_id) || 0, role: 'owner' }];
  if (!ch.bindings.some((b: any) => Number(b.project_id) === pid)) ch.bindings.push({ project_id: pid, role: 'member' });
  saveRestDoc(path, 'characters', doc);
  return jsonResponse({ message: 'bound' });
}

async function handleBindingRemove(charId: number, projectId: number): Promise<Response> {
  const path = activePath();
  if (!path) return jsonResponse({ message: '未打开本地工程' }, 400);
  const doc = await loadRestDoc(path, 'characters');
  const ch = findById(doc.items, charId);
  if (!ch) return jsonResponse({ message: '角色不存在' }, 404);
  const arr = Array.isArray(ch.bindings) ? ch.bindings : [];
  const target = arr.find((b: any) => Number(b.project_id) === projectId);
  if (target && target.role === 'owner') return jsonResponse({ message: '不能解除 owner 绑定' }, 400);
  ch.bindings = arr.filter((b: any) => Number(b.project_id) !== projectId);
  saveRestDoc(path, 'characters', doc);
  return jsonResponse({ message: 'unbound' });
}

// 装配 loadout
async function handleLoadoutGet(charId: number): Promise<Response> {
  const path = activePath();
  const doc = path ? await loadRestDoc(path, 'characters') : { items: [] };
  const ch = findById(doc.items, charId) || {};
  return jsonResponse({ characterId: charId, loadout: ch.loadout || { costumeStateId: null, expressionStateId: null } });
}

async function handleLoadoutPut(charId: number, body: any): Promise<Response> {
  const path = await resolvePath(body?.project_id ?? body?.projectId);
  if (!path) return jsonResponse({ message: '未打开本地工程' }, 400);
  const doc = await loadRestDoc(path, 'characters');
  const ch = findById(doc.items, charId);
  if (!ch || !assertProject(ch, path)) return jsonResponse({ message: '角色不存在' }, 404);
  const loadout = {
    costumeStateId: body?.costumeStateId ?? body?.costume_state_id ?? null,
    expressionStateId: body?.expressionStateId ?? body?.expression_state_id ?? null,
  };
  ch.loadout = loadout;
  saveRestDoc(path, 'characters', doc);
  return jsonResponse({ message: 'updated', characterId: charId, loadout });
}

// 服装穿戴
async function handleCharacterCostumesGet(charId: number): Promise<Response> {
  const path = activePath();
  const cdoc = path ? await loadRestDoc(path, 'characters') : { items: [] };
  const ch = findById(cdoc.items, charId) || {};
  const gender = ch.gender || 'unisex';
  if (!path) return jsonResponse({ costumes: [], characterGender: gender });
  const codoc = await loadRestDoc(path, 'costumes');
  const owned = codoc.items.filter((c) => Number(c.character_id) === charId);
  const costumes = owned.map((c) => ({ ...c, is_equipped: Number(ch.equipped_costume_id) === Number(c.id), equipped_at: c.equipped_at }));
  return jsonResponse({ costumes, characterGender: gender });
}

async function handleCostumeEquip(charId: number, costumeId: number): Promise<Response> {
  const path = activePath();
  if (!path) return jsonResponse({ message: '未打开本地工程' }, 400);
  const cdoc = await loadRestDoc(path, 'characters');
  const ch = findById(cdoc.items, charId);
  if (!ch || !assertProject(ch, path)) return jsonResponse({ message: '角色不存在' }, 404);
  ch.equipped_costume_id = costumeId;
  saveRestDoc(path, 'characters', cdoc);
  const codoc = await loadRestDoc(path, 'costumes');
  const costume = findById(codoc.items, costumeId) || null;
  return jsonResponse({ costume });
}

async function handleCostumeUnequip(charId: number, costumeId: number): Promise<Response> {
  const path = activePath();
  if (!path) return jsonResponse({ message: '未打开本地工程' }, 400);
  const cdoc = await loadRestDoc(path, 'characters');
  const ch = findById(cdoc.items, charId);
  if (ch && Number(ch.equipped_costume_id) === costumeId) ch.equipped_costume_id = null;
  saveRestDoc(path, 'characters', cdoc);
  return jsonResponse({ message: 'unequipped' });
}

async function handleEquippedCostume(charId: number): Promise<Response> {
  const path = activePath();
  const cdoc = path ? await loadRestDoc(path, 'characters') : { items: [] };
  const ch = findById(cdoc.items, charId) || {};
  if (!path || !ch.equipped_costume_id) return jsonResponse({ costume: null });
  const codoc = await loadRestDoc(path, 'costumes');
  return jsonResponse({ costume: findById(codoc.items, ch.equipped_costume_id) || null });
}

// 标签分组
async function handleTagGroupsGet(): Promise<Response> {
  const path = activePath();
  if (!path) return jsonResponse({ tagGroups: [] });
  const doc = await loadRestDoc(path, 'tagGroups');
  return jsonResponse({ tagGroups: doc.items });
}

async function handleTagGroupCreate(body: any): Promise<Response> {
  const path = activePath();
  if (!path) return jsonResponse({ message: '未打开本地工程' }, 400);
  const doc = await loadRestDoc(path, 'tagGroups');
  const now = new Date().toISOString();
  const incoming = normalizeKeys(body);
  const group = { ...incoming, id: doc.nextId++, created_at: now, updated_at: now };
  doc.items.push(group);
  saveRestDoc(path, 'tagGroups', doc);
  return jsonResponse({ tagGroup: group });
}

async function handleTagGroupUpdate(id: number, body: any): Promise<Response> {
  const path = activePath();
  if (!path) return jsonResponse({ message: '未打开本地工程' }, 400);
  const doc = await loadRestDoc(path, 'tagGroups');
  const g = findById(doc.items, id);
  if (!g) return jsonResponse({ message: '标签分组不存在' }, 404);
  Object.assign(g, normalizeKeys(body), { id, updated_at: new Date().toISOString() });
  saveRestDoc(path, 'tagGroups', doc);
  return jsonResponse({ tagGroup: g });
}

async function handleTagGroupDelete(id: number): Promise<Response> {
  const path = activePath();
  if (!path) return jsonResponse({ message: '未打开本地工程' }, 400);
  const doc = await loadRestDoc(path, 'tagGroups');
  doc.items = doc.items.filter((g) => Number(g.id) !== id);
  saveRestDoc(path, 'tagGroups', doc);
  return jsonResponse({ message: 'deleted' });
}

// ==================== 路由入口 ====================
export async function routeCharacters(url: URL, method: string, body: any): Promise<Response | null> {
  const p = url.pathname;
  const m = method.toUpperCase();
  let mt: RegExpMatchArray | null;

  // 标签分组（固定段，先于 :id）
  if (p === '/api/characters/tag-groups') {
    if (m === 'GET') return handleTagGroupsGet();
    if (m === 'POST') return handleTagGroupCreate(body || {});
  }
  if ((mt = p.match(/^\/api\/characters\/tag-groups\/(\d+)$/))) {
    if (m === 'PUT' || m === 'PATCH') return handleTagGroupUpdate(Number(mt[1]), body || {});
    if (m === 'DELETE') return handleTagGroupDelete(Number(mt[1]));
  }

  // 状态：by-category
  if ((mt = p.match(/^\/api\/characters\/(\d+)\/states\/by-category$/))) {
    if (m === 'GET') return handleStatesList(Number(mt[1]), true, url.searchParams.get('category') || undefined);
  }
  // 状态：历史（回放空历史）
  if ((mt = p.match(/^\/api\/characters\/(\d+)\/states\/history$/))) {
    if (m === 'GET') return jsonResponse({ history: [], total: 0 });
  }
  if ((mt = p.match(/^\/api\/characters\/(\d+)\/states\/(\d+)\/history$/))) {
    if (m === 'GET') return jsonResponse({ history: [], total: 0 });
  }
  // 状态：base-model-image 清除
  if ((mt = p.match(/^\/api\/characters\/(\d+)\/states\/(\d+)\/base-model-image$/)) && m === 'DELETE') {
    return handleStateBaseModelImageDelete(Number(mt[1]), Number(mt[2]));
  }
  // 状态：activate
  if ((mt = p.match(/^\/api\/characters\/(\d+)\/states\/(\d+)\/activate$/)) && m === 'PUT') {
    return handleStateActivate(Number(mt[1]), Number(mt[2]));
  }
  // 状态：duplicate
  if ((mt = p.match(/^\/api\/characters\/(\d+)\/states\/(\d+)\/duplicate$/)) && m === 'POST') {
    return handleStateDuplicate(Number(mt[1]), Number(mt[2]), body || {});
  }
  // 状态：generate-views
  if ((mt = p.match(/^\/api\/characters\/(\d+)\/states\/(\d+)\/generate-views$/)) && m === 'POST') {
    return handleStateGenerateViews(Number(mt[1]), Number(mt[2]), body || {});
  }
  // 状态：analyze（文本，返回中性摘要）
  if ((mt = p.match(/^\/api\/characters\/(\d+)\/states\/(\d+)\/analyze$/)) && m === 'POST') {
    return jsonResponse({ message: 'ok', analysis: '' });
  }
  // 状态：列表 / 创建
  if ((mt = p.match(/^\/api\/characters\/(\d+)\/states$/))) {
    if (m === 'GET') return handleStatesList(Number(mt[1]), false);
    if (m === 'POST') return handleStateCreate(Number(mt[1]), body || {});
  }
  // 状态：更新 / 删除
  if ((mt = p.match(/^\/api\/characters\/(\d+)\/states\/(\d+)$/))) {
    if (m === 'PUT' || m === 'PATCH') return handleStateUpdate(Number(mt[1]), Number(mt[2]), body || {});
    if (m === 'DELETE') return handleStateDelete(Number(mt[1]), Number(mt[2]));
  }
  // 激活状态
  if ((mt = p.match(/^\/api\/characters\/(\d+)\/active-state$/)) && m === 'GET') {
    const path = activePath();
    const doc = path ? await loadRestDoc(path, 'characterStates') : { items: [] };
    const active = doc.items.find((s) => Number(s.character_id) === Number(mt![1]) && s.is_active) || null;
    return jsonResponse({ state: active });
  }

  // 服装：equip / unequip / 关系 / 穿戴
  if ((mt = p.match(/^\/api\/characters\/(\d+)\/costumes\/(\d+)\/equip$/)) && m === 'POST') return handleCostumeEquip(Number(mt[1]), Number(mt[2]));
  if ((mt = p.match(/^\/api\/characters\/(\d+)\/costumes\/(\d+)\/unequip$/)) && m === 'POST') return handleCostumeUnequip(Number(mt[1]), Number(mt[2]));
  if ((mt = p.match(/^\/api\/characters\/(\d+)\/costumes\/(\d+)$/)) && m === 'DELETE') return handleCostumeUnequip(Number(mt[1]), Number(mt[2]));
  if ((mt = p.match(/^\/api\/characters\/(\d+)\/costumes$/)) && m === 'GET') return handleCharacterCostumesGet(Number(mt[1]));
  if ((mt = p.match(/^\/api\/characters\/(\d+)\/equipped-costume$/)) && m === 'GET') return handleEquippedCostume(Number(mt[1]));

  // 绑定
  if ((mt = p.match(/^\/api\/characters\/(\d+)\/bindings\/(\d+)$/)) && m === 'DELETE') return handleBindingRemove(Number(mt[1]), Number(mt[2]));
  if ((mt = p.match(/^\/api\/characters\/(\d+)\/bindings$/))) {
    if (m === 'GET') return handleBindingsGet(Number(mt[1]));
    if (m === 'POST') return handleBindingAdd(Number(mt[1]), body || {});
  }

  // loadout
  if ((mt = p.match(/^\/api\/characters\/(\d+)\/loadout$/))) {
    if (m === 'GET') return handleLoadoutGet(Number(mt[1]));
    if (m === 'PUT' || m === 'PATCH') return handleLoadoutPut(Number(mt[1]), body || {});
  }

  // composite（合成图：本地回退取角色主图）
  if ((mt = p.match(/^\/api\/characters\/(\d+)\/composite$/)) && m === 'GET') {
    const path = activePath();
    const doc = path ? await loadRestDoc(path, 'characters') : { items: [] };
    const ch = findById(doc.items, Number(mt[1])) || {};
    return jsonResponse({ imageUrl: ch.image_url || null, compositeImageUrl: ch.image_url || null });
  }

  // 生成类
  if ((mt = p.match(/^\/api\/characters\/(\d+)\/generate-views$/)) && m === 'POST') return handleGenerateViews(Number(mt[1]), body || {});
  if ((mt = p.match(/^\/api\/characters\/(\d+)\/generate-concept$/)) && m === 'POST') return handleGenerateConcept(Number(mt[1]), body || {});
  if ((mt = p.match(/^\/api\/characters\/(\d+)\/generate-image-prompt$/)) && m === 'POST') return handleGenerateImagePrompt(Number(mt[1]), body || {});
  if ((mt = p.match(/^\/api\/characters\/(\d+)\/upload-image$/)) && m === 'POST') return handleUploadImage(Number(mt[1]), body || {});
  if ((mt = p.match(/^\/api\/characters\/(\d+)\/views\/(front|side|back)$/)) && m === 'DELETE') return handleDeleteView(Number(mt[1]), mt[2]);
  if ((mt = p.match(/^\/api\/characters\/(\d+)\/generation-status$/)) && m === 'GET') return handleGenerationStatus(Number(mt[1]));
  if ((mt = p.match(/^\/api\/characters\/(\d+)\/use-reference-images$/)) && m === 'PUT') return handleUseReferenceImages(Number(mt[1]), body || {});

  return null;
}
