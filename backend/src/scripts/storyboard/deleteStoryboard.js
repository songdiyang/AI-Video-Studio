/**
 * DELETE /api/storyboards/scene/:storyboardId
 * 删除单个分镜（仅删除分镜记录，不影响角色和场景）
 * 
 * 删除后自动重排同一 script 下剩余分镜的 idx
 */

const { queryOne, queryAll, execute } = require('../../dbHelper');

async function deleteStoryboard(req, res) {
  const userId = req.user.id;
  const storyboardId = Number(req.params.storyboardId);

  console.log(`[DeleteStoryboard] 收到删除请求: storyboardId=${storyboardId}, userId=${userId}, raw=${req.params.storyboardId}`);

  if (!storyboardId) {
    console.log('[DeleteStoryboard] storyboardId 无效，返回 400');
    return res.status(400).json({ message: '缺少 storyboardId' });
  }

  try {
    // 先查分镜是否存在（不带用户权限）
    const rawStoryboard = await queryOne(
      'SELECT id, script_id FROM storyboards WHERE id = ?',
      [storyboardId]
    );
    console.log(`[DeleteStoryboard] 分镜原始查询(不带权限): id=${storyboardId}`, rawStoryboard ? `存在, script_id=${rawStoryboard.script_id}` : '不存在');

    if (rawStoryboard) {
      // 查对应的 script 是否存在
      const rawScript = await queryOne(
        'SELECT id, user_id FROM scripts WHERE id = ?',
        [rawStoryboard.script_id]
      );
      console.log(`[DeleteStoryboard] 关联剧本查询: script_id=${rawStoryboard.script_id}`, rawScript ? `存在, user_id=${rawScript.user_id}, 当前userId=${userId}, 匹配=${rawScript.user_id === userId}` : '不存在');
    }

    // 查询分镜及其所属项目（支持独立模式，script_id 可为 null）
    const storyboard = await queryOne(
      `SELECT s.id, s.script_id, s.project_id, sc.user_id as script_user_id
       FROM storyboards s
       LEFT JOIN scripts sc ON s.script_id = sc.id
       WHERE s.id = ?`,
      [storyboardId]
    );
    console.log(`[DeleteStoryboard] 查询结果:`, storyboard ? `找到, script_id=${storyboard.script_id}, project_id=${storyboard.project_id}, script_user_id=${storyboard.script_user_id}` : '未找到(404)');
    if (!storyboard) {
      return res.status(404).json({ message: '分镜不存在' });
    }

    // 权限检查：统一通过项目权限验证
    let isOwner = false;
    if (storyboard.script_id && storyboard.script_user_id) {
      // 检查剧本所有者
      isOwner = storyboard.script_user_id === userId;
    }
    if (!isOwner) {
      // 检查是否为项目协作者
      const { getEffectiveProjectRole } = require('../../middleware/collaborationAuth');
      const projectId = storyboard.project_id;
      if (projectId) {
        const role = await getEffectiveProjectRole(userId, projectId);
        if (!role || role === 'viewer') {
          return res.status(403).json({ message: '无权删除此分镜' });
        }
      } else {
        return res.status(403).json({ message: '无权删除此分镜' });
      }
    }

    const scriptId = storyboard.script_id;
    if (!scriptId) {
      return res.status(500).json({ message: '分镜数据异常：缺少 script_id' });
    }

    // 删除该分镜
    await execute('DELETE FROM storyboards WHERE id = ?', [storyboardId]);
    console.log(`[DeleteStoryboard] 已删除分镜 ${storyboardId}`);

    // 重排剩余分镜的 idx（保持连续）
    const remaining = await queryAll('SELECT id FROM storyboards WHERE script_id = ? ORDER BY idx ASC', [scriptId]);
    for (let i = 0; i < remaining.length; i++) {
      await execute(
        'UPDATE storyboards SET idx = ? WHERE id = ?',
        [i, remaining[i].id]
      );
    }
    console.log(`[DeleteStoryboard] 重排了 ${remaining.length} 个分镜的顺序`);

    res.json({ message: '分镜已删除', remaining: remaining.length });
  } catch (err) {
    console.error('[DeleteStoryboard] 删除失败:', err);
    res.status(500).json({ message: '删除分镜失败' });
  }
}

module.exports = deleteStoryboard;
