/**
 * 图片生成处理器（角色/场景通用）
 * 使用公共轮询组件 submitAndPoll 处理同步/异步模型
 *
 * 智能路由支持：
 *   - 传入具体模型名称 → 直接调用
 *   - 传入 '@auto' 或 '@router' → 由 ModelRouter 根据任务类型自动选择
 *
 * input:  { prompt, imageModel, aspectRatio?, width?, height?, imageUrl?, imageUrls?, negative_prompt?, textModel?, stepType? }
 * output: { image_url, taskId?, tokens?, provider }
 */

const { submitAndPoll } = require('../pollUtils');
const { resolveMediaUrl } = require('./mediaResultResolver');
const { mergeNegativeIntoPositive } = require('../../utils/negativeToPositive');

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
 * 解析图像模型名称，支持智能路由
 */
async function resolveImageModelName(modelName, stepType, projectConfig = {}) {
  if (!modelName || modelName === '@auto' || modelName === '@router') {
    if (!stepType) {
      throw new Error('使用 @auto/@router 时必须提供 stepType');
    }
    const router = getModelRouter();
    const selected = await router.selectModelForWorkflowStep(stepType, projectConfig);
    if (!selected) {
      throw new Error(`ModelRouter 未找到适合步骤 "${stepType}" 的图像模型`);
    }
    console.log(`[ImageGen] 智能路由选择: ${selected.name} (步骤: ${stepType})`);
    return selected.name;
  }
  return modelName;
}

async function handleImageGeneration(inputParams, onProgress) {
  const { prompt, imageModel: rawModelName, width, height, aspectRatio, resolution, size, imageUrl, imageUrls, startFrame, endFrame, strength, mask_image, negative_prompt, textModel, stepType, projectConfig } = inputParams;

  if (!rawModelName) {
    throw new Error('imageModel 参数是必需的');
  }

  // 解析模型名称（支持 @auto/@router）
  const modelName = await resolveImageModelName(rawModelName, stepType, projectConfig);

  if (onProgress) onProgress(10);

  // 反向提示词转正向并合并到主提示词
  let finalPrompt = prompt;
  if (negative_prompt) {
    try {
      finalPrompt = await mergeNegativeIntoPositive(prompt, negative_prompt, { textModel });
      console.log('[ImageGen] 反向提示词已转为正向并合并，原始长度:', prompt.length, '→ 合并后:', finalPrompt.length);
    } catch (err) {
      console.warn('[ImageGen] 反向提示词转换失败，使用原始提示词:', err.message);
      finalPrompt = prompt;
    }
  }

  // 构建提交参数（图片参数派生由 templateRenderer.renderWithFallback 统一处理）
  const submitParams = {
    prompt: finalPrompt
  };

  // 不再传 negative_prompt 给模型，已通过 mergeNegativeIntoPositive 转为正向提示词合并

  if (size) submitParams.size = size;  // 支持直接传递 size（如 '2k', '3k'）
  if (width !== undefined && width !== null) submitParams.width = width;
  if (height !== undefined && height !== null) submitParams.height = height;
  if (aspectRatio) submitParams.aspectRatio = aspectRatio;
  if (resolution) submitParams.resolution = resolution;

  if (imageUrl)    submitParams.imageUrl = imageUrl;
  if (imageUrls)   submitParams.imageUrls = imageUrls;
  if (startFrame)  submitParams.startFrame = startFrame;
  if (endFrame)    submitParams.endFrame = endFrame;
  if (strength !== undefined && strength !== null) submitParams.strength = strength;
  if (mask_image) submitParams.mask_image = mask_image;

  const result = await submitAndPoll(modelName, submitParams, {
    intervalMs: 3000,
    maxDurationMs: 300000,
    onProgress,
    progressStart: 30,
    progressEnd: 90,
    logTag: 'ImageGen'
  });

  const mediaResolution = resolveMediaUrl(result, 'image');
  console.log('[ImageGen] 返回字段诊断:', {
    modelName,
    mappedKeys: result && typeof result === 'object' ? Object.keys(result) : [],
    queryKeys: result?._queryResult && typeof result._queryResult === 'object' ? Object.keys(result._queryResult) : [],
    rawQueryKeys: result?._rawQueryResult && typeof result._rawQueryResult === 'object' ? Object.keys(result._rawQueryResult) : [],
    submitKeys: result?._submitResult && typeof result._submitResult === 'object' ? Object.keys(result._submitResult) : [],
    selectedUrl: mediaResolution.mediaUrl,
    resolvedFrom: mediaResolution.resolvedFrom,
    urlCandidates: mediaResolution.candidates,
    aspectRatio: aspectRatio || null,
    width: width ?? null,
    height: height ?? null
  });

  if (!mediaResolution.mediaUrl) {
    throw new Error(`图片模型 "${modelName}" 返回成功但未找到图片 URL，请检查 response_mapping / query_success_mapping 配置`);
  }

  if (onProgress) onProgress(100);

  return {
    image_url: mediaResolution.mediaUrl,
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

module.exports = handleImageGeneration;
