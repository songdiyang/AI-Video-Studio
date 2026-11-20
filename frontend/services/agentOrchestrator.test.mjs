/** 智能体编排器回归：node --test services/agentOrchestrator.test.mjs
 *
 * 编排层（plan→execute→observe）曾是面板 index.tsx 里不可测的 460 行内联循环。
 * 抽成 agentOrchestrator 后，这里用假端口覆盖编排语义的硬约束：
 *  1) 多轮循环：观察结果回喂、上下文逐轮刷新、轮数上限；
 *  2) 不可逆/人工动作不进循环，拦下后挂按钮并回喂一次收敛说明；
 *  3) 空承诺核验：执行指令零动作时回喂工程真实状态，最多一次；
 *  4) ask 暂停循环；generate_script 交行为卡片接管；
 *  5) auto_storyboard 落库/新增核验，不凭返回值宣称完成；
 *  6) 图片全循环预算；动作失败据实回喂；
 *  7) 状态 checkpoint 与续跑恢复。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import esbuild from 'esbuild';

const entry = fileURLToPath(new URL('./agentOrchestrator.ts', import.meta.url));
const bundled = await esbuild.build({
  entryPoints: [entry],
  bundle: true,
  format: 'esm',
  platform: 'node',
  write: false,
  logLevel: 'silent',
});
const { runAgentLoop } = await import('data:text/javascript;base64,' + Buffer.from(bundled.outputFiles[0].text, 'utf8').toString('base64'));

/** 假端口工厂：记录调用，按脚本返回规划/执行结果 */
function makePorts(opts = {}) {
  const calls = { plan: [], execute: [], refresh: 0, verify: 0, states: [], roundPlans: [], scriptStarts: 0, tracker: [] };
  const plans = opts.plans || [{ reply: '完成', suggestions: [] }];
  let planIdx = 0;
  const tracker = {
    start: (t) => calls.tracker.push(['start', t]),
    touch: () => {},
    complete: (d) => calls.tracker.push(['complete', d]),
    fail: (d) => calls.tracker.push(['fail', d]),
    finishAll: (f) => calls.tracker.push(['finishAll', f]),
  };
  const ports = {
    plan: async (messages, context) => {
      calls.plan.push({ messages: messages.map((m) => ({ ...m })), context });
      const p = plans[Math.min(planIdx, plans.length - 1)];
      planIdx += 1;
      if (p instanceof Error) throw p;
      return p;
    },
    refreshContext: async () => { calls.refresh += 1; return { refreshed: calls.refresh }; },
    execute: async (action, params) => {
      calls.execute.push({ action, params });
      const fn = opts.execute;
      return fn ? fn(action, params, calls.execute.length) : { success: true, summary: `已执行 ${action}` };
    },
    inspectQuality: async (sceneId) => opts.inspectQuality
      ? opts.inspectQuality(sceneId)
      : { text: `【分镜质检素材 #${sceneId}】\n描述：测试`, images: [{ label: '首帧', url: 'media/a.png' }] },
    resolveImageTargets: (params) => opts.targets || [],
    toVisionImageUrls: async (urls) => urls.map((u) => ({ dataUrl: `data:image/png;base64,${u}` })),
    verifyProjectState: async () => { calls.verify += 1; return '分镜 0 个'; },
    fetchScenes: async () => (opts.scenes ? opts.scenes() : []),
    isTaskRequest: (t) => opts.isTaskRequest ? opts.isTaskRequest(t) : /生成|创建|拆分/.test(t),
    tracker,
    onRoundPlan: (round, count, summary) => calls.roundPlans.push({ round, count, summary }),
    onScriptGenerationStart: () => { calls.scriptStarts += 1; },
    onState: (s) => calls.states.push(s),
  };
  return { ports, calls };
}

const baseInput = (over = {}) => ({
  userText: '帮我生成一个角色',
  initialHistory: [{ role: 'user', content: '帮我生成一个角色' }],
  initialContext: { projectName: '测试工程' },
  hasProject: true,
  currentFrameId: null,
  ...over,
});

test('多轮循环：执行→观察回喂→再规划→收敛，上下文逐轮刷新', async () => {
  const { ports, calls } = makePorts({
    plans: [
      { reply: '先建角色', suggestions: [{ action: 'create_character', label: '新建角色', params: { name: '阿明' } }] },
      { reply: '角色已建好，任务完成。', suggestions: [] },
    ],
  });
  const result = await runAgentLoop(baseInput(), ports);
  assert.equal(calls.execute.length, 1);
  assert.equal(calls.execute[0].action, 'create_character');
  assert.equal(calls.refresh, 1, '第 1 轮才刷新上下文，第 0 轮用发送瞬间快照');
  assert.equal(calls.plan[1].context.refreshed, 1);
  // 观察结果以 user 消息回喂，且包含执行回执
  const obs = calls.plan[1].messages.find((m) => m.role === 'user' && m.content.includes('【执行结果】'));
  assert.ok(obs, '第二轮规划必须看到第一轮的观察结果');
  assert.match(obs.content, /已执行 create_character/);
  assert.equal(result.finalContent, '角色已建好，任务完成。');
  assert.equal(result.state.status, 'done');
  assert.deepEqual(result.state.executedLog, ['✓ 新建角色']);
});

