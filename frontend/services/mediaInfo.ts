// 媒体资源元数据查询（mediaInfo）
//
// 供 AI 助手 query_media_info 使用：探测工程内每张图/每个视频的
// 分辨率（宽高像素）与文件大小。三层策略：
//  1. Tauri + 本地文件（asset/file 协议 URL）：invoke probe_media_file
//     （Rust 只读文件头取图片宽高 + fs::metadata 取大小，最快最准）；
//     视频宽高 Rust 侧解析不了，由前端 <video preload="metadata"> 补充。
//  2. blob/data/HTTP URL（浏览器开发模式或未落地引用）：元素探测取宽高，
//     fetch 估算大小（data URL 按 base64 长度折算，远程 URL 不下载）。
//  3. 探测失败/文件缺失显式标记，不抛错——查询类 action 需要全量汇总。
//
// 结果按 URL 缓存（含 in-flight Promise 去重），重复查询零开销。

import { isTauri } from './localApi';

export type MediaKind = 'image' | 'video' | 'other';

export interface MediaProbeInfo {
  url: string;
  kind: MediaKind;
  fileName?: string;
  /** 宽（像素）；探测不到时缺省 */
  width?: number;
  height?: number;
  /** 文件大小（字节）；探测不到时缺省 */
  bytes?: number;
  /** 引用存在但磁盘文件缺失 */
  missing?: boolean;
  /** 探测异常摘要（不阻断汇总） */
  error?: string;
}

/** 字节数 → 人类可读（KB/MB/GB，1 位小数） */
export function formatBytes(n: number | undefined): string {
  if (n == null || !Number.isFinite(n) || n < 0) return '未知';
  if (n < 1024) return `${n} B`;
  const kb = n / 1024;
  if (kb < 1024) return `${kb.toFixed(1)} KB`;
  const mb = kb / 1024;
  if (mb < 1024) return `${mb.toFixed(1)} MB`;
  return `${(mb / 1024).toFixed(2)} GB`;
}

/** 宽高 → "1024×768" 或 "未知" */
export function formatResolution(width?: number, height?: number): string {
  if (!width || !height) return '未知';
  return `${width}×${height}`;
}

