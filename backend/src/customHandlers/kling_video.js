/**
 * 可灵视频 (Kling) 自定义 Handler
 * 
 * 可灵 API 的特殊之处：
 * 1. 认证方式：需要用 AK/SK 生成 JWT token，不能直接用 API Key 作为 Bearer token
 *    api_key 字段格式：Access Key + Secret Key，用 '+' 分隔，如 "ak_xxx+sk_xxx"
 * 2. 图片参数：首帧(image)和尾帧(image_tail)是分开的字段，不是数组
 *    imageUrls[0] → image（首帧，必须），imageUrls[1] → image_tail（尾帧，可选）
 * 3. 只需自定义 call（提交），query（查询轮询）走模板流程即可
 */

const fetch = require('node-fetch');
const { generateKlingJWT } = require('./kling_utils');
const { sanitizeHeaders } = require('../utils/logSanitizer');

module.exports = {
  /**
   * 自定义提交请求
   * @param {object} model - 完整 DB 模型配置
   * @param {object} params - 原始合并参数（含 apiKey, prompt, imageUrl, imageUrls, duration 等）
   * @param {object} rendered - 模板渲染后的 { url, method, headers, body }
   * @returns {object} 原始 API 响应 data
   */
  async call(model, params, rendered) {
    // 1. 用 AK/SK 生成 JWT 替换认证
    const token = generateKlingJWT(model.api_key);
    // 删除所有大小写变体的 Authorization，避免重复
    for (const key of Object.keys(rendered.headers)) {
      if (key.toLowerCase() === 'authorization') {
        delete rendered.headers[key];
      }
    }
    rendered.headers['Authorization'] = `Bearer ${token}`;
    console.log('[Kling Handler] Headers:', JSON.stringify(sanitizeHeaders(rendered.headers)));

    // 2. 处理图片参数：imageUrls 拆分为首帧和尾帧
    //    imageUrls[0] → image（首帧，必须）
    //    imageUrls[1] → image_tail（尾帧，可选）
    const imageUrls = params.imageUrls || [];
    if (imageUrls.length > 0) {
      rendered.body.image = imageUrls[0];
    }
    if (imageUrls.length > 1) {
      rendered.body.image_tail = imageUrls[1];
    }
    // 兼容：如果只传了 imageUrl（单张），作为首帧
    if (!rendered.body.image && params.imageUrl) {
      rendered.body.image = params.imageUrl;
    }
    // 删除模板可能渲染出的无效字段
    delete rendered.body.imageUrl;
    delete rendered.body.imageUrls;
    delete rendered.body.image_urls;
    // 处理 duration,防止传入无效值
    if(rendered.body.duration != 5 && rendered.body.duration != 10){
       rendered.body.duration = 5;
    }

    console.log(`[Kling Handler] Call ${rendered.url}`);
    console.log('[Kling Handler] Body:', JSON.stringify(rendered.body, null, 2));

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 120000);

    let response;
    try {
      response = await fetch(rendered.url, {
        method: rendered.method || 'POST',
        headers: rendered.headers,
        body: JSON.stringify(rendered.body),
        signal: controller.signal
      });
      clearTimeout(timeout);
    } catch (err) {
      clearTimeout(timeout);
      if (err.name === 'AbortError') {
        throw new Error('Kling API 请求超时（120秒）');
      }
      throw err;
    }

    const responseText = await response.text();
    console.log('[Kling Handler] Response status:', response.status);
    console.log('[Kling Handler] Response body:', responseText);

    // 非 JSON 响应提前检测（如 HTML 错误页面）
    const responseContentType = response.headers.get('content-type') || 'unknown';
    const isHtmlResponse = responseText.trim().startsWith('<') || responseContentType.includes('text/html');
    if (isHtmlResponse) {
      console.error(`[Kling Handler] API 返回 HTML 而非 JSON: HTTP ${response.status}, Content-Type: ${responseContentType}, 内容: ${responseText.substring(0, 500)}`);
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
        console.log('[Kling Handler] Parsed as form-urlencoded:', data);
      } catch {
        throw new Error(`Kling API 返回非 JSON 且非 form-urlencoded: ${responseText.substring(0, 300)}`);
      }
    }

    if (!response.ok) {
      throw new Error(data?.message || data?.msg || JSON.stringify(data) || `Kling API 错误: ${response.status}`);
    }

    return data;
  }

  // query 不需要自定义，走模板流程即可
  // 管理后台只需设置 custom_handler = "kling_video"，custom_query_handler 留空
};
