/**
 * PATCH /api/storyboards/reorder
 * 批量更新分镜顺序（仅修改 idx，不影响其他字段）
 *
 * 统一存储层后，所有分镜都通过 scriptId 定位：
 *  1) 剧集分镜：body: { scriptId: number, order: [{ id, idx }] }
 *  2) 自由分镜：body: { scriptId: number, order: [{ id, idx }] }（隐式剧本的 scriptId）
 */

const { queryOne, execute } = require('../../dbHelper');
const { getEffectiveProjectRole } = require('../../middleware/collaborationAuth');
const { getOrCreateImplicitScript } = require('./implicitScriptHelper');

async function reorderStoryboards(req, res) {
  const userId = req.user.id;
  const { scriptId, projectId, episodeNumber, order } = req.body || {};

  if ((!scriptId && !projectId) || !Array.isArray(order) || order.length === 0) {
    return res.status(400).json({ message: '缺少 scriptId/projectId 或 order 数组' });
  }

  try {
    let effectiveScriptId = scriptId;
    let effectiveProjectId;

    if (scriptId) {
      // 剧集分镜模式：校验剧本属主
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
      effectiveProjectId = script.project_id;
    } else {
      // 自由分镜模式：校验项目权限，获取/创建隐式剧本
      const role = await getEffectiveProjectRole(userId, projectId);
      if (!role) {
        return res.status(403).json({ message: '无权访问该项目' });
      }
      effectiveProjectId = Number(projectId);
      const ep = Number.isFinite(Number(episodeNumber)) && Number(episodeNumber) >= 1
        ? Number(episodeNumber)
        : 1;
      effectiveScriptId = await getOrCreateImplicitScript(effectiveProjectId, ep, userId);
    }

    for (const item of order) {
      if (item.id != null && item.idx != null) {
        await execute(
          'UPDATE storyboards SET idx = ? WHERE id = ? AND script_id = ?',
          [item.idx, item.id, effectiveScriptId]
        );
      }
    }

    console.log(`[ReorderStoryboards] 更新了 ${order.length} 个分镜的顺序 (scriptId=${effectiveScriptId})`);
    res.json({ message: '排序已保存', count: order.length });
  } catch (err) {
    console.error('[ReorderStoryboards] 保存排序失败:', err);
    res.status(500).json({ message: '保存排序失败' });
  }
}

module.exports = reorderStoryboards;
