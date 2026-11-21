#!/usr/bin/env node
// 真实 MCP 客户端联调：以 stdio 连接 aivs-mcp，操作「真实工程数据」。
//
//   node demo-call.mjs --project 末日求生            # 只读巡检（安全）
//   node demo-call.mjs --project 末日求生 --demo-write  # 可回滚写演示（改一条分镜描述并还原）
//
// 这就是 Claude Desktop / Cursor / Cline 等外部软件调用本服务的同一条链路：
//   initialize → tools/list → tools/call → resources/read
// 写演示前后各 read_scene 一次，并显式 create_snapshot 留底，最后恢复原值。

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));

function arg(name, fallback = undefined) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : fallback;
}
const projectQuery = arg('project', '悲伤后遗症');
const demoWrite = process.argv.includes('--demo-write');

const transport = new StdioClientTransport({
  command: process.execPath,
  args: [join(here, 'server.mjs')],
  stderr: 'inherit',
});
const client = new Client({ name: 'aivs-demo', version: '0.0.0' });
await client.connect(transport);

const asJson = (res) => {
  const text = res.content?.[0]?.text ?? '';
  if (res.isError) throw new Error(text);
  return JSON.parse(text);
};
const call = async (name, args = {}) => asJson(await client.callTool({ name, arguments: args }));

// 1) 工具清单
const tools = await client.listTools();
console.log(`\n== 已连接 aivs-mcp，工具 ${tools.tools.length} 个 ==`);

// 2) 找工程
const { projects } = await call('list_projects');
const project = projects.find((p) => p.name.includes(projectQuery));
if (!project) {
  console.error(`找不到工程：${projectQuery}`);
  process.exit(1);
}
console.log(`工程：${project.name}\n路径：${project.path}`);

// 3) 摘要 + 分镜清单
const summary = await call('project_summary', { projectPath: project.path });
console.log('摘要：', JSON.stringify(summary.counts));
const scenes = await call('list_scenes', { projectPath: project.path, limit: 3 });
console.log(`分镜总数：${scenes.total}`);
for (const s of scenes.scenes) {
  console.log(`  #${s.index} id=${s.id} duration=${s.duration} desc=${s.description.slice(0, 40)}`);
}

// 4) 剧本预览
const scripts = await call('list_scripts', { projectPath: project.path });
for (const s of scripts.scripts.slice(0, 2)) {
  console.log(`剧本：${s.title}（${s.chars} 字） ${s.preview.slice(0, 30)}…`);
}

// 5) 资源读取
const resource = await client.readResource({ uri: 'aivs://projects' });
const resourceNames = JSON.parse(resource.contents?.[0]?.text || '[]').map((p) => p.name);
console.log(`resource aivs://projects → ${resourceNames.length} 个工程，含「${project.name}」`);

// 6) 可回滚写演示
if (demoWrite) {
  if (scenes.total === 0) {
    console.error('该工程没有分镜，跳过写演示');
    process.exit(0);
  }
  const target = scenes.scenes[0];
  console.log(`\n== 写演示（目标：#${target.index} id=${target.id}）==`);

  const before = await call('read_scene', { projectPath: project.path, sceneId: target.id });
  const original = before.description ?? '';
  const snap = await call('create_snapshot', { projectPath: project.path, label: 'MCP 联调前自动快照' });
  console.log(`快照：${snap.snapshot.id}（应用内「快照与恢复」可见）`);

  const marker = '【MCP 联调写入】';
  const updated = await call('update_scene', {
    projectPath: project.path,
    sceneId: target.id,
    patch: { description: original + marker },
  });
  console.log(`写入后描述：${updated.scene.description.slice(0, 60)}`);

  const verify = await call('read_scene', { projectPath: project.path, sceneId: target.id });
  console.log(`回读校验：${verify.description.endsWith(marker) ? '✓ 写入已落盘' : '✗ 未落盘'}`);

  const restored = await call('update_scene', {
    projectPath: project.path,
    sceneId: target.id,
    patch: { description: original },
  });
  const finalCheck = await call('read_scene', { projectPath: project.path, sceneId: target.id });
  console.log(`还原校验：${finalCheck.description === original ? '✓ 已恢复原值' : '✗ 与原值不一致'}（${restored.scene.id}）`);
}

const snaps = await call('list_snapshots', { projectPath: project.path });
console.log(`快照数：${snaps.snapshots.length}`);

await client.close();
console.log('\n== MCP 调用完成 ==');