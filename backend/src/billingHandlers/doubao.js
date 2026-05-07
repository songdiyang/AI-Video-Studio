/**
 * 字节跳动 / 火山引擎 / 豆包 全系模型计费处理器
 *
 * 覆盖模型：
 * - 文本：Doubao-Pro, Doubao-Lite, Doubao-Vision 等
 * - 图像：Seedream（文生图）
 * - 视频：Seedance（视频生成）
 *
 * 计费模式：
 * - TOKEN_DUAL：文本模型
 * - COUNT_SIZE_TIER：图像按张数 + 尺寸档位
 * - TOKEN_VIDEO_FRAME：视频按 Token 计费
 */

// Seedream 图像尺寸档位映射
const SEEDREAM_SIZE_TIERS = {
  '512x512': { name: '小图', tokens: 256 },
  '768x768': { name: '中图', tokens: 768 },
  '1024x1024': { name: '大图', tokens: 1536 },
  '1024x2048': { name: '竖图', tokens: 2048 },
  '2048x1024': { name: '横图', tokens: 2048 }
};

// Seedance 视频默认参数
const DEFAULT_FPS = 24;
const DEFAULT_DURATION = 5;
const MIN_DURATION = 2;
const MAX_DURATION = 12;

/**
 * 从豆包文本模型响应中提取 Usage
 * 豆包返回格式（OpenAI 兼容）：
 * {
 *   "usage": {
 *     "prompt_tokens": 100,
 *     "completion_tokens": 50,
 *     "total_tokens": 150
 *   }
 * }
 */
function extractTextUsage(result) {
  const raw = result?._raw || result;
  const usage = raw?.usage || raw?.data?.usage || {};

  return {
    inputTokens: usage.prompt_tokens || usage.input_tokens || 0,
    outputTokens: usage.completion_tokens || usage.output_tokens || 0,
    totalTokens: usage.total_tokens || 0,
    requestCount: 1
  };
}

/**
 * 从 Seedream 图像生成响应中提取消耗
 * Seedream 返回格式：
 * {
 *   "data": [
 *     { "url": "...", "index": 0 },
 *     { "url": "...", "index": 1 }
 *   ],
 *   "created": 1234567890
 * }
 */
