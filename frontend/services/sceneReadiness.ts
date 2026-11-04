// 分镜出图/出视频的前置就绪校验与参考图收集（sceneReadiness）
//
// 为什么需要这一层：
//  - 云端契约里预检走 /api/storyboards/{id}/validate，本地化后该端点从未实现，
//    未命中的请求会被 localApiRouter 兜底成 HTTP 200 + 空对象，校验因此恒等于「通过」，
//    角色/影棚/道具还没出图就能生成首帧 —— 模型只能凭空编一张脸，一致性必然崩。
//  - 出图请求的参考图此前只来自调用方 params 里的草图字段，工程资产库里
//    已经生成好的角色立绘、影棚九宫格、道具图从未被收集进去。
// 因此这里把「是否允许生成」和「带哪些参考图」收口成一份本地权威判定，
// UI 预检、工作流执行、批量生成、智能体动作全部读同一口径。
//
// 就绪口径（与资源面板/分镜元数据条一致）：
//  - 角色：白膜正/侧/背三视图齐才算就绪，参考图取「当前激活状态正面图 → 白膜正面图 → 设定图」；
//  - 影棚：九宫组装图 → 封面图 → 主环境图，三者全无视为未出图；
//  - 道具：库里存在该道具却没图视为阻断；名称不在道具库视为单镜头临时物件，只警告
//    （拆分口径本就要求道具跨 2 个镜头才入库，临时物件不该阻断出图）。

import { readDoc, resolveLocalPath, getActiveProjectPath } from './localStore';
import { restStore } from './localRest';

/** 出图/出视频两类预检共用，视频额外要求首帧已存在 */
export type ReadinessType = 'frame' | 'video';

/**
 * 阻断项指向的具体资产：UI 要据此一键跳到该资产去补图。
 * 只有能在资产库里定位到 ID 的缺项才带得上（「角色不在库里」这类只能让用户先建）。
 */
export interface ReadinessAssetRef {
  kind: 'character' | 'studio' | 'prop';
  id: number;
  name: string;
}

export interface ReadinessIssue {
  type: string;
  message: string;
  blocking: boolean;
  asset?: ReadinessAssetRef;
}

/** 一张可提交给厂商的参考图：name 用于在提示词里指代，url 用于取图 */
export interface SceneReference {
  kind: 'character' | 'studio' | 'prop';
  name: string;
  url: string;
}

export interface ReadinessResult {
  ready: boolean;
  issues: ReadinessIssue[];
  references: SceneReference[];
}

export interface ShotAssets {
  characters: string[];
  location: string;
  props: string[];
  prompt: string;
  firstFrame?: string;
}

interface CharacterAsset {
  /** 角色库 ID：缺图时要能跳到该资产，旧快照可能没带 */
  id?: number;
  name: string;
  views: { front: string; side: string; back: string };
  refUrl: string;
}
interface StudioAsset {
  /** 影棚库 ID（只有来自 studios 的条目才认，场景同名条目无法用 getStudio 打开） */
  id?: number;
  name: string;
  refUrl: string;
}
interface PropAsset {
  id?: number;
  name: string;
  refUrl: string;
}
export interface AssetSnapshot {
  characters: CharacterAsset[];
  studios: StudioAsset[];
  props: PropAsset[];
}

/** 提示词中的参考图指代段标记：按它做幂等替换，避免多次生成时段落堆叠 */
export const REFERENCE_CLAUSE_MARK = '【参考图指代】';

/** 方舟 Seedream 多图参考的实用上限：再多既拖慢请求，模型也顾不过来 */
const MAX_REFERENCE_IMAGES = 8;

