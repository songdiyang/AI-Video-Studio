/**
 * 角色当前装配 + 合成预览 API
 *
 * 装配模型：characters.active_costume_state_id / active_expression_state_id
 *   - 全局装配（同一角色跨项目共享装配），由 T1 迁移已加字段
 *
 * 端点：
 * - GET  /api/characters/:id/loadout                           读取当前装配
 * - PUT  /api/characters/:id/loadout                           设置当前装配 { costumeStateId?, expressionStateId? }
 * - GET  /api/characters/:id/composite?projectId=X             获取合成预览：合成 URL + 合成 prompt
 *                                                              基于：白膜(按项目画风) + 服装描述 + 状态描述 + 项目画风
 */
const { queryOne, execute } = require('../../dbHelper');
const { authMiddleware } = require('../../middleware');
const { getVisualStylePrompt } = require('../../utils/getProjectStyle');
const { checkBaseModelReady } = require('./states');

/**
 * 校验角色归属
 */
async function requireCharacterOwned(userId, characterId) {
  const character = await queryOne(
    'SELECT * FROM characters WHERE id = ?',
    [characterId]
  );
  if (!character) {
    return { error: { status: 404, message: '角色不存在' } };
  }
  if (character.user_id !== userId) {
    return { error: { status: 403, message: '无权访问该角色' } };
  }
  return { character };
}

/**
 * 校验状态归属：状态必须属于该角色，否则抛错
 * 返回 character_states 行（或 null 表示 id=null）
 */
async function loadStateInCharacter(characterId, stateId) {
  if (stateId == null) return null;
  const row = await queryOne(
    'SELECT * FROM character_states WHERE id = ? AND character_id = ?',
    [stateId, characterId]
  );
  return row || null;
}

