/**
 * POST /api/speaker-voices - 创建音色记录
 *
 * Body:
 * {
 *   name: string,
 *   description?: string,
 *   gender?: string,
 *   age_group?: string,
 *   language?: string,
 *   speaker_id?: string,        // 火山引擎返回的音色ID
 *   provider?: string,
 *   provider_model_id?: string,
 *   source_type?: 'preset' | 'clone' | 'design',
 *   source_audio_url?: string,
 *   source_text?: string,
 *   voice_params?: object,
 *   metadata?: object,
 *   project_id?: number,
 *   character_id?: number
 * }
 */
const { execute, queryOne } = require('../../dbHelper');
const { authMiddleware } = require('../../middleware');

module.exports = (router) => {
  router.post('/', authMiddleware, async (req, res) => {
    const userId = req.user.id;
    const {
      name, description, gender, age_group, language,
      speaker_id, provider, provider_model_id,
      source_type, source_audio_url, source_text,
      voice_params, metadata,
      project_id, character_id
    } = req.body;

    if (!name) {
      return res.status(400).json({ message: '音色名称不能为空' });
    }

    try {
      const result = await execute(
        `INSERT INTO speaker_voices (
          user_id, project_id, character_id,
          name, description, gender, age_group, language,
          speaker_id, provider, provider_model_id,
          source_type, source_audio_url, source_text,
          status, voice_params, metadata
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          userId, project_id || null, character_id || null,
          name, description || null, gender || 'neutral', age_group || 'adult', language || 'zh-CN',
          speaker_id || null, provider || 'volcengine', provider_model_id || null,
          source_type || 'clone', source_audio_url || null, source_text || null,
          speaker_id ? 'ready' : 'training',
          voice_params ? JSON.stringify(voice_params) : null,
          metadata ? JSON.stringify(metadata) : null
        ]
      );

      const newVoice = await queryOne(
        `SELECT * FROM speaker_voices WHERE id = ?`,
        [result.insertId]
      );

      res.status(201).json({
        message: '音色创建成功',
        voice: {
          ...newVoice,
          voice_params: safeParseJson(newVoice.voice_params),
          metadata: safeParseJson(newVoice.metadata)
        }
      });
    } catch (error) {
      console.error('[SpeakerVoices Create]', error);
      res.status(500).json({ message: '创建音色失败' });
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
