/**
 * PATCH /api/scripts/:id/status
 * 更新剧本状态（用于前端回滚 generating → draft）
 */

const { queryOne, execute } = require('../../dbHelper');

const VALID_STATUSES = ['draft', 'generating', 'completed'];

async function updateScriptStatus(req, res) {
  const userId = req.user.id;
  const scriptId = Number(req.params.id);
  const { status } = req.body;

  if (!scriptId) {
    return res.status(400).json({ message: '缺少 scriptId' });
  }

  if (!status || !VALID_STATUSES.includes(status)) {
    return res.status(400).json({ message: `无效的状态值，允许: ${VALID_STATUSES.join('/')}` });
  }

  try {
    // 验证剧本归属
    const script = await queryOne('SELECT id, status FROM scripts WHERE id = ? AND user_id = ?', [scriptId, userId]);
    if (!script) {
      return res.status(404).json({ message: '剧本不存在或无权访问' });
    }

    // 只允许从 generating 回滚到 draft（防止非法状态变更）
    if (status === 'draft' && script.status !== 'generating') {
      return res.status(400).json({ message: `只能从 generating 状态回滚到 draft，当前状态: ${script.status}` });
    }

    await execute('UPDATE scripts SET status = ? WHERE id = ? AND user_id = ?', [status, scriptId, userId]);

    console.log(`[UpdateScriptStatus] 剧本 id=${scriptId} 状态从 ${script.status} 变更为 ${status}`);
    return res.json({ message: '状态更新成功', status });
  } catch (err) {
    console.error('[UpdateScriptStatus] 更新失败:', err);
    return res.status(500).json({ message: '状态更新失败: ' + err.message });
  }
}

module.exports = updateScriptStatus;
