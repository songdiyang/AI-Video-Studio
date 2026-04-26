/**
 * POST /api/scripts/bind
 * 将个人剧本（或任意自己拥有的剧本）深拷贝到目标项目。
 *
 * 语义：
 *   - 一旦拷贝完成，副本与原始剧本完全独立（各自编辑互不影响）
 *   - 副本的 source_script_id 记录原始 ID，仅原作者能看到"源自 XX"
 *   - 团队项目里其他协作者看到的就是一份独立的项目剧本
 *
 * 请求体：
 *   {
 *     sourceScriptId: number,   // 要拷贝的剧本 ID（必须属于当前用户）
 *     targetProjectId: number,  // 目标项目 ID（必须属于当前用户）
 *     episodeNumber?: number,   // 可选；默认取目标项目 MAX(episode_number)+1
 *     titleOverride?: string    // 可选；副本标题覆盖
 *   }
 */

const { queryOne, execute } = require('../../dbHelper');

async function bindScriptToProject(req, res) {
  const userId = req.user.id;
  const { sourceScriptId, targetProjectId, episodeNumber, titleOverride, bindAll, siblingIds } = req.body || {};

  if (!sourceScriptId || !targetProjectId) {
    return res.status(400).json({ message: '缺少 sourceScriptId 或 targetProjectId' });
  }

  try {
    // 1. 确定要拷贝的剧本 ID 列表
    const copyIds = [sourceScriptId];
    if (bindAll && Array.isArray(siblingIds) && siblingIds.length > 0) {
      for (const sid of siblingIds) {
        if (typeof sid === 'number' && sid > 0 && !copyIds.includes(sid)) {
          copyIds.push(sid);
        }
      }
    }

    // 2. 验证所有源剧本归属
    const sources = [];
    for (const cid of copyIds) {
      const source = await queryOne(
        `SELECT id, user_id, title, content, episode_number, model_provider, token_used, status
           FROM scripts WHERE id = ?`,
        [cid]
      );
      if (!source) {
        return res.status(404).json({ message: `剧本 ${cid} 不存在` });
      }
      if (source.user_id !== userId) {
        return res.status(403).json({ message: `无权访问剧本 ${cid}` });
      }
      sources.push(source);
    }

    // 3. 验证目标项目归属
    const project = await queryOne(
      'SELECT id FROM projects WHERE id = ? AND user_id = ?',
      [targetProjectId, userId]
    );
    if (!project) {
      return res.status(404).json({ message: '目标项目不存在或无权访问' });
    }

    // 4. 计算起始 episode_number
    const row = await queryOne(
      'SELECT MAX(episode_number) AS max_ep FROM scripts WHERE project_id = ?',
      [targetProjectId]
    );
    let baseEpisode = (row?.max_ep || 0) + 1;

    // 5. 逐个深拷贝
    const insertedIds = [];
    for (const source of sources) {
      const epNumber = bindAll ? baseEpisode++ : (Number(episodeNumber) > 0 ? Number(episodeNumber) : baseEpisode++);
      
      const finalTitle = titleOverride && titleOverride.trim()
        ? titleOverride.trim()
        : (source.title || `第${epNumber}集`);

      const result = await execute(
        `INSERT INTO scripts
           (user_id, project_id, source_script_id, episode_number, title, content,
            status, model_provider, token_used)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          userId,
          targetProjectId,
          sourceScriptId,
          epNumber,
          finalTitle,
          source.content || '',
          source.status || 'completed',
          source.model_provider || 'bind-copy',
          source.token_used || 0,
        ]
      );
      insertedIds.push(result.insertId);
    }

    return res.json({
      success: true,
      scriptIds: insertedIds,
      projectId: targetProjectId,
      episodeStart: bindAll ? (row?.max_ep || 0) + 1 : Number(episodeNumber) || (row?.max_ep || 0) + 1,
      sourceScriptId,
      message: bindAll
        ? `已将 ${sources.length} 集剧本复制到项目`
        : `已将剧本复制到项目`,
    });
  } catch (err) {
    console.error('[BindScript] 绑定失败:', err);
    return res.status(500).json({ message: '绑定剧本到项目失败：' + err.message });
  }
}

module.exports = bindScriptToProject;
