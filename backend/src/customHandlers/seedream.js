/**
 * 豆包 Seedream 文生图/图生图 自定义 Handler
 *
 * 适用模型：Seedream 3.0 / 4.0 / 5.0 系列
 * API 端点：从数据库配置动态获取（OpenAI 兼容 /images/generations）
 *
 * 特殊处理：
 * 1. 文生图：仅需 prompt，可选 size/seed/watermark 等参数
 * 2. 图生图：需额外传入 image 数组（参考图 URL 或 base64）
 * 3. 支持 response_format: "url" 或 "b64_json"
 * 4. 同步 API，直接返回生成结果（无需轮询）
 */

const fetch = require('node-fetch');

/**
 * 从模型配置中获取模型ID
 * 优先使用 model_id 字段，其次从 default_params 或 body 解析
 */
function getModelId(model, params, renderedBody) {
  return renderedBody?.model || params.model || model.model_id || model.default_model_id || '';
}

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
  return rawMsg;
}

/**
 * Seedream 高版本（4.5+）最低像素要求
 * 4.5: image size must be at least 3686400 pixels (1920x1920)
 * 5.0/5.0-lite: 支持 '2k', '3k' 预设值
 */
const SEEDREAM_HIGH_MIN_PIXELS = 3686400; // 1920 x 1920

/**
 * aspectRatio → 像素尺寸映射表（Seedream 4.5，满足最低 3,686,400 像素要求）
 * 所有尺寸 w*h ≥ 3,686,400
 */
const ASPECT_RATIO_SIZE_MAP_45 = {
  '16:9':  '2560x1440',   // 3,686,400
  '9:16':  '1440x2560',   // 3,686,400
  '1:1':   '1920x1920',   // 3,686,400
  '4:3':   '2240x1680',   // 3,763,200
  '3:4':   '1680x2240',   // 3,763,200
  '3:2':   '2400x1600',   // 3,840,000
  '2:3':   '1600x2400',   // 3,840,000
  '21:9':  '2880x1280',   // 3,686,400（已修正边界值）
  '9:21':  '1280x2880',   // 3,686,400（已修正边界值）
};

/**
 * 根据 aspectRatio 字符串动态计算满足最低像素要求的尺寸
 * @param {string} aspectRatio - 如 "16:9", "9:16"
 * @param {number} minPixels - 最低像素数
 * @returns {string|null} "WxH" 格式尺寸，无法解析则返回 null
 */
function computeSizeFromRatio(aspectRatio, minPixels) {
  const match = aspectRatio.match(/^(\d+):(\d+)$/);
  if (!match) return null;
  const rw = parseInt(match[1]);
  const rh = parseInt(match[2]);
  if (!rw || !rh) return null;
  // w/h = rw/rh, w*h >= minPixels
  // w = rw*k, h = rh*k, w*h = rw*rh*k² >= minPixels → k = ceil(sqrt(minPixels/(rw*rh)))
  const k = Math.ceil(Math.sqrt(minPixels / (rw * rh)));
  let w = rw * k;
  let h = rh * k;
  // 对齐到 8 像素（GPU 友好）
  w = Math.ceil(w / 8) * 8;
  h = Math.ceil(h / 8) * 8;
  return `${w}x${h}`;
}

/**
 * 处理和验证参数
 * @param {object} params - 原始参数
 * @param {string} modelId - 模型 ID，用于判断版本
 * @returns {object} 处理后的请求体扩展字段
 */
