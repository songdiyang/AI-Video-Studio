import { getAuthToken } from './auth';

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
  title?: string;
  description?: string;
  style?: string;
  length?: string;
  provider?: string;
}

export interface GenerateScriptResponse extends ScriptItem {
  billing?: {
    tokens: number;
    unit_price: number;
    amount: number;
  };
}

function authHeaders() {
  const token = getAuthToken();
  return token
    ? {
        Authorization: `Bearer ${token}`,
      }
    : {};
}

export async function fetchScripts(): Promise<ScriptItem[]> {
  const res = await fetch('/api/scripts', {
    headers: {
      ...authHeaders(),
    },
  });

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
  const res = await fetch(`/api/scripts/library${qs}`, {
    headers: { ...authHeaders() },
  });
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
      ...authHeaders(),
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
      ...authHeaders(),
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
    headers: { ...authHeaders() },
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
      ...authHeaders(),
    },
    body: JSON.stringify({ title, content: '' }),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error(data?.message || '更新标题失败');
  }
  return data;
}

export async function generateScript(params: GenerateScriptParams): Promise<GenerateScriptResponse> {
  const res = await fetch('/api/scripts/generate', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...authHeaders(),
    },
    body: JSON.stringify(params),
  });

  const data = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error(data?.message || 'Failed to generate script');
  }
  return data as GenerateScriptResponse;
}

// ==================== 上传与分析优化 ====================

export interface UploadScriptParams {
  file: File;
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

export interface ScriptAnalysisResult {
  sceneCount: number;
  scenes?: Array<{ index: number; title: string; description: string }>;
  characters?: Array<{ name: string; importance: string; trait: string }>;
  structure: string;
  style: string[];
  pacing?: string;
  suggestions: string[];
  summary: string;
  error?: string;
}

export interface AnalyzeScriptParams {
  scriptId?: number;
  content?: string;
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
 * 上传剧本文件（.txt / .md）
 */
export async function uploadScriptFile(params: UploadScriptParams): Promise<UploadScriptResponse> {
  const formData = new FormData();
  formData.append('file', params.file);
  if (params.projectId !== undefined) formData.append('projectId', String(params.projectId));
  if (params.episodeNumber !== undefined) formData.append('episodeNumber', String(params.episodeNumber));
  if (params.title) formData.append('title', params.title);
  formData.append('mode', params.mode || 'save');

  const res = await fetch('/api/scripts/upload', {
    method: 'POST',
    headers: {
      ...authHeaders(),
    },
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
      ...authHeaders(),
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
      ...authHeaders(),
    },
    body: JSON.stringify(params),
  });

  const data = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error(data?.message || '优化剧本失败');
  }
  return data as OptimizeScriptResponse;
}
