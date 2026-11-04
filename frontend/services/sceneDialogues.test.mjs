/** 台词校验回归：node --test services/sceneDialogues.test.mjs
 * 直接转译真实的 sceneDialogues.ts 执行，不依赖浏览器/Tauri/模型。
 * 覆盖：一行一个说话人、说话人归属、幂等写进 video_prompt、正文冒号不误拆。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const source = readFileSync(fileURLToPath(new URL('./sceneDialogues.ts', import.meta.url)), 'utf8');
const js = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText;
const { normalizeSceneDialogues, enforceSceneDialogues } = await import(
  'data:text/javascript;base64,' + Buffer.from(js, 'utf8').toString('base64')
);

const pair = (lines) => lines.map((l) => `${l.character}|${l.line}`);
const cast = ['老李', '顾北'];
const appearance = new Map([['老李', '花白短发、深蓝色工装外套'], ['顾北', '黑色长发、银色耳钉']]);

test('整段台词按「名字：」拆成一行一人，说话人属于其后的正文', () => {
  const { lines, check } = normalizeSceneDialogues(
    { characters: cast, dialogue: '老李：别拧了。顾北：不拧，不拧就断了。老李：断了。' },
    cast,
  );
  assert.deepEqual(pair(lines), ['老李|别拧了。', '顾北|不拧，不拧就断了。', '老李|断了。']);
  assert.deepEqual(check, { lines: 3, missing: 0, unknown: [], resplit: 2 });
});

test('已结构化的一行内混入第二个说话人时，以行内标记为准', () => {
  const { lines } = normalizeSceneDialogues(
    { dialogues: [{ speaker: '老李', line: '走吧。顾北：你先走。' }] },
    cast,
  );
  assert.deepEqual(pair(lines), ['老李|走吧。', '顾北|你先走。']);
});

test('单角色镜头可安全归属，多角色镜头缺说话人不得猜', () => {
  assert.equal(normalizeSceneDialogues({ dialogue: '今天天气不错。' }, ['老李']).lines[0].character, '老李');
  assert.equal(normalizeSceneDialogues({ dialogue: '今天天气不错。' }, cast).check.missing, 1);
});

test('说话人带括号修饰时归位；对不上的名字上报为 unknown', () => {
  assert.deepEqual(normalizeSceneDialogues({ dialogue: '老李（低声）：关门。' }, cast).lines, [
    { character: '老李', line: '关门。', order: 0 },
  ]);
  assert.deepEqual(normalizeSceneDialogues({ dialogue: '小王：关门。' }, cast).check.unknown, ['小王']);
});

test('正文里的冒号（名字超过 6 字）不会被误当成说话人', () => {
  const { lines } = normalizeSceneDialogues({ dialogue: '菜单上写着价格：30 元。' }, cast);
  assert.deepEqual(lines.map((l) => l.line), ['菜单上写着价格：30 元。']);
});

test('已规范的台词原样保留，不产生额外拆行', () => {
  const { lines, check } = normalizeSceneDialogues(
    { dialogues: [{ character: '老李', line: '走吧。' }, { character: '顾北', line: '嗯。' }] },
    cast,
  );
  assert.deepEqual(pair(lines), ['老李|走吧。', '顾北|嗯。']);
  assert.deepEqual(check, { lines: 2, missing: 0, unknown: [], resplit: 0 });
});

test('视频提示词写入「定义主体 + {} 台词」，重复执行不堆叠', () => {
  const raw = {
    characters: cast,
    dialogue: '老李：别拧了。顾北：不拧就不完整。',
    voiceover: '那天是冬至',
    video_prompt: '面馆内景，热气缭绕',
  };
  enforceSceneDialogues(raw, appearance);
  assert.deepEqual(raw.dialogues, [
    { character: '老李', line: '别拧了。', order: 0 },
    { character: '顾北', line: '不拧就不完整。', order: 1 },
  ]);
  assert.ok(raw.video_prompt.includes('将画面中花白短发、深蓝色工装外套的角色定义为老李'));
  assert.ok(raw.video_prompt.includes('顾北说道{不拧就不完整。}'));
  assert.ok(raw.video_prompt.includes('画外音{那天是冬至}'));
  const once = raw.video_prompt;
  enforceSceneDialogues(raw, appearance);
  assert.equal(raw.video_prompt, once);
  assert.equal(raw.video_prompt.split('【角色指代与台词】').length - 1, 1);
});

test('没有外貌特征时只写台词，不编造主体定义', () => {
  const raw = { characters: ['路人甲'], dialogue: '路人甲：借过。', video_prompt: '巷口' };
  enforceSceneDialogues(raw, new Map());
  assert.equal(raw.video_prompt, '巷口。【角色指代与台词】路人甲说道{借过。}');
});

test('无台词镜头保持原样；纯旁白镜头只补画外音', () => {
  const silent = { characters: ['老李'], video_prompt: '空镜，雪落满屋顶' };
  enforceSceneDialogues(silent, appearance);
  assert.equal(silent.video_prompt, '空镜，雪落满屋顶');
  assert.equal(silent.dialogues, undefined);

  const narration = { characters: cast, voiceover: '冬至那晚', video_prompt: '面馆外景' };
  enforceSceneDialogues(narration, appearance);
  assert.equal(narration.video_prompt, '面馆外景。【角色指代与台词】画外音{冬至那晚}');
});
