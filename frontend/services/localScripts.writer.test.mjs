/** 写手注入链路回归：node --test services/localScripts.writer.test.mjs
 *
 * 这一层要守住的是「选角只发生一次、结果必须落库复用、任何失败都不许挡住剧本生成」。
 * 做法与 localCharacters.test.mjs 一致：转译真实的 localScripts.ts 执行，
 * 只把 localAI（模型）、localStore（持久化）换成可控桩；
 * writerStyle 与 projectSettings 用真实模块 —— 选角结果是否真的写进工程设置、
 * 临时写手是否真的优先，只有跑真实实现才算验证。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

/** 已加载模块表：真实模块之间靠它互相引用，避免 data: URL 相对路径无法解析 */
const MODS = {};
globalThis.__mods = MODS;
// saveProjectGenerationSettings 会广播变更事件，Node 里补最小 window
globalThis.window = { dispatchEvent: () => {} };
globalThis.CustomEvent = globalThis.CustomEvent
  || class { constructor(type, opts) { this.type = type; this.detail = opts?.detail; } };

async function loadTs(file, { as, stubs = {}, remotes = {} } = {}) {
  let source = readFileSync(fileURLToPath(new URL(file, import.meta.url)), 'utf8');
  for (const [spec, code] of Object.entries(stubs)) {
    const re = new RegExp(`import\\s*\\{[^}]*\\}\\s*from\\s*'\\./${spec}';`);
    assert.ok(re.test(source), `${file} 未找到 ./${spec} 依赖（import 形态变了要同步改测试）`);
    source = source.replace(re, code);
  }
  for (const [spec, modName] of Object.entries(remotes)) {
    const re = new RegExp(`import\\s*\\{([^}]*)\\}\\s*from\\s*'\\./${spec}';`);
    const matched = re.exec(source);
    assert.ok(matched, `${file} 未找到 ./${spec} 依赖（import 形态变了要同步改测试）`);
    const names = matched[1]
      .split(',')
      .map((raw) => raw.trim())
      .filter((raw) => raw && !raw.startsWith('type '))
      .map((raw) => raw.split(/\s+as\s+/).pop().trim());
    source = source.replace(re, `const { ${names.join(', ')} } = globalThis.__mods.${modName};`);
  }
  const js = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const mod = await import('data:text/javascript;base64,' + Buffer.from(js, 'utf8').toString('base64'));
  if (as) MODS[as] = mod;
  return mod;
}

const LOCAL_STORE_FOR_SCRIPTS = `
  const readDoc = async (p, name, def) => structuredClone(globalThis.__store[p + '#' + name] ?? def);
  const writeDoc = (p, name, data) => { globalThis.__store[p + '#' + name] = structuredClone(data); };
  const resolveLocalPath = async (id) => (Number(id) > 0 ? 'test://p' + Number(id) : null);
  const getActiveProjectPath = () => globalThis.__activePath;
`;
const LOCAL_STORE_FOR_PROJECT_SETTINGS = `
  const readProjectDoc = async (id, name, def) => structuredClone(globalThis.__store['test://p' + Number(id) + '#' + name] ?? def);
  const writeProjectDoc = async (id, name, data) => { globalThis.__store['test://p' + Number(id) + '#' + name] = structuredClone(data); return true; };
`;
const LOCAL_AI = `
  const resolveModel = async () => globalThis.__model;
  const chatText = async ({ model, messages, temperature }) => {
    const system = String(messages?.[0]?.content || '');
    const user = String(messages?.[1]?.content || '');
    globalThis.__chats.push({ system, user, model, temperature });
    return { content: globalThis.__reply({ system, user }), usage: { total_tokens: 12 } };
  };
`;

