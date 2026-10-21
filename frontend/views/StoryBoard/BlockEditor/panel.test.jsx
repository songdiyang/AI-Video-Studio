// @vitest-environment jsdom
/** 真实 React/DOM 专用回归；所有工作流和网络均为 mock，无模型调用。 */
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import DirectorSpace from '../../../components/DirectorSpace';
import BlockEditor from './index';

const mocks = vi.hoisted(() => ({ toast: vi.fn(), start: vi.fn(), poll: vi.fn() }));
vi.mock('../../../contexts/ToastContext', () => ({ useToast: () => ({ showToast: mocks.toast }) }));
vi.mock('../../../hooks/useWorkflow', () => ({ startWorkflow: mocks.start, getWorkflowStatus: mocks.poll }));
vi.mock('../../../services/auth', () => ({ getAuthToken: () => '' }));
vi.mock('@heroui/react', () => ({ Button: ({ onPress, isDisabled, startContent, children }) => <button onClick={onPress} disabled={isDisabled}>{startContent}{children}</button> }));
vi.mock('./SketchFramesPanel', () => ({ default: () => null }));

let host, root, props, handle, register;
const find = label => host.querySelector(`[aria-label="${label}"]`);
const button = label => {
  const result = [...host.querySelectorAll('button')].find(el => el.textContent.trim() === label || el.title === label);
  expect(result, label).toBeTruthy(); return result;
};
const render = async extra => {
  props = { ...props, ...extra };
  await act(async () => { root.render(<DirectorSpace {...props} />); });
};
const click = async label => { await act(async () => { button(label).click(); }); };
const input = async (label, value) => {
  await act(async () => {
    const el = find(label);
    if (el.getAttribute('contenteditable') === 'true') el.textContent = value;
    else Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set.call(el, value);
    el.dispatchEvent(new Event('input', { bubbles: true }));
    if (el.tagName === 'TEXTAREA') el.dispatchEvent(new Event('change', { bubbles: true }));
  });
};
const flush = async () => { let success; await act(async () => { success = await handle.flush(); }); return success; };

beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  vi.useFakeTimers(); vi.clearAllMocks();
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ ready: true }) })));
  mocks.start.mockResolvedValue({ jobId: 'mock-job' });
  mocks.poll.mockResolvedValue({ status: 'completed', tasks: [{ result_data: { optimized: 'AI结果' } }] });
  host = document.createElement('div'); document.body.append(host); root = createRoot(host);
  register = vi.fn(value => { handle = value; });
  props = {
    scene: { id: 42, order: 1, description: '旧模板', baseDescription: '原始描述', hasAction: true, characters: ['小明'], dialogues: [{ character: '小明', line: '旧台词' }] },
    projectId: 7, scriptId: 3, onRegisterEditor: register, textModel: 'mock-text',
    onUpdateBaseDescription: vi.fn(async () => true), onUpdateFirstFramePrompt: vi.fn(async () => true),
    onUpdateLastFramePrompt: vi.fn(async () => true), onUpdateVideoPrompt: vi.fn(async () => true),
    onUpdateDialogues: vi.fn(async () => true), onUpdateVoiceover: vi.fn(async () => true), onUpdateNegativePrompt: vi.fn(async () => true),
    onGenerateImage: vi.fn(async () => ({ success: true })), onGenerateVideo: vi.fn(async () => ({ success: true })),
  };
});
afterEach(async () => {
  await act(async () => root.unmount()); host.remove(); vi.useRealTimers(); vi.unstubAllGlobals();
});

test('实际 DOM：内容与旧模板分离，切内部标签不卸载会话，操作栏通过 Portal 固定展示', async () => {
  await render(); expect(find('原始描述').textContent).toBe('原始描述');
  await input('原始描述', '新故事'); await click('提示词');
  expect(props.onUpdateBaseDescription).toHaveBeenCalledWith('新故事');
  expect(find('首帧提示词').textContent).toBe('旧模板');
  expect(host.querySelector('.w-56')).toBeNull();
  expect(host.querySelector('details').open).toBe(false);
  expect(button('生成首帧').closest('.content-editor-actions')).not.toBeNull();
  expect(register).toHaveBeenCalledTimes(1);
  await click('台词与旁白'); expect(find('首帧提示词')).toBeNull();
  await click('内容'); expect(find('原始描述').textContent).toBe('新故事'); expect(register).toHaveBeenCalledTimes(1);
});

test('所有字段回读及外部 flush；首尾帧/视频提示词不串写', async () => {
  await render(); await click('提示词');
  await input('首帧提示词', '首'); await input('负向提示词', '排除水印'); await click('图片尾帧');
  await input('尾帧提示词', '尾'); await click('视频'); await input('视频提示词', '视频');
  expect(await flush()).toBe(true);
  expect(props.onUpdateFirstFramePrompt).toHaveBeenCalledWith('首'); expect(props.onUpdateLastFramePrompt).toHaveBeenCalledWith('尾');
  expect(props.onUpdateVideoPrompt).toHaveBeenCalledWith('视频'); expect(props.onUpdateNegativePrompt).toHaveBeenCalledWith('排除水印');
  await click('台词与旁白'); await input('第1行台词', '台词'); await click('画外音'); await input('旁白', '旁白');
  expect(await flush()).toBe(true); expect(props.onUpdateDialogues).toHaveBeenCalledWith([{ character: '小明', line: '台词' }]); expect(props.onUpdateVoiceover).toHaveBeenCalledWith('旁白');
  await click('提示词'); await click('图片首帧'); expect(find('首帧提示词').textContent).toBe('首');
});

