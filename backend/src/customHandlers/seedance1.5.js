/**
 * 豆包 Seedance 1.5 Pro 自定义 Handler
 *
 * 特殊处理：
 * 1. content 数组构建：文本 + 首帧图片 + 尾帧图片（可选）
 * 2. 图片参数：imageUrls[0] → first_frame, imageUrls[1] → last_frame
 * 3. 参数处理：ratio, resolution, duration, generate_audio 等
 * 4. i2v 模式（只有首帧）vs 首尾帧模式的区分
 */

const fetch = require('node-fetch');
const { resolveToInternalUrl } = require('../utils/fileStorage');

/**
 * 将 API 原始错误消息映射为用户友好的中文提示
 */
function friendlyErrorMessage(statusCode, rawMsg) {
  const msg = (rawMsg || '').toLowerCase();

  if (msg.includes('sensitive') || msg.includes('安全') || msg.includes('违规')) {
    return '提示词或参考图片可能包含敏感内容，请修改后重试。如果您认为内容没有问题，可以尝试换一种描述方式。';
  }
  if (msg.includes('rate limit') || msg.includes('too many') || msg.includes('429') || msg.includes('频率')) {
    return 'API 请求过于频繁，请稍后再试。';
  }
  if (msg.includes('quota') || msg.includes('余额') || msg.includes('insufficient')) {
    return 'API 配额不足，请联系管理员检查账户余额。';
  }
  if (msg.includes('invalid') && msg.includes('image')) {
    return '参考图片无效或无法访问，请检查图片链接是否正确。';
  }
  if (msg.includes('timeout') || msg.includes('timed out')) {
    return 'API 处理超时，请稍后重试。';
  }
  // 未匹配到已知模式，返回原始消息
  return rawMsg;
}

/**
 * 构建 content 数组
 * @param {string} prompt - 文本提示词
 * @param {string[]} imageUrls - 图片 URL 数组
 * @param {string} startFrame - 首帧图片 URL（兼容参数）
 * @param {string} endFrame - 尾帧图片 URL（兼容参数）
 * @returns {object[]} content 数组
 */
function buildContent(prompt, imageUrls = [], startFrame = null, endFrame = null) {
  const content = [];

  // 1. 添加文本提示词
  if (prompt) {
    content.push({
      type: 'text',
      text: prompt
    });
  }

  // 2. 添加首帧图片
  // 优先使用 startFrame，其次使用 imageUrls[0]
  const rawFirstFrame = startFrame && startFrame !== '_REMOVE_' ? startFrame : (imageUrls.length > 0 ? imageUrls[0] : null);
  const firstFrameUrl = rawFirstFrame ? resolveToInternalUrl(rawFirstFrame) : null;
  if (firstFrameUrl) {
    content.push({
      type: 'image_url',
      image_url: {
        url: firstFrameUrl
      },
      role: 'first_frame'
    });
  }

  // 3. 添加尾帧图片（如果存在）
  // 优先使用 endFrame，其次使用 imageUrls[1]
  const rawLastFrame = endFrame && endFrame !== '_REMOVE_' ? endFrame : (imageUrls.length > 1 ? imageUrls[1] : null);
  const lastFrameUrl = rawLastFrame ? resolveToInternalUrl(rawLastFrame) : null;
  if (lastFrameUrl) {
    content.push({
      type: 'image_url',
      image_url: {
        url: lastFrameUrl
      },
      role: 'last_frame'
    });
  }

  return content;
}

/**
 * 验证和处理参数
 * @param {object} params - 原始参数
 * @returns {object} 处理后的参数
 */
function processParams(params) {
  const processed = {};

  // ratio: 16:9, 4:3, 1:1, 3:4, 9:16, 21:9, adaptive
  // 兼容 aspectRatio 参数名（优先使用 aspectRatio，因为 ratio 可能来自 default_params 而非用户选择）
  const ratio = params.aspectRatio || params.ratio;
  if (ratio && ratio !== '_REMOVE_') {
    const validRatios = ['16:9', '4:3', '1:1', '3:4', '9:16', '21:9', 'adaptive'];
    if (validRatios.includes(ratio)) {
      processed.ratio = ratio;
    } else {
      console.warn(`[Seedance1.5] 无效的 ratio: ${ratio}，使用默认值 adaptive`);
      processed.ratio = 'adaptive';
    }
  }

  // resolution: 480p, 720p, 1080p
  if (params.resolution && params.resolution !== '_REMOVE_') {
    const validResolutions = ['480p', '720p', '1080p'];
    if (validResolutions.includes(params.resolution)) {
      processed.resolution = params.resolution;
    } else {
      console.warn(`[Seedance1.5] 无效的 resolution: ${params.resolution}，使用默认值 720p`);
      processed.resolution = '720p';
    }
  }

  // duration: 4-12 或 -1（自动选择），官方限定最短4秒
  // 注意：i2v 模式和首尾帧模式都支持 duration
  if (params.duration !== undefined && params.duration !== '_REMOVE_') {
    const duration = parseInt(params.duration);
    if (duration === -1) {
      processed.duration = duration;
    } else if (duration >= 4 && duration <= 12) {
      processed.duration = duration;
    } else if (duration > 0 && duration < 4) {
      // 低于4秒的自动提升到4秒（官方最低限制）
      console.log(`[Seedance1.5] duration ${duration}s 低于最低限制，自动提升到 4s`);
      processed.duration = 4;
    } else {
      console.warn(`[Seedance1.5] 无效的 duration: ${params.duration}，使用默认值 5`);
      processed.duration = 5;
    }
  }

  // seed: -1 或 [0, 2^32-1]
  if (params.seed !== undefined && params.seed !== '_REMOVE_') {
    const seed = parseInt(params.seed);
    if (seed === -1 || (seed >= 0 && seed <= 4294967295)) {
      processed.seed = seed;
    }
  }

  // camera_fixed: true/false（参考图场景不支持，这里暂时允许）
  if (params.camera_fixed !== undefined && params.camera_fixed !== '_REMOVE_') {
    processed.camera_fixed = Boolean(params.camera_fixed);
  }

  // watermark: true/false
  if (params.watermark !== undefined && params.watermark !== '_REMOVE_') {
    processed.watermark = Boolean(params.watermark);
  }

  // generate_audio: true/false（Seedance 1.5 pro 特有）
  if (params.generate_audio !== undefined && params.generate_audio !== '_REMOVE_') {
    processed.generate_audio = Boolean(params.generate_audio);
  }

  // draft: true/false（样片模式）
  if (params.draft !== undefined && params.draft !== '_REMOVE_') {
    processed.draft = Boolean(params.draft);
  }

  // return_last_frame: true/false
  if (params.return_last_frame !== undefined && params.return_last_frame !== '_REMOVE_') {
    processed.return_last_frame = Boolean(params.return_last_frame);
  }

  // callback_url
  if (params.callback_url && params.callback_url !== '_REMOVE_') {
    processed.callback_url = params.callback_url;
  }

  // service_tier: default 或 flex
  if (params.service_tier && params.service_tier !== '_REMOVE_') {
    const validTiers = ['default', 'flex'];
    if (validTiers.includes(params.service_tier)) {
      processed.service_tier = params.service_tier;
    }
  }

  return processed;
}

