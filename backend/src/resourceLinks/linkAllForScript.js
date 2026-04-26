/**
 * 批量关联 — 为指定剧本下的所有分镜建立角色/场景关联
 * 
 * 性能优化版本：
 * - 预加载项目所有角色和场景到内存 Map，避免 N+1 查询
 * - 批量 DELETE + 批量 INSERT，减少 DB 往返次数
 * - 原版：30个分镜×3角色 ≈ 270次 SELECT + 90次 INSERT = 360次 DB 操作
 * - 优化版：2次 SELECT（预加载角色+场景）+ 2次 DELETE + 2次 INSERT = 6次 DB 操作
 */

const { queryAll, execute } = require('../dbHelper');
const { isNonCharacterEntity } = require('../utils/characterFilter');

/**
 * 在内存中匹配角色名（支持精确/前缀/包含三级匹配）
 * @param {string} name - 要匹配的角色名
 * @param {Map<string, number>} exactMap - 精确匹配 Map（name -> id）
 * @param {Array<{name: string, id: number}>} charList - 角色列表（用于模糊匹配）
 * @returns {number|null} 匹配到的角色 ID
 */
function matchCharacterName(name, exactMap, charList) {
  if (!name || typeof name !== 'string') return null;
  const trimmed = name.trim();

  // 1. 精确匹配
  if (exactMap.has(trimmed)) return exactMap.get(trimmed);

  // 2. 前缀匹配
  for (const c of charList) {
    if (c.name.startsWith(trimmed)) return c.id;
  }

  // 3. 包含匹配
  for (const c of charList) {
    if (c.name.includes(trimmed)) return c.id;
  }

  return null;
}

/**
 * 为指定 scriptId 下的所有分镜建立资源关联（批量优化版）
 * 
 * @param {number} scriptId - 剧本ID
 * @param {number} projectId - 项目ID
 * @returns {Promise<{total: number, charLinked: number, sceneLinked: number, charNotFound: string[], sceneNotFound: string[]}>}
 */
async function linkAllForScript(scriptId, projectId) {
  if (!scriptId || !projectId) {
    return { total: 0, charLinked: 0, sceneLinked: 0, charNotFound: [], sceneNotFound: [] };
  }

  const startTime = Date.now();

  // 1. 预加载：查询该剧本的所有分镜
  const storyboards = await queryAll(
    'SELECT id, variables_json FROM storyboards WHERE script_id = ? ORDER BY idx',
    [scriptId]
  );

  if (storyboards.length === 0) {
    return { total: 0, charLinked: 0, sceneLinked: 0, charNotFound: [], sceneNotFound: [] };
  }

  // 2. 预加载：查询该项目的所有角色和场景（各1次查询）
  const [allCharacters, allScenes] = await Promise.all([
    queryAll('SELECT id, name FROM characters WHERE project_id = ?', [projectId]),
    queryAll('SELECT id, name FROM scenes WHERE project_id = ?', [projectId])
  ]);

  // 构建精确匹配 Map
  const charExactMap = new Map();
  for (const c of allCharacters) {
    charExactMap.set(c.name, c.id);
  }
  const sceneExactMap = new Map();
  for (const s of allScenes) {
    sceneExactMap.set(s.name, s.id);
  }

  // 3. 收集所有分镜 ID，批量清除已有关联（2次 DELETE）
  const sbIds = storyboards.map(sb => sb.id);
  await Promise.all([
    execute(`DELETE FROM storyboard_characters WHERE storyboard_id IN (${sbIds.map(() => '?').join(',')})`, sbIds),
    execute(`DELETE FROM storyboard_scenes WHERE storyboard_id IN (${sbIds.map(() => '?').join(',')})`, sbIds)
  ]);

  // 4. 在内存中计算所有关联关系
  let charLinked = 0;
  let sceneLinked = 0;
  const charNotFound = new Set();
  const sceneNotFound = new Set();
  const charLinkValues = [];  // [storyboardId, characterId] 对
  const sceneLinkValues = []; // [storyboardId, sceneId] 对

  for (const sb of storyboards) {
    let vars = {};
    try {
      vars = typeof sb.variables_json === 'string'
        ? JSON.parse(sb.variables_json)
        : sb.variables_json || {};
    } catch (e) {
      console.error('[linkAllForScript] 解析 variables_json 失败, storyboardId:', sb.id);
      continue;
    }

    // 角色关联 - 内存匹配
    const charNames = vars.characters || [];
    for (const name of charNames) {
      // 集体词/群体名（如"西汉边军"、"村民"、"一群士兵"）不参与关联，也不计入 notFound
      if (isNonCharacterEntity(name)) {
        continue;
      }
      const charId = matchCharacterName(name, charExactMap, allCharacters);
      if (charId) {
        charLinkValues.push([sb.id, charId]);
        charLinked++;
      } else {
        charNotFound.add(name);
      }
    }

    // 场景关联 - 内存匹配
    const location = vars.location || '';
    if (location) {
      const sceneId = sceneExactMap.get(location.trim());
      if (sceneId) {
        sceneLinkValues.push([sb.id, sceneId]);
        sceneLinked++;
      } else {
        sceneNotFound.add(location);
      }
    }
  }

  // 5. 批量写入关联（最多2次 INSERT）
  if (charLinkValues.length > 0) {
    await execute(
      'INSERT IGNORE INTO storyboard_characters (storyboard_id, character_id) VALUES ?',
      [charLinkValues]
    );
  }

  if (sceneLinkValues.length > 0) {
    await execute(
      'INSERT IGNORE INTO storyboard_scenes (storyboard_id, scene_id) VALUES ?',
      [sceneLinkValues]
    );
  }

  const elapsed = Date.now() - startTime;
  console.log(`[linkAllForScript] scriptId=${scriptId}: ${storyboards.length} 个分镜, 角色关联=${charLinked}, 场景关联=${sceneLinked}, 耗时=${elapsed}ms`);
  if (charNotFound.size > 0) {
    console.log(`[linkAllForScript] 未匹配角色: ${[...charNotFound].join(', ')}`);
  }
  if (sceneNotFound.size > 0) {
    console.log(`[linkAllForScript] 未匹配场景: ${[...sceneNotFound].join(', ')}`);
  }

  return {
    total: storyboards.length,
    charLinked,
    sceneLinked,
    charNotFound: [...charNotFound],
    sceneNotFound: [...sceneNotFound]
  };
}

module.exports = { linkAllForScript };
