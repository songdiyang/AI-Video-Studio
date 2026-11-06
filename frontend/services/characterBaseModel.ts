// 角色白膜（基础网格）生成与重生成（characterBaseModel）
//
// 白膜三视图是 3ds Max 式生产流程的基础层：设定图只是参考，正/侧/背三张齐备才算就绪。
// 生成可能因厂商报错或超时而失败，失败必须可重做，因此这里统一收口三处调用方
// （资源面板、角色状态编辑器、智能体桥接）的重做口径：
//   - 任务仍在跑：挡住重复提交（双倍付费 + 两个任务互相覆盖回写）；
//   - 一张都没有：整套重做；
//   - 只缺部分视图：只补缺失视图，已生成的好图不冲掉；
//   - 三张齐备但上一轮重做失败：按整套重做处理。

import {
  type Character,
  type CharacterState,
  createCharacterState,
  fetchCharacter,
  fetchCharacterStates,
  generateCharacterStateViews,
  isStaleGeneratingState,
} from './assets';

export type BaseView = 'front' | 'side' | 'back';
export const BASE_VIEWS: readonly BaseView[] = ['front', 'side', 'back'];
/** 白膜状态的固定名称：三处创建入口共用，避免同名状态重复入库 */
export const BASE_STATE_NAME = '白膜';

type ViewCarrier = Partial<Record<`${BaseView}_view_url`, string | null | undefined>> | null | undefined;

const onlyViews = (requested?: readonly string[] | null): BaseView[] =>
  (requested || []).map((v) => String(v) as BaseView).filter((v) => BASE_VIEWS.includes(v));

/** 白膜还缺哪些视图（正/侧/背任一为空即视为未就绪） */
export function missingBaseViews(base: ViewCarrier): BaseView[] {
  if (!base) return [...BASE_VIEWS];
  return BASE_VIEWS.filter((view) => !String(base[`${view}_view_url`] || '').trim());
}

export type BaseRegenMode = 'first' | 'full' | 'partial' | 'in_progress' | 'ready';

export interface BaseRegenPlan {
  mode: BaseRegenMode;
  /** 本次要生成的视图；in_progress / ready 为空 */
  views: BaseView[];
  /** 上一轮是否以失败收场（含超时） */
  failed: boolean;
  /** 面向用户/智能体的判定说明，同时作为回执文案素材 */
  reason: string;
}

/**
 * 计算白膜重生成计划（纯函数，不发请求）。
 * views 显式指定时按视图重做；force 强制整套重做。
 */
export function planBaseModelRegen(
  base: CharacterState | null | undefined,
  opts: { force?: boolean; views?: readonly string[] | null; now?: number } = {},
): BaseRegenPlan {
  if (!base) return { mode: 'first', views: [...BASE_VIEWS], failed: false, reason: '尚无白膜状态，先建立白膜再生成整套三视图' };
  const failed = base.generation_status === 'failed';
  const inFlight = base.generation_status === 'generating' && !isStaleGeneratingState(base, opts.now);
  // 在途任务优先于 force：并发提交只会双倍付费并让两个任务互相覆盖回写。
  if (inFlight) {
    return { mode: 'in_progress', views: [], failed, reason: `白膜三视图仍在生成中${base.generation_job_id ? `（任务 ${base.generation_job_id}）` : ''}，请等当前任务结束` };
  }
  const picked = onlyViews(opts.views);
  if (picked.length) return { mode: 'partial', views: picked, failed, reason: `按请求重做${picked.join('/')}视图` };
  const missing = missingBaseViews(base);
  if (missing.length === BASE_VIEWS.length) {
    return { mode: 'full', views: [...BASE_VIEWS], failed, reason: failed ? `上一轮白膜生成失败${base.generation_error ? `：${base.generation_error}` : ''}，重新生成整套三视图` : '白膜三视图尚未生成，开始生成整套三视图' };
  }
  if (missing.length) return { mode: 'partial', views: missing, failed, reason: `已有 ${BASE_VIEWS.length - missing.length} 张白膜视图，只补齐缺失的 ${missing.join('/')} 视图` };
  if (opts.force) return { mode: 'full', views: [...BASE_VIEWS], failed, reason: '按要求整套重做白膜三视图' };
  if (failed) return { mode: 'full', views: [...BASE_VIEWS], failed, reason: `白膜三视图虽已齐备，但上一轮重做失败${base.generation_error ? `：${base.generation_error}` : ''}，按整套重做处理` };
  return { mode: 'ready', views: [], failed, reason: '白膜三视图已就绪，无需重新生成' };
}

/** 创建白膜状态（若不存在）：体貌取角色基准，设定图与已有视图仅作参考带入 */
export async function ensureBaseModelState(
  characterId: number,
  opts: { projectId?: number | null; character?: Character | null; states?: CharacterState[] | null } = {},
): Promise<{ state: CharacterState; created: boolean }> {
  const states = opts.states ?? (await fetchCharacterStates(characterId));
  const existing = states.find((s) => s.is_base_model);
  if (existing) return { state: existing, created: false };
  const character = opts.character ?? (await fetchCharacter(characterId));
  const created = await createCharacterState(characterId, {
    // 本地路由依赖 project_id 定位工程文档
    ...(opts.projectId ? { project_id: opts.projectId } : {}),
    name: BASE_STATE_NAME,
    description: character?.base_appearance || character?.appearance || character?.description || '',
    appearance: character?.base_appearance || character?.appearance || '',
    outfit: character?.outfit_appearance || '',
    personality: character?.personality || '',
    is_base_model: true,
    is_active: false,
    image_url: character?.image_url || '',
    front_view_url: character?.front_view_url || '',
    side_view_url: character?.side_view_url || '',
    back_view_url: character?.back_view_url || '',
    state_category: 'daily',
    tags: '[]',
    generation_status: 'idle',
  } as any);
  return { state: created, created: true };
}

export interface StartBaseModelGenerationResult {
  plan: BaseRegenPlan;
  state: CharacterState | null;
  jobId: string | null;
  created: boolean;
  character: Character;
  states: CharacterState[];
}

/**
 * 按统一口径启动（或挡住）白膜三视图生成。
 * 返回的 plan 说明本次到底做了什么，调用方据此决定回执、长任务登记与列表刷新。
 */
export async function startBaseModelGeneration(
  characterId: number,
  opts: {
    projectId?: number | null;
    imageModel: string;
    textModel?: string;
    /** 整套重做：即使已有部分视图也重新生成三张 */
    force?: boolean;
    /** 只重做指定视图 */
    views?: readonly string[] | null;
  },
): Promise<StartBaseModelGenerationResult> {
  const [character, states] = await Promise.all([fetchCharacter(characterId), fetchCharacterStates(characterId)]);
  const base = states.find((s) => s.is_base_model) || null;
  const plan = planBaseModelRegen(base, { force: opts.force, views: opts.views });
  if (plan.mode === 'in_progress' || plan.mode === 'ready') {
    return { plan, state: base, jobId: null, created: false, character, states };
  }
  const { state, created } = await ensureBaseModelState(characterId, { projectId: opts.projectId, character, states });
  const started = await generateCharacterStateViews(characterId, state.id, {
    imageModel: opts.imageModel,
    textModel: opts.textModel,
    // 只补缺失视图时交给服务层按视图重做；其余情况整套重做
    regenerateOnly: plan.mode === 'partial' ? plan.views : undefined,
  });
  return { plan, state, jobId: started?.jobId || null, created, character, states };
}
