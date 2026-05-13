/**
 * PUT /api/speaker-voices/:id/bind-character - 绑定/解绑角色
 *
 * Body:
 * {
 *   character_id: number | null,    // 角色ID，传 null 解绑
 *   bind_type: 'default' | 'state'   // 绑定类型：default=角色默认音色，state=状态音色
 *   state_id?: number               // 当 bind_type='state' 时，指定状态ID
 * }
 *
 * 功能：
 * 1. 将音色绑定到角色（作为角色默认音色）
 * 2. 将音色绑定到角色的特定状态
 * 3. 解绑角色（character_id 传 null）
 */
const { execute, queryOne } = require('../../dbHelper');
const { authMiddleware } = require('../../middleware');

module.exports = (router) => {
  router.put('/:id/bind-character', authMiddleware, async (req, res) => {
    const userId = req.user.id;
    const { id } = req.params;
    const { character_id, bind_type = 'default', state_id } = req.body;

    try {
      // 验证音色归属
      const voice = await queryOne(
        `SELECT id, name, speaker_id, character_id, project_id
         FROM speaker_voices WHERE id = ? AND user_id = ?`,
        [id, userId]
      );

      if (!voice) {
        return res.status(404).json({ message: '音色不存在或无权限' });
      }

      // 解绑操作
      if (character_id === null || character_id === undefined) {
        // 解绑角色
        if (voice.character_id) {
          await execute(
            'UPDATE characters SET speaker_voice_id = NULL WHERE id = ? AND speaker_voice_id = ?',
            [voice.character_id, id]
          );
        }

        // 解绑所有状态
        await execute(
          'UPDATE character_states SET speaker_voice_id = NULL WHERE speaker_voice_id = ?',
          [id]
        );

        // 更新音色记录
        await execute(
          'UPDATE speaker_voices SET character_id = NULL WHERE id = ?',
          [id]
        );

        return res.json({
          message: '音色已解绑',
          voice: { id: voice.id, name: voice.name, character_id: null }
        });
      }

      // 绑定操作：验证角色存在且属于当前用户
      const character = await queryOne(
        `SELECT id, name, project_id FROM characters WHERE id = ?`,
        [character_id]
      );

      if (!character) {
        return res.status(404).json({ message: '角色不存在' });
      }

      // 验证角色权限（角色所在项目必须属于用户，或角色是公开模板）
      // 简化处理：检查用户是否有该项目的权限
      const projectAccess = await queryOne(
        `SELECT p.id FROM projects p
         LEFT JOIN project_members pm ON p.id = pm.project_id AND pm.user_id = ?
         WHERE p.id = ? AND (p.user_id = ? OR pm.user_id IS NOT NULL)`,
        [userId, character.project_id, userId]
      );

      if (!projectAccess && character.project_id !== voice.project_id) {
        return res.status(403).json({ message: '无权操作该角色' });
      }

      if (bind_type === 'state' && state_id) {
        // 绑定到特定状态
        const state = await queryOne(
          'SELECT id FROM character_states WHERE id = ? AND character_id = ?',
          [state_id, character_id]
        );

        if (!state) {
          return res.status(404).json({ message: '状态不存在' });
        }

        await execute(
          'UPDATE character_states SET speaker_voice_id = ? WHERE id = ?',
          [id, state_id]
        );

        res.json({
          message: '音色已绑定到角色状态',
          voice: {
            id: voice.id,
            name: voice.name,
            character_id,
            state_id,
            bind_type: 'state'
          }
        });
      } else {
        // 绑定为角色默认音色
        // 1. 更新音色记录的 character_id
        await execute(
          'UPDATE speaker_voices SET character_id = ? WHERE id = ?',
          [character_id, id]
        );

        // 2. 更新角色的 speaker_voice_id
        await execute(
          'UPDATE characters SET speaker_voice_id = ? WHERE id = ?',
          [id, character_id]
        );

        res.json({
          message: '音色已绑定为角色默认音色',
          voice: {
            id: voice.id,
            name: voice.name,
            character_id,
            bind_type: 'default'
          }
        });
      }
    } catch (error) {
      console.error('[SpeakerVoices BindCharacter]', error);
      res.status(500).json({ message: '绑定角色失败' });
    }
  });
};
