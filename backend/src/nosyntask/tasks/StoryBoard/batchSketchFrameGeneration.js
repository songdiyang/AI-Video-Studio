/**
 * 批量草图帧生成处理器
 * 一键生成一集所有分镜的草图转图片
 * 
 * 与 batchFrameGeneration 不同：
 * 1. 只处理已上传草图的分镜（sketch_url 不为空）
 * 2. 使用草图作为控制图进行生成
 * 3. 支持并发处理（草图控制不需要严格的链式传递）
 * 
 * 逻辑：
 * 1. 查询 scriptId 下所有分镜（按 idx 排序）
 * 2. 过滤出有草图的分镜
 * 3. 并发处理每个分镜的草图转图片
 * 4. 容错机制：某个镜头失败时记录错误，继续处理其他镜头
 * 5. 超时保护：总体超时30分钟，单任务超时5分钟
 * 
 * input:  { scriptId, imageModel, textModel, aspectRatio, controlStrength, overwriteFrames, maxConcurrency, timeoutMs }
 * output: { total, totalWithSketch, completed, skipped, failed, results[], timedOut, timeoutMs, elapsedMs, abortedTasks }
 */

const { queryAll, execute } = require('../../../dbHelper');
const handleSketchToImage = require('./sketchToImage');

// 超时常量
const BATCH_TIMEOUT_MS = 30 * 60 * 1000; // 30分钟总体超时
const SINGLE_TASK_TIMEOUT_MS = 5 * 60 * 1000; // 5分钟单任务超时
const GRACE_PERIOD_MS = 2 * 60 * 1000; // 2分钟宽限期

/**
 * 带超时的 Promise 包装器
 * @param {Promise} promise - 原始 Promise
 * @param {number} timeoutMs - 超时毫秒数
 * @param {string} taskName - 任务名称（用于错误信息）
 * @returns {Promise} 带超时的 Promise
 */
function withTimeout(promise, timeoutMs, taskName = 'Task') {
  let timeoutId;
  const timeoutPromise = new Promise((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(new Error(`${taskName} 超时（${Math.round(timeoutMs / 1000)}秒）`));
    }, timeoutMs);
  });

  return Promise.race([promise, timeoutPromise]).finally(() => {
    clearTimeout(timeoutId);
  });
}

/**
 * 控制并发数量的执行器（支持中断和单任务超时）
 * @param {Array} items - 待处理项
 * @param {number} concurrency - 并发数
 * @param {Function} handler - 处理函数 (item, index) => Promise
 * @param {object} options - 可选参数
 * @param {object} options.abortSignal - 中断信号对象 { aborted: boolean }
 * @param {number} options.singleTaskTimeoutMs - 单任务超时时间
 * @returns {Promise<{results: Array, abortedCount: number}>} 处理结果数组和被中断的任务数
 */
async function runWithConcurrency(items, concurrency, handler, options = {}) {
  const { abortSignal = { aborted: false }, singleTaskTimeoutMs = SINGLE_TASK_TIMEOUT_MS } = options;
  const results = new Array(items.length);
  let currentIndex = 0;
  let abortedCount = 0;

  async function worker() {
    while (currentIndex < items.length) {
      // 检查是否已中断
      if (abortSignal.aborted) {
        // 标记剩余未处理的任务
        while (currentIndex < items.length) {
          const index = currentIndex++;
          results[index] = { status: 'aborted', reason: '批量任务超时中断' };
          abortedCount++;
        }
        break;
      }

      const index = currentIndex++;
      const item = items[index];
      try {
        // 使用单任务超时包装 handler
        const handlerPromise = handler(item, index);
        results[index] = await withTimeout(
          handlerPromise,
          singleTaskTimeoutMs,
          `单任务 ${item.id || index}`
        );
      } catch (err) {
        results[index] = { 
          error: err.message, 
          item,
          status: err.message.includes('超时') ? 'timeout' : 'failed'
        };
      }
    }
  }

  // 启动 concurrency 个 worker
  const workers = [];
  for (let i = 0; i < Math.min(concurrency, items.length); i++) {
    workers.push(worker());
  }
  await Promise.all(workers);

  return { results, abortedCount };
}

