/** 角色三视图生成本地端点回归：node --test services/localCharacters.test.mjs
 * 转译真实的 localCharacters.ts 执行，只把文档读写与出图作业换成可断言的桩。
 * 覆盖：失败终态必须落库（否则记录永远停在 generating，界面与智能体都没有重做依据）、
 * 按视图补齐不得冲掉已生成的好图、在途任务防重复提交、迟到失败不得接管新一轮生成。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const source = readFileSync(fileURLToPath(new URL('./localCharacters.ts', import.meta.url)), 'utf8');
// 用正则而非字面量匹配 import：仓库是 CRLF，多行字面量会静静匹配不上，桩失效后报错误导人
const stubbed = source.replace(
  /import\s*\{[^}]*\}\s*from\s*'\.\/localAssetShared';/,
  `const activePath = () => (globalThis.__noProject ? null : 'test://proj');
   const resolvePath = async () => (globalThis.__noProject ? null : 'test://proj');
   const assertProject = () => true;
   const loadRestDoc = async (_p, name) => structuredClone(globalThis.__docs?.[name] ?? { items: [], nextId: 1 });
   const saveRestDoc = (_p, name, doc) => { globalThis.__docs = globalThis.__docs || {}; globalThis.__docs[name] = structuredClone(doc); };
   const findById = (items, id) => items.find((it) => Number(it?.id) === Number(id));
   const jsonResponse = (body, status = 200) => new Response(JSON.stringify(body), { status });
   const normalizeKeys = (value) => value;
   const pickTextModel = async () => ({ id: 'text', type: 'TEXT' });
   const chatJson = async () => ({});
   const genImageToUrl = async (opts) => {
     globalThis.__genCalls.push(opts);
     if (globalThis.__genFails) throw new Error(globalThis.__genFails);
     return String(opts.nameHint).split('_').pop() + '.png';
   };
   const submitGenJob = (opts) => { globalThis.__jobs.push(opts); return 'job-' + globalThis.__jobs.length; };
   const isAssetJobRunning = (jobId) => !!jobId && (globalThis.__runningJobs || []).includes(String(jobId));`,
);
assert.equal(stubbed.includes("'./localAssetShared'"), false, '未能替换 localCharacters.ts 的 localAssetShared 依赖');

const js = ts.transpileModule(stubbed, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText;
const mod = await import('data:text/javascript;base64,' + Buffer.from(js, 'utf8').toString('base64'));
const { routeCharacters, resolveTargetViews } = mod;

const stateUrl = new URL('http://local/api/characters/1/states/2/generate-views');
const characterUrl = new URL('http://local/api/characters/1/generate-views');
const now = () => new Date().toISOString();

/** 白膜状态默认文档：三视图只有一张，另两张缺失（模拟上一轮半途失败） */
function docs(base = {}) {
  return {
    characters: { nextId: 2, items: [{ id: 1, name: '老李', project_id: 1, base_appearance: '黑发青年，身材瘦削', ...base.character }] },
    characterStates: {
      nextId: 5,
      items: [{
        id: 2, character_id: 1, project_id: 1, name: '白膜', is_base_model: true,
        appearance: '黑发青年', front_view_url: 'front.png', side_view_url: '', back_view_url: '',
        image_url: 'front.png', generation_status: 'failed', generation_error: '厂商返回 503',
        generation_job_id: 'job-old', updated_at: now(), ...base.state,
      }],
    },
  };
}

function reset(doc = docs(), opts = {}) {
  globalThis.__docs = structuredClone(doc);
  globalThis.__jobs = [];
  globalThis.__genCalls = [];
  globalThis.__genFails = opts.fails || '';
  globalThis.__noProject = false;
  globalThis.__runningJobs = opts.running || [];
}

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));
const savedState = () => globalThis.__docs.characterStates.items[0];

/** 真实作业注册表在 run() 抛错时调用 onFail 回写；桩必须复现这条链路 */
async function runJob(job) {
  try {
    return { ok: true, value: await job.run() };
  } catch (error) {
    job.onFail?.(error);
    await tick();
    return { ok: false, error };
  }
}

test('regenerateOnly 解析：缺省全量、按请求取视图、去重、非法值退回全量', () => {
  assert.deepEqual(resolveTargetViews(undefined), ['front', 'side', 'back']);
  assert.deepEqual(resolveTargetViews(['side']), ['side']);
  assert.deepEqual(resolveTargetViews(['side', 'side', 'front']), ['side', 'front']);
  assert.deepEqual(resolveTargetViews(['top']), ['front', 'side', 'back'], '未知视图名不应被当成有效请求');
  assert.deepEqual(resolveTargetViews('front'), ['front', 'side', 'back'], '非数组必须退回全量');
});

test('失败后只补缺失视图：正面保留原图，只重做侧面，设定图不回到空图', async () => {
  reset();
  const res = await routeCharacters(stateUrl, 'POST', { imageModel: 'm', regenerateOnly: ['side'] });
  assert.equal(res.status, 200);
  assert.deepEqual((await res.json()).views, ['side'], '回执必须说明本次只做哪几张');

  const job = globalThis.__jobs[0];
  assert.equal(job.workflowType, 'character_state_views_generation');
  assert.deepEqual(job.inputParams.views, ['side']);

  const ran = await runJob(job);
  assert.equal(ran.ok, true, ran.error?.message);
  assert.deepEqual(ran.value, { front: 'front.png', side: 'side.png', back: '', views: ['side'] });
  assert.equal(globalThis.__genCalls.length, 1, '按视图重做不该把三张全部再付费生成一次');
  assert.equal(globalThis.__genCalls[0].skipArtStyle, true, '白膜保持中性网格，不叠加工程美术风格');
  assert.equal(globalThis.__genCalls[0].refImageUrls, undefined, '白膜自身不需要参考图');

  const saved = savedState();
  assert.equal(saved.front_view_url, 'front.png', '未请求的视图不得被覆盖');
  assert.equal(saved.side_view_url, 'side.png');
  assert.equal(saved.image_url, 'front.png', '本次没重做正面时设定图沿用原图');
  assert.equal(saved.generation_status, 'completed');
  assert.equal(saved.generation_error, null, '成功后必须清掉上一轮失败原因');
});

