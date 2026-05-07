/**
 * 阿里云 / 通义千问 (Qwen) 模型计费处理器
 *
 * 覆盖模型：
 * - 文本：Qwen-Plus, Qwen-Turbo, Qwen-Max 等
 * - 视觉：Qwen-VL, Qwen-VL-Plus, Qwen-VL-Max（图文理解）
 * - 视频理解：Qwen-Video（视频分析）
 * - 视频生成：万相视频（Wanx）
 *
 * 计费模式：
 * - TOKEN_DUAL：文本模型
 * - TOKEN_IMAGE_MERGE：视觉模型（文字 + 图片合并）
 * - TOKEN_VIDEO_FRAME：视频理解模型（抽帧折算 Token）
 * - TIME_RES_TIER：视频生成模型（时长 + 分辨率档位）
 *
 * 阿里 API 特点：
 * - DashScope 平台，OpenAI 兼容格式
 * - 视觉模型图片按尺寸折算 Token
 * - 视频理解按固定帧率抽帧
 */

// 图片尺寸 -> Token 折算（通义 VL 规则）
const IMAGE_TOKEN_TIERS = [
  { maxPixels: 512 * 512, tokens: 256, name: '小图' },
  { maxPixels: 1024 * 1024, tokens: 768, name: '中图' },
  { maxPixels: Infinity, tokens: 1536, name: '大图' }
];

// 视频抽帧默认参数
const DEFAULT_FRAME_RATE = 1; // 1秒1帧
const DEFAULT_VIDEO_DURATION = 10;

/**
 * 根据图片尺寸计算 Token
 */
function calculateImageTokens(width, height) {
  const pixels = width * height;
  for (const tier of IMAGE_TOKEN_TIERS) {
    if (pixels <= tier.maxPixels) {
      return tier.tokens;
    }
  }
  return IMAGE_TOKEN_TIERS[IMAGE_TOKEN_TIERS.length - 1].tokens;
}

/**
 * 从通义响应中提取 Usage
 * 返回格式（OpenAI 兼容）：
 * {
 *   "usage": {
 *     "input_tokens": 100,
 *     "output_tokens": 50,
 *     "total_tokens": 150,
 *     "image_tokens": 768  // VL 模型可能返回
 *   }
 * }
 */
function extractQwenUsage(result) {
  const raw = result?._raw || result;
  const usage = raw?.usage || raw?.data?.usage || {};

  const inputTokens = usage.input_tokens || usage.prompt_tokens || 0;
  const outputTokens = usage.output_tokens || usage.completion_tokens || 0;
  const totalTokens = usage.total_tokens || (inputTokens + outputTokens);

  // 通义 VL 可能单独返回 image_tokens
  const imageTokens = usage.image_tokens || 0;

  return {
    inputTokens,
    outputTokens,
    totalTokens,
    requestCount: 1,
    _qwenDetails: {
      imageTokens,
      hasImageTokens: imageTokens > 0
    }
  };
}

/**
 * 从视频生成响应中提取消耗（万相视频）
 * 万相返回格式：
 * {
 *   "output": {
 *     "video_url": "...",
 *     "duration": 5.0
 *   },
 *   "usage": {
 *     "total_tokens": 100000
 *   }
 * }
 */
