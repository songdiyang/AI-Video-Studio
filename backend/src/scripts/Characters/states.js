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

/**
 * 白膜就绪守卫：校验角色是否已有白膜设定图或三视图
 * 返回 { ready: boolean, reason?: string, baseState?: object }
 * 规则：必须存在 is_base_model=1 且 image_url 或 front_view_url 任一非空的状态
 */
async function checkBaseModelReady(characterId) {
  const baseState = await queryOne(
    `SELECT id, image_url, front_view_url, side_view_url, back_view_url, generation_status
     FROM character_states
     WHERE character_id = ? AND is_base_model = 1
     ORDER BY id ASC LIMIT 1`,
    [characterId]
  );
  if (!baseState) {
    return { ready: false, reason: '角色尚未生成白膜状态，请先在角色管理中生成角色设定图' };
  }
  if (!baseState.front_view_url && !baseState.image_url) {
    return {
      ready: false,
      reason: '角色白膜设定图尚未生成完成，请先生成角色设定图再进行后续操作',
      baseState,
    };
  }
  return { ready: true, baseState };
}

/**
 * 服装就绪守卫：校验角色状态的关联服装是否已生成三视图
 * 仅对有关联 costume_id 的非白膜状态进行检查
 * 返回 { ready: boolean, reason?: string, costume?: object }
 */
async function checkCostumeReady(stateId) {
  const state = await queryOne(
    `SELECT id, is_base_model, costume_id FROM character_states WHERE id = ?`,
    [stateId]
  );
  // 白膜状态或无服装关联的状态无需检查
  if (!state || state.is_base_model || !state.costume_id) {
    return { ready: true };
  }
  const costume = await queryOne(
    `SELECT id, name, image_url, front_view_url, side_view_url, back_view_url, generation_status FROM costumes WHERE id = ?`,
    [state.costume_id]
  );
  if (!costume) {
    return { ready: false, reason: '关联的服装资源不存在，请重新创建或联系管理员' };
  }
  if (!costume.image_url && !costume.front_view_url) {
    return {
      ready: false,
      reason: `服装「${costume.name}」的设定图尚未生成，请先到资产管理页的服装 Tab 中生成服装设定图，再生成角色状态图`,
      costume,
    };
  }
  return { ready: true, costume };
}

/**
 * 道具就绪守卫：校验角色状态关联的已叠加道具 + held_props 文本道具是否已生成设定图
 * 1) 通过 character_state_props 关联的正式道具必须有 image_url
 * 2) held_props 文本描述在同项目中必须有同名道具且已生成设定图
 * 返回 { ready: boolean, reason?: string, props?: object[] }
 */
async function checkPropsReady(stateId) {
  const state = await queryOne(
    `SELECT cs.id, cs.is_base_model, cs.held_props, cs.character_id, ch.project_id
     FROM character_states cs
     JOIN characters ch ON cs.character_id = ch.id
     WHERE cs.id = ?`,
    [stateId]
  );
  // 白膜状态无需检查
  if (!state || state.is_base_model) {
    return { ready: true };
  }
  // 1) 查询 character_state_props 关联的正式道具
  const equippedProps = await queryAll(
    `SELECT p.id, p.name, p.image_url, p.generation_status
     FROM character_state_props csp
     JOIN props p ON csp.prop_id = p.id
     WHERE csp.character_state_id = ?`,
    [stateId]
  );
  if (equippedProps && equippedProps.length > 0) {
    const notReady = equippedProps.filter(p => !p.image_url);
    if (notReady.length > 0) {
      const names = notReady.map(p => `「${p.name}」`).join('、');
      return {
        ready: false,
        reason: `已叠加的道具 ${names} 的设定图尚未生成，请先到资产管理页的道具 Tab 中生成道具设定图，再生成角色状态图`,
        props: notReady,
      };
    }
  }
  // 2) 检查 held_props 文本描述对应的道具是否已有设定图
  // held_props 是 VARCHAR 字段，直接作为文本处理
  let heldPropsText = '';
  if (state.held_props) {
    heldPropsText = String(state.held_props);
  }
  if (heldPropsText.trim()) {
    heldPropsText = heldPropsText.trim();
    // 如果已关联道具中已包含同名道具则跳过
    const alreadyCovered = equippedProps && equippedProps.some(p => p.name === heldPropsText);
    if (!alreadyCovered) {
      const matchingProp = await queryOne(
        `SELECT id, name, image_url, generation_status
         FROM props WHERE project_id = ? AND name = ? LIMIT 1`,
        [state.project_id, heldPropsText]
      );
      if (!matchingProp || !matchingProp.image_url) {
        return {
          ready: false,
          reason: `手持道具「${heldPropsText}」的设定图尚未生成，请先到资产管理页的道具 Tab 中创建并生成道具设定图，再生成角色状态图`,
          props: matchingProp ? [matchingProp] : [],
        };
      }
    }
  }
  return { ready: true, props: equippedProps };
}

