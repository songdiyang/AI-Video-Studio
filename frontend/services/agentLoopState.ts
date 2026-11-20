/**
 * 智能体循环状态落盘：plan→execute→observe 的 history/executedLog/round
 * 原本只活在内存里，应用一关进行中的多步任务就断了。这里把编排器交出的
 * checkpoint 按「工程+会话」存进 localStorage，重启后：
 *  - 检测到 status=running 的残留 → 如实告知中断点（第几轮、已执行哪些动作），
 *    并挂「继续未完成任务」按钮，点击后从落盘 history 续跑；
 *  - 正常收敛（done/ask/script）→ 清除，不打扰。
 *
 * 体积控制：history 里的 base64 图片附件不落盘（单张可达数 MB，会撑爆配额），
 * 续跑时模型看不到旧图，但文字观察记录完整保留，足以接着规划。
 */
import type { AgentLoopState } from './agentOrchestrator';

const KEY_PREFIX = 'ai_agent_loop_';

function stateKey(projectId: number | null | undefined, sessionId: number | null | undefined): string | null {
  if (projectId == null || sessionId == null) return null;
  return `${KEY_PREFIX}${projectId}_${sessionId}`;
}

/** 剥离 base64 附件后落盘；写入失败（配额等）静默忽略，不影响主流程 */
export function saveLoopState(projectId: number | null | undefined, sessionId: number | null | undefined, state: AgentLoopState): void {
  const key = stateKey(projectId, sessionId);
  if (!key) return;
  try {
    const slim: AgentLoopState = {
      ...state,
      history: state.history.map((m) => {
        if (!m.attachments?.length) return m;
        const kept = m.attachments.filter((a) => !a.url.startsWith('data:'));
        return kept.length ? { ...m, attachments: kept } : { role: m.role, content: m.content };
      }),
    };
    localStorage.setItem(key, JSON.stringify(slim));
  } catch { /* ignore quota errors */ }
}

export function loadLoopState(projectId: number | null | undefined, sessionId: number | null | undefined): AgentLoopState | null {
  const key = stateKey(projectId, sessionId);
  if (!key) return null;
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as AgentLoopState;
    if (!parsed || !Array.isArray(parsed.history) || typeof parsed.round !== 'number') return null;
    return parsed;
  } catch {
    return null;
  }
}

export function clearLoopState(projectId: number | null | undefined, sessionId: number | null | undefined): void {
  const key = stateKey(projectId, sessionId);
  if (!key) return;
  try { localStorage.removeItem(key); } catch { /* ignore */ }
}

/** 中断告知文案：如实说明断在第几轮、已经执行了什么，不宣称任务完成 */
export function buildInterruptionNotice(state: AgentLoopState): string {
  const lines = [
    `上次的多步任务在第 ${state.round + 1} 轮规划时中断（应用退出或循环异常），尚未完成。`,
  ];
  if (state.executedLog.length > 0) {
    lines.push(`中断前已执行：\n${state.executedLog.map((e, i) => `${i + 1}. ${e}`).join('\n')}`);
  } else {
    lines.push('中断前还没有执行任何动作。');
  }
  if (state.pendingConfirm.length > 0) {
    lines.push(`另有 ${state.pendingConfirm.length} 个删除类操作在等待你确认，不会自动执行。`);
  }
  lines.push('可点击下方按钮从中断点继续；也可以直接告诉我新的安排。');
  return lines.join('\n\n');
}