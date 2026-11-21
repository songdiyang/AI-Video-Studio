// 原生 ffmpeg 导出（桌面端）：探测 sidecar/PATH → 构建计划 → invoke Rust 进程
// → 进度事件回传 → 产物另存。浏览器形态一律返回 null 由调用方回退 FFmpeg.wasm。
//
// 片段/音轨 URL 需还原为本机绝对路径（Tauri convertFileSrc 的逆操作）；
// 任何 URL 无法还原（blob:/http 远端）时不强行导出，交还 wasm 路径。

import { isTauri } from './localApi';
import { buildNativeExportPlan, type NativePlanInput, type NativeTracks } from './nativeExportPlan';

export interface NativeExportOutcome {
  output_path: string;
  bytes: number;
  log_tail: string[];
}

const PROGRESS_EVENT = 'native-export-progress';

/** asset:// / file:// / 绝对路径 → 本机绝对路径；不可还原返回 null */
export function resolveLocalMediaPath(src: string): string | null {
  if (!src) return null;
  let raw = '';
  if (/^https?:\/\/asset\.localhost\//i.test(src)) raw = src.replace(/^https?:\/\/asset\.localhost\//i, '');
  else if (/^asset:\/\/localhost\//i.test(src)) raw = src.replace(/^asset:\/\/localhost\//i, '');
  else if (/^file:\/\//i.test(src)) raw = decodeURIComponent(src.replace(/^file:\/\//i, ''));
  else if (/^[A-Za-z]:[\\/]/.test(src) || src.startsWith('/')) raw = src;
  else return null;
  try {
    let path = decodeURIComponent(raw.split('?')[0].split('#')[0]);
    // Windows asset URL 可能带多余前导斜杠（/C:/Users/...）
    if (/^\/[A-Za-z]:[\\/]/.test(path)) path = path.slice(1);
    return path;
  } catch {
    return raw;
  }
}

let cachedProbe: Promise<string | null> | null = null;

/** 探测原生 ffmpeg（Tauri only）。可用返回版本行；不可用/null 表示回退 wasm。 */
export async function probeNativeFfmpeg(): Promise<string | null> {
  if (!isTauri()) return null;
  if (!cachedProbe) {
    cachedProbe = (async () => {
      try {
        const { invoke } = await import('@tauri-apps/api/core');
        return await invoke<string>('native_ffmpeg_probe');
      } catch (e) {
        console.warn('[nativeExport] 原生 ffmpeg 不可用，回退 FFmpeg.wasm:', e);
        return null;
      }
    })();
  }
  return cachedProbe;
}

export interface NativeExportRequest {
  clips: Array<{ path: string; duration: number }>;
  workdir: string;
  format: NativePlanInput['format'];
  resolution: NativePlanInput['resolution'];
  fps: number;
  quality: NativePlanInput['quality'];
  tracks?: NativeTracks;
  outputName?: string;
  onProgress?: (percent: number, timeSec: number) => void;
}

/** 执行原生导出；失败抛错（调用方决定回退策略） */
export async function exportNative(req: NativeExportRequest): Promise<NativeExportOutcome> {
  const { invoke } = await import('@tauri-apps/api/core');
  const { listen } = await import('@tauri-apps/api/event');
  const plan = buildNativeExportPlan({
    clips: req.clips,
    format: req.format,
    resolution: req.resolution,
    fps: req.fps,
    quality: req.quality,
    tracks: req.tracks,
    outputName: req.outputName,
  });
  const unlisten = req.onProgress
    ? await listen<{ percent: number; timeSec: number }>(PROGRESS_EVENT, (ev) => {
        req.onProgress?.(ev.payload.percent, ev.payload.timeSec);
      })
    : null;
  try {
    return await invoke<NativeExportOutcome>('native_ffmpeg_export', {
      plan: { workdir: req.workdir, ...plan },
    });
  } finally {
    if (unlisten) unlisten();
  }
}

/** 把已导出产物另存到用户选择的位置；用户取消返回 null */
export async function saveNativeExport(path: string, defaultName: string): Promise<string | null> {
  const { invoke } = await import('@tauri-apps/api/core');
  return invoke<string | null>('save_export_file', { path, defaultName });
}