// 依赖顺序加载：writerStyle → uniqueName → projectSettings → localScripts
// （后三者引用前面的真实实现；uniqueName 也必须真跑，否则同名消歧变成测试里的自说自话）
await loadTs('./writerStyle.ts', { as: 'writerStyle' });
await loadTs('./uniqueName.ts', { as: 'uniqueName' });
await loadTs('./projectSettings.ts', {
  as: 'projectSettings',
  stubs: { localStore: LOCAL_STORE_FOR_PROJECT_SETTINGS },
  remotes: { writerStyle: 'writerStyle' },
});
const { routeScripts } = await loadTs('./localScripts.ts', {
  as: 'localScripts',
  stubs: { localAI: LOCAL_AI, localStore: LOCAL_STORE_FOR_SCRIPTS },
  remotes: { writerStyle: 'writerStyle', projectSettings: 'projectSettings', uniqueName: 'uniqueName' },
});
const { WRITER_PRESETS, findWriterPreset, rankWritersByFit } = MODS.writerStyle;

const PROJECT_ID = 7;
const generateUrl = new URL('http://local/api/scripts/generate');
const castUrl = new URL('http://local/api/scripts/cast-writer');
const analyzeUrl = new URL('http://local/api/scripts/analyze');
const optimizeUrl = new URL('http://local/api/scripts/optimize');
const uploadUrl = new URL('http://local/api/scripts/upload');
const bindUrl = new URL('http://local/api/scripts/bind');

/** 剧本正文样例：符合大纲面板解析契约（场景标题 + 「角色名：」台词） */
const SCRIPT_TEXT = ['第一场', '老李：这案子我接了。', '陈默（内心）：他不会告密的。', '', '第二场', '画外音：十年前的那个雨夜。'].join('\n');

const isCastCall = ({ system }) => system.includes('剧作总监');
const isAnalyzeCall = ({ system }) => system.includes('剧本评估专家');
const isOptimizeCall = ({ system }) => system.includes('优化指令对给定剧本');

/**
 * 装配一次测试运行。
 * @param {{ model?: any, settings?: object, cast?: any, scripts?: object }} opts
 */
function setup(opts = {}) {
  globalThis.__store = { [`test://p${PROJECT_ID}#projectSettings`]: structuredClone(opts.settings ?? {}) };
  // 同名消歧的回归必须能从「工程里已有一本剧本」起步，否则测不到冲突分支
  if (opts.scripts) globalThis.__store[`test://p${PROJECT_ID}#scripts`] = structuredClone(opts.scripts);
  globalThis.__activePath = `test://p${PROJECT_ID}`;
  globalThis.__model = 'model' in opts ? opts.model : { provider: 'test', model_name: 'glm-4' };
  globalThis.__chats = [];
  const castPayload = opts.cast === undefined
    ? { chosen: 'akutagawa', rationale: '人性暗面与反转契合', candidates: [{ key: 'akutagawa', fit: 90, reason: '悬疑反转' }] }
    : opts.cast;
  globalThis.__reply = ({ system }) => {
    if (isCastCall({ system })) return typeof castPayload === 'string' ? castPayload : JSON.stringify(castPayload);
    if (isAnalyzeCall({ system })) return JSON.stringify({ overallScore: 82, dimensions: [{ name: '去 AI 味', score: 70, comment: '有两处段末升华' }], summary: '整体可用' });
    if (isOptimizeCall({ system })) return JSON.stringify({ optimizedContent: SCRIPT_TEXT, changes: ['收紧对白'] });
    return SCRIPT_TEXT;
  };
}

const post = async (url, body) => {
  const resp = await routeScripts(url, 'POST', body);
  assert.ok(resp, `${url.pathname} 未被本地路由接管（会落到中性兜底造成假成功）`);
  return { status: resp.status, data: await resp.json() };
};
const settingsDoc = () => globalThis.__store[`test://p${PROJECT_ID}#projectSettings`] || {};
const scriptsDoc = () => globalThis.__store[`test://p${PROJECT_ID}#scripts`] || { nextId: 1, scripts: [] };
const castCalls = () => globalThis.__chats.filter(isCastCall);
const generateCall = () => globalThis.__chats.find(({ system }) => !isCastCall({ system }) && !isAnalyzeCall({ system }) && !isOptimizeCall({ system }));

// ==================== 选角只发生一次 ====================

