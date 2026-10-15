// @vitest-environment jsdom
// 使用真实 React DOM、共享外壳和预览；仅 mock 网络/工作流、Toast 与 HeroUI 动画按钮。
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import ScriptWorkshop from './index';

const mocks = vi.hoisted(() => ({
  update: vi.fn(), upload: vi.fn(), toast: vi.fn(), consume: vi.fn(), workflow: null,
}));
vi.mock('../../services/scripts', () => ({ updateScript: mocks.update, uploadScriptFile: mocks.upload }));
vi.mock('../../services/auth', () => ({ getAuthToken: () => 'mock-credential-never-persist' }));
vi.mock('../../contexts/ToastContext', () => ({ useToast: () => ({ showToast: mocks.toast }) }));
vi.mock('../../hooks/useWorkflow', () => ({
  consumeWorkflow: mocks.consume,
  useWorkflow: (id, options) => {
    mocks.workflow = { id, ...options };
    return { overallProgress: 0, currentStep: 0, totalSteps: 3, error: null };
  },
}));
vi.mock('@heroui/react', () => ({
  Button: ({ children, onPress, isDisabled, isLoading, startContent, color, variant, size, ...props }) => (
    <button {...props} type="button" disabled={isDisabled || isLoading} onClick={onPress}>{startContent}{children}</button>
  ),
  Progress: props => <progress aria-label={props['aria-label']} value={props.value} max="100" />,
}));

let root, container, host, props, register, handle;
const base = {
  projects: [{ id: 7, name: '项目七' }, { id: 8, name: '项目八' }],
  aiModels: [{ name: 'mock-text', type: 'TEXT' }, { name: 'image-only', type: 'IMAGE' }],
  lockProjectId: 7, lockEpisodeNumber: 2,
  onClose: () => {},
};
const existing = { initialScriptId: 21, initialTitle: '旧标题', initialContent: '旧正文' };
const tick = () => new Promise(resolve => setTimeout(resolve, 0));
const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };
const response = (data, ok = true) => ({ ok, json: async () => data });

async function render(patch = {}) {
  props = { ...props, ...patch };
  await act(async () => root.render(<ScriptWorkshop {...props} />));
}
function field(label, scope = document) {
  const match = [...scope.querySelectorAll('label')].find(node => node.querySelector('span')?.textContent === label);
  if (!match) throw new Error(`字段不存在：${label}`);
  return match.querySelector('input,textarea,select');
}
function button(text, scope = document) {
  const match = [...scope.querySelectorAll('button')].find(node => node.textContent === text);
  if (!match) throw new Error(`按钮不存在：${text}`);
  return match;
}
async function input(label, value) {
  await act(async () => {
    const node = field(label);
    const proto = node.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : node.tagName === 'SELECT' ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, 'value').set.call(node, value);
    node.dispatchEvent(new Event(node.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true }));
  });
}
async function click(text) { await act(async () => button(text).click()); }
async function flush() { let result; await act(async () => { result = await handle.flush(); }); return result; }
async function unmount() { if (root) { await act(async () => root.unmount()); root = null; } }
async function remount(patch = {}) {
  await unmount();
  root = createRoot(container);
  await render(patch);
}

beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  localStorage.clear();
  mocks.update.mockReset().mockResolvedValue({ message: 'ok' });
  mocks.upload.mockReset();
  mocks.toast.mockReset();
  mocks.consume.mockReset().mockResolvedValue(undefined);
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Unexpected network request')));
  container = document.createElement('div');
  host = document.createElement('div');
  document.body.append(container, host);
  root = createRoot(container);
  handle = null;
  register = vi.fn(value => { handle = value; });
  props = { ...base, onRegisterEditor: register };
});
afterEach(async () => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  await unmount();
  container.remove(); host.remove();
  vi.unstubAllGlobals();
});

