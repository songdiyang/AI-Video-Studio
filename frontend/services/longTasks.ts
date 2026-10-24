/**
 * 长任务注册表（按工程隔离）
 * ──────────────────────────────────────────────────────────────
 * 智能体把耗时较长的操作（图片/视频生成、分镜拆分、剧本生成等）注册到这里：
 *  - 每条记录带归属工程 projectId，读取默认只返回当前工程的任务，避免跨工程串味
 *  - 任务本体由后台队列执行，切换工程 / 关闭面板都会继续跑；记录只做过滤，不随工程切换删除
 *  - 站内信任务区与对话卡片共享同一份状态来源
 *  - 系统提示词会注入当前工程的任务快照，模型可据此回答进度
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
  /** 归属工程；旧记录无此字段时按 null（未归属）处理 */
  projectId?: number | null;
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

/** 当前活动工程；undefined 表示尚未确定（此时读取不过滤，保持旧行为） */
let activeProjectId: number | null | undefined = undefined;

/**
 * 同步当前活动工程。切换工程后读取默认只看该工程的任务，
 * 其它工程的记录仍保留，用于工程内继续展示与后台运行。
 */
export function setLongTaskActiveProject(projectId: number | null | undefined): void {
  activeProjectId = projectId;
}

export function getLongTaskActiveProject(): number | null | undefined {
  return activeProjectId;
}

function read(): LongTaskRecord[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const list = JSON.parse(raw);
    if (!Array.isArray(list)) return [];
    // 旧记录没有 projectId：归一化为 null，避免与真实工程 ID 混淆
    return list.map((task: any) => ({ ...task, projectId: task?.projectId ?? null }));
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

/** 解析生效的工程过滤值：显式入参优先，其次模块内活动工程，undefined 表示不过滤 */
function resolveFilterProject(explicit?: number | null): number | null | undefined {
  if (explicit !== undefined) return explicit;
  return activeProjectId;
}

function matchProject(task: LongTaskRecord, filter: number | null | undefined): boolean {
  if (filter === undefined) return true;
  return (task.projectId ?? null) === filter;
}

/** 注册长任务；同一 jobId 重挂时只更新元信息，不把终态回退为 pending */
export function registerLongTask(input: {
  jobId: string;
  title: string;
  kind: LongTaskKind;
  sessionId?: number | null;
  projectId?: number | null;
}): LongTaskRecord {
  const now = Date.now();
  const list = read();
  const projectId = input.projectId ?? activeProjectId ?? null;
  const existing = list.find((task) => task.jobId === input.jobId);
  if (existing) {
    existing.title = input.title || existing.title;
    existing.kind = input.kind || existing.kind;
    if (input.sessionId !== undefined) existing.sessionId = input.sessionId;
    if (input.projectId !== undefined) existing.projectId = input.projectId;
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
    projectId,
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

export function getLongTask(jobId: string, projectId?: number | null): LongTaskRecord | null {
  const task = read().find((item) => item.jobId === jobId);
  if (!task) return null;
  if (projectId !== undefined && !matchProject(task, projectId)) return null;
  return task;
}

/** 读取长任务列表；默认只返回当前活动工程的任务 */
export function listLongTasks(projectId?: number | null): LongTaskRecord[] {
  const filter = resolveFilterProject(projectId);
  return read()
    .filter((task) => matchProject(task, filter))
    .sort((a, b) => b.updatedAt - a.updatedAt);
}

export function activeLongTasks(projectId?: number | null): LongTaskRecord[] {
  return listLongTasks(projectId).filter((task) => task.status === 'running' || task.status === 'pending');
}

/** 供系统提示词与 get_task_status 动作使用的文本快照；只覆盖当前工程 */
export function getLongTasksSummary(jobId?: string, projectId?: number | null): string {
  const tasks = jobId
    ? listLongTasks(projectId).filter((task) => task.jobId === jobId)
    : listLongTasks(projectId).slice(0, 8);
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
