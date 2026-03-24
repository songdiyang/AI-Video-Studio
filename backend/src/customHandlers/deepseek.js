/**
 * DeepSeek 自定义 Handler（DeepSeek-V3.2）
 * 
 * 核心功能：根据 think 标志自动切换模型并注入 thinking 模式参数
 * 
 * 模型信息（基于 DeepSeek-V3.2）：
 *   - deepseek-chat: 非思考模式，128K 上下文，输出默认 4K / 最大 8K
 *   - deepseek-reasoner: 思考模式，128K 上下文，输出默认 32K / 最大 64K
 *   - V3.2 支持思考模式下的工具调用
 * 
 * 当 params.think === true 时：
 *   1. 切换 model 为 "deepseek-reasoner"
 *   2. 注入 thinking: { type: "enabled" }
 *   3. 移除不兼容参数（temperature, top_p, presence_penalty, frequency_penalty）
 *   4. 提升 max_tokens 上限至 64000（thinking 输出包含 CoT，需要更大空间）
 * 
 * 当 think 为 false/未传时：原样转发模板渲染后的请求
 * 
 * 定价（百万 tokens）：
 *   - 输入（缓存未命中）：¥2
 *   - 输入（缓存命中）：¥0.2
 *   - 输出：¥3
 * 
 * 数据库配置：ai_model_configs 表中 custom_handler = "deepseek"
 */

const fetch = require('node-fetch');

module.exports = {
  /**
   * 自定义提交请求
   * @param {object} model - 完整 DB 模型配置
   * @param {object} params - 原始合并参数（含 think, maxTokens 等）
   * @param {object} rendered - 模板渲染后的 { url, method, headers, body }
   * @returns {object} 原始 API 响应 data
   */
  async call(model, params, rendered) {
    const body = rendered.body || {};

    // think 标志：切换为 deepseek-reasoner 并注入 thinking 模式
    if (params.think === true || params.think === 'true') {
      body.model = 'deepseek-reasoner';
      body.thinking = { type: 'enabled' };

      // 移除思考模式下不兼容的参数
      delete body.temperature;
      delete body.top_p;
      delete body.presence_penalty;
      delete body.frequency_penalty;

      // 思考模式输出上限 64K，确保足够空间
      if (!body.max_tokens || body.max_tokens < 16000) {
        body.max_tokens = 32000;
      }

      console.log('\x1b[32m [DeepSeek Handler] Thinking 模式已启用, model: deepseek-reasoner, max_tokens:', body.max_tokens, '\x1b[0m');
    }

    console.log(`[DeepSeek Handler] Call ${rendered.url}`);
    console.log('[DeepSeek Handler] Body 字段:', Object.keys(body).join(', '));

    // 发送请求（超时 600 秒）
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 1200000);

    try {
      const response = await fetch(rendered.url, {
        method: rendered.method || 'POST',
        headers: rendered.headers,
        body: JSON.stringify(body),
        signal: controller.signal
      });
      clearTimeout(timeout);

      const responseText = await response.text();
      console.log('[DeepSeek Handler] Response status:', response.status);
      console.log('[DeepSeek Handler] Response preview:', responseText.substring(0, 300));

      let data;
      try {
        data = JSON.parse(responseText);
      } catch {
        // 非 JSON 响应（如测试调用返回纯文本），包装为统一格式
        console.log('[DeepSeek Handler] 响应为非 JSON 格式，作为原始文本处理');
        data = {
          _raw: responseText,
          content: responseText,
          choices: [{ message: { content: responseText } }]
        };
      }

      if (!response.ok) {
        const errMsg = data.error?.message || data.message || JSON.stringify(data);
        throw new Error(`DeepSeek API 错误 (${response.status}): ${errMsg}`);
      }

      return data;
    } catch (err) {
      clearTimeout(timeout);
      if (err.name === 'AbortError') {
        throw new Error('DeepSeek API 请求超时（1200秒）');
      }
      throw err;
    }
  }
};
