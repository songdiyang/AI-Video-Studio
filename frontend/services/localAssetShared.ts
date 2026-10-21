// 资产域本地化共享助手（localAssetShared）
//
// 各资产域（角色/场景/建筑/环境/服装/影棚/元素…）的生成/分析端点在本地复用同一套：
//  - 文本模型选择 + chatText 产出结构化 JSON（提示词生成、抽取、清洗、识别等）
//  - 图片模型选择 + generateImage + persistGeneratedMedia（落地工程 media/）
//  - 资产文档读写（沿用 localStore 文档 + localRest 的 RestDoc 形状）
//  - 提交资产生成作业（localAssetJobs，非阻塞 + 完成回写）

import { readDoc, writeDoc, getActiveProjectPath, resolveLocalPath, projectIdForPath, type LocalDocName } from './localStore';
import { resolveModel, getOfflineModels, chatText, generateImage, type OfflineModel } from './localAI';
import { persistGeneratedMedia } from './localMedia';
import { submitAssetGeneration } from './localAssetJobs';
import type { RestDoc } from './localRest';

const EMPTY_DOC: RestDoc = { nextId: 1, items: [] };

export function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

/** camelCase 顶层键 → snake_case */
export function camelToSnake(key: string): string {
  return key.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);
}

export function normalizeKeys(body: Record<string, any> | null | undefined): Record<string, any> {
  const out: Record<string, any> = {};
  for (const [k, v] of Object.entries(body || {})) out[camelToSnake(k)] = v;
  return out;
}

// ==================== 工程路径 ====================
export function activePath(): string | null {
  return getActiveProjectPath();
}

/**
 * 解析请求归属的工程路径：显式 projectId 优先（对齐 localRest.resolvePath 模式），
 * 无有效 projectId 时兜底活动工程。防止切换工程后在途请求把数据写进新工程。
 */
export async function resolvePath(projectId?: number | string | null): Promise<string | null> {
  const id = Number(projectId);
  if (Number.isFinite(id) && id > 0) {
    const p = await resolveLocalPath(id);
    if (p) return p;
  }
  return getActiveProjectPath();
}

/**
 * 归属校验：条目带 project_id 且解析出的工程路径能反查到工程 id 时，两者必须一致。
 * 不一致说明跨工程 ID 碰撞（各工程文档独立自增序列），调用方应拒绝写入返回 404。
 * 条目无 project_id 或路径反查失败则放行（宽容，避免误伤历史数据）。
 */
export function assertProject(item: any, projectPath: string | null): boolean {
  if (!item || !projectPath) return true;
  const itemProjectId = Number(item.project_id);
  if (!Number.isFinite(itemProjectId) || itemProjectId <= 0) return true;
  const pathProjectId = projectIdForPath(projectPath);
  if (pathProjectId === null) return true;
  return itemProjectId === pathProjectId;
}

// ==================== 文档读写 ====================
export async function loadRestDoc(path: string, doc: LocalDocName): Promise<RestDoc> {
  const raw = await readDoc<Partial<RestDoc>>(path, doc, {});
  const items = Array.isArray(raw.items) ? raw.items : [];
  const maxId = items.reduce((mx: number, it: any) => Math.max(mx, Number(it?.id) || 0), 0);
  return { nextId: Math.max(Number(raw.nextId) || 1, maxId + 1), items };
}

export function saveRestDoc(path: string, doc: LocalDocName, value: RestDoc): void {
  writeDoc(path, doc, value);
}

/** 在指定文档中按 id 找条目（数字 id 宽松比较） */
export function findById(items: any[], id: number | string): any | undefined {
  const n = Number(id);
  return items.find((it) => Number(it?.id) === n);
}

// ==================== 模型选择 ====================
export async function pickTextModel(preferred?: string): Promise<OfflineModel | null> {
  if (preferred) {
    const m = await resolveModel(preferred);
    if (m && (m.type === 'TEXT' || m.type === 'MULTIMODAL')) return m;
  }
  const all = await getOfflineModels();
  return all.find((m) => m.type === 'TEXT') || all.find((m) => m.type === 'MULTIMODAL') || null;
}

export async function pickImageModel(preferred?: string): Promise<OfflineModel | null> {
  if (preferred) {
    const m = await resolveModel(preferred);
    if (m && m.type === 'IMAGE') return m;
  }
  const all = await getOfflineModels();
  return all.find((m) => m.type === 'IMAGE') || null;
}

// ==================== 结构化文本产出 ====================
/** 从可能含代码围栏/前后缀的模型输出中提取第一个 JSON 对象 */
export function extractJsonObject(text: string): any | null {
  if (!text) return null;
  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(text);
  const candidate = fenced ? fenced[1] : text;
  const start = candidate.indexOf('{');
  const end = candidate.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) return null;
  try {
    return JSON.parse(candidate.slice(start, end + 1));
  } catch {
    return null;
  }
}

/** 调用文本模型，要求返回 JSON；解析失败返回 null。 */
export async function chatJson(model: OfflineModel, system: string, user: string): Promise<any | null> {
  const { content } = await chatText({
    model,
    temperature: 0.5,
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ],
  });
  return extractJsonObject(content);
}

// ==================== 出图并落地 ====================
/**
 * 生成一张图片并落地到工程 media/，返回本地可离线访问的 URL。
 * 无可用图片模型 / 无提示词 / 厂商未返回地址时抛错（使作业显式失败）。
 */
export async function genImageToUrl(opts: {
  imageModel?: string;
  prompt: string;
  projectId: number;
  nameHint?: string;
  refImageUrls?: string[];
  aspectRatio?: string;
}): Promise<string> {
  const model = await pickImageModel(opts.imageModel);
  if (!model) throw new Error('未找到可用的图片生成模型，请在「设置 › 模型」中配置');
  const prompt = (opts.prompt || '').trim();
  if (!prompt) throw new Error('缺少图片生成提示词');
  const { url, b64 } = await generateImage({
    model,
    prompt,
    refImageUrls: opts.refImageUrls,
    aspectRatio: opts.aspectRatio,
  });
  const raw = url || (b64 ? `data:image/png;base64,${b64}` : null);
  if (!raw) throw new Error('图片生成成功但未返回地址');
  return await persistGeneratedMedia(opts.projectId, raw, opts.nameHint);
}

/**
 * 提交一个资产生成作业（非阻塞）：run() 内完成出图 + 回写资产文档。
 * 返回 ag_ 前缀 jobId，供前端 useWorkflowTargetMonitor 轮询 /workflows/active。
 */
export function submitGenJob(opts: {
  workflowType: string;
  workflowName?: string;
  projectId: number;
  inputParams?: Record<string, unknown>;
  run: () => Promise<any>;
}): string {
  return submitAssetGeneration(opts);
}
