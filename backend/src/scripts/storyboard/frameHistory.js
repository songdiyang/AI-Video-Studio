const { queryAll, queryOne, execute } = require('../../dbHelper');
const { authMiddleware } = require('../../middleware');

// GET /storyboards/:storyboardId/frame-history - 获取分镜的帧历史版本
module.exports = (router) => {
  router.get('/storyboards/:storyboardId/frame-history', authMiddleware, async (req, res) => {
    const userId = req.user.id;
    const { storyboardId } = req.params;
    const { frameType } = req.query; // 'first' | 'last' | 'all'

    try {
      let sql = `
        SELECT h.*, u.username as created_by_name
        FROM storyboard_frame_history h
        LEFT JOIN users u ON h.created_by = u.id
        WHERE h.storyboard_id = ?
      `;
      const params = [storyboardId];

      if (frameType && frameType !== 'all') {
        sql += ' AND h.frame_type = ?';
        params.push(frameType);
      }

      sql += ' ORDER BY h.frame_type ASC, h.version_number DESC';

      const history = await queryAll(sql, params);

      // 按 frame_type 分组
      const grouped = {
        first: history.filter(h => h.frame_type === 'first'),
        last: history.filter(h => h.frame_type === 'last')
      };

      res.json({ history: grouped });
    } catch (error) {
      console.error('[Frame History]', error);
      res.status(500).json({ message: '获取帧历史失败' });
    }
  });

  // POST /storyboards/:storyboardId/frame-history - 保存新的帧版本
  router.post('/storyboards/:storyboardId/frame-history', authMiddleware, async (req, res) => {
    const userId = req.user.id;
    const { storyboardId } = req.params;
    const { frameType, frameUrl, generationPrompt, generationParams } = req.body;

    if (!frameType || !['first', 'last'].includes(frameType)) {
      return res.status(400).json({ message: 'frameType 必须是 first 或 last' });
    }
    if (!frameUrl) {
      return res.status(400).json({ message: 'frameUrl 是必需的' });
    }

    try {
      // 验证分镜是否存在
      const storyboard = await queryOne(
        'SELECT id FROM storyboards WHERE id = ?',
        [storyboardId]
      );
      if (!storyboard) {
        return res.status(404).json({ message: '分镜不存在' });
      }

      // 获取当前最大版本号
      const maxVersion = await queryOne(
        'SELECT MAX(version_number) as max_ver FROM storyboard_frame_history WHERE storyboard_id = ? AND frame_type = ?',
        [storyboardId, frameType]
      );
      const newVersionNumber = (maxVersion?.max_ver || 0) + 1;

      // 将当前版本设置为非当前
      await execute(
        'UPDATE storyboard_frame_history SET is_current = FALSE WHERE storyboard_id = ? AND frame_type = ?',
        [storyboardId, frameType]
      );

      // 插入新版本（设为当前）
      const result = await execute(
        `INSERT INTO storyboard_frame_history 
         (storyboard_id, frame_type, frame_url, generation_prompt, generation_params, version_number, is_current, created_by)
         VALUES (?, ?, ?, ?, ?, ?, TRUE, ?)`,
        [storyboardId, frameType, frameUrl, generationPrompt, JSON.stringify(generationParams), newVersionNumber, userId]
      );

      // 同时更新 storyboards 表的帧 URL
      const fieldName = frameType === 'first' ? 'first_frame_url' : 'last_frame_url';
      await execute(
        `UPDATE storyboards SET ${fieldName} = ? WHERE id = ?`,
        [frameUrl, storyboardId]
      );

      console.log(`[Frame History] 保存新帧版本：storyboardId=${storyboardId}, frameType=${frameType}, version=${newVersionNumber}`);

      res.json({
        message: '帧版本已保存',
        historyId: result.insertId,
        versionNumber: newVersionNumber
      });
    } catch (error) {
      console.error('[Frame History Save]', error);
      res.status(500).json({ message: '保存帧历史失败' });
    }
  });

  // PUT /storyboards/:storyboardId/frame-history/:historyId/restore - 恢复历史版本
  router.put('/storyboards/:storyboardId/frame-history/:historyId/restore', authMiddleware, async (req, res) => {
    const { storyboardId, historyId } = req.params;

    try {
      // 验证历史记录存在
      const history = await queryOne(
        'SELECT * FROM storyboard_frame_history WHERE id = ? AND storyboard_id = ?',
        [historyId, storyboardId]
      );
      if (!history) {
        return res.status(404).json({ message: '历史记录不存在' });
      }

      // 将所有版本设置为非当前
      await execute(
        'UPDATE storyboard_frame_history SET is_current = FALSE WHERE storyboard_id = ? AND frame_type = ?',
        [storyboardId, history.frame_type]
      );

      // 恢复指定版本为当前
      await execute(
        'UPDATE storyboard_frame_history SET is_current = TRUE WHERE id = ?',
        [historyId]
      );

      // 更新 storyboards 表的帧 URL
      const fieldName = history.frame_type === 'first' ? 'first_frame_url' : 'last_frame_url';
      await execute(
        `UPDATE storyboards SET ${fieldName} = ? WHERE id = ?`,
        [history.frame_url, storyboardId]
      );

      console.log(`[Frame History] 恢复版本：storyboardId=${storyboardId}, historyId=${historyId}`);

      res.json({ message: '版本已恢复' });
    } catch (error) {
      console.error('[Frame History Restore]', error);
      res.status(500).json({ message: '恢复版本失败' });
    }
  });

  // DELETE /storyboards/:storyboardId/frame-history/:historyId - 删除历史版本
  router.delete('/storyboards/:storyboardId/frame-history/:historyId', authMiddleware, async (req, res) => {
    const { storyboardId, historyId } = req.params;

    try {
      const history = await queryOne(
        'SELECT * FROM storyboard_frame_history WHERE id = ? AND storyboard_id = ?',
        [historyId, storyboardId]
      );
      if (!history) {
        return res.status(404).json({ message: '历史记录不存在' });
      }

      if (history.is_current) {
        return res.status(400).json({ message: '不能删除当前使用的版本' });
      }

      await execute('DELETE FROM storyboard_frame_history WHERE id = ?', [historyId]);

      console.log(`[Frame History] 删除版本：storyboardId=${storyboardId}, historyId=${historyId}`);

      res.json({ message: '版本已删除' });
    } catch (error) {
      console.error('[Frame History Delete]', error);
      res.status(500).json({ message: '删除版本失败' });
    }
  });
};
