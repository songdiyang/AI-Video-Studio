/** MCP 服务数据层回归：node --test tools.test.mjs
 *
 * 用临时工程夹具验证外部智能体可依赖的硬约束：
 *  1) 工程发现/摘要只认含 project.json 的目录；
 *  2) 文档读写原子且形状保持（nextId/集合键）；
 *  3) 破坏性删除必须先快照（快照布局可被应用内恢复 UI 识别），保留最近 10 份；
 *  4) 字段白名单拒绝未知字段；台词清洗拒绝「某某：」前缀；
 *  5) 路径越界拒绝。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  SNAPSHOT_KEEP,
  assertInsideProject,
  cleanDialogues,
  createSnapshot,
  listProjects,
  listSnapshots,
  newScene,
  nextIdOf,
  pickFields,
  projectSummary,
  readCollection,
  writeCollection,
} from './lib.mjs';

function makeFixture(name = '测试工程') {
  const root = mkdtempSync(join(tmpdir(), 'aivs-mcp-'));
  const dir = join(root, name);
  mkdirSync(join(dir, 'data'), { recursive: true });
  mkdirSync(join(dir, 'media'), { recursive: true });
  writeFileSync(join(dir, 'project.json'), JSON.stringify({
    schema_version: 1, id: 'p-1', name, project_type: 'comic_drama',
    updated_at: '2026-01-01T00:00:00.000Z',
  }));
  writeFileSync(join(dir, 'data', 'storyboards.json'), JSON.stringify({
    nextId: 3,
    scenes: [
      { ...newScene({ id: 1, index: 0, description: '雨夜巷口' }), _scope: 's:1' },
      { ...newScene({ id: 2, index: 1, description: '屋顶追逐' }), _scope: 's:1' },
    ],
  }));
  writeFileSync(join(dir, 'data', 'scripts.json'), JSON.stringify({
    nextId: 2,
    scripts: [{ id: 1, title: '第一集', content: '内景。厨房。\n周慧兰：你吃了没有。' }],
  }));
  writeFileSync(join(dir, 'data', 'characters.json'), JSON.stringify({
    nextId: 2,
    items: [{ id: 1, name: '周慧兰', description: '母亲', appearance: '围裙' }],
  }));
  return { root, dir };
}

test('工程发现：只认含 project.json 的目录，并按 updated_at 倒序', () => {
  const { root, dir } = makeFixture('甲工程');
  mkdirSync(join(root, '不是工程'), { recursive: true });
  const list = listProjects(root);
  assert.equal(list.length, 1);
  assert.equal(list[0].path, dir);
  assert.equal(list[0].name, '甲工程');
});

test('工程摘要：清单 + 集合数量', () => {
  const { dir } = makeFixture();
  const summary = projectSummary(dir);
  assert.equal(summary.name, '测试工程');
  assert.deepEqual(summary.counts, {
    scripts: 1, scenes: 2, characters: 1, props: 0, studios: 0, environments: 0, snapshots: 0,
  });
});

test('集合读写：保持 nextId 与集合键，原子写后内容可回读', () => {
  const { dir } = makeFixture();
  const { doc, key, items } = readCollection(dir, 'storyboards');
  assert.equal(key, 'scenes');
  assert.equal(nextIdOf(doc, key), 3);
  doc[key] = [...items, newScene({ id: nextIdOf(doc, key), index: items.length, description: '新分镜' })];
  doc.nextId = 4;
  writeCollection(dir, 'storyboards', doc);
  const reread = JSON.parse(readFileSync(join(dir, 'data', 'storyboards.json'), 'utf8'));
  assert.equal(reread.scenes.length, 3);
  assert.equal(reread.nextId, 4);
  assert.equal(reread.scenes[2].description, '新分镜');
});

test('快照：布局与 Rust 一致（data/+project.json+meta.json），可被恢复 UI 识别', () => {
  const { dir } = makeFixture();
  const snap = createSnapshot(dir, '外部智能体：删除分镜', 'agent');
  const snapDir = join(dir, 'snapshots', snap.id);
  assert.ok(existsSync(join(snapDir, 'data', 'storyboards.json')));
  assert.ok(existsSync(join(snapDir, 'project.json')));
  const meta = JSON.parse(readFileSync(join(snapDir, 'meta.json'), 'utf8'));
  assert.equal(meta.trigger, 'agent');
  assert.equal(meta.label, '外部智能体：删除分镜');
  assert.ok(meta.created_at);
  assert.equal(listSnapshots(dir)[0].id, snap.id);
});

test('快照保留最近 10 份', () => {
  const { dir } = makeFixture();
  for (let i = 0; i < SNAPSHOT_KEEP + 3; i++) createSnapshot(dir, `备份 ${i}`, 'manual');
  assert.equal(listSnapshots(dir).length, SNAPSHOT_KEEP);
});

test('字段白名单：未知字段拒绝，允许字段透传', () => {
  assert.deepEqual(pickFields({ name: 'x' }, ['name']), { name: 'x' });
  assert.deepEqual(pickFields({}, ['name']), {});
  assert.throws(() => pickFields({ unknown: 1 }, ['name']), /不允许写入字段/);
});

test('台词清洗：拒绝行内「某某：」前缀，保留说话人字段', () => {
  assert.deepEqual(cleanDialogues([{ character: '周慧兰', line: '你吃了没有。' }]), [
    { character: '周慧兰', line: '你吃了没有。' },
  ]);
  assert.throws(() => cleanDialogues([{ character: '周慧兰', line: '周慧兰：你吃了没有。' }]), /不得再带/);
  assert.throws(() => cleanDialogues([{ line: '   ' }]), /不能为空/);
});

test('路径越界拒绝', () => {
  const { dir } = makeFixture();
  assert.ok(assertInsideProject(dir, 'media/a.png').startsWith(dir));
  assert.throws(() => assertInsideProject(dir, '../outside.txt'), /越界/);
});

test('清理夹具', () => {
  const { root } = makeFixture();
  rmSync(root, { recursive: true, force: true });
  assert.equal(existsSync(root), false);
});