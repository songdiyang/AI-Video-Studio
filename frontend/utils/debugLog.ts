// 轻量调试日志：默认静默，避免后台轮询等常规事件刷屏控制台。
// 排查问题时在控制台执行 localStorage.setItem('nanostory_debug', '1') 后刷新即可开启。
export function debugLog(scope: string, ...args: unknown[]): void {
  try {
    if (localStorage.getItem('nanostory_debug') !== '1') return;
  } catch {
    return;
  }
  console.log(`[${scope}]`, ...args);
}
