// 离线 AI 直连层（localAI）
//
// 桌面离线模式下，前端直接使用用户在「AI 模型配置」中保存的密钥，
// 按各厂商协议直连 HTTPS 端点完成 文本 / 出图 / 出视频 调用。
// 端点与请求体逻辑移植自原后端 customHandlers（seedream / seedance / kling / deepseek，backend 目录已删除）。
//
// CORS 回退：若浏览器内核（WebView）对某些端点存在跨域限制，则通过 Tauri Rust 命令
// `ai_proxy`（http 插件）代为转发；可灵 JWT 的 HS256 签名因涉及 SecretKey 一律走 Rust `kling_sign_jwt`。

import { isTauri, getApiBase } from './localApi';
import { listAIModelConfigs, AIModelConfig } from './localApi';
import type { HttpStep, PollSpec, TaskStep, TaskPlan } from './queueTypes';

export type AICategory = 'TEXT' | 'IMAGE' | 'VIDEO' | 'MULTIMODAL';

export interface OfflineModel extends AIModelConfig {
  type: AICategory;
  supportedAspectRatios: string[];
  /** 视频模型能力（仅 type==='VIDEO' 时填充） */
  videoCapability?: VideoModelCapability;
}

const DEFAULT_RATIOS_TEXT = ['16:9', '9:16', '1:1', '4:3', '3:4'];

// ==================== 视频模型能力表（数据源：火山方舟 Seedance model-list 文档） ====================

/** 视频模型可切换能力：分辨率 / 时长范围 / 输出格式（方舟 Seedance 帧率固定 24fps，不做切换） */
export interface VideoModelCapability {
  resolutions: string[];
  minDuration: number;
  maxDuration: number;
  formats: string[];
}

/** 保守默认（未知或其他 video 模型） */
export const DEFAULT_VIDEO_CAPABILITY: VideoModelCapability = {
  resolutions: ['480p', '720p', '1080p'],
  minDuration: 4,
  maxDuration: 12,
  formats: ['mp4'],
};

/**
 * 已知方舟视频模型能力映射（按 model_name 子串匹配）。
 * 顺序敏感：更具体的子型号（fast/mini/带日期后缀）须排在通用前缀之前，避免被误吞。
 */
const VIDEO_MODEL_CAPABILITIES: Array<{ match: string; capability: VideoModelCapability }> = [
  {
    match: 'seedance-2-5',
    capability: { resolutions: ['480p', '720p', '1080p'], minDuration: 4, maxDuration: 30, formats: ['mp4', 'mov'] },
  },
  {
    match: 'seedance-2-0-fast',
    capability: { resolutions: ['480p', '720p'], minDuration: 4, maxDuration: 15, formats: ['mp4'] },
  },
  {
    match: 'seedance-2-0-mini',
    capability: { resolutions: ['480p', '720p'], minDuration: 4, maxDuration: 15, formats: ['mp4'] },
  },
  {
    match: 'seedance-2-0-260128',
    capability: { resolutions: ['480p', '720p', '1080p', '4k'], minDuration: 4, maxDuration: 15, formats: ['mp4'] },
  },
  {
    match: 'seedance-1-0-pro-fast',
    capability: { resolutions: ['480p', '720p', '1080p'], minDuration: 2, maxDuration: 12, formats: ['mp4'] },
  },
  {
    match: 'seedance-1-0-pro',
    capability: { resolutions: ['480p', '720p', '1080p'], minDuration: 2, maxDuration: 12, formats: ['mp4'] },
  },
];

/** 依据模型名解析视频能力，命中已知方舟型号返回其能力，否则回退保守默认 */
export function getVideoModelCapabilities(modelName: string): VideoModelCapability {
  const n = (modelName || '').toLowerCase();
  const hit = VIDEO_MODEL_CAPABILITIES.find((e) => n.includes(e.match));
  return hit ? hit.capability : DEFAULT_VIDEO_CAPABILITY;
}

// ==================== 视频输出格式偏好（软件设置，localStorage 持久化） ====================

const VIDEO_OUTPUT_FORMAT_KEY = 'video_output_format';

/** 读取用户偏好的视频输出格式，默认 mp4 */
export function getPreferredVideoFormat(): string {
  try {
    const v = localStorage.getItem(VIDEO_OUTPUT_FORMAT_KEY);
    return v === 'mov' ? 'mov' : 'mp4';
  } catch {
    return 'mp4';
  }
}

