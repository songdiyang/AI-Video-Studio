// 离线 AI 直连层（localAI）
//
// 桌面离线模式下，前端直接使用用户在「AI 模型配置」中保存的密钥，
// 按各厂商协议直连 HTTPS 端点完成 文本 / 出图 / 出视频 调用。
// 端点与请求体逻辑移植自 backend/src/customHandlers（seedream / seedance / kling / deepseek）。
//
// CORS 回退：若浏览器内核（WebView）对某些端点存在跨域限制，则通过 Tauri Rust 命令
// `ai_proxy`（http 插件）代为转发；可灵 JWT 的 HS256 签名因涉及 SecretKey 一律走 Rust `kling_sign_jwt`。

import { isTauri } from './localApi';
import { listAIModelConfigs, DEFAULT_API_BASES, AIModelConfig } from './localApi';

export type AICategory = 'TEXT' | 'IMAGE' | 'VIDEO' | 'MULTIMODAL';

export interface OfflineModel extends AIModelConfig {
  type: AICategory;
  supportedAspectRatios: string[];
}

const DEFAULT_RATIOS_TEXT = ['16:9', '9:16', '1:1', '4:3', '3:4'];

/** 依据模型名/提供商推断能力类别（Ark 同域下靠模型名区分 文本/图/视频） */
export function inferCategory(modelName: string, provider: string): AICategory {
  const n = (modelName || '').toLowerCase();
  const p = (provider || '').toLowerCase();
  if (n.includes('seedream') || /(^|[^a-z])image([^a-z]|$)/.test(n) || n.includes('t2i') || n.includes('i2i')) return 'IMAGE';
  if (n.includes('seedance') || p.includes('kling') || n.includes('video') || n.includes('i2v') || n.includes('t2v') || n.includes('sora') || n.includes('cogvideo')) return 'VIDEO';
  if (n.includes('vision') || n.includes('multimodal') || n.includes('-vl') || n.includes('imageunderstanding')) return 'MULTIMODAL';
  return 'TEXT';
}

function apiBaseFor(cfg: AIModelConfig): string {
  return (cfg.api_base || DEFAULT_API_BASES[cfg.provider] || '').replace(/\/$/, '');
}

/** 获取离线可用模型目录（由用户本地已保存且启用的配置推导） */
export async function getOfflineModels(): Promise<OfflineModel[]> {
  const configs = await listAIModelConfigs();
  return configs
    .filter((c) => c.enabled !== false && c.api_key)
    .map((c) => {
      const type = inferCategory(c.model_name, c.provider);
      return {
        ...c,
        type,
        supportedAspectRatios: type === 'TEXT' ? [] : DEFAULT_RATIOS_TEXT,
      };
    });
}

/** 按模型名解析配置（跨 provider 唯一名匹配，其次 model_name 子串匹配） */
export async function resolveModel(modelName: string): Promise<OfflineModel | null> {
  const models = await getOfflineModels();
  if (!modelName) return models[0] || null;
  return (
    models.find((m) => m.model_name === modelName) ||
    models.find((m) => m.model_name.toLowerCase().includes(modelName.toLowerCase())) ||
    models.find((m) => modelName.toLowerCase().includes(m.model_name.toLowerCase())) ||
    null
  );
}

// ==================== HTTP 传输（直连 or ai_proxy 回退） ====================

export interface VendorRequest {
  url: string;
  method: string;
  headers: Record<string, string>;
  body?: unknown;
}

