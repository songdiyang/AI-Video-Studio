/**
 * 独立帧生成模块 - 每个分镜独立生成首尾帧，不依赖其他分镜
 * 
 * 核心特性：
 *   1. 不依赖 prevEndFrameUrl 链式传递
 *   2. 每个分镜仅使用自身关联的角色三视图 + 场景图作为参考
 *   3. 支持并发批量生成
 *   4. 可选择性地启用链式模式或独立模式
 */

const { queryOne, queryAll, execute } = require('../../../db');
const handleFrameGeneration = require('./frameGeneration');
const handleSingleFrameGeneration = require('./singleFrameGeneration');

/**
 * 独立生成单个分镜的首尾帧（不依赖其他分镜）
 * @param {Object} params - 参数
 * @param {number} params.storyboardId - 分镜ID
 * @param {string} params.imageModel - 图片生成模型
 * @param {string} params.textModel - 文本模型（可选）
 * @param {string} params.aspectRatio - 图片比例
 * @param {Function} onProgress - 进度回调
 * @returns {Promise<{status, type, ...result}>}
 */
async function generateFrameIndependent(params, onProgress) {
  const { storyboardId, imageModel, textModel, aspectRatio, resolution } = params;

  if (!storyboardId) {
    throw new Error('缺少必要参数: storyboardId');
  }
  if (!imageModel) {
    throw new Error('缺少必要参数: imageModel');
  }

  // 查询分镜数据
  const storyboard = await queryOne(
    'SELECT id, prompt_template, variables_json FROM storyboards WHERE id = ?',
    [storyboardId]
  );
  if (!storyboard) {
    throw new Error(`分镜 ${storyboardId} 不存在`);
  }

  let vars = {};
  try {
    vars = typeof storyboard.variables_json === 'string'
      ? JSON.parse(storyboard.variables_json || '{}')
      : (storyboard.variables_json || {});
  } catch (e) {
    vars = {};
  }

  const hasAction = vars.hasAction || false;
  const description = storyboard.prompt_template || '';

  // 独立模式：不传递 prevEndFrameUrl、prevDescription、prevEndState
  // 让每个分镜使用自身的角色三视图和场景图作为参考
  const independentParams = {
    storyboardId,
    prompt: description,
    description,
    imageModel,
    textModel,
    aspectRatio,
    resolution,
    // 独立模式的关键：不传递链式参数
    prevEndFrameUrl: null,
    prevDescription: null,
    prevEndState: null,
    isFirstScene: true  // 独立模式每个分镜都视为"第一个场景"
  };

  let result;
  if (hasAction) {
    console.log(`[IndependentFrameGen] 分镜 ${storyboardId} 有动作，生成首尾帧...`);
    result = await handleFrameGeneration(independentParams, onProgress);
    return {
      storyboardId,
      status: 'completed',
      type: 'frame',
      startFrame: result.startFrame,
      endFrame: result.endFrame,
      model: result.model
    };
  } else {
    console.log(`[IndependentFrameGen] 分镜 ${storyboardId} 无动作，生成单帧...`);
    result = await handleSingleFrameGeneration(independentParams, onProgress);
    return {
      storyboardId,
      status: 'completed',
      type: 'single_frame',
      firstFrameUrl: result.firstFrameUrl,
      lastFrameUrl: result.lastFrameUrl,
      model: result.model
    };
  }
}

/**
 * 并发批量生成多个分镜的首尾帧（独立模式）
 * @param {Object} params - 参数
 * @param {number[]} params.storyboardIds - 分镜ID列表
 * @param {string} params.imageModel - 图片生成模型
 * @param {string} params.textModel - 文本模型（可选）
 * @param {string} params.aspectRatio - 图片比例
 * @param {number} params.maxConcurrency - 最大并发数，默认 5
 * @param {Function} onProgress - 进度回调
 * @returns {Promise<{total, completed, failed, results[]}>}
 */