function processParams(params, modelId) {
  const extra = {};

  // 检测模型版本
  const isSeedream45 = /seedream[-_]?(4[-_]?5|4\.5)/i.test(modelId || '');
  const isSeedream50 = /seedream[-_]?(5[-_]?0|5\.0)/i.test(modelId || '');
  const isSeedreamHighRes = isSeedream45 || isSeedream50;

  // ========== aspectRatio → size 转换（核心修复） ==========
  // 用户传入的 aspectRatio（如 "16:9", "9:16"）必须优先于 DB 默认的 size
  const aspectRatio = params.aspectRatio;

  // size: 支持 1920x1920, 1920x2880 等，或预设值 '2k', '3k'
  // 优先使用显式 size 参数，其次从 width+height 自动构建
  let size = params.size || params.resolution;
  if (!size && params.width && params.height) {
    size = `${params.width}x${params.height}`;
  }

  // Seedream 5.0 系列
  if (isSeedream50) {
    // 5.0 使用 '2k'/'3k' 预设值，但只有在没有 aspectRatio 时才强制设置默认值
    if (!aspectRatio && (!size || size === '_REMOVE_' || !/^(2k|3k)$/i.test(size))) {
      size = '2k';
    }
    // 如果有 aspectRatio，同时设置 ratio 和 size，双重保障比例正确
    // - ratio：文生图模式下 API 可自动选择合适尺寸
    // - size：图生图模式下 ratio 可能被忽略，显式像素尺寸兜底
    if (aspectRatio && aspectRatio !== '_REMOVE_' && /^\d+:\d+$/.test(aspectRatio)) {
      extra.ratio = aspectRatio;
      const mappedSize = ASPECT_RATIO_SIZE_MAP_45[aspectRatio] || computeSizeFromRatio(aspectRatio, SEEDREAM_HIGH_MIN_PIXELS);
      if (mappedSize) {
        size = mappedSize;
      }
      console.log(`[Seedream Handler] Seedream 5.0，ratio=${aspectRatio}，size=${size || '(API自动)'}`);
    } else {
      console.log(`[Seedream Handler] Seedream 5.0 模型，使用预设尺寸 '${size}'，无 aspectRatio`);
    }
  }
  // Seedream 4.5
  else if (isSeedream45) {
    // 如果有 aspectRatio，优先用它计算尺寸（覆盖 DB 默认 size）
    if (aspectRatio && aspectRatio !== '_REMOVE_' && /^\d+:\d+$/.test(aspectRatio)) {
      const mappedSize = ASPECT_RATIO_SIZE_MAP_45[aspectRatio] || computeSizeFromRatio(aspectRatio, SEEDREAM_HIGH_MIN_PIXELS);
      if (mappedSize) {
        console.log(`[Seedream Handler] Seedream 4.5，aspectRatio=${aspectRatio} → size=${mappedSize}（覆盖默认 ${size || '无'}）`);
        size = mappedSize;
      } else {
        console.warn(`[Seedream Handler] Seedream 4.5，无法解析 aspectRatio="${aspectRatio}"，使用现有 size=${size}`);
      }
    }
    // 验证尺寸是否满足最低要求
    if (size && size !== '_REMOVE_') {
      const [w, h] = size.split('x').map(Number);
      if (w && h && w * h < SEEDREAM_HIGH_MIN_PIXELS) {
        console.log(`[Seedream Handler] Seedream 4.5，尺寸 ${size} (${w * h} 像素) 小于最低要求，自动调整为 1920x1920`);
        size = '1920x1920';
      }
    } else {
      console.log(`[Seedream Handler] Seedream 4.5 模型未指定尺寸，使用默认尺寸 1920x1920`);
      size = '1920x1920';
    }
  }
  // 其他 Seedream 版本（3.0 等）
  else {
    // 如果有 aspectRatio 但没有 size，尝试用 aspectRatio 计算合理尺寸
    if (aspectRatio && aspectRatio !== '_REMOVE_' && /^\d+:\d+$/.test(aspectRatio) && (!size || size === '_REMOVE_')) {
      const defaultMinPixels = 1024 * 1024; // 低版本模型用较小尺寸
      const computed = computeSizeFromRatio(aspectRatio, defaultMinPixels);
      if (computed) {
        console.log(`[Seedream Handler] aspectRatio=${aspectRatio} → size=${computed}`);
        size = computed;
      }
    }
  }

  if (size && size !== '_REMOVE_') {
    extra.size = size;
  }
  // 非 Seedream 4.5 且未指定 size 时不设置，让 API 使用默认值

  // seed: 随机种子
  if (params.seed !== undefined && params.seed !== '_REMOVE_') {
    const seed = parseInt(params.seed);
    if (!isNaN(seed) && seed >= 0) {
      extra.seed = seed;
    }
  }

  // watermark: 是否添加水印（默认关闭）
  if (params.watermark !== undefined && params.watermark !== '_REMOVE_') {
    extra.watermark = Boolean(params.watermark);
  } else {
    // 默认关闭水印
    extra.watermark = false;
  }

  // response_format: "url" 或 "b64_json"
  if (params.response_format && params.response_format !== '_REMOVE_') {
    extra.response_format = params.response_format;
  }

  // guidance_scale: 文本引导强度
  if (params.guidance_scale !== undefined && params.guidance_scale !== '_REMOVE_') {
    const gs = parseFloat(params.guidance_scale);
    if (!isNaN(gs)) {
      extra.guidance_scale = gs;
    }
  }

  // n: 生成数量
  if (params.n !== undefined && params.n !== '_REMOVE_') {
    const n = parseInt(params.n);
    if (!isNaN(n) && n >= 1) {
      extra.n = n;
    }
  }

  // strength: 图生图变化强度（0.0-1.0）
  if (params.strength !== undefined && params.strength !== '_REMOVE_') {
    const strength = parseFloat(params.strength);
    if (!isNaN(strength) && strength >= 0 && strength <= 1) {
      extra.strength = strength;
    }
  }

  // logo_info: logo 配置（JSON 对象）
  if (params.logo_info && params.logo_info !== '_REMOVE_') {
    extra.logo_info = typeof params.logo_info === 'string'
      ? JSON.parse(params.logo_info) : params.logo_info;
  }

  // tools: 工具配置（仅 Seedream 5.0-lite 支持）
  // 支持 web_search 联网搜索功能
  if (isSeedream50) {
    if (params.tools && params.tools !== '_REMOVE_') {
      extra.tools = typeof params.tools === 'string'
        ? JSON.parse(params.tools) : params.tools;
    } else if (params.webSearch || params.web_search) {
      // 快捷方式：直接传 webSearch: true 启用联网搜索
      extra.tools = [{ type: 'web_search' }];
    }
  }

  return extra;
}

