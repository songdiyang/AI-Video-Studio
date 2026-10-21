// 本地 API 服务
// 使用 Tauri 命令完成本地能力，不依赖任何后端服务器
// 非 Tauri 环境下降级为 localStorage 等浏览器原生能力（仅作本地实现，非联网后端）

// 类型定义
export interface AIModelConfig {
  provider: string;
  model_name: string;
  api_key: string;
  api_base?: string;
  enabled?: boolean;
  is_default?: boolean;
}

export interface ProjectMetadata {
  schema_version?: number;
  id: string;
  name: string;
  description?: string;
  project_type: string;
  created_at: string;
  updated_at: string;
  thumbnail_path?: string;
  /** 工程文件夹绝对路径（本地 .jzp 工程） */
  path?: string;
}

export interface MediaFileInfo {
  id: string;
  file_name: string;
  file_path: string;
  file_type: string;
  file_size: number;
  mime_type: string;
  duration?: number;
  width?: number;
  height?: number;
  thumbnail_path?: string;
}

export interface CreateProjectParams {
  name: string;
  description?: string;
  project_type: string;
  /** 工程文件夹父目录；缺省为 文档\AI-Video-Studio作品 */
  parent_dir?: string | null;
}

// 检查是否为 Tauri 环境
export function isTauri(): boolean {
  return typeof window !== 'undefined' && '__TAURI__' in window;
}

// 动态导入 Tauri API
async function getTauriApi() {
  if (!isTauri()) {
    throw new Error('Not in Tauri environment');
  }
  const { invoke } = await import('@tauri-apps/api/core');
  return { invoke };
}

// ==================== AI 模型配置 ====================
// 说明：桌面端（Tauri WebView）与浏览器端统一使用 localStorage 持久化，
// Rust 侧 SQLite 密钥存储命令尚为 TODO 空实现，因此以前端 localStorage 为准。

const AI_CONFIGS_KEY = 'ai_model_configs';

// 各提供商默认 API Base（用于连接测试时未填写 api_base 的情况）
export const DEFAULT_API_BASES: Record<string, string> = {
  deepseek: 'https://api.deepseek.com/v1',
  qwen: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
  doubao: 'https://ark.cn-beijing.volces.com/api/v3',
  zhipu: 'https://open.bigmodel.cn/api/paas/v4',
  openai: 'https://api.openai.com/v1',
  kling: 'https://api.klingai.com',
};

/** 获取模型的 API Base URL（去除末尾斜杠） */
export function getApiBase(config: AIModelConfig): string {
  return (config.api_base || DEFAULT_API_BASES[config.provider] || '').replace(/\/$/, '');
}

