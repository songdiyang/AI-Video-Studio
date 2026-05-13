/**
 * OpenAI 兼容适配层
 *
 * 统一封装任意 OpenAI 兼容接口的模型平台调用。
 * 平台配置（base_url, api_key 等）通过数据库 model_providers 表动态加载，
 * 不再硬编码任何平台信息。
 *
 * 所有平台统一使用 OpenAI Chat Completions API 格式
 */

const fetch = require('node-fetch');
const { sanitizeHeaders } = require('./utils/logSanitizer');
const { assertSafeOutboundUrl, safeFetch } = require('./utils/outboundRequestGuard');
const { parseJsonField } = require('./utils/parseJsonField');

// ============ 辅助函数 ============

function toNumberSafe(val, fallback) {
  const n = Number(val);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

/**
 * 带单次重试的请求封装
 */
async function fetchWithRetry(url, options, context = '') {
  try {
    const response = await safeFetch(url, options, context);
    if (response.status >= 500) {
      console.warn(`[OpenAI Adapter] ${context} 收到 ${response.status}，2秒后重试`);
      await new Promise(r => setTimeout(r, 2000));
      return safeFetch(url, options, context);
    }
    return response;
  } catch (err) {
    if (err.name === 'AbortError') throw err;
    console.warn(`[OpenAI Adapter] ${context} 网络错误: ${err.message}，2秒后重试`);
    await new Promise(r => setTimeout(r, 2000));
    return safeFetch(url, options, context);
  }
}

// ============ 请求构建 ============

/**
 * 构建 OpenAI 兼容格式的请求
 *
 * @param {object} config - 模型配置（含 provider base_url, model_id 等）
 * @param {object} params - 调用参数
 * @returns {object} { url, method, headers, body }
 */
function buildOpenAIRequest(config, params = {}) {
  const provider = config._provider || {};
  const baseUrl = provider.base_url || '';
  const modelId = config.model_id || config.name;

  // 确定 API 端点：从 capabilities 或 params 推断，默认 chat/completions
  const endpoint = determineEndpoint(config, params);

  // 构建 URL
  const url = `${baseUrl.replace(/\/$/, '')}${endpoint}`;

  // 构建 Headers
  const apiKey = config.api_key || provider.api_key || '';
  const extraHeaders = parseJsonField(provider.headers_template, {});
  const headers = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${apiKey}`,
    ...extraHeaders
  };

  // 构建 Body（根据端点类型选择不同格式）
  const body = buildRequestBody(config, params, modelId, endpoint);

  return { url, method: 'POST', headers, body };
}

/**
 * 根据模型能力标签和参数确定 API 端点
 */
function determineEndpoint(config, params) {
  const capabilities = config.capabilities || [];

  // 参数显式指定端点
  if (params.endpoint) {
    return params.endpoint.startsWith('/') ? params.endpoint : `/${params.endpoint}`;
  }

  // 根据能力标签和参数推断
  // 图像生成：支持文生图 + 图生图，参考图通过 image_url 字段传给 /images/generations
  if (capabilities.includes('image_gen')) {
    // 有明确的图像生成参数，或纯 prompt 调用（无 messages/text 字段）
    const hasImageGenParams = params.response_format === 'url' || params.size || params.width || params.height;
    const isPurePrompt = params.prompt && !params.messages && !params.text;
    if (hasImageGenParams || isPurePrompt) {
      return '/images/generations';
    }
  }
  // 视频生成：必须有 video_gen 能力，且传了视频相关参数
  if (capabilities.includes('video_gen') && (params.duration || params.ratio || params.prompt)) {
    return '/videos/generations';
  }

  // 默认 Chat Completions
  return '/chat/completions';
}

/**
 * 根据端点类型构建请求体
 */
function buildRequestBody(config, params, modelId, endpoint) {
  switch (endpoint) {
    case '/images/generations':
      return buildImageGenBody(config, params, modelId);
    case '/videos/generations':
      return buildVideoGenBody(config, params, modelId);
    case '/chat/completions':
    default:
      return buildChatCompletionBody(config, params, modelId);
  }
}

/**
 * 构建文生图/图生图请求体
 */
function buildImageGenBody(config, params, modelId) {
  const body = {
    model: modelId,
    prompt: params.prompt || '',
    response_format: params.response_format || 'url'
  };

  if (params.size && params.size !== '_REMOVE_') {
    body.size = params.size;
  }
  if (params.n !== undefined && params.n !== '_REMOVE_') {
    body.n = parseInt(params.n) || 1;
  }
  if (params.seed !== undefined && params.seed !== '_REMOVE_') {
    body.seed = parseInt(params.seed);
  }
  if (params.watermark !== undefined && params.watermark !== '_REMOVE_') {
    body.watermark = Boolean(params.watermark);
  }
  if (params.guidance_scale !== undefined && params.guidance_scale !== '_REMOVE_') {
    body.guidance_scale = parseFloat(params.guidance_scale);
  }
  if (params.strength !== undefined && params.strength !== '_REMOVE_') {
    body.strength = parseFloat(params.strength);
  }

  // 图生图：参考图
  const imageArray = buildImageArray(params);
  if (imageArray) {
    body.image = imageArray;
  }

  // mask_image（inpainting）
  if (params.mask_image) {
    body.mask_image = params.mask_image;
  }

  return body;
}

/**
 * 构建视频生成请求体
 */
function buildVideoGenBody(config, params, modelId) {
  const body = {
    model: modelId
  };

  // content 数组（text + first_frame + last_frame）
  if (params.content && Array.isArray(params.content)) {
    body.content = params.content;
  } else {
    const content = [];
    if (params.prompt) {
      content.push({ type: 'text', text: params.prompt });
    }
    if (params.imageUrls && params.imageUrls[0]) {
      content.push({ type: 'image_url', image_url: { url: params.imageUrls[0] }, role: 'first_frame' });
    }
    if (params.imageUrls && params.imageUrls[1]) {
      content.push({ type: 'image_url', image_url: { url: params.imageUrls[1] }, role: 'last_frame' });
    }
    if (content.length > 0) {
      body.content = content;
    }
  }

  // 视频参数
  if (params.ratio && params.ratio !== '_REMOVE_') {
    body.ratio = params.ratio;
  }
  if (params.resolution && params.resolution !== '_REMOVE_') {
    body.resolution = params.resolution;
  }
  if (params.duration !== undefined && params.duration !== '_REMOVE_') {
    body.duration = parseInt(params.duration);
  }
  if (params.seed !== undefined && params.seed !== '_REMOVE_') {
    body.seed = parseInt(params.seed);
  }
  if (params.camera_fixed !== undefined && params.camera_fixed !== '_REMOVE_') {
    body.camera_fixed = Boolean(params.camera_fixed);
  }
  if (params.watermark !== undefined && params.watermark !== '_REMOVE_') {
    body.watermark = Boolean(params.watermark);
  }
  if (params.generate_audio !== undefined && params.generate_audio !== '_REMOVE_') {
    body.generate_audio = Boolean(params.generate_audio);
  }
  if (params.draft !== undefined && params.draft !== '_REMOVE_') {
    body.draft = Boolean(params.draft);
  }
  if (params.return_last_frame !== undefined && params.return_last_frame !== '_REMOVE_') {
    body.return_last_frame = Boolean(params.return_last_frame);
  }

  return body;
}

/**
 * 构建 Chat Completions 请求体
 */
function buildChatCompletionBody(config, params, modelId) {
  const messages = buildMessages(config, params);

  const body = {
    model: modelId,
    messages,
    stream: params.stream || false
  };

  if (params.max_tokens || params.maxTokens) {
    body.max_tokens = params.max_tokens || params.maxTokens;
  }
  if (params.temperature !== undefined) {
    body.temperature = params.temperature;
  }
  if (params.top_p !== undefined) {
    body.top_p = params.top_p;
  }
  if (params.stop !== undefined) {
    body.stop = params.stop;
  }

  // 思考模式（如 DeepSeek reasoning 等）
  // 通过 params.thinking 显式控制，不根据 provider 名称硬编码
  if (params.thinking) {
    body.thinking = params.thinking;
    if (params.reasoning_effort) {
      body.reasoning_effort = params.reasoning_effort;
    }
  }

  return body;
}

/**
 * 构建 image 数组（图生图用）
 */
function buildImageArray(params) {
  const images = [];
  if (Array.isArray(params.imageUrls) && params.imageUrls.length > 0) {
    images.push(...params.imageUrls.filter(u => u && u !== '_REMOVE_'));
  } else if (params.imageUrl && params.imageUrl !== '_REMOVE_') {
    images.push(params.imageUrl);
  } else if (params.image && params.image !== '_REMOVE_') {
    if (Array.isArray(params.image)) {
      images.push(...params.image.filter(u => u && u !== '_REMOVE_'));
    } else {
      images.push(params.image);
    }
  }
  return images.length > 0 ? images : null;
}

/**
 * 构建 messages 数组
 */
function buildMessages(config, params) {
  // 如果调用方直接传了 messages 数组，优先使用
  if (params.messages && Array.isArray(params.messages)) {
    return params.messages;
  }

  const messages = [];

  // 系统提示
  if (params.systemPrompt || params.system_prompt) {
    messages.push({
      role: 'system',
      content: params.systemPrompt || params.system_prompt
    });
  }

  // 多模态内容（图片/视频理解）
  if (params.imageUrl || params.image_url || params.imageUrls || params.image_urls) {
    const imageUrls = params.imageUrls || params.image_urls || [params.imageUrl || params.image_url];
    const content = [
      { type: 'text', text: params.prompt || params.text || '' }
    ];
    for (const url of Array.isArray(imageUrls) ? imageUrls : [imageUrls]) {
      if (url) {
        content.push({
          type: 'image_url',
          image_url: { url }
        });
      }
    }
    messages.push({ role: 'user', content });
  } else {
    // 纯文本
    messages.push({
      role: 'user',
      content: params.prompt || params.text || params.content || ''
    });
  }

  return messages;
}

// ============ 响应解析 ============

/**
 * 解析 OpenAI 兼容响应
 *
 * @param {object} data - API 响应数据
 * @param {object} mapping - 字段映射配置（可选）
 * @param {string} endpoint - API 端点类型（影响解析逻辑）
 * @returns {object} 标准化结果
 */
function parseOpenAIResponse(data, mapping = null, endpoint = '/chat/completions') {
  const result = {
    content: '',
    tokens: 0,
    inputTokens: 0,
    outputTokens: 0,
    finishReason: '',
    _raw: data
  };

  // 根据端点类型选择解析策略
  if (endpoint === '/images/generations') {
    // 文生图响应：data.data[].url
    if (data.data && Array.isArray(data.data) && data.data.length > 0) {
      result.imageUrl = data.data[0].url || '';
      result.imageUrls = data.data.map(item => item.url || item.b64_json).filter(Boolean);
      result.content = result.imageUrl;
    }
    if (data.usage) {
      result.tokens = data.usage.total_tokens || 0;
    }
  } else if (endpoint === '/videos/generations') {
    // 视频生成响应：可能返回 task_id 或直接的 video_url
    result.taskId = data.task_id || data.taskId || data.id || '';
    result.videoUrl = data.video_url || data.url || '';
    result.content = result.videoUrl || result.taskId;
  } else {
    // Chat Completions 标准响应
    if (data.choices && data.choices.length > 0) {
      const choice = data.choices[0];
      result.content = choice.message?.content || '';
      result.finishReason = choice.finish_reason || '';

      // 思考内容（如 DeepSeek R1 等支持 reasoning_content 的平台）
      if (choice.message?.reasoning_content) {
        result.reasoningContent = choice.message.reasoning_content;
      }
    }

    // Token 使用
    if (data.usage) {
      result.tokens = data.usage.total_tokens || 0;
      result.inputTokens = data.usage.prompt_tokens || 0;
      result.outputTokens = data.usage.completion_tokens || 0;
    }
  }

  // 自定义字段映射
  if (mapping && typeof mapping === 'object') {
    for (const [key, path] of Object.entries(mapping)) {
      if (key.startsWith('_')) continue;
      const value = getValueByPath(data, path);
      if (value !== undefined) {
        result[key] = value;
      }
    }
  }

  return result;
}

/**
 * 通过路径获取对象值（如 "choices.0.message.content"）
 */
function getValueByPath(obj, path) {
  if (!path || !obj) return undefined;
  const parts = path.split('.');
  let current = obj;
  for (const part of parts) {
    if (current === null || current === undefined) return undefined;
    const index = parseInt(part, 10);
    if (!isNaN(index) && Array.isArray(current)) {
      current = current[index];
    } else {
      current = current[part];
    }
  }
  return current;
}

// ============ 统一调用接口 ============

/**
 * 调用 OpenAI 兼容接口
 *
 * @param {object} config - 完整模型配置（含 _provider）
 * @param {object} params - 调用参数
 * @returns {Promise<object>} 标准化响应
 */
async function callOpenAICompatible(config, params = {}) {
  const provider = config._provider || {};
  const modelName = config.name || 'unknown';

  if (!provider.base_url) {
    throw new Error(`模型 "${modelName}" 未配置平台 Base URL`);
  }

  const { url, method, headers, body } = buildOpenAIRequest(config, params);

  console.log(`[OpenAI Adapter] Calling ${modelName} via ${provider.name || 'unknown'}:`);
  console.log(`[OpenAI Adapter] URL: ${url}`);
  console.log(`[OpenAI Adapter] Model: ${body.model}`);
  console.log(`[OpenAI Adapter] Body:`, JSON.stringify(body).slice(0, 800));

  await assertSafeOutboundUrl(url, { context: `OpenAI适配层 ${modelName}` });

  // 超时控制
  const controller = new AbortController();
  const timeoutMs = toNumberSafe(params.timeout, 300) * 1000;
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetchWithRetry(url, {
      method,
      headers,
      body: JSON.stringify(body),
      signal: controller.signal
    }, `OpenAI适配层 ${modelName}`);

    clearTimeout(timeout);

    const responseText = await response.text();

    // 尝试解析 JSON
    let data;
    try {
      data = JSON.parse(responseText);
    } catch (parseError) {
      throw new Error(`API 返回的不是有效的 JSON 格式: ${responseText.substring(0, 200)}`);
    }

    if (!response.ok) {
      const errorMsg = data.error?.message || `API 调用失败: ${response.status}`;
      throw new Error(errorMsg);
    }

    // 解析响应
    const endpoint = determineEndpoint(config, params);
    const result = parseOpenAIResponse(data, config.response_mapping, endpoint);

    // 附加模型信息
    result._model = {
      name: config.name,
      provider: provider.name,
      category: config.category,
      modelId: body.model
    };

    return result;
  } catch (fetchError) {
    clearTimeout(timeout);
    if (fetchError.name === 'AbortError') {
      throw new Error(`API 请求超时（${Math.round(timeoutMs / 1000)}秒）`);
    }
    throw fetchError;
  }
}

// ============ 批量调用 ============

/**
 * 批量调用 OpenAI 兼容接口
 * @param {Array<{config: object, params: object}>} tasks
 * @param {number} concurrency
 */
async function callOpenAICompatibleBatch(tasks, concurrency = 3) {
  const results = new Array(tasks.length).fill(null);
  const errors = new Array(tasks.length).fill(null);

  let index = 0;
  const execute = async () => {
    while (index < tasks.length) {
      const currentIndex = index++;
      const { config, params } = tasks[currentIndex];
      try {
        results[currentIndex] = await callOpenAICompatible(config, params);
      } catch (err) {
        errors[currentIndex] = { index: currentIndex, modelName: config.name, error: err.message };
      }
    }
  };

  const workers = Array.from({ length: Math.min(concurrency, tasks.length) }, () => execute());
  await Promise.all(workers);

  return { results, errors: errors.filter(Boolean) };
}

// ============ 模块导出 ============

module.exports = {
  buildOpenAIRequest,
  parseOpenAIResponse,
  callOpenAICompatible,
  callOpenAICompatibleBatch,
  getValueByPath,
  determineEndpoint
};
