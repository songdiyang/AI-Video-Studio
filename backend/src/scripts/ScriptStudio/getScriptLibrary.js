/**
 * GET /api/scripts/library
 * 获取当前用户的完整剧本库（个人剧本 + 所有项目剧本）
 *
 * 与 /api/scripts（getAllScripts）的区别：
 * - library 返回更完整的字段：project_id / source_script_id / episode_number / status
 * - 专供 AssetsManager 的"剧本" Tab 与 EpisodeSelector 的资源池视图使用
 *
 * 可选 query 参数：
 *   - scope=personal  只返回个人剧本（project_id IS NULL）
 *   - scope=project   只返回绑定项目的剧本（project_id 非空）
 *   - scope=all       返回全部（默认）
 */

const { queryAll } = require('../../dbHelper');

async function getScriptLibrary(req, res) {
  const userId = req.user.id;
  const scope = (req.query.scope || 'all').toString();

  let whereClause = 'WHERE s.user_id = ? AND s.is_implicit = FALSE';
  const params = [userId];

  if (scope === 'personal') {
    whereClause += ' AND s.project_id IS NULL';
  } else if (scope === 'project') {
    whereClause += ' AND s.project_id IS NOT NULL';
  }

  try {
    const rows = await queryAll(
      `SELECT
         s.id,
         s.user_id,
         s.project_id,
         s.source_script_id,
         s.episode_number,
         s.title,
         s.content,
         s.status,
         s.model_provider,
         s.token_used,
         s.created_at,
         s.updated_at,
         p.name AS project_name
       FROM scripts s
       LEFT JOIN projects p ON p.id = s.project_id
       ${whereClause}
       ORDER BY s.updated_at DESC, s.id DESC`,
      params
    );
    return res.json(rows);
  } catch (err) {
    console.error('[ScriptLibrary] 获取剧本库失败:', err);
    return res.status(500).json({ message: '获取剧本库失败' });
  }
}

module.exports = getScriptLibrary;
