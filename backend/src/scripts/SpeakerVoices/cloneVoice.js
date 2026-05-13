/**
 * POST /api/speaker-voices/clone - 声音复刻
 *
 * 调用火山引擎声音复刻API，将用户上传的音频复刻为自定义音色
 *
 * Body:
 * {
 *   name: string,              // 音色名称（必填）
 *   description?: string,      // 音色描述
 *   audio_url: string,         // 原始音频URL（必填）
 *   audio_base64?: string,     // 音频base64（与audio_url二选一）
 *   gender?: string,           // male/female/neutral
 *   age_group?: string,        // child/teen/young/middle/elder
 *   language?: string,         // 默认 zh-CN
 *   project_id?: number,       // 关联项目ID
 *   character_id?: number,     // 关联角色ID
 *   model_id?: string,         // 复刻模型ID，默认 seed-tts-2.0
 *   voice_params?: object      // 音色参数
 * }
 *
 * 流程：
 * 1. 接收用户音频（URL或base64）
 * 2. 调用火山引擎 CreateSpeaker API 创建音色
 * 3. 将返回的 speaker_id 保存到 speaker_voices 表
 * 4. 返回创建成功的音色记录
 */
const { execute, queryOne } = require('../../dbHelper');
const { authMiddleware } = require('../../middleware');

module.exports = (router) => {
  router.post('/clone', authMiddleware, async (req, res) => {
    const userId = req.user.id;
    const {
      name, description, audio_url, audio_base64,
      gender, age_group, language,
      project_id, character_id,
      model_id, voice_params
    } = req.body;

    // 参数校验
    if (!name) {
      return res.status(400).json({ message: '音色名称不能为空' });
    }
    if (!audio_url && !audio_base64) {
      return res.status(400).json({ message: '请提供音频URL或音频数据' });
    }

    try {
      // 1. 先创建本地记录（状态为 training）
      const insertResult = await execute(
        `INSERT INTO speaker_voices (
          user_id, project_id, character_id,
          name, description, gender, age_group, language,
          provider, provider_model_id,
          source_type, source_audio_url,
          status, voice_params
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          userId, project_id || null, character_id || null,
          name, description || null, gender || 'neutral', age_group || 'adult', language || 'zh-CN',
          'volcengine', model_id || 'seed-tts-2.0',
          'clone', audio_url || null,
          'training',
          voice_params ? JSON.stringify(voice_params) : null
        ]
      );

      const voiceId = insertResult.insertId;

      // 2. 调用火山引擎声音复刻API
      let speakerResult;
      try {
        speakerResult = await createVolcengineSpeaker({
          audio_url,
          audio_base64,
          model_id: model_id || 'seed-tts-2.0'
        });
      } catch (apiErr) {
        // API调用失败，更新状态为 failed
        await execute(
          'UPDATE speaker_voices SET status = ?, status_message = ? WHERE id = ?',
          ['failed', apiErr.message, voiceId]
        );
        throw apiErr;
      }

      // 3. 更新记录为 ready，保存 speaker_id
      await execute(
        `UPDATE speaker_voices SET
          speaker_id = ?, status = ?, status_message = NULL,
          metadata = ?
        WHERE id = ?`,
        [
          speakerResult.speaker_id,
          speakerResult.status === 'ready' ? 'ready' : 'training',
          JSON.stringify(speakerResult.raw_response || {}),
          voiceId
        ]
      );

      // 4. 如果指定了 character_id，自动绑定
      if (character_id) {
        await execute(
          'UPDATE characters SET speaker_voice_id = ? WHERE id = ?',
          [voiceId, character_id]
        );
      }

      // 5. 返回完整记录
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
        FROM speaker_voices WHERE id = ?`,
        [voiceId]
      );

      res.status(201).json({
        message: '声音复刻任务已提交',
        voice: {
          ...voice,
          voice_params: safeParseJson(voice.voice_params),
          metadata: safeParseJson(voice.metadata)
        }
      });
    } catch (error) {
      console.error('[SpeakerVoices Clone]', error);
      res.status(500).json({
        message: '声音复刻失败',
        error: error.message
      });
    }
  });
};

/**
 * 调用火山引擎 CreateSpeaker API 创建音色
 *
 * 参考文档：https://www.volcengine.com/docs/6561/2235883
 */
async function createVolcengineSpeaker({ audio_url, audio_base64, model_id }) {
  const apiKey = process.env.VOLCENGINE_API_KEY || process.env.VOLCENGINE_TTS_API_KEY;
  const appId = process.env.VOLCENGINE_TTS_APP_ID;
  const accessKeyId = process.env.VOLCENGINE_ACCESS_KEY_ID;
  const secretKey = process.env.VOLCENGINE_SECRET_KEY;

  if (!apiKey) {
    throw new Error('火山引擎 API Key 未配置，请设置 VOLCENGINE_API_KEY 或 VOLCENGINE_TTS_API_KEY');
  }

  // 火山引擎声音复刻/音色管理端点
  // 注意：实际端点可能根据文档调整
  const url = 'https://openspeech.bytedance.com/api/v3/tts/speaker/create';

  const requestBody = {
    model: model_id || 'seed-tts-2.0',
    // 优先使用base64，其次使用URL
    ...(audio_base64
      ? { audio: audio_base64 }
      : { audio_url: audio_url }
    )
  };

  const headers = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${apiKey}`
  };

  // 如果有AppId，添加AppId头
  if (appId) {
    headers['X-App-Id'] = appId;
  }

  const response = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(requestBody)
  });

  const responseText = await response.text();
  let data;
  try {
    data = JSON.parse(responseText);
  } catch {
    throw new Error(`火山引擎返回非JSON响应: ${responseText.substring(0, 200)}`);
  }

  if (!response.ok) {
    const errorMsg = data.error?.message || data.message || `HTTP ${response.status}`;
    throw new Error(`火山引擎API错误: ${errorMsg}`);
  }

  // 火山引擎返回结构：
  // { code: 0, data: { speaker_id: 'xxx', status: 'training' }, message: 'success' }
  if (data.code !== 0 && data.code !== '0') {
    throw new Error(`火山引擎错误: ${data.message || '未知错误'}`);
  }

  const result = data.data || {};

  return {
    speaker_id: result.speaker_id || result.voice_id,
    status: result.status || 'training',
    raw_response: data
  };
}

function safeParseJson(value) {
  if (!value) return null;
  try {
    return typeof value === 'string' ? JSON.parse(value) : value;
  } catch {
    return null;
  }
}
