/**
 * 剧本分析桥接：把「上传剧本后交给智能体分析」的请求从大纲面板传递给 AI 助手面板。
 *
 * AI 助手面板是懒加载且仅在打开时挂载，事件可能先于面板挂载到达；
 * 因此请求同时写入模块级 pending 槽位——面板挂载时消费兜底，已挂载时走事件即时消费。
 */

export interface ScriptAnalysisRequest {
  /** 剧本名称（含扩展名或标题） */
  name: string;
  /** 剧本正文 */
  content: string;
}

export const SCRIPT_ANALYSIS_EVENT = 'script-analysis-request';

let pending: ScriptAnalysisRequest | null = null;

/** 发起分析请求：暂存 pending 并广播事件（面板未挂载时由挂载消费兜底）。 */
export function requestScriptAnalysis(request: ScriptAnalysisRequest): void {
  pending = request;
  window.dispatchEvent(new CustomEvent<ScriptAnalysisRequest>(SCRIPT_ANALYSIS_EVENT, { detail: request }));
}

/** 取出并清空待处理请求（AI 助手面板挂载时调用）。 */
export function consumePendingScriptAnalysis(): ScriptAnalysisRequest | null {
  const request = pending;
  pending = null;
  return request;
}
