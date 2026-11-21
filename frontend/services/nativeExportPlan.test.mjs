/** 原生导出参数构建回归：node --test services/nativeExportPlan.test.mjs
 *
 * 守住 P1-6 的硬约束：
 *  1) concat 列表正确转义单引号（路径含 ' 不破坏 demuxer）；
 *  2) 分辨率/码率/编码器映射与 wasm 版一致；
 *  3) 独立音轨：BGM 音量/偏移/循环、台词 adelay、多路 amix、字幕烧录；
 *  4) 无音轨时保留片段原声（map 0:a?），不误删音频；
 *  5) SRT 时间戳格式正确。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const source = readFileSync(fileURLToPath(new URL('./nativeExportPlan.ts', import.meta.url)), 'utf8');
const js = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText;
const { buildNativeExportPlan, buildSrt } = await import('data:text/javascript;base64,' + Buffer.from(js, 'utf8').toString('base64'));

const base = (over = {}) => ({
  clips: [{ path: '/media/a.mp4', duration: 5 }, { path: '/media/b.mp4', duration: 7 }],
  format: 'mp4', resolution: '1080p', fps: 30, quality: 'high',
  ...over,
});
const argAfter = (args, flag) => args[args.indexOf(flag) + 1];

test('concat 列表：逐片段 file 行 + 单引号转义', () => {
  const plan = buildNativeExportPlan(base({ clips: [{ path: "/media/it's.mp4", duration: 3 }] }));
  const list = plan.files.find((f) => f.name === 'filelist.txt');
  assert.ok(list);
  assert.match(list.content, /file '\/media\/it'\\''s\.mp4'/);
  assert.deepEqual(plan.args.slice(0, 6), ['-f', 'concat', '-safe', '0', '-i', 'filelist.txt']);
  assert.equal(plan.duration_hint_sec, 3);
});

test('分辨率/编码映射：1080p H.264 + crf18 + preset medium', () => {
  const plan = buildNativeExportPlan(base());
  assert.match(argAfter(plan.args, '-vf'), /scale=1920:1080/);
  assert.match(argAfter(plan.args, '-vf'), /pad=1920:1080/);
  assert.equal(argAfter(plan.args, '-c:v'), 'libx264');
  assert.equal(argAfter(plan.args, '-crf'), '18');
  assert.equal(argAfter(plan.args, '-preset'), 'medium');
  assert.equal(plan.output_name, 'output.mp4');
});

test('webm 走 VP9/opus 路径', () => {
  const plan = buildNativeExportPlan(base({ format: 'webm' }));
  assert.equal(argAfter(plan.args, '-c:v'), 'libvpx-vp9');
  assert.equal(plan.output_name, 'output.webm');
});

test('无音轨：保留片段原声 map 0:a?，不建 filter_complex', () => {
  const plan = buildNativeExportPlan(base());
  assert.ok(plan.args.includes('0:a?'));
  assert.equal(plan.args.includes('-filter_complex'), false);
  assert.equal(plan.files.some((f) => f.name === 'subtitles.srt'), false);
});

test('BGM 独立轨：input1 + 音量/偏移 + 循环 + amix', () => {
  const plan = buildNativeExportPlan(base({ tracks: { bgm: { path: '/media/bgm.mp3', volume: 0.6, startOffset: 2, loop: true } } }));
  // input0 concat, input1 bgm（带 -stream_loop -1）
  const i1 = plan.args.indexOf('-i', 6);
  assert.equal(plan.args[i1 + 1], '/media/bgm.mp3');
  assert.ok(plan.args.includes('-stream_loop'));
  const fc = argAfter(plan.args, '-filter_complex');
  assert.match(fc, /\[1:a\]volume=0\.6,adelay=2000\|2000\[bgm\]/);
  assert.match(fc, /amix=inputs=1/);
  assert.ok(plan.args.includes('[aout]'));
  assert.ok(plan.args.includes('-shortest'));
});

test('台词配音独立轨：按 startSec adelay 并与 BGM 混音', () => {
  const plan = buildNativeExportPlan(base({
    tracks: {
      bgm: { path: '/media/bgm.mp3', volume: 0.5, startOffset: 0, loop: false },
      dialogue: [{ path: '/media/d0.wav', startSec: 5 }, { path: '/media/d1.wav', startSec: 12 }],
    },
  }));
  const fc = argAfter(plan.args, '-filter_complex');
  assert.match(fc, /\[2:a\]adelay=5000\|5000\[d0\]/);
  assert.match(fc, /\[3:a\]adelay=12000\|12000\[d1\]/);
  assert.match(fc, /\[bgm\]\[d0\]\[d1\]amix=inputs=3/);
});

test('字幕烧录：写 subtitles.srt 且 vf 追加 subtitles 滤镜', () => {
  const plan = buildNativeExportPlan(base({ tracks: { subtitles: [{ startTime: 0, endTime: 2.5, text: '你好' }] } }));
  const srt = plan.files.find((f) => f.name === 'subtitles.srt');
  assert.ok(srt);
  assert.match(srt.content, /00:00:00,000 --> 00:00:02,500/);
  assert.match(argAfter(plan.args, '-vf'), /subtitles=subtitles\.srt/);
});

test('SRT 时间戳跨分钟/小时进位正确', () => {
  const srt = buildSrt([{ startTime: 3661.25, endTime: 3662, text: 'x' }]);
  assert.match(srt, /01:01:01,250 --> 01:01:02,000/);
});