module.exports = {
  /**
   * 自定义提交请求
   * @param {object} model - 完整 DB 模型配置
   * @param {object} params - 原始合并参数（含 prompt, imageUrls, duration, ratio 等）
   * @param {object} rendered - 模板渲染后的 { url, method, headers, body }
   * @returns {object} 原始 API 响应 data
   */
  async call(model, params, rendered) {
    console.log('[Seedance1.5 Handler] 开始处理请求');
    console.log('[Seedance1.5 Handler] 原始参数:', JSON.stringify(params, null, 2));

    // 0. API 密钥处理：优先 model.api_key，其次 provider key，再次 params.apiKey，最后环境变量
    const apiKey = model.api_key || (model._provider?.api_key) || params.apiKey || process.env.SEEDANCE_API_KEY || process.env.VOLCENGINE_API_KEY;
    if (!apiKey) {
      throw new Error('Seedance API Key 未配置：请在模型配置中设置 API Key 或配置环境变量 SEEDANCE_API_KEY');
    }
    // 删除所有大小写变体的 Authorization，避免重复
    for (const key of Object.keys(rendered.headers)) {
      if (key.toLowerCase() === 'authorization') {
        delete rendered.headers[key];
      }
    }
    rendered.headers['Authorization'] = 'Bearer ' + apiKey;
    console.log('[Seedance1.5 Handler] API Key 已设置, 长度:', apiKey.length);

    // 1. 构建 content 数组
    const prompt = params.prompt || '';
    const imageUrls = params.imageUrls || [];
    const startFrame = params.startFrame;
    const endFrame = params.endFrame;
    const content = buildContent(prompt, imageUrls, startFrame, endFrame);

    console.log('[Seedance1.5 Handler] Content 数组:', JSON.stringify(content, null, 2));

    // 2. 处理其他参数
    const processedParams = processParams(params);

    // 3. 构建请求体
    // model_id 优先级：model.model_id（数据库配置） > rendered.body.model（模板） > params.model > 兜底值
    // 注意：model.name 是显示名称（如 "Seedance 1.5 Pro"），不能作为 API model_id
    const modelId = model.model_id || rendered.body?.model || params.model || 'doubao-seedance-1-5-pro-251215';

    const requestBody = {
      model: modelId,
      content,
      ...processedParams
    };

    console.log('[Seedance1.5 Handler] 请求体:', JSON.stringify(requestBody, null, 2));

    // 4. 发送请求
    console.log(`[Seedance1.5 Handler] 调用 ${rendered.url}`);

    // 确保 Content-Type 为 application/json（方舟平台需要此 header 才能正确解析请求体）
    const requestHeaders = {
      ...rendered.headers,
      'Content-Type': 'application/json'
    };

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 120000);

    let response;
    try {
      response = await fetch(rendered.url, {
        method: rendered.method || 'POST',
        headers: requestHeaders,
        body: JSON.stringify(requestBody),
        signal: controller.signal
      });
      clearTimeout(timeout);
    } catch (err) {
      clearTimeout(timeout);
      if (err.name === 'AbortError') {
        throw new Error('Seedance 1.5 API 请求超时（120秒）');
      }
      throw err;
    }

    const responseText = await response.text();
    console.log('[Seedance1.5 Handler] 响应状态:', response.status);
    console.log('[Seedance1.5 Handler] 响应内容:', responseText);

    // 5. 解析响应
    let data;
    try {
      data = JSON.parse(responseText);
    } catch (err) {
      throw new Error(`Seedance 1.5 API 返回非 JSON: ${responseText.substring(0, 300)}`);
    }

    if (!response.ok) {
      const errorMsg = data.error?.message || data.message || data.msg || JSON.stringify(data);
      const userMsg = friendlyErrorMessage(response.status, errorMsg);
      throw new Error(`Seedance 1.5 视频生成失败: ${userMsg}`);
    }

    return data;
  }

  // query 不需要自定义，走模板流程即可
};
