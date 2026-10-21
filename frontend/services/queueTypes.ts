// Rust 任务队列的声明式契约（queueTypes）
//
// 离线桌面端把「提交 → 轮询 → 取成品」的执行下沉到 Rust 后台 worker（见 src-tauri/src/queue.rs）。
// 前端（localAI 计划构造器 + localWorkflow）负责把厂商知识编排成 TaskPlan 交给 Rust 执行，
// Rust 只承担"通用 HTTP 任务执行器 + 持久化 + 并发闸 + 退避重试 + 成品落地 + 事件推送"，不含厂商专属逻辑。
//
// 命名约定：
//  - TaskPlan / JobMeta（TS → Rust）为 camelCase，Rust 侧以 #[serde(rename_all = "camelCase")] 对齐。
//  - JobView / TaskView（Rust → TS）沿用后端 WorkflowJob / WorkflowTask 的字段形状（snake_case 为主，
//    个别 displayName / workflowName 为 camelCase），使既有消费者零改动。

/** 单条厂商 HTTP 请求（body 已序列化为字符串；可含 {{KLING_SIGN:<apiKey>}} 标记由 Rust 替换为 Bearer JWT） */
export interface HttpStep {
  url: string;
  method: string;
  headers: Record<string, string>;
  body?: string;
}

/** 异步任务轮询规格：{task_id} 为提交响应里解析出的任务 ID 占位符 */
export interface PollSpec {
  urlTemplate: string;
  method: string;
  headers: Record<string, string>;
  /** 依序尝试从轮询响应取状态字符串（Rust 会 to_lowercase 后比较） */
  statusPaths: string[];
  /** 命中即视为成功（小写比较） */
  successValues: string[];
  /** 命中即视为失败（小写比较） */
  failValues: string[];
  /** 失败时取错误信息 */
  errorPaths: string[];
  /** 轮询期间映射到的进度（如 55） */
  progressMid?: number;
  /** 轮询基础间隔 ms（会随等待时长递增） */
  intervalMs: number;
  /** 轮询间隔上限 ms */
  maxIntervalMs: number;
  /** 单任务轮询总超时 ms */
  timeoutMs: number;
}

/** 步骤产出如何从"最终响应 JSON"提取并落到 result_data */
export type StepExtract =
  /** 媒体：取 URL（或 b64 兜底）→ Rust 下载落地 → 把本地 file_path 写入各 alias（前端 convertFileSrc 转 asset URL） */
  | { mode: 'media'; urlPaths: string[]; b64Paths: string[]; nameHint?: string; aliases: string[] }
  /** 纯文本：取字符串写入各 alias */
  | { mode: 'text'; valuePaths: string[]; aliases: string[] }
  /** 文本再解析 fenced JSON：先按 valuePaths 取原始文本，剥离 ``` 围栏解析后，把 fields 逐项写入 result_data */
  | {
      mode: 'json';
      valuePaths: string[];
      fields: Array<{ alias: string; paths: string[]; default?: string }>;
    };

/** 一个步骤 = 提交 (+ 可选轮询) + 产出提取 */
export interface TaskStep {
  submit: HttpStep;
  /** 提交响应里解析远端任务 ID 的路径（视频/可灵） */
  extractTaskIdPaths?: string[];
  /** 无 poll 表示单请求即得结果（图片/提示词） */
  poll?: PollSpec;
  extract: StepExtract;
  /** 可选步骤：失败忽略（如尾帧补生成） */
  optional?: boolean;
}

/** 任务计划（TS → Rust） */
export interface TaskPlan {
  kind: 'video' | 'image' | 'prompt';
  modelName: string;
  steps: TaskStep[];
  /** 成功后并入 result_data 的常量（如视频 formatUsed / formatDowngraded） */
  staticResult?: Record<string, unknown>;
}

/** 作业元信息（TS → Rust），用于构建 JobView 及落地所需工程绝对路径 */
export interface JobMeta {
  workflowType: string;
  workflowName: string;
  projectId: number;
  /** 工程文件夹绝对路径（Rust 下载成品 / 授权 asset 作用域所需） */
  projectPath: string;
  params: unknown;
  targetType: string;
  targetId: number | null;
}

/** 与 LocalWorkflowTask 对齐的作业任务视图（Rust → TS） */
export interface TaskView {
  id: string;
  job_id: string;
  step_index: number;
  task_type: string;
  target_type: string;
  target_id: number | null;
  model_name: string | null;
  input_params: unknown;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  progress: number;
  result_data: unknown;
  error_message: string | null;
  started_at: string | null;
  completed_at: string | null;
  displayName?: string;
}

/** 与 LocalWorkflowJob 对齐的作业视图（Rust → TS） */
export interface JobView {
  id: string;
  user_id: number;
  project_id: number;
  workflow_type: string;
  workflowName: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
  current_step_index: number;
  total_steps: number;
  params: unknown;
  input_params: unknown;
  error_message: string | null;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
  tasks: TaskView[];
  consumed?: boolean;
  /** result_data 中哪些 key 是本地文件路径，需前端 convertFileSrc 转 asset URL */
  media_result_keys?: string[];
}
