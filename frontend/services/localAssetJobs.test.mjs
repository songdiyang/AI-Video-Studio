/** 资产作业注册表回归：node --test services/localAssetJobs.test.mjs
 * 直接执行真实的 localAssetJobs.ts（只依赖类型，无外部运行时依赖）。
 * 覆盖：失败终态必须通过 onFail 补偿回写、只回写一次、超时不得被迟到结果覆盖终态。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const source = readFileSync(fileURLToPath(new URL('./localAssetJobs.ts', import.meta.url)), 'utf8');
const js = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText;
const mod = await import('data:text/javascript;base64,' + Buffer.from(js, 'utf8').toString('base64'));
const { submitAssetGeneration, getAssetJob, assetJobToWorkflowJob } = mod;

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

test('run() 抛错即进入 failed，并把可读原因交给 onFail 回写资产记录', async () => {
  const notices = [];
  const jobId = submitAssetGeneration({
    workflowType: 'character_state_views_generation', projectId: 3,
    run: async () => { throw new Error('厂商返回 503'); },
    onFail: (error) => notices.push(error.message),
  });
  assert.ok(jobId.startsWith('ag_'), '提交即返回任务号，不阻塞响应');
  await wait(10);
  const job = getAssetJob(jobId);
  assert.equal(job.status, 'failed');
  assert.equal(job.error_message, '厂商返回 503');
  assert.deepEqual(notices, ['厂商返回 503'], '失败回写只允许一次');
  // 工作流卡片与站内信读的是转换后的形状，原因必须一路传下去
  const view = assetJobToWorkflowJob(job);
  assert.equal(view.error_message, '厂商返回 503');
  assert.equal(view.tasks[0].status, 'failed');
});

test('看门狗超时同样落终态并回写；迟到的成功不得把失败改回完成', async () => {
  const notices = [];
  let settle;
  const jobId = submitAssetGeneration({
    workflowType: 'character_state_views_generation', projectId: 3, timeoutMs: 5,
    run: () => new Promise((resolve) => { settle = resolve; }),
    onFail: (error) => notices.push(error.message),
  });
  assert.equal(getAssetJob(jobId).status, 'running', '未超时前保持生成中');
  await wait(30);
  const job = getAssetJob(jobId);
  assert.equal(job.status, 'failed');
  assert.match(job.error_message, /超时/);
  assert.deepEqual(notices, [job.error_message]);

  settle({ image_url: 'late.png' });
  await wait(10);
  assert.equal(getAssetJob(jobId).status, 'failed', '超时后不得接受迟到结果覆盖终态');
  assert.equal(notices.length, 1, '同一作业不得二次回写，否则会把新一轮生成中改回失败');
});

test('成功路径不调用 onFail，避免把已完成的记录误标失败', async () => {
  const notices = [];
  const jobId = submitAssetGeneration({
    workflowType: 'character_state_views_generation', projectId: 3,
    run: async () => ({ front: 'f.png' }),
    onFail: (error) => notices.push(error.message),
  });
  await wait(10);
  const job = getAssetJob(jobId);
  assert.equal(job.status, 'completed');
  assert.equal(job.error_message, null);
  assert.deepEqual(notices, []);
  assert.equal(assetJobToWorkflowJob(job).tasks[0].progress, 100);
});

test('没传 onFail 时也必须正常进入终态（其他资产域尚未接入补偿回写不能因此崩）', async () => {
  const jobId = submitAssetGeneration({ workflowType: 'prop_views_generation', projectId: 3, run: async () => { throw new Error('额度不足'); } });
  await wait(10);
  assert.equal(getAssetJob(jobId).status, 'failed');
  assert.equal(getAssetJob(jobId).error_message, '额度不足');
});
