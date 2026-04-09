/**
 * 角色状态管理 API
 * 端点:
 * - GET /api/characters/:id/states - 获取角色的所有状态
 * - GET /api/characters/:id/states/history - 获取角色所有状态的变更历史
 * - GET /api/characters/:id/states/:stateId/history - 获取特定状态的变更历史
 * - POST /api/characters/:id/states - 创建新状态
 * - PUT /api/characters/:id/states/:stateId - 更新状态
 * - DELETE /api/characters/:id/states/:stateId - 删除状态
 * - PUT /api/characters/:id/states/:stateId/activate - 激活状态
 * - POST /api/characters/:id/states/:stateId/generate-views - 为状态生成三视图
 * - POST /api/characters/:id/states/:stateId/duplicate - 复制状态
 */
const { queryOne, queryAll, execute } = require('../../dbHelper');
const { authMiddleware } = require('../../middleware');
const { generationStartService, sendGenerationError } = require('../../modules/generation');

// 年龄阶段选项
const AGE_STAGES = ['童年', '少年', '青年', '中年', '老年'];

// 状态分类选项
const STATE_CATEGORIES = ['daily', 'costume', 'time', 'effect'];

/**
 * 记录状态变更历史
 * 写入失败不阻断主业务流程
 */
async function recordStateHistory({ characterId, stateId, action, changes = null, snapshot = null, performedBy }) {
  try {
    await execute(
      'INSERT INTO character_state_history (character_id, state_id, action, changes, snapshot, performed_by) VALUES (?, ?, ?, ?, ?, ?)',
      [characterId, stateId, action, changes ? JSON.stringify(changes) : null, snapshot ? JSON.stringify(snapshot) : null, performedBy]
    );
  } catch (err) {
    console.error('Failed to record state history:', err);
  }
}

// 记录前一个激活状态的取消激活历史
async function recordDeactivation(characterId, newActiveStateId, userId) {
  try {
    const previousActive = await queryOne(
      'SELECT * FROM character_states WHERE character_id = ? AND is_active = 1',
      [characterId]
    );
    if (previousActive && previousActive.id !== parseInt(newActiveStateId)) {
      await recordStateHistory({
        characterId,
        stateId: previousActive.id,
        action: 'deactivated',
        snapshot: previousActive,
        performedBy: userId
      });
    }
  } catch (err) {
    console.error('Failed to record deactivation history:', err);
  }
}

