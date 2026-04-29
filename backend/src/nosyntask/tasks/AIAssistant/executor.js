/**
 * AI 助手 - 执行任务（Executor）
 *
 * 输入：
 *   - tool_calls: Array<{ name, args }>  从 planner 步骤输出
 *   - parentJobId: 当前 AI 助手主 workflow 的 jobId
 *   - userId / projectId
 *   - defaultTextModel / defaultImageModel
 *
 * 责任：
 *   1. 逐个 tool_call 启动子 workflow（parent_job_id 设为当前主 job）
 *   2. 并发等待所有子 workflow 结束（成功或失败）
 *   3. 汇总每个子任务的最终状态和结果，输出给 observer
 *
 * 等待机制：
 *   - 优先订阅 Redis Pub/Sub 'child_workflow:completed' / 'child_workflow:failed' 事件
 *   - Redis 不可用时降级为轮询 DB
 */

const { invokeTool } = require('../../../modules/ai-assistant/toolRegistry');
const { queryAll } = require('../../../dbHelper');

let PubSubService = null;
try { PubSubService = require('../../../redis-service').PubSubService; } catch (e) { /* optional */ }

const POLL_INTERVAL_MS = 2000;
const MAX_WAIT_MS = 30 * 60 * 1000; // 单轮执行最多等 30 分钟

async function waitForChildJobs(jobIds, signal) {
  if (!jobIds || jobIds.length === 0) return [];

  const pending = new Set(jobIds);
  const results = new Map();
  const startedAt = Date.now();

  // 优先尝试 Pub/Sub 订阅
  if (PubSubService && PubSubService.isAvailable() && typeof PubSubService.subscribe === 'function') {
    try {
      await new Promise((resolve) => {
        let resolved = false;
        const done = () => {
          if (!resolved) { resolved = true; resolve(); }
        };

        const handler = async (message) => {
          try {
            const data = typeof message === 'string' ? JSON.parse(message) : message;
            if (data && pending.has(data.jobId)) {
              results.set(data.jobId, { status: data.status, error: data.error || null });
              pending.delete(data.jobId);
              if (pending.size === 0) done();
            }
          } catch (e) { /* ignore */ }
        };

        const unsubCompleted = PubSubService.subscribe('child_workflow:completed', handler);
        const unsubFailed = PubSubService.subscribe('child_workflow:failed', handler);

        // 启动前先做一次 DB 检查（防止事件在订阅前就发出了）
        setTimeout(async () => {
          await pollOnceFromDB(pending, results);
          if (pending.size === 0) done();
        }, 500);

        // 兜底轮询，防止 Pub/Sub 事件漏接
        const fallbackTimer = setInterval(async () => {
          if (Date.now() - startedAt > MAX_WAIT_MS) {
            console.warn('[AIAssistant.Executor] 等待子 workflow 超时');
            clearInterval(fallbackTimer);
            done();
            return;
          }
          await pollOnceFromDB(pending, results);
          if (pending.size === 0) {
            clearInterval(fallbackTimer);
            done();
          }
        }, POLL_INTERVAL_MS * 3);

        // 清理
        const cleanup = () => {
          clearInterval(fallbackTimer);
          try { if (typeof unsubCompleted === 'function') unsubCompleted(); } catch (e) {}
          try { if (typeof unsubFailed === 'function') unsubFailed(); } catch (e) {}
        };
        const origResolve = done;
        // 重写 done 以包含清理
        const wrappedDone = () => { cleanup(); origResolve(); };
        // hook into resolve path
        if (pending.size === 0) wrappedDone();
      });
      return Array.from(results.entries()).map(([jobId, info]) => ({ jobId, ...info }));
    } catch (e) {
      console.warn('[AIAssistant.Executor] Pub/Sub 等待失败，降级到轮询:', e.message);
    }
  }

  // 纯轮询降级
  while (pending.size > 0) {
    if (Date.now() - startedAt > MAX_WAIT_MS) {
      console.warn('[AIAssistant.Executor] 轮询等待超时');
      break;
    }
    await pollOnceFromDB(pending, results);
    if (pending.size === 0) break;
    await new Promise(r => setTimeout(r, POLL_INTERVAL_MS));
  }

  return Array.from(results.entries()).map(([jobId, info]) => ({ jobId, ...info }));
}

async function pollOnceFromDB(pendingSet, results) {
  if (pendingSet.size === 0) return;
  const ids = Array.from(pendingSet);
  const placeholders = ids.map(() => '?').join(',');
  const rows = await queryAll(
    `SELECT id, status, error_message FROM workflow_jobs 
     WHERE id IN (${placeholders}) AND status IN ('completed', 'failed', 'cancelled')`,
    ids
  );
  for (const row of rows) {
    results.set(row.id, { status: row.status, error: row.error_message || null });
    pendingSet.delete(row.id);
  }
}

async function handleExecutor(params, onProgress) {
  const {
    tool_calls: toolCalls = [],
    parentJobId,
    userId,
    projectId,
    defaultTextModel,
    defaultImageModel
  } = params;

  if (!parentJobId) throw new Error('executor: 缺少 parentJobId');

  if (onProgress) onProgress(5);

  if (toolCalls.length === 0) {
    // 没有要执行的工具（直接回复模式），跳过
    return { invocations: [], allSuccess: true };
  }

  console.log(`[AIAssistant.Executor] 启动 ${toolCalls.length} 个子 workflow, parent=${parentJobId}`);

  const invocations = [];
  const actor = { userId, projectId };
  const defaults = { defaultTextModel, defaultImageModel };

  // 并发启动全部子 workflow
  for (const call of toolCalls) {
    try {
      const inv = await invokeTool({
        toolName: call.name,
        args: call.args,
        actor,
        defaults,
        parentJobId
      });
      invocations.push({
        toolName: call.name,
        args: call.args,
        childJobId: inv.jobId,
        workflowType: inv.workflowType,
        status: 'running'
      });
    } catch (e) {
      console.error(`[AIAssistant.Executor] 启动工具失败: ${call.name}`, e.message);
      invocations.push({
        toolName: call.name,
        args: call.args,
        childJobId: null,
        status: 'failed',
        error: `启动失败: ${e.message}`
      });
    }
  }

  if (onProgress) onProgress(30);

  // 等待所有已成功启动的子 workflow 完成
  const runningIds = invocations.filter(x => x.childJobId).map(x => x.childJobId);
  const results = await waitForChildJobs(runningIds);

  // 合并结果到 invocations
  const resultMap = new Map(results.map(r => [r.jobId, r]));
  for (const inv of invocations) {
    if (inv.childJobId && resultMap.has(inv.childJobId)) {
      const r = resultMap.get(inv.childJobId);
      inv.status = r.status;
      if (r.error) inv.error = r.error;
    } else if (inv.childJobId) {
      // 超时或中断但未收到状态
      inv.status = 'unknown';
    }
  }

  if (onProgress) onProgress(100);

  const allSuccess = invocations.every(inv => inv.status === 'completed');
  console.log(`[AIAssistant.Executor] 执行完成: 成功=${invocations.filter(i => i.status === 'completed').length}/${invocations.length}`);

  return { invocations, allSuccess };
}

module.exports = handleExecutor;