test('不可逆动作被拦下：不执行、挂确认按钮、回喂一次后收敛', async () => {
  const { ports, calls } = makePorts({
    plans: [
      { reply: '我来删除分镜', suggestions: [{ action: 'delete_scene', label: '删除分镜', params: { sceneId: 1 } }] },
      { reply: '删除需要你在按钮里确认。', suggestions: [] },
    ],
  });
  const result = await runAgentLoop(baseInput({ userText: '删除分镜1' }), ports);
  assert.equal(calls.execute.length, 0, '不可逆动作绝不进循环执行');
  assert.equal(result.pendingConfirm.length, 1);
  assert.equal(result.pendingConfirm[0].action, 'delete_scene');
  assert.match(result.finalContent, /删除类操作不会自动执行/);
  // 第二轮规划收到「已保留按钮」的收敛回喂
  const note = calls.plan[1].messages.find((m) => m.content.includes('属于不可逆操作'));
  assert.ok(note);
  assert.equal(result.state.status, 'done');
});

test('人工动作被拦下：回喂说明一次，不反复纠缠', async () => {
  const { ports, calls } = makePorts({
    plans: [
      { reply: '请优化剧本', suggestions: [{ action: 'optimize_script', label: '优化剧本' }] },
      { reply: '优化剧本需要你在界面点击。', suggestions: [{ action: 'optimize_script', label: '优化剧本' }] },
      { reply: '最终回复', suggestions: [] },
    ],
  });
  const result = await runAgentLoop(baseInput({ userText: '请优化剧本' }), ports);
  assert.equal(calls.execute.length, 0);
  assert.equal(calls.plan.length, 2, 'manualNotified 只回喂一次；第二次重复同一人工动作直接收敛');
  assert.equal(result.finalContent, '优化剧本需要你在界面点击。');
});

test('空承诺核验：执行指令零动作时回喂工程真实状态，且只核验一次', async () => {
  const { ports, calls } = makePorts({
    plans: [
      { reply: '我这就去生成分镜', suggestions: [] },
      { reply: '我会尽快完成', suggestions: [] },
      { reply: '缺少剧本，无法拆分', suggestions: [] },
    ],
  });
  const result = await runAgentLoop(baseInput({ userText: '生成分镜' }), ports);
  assert.equal(calls.verify, 1, '核验最多一次');
  const fed = calls.plan[1].messages.find((m) => m.content.includes('【系统核验】'));
  assert.ok(fed);
  assert.match(fed.content, /分镜 0 个/);
  assert.match(result.finalContent, /系统核验：本轮没有触发任何工具动作/);
});

test('疑问句不触发空承诺核验（不是执行指令）', async () => {
  const { ports, calls } = makePorts({ plans: [{ reply: '建议如下', suggestions: [] }] });
  const result = await runAgentLoop(baseInput({ userText: '这个分镜怎么写更好？' }), ports);
  assert.equal(calls.verify, 0);
  assert.equal(result.finalContent, '建议如下');
});

test('ask 生成澄清卡片并暂停循环', async () => {
  const { ports, calls } = makePorts({
    plans: [{ reply: '先问清楚', suggestions: [{ action: 'ask', params: { question: '想要什么题材？', options: ['悬疑', '恋爱', '悬疑', ''] } }] }],
  });
  const result = await runAgentLoop(baseInput(), ports);
  assert.equal(calls.plan.length, 1, 'ask 后不再规划');
  assert.equal(calls.execute.length, 0);
  assert.equal(result.askCard.question, '想要什么题材？');
  assert.deepEqual(result.askCard.options, ['悬疑', '恋爱'], '选项去重去空');
  assert.equal(result.finalContent, '想要什么题材？');
  assert.equal(result.state.status, 'ask');
});

