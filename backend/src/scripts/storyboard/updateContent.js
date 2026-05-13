/**
 * PATCH /api/storyboards/:storyboardId/content
 * 更新单个分镜的描述内容、空间描述和结构化台词
 */

const { queryOne, execute } = require('../../dbHelper');
const { getEffectiveProjectRole } = require('../../middleware/collaborationAuth');
const { linkCharactersForStoryboard, linkScenesForStoryboard } = require('../../resourceLinks/linkSingleStoryboard');

async function updateContent(req, res) {
  const userId = req.user.id;
  const storyboardId = Number(req.params.storyboardId);
  const { prompt_template, first_frame_prompt, last_frame_prompt, video_prompt, video_start_prompt, video_end_prompt, description, spatial_description, dialogues, voiceover, characters, location, characterIds, sceneId, negative_prompt, duration, props, characterStates, shotType } = req.body || {};

  if (!storyboardId) {
    return res.status(400).json({ message: 'Invalid storyboard id' });
  }

  // 至少需要传递一个字段
  if (prompt_template === undefined && first_frame_prompt === undefined && last_frame_prompt === undefined && video_prompt === undefined && video_start_prompt === undefined && video_end_prompt === undefined && description === undefined && spatial_description === undefined && dialogues === undefined && voiceover === undefined && characters === undefined && location === undefined && negative_prompt === undefined && duration === undefined && props === undefined && characterStates === undefined && shotType === undefined) {
    return res.status(400).json({ message: '需要提供至少一个可更新字段' });
  }

  // 验证 prompt_template 类型（如果传递了）
  if (prompt_template !== undefined && typeof prompt_template !== 'string') {
    return res.status(400).json({ message: 'prompt_template 必须是字符串' });
  }
  if (first_frame_prompt !== undefined && first_frame_prompt !== null && typeof first_frame_prompt !== 'string') {
    return res.status(400).json({ message: 'first_frame_prompt 必须是字符串' });
  }
  if (last_frame_prompt !== undefined && last_frame_prompt !== null && typeof last_frame_prompt !== 'string') {
    return res.status(400).json({ message: 'last_frame_prompt 必须是字符串' });
  }

  // 验证 dialogues 格式
  if (dialogues !== undefined && !Array.isArray(dialogues)) {
    return res.status(400).json({ message: 'dialogues 必须是数组' });
  }

  try {
    const storyboard = await queryOne(
      `SELECT s.id, s.variables_json, s.script_id, s.is_locked
       FROM storyboards s
       WHERE s.id = ?`,
      [storyboardId]
    );

    if (!storyboard) {
      return res.status(404).json({ message: 'Storyboard not found' });
    }

    // 检查分镜是否已锁定
    if (storyboard.is_locked) {
      return res.status(403).json({ message: '该分镜已锁定，请先解锁后再修改内容' });
    }

    // 通过剧本关联的项目检查编辑权限（支持无剧本的独立模式）
    let projectId = null;
    if (storyboard.script_id) {
      const script = await queryOne('SELECT project_id FROM scripts WHERE id = ?', [storyboard.script_id]);
      if (script) {
        projectId = script.project_id;
      }
    }
    // 如果通过剧本找不到项目，尝试直接从分镜记录获取（独立模式）
    if (!projectId) {
      const storyboardProject = await queryOne('SELECT project_id FROM storyboards WHERE id = ?', [storyboardId]);
      projectId = storyboardProject?.project_id || null;
    }
    if (projectId) {
      const role = await getEffectiveProjectRole(userId, projectId);
      if (!role || role === 'viewer') {
        return res.status(403).json({ message: 'Access denied' });
      }
    }

    // 构建动态更新语句
    const updates = [];
    const params = [];

    if (prompt_template !== undefined) {
      updates.push('prompt_template = ?');
      params.push(prompt_template);
    }

    if (first_frame_prompt !== undefined) {
      updates.push('first_frame_prompt = ?');
      params.push(first_frame_prompt); // 允许 null / 空字符串
    }

    if (last_frame_prompt !== undefined) {
      updates.push('last_frame_prompt = ?');
      params.push(last_frame_prompt); // 允许 null / 空字符串
    }

    if (video_prompt !== undefined) {
      updates.push('video_prompt = ?');
      params.push(video_prompt);
    }

    if (video_start_prompt !== undefined) {
      updates.push('video_start_prompt = ?');
      params.push(video_start_prompt);
    }

    if (video_end_prompt !== undefined) {
      updates.push('video_end_prompt = ?');
      params.push(video_end_prompt);
    }

    if (description !== undefined) {
      updates.push('description = ?');
      params.push(description);
    }

    if (negative_prompt !== undefined) {
      updates.push('negative_prompt = ?');
      params.push(negative_prompt || null);
    }

    if (spatial_description !== undefined) {
      updates.push('spatial_description = ?');
      // 序列化为 JSON 字符串
      const spatialDescJson = spatial_description 
        ? (typeof spatial_description === 'string' ? spatial_description : JSON.stringify(spatial_description)) 
        : null;
      params.push(spatialDescJson);
    }

    // 处理 dialogues / voiceover / characters / location / duration / props / shotType：更新到 variables_json 中
    if (dialogues !== undefined || voiceover !== undefined || characters !== undefined || location !== undefined || duration !== undefined || props !== undefined || characterStates !== undefined || shotType !== undefined) {
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

      if (characters !== undefined) {
        vars.characters = Array.isArray(characters) ? characters : [];
      }

      if (location !== undefined) {
        vars.location = typeof location === 'string' ? location.trim() : '';
      }

      if (duration !== undefined) {
        vars.duration = typeof duration === 'number' ? duration : 3;
      }

      if (props !== undefined) {
        vars.props = Array.isArray(props) ? props : [];
      }

      if (characterStates !== undefined) {
        // characterStates 是一个对象：{ characterId: { stateId, stateName, stateImage, stateOutfit } }
        vars.characterStates = (characterStates && typeof characterStates === 'object') ? characterStates : {};
      }

      if (shotType !== undefined) {
        // 景别：中景、近景、特写等
        vars.shotType = typeof shotType === 'string' ? shotType.trim() : '';
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

    // 当 characters 或 location 更新时，自动重新链接关联表
    if ((characters !== undefined || location !== undefined) && projectId) {
      try {
        if (characters !== undefined) {
          // 传递 characterIds 给链接函数，优先使用直接 ID 创建关联
          const validCharIds = Array.isArray(characterIds) ? characterIds.filter(id => typeof id === 'number' && id > 0) : [];
          await linkCharactersForStoryboard(storyboardId, projectId, { characterIds: validCharIds });
        }
        if (location !== undefined) {
          // 传递 sceneId 给链接函数，优先使用直接 ID 创建关联
          const validSceneId = (typeof sceneId === 'number' && sceneId > 0) ? sceneId : null;
          await linkScenesForStoryboard(storyboardId, projectId, { sceneId: validSceneId });
        }
      } catch (linkErr) {
        console.warn('[Storyboard Content] 重新链接关联失败（非致命）:', linkErr.message);
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
