/**
 * 火山引擎模型（豆包 Seedream/Seedance）专用计费处理器
 * 
 * 用于解析火山引擎 API 返回的消耗数据
 * 
 * 使用方法：在 ai_model_configs 表中配置：
 * - billing_handler: 'volcengine' (同步模型如 Seedream)
 * - billing_query_handler: 'volcengine' (异步模型如 Seedance)
 */

/**
 * 从火山引擎 Seedream 图片生成响应中提取消耗
 * Seedream 返回格式：
 * {
 *   "data": [{ "url": "...", "index": 0 }, ...],
 *   "created": 1234567890
 * }
 */
function extractSeedreamUsage(result) {
  const raw = result?._raw || result;
  
  // 图片数量：data 数组长度
  let itemCount = 0;
  if (Array.isArray(raw?.data)) {
    itemCount = raw.data.length;
  } else if (Array.isArray(raw?.images)) {
    itemCount = raw.images.length;
  }
  
  return {
    itemCount: itemCount || 1,
    requestCount: 1
  };
}

/**
 * 从火山引擎 Seedance 视频生成查询响应中提取消耗
 * Seedance 返回格式：
 * {
 *   "id": "task_xxx",
 *   "status": "succeeded",
 *   "output": {
 *     "video_url": "...",
 *     "duration": 5.0
 *   },
 *   "usage": {
 *     "total_tokens": 308880,
 *     "prompt_tokens": 0,
 *     "completion_tokens": 308880
 *   }
 * }
 */
function extractSeedanceUsage(finalResult, requestParams) {
  const raw = finalResult?._raw || finalResult;
  const params = finalResult?._queryParams || requestParams || {};
  
  // 1. 提取 token 用量
  let totalTokens = 0;
  let inputTokens = 0;
  let outputTokens = 0;
  
  const usage = raw?.usage || raw?.data?.usage;
  if (usage) {
    totalTokens = usage.total_tokens || usage.totalTokens || 0;
    inputTokens = usage.prompt_tokens || usage.input_tokens || usage.promptTokens || 0;
    outputTokens = usage.completion_tokens || usage.output_tokens || usage.completionTokens || 0;
  }
  
  // 2. 提取视频时长（秒）
  // 优先从响应中获取，其次使用请求参数
  let durationSeconds = 0;
  
  // 从 output 中获取
  if (raw?.output?.duration !== undefined) {
    durationSeconds = parseFloat(raw.output.duration) || 0;
  } else if (raw?.data?.output?.duration !== undefined) {
    durationSeconds = parseFloat(raw.data.output.duration) || 0;
  }
  
  // 从 content_info 获取（某些版本 API）
  if (!durationSeconds && raw?.content_info?.duration !== undefined) {
    durationSeconds = parseFloat(raw.content_info.duration) || 0;
  }
  
  // 兜底：使用请求参数中的 duration
  if (!durationSeconds) {
    durationSeconds = parseFloat(params.duration || params.durationSeconds || 0) || 0;
  }
  
  // 如果还是没有，默认 5 秒
  if (!durationSeconds) {
    durationSeconds = 5;
    console.warn('[VolcEngine BillingHandler] 无法从响应中提取视频时长，使用默认值 5 秒');
  }
  
  return {
    totalTokens,
    inputTokens,
    outputTokens,
    durationSeconds,
    requestCount: 1
  };
}

module.exports = {
  /**
   * 同步模型（如 Seedream 图片生成）消耗解析
   * 在 finalizeImmediateBilling 时调用
   */
  async resolveUsage({ submitResult, finalResult, params, modelConfig, requestStatus }) {
    console.log('[VolcEngine BillingHandler] resolveUsage 被调用');
    
    const category = modelConfig?.category?.toUpperCase();
    
    if (category === 'IMAGE') {
      const usage = extractSeedreamUsage(finalResult || submitResult);
      console.log('[VolcEngine BillingHandler] 图片生成消耗:', usage);
      return usage;
    }
    
    if (category === 'VIDEO') {
      // 同步视频（虽然 Seedance 通常是异步的，但保留兼容）
      const usage = extractSeedanceUsage(finalResult || submitResult, params);
      console.log('[VolcEngine BillingHandler] 视频生成消耗:', usage);
      return usage;
    }
    
    // 文本模型：直接返回 null，让默认逻辑处理
    return null;
  },
  
  /**
   * 异步模型（如 Seedance 视频生成）查询完成后的消耗解析
   * 在 finalizeAsyncBillingFromQuery 时调用
   */
  async resolveUsageFromQuery({ submitResult, finalResult, params, modelConfig, requestStatus }) {
    console.log('[VolcEngine BillingHandler] resolveUsageFromQuery 被调用');
    
    const category = modelConfig?.category?.toUpperCase();
    
    if (category === 'VIDEO') {
      const usage = extractSeedanceUsage(finalResult, params);
      console.log('[VolcEngine BillingHandler] 异步视频生成最终消耗:', usage);
      return usage;
    }
    
    if (category === 'IMAGE') {
      // 异步图片（理论上 Seedream 是同步的，但保留兼容）
      const usage = extractSeedreamUsage(finalResult);
      console.log('[VolcEngine BillingHandler] 异步图片生成最终消耗:', usage);
      return usage;
    }
    
    return null;
  },
  
  /**
   * 预估消耗（可选）
   * 在 prepareModelBilling 时调用，用于余额检查
   */
  async estimate(params, model, normalizedPriceConfig) {
    const category = model?.category?.toUpperCase();
    
    if (category === 'IMAGE') {
      // 图片：从 n 参数获取数量，默认 1
      const itemCount = parseInt(params.n || params.count || params.itemCount || 1) || 1;
      return { itemCount, requestCount: 1 };
    }
    
    if (category === 'VIDEO') {
      // 视频：从 duration 参数获取时长，默认 5 秒
      const durationSeconds = parseInt(params.duration || params.durationSeconds || 5) || 5;
      return { durationSeconds, requestCount: 1 };
    }
    
    return null;
  }
};