async function handleBatchSketchFrameGeneration(inputParams, onProgress) {
  const {
    scriptId,
    imageModel,
    textModel,
    aspectRatio,
    controlStrength = 0.8,
    overwriteFrames = false,
    maxConcurrency = 5,
    timeoutMs = BATCH_TIMEOUT_MS  // 允许调用方自定义超时时间
  } = inputParams;

  const startTime = Date.now();
  const effectiveTimeout = timeoutMs || BATCH_TIMEOUT_MS;

  if (!scriptId) {
    throw new Error('缺少必要参数: scriptId');
  }
  if (!imageModel) {
    throw new Error('imageModel 参数是必需的');
  }

  console.log(`[BatchSketchGen] 开始批量草图帧生成，scriptId: ${scriptId}, 覆盖: ${overwriteFrames}, 并发: ${maxConcurrency}, 超时: ${Math.round(effectiveTimeout / 1000 / 60)}分钟`);
  console.log(`[BatchSketchGen] 单任务超时: ${Math.round(SINGLE_TASK_TIMEOUT_MS / 1000 / 60)}分钟`);

  // 0. 覆盖模式：先批量清除有草图且未锁定分镜的首尾帧
  if (overwriteFrames) {
    console.log('[BatchSketchGen] 覆盖模式：清除有草图且未锁定分镜的首尾帧...');
    await execute(
      'UPDATE storyboards SET first_frame_url = NULL, last_frame_url = NULL WHERE script_id = ? AND sketch_url IS NOT NULL AND sketch_url != "" AND is_locked = FALSE',
      [scriptId]
    );
    console.log('[BatchSketchGen] 已清除相关首尾帧');
  }

  // 1. 查询所有分镜（按顺序，含锁定状态）
  const storyboards = await queryAll(
    'SELECT id, prompt_template, variables_json, first_frame_url, last_frame_url, sketch_url, sketch_type, is_locked FROM storyboards WHERE script_id = ? ORDER BY idx ASC',
    [scriptId]
  );

  if (!storyboards || storyboards.length === 0) {
    throw new Error('该剧本下没有分镜数据');
  }

  const total = storyboards.length;
  const lockedCount = storyboards.filter(sb => sb.is_locked).length;
  if (lockedCount > 0) {
    console.log(`[BatchSketchGen] ${lockedCount}/${total} 个分镜已锁定，将被跳过`);
  }

  // 2. 过滤出有草图且未锁定的分镜
  const storyboardsWithSketch = storyboards.filter(sb => sb.sketch_url && sb.sketch_url.trim() !== '' && !sb.is_locked);
  const totalWithSketch = storyboardsWithSketch.length;

  if (totalWithSketch === 0) {
    console.log('[BatchSketchGen] 没有发现上传了草图的分镜');
    return {
      total,
      totalWithSketch: 0,
      completed: 0,
      skipped: 0,
      failed: 0,
      results: [],
      message: '没有发现上传了草图的分镜，请先为分镜上传草图'
    };
  }

  console.log(`[BatchSketchGen] 发现 ${totalWithSketch}/${total} 个分镜有草图`);

  // 3. 过滤需要处理的分镜（跳过已有帧的）
  const toProcess = [];
  const skippedResults = [];

  for (const sb of storyboardsWithSketch) {
    const hasExistingFrame = !!sb.first_frame_url;
    if (!overwriteFrames && hasExistingFrame) {
      console.log(`[BatchSketchGen] 分镜 ${sb.id} 已有帧图片，跳过`);
      skippedResults.push({ storyboardId: sb.id, status: 'skipped' });
    } else {
      toProcess.push(sb);
    }
  }

  const skipped = skippedResults.length;
  console.log(`[BatchSketchGen] 需要处理: ${toProcess.length}, 跳过: ${skipped}`);

  if (toProcess.length === 0) {
    return {
      total,
      totalWithSketch,
      completed: 0,
      skipped,
      failed: 0,
      results: skippedResults,
      message: '所有有草图的分镜都已生成帧图片'
    };
  }

  if (onProgress) onProgress(5);

  // 4. 设置总体超时机制
  const abortSignal = { aborted: false };
  let batchTimeoutId;
  let timedOut = false;

  // 创建超时处理函数
  const setupBatchTimeout = () => {
    return new Promise((resolve) => {
      batchTimeoutId = setTimeout(() => {
        console.log(`[BatchSketchGen] 总体超时触发（${Math.round(effectiveTimeout / 1000 / 60)}分钟），正在优雅终止...`);
        abortSignal.aborted = true;
        timedOut = true;
        // 给已运行任务宽限期后 resolve
        setTimeout(resolve, GRACE_PERIOD_MS);
      }, effectiveTimeout);
    });
  };

  // 5. 并发处理草图转图片（带超时）
  let processedCount = 0;
  let processResults;
  let abortedTasks = 0;

  const processingPromise = (async () => {
    const result = await runWithConcurrency(toProcess, maxConcurrency, async (sb, index) => {
      const description = sb.prompt_template || '';
      const sketchUrl = sb.sketch_url;
      const sketchType = sb.sketch_type || 'storyboard_sketch';

      console.log(`[BatchSketchGen] [${processedCount + 1}/${toProcess.length}] 处理分镜 ${sb.id}...`);

      try {
        const res = await handleSketchToImage({
          storyboardId: sb.id,
          processedSketchUrl: sketchUrl,
          sketchType,
          prompt: description,
          controlStrength,
          imageModel,
          textModel,
          aspectRatio
        }, null);

        processedCount++;
        console.log(`[BatchSketchGen] 分镜 ${sb.id} 生成成功`);

        // 更新进度
        const pct = 5 + Math.floor((processedCount / toProcess.length) * 90);
        if (onProgress) onProgress(pct);

        return {
          storyboardId: sb.id,
          status: 'completed',
          ...res
        };
      } catch (err) {
        processedCount++;
        console.error(`[BatchSketchGen] 分镜 ${sb.id} 生成失败:`, err.message);

        // 更新进度
        const pct = 5 + Math.floor((processedCount / toProcess.length) * 90);
        if (onProgress) onProgress(pct);

        return {
          storyboardId: sb.id,
          status: err.message.includes('超时') ? 'timeout' : 'failed',
          error: err.message
        };
      }
    }, { abortSignal, singleTaskTimeoutMs: SINGLE_TASK_TIMEOUT_MS });
    
    return result;
  })();

  // 使用 Promise.race 实现总体超时
  const timeoutPromise = setupBatchTimeout();
  
  try {
    const raceResult = await Promise.race([
      processingPromise.then(r => ({ type: 'completed', data: r })),
      timeoutPromise.then(() => ({ type: 'timeout' }))
    ]);

    if (raceResult.type === 'completed') {
      processResults = raceResult.data.results;
      abortedTasks = raceResult.data.abortedCount;
    } else {
      // 超时后等待处理 Promise 完成（已经设置了 abort 信号）
      const finalResult = await processingPromise;
      processResults = finalResult.results;
      abortedTasks = finalResult.abortedCount;
    }
  } finally {
    // 清理定时器，避免内存泄漏
    if (batchTimeoutId) {
      clearTimeout(batchTimeoutId);
    }
  }

  const elapsedMs = Date.now() - startTime;

  // 超时日志
  if (timedOut) {
    const completedBefore = processResults.filter(r => r && r.status === 'completed').length;
    const pendingCount = processResults.filter(r => !r || r.status === 'aborted').length;
    console.log(`[BatchSketchGen] 超时终止：已完成 ${completedBefore} 个，未执行 ${pendingCount} 个`);
  }

  // 6. 统计结果
  let completed = 0;
  let failed = 0;
  let timeout = 0;
  let aborted = 0;
  const allResults = [...skippedResults];

  for (const res of processResults) {
    if (!res) continue;
    if (res.status === 'completed') {
      completed++;
    } else if (res.status === 'timeout') {
      timeout++;
      failed++; // timeout 也计入 failed
    } else if (res.status === 'aborted') {
      aborted++;
    } else if (res.status === 'failed' || res.error) {
      failed++;
    }
    allResults.push(res);
  }

  if (onProgress) onProgress(100);
  
  const elapsedSeconds = Math.round(elapsedMs / 1000);
  const completionRate = toProcess.length > 0 ? Math.round((completed / toProcess.length) * 100) : 100;
  
  console.log(`[BatchSketchGen] 批量草图帧生成完成: 总计=${total}, 有草图=${totalWithSketch}, 成功=${completed}, 跳过=${skipped}, 失败=${failed}, 超时任务=${timeout}, 中断任务=${aborted}`);
  console.log(`[BatchSketchGen] 总耗时: ${elapsedSeconds}秒, 完成比例: ${completionRate}%, 是否超时终止: ${timedOut}`);

  return {
    total,
    totalWithSketch,
    completed,
    skipped,
    failed,
    controlStrength,
    maxConcurrency,
    results: allResults,
    // 新增超时相关信息
    timedOut,
    timeoutMs: effectiveTimeout,
    elapsedMs,
    abortedTasks: abortedTasks + aborted,
    timeoutTasks: timeout
  };
}

module.exports = handleBatchSketchFrameGeneration;