// ==================== 非角色群体词过滤 ====================
// 与拆分/后端 characterFilter 口径一致：这类词没有「角色资产」可言，不该要求白膜。
const NON_CHARACTER_TERMS = new Set([
  '人群', '路人', '群众', '众人', '行人', '观众', '围观者', '人们',
  '群演', '背景人物', '旁人', '陌生人', '过客', '游客', '旅客',
  '村民', '居民', '市民', '百姓', '民众', '平民',
  '士兵', '卫兵', '侍卫', '侍女', '仆人', '随从', '下人', '杂兵', '守卫',
  '商贩', '小贩', '摊贩', '店员', '伙计',
  '僧人', '僧侣', '道士', '和尚',
  '乘客', '旅人', '客人', '宾客', '来宾',
  '工人', '农民', '渔民', '猎人',
  '顾客', '买家', '卖家', '食客', '住客', '房客', '租客', '访客',
  '同学们', '学生们', '老师们', '孩子们', '小朋友', '少年们',
  '记者', '警察', '医生', '护士',
  '大人', '小孩', '老人', '少女', '少年', '青年', '中年人', '老年人',
  '男人', '女人', '男子', '女子', '男孩', '女孩',
  '众人们', '其他人', '周围的人', '附近的人', '身边的人',
  'NPC', 'npc', '龙套', '配角们', '路人甲', '路人乙',
  '少年少女', '其他少年少女', '其他人物', '其他角色', '其他同学',
  '一群人', '几个人', '数人', '若干人', '男女', '老少', '老幼', '男女老少',
]);

const NON_CHARACTER_PREFIXES = ['其他', '其余', '另外', '别的', '一些', '几个', '几名', '一群', '数个', '数名', '若干', '部分', '剩余', '周围'];

const NON_CHARACTER_ROOTS = [
  '少年', '少女', '青年', '小孩', '孩子', '男孩', '女孩', '男子', '女子',
  '人物', '角色', '同学', '学生', '老师', '路人', '村民', '居民', '市民',
  '士兵', '卫兵', '侍卫', '商贩', '行人', '观众', '游客', '乘客', '客人', '顾客',
  '少年少女', '男女', '人', '人们', '群众', '百姓',
];

/** 是否为「无需角色资产」的群体/泛指词 */
export function isNonCharacterEntity(name: string): boolean {
  if (!name || typeof name !== 'string') return true;
  const trimmed = name.trim();
  if (!trimmed) return true;
  if (NON_CHARACTER_TERMS.has(trimmed)) return true;
  if (trimmed.endsWith('们') && NON_CHARACTER_TERMS.has(trimmed.slice(0, -1))) return true;
  for (const prefix of NON_CHARACTER_PREFIXES) {
    if (trimmed.startsWith(prefix)) {
      const rest = trimmed.slice(prefix.length).replace(/的$/, '').replace(/们$/, '');
      if (!rest || NON_CHARACTER_TERMS.has(rest)) return true;
      for (const root of NON_CHARACTER_ROOTS) {
        if (rest === root || rest.includes(root)) return true;
      }
    }
  }
  if (/^.{0,2}(等人|等角色|等几人)$/.test(trimmed)) return true;
  return false;
}

function matchByName<T extends { name: string }>(list: T[], query: string): T | undefined {
  const q = String(query || '').trim();
  if (!q) return undefined;
  const exact = list.find((it) => String(it.name).trim() === q);
  if (exact) return exact;
  const key = q.toLowerCase();
  return list.find((it) => String(it.name).trim().toLowerCase() === key);
}

/** 能定位到库 ID 的缺项才生成跳转引用；没 ID 时宁可不给按钮，也别跳去一个打不开的编辑页 */
function assetRef(kind: ReadinessAssetRef['kind'], asset: { id?: number; name: string } | undefined): ReadinessAssetRef | undefined {
  const id = Number(asset?.id);
  return Number.isFinite(id) && id > 0 ? { kind, id, name: asset!.name } : undefined;
}

// ==================== 纯判定核心（可脱离 IO 单测） ====================