function readAIConfigs(): AIModelConfig[] {
  try {
    const list = JSON.parse(localStorage.getItem(AI_CONFIGS_KEY) || '[]');
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

function writeAIConfigs(list: AIModelConfig[]): void {
  localStorage.setItem(AI_CONFIGS_KEY, JSON.stringify(list));
}

export async function saveAIModelKey(config: AIModelConfig): Promise<void> {
  const configs = readAIConfigs();
  const index = configs.findIndex((c) => c.provider === config.provider && c.model_name === config.model_name);
  if (index >= 0) {
    // 更新：保留原有的 enabled / is_default 标记
    configs[index] = {
      ...configs[index],
      ...config,
      enabled: config.enabled ?? configs[index].enabled,
      is_default: config.is_default ?? configs[index].is_default,
    };
  } else {
    const isFirst = configs.length === 0;
    configs.push({ ...config, enabled: config.enabled ?? true, is_default: config.is_default ?? isFirst });
  }
  writeAIConfigs(configs);
}

export async function getAIModelKey(provider: string, modelName: string): Promise<string> {
  const config = readAIConfigs().find((c) => c.provider === provider && c.model_name === modelName);
  return config?.api_key || '';
}

export async function listAIModelConfigs(): Promise<AIModelConfig[]> {
  return readAIConfigs();
}

export async function deleteAIModelConfig(provider: string, modelName: string): Promise<void> {
  const configs = readAIConfigs();
  const wasDefault = configs.some((c) => c.provider === provider && c.model_name === modelName && c.is_default);
  const filtered = configs.filter((c) => !(c.provider === provider && c.model_name === modelName));
  if (wasDefault && filtered.length > 0 && !filtered.some((c) => c.is_default)) {
    const fallback = filtered.find((c) => c.enabled !== false) || filtered[0];
    fallback.is_default = true;
  }
  writeAIConfigs(filtered);
}

// 更新启用 / 默认标记
export async function updateAIModelConfigFlags(
  provider: string,
  modelName: string,
  patch: { enabled?: boolean; is_default?: boolean },
): Promise<void> {
  const configs = readAIConfigs();
  const target = configs.find((c) => c.provider === provider && c.model_name === modelName);
  if (!target) return;
  if (patch.is_default === true) {
    // 全局唯一默认
    configs.forEach((c) => { c.is_default = false; });
    target.is_default = true;
    if (patch.enabled === undefined) target.enabled = true;
  }
  if (patch.is_default === false) {
    target.is_default = false;
  }
  if (typeof patch.enabled === 'boolean') {
    target.enabled = patch.enabled;
    if (!patch.enabled) target.is_default = false;
  }
  writeAIConfigs(configs);
}

// 获取默认且启用的模型（无默认则取第一个启用的）
export async function getDefaultAIModel(): Promise<AIModelConfig | null> {
  const configs = readAIConfigs().filter((c) => c.enabled !== false);
  return configs.find((c) => c.is_default) || configs[0] || null;
}

export interface ConnectionTestResult {
  ok: boolean;
  status: 'success' | 'failed' | 'unknown';
  message: string;
  /** 详细错误信息（用于展示给用户） */
  detail?: string;
}

// 连接测试：向兼容 OpenAI 的 /models 端点发起轻量鉴权请求
export async function testAIModelConnection(config: AIModelConfig): Promise<ConnectionTestResult> {
  if (!config.api_key || !config.api_key.trim()) {
    return { ok: false, status: 'failed', message: 'API Key 为空' };
  }
  const base = getApiBase(config);
  if (!base) {
    return { ok: false, status: 'failed', message: '缺少 API Base，无法测试' };
  }
  const url = `${base.replace(/\/$/, '')}/models`;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    const res = await fetch(url, {
      method: 'GET',
      headers: { Authorization: `Bearer ${config.api_key}` },
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (res.ok) {
      return { ok: true, status: 'success', message: '连接成功，密钥有效' };
    }
    if (res.status === 401 || res.status === 403) {
      return { ok: false, status: 'failed', message: `鉴权失败（${res.status}），请检查密钥` };
    }
    if (res.status === 404) {
      return { ok: false, status: 'unknown', message: '端点不存在（404），该服务商可能不支持 /models' };
    }
    return { ok: false, status: 'failed', message: `请求失败（${res.status}）` };
  } catch (err: any) {
    const msg = err?.name === 'AbortError' ? '连接超时（8s）' : (err?.message || '网络错误 / CORS 受限');
    return { ok: false, status: 'unknown', message: `${msg}，无法从当前环境验证` };
  }
}

// ─── 分类别模型功能测试 ──────────────────────────────────────

/** 测试用的 1x1 像素红色 PNG 图片 base64 */
const TEST_IMAGE_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

/** 将厂商（尤其火山方舟 Ark）常见业务错误转成中文可操作提示；无法识别时返回 null */
function humanizeApiError(status: number, raw: string): string | null {
  const s = raw.toLowerCase();
  if (s.includes('has not activated') || s.includes('not activated') || s.includes('modelnotopen') || s.includes('please activate') || s.includes('not been opened')) {
    return '模型未开通：该模型存在，但当前账号尚未在「火山方舟控制台 → 开通管理」开通其服务。请开通后重试，或改用已开通的模型。';
  }
  if (status === 401 || s.includes('invalid api key') || s.includes('incorrect api key') || s.includes('authentication')) {
    return 'API Key 无效或未授权，请检查密钥是否填写正确。';
  }
  if (status === 403 || s.includes('permission') || s.includes('forbidden')) {
    return '无访问权限：账号可能未获授权访问该模型或接口。';
  }
  if (status === 429 || s.includes('rate limit') || s.includes('too many requests') || s.includes('quota')) {
    return '触发限流或额度不足：请稍后重试，或检查账号额度/欠费。';
  }
  if (status === 404) {
    return '接口或模型不存在：请检查 API Base 与模型 ID 是否正确。';
  }
  return null;
}

/** 从错误响应体中提取可读信息，并尽量映射为中文可操作提示 */
async function extractErrorMessage(res: Response): Promise<string> {
  let raw = '';
  try {
    const body = await res.text();
    // 尝试解析 JSON 错误
    try {
      const json = JSON.parse(body);
      const msg = json?.error?.message || json?.message || json?.error?.code || json?.code;
      raw = msg ? String(msg) : body;
    } catch { /* 非 JSON */ raw = body; }
    if (raw.length > 300) raw = raw.slice(0, 300) + '…';
    if (!raw) raw = res.statusText;
  } catch {
    raw = res.statusText;
  }
  const hint = humanizeApiError(res.status, raw);
  return hint ? `${res.status}: ${hint}（原始信息：${raw}）` : `${res.status}: ${raw}`;
}

/** 通用 fetch 带超时 */
async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs = 15000): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    // 清理请求头中的非 ASCII 字符
    const cleanInit = { ...init };
    if (cleanInit.headers) {
      const headers = cleanInit.headers as Record<string, string>;
      const cleanHeaders: Record<string, string> = {};
      for (const [key, value] of Object.entries(headers)) {
        // 移除所有非 ISO-8859-1 字符
        cleanHeaders[key] = value.replace(/[^\x00-\xFF]/g, '');
      }
      cleanInit.headers = cleanHeaders;
    }
    
    const res = await fetch(url, { ...cleanInit, signal: controller.signal });
    clearTimeout(timer);
    return res;
  } catch (err: any) {
    clearTimeout(timer);
    if (err?.name === 'AbortError') throw new Error(`请求超时（${timeoutMs / 1000}s）`);
    
    // 检测非 ISO-8859-1 字符错误
    if (err?.message?.includes('non ISO-8859-1')) {
      throw new Error('API 密钥包含非法字符（可能包含中文或特殊符号），请检查密钥是否正确复制');
    }
    
    throw err;
  }
}

