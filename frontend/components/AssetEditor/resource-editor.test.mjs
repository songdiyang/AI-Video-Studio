import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

// 无浏览器/付费依赖：执行真实草稿控制器和组件函数，模拟 Hook 生命周期、API、计时器及 Portal。
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const deferred = () => { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; };
const tick = async () => { for (let i = 0; i < 20; i++) await Promise.resolve(); };
function environment() {
  let active;
  const api = {};
  const calls = [];
  const timers = new Map();
  let timerId = 0;
  const windows = new Map();
  const jsx = (type, props, key) => ({ type, props: props || {}, key });
  const same = (a, b) => a && b && a.length === b.length && a.every((item, i) => Object.is(item, b[i]));
  const react = {
    useState(init) {
      const runner = active, index = runner.index++;
      if (!(index in runner.hooks)) {
        const record = { value: typeof init === 'function' ? init() : init };
        record.set = value => { const next = typeof value === 'function' ? value(record.value) : value; if (!Object.is(next, record.value)) { record.value = next; runner.changed = true; } };
        runner.hooks[index] = record;
      }
      const record = runner.hooks[index]; return [record.value, record.set];
    },
    useRef(value) { const runner = active, index = runner.index++; return runner.hooks[index] ||= { current: value }; },
    useCallback(value, deps) { const runner = active, index = runner.index++; if (!same(runner.hooks[index]?.deps, deps)) runner.hooks[index] = { value, deps }; return runner.hooks[index].value; },
    useEffect(fn, deps) {
      const runner = active, index = runner.index++;
      if (!same(runner.hooks[index]?.deps, deps)) { const old = runner.hooks[index]; runner.hooks[index] = { deps, cleanup: old?.cleanup }; runner.effects.push(() => { old?.cleanup?.(); runner.hooks[index].cleanup = fn(); }); }
    },
    useReducer(reducer, initial) { const [value, set] = react.useState(initial); const dispatch = react.useCallback(action => set(prev => reducer(prev, action)), []); return [value, dispatch]; },
  };
  react.useLayoutEffect = react.useEffect;
  react.default = react;
  const cache = new Map();
  const mockApi = new Proxy(api, { get(object, key) {
    if (key === '__esModule') return true;
    if (key === 'COSTUME_CATEGORIES') return ['日常', '战斗'];
    if (key === 'AGE_STAGES') return ['童年', '青年'];
    if (key === 'STATE_CATEGORIES') return [{ key: 'daily', label: '日常' }, { key: 'costume', label: '服装' }, { key: 'effect', label: '效果' }];
    if (key === 'getAuthToken') return () => 'mock-token';
    return (...args) => { calls.push([key, ...args]); return object[key] ? object[key](...args) : Promise.resolve({}); };
  } });
  function load(relative) {
    const filename = path.resolve(root, relative);
    if (cache.has(filename)) return cache.get(filename);
    const source = ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
    const module = { exports: {} };
    const require = name => {
      if (name === 'react') return react;
      if (name === 'react/jsx-runtime') return { jsx, jsxs: jsx, Fragment: 'Fragment' };
      if (name === 'react-dom') return { createPortal: (child, target) => jsx('Portal', { children: child, target }) };
      if (name === '@heroui/react' || name === 'lucide-react') return new Proxy({}, { get: (_, key) => key });
      if (name.includes('/services/')) return mockApi;
      if (name.includes('useWorkflow')) return { getActiveWorkflows: async () => ({ jobs: [] }), consumeWorkflow: async () => ({}) };
      if (name.includes('ToastContext')) return { useToast: () => ({ showToast() {} }) };
      if (name.includes('ConfirmContext')) return { useConfirm: () => ({ confirm: async () => true }) };
      if (name.includes('PreviewProvider')) return { usePreview: () => ({ openPreview() {} }) };
      if (name.includes('useAIModels')) return { useAIModels: () => ({ models: [], selected: { image: 'mock-image', text: 'mock-text' }, setSelected() {} }) };
      if (name.endsWith('resourceDraft') || name.endsWith('useResourceDraft')) return load(path.relative(root, path.resolve(path.dirname(filename), `${name}.ts`)));
      return { __esModule: true, default: name.split('/').at(-1) };
    };
    const context = { module, exports: module.exports, require, console, Promise, Set, Map, Object, JSON, Number, String, Array, Error,
      setTimeout: (fn, ms) => { const id = ++timerId; timers.set(id, { fn, ms }); return id; }, clearTimeout: id => timers.delete(id),
      window: { addEventListener: (key, fn) => windows.set(key, fn), removeEventListener: key => windows.delete(key), dispatchEvent() {} },
      CustomEvent: class { constructor(type, init) { this.type = type; this.detail = init.detail; } },
      fetch: async (...args) => { calls.push(['fetch', ...args]); return api.fetch ? api.fetch(...args) : { ok: true, json: async () => ({}) }; },
    };
    vm.runInNewContext(source, context, { filename }); cache.set(filename, module.exports); return module.exports;
  }
  class Runner {
    constructor(component, props) { this.component = component; this.props = props; this.hooks = []; this.effects = []; this.changed = true; }
    render() {
      let count = 0;
      do {
        if (++count > 30) throw new Error('组件重复注册或状态回传导致渲染循环');
        this.changed = false; this.index = 0; active = this;
        this.tree = this.component(this.props); active = undefined;
        const effects = this.effects.splice(0); effects.forEach(effect => effect());
      } while (this.changed);
      return this.tree;
    }
    unmount() { this.hooks.forEach(record => record.cleanup?.()); }
  }
  function mount(file, props) { const wrapper = load(file).default; const element = wrapper(props); const runner = new Runner(element.type, element.props); runner.render(); return runner; }
  return { load, mount, api, calls, timers };
}
const nodes = (node, predicate) => {
  if (!node || typeof node !== 'object') return [];
  if (Array.isArray(node)) return node.flatMap(child => nodes(child, predicate));
  return [...(predicate(node) ? [node] : []), ...nodes(node.props?.children, predicate)];
};
/** HeroUI 按钮里多个插值子节点会被编译成数组，断言文本需先拼接 */
const label = node => Array.isArray(node.props?.children) ? node.props.children.map(String).join('') : String(node.props?.children ?? '');
const button = (runner, text) => nodes(runner.tree, node => node.type === 'Button' && label(node) === text)[0];
const panel = runner => nodes(runner.tree, node => node.type === 'ContentEditorPanel')[0];
const input = (runner, label) => nodes(runner.tree, node => node.props?.label === label && typeof node.props.onValueChange === 'function')[0];
const plain = value => JSON.parse(JSON.stringify(value));
const assetFile = 'components/AssetEditor/index.tsx';
const stateFile = 'views/AssetsManager/AssetModel/CharacterStateEditor.tsx';
const initial = { id: 7, project_id: 9, name: '旧名', description: '旧描述', image_url: 'media', unknown: { retained: true } };