/** 发起对厂商的 HTTP 调用；Tauri 下优先用 Rust ai_proxy 规避 CORS，失败再直连。 */
async function vendorFetch(req: VendorRequest): Promise<any> {
  const payload = {
    url: req.url,
    method: req.method,
    headers: req.headers,
    body: req.body !== undefined ? JSON.stringify(req.body) : undefined,
  };

  if (isTauri()) {
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      const res: any = await invoke('ai_proxy', { req: payload });
      // Rust 侧返回 { status, body(text) }
      const status = res?.status ?? 200;
      const text = typeof res?.body === 'string' ? res.body : JSON.stringify(res?.body ?? null);
      let data: any = null;
      try {
        data = text ? JSON.parse(text) : null;
      } catch {
        data = text;
      }
      if (status >= 200 && status < 300) return data;
      throw new Error(extractErrorMessage(data) || `HTTP ${status}`);
    } catch (err: any) {
      // ai_proxy 命令未实现（旧构建）→ 回退浏览器直连
      if (/ai_proxy|command not found|unknown command/i.test(err?.message || '')) {
        return directFetch(req);
      }
      throw err;
    }
  }
  return directFetch(req);
}

async function directFetch(req: VendorRequest): Promise<any> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 180000);
  try {
    const res = await fetch(req.url, {
      method: req.method,
      headers: req.headers,
      body: req.body !== undefined ? JSON.stringify(req.body) : undefined,
      signal: controller.signal,
    });
    const text = await res.text();
    let data: any = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = text;
    }
    if (!res.ok) throw new Error(extractErrorMessage(data) || `HTTP ${res.status}`);
    return data;
  } catch (err: any) {
    if (err?.name === 'AbortError') throw new Error('AI 请求超时（180秒）');
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

function extractErrorMessage(data: any): string | null {
  if (!data) return null;
  if (typeof data === 'string') return data.slice(0, 200);
  return data?.error?.message || data?.message || data?.msg || null;
}

// ==================== 可灵 JWT（Rust 签名） ====================
async function klingAuth(apiKey: string): Promise<string> {
  if (!isTauri()) {
    throw new Error('可灵 API 需在桌面端通过本地 Rust 命令签名 JWT');
  }
  const { invoke } = await import('@tauri-apps/api/core');
  return (await invoke('kling_sign_jwt', { apiKey })) as string;
}

// ==================== 文本对话 ====================
export interface ChatResult {
  content: string;
  usage?: { input_tokens: number; output_tokens: number; total_tokens: number } | null;
}

/** 把内部消息 content（字符串或多模态数组）转为 OpenAI chat/completions 的 content 形状 */
function toOpenAiContent(content: unknown): unknown {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content.map((c: any) => {
      if (c.type === 'input_image' || c.type === 'image') {
        return { type: 'image_url', image_url: { url: c.image_url || c.url || '' } };
      }
      if (c.type === 'input_text' || c.type === 'text') {
        return { type: 'text', text: c.text || '' };
      }
      return { type: 'text', text: typeof c === 'string' ? c : JSON.stringify(c) };
    });
  }
  return String(content ?? '');
}

function extractUsageFromData(data: any): ChatResult['usage'] {
  const u = data?.usage;
  if (!u) return null;
  const input = u.prompt_tokens || u.input_tokens || 0;
  const output = u.completion_tokens || u.output_tokens || 0;
  return { input_tokens: input, output_tokens: output, total_tokens: u.total_tokens || input + output };
}