/**
 * 通过 Tauri `ai_proxy`（Rust reqwest）代发厂商 HTTP 请求，规避 WebView/浏览器 CORS 限制；
 * 非 Tauri 环境或命令缺失（旧构建）时回退浏览器直连 fetchWithTimeout。
 * 返回标准 Response，调用方（res.ok / res.json() / extractErrorMessage）无需改动。
 */
async function proxyVendorFetch(url: string, init: RequestInit, timeoutMs = 15000): Promise<Response> {
  if (isTauri()) {
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      const headers = (init.headers || {}) as Record<string, string>;
      const res: any = await invoke('ai_proxy', {
        req: { url, method: init.method || 'POST', headers, body: typeof init.body === 'string' ? init.body : undefined },
      });
      const status = res?.status ?? 200;
      const bodyText = typeof res?.body === 'string' ? res.body : JSON.stringify(res?.body ?? null);
      return new Response(bodyText, { status, headers: { 'Content-Type': 'application/json' } });
    } catch (err: any) {
      // 仅当 ai_proxy 命令不存在时回退直连；其他错误继续抛出由上层捕获
      if (!/ai_proxy|command not found|unknown command/i.test(err?.message || '')) throw err;
    }
  }
  return fetchWithTimeout(url, init, timeoutMs);
}

/** 文本模型测试：发送"你好" */
async function testTextModel(base: string, apiKey: string, modelId: string): Promise<ConnectionTestResult> {
  const url = `${base}/chat/completions`;
  try {
    const res = await proxyVendorFetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: modelId,
        messages: [{ role: 'user', content: '你好' }],
        max_tokens: 16,
      }),
    });
    if (res.ok) {
      const data = await res.json();
      const reply = data?.choices?.[0]?.message?.content || '';
      return { ok: true, status: 'success', message: `文本模型测试通过，模型回复: "${reply.slice(0, 50)}${reply.length > 50 ? '…' : ''}"` };
    }
    const detail = await extractErrorMessage(res);
    return { ok: false, status: 'failed', message: '文本模型测试失败', detail };
  } catch (err: any) {
    return { ok: false, status: 'failed', message: '文本模型请求异常', detail: err?.message || '网络错误' };
  }
}

