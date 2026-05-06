/**
 * 豆包多模态理解 (Doubao Multimodal) 自定义 Handler
 * 
 * 适配火山引擎 Responses API (/api/v3/responses)
 * 支持图像理解、视频理解、文档理解
 * 
 * 参数说明：
 *   params.messages - 对话历史 [{role, content}]
 *     content可以是字符串(纯文本)或数组([{type, text?, image_url?, video_url?, file_url?}])
 *   params.text - 用户文本输入（简单模式，无messages时使用）
 *   params.images - 图片URL数组（简单模式）
 *   params.videos - 视频URL数组（简单模式）
 *   params.files - 文档URL数组（简单模式）
 *   params.detail - 图像理解精细度 "low"|"high"|"xhigh"，默认 "high"
 *   params.systemPrompt - 系统提示词（可选）
 *   params.modelId - 模型标识（可选，覆盖默认）
 *   params.temperature - 温度参数（可选）
 *   params.max_tokens - 最大token数（可选）
 * 
 * 数据库配置：ai_model_configs 表中 custom_handler = "doubao_multimodal"
 */

const fetch = require('node-fetch');

const TIMEOUT_MS = 120000; // 120秒

/**
 * 从模型配置中获取 Base URL
 * 优先使用平台配置的 base_url，支持通过数据库动态配置
 */
function getBaseUrl(model) {
  // 优先从关联的平台配置获取 base_url
  if (model._provider?.base_url) {
    return model._provider.base_url.replace(/\/$/, '');
  }
  // 兼容：从 url_template 解析（旧配置兼容）
  if (model.url_template) {
    try {
      const url = new URL(model.url_template);
      return `${url.protocol}//${url.host}`;
    } catch {
      // 忽略解析错误
    }
  }
  return '';
}

/**
 * 从模型配置中获取模型ID
 * 优先使用 model_id 字段，其次从 default_params 解析
 */
function getModelId(model, params) {
  return params.modelId || model.model_id || (model.default_params
    ? (typeof model.default_params === 'string' ? JSON.parse(model.default_params) : model.default_params).modelId
    : null) || '';
}

/**
 * 将 API 原始错误消息映射为用户友好的中文提示
 */
function friendlyErrorMessage(statusCode, rawMsg) {
  const msg = (rawMsg || '').toLowerCase();

  if (statusCode === 401 || statusCode === 403) {
    return 'API 认证失败，请检查 API Key 是否正确。';
  }
  if (msg.includes('rate limit') || msg.includes('too many') || msg.includes('429') || msg.includes('频率')) {
    return 'API 请求过于频繁，请稍后再试。';
  }
  if (msg.includes('quota') || msg.includes('余额') || msg.includes('insufficient')) {
    return 'API 配额不足，请联系管理员检查账户余额。';
  }
  if (msg.includes('invalid') && (msg.includes('image') || msg.includes('video') || msg.includes('file'))) {
    return '输入的媒体文件无效或无法访问，请检查文件链接是否正确。';
  }
  if (msg.includes('timeout') || msg.includes('timed out')) {
    return 'API 处理超时，请稍后重试。';
  }
  if (msg.includes('sensitive') || msg.includes('安全') || msg.includes('违规')) {
    return '输入内容可能包含敏感内容，请修改后重试。';
  }
  return rawMsg;
}

/**
 * 将单条message的content转换为Responses API格式的content数组
 * @param {string|Array} content - 原始content（字符串或数组）
 * @param {string} detail - 图像精细度
 * @returns {Array} Responses API格式的content数组
 */
function convertContent(content, detail) {
  // 纯文本字符串 → input_text数组
  if (typeof content === 'string') {
    return [{ type: 'input_text', text: content }];
  }

  // 已经是数组，逐项转换
  if (!Array.isArray(content)) {
    return [{ type: 'input_text', text: String(content || '') }];
  }

  return content.map(item => {
    // 已经是Responses API格式（input_text/input_image等），直接保留
    if (item.type && item.type.startsWith('input_')) {
      return item;
    }

    // OpenAI兼容格式转换
    switch (item.type) {
      case 'text':
        return { type: 'input_text', text: item.text || '' };
      case 'image_url':
        return {
          type: 'input_image',
          image_url: typeof item.image_url === 'string' ? item.image_url : (item.image_url?.url || ''),
          detail: detail
        };
      case 'video_url':
        return {
          type: 'input_video',
          video_url: typeof item.video_url === 'string' ? item.video_url : (item.video_url?.url || '')
        };
      case 'file_url':
        return {
          type: 'input_file',
          file_url: typeof item.file_url === 'string' ? item.file_url : (item.file_url?.url || '')
        };
      default:
        // 兜底：如果有text字段就当文本处理
        if (item.text) {
          return { type: 'input_text', text: item.text };
        }
        console.warn('[Doubao Multimodal] 未知 content 类型:', item.type);
        return { type: 'input_text', text: JSON.stringify(item) };
    }
  });
}

/**
 * 使用简单模式构建user消息的content数组
 */
