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
const { resolveToInternalUrl } = require('../utils/fileStorage');

class OpenAICompatibleAdapter extends BaseAdapter {
  // ============================================================
  // 核心调用方法
  // ============================================================

  async submit(params) {
    const endpoint = this.determineEndpoint(params);
    const url = this.buildUrl(endpoint);
    const headers = this.buildHeaders();
    const body = this.buildRequestBody(params, endpoint);

    this.log(`Submit → ${endpoint}`, { model: this.modelId, url });

    const response = await this.safeRequest(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body)
    }, `submit.${endpoint}`);

    this.log(`Response status: ${response.status} ${response.statusText}, Content-Type: ${response.headers.get('content-type') || 'N/A'}`);

    const data = await this.parseResponse(response);

    // 解析标准响应
    const result = this.parseOpenAIResponse(data, endpoint);

    // 附加计费信息
    result._billing = this.parseBilling(data);

    return result;
  }

  async query(taskId) {
    const modelId = (this.modelId || '').toLowerCase();
    const isSeedance = modelId.includes('seedance');

    // Seedance 1.5 Pro 是异步模型，需要轮询查询
    if (isSeedance && taskId) {
      const url = this.buildUrl(`/tasks/${taskId}`);
      const headers = this.buildHeaders();

      const response = await this.safeRequest(url, {
        method: 'GET',
        headers
      }, `query.task`);

      const data = await this.parseResponse(response);
      return this.parseVideoResponse(data);
    }

    // OpenAI 兼容接口通常是同步的，不需要轮询
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

    // 图像生成（支持文生图 + 图生图，参考图通过 image_url 字段传给 /images/generations）
    if (caps.includes('image_gen')) {
      const hasImageParams = params.response_format === 'url' || params.size || params.width || params.height;
      const isPurePrompt = params.prompt && !params.messages && !params.text;
      if (hasImageParams || isPurePrompt) {
        return '/images/generations';
      }
    }

    // 视频生成
    // 火山引擎 Seedance 使用 /contents/generations（非标准 /videos/generations）
    if (caps.includes('video_gen') && (params.duration || params.ratio || params.prompt)) {
      const modelId = (this.modelId || '').toLowerCase();
      const isVolcengine = (this.provider.name || '').toLowerCase().includes('volcengine') ||
        (this.provider.name || '').includes('火山');
      if (isVolcengine || modelId.includes('seedance')) {
        return '/contents/generations';
      }
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
      case '/contents/generations':
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
      if (params.tool_choice) {
        body.tool_choice = params.tool_choice;
      }
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

    // strength: 图生图变化强度（0.0-1.0），控制参考图影响权重
    // 低 strength → 更忠实于参考图；高 strength → 更多自由创作
    if (params.strength !== undefined && params.strength !== null && params.strength !== '_REMOVE_') {
      const strength = parseFloat(params.strength);
      if (!isNaN(strength) && strength >= 0 && strength <= 1) {
        body.strength = strength;
      }
    }

    // 参考图（图生图）处理
    // Seedream 使用 `image` 数组参数，其他平台使用 `image_url` 字符串
    const isSeedream = (this.modelId || '').toLowerCase().includes('seedream');
    if (params.imageUrls || params.imageUrl) {
      const urls = params.imageUrls || [params.imageUrl];
      if (isSeedream) {
        // Seedream: 使用 image 数组
        // 将相对路径转换为可访问的绝对 URL（外部 API 无法解析相对路径）
        const rawUrls = Array.isArray(urls) ? urls.filter(Boolean) : [urls].filter(Boolean);
        body.image = rawUrls.map(url => resolveToInternalUrl(url));
      } else {
        // 其他平台: 使用逗号分隔的 image_url 字符串
        if (urls.length > 1) {
          body.image_url = urls.join(',');
        } else {
          body.image_url = urls[0];
        }
      }
    }

    return body;
  }

  buildVideoGenBody(params) {
    const modelId = (this.modelId || '').toLowerCase();
    const isSeedance = modelId.includes('seedance');

    // Seedance 1.5 Pro 使用特殊的 content 数组格式（非标准 OpenAI 视频格式）
    if (isSeedance) {
      const content = [];

      // 1. 添加文本提示词
      if (params.prompt) {
        content.push({ type: 'text', text: params.prompt });
      }

      // 2. 添加首帧图片（使用 resolveToInternalUrl 转换 URL，与 Seedance 1.5 自定义 handler 保持一致）
      const imageUrls = params.imageUrls || (params.imageUrl ? [params.imageUrl] : []);
      const startFrame = params.startFrame;
      const endFrame = params.endFrame;

      const rawFirstFrame = startFrame && startFrame !== '_REMOVE_'
        ? startFrame
        : (imageUrls.length > 0 ? imageUrls[0] : null);
      if (rawFirstFrame) {
        content.push({
          type: 'image_url',
          image_url: { url: resolveToInternalUrl(rawFirstFrame) },
          role: 'first_frame'
        });
      }

      // 3. 添加尾帧图片（如果存在）
      const rawLastFrame = endFrame && endFrame !== '_REMOVE_'
        ? endFrame
        : (imageUrls.length > 1 ? imageUrls[1] : null);
      if (rawLastFrame) {
        content.push({
          type: 'image_url',
          image_url: { url: resolveToInternalUrl(rawLastFrame) },
          role: 'last_frame'
        });
      }

      const body = {
        model: this.modelId,
        content
      };

      // Seedance 1.5 Pro 参数处理
      if (params.duration !== undefined && params.duration !== '_REMOVE_') {
        const duration = parseInt(params.duration);
        if (duration === -1) {
          body.duration = duration;
        } else if (duration >= 4 && duration <= 12) {
          body.duration = duration;
        } else if (duration > 0 && duration < 4) {
          body.duration = 4;
        }
      }

      const ratio = params.aspectRatio || params.ratio;
      if (ratio && ratio !== '_REMOVE_') {
        const validRatios = ['16:9', '4:3', '1:1', '3:4', '9:16', '21:9', 'adaptive'];
        body.ratio = validRatios.includes(ratio) ? ratio : 'adaptive';
      }

      if (params.resolution && params.resolution !== '_REMOVE_') {
        const validResolutions = ['480p', '720p', '1080p'];
        if (validResolutions.includes(params.resolution)) {
          body.resolution = params.resolution;
        }
      }

      if (params.seed !== undefined && params.seed !== '_REMOVE_') {
        const seed = parseInt(params.seed);
        if (seed === -1 || (seed >= 0 && seed <= 4294967295)) {
          body.seed = seed;
        }
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
      if (params.callback_url && params.callback_url !== '_REMOVE_') {
        body.callback_url = params.callback_url;
      }
      if (params.service_tier && params.service_tier !== '_REMOVE_') {
        const validTiers = ['default', 'flex'];
        if (validTiers.includes(params.service_tier)) {
          body.service_tier = params.service_tier;
        }
      }

      return body;
    }

    // 标准 OpenAI 视频格式
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
      case '/contents/generations':
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
    const modelId = (this.modelId || '').toLowerCase();
    const isSeedance = modelId.includes('seedance');

    // Seedance 1.5 Pro 响应格式：{ id, status, output: { video_url, duration }, usage }
    if (isSeedance) {
      const output = data.output || data.data?.output || {};
      return {
        taskId: data.id || data.task_id || null,
        status: data.status || 'pending',
        videoUrl: output.video_url || output.videoUrl || data.video_url || null,
        duration: output.duration || data.duration || null,
        _raw: data
      };
    }

    // 标准 OpenAI 视频格式
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

    // 音频/声音生成
    if (id.includes('whisper') || id.includes('audio') || id.includes('tts') || id.includes('seedtts') || id.includes('voice')) {
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
