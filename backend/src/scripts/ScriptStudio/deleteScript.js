/**
 * DELETE /api/scripts/:id
 * 删除剧本
 */

const { queryOne, execute } = require('../../dbHelper');
const ragService = require('../../services/ragService');

async function deleteScript(req, res) {
  const userId = req.user.id;
  const { id } = req.params;

  try {
    // 验证剧本归属
    const script = await queryOne('SELECT id FROM scripts WHERE id = ? AND user_id = ?', [id, userId]);
    if (!script) {
      return res.status(404).json({ message: '剧本不存在或无权访问' });
    }

    // 删除剧本
    await execute('DELETE FROM scripts WHERE id = ? AND user_id = ?', [id, userId]);

    // 异步删除 RAG 索引（不阻塞响应）
    ragService.deleteScriptIndex(script.id).catch(err => {
      console.error('[Delete Script] RAG 索引删除失败:', err);
    });

    return res.json({ message: '剧本删除成功' });
  } catch (err) {
    console.error('DB error deleting script:', err);
    return res.status(500).json({ message: '删除剧本失败' });
  }
}

module.exports = deleteScript;
