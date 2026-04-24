/**
 * POST /api/storyboards/add
 * 手动添加单个分镜，返回真实 DB ID
 */

const { queryOne, execute } = require('../../dbHelper');

async function addStoryboard(req, res) {
  const userId = req.user.id;
  const { scriptId, idx, description, prompt_template, variables_json } = req.body || {};

  if (!scriptId) {
    return res.status(400).json({ message: '缺少 scriptId' });
  }

  try {
    const script = await queryOne(
      'SELECT id, project_id FROM scripts WHERE id = ? AND user_id = ?',
      [scriptId, userId]
    );
    if (!script) {
      return res.status(404).json({ message: '剧本不存在或无权限' });
    }

    const result = await execute(
      'INSERT INTO storyboards (project_id, script_id, idx, description, prompt_template, variables_json) VALUES (?, ?, ?, ?, ?, ?)',
      [script.project_id, scriptId, idx || 0, description || prompt_template || '', '', JSON.stringify(variables_json || {})]
    );

    const id = result.insertId;
    console.log(`[AddStoryboard] 新增分镜 id=${id}, scriptId=${scriptId}, idx=${idx}`);

    res.json({ id, message: '分镜已添加' });
  } catch (err) {
    console.error('[AddStoryboard] 添加失败:', err);
    res.status(500).json({ message: '添加分镜失败' });
  }
}

module.exports = addStoryboard;
