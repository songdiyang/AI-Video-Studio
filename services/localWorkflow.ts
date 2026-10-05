// 本地工作流引擎（localWorkflow）
//
// 桌面离线模式下，接管后端 /api/workflows 的「提交 → 轮询 → 取结果」契约，
// 在内存作业注册表中异步派发 localAI 的出图 / 出视频 / 文本能力，直接命中厂商 API，
// 完全不依赖 localhost:4001 的 Node 工作流引擎（Bull/Redis/MySQL）。
//
// 消费方（hooks/useWorkflow.ts、useTaskRunner、useSceneGeneration、NodeCanvas、DirectorSpace）
// 通过 startWorkflow → getWorkflowStatus(jobId) 轮询，读取：
//   - job.status：pending | running | completed | failed | cancelled
//   - job.tasks[].progress / status
//   - 完成时最后一个 task.result_data（各消费方按自己的字段读取，见 normalizeFrameResult 等）
// 因此这里严格对齐 WorkflowJob / WorkflowTask 的字段形状。

import {
  getOfflineModels,
  resolveModel,
  generateImage,
  generateVideo,
  chatText,
  type OfflineModel,
  type AICategory,
} from './localAI';
import { readProjectDoc } from './localStore';
import { persistGeneratedMedia } from './localMedia';

/** 本地分镜文档形状（对齐 services/localApiRouter 的 StoryboardsDoc，仅取所需字段） */
interface StoryboardsDocLike {
  nextId: number;
  scenes: Array<{
    id: number;
    prompt_template?: string;
    description?: string;
    video_prompt?: string;
    first_frame_prompt?: string;
    last_frame_prompt?: string;
    first_frame_url?: string;
    last_frame_url?: string;
    image_ref?: string;
    video_url?: string;
  }>;
}

// ==================== 类型（对齐 hooks/useWorkflow.ts） ====================

export interface LocalWorkflowTask {
  id: string;
  job_id: string;
  step_index: number;
  task_type: string;
  target_type: string;
  target_id: number | null;
  model_name: string | null;
  input_params: any;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  progress: number;
  result_data: any;
  error_message: string | null;
  started_at: string | null;
  completed_at: string | null;
  displayName?: string;
}

export interface LocalWorkflowJob {
  id: string;
  user_id: number;
  project_id: number;
  workflow_type: string;
  workflowName: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
  current_step_index: number;
  total_steps: number;
  params: any;
  input_params: any;
  error_message: string | null;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
  tasks: LocalWorkflowTask[];
  /** 是否已被消费（供 /active 过滤） */
  consumed?: boolean;
}

// ==================== 作业注册表 ====================

const jobs = new Map<string, LocalWorkflowJob>();

function genId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

// ==================== 工作流分类 ====================

type WfCategory = 'image' | 'video' | 'prompt' | 'unsupported';

const VIDEO_TYPES = new Set(['video_generation', 'scene_video', 'batch_scene_video_generation']);
const PROMPT_TYPES = new Set([
  'single_prompt_optimization',
  'single_image_prompt_optimization',
  'single_video_prompt_optimization',
]);
const IMAGE_TYPES = new Set([
  'frame_generation',
  'single_frame_generation',
  'sketch_frame_generation',
  'camera_frame_generation',
  'hd_repair_generation',
  'magic_paint_generation',
  'character_views_generation',
  'costume_views_generation',
  'prop_views_generation',
  'scene_image_generation',
  'environment_image_generation',
  'building_image_generation',
  'studio_nine_grid_generation',
]);

function classify(workflowType: string): WfCategory {
  const t = (workflowType || '').toLowerCase();
  if (PROMPT_TYPES.has(t)) return 'prompt';
  if (VIDEO_TYPES.has(t)) return 'video';
  if (IMAGE_TYPES.has(t)) return 'image';
  // 兜底按关键字归类
  if (t.includes('prompt')) return 'prompt';
  if (t.includes('video')) return 'video';
  if (t.includes('frame') || t.includes('image') || t.includes('views') || t.includes('grid') || t.includes('paint') || t.includes('sketch') || t.includes('repair')) {
    return 'image';
  }
  return 'unsupported';
}

