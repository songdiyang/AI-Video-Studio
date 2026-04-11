/**
 * Seedance 1.5 Pro 视频生成专用计费处理器
 * 
 * Token 计算公式：token ≈ (宽度 × 高度 × 帧率 × 秒数) / 1024
 * 
 * 计费标准：
 * - 无声视频：8元/百万tokens (¥8/M tokens)
 * - 有声视频：16元/百万tokens (¥16/M tokens)
 * 
 * 使用方法：在 ai_model_configs 表中配置：
 * - billing_handler: 'seedance1.5'
 * - billing_query_handler: 'seedance1.5'
 */

// 计费价格常量（元/百万tokens）
const PRICE_SILENT_VIDEO = 8;   // 无声视频
const PRICE_AUDIO_VIDEO = 16;   // 有声视频

// 默认参数
const DEFAULT_FPS = 24;
const DEFAULT_DURATION = 5;

// Seedance 1.5 时长限制（官方限定 4-12 秒）
const MIN_DURATION = 4;   // 最低 4 秒
const MAX_DURATION = 12;  // 最长 12 秒

/**
 * 计算视频生成所需的 Token 数量
 * 公式：token ≈ (宽度 × 高度 × 帧率 × 秒数) / 1024
 * 
 * @param {number} width - 视频宽度（像素）
 * @param {number} height - 视频高度（像素）
 * @param {number} fps - 视频帧率
 * @param {number} durationSeconds - 视频时长（秒）
 * @returns {number} Token 数量
 */
function calculateTokens(width, height, fps, durationSeconds) {
  const tokens = Math.ceil((width * height * fps * durationSeconds) / 1024);
  return tokens;
}

/**
 * 计算价格（元）
 * @param {number} tokens - Token 数量
 * @param {boolean} hasAudio - 是否有音频
 * @returns {number} 价格（元）
 */
function calculatePriceCNY(tokens, hasAudio) {
  const pricePerMillion = hasAudio ? PRICE_AUDIO_VIDEO : PRICE_SILENT_VIDEO;
  return (tokens / 1000000) * pricePerMillion;
}

/**
 * 从参数中提取视频规格信息
 * @param {object} params - 请求参数
 * @param {object} modelConfig - 模型配置
 * @returns {object} 视频规格 { width, height, fps, durationSeconds, hasAudio }
 */
function extractVideoSpecs(params, modelConfig) {
  // 提取宽度
  let width = parseInt(params.width || params.video_width || 0) || 0;
  
  // 提取高度
  let height = parseInt(params.height || params.video_height || 0) || 0;
  
  // 如果没有明确的宽高，尝试从 resolution 或 aspect_ratio 推断
  if (!width || !height) {
    const resolution = params.resolution || params.video_resolution || '';
    const aspectRatio = params.aspect_ratio || params.aspectRatio || '';
    
    // 常见分辨率映射
    const resolutionMap = {
      '480p': { w: 854, h: 480 },
      '720p': { w: 1280, h: 720 },
      '1080p': { w: 1920, h: 1080 },
      '4k': { w: 3840, h: 2160 },
    };
    
    if (resolutionMap[resolution]) {
      width = resolutionMap[resolution].w;
      height = resolutionMap[resolution].h;
    }
  }
  
  // 尝试从 size 参数解析 (如 "1280x720")
  if ((!width || !height) && params.size) {
    const sizeMatch = String(params.size).match(/(\d+)[xX×](\d+)/);
    if (sizeMatch) {
      width = parseInt(sizeMatch[1]) || 0;
      height = parseInt(sizeMatch[2]) || 0;
    }
  }
  
  // 帧率
  const fps = parseInt(params.fps || params.frame_rate || params.frameRate || DEFAULT_FPS) || DEFAULT_FPS;
  
  // 时长（秒）- 严格使用传入的时长，并限制在 2-12 秒范围内
  let durationSeconds = parseFloat(params.duration || params.durationSeconds || params.video_duration || 0);
  if (durationSeconds <= 0) {
    durationSeconds = DEFAULT_DURATION;
  }
  // 应用时长限制：最低 2 秒，最长 12 秒
  durationSeconds = Math.max(MIN_DURATION, Math.min(MAX_DURATION, durationSeconds));
  
  // 是否有音频
  const hasAudio = !!(
    params.has_audio || 
    params.hasAudio || 
    params.with_audio || 
    params.audio || 
    params.audio_url ||
    params.audio_prompt ||
    params.enable_audio
  );
  
  return { width, height, fps, durationSeconds, hasAudio };
}

