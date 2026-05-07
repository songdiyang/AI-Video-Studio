/**
 * OpenAI 全系模型计费处理器
 *
 * 覆盖模型类型：
 * - 文本：GPT-4o, GPT-4, GPT-3.5, o1, o3 等
 * - 图像：DALL-E 3, DALL-E 2
 * - 视频：Sora
 *
 * 计费模式：
 * - TOKEN_DUAL：输入/输出 Token 分开计价
 * - COUNT_SIZE_TIER：图像按张数 + 尺寸档位
 * - TIME_RES_TIER：视频按时长 + 分辨率档位
 */

/**
 * 从 OpenAI 标准响应中提取 Usage
 * OpenAI 返回格式：
 * {
 *   "usage": {
 *     "prompt_tokens": 100,
 *     "completion_tokens": 50,
 *     "total_tokens": 150,
 *     "prompt_tokens_details": { "cached_tokens": 20 },
 *     "completion_tokens_details": { "reasoning_tokens": 30 }
 *   }
 * }
 */
function extractOpenAIUsage(result) {
  const raw = result?._raw || result;
  const usage = raw?.usage || raw?.data?.usage || {};

  const inputTokens = usage.prompt_tokens || usage.input_tokens || 0;
  const outputTokens = usage.completion_tokens || usage.output_tokens || 0;
  const totalTokens = usage.total_tokens || (inputTokens + outputTokens);

  // 提取详情（用于账单展示）
  const details = {
    cachedTokens: usage.prompt_tokens_details?.cached_tokens || 0,
    reasoningTokens: usage.completion_tokens_details?.reasoning_tokens || 0,
    audioTokens: usage.prompt_tokens_details?.audio_tokens || 0,
    imageTokens: usage.prompt_tokens_details?.image_tokens || 0
  };

  return {
    inputTokens,
    outputTokens,
    totalTokens,
    requestCount: 1,
    _details: details
  };
}

/**
 * 从 DALL-E 图像生成响应中提取消耗
 * DALL-E 返回格式：
 * {
 *   "data": [
 *     { "url": "...", "revised_prompt": "..." },
 *     { "url": "...", "revised_prompt": "..." }
 *   ],
 *   "created": 1234567890
 * }
 */
function extractDalleUsage(result) {
  const raw = result?._raw || result;

  let itemCount = 0;
  if (Array.isArray(raw?.data)) {
    itemCount = raw.data.length;
  } else if (Array.isArray(raw?.images)) {
    itemCount = raw.images.length;
  }

  // 尝试从请求参数获取尺寸档位信息
  const size = result?._submitParams?.size || result?._queryParams?.size || '1024x1024';

  return {
    itemCount: itemCount || 1,
    requestCount: 1,
    _imageDetails: {
      size,
      count: itemCount || 1
    }
  };
}

/**
 * 从 Sora 视频生成响应中提取消耗
 * Sora 返回格式（通过 OpenAI API）：
 * {
 *   "data": [{ "url": "..." }],
 *   "usage": { "total_tokens": 50000 }
 * }
 * 或异步查询格式
 */
function extractSoraUsage(result, requestParams) {
  const raw = result?._raw || result;
  const params = requestParams || result?._queryParams || result?._submitParams || {};

  // 优先从 usage 取 Token
  const usage = raw?.usage || {};
  let totalTokens = usage.total_tokens || 0;

  // 如果 API 没有返回 Token，按时长+分辨率估算
  let durationSeconds = 0;
  let resolution = '';

  // 从响应提取
  if (raw?.duration) {
    durationSeconds = parseFloat(raw.duration) || 0;
  } else if (raw?.output?.duration) {
    durationSeconds = parseFloat(raw.output.duration) || 0;
  }

  // 从请求参数提取
  if (!durationSeconds) {
    durationSeconds = parseFloat(params.duration || params.video_duration || params.length || 0);
  }

  // 分辨率
  resolution = params.resolution || params.size || params.video_size || '1080p';

  // 兜底：默认 5 秒
  if (!durationSeconds) {
    durationSeconds = 5;
  }

  return {
    totalTokens,
    inputTokens: 0,
    outputTokens: totalTokens,
    durationSeconds,
    requestCount: 1,
    _videoDetails: {
      durationSeconds,
      resolution,
      hasTokenUsage: totalTokens > 0
    }
  };
}

/**
 * 根据模型类别选择提取器
 */
function extractByCategory(result, params, modelConfig) {
  const category = modelConfig?.category?.toUpperCase();

  if (category === 'IMAGE') {
    return extractDalleUsage(result);
  }

  if (category === 'VIDEO') {
    return extractSoraUsage(result, params);
  }

  // 默认文本模型
  return extractOpenAIUsage(result);
}

module.exports = {
  /**
   * 同步模型消耗解析
   */
  async resolveUsage({ submitResult, finalResult, params, modelConfig, requestStatus }) {
    console.log('[OpenAI BillingHandler] resolveUsage 被调用');
    const result = finalResult || submitResult;
    const usage = extractByCategory(result, params, modelConfig);
    console.log('[OpenAI BillingHandler] 解析消耗:', usage);
    return usage;
  },

  /**
   * 异步模型查询完成后的消耗解析
   */
  async resolveUsageFromQuery({ submitResult, finalResult, params, modelConfig, requestStatus }) {
    console.log('[OpenAI BillingHandler] resolveUsageFromQuery 被调用');
    const usage = extractByCategory(finalResult, params, modelConfig);
    console.log('[OpenAI BillingHandler] 异步解析消耗:', usage);
    return usage;
  },

  /**
   * 预估消耗
   */
  async estimate(params, model, normalizedPriceConfig) {
    console.log('[OpenAI BillingHandler] estimate 被调用');
    const category = model?.category?.toUpperCase();

    if (category === 'IMAGE') {
      // DALL-E：从 n 参数获取图片数量
      const itemCount = parseInt(params.n || params.count || 1) || 1;
      const size = params.size || '1024x1024';
      return {
        itemCount,
        requestCount: 1,
        _imageDetails: { size, count: itemCount }
      };
    }

    if (category === 'VIDEO') {
      // Sora：从 duration/resolution 参数获取
      const durationSeconds = parseFloat(params.duration || params.length || 5) || 5;
      const resolution = params.resolution || params.size || '1080p';
      return {
        durationSeconds,
        requestCount: 1,
        _videoDetails: { durationSeconds, resolution }
      };
    }

    // 文本模型：估算输入 Token
    const promptText = params.prompt || params.messages || '';
    const text = Array.isArray(promptText)
      ? promptText.map(m => m.content || '').join('\n')
      : String(promptText);
    const cjkCount = (text.match(/[\u4e00-\u9fff]/g) || []).length;
    const otherText = text.replace(/[\u4e00-\u9fff]/g, '');
    const inputTokens = Math.max(1, cjkCount + Math.ceil(otherText.length / 4));

    return {
      inputTokens,
      outputTokens: 0,
      totalTokens: inputTokens,
      requestCount: 1
    };
  }
};
