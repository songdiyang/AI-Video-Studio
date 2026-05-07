/**
 * DeepSeek 模型计费处理器
 *
 * 覆盖模型：DeepSeek-V3, DeepSeek-Chat, DeepSeek-Coder, DeepSeek-Reasoner 等
 *
 * 计费模式：TOKEN_DUAL（输入/输出 Token 分开计价）
 *
 * DeepSeek 特点：
 * - 标准 OpenAI 兼容格式
 * - 支持思考链（reasoning_content），对应 reasoning_tokens
 * - 命中缓存时 prompt_tokens_details.cached_tokens > 0
 */

/**
 * 从 DeepSeek 响应中提取 Usage
 * DeepSeek 返回格式（OpenAI 兼容）：
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
function extractDeepSeekUsage(result) {
  const raw = result?._raw || result;
  const usage = raw?.usage || raw?.data?.usage || {};

  const inputTokens = usage.prompt_tokens || usage.input_tokens || 0;
  const outputTokens = usage.completion_tokens || usage.output_tokens || 0;
  const totalTokens = usage.total_tokens || (inputTokens + outputTokens);

  // DeepSeek 特有：思考链 Token
  const reasoningTokens = usage.completion_tokens_details?.reasoning_tokens || 0;
  const cachedTokens = usage.prompt_tokens_details?.cached_tokens || 0;

  return {
    inputTokens,
    outputTokens,
    totalTokens,
    requestCount: 1,
    _deepseekDetails: {
      reasoningTokens,
      cachedTokens,
      // 思考链 Token 通常不计费或按不同价格计费，这里保留供账单展示
      hasReasoning: reasoningTokens > 0,
      cacheHit: cachedTokens > 0
    }
  };
}

module.exports = {
  /**
   * 同步模型消耗解析
   */
  async resolveUsage({ submitResult, finalResult, params, modelConfig, requestStatus }) {
    console.log('[DeepSeek BillingHandler] resolveUsage 被调用');
    const usage = extractDeepSeekUsage(finalResult || submitResult);
    console.log('[DeepSeek BillingHandler] 解析消耗:', usage);
    return usage;
  },

  /**
   * 异步模型查询完成后的消耗解析
   * DeepSeek 目前主要是同步模型，但保留兼容
   */
  async resolveUsageFromQuery({ submitResult, finalResult, params, modelConfig, requestStatus }) {
    console.log('[DeepSeek BillingHandler] resolveUsageFromQuery 被调用');
    const usage = extractDeepSeekUsage(finalResult);
    console.log('[DeepSeek BillingHandler] 异步解析消耗:', usage);
    return usage;
  },

  /**
   * 预估消耗
   */
  async estimate(params, model, normalizedPriceConfig) {
    console.log('[DeepSeek BillingHandler] estimate 被调用');

    // 收集提示文本
    let text = '';
    if (params.prompt) {
      text = String(params.prompt);
    } else if (params.messages && Array.isArray(params.messages)) {
      text = params.messages.map(m => m.content || '').join('\n');
    }

    // 估算 Token：中文字符 + 英文/4
    const cjkCount = (text.match(/[\u4e00-\u9fff]/g) || []).length;
    const otherText = text.replace(/[\u4e00-\u9fff]/g, '');
    const inputTokens = Math.max(1, cjkCount + Math.ceil(otherText.length / 4));

    // DeepSeek 思考链模型（如 R1）输出通常较长，预留 2-4 倍输入
    const isReasoner = model?.name?.toLowerCase().includes('reasoner') ||
                       model?.name?.toLowerCase().includes('r1');
    const estimatedOutputRatio = isReasoner ? 3 : 1;

    return {
      inputTokens,
      outputTokens: 0, // 实际由响应决定
      totalTokens: inputTokens,
      requestCount: 1,
      _estimateDetails: {
        isReasoner,
        estimatedOutputRatio
      }
    };
  }
};
