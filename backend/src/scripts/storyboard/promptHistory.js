/**
 * 分镜提示词版本历史管理 API
 * 参照 frameHistory.js 模式
 */

const { queryAll, queryOne, execute } = require('../../dbHelper');
const { authMiddleware } = require('../../middleware');

module.exports = (router) => {
  // GET /:storyboardId/prompt-history - 获取提示词版本列表
  router.get('/:storyboardId/prompt-history', authMiddleware, async (req, res) => {
    const { storyboardId } = req.params;

    try {
      const history = await queryAll(
        `SELECT h.*, u.email as created_by_name
         FROM storyboard_prompt_history h
         LEFT JOIN users u ON h.created_by = u.id
         WHERE h.storyboard_id = ?
         ORDER BY h.version_number DESC`,
        [storyboardId]
      );

      res.json({ history });
    } catch (error) {
      console.error('[Prompt History]', error);
      res.status(500).json({ message: '获取提示词历史失败' });
    }
  });

  // POST /:storyboardId/prompt-history - 手动保存新版本
  router.post('/:storyboardId/prompt-history', authMiddleware, async (req, res) => {
    const userId = req.user.id;
    const { storyboardId } = req.params;
    const { promptText, source = 'manual' } = req.body;

    if (!promptText || typeof promptText !== 'string') {
      return res.status(400).json({ message: 'promptText 是必需的字符串字段' });
    }

    try {
      // 验证分镜存在
      const storyboard = await queryOne(
        'SELECT id FROM storyboards WHERE id = ?',
        [storyboardId]
      );
      if (!storyboard) {
        return res.status(404).json({ message: '分镜不存在' });
      }

      // 获取当前最大版本号
      const maxVersion = await queryOne(
        'SELECT MAX(version_number) as max_ver FROM storyboard_prompt_history WHERE storyboard_id = ?',
        [storyboardId]
      );
      const newVersionNumber = (maxVersion?.max_ver || 0) + 1;

      // 将当前版本设为非当前
      await execute(
        'UPDATE storyboard_prompt_history SET is_current = FALSE WHERE storyboard_id = ?',
        [storyboardId]
      );

      // 插入新版本
      const result = await execute(
        `INSERT INTO storyboard_prompt_history 
         (storyboard_id, prompt_text, version_number, is_current, source, created_by)
         VALUES (?, ?, ?, TRUE, ?, ?)`,
        [storyboardId, promptText, newVersionNumber, source, userId]
      );

      console.log(`[Prompt History] 保存新版本：storyboardId=${storyboardId}, version=${newVersionNumber}, source=${source}`);

      res.json({
        message: '版本已保存',
        historyId: result.insertId,
        versionNumber: newVersionNumber
      });
    } catch (error) {
      console.error('[Prompt History Save]', error);
      res.status(500).json({ message: '保存提示词版本失败' });
    }
  });

  // PUT /:storyboardId/prompt-history/:historyId/restore - 恢复历史版本
  router.put('/:storyboardId/prompt-history/:historyId/restore', authMiddleware, async (req, res) => {
    const { storyboardId, historyId } = req.params;

    try {
      // 验证历史记录存在
      const history = await queryOne(
        'SELECT * FROM storyboard_prompt_history WHERE id = ? AND storyboard_id = ?',
        [historyId, storyboardId]
      );
      if (!history) {
        return res.status(404).json({ message: '历史记录不存在' });
      }

      // 将所有版本设为非当前
      await execute(
        'UPDATE storyboard_prompt_history SET is_current = FALSE WHERE storyboard_id = ?',
        [storyboardId]
      );

      // 恢复指定版本为当前
      await execute(
        'UPDATE storyboard_prompt_history SET is_current = TRUE WHERE id = ?',
        [historyId]
      );

      // 同时更新 storyboards 表的 prompt_template
      await execute(
        'UPDATE storyboards SET prompt_template = ? WHERE id = ?',
        [history.prompt_text, storyboardId]
      );

      console.log(`[Prompt History] 恢复版本：storyboardId=${storyboardId}, historyId=${historyId}, version=${history.version_number}`);

      res.json({
        message: '版本已恢复',
        promptText: history.prompt_text
      });
    } catch (error) {
      console.error('[Prompt History Restore]', error);
      res.status(500).json({ message: '恢复版本失败' });
    }
  });
};