/**
 * 判定一个镜头能否出图，并给出应随请求提交的参考图清单。
 * 阻断项按「缺了模型就只能凭空编」来定：没提示词、没角色形象、没场景图都必须拦。
 */
export function evaluateShot(shot: ShotAssets, snapshot: AssetSnapshot, type: ReadinessType): ReadinessResult {
  const issues: ReadinessIssue[] = [];
  const references: SceneReference[] = [];

  if (!String(shot.prompt || '').trim()) {
    issues.push({ type: 'no_prompt', message: '该镜头缺少画面提示词，请先在「提示词」里写好画面描述', blocking: true });
  }

  for (const raw of shot.characters || []) {
    const name = String(raw || '').trim();
    if (!name || isNonCharacterEntity(name)) continue;
    const asset = matchByName(snapshot.characters, name);
    if (!asset) {
      issues.push({ type: 'character_not_found', message: `角色「${name}」不在项目角色库中`, blocking: true });
      continue;
    }
    const { front, side, back } = asset.views;
    if (!(front && side && back)) {
      issues.push({ type: 'character_views_missing', message: `角色「${name}」尚未生成白膜三视图（正/侧/背缺一不可）`, blocking: true, asset: assetRef('character', asset) });
      continue;
    }
    if (asset.refUrl) references.push({ kind: 'character', name, url: asset.refUrl });
    else issues.push({ type: 'character_image_missing', message: `角色「${name}」没有可用的形象图`, blocking: true, asset: assetRef('character', asset) });
  }

  const location = String(shot.location || '').trim();
  if (!location) {
    issues.push({ type: 'no_location', message: '该镜头未指定影棚：出图要求明确场景来源，不能凭空生成环境', blocking: true });
  } else {
    const studio = matchByName(snapshot.studios, location);
    if (!studio) {
      issues.push({ type: 'scene_not_found', message: `影棚「${location}」不在项目影棚库中`, blocking: true });
    } else if (studio.refUrl) {
      references.push({ kind: 'studio', name: location, url: studio.refUrl });
    } else {
      issues.push({
        type: 'scene_image_missing',
        message: `影棚「${location}」还没有场景图（九宫格/封面/主环境图至少有一张）`,
        blocking: true,
        asset: assetRef('studio', studio),
      });
    }
  }

  for (const raw of shot.props || []) {
    const name = String(raw || '').trim();
    if (!name) continue;
    const asset = matchByName(snapshot.props, name);
    if (!asset) {
      // 未入库 = 拆分口径认定的单镜头临时物件，只提示不阻断
      issues.push({ type: 'prop_not_library', message: `道具「${name}」未入道具库，画面一致性只能靠提示词描述`, blocking: false });
      continue;
    }
    if (asset.refUrl) references.push({ kind: 'prop', name, url: asset.refUrl });
    else issues.push({ type: 'prop_image_missing', message: `道具「${name}」还没有道具图`, blocking: true, asset: assetRef('prop', asset) });
  }

  if (type === 'video' && !String(shot.firstFrame || '').trim()) {
    issues.push({ type: 'no_first_frame', message: '生成视频前必须先有首帧画面', blocking: true });
  }

  const trimmed = references.length > MAX_REFERENCE_IMAGES
    ? references.slice(0, MAX_REFERENCE_IMAGES)
    : references;
  if (references.length > MAX_REFERENCE_IMAGES) {
    issues.push({
      type: 'too_many_references',
      message: `参考图超过 ${MAX_REFERENCE_IMAGES} 张，仅保留角色与场景，其余靠文字描述`,
      blocking: false,
    });
  }

  return { ready: !issues.some((i) => i.blocking), issues, references: trimmed };
}

/**
 * 参考图指代段：厂商只按图片顺序编号识别，所以必须把「图片N = 谁」写进提示词，
 * 否则多张参考图进来，模型不知道哪张对应哪个角色，等于白给。
 */
