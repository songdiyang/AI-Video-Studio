/**
 * POST /api/scripts/create
 * 手动创建剧本（非 AI 生成）
 */

const { queryOne, execute } = require('../../dbHelper');

async function createScript(req, res) {
  const { projectId, title, content, episodeNumber } = req.body || {};
  const userId = req.user.id;

  // projectId 可选：不传则创建"个人剧本"（project_id = NULL，存于资源库）
  if (!content || !content.trim()) {
    return res.status(400).json({ message: '剧本内容不能为空' });
  }

  try {
    // 仅在指定 projectId 时验证项目归属
    if (projectId) {
      const project = await queryOne('SELECT id FROM projects WHERE id = ? AND user_id = ?', [projectId, userId]);
      if (!project) {
        return res.status(404).json({ message: '项目不存在或无权访问' });
      }
    }

    // 确定集数（仅项目剧本需要判重；个人剧本 episode_number 可自由取值）
    let targetEpisode = episodeNumber;
    if (!targetEpisode) {
      if (projectId) {
        const lastEpisode = await queryOne(
          'SELECT MAX(episode_number) as max_ep FROM scripts WHERE project_id = ?',
          [projectId]
        );
        targetEpisode = (lastEpisode?.max_ep || 0) + 1;
      } else {
        targetEpisode = 1;
      }
    }

    // 仅项目剧本需要检查该集是否已存在（个人剧本已无联合唯一约束）
    if (projectId) {
      const existing = await queryOne(
        'SELECT id FROM scripts WHERE project_id = ? AND episode_number = ?',
        [projectId, targetEpisode]
      );
      if (existing) {
        return res.status(400).json({ message: `第${targetEpisode}集已存在，请编辑或删除后重试` });
      }
    }

    // 插入剧本记录（projectId 为 undefined/null 时作为个人剧本存储）
    const result = await execute(
      'INSERT INTO scripts (user_id, project_id, episode_number, title, content, status, model_provider, token_used) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [userId, projectId || null, targetEpisode, title || `第${targetEpisode}集`, content, 'completed', 'manual', 0]
    );
    const scriptId = result.insertId;

    res.json({
      success: true,
      scriptId,
      projectId: projectId || null,
      episodeNumber: targetEpisode,
      message: projectId
        ? `第${targetEpisode}集剧本保存成功`
        : `已保存到个人剧本库`
    });
  } catch (error) {
    console.error('[Create Script]', error);
    res.status(500).json({ message: '创建剧本失败：' + error.message });
  }
}

module.exports = createScript;
