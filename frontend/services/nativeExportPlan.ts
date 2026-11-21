/**
 * 原生 ffmpeg 导出参数构建（纯函数，可单测）。
 *
 * 桌面端导出不再走 FFmpeg.wasm 软编码：这里把「片段拼接 + 分辨率/码率 + 独立音轨
 * （BGM / 台词配音 / 字幕烧录）」翻译成 ffmpeg argv 与辅助文件，交给 Rust
 * media_export::native_ffmpeg_export spawn 原生进程执行。
 *
 * 音轨模型：concat 视频为 input0；BGM 为 input1（可循环/偏移/音量）；每条台词配音
 * 为后续 input 并按 startSec adelay；多路 amix 混音后与视频 map 到一起；字幕以
 * subtitles 滤镜烧录。无音轨时保留片段原声（map 0:a?）。
 */

export interface NativeClip {
  /** 片段视频的本机绝对路径 */
  path: string;
  /** 片段时长（秒），用于进度换算 */
  duration: number;
}

export interface NativeTracks {
  bgm?: { path: string; volume: number; startOffset: number; loop: boolean };
  dialogue?: Array<{ path: string; startSec: number }>;
  subtitles?: Array<{ startTime: number; endTime: number; text: string }>;
}

export interface NativePlanInput {
  clips: NativeClip[];
  format: 'mp4' | 'webm';
  resolution: '480p' | '720p' | '1080p' | '1440p' | '4k';
  fps: number;
  quality: 'low' | 'medium' | 'high';
  tracks?: NativeTracks;
  outputName?: string;
}

export interface NativePlan {
  files: Array<{ name: string; content: string }>;
  args: string[];
  output_name: string;
  duration_hint_sec: number;
}

const RESOLUTION_MAP: Record<string, { width: number; height: number }> = {
  '480p': { width: 854, height: 480 },
  '720p': { width: 1280, height: 720 },
  '1080p': { width: 1920, height: 1080 },
  '1440p': { width: 2560, height: 1440 },
  '4k': { width: 3840, height: 2160 },
};
const PRESET_MAP: Record<string, string> = { low: 'ultrafast', medium: 'fast', high: 'medium' };
const CRF_MAP: Record<string, string> = { low: '28', medium: '23', high: '18' };

/** concat demuxer 单引号转义：' → '\'' */
function escapeConcatPath(p: string): string {
  return p.replace(/'/g, "'\\''");
}

/** SRT 时间戳 HH:MM:SS,mmm */
function srtTime(sec: number): string {
  const s = Math.max(0, sec);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = Math.floor(s % 60);
  const ms = Math.round((s - Math.floor(s)) * 1000);
  const pad = (n: number, w = 2) => String(n).padStart(w, '0');
  return `${pad(h)}:${pad(m)}:${pad(ss)},${pad(ms, 3)}`;
}

export function buildSrt(items: Array<{ startTime: number; endTime: number; text: string }>): string {
  return items
    .map((it, i) => `${i + 1}\n${srtTime(it.startTime)} --> ${srtTime(it.endTime)}\n${it.text}\n`)
    .join('\n');
}

export function buildNativeExportPlan(input: NativePlanInput): NativePlan {
  const { clips, tracks } = input;
  const res = RESOLUTION_MAP[input.resolution] || RESOLUTION_MAP['1080p'];
  const files: Array<{ name: string; content: string }> = [];
  const args: string[] = [];

  // input0：concat 片段列表
  files.push({ name: 'filelist.txt', content: clips.map((c) => `file '${escapeConcatPath(c.path)}'`).join('\n') + '\n' });
  args.push('-f', 'concat', '-safe', '0', '-i', 'filelist.txt');

  // 音轨输入：BGM=input1，台词配音依次排后
  const dialogue = tracks?.dialogue ?? [];
  let nextInput = 1;
  let bgmIndex = -1;
  if (tracks?.bgm) {
    bgmIndex = nextInput++;
    if (tracks.bgm.loop) args.push('-stream_loop', '-1');
    args.push('-i', tracks.bgm.path);
  }
  const dialogueIndices: number[] = [];
  for (const d of dialogue) {
    dialogueIndices.push(nextInput++);
    args.push('-i', d.path);
  }

  // 视频滤镜：缩放补边 + 可选字幕烧录
  let vf = `scale=${res.width}:${res.height}:force_original_aspect_ratio=decrease,pad=${res.width}:${res.height}:(ow-iw)/2:(oh-ih)/2`;
  if (tracks?.subtitles && tracks.subtitles.length > 0) {
    files.push({ name: 'subtitles.srt', content: buildSrt(tracks.subtitles) });
    vf += `,subtitles=subtitles.srt`;
  }
  args.push('-vf', vf, '-r', String(input.fps), '-pix_fmt', 'yuv420p');

  // 音频：有音轨→filter_complex 混音；无→保留片段原声
  const hasTracks = bgmIndex >= 0 || dialogueIndices.length > 0;
  if (hasTracks) {
    const filters: string[] = [];
    const mixLabels: string[] = [];
    if (bgmIndex >= 0) {
      const b = tracks!.bgm!;
      const delayMs = Math.round((b.startOffset || 0) * 1000);
      filters.push(`[${bgmIndex}:a]volume=${b.volume},adelay=${delayMs}|${delayMs}[bgm]`);
      mixLabels.push('[bgm]');
    }
    dialogue.forEach((d, i) => {
      const ms = Math.round(d.startSec * 1000);
      filters.push(`[${dialogueIndices[i]}:a]adelay=${ms}|${ms}[d${i}]`);
      mixLabels.push(`[d${i}]`);
    });
    filters.push(`${mixLabels.join('')}amix=inputs=${mixLabels.length}:duration=longest:dropout_transition=0[aout]`);
    args.push('-filter_complex', filters.join(';'), '-map', '0:v', '-map', '[aout]', '-c:a', 'aac', '-b:a', '192k', '-shortest');
  } else {
    args.push('-map', '0:v', '-map', '0:a?', '-c:a', 'aac', '-b:a', '128k');
  }

  // 视频编码
  if (input.format === 'webm') {
    args.push('-c:v', 'libvpx-vp9', '-deadline', input.quality === 'high' ? 'good' : 'realtime', '-cpu-used', input.quality === 'low' ? '5' : '2', '-b:v', '0', '-crf', CRF_MAP[input.quality] || '23');
  } else {
    args.push('-c:v', 'libx264', '-preset', PRESET_MAP[input.quality] || 'fast', '-crf', CRF_MAP[input.quality] || '23');
  }

  const output_name = input.outputName || `output.${input.format}`;
  args.push('-y', output_name);

  return {
    files,
    args,
    output_name,
    duration_hint_sec: clips.reduce((n, c) => n + (c.duration || 0), 0),
  };
}