test('未锁定写手：生成时选角一次并把结果写回工程设置', async () => {
  setup();
  const { status, data } = await post(generateUrl, { projectId: PROJECT_ID, description: '校园悬疑，旧课桌里的日记，反转，人性暗面' });

  assert.equal(status, 200, JSON.stringify(data));
  assert.equal(castCalls().length, 1, '未锁定时应选角一次');
  assert.equal(data.writer.key, 'akutagawa');
  assert.equal(data.writer.recast, true, '首轮必须标记为重新选角');
  assert.match(data.writer.rationale, /契合/);

  const saved = settingsDoc();
  assert.equal(saved.writerKey, 'akutagawa', '选角结果未落库，下一集会重新选人');
  assert.equal(saved.writerStylePrompt, findWriterPreset('akutagawa').voice);
  assert.match(saved.writerNote, /契合/);

  // 落库后：第二集复用同一写手，不再调用模型选角
  const second = await post(generateUrl, { projectId: PROJECT_ID, episodeNumber: 2, description: '承接上一集' });
  assert.equal(second.status, 200);
  assert.equal(castCalls().length, 1, '已锁定后不得再次选角');
  assert.equal(second.data.writer.key, 'akutagawa');
  assert.equal(second.data.writer.recast, false);
  assert.equal(scriptsDoc().scripts.length, 2, '两集剧本都应入库');
  assert.ok(scriptsDoc().scripts.every((s) => typeof s.content === 'string' && s.content.includes('第一场')),
    '写手层不得把剧本正文变成别的形态');
});

test('显式不限定（writerKey = ""）视为已指派，不再自动选角', async () => {
  setup({ settings: { writerKey: '', writerStylePrompt: '', writerNote: '' } });
  const { status } = await post(generateUrl, { projectId: PROJECT_ID, description: '任意题材' });
  assert.equal(status, 200);
  assert.equal(castCalls().length, 0, 'writerKey 为空串是用户显式选择，不得被覆盖');
  assert.equal(settingsDoc().writerKey, '');
  const { system } = generateCall();
  assert.ok(!/【执笔写手：/.test(system), '不限定时不得塞入写手署名');
  assert.match(system, /去 AI 味硬清单/);
  assert.match(system, /剧本格式硬约束/);
});

// ==================== 兜底：绝不阻塞生成 ====================

test('选角返回非法 key：回落本地打分，不抛错、仍能出剧本', async () => {
  setup({ cast: { chosen: '某位不存在的写手', rationale: '模型臆造', candidates: [{ key: 'ghost', fit: 99 }] } });
  const { status, data } = await post(generateUrl, { projectId: PROJECT_ID, description: '都市情感，苍凉的算计' });

  assert.equal(status, 200, '回落失败不应影响剧本生成');
  assert.ok(findWriterPreset(data.writer.key), `落库 key 必须命中写手卡：${data.writer.key}`);
  // 回落目标必须是"同一 brief 的本地首选"，用真实选角调用里的 brief 反算，避免测试与实现各抄一份
  const brief = castCalls()[0].user.split('本集题材与要求：')[1]?.replace(/^\n/, '') || '';
  assert.equal(data.writer.key, rankWritersByFit(brief, 1)[0].key);
  assert.equal(settingsDoc().writerKey, data.writer.key);
  assert.match(generateCall().system, new RegExp(findWriterPreset(data.writer.key).name));
});

test('选角 JSON 彻底不可解析：仍能出剧本（护栏照旧）', async () => {
  setup({ cast: '对不起，我无法判断' });
  const { status, data } = await post(generateUrl, { projectId: PROJECT_ID, description: '乡土牧歌，温厚哀愁' });
  assert.equal(status, 200);
  assert.ok(findWriterPreset(data.writer.key));
  assert.match(generateCall().system, /剧本格式硬约束/);
});

test('无文本模型：选角环节不抛错，失败原因仍是"缺模型"而非写手层', async () => {
  setup({ model: null });
  const cast = await post(castUrl, { projectId: PROJECT_ID, description: '高密乡的魔幻往事，感官泛滥' });
  assert.equal(cast.status, 200, '无模型时选角必须用本地打分兜底');
  assert.ok(findWriterPreset(cast.data.writer.key), cast.data.writer.key);
  assert.equal(cast.data.recast, true);

  const gen = await post(generateUrl, { projectId: PROJECT_ID, description: '任意题材' });
  assert.equal(gen.status, 400);
  assert.match(gen.data.message, /文本模型/, '不能把缺模型报成写手层故障');
});