const WORKFLOW_NAMES: Record<string, string> = {
  frame_generation: '首尾帧生成',
  single_frame_generation: '单帧生成',
  sketch_frame_generation: '草图帧生成',
  camera_frame_generation: '运镜帧生成',
  scene_video: '分镜视频生成',
  video_generation: '视频生成',
  single_prompt_optimization: '提示词优化',
  single_image_prompt_optimization: '图片提示词优化',
  single_video_prompt_optimization: '视频提示词优化',
};

// ==================== 模型选择 ====================

async function pickModel(preferred: string | undefined, category: AICategory): Promise<OfflineModel | null> {
  if (preferred) {
    const m = await resolveModel(preferred);
    if (m) return m;
  }
  const all = await getOfflineModels();
  return all.find((m) => m.type === category) || null;
}

// ==================== 分镜上下文（补齐 prompt / 参考图） ====================

interface SceneContext {
  prompt?: string;
  firstFrame?: string;
  lastFrame?: string;
}

async function loadSceneContext(projectId: number, storyboardId: number | undefined): Promise<SceneContext> {
  if (!projectId || !storyboardId) return {};
  try {
    const doc = await readProjectDoc<StoryboardsDocLike>(projectId, 'storyboards', { nextId: 1, scenes: [] });
    const scene = (doc.scenes || []).find((s) => s.id === Number(storyboardId));
    if (!scene) return {};
    return {
      prompt: scene.video_prompt || scene.first_frame_prompt || scene.prompt_template || scene.description,
      firstFrame: scene.first_frame_url || scene.image_ref,
      lastFrame: scene.last_frame_url,
    };
  } catch {
    return {};
  }
}

// ==================== 执行器 ====================

async function runImage(job: LocalWorkflowJob, task: LocalWorkflowTask, params: any): Promise<void> {
  const model = await pickModel(params.imageModel || params.model, 'IMAGE');
  if (!model) throw new Error('未找到可用的图片生成模型，请在设置中配置');
  task.model_name = model.model_name;

  const ctx = await loadSceneContext(job.project_id, params.storyboardId);
  const prompt = (params.prompt || params.description || params.firstFramePrompt || ctx.prompt || '').trim();
  if (!prompt) throw new Error('缺少图片生成提示词');

  const refImageUrls: string[] = [];
  for (const key of ['compositeImageUrl', 'sketchUrl', 'startSketchUrl', 'imageUrl', 'image_url', 'referenceImageUrl']) {
    const v = params[key];
    if (typeof v === 'string' && v) refImageUrls.push(v);
  }

  task.status = 'processing';
  task.progress = 15;
  const { url, b64 } = await generateImage({
    model,
    prompt,
    refImageUrls,
    aspectRatio: params.aspectRatio,
  });
  const rawUrl = url || (b64 ? `data:image/png;base64,${b64}` : null);
  if (!rawUrl) throw new Error('图片生成成功但未返回地址');
  // 落地到工程 media/ 目录，避免厂商临时 URL 过期后离线不可访问
  const finalUrl = await persistGeneratedMedia(job.project_id, rawUrl, 'frame');

  task.result_data = {
    imageUrl: finalUrl,
    image_url: finalUrl,
    first_frame_url: finalUrl,
    firstFrameUrl: finalUrl,
    url: finalUrl,
  };
  // 若存在尾帧提示词，尝试再生成一帧尾帧（best-effort，失败不影响首帧）
  const lastPrompt = params.lastFramePrompt;
  if (lastPrompt && job.workflow_type === 'frame_generation') {
    try {
      task.progress = 70;
      const second = await generateImage({ model, prompt: lastPrompt, aspectRatio: params.aspectRatio });
      const rawLast = second.url || (second.b64 ? `data:image/png;base64,${second.b64}` : null);
      if (rawLast) {
        const lastUrl = await persistGeneratedMedia(job.project_id, rawLast, 'frame_last');
        task.result_data.last_frame_url = lastUrl;
        task.result_data.endFrame = lastUrl;
        task.result_data.lastFrameUrl = lastUrl;
      }
    } catch {
      // 尾帧失败可忽略
    }
  }
  task.progress = 100;
}