/**
 * 从 API 响应中提取视频规格和消耗
 * @param {object} result - API 响应
 * @param {object} requestParams - 原始请求参数
 * @returns {object} 消耗数据
 */
function extractUsageFromResponse(result, requestParams) {
  const raw = result?._raw || result;
  const data = raw?.data || raw;
  const params = result?._queryParams || requestParams || {};
  
  // 1. 优先从响应中提取视频信息
  let width = 0, height = 0, fps = DEFAULT_FPS, durationSeconds = 0, hasAudio = false;
  
  // 从 output 或 content_info 提取
  const output = data?.output || raw?.output || {};
  const contentInfo = data?.content_info || raw?.content_info || {};
  const videoInfo = output?.video_info || contentInfo?.video_info || {};
  
  // 视频时长
  if (output.duration !== undefined) {
    durationSeconds = parseFloat(output.duration) || 0;
  } else if (contentInfo.duration !== undefined) {
    durationSeconds = parseFloat(contentInfo.duration) || 0;
  } else if (videoInfo.duration !== undefined) {
    durationSeconds = parseFloat(videoInfo.duration) || 0;
  }
  
  // 视频分辨率
  if (videoInfo.width && videoInfo.height) {
    width = parseInt(videoInfo.width) || 0;
    height = parseInt(videoInfo.height) || 0;
  } else if (output.width && output.height) {
    width = parseInt(output.width) || 0;
    height = parseInt(output.height) || 0;
  }
  
  // 帧率
  if (videoInfo.fps) {
    fps = parseInt(videoInfo.fps) || DEFAULT_FPS;
  } else if (output.fps) {
    fps = parseInt(output.fps) || DEFAULT_FPS;
  }
  
  // 是否有音频
  if (output.has_audio !== undefined) {
    hasAudio = !!output.has_audio;
  } else if (output.audio_url || output.audio_path) {
    hasAudio = true;
  } else if (contentInfo.has_audio !== undefined) {
    hasAudio = !!contentInfo.has_audio;
  }
  
  // 2. 如果响应中没有，使用请求参数
  const paramsSpecs = extractVideoSpecs(params, null);
  
  if (!width) width = paramsSpecs.width;
  if (!height) height = paramsSpecs.height;
  if (!fps || fps === DEFAULT_FPS) fps = paramsSpecs.fps;
  if (!durationSeconds) durationSeconds = paramsSpecs.durationSeconds;
  if (!hasAudio) hasAudio = paramsSpecs.hasAudio;
  
  // 时长限制：最低 2 秒，最长 12 秒
  durationSeconds = Math.max(MIN_DURATION, Math.min(MAX_DURATION, durationSeconds));
  
  // 3. 如果还是没有宽高，使用默认值（720p）
  if (!width || !height) {
    console.warn('[Seedance1.5 BillingHandler] 无法获取视频分辨率，使用默认 720p (1280x720)');
    width = 1280;
    height = 720;
  }
  
  // 4. 计算 Token
  let totalTokens = calculateTokens(width, height, fps, durationSeconds);
  
  // 5. 有声视频的 Token 计费翻倍（因为有声价格是无声的2倍）
  // 这样使用统一的 8元/百万tokens 配置，有声视频会自动变成 16元/百万tokens 等效
  const effectiveTokens = hasAudio ? totalTokens * 2 : totalTokens;
  
  // 6. 计算价格（用于日志展示）
  const priceCNY = calculatePriceCNY(totalTokens, hasAudio);
  
  console.log(`[Seedance1.5 BillingHandler] 视频规格: ${width}x${height}@${fps}fps, ${durationSeconds}秒, ${hasAudio ? '有声' : '无声'}`);
  console.log(`[Seedance1.5 BillingHandler] 原始Token: ${totalTokens.toLocaleString()}, 计费Token: ${effectiveTokens.toLocaleString()}, 价格: ¥${priceCNY.toFixed(4)}`);
  
  return {
    totalTokens: effectiveTokens,  // 使用调整后的 token 数量
    inputTokens: 0,
    outputTokens: effectiveTokens,
    durationSeconds,
    requestCount: 1,
    // 扩展信息，供账单展示使用
    _videoSpecs: {
      width,
      height,
      fps,
      durationSeconds,
      hasAudio,
      rawTokens: totalTokens,           // 原始 token 数量
      effectiveTokens,                   // 计费用的 token 数量
      pricePerMillion: hasAudio ? PRICE_AUDIO_VIDEO : PRICE_SILENT_VIDEO,
      calculatedPriceCNY: priceCNY
    }
  };
}