/** 保存用户偏好的视频输出格式（仅接受 mp4/mov） */
export function setPreferredVideoFormat(fmt: string): void {
  try {
    localStorage.setItem(VIDEO_OUTPUT_FORMAT_KEY, fmt === 'mov' ? 'mov' : 'mp4');
  } catch {
    // ignore
  }
}

// ==================== 文件上传 API ====================

/** 文件上传响应 */
interface FileUploadResponse {
  id: string;
  object: 'file';
  bytes: number;
  created_at: number;
  filename: string;
  purpose: string;
  expires_at?: number;
}

/**
 * 上传文件到 AI 服务（DeepSeek / 豆包等）
 * @param file 文件对象
 * @param model 模型配置
 * @returns file_id
 */
export async function uploadFileToAI(file: File, model: OfflineModel): Promise<string> {
  const base = getApiBase(model);
  const apiKey = model.api_key;
  
  if (!apiKey) {
    throw new Error('API Key 未配置');
  }

  // 构建 FormData
  const formData = new FormData();
  formData.append('file', file);
  formData.append('purpose', 'user_data'); // DeepSeek 使用 user_data

  // 根据提供商选择上传端点
  const provider = model.provider.toLowerCase();
  let uploadUrl = '';
  
  if (provider.includes('deepseek')) {
    uploadUrl = `${base}/files`;
  } else if (provider.includes('doubao') || provider.includes('volces')) {
    uploadUrl = `${base}/files`;
  } else {
    throw new Error(`提供商 ${model.provider} 暂不支持文件上传`);
  }

  try {
    const response = await fetch(uploadUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
      },
      body: formData,
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`文件上传失败: ${response.status} ${error}`);
    }

    const data: FileUploadResponse = await response.json();
    return data.id;
  } catch (error: any) {
    console.error('[File Upload] 上传失败:', error);
    throw new Error(`文件上传失败: ${error.message}`);
  }
}

/**
 * 判断是否应该使用文件上传 API（而不是 Base64）
 * @param file 文件对象
 * @param model 模型配置
 * @returns 是否使用文件上传
 */
export function shouldUseFileUpload(file: File, model: OfflineModel): boolean {
  const provider = model.provider.toLowerCase();
  
  // 只有 DeepSeek 和豆包支持文件上传
  const supportsUpload = provider.includes('deepseek') || provider.includes('doubao') || provider.includes('volces');
  if (!supportsUpload) return false;

  // 文件大于 5MB 时使用文件上传
  const MAX_BASE64_SIZE = 5 * 1024 * 1024; // 5MB
  return file.size > MAX_BASE64_SIZE;
}

