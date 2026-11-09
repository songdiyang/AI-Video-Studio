export interface ScriptItem {
  id: number;
  title: string | null;
  content: string;
  model_provider: string | null;
  token_used: number;
  created_at: string;
  // 资源化改造后新增字段（后端已返回）
  project_id?: number | null;
  source_script_id?: number | null;
  episode_number?: number;
  status?: 'draft' | 'generating' | 'completed' | 'failed';
  updated_at?: string;
}

export interface ScriptLibraryItem extends ScriptItem {
  project_id: number | null;
  source_script_id: number | null;
  episode_number: number;
  status: 'draft' | 'generating' | 'completed' | 'failed';
  updated_at: string;
  project_name?: string | null;
}

export type ScriptLibraryScope = 'all' | 'personal' | 'project';

export interface BindScriptResponse {
  success: boolean;
  scriptId: number;
  projectId: number;
  episodeNumber: number;
  sourceScriptId: number;
  message: string;
}

export interface CreateScriptParams {
  projectId?: number | null;
  title?: string;
  content: string;
  episodeNumber?: number;
}

export interface CreateScriptResponse {
  success: boolean;
  scriptId: number;
  projectId: number | null;
  episodeNumber: number;
  message: string;
}

export interface GenerateScriptParams {
  projectId?: number;
  title?: string;
  description?: string;
  style?: string;
  length?: string;
  episodeNumber?: number;
  provider?: string;
  /** 强制重新选角（默认沿用工程已锁定的代笔写手） */
  recastWriter?: boolean;
}

/** 选角候选与结果（与 services/writerStyle 的 WriterCandidate 对齐） */
export interface WriterCandidate {
  key: string;
  name: string;
  fit: number;
  reason: string;
}

/** 同名原作命中：写手署名与其代表作名（只借笔法，不代表要改编原作） */
export interface WriterSameWork {
  writer: string;
  work: string;
}

export interface ScriptWriterInfo {
  key: string;
  name: string;
  rationale: string;
  recast: boolean;
  candidates?: WriterCandidate[];
  /** 标题/题材与该写手某部代表作同名时的命中（仅借笔法，不是改编原作） */
  sameWork?: WriterSameWork | null;
}

export interface GenerateScriptResponse extends ScriptItem {
  jobId?: string;
  scriptId?: number;
  episodeNumber?: number;
  writer?: ScriptWriterInfo;
  /** 同工程内已有同名剧本，标题被系统追加了序号 */
  titleRenamed?: boolean;
  billing?: {
    tokens: number;
    unit_price: number;
    amount: number;
  };
}

export interface ScriptGenerationStreamHandlers {
  /** 标题与草稿已落库，可立即打开剧本标签页。 */
  onMetadata?: (metadata: GenerateScriptResponse) => void;
  /** 正文增量；只在当前标签页内追加，不重新激活标签。 */
  onDelta?: (delta: string) => void;
}

export async function fetchScripts(): Promise<ScriptItem[]> {
  const res = await fetch('/api/scripts');

  if (!res.ok) {
    const data = await res.json().catch(() => null);
    throw new Error(data?.message || 'Failed to load scripts');
  }

  return (await res.json()) as ScriptItem[];
}

/**
 * 获取当前用户的完整剧本库（个人剧本 + 项目剧本）
 * @param scope 可选过滤：all / personal / project
 */
export async function fetchScriptLibrary(scope: ScriptLibraryScope = 'all'): Promise<ScriptLibraryItem[]> {
  const qs = scope && scope !== 'all' ? `?scope=${encodeURIComponent(scope)}` : '';
  const res = await fetch(`/api/scripts/library${qs}`);
  if (!res.ok) {
    const data = await res.json().catch(() => null);
    throw new Error(data?.message || '获取剧本库失败');
  }
  return (await res.json()) as ScriptLibraryItem[];
}

/**
 * 手动创建剧本（支持 projectId 可选：不传即存入个人剧本库）
 */
export async function createScript(params: CreateScriptParams): Promise<CreateScriptResponse> {
  const res = await fetch('/api/scripts/create', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(params),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error(data?.message || '创建剧本失败');
  }
  return data as CreateScriptResponse;
}

/**
 * 将剧本深拷贝绑定到目标项目（产生独立副本，副本的 source_script_id 指向原始）
 */
