// @vitest-environment jsdom
// 使用真实 React DOM 与共享外壳；仅 mock 网络、Toast 与 HeroUI 动画按钮。
// 剧本工作坊现为「已有剧本的内容编辑器」：AI 生成与上传已移至左侧大纲面板。
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import ScriptWorkshop from './index';

const mocks = vi.hoisted(() => ({
  update: vi.fn(), toast: vi.fn(),
}));
vi.mock('../../services/scripts', () => ({ updateScript: mocks.update }));
vi.mock('../../contexts/ToastContext', () => ({ useToast: () => ({ showToast: mocks.toast }) }));
vi.mock('@heroui/react', () => ({
  Button: ({ children, onPress, isDisabled, isLoading, startContent, color, variant, size, ...props }) => (
    <button {...props} type="button" disabled={isDisabled || isLoading} onClick={onPress}>{startContent}{children}</button>
  ),
}));

let root, container, host, props, register, handle;
const base = { lockProjectId: 7, lockEpisodeNumber: 2, onClose: () => {} };
const existing = { initialScriptId: 21, initialTitle: '旧标题', initialContent: '旧正文' };
const tick = () => new Promise(resolve => setTimeout(resolve, 0));
const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };

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
    const proto = node.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLSelectElement.prototype;
    Object.getOwnPropertyDescriptor(proto, 'value').set.call(node, value);
    node.dispatchEvent(new Event('input', { bubbles: true }));
  });
}
async function click(text) { await act(async () => button(text).click()); }
async function flush() { let result; await act(async () => { result = await handle.flush(); }); return result; }
async function unmount() { if (root) { await act(async () => root.unmount()); root = null; } }

beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  localStorage.clear();
  mocks.update.mockReset().mockResolvedValue({ message: 'ok' });
  mocks.toast.mockReset();
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

test('无剧本 ID 时展示引导空态，不渲染编辑字段', async () => {
  await render();
  expect(container.textContent).toContain('尚未选择剧本');
  expect(container.querySelector('textarea')).toBeNull();
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

test.each([false, { success: false }, new Error('断网')])('保存失败 %s 返回 false、保留输入并阻止关闭，可重试', async failure => {
  mocks.update.mockImplementation(async () => { if (failure instanceof Error) throw failure; return failure; });
  const onClose = vi.fn();
  await render({ ...existing, onClose });
  await input('剧本内容', '不能丢失');
  expect(await flush()).toBe(false);
  expect(field('剧本内容').value).toBe('不能丢失');
  await click('关闭');
  expect(onClose).not.toHaveBeenCalled();
  expect(fetch).not.toHaveBeenCalled();
  expect(document.querySelector('[role="status"]').textContent).toContain('保存失败');
  mocks.update.mockResolvedValue({ message: 'ok' });
  await click('重试保存');
  expect(field('剧本内容').value).toBe('不能丢失');
  await click('关闭');
  expect(onClose).toHaveBeenCalledTimes(1);
});

test('目标改变后旧请求不得通知新对象；迟到的外部回填不覆盖脏稿', async () => {
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

test('保存期间产生的新输入不被父级回填覆盖', async () => {
  const pending = deferred();
  mocks.update.mockImplementationOnce(() => pending.promise);
  await render(existing);
  await input('剧本内容', '保存中继续输入');
  let flushed;
  await act(async () => { flushed = handle.flush(); });
  await input('剧本内容', '保存期间的新输入');
  await act(async () => { pending.resolve({ message: 'ok' }); expect(await flushed).toBe(true); });
  expect(mocks.update).toHaveBeenLastCalledWith(21, '旧标题', '保存期间的新输入');
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

test('标签页只保留内容编辑，不再出现 AI生成/上传剧本', async () => {
  await render(existing);
  await tick();
  expect([...document.querySelectorAll('[role="tab"]')].map(node => node.textContent)).toEqual(['内容']);
  expect(document.body.textContent).not.toContain('AI生成');
  expect(document.body.textContent).not.toContain('上传剧本');
});
