/**
 * PATCH /api/storyboards/:storyboardId/content
 * 更新单个分镜的描述内容和空间描述
 */

const { queryOne, execute } = require('../../dbHelper');

async function updateContent(req, res) {
  const userId = req.user.id;
  const storyboardId = Number(req.params.storyboardId);
  const { prompt_template, spatial_description } = req.body || {};

  if (!storyboardId) {
    return res.status(400).json({ message: 'Invalid storyboard id' });
  }

  // 至少需要传递一个字段
  if (prompt_template === undefined && spatial_description === undefined) {
    return res.status(400).json({ message: '需要提供 prompt_template 或 spatial_description 中的至少一个字段' });
  }

  // 验证 prompt_template 类型（如果传递了）
  if (prompt_template !== undefined && typeof prompt_template !== 'string') {
    return res.status(400).json({ message: 'prompt_template 必须是字符串' });
  }

  try {
    const storyboard = await queryOne(
      `SELECT s.id
       FROM storyboards s
       JOIN scripts sc ON s.script_id = sc.id
       WHERE s.id = ? AND sc.user_id = ?`,
      [storyboardId, userId]
    );

    if (!storyboard) {
      return res.status(404).json({ message: 'Storyboard not found or access denied' });
    }

    // 构建动态更新语句
    const updates = [];
    const params = [];

    if (prompt_template !== undefined) {
      updates.push('prompt_template = ?');
      params.push(prompt_template);
    }

    if (spatial_description !== undefined) {
      updates.push('spatial_description = ?');
      // 序列化为 JSON 字符串
      const spatialDescJson = spatial_description 
        ? (typeof spatial_description === 'string' ? spatial_description : JSON.stringify(spatial_description)) 
        : null;
      params.push(spatialDescJson);
    }

    params.push(storyboardId);

    await execute(
      `UPDATE storyboards SET ${updates.join(', ')} WHERE id = ?`,
      params
    );

    // 当 prompt_template 被更新时，自动记录版本历史
    if (prompt_template !== undefined && prompt_template.trim()) {
      try {
        // 获取当前最大版本号
        const maxVersion = await queryOne(
          'SELECT MAX(version_number) as max_ver FROM storyboard_prompt_history WHERE storyboard_id = ?',
          [storyboardId]
        );
        const newVersionNumber = (maxVersion?.max_ver || 0) + 1;

        // 将之前的版本设为非当前
        await execute(
          'UPDATE storyboard_prompt_history SET is_current = FALSE WHERE storyboard_id = ?',
          [storyboardId]
        );

        // 插入新版本记录
        await execute(
          `INSERT INTO storyboard_prompt_history 
           (storyboard_id, prompt_text, version_number, is_current, source, created_by)
           VALUES (?, ?, ?, TRUE, 'manual', ?)`,
          [storyboardId, prompt_template, newVersionNumber, userId]
        );
      } catch (historyError) {
        // 版本记录失败不影响主流程
        console.error('[Storyboard Content] 版本记录失败:', historyError);
      }
    }

    res.json({
      success: true,
      message: 'Content updated successfully'
    });
  } catch (error) {
    console.error('[Storyboard Content] 更新失败:', error);
    res.status(500).json({ message: 'Failed to update storyboard content' });
  }
}

module.exports = updateContent;