/** 多模态模型测试：发送一张图片问"这是什么" */
async function testMultimodalModel(base: string, apiKey: string, modelId: string): Promise<ConnectionTestResult> {
  const url = `${base}/chat/completions`;
  try {
    const res = await proxyVendorFetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: modelId,
        messages: [{
          role: 'user',
          content: [
            { type: 'text', text: '这是什么？请用一句话描述。' },
            { type: 'image_url', image_url: { url: `data:image/png;base64,${TEST_IMAGE_BASE64}` } },
          ],
        }],
        max_tokens: 64,
      }),
    }, 20000);
    if (res.ok) {
      const data = await res.json();
      const reply = data?.choices?.[0]?.message?.content || '';
      return { ok: true, status: 'success', message: `多模态模型测试通过，模型回复: "${reply.slice(0, 80)}${reply.length > 80 ? '…' : ''}"` };
    }
    const detail = await extractErrorMessage(res);
    
    // 友好的错误提示
    if (res.status === 401) {
      return { 
        ok: false, 
        status: 'failed', 
        message: 'API 密钥认证失败', 
        detail: '请检查：\n1. API 密钥是否正确（没有多余空格）\n2. 密钥是否已过期或被撤销\n3. 账户是否有余额或配额\n4. 是否已开通多模态权限\n\n原始错误: ' + detail 
      };
    }
    
    return { ok: false, status: 'failed', message: '多模态模型测试失败', detail };
  } catch (err: any) {
    return { ok: false, status: 'failed', message: '多模态模型请求异常', detail: err?.message || '网络错误' };
  }
}

/** 图片模型测试：请求生成一张极简图片 */
async function testImageModel(base: string, apiKey: string, modelId: string): Promise<ConnectionTestResult> {
  const url = `${base}/images/generations`;
  try {
    const res = await proxyVendorFetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: modelId,
        prompt: 'a red dot on white background',
        n: 1,
        size: '256x256',
      }),
    }, 30000);
    if (res.ok) {
      return { ok: true, status: 'success', message: '图片模型测试通过，成功生成图片' };
    }
    const detail = await extractErrorMessage(res);
    return { ok: false, status: 'failed', message: '图片模型测试失败', detail };
  } catch (err: any) {
    return { ok: false, status: 'failed', message: '图片模型请求异常', detail: err?.message || '网络错误' };
  }
}

/** 视频模型测试：请求生成最低分辨率(480p)、最短时长(4s)的小猫走路视频，尽量少耗额度/时间 */
async function testVideoModel(base: string, apiKey: string, modelId: string): Promise<ConnectionTestResult> {
  // Ark 视频生成为异步任务：POST /contents/generations/tasks 提交，返回任务 id 即视为连通
  const url = `${base}/contents/generations/tasks`;
  try {
    const res = await proxyVendorFetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: modelId,
        content: [{ type: 'text', text: 'A small cat walking on a white floor, minimal quality' }],
        // 测试统一用最低分辨率 + 最短时长（方舟 Seedance 全系最低 480p、最短 4s）
        resolution: '480p',
        duration: 4,
      }),
    }, 30000);
    if (res.ok || res.status === 202) {
      const data = await res.json().catch(() => null);
      const taskId = data?.id || data?.task_id || data?.data?.id;
      if (taskId || res.status === 202) {
        return { ok: true, status: 'success', message: '视频模型测试通过，视频生成任务已提交' };
      }
      return { ok: false, status: 'failed', message: '视频模型测试失败：端点已响应但未返回任务 ID', detail: JSON.stringify(data || {}).slice(0, 300) };
    }
    const detail = await extractErrorMessage(res);
    return { ok: false, status: 'failed', message: '视频模型测试失败', detail };
  } catch (err: any) {
    return { ok: false, status: 'failed', message: '视频模型请求异常', detail: err?.message || '网络错误' };
  }
}

/**
 * 按模型类别执行功能测试
 * @param category 模型类别
 * @param config 模型配置（含 provider / model_name / api_key / api_base）
 */