for (const type of ['character', 'prop', 'studio', 'environment', 'building', 'costume', 'scene', 'script']) {
  test(`${type}：唯一底部面板、真实标签、稳定注册和白名单保存`, async () => {
    const env = environment(); let handle; const registrations = []; const saved = [];
    const props = { tabId: `asset-${type}-7`, assetType: type, initialData: initial, onClose() {}, editorPortalTarget: {}, onSaved: value => saved.push(value), onRegisterEditor: value => { handle = value; registrations.push(value); } };
    env.api.fetchCostume = async () => ({ ...initial, front_view_url: 'front', side_view_url: 'side', back_view_url: 'back' });
    const runner = env.mount(assetFile, props);
    const p = panel(runner);
    assert.ok(p); assert.equal(nodes(runner.tree, node => node.type === 'ContentEditorPanel').length, 1);
    assert.equal(p.props.tabs.some(tab => tab.id === 'prompts'), type === 'costume');
    assert.equal(p.props.tabs.some(tab => tab.id === 'states'), type === 'character');
    assert.equal(p.props.tabs.some(tab => tab.id === 'assembly'), ['scene', 'studio'].includes(type));
    input(runner, type === 'script' ? '剧本标题' : '名称').props.onValueChange('新名'); runner.render();
    const a = handle.flush(), b = handle.flush(); assert.equal(a, b); assert.equal(await a, true); runner.render();
    assert.equal(registrations.length, 1);
    assert.equal(saved.at(-1).id, 7); assert.equal(saved.at(-1).project_id, 9); assert.equal(saved.at(-1).image_url, 'media');
    const writes = env.calls.filter(([name]) => String(name).startsWith('update'));
    assert.ok(writes.length); assert.equal(writes[0][1], 7);
    if (type !== 'script') { assert.equal(writes[0][2].unknown, undefined); assert.equal(writes[0][2].name, '新名'); }
    if (!['costume', 'script'].includes(type)) assert.equal(writes[0][2].image_url, undefined);
    if (type === 'costume') assert.equal(writes[0][2].front_view_url, 'front');
    runner.unmount(); assert.equal(registrations.at(-1), null);
  });
}

