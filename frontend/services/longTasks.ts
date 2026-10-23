/**
 * 全局长任务注册表
 * ──────────────────────────────────────────────────────────────
 * 智能体把耗时较长的操作（图片/视频生成、分镜拆分、剧本生成等）注册到这里：
 *  - 站内信任务区与对话卡片共享同一份状态来源
 *  - 后台轮询由全局任务队列驱动，即使用户离开对话/关闭面板也会继续
 *  - 系统提示词会注入当前任务快照，模型可据此回答进度
 *  - 终态写入站内信（services/localMail）
 */

export type LongTaskKind = 'storyboard' | 'image' | 'video' | 'script' | 'generic';
export type LongTaskStatus = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';

export interface LongTaskRecord {
  jobId: string;
  title: string;
  kind: LongTaskKind;
  status: LongTaskStatus;
  progress: number;
  current: number;
  total: number;
  error?: string | null;
  sessionId?: number | null;
  startedAt: number;
  updatedAt: number;
}

const STORAGE_KEY = 'nanostory_long_tasks_v1';
const MAX_TASKS = 50;
export const LONG_TASKS_UPDATED_EVENT = 'long-tasks:updated';

export const LONG_TASK_STATUS_LABEL: Record<LongTaskStatus, string> = {
  pending: '等待中',
  running: '运行中',
  completed: '已完成',
  failed: '失败',
  cancelled: '已取消',
};

export const LONG_TASK_KIND_LABEL: Record<LongTaskKind, string> = {
  storyboard: '分镜拆分',
  image: '分镜图',
  video: '分镜视频',
  script: '剧本生成',
  generic: '任务',
};

function read(): LongTaskRecord[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const list = JSON.parse(raw);
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

function write(list: LongTaskRecord[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list.slice(0, MAX_TASKS)));
  } catch {
    // 忽略配额/序列化失败
  }
  window.dispatchEvent(new CustomEvent(LONG_TASKS_UPDATED_EVENT));
}

/** 注册长任务；同一 jobId 重挂时只更新元信息，不把终态回退为 pending */
export function registerLongTask(input: {
  jobId: string;
  title: string;
  kind: LongTaskKind;
  sessionId?: number | null;
}): LongTaskRecord {
  const now = Date.now();
  const list = read();
  const existing = list.find((task) => task.jobId === input.jobId);
  if (existing) {
    existing.title = input.title || existing.title;
    existing.kind = input.kind || existing.kind;
    if (input.sessionId !== undefined) existing.sessionId = input.sessionId;
    existing.updatedAt = now;
    write(list);
    return existing;
  }
  const record: LongTaskRecord = {
    jobId: input.jobId,
    title: input.title,
    kind: input.kind,
    status: 'pending',
    progress: 0,
    current: 0,
    total: 0,
    error: null,
    sessionId: input.sessionId ?? null,
    startedAt: now,
    updatedAt: now,
  };
  write([record, ...list]);
  window.dispatchEvent(new CustomEvent('long-task:registered', { detail: { jobId: input.jobId } }));
  return record;
}

export function updateLongTask(
  jobId: string,
  patch: Partial<Omit<LongTaskRecord, 'jobId'>>,
): LongTaskRecord | null {
  const list = read();
  const index = list.findIndex((task) => task.jobId === jobId);
  if (index < 0) return null;
  const next = { ...list[index], ...patch, jobId, updatedAt: Date.now() };
  list[index] = next;
  write(list);
  return next;
}

export function getLongTask(jobId: string): LongTaskRecord | null {
  return read().find((task) => task.jobId === jobId) || null;
}

export function listLongTasks(): LongTaskRecord[] {
  return read().sort((a, b) => b.updatedAt - a.updatedAt);
}

export function activeLongTasks(): LongTaskRecord[] {
  return listLongTasks().filter((task) => task.status === 'running' || task.status === 'pending');
}

/** 供系统提示词与 get_task_status 动作使用的文本快照 */
export function getLongTasksSummary(jobId?: string): string {
  const tasks = jobId
    ? listLongTasks().filter((task) => task.jobId === jobId)
    : listLongTasks().slice(0, 8);
  if (tasks.length === 0) {
    return jobId ? `未找到工作流 #${jobId} 的记录。` : '当前没有后台长任务。';
  }
  const lines = tasks.map((task) => {
    const count = task.total > 0 ? `（${task.current}/${task.total}）` : '';
    const error = task.error ? `，错误：${task.error}` : '';
    return `- [${task.jobId}] ${task.title}：${LONG_TASK_STATUS_LABEL[task.status]} ${task.progress}%${count}${error}`;
  });
  return `后台长任务：\n${lines.join('\n')}`;
}
