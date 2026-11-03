/**
 * AI 助手面板的「显示作用域」存储键
 * ──────────────────────────────────────────────
 * 面板的对话消息、标签栏打开集、激活会话都按工程 id 落 localStorage；
 * 无工程（欢迎页 / 应用级标签页）时用 global 作用域。
 *
 * 工程 id 来自工程路径哈希（services/projects.localProjectId），删除工程后
 * 在同一个位置重建同名工程会复用同一个 id —— 若不显式清理，新建的空白工程
 * 会直接显示上一个工程残留的对话缓存。因此新建工程时必须清掉该作用域缓存。
 */

/** 对话消息缓存键（面板内 messages 落盘位置） */
export function chatStorageKey(projectId: number | null | undefined): string {
  return projectId ? `ai_chat_${projectId}` : 'ai_chat_global';
}

/** 当前激活会话键 */
export function activeSessionStorageKey(projectId: number | null | undefined): string {
  return projectId ? `ai_active_session_${projectId}` : 'ai_active_session_global';
}

/** 标签栏打开集键 */
export function openTabsStorageKey(projectId: number | null | undefined): string {
  return projectId ? `ai_open_tabs_${projectId}` : 'ai_open_tabs_global';
}

/**
 * 清空某工程的 AI 助手显示缓存（对话、标签栏、激活会话）。
 * 只用于「全新工程」场景：工程文件夹由 create_project 保证不存在同名目录，
 * 因此这些键若有值必然属于上一个复用同一路径的已删除工程。
 */
export function clearProjectDisplayCache(projectId: number): void {
  try {
    localStorage.removeItem(chatStorageKey(projectId));
    localStorage.removeItem(activeSessionStorageKey(projectId));
    localStorage.removeItem(openTabsStorageKey(projectId));
  } catch {
    /* 忽略存储异常 */
  }
}
