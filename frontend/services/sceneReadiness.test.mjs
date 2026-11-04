/** 出图前置校验回归：node --test services/sceneReadiness.test.mjs
 * 直接转译真实的 sceneReadiness.ts 执行：把两个本地存储 import 换成空实现桩，
 * 纯判定部分（evaluateShot / 参考图指代段 / 分镜字段还原）用真实代码跑。
 * 覆盖：资产未出齐必须拦住、参考图顺序与编号指代、幂等追加、临时道具只警告、读不到工程时不假装通过。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const source = readFileSync(fileURLToPath(new URL('./sceneReadiness.ts', import.meta.url)), 'utf8');
// 把两个本地存储依赖换成内存文档（globalThis.__docs），让纯判定和 IO 层都能跑真实代码
const stubbed = source
  .replace(
    "import { readDoc, resolveLocalPath, getActiveProjectPath } from './localStore';",
    `const readDoc = async (_p, name, fallback) => (globalThis.__docs?.[name] ?? fallback ?? {});
     const resolveLocalPath = async () => (globalThis.__docs ? 'test://proj' : null);
     const getActiveProjectPath = () => (globalThis.__docs ? 'test://proj' : null);`,
  )
  .replace(
    "import { restStore } from './localRest';",
    `const restStore = {
       loadDoc: async (_p, name) => {
         const d = globalThis.__docs?.[name];
         return d ? { nextId: 1, items: [], ...d } : { nextId: 1, items: [] };
       },
     };`,
  );
// 两处桩都必须命中，否则说明源文件的 import 语句变了
assert.equal(stubbed.includes("from './localStore'"), false, '未能替换 sceneReadiness.ts 的 localStore 依赖');
assert.equal(stubbed.includes("from './localRest'"), false, '未能替换 sceneReadiness.ts 的 localRest 依赖');

// 打桩后的代码仍带类型标注，必须先转译成 JS 才能被 Node 的 ESM 加载
const js = ts.transpileModule(stubbed, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText;
const mod = await import('data:text/javascript;base64,' + Buffer.from(js, 'utf8').toString('base64'));
const {
  evaluateShot,
  buildReferenceClause,
  appendReferenceClause,
  shotAssetsFromScene,
  checkStoryboardReadiness,
  deriveCharacterReadinessFields,
  isNonCharacterEntity,
  formatReadinessMessage,
  readinessFixHints,
} = mod;

const fullViews = { front: 'a://f.png', side: 'a://s.png', back: 'a://b.png' };

const snapshot = (over = {}) => ({
  characters: [{ name: '老李', views: fullViews, refUrl: 'a://lao.png' }, { name: '顾北', views: fullViews, refUrl: 'a://gu.png' }],
  studios: [{ name: '炉城-三号换热站', refUrl: 'a://studio.png' }],
  props: [{ name: '扳手', refUrl: 'a://wrench.png' }],
  ...over,
});

const shot = (over = {}) => ({
  characters: ['老李', '顾北'],
  location: '炉城-三号换热站',
  props: ['扳手'],
  prompt: '两人蹲在管道旁拧阀门',
  ...over,
});

test('资产齐备时通过，并按角色→影棚→道具顺序收集参考图', () => {
  const r = evaluateShot(shot(), snapshot(), 'frame');
  assert.equal(r.ready, true);
  assert.deepEqual(r.issues, []);
  assert.deepEqual(r.references.map((x) => x.name), ['老李', '顾北', '炉城-三号换热站', '扳手']);
});

test('提示词按参考图顺序编号指代，否则厂商无法知道哪张图是谁', () => {
  const r = evaluateShot(shot(), snapshot(), 'frame');
  const clause = buildReferenceClause(r.references);
  assert.match(clause, /图片1为「老李」的角色形象/);
  assert.match(clause, /图片3为「炉城-三号换热站」的场景画面/);
  assert.match(clause, /图片4为「扳手」的道具外观/);
});

test('指代段幂等：重复追加不叠加', () => {
  const r = evaluateShot(shot(), snapshot(), 'frame');
  const once = appendReferenceClause('两人蹲在管道旁拧阀门', r.references);
  const twice = appendReferenceClause(once, r.references);
  assert.equal(once.split('【参考图指代】').length - 1, 1);
  assert.equal(twice, once);
});

test('白膜三视图不齐的角色必须拦住，且该角色不得进参考图清单', () => {
  const r = evaluateShot(
    shot({ characters: ['老李'] }),
    snapshot({ characters: [{ name: '老李', views: { ...fullViews, back: '' }, refUrl: 'a://lao.png' }] }),
    'frame',
  );
  assert.equal(r.ready, false);
  assert.match(formatReadinessMessage(r), /白膜三视图/);
  // 没画齐的角色进清单只会误导模型，其他齐备的资产仍可正常收集
  assert.deepEqual(r.references.map((x) => x.name), ['炉城-三号换热站', '扳手']);
});

test('角色不在角色库、影棚不在影棚库都算阻断项', () => {
  const r = evaluateShot(shot({ characters: ['陌生人甲'], location: '天台' }), snapshot(), 'frame');
  assert.equal(r.ready, false);
  const types = r.issues.filter((i) => i.blocking).map((i) => i.type);
  assert.deepEqual(types, ['character_not_found', 'scene_not_found']);
});

test('人群/路人等泛指词不要求角色资产', () => {
  assert.equal(isNonCharacterEntity('众人'), true);
  assert.equal(isNonCharacterEntity('其他学生'), true);
  assert.equal(isNonCharacterEntity('老李'), false);
  const r = evaluateShot(shot({ characters: ['众人', '老李'] }), snapshot(), 'frame');
  assert.equal(r.ready, true);
  assert.deepEqual(r.references.map((x) => x.name).filter((n) => n === '老李'), ['老李']);
});

test('未入库道具只警告；已入库但没道具图算阻断', () => {
  const transient = evaluateShot(shot({ props: ['半张纸条'] }), snapshot(), 'frame');
  assert.equal(transient.ready, true);
  assert.deepEqual(transient.issues.map((i) => i.type), ['prop_not_library']);

  const noImage = evaluateShot(shot({ props: ['扳手'] }), snapshot({ props: [{ name: '扳手', refUrl: '' }] }), 'frame');
  assert.equal(noImage.ready, false);
  assert.match(formatReadinessMessage(noImage), /道具「扳手」还没有道具图/);
});

test('没有画面提示词不能出图；生成视频还要求首帧已存在', () => {
  const noPrompt = evaluateShot(shot({ prompt: '  ' }), snapshot(), 'frame');
  assert.equal(noPrompt.ready, false);
  assert.deepEqual(noPrompt.issues.map((i) => i.type), ['no_prompt']);

  assert.equal(evaluateShot(shot(), snapshot(), 'video').ready, false);
  assert.equal(evaluateShot(shot({ firstFrame: 'a://first.png' }), snapshot(), 'video').ready, true);
});

test('参考图超过上限时截断并降级为警告，不静默丢弃', () => {
  const many = {
    characters: Array.from({ length: 10 }, (_, i) => ({ name: `角色${i}`, views: fullViews, refUrl: `a://c${i}.png` })),
    studios: [],
    props: [],
  };
  const r = evaluateShot(shot({ characters: many.characters.map((c) => c.name), location: '', props: [] }), many, 'frame');
  assert.equal(r.references.length, 8);
  assert.ok(r.issues.some((i) => i.type === 'too_many_references' && !i.blocking));
});

test('分镜字段还原：角色可为对象数组，提示词按出图/出视频取不同字段', () => {
  const scene = {
    id: 7,
    description: '镜头描述',
    prompt_template: '',
    first_frame_prompt: '首帧描述',
    video_prompt: '视频描述',
    first_frame_url: 'a://first.png',
    variables: { characters: [{ name: '老李' }, '顾北'], location: '炉城-三号换热站', props: ['扳手'] },
  };
  assert.deepEqual(shotAssetsFromScene(scene, 'frame'), {
    characters: ['老李', '顾北'],
    location: '炉城-三号换热站',
    props: ['扳手'],
    prompt: '首帧描述',
    firstFrame: 'a://first.png',
  });
  assert.equal(shotAssetsFromScene(scene, 'video').prompt, '视频描述');
  // 没有专用提示词时回退到镜头描述
  assert.equal(shotAssetsFromScene({ ...scene, first_frame_prompt: '', video_prompt: '' }, 'frame').prompt, '镜头描述');
});

test('读不到工程或分镜时返回 null，绝不假装校验通过', async () => {
  globalThis.__docs = undefined;
  assert.equal(await checkStoryboardReadiness(1, 7, 'frame'), null);
  assert.equal(await checkStoryboardReadiness(null, 7, 'frame'), null);
});

test('缺项必须带上「缺哪个资产」：UI 要据此一键跳到该资产补图', () => {
  const r = evaluateShot(
    shot({ characters: ['老李'], props: ['扳手'] }),
    snapshot({
      characters: [{ id: 11, name: '老李', views: { ...fullViews, side: '' }, refUrl: 'a://lao.png' }],
      studios: [{ id: 22, name: '炉城-三号换热站', refUrl: '' }],
      props: [{ id: 33, name: '扳手', refUrl: '' }],
    }),
    'frame',
  );
  const byType = new Map(r.issues.map((i) => [i.type, i]));
  assert.deepEqual(byType.get('character_views_missing').asset, { kind: 'character', id: 11, name: '老李' });
  assert.deepEqual(byType.get('scene_image_missing').asset, { kind: 'studio', id: 22, name: '炉城-三号换热站' });
  assert.deepEqual(byType.get('prop_image_missing').asset, { kind: 'prop', id: 33, name: '扳手' });
  // 不存在的资产给不出 ID，只能标成不可点，否则跳过去是个打不开的编辑页
  const missing = evaluateShot(shot({ characters: ['陌生人甲'] }), snapshot(), 'frame');
  assert.equal(missing.issues.find((i) => i.type === 'character_not_found').asset, undefined);
});

test('旧快照没带 id 时不得崩，也不得编造一个可跳转的引用', () => {
  const r = evaluateShot(
    shot({ characters: ['老李'] }),
    snapshot({ characters: [{ name: '老李', views: fullViews, refUrl: '' }] }),
    'frame',
  );
  const issue = r.issues.find((i) => i.type === 'character_image_missing');
  assert.equal(issue.asset, undefined);
  assert.equal(r.ready, false);
});

test('端到端：从本地文档读分镜 + 资产，未出齐图就拦住，出齐后给出有序参考图', async () => {
  const views = (p) => ({
    front_view_url: `${p}_front.png`, side_view_url: `${p}_side.png`, back_view_url: `${p}_back.png`,
  });
  globalThis.__docs = {
    storyboards: { scenes: [{ id: 7, first_frame_prompt: '两人拧阀门', variables: { characters: ['老李'], location: '炉城-三号换热站', props: ['扳手'] } }] },
    characters: { items: [{ id: 1, name: '老李', project_id: 1 }] },
    characterStates: { items: [{ id: 11, character_id: 1, is_base_model: true, is_active: true, ...views('lao') }] },
    studios: { items: [{ id: 2, name: '炉城-三号换热站', project_id: 1 }] },
    scenes: { items: [] },
    environments: { items: [] },
    props: { props: [{ id: 3, name: '扳手', project_id: 1 }] },
  };

  const blocked = await checkStoryboardReadiness(1, 7, 'frame');
  assert.equal(blocked.ready, false);
  assert.match(formatReadinessMessage(blocked), /影棚「炉城-三号换热站」还没有场景图/);
  // 从真实文档读出来的缺项也要能定位到库 ID，否则分镜空状态给不出「去生成」
  const refs = blocked.issues.filter((i) => i.asset).map((i) => `${i.asset.kind}:${i.asset.id}`);
  assert.deepEqual(refs, ['studio:2', 'prop:3']);

  // 补上影棚九宫格与道具图后就该放行，并按角色→影棚→道具收集参考图
  globalThis.__docs.studios.items[0].nine_grid_image_url = 'studio_nine.png';
  globalThis.__docs.props.props[0].image_url = 'wrench.png';
  const ok = await checkStoryboardReadiness(1, 7, 'frame');
  assert.equal(ok.ready, true);
  assert.deepEqual(ok.references.map((r) => r.url), ['lao_front.png', 'studio_nine.png', 'wrench.png']);
});

test('门禁必须给出处置动作：缺影棚图→九宫格，缺道具图→道具图', () => {
  const r = evaluateShot(
    shot({ characters: ['陌生人'], props: ['扳手'] }),
    snapshot({ studios: [{ name: '炉城-三号换热站', refUrl: '' }], props: [{ name: '扳手', refUrl: '' }] }),
    'frame',
  );
  assert.equal(r.ready, false);
  const hints = readinessFixHints(r);
  assert.ok(hints.some((h) => h.includes('generate_studio_nine_grid')), `缺影棚图应提示九宫格动作：${hints}`);
  assert.ok(hints.some((h) => h.includes('generate_prop_image')), `缺道具图应提示道具出图动作：${hints}`);
  // 同类问题只留一条，别把提示刷成流水账
  assert.equal(hints.filter((h) => h.includes('generate_prop_image')).length, 1);
});

test('提示里的动作名必须真的注册在智能体桥接层，否则等于让智能体调一个不存在的工具', () => {
  const bridge = readFileSync(
    fileURLToPath(new URL('../views/StoryBoard/plugins/ai-assistant/useAIAssistantBridge.ts', import.meta.url)),
    'utf8',
  );
  const registered = new Set([...bridge.matchAll(/action === '([a-z_]+)'/g)].map((m) => m[1]));
  const blockingTypes = [
    'no_prompt',
    'character_not_found',
    'character_views_missing',
    'character_image_missing',
    'no_location',
    'scene_not_found',
    'scene_image_missing',
    'prop_image_missing',
    'no_first_frame',
  ];
  const hints = readinessFixHints({
    ready: false,
    references: [],
    issues: blockingTypes.map((t) => ({ type: t, message: t, blocking: true })),
  });
  // 9 个阻断类型，两个角色缺图类型共用一条
  assert.equal(hints.length, 8, `应逐类给出提示，实际：${hints.join(' / ')}`);
  for (const hint of hints) {
    const cited = [...hint.matchAll(/(?:用|（)\s*([a-z]+(?:_[a-z0-9]+)+)/g)].map((m) => m[1]);
    assert.ok(cited.length > 0, `提示没有给出可执行动作：${hint}`);
    for (const name of cited) {
      assert.ok(registered.has(name), `提示里的动作 ${name} 在桥接层找不到：${hint}`);
    }
  }
  // 非阻断项（如未入库道具、参考图超限）不该刷出「去补图」的误导提示
  assert.deepEqual(
    readinessFixHints({ ready: true, references: [], issues: [{ type: 'too_many_references', message: 'x', blocking: false }] }),
    [],
  );
});

test('角色列表的就绪字段必须从 characterStates 算出来，否则分镜里的 chip 永远琥珀', async () => {
  globalThis.__docs = {
    characterStates: {
      items: [
        { id: 11, character_id: 1, is_base_model: true, front_view_url: 'f.png', side_view_url: 's.png', back_view_url: 'b.png' },
        { id: 12, character_id: 1, is_active: true, name: '工服', outfit: '深蓝色工装', front_view_url: 'active.png' },
        { id: 21, character_id: 2, is_base_model: true, front_view_url: 'g_front.png' },
      ],
    },
  };
  const [done, half] = await deriveCharacterReadinessFields('test://proj', [
    { id: 1, name: '老李' },
    { id: 2, name: '顾北' },
  ]);
  assert.equal(done.has_base_model_views, 1);
  assert.equal(done.active_state_image_url, 'active.png');
  assert.equal(done.base_model_image_url, 'f.png');
  assert.equal(done.states_count, 2);
  assert.equal(half.has_base_model_views, 0);
  // 旧字段不能被冲掉
  assert.equal(half.name, '顾北');
});