export function buildReferenceClause(refs: SceneReference[]): string {
  if (!refs.length) return '';
  const bits = refs.map((r, i) => {
    const label = r.kind === 'character' ? '的角色形象' : r.kind === 'studio' ? '的场景画面' : '的道具外观';
    return `图片${i + 1}为「${r.name}」${label}`;
  });
  return `画面中人物、场景与道具的外观严格遵循${bits.join('，')}，不得自行改换造型。`;
}

/** 幂等追加指代段：已带该段则原样返回，避免重复生成时段落叠加 */
export function appendReferenceClause(prompt: string, refs: SceneReference[]): string {
  const clause = buildReferenceClause(refs);
  if (!clause) return prompt;
  const base = String(prompt || '').split(REFERENCE_CLAUSE_MARK)[0].trimEnd();
  const sep = base && !base.endsWith('。') ? '。' : '';
  return `${base}${sep}${REFERENCE_CLAUSE_MARK}${clause}`;
}

// ==================== 资产快照读取 ====================

const str = (v: unknown): string => (typeof v === 'string' && v.trim() ? v.trim() : '');

function sameProject(it: any, projectId: number | null): boolean {
  return projectId == null || String(it?.project_id ?? '') === String(projectId);
}

/** 从角色的状态列表里抬出「白膜三视图 + 当前参考图」（白膜优先，没有则回退角色本体字段） */
function pickCharacterViews(ch: any, mine: any[]): { views: { front: string; side: string; back: string }; refUrl: string } {
  const base = mine.find((s) => s?.is_base_model) || ch;
  const active = mine.find((s) => s?.is_active) || null;
  const views = {
    front: str(base?.front_view_url),
    side: str(base?.side_view_url),
    back: str(base?.back_view_url),
  };
  const refUrl = str(active?.front_view_url) || str(active?.image_url) || views.front || str(ch?.image_url);
  return { views, refUrl };
}

/** 角色资产：白膜三视图（优先白膜状态，其次角色自身字段）+ 当前状态正面图作为参考图 */
async function loadCharacterAssets(path: string, projectId: number | null): Promise<CharacterAsset[]> {
  const [chDoc, stDoc] = await Promise.all([
    restStore.loadDoc(path, 'characters'),
    restStore.loadDoc(path, 'characterStates'),
  ]);
  const states = (stDoc.items as any[]).filter((s) => Number(s?.character_id) > 0);
  const out: CharacterAsset[] = [];
  for (const ch of chDoc.items as any[]) {
    if (!sameProject(ch, projectId)) continue;
    const name = str(ch?.name);
    if (!name) continue;
    const mine = states.filter((s) => Number(s.character_id) === Number(ch.id));
    const { views, refUrl } = pickCharacterViews(ch, mine);
    out.push({ id: Number(ch.id) || undefined, name, views, refUrl });
  }
  return out;
}

/**
 * 给角色列表补上「就绪」派生字段。
 * 云端这些字段是后端算好返回的；本地只存 characterStates，所以必须自己算，
 * 否则分镜元数据条里的角色 chip 会永远是「未就绪」（图齐了也不变绿），
 * 与执行层门禁的结论相互矛盾。口径与 evaluateShot 里的角色判定同源。
 */
export async function deriveCharacterReadinessFields(path: string, chars: any[]): Promise<any[]> {
  if (!Array.isArray(chars) || !chars.length) return chars;
  const stDoc = await restStore.loadDoc(path, 'characterStates');
  const states = (stDoc.items as any[]).filter((s) => Number(s?.character_id) > 0);
  return chars.map((ch) => {
    const mine = states.filter((s) => Number(s.character_id) === Number(ch?.id));
    const { views, refUrl } = pickCharacterViews(ch, mine);
    const base = mine.find((s) => s?.is_base_model) || null;
    const active = mine.find((s) => s?.is_active) || null;
    const hasViews = !!(views.front && views.side && views.back);
    return {
      ...ch,
      states_count: ch?.states_count ?? mine.length,
      has_base_model: ch?.has_base_model ?? (base ? 1 : 0),
      has_base_model_views: ch?.has_base_model_views ?? (hasViews ? 1 : 0),
      active_state_name: ch?.active_state_name || str(active?.name),
      active_state_outfit: ch?.active_state_outfit || str(active?.outfit),
      active_state_image_url: ch?.active_state_image_url || refUrl,
      base_model_image_url: ch?.base_model_image_url || views.front || str(base?.image_url),
    };
  });
}

