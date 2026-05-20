/**
 * 可灵视频 (Kling) 自定义查询 Handler
 * 
 * 仅处理 JWT 认证，其余参数走模板渲染后的值
 */

const fetch = require('node-fetch');
const { generateKlingJWT } = require('./kling_utils');
const { sanitizeHeaders } = require('../utils/logSanitizer');

module.exports = {
  /**
   * 自定义查询请求
   * @param {object} model - 完整 DB 模型配置
   * @param {object} params - 原始合并参数
   * @param {object} rendered - 模板渲染后的 { url, method, headers, body }
   * @returns {object} 原始 API 响应 data
   */
  async query(model, params, rendered) {
    // 1. 用 AK/SK 生成 JWT 替换认证
    const token = generateKlingJWT(model.api_key);
    // 删除所有大小写变体的 Authorization，避免重复
    for (const key of Object.keys(rendered.headers)) {
      if (key.toLowerCase() === 'authorization') {
        delete rendered.headers[key];
      }
    }
    rendered.headers['Authorization'] = `Bearer ${token}`;
    console.log('[Kling Query Handler] Headers:', JSON.stringify(sanitizeHeaders(rendered.headers)));

    console.log(`[Kling Query Handler] Query ${rendered.url}`);
    if (rendered.body) {
      console.log('[Kling Query Handler] Body:', JSON.stringify(rendered.body, null, 2));
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 60000);

    let response;
    try {
      response = await fetch(rendered.url, {
        method: rendered.method || 'GET',
        headers: rendered.headers,
        body: rendered.body ? JSON.stringify(rendered.body) : undefined,
        signal: controller.signal
      });
      clearTimeout(timeout);
    } catch (err) {
      clearTimeout(timeout);
      if (err.name === 'AbortError') {
        throw new Error('Kling Query API 请求超时（60秒）');
      }
      throw err;
    }

    const responseText = await response.text();
    console.log('[Kling Query Handler] Response status:', response.status);
    console.log('[Kling Query Handler] Response body:', responseText);

    // 非 JSON 响应提前检测（如 HTML 错误页面）
    const responseContentType = response.headers.get('content-type') || 'unknown';
    const isHtmlResponse = responseText.trim().startsWith('<') || responseContentType.includes('text/html');
    if (isHtmlResponse) {
      console.error(`[Kling Query Handler] API 返回 HTML 而非 JSON: HTTP ${response.status}, Content-Type: ${responseContentType}, 内容: ${responseText.substring(0, 500)}`);
      throw new Error(`API 返回 HTML 页面而非 JSON (HTTP ${response.status})，可能是网关错误、WAF 拦截或端点配置错误。响应内容: ${responseText.substring(0, 200)}`);
    }

    let data;
    try {
      data = JSON.parse(responseText);
    } catch {
      // JSON 解析失败，尝试 form-urlencoded
      try {
        const params = new URLSearchParams(responseText);
        data = Object.fromEntries(params.entries());
        console.log('[Kling Query Handler] Parsed as form-urlencoded:', data);
      } catch {
        throw new Error(`Kling API 返回非 JSON 且非 form-urlencoded: ${responseText.substring(0, 300)}`);
      }
    }

    if (!response.ok) {
      throw new Error(data?.message || data?.msg || JSON.stringify(data) || `Kling API 错误: ${response.status}`);
    }

    return data;
  }
};
