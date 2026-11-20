/** 循环状态落盘回归：node --test services/agentLoopState.test.mjs
 *
 * 守住 P1-5 的几条硬约束：
 *  1) checkpoint 按工程+会话隔离，null 键不写不读；
 *  2) base64 图片附件不落盘（配额安全），文字观察完整保留；
 *  3) 损坏/非法数据读取返回 null，不炸会话加载；
 *  4) 中断告知如实说明轮次与已执行动作，不宣称完成。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

// localStorage shim：node 环境没有 DOM 存储
const store = new Map();
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => { store.set(k, String(v)); },
  removeItem: (k) => { store.delete(k); },
};

const source = readFileSync(fileURLToPath(new URL('./agentLoopState.ts', import.meta.url)), 'utf8');
const js = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText;
const { saveLoopState, loadLoopState, clearLoopState, buildInterruptionNotice } =
  await import('data:text/javascript;base64,' + Buffer.from(js, 'utf8').toString('base64'));

const sampleState = (over = {}) => ({
  status: 'running',
  round: 2,
  userText: '拆分剧本并出图',
  history: [
    { role: 'user', content: '拆分剧本并出图' },
    { role: 'assistant', content: '先拆分' },
    { role: 'user', content: '【执行结果】\n已拆分', attachments: [{ type: 'image', url: 'data:image/png;base64,AAAA' }, { type: 'image', url: 'media/keep.png' }] },
  ],
  executedLog: ['✓ 分镜拆分'],
  roundReply: '先拆分',
  manualNotified: false,
  intentVerified: false,
  imageBudgetLeft: 4,
  pendingConfirm: [],
  updatedAt: 123,
  ...over,
});

test('checkpoint 往返：按工程+会话隔离', () => {
  saveLoopState(1, 10, sampleState());
  saveLoopState(1, 11, sampleState({ round: 4 }));
  saveLoopState(2, 10, sampleState({ round: 3 }));
  assert.equal(loadLoopState(1, 10).round, 2);
  assert.equal(loadLoopState(1, 11).round, 4);
  assert.equal(loadLoopState(2, 10).round, 3);
  assert.equal(loadLoopState(9, 99), null);
});

test('null 工程/会话不写不读', () => {
  saveLoopState(null, 10, sampleState());
  saveLoopState(1, null, sampleState());
  assert.equal(loadLoopState(null, 10), null);
  assert.equal(loadLoopState(1, null), null);
});

test('base64 附件剥离、相对路径保留、文字观察完整', () => {
  saveLoopState(3, 30, sampleState());
  const loaded = loadLoopState(3, 30);
  const obs = loaded.history[2];
  assert.equal(obs.content, '【执行结果】\n已拆分');
  assert.deepEqual(obs.attachments, [{ type: 'image', url: 'media/keep.png' }]);
  // 全是 base64 的消息只留文字
  saveLoopState(3, 31, sampleState({
    history: [{ role: 'user', content: '看图', attachments: [{ type: 'image', url: 'data:image/png;base64,BBBB' }] }],
  }));
  const slim = loadLoopState(3, 31);
  assert.equal(slim.history[0].attachments, undefined);
  assert.equal(slim.history[0].content, '看图');
});

test('清除后不再误报中断', () => {
  saveLoopState(4, 40, sampleState());
  clearLoopState(4, 40);
  assert.equal(loadLoopState(4, 40), null);
});

test('损坏数据返回 null，不炸会话加载', () => {
  store.set('ai_agent_loop_5_50', '{broken json');
  assert.equal(loadLoopState(5, 50), null);
  store.set('ai_agent_loop_5_51', JSON.stringify({ round: 'x', history: null }));
  assert.equal(loadLoopState(5, 51), null);
});

test('中断告知：如实说明轮次与已执行动作，不宣称完成', () => {
  const notice = buildInterruptionNotice(sampleState());
  assert.match(notice, /第 3 轮/);
  assert.match(notice, /尚未完成/);
  assert.match(notice, /✓ 分镜拆分/);
  assert.match(notice, /继续/);
  const empty = buildInterruptionNotice(sampleState({ executedLog: [], round: 0 }));
  assert.match(empty, /还没有执行任何动作/);
  const withPending = buildInterruptionNotice(sampleState({ pendingConfirm: [{ action: 'delete_scene', label: '删除分镜' }] }));
  assert.match(withPending, /1 个删除类操作在等待你确认/);
});