/** 影棚资产：九宫格 → 封面 → 主环境图（环境图也算已出图，避免重复要求九宫格） */
async function loadStudioAssets(path: string, projectId: number | null): Promise<StudioAsset[]> {
  const [studioDoc, sceneDoc, envDoc] = await Promise.all([
    restStore.loadDoc(path, 'studios'),
    restStore.loadDoc(path, 'scenes'),
    restStore.loadDoc(path, 'environments'),
  ]);
  const envById = new Map<number, any>();
  for (const e of envDoc.items as any[]) envById.set(Number(e?.id), e);

  const byName = new Map<string, StudioAsset>();
  const put = (name: string, url: string, id?: number) => {
    if (!name) return;
    const key = name.toLowerCase();
    const prev = byName.get(key);
    if (prev?.refUrl) return;
    byName.set(key, { id, name, refUrl: url });
  };

  for (const st of studioDoc.items as any[]) {
    if (!sameProject(st, projectId)) continue;
    const name = str(st?.name);
    const primaryId = Number(st?.environment_id) || Number(Array.isArray(st?.environment_ids) ? st.environment_ids[0]?.environment_id : 0);
    const envUrl = str(envById.get(primaryId)?.image_url);
    put(name, str(st?.nine_grid_image_url) || str(st?.cover_image_url) || envUrl, Number(st?.id) || undefined);
  }
  // 分镜地点也可能直接指向场景资产（与影棚同源，任一方有图即可出图）
  // 这类条目没有影棚库 ID，资产编辑页按 getStudio 打不开，所以不填 id
  for (const sc of sceneDoc.items as any[]) {
    if (!sameProject(sc, projectId)) continue;
    const name = str(sc?.name);
    const url = str(sc?.image_url) || str(sc?.reference_image_url);
    const key = name.toLowerCase();
    if (!byName.has(key)) byName.set(key, { name, refUrl: url });
    else if (!byName.get(key)!.refUrl && url) byName.set(key, { ...byName.get(key)!, refUrl: url });
  }
  return [...byName.values()];
}

/** 道具资产：props.json 是 { nextId, props: [] } 结构，不是 items */
async function loadPropAssets(path: string, projectId: number | null): Promise<PropAsset[]> {
  const doc = await readDoc<{ props?: any[] }>(path, 'props', {});
  const out: PropAsset[] = [];
  for (const p of Array.isArray(doc.props) ? doc.props : []) {
    if (!sameProject(p, projectId)) continue;
    const name = str(p?.name);
    if (!name) continue;
    out.push({ id: Number(p.id) || undefined, name, refUrl: str(p?.image_url) || str(p?.front_view_url) });
  }
  return out;
}

export async function loadAssetSnapshot(projectId?: number | null): Promise<AssetSnapshot | null> {
  const path = projectId ? await resolveLocalPath(projectId) : getActiveProjectPath();
  if (!path) return null;
  const [characters, studios, props] = await Promise.all([
    loadCharacterAssets(path, projectId ?? null),
    loadStudioAssets(path, projectId ?? null),
    loadPropAssets(path, projectId ?? null),
  ]);
  return { characters, studios, props };
}

// ==================== 分镜级入口 ====================

interface StoryboardSceneLike {
  id: number;
  description?: string;
  prompt_template?: string;
  first_frame_prompt?: string;
  last_frame_prompt?: string;
  video_prompt?: string;
  first_frame_url?: string;
  variables?: Record<string, unknown>;
}