module.exports = (router) => {
  // GET 当前装配
  router.get('/:id/loadout', authMiddleware, async (req, res) => {
    const userId = req.user.id;
    const { id } = req.params;

    try {
      const check = await requireCharacterOwned(userId, id);
      if (check.error) return res.status(check.error.status).json({ message: check.error.message });
      const character = check.character;

      const costume = character.active_costume_state_id
        ? await loadStateInCharacter(character.id, character.active_costume_state_id)
        : null;
      const expression = character.active_expression_state_id
        ? await loadStateInCharacter(character.id, character.active_expression_state_id)
        : null;

      res.json({
        characterId: character.id,
        loadout: {
          costumeStateId: character.active_costume_state_id || null,
          expressionStateId: character.active_expression_state_id || null,
          costume,
          expression,
        },
      });
    } catch (error) {
      console.error('[Loadout GET]', error);
      res.status(500).json({ message: '获取装配信息失败' });
    }
  });

  // PUT 更新当前装配
  router.put('/:id/loadout', authMiddleware, async (req, res) => {
    const userId = req.user.id;
    const { id } = req.params;
    const { costumeStateId, expressionStateId } = req.body || {};

    try {
      const check = await requireCharacterOwned(userId, id);
      if (check.error) return res.status(check.error.status).json({ message: check.error.message });

      // 校验引用的状态必须属于该角色（允许 null 清空）
      if (costumeStateId !== undefined && costumeStateId !== null) {
        const state = await loadStateInCharacter(id, costumeStateId);
        if (!state) return res.status(400).json({ message: '指定的服装状态不属于该角色' });
      }
      if (expressionStateId !== undefined && expressionStateId !== null) {
        const state = await loadStateInCharacter(id, expressionStateId);
        if (!state) return res.status(400).json({ message: '指定的表情/姿态状态不属于该角色' });
      }

      // 动态 SET 片段
      const sets = [];
      const params = [];
      if (costumeStateId !== undefined) {
        sets.push('active_costume_state_id = ?');
        params.push(costumeStateId === null ? null : Number(costumeStateId));
      }
      if (expressionStateId !== undefined) {
        sets.push('active_expression_state_id = ?');
        params.push(expressionStateId === null ? null : Number(expressionStateId));
      }

      if (sets.length === 0) {
        return res.status(400).json({ message: '未提供任何需要更新的字段' });
      }

      params.push(id);
      await execute(`UPDATE characters SET ${sets.join(', ')} WHERE id = ?`, params);

      const character = await queryOne('SELECT * FROM characters WHERE id = ?', [id]);
      res.json({
        message: '装配已更新',
        characterId: character.id,
        loadout: {
          costumeStateId: character.active_costume_state_id || null,
          expressionStateId: character.active_expression_state_id || null,
        },
      });
    } catch (error) {
      console.error('[Loadout PUT]', error);
      res.status(500).json({ message: '更新装配失败' });
    }
  });

  // GET 合成预览
  // 返回：合成 prompt（供分镜帧生成拼接）+ 推荐显示 URL（按优先级回退）
  router.get('/:id/composite', authMiddleware, async (req, res) => {
    const userId = req.user.id;
    const { id } = req.params;
    const projectId = Number(req.query.projectId);
    const costumeOverride = req.query.costumeStateId ? Number(req.query.costumeStateId) : undefined;
    const expressionOverride = req.query.expressionStateId ? Number(req.query.expressionStateId) : undefined;

    if (!projectId) return res.status(400).json({ message: '缺少 projectId 参数' });

    try {
      const check = await requireCharacterOwned(userId, id);
      if (check.error) return res.status(check.error.status).json({ message: check.error.message });
      const character = check.character;

      // 白膜必须就绪才能合成
      const baseCheck = await checkBaseModelReady(character.id);
      if (!baseCheck.ready) {
        return res.status(409).json({
          message: baseCheck.reason,
          code: 'BASE_MODEL_NOT_READY',
        });
      }
      const baseState = baseCheck.baseState;

      // 装配来源：优先使用 query override，否则用 characters 表的持久字段
      const costumeStateId = costumeOverride !== undefined
        ? costumeOverride
        : (character.active_costume_state_id || null);
      const expressionStateId = expressionOverride !== undefined
        ? expressionOverride
        : (character.active_expression_state_id || null);

      const costume = await loadStateInCharacter(character.id, costumeStateId);
      const expression = await loadStateInCharacter(character.id, expressionStateId);

      // 项目画风提示词
      const visualStylePrompt = await getVisualStylePrompt(projectId);

      // 显示 URL 回退策略：
      // 1) 服装状态原始 front_view_url
      // 2) 白膜原始 front_view_url
      const previewUrl =
        (costume && costume.front_view_url) ||
        baseState.front_view_url ||
        null;

      // 合成 prompt：白膜身体描述 + 服装 + 状态 + 项目画风
      const promptParts = [];
      if (baseState.appearance) promptParts.push(`【身体基础】${baseState.appearance}`);
      if (costume) {
        const costumeBits = [
          costume.outfit && `服装：${costume.outfit}`,
          costume.hairstyle && `发型：${costume.hairstyle}`,
          costume.accessories && `配饰：${costume.accessories}`,
          costume.appearance && `外观：${costume.appearance}`,
        ].filter(Boolean);
        if (costumeBits.length) promptParts.push(`【服装】${costumeBits.join('；')}`);
      }
      if (expression) {
        const exprBits = [
          expression.name && `状态：${expression.name}`,
          expression.description && `说明：${expression.description}`,
          expression.appearance && `外观：${expression.appearance}`,
        ].filter(Boolean);
        if (exprBits.length) promptParts.push(`【状态】${exprBits.join('；')}`);
      }
      if (visualStylePrompt) promptParts.push(`【画风】${visualStylePrompt}`);

      const compositePrompt = promptParts.join('\n');

      res.json({
        characterId: character.id,
        characterName: character.name,
        projectId,
        loadout: {
          costumeStateId: costumeStateId || null,
          expressionStateId: expressionStateId || null,
          costume,
          expression,
        },
        baseState,
        previewUrl,
        compositePrompt,
        visualStylePrompt,
        // 便于前端展示各来源是否命中
        sources: {
          costumeRawHit: !!(costume && costume.front_view_url),
        },
      });
    } catch (error) {
      console.error('[Composite GET]', error);
      res.status(500).json({ message: '获取合成预览失败' });
    }
  });
};
