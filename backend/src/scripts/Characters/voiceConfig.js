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
   *
   * 返回结构：
   * {
   *   characterId,
   *   characterName,
   *   voiceConfig,        // 传统声音配置（Azure TTS等）
   *   speakerVoiceId,     // 绑定的自定义音色ID
   *   speakerVoice        // 自定义音色详情（如果有）
   * }
   */
  router.get('/:id/voice', authMiddleware, async (req, res) => {
    const userId = req.user.id;
    const { id } = req.params;

    try {
      const character = await queryOne(
        `SELECT c.id, c.name, c.voice_config, c.speaker_voice_id,
                sv.name as speaker_voice_name, sv.speaker_id,
                sv.gender as speaker_gender, sv.language as speaker_language,
                sv.status as speaker_status, sv.provider as speaker_provider
         FROM characters c
         LEFT JOIN speaker_voices sv ON c.speaker_voice_id = sv.id
         WHERE c.id = ? AND c.user_id = ?`,
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

      // 构建自定义音色信息
      let speakerVoice = null;
      if (character.speaker_voice_id) {
        speakerVoice = {
          id: character.speaker_voice_id,
          name: character.speaker_voice_name,
          speakerId: character.speaker_id,
          gender: character.speaker_gender,
          language: character.speaker_language,
          status: character.speaker_status,
          provider: character.speaker_provider
        };
      }

      res.json({
        characterId: character.id,
        characterName: character.name,
        voiceConfig,
        speakerVoiceId: character.speaker_voice_id,
        speakerVoice
      });
    } catch (error) {
      console.error('[Character Voice Get]', error);
      res.status(500).json({ message: '获取声音配置失败' });
    }
  });

  /**
   * PUT /:id/voice - 更新角色声音配置
   *
   * 请求体示例（传统TTS配置）：
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
   *
   * 请求体示例（使用自定义音色）：
   * {
   *   speakerVoiceId: 123,    // speaker_voices 表中的ID
   *   voiceConfig: null       // 可选：同时设置传统TTS配置
   * }
   *
   * 请求体示例（清除自定义音色）：
   * {
   *   speakerVoiceId: null
   * }
   */
  router.put('/:id/voice', authMiddleware, async (req, res) => {
    const userId = req.user.id;
    const { id } = req.params;
    const { speakerVoiceId, ...voiceConfig } = req.body;

    try {
      const character = await queryOne(
        'SELECT id, name FROM characters WHERE id = ? AND user_id = ?',
        [id, userId]
      );

      if (!character) {
        return res.status(404).json({ message: '角色不存在' });
      }

      const updates = [];
      const params = [];

      // 处理自定义音色绑定
      if (speakerVoiceId !== undefined) {
        if (speakerVoiceId === null) {
          // 解绑自定义音色
          updates.push('speaker_voice_id = NULL');
        } else {
          // 验证音色存在且属于当前用户
          const speakerVoice = await queryOne(
            'SELECT id, name, status FROM speaker_voices WHERE id = ? AND user_id = ?',
            [speakerVoiceId, userId]
          );

          if (!speakerVoice) {
            return res.status(404).json({ message: '音色不存在或无权限' });
          }

          if (speakerVoice.status !== 'ready') {
            return res.status(400).json({
              message: '音色尚未就绪，无法绑定',
              status: speakerVoice.status
            });
          }

          updates.push('speaker_voice_id = ?');
          params.push(speakerVoiceId);

          // 同步更新 speaker_voices 表的 character_id
          await execute(
            'UPDATE speaker_voices SET character_id = ? WHERE id = ?',
            [id, speakerVoiceId]
          );
        }
      }

      // 处理传统 voice_config（如果传了除 speakerVoiceId 外的其他字段）
      const hasVoiceConfig = Object.keys(voiceConfig).length > 0;
      if (hasVoiceConfig) {
        const voiceConfigStr = JSON.stringify(voiceConfig);
        updates.push('voice_config = ?');
        params.push(voiceConfigStr);
      }

      if (updates.length === 0) {
        return res.status(400).json({ message: '没有要更新的字段' });
      }

      params.push(id, userId);

      await execute(
        `UPDATE characters
         SET ${updates.join(', ')}, updated_at = CURRENT_TIMESTAMP
         WHERE id = ? AND user_id = ?`,
        params
      );

      // 获取更新后的完整信息
      const updated = await queryOne(
        `SELECT c.id, c.name, c.voice_config, c.speaker_voice_id,
                sv.name as speaker_voice_name, sv.speaker_id,
                sv.gender as speaker_gender, sv.language as speaker_language,
                sv.status as speaker_status, sv.provider as speaker_provider
         FROM characters c
         LEFT JOIN speaker_voices sv ON c.speaker_voice_id = sv.id
         WHERE c.id = ?`,
        [id]
      );

      let parsedVoiceConfig = null;
      if (updated.voice_config) {
        try {
          parsedVoiceConfig = typeof updated.voice_config === 'string'
            ? JSON.parse(updated.voice_config)
            : updated.voice_config;
        } catch {
          parsedVoiceConfig = null;
        }
      }

      let speakerVoice = null;
      if (updated.speaker_voice_id) {
        speakerVoice = {
          id: updated.speaker_voice_id,
          name: updated.speaker_voice_name,
          speakerId: updated.speaker_id,
          gender: updated.speaker_gender,
          language: updated.speaker_language,
          status: updated.speaker_status,
          provider: updated.speaker_provider
        };
      }

      res.json({
        message: '声音配置已更新',
        characterId: updated.id,
        characterName: updated.name,
        voiceConfig: parsedVoiceConfig,
        speakerVoiceId: updated.speaker_voice_id,
        speakerVoice
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
        `SELECT c.id, c.name, c.image_url, c.voice_config, c.speaker_voice_id,
                sv.name as speaker_voice_name, sv.speaker_id,
                sv.status as speaker_status
         FROM characters c
         LEFT JOIN speaker_voices sv ON c.speaker_voice_id = sv.id
         WHERE c.project_id = ? AND c.user_id = ?
         ORDER BY c.name`,
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

        let speakerVoice = null;
        if (char.speaker_voice_id) {
          speakerVoice = {
            id: char.speaker_voice_id,
            name: char.speaker_voice_name,
            speakerId: char.speaker_id,
            status: char.speaker_status
          };
        }

        return {
          id: char.id,
          name: char.name,
          imageUrl: char.image_url,
          voiceConfig,
          speakerVoiceId: char.speaker_voice_id,
          speakerVoice
        };
      });

      res.json({ characters: result });
    } catch (error) {
      console.error('[Character Voices List]', error);
      res.status(500).json({ message: '获取声音配置列表失败' });
    }
  });
};
