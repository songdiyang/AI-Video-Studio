/**
 * 单分镜独立关联模块 - 场景和人物分开处理
 * 
 * 核心特性：
 *   1. 支持单个分镜独立关联，不影响其他分镜
 *   2. 场景和人物关联完全独立，可分别调用
 *   3. 支持并发批量关联多个分镜
 */

const { queryOne, queryAll, execute } = require('../db');

/**
 * 为单个分镜独立关联角色
 * @param {number} storyboardId - 分镜ID
 * @param {number} projectId - 项目ID
 * @param {Object} options - 选项
 * @param {boolean} options.clearExisting - 是否清除已有关联，默认 true
 * @returns {Promise<{linked: number, notFound: string[]}>}
 */
async function linkCharactersForStoryboard(storyboardId, projectId, options = {}) {
  const { clearExisting = true, characterIds = [] } = options;

  // 清除已有角色关联
  if (clearExisting) {
    await execute('DELETE FROM storyboard_characters WHERE storyboard_id = ?', [storyboardId]);
  }

  let linked = 0;
  const notFound = [];

  // 优先模式：如果前端提供了 characterIds，直接使用 ID 创建关联（最可靠）
  if (characterIds && characterIds.length > 0) {
    for (const charId of characterIds) {
      if (!charId || typeof charId !== 'number') continue;
      try {
        await execute(
          'INSERT IGNORE INTO storyboard_characters (storyboard_id, character_id) VALUES (?, ?)',
          [storyboardId, charId]
        );
        linked++;
      } catch (err) {
        if (!err.message.includes('Duplicate')) {
          console.error('[linkCharactersForStoryboard] 直接ID写入关联失败:', err.message);
        }
      }
    }
    console.log(`[linkCharactersForStoryboard] storyboardId=${storyboardId}: 通过ID直接关联${linked}个角色`);
    return { linked, notFound };
  }

  // 降级模式：通过名称匹配（兼容批量生成等无ID的场景）
  const storyboard = await queryOne(
    'SELECT variables_json FROM storyboards WHERE id = ?',
    [storyboardId]
  );
  if (!storyboard) {
    return { linked: 0, notFound: [], error: '分镜不存在' };
  }

  let vars = {};
  try {
    vars = typeof storyboard.variables_json === 'string'
      ? JSON.parse(storyboard.variables_json || '{}')
      : (storyboard.variables_json || {});
  } catch (e) {
    return { linked: 0, notFound: [], error: '解析 variables_json 失败' };
  }

  const characterNames = vars.characters || [];
  if (characterNames.length === 0) {
    return { linked: 0, notFound: [] };
  }

  for (const name of characterNames) {
    if (!name || typeof name !== 'string') continue;

    const trimmedName = name.trim();
    
    // 三级匹配策略：精确 → 前缀 → 包含
    let character = await queryOne(
      'SELECT id, name FROM characters WHERE project_id = ? AND name = ?',
      [projectId, trimmedName]
    );

    if (!character) {
      character = await queryOne(
        'SELECT id, name FROM characters WHERE project_id = ? AND name LIKE ?',
        [projectId, trimmedName + '%']
      );
    }

    if (!character) {
      character = await queryOne(
        'SELECT id, name FROM characters WHERE project_id = ? AND name LIKE ?',
        [projectId, '%' + trimmedName + '%']
      );
    }

    if (character) {
      try {
        await execute(
          'INSERT IGNORE INTO storyboard_characters (storyboard_id, character_id) VALUES (?, ?)',
          [storyboardId, character.id]
        );
        linked++;
      } catch (err) {
        if (!err.message.includes('Duplicate')) {
          console.error('[linkCharactersForStoryboard] 写入关联失败:', err.message);
        }
      }
    } else {
      notFound.push(name);
    }
  }

  console.log(`[linkCharactersForStoryboard] storyboardId=${storyboardId}: 通过名称关联${linked}个角色, 未找到${notFound.length}个`);
  return { linked, notFound };
}

/**
 * 为单个分镜独立关联场景
 * @param {number} storyboardId - 分镜ID
 * @param {number} projectId - 项目ID
 * @param {Object} options - 选项
 * @param {boolean} options.clearExisting - 是否清除已有关联，默认 true
 * @returns {Promise<{linked: boolean, notFound: boolean}>}
 */