module.exports = {
  /**
   * 同步模型消耗解析
   * 在 finalizeImmediateBilling 时调用
   */
  async resolveUsage({ submitResult, finalResult, params, modelConfig, requestStatus }) {
    console.log('[Seedance1.5 BillingHandler] resolveUsage 被调用');
    return extractUsageFromResponse(finalResult || submitResult, params);
  },
  
  /**
   * 异步模型查询完成后的消耗解析
   * 在 finalizeAsyncBillingFromQuery 时调用
   */
  async resolveUsageFromQuery({ submitResult, finalResult, params, modelConfig, requestStatus }) {
    console.log('[Seedance1.5 BillingHandler] resolveUsageFromQuery 被调用');
    return extractUsageFromResponse(finalResult, params);
  },
  
  /**
   * 预估消耗
   * 在 prepareModelBilling 时调用，用于余额检查
   */
  async estimate(params, model, normalizedPriceConfig) {
    console.log('[Seedance1.5 BillingHandler] estimate 被调用');
    
    const specs = extractVideoSpecs(params, model);
    
    // 如果无法获取分辨率，使用默认 720p
    if (!specs.width || !specs.height) {
      specs.width = 1280;
      specs.height = 720;
    }
    
    // 确保时长限制：最低 2 秒，最长 12 秒
    specs.durationSeconds = Math.max(MIN_DURATION, Math.min(MAX_DURATION, specs.durationSeconds));
    
    const rawTokens = calculateTokens(specs.width, specs.height, specs.fps, specs.durationSeconds);
    // 有声视频 token 翻倍
    const effectiveTokens = specs.hasAudio ? rawTokens * 2 : rawTokens;
    const priceCNY = calculatePriceCNY(rawTokens, specs.hasAudio);
    
    console.log(`[Seedance1.5 BillingHandler] 预估: ${specs.width}x${specs.height}@${specs.fps}fps, ${specs.durationSeconds}秒, ${specs.hasAudio ? '有声' : '无声'}`);
    console.log(`[Seedance1.5 BillingHandler] 预估原始Token: ${rawTokens.toLocaleString()}, 计费Token: ${effectiveTokens.toLocaleString()}, 预估价格: ¥${priceCNY.toFixed(4)}`);
    
    return {
      totalTokens: effectiveTokens,
      durationSeconds: specs.durationSeconds,
      requestCount: 1,
      _videoSpecs: {
        width: specs.width,
        height: specs.height,
        fps: specs.fps,
        durationSeconds: specs.durationSeconds,
        hasAudio: specs.hasAudio,
        rawTokens,
        effectiveTokens,
        pricePerMillion: specs.hasAudio ? PRICE_AUDIO_VIDEO : PRICE_SILENT_VIDEO,
        estimatedPriceCNY: priceCNY
      }
    };
  },
  
  // 导出工具函数供外部使用
  calculateTokens,
  calculatePriceCNY,
  PRICE_SILENT_VIDEO,
  PRICE_AUDIO_VIDEO
};
