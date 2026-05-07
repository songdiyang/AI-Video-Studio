/**
 * 百度 / 文心一言 (ERNIE) 模型计费处理器
 *
 * 覆盖模型：
 * - 文本：ERNIE-4.0, ERNIE-3.5, ERNIE-Speed, ERNIE-Lite 等
 * - 代码：ERNIE-Code
 *
 * 计费模式：TOKEN_DUAL（输入/输出 Token 分开计价）
 *
 * 百度 API 特点：
 * - 自研协议（非 OpenAI 兼容），但返回格式类似
 * - usage 字段：prompt_tokens / completion_tokens / total_tokens
 * - 部分模型支持搜索增强（search_count 额外计费）
 */

/**
 * 从百度响应中提取 Usage
 * 百度返回格式：
 * {
 *   "usage": {
 *     "prompt_tokens": 100,
 *     "completion_tokens": 50,
 *     "total_tokens": 150,
 *     "search_count": 2  // 搜索增强次数（可选）
 *   }
 * }
 */
function extractBaiduUsage(result) {
  const raw = result?._raw || result;
  const usage = raw?.usage || raw?.data?.usage || {};

  const inputTokens = usage.prompt_tokens || usage.input_tokens || 0;
  const outputTokens = usage.completion_tokens || usage.output_tokens || 0;
  const totalTokens = usage.total_tokens || (inputTokens + outputTokens);

  // 百度特有：搜索增强次数
  const searchCount = usage.search_count || 0;

  return {
    inputTokens,
    outputTokens,
    totalTokens,
    requestCount: 1,
    _baiduDetails: {
      searchCount,
      hasSearchEnhancement: searchCount > 0
    }
  };
}

module.exports = {
  /**
   * 同步模型消耗解析
   */
  async resolveUsage({ submitResult, finalResult, params, modelConfig, requestStatus }) {
    console.log('[Baidu BillingHandler] resolveUsage 被调用');
    const usage = extractBaiduUsage(finalResult || submitResult);
    console.log('[Baidu BillingHandler] 解析消耗:', usage);
    return usage;
  },

  /**
   * 异步模型查询完成后的消耗解析
   * 百度目前主要是同步模型，但保留兼容
   */
  async resolveUsageFromQuery({ submitResult, finalResult, params, modelConfig, requestStatus }) {
    console.log('[Baidu BillingHandler] resolveUsageFromQuery 被调用');
    const usage = extractBaiduUsage(finalResult);
    console.log('[Baidu BillingHandler] 异步解析消耗:', usage);
    return usage;
  },

  /**
   * 预估消耗
   */
  async estimate(params, model, normalizedPriceConfig) {
    console.log('[Baidu BillingHandler] estimate 被调用');

    // 收集提示文本
    let text = '';
    if (params.prompt) {
      text = String(params.prompt);
    } else if (params.messages && Array.isArray(params.messages)) {
      text = params.messages.map(m => {
        if (typeof m.content === 'string') return m.content;
        if (m.role && m.content) return String(m.content);
        return '';
      }).join('\n');
    }

    // 百度中文模型：中文字符按 1 Token，英文按 1/4 Token
    const cjkCount = (text.match(/[\u4e00-\u9fff]/g) || []).length;
    const otherText = text.replace(/[\u4e00-\u9fff]/g, '');
    const inputTokens = Math.max(1, cjkCount + Math.ceil(otherText.length / 4));

    // 搜索增强预估
    const enableSearch = params.enable_search || params.search || false;
    const searchCount = enableSearch ? (params.search_count || 1) : 0;

    return {
      inputTokens,
      outputTokens: 0,
      totalTokens: inputTokens,
      requestCount: 1,
      _baiduEstimate: {
        searchCount,
        enableSearch: !!enableSearch
      }
    };
  }
};
