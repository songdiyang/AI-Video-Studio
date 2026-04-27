const { queryOne, execute } = require('../../dbHelper');
const { authMiddleware } = require('../../middleware');
const { getEffectiveProjectRole } = require('../../middleware/collaborationAuth');

// POST / - 创建角色
module.exports = (router) => {
  router.post('/', authMiddleware, async (req, res) => {
    const userId = req.user.id;
    const { 
      projectId, name, description, appearance, personality, gender,
      base_appearance, outfit_appearance,
      image_url, tags, tag_groups_json, autoGenerateBaseModel 
    } = req.body;

    if (!name) {
      return res.status(400).json({ message: '角色名称不能为空' });
    }

    if (!projectId) {
      return res.status(400).json({ message: '项目ID不能为空' });
    }

    try {
      // 验证项目权限（支持团队成员创建）
      const role = await getEffectiveProjectRole(userId, projectId);
      if (!role || role === 'viewer') {
        return res.status(403).json({ message: '无权在该项目中创建角色' });
      }
      // 处理 tag_groups_json，确保是有效的 JSON 字符串
      let tagGroupsStr = null;
      if (tag_groups_json) {
        tagGroupsStr = typeof tag_groups_json === 'string' 
          ? tag_groups_json 
          : JSON.stringify(tag_groups_json);
      }

      // 解析分层外貌：如果传入了 base_appearance 则使用，否则从 appearance 推导
      const effectiveBaseAppearance = base_appearance || appearance || '';
      const effectiveOutfitAppearance = outfit_appearance || '';
      const effectiveAppearance = appearance || [effectiveBaseAppearance, effectiveOutfitAppearance].filter(Boolean).join('；') || '';

      // 创建角色（包含性别字段 + 分层外貌字段）
      const result = await execute(
        `INSERT INTO characters (user_id, project_id, name, description, appearance, base_appearance, outfit_appearance, personality, gender, image_url, tags, tag_groups_json) 
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [userId, projectId, name, description || '', effectiveAppearance, effectiveBaseAppearance, effectiveOutfitAppearance, personality || '', gender || 'unknown', image_url || '', tags || '', tagGroupsStr]
      );

      const characterId = result.insertId;

      // 自动创建"基础白膜"状态 - 使用 base_appearance 而非完整 appearance
      const baseStateResult = await execute(
        `INSERT INTO character_states (
          character_id, is_base_model, name, description, appearance, gender, is_active, generation_status
        ) VALUES (?, 1, '基础白膜', '角色基础白膜版本，用于生成各剧集状态的参考', ?, ?, 1, 'idle')`,
        [characterId, effectiveBaseAppearance, gender || 'unknown']
      );

      // 自动创建"默认服装"状态 - outfit 使用 outfit_appearance
      const costumeStateResult = await execute(
        `INSERT INTO character_states (
          character_id, is_base_model, name, description, appearance, outfit, gender, is_active, generation_status, state_category
        ) VALUES (?, 0, '默认服装', '角色默认服装状态', ?, ?, ?, 0, 'idle', '"costume"')`,
        [characterId, effectiveAppearance, effectiveOutfitAppearance, gender || 'unknown']
      );

      const character = await queryOne('SELECT * FROM characters WHERE id = ?', [characterId]);
      const baseState = await queryOne('SELECT * FROM character_states WHERE id = ?', [baseStateResult.insertId]);
      const costumeState = await queryOne('SELECT * FROM character_states WHERE id = ?', [costumeStateResult.insertId]);

      console.log(`[Character Create] 角色 ${name} 创建成功，ID: ${characterId}，已自动创建基础白膜+默认服装状态`);

      // 如果设置了自动生成白膜（默认不自动生成，由前端决定是否触发）
      let workflowJobId = null;
      if (autoGenerateBaseModel && gender && gender !== 'unknown') {
        // 这里可以触发工作流，但目前先返回状态，让前端决定是否启动生成
        console.log(`[Character Create] 角色设置为自动生成白膜，gender: ${gender}`);
      }

      res.json({ 
        message: '角色创建成功', 
        character,
        baseState,
        costumeState,
        workflowJobId
      });
    } catch (error) {
      console.error('[Character Create]', error);
      res.status(500).json({ message: '创建角色失败' });
    }
  });
};