// ==================== 生效优先级 ====================

test('用户改写过的 writerStylePrompt 跟随注入，不再使用卡内置 voice', async () => {
  setup({ settings: { writerKey: 'luxun', writerStylePrompt: '我自己的笔法甲乙丙', writerNote: '手工改写' } });
  const { status } = await post(generateUrl, { projectId: PROJECT_ID, description: '国民性批判' });
  assert.equal(status, 200);
  const { system } = generateCall();
  assert.match(system, /我自己的笔法甲乙丙/);
  assert.ok(!system.includes(findWriterPreset('luxun').voice), '改写后的笔法应覆盖内置 voice');
  assert.equal(castCalls().length, 0);
  // 改写只影响提示词，不动故事骨架也不动落库值
  assert.equal(settingsDoc().writerStylePrompt, '我自己的笔法甲乙丙');
});

test('临时写手优先于工程锁定写手，且不落库、不改写锁定值', async () => {
  setup({
    settings: {
      writerKey: 'luxun', writerStylePrompt: '我自己的笔法甲乙丙', writerNote: '锁定理由',
      tempWriterKey: 'chandler', tempWriterNote: '这一集想要冷硬夜色',
    },
  });
  const { status, data } = await post(generateUrl, { projectId: PROJECT_ID, description: '侦探夜色' });
  assert.equal(status, 200);
  assert.equal(data.writer.key, 'chandler', '临时写手必须压过锁定写手');
  assert.match(data.writer.rationale, /冷硬夜色/);
  const { system } = generateCall();
  assert.match(system, new RegExp(findWriterPreset('chandler').name));
  assert.ok(!system.includes('我自己的笔法甲乙丙'), '临时写手生效时不得夹带锁定写手的笔法');
  assert.equal(settingsDoc().writerKey, 'luxun', '临时覆盖不得改写工程锁定值');
  assert.equal(castCalls().length, 0, '临时覆盖时不应再选角');
});

test('cast-writer 端点：默认沿用锁定写手，force 才重选', async () => {
  setup({ settings: { writerKey: 'laoshe', writerStylePrompt: '', writerNote: '市井幽默' } });
  const reuse = await post(castUrl, { projectId: PROJECT_ID, description: '北京话小人物' });
  assert.equal(reuse.data.writer.key, 'laoshe');
  assert.equal(reuse.data.recast, false);
  assert.match(reuse.data.message, /沿用工程锁定写手/);
  assert.equal(castCalls().length, 0);

  const forced = await post(castUrl, { projectId: PROJECT_ID, description: '北京话小人物', force: true });
  assert.equal(forced.data.recast, true);
  assert.equal(castCalls().length, 1);
  assert.equal(forced.data.writer.key, 'akutagawa', 'force 应采纳模型选择');
  assert.equal(settingsDoc().writerKey, 'akutagawa', '重选结果要落库');

  const noBrief = await post(castUrl, { projectId: PROJECT_ID });
  assert.equal(noBrief.status, 400, '没有题材时不应瞎选');
});

// ==================== 润色 / 分析沿用同一写手 ====================

test('润色注入同一写手笔法，并锁死"不得改动故事骨架"', async () => {
  setup({ settings: { writerKey: 'dazai', writerStylePrompt: '', writerNote: '自剖' } });
  const { status } = await post(optimizeUrl, {
    projectId: PROJECT_ID, content: SCRIPT_TEXT, instruction: '让结尾更狠',
  });
  assert.equal(status, 200);
  const { system, user } = globalThis.__chats.find(isOptimizeCall);
  assert.match(system, new RegExp(findWriterPreset('dazai').name));
  assert.match(system, /不得改动故事骨架/);
  assert.match(system, /剧本格式硬约束/);
  assert.match(user, /让结尾更狠/);
  assert.equal(castCalls().length, 0, '润色不该改动选角');
});