function extractSeedreamUsage(result) {
  const raw = result?._raw || result;

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
 * 从 Seedance 视频生成响应中提取消耗
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
function extractSeedanceUsage(result, requestParams) {
  const raw = result?._raw || result;
  const params = requestParams || result?._queryParams || result?._submitParams || {};

  // 1. 提取 Token 用量
  let totalTokens = 0;
  let inputTokens = 0;
  let outputTokens = 0;

  const usage = raw?.usage || raw?.data?.usage;
  if (usage) {
    totalTokens = usage.total_tokens || usage.totalTokens || 0;
    inputTokens = usage.prompt_tokens || usage.input_tokens || usage.promptTokens || 0;
    outputTokens = usage.completion_tokens || usage.output_tokens || usage.completionTokens || 0;
  }

  // 2. 提取视频时长
  let durationSeconds = 0;
  if (raw?.output?.duration !== undefined) {
    durationSeconds = parseFloat(raw.output.duration) || 0;
  } else if (raw?.data?.output?.duration !== undefined) {
    durationSeconds = parseFloat(raw.data.output.duration) || 0;
  } else if (raw?.content_info?.duration !== undefined) {
    durationSeconds = parseFloat(raw.content_info.duration) || 0;
  }

  // 兜底：使用请求参数
  if (!durationSeconds) {
    durationSeconds = parseFloat(params.duration || params.durationSeconds || 5) || 5;
  }

  // 限制时长范围
  durationSeconds = Math.max(MIN_DURATION, Math.min(MAX_DURATION, durationSeconds));

  return {
    totalTokens,
    inputTokens,
    outputTokens,
    durationSeconds,
    requestCount: 1,
    _videoSpecs: {
      durationSeconds,
      hasTokenUsage: totalTokens > 0
    }
  };
}

/**
 * 从视频规格参数中提取信息
 */
function extractVideoSpecs(params) {
  let width = parseInt(params.width || params.video_width || 0) || 0;
  let height = parseInt(params.height || params.video_height || 0) || 0;

  // 从 resolution 推断
  if (!width || !height) {
    const resolution = params.resolution || params.video_resolution || '';
    const resolutionMap = {
      '480p': { w: 854, h: 480 },
      '720p': { w: 1280, h: 720 },
      '1080p': { w: 1920, h: 1080 },
      '4k': { w: 3840, h: 2160 }
    };
    if (resolutionMap[resolution]) {
      width = resolutionMap[resolution].w;
      height = resolutionMap[resolution].h;
    }
  }

  // 从 size 参数解析 (如 "1280x720")
  if ((!width || !height) && params.size) {
    const sizeMatch = String(params.size).match(/(\d+)[xX×](\d+)/);
    if (sizeMatch) {
      width = parseInt(sizeMatch[1]) || 0;
      height = parseInt(sizeMatch[2]) || 0;
    }
  }

  const fps = parseInt(params.fps || params.frame_rate || params.frameRate || DEFAULT_FPS) || DEFAULT_FPS;
  let durationSeconds = parseFloat(params.duration || params.durationSeconds || params.video_duration || 0);
  if (durationSeconds <= 0) durationSeconds = DEFAULT_DURATION;
  durationSeconds = Math.max(MIN_DURATION, Math.min(MAX_DURATION, durationSeconds));

  const hasAudio = !!(params.has_audio || params.hasAudio || params.with_audio || params.audio || params.enable_audio);

  return { width, height, fps, durationSeconds, hasAudio };
}

module.exports = {
  /**
   * 同步模型消耗解析
   */
  async resolveUsage({ submitResult, finalResult, params, modelConfig, requestStatus }) {
    console.log('[Doubao BillingHandler] resolveUsage 被调用');

    const category = modelConfig?.category?.toUpperCase();
    const result = finalResult || submitResult;

    if (category === 'IMAGE') {
      const usage = extractSeedreamUsage(result);
      console.log('[Doubao BillingHandler] 图片生成消耗:', usage);
      return usage;
    }

    if (category === 'VIDEO') {
      const usage = extractSeedanceUsage(result, params);
      console.log('[Doubao BillingHandler] 视频生成消耗:', usage);
      return usage;
    }

    // 文本模型
    const usage = extractTextUsage(result);
    console.log('[Doubao BillingHandler] 文本模型消耗:', usage);
    return usage;
  },

  /**
   * 异步模型查询完成后的消耗解析
   */
  async resolveUsageFromQuery({ submitResult, finalResult, params, modelConfig, requestStatus }) {
    console.log('[Doubao BillingHandler] resolveUsageFromQuery 被调用');

    const category = modelConfig?.category?.toUpperCase();

    if (category === 'VIDEO') {
      const usage = extractSeedanceUsage(finalResult, params);
      console.log('[Doubao BillingHandler] 异步视频生成消耗:', usage);
      return usage;
    }

    if (category === 'IMAGE') {
      const usage = extractSeedreamUsage(finalResult);
      console.log('[Doubao BillingHandler] 异步图片生成消耗:', usage);
      return usage;
    }

    const usage = extractTextUsage(finalResult);
    console.log('[Doubao BillingHandler] 异步文本模型消耗:', usage);
    return usage;
  },

  /**
   * 预估消耗
   */
  async estimate(params, model, normalizedPriceConfig) {
    console.log('[Doubao BillingHandler] estimate 被调用');

    const category = model?.category?.toUpperCase();

    if (category === 'IMAGE') {
      const itemCount = parseInt(params.n || params.count || params.itemCount || 1) || 1;
      return { itemCount, requestCount: 1 };
    }

    if (category === 'VIDEO') {
      const specs = extractVideoSpecs(params);
      if (!specs.width || !specs.height) {
        specs.width = 1280;
        specs.height = 720;
      }

      // 按 (宽×高×帧率×秒数)/1024 估算 Token
      const rawTokens = Math.ceil((specs.width * specs.height * specs.fps * specs.durationSeconds) / 1024);
      const effectiveTokens = specs.hasAudio ? rawTokens * 2 : rawTokens;

      return {
        totalTokens: effectiveTokens,
        inputTokens: 0,
        outputTokens: effectiveTokens,
        durationSeconds: specs.durationSeconds,
        requestCount: 1,
        _videoSpecs: {
          width: specs.width,
          height: specs.height,
          fps: specs.fps,
          durationSeconds: specs.durationSeconds,
          hasAudio: specs.hasAudio,
          rawTokens,
          effectiveTokens
        }
      };
    }

    // 文本模型：估算输入 Token
    let text = '';
    if (params.prompt) {
      text = String(params.prompt);
    } else if (params.messages && Array.isArray(params.messages)) {
      text = params.messages.map(m => m.content || '').join('\n');
    }

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
