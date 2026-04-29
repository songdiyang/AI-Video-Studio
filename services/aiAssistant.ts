/**
 * AI 助手长任务 Service
 *
 * 对应后端：backend/src/aiAssistantRoutes.js
 *   POST /sessions/:id/run     启动 ai_assistant_session workflow
 *   POST /sessions/:id/cancel  取消当前 active_job_id
 *
 * 运行状态查询复用 /api/workflows/:jobId（hooks/useWorkflow.ts）
 */

import { getAuthToken } from './auth';

export interface RunSessionParams {
  sessionId: number;
  message: string;
  modelName: string;
  projectId?: number | null;
  defaultTextModel?: string | null;
  defaultImageModel?: string | null;
}

export interface RunSessionResult {
  success: true;
  jobId: string;           // 已 encode 的 hex
  tasks: Array<{
    stepIndex: number;
    type: string;
    displayName?: string | null;
    status: string;
  }>;
}

export interface RunSessionError {
  success: false;
  error: string;
  activeJobId?: string;
}

async function request<T = any>(url: string, init: RequestInit = {}): Promise<T> {
  const token = getAuthToken();
  const res = await fetch(url, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init.headers || {})
    }
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || body.success === false) {
    const msg = body?.error || body?.message || `请求失败 (${res.status})`;
    const err: any = new Error(msg);
    err.status = res.status;
    err.body = body;
    throw err;
  }
  return body as T;
}

/** 启动 AI 助手长任务 */
export async function runSession(params: RunSessionParams): Promise<RunSessionResult> {
  const { sessionId, ...rest } = params;
  return request<RunSessionResult>(`/api/ai-assistant/sessions/${sessionId}/run`, {
    method: 'POST',
    body: JSON.stringify(rest)
  });
}

/** 取消 AI 助手当前运行中的长任务 */
export async function cancelSession(sessionId: number): Promise<{ success: true; cancelled: boolean }> {
  return request(`/api/ai-assistant/sessions/${sessionId}/cancel`, {
    method: 'POST'
  });
}

/**
 * 判断模型是否支持 AI 助手长任务
 * 基于模型配置中的 supports_tool_calling 标志
 */
export function isLongTaskCapable(model: { supports_tool_calling?: boolean | number } | null | undefined): boolean {
  if (!model) return false;
  return Boolean(model.supports_tool_calling);
}