function namesOf(v: unknown): string[] {
  const arr = Array.isArray(v) ? v : v ? [v] : [];
  return arr.map((x: any) => str(typeof x === 'string' ? x : x?.name)).filter(Boolean);
}

/** 从分镜文档条目还原出「这一镜要用到哪些资产」 */
export function shotAssetsFromScene(scene: StoryboardSceneLike, type: ReadinessType): ShotAssets {
  const vars = (scene.variables || {}) as Record<string, unknown>;
  const prompt = type === 'video'
    ? str(scene.video_prompt) || str(scene.first_frame_prompt) || str(scene.prompt_template) || str(scene.description)
    : str(scene.first_frame_prompt) || str(scene.prompt_template) || str(scene.description);
  return {
    characters: namesOf(vars.characters),
    location: str(vars.location),
    props: namesOf(vars.props),
    prompt,
    firstFrame: str(scene.first_frame_url),
  };
}

/**
 * 校验单个分镜是否具备出图/出视频条件。
 * 工程未打开或分镜不存在时返回 null，由调用方决定是放行还是报错（不在此处假装通过）。
 */
export async function checkStoryboardReadiness(
  projectId: number | null | undefined,
  storyboardId: number | string | null | undefined,
  type: ReadinessType = 'frame',
): Promise<ReadinessResult | null> {
  const path = projectId ? await resolveLocalPath(projectId) : getActiveProjectPath();
  if (!path || !storyboardId) return null;
  const doc = await readDoc<{ scenes?: StoryboardSceneLike[] }>(path, 'storyboards', {});
  const scene = (Array.isArray(doc.scenes) ? doc.scenes : []).find((s) => String(s?.id) === String(storyboardId));
  if (!scene) return null;
  const snapshot = await loadAssetSnapshot(projectId ?? null);
  if (!snapshot) return null;
  return evaluateShot(shotAssetsFromScene(scene, type), snapshot, type);
}

/** 阻断原因的可读摘要，用于报错信息、任务失败回执与智能体观察 */
export function formatReadinessMessage(result: ReadinessResult): string {
  const blocking = result.issues.filter((i) => i.blocking);
  if (!blocking.length) return '';
  return blocking.map((i) => i.message).join('；');
}

/**
 * 每个阻断项对应的补齐动作。
 * 门禁不能只说“不行”，还要说“怎么办”：智能体拿到动作名就能自己把资产补齐，
 * 而不是把活推回给用户去资源面板翻。同类问题去重，保留描述顺序。
 */
export function readinessFixHints(result: ReadinessResult): string[] {
  const hints = new Set<string>();
  for (const issue of result.issues) {
    if (!issue.blocking) continue;
    switch (issue.type) {
      case 'no_prompt':
        hints.add('用 update_scene（field:"first_frame_prompt"）写入画面提示词，或用 optimize_prompt 生成');
        break;
      case 'character_not_found':
        hints.add('用 create_character 建同名角色（名称须与分镜一致）');
        break;
      case 'character_views_missing':
      case 'character_image_missing':
        hints.add('用 generate_base_model 为角色生成白膜三视图');
        break;
      case 'no_location':
        hints.add('用 update_scene_characters_location 给该分镜指定地点');
        break;
      case 'scene_not_found':
        hints.add('用 create_studio 新建该影棚，或把地点改成已有的影棚名');
        break;
      case 'scene_image_missing':
        hints.add('用 generate_studio_nine_grid 为影棚生成场景图');
        break;
      case 'prop_image_missing':
        hints.add('用 generate_prop_image 为道具生成道具图');
        break;
      case 'no_first_frame':
        hints.add('先生成首帧（generate_frame），再出视频');
        break;
      default:
        break;
    }
  }
  return Array.from(hints);
}
