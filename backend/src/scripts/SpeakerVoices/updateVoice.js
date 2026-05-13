/**
 * PUT /api/speaker-voices/:id - 更新音色信息
 *
 * Body:
 * {
 *   name?: string,
 *   description?: string,
 *   gender?: string,
 *   age_group?: string,
 *   language?: string,
 *   voice_params?: object,
 *   metadata?: object,
 *   status?: 'training' | 'ready' | 'failed' | 'disabled'
 * }
 */
const { execute, queryOne } = require('../../dbHelper');
const { authMiddleware } = require('../../middleware');

module.exports = (router) => {
  router.put('/:id', authMiddleware, async (req, res) => {
    const userId = req.user.id;
    const { id } = req.params;
    const {
      name, description, gender, age_group, language,
      voice_params, metadata, status, status_message
    } = req.body;

    try {
      // 验证音色归属
      const existing = await queryOne(
        'SELECT id FROM speaker_voices WHERE id = ? AND user_id = ?',
        [id, userId]
      );
      if (!existing) {
        return res.status(404).json({ message: '音色不存在或无权限' });
      }

      const updates = [];
      const params = [];

      if (name !== undefined) {
        updates.push('name = ?');
        params.push(name);
      }
      if (description !== undefined) {
        updates.push('description = ?');
        params.push(description);
      }
      if (gender !== undefined) {
        updates.push('gender = ?');
        params.push(gender);
      }
      if (age_group !== undefined) {
        updates.push('age_group = ?');
        params.push(age_group);
      }
      if (language !== undefined) {
        updates.push('language = ?');
        params.push(language);
      }
      if (voice_params !== undefined) {
        updates.push('voice_params = ?');
        params.push(JSON.stringify(voice_params));
      }
      if (metadata !== undefined) {
        updates.push('metadata = ?');
        params.push(JSON.stringify(metadata));
      }
      if (status !== undefined) {
        updates.push('status = ?');
        params.push(status);
      }
      if (status_message !== undefined) {
        updates.push('status_message = ?');
        params.push(status_message);
      }

      if (updates.length === 0) {
        return res.status(400).json({ message: '没有要更新的字段' });
      }

      params.push(id, userId);

      await execute(
        `UPDATE speaker_voices SET ${updates.join(', ')} WHERE id = ? AND user_id = ?`,
        params
      );

      const updated = await queryOne(
        `SELECT
          id, name, description, gender, age_group, language,
          speaker_id, provider, provider_model_id,
          source_type, source_audio_url, source_text,
          status, status_message,
          voice_params, metadata,
          use_count, last_used_at,
          project_id, character_id,
          created_at, updated_at
        FROM speaker_voices WHERE id = ?`,
        [id]
      );

      res.json({
        message: '音色更新成功',
        voice: {
          ...updated,
          voice_params: safeParseJson(updated.voice_params),
          metadata: safeParseJson(updated.metadata)
        }
      });
    } catch (error) {
      console.error('[SpeakerVoices Update]', error);
      res.status(500).json({ message: '更新音色失败' });
    }
  });
};

function safeParseJson(value) {
  if (!value) return null;
  try {
    return typeof value === 'string' ? JSON.parse(value) : value;
  } catch {
    return null;
  }
}