test('null 宿主不挂旧表单；undefined 保留独立入口', () => {
  const env = environment();
  const props = { tabId: 'asset-prop-7', assetType: 'prop', initialData: initial, onClose() {} };
  const pending = env.mount(assetFile, { ...props, editorPortalTarget: null });
  assert.equal(panel(pending), undefined);
  const independent = env.mount(assetFile, props);
  assert.ok(panel(independent)); assert.equal(nodes(independent.tree, node => node.type === 'Portal').length, 0);
  pending.unmount(); independent.unmount();
});

test('在途回包不得覆盖后续输入，手动/自动 flush 串行排空且不覆盖媒体/未知字段', async () => {
  const env = environment(); const { ResourceDraft } = env.load('components/AssetEditor/resourceDraft.ts');
  const first = deferred(); const second = deferred(); const writes = [];
  const session = new ResourceDraft(initial, ['name', 'description'], async payload => { writes.push(plain(payload)); return writes.length === 1 ? first.promise : second.promise; });
  session.edit({ name: '第一稿', image_url: '非法修改' });
  const promise = session.flush(); assert.equal(promise, session.flush()); await tick();
  session.edit({ name: '第二稿' }); session.media({ image_url: 'new-media' });
  first.resolve({ name: '第一稿', image_url: 'old-response', unknown: 'bad' }); await tick();
  assert.equal(session.data.name, '第二稿'); assert.equal(writes.length, 2);
  second.resolve({ name: '第二稿' }); assert.equal(await promise, true);
  assert.equal(session.data.image_url, 'new-media'); assert.deepEqual(plain(session.data.unknown), initial.unknown);
  assert.equal(session.dirty, false); assert.equal(session.status, 'saved');
});

test('失败保留草稿、错误和重试，不触发生成，也不允许内部标签切换', async () => {
  const env = environment(); let handle;
  env.api.updateProp = async () => { throw new Error('offline'); };
  const runner = env.mount(assetFile, { tabId: 'asset-prop-7', assetType: 'prop', initialData: initial, onClose() {}, editorPortalTarget: {}, onRegisterEditor: value => { handle = value; } });
  input(runner, '名称').props.onValueChange('失败稿'); runner.render();
  assert.equal(await handle.flush(), false); runner.render();
  assert.equal(panel(runner).props.status, 'error'); assert.equal(input(runner, '名称').props.value, '失败稿');
  panel(runner).props.onTabChange('properties'); await tick(); runner.render(); assert.equal(panel(runner).props.activeTab, 'content');
  const button = nodes(panel(runner).props.actions, node => node.props?.children === '生成道具设定图')[0];
  button.props.onPress(); await tick(); assert.equal(env.calls.some(([name]) => name === 'fetch'), false);
  env.api.updateProp = async () => ({ name: '失败稿' }); assert.equal(await handle.flush(), true); runner.render(); assert.equal(panel(runner).props.status, 'saved'); runner.unmount();
});

test('两秒自动保存使用最新输入，同目标父级 echo 不重置草稿', async () => {
  const env = environment();
  const props = { tabId: 'asset-prop-7', assetType: 'prop', initialData: initial, onClose() {}, editorPortalTarget: {} };
  const runner = env.mount(assetFile, props);
  input(runner, '名称').props.onValueChange('自动稿'); runner.render();
  runner.props = { ...props, initialData: { ...initial, image_url: 'remote-media' } }; runner.render();
  assert.equal(input(runner, '名称').props.value, '自动稿');
  const autosave = [...env.timers.values()].filter(timer => timer.ms === 2000); assert.equal(autosave.length, 1);
  autosave[0].fn(); await tick(); runner.render();
  assert.equal(env.calls.find(([name]) => name === 'updateProp')[2].name, '自动稿'); runner.unmount();
});

test('环境/建筑 snake_case 回填、空字符串优先、保存回传双命名兼容', () => {
  const env = environment(); const { normalizeAsset, assetSavedData } = env.load('components/AssetEditor/resourceDraft.ts');
  assert.equal(normalizeAsset('environment', { time_of_day: '', timeOfDay: '旧值' }).timeOfDay, '');
  assert.equal(normalizeAsset('environment', { terrain_type: '山地' }).terrainType, '山地');
  assert.equal(normalizeAsset('building', { interior_exterior: 'interior', structure_type: '古建筑' }).interiorExterior, 'interior');
  assert.equal(assetSavedData('building', { structureType: '新建筑' }).structure_type, '新建筑');
});