export async function chatText(opts: {
  model: OfflineModel;
  messages: Array<{ role: string; content: unknown }>;
  temperature?: number;
}): Promise<ChatResult> {
  const base = apiBaseFor(opts.model);
  const url = `${base}/chat/completions`;
  const data = await vendorFetch({
    url,
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${opts.model.api_key}` },
    body: {
      model: opts.model.model_name,
      messages: opts.messages.map((m) => ({ role: m.role, content: toOpenAiContent(m.content) })),
      temperature: opts.temperature ?? 0.7,
      stream: false,
    },
  });
  const content =
    data?.choices?.[0]?.message?.content ?? data?.output_text ?? '';
  return { content, usage: extractUsageFromData(data) };
}

/**
 * 流式文本对话（SSE）。
 * 必须走 WebView 直连 fetch（ai_proxy 返回整体 body，不支持流），
 * 逐块回调 onDelta / onReasoning，返回累计文本。
 */
export async function chatTextStream(opts: {
  model: OfflineModel;
  messages: Array<{ role: string; content: unknown }>;
  temperature?: number;
  signal?: AbortSignal;
  onDelta?: (text: string) => void;
  onReasoning?: (text: string) => void;
}): Promise<ChatResult> {
  const { model } = opts;
  const base = apiBaseFor(model);
  const url = `${base}/chat/completions`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${model.api_key}` },
    signal: opts.signal,
    body: JSON.stringify({
      model: model.model_name,
      messages: opts.messages.map((m) => ({ role: m.role, content: toOpenAiContent(m.content) })),
      temperature: opts.temperature ?? 0.7,
      stream: true,
    }),
  });
  if (!res.ok || !res.body) {
    const errText = await res.text().catch(() => '');
    throw new Error(extractErrorMessage(errText) || `API 请求失败 (${res.status})`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder('utf-8');
  let buffer = '';
  let fullContent = '';
  let usage: ChatResult['usage'] = null;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    // SSE 事件以 \n\n 分隔
    let boundary = buffer.indexOf('\n\n');
    while (boundary !== -1) {
      const block = buffer.slice(0, boundary);
      buffer = buffer.slice(boundary + 2);
      let dataLine = '';
      for (const line of block.split('\n')) {
        if (line.startsWith('data: ')) dataLine = line.slice(6);
      }
      if (dataLine && dataLine !== '[DONE]') {
        try {
          const parsed = JSON.parse(dataLine);
          const delta = parsed?.choices?.[0]?.delta?.content || '';
          const reasoning = parsed?.choices?.[0]?.delta?.reasoning_content || '';
          if (delta) {
            fullContent += delta;
            opts.onDelta?.(delta);
          }
          if (reasoning) opts.onReasoning?.(reasoning);
          if (parsed?.usage) usage = extractUsageFromData(parsed);
        } catch {
          // 忽略非 JSON 行
        }
      }
      boundary = buffer.indexOf('\n\n');
    }
  }
  return { content: fullContent, usage };
}

// ==================== 文生图 / 图生图 ====================
export interface ImageResult {
  url: string | null;
  b64: string | null;
}

/** aspectRatio → 满足最低像素的 WxH（移植 seedream 逻辑，min 1024x1024 起） */
function sizeFromRatio(aspectRatio: string | undefined, minPixels: number): string | undefined {
  if (!aspectRatio) return undefined;
  const m = /^(\d+):(\d+)$/.exec(aspectRatio);
  if (!m) return undefined;
  const rw = parseInt(m[1]);
  const rh = parseInt(m[2]);
  const k = Math.ceil(Math.sqrt(minPixels / (rw * rh)));
  let w = Math.ceil((rw * k) / 8) * 8;
  let h = Math.ceil((rh * k) / 8) * 8;
  return `${w}x${h}`;
}

