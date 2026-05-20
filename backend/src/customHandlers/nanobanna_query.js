/**
 * Nano Banana 自定义查询 Handler
 *
 * 用于查询 Nano Banana 图片生成任务的状态和结果
 * 使用国内节点：https://grsai.dakka.com.cn
 */

const fetch = require('node-fetch');

module.exports = {
  /**
   * 自定义查询请求
   * @param {object} model - 完整 DB 模型配置
   * @param {object} params - 原始合并参数（包含 taskId）
   * @param {object} rendered - 模板渲染后的 { url, method, headers, body }
   * @returns {object} 原始 API 响应 data
   */
  async query(model, params, rendered) {
    console.log('[Nano Banana Query] 开始查询任务');
    console.log('[Nano Banana Query] 参数:', JSON.stringify(params, null, 2));

    // 1. 构建查询请求
    const taskId = params.taskId || params.id;
    if (!taskId) {
      throw new Error('Nano Banana Query: 缺少 taskId 参数');
    }

    // 使用模板渲染的 URL，如果有的话；否则使用默认国内节点
    const queryUrl = rendered.url || 'https://grsai.dakka.com.cn/v1/draw/result';

    const requestBody = {
      id: taskId
    };

    console.log(`[Nano Banana Query] 查询 URL: ${queryUrl}`);
    console.log('[Nano Banana Query] 请求体:', JSON.stringify(requestBody, null, 2));

    // 2. 发送查询请求
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 60000);

    let response;
    try {
      response = await fetch(queryUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${model.api_key}`
        },
        body: JSON.stringify(requestBody),
        signal: controller.signal
      });
      clearTimeout(timeout);
    } catch (err) {
      clearTimeout(timeout);
      if (err.name === 'AbortError') {
        throw new Error('Nano Banana Query API 请求超时（60秒）');
      }
      throw err;
    }

    const responseText = await response.text();
    console.log('[Nano Banana Query] 响应状态:', response.status);
    console.log('[Nano Banana Query] 响应内容:', responseText);

    // 非 JSON 响应提前检测（如 HTML 错误页面）
    const responseContentType = response.headers.get('content-type') || 'unknown';
    const isHtmlResponse = responseText.trim().startsWith('<') || responseContentType.includes('text/html');
    if (isHtmlResponse) {
      console.error(`[Nano Banana Query] API 返回 HTML 而非 JSON: HTTP ${response.status}, Content-Type: ${responseContentType}, 内容: ${responseText.substring(0, 500)}`);
      throw new Error(`API 返回 HTML 页面而非 JSON (HTTP ${response.status})，可能是网关错误、WAF 拦截或端点配置错误。响应内容: ${responseText.substring(0, 200)}`);
    }

    // 3. 解析响应
    let data;
    try {
      data = JSON.parse(responseText);
    } catch (err) {
      throw new Error(`Nano Banana API 返回非 JSON: ${responseText.substring(0, 300)}`);
    }

    // 4. 检查响应状态
    if (!response.ok) {
      const errorMsg = data?.msg || data?.error || JSON.stringify(data);
      throw new Error(`Nano Banana API 错误 (${response.status}): ${errorMsg}`);
    }

    // 5. 检查业务状态码
    if (data.code !== 0) {
      if (data.code === -22) {
        throw new Error('任务不存在');
      }
      throw new Error(`Nano Banana 查询失败 (code: ${data.code}): ${data.msg}`);
    }

    // 6. 返回任务数据
    // 响应格式：{ code: 0, data: { id, results, progress, status, ... }, msg: "success" }
    return data.data;
  }
};
