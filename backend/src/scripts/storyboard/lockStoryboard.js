/**
 * 分镜锁定/解锁功能
 * 防止误操作修改已确认的分镜
 */

const { execute } = require('../../db');

/**
 * 锁定分镜
 * POST /api/scripts/storyboards/:storyboardId/lock
 */
async function lockStoryboard(req, res) {
  try {
    const { storyboardId } = req.params;
    const userId = req.user?.id || req.user?.userId;
    const userEmail = req.user?.email || String(userId);

    if (!storyboardId) {
      return res.status(400).json({ error: '缺少分镜ID' });
    }

    // 检查分镜是否存在
    const storyboard = await execute(
      'SELECT id, is_locked, locked_by FROM storyboards WHERE id = ?',
      [storyboardId]
    );

    if (!storyboard) {
      return res.status(404).json({ error: '分镜不存在' });
    }

    if (storyboard.is_locked) {
      return res.status(400).json({ 
        error: '分镜已被锁定',
        locked_by: storyboard.locked_by,
        message: '该分镜已被锁定，如需修改请先解锁'
      });
    }

    // 执行锁定
    await execute(
      `UPDATE storyboards 
       SET is_locked = TRUE, locked_at = NOW(), locked_by = ?
       WHERE id = ?`,
      [userEmail, storyboardId]
    );

    res.json({
      success: true,
      message: '分镜已锁定',
      storyboardId: parseInt(storyboardId),
      locked_by: userEmail,
      locked_at: new Date().toISOString()
    });
  } catch (error) {
    console.error('[lockStoryboard] 错误:', error);
    res.status(500).json({ error: '锁定分镜失败: ' + error.message });
  }
}

/**
 * 解锁分镜
 * POST /api/scripts/storyboards/:storyboardId/unlock
 */
async function unlockStoryboard(req, res) {
  try {
    const { storyboardId } = req.params;
    const userId = req.user?.id || req.user?.userId;
    const userEmail = req.user?.email || String(userId);

    if (!storyboardId) {
      return res.status(400).json({ error: '缺少分镜ID' });
    }

    // 检查分镜是否存在
    const storyboard = await execute(
      'SELECT id, is_locked, locked_by FROM storyboards WHERE id = ?',
      [storyboardId]
    );

    if (!storyboard) {
      return res.status(404).json({ error: '分镜不存在' });
    }

    if (!storyboard.is_locked) {
      return res.status(400).json({ 
        error: '分镜未锁定',
        message: '该分镜当前未处于锁定状态'
      });
    }

    // 可选：只有锁定者或管理员才能解锁
    // 暂时开放给所有用户，如需限制可取消下面注释
    // if (storyboard.locked_by !== userEmail && req.user?.role !== 'admin') {
    //   return res.status(403).json({ error: '只有锁定者或管理员才能解锁' });
    // }

    // 执行解锁
    await execute(
      `UPDATE storyboards 
       SET is_locked = FALSE, locked_at = NULL, locked_by = NULL
       WHERE id = ?`,
      [storyboardId]
    );

    res.json({
      success: true,
      message: '分镜已解锁',
      storyboardId: parseInt(storyboardId)
    });
  } catch (error) {
    console.error('[unlockStoryboard] 错误:', error);
    res.status(500).json({ error: '解锁分镜失败: ' + error.message });
  }
}

/**
 * 批量锁定分镜
 * POST /api/scripts/storyboards/batch-lock
 */
async function batchLockStoryboards(req, res) {
  try {
    const { storyboardIds } = req.body;
    const userId = req.user?.id || req.user?.userId;
    const userEmail = req.user?.email || String(userId);

    if (!Array.isArray(storyboardIds) || storyboardIds.length === 0) {
      return res.status(400).json({ error: '请提供要锁定的分镜ID列表' });
    }

    // 批量更新
    const placeholders = storyboardIds.map(() => '?').join(',');
    await execute(
      `UPDATE storyboards 
       SET is_locked = TRUE, locked_at = NOW(), locked_by = ?
       WHERE id IN (${placeholders}) AND is_locked = FALSE`,
      [userEmail, ...storyboardIds]
    );

    res.json({
      success: true,
      message: `已锁定 ${storyboardIds.length} 个分镜`,
      count: storyboardIds.length
    });
  } catch (error) {
    console.error('[batchLockStoryboards] 错误:', error);
    res.status(500).json({ error: '批量锁定失败: ' + error.message });
  }
}

/**
 * 批量解锁分镜
 * POST /api/scripts/storyboards/batch-unlock
 */
async function batchUnlockStoryboards(req, res) {
  try {
    const { storyboardIds } = req.body;

    if (!Array.isArray(storyboardIds) || storyboardIds.length === 0) {
      return res.status(400).json({ error: '请提供要解锁的分镜ID列表' });
    }

    // 批量更新
    const placeholders = storyboardIds.map(() => '?').join(',');
    await execute(
      `UPDATE storyboards 
       SET is_locked = FALSE, locked_at = NULL, locked_by = NULL
       WHERE id IN (${placeholders}) AND is_locked = TRUE`,
      [...storyboardIds]
    );

    res.json({
      success: true,
      message: `已解锁 ${storyboardIds.length} 个分镜`,
      count: storyboardIds.length
    });
  } catch (error) {
    console.error('[batchUnlockStoryboards] 错误:', error);
    res.status(500).json({ error: '批量解锁失败: ' + error.message });
  }
}

/**
 * 注册路由
 */
function registerRoutes(router) {
  router.post('/:storyboardId/lock', lockStoryboard);
  router.post('/:storyboardId/unlock', unlockStoryboard);
  router.post('/batch-lock', batchLockStoryboards);
  router.post('/batch-unlock', batchUnlockStoryboards);
}

module.exports = registerRoutes;
