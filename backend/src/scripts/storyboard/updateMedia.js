/**
 * PATCH /api/storyboards/:storyboardId/media
 * 更新单个分镜的图片或视频
 * 
 * 支持独立删除首帧/尾帧：
 * - { firstFrameUrl: null } 仅删除首帧
 * - { lastFrameUrl: null } 仅删除尾帧
 * - 删除首帧时如果有视频，返回警告信息
 */

const { queryOne, execute } = require('../../dbHelper');

async function updateMedia(req, res) {
  const userId = req.user.id;
  const storyboardId = Number(req.params.storyboardId);
  const { imageUrl, videoUrl, startFrame, endFrame, firstFrameUrl, lastFrameUrl } = req.body;

  if (!storyboardId) {
    return res.status(400).json({ message: 'Invalid storyboard id' });
  }

  try {
    // 获取分镜信息，包含视频 URL 用于依赖检查和锁定状态
    const storyboard = await queryOne(
      `SELECT s.id, s.project_id, s.video_url, s.first_frame_url, s.last_frame_url, s.is_locked
       FROM storyboards s 
       JOIN scripts sc ON s.script_id = sc.id 
       WHERE s.id = ? AND sc.user_id = ?`,
      [storyboardId, userId]
    );

    if (!storyboard) {
      return res.status(404).json({ message: 'Storyboard not found or access denied' });
    }

    // 检查分镜是否已锁定
    if (storyboard.is_locked) {
      return res.status(403).json({ message: '该分镜已锁定，请先解锁后再修改媒体资源' });
    }

    const updates = [];
    const params = [];
    const warnings = [];

    // 检查是否要删除首帧（null 值表示删除）
    const isDeletingFirstFrame = 
      ('firstFrameUrl' in req.body && firstFrameUrl === null) ||
      ('startFrame' in req.body && startFrame === null) ||
      ('imageUrl' in req.body && imageUrl === null);

    // 如果要删除首帧且存在视频，添加警告
    if (isDeletingFirstFrame && storyboard.video_url) {
      warnings.push('该分镜已生成视频，删除首帧可能需要重新生成视频');
    }

    // 处理 firstFrameUrl（优先级高于 startFrame 和 imageUrl）
    if ('firstFrameUrl' in req.body) {
      updates.push('first_frame_url = ?');
      params.push(firstFrameUrl); // null 会将字段设为 NULL
    } else if ('startFrame' in req.body) {
      updates.push('first_frame_url = ?');
      params.push(startFrame);
    } else if ('imageUrl' in req.body) {
      updates.push('first_frame_url = ?');
      params.push(imageUrl);
    }

    // 处理 lastFrameUrl（优先级高于 endFrame）
    if ('lastFrameUrl' in req.body) {
      updates.push('last_frame_url = ?');
      params.push(lastFrameUrl); // null 会将字段设为 NULL
    } else if ('endFrame' in req.body) {
      updates.push('last_frame_url = ?');
      params.push(endFrame);
    }

    // 处理 videoUrl
    if ('videoUrl' in req.body) {
      updates.push('video_url = ?');
      params.push(videoUrl);
    }

    if (updates.length === 0) {
      return res.status(400).json({ message: 'No fields to update' });
    }

    params.push(storyboardId);
    await execute(`UPDATE storyboards SET ${updates.join(', ')} WHERE id = ?`, params);

    // 返回成功信息，包含警告（如果有）
    const response = { message: 'Media updated successfully' };
    if (warnings.length > 0) {
      response.warnings = warnings;
    }

    res.json(response);
  } catch (err) {
    console.error('DB error updating storyboard media:', err);
    res.status(500).json({ message: 'Failed to update media' });
  }
}

module.exports = updateMedia;