test('undefined 独立布局；null 等待宿主；Portal 移动和隐藏不复制实例或草稿', async () => {
  await render(existing);
  expect(container.querySelector('textarea')).not.toBeNull();
  expect(host.childElementCount).toBe(0);
  const registered = handle;
  await render({ editorPortalTarget: null });
  expect(document.querySelector('textarea')).toBeNull();
  expect(container.textContent).toContain('旧正文');
  await render({ editorPortalTarget: host });
  expect(container.querySelector('textarea')).toBeNull();
  expect(host.querySelectorAll('textarea')).toHaveLength(1);
  await input('剧本名称', '新标题');
  await input('剧本内容', '实时预览正文');
  expect(container.textContent).toContain('实时预览正文');
  expect(host.querySelector('.content-editor-title').textContent).toBe('新标题');
  host.style.display = 'none';
  await render();
  host.style.display = '';
  await render({ editorPortalTarget: null });
  await render({ editorPortalTarget: host });
  expect(field('剧本内容').value).toBe('实时预览正文');
  expect(handle).toBe(registered);
  expect(register).toHaveBeenCalledTimes(1);
  expect(await flush()).toBe(true);
  await unmount();
  expect(register).toHaveBeenLastCalledWith(null);
});

test('立即 flush 保存最新标题/正文，并通知父级更新名称与内容', async () => {
  const onSuccess = vi.fn();
  await render({ ...existing, onSuccess });
  await input('剧本名称', '最新标题');
  await input('剧本内容', '最新正文');
  expect(await flush()).toBe(true);
  expect(mocks.update).toHaveBeenCalledExactlyOnceWith(21, '最新标题', '最新正文');
  expect(onSuccess).toHaveBeenCalledWith({ scriptId: 21, projectId: 7, episodeNumber: 2, title: '最新标题', content: '最新正文' });
  expect(document.querySelector('[role="status"]').textContent).toContain('已保存');
  expect(await flush()).toBe(true);
  expect(mocks.update).toHaveBeenCalledTimes(1);
});

test('自动保存防抖 2 秒；卸载清理读取最新草稿而非初始闭包', async () => {
  vi.useFakeTimers();
  await render(existing);
  await input('剧本内容', '第一次输入');
  await act(async () => vi.advanceTimersByTime(1999));
  expect(mocks.update).not.toHaveBeenCalled();
  await input('剧本内容', '第二次输入');
  await act(async () => vi.advanceTimersByTime(2000));
  expect(mocks.update).toHaveBeenLastCalledWith(21, '旧标题', '第二次输入');
  await input('剧本内容', '卸载前最后字符');
  await unmount();
  expect(mocks.update).toHaveBeenLastCalledWith(21, '旧标题', '卸载前最后字符');
});

test('并发 flush 共享保存任务，并排空保存过程中产生的新输入', async () => {
  const pending = deferred();
  mocks.update.mockImplementationOnce(() => pending.promise);
  await render(existing);
  await input('剧本内容', '保存版本一');
  let first, second;
  await act(async () => { first = handle.flush(); second = handle.flush(); });
  expect(mocks.update).toHaveBeenCalledTimes(1);
  await input('剧本内容', '保存版本二');
  await act(async () => { pending.resolve({ message: 'ok' }); expect(await first).toBe(true); expect(await second).toBe(true); });
  expect(mocks.update).toHaveBeenCalledTimes(2);
  expect(mocks.update).toHaveBeenLastCalledWith(21, '旧标题', '保存版本二');
  expect(document.querySelector('[role="status"]').textContent).toContain('已保存');
});

test.each([false, { success: false }, new Error('断网')])('保存失败 %s 返回 false、保留输入并阻止切换/关闭，可重试', async failure => {
  mocks.update.mockImplementation(async () => { if (failure instanceof Error) throw failure; return failure; });
  const onClose = vi.fn();
  await render({ ...existing, onClose });
  await input('剧本内容', '不能丢失');
  expect(await flush()).toBe(false);
  await click('AI生成');
  expect(field('剧本内容').value).toBe('不能丢失');
  await click('关闭');
  expect(onClose).not.toHaveBeenCalled();
  expect(fetch).not.toHaveBeenCalled();
  expect(document.querySelector('[role="status"]').textContent).toContain('保存失败');
  mocks.update.mockResolvedValue({ message: 'ok' });
  await click('重试保存');
  expect(field('剧本内容').value).toBe('不能丢失');
  await click('AI生成');
  expect(field('生成要求')).not.toBeNull();
});

