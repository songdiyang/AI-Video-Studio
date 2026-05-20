/**
 * 隐式剧本辅助函数
 * 
 * 统一剧本存储层改造后，自由分镜不再使用 script_id = NULL，
 * 而是为每个 project + episode 组合自动创建/复用隐式剧本记录。
 */

const { queryOne, execute } = require('../../dbHelper');

/**
 * 获取或创建指定项目+集数的隐式剧本
 * @param {number} projectId - 项目ID
 * @param {number} episodeNumber - 集数（默认1）
 * @param {number} userId - 用户ID
 * @returns {Promise<number>} 隐式剧本的 scriptId
 */
async function getOrCreateImplicitScript(projectId, episodeNumber, userId) {
  const ep = Number.isFinite(Number(episodeNumber)) && Number(episodeNumber) >= 1
    ? Number(episodeNumber)
    : 1;

  // 1. 检查是否已存在隐式剧本
  const existing = await queryOne(
    'SELECT id FROM scripts WHERE project_id = ? AND episode_number = ? AND is_implicit = TRUE',
    [projectId, ep]
  );

  if (existing) {
    return existing.id;
  }

  // 2. 获取项目信息用于创建剧本
  let effectiveUserId = userId;
  if (!effectiveUserId) {
    const project = await queryOne(
      'SELECT user_id FROM projects WHERE id = ?',
      [projectId]
    );
    if (!project) {
      throw new Error(`项目 ${projectId} 不存在`);
    }
    effectiveUserId = project.user_id;
  }

  // 3. 创建隐式剧本记录
  const result = await execute(
    `INSERT INTO scripts 
     (user_id, project_id, episode_number, title, content, is_implicit, source_type, status) 
     VALUES (?, ?, ?, ?, ?, TRUE, 'implicit', 'completed')`,
    [effectiveUserId, projectId, ep, `第${ep}集`, '']
  );

  console.log(`[ImplicitScript] 创建隐式剧本: project=${projectId}, ep=${ep}, scriptId=${result.insertId}`);
  return result.insertId;
}

/**
 * 查询指定项目+集数的隐式剧本（不创建）
 * @param {number} projectId - 项目ID
 * @param {number} episodeNumber - 集数
 * @returns {Promise<{id: number}|null>} 隐式剧本记录或 null
 */
async function findImplicitScript(projectId, episodeNumber) {
  const ep = Number.isFinite(Number(episodeNumber)) && Number(episodeNumber) >= 1
    ? Number(episodeNumber)
    : 1;

  return await queryOne(
    'SELECT id FROM scripts WHERE project_id = ? AND episode_number = ? AND is_implicit = TRUE',
    [projectId, ep]
  );
}

module.exports = {
  getOrCreateImplicitScript,
  findImplicitScript
};
