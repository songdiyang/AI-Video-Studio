/**
 * GET /api/scripts/project/:projectId/episode/:episodeNumber
 * 获取指定集的剧本
 */

const { queryOne } = require('../../dbHelper');
const { getEffectiveProjectRole } = require('../../middleware/collaborationAuth');

async function getEpisode(req, res) {
  const userId = req.user.id;
  const { projectId, episodeNumber } = req.params;

  if (!projectId || !episodeNumber) {
    return res.status(400).json({ message: '缺少必要参数 projectId 或 episodeNumber' });
  }

  try {
    // 协作鉴权：支持团队项目成员访问
    const role = await getEffectiveProjectRole(userId, projectId);
    if (!role) {
      return res.status(404).json({ message: '项目不存在或无权访问' });
    }

    const script = await queryOne(
      `SELECT id, episode_number, title, content, model_provider, token_used, status, created_at, updated_at 
       FROM scripts WHERE project_id = ? AND episode_number = ?`,
      [projectId, episodeNumber]
    );

    // 即使 script 为 null 也返回 200（表示该集不存在，前端可正常处理）
    return res.json({ script: script || null });
  } catch (err) {
    console.error('[getEpisode] DB error:', { projectId, episodeNumber, userId, error: err.message });
    return res.status(500).json({ message: '获取剧本失败：' + err.message });
  }
}

module.exports = getEpisode;