async function runVideo(job: LocalWorkflowJob, task: LocalWorkflowTask, params: any): Promise<void> {
  const model = await pickModel(params.videoModel || params.model, 'VIDEO');
  if (!model) throw new Error('未找到可用的视频生成模型，请在设置中配置');
  task.model_name = model.model_name;

  const ctx = await loadSceneContext(job.project_id, params.storyboardId);
  const prompt = (params.prompt || ctx.prompt || '').trim();
  const firstFrame = params.imageUrl || params.firstFrame || ctx.firstFrame;
  const lastFrame = params.lastFrame || ctx.lastFrame;

  task.status = 'processing';
  task.progress = 10;
  const { url } = await generateVideo({
    model,
    prompt,
    firstFrame,
    lastFrame,
    duration: params.duration,
    aspectRatio: params.aspectRatio,
    resolution: params.resolution,
    onProgress: (p) => {
      // 厂商进度映射到 10~90，避免提前 100
      task.progress = Math.min(90, Math.max(10, Math.round(p)));
    },
  });
  if (!url) throw new Error('视频生成成功但未返回地址');
  // 落地到工程 media/ 目录，避免厂商临时 URL 过期后离线不可访问
  const localUrl = await persistGeneratedMedia(job.project_id, url, 'video');

  task.result_data = { video_url: localUrl, videoUrl: localUrl, url: localUrl };
  task.progress = 100;
}

async function runPrompt(_job: LocalWorkflowJob, task: LocalWorkflowTask, params: any): Promise<void> {
  const model = await pickModel(params.textModel, 'TEXT') || await pickModel(undefined, 'MULTIMODAL');
  if (!model) throw new Error('未找到可用的文本模型，请在设置中配置');
  task.model_name = model.model_name;

  const basePrompt = (params.prompt || params.description || '').trim();
  if (!basePrompt) throw new Error('缺少待优化的提示词内容');

  const kind = jobKindForPrompt(_job.workflow_type);
  const systemPrompt =
    `你是一名专业的 AI 影像提示词工程师。请把用户给出的原始分镜/画面描述，改写成适合${kind}的高质量提示词。要求：\n` +
    '1. 保留原意，补充主体、动作、场景、镜头、光线、风格、画质等要素；\n' +
    '2. 语言精炼、结构清晰，便于模型执行；\n' +
    '3. 严格只输出一个 JSON 对象，不要任何解释或代码围栏，格式为：\n' +
    '{"optimized": "改写后的正向提示词", "negativePrompt": "需要规避的负向提示词，没有则留空"}';

  task.status = 'processing';
  task.progress = 30;
  const { content } = await chatText({
    model,
    temperature: 0.6,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: basePrompt },
    ],
  });
  task.progress = 90;

  const parsed = extractJsonObject(content);
  const optimized = (parsed?.optimized || parsed?.prompt || content || '').trim();
  const negativePrompt = (parsed?.negativePrompt || parsed?.negative || '').trim();
  if (!optimized) throw new Error('提示词优化失败，模型未返回内容');

  task.result_data = { optimized, negativePrompt };
  task.progress = 100;
}

function jobKindForPrompt(workflowType: string): string {
  if (workflowType.includes('video')) return '图生视频/文生视频';
  if (workflowType.includes('image')) return '文生图/图生图';
  return '分镜描述';
}

/** 从可能含代码围栏/前后缀的模型输出中提取第一个 JSON 对象 */
function extractJsonObject(text: string): any | null {
  if (!text) return null;
  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(text);
  const candidate = fenced ? fenced[1] : text;
  const start = candidate.indexOf('{');
  const end = candidate.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) return null;
  try {
    return JSON.parse(candidate.slice(start, end + 1));
  } catch {
    return null;
  }
}

// ==================== 作业生命周期 ====================

function createJob(workflowType: string, projectId: number, params: any): LocalWorkflowJob {
  const jobId = genId('wf');
  const taskId = genId('t');
  const now = new Date().toISOString();
  const task: LocalWorkflowTask = {
    id: taskId,
    job_id: jobId,
    step_index: 0,
    task_type: workflowType,
    target_type: 'storyboard',
    target_id: params?.storyboardId ? Number(params.storyboardId) : null,
    model_name: null,
    input_params: params || {},
    status: 'pending',
    progress: 0,
    result_data: null,
    error_message: null,
    started_at: null,
    completed_at: null,
    displayName: WORKFLOW_NAMES[workflowType] || workflowType,
  };
  const job: LocalWorkflowJob = {
    id: jobId,
    user_id: 1,
    project_id: Number(projectId) || 0,
    workflow_type: workflowType,
    workflowName: WORKFLOW_NAMES[workflowType] || workflowType,
    status: 'running',
    current_step_index: 0,
    total_steps: 1,
    params,
    input_params: params || {},
    error_message: null,
    started_at: now,
    completed_at: null,
    created_at: now,
    tasks: [task],
    consumed: false,
  };
  return job;
}