/** 依据模型名/提供商推断能力类别（Ark 同域下靠模型名区分 文本/图/视频） */
export function inferCategory(modelName: string, provider: string): AICategory {
  const n = (modelName || '').toLowerCase();
  const p = (provider || '').toLowerCase();
  
  // IMAGE 模型
  if (n.includes('seedream') || /(^|[^a-z])image([^a-z]|$)/.test(n) || n.includes('t2i') || n.includes('i2i') || n.includes('dall-e')) return 'IMAGE';
  
  // VIDEO 模型
  if (n.includes('seedance') || p.includes('kling') || n.includes('video') || n.includes('i2v') || n.includes('t2v') || n.includes('sora') || n.includes('cogvideo') || n.includes('vidu')) return 'VIDEO';
  
  // MULTIMODAL 模型（支持文本+图像/视频输入）
  if (
    n.includes('vision') || 
    n.includes('multimodal') || 
    n.includes('-vl') || 
    n.includes('imageunderstanding') ||
    n.includes('reasoner') || // DeepSeek Reasoner 是多模态模型
    n.includes('gpt-4o') || // GPT-4o 系列是多模态
    n.includes('gpt-4-vision') ||
    n.includes('glm-4v') || // 智谱 GLM-4V 系列
    n.includes('qwen-vl') // 通义千问 VL 系列
  ) return 'MULTIMODAL';
  
  // 默认为 TEXT 模型
  return 'TEXT';
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
        videoCapability: type === 'VIDEO' ? getVideoModelCapabilities(c.model_name) : undefined,
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
      if (c.type === 'image_url') {
        // 已是 OpenAI image_url 形状，原样透传
        return { type: 'image_url', image_url: { url: c.image_url?.url || c.url || '' } };
      }
      if (c.type === 'file') {
        // DeepSeek 文件引用：{ type:'file', file_id } 原样透传
        if (c.file_id) return { type: 'file', file_id: c.file_id };
        return c;
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
  const base = getApiBase(opts.model);
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
  const base = getApiBase(model);
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
  const base = getApiBase(opts.model);
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
  /** 实际使用的输出格式 */
  formatUsed?: string;
  /** 用户偏好格式不被模型支持，已自动降级 */
  formatDowngraded?: boolean;
}

function buildSeedanceContent(prompt: string, firstFrame?: string, lastFrame?: string) {
  const content: any[] = [];
  if (prompt) content.push({ type: 'text', text: prompt });
  if (firstFrame) content.push({ type: 'image_url', image_url: { url: firstFrame }, role: 'first_frame' });
  if (lastFrame) content.push({ type: 'image_url', image_url: { url: lastFrame }, role: 'last_frame' });
  return content;
}

/** 火山方舟图生视频仅接受公网 URL / Base64 / 资产 ID；工程内的本地帧需转成 data URL。 */
const ARK_IMAGE_MAX_BYTES = 20 * 1024 * 1024;

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

/** 本地图片转 data URL：Tauri 下直读文件（绕开 CSP/CORS），浏览器下回退 fetch */
async function localImageToDataUrl(src: string): Promise<string> {
  if (isTauri()) {
    const path = assetUrlToPath(src);
    if (path) {
      try {
        const { invoke } = await import('@tauri-apps/api/core');
        return await invoke<string>('read_media_data_url', { path });
      } catch (err) {
        console.warn('[localAI] 本地帧直读失败，尝试通过 URL 读取:', err);
      }
    }
  }
  const res = await fetch(src);
  if (!res.ok) throw new Error(`本地帧读取失败（HTTP ${res.status}），无法提交视频任务`);
  const blob = await res.blob();
  if (!blob.size) throw new Error('本地参考帧为空，无法提交视频任务');
  if (blob.size > ARK_IMAGE_MAX_BYTES) throw new Error('本地参考帧超过 20MB，无法提交视频任务');

  const mime = blob.type && blob.type.startsWith('image/') ? blob.type : 'image/png';
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = '';
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return `data:${mime};base64,${btoa(binary)}`;
}

async function toArkImageInput(src?: string): Promise<string | undefined> {
  if (!src) return undefined;
  if (/^data:/i.test(src)) return src;
  // 公网图片直接交给方舟拉取；本地 asset/blob（含 Windows asset.localhost）需内联
  const isLocal = /^(asset:|blob:|file:|https?:\/\/asset\.localhost)/i.test(src);
  if (!isLocal) return src;
  return localImageToDataUrl(src);
}

/** 依模型能力归一化视频参数：时长钳制、分辨率校验、2.5 首尾帧 ratio 仅支持 adaptive。 */
function normalizeVideoRequest(
  model: OfflineModel,
  opts: { duration?: number; aspectRatio?: string; resolution?: string },
  capability: VideoModelCapability,
) {
  const duration = typeof opts.duration === 'number' && opts.duration > 0
    ? Math.min(capability.maxDuration, Math.max(capability.minDuration, Math.round(opts.duration)))
    : undefined;
  const resolution = opts.resolution
    ? (capability.resolutions.includes(opts.resolution)
      ? opts.resolution
      : capability.resolutions.includes('720p') ? '720p' : capability.resolutions[0])
    : undefined;
  return { duration, resolution, isSeedance25: /seedance-2-5/i.test(model.model_name || '') };
}

/** 组装方舟视频生成请求体；首尾帧在提交前转为方舟可读取的格式。 */
async function buildArkVideoBody(
  model: OfflineModel,
  opts: { prompt: string; firstFrame?: string; lastFrame?: string; duration?: number; aspectRatio?: string; resolution?: string },
  capability: VideoModelCapability,
  effectiveFormat: string,
): Promise<Record<string, unknown>> {
  const { duration, resolution, isSeedance25 } = normalizeVideoRequest(model, opts, capability);
  const [firstFrame, lastFrame] = await Promise.all([
    toArkImageInput(opts.firstFrame),
    toArkImageInput(opts.lastFrame),
  ]);
  const submitBody: Record<string, unknown> = {
    model: model.model_name,
    content: buildSeedanceContent(opts.prompt, firstFrame, lastFrame),
  };
  if (duration) submitBody.duration = duration;
  // Seedance 2.5 首帧/首尾帧任务的 ratio 仅支持 adaptive，传入具体比例会被强校验拒绝
  if (isSeedance25 && (opts.firstFrame || opts.lastFrame)) submitBody.ratio = 'adaptive';
  else if (opts.aspectRatio) submitBody.ratio = opts.aspectRatio;
  if (resolution) submitBody.resolution = resolution;
  // output_format 为 Seedance 2.5 的新字段；2.0/1.0 无此参数，不能传旧的 format
  if (isSeedance25 && capability.formats.includes(effectiveFormat)) submitBody.output_format = effectiveFormat;
  return submitBody;
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
    if (s.status === 'failed' || s.status === 'error' || s.status === 'expired' || s.status === 'cancelled') {
      throw new Error(s.error || (s.status === 'expired' ? '视频生成超时（服务端任务已过期）' : '视频生成失败'));
    }
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
  format?: string;
  onProgress?: (p: number) => void;
}): Promise<VideoResult> {
  const { model } = opts;
  const base = getApiBase(model);

  // 输出格式：用户偏好（或显式传入）→ 按模型能力校验，不支持则降级 mp4
  const capability = model.videoCapability || getVideoModelCapabilities(model.model_name);
  const preferredFormat = opts.format || getPreferredVideoFormat();
  const formatDowngraded = !capability.formats.includes(preferredFormat);
  const effectiveFormat = formatDowngraded ? 'mp4' : preferredFormat;

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
    return { url, formatUsed: effectiveFormat, formatDowngraded };
  }

  // ---- Ark / Seedance（含 doubao 视频）----
  const submitBody = await buildArkVideoBody(model, opts, capability, effectiveFormat);

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
  return { url, formatUsed: effectiveFormat, formatDowngraded };
}

