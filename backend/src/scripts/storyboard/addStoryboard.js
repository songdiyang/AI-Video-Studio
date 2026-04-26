/**
 * POST /api/storyboards/add
 * 手动添加单个分镜，返回真实 DB ID
 *
 * 支持两种模式：
 *  1) 绑定剧本：入参带 scriptId（沿用旧行为），project_id 由剧本推导
 *  2) 自由分镜：入参仅带 projectId，script_id 写入 NULL
 */

const { queryOne, execute } = require('../../dbHelper');
const { getEffectiveProjectRole } = require('../../middleware/collaborationAuth');

async function addStoryboard(req, res) {
  const userId = req.user.id;
  const { scriptId, projectId, idx, description, prompt_template, variables_json } = req.body || {};

  if (!scriptId && !projectId) {
    return res.status(400).json({ message: '缺少 scriptId 或 projectId' });
  }

  try {
    let finalProjectId;
    let finalScriptId = null;

    if (scriptId) {
      // 绑定剧本模式：通过剧本推导 project_id，并校验权限
      const script = await queryOne(
        'SELECT id, project_id FROM scripts WHERE id = ?',
        [scriptId]
      );
      if (!script) {
        return res.status(404).json({ message: '剧本不存在' });
      }
      const role = await getEffectiveProjectRole(userId, script.project_id);
      if (!role) {
        return res.status(403).json({ message: '无权访问该项目' });
      }
      finalProjectId = script.project_id;
      finalScriptId = scriptId;
    } else {
      // 自由分镜模式：校验用户对 projectId 的权限
      const role = await getEffectiveProjectRole(userId, projectId);
      if (!role) {
        return res.status(403).json({ message: '无权访问该项目' });
      }
      finalProjectId = Number(projectId);
    }

    const result = await execute(
      'INSERT INTO storyboards (project_id, script_id, idx, description, prompt_template, variables_json) VALUES (?, ?, ?, ?, ?, ?)',
      [finalProjectId, finalScriptId, idx || 0, description || prompt_template || '', '', JSON.stringify(variables_json || {})]
    );

    const id = result.insertId;
    console.log(`[AddStoryboard] 新增分镜 id=${id}, projectId=${finalProjectId}, scriptId=${finalScriptId || 'NULL'}, idx=${idx}`);

    res.json({ id, message: '分镜已添加' });
  } catch (err) {
    console.error('[AddStoryboard] 添加失败:', err);
    res.status(500).json({ message: '添加分镜失败' });
  }
}

module.exports = addStoryboard;