test('auto_storyboard 核验未落库：不凭 sceneCount 宣称完成', async () => {
  const { ports, calls } = makePorts({
    plans: [
      { reply: '拆分中', suggestions: [{ action: 'auto_storyboard', label: '分镜拆分' }] },
      { reply: '拆分未成功', suggestions: [] },
    ],
    execute: () => ({ sceneCount: 3 }),
    scenes: () => [],
  });
  const result = await runAgentLoop(baseInput({ userText: '拆分剧本' }), ports);
  assert.deepEqual(result.state.executedLog, ['✗ 分镜拆分（核验未落库）']);
  const obs = calls.plan[1].messages.find((m) => m.content.includes('【执行结果】'));
  assert.match(obs.content, /仍是 0 个——拆分并没有真正落库/);
});

test('auto_storyboard 核验未新增：执行前后数量对比', async () => {
  let stage = 0;
  const { ports, calls } = makePorts({
    plans: [
      { reply: '拆分中', suggestions: [{ action: 'auto_storyboard', label: '分镜拆分' }] },
      { reply: '没有新分镜', suggestions: [] },
    ],
    execute: () => ({ sceneCount: 2 }),
    scenes: () => { stage += 1; return [{ id: 1 }, { id: 2 }]; },
  });
  const result = await runAgentLoop(baseInput({ userText: '拆分剧本' }), ports);
  assert.deepEqual(result.state.executedLog, ['✗ 分镜拆分（核验未新增）']);
  const obs = calls.plan[1].messages.find((m) => m.content.includes('【执行结果】'));
  assert.match(obs.content, /并未增加/);
});

test('auto_storyboard 成功：核验值回喂 + 未归属台词统计', async () => {
  let sceneReads = 0;
  const { ports, calls } = makePorts({
    plans: [
      { reply: '拆分中', suggestions: [{ action: 'auto_storyboard', label: '分镜拆分' }] },
      { reply: '完成', suggestions: [] },
    ],
    execute: () => ({ sceneCount: 2, dialogueNote: '台词已初步归属' }),
    // 第一次读是执行前（0 个），执行后回读才是 2 个
    scenes: () => {
      sceneReads += 1;
      return sceneReads === 1 ? [] : [
        { id: 1, dialogues: [{ character: '阿明' }, { character: '' }] },
        { id: 2, dialogues: [] },
      ];
    },
  });
  const result = await runAgentLoop(baseInput({ userText: '拆分剧本' }), ports);
  assert.deepEqual(result.state.executedLog, ['✓ 分镜拆分']);
  const obs = calls.plan[1].messages.find((m) => m.content.includes('【执行结果】'));
  assert.match(obs.content, /现有 2 个分镜/);
  assert.match(obs.content, /1 句台词尚未识别出说话人/);
  assert.match(obs.content, /台词已初步归属/);
});

test('动作明确失败：据实回喂失败原因，步骤标失败', async () => {
  const { ports, calls } = makePorts({
    plans: [
      { reply: '建角色', suggestions: [{ action: 'create_character', label: '新建角色' }] },
      { reply: '失败了', suggestions: [] },
    ],
    execute: () => ({ success: false, error: '模型额度不足' }),
  });
  const result = await runAgentLoop(baseInput(), ports);
  assert.deepEqual(result.state.executedLog, ['✗ 新建角色']);
  const obs = calls.plan[1].messages.find((m) => m.content.includes('【执行结果】'));
  assert.match(obs.content, /模型额度不足/);
  assert.ok(calls.tracker.some(([k, d]) => k === 'fail' && /模型额度不足/.test(d || '')));
});