test('延迟详情响应不能覆盖编辑后甚至已保存的新值', async () => {
  const env = environment(); const { ResourceDraft } = env.load('components/AssetEditor/resourceDraft.ts');
  const session = new ResourceDraft(initial, ['name', 'description'], async value => value);
  const revision = session.revision; session.edit({ name: '新名' }); await session.flush();
  session.receive({ name: '旧名', description: '迟到', image_url: 'fresh' }, revision);
  assert.equal(session.data.name, '新名'); assert.equal(session.data.image_url, 'fresh');
});

test('独立资源对象不共享会话或保存回传', async () => {
  const env = environment(); const wait = deferred(); const firstSaved = [], secondSaved = [];
  env.api.updateProp = async () => wait.promise;
  let firstHandle;
  const a = env.mount(assetFile, { tabId: 'asset-prop-7', assetType: 'prop', initialData: initial, onClose() {}, editorPortalTarget: {}, onRegisterEditor: value => { firstHandle = value; }, onSaved: value => firstSaved.push(value) });
  input(a, '名称').props.onValueChange('前一个对象'); a.render(); const pending = firstHandle.flush(); await tick(); a.unmount();
  const b = env.mount(assetFile, { tabId: 'asset-prop-8', assetType: 'prop', initialData: { ...initial, id: 8 }, onClose() {}, editorPortalTarget: {}, onSaved: value => secondSaved.push(value) });
  wait.resolve({ name: '前一个对象' }); await pending; b.render();
  assert.equal(firstSaved.length, 0); assert.equal(secondSaved.length, 0); assert.equal(input(b, '名称').props.value, initial.name); b.unmount();
});

test('角色状态 body_elements 回填、白名单和分类推断保留', async () => {
  const env = environment(); const { ResourceDraft, normalizeState, statePayload, STATE_FIELDS } = env.load('components/AssetEditor/resourceDraft.ts');
  const source = { ...initial, character_id: 10, body_elements: '左臂纹身', costume_id: 5, voice_config: '{"pitch":1}', equipped_props: [{ prop_id: 4 }] };
  const value = normalizeState(source); assert.equal(value.body_elements, '左臂纹身'); assert.equal(value.voice_config.pitch, 1);
  const payload = statePayload(value); assert.deepEqual(plain(payload.state_category), ['costume', 'effect']);
  assert.equal(payload.image_url, undefined); assert.equal(payload.equipped_props, undefined);
  assert.throws(() => statePayload({ name: ' ' }), /状态名称不能为空/);
  const session = new ResourceDraft(value, STATE_FIELDS, async (_, snapshot) => statePayload(snapshot)); session.edit({ description: '状态新描述' }); await session.flush();
  assert.equal(session.data.body_elements, '左臂纹身');
});

test('角色状态单实例 Portal：内部切换失败保留最新草稿与稳定 flush', async () => {
  const env = environment(); let handle; const registrations = [];
  const rows = [{ ...initial, character_id: 3, is_base_model: true, body_elements: '纹身', front_view_url: 'base' }, { ...initial, id: 8, name: '战斗', character_id: 3 }];
  env.api.fetchCharacter = async () => initial; env.api.fetchCharacterStates = async () => rows; env.api.fetchCharacterCostumes = async () => ({ costumes: [] });
  env.api.updateCharacterState = async () => { throw new Error('offline'); };
  const runner = env.mount(stateFile, { characterId: 3, projectId: 9, editorPortalTarget: {}, actionsPortalTarget: {}, onRegisterEditor: value => { handle = value; registrations.push(value); } });
  await tick(); runner.render();
  assert.equal(input(runner, '身体元素（纹身、疤痕等）').props.value, '纹身');
  input(runner, '状态描述').props.onValueChange('新描述'); runner.render();
  const selector = nodes(runner.tree, node => node.props?.label === '角色状态' && typeof node.props.onChange === 'function')[0];
  assert.ok(selector, '标题行必须有角色状态下拉');
  selector.props.onChange('8'); await tick(); runner.render();
  assert.equal(input(runner, '状态描述').props.value, '新描述'); assert.equal(await handle.flush(), false); assert.equal(registrations.length, 1);
  assert.equal(nodes(runner.tree, node => node.type === 'Portal').length, 2); runner.unmount();
});