function buildSimpleContent(params, detail) {
  const content = [];

  // 图片
  if (Array.isArray(params.images)) {
    for (const url of params.images) {
      if (url) {
        content.push({ type: 'input_image', image_url: url, detail });
      }
    }
  }

  // 视频
  if (Array.isArray(params.videos)) {
    for (const url of params.videos) {
      if (url) {
        content.push({ type: 'input_video', video_url: url });
      }
    }
  }

  // 文档
  if (Array.isArray(params.files)) {
    for (const url of params.files) {
      if (url) {
        content.push({ type: 'input_file', file_url: url });
      }
    }
  }

  // 文本（放在最后，符合"先看内容再看问题"的习惯）
  if (params.text) {
    content.push({ type: 'input_text', text: params.text });
  }

  return content;
}

module.exports = {
  /**
   * 自定义提交请求
   * @param {object} model - 完整 DB 模型配置
   * @param {object} params - 原始合并参数
   * @param {object} rendered - 模板渲染后的 { url, method, headers, body }
   * @returns {object} 原始 API 响应 data
   */
  async call(model, params, rendered) {
    console.log('[Doubao Multimodal] 开始处理请求');

    // 1. 获取API密钥（去除所有非法 HTTP header 字符：\r \n \0 等）
    // 优先级：模型配置 > 平台配置 > 环境变量
    const rawApiKey = model.api_key || params.apiKey || model._provider?.api_key || process.env.ARK_API_KEY;
    const apiKey = rawApiKey
      ? String(rawApiKey)
          .replace(/[\r\n\0]/g, '')   // 移除换行、回车、空字符
          .trim()
      : null;
    if (!apiKey) {
      throw new Error('豆包多模态 API Key 未配置：请在模型配置中设置 API Key 或配置环境变量 ARK_API_KEY');
    }
    console.log('[Doubao Multimodal] API Key 已获取, 长度:', apiKey.length);

    // 2. 获取模型ID和Base URL（从数据库配置动态读取）
    const modelId = getModelId(model, params);
    if (!modelId) {
      throw new Error('豆包多模态模型ID未配置：请在模型配置中设置 model_id');
    }
    const baseUrl = getBaseUrl(model);
    if (!baseUrl) {
      throw new Error('豆包多模态 Base URL 未配置：请在平台配置中设置 base_url');
    }
    console.log('[Doubao Multimodal] 模型ID:', modelId);
    console.log('[Doubao Multimodal] Base URL:', baseUrl);

    // 3. 图像精细度
    const detail = params.detail || 'high';

    // 4. 构建input数组
    const input = [];

    if (params.messages && Array.isArray(params.messages) && params.messages.length > 0) {
      // messages模式：转换每条消息
      console.log('[Doubao Multimodal] 使用 messages 模式, 消息数:', params.messages.length);
      for (const msg of params.messages) {
        input.push({
          role: msg.role || 'user',
          content: convertContent(msg.content, detail)
        });
      }
    } else {
      // 简单模式：构建单条user消息
      console.log('[Doubao Multimodal] 使用简单模式');
      const userContent = buildSimpleContent(params, detail);
      if (userContent.length === 0) {
        throw new Error('豆包多模态：没有提供任何输入内容（text/images/videos/files）');
      }
      input.push({
        role: 'user',
        content: userContent
      });
    }

    // 5. 如果有systemPrompt，在input数组开头插入system消息
    if (params.systemPrompt) {
      input.unshift({
        role: 'system',
        content: [{ type: 'input_text', text: params.systemPrompt }]
      });
    }

    // 6. 构建请求体
    // 注意：火山引擎 Responses API 使用 max_output_tokens，不是 max_tokens
    const requestBody = {
      model: modelId,
      input: input,
      ...(params.temperature != null && { temperature: params.temperature }),
      ...((params.max_output_tokens != null || params.max_tokens != null) && {
        max_output_tokens: params.max_output_tokens ?? params.max_tokens
      })
    };

    console.log('[Doubao Multimodal] 请求体:', JSON.stringify(requestBody, null, 2));

    // 7. 构建请求头
    const headers = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    };

    // 8. 发送请求（超时120秒）
    const url = `${baseUrl}/responses`;
    console.log(`[Doubao Multimodal] 调用 ${url}`);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

    let response;
    try {
      response = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(requestBody),
        signal: controller.signal
      });
      clearTimeout(timeout);
    } catch (err) {
      clearTimeout(timeout);
      if (err.name === 'AbortError') {
        throw new Error('豆包多模态 API 请求超时（120秒）');
      }
      throw err;
    }

    const responseText = await response.text();
    console.log('[Doubao Multimodal] 响应状态:', response.status);
    console.log('[Doubao Multimodal] 响应预览:', responseText.substring(0, 500));

    // 9. 解析响应
    let data;
    try {
      data = JSON.parse(responseText);
    } catch {
      console.log('[Doubao Multimodal] 响应为非 JSON 格式，作为原始文本处理');
      data = {
        _raw: responseText,
        content: responseText,
        choices: [{ message: { content: responseText } }]
      };
    }

    if (!response.ok) {
      const errorMsg = data.error?.message || data.message || data.msg || JSON.stringify(data);
      const userMsg = friendlyErrorMessage(response.status, errorMsg);
      throw new Error(`豆包多模态理解失败 (${response.status}): ${userMsg}`);
    }

    // 10. 返回原始响应data（由外层aiModelService做response_mapping）
    return data;
  }
};
