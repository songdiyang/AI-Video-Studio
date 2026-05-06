/**
 * 图片/视频参数自动派生工具
 *
 * 从 imageUrl, imageUrls, startFrame, endFrame 中任意已有的参数自动派生其余缺失的参数。
 *
 * 派生规则：
 *   imageUrl   → imageUrls[0] + startFrame
 *   imageUrls  → imageUrl(=[0]) + startFrame(=[0]) + endFrame(=[1])
 *   startFrame → imageUrl + imageUrls[0]
 *   endFrame   → imageUrls[1]
 *
 * @param {Object} params
 * @param {string}   [params.imageUrl]   - 单张图片 URL
 * @param {string[]} [params.imageUrls]  - 图片 URL 数组
 * @param {string}   [params.startFrame] - 首帧 URL
 * @param {string}   [params.endFrame]   - 尾帧 URL
 * @returns {{ imageUrl: string|null, imageUrls: string[]|null, startFrame: string|null, endFrame: string|null }}
 */
function deriveImageParams({ imageUrl, imageUrls, startFrame, endFrame }) {
  let url = imageUrl || null;
  let urls = imageUrls && imageUrls.length > 0 ? [...imageUrls] : null;
  let sf = startFrame || null;
  let ef = endFrame || null;

  // ── 从 imageUrl 派生 ──
  // imageUrl → imageUrls[0], startFrame
  if (url) {
    if (!urls) urls = [url];
    if (!sf) sf = url;
  }

  // ── 从 imageUrls 派生 ──
  // imageUrls[0] → imageUrl, startFrame
  // imageUrls[1] → endFrame
  if (urls && urls.length > 0) {
    if (!url) url = urls[0];
    if (!sf) sf = urls[0];
    if (!ef && urls.length > 1) ef = urls[1];
  }

  // ── 从 startFrame 派生 ──
  // startFrame → imageUrl, imageUrls[0]
  if (sf) {
    if (!url) url = sf;
    if (!urls) urls = [sf];
    else if (!urls.includes(sf)) urls[0] = sf;
  }

  // ── 从 endFrame 派生 ──
  // endFrame → imageUrls[1]
  if (ef) {
    if (!urls) urls = [sf || ef, ef];
    else if (urls.length < 2) urls.push(ef);
  }

  return { imageUrl: url, imageUrls: urls, startFrame: sf, endFrame: ef };
}

// ========== Seedream 尺寸派生 ==========

const SEEDREAM_HIGH_MIN_PIXELS = 3686400; // 1920 x 1920

const ASPECT_RATIO_SIZE_MAP_45 = {
  '16:9':  '2560x1440',
  '9:16':  '1440x2560',
  '1:1':   '1920x1920',
  '4:3':   '2240x1680',
  '3:4':   '1680x2240',
  '3:2':   '2400x1600',
  '2:3':   '1600x2400',
  '21:9':  '2880x1280',
  '9:21':  '1280x2880',
};

function computeSizeFromRatio(aspectRatio, minPixels) {
  const match = aspectRatio.match(/^(\d+):(\d+)$/);
  if (!match) return null;
  const rw = parseInt(match[1]);
  const rh = parseInt(match[2]);
  if (!rw || !rh) return null;
  const k = Math.ceil(Math.sqrt(minPixels / (rw * rh)));
  let w = rw * k;
  let h = rh * k;
  w = Math.ceil(w / 8) * 8;
  h = Math.ceil(h / 8) * 8;
  return `${w}x${h}`;
}

/**
 * Seedream 参数派生：aspectRatio -> size 转换
 * @param {Object} params
 * @param {string} [params.aspectRatio] - 宽高比，如 "16:9"
 * @param {string} [params.size] - 已有尺寸
 * @param {string} [params.modelId] - 模型ID，用于判断版本
 * @returns {{ size: string|null, ratio: string|null }}
 */
