/**
 * 帧历史版本保存工具
 * 供所有帧生成处理器共用：frameGeneration, singleFrameGeneration, sketchToImage 等
 */

const { queryOne, execute } = require('../../../dbHelper');
const crypto = require('crypto');

/**
 * 获取下一个版本号（不保存）
 * 用于在保存文件前确定版本号，以便生成带版本号的文件路径
 * 
 * @param {number} storyboardId - 分镜 ID
 * @param {'first'|'last'} frameType - 帧类型
 * @returns {number} 下一个版本号
 */
async function getNextVersionNumber(storyboardId, frameType) {
  const maxRow = await queryOne(
    'SELECT COALESCE(MAX(version_number), 0) as max_ver FROM storyboard_frame_history WHERE storyboard_id = ? AND frame_type = ?',
    [storyboardId, frameType]
  );
  return (maxRow?.max_ver || 0) + 1;
}

/**
 * 生成批次 ID
 * @returns {string} UUID v4
 */
function generateBatchId() {
  return crypto.randomUUID();
}

/**
 * 保存帧到历史版本表
 * 先将旧版本标记为非当前，再插入新版本
 * 
 * @param {number} storyboardId - 分镜 ID
 * @param {'first'|'last'} frameType - 帧类型
 * @param {string} frameUrl - 帧图片 URL
 * @param {string} prompt - 生成提示词
 * @param {object} params - 生成参数（model, aspectRatio, resolution 等）
 * @param {string} [batchId] - 批次 ID，同一次生成的首尾帧共享
 * @returns {number} 新版本号
 */
async function saveFrameHistory(storyboardId, frameType, frameUrl, prompt, params, batchId) {
  if (!storyboardId || !frameType || !frameUrl) {
    console.warn('[FrameHistory] 跳过保存：缺少必要参数', { storyboardId, frameType, hasUrl: !!frameUrl });
    return 0;
  }

  // 1. 查询当前最大版本号
  const newVersion = await getNextVersionNumber(storyboardId, frameType);

  // 2. 将旧版本标记为非当前
  await execute(
    'UPDATE storyboard_frame_history SET is_current = FALSE WHERE storyboard_id = ? AND frame_type = ? AND is_current = TRUE',
    [storyboardId, frameType]
  );

  // 3. 插入新版本（设为当前，含 batch_id）
  await execute(
    `INSERT INTO storyboard_frame_history 
     (storyboard_id, frame_type, frame_url, generation_prompt, generation_params, version_number, is_current, batch_id)
     VALUES (?, ?, ?, ?, ?, ?, TRUE, ?)`,
    [storyboardId, frameType, frameUrl, prompt, JSON.stringify(params || {}), newVersion, batchId || null]
  );

  return newVersion;
}

module.exports = { saveFrameHistory, getNextVersionNumber, generateBatchId };
