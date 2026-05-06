/**
 * 分镜-场景关联写入
 * 
 * 根据分镜中的场景名字（location），匹配 scenes 表，写入 storyboard_scenes 关联表
 */

const { queryOne, execute } = require('../dbHelper');

/**
 * 为单个分镜建立场景关联
 * 
 * @param {number} storyboardId - 分镜ID
 * @param {string} locationName - 场景名字（来自 variables_json.location）
 * @param {number} projectId - 项目ID（用于在 scenes 表中匹配）
 * @param {object} [options]
 * @param {boolean} [options.clearExisting=true] - 是否先清除已有关联
 * @returns {Promise<{linked: boolean, notFound: boolean}>}
 */
async function linkStoryboardScenes(storyboardId, locationName, projectId, options = {}) {
  const { clearExisting = true } = options;

  if (!storyboardId || !projectId || !locationName || typeof locationName !== 'string') {
    return { linked: false, notFound: false };
  }

  // 清除已有关联
  if (clearExisting) {
    await execute('DELETE FROM storyboard_scenes WHERE storyboard_id = ?', [storyboardId]);
  }

  const [scene, studio] = await Promise.all([
    queryOne(
      'SELECT id FROM scenes WHERE project_id = ? AND name = ?',
      [projectId, locationName.trim()]
    ),
    queryOne(
      'SELECT id FROM studios WHERE project_id = ? AND name = ?',
      [projectId, locationName.trim()]
    )
  ]);

  if (scene) {
    try {
      await execute(
        'INSERT IGNORE INTO storyboard_scenes (storyboard_id, scene_id, studio_id) VALUES (?, ?, ?)',
        [storyboardId, scene.id, studio ? studio.id : null]
      );
      return { linked: true, notFound: false };
    } catch (err) {
      if (!err.message.includes('Duplicate')) {
        console.error('[linkScenes] 写入关联失败:', err.message);
      }
      return { linked: false, notFound: false };
    }
  }

  return { linked: false, notFound: true };
}

module.exports = { linkStoryboardScenes };
