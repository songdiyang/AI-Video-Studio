/**
 * 批量分镜帧生成处理器（串行链式模式 + 容错优化）
 * 一键生成一集所有分镜的首帧/首尾帧图片
 * 
 * 为保持镜头间连续性，必须串行生成：
 * 每个镜头的首帧需要上一镜头的尾帧作为参考图，提示词也需要上一镜头描述作为上下文。
 * 
 * 逻辑：
 * 1. 查询 scriptId 下所有分镜（按 idx 排序）
 * 2. 串行遍历每个分镜：
 *    - 跳过已有帧的（除非 overwriteFrames=true），但仍然取其尾帧传递给下一个
 *    - hasAction=true  → 调用 frameGeneration（首尾帧）
 *    - hasAction=false → 调用 singleFrameGeneration（单帧）
 *    - 传入 prevEndFrameUrl + prevDescription 保持连续性
 * 3. 每个镜头完成后，取其"最终帧"传给下一个：
 *    - 动作镜头 → last_frame_url
 *    - 静态镜头 → last_frame_url（已统一为与首帧相同）
 * 4. 容错机制：某个镜头失败时记录错误，继续尝试后续镜头（使用默认参考）
 * 
 * input:  { scriptId, imageModel, textModel, overwriteFrames, aspectRatio, continueOnError }
 * output: { total, completed, skipped, failed, results[] }
 */

const { queryAll, queryOne, execute } = require('../../../dbHelper');
const handleFrameGeneration = require('./frameGeneration');
const handleSingleFrameGeneration = require('./singleFrameGeneration');
const { generateFramesParallel } = require('./independentFrameGeneration');
const { requireVisualStyle } = require('../../../utils/getProjectStyle');

/**
 * 获取分镜的"最终帧" URL
 * - 动作镜头（hasAction=true）→ 尾帧 last_frame_url
 * - 静态镜头（hasAction=false）→ 尾帧 last_frame_url（已统一与首帧相同）
 */
function getFinalFrameUrl(sb, vars) {
  // 优先使用 last_frame_url（静态镜头已统一设置）
  if (sb.last_frame_url) {
    return sb.last_frame_url;
  }
  // 兼容旧数据：静态镜头可能只有 first_frame_url
  return sb.first_frame_url || null;
}