module.exports = (router) => {
  // GET /api/characters/:id/states - 获取角色的所有状态
  router.get('/:id/states', authMiddleware, async (req, res) => {
    const userId = req.user.id;
    const { id } = req.params;

    try {
      // 验证角色所有权
      const character = await queryOne(
        'SELECT id FROM characters WHERE id = ? AND user_id = ?',
        [id, userId]
      );

      if (!character) {
        return res.status(404).json({ message: '角色不存在或无权访问' });
      }

      const states = await queryAll(
        'SELECT * FROM character_states WHERE character_id = ? ORDER BY sort_order ASC, created_at ASC',
        [id]
      );

      res.json({ states });
    } catch (error) {
      console.error('[Get Character States]', error);
      res.status(500).json({ message: '获取角色状态失败' });
    }
  });

  // GET /api/characters/:id/states/by-category - 按分类获取角色状态
  router.get('/:id/states/by-category', authMiddleware, async (req, res) => {
    const userId = req.user.id;
    const { id } = req.params;
    const { category } = req.query;

    try {
      // 验证角色所有权
      const character = await queryOne(
        'SELECT id FROM characters WHERE id = ? AND user_id = ?',
        [id, userId]
      );

      if (!character) {
        return res.status(404).json({ message: '角色不存在或无权访问' });
      }

      let query, params;
      if (category && STATE_CATEGORIES.includes(category)) {
        query = 'SELECT * FROM character_states WHERE character_id = ? AND state_category = ? ORDER BY is_base_model DESC, sort_order ASC, created_at ASC';
        params = [id, category];
      } else {
        query = 'SELECT * FROM character_states WHERE character_id = ? ORDER BY is_base_model DESC, state_category ASC, sort_order ASC, created_at ASC';
        params = [id];
      }

      const states = await queryAll(query, params);

      // 按分类分组返回
      const grouped = {};
      for (const cat of STATE_CATEGORIES) {
        grouped[cat] = states.filter(s => (s.state_category || 'daily') === cat);
      }

      res.json({ states, grouped });
    } catch (error) {
      console.error('[Get Character States By Category]', error);
      res.status(500).json({ message: '获取角色状态失败' });
    }
  });

  // GET /api/characters/:id/states/history - 获取角色所有状态的变更历史
  // 注意：此路由必须在 /:id/states/:stateId 之前定义，否则 "history" 会被当作 stateId
  router.get('/:id/states/history', authMiddleware, async (req, res) => {
    try {
      const characterId = req.params.id;
      const userId = req.user.id;
      const { action, limit = 50, offset = 0 } = req.query;

      // 验证角色所有权
      const character = await queryOne(
        'SELECT id FROM characters WHERE id = ? AND user_id = ?',
        [characterId, userId]
      );
      if (!character) {
        return res.status(404).json({ error: '角色不存在或无权访问' });
      }

      let query = 'SELECT * FROM character_state_history WHERE character_id = ?';
      const params = [characterId];

      if (action) {
        query += ' AND action = ?';
        params.push(action);
      }

      query += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
      params.push(parseInt(limit), parseInt(offset));

      const history = await queryAll(query, params);

      // 获取总数
      let countQuery = 'SELECT COUNT(*) as total FROM character_state_history WHERE character_id = ?';
      const countParams = [characterId];
      if (action) {
        countQuery += ' AND action = ?';
        countParams.push(action);
      }
      const countResult = await queryOne(countQuery, countParams);

      res.json({
        history: history.map(h => ({
          ...h,
          changes: h.changes ? (typeof h.changes === 'string' ? JSON.parse(h.changes) : h.changes) : null,
          snapshot: h.snapshot ? (typeof h.snapshot === 'string' ? JSON.parse(h.snapshot) : h.snapshot) : null
        })),
        total: countResult?.total || 0,
        limit: parseInt(limit),
        offset: parseInt(offset)
      });
    } catch (error) {
      console.error('获取状态历史失败:', error);
      res.status(500).json({ error: '获取状态历史失败' });
    }
  });

  // GET /api/characters/:id/states/:stateId/history - 获取特定状态的变更历史
  router.get('/:id/states/:stateId/history', authMiddleware, async (req, res) => {
    try {
      const { id: characterId, stateId } = req.params;
      const userId = req.user.id;
      const { action, limit = 50, offset = 0 } = req.query;

      // 验证角色所有权
      const character = await queryOne(
        'SELECT id FROM characters WHERE id = ? AND user_id = ?',
        [characterId, userId]
      );
      if (!character) {
        return res.status(404).json({ error: '角色不存在或无权访问' });
      }

      let query = 'SELECT * FROM character_state_history WHERE character_id = ? AND state_id = ?';
      const params = [characterId, parseInt(stateId)];

      if (action) {
        query += ' AND action = ?';
        params.push(action);
      }

      query += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
      params.push(parseInt(limit), parseInt(offset));

      const history = await queryAll(query, params);

      let countQuery = 'SELECT COUNT(*) as total FROM character_state_history WHERE character_id = ? AND state_id = ?';
      const countParams = [characterId, parseInt(stateId)];
      if (action) {
        countQuery += ' AND action = ?';
        countParams.push(action);
      }
      const countResult = await queryOne(countQuery, countParams);

      res.json({
        history: history.map(h => ({
          ...h,
          changes: h.changes ? (typeof h.changes === 'string' ? JSON.parse(h.changes) : h.changes) : null,
          snapshot: h.snapshot ? (typeof h.snapshot === 'string' ? JSON.parse(h.snapshot) : h.snapshot) : null
        })),
        total: countResult?.total || 0,
        limit: parseInt(limit),
        offset: parseInt(offset)
      });
    } catch (error) {
      console.error('获取状态历史失败:', error);
      res.status(500).json({ error: '获取状态历史失败' });
    }
  });

  // POST /api/characters/:id/states - 创建新状态
  router.post('/:id/states', authMiddleware, async (req, res) => {
    const userId = req.user.id;
    const { id } = req.params;
    const { 
      name, description, appearance, image_url, 
      front_view_url, side_view_url, back_view_url, sort_order,
      // 新增外观属性字段
      outfit, age_stage, hairstyle, accessories, is_active, generation_prompt,
      // 状态分类和标签
      state_category, tags
    } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({ message: '状态名称不能为空' });
    }

    // 验证状态分类
    if (state_category && !STATE_CATEGORIES.includes(state_category)) {
      return res.status(400).json({ message: `无效的状态分类，可选值: ${STATE_CATEGORIES.join(', ')}` });
    }

    // 解析和验证标签
    let parsedTags = null;
    if (tags) {
      try {
        parsedTags = typeof tags === 'string' ? tags : JSON.stringify(tags);
      } catch (err) {
        return res.status(400).json({ message: '标签格式错误，应为JSON数组' });
      }
    }

    try {
      // 验证角色所有权
      const character = await queryOne(
        'SELECT id, name FROM characters WHERE id = ? AND user_id = ?',
        [id, userId]
      );

      if (!character) {
        return res.status(404).json({ message: '角色不存在或无权访问' });
      }

      // 获取当前最大排序值
      const maxOrder = await queryOne(
        'SELECT MAX(sort_order) as max_order FROM character_states WHERE character_id = ?',
        [id]
      );
      const newSortOrder = sort_order !== undefined ? sort_order : (maxOrder?.max_order || 0) + 1;

      // 如果要激活新状态，先记录旧激活状态的取消激活历史，再取消其他状态的激活
      if (is_active) {
        await recordDeactivation(id, 0, userId);
        await execute(
          'UPDATE character_states SET is_active = 0 WHERE character_id = ?',
          [id]
        );
      }

      const result = await execute(
        `INSERT INTO character_states (
          character_id, name, description, appearance, image_url, 
          front_view_url, side_view_url, back_view_url, sort_order,
          outfit, age_stage, hairstyle, accessories, is_active, generation_prompt, generation_status,
          state_category, tags
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'idle', ?, ?)`,
        [
          id, name.trim(), description || '', appearance || '', image_url || '',
          front_view_url || '', side_view_url || '', back_view_url || '', newSortOrder,
          outfit || '', age_stage || '', hairstyle || '', accessories || '', is_active ? 1 : 0, generation_prompt || '',
          state_category || 'daily', parsedTags
        ]
      );

      const state = await queryOne('SELECT * FROM character_states WHERE id = ?', [result.insertId]);

      // 记录创建历史
      await recordStateHistory({
        characterId: id,
        stateId: result.insertId,
        action: 'created',
        snapshot: state,
        performedBy: userId
      });

      res.status(201).json({ message: '状态创建成功', state });
    } catch (error) {
      console.error('[Create Character State]', error);
      res.status(500).json({ message: '创建角色状态失败' });
    }
  });

  // PUT /api/characters/:id/states/:stateId - 更新状态
  router.put('/:id/states/:stateId', authMiddleware, async (req, res) => {
    const userId = req.user.id;
    const { id, stateId } = req.params;
    const { 
      name, description, appearance, image_url, 
      front_view_url, side_view_url, back_view_url, sort_order,
      // 新增外观属性字段
      outfit, age_stage, hairstyle, accessories, is_active, generation_prompt, generation_status,
      // 状态分类和标签
      state_category, tags
    } = req.body;

    try {
      // 验证角色所有权
      const character = await queryOne(
        'SELECT id FROM characters WHERE id = ? AND user_id = ?',
        [id, userId]
      );

      if (!character) {
        return res.status(404).json({ message: '角色不存在或无权访问' });
      }

      // 验证状态存在且属于该角色
      const existingState = await queryOne(
        'SELECT * FROM character_states WHERE id = ? AND character_id = ?',
        [stateId, id]
      );

      if (!existingState) {
        return res.status(404).json({ message: '状态不存在' });
      }

      // 如果要激活此状态，先记录旧激活状态的取消激活历史，再取消其他状态的激活
      if (is_active && !existingState.is_active) {
        await recordDeactivation(id, stateId, userId);
        await execute(
          'UPDATE character_states SET is_active = 0 WHERE character_id = ?',
          [id]
        );
      }

      // 解析标签
      let parsedTags = null;
      if (tags !== undefined) {
        try {
          parsedTags = typeof tags === 'string' ? tags : JSON.stringify(tags);
        } catch (err) {
          return res.status(400).json({ message: '标签格式错误，应为JSON数组' });
        }
      }

      // 验证状态分类
      if (state_category && !STATE_CATEGORIES.includes(state_category)) {
        return res.status(400).json({ message: `无效的状态分类，可选值: ${STATE_CATEGORIES.join(', ')}` });
      }

      // 检测外貌属性是否发生变化，若变化则清除旧的 generation_prompt
      // 确保下次生成时重新构建提示词，避免用过时的缓存
      const appearanceChanged = [
        ['appearance', appearance, existingState.appearance],
        ['outfit', outfit, existingState.outfit],
        ['age_stage', age_stage, existingState.age_stage],
        ['hairstyle', hairstyle, existingState.hairstyle],
        ['accessories', accessories, existingState.accessories]
      ].some(([, newVal, oldVal]) => newVal !== undefined && String(newVal || '') !== String(oldVal || ''));

      // 如果外貌属性变了且未显式传入 generation_prompt，则清除它
      const finalGenerationPrompt = generation_prompt !== undefined
        ? generation_prompt
        : (appearanceChanged ? '' : (existingState.generation_prompt || ''));

      await execute(
        `UPDATE character_states 
         SET name = ?, description = ?, appearance = ?, image_url = ?, 
             front_view_url = ?, side_view_url = ?, back_view_url = ?, sort_order = ?,
             outfit = ?, age_stage = ?, hairstyle = ?, accessories = ?, 
             is_active = ?, generation_prompt = ?, generation_status = ?,
             state_category = ?, tags = ?,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [
          name !== undefined ? name.trim() : existingState.name,
          description !== undefined ? description : existingState.description,
          appearance !== undefined ? appearance : existingState.appearance,
          image_url !== undefined ? image_url : existingState.image_url,
          front_view_url !== undefined ? front_view_url : existingState.front_view_url,
          side_view_url !== undefined ? side_view_url : existingState.side_view_url,
          back_view_url !== undefined ? back_view_url : existingState.back_view_url,
          sort_order !== undefined ? sort_order : existingState.sort_order,
          outfit !== undefined ? outfit : (existingState.outfit || ''),
          age_stage !== undefined ? age_stage : (existingState.age_stage || ''),
          hairstyle !== undefined ? hairstyle : (existingState.hairstyle || ''),
          accessories !== undefined ? accessories : (existingState.accessories || ''),
          is_active !== undefined ? (is_active ? 1 : 0) : existingState.is_active,
          finalGenerationPrompt,
          generation_status !== undefined ? generation_status : (existingState.generation_status || 'idle'),
          state_category !== undefined ? state_category : (existingState.state_category || 'daily'),
          parsedTags !== null ? parsedTags : (existingState.tags || null),
          stateId
        ]
      );

      const state = await queryOne('SELECT * FROM character_states WHERE id = ?', [stateId]);

      // 计算变更差异并记录历史
      const trackFields = ['name', 'description', 'appearance', 'image_url', 'front_view_url', 'side_view_url', 'back_view_url', 'sort_order', 'outfit', 'age_stage', 'hairstyle', 'accessories', 'is_active', 'generation_prompt', 'generation_status', 'state_category', 'tags'];
      const changes = {};
      for (const field of trackFields) {
        const oldVal = existingState[field];
        const newVal = state[field];
        if (String(oldVal ?? '') !== String(newVal ?? '')) {
          changes[field] = { from: oldVal, to: newVal };
        }
      }
      if (Object.keys(changes).length > 0) {
        await recordStateHistory({
          characterId: id,
          stateId: parseInt(stateId),
          action: 'updated',
          changes,
          performedBy: userId
        });
      }

      res.json({ message: '状态更新成功', state });
    } catch (error) {
      console.error('[Update Character State]', error);
      res.status(500).json({ message: '更新角色状态失败' });
    }
  });

  // DELETE /api/characters/:id/states/:stateId - 删除状态
  router.delete('/:id/states/:stateId', authMiddleware, async (req, res) => {
    const userId = req.user.id;
    const { id, stateId } = req.params;

    try {
      // 验证角色所有权
      const character = await queryOne(
        'SELECT id FROM characters WHERE id = ? AND user_id = ?',
        [id, userId]
      );

      if (!character) {
        return res.status(404).json({ message: '角色不存在或无权访问' });
      }

      // 验证状态存在且属于该角色
      const existingState = await queryOne(
        'SELECT * FROM character_states WHERE id = ? AND character_id = ?',
        [stateId, id]
      );

      if (!existingState) {
        return res.status(404).json({ message: '状态不存在' });
      }

      // 记录删除历史（在实际删除前）
      await recordStateHistory({
        characterId: id,
        stateId: parseInt(stateId),
        action: 'deleted',
        snapshot: existingState,
        performedBy: userId
      });

      // 删除状态（关联的参考图会通过外键级联删除，如果设置了级联）
      await execute('DELETE FROM character_states WHERE id = ?', [stateId]);
      res.json({ message: '状态删除成功' });
    } catch (error) {
      console.error('[Delete Character State]', error);
      res.status(500).json({ message: '删除角色状态失败' });
    }
  });

  // PUT /api/characters/:id/states/:stateId/activate - 激活状态
  router.put('/:id/states/:stateId/activate', authMiddleware, async (req, res) => {
    const userId = req.user.id;
    const { id, stateId } = req.params;

    try {
      // 验证角色所有权
      const character = await queryOne(
        'SELECT id, image_url FROM characters WHERE id = ? AND user_id = ?',
        [id, userId]
      );

      if (!character) {
        return res.status(404).json({ message: '角色不存在或无权访问' });
      }

      // 验证状态存在
      const state = await queryOne(
        'SELECT * FROM character_states WHERE id = ? AND character_id = ?',
        [stateId, id]
      );

      if (!state) {
        return res.status(404).json({ message: '状态不存在' });
      }

      // 记录前一个激活状态的取消激活历史，然后取消所有状态的激活
      await recordDeactivation(id, stateId, userId);

      await execute(
        'UPDATE character_states SET is_active = 0 WHERE character_id = ?',
        [id]
      );

      // 激活指定状态
      await execute(
        'UPDATE character_states SET is_active = 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
        [stateId]
      );

      // 更新角色主图为激活状态的主图（如果状态有图片）
      if (state.image_url || state.front_view_url) {
        const newImageUrl = state.image_url || state.front_view_url;
        await execute(
          'UPDATE characters SET image_url = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
          [newImageUrl, id]
        );
      }

      const updatedState = await queryOne('SELECT * FROM character_states WHERE id = ?', [stateId]);

      // 记录激活历史
      await recordStateHistory({
        characterId: id,
        stateId: parseInt(stateId),
        action: 'activated',
        performedBy: userId
      });

      res.json({ message: '状态已激活', state: updatedState });
    } catch (error) {
      console.error('[Activate Character State]', error);
      res.status(500).json({ message: '激活状态失败' });
    }
  });

  // POST /api/characters/:id/states/:stateId/duplicate - 复制状态
  router.post('/:id/states/:stateId/duplicate', authMiddleware, async (req, res) => {
    const userId = req.user.id;
    const { id, stateId } = req.params;
    const { newName } = req.body;

    try {
      // 验证角色所有权
      const character = await queryOne(
        'SELECT id FROM characters WHERE id = ? AND user_id = ?',
        [id, userId]
      );

      if (!character) {
        return res.status(404).json({ message: '角色不存在或无权访问' });
      }

      // 获取源状态
      const sourceState = await queryOne(
        'SELECT * FROM character_states WHERE id = ? AND character_id = ?',
        [stateId, id]
      );

      if (!sourceState) {
        return res.status(404).json({ message: '源状态不存在' });
      }

      // 获取当前最大排序值
      const maxOrder = await queryOne(
        'SELECT MAX(sort_order) as max_order FROM character_states WHERE character_id = ?',
        [id]
      );
      const newSortOrder = (maxOrder?.max_order || 0) + 1;

      // 创建复制的状态
      const result = await execute(
        `INSERT INTO character_states (
          character_id, name, description, appearance, image_url,
          front_view_url, side_view_url, back_view_url, sort_order,
          outfit, age_stage, hairstyle, accessories, is_active, generation_prompt, generation_status,
          state_category, tags
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, 'idle', ?, ?)`,
        [
          id,
          newName || `${sourceState.name} (副本)`,
          sourceState.description || '',
          sourceState.appearance || '',
          '', // 不复制图片，需要重新生成
          '', '', '', // 三视图也不复制
          newSortOrder,
          sourceState.outfit || '',
          sourceState.age_stage || '',
          sourceState.hairstyle || '',
          sourceState.accessories || '',
          sourceState.generation_prompt || '',
          sourceState.state_category || 'daily',
          sourceState.tags || null
        ]
      );

      const newState = await queryOne('SELECT * FROM character_states WHERE id = ?', [result.insertId]);

      // 记录复制历史
      await recordStateHistory({
        characterId: id,
        stateId: result.insertId,
        action: 'duplicated',
        snapshot: newState,
        performedBy: userId
      });

      res.status(201).json({ message: '状态复制成功', state: newState });
    } catch (error) {
      console.error('[Duplicate Character State]', error);
      res.status(500).json({ message: '复制状态失败' });
    }
  });

  // POST /api/characters/:id/states/:stateId/generate-views - 为状态生成三视图
  router.post('/:id/states/:stateId/generate-views', authMiddleware, async (req, res) => {
    const userId = req.user.id;
    const { id, stateId } = req.params;
    const { imageModel, textModel, regenerateOnly } = req.body;

    try {
      // 更新状态为生成中
      await execute(
        `UPDATE character_states SET generation_status = 'generating', updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
        [stateId]
      );

      // 通过 generationStartService 启动工作流
      const result = await generationStartService.start({
        operationKey: 'character_state_views_generate',
        rawInput: {
          characterId: Number(id),
          stateId: Number(stateId),
          imageModel,
          textModel,
          regenerateOnly
        },
        actor: { userId }
      });

      res.json(result.response || {
        message: '状态三视图生成已启动',
        jobId: result.jobId,
        characterId: Number(id),
        stateId: Number(stateId),
        status: 'generating'
      });
    } catch (error) {
      // 生成失败时重置状态
      await execute(
        `UPDATE character_states SET generation_status = 'failed', updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
        [stateId]
      ).catch(() => {});
      sendGenerationError(res, error, '启动状态三视图生成失败', '[Generate State Views]');
    }
  });

  // GET /api/characters/:id/active-state - 获取角色的激活状态
  router.get('/:id/active-state', authMiddleware, async (req, res) => {
    const userId = req.user.id;
    const { id } = req.params;

    try {
      // 验证角色所有权
      const character = await queryOne(
        'SELECT id FROM characters WHERE id = ? AND user_id = ?',
        [id, userId]
      );

      if (!character) {
        return res.status(404).json({ message: '角色不存在或无权访问' });
      }

      const activeState = await queryOne(
        'SELECT * FROM character_states WHERE character_id = ? AND is_active = 1',
        [id]
      );

      res.json({ state: activeState || null });
    } catch (error) {
      console.error('[Get Active State]', error);
      res.status(500).json({ message: '获取激活状态失败' });
    }
  });

  // POST /api/characters/:id/states/analyze - AI分析自然语言描述生成状态标签
  router.post('/:id/states/analyze', authMiddleware, async (req, res) => {
    const userId = req.user.id;
    const { id } = req.params;
    const { description, characterName, characterAppearance, textModel } = req.body;

    if (!description || !description.trim()) {
      return res.status(400).json({ message: '请输入状态描述' });
    }
    if (!textModel) {
      return res.status(400).json({ message: '请选择文本分析模型' });
    }

    try {
      // 验证角色所有权
      const character = await queryOne(
        'SELECT id FROM characters WHERE id = ? AND user_id = ?',
        [id, userId]
      );
      if (!character) {
        return res.status(404).json({ message: '角色不存在或无权访问' });
      }

      // 调用文本模型分析自然语言描述
      const handleBaseTextModelCall = require('../../nosyntask/tasks/base/baseTextModelCall');
      const analysisPrompt = `你是一个角色设计专家。请分析以下角色状态的自然语言描述，提取结构化的外貌属性。

角色名称：${characterName || '未命名角色'}
角色基础外貌：${characterAppearance || '无'}
状态描述：${description}

请提取以下属性并以 JSON 格式输出（不要包含任何其他内容）：
{
  "name": "状态名称（简短描述，如：战斗装、童年、晚礼服）",
  "age_stage": "年龄阶段（童年/少年/青年/中年/老年，如果描述中未提及则留空）",
  "outfit": "服装描述（详细描述服装款式、颜色、材质等，用中文）",
  "hairstyle": "发型描述（详细描述发型、发色等，用中文）",
  "accessories": "配饰描述（眼镜、饰品、武器等，用中文，逗号分隔）",
  "appearance": "综合外貌描述（结合角色基础外貌和当前状态变化的完整中文描述，重点突出与基础外貌不同的部分）"
}

注意：
1. 如果描述中只提到部分属性，其他属性留空字符串
2. appearance 应该是一个完整的、可以直接用于AI绘图提示词生成的中文外貌描述
3. outfit/hairstyle/accessories 要尽可能详细和具体
4. 保持输出纯JSON格式，不要有额外的解释`;

      const response = await handleBaseTextModelCall({
        prompt: analysisPrompt,
        textModel: textModel,
        maxTokens: 1024,
        temperature: 0.3
      });

      // 提取响应内容
      let content = '';
      if (typeof response === 'string') {
        content = response;
      } else if (response && response.content) {
        content = response.content;
      } else if (response && response.text) {
        content = response.text;
      } else if (response && response.message) {
        content = response.message;
      }

      // 解析 JSON
      let tags;
      try {
        // 尝试从 markdown 代码块中提取 JSON
        const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/) || content.match(/(\{[\s\S]*\})/);
        const jsonStr = jsonMatch ? jsonMatch[1].trim() : content.trim();
        tags = JSON.parse(jsonStr);
      } catch (parseErr) {
        console.error('[Analyze Character State] JSON 解析失败:', parseErr.message);
        // 回退：返回原始内容作为 appearance
        tags = {
          name: '',
          age_stage: '',
          outfit: '',
          hairstyle: '',
          accessories: '',
          appearance: description
        };
      }

      res.json({ tags });
    } catch (error) {
      console.error('[Analyze Character State]', error);
      res.status(500).json({ message: '分析失败' });
    }
  });
};
