/** 动作目录回归：node --test services/agentActionCatalog.test.mjs
 *
 * 动作清单曾经散落四份，删改动作时漏改一处就会出现「按钮被隐藏但没人执行」。
 * 这里守住目录自身的几条硬约束：
 *  1) 不可逆动作永远不得进入自动执行集；
 *  2) 气泡不显示按钮的动作必须是智能体真的会执行的；
 *  3) 每个不可逆动作都要有说清影响面的确认文案。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const source = readFileSync(fileURLToPath(new URL('./agentActionCatalog.ts', import.meta.url)), 'utf8');
const js = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText;
const {
  IRREVERSIBLE_ACTIONS,
  MANUAL_ONLY_ACTIONS,
  AGENT_AUTO_ACTIONS,
  NO_BUTTON_ACTIONS,
  INLINE_RESULT_ACTIONS,
  ACTION_CONFIRM_COPY,
  isAgentAutoExecutable,
  requiresUserConfirm,
  getActionConfirmCopy,
} = await import('data:text/javascript;base64,' + Buffer.from(js, 'utf8').toString('base64'));

test('不可逆动作与自动执行集不相交', () => {
  for (const action of IRREVERSIBLE_ACTIONS) {
    assert.equal(AGENT_AUTO_ACTIONS.has(action), false, `${action} 不得自动执行`);
    assert.equal(isAgentAutoExecutable(action), false, `${action} 必须由用户确认`);
    assert.equal(requiresUserConfirm(action), true);
  }
});

test('人工动作不会混进自动执行集，但不可逆动作一定不在气泡按钮的隐藏名单里', () => {
  for (const action of MANUAL_ONLY_ACTIONS) {
    assert.equal(AGENT_AUTO_ACTIONS.has(action), false, `${action} 依赖界面上下文，不应自动执行`);
  }
  for (const action of IRREVERSIBLE_ACTIONS) {
    assert.equal(NO_BUTTON_ACTIONS.has(action), false, `${action} 必须给用户留按钮`);
  }
  assert.equal(NO_BUTTON_ACTIONS.has('ask'), true, 'ask 由专用提问卡片渲染');
});

test('删除与分镜写入动作都要留对话回执', () => {
  for (const action of ['delete_scene', 'delete_script', 'delete_character', 'delete_location']) {
    assert.equal(INLINE_RESULT_ACTIONS.has(action), true, `${action} 的回执不能只靠 toast`);
  }
});

test('每个不可逆动作都有确认文案，且说明不可撤销', () => {
  for (const action of IRREVERSIBLE_ACTIONS) {
    const copy = ACTION_CONFIRM_COPY[action];
    assert.ok(copy, `${action} 缺少确认文案`);
    assert.ok(copy.title.length > 0 && copy.confirmText.length > 0);
    assert.match(copy.message, /无法撤销|失去/, `${action} 的文案要说清影响面`);
  }
});

test('清单外动作给保守兜底，不放行', () => {
  const copy = getActionConfirmCopy('drop_database', '未知操作');
  assert.equal(copy.title, '确认执行不可逆操作');
  assert.match(copy.message, /未知操作/);
  assert.match(copy.message, /无法撤销/);
});
