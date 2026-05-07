/**
 * 基础视频模型调用任务
 * 使用公共轮询组件 submitAndPoll 处理同步/异步视频生成模型
 *
 * 智能路由支持：
 *   - 传入具体模型名称 → 直接调用
 *   - 传入 '@auto' 或 '@router' → 由 ModelRouter 根据任务类型自动选择
 *
 * 输入参数:
 * @param {string} params.prompt - 视频描述提示词
 * @param {string} params.videoModel - 视频生成模型名称（统一字段名，支持 @auto/@router）
 * @param {number} params.duration - 视频时长（秒）
 * @param {string} params.imageUrl - 单张参考图片 URL（图生视频，可选）。模板占位符: {{imageUrl}}
 * @param {string[]} params.imageUrls - 参考图片 URL 数组（可选）。模板占位符: {{imageUrls}}
 * @param {string} params.aspectRatio - 画面比例（如 "16:9"、"9:16"、"1:1"，可选）。模板占位符: {{aspectRatio}}
 *
 * 输出:
 * @returns {Object} { video_url, taskId, tokens, provider }
 */

const { submitAndPoll } = require('../pollUtils');
const { resolveMediaUrl } = require('./mediaResultResolver');

// 懒加载 ModelRouter
let modelRouter = null;
function getModelRouter() {
  if (!modelRouter) {
    const { modelRouter: router } = require('../../../services/ModelRouter');
    modelRouter = router;
  }
  return modelRouter;
}

/**
 * 解析视频模型名称，支持智能路由
 */
async function resolveVideoModelName(modelName, stepType, projectConfig = {}) {
  if (!modelName || modelName === '@auto' || modelName === '@router') {
    if (!stepType) {
      throw new Error('使用 @auto/@router 时必须提供 stepType');
    }
    const router = getModelRouter();
    const selected = await router.selectModelForWorkflowStep(stepType, projectConfig);
    if (!selected) {
      throw new Error(`ModelRouter 未找到适合步骤 "${stepType}" 的视频模型`);
    }
    console.log(`[VideoModelCall] 智能路由选择: ${selected.name} (步骤: ${stepType})`);
    return selected.name;
  }
  return modelName;
}

async function handleBaseVideoModelCall(inputParams, onProgress) {
  const {
    prompt,
    videoModel: rawModelName,
    duration,
    imageUrl,
    imageUrls,
    startFrame,
    endFrame,
    aspectRatio,
    resolution,
    stepType,
    projectConfig
  } = inputParams;

  if (!rawModelName) {
    throw new Error('videoModel 参数是必需的');
  }

  // 解析模型名称（支持 @auto/@router）
  const modelName = await resolveVideoModelName(rawModelName, stepType, projectConfig);

  console.log('[BaseVideoModelCall] 开始调用视频模型:', {
    modelName,
    promptLength: prompt?.length || 0,
    hasImage: !!imageUrl,
    hasStartFrame: !!startFrame,
    hasEndFrame: !!endFrame,
    aspectRatio: aspectRatio || '未指定'
  });

  if (onProgress) onProgress(10);

  // 构建提交参数（图片参数派生由 templateRenderer.renderWithFallback 统一处理）
  const submitParams = {
    prompt: prompt || ''
  };

  if (duration !== undefined && duration !== null) submitParams.duration = duration;

  if (imageUrl)    submitParams.imageUrl = imageUrl;
  if (imageUrls)   submitParams.imageUrls = imageUrls;
  if (startFrame)  submitParams.startFrame = startFrame;
  if (endFrame)    submitParams.endFrame = endFrame;
  if (aspectRatio) submitParams.aspectRatio = aspectRatio;
  if (resolution) submitParams.resolution = resolution;

  // 视频生成通常耗时较长，轮询间隔和超时都比图片大
  const result = await submitAndPoll(modelName, submitParams, {
    intervalMs: 5000,
    maxDurationMs: 3600000,   // 10 分钟超时
    onProgress,
    progressStart: 20,
    progressEnd: 90,
    logTag: 'BaseVideoModelCall'
  });

  const mediaResolution = resolveMediaUrl(result, 'video');
  console.log('[BaseVideoModelCall] 返回字段诊断:', {
    modelName,
    mappedKeys: result && typeof result === 'object' ? Object.keys(result) : [],
    queryKeys: result?._queryResult && typeof result._queryResult === 'object' ? Object.keys(result._queryResult) : [],
    rawQueryKeys: result?._rawQueryResult && typeof result._rawQueryResult === 'object' ? Object.keys(result._rawQueryResult) : [],
    submitKeys: result?._submitResult && typeof result._submitResult === 'object' ? Object.keys(result._submitResult) : [],
    selectedUrl: mediaResolution.mediaUrl,
    resolvedFrom: mediaResolution.resolvedFrom,
    urlCandidates: mediaResolution.candidates,
    aspectRatio: aspectRatio || null,
    duration: duration ?? null
  });

  if (!mediaResolution.mediaUrl) {
    throw new Error(`视频模型 "${modelName}" 返回成功但未找到视频 URL，请检查 response_mapping / query_success_mapping 配置`);
  }

  if (onProgress) onProgress(100);

  return {
    video_url: mediaResolution.mediaUrl,
    taskId: result._submitResult?.taskId || null,
    tokens: result._submitResult?.tokens || 0,
    provider: result._submitResult?._model?.provider || 'unknown',
    _routing: {
      originalModel: rawModelName,
      resolvedModel: modelName,
      stepType: stepType || null
    }
  };
}

module.exports = handleBaseVideoModelCall;