export async function bindScriptToProject(payload: {
  sourceScriptId: number;
  targetProjectId: number;
  episodeNumber?: number;
  titleOverride?: string;
  bindAll?: boolean;
  siblingIds?: number[];
}): Promise<BindScriptResponse> {
  const res = await fetch('/api/scripts/bind', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error(data?.message || '绑定剧本失败');
  }
  return data as BindScriptResponse;
}

/**
 * 删除剧本（复用 DELETE /api/scripts/:id 旧接口）
 */
export async function deleteScript(scriptId: number): Promise<void> {
  const res = await fetch(`/api/scripts/${scriptId}`, {
    method: 'DELETE',
  });
  if (!res.ok) {
    const data = await res.json().catch(() => null);
    throw new Error(data?.message || '删除剧本失败');
  }
}

/**
 * 更新剧本标题（仅标题，不修改内容）
 */
export async function updateScriptTitle(scriptId: number, title: string): Promise<{ success: boolean; message: string }> {
  const res = await fetch(`/api/scripts/${scriptId}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ title, content: '' }),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error(data?.message || '更新标题失败');
  }
  return data;
}

/**
 * 更新剧本（标题 + 内容）
 */
export async function updateScript(scriptId: number, title: string, content: string): Promise<{ message: string }> {
  const res = await fetch(`/api/scripts/${scriptId}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ title, content }),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error(data?.message || '保存剧本失败');
  }
  return data;
}

export async function generateScript(params: GenerateScriptParams): Promise<GenerateScriptResponse> {
  const res = await fetch('/api/scripts/generate', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(params),
  });

  const data = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error(data?.message || 'Failed to generate script');
  }
  return data as GenerateScriptResponse;
}

function assertGenerationResult(data: unknown): GenerateScriptResponse {
  if (!data || typeof data !== 'object') throw new Error('剧本生成返回了无效结果');
  const result = data as GenerateScriptResponse & { success?: boolean; error?: string; message?: string };
  if (result.success === false) throw new Error(result.error || result.message || '剧本生成失败');
  const scriptId = Number(result.scriptId);
  if (!result.jobId && (!Number.isFinite(scriptId) || scriptId <= 0)) {
    throw new Error('剧本生成未返回有效的剧本 ID');
  }
  return result;
}

/** 标题先行、正文逐段返回的剧本生成；非 SSE 服务自动兼容原同步契约。 */
export async function generateScriptStream(
  params: GenerateScriptParams,
  handlers: ScriptGenerationStreamHandlers = {},
): Promise<GenerateScriptResponse> {
  const res = await fetch('/api/scripts/generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...params, stream: true }),
  });
  const contentType = res.headers.get('content-type') || '';

  // 云端或未升级的服务仍返回 JSON：保留原能力，但调用方无需维护第二条链路。
  if (!res.ok || !contentType.includes('text/event-stream')) {
    const data = await res.json().catch(() => null);
    if (!res.ok) throw new Error(data?.message || data?.error || '剧本生成失败');
    const result = assertGenerationResult(data);
    handlers.onMetadata?.(result);
    if (result.content) handlers.onDelta?.(result.content);
    return result;
  }
  if (!res.body) throw new Error('无法读取剧本生成流');

  const reader = res.body.getReader();
  const decoder = new TextDecoder('utf-8');
  let buffer = '';
  let completed: GenerateScriptResponse | undefined;

  const consumeBlock = (block: string) => {
    const data = block.split(/\r?\n/)
      .filter(line => line.startsWith('data: '))
      .map(line => line.slice(6))
      .join('\n');
    if (!data || data === '[DONE]') return;
    const event = JSON.parse(data);
    if (event.type === 'metadata') handlers.onMetadata?.(event.metadata || event);
    else if (event.type === 'delta' && event.delta) handlers.onDelta?.(String(event.delta));
    else if (event.type === 'complete') completed = event.result || event;
    else if (event.type === 'error') throw new Error(event.error || '剧本生成失败');
  };
  const consumeBlocks = (final = false) => {
    const blocks = buffer.split(/\r?\n\r?\n/);
    buffer = blocks.pop() || '';
    blocks.forEach(consumeBlock);
    if (final && buffer.trim()) {
      consumeBlock(buffer);
      buffer = '';
    }
  };

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      consumeBlocks();
    }
    buffer += decoder.decode();
    consumeBlocks(true);
  } finally {
    reader.releaseLock();
  }
  if (!completed) throw new Error('剧本生成流未返回完成结果');
  return assertGenerationResult(completed);
}