function extractWanxVideoUsage(result, requestParams) {
  const raw = result?._raw || result;
  const params = requestParams || result?._queryParams || result?._submitParams || {};

  const usage = raw?.usage || raw?.data?.usage || {};
  const totalTokens = usage.total_tokens || 0;

  // 提取时长
  let durationSeconds = 0;
  if (raw?.output?.duration !== undefined) {
    durationSeconds = parseFloat(raw.output.duration) || 0;
  } else if (raw?.duration !== undefined) {
    durationSeconds = parseFloat(raw.duration) || 0;
  }

  if (!durationSeconds) {
    durationSeconds = parseFloat(params.duration || params.video_duration || params.length || 5) || 5;
  }

  // 分辨率
  const resolution = params.resolution || params.size || params.video_size || '720p';

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
 * 从请求参数中估算图片 Token（VL 模型）
 */
function estimateImageTokensFromParams(params) {
  let imageTokenCount = 0;
  let imageCount = 0;

  if (!params.messages || !Array.isArray(params.messages)) {
    return { imageTokenCount, imageCount };
  }

  for (const message of params.messages) {
    if (!message.content || !Array.isArray(message.content)) continue;

    for (const item of message.content) {
      if (item.type === 'image_url' || item.type === 'image') {
        imageCount++;
        const width = item.image_url?.width || item.width || 1024;
        const height = item.image_url?.height || item.height || 1024;
        imageTokenCount += calculateImageTokens(width, height);
      }
    }
  }

  return { imageTokenCount, imageCount };
}

/**
 * 从请求参数中估算视频 Token（视频理解模型）
 * 公式：总帧数 = 视频时长 / 抽帧间隔
 *      视频 Token = 总帧数 × 每帧 Token
 */
function estimateVideoTokensFromParams(params) {
  const durationSeconds = parseFloat(params.duration || params.video_duration || DEFAULT_VIDEO_DURATION) || DEFAULT_VIDEO_DURATION;
  const frameRate = parseFloat(params.frame_rate || params.fps || params.sample_rate || DEFAULT_FRAME_RATE) || DEFAULT_FRAME_RATE;

  // 抽帧间隔（秒/帧）
  const frameInterval = frameRate >= 1 ? 1 / frameRate : frameRate;
  const totalFrames = Math.ceil(durationSeconds / frameInterval);

  // 每帧按默认分辨率计算 Token
  const frameWidth = params.frame_width || params.video_width || 1024;
  const frameHeight = params.frame_height || params.video_height || 1024;
  const tokensPerFrame = calculateImageTokens(frameWidth, frameHeight);

  const videoTokens = totalFrames * tokensPerFrame;

  return {
    videoTokens,
    totalFrames,
    durationSeconds,
    frameRate,
    tokensPerFrame
  };
}

module.exports = {
  /**
   * 同步模型消耗解析
   */
  async resolveUsage({ submitResult, finalResult, params, modelConfig, requestStatus }) {
    console.log('[Qwen BillingHandler] resolveUsage 被调用');

    const category = modelConfig?.category?.toUpperCase();
    const modelName = modelConfig?.name?.toLowerCase() || '';
    const result = finalResult || submitResult;

    // 万相视频生成
    if (category === 'VIDEO' || modelName.includes('wanx')) {
      const usage = extractWanxVideoUsage(result, params);
      console.log('[Qwen BillingHandler] 视频生成消耗:', usage);
      return usage;
    }

    // 文本/视觉模型
    const usage = extractQwenUsage(result);
    console.log('[Qwen BillingHandler] 文本/视觉模型消耗:', usage);
    return usage;
  },

  /**
   * 异步模型查询完成后的消耗解析
   */
  async resolveUsageFromQuery({ submitResult, finalResult, params, modelConfig, requestStatus }) {
    console.log('[Qwen BillingHandler] resolveUsageFromQuery 被调用');

    const category = modelConfig?.category?.toUpperCase();
    const modelName = modelConfig?.name?.toLowerCase() || '';

    if (category === 'VIDEO' || modelName.includes('wanx')) {
      const usage = extractWanxVideoUsage(finalResult, params);
      console.log('[Qwen BillingHandler] 异步视频生成消耗:', usage);
      return usage;
    }

    const usage = extractQwenUsage(finalResult);
    console.log('[Qwen BillingHandler] 异步文本/视觉模型消耗:', usage);
    return usage;
  },

  /**
   * 预估消耗
   */
  async estimate(params, model, normalizedPriceConfig) {
    console.log('[Qwen BillingHandler] estimate 被调用');

    const category = model?.category?.toUpperCase();
    const modelName = model?.name?.toLowerCase() || '';

    // 视频生成（万相）
    if (category === 'VIDEO' || modelName.includes('wanx')) {
      const durationSeconds = parseFloat(params.duration || params.length || 5) || 5;
      const resolution = params.resolution || params.size || '720p';
      return {
        durationSeconds,
        requestCount: 1,
        _videoDetails: { durationSeconds, resolution }
      };
    }

    // 收集文本
    let text = '';
    if (params.prompt) {
      text = String(params.prompt);
    } else if (params.messages && Array.isArray(params.messages)) {
      text = params.messages.map(m => {
        if (typeof m.content === 'string') return m.content;
        if (Array.isArray(m.content)) {
          return m.content.filter(c => c.type === 'text').map(c => c.text).join(' ');
        }
        return '';
      }).join('\n');
    }

    // 文本 Token 估算
    const cjkCount = (text.match(/[\u4e00-\u9fff]/g) || []).length;
    const otherText = text.replace(/[\u4e00-\u9fff]/g, '');
    const textTokens = Math.max(1, cjkCount + Math.ceil(otherText.length / 4));

    // 视觉模型：额外估算图片 Token
    let imageTokens = 0;
    let imageCount = 0;
    const isVisionModel = category === 'MULTIMODAL' ||
                          category === 'IMAGE' ||
                          modelName.includes('vl') ||
                          modelName.includes('vision');

    if (isVisionModel) {
      const imageEstimate = estimateImageTokensFromParams(params);
      imageTokens = imageEstimate.imageTokenCount;
      imageCount = imageEstimate.imageCount;
    }

    // 视频理解模型：估算视频 Token
    let videoTokens = 0;
    const isVideoUnderstanding = modelName.includes('video') && !modelName.includes('wanx');
    if (isVideoUnderstanding) {
      const videoEstimate = estimateVideoTokensFromParams(params);
      videoTokens = videoEstimate.videoTokens;
    }

    const inputTokens = textTokens + imageTokens + videoTokens;

    return {
      inputTokens,
      outputTokens: 0,
      totalTokens: inputTokens,
      requestCount: 1,
      _qwenEstimate: {
        textTokens,
        imageTokens,
        imageCount,
        videoTokens,
        isVisionModel,
        isVideoUnderstanding
      }
    };
  },

  // 导出工具函数
  calculateImageTokens,
  IMAGE_TOKEN_TIERS
};
