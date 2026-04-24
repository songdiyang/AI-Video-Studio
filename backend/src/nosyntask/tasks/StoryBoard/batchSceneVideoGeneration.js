/**
 * 批量分镜视频生成处理器
 * 一键生成一集所有分镜的视频（并发池模式）
 *
 * 逻辑：
 * 1. 查询 scriptId 下所有分镜
 * 2. 过滤出需要生成分镜视频的分镜（跳过已有视频的，除非 overwriteVideos=true）
 * 3. 以并发池方式同时生成最多 maxConcurrency 个分镜视频
 * 4. 每个分镜调用 sceneVideoGeneration 生成视频（自带保存到数据库）
 * 5. 某个失败 → 记录错误，不影响其他并发任务
 *
 * input:  { scriptId, videoModel, textModel, duration, aspectRatio, overwriteVideos, maxConcurrency }
 * output: { total, completed, skipped, failed, results[] }
 */

const { queryAll, queryOne } = require('../../../dbHelper');
const handleSceneVideoGeneration = require('./sceneVideoGeneration');
const { requireVisualStyle } = require('../../../utils/getProjectStyle');
const { runPool } = require('../../utils/concurrencyPool');

async function handleBatchSceneVideoGeneration(inputParams, onProgress) {
  const {
    scriptId, videoModel, textModel, duration, aspectRatio, resolution,
    overwriteVideos = false, maxConcurrency = 20, think
  } = inputParams;

  if (!scriptId) {
    throw new Error('缺少必要参数: scriptId');
  }
  if (!videoModel) {
    throw new Error('videoModel 参数是必需的');
  }

  const concurrency = Math.min(Math.max(Number(maxConcurrency) || 20, 1), 20);
  console.log(`[BatchSceneVideoGen] 开始批量生成视频，scriptId: ${scriptId}, 覆盖: ${overwriteVideos}, 并发: ${concurrency}`);

  // 1. 查询所有分镜（带全字段，供下游复用）
  const storyboards = await queryAll(
    'SELECT * FROM storyboards WHERE script_id = ? ORDER BY idx ASC',
    [scriptId]
  );

  if (!storyboards || storyboards.length === 0) {
    throw new Error('该剧本下没有分镜数据');
  }

  const total = storyboards.length;
  let completed = 0;
  let skipped = 0;
  let failed = 0;
  const results = [];
  
  // 1.5 预取共享数据：视觉风格（同一项目查 1 次，而非 N 次）
  const projectId = storyboards[0].project_id;
  const visualStyle = await requireVisualStyle(projectId);
  
  // 构建邻居查找表：按 idx 索引，避免每个分镜单独查询前后镜头
  const idxMap = new Map();
  for (const sb of storyboards) {
    if (sb.idx != null) idxMap.set(sb.idx, sb);
  }
  
  /** 安全解析 variables_json */
  function safeParseVariables(raw) {
    if (!raw) return {};
    if (typeof raw === 'object') return raw;
    try { return JSON.parse(raw); } catch { return {}; }
  }

  // 2. 构建任务列表：跳过不需要生成的，其余包装成 async 函数
  const taskFns = [];
  const taskMeta = []; // 保持与 taskFns 一一对应的元信息

  for (let i = 0; i < storyboards.length; i++) {
    const sb = storyboards[i];
    const vars = safeParseVariables(sb.variables_json);

    const hasExistingVideo = !!sb.video_url;

    // 跳过已有视频的分镜
    if (!overwriteVideos && hasExistingVideo) {
      console.log(`[BatchSceneVideoGen] [${i + 1}/${total}] 分镜 ${sb.id} 已有视频，跳过`);
      skipped++;
      results.push({ storyboardId: sb.id, status: 'skipped' });
      continue;
    }

    const idx = i;

    // 包装成 async 函数放入池，传递预取上下文避免重复 DB 查询
    taskFns.push(async () => {
      console.log(`[BatchSceneVideoGen] [${idx + 1}/${total}] 开始生成分镜 ${sb.id} 的视频...`);
      // 构建邻居上下文
      const prevNeighbor = (sb.idx != null && idxMap.has(sb.idx - 1)) ? idxMap.get(sb.idx - 1) : null;
      const nextNeighbor = (sb.idx != null && idxMap.has(sb.idx + 1)) ? idxMap.get(sb.idx + 1) : null;

      return await handleSceneVideoGeneration({
        storyboardId: sb.id,
        videoModel,
        textModel,
        duration,
        aspectRatio,
        resolution,
        think,
        _context: {
          storyboard: sb,
          variables: vars,
          visualStyle,
          prevNeighbor,
          nextNeighbor
        }
      }, null);
    });

    taskMeta.push({ storyboardId: sb.id, index: idx });
  }

  console.log(`[BatchSceneVideoGen] 需要生成: ${taskFns.length}, 跳过: ${skipped}, 并发: ${concurrency}`);

  if (onProgress) onProgress(5);

  // 3. 并发池执行
  if (taskFns.length > 0) {
    const poolResults = await runPool(taskFns, concurrency, (done, taskTotal) => {
      // 进度：5% ~ 95%
      const pct = 5 + Math.floor((done / taskTotal) * 90);
      if (onProgress) onProgress(pct);
    });

    // 4. 收集结果
    for (let i = 0; i < poolResults.length; i++) {
      const meta = taskMeta[i];
      const res = poolResults[i];
      if (res instanceof Error) {
        console.error(`[BatchSceneVideoGen] 分镜 ${meta.storyboardId} 生成失败:`, res.message);
        failed++;
        results.push({ storyboardId: meta.storyboardId, status: 'failed', error: res.message });
      } else {
        console.log(`[BatchSceneVideoGen] 分镜 ${meta.storyboardId} 生成成功`);
        completed++;
        results.push({
          storyboardId: meta.storyboardId,
          status: 'completed',
          videoUrl: res.videoUrl,
          model: res.model
        });
      }
    }
  }

  if (onProgress) onProgress(100);
  console.log(`[BatchSceneVideoGen] 批量视频生成完成: 总计=${total}, 成功=${completed}, 跳过=${skipped}, 失败=${failed}`);

  return {
    total,
    completed,
    skipped,
    failed,
    results
  };
}

module.exports = handleBatchSceneVideoGeneration;