async function handleBatchFrameGeneration(inputParams, onProgress) {
  const {
    scriptId, imageModel, textModel, overwriteFrames = false,
    aspectRatio, resolution, continueOnError = true  // 新增：默认启用容错模式
  } = inputParams;

  if (!scriptId) {
    throw new Error('缺少必要参数: scriptId');
  }
  if (!imageModel) {
    throw new Error('imageModel 参数是必需的');
  }

  console.log(`[BatchFrameGen] 开始批量串行生成，scriptId: ${scriptId}, 覆盖: ${overwriteFrames}, 容错: ${continueOnError}, resolution: ${resolution || '未设置'}`);

  // 0. 覆盖模式：先批量清除所有分镜的首尾帧，让前端立即看到帧被清除
  if (overwriteFrames) {
    console.log('[BatchFrameGen] 覆盖模式：清除所有已有首尾帧...');
    await execute(
      'UPDATE storyboards SET first_frame_url = NULL, last_frame_url = NULL, updated_scene_url = NULL WHERE script_id = ?',
      [scriptId]
    );
    console.log('[BatchFrameGen] 已清除所有首尾帧');
  }

  // 1. 查询所有分镜（按顺序，含锁定状态）
  const storyboards = await queryAll(
    'SELECT id, prompt_template, variables_json, first_frame_url, last_frame_url, is_locked FROM storyboards WHERE script_id = ? ORDER BY idx ASC',
    [scriptId]
  );

  if (!storyboards || storyboards.length === 0) {
    throw new Error('该剧本下没有分镜数据');
  }

  const allCount = storyboards.length;
  const lockedCount = storyboards.filter(sb => sb.is_locked).length;
  if (lockedCount > 0) {
    console.log(`[BatchFrameGen] ${lockedCount}/${allCount} 个分镜已锁定，将被跳过`);
  }

  // === 优化：预取项目视觉风格（只查询一次，所有分镜共享） ===
  const scriptInfo = await queryOne(
    'SELECT project_id FROM scripts WHERE id = ?',
    [scriptId]
  );
  if (!scriptInfo || !scriptInfo.project_id) {
    throw new Error('无法获取剧本所属项目信息');
  }
  const projectId = scriptInfo.project_id;
  const visualStyle = await requireVisualStyle(projectId);
  console.log(`[BatchFrameGen] 预取项目视觉风格完成，projectId: ${projectId}`);

  const total = storyboards.length;
  let completed = 0;
  let skipped = 0;
  let failed = 0;
  const results = [];

  // 链式传递的上一镜头信息
  let prevEndFrameUrl = null;
  let prevDescription = null;
  let prevEndState = null;

  if (onProgress) onProgress(5);

  // 2. 串行遍历每个分镜
  for (let i = 0; i < storyboards.length; i++) {
    const sb = storyboards[i];
    
    // 跳过锁定分镜（仍取尾帧传递给下一个）
    if (sb.is_locked) {
      console.log(`[BatchFrameGen] [${i + 1}/${total}] 分镜 ${sb.id} 已锁定，跳过生成（仍传递尾帧给下一镜头）`);
      const vars = typeof sb.variables_json === 'string'
        ? JSON.parse(sb.variables_json || '{}')
        : (sb.variables_json || {});
      prevEndFrameUrl = getFinalFrameUrl(sb, vars);
      prevDescription = sb.prompt_template || '';
      prevEndState = vars.endState || null;
      skipped++;
      results.push({ storyboardId: sb.id, status: 'skipped_locked' });
      continue;
    }
    
    const vars = typeof sb.variables_json === 'string'
      ? JSON.parse(sb.variables_json || '{}')
      : (sb.variables_json || {});
    const hasAction = vars.hasAction || false;
    const description = sb.prompt_template || '';
    const isFirstScene = (i === 0);

    // === 优化：智能识别帧缺失情况 ===
    const hasFirstFrame = !!sb.first_frame_url;
    const hasLastFrame = !!sb.last_frame_url;
    
    // 判断是否需要生成：
    // - 动作分镜（hasAction=true）：需要首帧和尾帧都存在才算完整
    // - 静态分镜（hasAction=false）：只需要首帧存在即可（尾帧会自动设为与首帧相同）
    const isComplete = hasAction 
      ? (hasFirstFrame && hasLastFrame)  // 动作分镜需要首尾帧都有
      : hasFirstFrame;                    // 静态分镜只需要首帧

    // 跳过已完整的分镜（但仍然要取其最终帧传递给下一个）
    if (!overwriteFrames && isComplete) {
      console.log(`[BatchFrameGen] [${i + 1}/${total}] 分镜 ${sb.id} 帧图片完整，跳过（传递尾帧给下一镜头）`);
      prevEndFrameUrl = getFinalFrameUrl(sb, vars);
      prevDescription = description;
      prevEndState = vars.endState || null;
      skipped++;
      results.push({ storyboardId: sb.id, status: 'skipped' });
      continue;
    }

    // 记录需要生成的情况
    if (hasAction && hasFirstFrame && !hasLastFrame) {
      console.log(`[BatchFrameGen] [${i + 1}/${total}] 分镜 ${sb.id} 动作分镜缺少尾帧，将补充生成`);
    } else if (hasAction && !hasFirstFrame && hasLastFrame) {
      console.log(`[BatchFrameGen] [${i + 1}/${total}] 分镜 ${sb.id} 动作分镜缺少首帧，将补充生成`);
    }

    try {
      let res;
      if (hasAction) {
        console.log(`[BatchFrameGen] [${i + 1}/${total}] 分镜 ${sb.id} 有动作，生成首尾帧...`);
        res = await handleFrameGeneration({
          storyboardId: sb.id,
          prompt: description,
          imageModel,
          textModel,
          aspectRatio,
          resolution,
          prevEndFrameUrl,
          prevDescription,
          prevEndState,
          isFirstScene,
          visualStyle  // 传递预取的视觉风格
        }, null);
        // 动作镜头的最终帧 = 尾帧
        prevEndFrameUrl = res.endFrame || res.startFrame;
      } else {
        console.log(`[BatchFrameGen] [${i + 1}/${total}] 分镜 ${sb.id} 无动作，生成单帧...`);
        res = await handleSingleFrameGeneration({
          storyboardId: sb.id,
          description,
          imageModel,
          textModel,
          aspectRatio,
          resolution,
          prevEndFrameUrl,
          prevDescription,
          prevEndState,
          isFirstScene,
          visualStyle  // 传递预取的视觉风格
        }, null);
        // 静态镜头：使用统一的 lastFrameUrl（已与首帧相同）
        prevEndFrameUrl = res.lastFrameUrl || res.firstFrameUrl;
      }

      prevDescription = description;
      prevEndState = vars.endState || null;
      completed++;
      console.log(`[BatchFrameGen] 分镜 ${sb.id} 生成成功`);
      results.push({
        storyboardId: sb.id,
        status: 'completed',
        type: hasAction ? 'frame' : 'single_frame',
        ...res
      });
    } catch (err) {
      console.error(`[BatchFrameGen] 分镜 ${sb.id} 生成失败:`, err.message);
      failed++;
      results.push({ storyboardId: sb.id, status: 'failed', error: err.message });
      
      // 容错机制：根据 continueOnError 决定是否继续
      if (!continueOnError) {
        // 严格模式：失败后立即中断
        console.error(`[BatchFrameGen] 严格模式：链条中断，跳过剩余 ${total - i - 1} 个镜头`);
        break;
      } else {
        // 容错模式 + 链断裂优化：剩余任务切换到并行模式
        const remainingIds = storyboards.slice(i + 1).map(s => s.id);
        if (remainingIds.length > 0) {
          console.warn(`[BatchFrameGen] 链断裂优化：剩余 ${remainingIds.length} 个镜头切换到并行模式处理...`);
          try {
            const parallelResult = await generateFramesParallel({
              storyboardIds: remainingIds,
              imageModel,
              textModel,
              aspectRatio,
              maxConcurrency: 5
            }, null);
            
            // 合并并行结果
            completed += parallelResult.completed;
            failed += parallelResult.failed;
            results.push(...parallelResult.results);
            console.log(`[BatchFrameGen] 并行模式完成：成功=${parallelResult.completed}, 失败=${parallelResult.failed}`);
          } catch (parallelErr) {
            console.error('[BatchFrameGen] 并行模式执行失败:', parallelErr.message);
            // 标记剩余任务为失败
            remainingIds.forEach(id => {
              failed++;
              results.push({ storyboardId: id, status: 'failed', error: '链断裂后并行处理失败' });
            });
          }
        }
        break; // 已处理完剩余任务，退出主循环
      }
    }

    // 进度：5% ~ 95%
    const pct = 5 + Math.floor(((i + 1) / total) * 90);
    if (onProgress) onProgress(pct);
  }

  if (onProgress) onProgress(100);
  console.log(`[BatchFrameGen] 批量串行生成完成: 总计=${total}, 成功=${completed}, 跳过=${skipped}, 失败=${failed}`);

  // 计算链式中断数量（因失败导致无参考图的镜头）
  const chainBroken = failed > 0 && !continueOnError ? (total - completed - skipped - failed) : 0;

  return {
    total,
    completed,
    skipped,
    failed,
    chainBroken, // 新增：链式中断导致未处理的镜头数
    continueOnError,
    results
  };
}

module.exports = handleBatchFrameGeneration;
