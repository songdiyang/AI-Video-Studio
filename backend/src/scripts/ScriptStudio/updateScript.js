/**
 * PUT /api/scripts/:id
 * 更新剧本
 */

const { queryOne, execute } = require('../../dbHelper');
const ragService = require('../../services/ragService');

async function updateScript(req, res) {
  const userId = req.user.id;
  const { id } = req.params;
  const { title, content } = req.body;

  // 剧本内容允许为空
  const scriptContent = content || '';

  try {
    // 验证剧本归属并获取完整信息
    const script = await queryOne('SELECT id, project_id, episode_number FROM scripts WHERE id = ? AND user_id = ?', [id, userId]);
    if (!script) {
      return res.status(404).json({ message: '剧本不存在或无权访问' });
    }

    // 更新剧本
    await execute(
      'UPDATE scripts SET title = ?, content = ? WHERE id = ? AND user_id = ?',
      [title || null, scriptContent, id, userId]
    );

    // 异步更新 RAG 索引（不阻塞响应）
    if (script.project_id && scriptContent.trim()) {
      ragService.indexScript({
        id: script.id,
        project_id: script.project_id,
        episode_number: script.episode_number,
        title: title || `第${script.episode_number}集`,
        content: scriptContent,
      }).catch(err => {
        console.error('[Update Script] RAG 索引失败:', err);
      });
    }

    return res.json({ message: '剧本保存成功' });
  } catch (err) {
    console.error('DB error updating script:', err);
    return res.status(500).json({ message: '保存剧本失败' });
  }
}

module.exports = updateScript;
