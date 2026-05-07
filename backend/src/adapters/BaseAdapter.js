/**
 * BaseAdapter - 平台适配器抽象基类
 *
 * 所有平台适配器必须继承此类。
 * 提供统一的接口规范，屏蔽不同平台之间的差异。
 */

const fetch = require('node-fetch');
const { assertSafeOutboundUrl, safeFetch } = require('../utils/outboundRequestGuard');

class BaseAdapter {
  /**
   * @param {object} providerConfig - 平台配置（来自 model_providers 表）
   * @param {object} modelConfig - 模型配置（来自 ai_models_v2 表）
   */
  constructor(providerConfig, modelConfig = {}) {
    this.provider = providerConfig || {};
    this.model = modelConfig || {};
    this.providerName = providerConfig?.name || 'unknown';
    this.modelId = modelConfig?.model_id || providerConfig?.model_id || 'unknown';
  }

  // ============================================================
  // 必须实现的抽象方法
  // ============================================================

  /**
   * 提交任务/请求
   * @param {object} params - 调用参数
   * @returns {Promise<object>} 提交结果
   */
  async submit(params) {
    throw new Error(`Adapter ${this.constructor.name} must implement submit()`);
  }

  /**
   * 查询异步任务状态（同步模型可返回 null）
   * @param {string} taskId - 任务ID
   * @returns {Promise<object|null>} 任务状态
   */
  async query(taskId) {
    return null;
  }

  // ============================================================
  // 可选实现的方法
  // ============================================================

  /**
   * 发现平台上的可用模型列表
   * @returns {Promise<Array<{model_id, name, capabilities}>>}
   */
  async discoverModels() {
    return [];
  }

  /**
   * 从响应中解析计费信息
   * @param {object} response - API 响应
   * @returns {object|null} 计费信息 {input_tokens, output_tokens, total_tokens, ...}
   */
  parseBilling(response) {
    return null;
  }

  /**
   * 检查模型是否支持流式输出
   * @returns {boolean}
   */
  supportsStreaming() {
    return this.model.capabilities?.includes('streaming') || false;
  }

  /**
   * 检查模型是否支持工具调用
   * @returns {boolean}
   */
  supportsToolCalling() {
    return this.model.capabilities?.includes('tool_calling') || false;
  }

  // ============================================================
  // 通用工具方法
  // ============================================================

  /**
   * 构建完整 URL
   * @param {string} endpoint - API 端点（如 /chat/completions）
   * @returns {string}
   */
  buildUrl(endpoint) {
    const baseUrl = (this.provider.base_url || '').replace(/\/$/, '');
    const path = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
    return `${baseUrl}${path}`;
  }

  /**
   * 构建标准请求头
   * @param {object} extraHeaders - 额外请求头
   * @returns {object}
   */
  buildHeaders(extraHeaders = {}) {
    const apiKey = this.provider.api_key || this.model.api_key || '';
    return {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
      ...extraHeaders
    };
  }

  /**
   * 带安全检查和重试的 HTTP 请求
   * @param {string} url - 请求地址
   * @param {object} options - fetch 选项
   * @param {string} context - 上下文描述（用于日志）
   * @returns {Promise<Response>}
   */
  async safeRequest(url, options = {}, context = '') {
    await assertSafeOutboundUrl(url, { context: `${this.providerName} ${context}` });

    const controller = new AbortController();
    const timeoutMs = (this.model.metadata?.timeout_seconds || 300) * 1000;
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await safeFetch(url, {
        ...options,
        signal: controller.signal
      }, `${this.providerName} ${context}`);

      clearTimeout(timeout);

      // 服务端错误时重试一次
      if (response.status >= 500) {
        console.warn(`[${this.constructor.name}] ${context} 收到 ${response.status}，2秒后重试`);
        await new Promise(r => setTimeout(r, 2000));
        return safeFetch(url, options, `${this.providerName} ${context}`);
      }

      return response;
    } catch (err) {
      clearTimeout(timeout);
      if (err.name === 'AbortError') {
        throw new Error(`请求超时（${Math.round(timeoutMs / 1000)}秒）`);
      }
      throw err;
    }
  }

  /**
   * 解析 JSON 响应，统一错误处理
   * @param {Response} response - fetch 响应
   * @returns {Promise<object>}
   */
  async parseResponse(response) {
    const text = await response.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch (e) {
      throw new Error(`API 返回的不是有效的 JSON: ${text.substring(0, 200)}`);
    }

    if (!response.ok) {
      const errorMsg = data.error?.message || `API 调用失败: ${response.status}`;
      throw new Error(errorMsg);
    }

    return data;
  }

  /**
   * 日志输出（带适配器标识）
   * @param {string} message - 消息
   * @param {...any} args - 额外参数
   */
  log(message, ...args) {
    console.log(`[${this.constructor.name}] ${message}`, ...args);
  }

  /**
   * 错误日志输出
   * @param {string} message - 消息
   * @param {Error} error - 错误对象
   */
  logError(message, error) {
    console.error(`[${this.constructor.name}] ${message}:`, error.message);
  }
}

module.exports = BaseAdapter;
