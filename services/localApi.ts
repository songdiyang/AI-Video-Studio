// 本地 API 服务
// 使用 Tauri 命令替代后端 API
// 兼容浏览器环境（开发模式）

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
}

// 连接测试：向兼容 OpenAI 的 /models 端点发起轻量鉴权请求
export async function testAIModelConnection(config: AIModelConfig): Promise<ConnectionTestResult> {
  if (!config.api_key || !config.api_key.trim()) {
    return { ok: false, status: 'failed', message: 'API Key 为空' };
  }
  const base = (config.api_base || DEFAULT_API_BASES[config.provider] || '').trim();
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
