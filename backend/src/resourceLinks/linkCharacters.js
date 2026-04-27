/**
 * 分镜-角色关联写入
 * 
 * 根据分镜中的角色名字列表，匹配 characters 表，写入 storyboard_characters 关联表
 */

const { queryOne, queryAll, execute } = require('../dbHelper');

/**
 * 检查角色白膜是否就绪
 * 返回布尔值：存在 is_base_model=1 且 front_view_url 非空的状态
 */
async function isBaseModelReady(characterId) {
  const row = await queryOne(
    `SELECT 1 FROM character_states
     WHERE character_id = ? AND is_base_model = 1 AND front_view_url IS NOT NULL AND front_view_url <> ''
     LIMIT 1`,
    [characterId]
  );
  return !!row;
}

/**
 * 为单个分镜建立角色关联
 * 
 * @param {number} storyboardId - 分镜ID
 * @param {string[]} characterNames - 角色名字数组（来自 variables_json.characters）
 * @param {number} projectId - 项目ID（用于在 characters 表中匹配）
 * @param {object} [options]
 * @param {boolean} [options.clearExisting=true] - 是否先清除已有关联
 * @returns {Promise<{linked: number, notFound: string[], skippedNoBase: string[]}>}
 */
async function linkStoryboardCharacters(storyboardId, characterNames, projectId, options = {}) {
  const { clearExisting = true } = options;

  if (!storyboardId || !projectId || !Array.isArray(characterNames) || characterNames.length === 0) {
    return { linked: 0, notFound: [], skippedNoBase: [] };
  }

  // 清除已有关联
  if (clearExisting) {
    await execute('DELETE FROM storyboard_characters WHERE storyboard_id = ?', [storyboardId]);
  }

  let linked = 0;
  const notFound = [];
  const skippedNoBase = [];

  for (const name of characterNames) {
    if (!name || typeof name !== 'string') continue;

    const trimmedName = name.trim();
    
    // 1. 先尝试精确匹配
    let character = await queryOne(
      'SELECT id FROM characters WHERE project_id = ? AND name = ?',
      [projectId, trimmedName]
    );

    // 2. 精确匹配失败，尝试前缀匹配（如"男生"匹配"男生（感染者）"）
    if (!character) {
      character = await queryOne(
        'SELECT id FROM characters WHERE project_id = ? AND name LIKE ?',
        [projectId, trimmedName + '%']
      );
    }

    // 3. 前缀匹配失败，尝试包含匹配
    if (!character) {
      character = await queryOne(
        'SELECT id FROM characters WHERE project_id = ? AND name LIKE ?',
        [projectId, '%' + trimmedName + '%']
      );
    }

    if (character) {
      // 硬强制：白膜未就绪的角色不允许用于分镜生成
      const ready = await isBaseModelReady(character.id);
      if (!ready) {
        skippedNoBase.push(name);
        console.warn(`[linkCharacters] 角色 ${name}(id=${character.id}) 白膜未就绪，跳过分镜关联`);
        continue;
      }
      try {
        await execute(
          'INSERT IGNORE INTO storyboard_characters (storyboard_id, character_id) VALUES (?, ?)',
          [storyboardId, character.id]
        );
        linked++;
      } catch (err) {
        // UNIQUE 冲突忽略
        if (!err.message.includes('Duplicate')) {
          console.error('[linkCharacters] 写入关联失败:', err.message);
        }
      }
    } else {
      notFound.push(name);
    }
  }

  return { linked, notFound, skippedNoBase };
}

module.exports = { linkStoryboardCharacters, isBaseModelReady };