// ==================== Rust 任务队列：声明式计划构造器 ====================
// 把上面 generateVideo/generateImage/chatText 的厂商请求逻辑，转成交给 Rust worker 执行的 TaskPlan。
// Rust 只做通用「提交 → 轮询 → 取值 → 成品落地」，厂商知识保留在此处。

const VIDEO_POLL_INTERVAL_MS = 5000;
const VIDEO_POLL_MAX_INTERVAL_MS = 15000;
const VIDEO_POLL_TIMEOUT_MS = 12 * 60 * 1000;

/** 视频成品 URL 在 result_data 中的字段别名（与旧 localWorkflow.runVideo 保持一致） */
const VIDEO_RESULT_ALIASES = ['video_url', 'videoUrl', 'url'];

/** 构造视频任务计划（Ark / 可灵）：提交 + 轮询 + 成品落地；含输出格式能力校验与降级 */
export async function buildVideoTaskPlan(
  model: OfflineModel,
  opts: {
    prompt: string;
    firstFrame?: string;
    lastFrame?: string;
    duration?: number;
    aspectRatio?: string;
    resolution?: string;
    format?: string;
  },
): Promise<TaskPlan> {
  const base = getApiBase(model);
  const capability = model.videoCapability || getVideoModelCapabilities(model.model_name);
  const preferredFormat = opts.format || getPreferredVideoFormat();
  const formatDowngraded = !capability.formats.includes(preferredFormat);
  const effectiveFormat = formatDowngraded ? 'mp4' : preferredFormat;
  const staticResult = { formatUsed: effectiveFormat, formatDowngraded };

  // ---- 可灵：Authorization 用 {{KLING_SIGN:<apiKey>}} 标记，由 Rust 注入 Bearer JWT ----
  if ((model.provider || '').toLowerCase().includes('kling')) {
    const mode = opts.firstFrame ? 'image2video' : 'text2video';
    const authHeader = `{{KLING_SIGN:${model.api_key}}}`;
    const submitBody: Record<string, unknown> = {
      model_name: model.model_name || 'kling-v1',
      prompt: opts.prompt,
      duration: String(opts.duration || 5),
      aspect_ratio: opts.aspectRatio || '16:9',
    };
    if (opts.firstFrame) submitBody.image = opts.firstFrame;
    if (opts.lastFrame) submitBody.tail_image = opts.lastFrame;
    const submit: HttpStep = {
      url: `${base}/v1/videos/${mode}`,
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: authHeader },
      body: JSON.stringify(submitBody),
    };
    const poll: PollSpec = {
      urlTemplate: `${base}/v1/videos/${mode}/{task_id}`,
      method: 'GET',
      headers: { Authorization: authHeader },
      statusPaths: ['data.task_status'],
      successValues: ['succeed'],
      failValues: ['failed'],
      errorPaths: ['message'],
      progressMid: 50,
      intervalMs: VIDEO_POLL_INTERVAL_MS,
      maxIntervalMs: VIDEO_POLL_MAX_INTERVAL_MS,
      timeoutMs: VIDEO_POLL_TIMEOUT_MS,
    };
    return {
      kind: 'video',
      modelName: model.model_name,
      staticResult,
      steps: [{
        submit,
        extractTaskIdPaths: ['data.task_id'],
        poll,
        extract: { mode: 'media', urlPaths: ['data.task_result.videos.0.url'], b64Paths: [], nameHint: 'video', aliases: VIDEO_RESULT_ALIASES },
      }],
    };
  }

  // ---- Ark / Seedance（含 doubao 视频）----
  const submitBody = await buildArkVideoBody(model, opts, capability, effectiveFormat);
  const authHeader = `Bearer ${model.api_key}`;
  const submit: HttpStep = {
    url: `${base}/contents/generations/tasks`,
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: authHeader },
    body: JSON.stringify(submitBody),
  };
  const poll: PollSpec = {
    urlTemplate: `${base}/contents/generations/tasks/{task_id}`,
    method: 'GET',
    headers: { Authorization: authHeader },
    statusPaths: ['status'],
    successValues: ['succeeded', 'completed', 'done'],
    failValues: ['failed', 'error', 'expired', 'cancelled'],
    errorPaths: ['error.message'],
    progressMid: 55,
    intervalMs: VIDEO_POLL_INTERVAL_MS,
    maxIntervalMs: VIDEO_POLL_MAX_INTERVAL_MS,
    timeoutMs: VIDEO_POLL_TIMEOUT_MS,
  };
  return {
    kind: 'video',
    modelName: model.model_name,
    staticResult,
    steps: [{
      submit,
      extractTaskIdPaths: ['id'],
      poll,
      extract: { mode: 'media', urlPaths: ['content.video_url', 'video_url'], b64Paths: [], nameHint: 'video', aliases: VIDEO_RESULT_ALIASES },
    }],
  };
}