test('作业失败必须落库：写入 failed 与失败原因，界面和智能体才有重新生成的依据', async () => {
  reset(docs({ state: { front_view_url: '', generation_status: 'generating', generation_job_id: '' } }), { fails: '出图超时' });
  const res = await routeCharacters(stateUrl, 'POST', { imageModel: 'm' });
  assert.equal(res.status, 200);
  const payload = await res.json();
  assert.deepEqual(payload.views, ['front', 'side', 'back'], '三张都缺时按整套重做');

  const ran = await runJob(globalThis.__jobs[0]);
  assert.equal(ran.ok, false);
  const saved = savedState();
  assert.equal(saved.generation_status, 'failed', '失败终态若不落库，记录会永远停在生成中');
  assert.match(saved.generation_error, /出图超时/, '失败原因必须可读，不能只剩一个红色标签');
});

test('提交即登记本次任务号并清空上一轮失败原因：秒失败也能把原因写回记录', async () => {
  reset(docs({ state: { generation_status: 'idle', generation_error: '厂商返回 503', generation_job_id: 'job-old' } }));
  await routeCharacters(stateUrl, 'POST', { imageModel: 'm' });
  const saved = savedState();
  assert.equal(saved.generation_status, 'generating');
  assert.equal(saved.generation_job_id, 'job-1', '任务号必须同步登记，异步补登记会让秒失败认领不上');
  assert.equal(saved.generation_error, null, '新一轮开始前必须清掉上一轮失败原因');
});

test('在途任务挡住重复提交：返回 409 且不再排第二个作业', async () => {
  reset(docs({ state: { generation_status: 'generating', generation_job_id: 'job-1', generation_error: null } }), { running: ['job-1'] });
  const res = await routeCharacters(stateUrl, 'POST', { imageModel: 'm' });
  assert.equal(res.status, 409);
  const payload = await res.json();
  assert.equal(payload.code, 'GENERATION_IN_PROGRESS');
  assert.equal(globalThis.__jobs.length, 0, '并发出图会双倍付费且互相覆盖回写，必须一次都不提交');
  assert.equal(savedState().generation_status, 'generating', '被拦住时不得把在途任务改成失败');
});

test('迟到的失败不得接管新一轮生成：任务号不匹配就不回写', async () => {
  reset(docs({ state: { generation_status: 'generating', generation_job_id: '', generation_error: null } }));
  await routeCharacters(stateUrl, 'POST', { imageModel: 'm' });
  const staleJob = globalThis.__jobs[0];
  assert.ok(staleJob);
  // 模拟新一轮任务已接管同一记录后，旧任务的失败回调迟到抵达
  globalThis.__docs.characterStates.items[0].generation_job_id = 'job-2';
  staleJob.onFail(new Error('上一轮超时'));
  await tick();
  const saved = savedState();
  assert.equal(saved.generation_status, 'generating', '迟到失败不得改写新一轮生成中');
  assert.equal(saved.generation_error || '', '', '迟到失败不得写入失败原因');
});

test('删除白膜图后回到未生成：不能保留已生成/失败，否则界面状态与实际媒体矛盾', async () => {
  reset();
  const res = await routeCharacters(new URL('http://local/api/characters/1/states/2/base-model-image'), 'DELETE', null);
  assert.equal(res.status, 200);
  const saved = savedState();
  assert.equal(saved.generation_status, 'idle');
  assert.equal(saved.generation_error, null);
  assert.equal(saved.front_view_url, null);
});

test('角色本体降级路径同样落库失败原因并挡住并发提交', async () => {
  reset(docs({ character: { generation_status: 'idle', generation_error: null, generation_job_id: '' } }), { fails: '额度不足' });
  await routeCharacters(characterUrl, 'POST', { imageModel: 'm' });
  const ran = await runJob(globalThis.__jobs[0]);
  assert.equal(ran.ok, false);
  assert.equal(globalThis.__docs.characters.items[0].generation_status, 'failed');
  assert.match(globalThis.__docs.characters.items[0].generation_error, /额度不足/);

  reset(docs({ character: { generation_status: 'generating', generation_job_id: 'job-7' } }), { running: ['job-7'] });
  const blocked = await routeCharacters(characterUrl, 'POST', { imageModel: 'm' });
  assert.equal(blocked.status, 409);
  assert.equal((await blocked.json()).code, 'GENERATION_IN_PROGRESS');
  assert.equal(globalThis.__jobs.length, 0, '本体降级路径同样不能重复提交第二个作业');
});

test('没有本地工程时返回 400，绝不静默丢弃请求', async () => {
  reset();
  globalThis.__noProject = true;
  const res = await routeCharacters(stateUrl, 'POST', { imageModel: 'm' });
  assert.equal(res.status, 400);
  assert.match((await res.json()).message, /未打开本地工程/);
});