test('生成前成功 flush，mock 参数绑定对象 ID 且连续点击只启动一次', async () => {
  const env = environment(); const pending = deferred();
  env.api.generateEnvironmentImage = async () => pending.promise;
  const runner = env.mount(assetFile, { tabId: 'asset-environment-7', assetType: 'environment', initialData: initial, onClose() {}, editorPortalTarget: {} });
  input(runner, '名称').props.onValueChange('生成前草稿'); runner.render();
  const generate = nodes(panel(runner).props.actions, node => node.props?.children === '生成环境背面图')[0];
  generate.props.onPress(); generate.props.onPress(); await tick();
  const relevant = env.calls.filter(([name]) => ['updateEnvironment', 'generateEnvironmentImage'].includes(name));
  assert.deepEqual(relevant.map(item => item[0]), ['updateEnvironment', 'generateEnvironmentImage']);
  assert.equal(relevant[1][1], 7); assert.equal(relevant[1][2].mode, 'back'); assert.equal(relevant[1][2].imageModel, 'mock-image');
  pending.resolve({}); await tick(); runner.unmount();
});

test('服装生成中阻止破坏性的全量 PUT，保留失败草稿', async () => {
  const env = environment(); let handle;
  env.api.fetchCostume = async () => ({ ...initial, generation_status: 'generating' });
  const runner = env.mount(assetFile, { tabId: 'asset-costume-7', assetType: 'costume', initialData: initial, onClose() {}, editorPortalTarget: {}, onRegisterEditor: value => { handle = value; } });
  input(runner, '名称').props.onValueChange('新服装'); runner.render();
  assert.equal(await handle.flush(), false); assert.equal(env.calls.some(([name]) => name === 'updateCostume'), false); runner.unmount();
});

test('白膜生成失败：预览区摊开失败原因并给出可点的「重新生成白膜三视图」', async () => {
  const env = environment();
  const rows = [{ ...initial, character_id: 3, name: '白膜', is_base_model: true, image_url: '', front_view_url: '', side_view_url: '', back_view_url: '',
    generation_status: 'failed', generation_error: '厂商返回 503' }];
  env.api.fetchCharacter = async () => ({ ...initial, image_url: 'role.png' });
  env.api.fetchCharacterStates = async () => rows;
  env.api.fetchCharacterCostumes = async () => ({ costumes: [] });
  const runner = env.mount(stateFile, { characterId: 3, projectId: 9, editorPortalTarget: {}, actionsPortalTarget: {} });
  await tick(); runner.render();

  const alert = nodes(runner.tree, node => node.props?.role === 'alert' && label(node).includes('503'))[0];
  assert.ok(alert, '失败原因必须直接可读，不能只留一个红色状态标签');
  const retry = button(runner, '重新生成白膜三视图');
  assert.ok(retry, '失败态必须出现重新生成入口');
  assert.equal(retry.props.isDisabled, false, '失败态不得把按钮锁死');
  assert.ok(button(runner, '生成白膜三视图') === undefined, '失败态不能还写“生成”');

  retry.props.onPress(); retry.props.onPress(); await tick();
  const submitted = env.calls.filter(([name]) => name === 'generateCharacterStateViews');
  assert.equal(submitted.length, 1, '连点不得重复提交付费作业');
  assert.equal(submitted[0][1], 3); assert.equal(submitted[0][2], 7);
  assert.equal(submitted[0][3].regenerateOnly, undefined, '三张全缺时整套重做，不传局部视图');
  runner.unmount();
});

test('白膜只缺部分视图：只补生成缺的那一张，保留已生成的好图', async () => {
  const env = environment();
  const rows = [{ ...initial, character_id: 3, name: '白膜', is_base_model: true, image_url: 'front.png',
    front_view_url: 'front.png', side_view_url: 'side.png', back_view_url: '', generation_status: 'completed', generation_error: null }];
  env.api.fetchCharacter = async () => ({ ...initial, image_url: 'role.png' });
  env.api.fetchCharacterStates = async () => rows;
  env.api.fetchCharacterCostumes = async () => ({ costumes: [] });
  const runner = env.mount(stateFile, { characterId: 3, projectId: 9, editorPortalTarget: {}, actionsPortalTarget: {} });
  await tick(); runner.render();

  const patch = button(runner, '补生成背面');
  assert.ok(patch, '缺哪面就应该能单独补哪面');
  patch.props.onPress(); await tick();
  const submitted = env.calls.filter(([name]) => name === 'generateCharacterStateViews');
  assert.equal(submitted.length, 1);
  assert.deepEqual(plain(submitted[0][3].regenerateOnly), ['back'], '只重做缺的背面，不能再把三张全重生成');
  assert.ok(button(runner, '生成白膜三视图'), '主按钮仍保留整套重做入口');
  runner.unmount();
});