test('新剧本要求仅持久化白名单字段，跨重挂载恢复且按项目与集数隔离', async () => {
  await render({ editorPortalTarget: host });
  await input('剧本标题（可选）', '生成标题');
  await input('生成要求', '第二集要求');
  await input('剧本长度', '长篇');
  expect(await flush()).toBe(true);
  const key = 'script-workshop:generate:v1:project:7:episode:2';
  const stored = JSON.parse(localStorage.getItem(key));
  expect(stored).toEqual({ projectId: '7', episodeInput: '2', title: '生成标题', description: '第二集要求', length: '长篇', textModel: 'mock-text' });
  expect(JSON.stringify(stored)).not.toContain('credential');
  await remount({ lockEpisodeNumber: 3 });
  expect(field('生成要求').value).toBe('');
  await remount({ lockEpisodeNumber: 2, lockProjectId: 8 });
  expect(field('生成要求').value).toBe('');
  await remount({ lockProjectId: 7 });
  expect(field('生成要求').value).toBe('第二集要求');
  expect(field('剧本长度').value).toBe('长篇');
  expect(mocks.update).not.toHaveBeenCalled();
});

test('本地存储失败时 flush=false，禁止生成与内部模式切换，恢复后可保存', async () => {
  await render();
  await input('生成要求', '保留的创意');
  const storage = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('quota'); });
  expect(await flush()).toBe(false);
  await click('开始生成');
  expect(fetch).not.toHaveBeenCalled();
  await click('上传剧本');
  expect(field('生成要求').value).toBe('保留的创意');
  storage.mockRestore();
  expect(await flush()).toBe(true);
});

test('生成前等待已有剧本保存，按钮双击只提交一次且使用原接口/业务字段', async () => {
  const pending = deferred();
  mocks.update.mockImplementationOnce(() => pending.promise);
  await render(existing);
  await input('剧本内容', '先保存');
  await act(async () => button('AI生成').click());
  expect(fetch).not.toHaveBeenCalled();
  expect(document.querySelector('[role="tab"][aria-selected="true"]').textContent).toBe('内容');
  await act(async () => pending.resolve({ message: 'ok' }));
  await input('生成要求', '  悬疑故事  ');
  await input('剧本标题（可选）', '  新标题  ');
  const request = deferred();
  fetch.mockImplementationOnce(() => request.promise);
  await act(async () => { button('开始生成').click(); button('开始生成').click(); });
  expect(fetch).toHaveBeenCalledTimes(1);
  const [url, options] = fetch.mock.calls[0];
  expect(url).toBe('/api/scripts/generate');
  expect(JSON.parse(options.body)).toEqual({ projectId: 7, episodeNumber: 2, title: '新标题', description: '悬疑故事', length: '短篇', textModel: 'mock-text' });
  expect(localStorage.getItem('script-workshop:generate:v1:project:7:episode:2')).toContain('悬疑故事');
  expect(await flush()).toBe(false);
  await act(async () => request.resolve(response({ scriptId: 99, jobId: 'job-1' })));
  fetch.mockResolvedValueOnce(response({ title: '生成标题', content: '生成正文' }));
  await act(async () => { mocks.workflow.onCompleted({ id: 'job-1' }); mocks.workflow.onCompleted({ id: 'job-1' }); });
  expect(fetch).toHaveBeenCalledTimes(2);
  expect(fetch.mock.calls[1][0]).toBe('/api/scripts/save-from-workflow');
  expect(JSON.parse(fetch.mock.calls[1][1].body)).toEqual({ scriptId: 99, jobId: 'job-1' });
  expect(mocks.consume).toHaveBeenCalledExactlyOnceWith('job-1');
  expect(field('剧本内容').value).toBe('生成正文');
});