/** 把 asset/file 协议 URL 还原为绝对文件路径（Tauri convertFileSrc 的逆操作） */
function assetUrlToPath(src: string): string | null {
  let raw = '';
  if (/^https?:\/\/asset\.localhost\//i.test(src)) raw = src.replace(/^https?:\/\/asset\.localhost\//i, '');
  else if (/^asset:\/\/localhost\//i.test(src)) raw = src.replace(/^asset:\/\/localhost\//i, '');
  else if (/^file:\/\//i.test(src)) raw = src.replace(/^file:\/\//i, '');
  else return null;
  try {
    let path = decodeURIComponent(raw.split('?')[0].split('#')[0]);
    // Windows asset URL 可能带多余的前导斜杠，如 /C:/Users/...
    if (/^\/[A-Za-z]:[\\/]/.test(path)) path = path.slice(1);
    return path;
  } catch {
    return null;
  }
}

/** 按 URL 扩展名粗略推断媒体类型（bridge 已给 kindHint 时不依赖它） */
function guessKind(src: string): MediaKind {
  const clean = src.split('?')[0].split('#')[0];
  if (/\.(mp4|mov|webm|avi|mkv|m4v)(?:$)/i.test(clean)) return 'video';
  if (/\.(png|jpe?g|webp|gif|bmp|avif)(?:$)/i.test(clean)) return 'image';
  if (/^data:video\//i.test(src)) return 'video';
  if (/^data:image\//i.test(src)) return 'image';
  return 'other';
}

/** data URL 的 base64 负载折算字节数（跳过前缀，按 3/4 压缩比） */
function estimateDataUrlBytes(src: string): number | undefined {
  const comma = src.indexOf(',');
  if (comma < 0) return undefined;
  const payload = src.slice(comma + 1);
  if (/;base64/i.test(src.slice(0, comma))) return Math.floor((payload.length * 3) / 4);
  try {
    return decodeURIComponent(payload).length;
  } catch {
    return undefined;
  }
}

/** 元素探测宽高：Image.naturalWidth / Video.videoWidth，超时按未知处理 */
function probeElementSize(src: string, kind: MediaKind, timeoutMs = 20000): Promise<{ width?: number; height?: number }> {
  return new Promise((resolve) => {
    let settled = false;
    const done = (r: { width?: number; height?: number }) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(r);
    };
    const timer = setTimeout(() => done({}), timeoutMs);
    if (kind === 'video') {
      const el = document.createElement('video');
      el.preload = 'metadata';
      el.muted = true;
      el.onloadedmetadata = () => done({ width: el.videoWidth || undefined, height: el.videoHeight || undefined });
      el.onerror = () => done({});
      el.src = src;
    } else {
      const el = new Image();
      el.onload = () => done({ width: el.naturalWidth || undefined, height: el.naturalHeight || undefined });
      el.onerror = () => done({});
      el.src = src;
    }
  });
}

/** 浏览器可达 URL 的大小：HEAD Content-Length → GET blob（本地开发服务），远程 GET 不取 */
async function probeUrlBytes(src: string): Promise<number | undefined> {
  if (src.startsWith('data:')) return estimateDataUrlBytes(src);
  try {
    const res = await fetch(src, { method: 'HEAD' });
    const len = res.headers.get('content-length');
    if (len) {
      const n = Number(len);
      if (Number.isFinite(n) && n >= 0) return n;
    }
    // blob: 无 Content-Length，回退 GET
    if (/^blob:/i.test(src) || (res.status >= 400 && /^blob:/i.test(src))) {
      const full = await fetch(src);
      const blob = await full.blob();
      return blob.size;
    }
  } catch {
    /* 远程 URL 或协议不支持 HEAD：大小未知，不阻断 */
  }
  return undefined;
}

interface RustProbeResult {
  file_name: string;
  file_size: number;
  mime_type: string;
  file_type: string;
  width: number | null;
  height: number | null;
  missing: boolean;
}

const cache = new Map<string, Promise<MediaProbeInfo>>();

/** 受限并发、保序返回的通用批处理 */
async function runLimited<T, R>(items: T[], concurrency: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let cursor = 0;
  const worker = async () => {
    while (cursor < items.length) {
      const idx = cursor++;
      results[idx] = await fn(items[idx]);
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, worker));
  return results;
}

/** 探测单个媒体引用（结果按 URL 缓存；kindHint 由调用方按业务语义给出） */
export function probeMedia(src: string, kindHint?: MediaKind): Promise<MediaProbeInfo> {
  const cached = cache.get(src);
  if (cached) return cached;
  const task = doProbe(src, kindHint).catch((err: any): MediaProbeInfo => ({
    url: src,
    kind: kindHint ?? guessKind(src),
    error: err?.message || String(err),
  }));
  cache.set(src, task);
  return task;
}

async function doProbe(src: string, kindHint?: MediaKind): Promise<MediaProbeInfo> {
  const kind = kindHint && kindHint !== 'other' ? kindHint : guessKind(src);
  const base: MediaProbeInfo = { url: src, kind };

  // 1) Tauri 本地文件：Rust 侧元数据（大小 + 图片宽高，只读头部）
  if (isTauri() && !src.startsWith('blob:') && !src.startsWith('data:')) {
    const path = assetUrlToPath(src) ?? (/^[A-Za-z]:[\\/]|^\//.test(src) ? src : null);
    if (path) {
      const { invoke } = await import('@tauri-apps/api/core');
      const r = await invoke<RustProbeResult>('probe_media_file', { path });
      const info: MediaProbeInfo = {
        ...base,
        fileName: r.file_name || undefined,
        bytes: r.missing ? undefined : r.file_size,
        missing: r.missing || undefined,
      };
      if (r.width && r.height) {
        info.width = r.width;
        info.height = r.height;
        return info;
      }
      if (r.missing) return info;
      // 视频 / image  crate 不认识的格式：前端元素补测宽高
      const el = await probeElementSize(src, kind);
      info.width = el.width;
      info.height = el.height;
      return info;
    }
  }

  // 2) 非 Tauri / blob / data / 无法还原路径：元素探测 + URL 侧大小
  const [el, bytes] = await Promise.all([
    kind === 'other' ? Promise.resolve<{ width?: number; height?: number }>({}) : probeElementSize(src, kind),
    probeUrlBytes(src),
  ]);
  return { ...base, width: el.width, height: el.height, bytes };
}

/** 并发受限的批量探测（本地磁盘 IO 快，4 并发足够平滑；同 URL 自动去重） */
export async function probeMediaBatch(
  items: Array<{ src: string; kind?: MediaKind }>,
  concurrency = 4,
): Promise<MediaProbeInfo[]> {
  return runLimited(items, concurrency, (it) => probeMedia(it.src, it.kind));
}

// ==================== 视觉模型可读的图片 data URL ====================
//
// 工程内的图片是 asset 协议 URL（仅本机能访问），厂商 API 取不到，必须转成
// data URL 才能进入 image_url 内容块。统一在这里做：本地直读（Tauri 绕开
// CSP/CORS）→ 尺寸/体积超阈值时 canvas 缩放重编码，控制 base64 体积与 token 成本。

/** 送给视觉模型前压到该单边像素以内（足够判断构图/色彩/一致性） */
const VISION_MAX_SIDE = 1280;
/** base64 折算字节小于该值且尺寸达标时直接透传，避免无谓重编码 */
const VISION_PASSTHROUGH_BYTES = 512 * 1024;

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('图片编码失败'));
    reader.readAsDataURL(blob);
  });
}

/** 图片 URL（asset/file/http/blob/data）→ 原始 data URL */
async function readImageAsDataUrl(src: string): Promise<string> {
  if (src.startsWith('data:')) return src;
  if (isTauri()) {
    const path = assetUrlToPath(src) ?? (/^[A-Za-z]:[\\/]|^\//.test(src) ? src : null);
    if (path) {
      const { invoke } = await import('@tauri-apps/api/core');
      return await invoke<string>('read_media_data_url', { path });
    }
  }
  const res = await fetch(src);
  if (!res.ok) throw new Error(`读取图片失败 (${res.status})`);
  const blob = await res.blob();
  if (blob.type && blob.type.startsWith('text/')) throw new Error('该地址不是图片');
  return await blobToDataUrl(blob);
}

function loadImageElement(src: string): Promise<{ el: HTMLImageElement; width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const el = new Image();
    el.onload = () => resolve({ el, width: el.naturalWidth || 0, height: el.naturalHeight || 0 });
    el.onerror = () => reject(new Error('图片解码失败'));
    el.src = src;
  });
}

