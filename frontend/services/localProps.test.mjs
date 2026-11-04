/** 道具图本地端点回归：node --test services/localProps.test.mjs
 * 转译真实的 localProps.ts 执行，只把存储与出图作业依赖换成可断言的桩。
 * 覆盖：提示词的「可当参考图」约束、缺描述必须报 400（不能返回 200 空对象假装成功）、
 * 生成完成后写回 props.json、未命中路径交回通用路由。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const source = readFileSync(fileURLToPath(new URL('./localProps.ts', import.meta.url)), 'utf8');
// 用正则而非字面量匹配 import：仓库是 CRLF，多行字面量会静静匹配不上，桩失效后报错误导人
const stubbed = source
  .replace(
    /import\s*\{[^}]*\}\s*from\s*'\.\/localStore';/,
    `const readDoc = async (_p, name, fallback) => (globalThis.__docs?.[name] ?? fallback ?? {});
     const writeDoc = (_p, name, doc) => { globalThis.__docs = globalThis.__docs || {}; globalThis.__docs[name] = doc; };`,
  )
  .replace(
    /import\s*\{[^}]*\}\s*from\s*'\.\/localAssetShared';/,
    `const jsonResponse = (body, status = 200) => new Response(JSON.stringify(body), { status });
     const resolvePath = async () => (globalThis.__noProject ? null : 'test://proj');
     const assertProject = () => true;
     const findById = (items, id) => items.find((it) => Number(it?.id) === Number(id));
     const genImageToUrl = async (opts) => { globalThis.__genCalls.push(opts); return 'prop_out.png'; };
     const submitGenJob = (opts) => { globalThis.__jobs.push(opts); return 'job-' + globalThis.__jobs.length; };`,
  );
assert.equal(stubbed.includes("'./localStore'"), false, '未能替换 localProps.ts 的 localStore 依赖');
assert.equal(stubbed.includes("'./localAssetShared'"), false, '未能替换 localProps.ts 的 localAssetShared 依赖');

const js = ts.transpileModule(stubbed, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText;
const mod = await import('data:text/javascript;base64,' + Buffer.from(js, 'utf8').toString('base64'));
const { buildPropImagePrompt, routeProps } = mod;

const apiUrl = (id, sub) => new URL(`http://local/api/props/${id}/${sub}`);
const putDoc = (prop) => { globalThis.__docs = { props: { nextId: 9, props: [prop] } }; };

function reset(propDoc) {
  globalThis.__jobs = [];
  globalThis.__genCalls = [];
  globalThis.__noProject = false;
  if (propDoc) putDoc(propDoc);
}

test('道具提示词必须带"可当参考图"的约束：单一物体、干净背景、无人物无场景无文字', () => {
  reset(null);
  const p = buildPropImagePrompt({ id: 1, name: '扳手', category: '工具', description: '沾油渍的红柄活动扳手' });
  assert.match(p, /扳手/);
  assert.match(p, /沾油渍的红柄活动扳手/);
  assert.match(p, /纯中性背景/);
  assert.match(p, /无人物/);
  assert.match(p, /无场景/);
  assert.match(p, /无文字/);
  // 三视图版式必须显式要求同一件物品，否则模型会画成三把不同扳手
  const multi = buildPropImagePrompt({ id: 1, name: '扳手', description: '红柄' }, { multiView: true });
  assert.match(multi, /正面、侧面、俯视/);
  assert.match(multi, /同一件物品/);
  assert.equal(buildPropImagePrompt({ id: 1 }), '', '无名无描述的道具不应拼出提示词');
});

test('未命中的道具路径返回 null，交回通用路由处理 CRUD', async () => {
  reset(null);
  assert.equal(await routeProps(apiUrl(1, ''), 'GET', null), null);
  assert.equal(await routeProps(apiUrl(1, 'delete-image'), 'POST', {}), null);
});

test('道具缺名称与描述时必须返回 400，不能再走 200 空对象假装成功', async () => {
  reset({ id: 1, project_id: 1 });
  const res = await routeProps(apiUrl(1, 'generate-image'), 'POST', { imageModel: 'm' });
  assert.equal(res.status, 400);
  assert.match((await res.json()).message, /缺少名称与描述/);
  assert.equal(globalThis.__jobs.length, 0, '不该提交生成作业');
});

test('没有本地工程时返回 400，绝不静默丢弃请求', async () => {
  reset({ id: 1, name: '扳手', description: '红柄' });
  globalThis.__noProject = true;
  const res = await routeProps(apiUrl(1, 'generate-views'), 'POST', {});
  assert.equal(res.status, 400);
  assert.match((await res.json()).message, /未打开本地工程/);
});

test('道具不存在返回 404；命中则提交作业并在完成后写回 props.json', async () => {
  reset({ id: 1, name: '扳手', description: '红柄活动扳手', project_id: 1 });
  const notFound = await routeProps(apiUrl(42, 'generate-image'), 'POST', { imageModel: 'm' });
  assert.equal(notFound.status, 404);

  const res = await routeProps(apiUrl(1, 'generate-views'), 'POST', { imageModel: 'seedream', aspectRatio: '4:3' });
  assert.equal(res.status, 200);
  const payload = await res.json();
  assert.equal(payload.jobId, 'job-1', '回执必须带任务号');
  assert.equal(payload.status, 'generating');
  assert.equal(globalThis.__jobs.length, 1);
  const job = globalThis.__jobs[0];
  assert.equal(job.workflowType, 'prop_views_generation');
  // 提交时就置为 generating，让资源面板能立刻显示进行中
  assert.equal(globalThis.__docs.props.props[0].generation_status, 'generating');

  const result = await job.run();
  assert.deepEqual(result, { image_url: 'prop_out.png' });
  assert.equal(globalThis.__genCalls[0].aspectRatio, '4:3', '调用方指定的画幅不应被吞掉');
  assert.match(globalThis.__genCalls[0].prompt, /正面、侧面、俯视/);
  const saved = globalThis.__docs.props.props[0];
  assert.equal(saved.image_url, 'prop_out.png');
  assert.equal(saved.front_view_url, 'prop_out.png', '门禁读的是 front_view_url，必须同步写');
  assert.equal(saved.generation_status, 'completed');
});

test('单图模式沿用已有 front_view_url，不覆盖成新的单图', async () => {
  reset({ id: 3, name: '阀门', description: '锈蚀的手轮阀门', project_id: 1, front_view_url: 'old.png' });
  await routeProps(apiUrl(3, 'generate-image'), 'POST', { imageModel: 'm' });
  await globalThis.__jobs[0].run();
  const saved = globalThis.__docs.props.props[0];
  assert.equal(saved.image_url, 'prop_out.png');
  assert.equal(saved.front_view_url, 'old.png');
});
