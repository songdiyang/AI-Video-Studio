/**
 * 媒体缓存服务
 * 
 * 使用 Cache API 缓存图片和视频资源到本地浏览器，
 * 提高用户下次打开时的加载速度。
 * 
 * 缓存策略：
 *   - 图片：懒加载完成后自动缓存
 *   - 视频：首次播放加载后自动缓存
 *   - 仅缓存本项目的媒体资源（/uploads/ 和 MinIO 路径）
 *   - 用户可在设置页面手动清除缓存
 */

const CACHE_NAME = 'nanostory-media-v1';

// 仅缓存这些路径模式的资源
const CACHEABLE_PATTERNS = [
  '/uploads/',
  '/minio/',
  '/api/storyboards/',
];

/** 检查浏览器是否支持 Cache API */
export function isCacheSupported(): boolean {
  return typeof caches !== 'undefined';
}

/** 检查 URL 是否应该被缓存 */
function isCacheableUrl(url: string): boolean {
  if (!url) return false;
  // 只缓存 http(s) URL
  if (!url.startsWith('http://') && !url.startsWith('https://') && !url.startsWith('/')) {
    return false;
  }
  // data: URL 和 blob: URL 不缓存
  if (url.startsWith('data:') || url.startsWith('blob:')) return false;
  // 检查是否匹配可缓存的路径模式
  return CACHEABLE_PATTERNS.some(pattern => url.includes(pattern));
}

/**
 * 将媒体资源缓存到本地
 * @param url 资源 URL
 * @returns 是否成功缓存
 */
export async function cacheMedia(url: string): Promise<boolean> {
  if (!isCacheSupported() || !isCacheableUrl(url)) return false;

  try {
    const cache = await caches.open(CACHE_NAME);
    // 已缓存则跳过
    const existing = await cache.match(url);
    if (existing) return true;

    const response = await fetch(url, { mode: 'cors', credentials: 'same-origin' });
    if (!response.ok) return false;

    // 仅缓存图片和视频
    const contentType = response.headers.get('content-type') || '';
    if (!contentType.startsWith('image/') && !contentType.startsWith('video/')) {
      return false;
    }

    await cache.put(url, response);
    return true;
  } catch (err) {
    // 缓存失败不影响主流程
    console.warn('[MediaCache] 缓存失败:', url, err);
    return false;
  }
}
/**
 * 尝试从缓存加载，未命中则从网络加载并缓存
 * @param url 资源 URL
 * @returns blob URL（缓存或网络）或原始 URL（失败时降级）
 */
export async function loadWithCache(url: string): Promise<{ src: string; fromCache: boolean }> {
  if (!isCacheSupported() || !isCacheableUrl(url)) {
    return { src: url, fromCache: false };
  }

  try {
    const cache = await caches.open(CACHE_NAME);
    
    // 1. 尝试从缓存读取
    const cached = await cache.match(url);
    if (cached) {
      const blob = await cached.blob();
      return { src: URL.createObjectURL(blob), fromCache: true };
    }

    // 2. 缓存未命中 - 从网络加载后缓存
    const response = await fetch(url, { mode: 'cors', credentials: 'same-origin' });
    if (response.ok) {
      const contentType = response.headers.get('content-type') || '';
      if (contentType.startsWith('image/') || contentType.startsWith('video/')) {
        // clone 一份用于缓存，原始响应用于返回
        const cloned = response.clone();
        cache.put(url, cloned).catch(() => {});
        const blob = await response.blob();
        return { src: URL.createObjectURL(blob), fromCache: false };
      }
    }
  } catch (err) {
    console.warn('[MediaCache] loadWithCache 失败，降级到直接 URL:', err);
  }

  return { src: url, fromCache: false };
}

/**
 * 获取缓存统计信息
 * @returns { count: 缓存条目数, size: 缓存总大小(字节) }
 */
export async function getCacheStats(): Promise<{ count: number; size: number }> {
  if (!isCacheSupported()) return { count: 0, size: 0 };

  try {
    const cache = await caches.open(CACHE_NAME);
    const keys = await cache.keys();
    let totalSize = 0;

    for (const request of keys) {
      const response = await cache.match(request);
      if (response) {
        const blob = await response.blob();
        totalSize += blob.size;
      }
    }

    return { count: keys.length, size: totalSize };
  } catch (err) {
    console.warn('[MediaCache] 获取缓存统计失败:', err);
    return { count: 0, size: 0 };
  }
}/**
 * 为 URL 添加缓存破坏参数，确保浏览器加载最新内容
 * 帧图片使用固定 MinIO 路径，重新生成后 URL 不变，需要强制刷新缓存
 * @param url 原始 URL
 * @returns 带缓存破坏参数的 URL
 */
export function bustCache(url: string | null | undefined): string | null {
  if (!url) return null;
  const separator = url.includes('?') ? '&' : '?';
  return `${url}${separator}v=${Date.now()}`;
}
