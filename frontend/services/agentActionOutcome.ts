// 智能体动作统一结果契约
//
// 桥接层每个动作都必须返回本模块定义的结构（或可直接展示的字符串）。
// 原因：agent 循环靠返回值判断「动作是否真的执行」，fire-and-forget 会让
// Promise resolve 出 undefined，循环据此回喂「没有执行凭证」，模型便可能
// 重复执行或误报失败。删除/更新类动作尤其不能让失败静默 resolve。

/** 动作执行成功：summary 直接作为对话回执与观察结果 */
export interface AgentActionSuccess {
  success: true;
  /** 面向用户 / 模型的一行结果，例如「已删除分镜 #12，工程内现有 8 个分镜」 */
  summary: string;
  /** 结构化附加信息（目标 ID、剩余数量等），供后续串联或诊断 */
  data?: Record<string, unknown>;
}

/** 动作执行失败：error 必须写清真实原因，不能为空 */
export interface AgentActionFailure {
  success: false;
  error: string;
  /** 是否值得让模型原样重试（网络抖动等）；默认不重试，避免重复扣费 */
  retryable?: boolean;
}

export type AgentActionOutcome = AgentActionSuccess | AgentActionFailure;

export function actionOk(summary: string, data?: Record<string, unknown>): AgentActionSuccess {
  return data ? { success: true, summary, data } : { success: true, summary };
}

export function actionFail(error: string, retryable = false): AgentActionFailure {
  return retryable ? { success: false, error, retryable: true } : { success: false, error };
}

/**
 * 是否明确失败。
 * 只认顶层 success === false 或非空 error；字符串、undefined、boolean
 * 等旧返回值不算失败，避免把「无回执」误判成「执行失败」。
 */
export function isActionFailure(result: unknown): result is AgentActionFailure {
  if (!result || typeof result !== 'object') return false;
  const record = result as Record<string, unknown>;
  if (record.success === false) return true;
  return typeof record.error === 'string' && record.error.trim().length > 0;
}

/** 取失败原因；成功或无结构结果返回空串 */
export function actionErrorText(result: unknown): string {
  if (!isActionFailure(result)) return '';
  return result.error.trim() || '未知错误';
}

/**
 * 取成功摘要：字符串原样返回；结构化结果读 summary。
 * 失败或没有 summary 的旧对象返回空串，由调用方决定是否回退到 JSON。
 */
export function actionSuccessText(result: unknown): string {
  if (typeof result === 'string') return result.trim();
  if (!result || typeof result !== 'object' || isActionFailure(result)) return '';
  const summary = (result as Record<string, unknown>).summary;
  return typeof summary === 'string' ? summary.trim() : '';
}