test('生成结果落库失败保留 job，重试只落库，不消费失败任务或重新生成', async () => {
  await render();
  fetch.mockResolvedValueOnce(response({ scriptId: 99, jobId: 'job-retry' }));
  await click('开始生成');
  fetch.mockResolvedValueOnce(response({ message: '落库失败' }, false));
  await act(async () => mocks.workflow.onCompleted({ id: 'job-retry' }));
  expect(mocks.consume).not.toHaveBeenCalled();
  expect(document.querySelector('[role="status"]').textContent).toContain('保存失败');
  fetch.mockResolvedValueOnce(response({ title: '恢复', content: '恢复的生成内容' }));
  await click('重试保存生成结果');
  expect(fetch.mock.calls.map(call => call[0])).toEqual(['/api/scripts/generate', '/api/scripts/save-from-workflow', '/api/scripts/save-from-workflow']);
  expect(field('剧本内容').value).toBe('恢复的生成内容');
  expect(mocks.consume).toHaveBeenCalledOnce();
});

test('工作流失败/取消解除生成锁，输入保留且可重新提交', async () => {
  await render();
  await input('生成要求', '失败后保留');
  fetch.mockResolvedValueOnce(response({ scriptId: 31, jobId: 'failed' }));
  await click('开始生成');
  await act(async () => mocks.workflow.onFailed({ id: 'failed', error_message: '模型失败' }));
  expect(field('生成要求').value).toBe('失败后保留');
  expect(button('开始生成').disabled).toBe(false);
  fetch.mockResolvedValueOnce(response({ scriptId: 32, jobId: 'cancelled' }));
  await click('开始生成');
  await act(async () => mocks.workflow.onProgress({ id: 'cancelled', status: 'cancelled' }));
  expect(button('开始生成').disabled).toBe(false);
});

test('文本上传沿用保存 API；切换模式/上传方式不丢草稿并保留上传预览', async () => {
  await render({ editorPortalTarget: host });
  await click('上传剧本');
  await click('直接输入');
  await input('上传剧本内容', '上传文本草稿');
  expect(container.textContent).toContain('上传文本草稿');
  await click('上传文件');
  await click('直接输入');
  expect(field('上传剧本内容').value).toBe('上传文本草稿');
  await click('AI生成');
  await click('上传剧本');
  expect(field('上传剧本内容').value).toBe('上传文本草稿');
  mocks.upload.mockResolvedValue({ success: true, scriptId: 50, content: '上传文本草稿', title: '上传标题', projectId: 7, episodeNumber: 2 });
  await click('保存剧本');
  expect(mocks.upload).toHaveBeenCalledExactlyOnceWith({ file: undefined, content: '上传文本草稿', projectId: 7, episodeNumber: 2, title: undefined, mode: 'save' });
  expect(field('剧本内容').value).toBe('上传文本草稿');
});

test('文件上传支持 .md；文件内容读完后按项目保存，失败仍可重试', async () => {
  await render();
  await click('上传剧本');
  const node = document.querySelector('input[type="file"]');
  const file = new File(['## 场景\n文件正文'], '测试.md', { type: 'text/markdown' });
  await act(async () => {
    Object.defineProperty(node, 'files', { configurable: true, value: [file] });
    node.dispatchEvent(new Event('change', { bubbles: true }));
    await tick(); await tick();
  });
  await vi.waitFor(() => expect(document.body.textContent).toContain('测试.md'));
  mocks.upload.mockResolvedValueOnce({ success: false });
  await click('保存剧本');
  expect(document.body.textContent).toContain('测试.md');
  expect(document.querySelector('[role="status"]').textContent).toContain('保存失败');
  mocks.upload.mockResolvedValueOnce({ success: true, scriptId: 51, content: '文件正文', title: '测试', projectId: 7, episodeNumber: 2 });
  await click('保存剧本');
  const uploaded = mocks.upload.mock.calls[1][0];
  expect(uploaded.file).toBeInstanceOf(File);
  expect(uploaded.file.name).toBe('测试.md');
  expect(uploaded).toMatchObject({ title: '测试', projectId: 7, episodeNumber: 2, mode: 'save' });
});