/** 构造图片任务步骤（seedream 系）：单请求 + 成品落地；结果字段别名与旧 runImage 一致 */
export function buildImageTaskStep(
  model: OfflineModel,
  opts: { prompt: string; refImageUrls?: string[]; aspectRatio?: string; nameHint?: string; aliases?: string[] },
): TaskStep {
  const base = getApiBase(model);
  const body: Record<string, unknown> = {
    model: model.model_name,
    prompt: opts.prompt,
    response_format: 'url',
    watermark: false,
  };
  const size = sizeFromRatio(opts.aspectRatio, 1024 * 1024);
  if (size) body.size = size;
  const imgs = (opts.refImageUrls || []).filter(Boolean);
  if (imgs.length && !/t2i/i.test(model.model_name)) body.image = imgs;
  return {
    submit: {
      url: `${base}/images/generations`,
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${model.api_key}` },
      body: JSON.stringify(body),
    },
    extract: {
      mode: 'media',
      urlPaths: ['data.0.url'],
      b64Paths: ['data.0.b64_json'],
      nameHint: opts.nameHint || 'frame',
      aliases: opts.aliases || ['imageUrl', 'image_url', 'first_frame_url', 'firstFrameUrl', 'url'],
    },
  };
}

/** 构造文本对话的 HttpStep（供提示词优化等复用；messages 走 toOpenAiContent 归一） */
export function buildChatHttpStep(
  model: OfflineModel,
  messages: Array<{ role: string; content: unknown }>,
  temperature?: number,
): HttpStep {
  const base = getApiBase(model);
  return {
    url: `${base}/chat/completions`,
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${model.api_key}` },
    body: JSON.stringify({
      model: model.model_name,
      messages: messages.map((m) => ({ role: m.role, content: toOpenAiContent(m.content) })),
      temperature: temperature ?? 0.7,
      stream: false,
    }),
  };
}