test('质量分析：锁定写手时给出对标对象，供"风格一致性"评分', async () => {
  setup({ settings: { writerKey: 'hemingway', writerStylePrompt: '', writerNote: '极简' } });
  const { status, data } = await post(analyzeUrl, { projectId: PROJECT_ID, content: SCRIPT_TEXT });
  assert.equal(status, 200);
  const { system, user } = globalThis.__chats.find(isAnalyzeCall);
  assert.match(system, /去 AI 味/);
  assert.match(system, /风格一致性/);
  assert.match(user, new RegExp(findWriterPreset('hemingway').name));
  assert.match(data.analysis.dimensions[0].name, /去 AI 味/);
});

test('未打开工程时两端点都明确拒绝，不产生幽灵写手设置', async () => {
  setup();
  globalThis.__activePath = null;
  const gen = await post(generateUrl, { description: '任意' });
  assert.equal(gen.status, 400);
  assert.match(gen.data.message, /未打开本地工程/);
  const cast = await post(castUrl, { description: '任意' });
  assert.equal(cast.status, 400);
  assert.equal(castCalls().length, 0, '没有工程时不应消耗模型调用，也不该留下半截设置');
  assert.deepEqual(settingsDoc(), {}, '失败的请求不得往工程设置里写写手');
});

// ==================== 同名作品处理：标题消歧 ====================

test('生成：同工程已有同名剧本时追加 (2)，回执与实际入库名一致', async () => {
  setup({ scripts: { nextId: 5, scripts: [{ id: 1, title: '旧课桌', content: 'x' }, { id: 2, title: '天台', content: 'y' }] } });
  const dup = await post(generateUrl, { projectId: PROJECT_ID, title: '旧课桌', description: '校园悬疑' });
  assert.equal(dup.status, 200, JSON.stringify(dup.data));
  assert.equal(dup.data.title, '旧课桌 (2)');
  assert.equal(dup.data.titleRenamed, true, '改名必须回执，否则 UI 无从解释');
  const stored = scriptsDoc().scripts.find((s) => s.id === dup.data.scriptId);
  assert.equal(stored.title, '旧课桌 (2)', '回执名与入库名不能分叉');

  // 已存在的同名带后缀：剥掉重新编号，不产生「 (2) (2)」
  const again = await post(generateUrl, { projectId: PROJECT_ID, title: '旧课桌 (2)', description: '承接' });
  assert.equal(again.data.title, '旧课桌 (3)');

  // 不冲突时一个字都不改
  const fresh = await post(generateUrl, { projectId: PROJECT_ID, title: '崭新的名字', description: '继续' });
  assert.equal(fresh.data.title, '崭新的名字');
  assert.equal(fresh.data.titleRenamed, false, '没重名也报"已改名"会误导用户');
});

test('生成：未填标题时按正文首行取名，同样消歧', async () => {
  setup();
  const first = await post(generateUrl, { projectId: PROJECT_ID, description: '校园悬疑' });
  assert.equal(first.data.title, '第一场', '缺标题时应取正文首行');
  assert.equal(first.data.titleRenamed, false);
  const second = await post(generateUrl, { projectId: PROJECT_ID, description: '承接上一集' });
  assert.equal(second.data.title, '第一场 (2)', '默认名重复时同样要消歧');
});

test('上传导入同一份稿件：标题消歧，回执返回消歧后的名字', async () => {
  setup({ scripts: { nextId: 3, scripts: [{ id: 1, title: '导入剧本', content: 'x' }] } });
  const res = await post(uploadUrl, { projectId: PROJECT_ID, content: SCRIPT_TEXT, title: '导入剧本' });
  assert.equal(res.status, 200, JSON.stringify(res.data));
  assert.equal(res.data.title, '导入剧本 (2)');
  assert.equal(scriptsDoc().scripts.find((s) => s.id === res.data.scriptId).title, '导入剧本 (2)');
});

