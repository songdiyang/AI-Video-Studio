/** 图片索引与 view_image 定位回归：node --test services/projectImageIndex.test.mjs
 *
 * 定位规则从面板内联迁出，防止改造时语义漂移：
 *  1) 索引按资产类型生成可读 label；
 *  2) sceneId 只匹配分镜（不与资产 id 歧义），无画面分镜返回空并提示；
 *  3) scope/keyword/max 过滤与上限；
 *  4) 显式 urls 优先。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const source = readFileSync(fileURLToPath(new URL('./projectImageIndex.ts', import.meta.url)), 'utf8');
const js = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText;
const { buildProjectImageIndex, resolveImageTargets } = await import('data:text/javascript;base64,' + Buffer.from(js, 'utf8').toString('base64'));

const sources = {
  characters: [{ name: '阿明', image_url: 'img/a.png' }],
  studios: [{ name: '雨巷', cover_image_url: 'img/s.png', nine_grid_image_url: 'img/s9.png' }],
  locations: [{ name: '巷口', image_url: 'img/l.png' }],
  props: [{ name: '雨伞', image_url: 'img/p.png' }],
  scenes: [
    { id: 7, index: 1, first_frame_url: 'img/f1.png' },
    { id: 8, index: 2, first_frame_url: 'img/f2.png', last_frame_url: 'img/f2b.png' },
  ],
};
const index = buildProjectImageIndex(sources);

test('索引：按资产类型生成语义 label', () => {
  const labels = index.map((e) => e.label);
  assert.ok(labels.includes('角色「阿明」主图'));
  assert.ok(labels.includes('场景「雨巷」封面'));
  assert.ok(labels.includes('场景「雨巷」九宫格'));
  assert.ok(labels.includes('地点「巷口」图'));
  assert.ok(labels.includes('道具「雨伞」图'));
  assert.ok(labels.includes('分镜#2 尾帧'));
  assert.equal(index.length, 8);
});

test('sceneId 只匹配分镜（不与资产 id 歧义）', () => {
  // 资产 id 7 不存在也不该命中；分镜 id=7 命中首帧
  const hit = resolveImageTargets({ sceneId: 7 }, { index, scenes: sources.scenes, currentFrameId: null });
  assert.deepEqual(hit.map((h) => h.url), ['img/f1.png']);
});

test('分镜存在但无画面 → 空结果（如实告知没画面）', () => {
  const hit = resolveImageTargets({ sceneId: 9 }, { index, scenes: [{ id: 9 }], currentFrameId: null });
  assert.deepEqual(hit, []);
});

test('scope + keyword 过滤与 max 上限', () => {
  const hit = resolveImageTargets({ scope: 'studio', keyword: '雨巷', max: 1 }, { index, scenes: sources.scenes, currentFrameId: null });
  assert.equal(hit.length, 1);
  assert.match(hit[0].label, /雨巷/);
});

test('未知 scope 返回空；all 表示不过滤', () => {
  assert.deepEqual(resolveImageTargets({ scope: 'unknown' }, { index, scenes: [], currentFrameId: null }), []);
  assert.ok(resolveImageTargets({ scope: 'all', max: 3 }, { index, scenes: [], currentFrameId: null }).length > 0);
});

test('显式 urls 优先且保留已知 label', () => {
  const hit = resolveImageTargets({ urls: ['img/p.png', 'http://x/unknown.png'] }, { index, scenes: [], currentFrameId: null });
  assert.equal(hit[0].label, '道具「雨伞」图');
  assert.equal(hit[1].label, '图片2');
});