/** 尺寸/体积超阈值时缩放重编码（JPEG 0.85）；失败则原样返回，不阻断对话 */
async function shrinkDataUrl(dataUrl: string): Promise<string> {
  const estBytes = estimateDataUrlBytes(dataUrl) ?? 0;
  try {
    const { el, width, height } = await loadImageElement(dataUrl);
    const longest = Math.max(width, height);
    if (!longest) return dataUrl;
    if (longest <= VISION_MAX_SIDE && estBytes <= VISION_PASSTHROUGH_BYTES) return dataUrl;
    const scale = longest > VISION_MAX_SIDE ? VISION_MAX_SIDE / longest : 1;
    const w = Math.max(1, Math.round(width * scale));
    const h = Math.max(1, Math.round(height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) return dataUrl;
    ctx.drawImage(el, 0, 0, w, h);
    return canvas.toDataURL('image/jpeg', 0.85);
  } catch {
    return dataUrl;
  }
}

const visionCache = new Map<string, Promise<string>>();

/** 本地/远程图片 → 视觉模型可用的 data URL（按 URL 缓存，重复读零开销） */
export function toVisionImageUrl(src: string): Promise<string> {
  const cached = visionCache.get(src);
  if (cached) return cached;
  const task = readImageAsDataUrl(src)
    .then((dataUrl) => shrinkDataUrl(dataUrl))
    .catch((err: any) => {
      visionCache.delete(src);
      throw err;
    });
  visionCache.set(src, task);
  return task;
}

/** 批量转换（受限并发，失败项只标记 error 不阻断其余），保序 */
export async function toVisionImageUrls(
  srcs: string[],
  concurrency = 3,
): Promise<Array<{ src: string; dataUrl?: string; error?: string }>> {
  return runLimited(srcs, concurrency, async (src) => {
    try {
      return { src, dataUrl: await toVisionImageUrl(src) };
    } catch (err: any) {
      return { src, error: err?.message || String(err) };
    }
  });
}
