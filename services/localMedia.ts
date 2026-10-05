// 生成媒体离线落地（localMedia）
//
// 厂商出图/出视频返回的多为带签名的临时 URL（会过期），离线后无法再次访问。
// 本模块把这类临时 URL（或 base64 data URL）经由 Rust 命令 download_media_file
// 下载到工程 <dir>/media/ 目录，并转成 WebView 可离线读取的 asset 协议 URL
// （Windows: http://asset.localhost/... ，macOS/Linux: asset://localhost/...）。
//
// 落地是硬性要求：厂商链接会过期，下载失败必须抛出错误使该次生成显式失败（并自动重试），
// 绝不回填一个迟早失效的临时 URL。

import { isTauri } from './localApi';
import { resolveLocalPath } from './localStore';

interface MediaFileInfo {
  id: string;
  file_name: string;
  file_path: string;
  file_type: string;
  file_size: number;
  mime_type: string;
}

let _convertFileSrc: ((p: string) => string) | null = null;

/** 把绝对文件路径转成 WebView 可加载的 asset 协议 URL（仅 Tauri 下有效） */
async function toWebviewUrl(absPath: string): Promise<string> {
  try {
    if (!_convertFileSrc) {
      const mod = await import('@tauri-apps/api/core');
      const convert = (mod as any).convertFileSrc;
      _convertFileSrc = typeof convert === 'function' ? convert : (p: string) => p;
    }
    const fn: (p: string) => string = _convertFileSrc;
    return fn(absPath);
  } catch {
    return absPath;
  }
}

/** 判断是否已是无需落地的本地/内联引用 */
function isNonPersistentLocalRef(src: string): boolean {
  return /^blob:/i.test(src);
}

const DOWNLOAD_ATTEMPTS = 3;
const RETRY_BASE_DELAY_MS = 800;

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * 把生成结果（厂商临时 URL 或 base64 data URL）落地到工程 media/ 目录，返回可离线读取的本地 URL。
 * 落地为硬性要求：任何失败（含校验空文件）都会抛出，使调用方将本次生成判为失败；失败前自动重试。
 * 仅在浏览器（非 Tauri）环境下原样返回（本地引擎不参与该场景）。
 * @param projectId 本地工程 id（用于解析 <dir> 绝对路径）
 * @param src 厂商 URL 或 data URL
 * @param nameHint 可选文件名提示（用于推断扩展名）
 */
export async function persistGeneratedMedia(
  projectId: number,
  src: string,
  nameHint?: string,
): Promise<string> {
  if (!src) throw new Error('生成结果为空，无法保存');
  // blob / 已是 asset 协议本地地址：无需再落地
  if (isNonPersistentLocalRef(src) || /^(asset:|https?:\/\/asset\.localhost)/i.test(src)) return src;
  // 非 Tauri（浏览器在线模式）：本地引擎不参与，保底原样返回
  if (!isTauri()) return src;

  const projectPath = await resolveLocalPath(projectId);
  if (!projectPath) {
    throw new Error('未找到本地工程目录，无法保存生成结果');
  }

  const { invoke } = await import('@tauri-apps/api/core');
  let lastErr: unknown = null;
  for (let attempt = 1; attempt <= DOWNLOAD_ATTEMPTS; attempt++) {
    try {
      const info = (await invoke('download_media_file', {
        projectPath,
        url: src,
        nameHint: nameHint ?? null,
      })) as MediaFileInfo;
      if (!info?.file_path) throw new Error('下载命令未返回文件路径');
      if (!info.file_size || info.file_size <= 0) throw new Error('下载内容为空文件');
      return await toWebviewUrl(info.file_path);
    } catch (err) {
      lastErr = err;
      console.warn(`[localMedia] 生成媒体落地失败（第 ${attempt}/${DOWNLOAD_ATTEMPTS} 次）:`, err);
      if (attempt < DOWNLOAD_ATTEMPTS) await sleep(RETRY_BASE_DELAY_MS * attempt);
    }
  }
  throw new Error(
    `生成结果保存失败（已重试 ${DOWNLOAD_ATTEMPTS} 次）：${(lastErr as any)?.message || lastErr || '未知错误'}`,
  );
}
