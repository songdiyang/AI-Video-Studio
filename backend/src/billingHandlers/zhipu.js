/**
 * 智谱 AI (Zhipu / GLM) 模型计费处理器
 *
 * 覆盖模型：
 * - 文本：GLM-4, GLM-4-Plus, GLM-4-Air, GLM-4-Flash 等
 * - 视觉：GLM-4V, GLM-4V-Plus（图文理解）
 * - 代码：CodeGeeX-4
 *
 * 计费模式：
 * - TOKEN_DUAL：文本模型
 * - TOKEN_IMAGE_MERGE：视觉模型（文字 + 图片合并计费）
 *
 * 智谱 API 特点：
 * - OpenAI 兼容格式
 * - 视觉模型返回 usage 包含图片 Token
 * - 支持 web_search 工具调用
 */

// 图片尺寸 -> Token 折算（智谱 GLM-4V 规则）
const IMAGE_TOKEN_TIERS = [
  { maxPixels: 512 * 512, tokens: 256, name: '小图' },
  { maxPixels: 1024 * 1024, tokens: 768, name: '中图' },
  { maxPixels: Infinity, tokens: 1536, name: '大图' }
];

/**
 * 根据图片尺寸计算 Token
 * @param {number} width - 图片宽度
 * @param {number} height - 图片高度
 * @returns {number} Token 数量
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
 * 从智谱响应中提取 Usage
 * 智谱返回格式（OpenAI 兼容）：
 * {
 *   "usage": {
 *     "prompt_tokens": 100,
 *     "completion_tokens": 50,
 *     "total_tokens": 150
 *   }
 * }
 *
 * GLM-4V 视觉模型可能额外返回图片 Token 信息
 */
function extractZhipuUsage(result) {
  const raw = result?._raw || result;
  const usage = raw?.usage || raw?.data?.usage || {};

  const inputTokens = usage.prompt_tokens || usage.input_tokens || 0;
  const outputTokens = usage.completion_tokens || usage.output_tokens || 0;
  const totalTokens = usage.total_tokens || (inputTokens + outputTokens);

  return {
    inputTokens,
    outputTokens,
    totalTokens,
    requestCount: 1,
    _zhipuDetails: {
      // 智谱可能返回的额外信息
      webSearchUsed: !!raw?.choices?.[0]?.message?.tool_calls?.some(
        t => t.function?.name?.includes('search')
      )
    }
  };
}

/**
 * 从 GLM-4V 视觉请求中估算图片 Token
 * 请求格式中的图片：
 * messages: [
 *   { role: 'user', content: [
 *     { type: 'text', text: '描述这张图片' },
 *     { type: 'image_url', image_url: { url: '...' } }
 *   ]}
 * ]
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
        // 如果没有尺寸信息，使用默认中图 Token
        const width = item.image_url?.width || item.width || 1024;
        const height = item.image_url?.height || item.height || 1024;
        imageTokenCount += calculateImageTokens(width, height);
      }
    }
  }

  return { imageTokenCount, imageCount };
}

module.exports = {
  /**
   * 同步模型消耗解析
   */
  async resolveUsage({ submitResult, finalResult, params, modelConfig, requestStatus }) {
    console.log('[Zhipu BillingHandler] resolveUsage 被调用');
    const usage = extractZhipuUsage(finalResult || submitResult);
    console.log('[Zhipu BillingHandler] 解析消耗:', usage);
    return usage;
  },

  /**
   * 异步模型查询完成后的消耗解析
   */
  async resolveUsageFromQuery({ submitResult, finalResult, params, modelConfig, requestStatus }) {
    console.log('[Zhipu BillingHandler] resolveUsageFromQuery 被调用');
    const usage = extractZhipuUsage(finalResult);
    console.log('[Zhipu BillingHandler] 异步解析消耗:', usage);
    return usage;
  },

  /**
   * 预估消耗
   */
  async estimate(params, model, normalizedPriceConfig) {
    console.log('[Zhipu BillingHandler] estimate 被调用');

    const category = model?.category?.toUpperCase();
    const modelName = model?.name?.toLowerCase() || '';
    const isVisionModel = category === 'MULTIMODAL' ||
                          modelName.includes('glm-4v') ||
                          modelName.includes('vision');

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
    if (isVisionModel) {
      const imageEstimate = estimateImageTokensFromParams(params);
      imageTokens = imageEstimate.imageTokenCount;
      imageCount = imageEstimate.imageCount;
    }

    const inputTokens = textTokens + imageTokens;

    return {
      inputTokens,
      outputTokens: 0,
      totalTokens: inputTokens,
      requestCount: 1,
      _zhipuEstimate: {
        textTokens,
        imageTokens,
        imageCount,
        isVisionModel
      }
    };
  },

  // 导出工具函数供外部使用
  calculateImageTokens,
  IMAGE_TOKEN_TIERS
};