export async function testModelByCategory(
  category: 'text' | 'multimodal' | 'image' | 'video',
  config: AIModelConfig,
): Promise<ConnectionTestResult> {
  if (!config.api_key?.trim()) {
    return { ok: false, status: 'failed', message: 'API Key 为空' };
  }
  const base = getApiBase(config);
  if (!base) {
    return { ok: false, status: 'failed', message: '缺少 API Base，无法测试' };
  }
  const modelId = config.model_name;
  if (!modelId) {
    return { ok: false, status: 'failed', message: '未指定模型 ID' };
  }

  switch (category) {
    case 'text':
      return testTextModel(base, config.api_key, modelId);
    case 'multimodal':
      return testMultimodalModel(base, config.api_key, modelId);
    case 'image':
      return testImageModel(base, config.api_key, modelId);
    case 'video':
      return testVideoModel(base, config.api_key, modelId);
    default:
      return { ok: false, status: 'failed', message: `未知的模型类别: ${category}` };
  }
}

// ==================== 项目管理（本地 .jzp 工程） ====================
// 桌面端：工程 = 用户目录下的一个文件夹，内含 <名称>.jzp 清单文件，
//         注册表由 Rust 侧 recent_projects.json 维护。
// 浏览器开发模式：用 localStorage 模拟同样的形状，便于 UI 联调。

const BROWSER_PROJECTS_KEY = 'local_projects';

function readBrowserProjects(): ProjectMetadata[] {
  try {
    return JSON.parse(localStorage.getItem(BROWSER_PROJECTS_KEY) || '[]');
  } catch {
    return [];
  }
}

function writeBrowserProjects(list: ProjectMetadata[]) {
  localStorage.setItem(BROWSER_PROJECTS_KEY, JSON.stringify(list));
}

export async function createProject(params: CreateProjectParams): Promise<ProjectMetadata> {
  if (!isTauri()) {
    const now = new Date().toISOString();
    const project: ProjectMetadata = {
      schema_version: 1,
      id: Date.now().toString(),
      name: params.name,
      description: params.description,
      project_type: params.project_type,
      created_at: now,
      updated_at: now,
      path: `local://projects/${encodeURIComponent(params.name)}`,
    };
    const list = readBrowserProjects();
    list.unshift(project);
    writeBrowserProjects(list);
    return project;
  }
  const { invoke } = await getTauriApi();
  return await invoke('create_project', { params });
}

export async function listProjects(): Promise<ProjectMetadata[]> {
  if (!isTauri()) {
    return readBrowserProjects();
  }
  const { invoke } = await getTauriApi();
  return await invoke('list_projects');
}

/** 打开工程（校验清单 + 更新最近打开） */
export async function openProject(path: string): Promise<ProjectMetadata> {
  if (!isTauri()) {
    const project = readBrowserProjects().find((p) => p.path === path);
    if (!project) throw new Error(`工程不存在: ${path}`);
    return project;
  }
  const { invoke } = await getTauriApi();
  return await invoke('open_project', { path });
}

/** 注册一个已存在的工程文件夹或其 .jzp 文件 */
export async function registerProject(path: string): Promise<ProjectMetadata> {
  if (!isTauri()) {
    throw new Error('浏览器模式不支持注册本地工程');
  }
  const { invoke } = await getTauriApi();
  return await invoke('register_project', { path });
}

/** 移除工程（仅注销 / 或连文件一起删除） */
export async function deleteProject(path: string, deleteFiles = false): Promise<void> {
  if (!isTauri()) {
    writeBrowserProjects(readBrowserProjects().filter((p) => p.path !== path));
    return;
  }
  const { invoke } = await getTauriApi();
  return await invoke('delete_project', { path, deleteFiles });
}

/** 更新工程清单的名称/描述（原地覆写 .jzp） */
export async function updateProjectManifest(
  projectPath: string,
  patch: { name?: string; description?: string },
): Promise<ProjectMetadata> {
  if (!isTauri()) {
    const list = readBrowserProjects();
    const project = list.find((p) => p.path === projectPath);
    if (!project) throw new Error(`工程不存在: ${projectPath}`);
    if (patch.name?.trim()) project.name = patch.name.trim();
    if (patch.description !== undefined) project.description = patch.description;
    project.updated_at = new Date().toISOString();
    writeBrowserProjects(list);
    return project;
  }
  const { invoke } = await getTauriApi();
  return await invoke('update_project_manifest', {
    projectPath,
    name: patch.name ?? null,
    description: patch.description ?? null,
  });
}

/** 写入工程 data/ 目录下的 JSON 数据文件 */
export async function saveProjectData(projectPath: string, fileName: string, content: string): Promise<void> {
  if (!isTauri()) {
    localStorage.setItem(`local_project_data:${projectPath}:${fileName}`, content);
    return;
  }
  const { invoke } = await getTauriApi();
  return await invoke('save_project_data', { projectPath, fileName, content });
}

