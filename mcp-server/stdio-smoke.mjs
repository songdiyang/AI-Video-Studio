#!/usr/bin/env node
// MCP 协议级冒烟：以真实 stdio 客户端连本服务，走一遍 initialize → tools/list → tools/call。
// 证明外部智能体（Claude Desktop / Cursor / Cline）拿到的就是可用的 MCP 服务。
//
// 用法：node stdio-smoke.mjs（需要先 npm install）

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = mkdtempSync(join(tmpdir(), 'aivs-mcp-smoke-'));
const projectDir = join(root, '冒烟工程');
mkdirSync(join(projectDir, 'data'), { recursive: true });
writeFileSync(join(projectDir, 'project.json'), JSON.stringify({ schema_version: 1, id: 'p-smoke', name: '冒烟工程', project_type: 'comic_drama', updated_at: new Date().toISOString() }));
writeFileSync(join(projectDir, 'data', 'storyboards.json'), JSON.stringify({
  nextId: 2,
  scenes: [{ id: 1, index: 0, description: '雨夜巷口', variables: { duration: 5, dialogues: [] } }],
}));

const transport = new StdioClientTransport({
  command: process.execPath,
  args: [join(here, 'server.mjs')],
  env: { ...process.env, AIVS_PROJECTS_ROOT: root },
  stderr: 'pipe',
});
const client = new Client({ name: 'aivs-mcp-smoke', version: '0.0.0' });
await client.connect(transport);

const textOf = (res) => JSON.parse(res.content?.[0]?.text || '{}');
let failures = 0;
const check = (name, cond, extra = '') => {
  console.log(`${cond ? '✓' : '✗'} ${name}${cond ? '' : ` ${extra}`}`);
  if (!cond) failures += 1;
};

const tools = await client.listTools();
check('tools/list 暴露齐全', tools.tools.length >= 15, `got ${tools.tools.length}`);
const names = tools.tools.map((t) => t.name);
for (const required of ['list_projects', 'project_summary', 'list_scenes', 'update_scene', 'delete_scene', 'create_character', 'create_snapshot', 'list_snapshots']) {
  check(`工具存在：${required}`, names.includes(required));
}

const projects = textOf(await client.callTool({ name: 'list_projects', arguments: {} }));
check('list_projects 命中夹具工程', projects.projects?.length === 1 && projects.projects[0].name === '冒烟工程');

const summary = textOf(await client.callTool({ name: 'project_summary', arguments: { projectPath: projectDir } }));
check('project_summary 数量正确', summary.counts?.scenes === 1 && summary.counts?.scripts === 0);

const scene = textOf(await client.callTool({ name: 'read_scene', arguments: { projectPath: projectDir, sceneId: 1 } }));
check('read_scene 返回描述', scene.description === '雨夜巷口');

const updated = textOf(await client.callTool({
  name: 'update_scene',
  arguments: { projectPath: projectDir, sceneId: 1, patch: { description: '雨停后的巷口', duration: 8 } },
}));
check('update_scene 生效', updated.scene?.description === '雨停后的巷口' && updated.scene?.variables?.duration === 8);

const rejected = await client.callTool({ name: 'delete_scene', arguments: { projectPath: projectDir, sceneId: 1, confirm: false } });
check('delete_scene 未确认被拒绝', rejected.isError === true);

const deleted = textOf(await client.callTool({ name: 'delete_scene', arguments: { projectPath: projectDir, sceneId: 1, confirm: true } }));
check('delete_scene 已执行且自动快照', deleted.ok === true && Boolean(deleted.snapshot?.id));

const snapshots = textOf(await client.callTool({ name: 'list_snapshots', arguments: { projectPath: projectDir } }));
check('快照可列出（应用内可恢复）', snapshots.snapshots?.length === 1);

const character = textOf(await client.callTool({ name: 'create_character', arguments: { projectPath: projectDir, name: '外部智能体创建的角色', description: '冒烟' } }));
check('create_character 落盘', character.character?.id === 1);
const charsDoc = JSON.parse(readFileSync(join(projectDir, 'data', 'characters.json'), 'utf8'));
check('characters.json 形状正确', charsDoc.items?.length === 1 && charsDoc.nextId === 2);

const resource = await client.readResource({ uri: 'aivs://projects' });
check('resource aivs://projects 可读', String(resource.contents?.[0]?.text || '').includes('冒烟工程'));

await client.close();
rmSync(root, { recursive: true, force: true });
check('冒烟结束无失败', failures === 0, `${failures} 项失败`);
console.log(failures ? `\nFAILED: ${failures}` : '\nALL PASS');
process.exit(failures ? 1 : 0);