async function generateFramesParallel(params, onProgress) {
  const {
    storyboardIds,
    imageModel,
    textModel,
    aspectRatio,
    resolution,
    maxConcurrency = 5
  } = params;

  if (!storyboardIds || storyboardIds.length === 0) {
    throw new Error('缺少必要参数: storyboardIds');
  }
  if (!imageModel) {
    throw new Error('缺少必要参数: imageModel');
  }

  const total = storyboardIds.length;
  let completed = 0;
  let failed = 0;
  const results = [];

  console.log(`[ParallelFrameGen] 开始并发生成 ${total} 个分镜，最大并发数: ${maxConcurrency}`);
  if (onProgress) onProgress(5);

  // 分批并发处理
  for (let i = 0; i < storyboardIds.length; i += maxConcurrency) {
    const batch = storyboardIds.slice(i, i + maxConcurrency);
    const batchNumber = Math.floor(i / maxConcurrency) + 1;
    const totalBatches = Math.ceil(storyboardIds.length / maxConcurrency);

    console.log(`[ParallelFrameGen] 处理第 ${batchNumber}/${totalBatches} 批，共 ${batch.length} 个分镜`);

    const batchResults = await Promise.all(
      batch.map(async (sbId) => {
        try {
          const result = await generateFrameIndependent({
            storyboardId: sbId,
            imageModel,
            textModel,
            aspectRatio,
            resolution
          }, null);  // 单个分镜的进度回调暂不处理
          completed++;
          return result;
        } catch (err) {
          failed++;
          console.error(`[ParallelFrameGen] 分镜 ${sbId} 生成失败:`, err.message);
          return {
            storyboardId: sbId,
            status: 'failed',
            error: err.message
          };
        }
      })
    );

    results.push(...batchResults);

    // 更新总进度：5% ~ 95%
    const pct = 5 + Math.floor(((i + batch.length) / total) * 90);
    if (onProgress) onProgress(pct);
  }

  if (onProgress) onProgress(100);
  console.log(`[ParallelFrameGen] 并发生成完成: 总计=${total}, 成功=${completed}, 失败=${failed}`);

  return {
    total,
    completed,
    failed,
    results
  };
}

/**
 * 为剧本下所有分镜并发生成首尾帧（独立模式）
 * @param {Object} params - 参数
 * @param {number} params.scriptId - 剧本ID
 * @param {string} params.imageModel - 图片生成模型
 * @param {string} params.textModel - 文本模型
 * @param {boolean} params.overwriteFrames - 是否覆盖已有帧
 * @param {string} params.aspectRatio - 图片比例
 * @param {number} params.maxConcurrency - 最大并发数
 * @param {Function} onProgress - 进度回调
 * @returns {Promise<{total, completed, skipped, failed, results[]}>}
 */
async function handleParallelFrameGeneration(params, onProgress) {
  const {
    scriptId,
    imageModel,
    textModel,
    overwriteFrames = false,
    aspectRatio,
    maxConcurrency = 5
  } = params;

  if (!scriptId) {
    throw new Error('缺少必要参数: scriptId');
  }
  if (!imageModel) {
    throw new Error('缺少必要参数: imageModel');
  }

  // 0. 覆盖模式：先批量清除所有未锁定分镜的首尾帧
  if (overwriteFrames) {
    console.log('[ParallelFrameGen] 覆盖模式：清除所有未锁定分镜的首尾帧...');
    await execute(
      'UPDATE storyboards SET first_frame_url = NULL, last_frame_url = NULL, updated_scene_url = NULL WHERE script_id = ? AND is_locked = FALSE',
      [scriptId]
    );
  }

  // 1. 查询所有分镜（含锁定状态，跳过已锁定）
  let storyboards;
  if (overwriteFrames) {
    // 覆盖模式：处理所有未锁定分镜
    storyboards = await queryAll(
      'SELECT id FROM storyboards WHERE script_id = ? AND is_locked = FALSE ORDER BY idx ASC',
      [scriptId]
    );
  } else {
    // 增量模式：只处理没有帧且未锁定的分镜
    storyboards = await queryAll(
      'SELECT id FROM storyboards WHERE script_id = ? AND (first_frame_url IS NULL OR first_frame_url = \'\') AND is_locked = FALSE ORDER BY idx ASC',
      [scriptId]
    );
  }

  if (!storyboards || storyboards.length === 0) {
    console.log('[ParallelFrameGen] 没有需要生成的分镜');
    return { total: 0, completed: 0, skipped: 0, failed: 0, results: [] };
  }

  const storyboardIds = storyboards.map(sb => sb.id);
  console.log(`[ParallelFrameGen] 准备并发生成 ${storyboardIds.length} 个分镜`);

  const result = await generateFramesParallel({
    storyboardIds,
    imageModel,
    textModel,
    aspectRatio,
    maxConcurrency
  }, onProgress);

  // 计算跳过数量（含锁定的分镜）
  const totalInScript = await queryOne(
    'SELECT COUNT(*) as count FROM storyboards WHERE script_id = ?',
    [scriptId]
  );
  const skipped = (totalInScript?.count || 0) - storyboardIds.length;

  return {
    ...result,
    skipped
  };
}

module.exports = {
  generateFrameIndependent,
  generateFramesParallel,
  handleParallelFrameGeneration
};