test('后台任务 jobId：据实回报已启动，不虚构数量', async () => {
  const { ports, calls } = makePorts({
    plans: [
      { reply: '出图', suggestions: [{ action: 'generate_frame', label: '生成图片' }] },
      { reply: '已启动', suggestions: [] },
    ],
    execute: () => ({ jobId: 42 }),
  });
  await runAgentLoop(baseInput(), ports);
  const obs = calls.plan[1].messages.find((m) => m.content.includes('【执行结果】'));
  assert.match(obs.content, /工作流 #42/);
  assert.match(obs.content, /不要虚构/);
});

test('图片全循环预算 6 张：超出部分如实说明未发送', async () => {
  const eight = Array.from({ length: 8 }, (_, i) => ({ label: `图${i}`, url: `media/${i}.png` }));
  const { ports, calls } = makePorts({
    plans: [
      { reply: '看图', suggestions: [{ action: 'view_image', label: '查看画面', params: {} }, { action: 'inspect_quality', label: '质检', params: { sceneId: 1 } }] },
      { reply: '看完', suggestions: [] },
    ],
    targets: eight,
    inspectQuality: () => ({ text: '【分镜质检素材 #1】', images: eight.slice(0, 4) }),
  });
  const result = await runAgentLoop(baseInput(), ports);
  // view_image cap4 → 内联 4；inspect_quality 只剩预算 2 → 内联 2
  assert.equal(result.state.imageBudgetLeft, 0);
  const obs = calls.plan[1].messages.find((m) => m.content.includes('【执行结果】'));
  assert.match(obs.content, /已取出 4 张图片/);
  assert.match(obs.content, /额度已用尽而未发送/);
  // 内联图片随观察消息回喂
  const withImages = calls.plan[1].messages.find((m) => m.attachments?.length);
  assert.equal(withImages.attachments.length, 6);
});

test('轮数上限：模型不停发动作也在 MAX_ROUNDS 收敛', async () => {
  const { ports, calls } = makePorts({
    plans: [{ reply: '继续', suggestions: [{ action: 'read_script', label: '读剧本' }] }],
    execute: () => '剧本正文',
  });
  const result = await runAgentLoop(baseInput(), ports);
  assert.equal(calls.execute.length, 5);
  assert.equal(calls.plan.length, 5);
  assert.equal(result.state.executedLog.length, 5);
});

test('generate_script：行为卡片接管，scriptGenerationHandled 置位', async () => {
  const { ports, calls } = makePorts({
    plans: [
      { reply: '写剧本', suggestions: [{ action: 'generate_script', label: '生成剧本' }] },
      { reply: '不应再规划', suggestions: [] },
    ],
    execute: () => ({ success: true, summary: '剧本生成中' }),
  });
  const result = await runAgentLoop(baseInput(), ports);
  assert.equal(calls.scriptStarts, 1);
  assert.equal(result.scriptGenerationHandled, true);
});

test('规划失败抛出：交由面板回退普通聊天', async () => {
  const { ports } = makePorts({ plans: [{ success: false, error: '模型不可用' }] });
  await assert.rejects(() => runAgentLoop(baseInput(), ports), /模型不可用/);
});

test('状态 checkpoint：每轮 running、收敛 done，history 含完整往返', async () => {
  const { ports, calls } = makePorts({
    plans: [
      { reply: '建角色', suggestions: [{ action: 'create_character', label: '新建角色' }] },
      { reply: '完成', suggestions: [] },
    ],
  });
  const result = await runAgentLoop(baseInput(), ports);
  const running = calls.states.filter((s) => s.status === 'running');
  assert.equal(running.length, 2, '每轮规划前交一次 running checkpoint');
  assert.equal(running[0].round, 0);
  assert.equal(running[1].round, 1);
  const last = calls.states[calls.states.length - 1];
  assert.equal(last.status, 'done');
  assert.equal(last.userText, '帮我生成一个角色');
  assert.ok(last.history.length >= 4, 'user→assistant→观察→assistant 完整保留');
  assert.equal(result.state.updatedAt > 0, true);
});

test('续跑：从落盘状态恢复 round/history/executedLog，首轮即刷新上下文', async () => {
  const resume = {
    status: 'running',
    round: 2,
    userText: '原始任务',
    history: [
      { role: 'user', content: '原始任务' },
      { role: 'assistant', content: '先建角色' },
      { role: 'user', content: '【执行结果】\n已执行 create_character' },
    ],
    executedLog: ['✓ 新建角色'],
    roundReply: '先建角色',
    manualNotified: false,
    intentVerified: false,
    imageBudgetLeft: 4,
    pendingConfirm: [],
    updatedAt: 1,
  };
  const { ports, calls } = makePorts({ plans: [{ reply: '接着完成了', suggestions: [] }] });
  const result = await runAgentLoop(baseInput({ resume }), ports);
  assert.equal(calls.refresh, 1, '续跑首轮上下文已过期，必须刷新');
  assert.equal(calls.plan[0].messages.length, 3, '从落盘 history 接着规划，不重建');
  assert.equal(calls.plan[0].messages[0].content, '原始任务');
  assert.deepEqual(result.state.executedLog, ['✓ 新建角色']);
  assert.equal(result.state.imageBudgetLeft, 4);
  assert.equal(result.finalContent, '接着完成了');
});

test('续跑保留待确认按钮：pendingConfirm 不丢', async () => {
  const resume = {
    status: 'running', round: 1, userText: '删除并重建',
    history: [{ role: 'user', content: '删除并重建' }],
    executedLog: [], roundReply: '', manualNotified: true, intentVerified: false,
    imageBudgetLeft: 6,
    pendingConfirm: [{ action: 'delete_scene', label: '删除分镜', params: { sceneId: 9 } }],
    updatedAt: 1,
  };
  const { ports } = makePorts({ plans: [{ reply: '收尾', suggestions: [] }] });
  const result = await runAgentLoop(baseInput({ resume }), ports);
  assert.equal(result.pendingConfirm.length, 1);
  assert.equal(result.pendingConfirm[0].params.sceneId, 9);
  assert.match(result.finalContent, /删除类操作不会自动执行/);
});