async function linkScenesForStoryboard(storyboardId, projectId, options = {}) {
  const { clearExisting = true, sceneId = null } = options;

  // 清除已有场景关联
  if (clearExisting) {
    await execute('DELETE FROM storyboard_scenes WHERE storyboard_id = ?', [storyboardId]);
  }

  // 优先模式：直接使用 sceneId 创建关联（同时查 studio）
  if (sceneId && typeof sceneId === 'number') {
    // 通过场景名反查同名影棚
    const sceneRow = await queryOne('SELECT name FROM scenes WHERE id = ?', [sceneId]);
    let studioId = null;
    if (sceneRow && sceneRow.name) {
      const studioRow = await queryOne('SELECT id FROM studios WHERE project_id = ? AND name = ?', [projectId, sceneRow.name]);
      if (studioRow) studioId = studioRow.id;
    }
    try {
      await execute(
        'INSERT IGNORE INTO storyboard_scenes (storyboard_id, scene_id, studio_id) VALUES (?, ?, ?)',
        [storyboardId, sceneId, studioId]
      );
      console.log(`[linkScenesForStoryboard] storyboardId=${storyboardId}: 通过ID直接关联场景(sceneId=${sceneId})`);
      return { linked: true, notFound: false };
    } catch (err) {
      if (!err.message.includes('Duplicate')) {
        console.error('[linkScenesForStoryboard] 直接ID写入关联失败:', err.message);
      }
      return { linked: false, notFound: false };
    }
  }

  // 降级模式：通过名称匹配
  const storyboard = await queryOne(
    'SELECT variables_json FROM storyboards WHERE id = ?',
    [storyboardId]
  );
  if (!storyboard) {
    return { linked: false, notFound: false, error: '分镜不存在' };
  }

  let vars = {};
  try {
    vars = typeof storyboard.variables_json === 'string'
      ? JSON.parse(storyboard.variables_json || '{}')
      : (storyboard.variables_json || {});
  } catch (e) {
    return { linked: false, notFound: false, error: '解析 variables_json 失败' };
  }

  const location = vars.location || '';
  if (!location) {
    return { linked: false, notFound: false };
  }

  const [scene, studio] = await Promise.all([
    queryOne(
      'SELECT id, name FROM scenes WHERE project_id = ? AND name = ?',
      [projectId, location.trim()]
    ),
    queryOne(
      'SELECT id FROM studios WHERE project_id = ? AND name = ?',
      [projectId, location.trim()]
    )
  ]);

  if (scene) {
    try {
      await execute(
        'INSERT IGNORE INTO storyboard_scenes (storyboard_id, scene_id, studio_id) VALUES (?, ?, ?)',
        [storyboardId, scene.id, studio ? studio.id : null]
      );
      console.log(`[linkScenesForStoryboard] storyboardId=${storyboardId}: 通过名称关联场景「${scene.name}」`);
      return { linked: true, notFound: false };
    } catch (err) {
      if (!err.message.includes('Duplicate')) {
        console.error('[linkScenesForStoryboard] 写入关联失败:', err.message);
      }
      return { linked: false, notFound: false };
    }
  }

  console.log(`[linkScenesForStoryboard] storyboardId=${storyboardId}: 场景「${location}」未找到`);
  return { linked: false, notFound: true };
}

/**
 * 为单个分镜独立关联所有资源（角色+场景）
 * @param {number} storyboardId - 分镜ID
 * @param {number} projectId - 项目ID
 * @param {Object} options - 选项
 * @returns {Promise<{characters: {linked, notFound}, scenes: {linked, notFound}}>}
 */
async function linkSingleStoryboard(storyboardId, projectId, options = {}) {
  const [charResult, sceneResult] = await Promise.all([
    linkCharactersForStoryboard(storyboardId, projectId, options),
    linkScenesForStoryboard(storyboardId, projectId, options)
  ]);

  return {
    storyboardId,
    characters: charResult,
    scenes: sceneResult
  };
}

/**
 * 并发关联多个分镜的资源
 * @param {number[]} storyboardIds - 分镜ID列表
 * @param {number} projectId - 项目ID
 * @param {Object} options - 选项
 * @param {number} options.maxConcurrency - 最大并发数，默认 10
 * @returns {Promise<{total, success, failed, results[]}>}
 */
async function linkStoryboardsParallel(storyboardIds, projectId, options = {}) {
  const { maxConcurrency = 10, ...linkOptions } = options;

  if (!storyboardIds || storyboardIds.length === 0) {
    return { total: 0, success: 0, failed: 0, results: [] };
  }

  const total = storyboardIds.length;
  let success = 0;
  let failed = 0;
  const results = [];

  // 分批并发处理
  for (let i = 0; i < storyboardIds.length; i += maxConcurrency) {
    const batch = storyboardIds.slice(i, i + maxConcurrency);
    const batchResults = await Promise.all(
      batch.map(async (sbId) => {
        try {
          const result = await linkSingleStoryboard(sbId, projectId, linkOptions);
          success++;
          return { storyboardId: sbId, status: 'success', ...result };
        } catch (err) {
          failed++;
          console.error(`[linkStoryboardsParallel] 分镜 ${sbId} 关联失败:`, err.message);
          return { storyboardId: sbId, status: 'failed', error: err.message };
        }
      })
    );
    results.push(...batchResults);
  }

  console.log(`[linkStoryboardsParallel] 完成: 总计=${total}, 成功=${success}, 失败=${failed}`);
  return { total, success, failed, results };
}

/**
 * 为剧本下所有分镜并发关联资源
 * @param {number} scriptId - 剧本ID
 * @param {number} projectId - 项目ID
 * @param {Object} options - 选项
 * @returns {Promise<{total, success, failed, results[]}>}
 */
async function linkAllForScriptParallel(scriptId, projectId, options = {}) {
  const storyboards = await queryAll(
    'SELECT id FROM storyboards WHERE script_id = ? ORDER BY idx',
    [scriptId]
  );

  const storyboardIds = storyboards.map(sb => sb.id);
  return linkStoryboardsParallel(storyboardIds, projectId, options);
}

module.exports = {
  linkCharactersForStoryboard,
  linkScenesForStoryboard,
  linkSingleStoryboard,
  linkStoryboardsParallel,
  linkAllForScriptParallel
};
