/** 动作结果契约回归：node --test services/agentActionOutcome.test.mjs
 *
 * agent 循环靠返回值判断动作是否执行。这里守住三件事：
 *  1) 成功/失败结构稳定，summary 与 error 不互相污染；
 *  2) undefined / 字符串等旧返回值不能被误判成失败；
 *  3) 对话回执能从两种结构里取到可直接展示的一行文本。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const source = readFileSync(fileURLToPath(new URL('./agentActionOutcome.ts', import.meta.url)), 'utf8');
const js = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText;
const { actionOk, actionFail, isActionFailure, actionErrorText, actionSuccessText } = await import(
  'data:text/javascript;base64,' + Buffer.from(js, 'utf8').toString('base64')
);

test('actionOk：成功结构带 summary，可选 data', () => {
  assert.deepEqual(actionOk('已删除分镜 #12'), { success: true, summary: '已删除分镜 #12' });
  assert.deepEqual(actionOk('已删除分镜 #12', { sceneId: 12 }), {
    success: true,
    summary: '已删除分镜 #12',
    data: { sceneId: 12 },
  });
});

test('actionFail：失败结构带 error，retryable 仅显式开启', () => {
  assert.deepEqual(actionFail('工程文档未变更'), { success: false, error: '工程文档未变更' });
  assert.deepEqual(actionFail('网络抖动', true), { success: false, error: '网络抖动', retryable: true });
});

test('isActionFailure：只认明确失败，旧返回值不算失败', () => {
  assert.equal(isActionFailure(actionFail('失败')), true);
  assert.equal(isActionFailure({ error: '失败' }), true);
  assert.equal(isActionFailure({ success: true, summary: '完成' }), false);
  assert.equal(isActionFailure('已删除'), false);
  assert.equal(isActionFailure(undefined), false);
  assert.equal(isActionFailure(null), false);
  assert.equal(isActionFailure(true), false);
});

test('actionErrorText：失败取 error，成功返回空串', () => {
  assert.equal(actionErrorText(actionFail('  工程未落盘  ')), '工程未落盘');
  assert.equal(actionErrorText({ error: '' }), '');
  assert.equal(actionErrorText(actionOk('完成')), '');
  assert.equal(actionErrorText(undefined), '');
});

test('actionSuccessText：字符串与 summary 都能直接展示，失败不返回成功文案', () => {
  assert.equal(actionSuccessText('已删除分镜 #12'), '已删除分镜 #12');
  assert.equal(actionSuccessText(actionOk('  已更新旁白  ')), '已更新旁白');
  assert.equal(actionSuccessText(actionFail('更新失败')), '');
  assert.equal(actionSuccessText({ success: true, id: 3 }), '', '无 summary 的旧对象交给调用方回退 JSON');
});
