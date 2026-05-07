/**
 * OpenAICompatibleAdapter - OpenAI 兼容平台适配器
 *
 * 处理所有支持 OpenAI 兼容接口的平台：
 * - 火山引擎方舟
 * - DeepSeek
 * - 智谱 AI
 * - OpenAI / Azure
 * - 百度千帆
 * - 硅基流动
 *
 * 根据模型的 capabilities 自动路由到正确的 endpoint：
 * - chat → /chat/completions
 * - image_gen → /images/generations
 * - video_gen → /videos/generations
 */

const BaseAdapter = require('./BaseAdapter');

class OpenAICompatibleAdapter extends BaseAdapter {
  // ============================================================
  // 核心调用方法
  // ============================================================

  async submit(params) {
    const endpoint = this.determineEndpoint(params);
    const url = this.buildUrl(endpoint);
    const headers = this.buildHeaders();
    const body = this.buildRequestBody(params, endpoint);

    this.log(`Submit → ${endpoint}`, { model: this.modelId });

    const response = await this.safeRequest(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body)
    }, `submit.${endpoint}`);

    const data = await this.parseResponse(response);

    // 解析标准响应
    const result = this.parseOpenAIResponse(data, endpoint);

    // 附加计费信息
    result._billing = this.parseBilling(data);

    return result;
  }

  async query(taskId) {
    // OpenAI 兼容接口通常是同步的，不需要轮询
    // 如果平台有特殊实现，子类可以覆盖此方法
    return null;
  }

  // ============================================================
  // 模型发现
  // ============================================================

  async discoverModels() {
    const url = this.buildUrl('/models');
    const headers = this.buildHeaders();

    try {
      const response = await this.safeRequest(url, {
        method: 'GET',
        headers
      }, 'discoverModels');

      const data = await this.parseResponse(response);
      const models = data.data || [];

      return models.map(m => ({
        model_id: m.id,
        name: m.id,
        capabilities: this.inferCapabilities(m.id),
        metadata: {
          object: m.object,
          owned_by: m.owned_by
        }
      }));
    } catch (err) {
      this.logError('discoverModels failed', err);
      return [];
    }
  }

  // ============================================================
  // 请求构建
  // ============================================================

  /**
   * 根据 capabilities 和参数确定 API 端点
   */
  determineEndpoint(params) {
    const caps = this.model.capabilities || [];

    // 参数显式指定
    if (params.endpoint) {
      return params.endpoint.startsWith('/') ? params.endpoint : `/${params.endpoint}`;
    }

    // 图像生成
    if (caps.includes('image_gen')) {
      const hasImageParams = params.response_format === 'url' || params.size || params.width || params.height;
      const isPurePrompt = params.prompt && !params.messages && !params.text;
      if (hasImageParams || isPurePrompt) {
        if (!params.imageUrls && !params.imageUrl && !params.image) {
          return '/images/generations';
        }
      }
    }

    // 视频生成
    if (caps.includes('video_gen') && (params.duration || params.ratio || params.prompt)) {
      return '/videos/generations';
    }

    // 默认聊天补全
    return '/chat/completions';
  }

  /**
   * 根据端点类型构建请求体
   */
  buildRequestBody(params, endpoint) {
    switch (endpoint) {
      case '/images/generations':
        return this.buildImageGenBody(params);
      case '/videos/generations':
        return this.buildVideoGenBody(params);
      case '/chat/completions':
      default:
        return this.buildChatCompletionBody(params);
    }
  }

  buildChatCompletionBody(params) {
    const body = {
      model: this.modelId,
      messages: this.buildMessages(params)
    };

    // 可选参数
    if (params.temperature !== undefined) body.temperature = params.temperature;
    if (params.top_p !== undefined) body.top_p = params.top_p;
    if (params.max_tokens !== undefined) body.max_tokens = params.max_tokens;
    if (params.stream !== undefined) body.stream = params.stream;

    // 工具调用
    if (params.tools && this.supportsToolCalling()) {
      body.tools = params.tools;
    }

    return body;
  }

  buildImageGenBody(params) {
    const body = {
      model: this.modelId,
      prompt: params.prompt || '',
      response_format: params.response_format || 'url'
    };

    if (params.size && params.size !== '_REMOVE_') body.size = params.size;
    if (params.n !== undefined) body.n = parseInt(params.n) || 1;
    if (params.quality) body.quality = params.quality;
    if (params.style) body.style = params.style;

    // 参考图（图生图）
    if (params.imageUrls || params.imageUrl) {
      const urls = params.imageUrls || [params.imageUrl];
      body.image_url = urls[0];
    }

    return body;
  }

  buildVideoGenBody(params) {
    const body = {
      model: this.modelId,
      prompt: params.prompt || ''
    };

    if (params.duration) body.duration = params.duration;
    if (params.ratio) body.ratio = params.ratio;
    if (params.size) body.size = params.size;
    if (params.fps) body.fps = params.fps;

    // 参考图/参考视频
    if (params.imageUrl) body.image_url = params.imageUrl;
    if (params.videoUrl) body.video_url = params.videoUrl;

    return body;
  }

  /**
   * 构建 messages 数组（支持多种输入格式）
   */
  buildMessages(params) {
    // 如果已提供 messages 数组，直接使用
    if (params.messages && Array.isArray(params.messages)) {
      return params.messages;
    }

    // 如果提供 prompt，包装为单条 user message
    if (params.prompt) {
      return [{ role: 'user', content: params.prompt }];
    }

    // 如果提供 text，同样包装
    if (params.text) {
      return [{ role: 'user', content: params.text }];
    }

    // 空消息兜底
    return [{ role: 'user', content: '' }];
  }

  // ============================================================
  // 响应解析
  // ============================================================

  parseOpenAIResponse(data, endpoint) {
    switch (endpoint) {
      case '/images/generations':
        return this.parseImageResponse(data);
      case '/videos/generations':
        return this.parseVideoResponse(data);
      case '/chat/completions':
      default:
        return this.parseChatResponse(data);
    }
  }

  parseChatResponse(data) {
    const choice = data.choices?.[0];
    const message = choice?.message;

    return {
      content: message?.content || '',
      role: message?.role || 'assistant',
      toolCalls: message?.tool_calls || null,
      finishReason: choice?.finish_reason || null,
      usage: data.usage || null,
      _raw: data
    };
  }

  parseImageResponse(data) {
    const images = data.data || [];
    return {
      images: images.map(img => ({
        url: img.url,
        b64Json: img.b64_json,
        revisedPrompt: img.revised_prompt
      })),
      _raw: data
    };
  }

  parseVideoResponse(data) {
    return {
      taskId: data.id || data.task_id || null,
      status: data.status || 'pending',
      videoUrl: data.video_url || null,
      _raw: data
    };
  }

  // ============================================================
  // 计费解析
  // ============================================================

  parseBilling(response) {
    const usage = response.usage;
    if (!usage) return null;

    return {
      input_tokens: usage.prompt_tokens || usage.input_tokens || 0,
      output_tokens: usage.completion_tokens || usage.output_tokens || 0,
      total_tokens: usage.total_tokens || 0,
      // 火山引擎特殊字段
      input_price: usage.input_price,
      output_price: usage.output_price
    };
  }

  // ============================================================
  // 能力推断
  // ============================================================

  inferCapabilities(modelId) {
    const id = (modelId || '').toLowerCase();
    const caps = [];

    // 基础聊天能力（几乎所有模型都有）
    caps.push('chat');

    // 视觉能力
    if (id.includes('vision') || id.includes('vl') || id.includes('multimodal')) {
      caps.push('vision');
    }

    // 图像生成
    if (id.includes('dall') || id.includes('image') || id.includes('seedream') || id.includes('seed')) {
      caps.push('image_gen');
    }

    // 视频生成
    if (id.includes('sora') || id.includes('video') || id.includes('seedance')) {
      caps.push('video_gen');
    }

    // 音频
    if (id.includes('whisper') || id.includes('audio') || id.includes('tts')) {
      caps.push('audio_gen');
    }

    // 工具调用
    if (id.includes('pro') || id.includes('max') || id.includes('4o')) {
      caps.push('tool_calling');
    }

    // 推理/思考
    if (id.includes('reasoning') || id.includes('thinking') || id.includes('r1')) {
      caps.push('reasoning');
    }

    return caps;
  }
}

module.exports = OpenAICompatibleAdapter;
