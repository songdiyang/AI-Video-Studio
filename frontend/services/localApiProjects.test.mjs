/** 同名工程处理回归：node --test services/localApiProjects.test.mjs
 *
 * 只跑浏览器模拟模式（isTauri() === false），因为这一层的真实缺陷就出在这里：
 * 工程数据按 `local_project_data:<path>:<file>` 存 localStorage，早期 path 由**名称**拼出，
 * 于是「同名两个工程」会落到同一份数据上互相串写 —— 用户在 A 工程写的剧本出现在 B 工程里。
 * Tauri 侧的消歧由 Rust 追加目录后缀，不在本文件覆盖面内。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

// 浏览器模拟模式的最小环境：无 __TAURI__，localStorage 用 Map 顶
const bag = new Map();
globalThis.window = {};
globalThis.localStorage = {
  getItem: (k) => (bag.has(k) ? bag.get(k) : null),
  setItem: (k, v) => bag.set(k, String(v)),
  removeItem: (k) => bag.delete(k),
  clear: () => bag.clear(),
};

/** uniqueName 必须真跑：消歧口径（从 (2) 起、剥后缀）与剧本标题共用同一份实现 */
const MODS = {};
globalThis.__mods = MODS;
async function loadTs(file, { as, remotes = {} } = {}) {
  let source = readFileSync(fileURLToPath(new URL(file, import.meta.url)), 'utf8');
  for (const [spec, modName] of Object.entries(remotes)) {
    const re = new RegExp(`import\\s*\\{([^}]*)\\}\\s*from\\s*'\\./${spec}';`);
    const matched = re.exec(source);
    assert.ok(matched, `${file} 未找到 ./${spec} 依赖（import 形态变了要同步改测试）`);
    const names = matched[1]
      .split(',')
      .map((raw) => raw.trim())
      .filter((raw) => raw && !raw.startsWith('type '))
      .map((raw) => raw.split(/\s+as\s+/).pop().trim());
    source = source.replace(re, `const { ${names.join(', ')} } = globalThis.__mods.${modName};`);
  }
  const js = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const mod = await import('data:text/javascript;base64,' + Buffer.from(js, 'utf8').toString('base64'));
  if (as) MODS[as] = mod;
  return mod;
}

await loadTs('./uniqueName.ts', { as: 'uniqueName' });
const {
  createProject, listProjects, updateProjectManifest, deleteProject, saveProjectData, loadProjectData,
} = await loadTs('./localApi.ts', { as: 'localApi', remotes: { uniqueName: 'uniqueName' } });

const mk = (name, extra = {}) => ({ name, project_type: 'comic_drama', ...extra });

test('同名工程：第二个自动追加 (2)，名称不再重复', async () => {
  bag.clear();
  const a = await createProject(mk('罗生门'));
  const b = await createProject(mk('罗生门'));
  assert.equal(a.name, '罗生门');
  assert.equal(b.name, '罗生门 (2)');
  const names = (await listProjects()).map((p) => p.name);
  assert.equal(new Set(names).size, names.length, '工程列表里不允许出现两个同名');
});

test('同名工程各自独立存储（path 由 id 而非名称拼出）', async () => {
  bag.clear();
  const a = await createProject(mk('边城'));
  const b = await createProject(mk('边城'));
  assert.notEqual(a.path, b.path, 'path 相同会让两个工程串写同一份数据');
  assert.ok(a.path.startsWith('local://projects/'), `path 形态异常：${a.path}`);

  await saveProjectData(a.path, 'scripts', JSON.stringify({ title: 'A 的剧本' }));
  await saveProjectData(b.path, 'scripts', JSON.stringify({ title: 'B 的剧本' }));
  assert.match(await loadProjectData(a.path, 'scripts'), /A 的剧本/);
  assert.match(await loadProjectData(b.path, 'scripts'), /B 的剧本/);
});

test('同毫秒连点也不产生重复 id', async () => {
  bag.clear();
  const now = Date.now();
  const batch = await Promise.all([
    createProject(mk('甲')),
    createProject(mk('乙')),
    createProject(mk('丙')),
  ]);
  const ids = batch.map((p) => p.id);
  assert.equal(new Set(ids).size, ids.length, 'id 重复会让 path 与数据键一起撞车');
  for (const p of batch) {
    // 本地工程数值 ID 约定 ≥2e9，递增兜底不得破坏该约定
    assert.ok(Number(p.id) >= 2e9, `id 退化到区间外：${p.id}`);
    assert.ok(Number(p.id) >= now, `id 不应早于创建时刻：${p.id}`);
  }
});

test('改名同样消歧；改回自己的原名不得莫名多出 (2)', async () => {
  bag.clear();
  const a = await createProject(mk('旧课桌'));
  const b = await createProject(mk('旧课桌'));
  assert.equal(b.name, '旧课桌 (2)');

  const renamed = await updateProjectManifest(a.path, { name: '旧课桌 (2)' });
  assert.equal(renamed.name, '旧课桌 (3)', '改成别人已占用的名字要重新编号');

  const self = await updateProjectManifest(b.path, { name: '旧课桌 (2)' });
  assert.equal(self.name, '旧课桌 (2)', '把自己改成当前名称不是冲突，不该再加后缀');

  const blank = await updateProjectManifest(b.path, { name: '   ' });
  assert.equal(blank.name, '旧课桌 (2)', '空名称不应把工程名清空');
});

test('删除工程后名称占用释放：编号回填空位，不留「断号」', async () => {
  bag.clear();
  await createProject(mk('人间'));
  const b = await createProject(mk('人间'));
  await createProject(mk('人间'));
  assert.equal(b.name, '人间 (2)');
  const list = await listProjects();
  assert.deepEqual(list.map((p) => p.name).sort(), ['人间', '人间 (2)', '人间 (3)']);

  await deleteProject(b.path);
  const d = await createProject(mk('人间'));
  assert.equal(d.name, '人间 (2)', '被删除的名称占位应释放，编号回填而不是跳到 (4)');
  const after = (await listProjects()).map((p) => p.name);
  assert.equal(new Set(after).size, after.length, '列表里仍不允许出现同名');
});

test('名称归一化口径与剧本一致：大小写/多余空白也算同名', async () => {
  bag.clear();
  await createProject(mk('The Island'));
  const dup = await createProject(mk('the   island'));
  assert.equal(dup.name, 'the   island (2)', '归一化同名未被识别');
});

test('空白名称不被消歧编造出来', async () => {
  bag.clear();
  const blank = await createProject(mk('   '));
  assert.equal(blank.name, '', '空名称应原样交给上层校验，不该出现 " (2)"');
});
