/**
 * PATCH /api/storyboards/:storyboardId/content
 * 更新单个分镜的描述内容、空间描述和结构化台词
 */

const { queryOne, execute } = require('../../dbHelper');

async function updateContent(req, res) {
  const userId = req.user.id;
  const storyboardId = Number(req.params.storyboardId);
  const { prompt_template, spatial_description, dialogues, voiceover } = req.body || {};

  if (!storyboardId) {
    return res.status(400).json({ message: 'Invalid storyboard id' });
  }

  // 至少需要传递一个字段
  if (prompt_template === undefined && spatial_description === undefined && dialogues === undefined && voiceover === undefined) {
    return res.status(400).json({ message: '需要提供 prompt_template、spatial_description、dialogues 或 voiceover 中的至少一个字段' });
  }

  // 验证 prompt_template 类型（如果传递了）
  if (prompt_template !== undefined && typeof prompt_template !== 'string') {
    return res.status(400).json({ message: 'prompt_template 必须是字符串' });
  }

  // 验证 dialogues 格式
  if (dialogues !== undefined && !Array.isArray(dialogues)) {
    return res.status(400).json({ message: 'dialogues 必须是数组' });
  }

  try {
    const storyboard = await queryOne(
      `SELECT s.id, s.variables_json
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

    // 处理 dialogues：更新到 variables_json 中
    if (dialogues !== undefined || voiceover !== undefined) {
      let vars = {};
      try {
        vars = JSON.parse(storyboard.variables_json || '{}');
      } catch { /* ignore */ }

      if (dialogues !== undefined) {
        // 更新结构化台词字段
        vars.dialogues = dialogues;
        // 同时更新 dialogue 扁平字符串（向后兼容）
        if (dialogues.length > 0) {
          vars.dialogue = dialogues.map(d => d.line).join('；');
        } else {
          vars.dialogue = '';
        }
      }

      if (voiceover !== undefined) {
        // 更新画外音字段
        vars.voiceover = typeof voiceover === 'string' ? voiceover.trim() : '';
      }

      updates.push('variables_json = ?');
      params.push(JSON.stringify(vars));
    }

    if (updates.length > 0) {
      params.push(storyboardId);
      await execute(
        `UPDATE storyboards SET ${updates.join(', ')} WHERE id = ?`,
        params
      );
    }

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