const { resolveToInternalUrl } = require('../utils/fileStorage');

/**
 * 构建 image 数组（图生图用）
 * @param {object} params - 原始参数
 * @returns {string[]|null} 图片 URL/base64 数组，如果没有图片则返回 null
 */
function buildImageArray(params) {
  const images = [];

  // 优先使用 imageUrls 数组
  if (Array.isArray(params.imageUrls) && params.imageUrls.length > 0) {
    images.push(...params.imageUrls.filter(u => u && u !== '_REMOVE_'));
  }
  // 兼容单个 imageUrl
  else if (params.imageUrl && params.imageUrl !== '_REMOVE_') {
    images.push(params.imageUrl);
  }
  // 兼容 image 参数（可能前端直接传）
  else if (params.image) {
    if (Array.isArray(params.image)) {
      images.push(...params.image.filter(u => u && u !== '_REMOVE_'));
    } else if (typeof params.image === 'string' && params.image !== '_REMOVE_') {
      images.push(params.image);
    }
  }
  // 兼容 startFrame（从视频工作台传过来的）
  else if (params.startFrame && params.startFrame !== '_REMOVE_') {
    images.push(params.startFrame);
  }

  if (images.length === 0) return null;

  // 将相对路径转换为可访问的绝对 URL（外部 API 无法解析相对路径）
  return images.map(url => resolveToInternalUrl(url));
}

