/** 白膜重生成计划回归：node --test services/characterBaseModel.test.mjs
 * 转译真实的 characterBaseModel.ts 执行，只把 assets 层读写换成可断言的桩。
 * 覆盖：在途任务优先于 force（重复提交双倍付费）、缺张只补那张、
 * 齐备但上一轮失败按整套重做、白膜状态不重复入库。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const source = readFileSync(fileURLToPath(new URL('./characterBaseModel.ts', import.meta.url)), 'utf8');
// 用正则而非字面量匹配 import：仓库是 CRLF，多行字面量会静静匹配不上，桩失效后报错误导人
const stubbed = source.replace(
  /import\s*\{[^}]*\}\s*from\s*'\.\/assets';/,
  `const createCharacterState = async (characterId, payload) => {
     globalThis.__created.push({ characterId, payload });
     return { id: 90, ...payload };
   };
   const fetchCharacter = async (characterId) => structuredClone(globalThis.__character ?? { id: characterId, name: '老李', base_appearance: '黑发青年，身材瘦削' });
   const fetchCharacterStates = async () => structuredClone(globalThis.__states ?? []);
   const generateCharacterStateViews = async (characterId, stateId, opts) => {
     globalThis.__genCalls.push({ characterId, stateId, opts });
     return { jobId: 'ag-1', status: 'generating' };
   };
   const isStaleGeneratingState = (state, now = Date.now()) => {
     if (state?.generation_status !== 'generating') return false;
     const updated = Date.parse(state.updated_at || state.created_at || '');
     return Number.isFinite(updated) && now - updated >= 10 * 60 * 1000;
   };`,
);
assert.equal(stubbed.includes("'./assets'"), false, '未能替换 characterBaseModel.ts 的 assets 依赖');

const js = ts.transpileModule(stubbed, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText;
const mod = await import('data:text/javascript;base64,' + Buffer.from(js, 'utf8').toString('base64'));
const { BASE_VIEWS, missingBaseViews, planBaseModelRegen, ensureBaseModelState, startBaseModelGeneration } = mod;

const MINUTE = 60 * 1000;
const iso = (agoMs) => new Date(Date.now() - agoMs).toISOString();
const base = (over = {}) => ({
  id: 2, character_id: 1, name: '白膜', is_base_model: true,
  front_view_url: '', side_view_url: '', back_view_url: '',
  generation_status: 'idle', generation_error: null, generation_job_id: null,
  updated_at: iso(1000), ...over,
});

function reset(states, opts = {}) {
  globalThis.__states = states === null ? [] : [states ?? base()];
  globalThis.__character = opts.character;
  globalThis.__created = [];
  globalThis.__genCalls = [];
}

test('missingBaseViews：任一视图为空即未就绪', () => {
  assert.deepEqual(missingBaseViews(null), [...BASE_VIEWS], '没有白膜记录时三张都算缺');
  assert.deepEqual(missingBaseViews(base({ front_view_url: 'f.png' })), ['side', 'back']);
  assert.deepEqual(missingBaseViews(base({ front_view_url: 'f.png', side_view_url: 's.png', back_view_url: 'b.png' })), []);
  assert.deepEqual(missingBaseViews(base({ side_view_url: '   ' })), ['front', 'side', 'back'], '空白串不算已有图');
});

test('尚无白膜：先建白膜再整套生成', () => {
  const plan = planBaseModelRegen(null);
  assert.equal(plan.mode, 'first');
  assert.deepEqual(plan.views, [...BASE_VIEWS]);
});

test('任务仍在跑时优先挡住，force 也不能并发提交', () => {
  const running = base({ generation_status: 'generating', generation_job_id: 'ag-9', updated_at: iso(MINUTE) });
  const plan = planBaseModelRegen(running, { force: true, views: ['front'] });
  assert.equal(plan.mode, 'in_progress', '显式 views/force 都不该越过在途任务');
  assert.deepEqual(plan.views, []);
  assert.match(plan.reason, /ag-9/, '回执要带上任务号，智能体才能去查进度');
});

test('生成中但已超时失效：视为可重做，不能永远卡在生成中', () => {
  const stale = base({ generation_status: 'generating', generation_job_id: 'ag-9', updated_at: iso(11 * MINUTE) });
  const plan = planBaseModelRegen(stale);
  assert.equal(plan.mode, 'full');
  assert.deepEqual(plan.views, [...BASE_VIEWS]);
});

test('只缺部分视图时按视图补齐；显式 views 优先', () => {
  const partial = planBaseModelRegen(base({ front_view_url: 'f.png', generation_status: 'failed', generation_error: '503' }));
  assert.equal(partial.mode, 'partial');
  assert.deepEqual(partial.views, ['side', 'back']);
  assert.equal(partial.failed, true);

  const explicit = planBaseModelRegen(base({ front_view_url: 'f.png', side_view_url: 's.png', back_view_url: 'b.png' }), { views: ['back'] });
  assert.equal(explicit.mode, 'partial');
  assert.deepEqual(explicit.views, ['back'], '用户点名重做某一面时按点名的来');

  const bogus = planBaseModelRegen(base({ front_view_url: 'f.png' }), { views: ['top', 'left'] });
  assert.deepEqual(bogus.views, ['side', 'back'], '非法视图名忽略，回落到真实缺失项');
});

test('三张齐备：默认就绪，force 或上一轮失败按整套重做', () => {
  const done = base({ front_view_url: 'f.png', side_view_url: 's.png', back_view_url: 'b.png' });
  assert.equal(planBaseModelRegen(done).mode, 'ready');
  assert.equal(planBaseModelRegen(done, { force: true }).mode, 'full');

  const failed = { ...done, generation_status: 'failed', generation_error: '厂商返回 503' };
  const plan = planBaseModelRegen(failed);
  assert.equal(plan.mode, 'full', '齐备但重做失败仍要能整套再来一次');
  assert.match(plan.reason, /厂商返回 503/, '失败原因必须进回执');
});

test('ensureBaseModelState 复用已有白膜，不重复入库', async () => {
  reset(base({ id: 7 }));
  const first = await ensureBaseModelState(1, { projectId: 3 });
  assert.equal(first.created, false);
  assert.equal(first.state.id, 7);
  assert.equal(globalThis.__created.length, 0);

  reset(null);
  const second = await ensureBaseModelState(1, { projectId: 3 });
  assert.equal(second.created, true);
  assert.equal(second.state.is_base_model, true);
  assert.equal(second.state.name, '白膜');
  assert.equal(second.state.project_id, 3, '本地路由依赖 project_id 定位工程文档');
});

test('startBaseModelGeneration：在途/就绪都不提交，缺张只交那张给服务层', async () => {
  reset(base({ generation_status: 'generating', generation_job_id: 'ag-9', updated_at: iso(MINUTE) }));
  const blocked = await startBaseModelGeneration(1, { projectId: 3, imageModel: 'm' });
  assert.equal(blocked.plan.mode, 'in_progress');
  assert.equal(blocked.jobId, null);
  assert.equal(globalThis.__genCalls.length, 0, '挡住时一次都不能提交');

  reset(base({ front_view_url: 'f.png', side_view_url: 's.png', back_view_url: 'b.png' }));
  const ready = await startBaseModelGeneration(1, { projectId: 3, imageModel: 'm' });
  assert.equal(ready.plan.mode, 'ready');
  assert.equal(globalThis.__genCalls.length, 0);

  reset(base({ front_view_url: 'f.png', generation_status: 'failed', generation_error: '503' }));
  const patched = await startBaseModelGeneration(1, { projectId: 3, imageModel: 'm' });
  assert.equal(patched.jobId, 'ag-1');
  assert.equal(patched.plan.mode, 'partial');
  assert.deepEqual(globalThis.__genCalls.at(-1).opts.regenerateOnly, ['side', 'back'], '缺张重做必须把视图清单交给服务层');
});

test('startBaseModelGeneration：无白膜时先建状态再整套生成（不带 regenerateOnly）', async () => {
  reset(null);
  const started = await startBaseModelGeneration(1, { projectId: 3, imageModel: 'm' });
  assert.equal(started.plan.mode, 'first');
  assert.equal(started.created, true, '回执需说明本轮新建了白膜状态');
  assert.equal(globalThis.__created.length, 1);
  assert.equal(globalThis.__genCalls.length, 1);
  assert.equal(globalThis.__genCalls[0].stateId, 90);
  assert.equal(globalThis.__genCalls[0].opts.regenerateOnly, undefined, '整套生成不能传部分视图，否则同源约束被破坏');
});
