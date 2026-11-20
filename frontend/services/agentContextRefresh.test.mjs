/** 多轮上下文刷新回归：node --test services/agentContextRefresh.test.mjs
 *
 * agent 循环最多 5 轮，contextPayload 却是发送瞬间的快照。循环内 create/update/delete
 * 后实体已变，若每轮仍发旧清单，模型会重复创建或误判「不存在」。这里守住刷新函数的硬约束：
 *  1) 工程级设置/记忆/写手沿用 base，不被刷新冲掉；
 *  2) 实体清单以工作台实时态为准，缺省时回退 base（不致清空）；
 *  3) 剧本按最新清单截断重建，过期 RAG 片段不得残留；
 *  4) scenes / longTasks 取调用方解析的权威值。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const source = readFileSync(fileURLToPath(new URL('./agentContextRefresh.ts', import.meta.url)), 'utf8');
const js = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText;
const { truncateScriptContent, refreshAgentContext } = await import(
  'data:text/javascript;base64,' + Buffer.from(js, 'utf8').toString('base64')
);

test('剧本截断：短内容原样、超预算保留前缀并标注原长、空值归一为 undefined', () => {
  assert.equal(truncateScriptContent('短剧本', 100), '短剧本');
  assert.equal(truncateScriptContent(undefined, 100), undefined);
  assert.equal(truncateScriptContent(null, 100), undefined);
  assert.equal(truncateScriptContent('', 100), undefined);
  const long = 'x'.repeat(500);
  const out = truncateScriptContent(long, 100);
  assert.ok(out.startsWith('x'.repeat(100)));
  assert.match(out, /原长 500 字符/);
});

test('刷新保留工程级设置/记忆/写手，只替换实体清单', () => {
  const base = {
    projectName: '测试工程',
    artStyle: '水墨',
    writerName: '鲁迅',
    memories: [{ scope: 'project', content: '记住风格', importance: 3 }],
    characters: [{ id: 1, name: '旧角色' }],
    scenes: [{ id: 1 }],
  };
  const live = { characters: [{ id: 1, name: '旧角色' }, { id: 2, name: '新角色' }] };
  const out = refreshAgentContext(base, live, { scenes: [{ id: 1 }, { id: 2 }], longTasks: [], maxScriptChars: 4000 });
  assert.equal(out.artStyle, '水墨');
  assert.equal(out.writerName, '鲁迅');
  assert.deepEqual(out.memories, base.memories);
  assert.equal(out.projectName, '测试工程');
  assert.equal(out.characters.length, 2, '新建角色必须进入下一轮上下文');
  assert.equal(out.scenes.length, 2);
});

test('live 缺省的实体回退 base，不会把已有清单清空', () => {
  const base = { characters: [{ id: 1 }], locations: [{ id: 9 }], props: [{ id: 5 }] };
  const out = refreshAgentContext(base, {}, { scenes: [], longTasks: [], maxScriptChars: 4000 });
  assert.deepEqual(out.characters, base.characters);
  assert.deepEqual(out.locations, base.locations);
  assert.deepEqual(out.props, base.props);
});

test('剧本按最新清单截断重建，发送瞬间的 RAG 伪片段不得残留', () => {
  const base = { scripts: [{ id: 0, title: '相关剧本内容', content: '过期RAG片段' }] };
  const live = { scripts: [{ id: 7, episode_number: 1, title: '第一集', content: 'y'.repeat(5000) }] };
  const out = refreshAgentContext(base, live, { scenes: [], longTasks: [], maxScriptChars: 4000 });
  assert.equal(out.scripts.length, 1);
  assert.equal(out.scripts[0].id, 7, '必须换成真实剧本清单');
  assert.equal(out.scripts[0].title, '第一集');
  assert.match(out.scripts[0].content, /原长 5000 字符/);
  assert.ok(!JSON.stringify(out.scripts).includes('过期RAG片段'));
});

test('scenes 与 longTasks 取调用方解析的权威值', () => {
  const base = { scenes: [{ id: 1 }], longTasks: [{ jobId: 'old' }] };
  const live = { scenes: [{ id: 1 }, { id: 2 }] };
  const resolvedScenes = [{ id: 1 }, { id: 2 }, { id: 3 }];
  const tasks = [{ jobId: 'new', status: 'running' }];
  const out = refreshAgentContext(base, live, { scenes: resolvedScenes, longTasks: tasks, maxScriptChars: 4000 });
  assert.deepEqual(out.scenes, resolvedScenes, 'scenes 以权威解析为准（工程文档回退）');
  assert.deepEqual(out.longTasks, tasks, '长任务取最新注册表');
});