/**
 * 获取默认文本模型
 */
async function getDefaultTextModel() {
  const model = await queryOne(
    "SELECT name FROM ai_model_configs WHERE category = 'TEXT' AND is_active = 1 ORDER BY id ASC LIMIT 1"
  );
  return model?.name;
}

/**
 * 使用 AI 清洗白膜外貌特征
 * 只保留身体物理特征（年龄、身高、体型、肤色、发型发色、瞳色、疤痕等）
 * 去掉服饰描述、场景描述、性格/感情描述
 */
async function cleanAppearanceForBaseModel(appearance) {
  if (!appearance || appearance.trim().length === 0) return '';
  
  const textModel = await getDefaultTextModel();
  if (!textModel) {
    console.warn('[States] 无可用文本模型，跳过白膜外貌清洗');
    return appearance;
  }

  const handleBaseTextModelCall = require('../../nosyntask/tasks/base/baseTextModelCall');

  const prompt = `你是一个角色设计助手。请从以下角色外貌描述中，只提取【身体物理特征】，严格按以下规则处理：

【保留的内容】（只保留这些）：
- 年龄、性别
- 身高、体重、体型（偏瘦/健壮/矮小等）
- 肤色
- 发型、发色、发质
- 瞳色、眼型
- 脸型、五官特征
- 身体特征（疤痕、胎记、纹身等永久性身体标记）
- 体型比例

【必须去掉的内容】：
- 所有服装/服饰描述（衣服、裤子、裙子、鞋子、帽子、配饰等）
- 所有手持/携带道具描述（如剑、书本、胡萝卜、水杯、武器、包袋等手里拿着或身上携带的物品）
- 所有场景描述（"在xxx场景中"等）
- 所有性格/情感描述（"性格开朗"、"带有生活磨损感"等主观描述）
- 所有风格描述（"纪实风格"、"日常真实"等）

请直接输出清洗后的纯身体特征描述，用中文，保持简洁自然的语句。不要添加任何解释或标题。

原始描述：
${appearance}`;

  try {
    const response = await handleBaseTextModelCall({
      prompt,
      textModel: textModel,
      maxTokens: 1024,
      temperature: 0.3
    });

    let cleaned = '';
    if (typeof response === 'string') {
      cleaned = response;
    } else if (response?.content) {
      cleaned = response.content;
    } else if (response?.text) {
      cleaned = response.text;
    }

    cleaned = cleaned.trim().replace(/^["']|["']$/g, '');
    
    if (cleaned && cleaned.length > 5) {
      console.log(`[States] ✅ 白膜外貌清洗完成: ${appearance.length} → ${cleaned.length} 字`);
      return cleaned;
    }
    
    console.warn('[States] AI清洗结果为空，保留原始外貌');
    return appearance;
  } catch (error) {
    console.error('[States] 白膜外貌清洗失败:', error.message);
    return appearance;
  }
}

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

/**
 * 确保角色拥有白膜基础状态
 * 如果角色没有 is_base_model=1 的状态，自动创建一个
 * 支持老角色（创建时未自动生成白膜）和意外丢失的情况
 */
async function ensureBaseModelState(characterId) {
  const existing = await queryOne(
    'SELECT id FROM character_states WHERE character_id = ? AND is_base_model = 1',
    [characterId]
  );
  if (existing) return null; // 已有白膜，无需创建

  // 从角色表获取基础外貌和性别信息
  const character = await queryOne(
    'SELECT appearance, gender FROM characters WHERE id = ?',
    [characterId]
  );
  if (!character) return null;

  const result = await execute(
    `INSERT INTO character_states (
      character_id, is_base_model, name, description, appearance, gender, is_active, generation_status
    ) VALUES (?, 1, '基础白膜', '角色基础白膜版本，用于生成各状态的参考基准', ?, ?, 1, 'idle')`,
    [characterId, character.appearance || '', character.gender || 'unknown']
  );

  const newStateId = result.insertId;
  console.log(`[States] 角色 ${characterId} 自动创建白膜状态，ID: ${newStateId}`);

  // 异步清洗白膜外貌（去掉服饰/场景/感情描述，只保留身体特征）
  if (character.appearance) {
    cleanAppearanceForBaseModel(character.appearance).then(async (cleaned) => {
      if (cleaned !== character.appearance) {
        await execute(
          'UPDATE character_states SET appearance = ? WHERE id = ?',
          [cleaned, newStateId]
        );
        console.log(`[States] 角色 ${characterId} 白膜外貌已异步清洗`);
      }
    }).catch(err => {
      console.error(`[States] 角色 ${characterId} 白膜外貌清洗失败:`, err.message);
    });
  }

  return newStateId;
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

      // 确保白膜状态存在（兼容老角色）
      await ensureBaseModelState(id);

      const states = await queryAll(
        `SELECT s.*,
                c.id AS costume_id_ref, c.name AS costume_name, c.image_url AS costume_image_url,
                c.generation_status AS costume_generation_status, c.outfit_prompt AS costume_outfit_prompt
         FROM character_states s
         LEFT JOIN costumes c ON s.costume_id = c.id
         WHERE s.character_id = ?
         ORDER BY s.sort_order ASC, s.created_at ASC`,
        [id]
      );

      // 查询所有状态的关联道具
      const stateIds = states.map(s => s.id);
      let equippedPropsMap = {};
      if (stateIds.length > 0) {
        const propsRows = await queryAll(
          `SELECT csp.character_state_id,
                  p.id AS prop_id, p.name AS prop_name, p.image_url AS prop_image_url,
                  p.prop_type, csp.hand_position, csp.usage_mode
           FROM character_state_props csp
           JOIN props p ON csp.prop_id = p.id
           WHERE csp.character_state_id IN (${stateIds.map(() => '?').join(',')})`,
          stateIds
        );
        for (const row of propsRows) {
          if (!equippedPropsMap[row.character_state_id]) {
            equippedPropsMap[row.character_state_id] = [];
          }
          equippedPropsMap[row.character_state_id].push({
            prop_id: row.prop_id,
            name: row.prop_name,
            image_url: row.prop_image_url,
            prop_type: row.prop_type,
            hand_position: row.hand_position,
            usage_mode: row.usage_mode,
          });
        }
      }

      // 将查询结果中的服装字段和道具字段映射到状态对象
      const normalizedStates = states.map(row => ({
        ...row,
        costume_name: row.costume_name || null,
        costume_image_url: row.costume_image_url || null,
        costume_generation_status: row.costume_generation_status || null,
        costume_outfit_prompt: row.costume_outfit_prompt || null,
        equipped_props: equippedPropsMap[row.id] || [],
      }));

      res.json({ states: normalizedStates });
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
        // 兼容新旧格式：JSON数组包含该分类 或 旧格式精确匹配
        query = 'SELECT * FROM character_states WHERE character_id = ? AND (state_category LIKE ? OR state_category = ?) ORDER BY is_base_model DESC, sort_order ASC, created_at ASC';
        params = [id, `%"${category}"%`, category];
      } else {
        query = 'SELECT * FROM character_states WHERE character_id = ? ORDER BY is_base_model DESC, state_category ASC, sort_order ASC, created_at ASC';
        params = [id];
      }

      const states = await queryAll(query, params);

      // 辅助函数：解析状态分类（兼容旧单值和新JSON数组）
      const parseCategories = (cat) => {
        if (!cat) return ['daily'];
        try {
          const parsed = JSON.parse(cat);
          return Array.isArray(parsed) ? parsed : [cat];
        } catch { return [cat]; }
      };

      // 按分类分组返回（一个状态可出现在多个分类中）
      const grouped = {};
      for (const cat of STATE_CATEGORIES) {
        grouped[cat] = states.filter(s => parseCategories(s.state_category).includes(cat));
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
      outfit, age_stage, hairstyle, accessories, body_elements, held_props, is_active, generation_prompt,
      // 状态分类和标签
      state_category, tags,
      // 音色配置
      voice_config,
      // 自定义音色
      speaker_voice_id
    } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({ message: '状态名称不能为空' });
    }

    // 验证状态分类（支持单值或数组）
    let normalizedCategory = 'daily';
    if (state_category) {
      const cats = Array.isArray(state_category) ? state_category : [state_category];
      const invalid = cats.filter(c => !STATE_CATEGORIES.includes(c));
      if (invalid.length > 0) {
        return res.status(400).json({ message: `无效的状态分类: ${invalid.join(', ')}，可选值: ${STATE_CATEGORIES.join(', ')}` });
      }
      normalizedCategory = JSON.stringify(cats);
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

      // 硬强制：未完成白膜三视图的角色禁止创建服装/状态
      const baseCheck = await checkBaseModelReady(id);
      if (!baseCheck.ready) {
        return res.status(409).json({
          message: baseCheck.reason,
          code: 'BASE_MODEL_NOT_READY',
          baseState: baseCheck.baseState || null,
        });
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

      // 序列化音色配置
      const serializedVoiceConfig = voice_config !== undefined
        ? (typeof voice_config === 'string' ? voice_config : JSON.stringify(voice_config))
        : null;

      // 验证自定义音色（如果传了）
      let validatedSpeakerVoiceId = null;
      if (speaker_voice_id !== undefined && speaker_voice_id !== null) {
        const speakerVoice = await queryOne(
          'SELECT id, status FROM speaker_voices WHERE id = ? AND user_id = ?',
          [speaker_voice_id, userId]
        );
        if (!speakerVoice) {
          return res.status(404).json({ message: '自定义音色不存在或无权限' });
        }
        if (speakerVoice.status !== 'ready') {
          return res.status(400).json({ message: '自定义音色尚未就绪' });
        }
        validatedSpeakerVoiceId = speaker_voice_id;
      }

      const result = await execute(
        `INSERT INTO character_states (
          character_id, name, description, appearance, image_url,
          front_view_url, side_view_url, back_view_url, sort_order,
          outfit, age_stage, hairstyle, accessories, body_elements, held_props, is_active, generation_prompt, generation_status,
          state_category, tags, voice_config, speaker_voice_id
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'idle', ?, ?, ?, ?)`,
        [
          id, name.trim(), description || '', appearance || '', image_url || '',
          front_view_url || '', side_view_url || '', back_view_url || '', newSortOrder,
          outfit || '', age_stage || '', hairstyle || '', accessories || '', body_elements || null,
          // held_props 是 VARCHAR 字段，直接存储
          held_props || null,
          is_active ? 1 : 0, generation_prompt || '',
          normalizedCategory, parsedTags || '[]', serializedVoiceConfig,
          validatedSpeakerVoiceId
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
      outfit, age_stage, hairstyle, accessories, body_elements, held_props, is_active, generation_prompt, generation_status,
      // 状态分类和标签
      state_category, tags,
      // 音色配置
      voice_config,
      // 自定义音色
      speaker_voice_id
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
          console.warn('[Update Character State][400] tags parse failed:', { stateId, tags, err: err.message });
          return res.status(400).json({ message: '标签格式错误，应为JSON数组' });
        }
      }

      // 验证状态分类（支持单值或数组）
      let normalizedCategory = undefined;
      if (state_category !== undefined) {
        const cats = Array.isArray(state_category) ? state_category : (typeof state_category === 'string' && state_category.startsWith('[') ? JSON.parse(state_category) : [state_category]);
        const invalid = cats.filter(c => !STATE_CATEGORIES.includes(c));
        if (invalid.length > 0) {
          console.warn('[Update Character State][400] invalid state_category:', { stateId, state_category, cats, invalid });
          return res.status(400).json({ message: `无效的状态分类: ${invalid.join(', ')}，可选值: ${STATE_CATEGORIES.join(', ')}` });
        }
        normalizedCategory = JSON.stringify(cats);
      }

      // 检测外貌属性是否发生变化，若变化则清除旧的 generation_prompt
      // 确保下次生成时重新构建提示词，避免用过时的缓存
      const appearanceChanged = [
        ['appearance', appearance, existingState.appearance],
        ['outfit', outfit, existingState.outfit],
        ['age_stage', age_stage, existingState.age_stage],
        ['hairstyle', hairstyle, existingState.hairstyle],
        ['accessories', accessories, existingState.accessories],
        ['body_elements', body_elements, existingState.body_elements],
        ['held_props', held_props, existingState.held_props]
      ].some(([, newVal, oldVal]) => newVal !== undefined && String(newVal || '') !== String(oldVal || ''));

      // 如果外貌属性变了且未显式传入 generation_prompt，则清除它
      const finalGenerationPrompt = generation_prompt !== undefined
        ? generation_prompt
        : (appearanceChanged ? '' : (existingState.generation_prompt || ''));

      // 序列化音色配置
      const serializedVoiceConfig = voice_config !== undefined
        ? (typeof voice_config === 'string' ? voice_config : JSON.stringify(voice_config))
        : undefined;

      // 验证自定义音色（如果传了）
      let validatedSpeakerVoiceId = undefined;
      if (speaker_voice_id !== undefined) {
        if (speaker_voice_id === null) {
          validatedSpeakerVoiceId = null;
        } else {
          const speakerVoice = await queryOne(
            'SELECT id, status FROM speaker_voices WHERE id = ? AND user_id = ?',
            [speaker_voice_id, userId]
          );
          if (!speakerVoice) {
            return res.status(404).json({ message: '自定义音色不存在或无权限' });
          }
          if (speakerVoice.status !== 'ready') {
            return res.status(400).json({ message: '自定义音色尚未就绪' });
          }
          validatedSpeakerVoiceId = speaker_voice_id;
        }
      }

      // T8 新增：如果 held_props 被更新，自动同步到 props 表并建立关联
      if (held_props !== undefined && held_props) {
        try {
          // held_props 是 VARCHAR，直接按逗号分隔
          const propsList = String(held_props).split(/[,，]/).map(s => s.trim()).filter(Boolean);

          // 获取角色信息
          const character = await queryOne(
            'SELECT id, name, project_id FROM characters WHERE id = ?',
            [id]
          );
          const charProjectId = character?.project_id || projectId;

          for (const propName of propsList) {
            if (!propName || !String(propName).trim()) continue;
            const pName = String(propName).trim();

            // 检查是否已存在同名道具
            let prop = await queryOne(
              'SELECT id FROM props WHERE project_id = ? AND name = ?',
              [charProjectId, pName]
            );

            if (!prop) {
              // 创建新道具
              const result = await execute(
                `INSERT INTO props (user_id, project_id, name, description, category, prop_type, generation_status)
                 VALUES (?, ?, ?, ?, ?, ?, ?)`,
                [userId, charProjectId, pName, `角色「${character?.name || ''}」手持道具：${pName}`, '手持道具', 'interactive', 'idle']
              );
              prop = { id: result.insertId };
              console.log(`[Update Character State] 自动创建道具: ${pName} (id=${prop.id})`);
            }

            // 建立 character_state_props 关联
            const existingLink = await queryOne(
              'SELECT id FROM character_state_props WHERE character_state_id = ? AND prop_id = ?',
              [stateId, prop.id]
            );
            if (!existingLink) {
              await execute(
                `INSERT INTO character_state_props (character_state_id, prop_id, prop_type, is_equipped, hand_position, usage_mode)
                 VALUES (?, ?, ?, 1, 'right_hand', 'held')`,
                [stateId, prop.id, 'interactive']
              );
              console.log(`[Update Character State] 建立道具关联: state=${stateId} prop=${prop.id}`);
            }
          }
        } catch (propErr) {
          console.warn('[Update Character State] 同步 held_props 到 props 表失败:', propErr.message);
          // 不影响主流程
        }
      }

      await execute(
        `UPDATE character_states
         SET name = ?, description = ?, appearance = ?, image_url = ?,
             front_view_url = ?, side_view_url = ?, back_view_url = ?, sort_order = ?,
             outfit = ?, age_stage = ?, hairstyle = ?, accessories = ?, body_elements = ?, held_props = ?,
             is_active = ?, generation_prompt = ?, generation_status = ?,
             state_category = ?, tags = ?, voice_config = ?, speaker_voice_id = ?,
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
          body_elements !== undefined ? (body_elements || null) : (existingState.body_elements || null),
          // held_props 是 VARCHAR 字段，直接存储
          held_props !== undefined
            ? (held_props || null)
            : existingState.held_props,
          is_active !== undefined ? (is_active ? 1 : 0) : existingState.is_active,
          finalGenerationPrompt,
          generation_status !== undefined ? generation_status : (existingState.generation_status || 'idle'),
          normalizedCategory !== undefined ? normalizedCategory : (existingState.state_category || '["daily"]'),
          parsedTags !== null ? parsedTags : (existingState.tags ? JSON.stringify(existingState.tags) : '[]'),
          serializedVoiceConfig !== undefined ? serializedVoiceConfig : existingState.voice_config,
          validatedSpeakerVoiceId !== undefined ? validatedSpeakerVoiceId : existingState.speaker_voice_id,
          stateId
        ]
      );

      const state = await queryOne('SELECT * FROM character_states WHERE id = ?', [stateId]);

      // 计算变更差异并记录历史
      const trackFields = ['name', 'description', 'appearance', 'image_url', 'front_view_url', 'side_view_url', 'back_view_url', 'sort_order', 'outfit', 'age_stage', 'hairstyle', 'accessories', 'body_elements', 'held_props', 'is_active', 'generation_prompt', 'generation_status', 'state_category', 'tags'];
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

  // DELETE /api/characters/:id/states/:stateId/base-model-image - 清空白膜角色设定图（让用户可重新生成）
  // 同步清空 character_states.image_url 与 characters.image_url / character_sheet_url
  router.delete('/:id/states/:stateId/base-model-image', authMiddleware, async (req, res) => {
    const userId = req.user.id;
    const { id, stateId } = req.params;

    try {
      const character = await queryOne(
        'SELECT id FROM characters WHERE id = ? AND user_id = ?',
        [id, userId]
      );
      if (!character) {
        return res.status(404).json({ message: '角色不存在或无权访问' });
      }

      const existingState = await queryOne(
        'SELECT * FROM character_states WHERE id = ? AND character_id = ?',
        [stateId, id]
      );
      if (!existingState) {
        return res.status(404).json({ message: '状态不存在' });
      }
      if (!existingState.is_base_model) {
        return res.status(400).json({ message: '仅白膜状态支持该操作' });
      }

      // 清空白膜状态的设定图及三视图 URL，同时清除 generation_prompt 避免下次生成沿用旧 prompt
      await execute(
        `UPDATE character_states
         SET image_url = '', front_view_url = '', side_view_url = '', back_view_url = '',
             generation_status = 'idle', generation_prompt = '', updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [stateId]
      );

      // 同步清空 characters 表中的冗余字段，避免列表/头像 fallback 仍显示旧图
      await execute(
        `UPDATE characters
         SET image_url = '', character_sheet_url = '', updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [id]
      );

      // 记录历史
      await recordStateHistory({
        characterId: id,
        stateId: parseInt(stateId),
        action: 'updated',
        changes: {
          image_url: { from: existingState.image_url, to: '' },
          front_view_url: { from: existingState.front_view_url, to: '' },
          side_view_url: { from: existingState.side_view_url, to: '' },
          back_view_url: { from: existingState.back_view_url, to: '' },
          generation_status: { from: existingState.generation_status, to: 'idle' }
        },
        performedBy: userId
      });

      const state = await queryOne('SELECT * FROM character_states WHERE id = ?', [stateId]);
      res.json({ message: '白膜角色设定图已清除', state });
    } catch (error) {
      console.error('[Delete Base Model Image]', error);
      res.status(500).json({ message: '清除白膜角色设定图失败' });
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
          outfit, age_stage, hairstyle, accessories, body_elements, held_props, is_active, generation_prompt, generation_status,
          state_category, tags
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, 'idle', ?, ?)`,
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
          sourceState.body_elements || null,
          // held_props 是 VARCHAR 字段，直接传递
          sourceState.held_props,
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
    const { imageModel, textModel, regenerateOnly, customPromptFront, customPromptSide, customPromptBack } = req.body;

    try {
      // 前置校验：状态必须存在
      const existingState = await queryOne(
        'SELECT id, is_base_model FROM character_states WHERE id = ? AND character_id = ?',
        [stateId, id]
      );
      if (!existingState) {
        return res.status(404).json({ message: '角色状态不存在' });
      }

      // 硬强制：非白膜状态必须白膜就绪后才能生成三视图
      if (!existingState.is_base_model) {
        const baseCheck = await checkBaseModelReady(id);
        if (!baseCheck.ready) {
          return res.status(409).json({
            message: baseCheck.reason,
            code: 'BASE_MODEL_NOT_READY',
            baseState: baseCheck.baseState || null,
          });
        }
        // 检查关联服装是否已生成三视图
        const costumeCheck = await checkCostumeReady(stateId);
        if (!costumeCheck.ready) {
          return res.status(409).json({
            message: costumeCheck.reason,
            code: 'COSTUME_NOT_READY',
            costume: costumeCheck.costume || null,
          });
        }
        // 检查关联道具是否已生成设定图
        const propsCheck = await checkPropsReady(stateId);
        if (!propsCheck.ready) {
          return res.status(409).json({
            message: propsCheck.reason,
            code: 'PROPS_NOT_READY',
            props: propsCheck.props || null,
          });
        }
      }

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
          regenerateOnly,
          customPromptFront,
          customPromptSide,
          customPromptBack
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

  // POST /api/characters/:id/states/:stateId/props - 为角色状态叠加道具
  router.post('/:id/states/:stateId/props', authMiddleware, async (req, res) => {
    const userId = req.user.id;
    const { id, stateId } = req.params;
    const { propId, handPosition = 'right', usageMode = 'hold' } = req.body;

    if (!propId) {
      return res.status(400).json({ message: '道具ID不能为空' });
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

      // 验证状态存在
      const state = await queryOne(
        'SELECT * FROM character_states WHERE id = ? AND character_id = ?',
        [stateId, id]
      );
      if (!state) {
        return res.status(404).json({ message: '状态不存在' });
      }

      // 验证道具存在且属于同一项目
      const prop = await queryOne(
        `SELECT p.* FROM props p
         JOIN characters ch ON ch.project_id = p.project_id
         WHERE p.id = ? AND ch.id = ?`,
        [propId, id]
      );
      if (!prop) {
        return res.status(404).json({ message: '道具不存在或不属于当前项目' });
      }

      // 检查是否已叠加
      const existing = await queryOne(
        'SELECT * FROM character_state_props WHERE character_state_id = ? AND prop_id = ?',
        [stateId, propId]
      );
      if (existing) {
        // 更新手持位置和持握方式
        await execute(
          `UPDATE character_state_props
           SET hand_position = ?, usage_mode = ?, updated_at = CURRENT_TIMESTAMP
           WHERE character_state_id = ? AND prop_id = ?`,
          [handPosition, usageMode, stateId, propId]
        );
      } else {
        // 插入新关联
        await execute(
          `INSERT INTO character_state_props
             (character_state_id, prop_id, prop_type, is_equipped, hand_position, usage_mode)
           VALUES (?, ?, ?, 1, ?, ?)`,
          [stateId, propId, prop.prop_type || 'permanent', handPosition, usageMode]
        );
      }

      // 清除 generation_prompt，下次生成时会重新构建 prompt（包含道具）
      await execute(
        `UPDATE character_states SET generation_prompt = '', updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
        [stateId]
      );

      // 记录历史
      await recordStateHistory({
        characterId: id,
        stateId: parseInt(stateId),
        action: 'prop_equipped',
        changes: { prop_id: propId, prop_name: prop.name, hand_position: handPosition, usage_mode: usageMode },
        performedBy: userId
      });

      res.json({ message: `道具「${prop.name}」已叠加到状态`, prop_id: propId });
    } catch (error) {
      console.error('[Equip Prop]', error);
      res.status(500).json({ message: '叠加道具失败' });
    }
  });

  // DELETE /api/characters/:id/states/:stateId/props/:propId - 解绑道具
  router.delete('/:id/states/:stateId/props/:propId', authMiddleware, async (req, res) => {
    const userId = req.user.id;
    const { id, stateId, propId } = req.params;

    try {
      // 验证角色所有权
      const character = await queryOne(
        'SELECT id FROM characters WHERE id = ? AND user_id = ?',
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

      // 获取道具信息用于返回
      const prop = await queryOne(
        'SELECT name FROM props WHERE id = ?',
        [propId]
      );

      // 删除关联
      await execute(
        'DELETE FROM character_state_props WHERE character_state_id = ? AND prop_id = ?',
        [stateId, propId]
      );

      // 同步更新 held_props 字段：移除已解绑的道具名称
      const stateHeldProps = await queryOne('SELECT held_props FROM character_states WHERE id = ?', [stateId]);
      if (stateHeldProps && stateHeldProps.held_props && prop?.name) {
        const propName = prop.name;
        // held_props 是 VARCHAR，直接按逗号分隔
        const heldPropsList = String(stateHeldProps.held_props).split(/[,，]/).map(s => s.trim()).filter(Boolean);
        const newHeldProps = heldPropsList.filter(name => name !== propName);
        const newHeldPropsValue = newHeldProps.length > 0 ? newHeldProps.join('，') : null;
        await execute(
          'UPDATE character_states SET held_props = ? WHERE id = ?',
          [newHeldPropsValue, stateId]
        );
      }

      // 清除 generation_prompt
      await execute(
        `UPDATE character_states SET generation_prompt = '', updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
        [stateId]
      );

      // 记录历史
      await recordStateHistory({
        characterId: id,
        stateId: parseInt(stateId),
        action: 'prop_unequipped',
        changes: { prop_id: parseInt(propId), prop_name: prop?.name },
        performedBy: userId
      });

      res.json({ message: `道具「${prop?.name || ''}」已解绑`, prop_id: parseInt(propId) });
    } catch (error) {
      console.error('[Unequip Prop]', error);
      res.status(500).json({ message: '解绑道具失败' });
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

  // POST /api/characters/:id/states/analyze - AI分析自然语言描述生成状态标签或音色配置
  router.post('/:id/states/analyze', authMiddleware, async (req, res) => {
    const userId = req.user.id;
    const { id } = req.params;
    const { description, characterName, characterAppearance, textModel, type } = req.body;

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

      // 调用文本模型分析
      const handleBaseTextModelCall = require('../../nosyntask/tasks/base/baseTextModelCall');

      let analysisPrompt;
      if (type === 'voice') {
        // 音色分析模式
        analysisPrompt = `你是一位声音设计专家，擅长根据角色设定推断最适合的音色特征。

角色名称：${characterName || '未命名角色'}
角色基础外貌：${characterAppearance || '无'}
状态描述：${description || '无'}

请分析这个角色应该拥有什么样的声音，并输出以下 JSON 格式（不要包含任何其他内容）：
{
  "voice_description": "音色中文描述（如：清脆甜美的少女音，带有一点害羞的颤音；或低沉稳重的成年男性嗓音）",
  "gender": "性别（male/female/neutral）",
  "age_group": "年龄段（child/teen/young/middle/elder）",
  "language": "主要语言（如 zh-CN）",
  "emotion": "情感基调（neutral/cheerful/sad/angry/excited/calm/shy/brave）",
  "style": "声音风格（gentle/lively/serious/playful/elegant/rough/soft）",
  "speed": 语速数值（0.5~2.0，正常为1.0）,
  "pitch": 音高数值（-10~10，正常为0）,
  "volume": 音量数值（0.5~2.0，正常为1.0）,
  "dialect": "方言（如无方言留空字符串）",
  "seedance_prompt": "Seedance 1.5 英文音色提示词（用英文描述该角色的声音特征、语气、情感，用于 AI 视频生成时的配音描述）"
}

注意：
1. 请根据角色的年龄、性别、外貌、性格推断最合适的音色
2. speed/pitch/volume 输出数字，不要带引号
3. 保持输出纯JSON格式，不要有额外的解释`;
      } else {
        // 默认：外貌属性分析模式
        if (!description || !description.trim()) {
          return res.status(400).json({ message: '请输入状态描述' });
        }
        analysisPrompt = `你是一个角色设计专家。请分析以下角色状态的自然语言描述，提取结构化的外貌属性。

角色名称：${characterName || '未命名角色'}
角色基础外貌：${characterAppearance || '无'}
状态描述：${description}

请提取以下属性并以 JSON 格式输出（不要包含任何其他内容）：
{
  "name": "状态名称（简短描述，如：战斗装、童年、晚礼服）",
  "age_stage": "年龄阶段（童年/少年/青年/中年/老年，如果描述中未提及则留空）",
  "outfit": "服装描述（详细描述服装款式、颜色、材质等，用中文）",
  "hairstyle": "发型描述（详细描述发型、发色等，用中文）",
  "accessories": "配饰描述（眼镜、饰品、项链等佩戴在身上的饰品，用中文，逗号分隔）",
  "held_props": "手持道具描述（当前状态下角色手里拿着或身上携带的物品，如剑、书本、胡萝卜、水杯、武器、包袋等，用中文，逗号分隔）",
  "appearance": "综合外貌描述（结合角色基础外貌和当前状态变化的完整中文描述，重点突出与基础外貌不同的部分，不要包含服装/配饰/手持道具等可变状态属性）"
}

注意：
1. 如果描述中只提到部分属性，其他属性留空字符串
2. appearance 应该是一个完整的、可以直接用于AI绘图提示词生成的中文外貌描述
3. outfit/hairstyle/accessories 要尽可能详细和具体
4. 保持输出纯JSON格式，不要有额外的解释`;
      }

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

// 导出守卫函数，供其他模块（linkCharacters、styledImages、create）复用
module.exports.checkBaseModelReady = checkBaseModelReady;
module.exports.ensureBaseModelState = ensureBaseModelState;