module.exports = {
  /**
   * 自定义提交请求
   * @param {object} model - 完整 DB 模型配置
   * @param {object} params - 原始合并参数（含 prompt, imageUrls 等）
   * @param {object} rendered - 模板渲染后的 { url, method, headers, body }
   * @returns {object} 原始 API 响应 data
   */
  async call(model, params, rendered) {
    console.log('[Seedream Handler] 开始处理请求');

    // 0. API 密钥处理
    const apiKey = model.api_key || params.apiKey || process.env.SEEDREAM_API_KEY || process.env.SEEDANCE_API_KEY;
    if (!apiKey) {
      throw new Error('Seedream API Key 未配置：请在模型配置中设置 API Key');
    }
    // 清理并设置 Authorization 头
    for (const key of Object.keys(rendered.headers)) {
      if (key.toLowerCase() === 'authorization') {
        delete rendered.headers[key];
      }
    }
    rendered.headers['Authorization'] = 'Bearer ' + apiKey;

    // 1. 获取 model ID（从数据库配置动态读取）
    const modelId = getModelId(model, params, rendered.body);
    if (!modelId) {
      throw new Error('Seedream 模型ID未配置：请在模型配置中设置 model_id');
    }

    // 2. 构建请求体
    const requestBody = {
      model: modelId,
      prompt: params.prompt || '',
      response_format: 'url',
      ...processParams(params, modelId)
    };

    // 3. 如果有参考图，添加 image 字段（图生图模式）
    // 注意：t2i（text-to-image）模型不支持 image 参数，需自动跳过
    const isT2iModel = /t2i/i.test(modelId);
    const imageArray = buildImageArray(params);
    if (imageArray && !isT2iModel) {
      requestBody.image = imageArray;
      console.log(`[Seedream Handler] 图生图模式，参考图数量: ${imageArray.length}`);
    } else if (imageArray && isT2iModel) {
      console.log(`[Seedream Handler] 检测到 t2i 模型 (${modelId})，自动跳过 image 参数，退化为文生图模式`);
    } else {
      console.log('[Seedream Handler] 文生图模式');
    }

    // 3.5 如果有 mask_image（inpainting 涂改模式），添加 mask_image 字段
    if (params.mask_image) {
      const resolvedMask = resolveToInternalUrl(params.mask_image);
      if (resolvedMask) {
        requestBody.mask_image = resolvedMask;
        console.log(`[Seedream Handler] Inpainting 模式，已添加 mask_image`);
      }
    }

    console.log('[Seedream Handler] 请求体:', JSON.stringify(requestBody, null, 2));

    // 4. 发送请求
    const TIMEOUT_MS = 180000; // 180 秒超时
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

    let response;
    try {
      response = await fetch(rendered.url, {
        method: rendered.method || 'POST',
        headers: rendered.headers,
        body: JSON.stringify(requestBody),
        signal: controller.signal
      });
      clearTimeout(timer);
    } catch (err) {
      clearTimeout(timer);
      if (err.name === 'AbortError') {
        throw new Error(`Seedream API 请求超时（${TIMEOUT_MS / 1000}秒），请稍后重试`);
      }
      throw err;
    }

    const responseText = await response.text();
    console.log('[Seedream Handler] 响应状态:', response.status);
    console.log('[Seedream Handler] 响应内容:', responseText.substring(0, 500));

    // 5. 解析响应
    let data;
    try {
      data = JSON.parse(responseText);
    } catch (err) {
      throw new Error(`Seedream API 返回非 JSON: ${responseText.substring(0, 300)}`);
    }

    if (!response.ok) {
      const errorMsg = data.error?.message || data.message || data.msg || JSON.stringify(data);
      const userMsg = friendlyErrorMessage(response.status, errorMsg);
      throw new Error(`Seedream 图片生成失败: ${userMsg}`);
    }

    return data;
  }

  // 同步 API，不需要 query 方法
};
