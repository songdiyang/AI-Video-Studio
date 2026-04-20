/**
 * DELETE /api/scripts/:id/episode
 * 删除某集剧本及其所有关联数据
 * 
 * 级联删除链：
 *   DELETE script → CASCADE → storyboards → CASCADE → storyboard_characters / storyboard_scenes
 *   DELETE script → SET NULL → characters.script_id / scenes.script_id（角色/场景保留）
 * 
 * 手动清理（无外键约束）：
 *   - workflow_jobs（通过 input_params.scriptId 匹配）
 *   - generation_tasks（通过 job_id 级联自动删除）
 * 
 * 流程：
 * 1. 先通过关联表查找仅被该集分镜关联的角色和场景（孤立资源）
 * 2. 清理相关的工作流任务记录
 * 3. 删除剧本（级联自动清理分镜和关联记录）
 * 4. 自动清理孤立角色和场景
 */

const { queryOne, queryAll, execute } = require('../../dbHelper');

async function deleteEpisode(req, res) {
  const userId = req.user.id;
  const scriptId = Number(req.params.id);

  if (!scriptId) {
    return res.status(400).json({ message: '缺少 scriptId' });
  }

  try {
    // 验证剧本归属
    const script = await queryOne(
      'SELECT id, project_id, episode_number FROM scripts WHERE id = ? AND user_id = ?',
      [scriptId, userId]
    );
    if (!script) {
      return res.status(404).json({ message: '剧本不存在或无权访问' });
    }

    const projectId = script.project_id;
    const episodeNumber = script.episode_number;

    // 统计分镜数（用于返回信息）
    const storyboardCount = await queryOne(
      'SELECT COUNT(*) AS cnt FROM storyboards WHERE script_id = ?',
      [scriptId]
    );

    // 1. 先查孤立资源（必须在删除前查，删除后关联记录就没了）
    let orphanCharIds = [];
    let orphanSceneIds = [];
    try {
      orphanCharIds = await findOrphanIds(projectId, scriptId, 'storyboard_characters', 'character_id');
      orphanSceneIds = await findOrphanIds(projectId, scriptId, 'storyboard_scenes', 'scene_id');
    } catch (orphanErr) {
      console.warn('[DeleteEpisode] 查询孤立资源失败（非致命）:', orphanErr.message);
    }

    // 2. 清理相关的工作流任务（workflow_jobs 没有 script_id 外键，需手动清理）
    //    generation_tasks 通过 job_id CASCADE 自动删除
    let deletedWorkflows = 0;
    try {
      const workflowResult = await execute(
        `DELETE FROM workflow_jobs 
         WHERE user_id = ? 
           AND project_id = ? 
           AND (
             JSON_EXTRACT(input_params, '$.scriptId') = ?
             OR JSON_EXTRACT(input_params, '$.scope.scriptId') = ?
           )`,
        [userId, projectId, scriptId]
      );
      deletedWorkflows = workflowResult?.affectedRows || 0;
      if (deletedWorkflows > 0) {
        console.log(`[DeleteEpisode] 清理 ${deletedWorkflows} 个相关工作流任务`);
      }
    } catch (wfErr) {
      // JSON_EXTRACT 可能因 input_params 格式问题失败，不阻断删除流程
      console.warn(`[DeleteEpisode] 清理工作流任务失败（非致命）:`, wfErr.message);
    }

    // 3. 删除剧本（级联自动删除：分镜 → 关联记录；角色/场景的 script_id 置 NULL）
    await execute('DELETE FROM scripts WHERE id = ? AND user_id = ?', [scriptId, userId]);
    console.log(`[DeleteEpisode] 已删除剧本 id=${scriptId}, 第${episodeNumber}集, 级联删除 ${storyboardCount?.cnt || 0} 个分镜`);

    // 4. 自动清理孤立角色和场景
    let deletedCharacters = 0;
    let deletedScenes = 0;
    if (orphanCharIds.length > 0) {
      const ph = orphanCharIds.map(() => '?').join(',');
      await execute(`DELETE FROM characters WHERE id IN (${ph})`, orphanCharIds);
      deletedCharacters = orphanCharIds.length;
      console.log(`[DeleteEpisode] 自动清理 ${deletedCharacters} 个孤立角色`);
    }
    if (orphanSceneIds.length > 0) {
      const ph = orphanSceneIds.map(() => '?').join(',');
      await execute(`DELETE FROM scenes WHERE id IN (${ph})`, orphanSceneIds);
      deletedScenes = orphanSceneIds.length;
      console.log(`[DeleteEpisode] 自动清理 ${deletedScenes} 个孤立场景`);
    }

    res.json({
      message: `第${episodeNumber}集已删除`,
      deletedStoryboards: storyboardCount?.cnt || 0,
      deletedWorkflows,
      deletedCharacters,
      deletedScenes
    });
  } catch (err) {
    console.error('[DeleteEpisode] 删除失败:', err);
    res.status(500).json({ message: '删除失败: ' + err.message });
  }
}

/**
 * 通用：查找仅被该集分镜关联的资源ID（通过关联表）
 * @param {string} joinTable  关联表名（storyboard_characters / storyboard_scenes）
 * @param {string} fkColumn   外键列名（character_id / scene_id）
 */
async function findOrphanIds(projectId, scriptId, joinTable, fkColumn) {
  // 该集分镜关联的资源ID
  const thisIds = await queryAll(
    `SELECT DISTINCT jt.${fkColumn} AS rid
     FROM ${joinTable} jt
     JOIN storyboards sb ON jt.storyboard_id = sb.id
     WHERE sb.script_id = ?`,
    [scriptId]
  );
  if (thisIds.length === 0) return [];

  // 其中哪些也被其他集关联
  const ids = thisIds.map(r => r.rid);
  const ph = ids.map(() => '?').join(',');
  const otherLinked = await queryAll(
    `SELECT DISTINCT jt.${fkColumn} AS rid
     FROM ${joinTable} jt
     JOIN storyboards sb ON jt.storyboard_id = sb.id
     WHERE sb.project_id = ? AND sb.script_id != ? AND jt.${fkColumn} IN (${ph})`,
    [projectId, scriptId, ...ids]
  );
  const otherSet = new Set(otherLinked.map(r => r.rid));

  return ids.filter(id => !otherSet.has(id));
}

module.exports = deleteEpisode;
