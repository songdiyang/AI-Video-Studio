/**
 * GET /api/scripts/
 * 获取所有剧本（保留原接口）
 */

const { queryAll } = require('../../dbHelper');

async function getAllScripts(req, res) {
  const userId = req.user.id;
  try {
    const rows = await queryAll(
      `SELECT id, title, content, project_id, source_script_id, episode_number,
              status, model_provider, token_used, created_at, updated_at
         FROM scripts
        WHERE user_id = ?
        ORDER BY updated_at DESC, created_at DESC`,
      [userId]
    );
    return res.json(rows);
  } catch (err) {
    console.error('DB error fetching scripts:', err);
    return res.status(500).json({ message: 'Failed to fetch scripts' });
  }
}

module.exports = getAllScripts;