/**
 * 按题材适配度指派代笔写手（与 AI 生成剧本共用同一后端实现）。
 * 未锁定时选角一次并写回工程设置；已锁定且 force=false 时直接复用。
 */
export interface CastWriterParams {
  projectId?: number | null;
  title?: string;
  description?: string;
  style?: string;
  length?: string;
  /** 强制重新选角 */
  force?: boolean;
  provider?: string;
}

export interface CastWriterResponse {
  success: boolean;
  writer: { key: string; name: string; stylePrompt: string; rationale: string; sameWork?: WriterSameWork | null };
  candidates: WriterCandidate[];
  recast: boolean;
  sameWork?: WriterSameWork | null;
  message: string;
}

export async function castWriterForScript(params: CastWriterParams): Promise<CastWriterResponse> {
  const res = await fetch('/api/scripts/cast-writer', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error(data?.message || '写手选角失败');
  }
  return data as CastWriterResponse;
}

// ==================== 上传与分析优化 ====================

export interface UploadScriptParams {
  file?: File;
  content?: string;
  projectId?: number | null;
  episodeNumber?: number | null;
  title?: string;
  mode?: 'save' | 'analyze';
}

export interface UploadScriptResponse {
  success: boolean;
  scriptId: number;
  projectId: number | null;
  episodeNumber: number;
  title: string;
  content: string;
  mode: 'save' | 'analyze';
  analysis?: ScriptAnalysisResult;
  message: string;
}

export interface ScriptDimension {
  name: string;
  score: number;
  comment: string;
}

export interface ScriptAnalysisResult {
  overallScore: number;
  dimensions: ScriptDimension[];
  strengths: string[];
  weaknesses: string[];
  suggestions: string[];
  summary: string;
  error?: string;
}

export interface AnalyzeScriptParams {
  scriptId?: number;
  content?: string;
  /** 用于取该工程的锁定写手，作为「风格一致性」对标 */
  projectId?: number | null;
  textModel?: string;
}

export interface AnalyzeScriptResponse {
  success: boolean;
  scriptId?: number;
  analysis: ScriptAnalysisResult;
  contentLength: number;
  message: string;
}

export interface OptimizeScriptParams {
  scriptId?: number;
  content?: string;
  instruction: string;
  textModel?: string;
  saveMode?: 'new' | 'overwrite';
  /** 用于沿用该工程锁定的代笔写手 */
  projectId?: number | null;
}

export interface OptimizeScriptResponse {
  success: boolean;
  originalScriptId?: number;
  savedScriptId?: number;
  projectId?: number | null;
  episodeNumber?: number;
  title: string;
  originalContent: string;
  optimizedContent: string;
  changes: string[];
  tokensUsed: number;
  model: string;
  instruction: string;
  saveMode: string;
  message: string;
}

/**
 * 上传剧本文件（.txt / .md）或直接提交文本内容
 */
export async function uploadScriptFile(params: UploadScriptParams): Promise<UploadScriptResponse> {
  const formData = new FormData();
  if (params.file) {
    formData.append('file', params.file);
  }
  if (params.content) {
    formData.append('content', params.content);
  }
  if (params.projectId !== undefined) formData.append('projectId', String(params.projectId));
  if (params.episodeNumber !== undefined) formData.append('episodeNumber', String(params.episodeNumber));
  if (params.title) formData.append('title', params.title);
  formData.append('mode', params.mode || 'save');

  const res = await fetch('/api/scripts/upload', {
    method: 'POST',
    body: formData,
  });

  const data = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error(data?.message || '上传剧本失败');
  }
  return data as UploadScriptResponse;
}

/**
 * AI分析剧本
 */
export async function analyzeScript(params: AnalyzeScriptParams): Promise<AnalyzeScriptResponse> {
  const res = await fetch('/api/scripts/analyze', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(params),
  });

  const data = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error(data?.message || '分析剧本失败');
  }
  return data as AnalyzeScriptResponse;
}

/**
 * AI优化剧本
 */
export async function optimizeScript(params: OptimizeScriptParams): Promise<OptimizeScriptResponse> {
  const res = await fetch('/api/scripts/optimize', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(params),
  });

  const data = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error(data?.message || '优化剧本失败');
  }
  return data as OptimizeScriptResponse;
}
