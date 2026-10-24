/**
 * 窗口级工程绑定（VS Code 式多窗口）
 * ──────────────────────────────────────────────────────────────
 * 主窗口沿用 localStorage 里的「上次工程」；由 Rust 命令 open_project_window 打开的
 * 独立窗口则通过 URL 参数 windowProject 绑定自己的工程，且不回写 localStorage，
 * 这样多个窗口可以同时各自运行一个工程而互不覆盖。
 * 同一工程只允许一个窗口打开：后到的窗口会让位并关闭自己。
 */

import { isTauri } from './localApi';

/** 与 src-tauri/src/windows.rs 的 WINDOW_PROJECT_PARAM 保持一致 */
const WINDOW_PROJECT_PARAM = 'windowProject';
/** 独立窗口标记（空白新窗口也带它，避免继承主窗口的「上次工程」） */
const WINDOW_MODE_PARAM = 'window';
const WINDOW_MODE_DETACHED = 'detached';
const LAST_PROJECT_KEY = 'nanostory_last_project_id';

/** 声明本窗口打开某工程；false 表示已被其它窗口占用（Rust 已把那个窗口唤到前台） */
export async function claimProjectWindow(path: string): Promise<boolean> {
  if (!path || !isTauri()) return true;
  try {
    const { invoke } = await import('@tauri-apps/api/core');
    const conflict = await invoke<string | null>('claim_project_window', { path });
    return !conflict;
  } catch (err) {
    console.warn('[windowProject] 工程占用声明失败:', err);
    return true;
  }
}

/** 独立窗口专用：工程已被其它窗口打开时，聚焦原窗口并关闭本窗口 */
export async function claimProjectWindowOrCloseSelf(path: string): Promise<boolean> {
  const acquired = await claimProjectWindow(path);
  if (acquired) return true;
  try {
    const { getCurrentWindow } = await import('@tauri-apps/api/window');
    await getCurrentWindow().close();
  } catch (err) {
    console.warn('[windowProject] 关闭重复工程窗口失败:', err);
  }
  return false;
}

/** 本窗口绑定的工程路径；主窗口返回 null */
export function getWindowProjectPath(): string | null {
  try {
    const params = new URLSearchParams(window.location.search);
    const value = params.get(WINDOW_PROJECT_PARAM);
    return value && value.trim() ? value : null;
  } catch {
    return null;
  }
}

/** 是否为由「新建窗口 / 在新窗口打开」创建的独立窗口 */
export function isDetachedProjectWindow(): boolean {
  try {
    const params = new URLSearchParams(window.location.search);
    return params.get(WINDOW_MODE_PARAM) === WINDOW_MODE_DETACHED || getWindowProjectPath() !== null;
  } catch {
    return getWindowProjectPath() !== null;
  }
}

/** 更新本窗口绑定的工程（仅改 URL，刷新后仍能恢复本窗口的工程） */
export function setWindowProjectPath(path: string | null): void {
  try {
    const url = new URL(window.location.href);
    // 保证独立窗口标记始终存在，否则刷新后会退化成主窗口并继承“上次工程”
    url.searchParams.set(WINDOW_MODE_PARAM, WINDOW_MODE_DETACHED);
    if (path) url.searchParams.set(WINDOW_PROJECT_PARAM, path);
    else url.searchParams.delete(WINDOW_PROJECT_PARAM);
    window.history.replaceState({}, '', url.toString());
  } catch {
    // 忽略：URL 不可写时退化为仅内存状态
  }
}

/**
 * 记住「上次打开的工程」。
 * 独立窗口只在自身 URL 里记录工程，绝不写 localStorage，避免把主窗口的上次工程改掉。
 */
export function rememberProjectId(id: number): void {
  if (isDetachedProjectWindow()) return;
  try {
    localStorage.setItem(LAST_PROJECT_KEY, String(id));
  } catch {
    // 忽略
  }
}

/** 清除「上次打开的工程」（独立窗口不参与） */
export function forgetLastProject(): void {
  if (isDetachedProjectWindow()) return;
  try {
    localStorage.removeItem(LAST_PROJECT_KEY);
  } catch {
    // 忽略
  }
}