/** 读取工程 data/ 目录下的 JSON 数据文件（不存在返回 null） */
export async function loadProjectData(projectPath: string, fileName: string): Promise<string | null> {
  if (!isTauri()) {
    return localStorage.getItem(`local_project_data:${projectPath}:${fileName}`);
  }
  const { invoke } = await getTauriApi();
  return await invoke('load_project_data', { projectPath, fileName });
}

/** 默认工程根目录（新建对话框预填） */
export async function getDefaultProjectsRoot(): Promise<string> {
  if (!isTauri()) {
    return '文档/AI-Video-Studio作品（浏览器模拟）';
  }
  const { invoke } = await getTauriApi();
  return await invoke('get_default_projects_root');
}

/** localStorage 键：用户自定义的默认工程根目录（空表示使用系统默认） */
const PROJECTS_ROOT_KEY = 'local_default_projects_root';

/** 读取用户设置的默认工程根目录（空串表示沿用系统默认） */
export function getProjectsRootOverride(): string {
  try {
    return localStorage.getItem(PROJECTS_ROOT_KEY) || '';
  } catch {
    return '';
  }
}

/** 设置默认工程根目录（传空串恢复系统默认） */
export function setProjectsRootOverride(dir: string): void {
  try {
    const v = (dir || '').trim();
    if (v) localStorage.setItem(PROJECTS_ROOT_KEY, v);
    else localStorage.removeItem(PROJECTS_ROOT_KEY);
  } catch {
    // 忽略持久化失败
  }
}

/** 生效的工程根目录：优先用户设置，否则系统默认 */
export async function getEffectiveProjectsRoot(): Promise<string> {
  const override = getProjectsRootOverride();
  if (override) return override;
  return getDefaultProjectsRoot();
}


// ==================== 文件操作 ====================

export async function selectFile(title: string, filters?: { name: string; extensions: string[] }[]): Promise<string | null> {
  if (!isTauri()) {
    console.warn('Not in Tauri environment, file selection not available');
    return null;
  }
  const { open } = await import('@tauri-apps/plugin-dialog');
  const result = await open({
    title,
    filters: filters?.map(f => ({ name: f.name, extensions: f.extensions })),
    multiple: false,
  });
  return result as string | null;
}

export async function selectFiles(title: string, filters?: { name: string; extensions: string[] }[]): Promise<string[]> {
  if (!isTauri()) {
    console.warn('Not in Tauri environment, file selection not available');
    return [];
  }
  const { open } = await import('@tauri-apps/plugin-dialog');
  const result = await open({
    title,
    filters: filters?.map(f => ({ name: f.name, extensions: f.extensions })),
    multiple: true,
  });
  return (result as string[]) || [];
}

export async function selectDirectory(title: string): Promise<string | null> {
  if (!isTauri()) {
    console.warn('Not in Tauri environment, directory selection not available');
    return null;
  }
  const { open } = await import('@tauri-apps/plugin-dialog');
  const result = await open({
    title,
    directory: true,
  });
  return result as string | null;
}

export async function showInExplorer(path: string): Promise<void> {
  if (!isTauri()) {
    console.warn('Not in Tauri environment, cannot show in explorer');
    return;
  }
  const { invoke } = await getTauriApi();
  await invoke('show_in_explorer', { path });
}

/** 导入媒体文件到工程 media/ 目录（projectPath 为工程文件夹路径） */
export async function importMediaFile(projectPath: string, sourcePath: string): Promise<MediaFileInfo> {
  if (!isTauri()) {
    throw new Error('Not in Tauri environment');
  }
  const { invoke } = await getTauriApi();
  return await invoke('import_media_file', { projectPath, sourcePath });
}

// ==================== 路径获取 ====================

export async function getAppDataDir(): Promise<string> {
  if (!isTauri()) {
    return '/mock/app/data';
  }
  const { invoke } = await getTauriApi();
  return await invoke('get_app_data_dir');
}

export async function getProjectDir(projectId: string): Promise<string> {
  if (!isTauri()) {
    return `/mock/project/${projectId}`;
  }
  const { invoke } = await getTauriApi();
  return await invoke('get_project_dir', { projectId });
}
