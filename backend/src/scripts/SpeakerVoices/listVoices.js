/**
 * GET /api/speaker-voices - 获取用户的音色列表
 * Query: project_id, character_id, source_type, status
 */
const { queryAll, queryOne } = require('../../dbHelper');
const { authMiddleware } = require('../../middleware');

module.exports = (router) => {
  router.get('/', authMiddleware, async (req, res) => {
    const userId = req.user.id;
    const { project_id, character_id, source_type, status } = req.query;

    try {
      let sql = `
        SELECT
          id, name, description, gender, age_group, language,
          speaker_id, provider, provider_model_id,
          source_type, source_audio_url, source_text,
          status, status_message,
          voice_params, metadata,
          use_count, last_used_at,
          project_id, character_id,
          created_at, updated_at
        FROM speaker_voices
        WHERE user_id = ?
      `;
      const params = [userId];

      if (project_id) {
        sql += ' AND (project_id = ? OR project_id IS NULL)';
        params.push(project_id);
      }
      if (character_id) {
        sql += ' AND character_id = ?';
        params.push(character_id);
      }
      if (source_type) {
        sql += ' AND source_type = ?';
        params.push(source_type);
      }
      if (status) {
        sql += ' AND status = ?';
        params.push(status);
      }

      sql += ' ORDER BY updated_at DESC';

      const voices = await queryAll(sql, params);

      // 解析 JSON 字段
      const result = voices.map(v => ({
        ...v,
        voice_params: safeParseJson(v.voice_params),
        metadata: safeParseJson(v.metadata)
      }));

      res.json({ voices: result });
    } catch (error) {
      console.error('[SpeakerVoices List]', error);
      res.status(500).json({ message: '获取音色列表失败' });
    }
  });

  // GET /api/speaker-voices/:id - 获取单个音色详情
  router.get('/:id', authMiddleware, async (req, res) => {
    const userId = req.user.id;
    const { id } = req.params;

    try {
      const voice = await queryOne(
        `SELECT
          id, name, description, gender, age_group, language,
          speaker_id, provider, provider_model_id,
          source_type, source_audio_url, source_text,
          status, status_message,
          voice_params, metadata,
          use_count, last_used_at,
          project_id, character_id,
          created_at, updated_at
        FROM speaker_voices
        WHERE id = ? AND user_id = ?`,
        [id, userId]
      );

      if (!voice) {
        return res.status(404).json({ message: '音色不存在' });
      }

      res.json({
        ...voice,
        voice_params: safeParseJson(voice.voice_params),
        metadata: safeParseJson(voice.metadata)
      });
    } catch (error) {
      console.error('[SpeakerVoices Get]', error);
      res.status(500).json({ message: '获取音色详情失败' });
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
