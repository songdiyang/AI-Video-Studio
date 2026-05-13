/**
 * DELETE /api/speaker-voices/:id - 删除音色
 *
 * 删除前检查：
 * 1. 音色必须属于当前用户
 * 2. 如果音色已绑定角色，先解绑
 * 3. 可选：同步调用火山引擎删除远程音色
 */
const { execute, queryOne } = require('../../dbHelper');
const { authMiddleware } = require('../../middleware');

module.exports = (router) => {
  router.delete('/:id', authMiddleware, async (req, res) => {
    const userId = req.user.id;
    const { id } = req.params;
    const { delete_remote = false } = req.query;

    try {
      // 验证音色归属并获取详情
      const voice = await queryOne(
        `SELECT id, speaker_id, provider, character_id, name
         FROM speaker_voices WHERE id = ? AND user_id = ?`,
        [id, userId]
      );

      if (!voice) {
        return res.status(404).json({ message: '音色不存在或无权限' });
      }

      // 如果音色绑定了角色，先解绑
      if (voice.character_id) {
        await execute(
          'UPDATE characters SET speaker_voice_id = NULL WHERE id = ?',
          [voice.character_id]
        );
        await execute(
          'UPDATE character_states SET speaker_voice_id = NULL WHERE speaker_voice_id = ?',
          [id]
        );
      }

      // 可选：同步删除火山引擎远程音色
      if (delete_remote && voice.speaker_id && voice.provider === 'volcengine') {
        try {
          await deleteRemoteSpeaker(voice.speaker_id);
        } catch (remoteErr) {
          console.warn(`[SpeakerVoices Delete] 远程删除音色失败: ${remoteErr.message}`);
          // 远程删除失败不影响本地删除，但记录警告
        }
      }

      // 删除本地记录
      await execute(
        'DELETE FROM speaker_voices WHERE id = ? AND user_id = ?',
        [id, userId]
      );

      res.json({
        message: '音色删除成功',
        voice: {
          id: voice.id,
          name: voice.name,
          speaker_id: voice.speaker_id,
          remote_deleted: delete_remote && !!voice.speaker_id
        }
      });
    } catch (error) {
      console.error('[SpeakerVoices Delete]', error);
      res.status(500).json({ message: '删除音色失败' });
    }
  });
};

/**
 * 调用火山引擎删除远程音色
 * 参考：https://www.volcengine.com/docs/6561/2235883
 */
async function deleteRemoteSpeaker(speakerId) {
  const apiKey = process.env.VOLCENGINE_API_KEY || process.env.VOLCENGINE_TTS_API_KEY;
  const appId = process.env.VOLCENGINE_TTS_APP_ID;

  if (!apiKey || !appId) {
    throw new Error('火山引擎 API 配置不完整');
  }

  // 火山引擎音色管理 API 端点
  const url = `https://openspeech.bytedance.com/api/v3/tts/speaker/delete`;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
      'X-App-Id': appId
    },
    body: JSON.stringify({
      speaker_id: speakerId
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`远程删除失败: ${response.status} - ${errorText}`);
  }

  const data = await response.json();
  if (data.code !== 0 && data.code !== '0') {
    throw new Error(`远程删除失败: ${data.message || '未知错误'}`);
  }

  return data;
}
