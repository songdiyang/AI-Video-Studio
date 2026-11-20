// 统一的异常消息提取工具。
// catch 到的值在类型上应为 unknown：可能是 Error、带 message 字段的普通对象，或任意抛出物。
// 用本函数替代 (err: any).message，既保留 Error 的原始 message，又避免对非 Error 抛出物取到 undefined。
export function toErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (err !== null && typeof err === 'object' && 'message' in err) {
    return String((err as { message: unknown }).message);
  }
  return String(err);
}