test('目标改变后旧请求不得通知新对象；同目标初始数据回填不覆盖脏稿', async () => {
  const pending = deferred();
  const onSuccess = vi.fn();
  mocks.update.mockImplementationOnce(() => pending.promise);
  await render({ ...existing, onSuccess });
  await input('剧本内容', '旧对象最新草稿');
  await render({ initialContent: '迟到的外部回填' });
  expect(field('剧本内容').value).toBe('旧对象最新草稿');
  let save;
  await act(async () => { save = handle.flush(); });
  await render({ initialScriptId: 22, initialTitle: '对象二', initialContent: '对象二正文' });
  await act(async () => { pending.resolve({ message: 'ok' }); await save; });
  expect(mocks.update).toHaveBeenCalledExactlyOnceWith(21, '旧标题', '旧对象最新草稿');
  expect(field('剧本内容').value).toBe('对象二正文');
  expect(onSuccess).not.toHaveBeenCalled();
});

test('未编辑时接收异步初始正文；清空标题/正文按允许字段保存', async () => {
  await render({ initialScriptId: 21 });
  await render({ initialTitle: '异步标题', initialContent: '异步正文' });
  expect(field('剧本内容').value).toBe('异步正文');
  expect(mocks.update).not.toHaveBeenCalled();
  await input('剧本名称', '');
  await input('剧本内容', '');
  expect(await flush()).toBe(true);
  expect(mocks.update).toHaveBeenCalledExactlyOnceWith(21, '', '');
});

test('异步项目/模型到达可选中，目标切换前保存并恢复各自要求', async () => {
  await render({ projects: [], aiModels: [], lockProjectId: undefined, lockEpisodeNumber: undefined });
  await render({ projects: base.projects, aiModels: base.aiModels });
  expect(field('目标项目').value).toBe('7');
  expect(field('文本模型').value).toBe('mock-text');
  await input('集数', '1');
  await input('生成要求', '项目七第一集');
  await input('目标项目', '8');
  expect(field('生成要求').value).toBe('');
  await input('生成要求', '项目八第一集');
  await input('目标项目', '7');
  expect(field('生成要求').value).toBe('项目七第一集');
  await input('集数', '2');
  expect(field('生成要求').value).toBe('');
  await input('集数', '1');
  expect(field('生成要求').value).toBe('项目七第一集');
});

test('无效集数/文本模型不能启动生成，不显示虚假提示词标签', async () => {
  await render({ lockEpisodeNumber: 1.5 });
  await click('开始生成');
  expect(fetch).not.toHaveBeenCalled();
  await render({ lockEpisodeNumber: 2, aiModels: [] });
  await click('开始生成');
  expect(fetch).not.toHaveBeenCalled();
  expect([...document.querySelectorAll('[role="tab"]')].map(node => node.textContent)).toEqual(['AI生成', '上传剧本']);
});

test('本地配额不足不阻断上传本身的持久化；双击上传只提交一次', async () => {
  await render();
  await click('上传剧本');
  await click('直接输入');
  await input('上传剧本内容', '无需本地备份即可直接上传');
  const storage = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('quota'); });
  expect(await flush()).toBe(false);
  const pending = deferred();
  mocks.upload.mockImplementationOnce(() => pending.promise);
  await act(async () => { button('保存剧本').click(); button('保存剧本').click(); });
  expect(mocks.upload).toHaveBeenCalledOnce();
  await act(async () => pending.resolve({ success: true, scriptId: 55, title: '上传成功', content: '已保存内容', projectId: 7, episodeNumber: 2 }));
  expect(field('剧本内容').value).toBe('已保存内容');
  expect(await flush()).toBe(true);
  storage.mockRestore();
});

test('StrictMode 重放后句柄可用，编辑不会反复注册且不会重复保存', async () => {
  props = { ...props, ...existing, editorPortalTarget: host };
  await act(async () => root.render(<React.StrictMode><ScriptWorkshop {...props} /></React.StrictMode>));
  const count = register.mock.calls.length;
  expect(handle).not.toBeNull();
  await input('剧本内容', '严格模式草稿');
  expect(register).toHaveBeenCalledTimes(count);
  expect(await flush()).toBe(true);
  expect(mocks.update).toHaveBeenCalledExactlyOnceWith(21, '旧标题', '严格模式草稿');
});