function deriveSeedreamParams({ aspectRatio, size, modelId }) {
  const isSeedream50 = /seedream[-_]?(5[-_]?0|5\.0)/i.test(modelId || '');
  const isSeedream45 = /seedream[-_]?(4[-_]?5|4\.5)/i.test(modelId || '');
  const isHighRes = isSeedream45 || isSeedream50;

  let resultSize = size || null;
  let resultRatio = null;

  // 有 aspectRatio 时优先用它计算尺寸
  if (aspectRatio && aspectRatio !== '_REMOVE_' && /^\d+:\d+$/.test(aspectRatio)) {
    resultRatio = aspectRatio;
    const mapped = ASPECT_RATIO_SIZE_MAP_45[aspectRatio] || computeSizeFromRatio(aspectRatio, SEEDREAM_HIGH_MIN_PIXELS);
    if (mapped) {
      resultSize = mapped;
    }
  }

  // 高分辨率模型验证最低像素
  if (isHighRes && resultSize) {
    const [w, h] = resultSize.split('x').map(Number);
    if (w && h && w * h < SEEDREAM_HIGH_MIN_PIXELS) {
      resultSize = '1920x1920';
    }
  }

  // Seedream 5.0 无 aspectRatio 时的默认尺寸
  if (isSeedream50 && !resultSize) {
    resultSize = '2k';
  }

  // 其他版本无尺寸时的默认
  if (!isHighRes && !resultSize && aspectRatio) {
    const computed = computeSizeFromRatio(aspectRatio, 1024 * 1024);
    if (computed) resultSize = computed;
  }

  return { size: resultSize, ratio: resultRatio };
}

/**
 * Seedance 参数派生：构建 content 数组和参数校验
 * @param {Object} params
 * @returns {{ content: Array, seedanceParams: Object }}
 */
function deriveSeedanceParams({ prompt, imageUrls, startFrame, endFrame, ratio, resolution, duration, seed, camera_fixed, watermark, generate_audio, draft, return_last_frame }) {
  const content = [];

  // 文本
  if (prompt) {
    content.push({ type: 'text', text: prompt });
  }

  // 首帧
  const rawFirst = startFrame || (imageUrls && imageUrls[0]) || null;
  if (rawFirst) {
    content.push({ type: 'image_url', image_url: { url: rawFirst }, role: 'first_frame' });
  }

  // 尾帧
  const rawLast = endFrame || (imageUrls && imageUrls[1]) || null;
  if (rawLast) {
    content.push({ type: 'image_url', image_url: { url: rawLast }, role: 'last_frame' });
  }

  // 参数校验
  const seedanceParams = {};

  if (ratio && ratio !== '_REMOVE_') {
    const validRatios = ['16:9', '4:3', '1:1', '3:4', '9:16', '21:9', 'adaptive'];
    seedanceParams.ratio = validRatios.includes(ratio) ? ratio : 'adaptive';
  }

  if (resolution && resolution !== '_REMOVE_') {
    const validRes = ['480p', '720p', '1080p'];
    seedanceParams.resolution = validRes.includes(resolution) ? resolution : '720p';
  }

  if (duration !== undefined && duration !== '_REMOVE_') {
    const d = parseInt(duration);
    if (d === -1) seedanceParams.duration = -1;
    else if (d >= 4 && d <= 12) seedanceParams.duration = d;
    else if (d > 0 && d < 4) seedanceParams.duration = 4;
    else seedanceParams.duration = 5;
  }

  if (seed !== undefined && seed !== '_REMOVE_') {
    const s = parseInt(seed);
    if (s === -1 || (s >= 0 && s <= 4294967295)) seedanceParams.seed = s;
  }

  if (camera_fixed !== undefined && camera_fixed !== '_REMOVE_') {
    seedanceParams.camera_fixed = Boolean(camera_fixed);
  }
  if (watermark !== undefined && watermark !== '_REMOVE_') {
    seedanceParams.watermark = Boolean(watermark);
  }
  if (generate_audio !== undefined && generate_audio !== '_REMOVE_') {
    seedanceParams.generate_audio = Boolean(generate_audio);
  }
  if (draft !== undefined && draft !== '_REMOVE_') {
    seedanceParams.draft = Boolean(draft);
  }
  if (return_last_frame !== undefined && return_last_frame !== '_REMOVE_') {
    seedanceParams.return_last_frame = Boolean(return_last_frame);
  }

  return { content, seedanceParams };
}

module.exports = {
  deriveImageParams,
  deriveSeedreamParams,
  deriveSeedanceParams
};
