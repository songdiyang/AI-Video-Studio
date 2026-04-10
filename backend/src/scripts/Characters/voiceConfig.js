/**
 * 角色声音配置 API
 * 
 * - GET /:id/voice - 获取角色声音配置
 * - PUT /:id/voice - 更新角色声音配置
 */
const { queryOne, execute } = require('../../dbHelper');
const { authMiddleware } = require('../../middleware');

module.exports = (router) => {
  /**
   * GET /:id/voice - 获取角色声音配置
   */
  router.get('/:id/voice', authMiddleware, async (req, res) => {
    const userId = req.user.id;
    const { id } = req.params;

    try {
      const character = await queryOne(
        'SELECT id, name, voice_config FROM characters WHERE id = ? AND user_id = ?',
        [id, userId]
      );

      if (!character) {
        return res.status(404).json({ message: '角色不存在' });
      }

      // 解析 voice_config
      let voiceConfig = null;
      if (character.voice_config) {
        try {
          voiceConfig = typeof character.voice_config === 'string'
            ? JSON.parse(character.voice_config)
            : character.voice_config;
        } catch {
          voiceConfig = null;
        }
      }

      res.json({
        characterId: character.id,
        characterName: character.name,
        voiceConfig
      });
    } catch (error) {
      console.error('[Character Voice Get]', error);
      res.status(500).json({ message: '获取声音配置失败' });
    }
  });

  /**
   * PUT /:id/voice - 更新角色声音配置
   * 
   * 请求体示例:
   * {
   *   voiceId: 'zh-CN-XiaoxiaoNeural',
   *   voiceName: '晓晓',
   *   gender: 'female',
   *   age: 'young',
   *   pitch: 0,
   *   speed: 1.0,
   *   volume: 1.0,
   *   style: 'cheerful',
   *   emotion: 'neutral',
   *   description: '年轻女性，活泼开朗的声音'
   * }
   */
  router.put('/:id/voice', authMiddleware, async (req, res) => {
    const userId = req.user.id;
    const { id } = req.params;
    const voiceConfig = req.body;

    try {
      const character = await queryOne(
        'SELECT id, name FROM characters WHERE id = ? AND user_id = ?',
        [id, userId]
      );

      if (!character) {
        return res.status(404).json({ message: '角色不存在' });
      }

      // 验证 voiceConfig 的基本结构
      if (voiceConfig && typeof voiceConfig !== 'object') {
        return res.status(400).json({ message: '声音配置格式无效' });
      }

      // 允许传入 null 来清除配置
      const voiceConfigStr = voiceConfig 
        ? JSON.stringify(voiceConfig)
        : null;

      await execute(
        `UPDATE characters 
         SET voice_config = ?, updated_at = CURRENT_TIMESTAMP
         WHERE id = ? AND user_id = ?`,
        [voiceConfigStr, id, userId]
      );

      res.json({
        message: '声音配置已更新',
        characterId: character.id,
        characterName: character.name,
        voiceConfig
      });
    } catch (error) {
      console.error('[Character Voice Update]', error);
      res.status(500).json({ message: '更新声音配置失败' });
    }
  });

  /**
   * GET /project/:projectId/voices - 获取项目中所有角色的声音配置
   */
  router.get('/project/:projectId/voices', authMiddleware, async (req, res) => {
    const userId = req.user.id;
    const { projectId } = req.params;

    try {
      const { queryAll } = require('../../dbHelper');
      const characters = await queryAll(
        `SELECT id, name, image_url, voice_config 
         FROM characters 
         WHERE project_id = ? AND user_id = ?
         ORDER BY name`,
        [projectId, userId]
      );

      const result = characters.map(char => {
        let voiceConfig = null;
        if (char.voice_config) {
          try {
            voiceConfig = typeof char.voice_config === 'string'
              ? JSON.parse(char.voice_config)
              : char.voice_config;
          } catch {
            voiceConfig = null;
          }
        }
        return {
          id: char.id,
          name: char.name,
          imageUrl: char.image_url,
          voiceConfig
        };
      });

      res.json({ characters: result });
    } catch (error) {
      console.error('[Character Voices List]', error);
      res.status(500).json({ message: '获取声音配置列表失败' });
    }
  });
};
