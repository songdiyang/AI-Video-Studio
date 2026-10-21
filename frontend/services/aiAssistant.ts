/**
 * AI 助手长任务 Service
 *
 * 端点契约沿用已删除的原后端 AI 助手路由（backend 目录已在桌面化调整中移除）：
 *   POST /sessions/:id/run     启动 ai_assistant_session workflow
 *   POST /sessions/:id/cancel  取消当前 active_job_id
 *
 * 运行状态查询复用 /api/workflows/:jobId（hooks/useWorkflow.ts）
 */

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
  const res = await fetch(url, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
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
 * 判断模型是否支持 AI 助手长任务（agent 直接执行）
 * 与后端 aiAssistantRoutes 的能力判定对齐：
 *  - 显式 supports_tool_calling 为真；或
 *  - 分类为 TEXT/MULTIMODAL 且 provider 命中已知支持 function calling 的厂商。
 * 桌面端本地拦截层已能独立执行动作，不再以「离线模式」禁用长任务。
 */
export function isLongTaskCapable(
  model:
    | { supports_tool_calling?: boolean | number; category?: string; provider?: string }
    | null
    | undefined,
): boolean {
  if (!model) return false;
  const st = model.supports_tool_calling;
  const supportsToolCalling =
    st === 1 ||
    st === true ||
    String(st).toLowerCase() === 'true' ||
    String(st) === '1';
  const category = String(model.category || '').toUpperCase();
  const isToolCapableCategory = category === 'TEXT' || category === 'MULTIMODAL';
  const isToolCapableProvider = /deepseek|doubao|ark|openai|volcengine/i.test(model.provider || '');
  return supportsToolCalling || (isToolCapableCategory && isToolCapableProvider);
}