for (const failure of [false, new Error('offline')]) test(`保存失败 ${failure}：阻止关闭/切换、无成功提示、不能生成`, async () => {
  await render({ onUpdateFirstFramePrompt: vi.fn(async () => { if (failure instanceof Error) throw failure; return false; }) });
  await click('提示词'); await input('首帧提示词', '未保存'); await click('内容');
  expect(find('首帧提示词')).not.toBeNull(); expect(await flush()).toBe(false);
  await click('重试保存'); await click('生成首帧'); await click('生成提示词');
  expect(props.onGenerateImage).not.toHaveBeenCalled(); expect(mocks.start).not.toHaveBeenCalled();
  expect(mocks.toast.mock.calls.some(call => call[1] === 'success')).toBe(false);
});

test('在途自动保存不会覆盖新草稿，稳定 flush 使用最新回调并排空修订', async () => {
  let resolve;
  const wait = new Promise(r => { resolve = r; });
  const oldSave = vi.fn(() => wait), nextSave = vi.fn(async () => true);
  await render({ onUpdateBaseDescription: oldSave });
  await input('原始描述', 'A'); await act(async () => { vi.advanceTimersByTime(800); });
  await input('原始描述', 'AB');
  await render({ scene: { ...props.scene, baseDescription: 'A' }, onUpdateBaseDescription: nextSave });
  expect(find('原始描述').textContent).toBe('AB');
  await act(async () => { resolve(true); expect(await handle.flush()).toBe(true); });
  expect(oldSave).toHaveBeenCalledTimes(1); expect(nextSave).toHaveBeenCalledWith('AB'); expect(register).toHaveBeenCalledTimes(1);
});

test('立即双击只提交一次；图片生成前先保存，尾帧目标明确', async () => {
  await render(); await click('提示词'); await click('图片尾帧'); await input('尾帧提示词', '尾帧草稿');
  await act(async () => { button('生成尾帧').click(); button('生成尾帧').click(); });
  expect(props.onUpdateLastFramePrompt).toHaveBeenCalledWith('尾帧草稿');
  expect(props.onGenerateImage).toHaveBeenCalledTimes(1); expect(props.onGenerateImage).toHaveBeenCalledWith(42, '尾帧草稿', 'last', false);
});

test('AI 保存失败保留结果可手动重试，不写旧 prompt_template', async () => {
  await render({ onUpdateFirstFramePrompt: vi.fn(async () => false) }); await click('提示词'); await click('生成提示词');
  expect(find('首帧提示词').textContent).toBe('AI结果'); expect(mocks.toast.mock.calls.some(call => call[1] === 'success')).toBe(false);
  await render({ onUpdateFirstFramePrompt: vi.fn(async () => true) }); expect(await flush()).toBe(true);
  expect(props.onUpdateFirstFramePrompt).toHaveBeenCalledWith('AI结果'); expect(fetch).not.toHaveBeenCalled();
});

test('媒体模型与文本模型选择保持回调，静止分镜无尾帧入口', async () => {
  const image = vi.fn(), text = vi.fn();
  await render({ scene: { ...props.scene, hasAction: false }, models: [{ name: 'text-a', type: 'TEXT' }, { name: 'image-a', type: 'IMAGE' }], onImageModelChange: image, onTextModelChange: text });
  await click('提示词'); expect([...host.querySelectorAll('button')].some(el => el.textContent === '图片尾帧')).toBe(false);
  await act(async () => { const el = find('图片模型'); el.value = 'image-a'; el.dispatchEvent(new Event('change', { bubbles: true })); });
  await act(async () => { const el = find('文本模型'); el.value = 'text-a'; el.dispatchEvent(new Event('change', { bubbles: true })); });
  expect(image).toHaveBeenCalledWith('image-a'); expect(text).toHaveBeenCalledWith('text-a');
});

test('独立 BlockEditor 默认保留左右布局、描述回退和 legacy 保存回调', async () => {
  const save = vi.fn(async () => true);
  await act(async () => root.render(<BlockEditor storyboardId={9} basePrompt="基础描述" onSave={save} />));
  expect(host.querySelector('.w-56')).not.toBeNull(); expect(find('首帧提示词').textContent).toBe('基础描述');
  await input('首帧提示词', '独立草稿'); await click('保存');
  expect(save).toHaveBeenCalledWith(expect.objectContaining({ generatedPrompt: '独立草稿' }));
});

test('视频先保存再预检，预检失败停止请求', async () => {
  await render(); await click('提示词'); await click('视频'); await input('视频提示词', '运动');
  fetch.mockResolvedValue({ ok: false }); await click('生成视频');
  expect(props.onUpdateVideoPrompt).toHaveBeenCalledWith('运动'); expect(props.onGenerateVideo).not.toHaveBeenCalled();
});
