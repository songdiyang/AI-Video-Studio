/**
 * 角色状态管理 API
 * 端点:
 * - GET /api/characters/:id/states - 获取角色的所有状态
 * - POST /api/characters/:id/states - 创建新状态
 * - PUT /api/characters/:id/states/:stateId - 更新状态
 * - DELETE /api/characters/:id/states/:stateId - 删除状态
 * - PUT /api/characters/:id/states/:stateId/activate - 激活状态
 * - POST /api/characters/:id/states/:stateId/generate-views - 为状态生成三视图
 * - POST /api/characters/:id/states/:stateId/duplicate - 复制状态
 */
const { queryOne, queryAll, execute } = require('../../dbHelper');
const { authMiddleware } = require('../../middleware');

// 年龄阶段选项
const AGE_STAGES = ['童年', '少年', '青年', '中年', '老年'];

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

  // POST /api/characters/:id/states - 创建新状态
  router.post('/:id/states', authMiddleware, async (req, res) => {
    const userId = req.user.id;
    const { id } = req.params;
    const { 
      name, description, appearance, image_url, 
      front_view_url, side_view_url, back_view_url, sort_order,
      // 新增外观属性字段
      outfit, age_stage, hairstyle, accessories, is_active, generation_prompt
    } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({ message: '状态名称不能为空' });
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

      // 如果要激活新状态，先取消其他状态的激活
      if (is_active) {
        await execute(
          'UPDATE character_states SET is_active = 0 WHERE character_id = ?',
          [id]
        );
      }

      const result = await execute(
        `INSERT INTO character_states (
          character_id, name, description, appearance, image_url, 
          front_view_url, side_view_url, back_view_url, sort_order,
          outfit, age_stage, hairstyle, accessories, is_active, generation_prompt, generation_status
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'idle')`,
        [
          id, name.trim(), description || '', appearance || '', image_url || '',
          front_view_url || '', side_view_url || '', back_view_url || '', newSortOrder,
          outfit || '', age_stage || '', hairstyle || '', accessories || '', is_active ? 1 : 0, generation_prompt || ''
        ]
      );

      const state = await queryOne('SELECT * FROM character_states WHERE id = ?', [result.insertId]);
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
      outfit, age_stage, hairstyle, accessories, is_active, generation_prompt, generation_status
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

      // 如果要激活此状态，先取消其他状态的激活
      if (is_active && !existingState.is_active) {
        await execute(
          'UPDATE character_states SET is_active = 0 WHERE character_id = ?',
          [id]
        );
      }

      await execute(
        `UPDATE character_states 
         SET name = ?, description = ?, appearance = ?, image_url = ?, 
             front_view_url = ?, side_view_url = ?, back_view_url = ?, sort_order = ?,
             outfit = ?, age_stage = ?, hairstyle = ?, accessories = ?, 
             is_active = ?, generation_prompt = ?, generation_status = ?,
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
          generation_prompt !== undefined ? generation_prompt : (existingState.generation_prompt || ''),
          generation_status !== undefined ? generation_status : (existingState.generation_status || 'idle'),
          stateId
        ]
      );

      const state = await queryOne('SELECT * FROM character_states WHERE id = ?', [stateId]);
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
        'SELECT id FROM character_states WHERE id = ? AND character_id = ?',
        [stateId, id]
      );

      if (!existingState) {
        return res.status(404).json({ message: '状态不存在' });
      }

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

      // 取消所有状态的激活
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
          outfit, age_stage, hairstyle, accessories, is_active, generation_prompt, generation_status
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, 'idle')`,
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
          sourceState.generation_prompt || ''
        ]
      );

      const newState = await queryOne('SELECT * FROM character_states WHERE id = ?', [result.insertId]);
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
      // 验证角色所有权
      const character = await queryOne(
        'SELECT * FROM characters WHERE id = ? AND user_id = ?',
        [id, userId]
      );

      if (!character) {
        return res.status(404).json({ message: '角色不存在或无权访问' });
      }

      // 获取状态信息
      const state = await queryOne(
        'SELECT * FROM character_states WHERE id = ? AND character_id = ?',
        [stateId, id]
      );

      if (!state) {
        return res.status(404).json({ message: '状态不存在' });
      }

      // 构建生成提示词
      const promptParts = [character.name];
      if (state.appearance) promptParts.push(state.appearance);
      if (state.outfit) promptParts.push(`服装: ${state.outfit}`);
      if (state.age_stage) promptParts.push(`年龄: ${state.age_stage}`);
      if (state.hairstyle) promptParts.push(`发型: ${state.hairstyle}`);
      if (state.accessories) promptParts.push(`配饰: ${state.accessories}`);
      
      const generationPrompt = state.generation_prompt || promptParts.join(', ');

      // 更新状态为生成中
      await execute(
        `UPDATE character_states 
         SET generation_status = 'generating', generation_prompt = ?, updated_at = CURRENT_TIMESTAMP 
         WHERE id = ?`,
        [generationPrompt, stateId]
      );

      // 调用生成服务（这里需要根据实际的生成服务进行调整）
      // 目前返回状态，让前端轮询
      const updatedState = await queryOne('SELECT * FROM character_states WHERE id = ?', [stateId]);
      
      res.json({ 
        message: '三视图生成任务已启动',
        state: updatedState,
        generationPrompt
      });
    } catch (error) {
      console.error('[Generate State Views]', error);
      res.status(500).json({ message: '启动生成失败' });
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
};