test('润色：另存新剧本要消歧，覆盖原稿绝不改名', async () => {
  setup({ scripts: { nextId: 3, scripts: [{ id: 1, title: '第一场', content: '旧稿' }] } });
  const asNew = await post(optimizeUrl, {
    projectId: PROJECT_ID, content: SCRIPT_TEXT, instruction: '让结尾更狠', saveMode: 'new',
  });
  assert.equal(asNew.status, 200, JSON.stringify(asNew.data));
  assert.equal(asNew.data.title, '第一场 (2)', '另存的新剧本与原稿同名会分不清');

  const overwrite = await post(optimizeUrl, {
    projectId: PROJECT_ID, scriptId: 1, instruction: '让结尾更狠', saveMode: 'overwrite',
  });
  assert.equal(overwrite.status, 200, JSON.stringify(overwrite.data));
  assert.equal(overwrite.data.title, '第一场', '覆盖式保存改的是同一条记录，不是新增');
  assert.equal(scriptsDoc().scripts.filter((s) => s.title === '第一场').length, 1, '覆盖不得追加副本');
});

test('绑定参考引用：目标工程已有同名剧本时消歧，绑定关系仍指向源', async () => {
  setup({ scripts: { nextId: 3, scripts: [{ id: 1, title: '旧课桌', content: 'x' }] } });
  const res = await post(bindUrl, { sourceScriptId: 1, sourceProjectId: PROJECT_ID, targetProjectId: PROJECT_ID });
  assert.equal(res.status, 200, JSON.stringify(res.data));
  const ref = scriptsDoc().scripts.find((s) => s.id === res.data.scriptId);
  assert.equal(ref.title, '旧课桌 (2)');
  assert.equal(ref.source_script_id, 1, '改名不影响回溯：引用键必须仍是源 id');
  // 幂等：重复绑定同一源不再追加第三条
  const again = await post(bindUrl, { sourceScriptId: 1, sourceProjectId: PROJECT_ID, targetProjectId: PROJECT_ID });
  assert.equal(again.data.scriptId, res.data.scriptId);
  assert.equal(scriptsDoc().scripts.filter((s) => s.is_reference).length, 1);
});

// ==================== 同名作品处理：原作同名护栏 ====================

test('标题与写手代表作同名：加护栏、回执 sameWork，但不引入原作人物', async () => {
  setup();
  const { status, data } = await post(generateUrl, { projectId: PROJECT_ID, title: '罗生门', description: '一桩旧案，几个目击者各说一词' });
  assert.equal(status, 200, JSON.stringify(data));
  assert.equal(data.writer.sameWork?.work, '罗生门');
  assert.equal(data.writer.sameWork?.writer, findWriterPreset('akutagawa').name);
  const { system } = generateCall();
  assert.match(system, /同名原作提醒/);
  assert.match(system, /原创性底线/);
  assert.match(system, /剧本格式硬约束/);
  assert.ok(!system.includes('多襄丸'), '提示词不得引入原作人物名');
  assert.equal(data.title, '罗生门', '同名原作不该改动用户起的标题');
});

test('标题未命中同名：不加提醒、sameWork 为 null', async () => {
  setup();
  const { data } = await post(generateUrl, { projectId: PROJECT_ID, title: '旧课桌', description: '校园悬疑' });
  assert.equal(data.writer.sameWork ?? null, null, '未命中不该制造假警报');
  assert.ok(!generateCall().system.includes('同名原作提醒'));
});

test('cast-writer：同名命中同时挂在顶层与 writer 上，供智能体与 UI 共用', async () => {
  setup();
  const res = await post(castUrl, { projectId: PROJECT_ID, title: '罗生门', description: '一桩旧案', force: true });
  assert.equal(res.status, 200, JSON.stringify(res.data));
  assert.equal(res.data.sameWork?.work, '罗生门');
  assert.equal(res.data.writer.sameWork?.work, '罗生门');
});

test('润色：原稿或指令点名原作时追加同名提醒', async () => {
  setup({ settings: { writerKey: 'yuhua', writerStylePrompt: '', writerNote: '冷叙述' } });
  const { status } = await post(optimizeUrl, {
    projectId: PROJECT_ID, content: SCRIPT_TEXT, instruction: '结构参照《活着》的重复推进',
  });
  assert.equal(status, 200);
  const { system } = globalThis.__chats.find(isOptimizeCall);
  assert.match(system, /同名原作提醒/);
  assert.match(system, /《活着》/);
  assert.ok(!system.includes('福贵'), '不得把原作人物名塞进提示词');
});
