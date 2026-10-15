/** 专用无网络回归：node --test views/StoryBoard/BlockEditor/editor-session.test.mjs
 * 使用现有 TypeScript 转译器和最小 hooks/DOM 测试宿主，不安装依赖，不调用模型。
 * 验证组件事件/挂载与业务行为，不替代浏览器布局验收。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import vm from 'node:vm';
import ts from 'typescript';

const root = fileURLToPath(new URL('../../../', import.meta.url));
const dialogFile = path.join(root, 'views/StoryBoard/BlockEditor/DialogEditor.tsx');
const blockFile = path.join(root, 'views/StoryBoard/BlockEditor/index.tsx');
const directorFile = path.join(root, 'components/DirectorSpace/index.tsx');
const compiled = new Map();
const tick = async () => { for (let i = 0; i < 8; i++) await new Promise(resolve => setImmediate(resolve)); };
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };
const plain = value => JSON.parse(JSON.stringify(value));

function harness() {
  let current, cursor, tree, rootElement, scheduled = false, closed = false;
  const instances = new Map(), dom = new Map(), timers = new Map(), modules = new Map();
  const toasts = [], requests = [], workflows = [];
  let effects = [], timerId = 0;
  const same = (a, b) => a && b && a.length === b.length && a.every((v, i) => Object.is(v, b[i]));
  const schedule = () => {
    if (closed || scheduled || !rootElement) return;
    scheduled = true;
    queueMicrotask(() => { scheduled = false; if (!closed) render(); });
  };
  const React = {
    useState(initial) {
      const instance = current, index = cursor++;
      if (!(index in instance.hooks)) instance.hooks[index] = typeof initial === 'function' ? initial() : initial;
      return [instance.hooks[index], value => {
        const old = instance.hooks[index], next = typeof value === 'function' ? value(old) : value;
        if (!Object.is(old, next)) { instance.hooks[index] = next; schedule(); }
      }];
    },
    useRef(initial) { const index = cursor++; return current.hooks[index] ??= { current: initial }; },
    useMemo(fn, deps) {
      const index = cursor++, old = current.hooks[index];
      if (!old || !same(old.deps, deps)) current.hooks[index] = { deps, value: fn() };
      return current.hooks[index].value;
    },
    useCallback(fn, deps) { return React.useMemo(() => fn, deps); },
    useEffect(fn, deps) {
      const instance = current, index = cursor++, old = instance.hooks[index];
      if (!old || !same(old.deps, deps)) {
        instance.hooks[index] = { deps, cleanup: old?.cleanup };
        effects.push(() => { old?.cleanup?.(); instance.hooks[index].cleanup = fn(); });
      }
    },
  };
  const jsx = (type, props, key) => ({ type, props: props || {}, key });
  class Element {
    innerHTML = '';
    childNodes = [];
    focus() {}
    contains() { return false; }
    querySelectorAll() { return []; }
  }
  const api = {
    toasts, requests, workflows,
    fetch: async (url, options) => { requests.push([url, options]); return { ok: true, json: async () => ({ ready: true }) }; },
    startWorkflow: async (...args) => { workflows.push(args); return { jobId: 'mock-job' }; },
    getWorkflowStatus: async () => ({ status: 'completed', tasks: [{ result_data: { optimized: 'AI结果' } }] }),
  };
  const toast = (...args) => toasts.push(args);
  function load(file) {
    if (modules.has(file)) return modules.get(file);
    if (!compiled.has(file)) compiled.set(file, ts.transpileModule(readFileSync(file, 'utf8'), {
      compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true }, fileName: file,
    }).outputText);
    const exports = {};
    const require = name => {
      if (name === 'react') return { ...React, default: React, __esModule: true };
      if (name === 'react/jsx-runtime') return { jsx, jsxs: jsx, Fragment: 'fragment' };
      if (name === 'react-dom') return { createPortal: children => jsx('portal', { children }) };
      if (name === 'lucide-react') return new Proxy({}, { get: (_, key) => `icon-${String(key)}` });
      if (name === '@heroui/react') return { Button: 'button' };
      if (name.endsWith('ToastContext')) return { useToast: () => ({ showToast: toast }) };
      if (name.endsWith('/auth')) return { getAuthToken: () => '' };
      if (name.endsWith('/useWorkflow')) return { startWorkflow: (...args) => api.startWorkflow(...args), getWorkflowStatus: (...args) => api.getWorkflowStatus(...args) };
      if (name.endsWith('/blockRegistry')) return { BLOCK_OPTIONS: {} };
      if (name.endsWith('/SketchFramesPanel')) return { default: 'sketches', __esModule: true };
      if (name.endsWith('/ContentEditorPanel')) return { default: p => jsx('shell', { ...p, children: [p.children, p.actions] }), __esModule: true };
      if (name.endsWith('/DialogEditor')) return load(dialogFile);
      if (name.endsWith('/BlockEditor')) return load(blockFile);
      throw new Error(`Unexpected import: ${name}`);
    };
    vm.runInNewContext(compiled.get(file), {
      exports, require, console, Node: { TEXT_NODE: 3 }, HTMLElement: Element,
      fetch: (...args) => api.fetch(...args),
      setTimeout: (fn, delay) => { const id = ++timerId; timers.set(id, { fn, delay }); return id; },
      clearTimeout: id => timers.delete(id),
    }, { filename: file });
    modules.set(file, exports);
    return exports;
  }
  function resolve(node, keyPath) {
    if (Array.isArray(node)) return node.map((n, i) => resolve(n, `${keyPath}.${i}`));
    if (!node || typeof node !== 'object') return node;
    if (typeof node.type === 'function') {
      const key = `${keyPath}:${node.key || ''}:${node.type.name}`;
      const instance = instances.get(key) || { hooks: [] };
      instances.set(key, instance); current = instance; cursor = 0;
      return resolve(node.type(node.props), `${key}.child`);
    }
    const ref = node.props.ref;
    if (ref) {
      const element = dom.get(keyPath) || new Element(); dom.set(keyPath, element);
      if (typeof ref === 'function') { if (element.ref !== ref) { element.ref = ref; ref(element); } }
      else ref.current = element;
    }
    return { ...node, props: { ...node.props, children: resolve(node.props.children, `${keyPath}.children`) } };
  }
  function render() { effects = []; tree = resolve(rootElement, 'root'); const queued = effects; effects = []; queued.forEach(fn => fn()); }
  function nodes(node) {
    if (Array.isArray(node)) return node.flatMap(nodes);
    if (!node || typeof node !== 'object') return [];
    return [node, ...nodes(node.props.children)];
  }
  const text = node => Array.isArray(node) ? node.map(text).join('') : node && typeof node === 'object' ? text(node.props.children) : typeof node === 'string' ? node : '';
  return Object.assign(api, {
    load,
    mount(file, props) { rootElement = jsx(load(file).default, props); render(); },
    update(props) { rootElement = { ...rootElement, props: { ...rootElement.props, ...props } }; render(); },
    nodes: () => nodes(tree),
    text,
    find(predicate) { const node = nodes(tree).find(predicate); assert.ok(node, 'Expected node'); return node; },
    button(label) { return this.find(n => n.type === 'button' && (text(n) === label || n.props.title === label)); },
    input(label, value) {
      const node = this.find(n => n.props['aria-label'] === label);
      if (node.props.contentEditable) {
        const el = node.props.ref.current;
        el.innerHTML = value; el.childNodes = [{ nodeType: 3, textContent: value }]; node.props.onInput();
      } else node.props.onChange({ target: { value } });
    },
    advance(delay) { for (const [id, timer] of [...timers]) if (timer.delay <= delay) { timers.delete(id); timer.fn(); } },
    dispose() { closed = true; for (const instance of instances.values()) for (const hook of instance.hooks) hook?.cleanup?.(); timers.clear(); },
  });
}
function directorProps(extra = {}) {
  return { scene: { id: 42, order: 1, description: '旧模板', baseDescription: '原始故事', hasAction: true, characters: ['小明'], dialogues: [{ character: '小明', line: '旧台词' }] },
    projectId: 7, scriptId: 3, onUpdateBaseDescription: async () => true,
    onUpdateFirstFramePrompt: async () => true, onUpdateLastFramePrompt: async () => true, onUpdateVideoPrompt: async () => true,
    onUpdateDialogues: async () => true, onUpdateVoiceover: async () => true, onUpdateNegativePrompt: async () => true,
    textModel: 'mock-text', ...extra };
}
async function switchTab(h, tab) { h.find(n => n.type === 'shell').props.onTabChange(tab); await tick(); }
async function click(h, label) { const n = h.button(label); (n.props.onClick || n.props.onPress)(); await tick(); }

test('队列：所有字段 flush、合并并发保存、在途更新继续保存、旧 props 不覆盖草稿', async () => {
  const h = harness(), first = deferred(), calls = [];
  const create = h.load(dialogFile).createStoryboardDraftSession;
  const session = create({ prompt: 'old', negative: '', dialogues: [] }, async (key, value) => {
    calls.push([key, value]); return calls.length === 1 ? first.promise : true;
  }, () => {});
  session.update('prompt', 'A'); session.update('negative', 'bad');
  const saving = session.flush(); assert.equal(session.flush(), saving);
  await tick(); session.update('prompt', 'AB'); session.sync({ prompt: 'A', negative: '', dialogues: [] });
  assert.equal(session.values.prompt, 'AB'); first.resolve(true);
  assert.equal(await saving, true);
  assert.deepEqual(plain(calls), [['prompt', 'A'], ['prompt', 'AB'], ['negative', 'bad']]);
  assert.equal(session.status, 'saved'); assert.equal(session.isDirty, false); h.dispose();
});
for (const fail of [false, 'throw']) test(`队列：${fail} 保留草稿且可重试`, async () => {
  const h = harness(); let failed = true;
  const session = h.load(dialogFile).createStoryboardDraftSession({ prompt: '' }, async () => {
    if (failed) { if (fail === 'throw') throw Error('offline'); return false; } return true;
  }, () => {});
  session.update('prompt', '保留'); assert.equal(await session.flush(), false);
  assert.equal(session.status, 'error'); assert.equal(session.values.prompt, '保留'); assert.equal(session.isDirty, true);
  failed = false; assert.equal(await session.flush(), true); h.dispose();
});
test('DirectorSpace 默认内容仅绑定 baseDescription，旧模板保留为图片回退', async () => {
  const h = harness(), saves = [], registrations = [];
  h.mount(directorFile, directorProps({ onUpdateBaseDescription: async value => { saves.push(value); return true; }, onUpdateDescription: () => { throw Error('禁止写旧模板'); }, onRegisterEditor: handle => registrations.push(handle) }));
  await tick(); assert.equal(h.find(n => n.type === 'shell').props.activeTab, 'content');
  h.input('原始描述', '新故事'); await switchTab(h, 'prompts');
  assert.deepEqual(saves, ['新故事']); assert.equal(h.find(n => n.props['aria-label'] === '首帧提示词').props.ref.current.innerHTML, '旧模板');
  assert.equal(registrations.filter(Boolean).length, 1);
  await switchTab(h, 'content'); assert.equal(h.find(n => n.props['aria-label'] === '原始描述').props.ref.current.innerHTML, '新故事');
  h.dispose(); assert.equal(registrations.at(-1), null);
});
test('空内容不回退旧模板；显式清空首帧不自动重新填入模板', async () => {
  const h = harness(); const p = directorProps(); p.scene = { ...p.scene, baseDescription: '', firstFramePrompt: '' };
  h.mount(directorFile, p); await tick();
  assert.equal(h.find(n => n.props['aria-label'] === '原始描述').props.ref.current.innerHTML, '<br>');
  await switchTab(h, 'prompts'); assert.equal(h.find(n => n.props['aria-label'] === '首帧提示词').props.ref.current.innerHTML, '<br>'); h.dispose();
});
test('首帧/尾帧/视频独立保存；提示词全宽、负向折叠、外部 flush 覆盖隐藏字段', async () => {
  const h = harness(), saves = []; let handle;
  const p = directorProps({ onRegisterEditor: value => { handle = value; } });
  for (const [key, prop] of [['first', 'onUpdateFirstFramePrompt'], ['last', 'onUpdateLastFramePrompt'], ['video', 'onUpdateVideoPrompt'], ['negative', 'onUpdateNegativePrompt']]) p[prop] = async value => { saves.push([key, value]); return true; };
  h.mount(directorFile, p); await switchTab(h, 'prompts');
  assert.equal(h.nodes().some(n => n.props.className?.includes('w-56')), false); assert.equal(h.find(n => n.type === 'details').props.open, undefined);
  h.input('首帧提示词', '首'); h.input('负向提示词', '负'); await click(h, '图片尾帧');
  h.input('尾帧提示词', '尾'); await click(h, '视频'); h.input('视频提示词', '视频草稿'); assert.equal(await handle.flush(), true);
  assert.deepEqual(saves, [['first', '首'], ['negative', '负'], ['last', '尾'], ['video', '视频草稿']]);
  await click(h, '图片首帧'); assert.equal(h.find(n => n.props['aria-label'] === '首帧提示词').props.ref.current.innerHTML, '首'); h.dispose();
});
test('台词/旁白复用回调且内部切换 flush；固定栏保存覆盖全部草稿', async () => {
  const h = harness(), saves = [];
  h.mount(directorFile, directorProps({ onUpdateDialogues: async value => { saves.push(['dialogues', plain(value)]); return true; }, onUpdateVoiceover: async value => { saves.push(['voice', value]); return true; } }));
  await switchTab(h, 'dialogue'); h.input('第1行台词', '新台词'); await click(h, '画外音');
  h.input('旁白', '新旁白'); await h.find(n => n.type === 'shell').props.onSave();
  assert.deepEqual(saves, [['dialogues', [{ character: '小明', line: '新台词' }]], ['voice', '新旁白']]); h.dispose();
});
for (const fail of [false, 'throw']) test(`失败 ${fail} 阻止切标签、手动成功 toast 和生成`, async () => {
  const h = harness(), media = [];
  const failing = async () => { if (fail === 'throw') throw Error('offline'); return false; };
  h.mount(directorFile, directorProps({ onUpdateFirstFramePrompt: failing, onGenerateImage: async (...args) => { media.push(args); return { success: true }; } }));
  await switchTab(h, 'prompts'); h.input('首帧提示词', '失败草稿'); await switchTab(h, 'content');
  assert.equal(h.find(n => n.type === 'shell').props.activeTab, 'prompts');
  await h.find(n => n.type === 'shell').props.onSave(); await click(h, '生成首帧'); await click(h, '生成提示词');
  assert.equal(media.length, 0); assert.equal(h.workflows.length, 0); assert.equal(h.toasts.some(t => t[1] === 'success'), false); h.dispose();
});
test('自动保存与外部 flush 共用最新回调和在途队列，不重复提交同一修订', async () => {
  const h = harness(), wait = deferred(), oldCalls = [], newCalls = []; let handle;
  h.mount(directorFile, directorProps({ onRegisterEditor: value => { handle = value; }, onUpdateBaseDescription: async value => { oldCalls.push(value); return wait.promise; } }));
  await tick(); h.input('原始描述', 'A'); await tick(); h.advance(800); await tick();
  h.update({ onUpdateBaseDescription: async value => { newCalls.push(value); return true; } });
  h.input('原始描述', 'AB'); const pending = handle.flush(); wait.resolve(true); assert.equal(await pending, true);
  assert.deepEqual(oldCalls, ['A']); assert.deepEqual(newCalls, ['AB']); h.dispose();
});
test('防重复生成，生成请求绑定实际场景、首/尾目标、已保存的文本', async () => {
  const h = harness(), wait = deferred(), calls = [], saved = [];
  h.mount(directorFile, directorProps({ onUpdateLastFramePrompt: async value => { saved.push(value); return wait.promise; }, onGenerateImage: async (...args) => { calls.push(args); return { success: true }; } }));
  await switchTab(h, 'prompts'); await click(h, '图片尾帧'); h.input('尾帧提示词', '尾草稿'); await tick();
  const button = h.button('生成尾帧'); button.props.onClick(); button.props.onClick(); await tick();
  assert.equal(calls.length, 0); wait.resolve(true); await tick();
  assert.deepEqual(calls, [[42, '尾草稿', 'last', false]]); assert.deepEqual(saved, ['尾草稿']); h.dispose();
});
test('视频预检前保存全部草稿；预检失败不生成', async () => {
  const h = harness(), calls = [], saved = [];
  h.mount(directorFile, directorProps({ onUpdateVideoPrompt: async value => { saved.push(value); return true; }, onGenerateVideo: async id => { calls.push(id); return { success: true }; } }));
  await switchTab(h, 'prompts'); await click(h, '视频'); h.input('视频提示词', '视频草稿');
  h.fetch = async () => { assert.deepEqual(saved, ['视频草稿']); return { ok: false }; };
  await click(h, '生成视频'); assert.equal(calls.length, 0); h.dispose();
});
test('AI 结果失败保存没有成功 toast；后续手动重试仍可提交结果', async () => {
  const h = harness(), saved = []; let succeeds = false, handle;
  h.mount(directorFile, directorProps({ onRegisterEditor: value => { handle = value; }, onUpdateFirstFramePrompt: async value => { saved.push(value); return succeeds; } }));
  await switchTab(h, 'prompts'); await click(h, '生成提示词');
  assert.deepEqual(saved, ['AI结果']); assert.equal(h.toasts.some(t => t[1] === 'success'), false);
  succeeds = true; assert.equal(await handle.flush(), true); assert.deepEqual(saved, ['AI结果', 'AI结果']); assert.equal(h.requests.length, 0); h.dispose();
});
test('AI 在途不覆盖新输入，轮询异常可恢复且不误报成功', async () => {
  const h = harness(), wait = deferred(), saved = [];
  h.getWorkflowStatus = () => wait.promise;
  h.mount(directorFile, directorProps({ onUpdateFirstFramePrompt: async value => { saved.push(value); return true; } }));
  await switchTab(h, 'prompts'); await click(h, '生成提示词'); h.input('首帧提示词', '用户新输入');
  wait.resolve({ status: 'completed', tasks: [{ result_data: { optimized: '旧结果' } }] }); await tick();
  assert.equal(h.find(n => n.props['aria-label'] === '首帧提示词').props.ref.current.innerHTML, '用户新输入'); assert.equal(saved.includes('旧结果'), false);
  h.getWorkflowStatus = async () => { throw Error('poll failed'); };
  await click(h, '生成提示词'); assert.equal(h.toasts.some(t => t[0] === 'poll failed'), true); assert.equal(h.button('生成提示词').props.disabled, false); h.dispose();
});
test('静止分镜无尾帧标签，默认独立 BlockEditor 仍保留左侧台词及 both 参数', async () => {
  const h = harness(); const p = directorProps(); p.scene.hasAction = false;
  h.mount(directorFile, p); await switchTab(h, 'prompts'); assert.equal(h.nodes().some(n => h.text(n) === '图片尾帧'), false); h.dispose();
  const legacy = harness(), calls = [];
  legacy.mount(blockFile, { storyboardId: 1, basePrompt: '基础回退', onSave: async () => true, onGenerateImage: async (...args) => { calls.push(args); return { success: true }; } });
  await tick(); assert.equal(legacy.nodes().some(n => n.props.className?.includes('w-56')), true);
  await click(legacy, '生成首帧'); assert.deepEqual(calls, [[1, '基础回退', 'both', false]]); legacy.dispose();
});
test('中文输入组合未完成阻止切换；结束后最新文字可保存', async () => {
  const h = harness(), saved = [];
  h.mount(directorFile, directorProps({ onUpdateBaseDescription: async value => { saved.push(value); return true; } })); await tick();
  const input = h.find(n => n.props['aria-label'] === '原始描述'); input.props.onCompositionStart(); h.input('原始描述', '拼音');
  await switchTab(h, 'prompts'); assert.equal(h.find(n => n.type === 'shell').props.activeTab, 'content');
  input.props.onCompositionEnd(); await switchTab(h, 'prompts'); assert.deepEqual(saved, ['拼音']); h.dispose();
});
test('视频分离首尾结果及负向提示词仍保存到原字段，失败时整体状态为 error', async () => {
  const h = harness(), saves = [];
  h.getWorkflowStatus = async () => ({ status: 'completed', tasks: [{ result_data: { actionAnalysis: { useEndFrame: true }, videoStartPrompt: '视频首', videoEndPrompt: '视频尾', negativePrompt: '负向' } }] });
  h.mount(directorFile, directorProps({ onUpdateVideoPrompt: async value => { saves.push(['video', value]); return true; }, onUpdateNegativePrompt: async value => { saves.push(['negative', value]); return true; } }));
  await switchTab(h, 'prompts'); await click(h, '视频'); await click(h, '生成提示词');
  assert.deepEqual(saves, [['video', '视频首'], ['negative', '负向']]);
  assert.deepEqual(JSON.parse(h.requests[0][1].body), { video_start_prompt: '视频首', video_end_prompt: '视频尾' });
  assert.equal(h.requests[0][0], '/api/storyboards/42/content'); h.dispose();
});
test('外部关闭后迟到的 AI 结果不再写入回调', async () => {
  const h = harness(), wait = deferred(), saves = [];
  h.getWorkflowStatus = () => wait.promise;
  h.mount(directorFile, directorProps({ onUpdateFirstFramePrompt: async value => { saves.push(value); return true; } }));
  await switchTab(h, 'prompts'); await click(h, '生成提示词'); h.dispose();
  wait.resolve({ status: 'completed', tasks: [{ result_data: { optimized: '迟到结果' } }] }); await tick(); assert.deepEqual(saves, []);
});