function finalizeJob(job: LocalWorkflowJob, ok: boolean, error?: string): void {
  const task = job.tasks[job.tasks.length - 1];
  const now = new Date().toISOString();
  if (task) {
    task.status = ok ? 'completed' : 'failed';
    task.progress = ok ? 100 : task.progress;
    task.completed_at = now;
    if (!ok) task.error_message = error || '任务失败';
  }
  job.status = ok ? 'completed' : 'failed';
  job.completed_at = now;
  if (!ok) job.error_message = error || '任务失败';
}

function dispatch(job: LocalWorkflowJob): void {
  const task = job.tasks[0];
  const category = classify(job.workflow_type);
  const params = (job.params && typeof job.params === 'object' ? job.params : {}) as any;
  task.started_at = new Date().toISOString();

  if (category === 'unsupported') {
    finalizeJob(job, false, `离线模式暂不支持该工作流类型：${job.workflow_type}`);
    return;
  }

  const runner = category === 'image' ? runImage : category === 'video' ? runVideo : runPrompt;
  // 异步执行，不阻塞提交响应
  void (async () => {
    try {
      await runner(job, task, params);
      // 若提交后被取消，则不覆盖取消态
      if (job.status === 'cancelled') return;
      finalizeJob(job, true);
    } catch (err: any) {
      if (job.status === 'cancelled') return;
      finalizeJob(job, false, err?.message || '工作流执行失败');
    }
  })();
}

// ==================== 对外 API（供路由调用） ====================

export function start(workflowType: string, projectId: number, params: any): { jobId: string; tasks: LocalWorkflowTask[] } {
  const job = createJob(workflowType, projectId, params);
  jobs.set(job.id, job);
  dispatch(job);
  return { jobId: job.id, tasks: job.tasks };
}

export function getJob(jobId: string): LocalWorkflowJob | null {
  return jobs.get(jobId) || null;
}

export function listJobs(filter: { projectId?: number; workflowType?: string; status?: string; activeOnly?: boolean } = {}): LocalWorkflowJob[] {
  let arr = [...jobs.values()];
  if (filter.projectId !== undefined && filter.projectId !== null) {
    arr = arr.filter((j) => j.project_id === Number(filter.projectId));
  }
  if (filter.workflowType) arr = arr.filter((j) => j.workflow_type === filter.workflowType);
  if (filter.status) arr = arr.filter((j) => j.status === filter.status);
  if (filter.activeOnly) arr = arr.filter((j) => !j.consumed && (j.status === 'running' || j.status === 'pending' || j.status === 'completed' || j.status === 'failed'));
  return arr.sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
}

export function cancel(jobId: string): boolean {
  const job = jobs.get(jobId);
  if (!job) return false;
  if (job.status === 'running' || job.status === 'pending') {
    job.status = 'cancelled';
    const task = job.tasks[job.tasks.length - 1];
    if (task && task.status === 'processing') task.status = 'failed';
    job.completed_at = new Date().toISOString();
  }
  return true;
}

export function resume(jobId: string): boolean {
  const job = jobs.get(jobId);
  if (!job) return false;
  // 本地执行为一次性异步，已完成/失败无法真正续跑；对取消态重新派发一次。
  if (job.status === 'cancelled') {
    job.status = 'running';
    job.error_message = null;
    const task = job.tasks[0];
    if (task) {
      task.status = 'pending';
      task.error_message = null;
      task.progress = 0;
    }
    dispatch(job);
  }
  return true;
}

export function consume(jobId: string): boolean {
  const job = jobs.get(jobId);
  if (!job) return false;
  job.consumed = true;
  return true;
}

export function consumeAllFailed(): number {
  let n = 0;
  for (const job of jobs.values()) {
    if (job.status === 'failed' || job.status === 'cancelled') {
      job.consumed = true;
      n++;
    }
  }
  return n;
}