export async function generateImage(opts: {
  model: OfflineModel;
  prompt: string;
  refImageUrls?: string[];
  aspectRatio?: string;
}): Promise<ImageResult> {
  const base = apiBaseFor(opts.model);
  const body: Record<string, unknown> = {
    model: opts.model.model_name,
    prompt: opts.prompt,
    response_format: 'url',
    watermark: false,
  };
  const size = sizeFromRatio(opts.aspectRatio, 1024 * 1024);
  if (size) body.size = size;
  const imgs = (opts.refImageUrls || []).filter(Boolean);
  if (imgs.length && !/t2i/i.test(opts.model.model_name)) body.image = imgs;

  const data = await vendorFetch({
    url: `${base}/images/generations`,
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${opts.model.api_key}` },
    body,
  });
  const item = data?.data?.[0];
  return { url: item?.url || null, b64: item?.b64_json || null };
}

// ==================== 图生视频（提交 + 轮询） ====================
export interface VideoResult {
  url: string;
}

function buildSeedanceContent(prompt: string, firstFrame?: string, lastFrame?: string) {
  const content: any[] = [];
  if (prompt) content.push({ type: 'text', text: prompt });
  if (firstFrame) content.push({ type: 'image_url', image_url: { url: firstFrame }, role: 'first_frame' });
  if (lastFrame) content.push({ type: 'image_url', image_url: { url: lastFrame }, role: 'last_frame' });
  return content;
}

async function pollUntilDone(fetchStatus: () => Promise<{ status: string; url?: string; error?: string }>, timeoutMs = 9 * 60 * 1000): Promise<string> {
  const start = Date.now();
  // 自适应轮询：先 3s，逐步到 10s
  let delay = 3000;
  while (Date.now() - start < timeoutMs) {
    const s = await fetchStatus();
    if (s.status === 'succeeded' || s.status === 'completed' || s.status === 'done') {
      if (!s.url) throw new Error('视频生成完成但未返回地址');
      return s.url;
    }
    if (s.status === 'failed' || s.status === 'error') throw new Error(s.error || '视频生成失败');
    await new Promise((r) => setTimeout(r, delay));
    delay = Math.min(10000, delay + 1000);
  }
  throw new Error('视频生成超时');
}

export async function generateVideo(opts: {
  model: OfflineModel;
  prompt: string;
  firstFrame?: string;
  lastFrame?: string;
  duration?: number;
  aspectRatio?: string;
  resolution?: string;
  onProgress?: (p: number) => void;
}): Promise<VideoResult> {
  const { model } = opts;
  const base = apiBaseFor(model);

  // ---- 可灵 ----
  if ((model.provider || '').toLowerCase().includes('kling')) {
    const token = await klingAuth(model.api_key);
    const mode = opts.firstFrame ? 'image2video' : 'text2video';
    const submitBody: Record<string, unknown> = {
      model_name: model.model_name || 'kling-v1',
      prompt: opts.prompt,
      duration: String(opts.duration || 5),
      aspect_ratio: opts.aspectRatio || '16:9',
    };
    if (opts.firstFrame) submitBody.image = opts.firstFrame;
    if (opts.lastFrame) submitBody.tail_image = opts.lastFrame;
    const submit = await vendorFetch({
      url: `${base}/v1/videos/${mode}`,
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: submitBody,
    });
    const taskId = submit?.data?.task_id;
    if (!taskId) throw new Error('可灵任务提交失败：未返回 task_id');
    const url = await pollUntilDone(async () => {
      const q = await vendorFetch({
        url: `${base}/v1/videos/${mode}/${taskId}`,
        method: 'GET',
        headers: { Authorization: `Bearer ${token}` },
      });
      const st = q?.data?.task_status;
      const videoUrl = q?.data?.task_result?.videos?.[0]?.url;
      opts.onProgress?.(st === 'PROCESSING' ? 50 : 20);
      return {
        status: st === 'SUCCEED' ? 'succeeded' : st === 'FAILED' ? 'failed' : 'running',
        url: videoUrl,
        error: q?.message,
      };
    });
    return { url };
  }

  // ---- Ark / Seedance（含 doubao 视频）----
  const content = buildSeedanceContent(opts.prompt, opts.firstFrame, opts.lastFrame);
  const submitBody: Record<string, unknown> = {
    model: model.model_name,
    content,
  };
  if (opts.duration) submitBody.duration = opts.duration;
  if (opts.aspectRatio) submitBody.ratio = opts.aspectRatio;
  if (opts.resolution) submitBody.resolution = opts.resolution;

  const submit = await vendorFetch({
    url: `${base}/contents/generations/tasks`,
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${model.api_key}` },
    body: submitBody,
  });
  const taskId = submit?.id;
  if (!taskId) throw new Error('视频任务提交失败：未返回任务 ID');
  const url = await pollUntilDone(async () => {
    const q = await vendorFetch({
      url: `${base}/contents/generations/tasks/${taskId}`,
      method: 'GET',
      headers: { Authorization: `Bearer ${model.api_key}` },
    });
    const st = (q?.status || '').toLowerCase();
    opts.onProgress?.(st === 'running' ? 55 : st === 'succeeded' ? 100 : 25);
    return { status: st, url: q?.content?.video_url || q?.video_url, error: q?.error?.message };
  });
  return { url };
}

export { apiBaseFor };
