/** 同名消歧回归：node --test services/uniqueName.test.mjs
 *
 * 这个模块同时管「同一工程里的剧本标题」和「全部已注册工程名」两种作用域。
 * 两条最容易出的事故都在这儿守：
 *  1) 覆盖式保存被误当成新增，用户改一次标题就被追加「 (2)」；
 *  2) 后缀套娃（「X (2) (2)」），因为消歧时没剥掉已有后缀。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import ts from 'typescript';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const source = readFileSync(fileURLToPath(new URL('./uniqueName.ts', import.meta.url)), 'utf8');
const { normalizeNameKey, makeUniqueName, makeUniqueScriptTitle, nameTaken, duplicateNameKeys, isDuplicateName, pathLeaf } =
  await import('data:text/javascript;base64,' + Buffer.from(
    ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText,
    'utf8',
  ).toString('base64'));

// ==================== 比较口径 ====================

test('normalizeNameKey：折叠空白 + 拉丁小写，中文原样', () => {
  assert.equal(normalizeNameKey('  罗生 门  '), '罗生 门');
  assert.equal(normalizeNameKey('Old Man'), normalizeNameKey('old   MAN'));
  assert.equal(normalizeNameKey(null), '');
  assert.equal(normalizeNameKey(undefined), '');
  assert.equal(normalizeNameKey(123), '123');
});

test('nameTaken：只在归一化全等时算同名，不用包含匹配', () => {
  const taken = ['第一场', 'Old Man and the Sea'];
  assert.ok(nameTaken(' 第一场 ', taken));
  assert.ok(nameTaken('old man AND the sea', taken));
  // 「第一场」是「第一场景」的一部分，但两者不是同一个标题
  assert.ok(!nameTaken('第一场景', taken));
  assert.ok(!nameTaken('', taken), '空标题不该算占用');
  assert.ok(!nameTaken(null, taken));
});

// ==================== 消歧 ====================

test('makeUniqueName：不冲突时原样返回，一个字都不改', () => {
  assert.equal(makeUniqueName('我的剧本', []), '我的剧本');
  assert.equal(makeUniqueName('我的剧本', ['另一个']), '我的剧本');
  assert.equal(makeUniqueName('Roshiomon', ['Whatever']), 'Roshiomon', '不得改大小写');
  assert.equal(makeUniqueName('  带空白  ', []), '带空白', '只裁首尾，不动中间');
  assert.equal(makeUniqueName('', ['a']), '', '空名保持为空，交给上层拒绝');
});

test('makeUniqueName：冲突时从 (2) 起，跳过所有已占用', () => {
  assert.equal(makeUniqueName('边城', ['边城']), '边城 (2)');
  assert.equal(makeUniqueName('边城', ['边城', '边城 (2)']), '边城 (3)');
  assert.equal(makeUniqueName('边城', ['边城', '边城 (2)', '边城 (3)', '边城 (5)']), '边城 (4)');
  // 大小写/多余空白形式的占用也要跳过
  assert.equal(makeUniqueName('Old Man', ['old  man']), 'Old Man (2)');
});

test('makeUniqueName：剥掉已有后缀重新编号，绝不产生「 (2) (2)」套娃', () => {
  assert.equal(makeUniqueName('边城 (2)', ['边城 (2)']), '边城 (3)');
  assert.equal(makeUniqueName('边城 (2)', ['边城', '边城 (2)']), '边城 (3)');
  assert.equal(makeUniqueName('边城 (2) (2)', ['边城 (2) (2)']), '边城 (2) (3)', '尾部后缀被剥掉');
  // 编号始终从 2 起：即使已存在的同名带大数字后缀，也先回填前面的空位，不做「最大值 +1」
  assert.equal(makeUniqueName('人 间 (10)', ['人 间 (10)']), '人 间 (2)');
});

test('makeUniqueName：占用数逼近上限时退化到时间戳，绝不让写入失败', () => {
  const taken = ['X'];
  for (let n = 2; n <= 999; n += 1) taken.push(`X (${n})`);
  const overflow = makeUniqueName('X', taken);
  assert.ok(overflow.startsWith('X ('), `退化形态不对：${overflow}`);
  assert.ok(!taken.some((t) => normalizeNameKey(t) === normalizeNameKey(overflow)), '兜底名仍与已占用同名');
});

test('makeUniqueName：非字符串输入不炸（历史数据里 title 可为 null）', () => {
  assert.equal(makeUniqueName(null, ['a']), '');
  assert.equal(makeUniqueName(undefined, ['a']), '');
  assert.equal(makeUniqueName(42, [42]), '42 (2)');
});

test('makeUniqueScriptTitle：与 makeUniqueName 同一口径', () => {
  assert.equal(makeUniqueScriptTitle('雪国', ['雪国', '古都']), '雪国 (2)');
  assert.equal(makeUniqueScriptTitle('雪国', ['古都']), '雪国');
});

// ==================== 列表侧重名识别 ====================

test('duplicateNameKeys / isDuplicateName：只标真正出现两次以上的名字', () => {
  const keys = duplicateNameKeys(['项目 A', '项目 B', '  项目 a ', '项目 C']);
  assert.equal(keys.size, 1, '只有项目 A 重复');
  assert.ok(isDuplicateName('项目 a', keys));
  assert.ok(!isDuplicateName('项目 C', keys));
  assert.equal(duplicateNameKeys([]).size, 0);
  assert.equal(duplicateNameKeys(['', null, 'x']).size, 0, '空名不参与重名统计');
  // 出现三次也只算一个键
  assert.equal(duplicateNameKeys(['同', '同', '同']).size, 1);
});

test('pathLeaf：两种分隔符、末尾分隔符、空值都能取到可展示的来源', () => {
  assert.equal(pathLeaf('D:\\作品\\项目A'), '项目A');
  assert.equal(pathLeaf('/home/me/proj-a'), 'proj-a');
  assert.equal(pathLeaf('D:\\作品\\项目A\\'), '项目A', '末尾分隔符应回退上一级');
  assert.equal(pathLeaf('local://projects/123'), '123');
  assert.equal(pathLeaf(''), '');
  assert.equal(pathLeaf(null), '');
  assert.equal(pathLeaf('///'), '', '整串都是分隔符时不编造名称');
});
