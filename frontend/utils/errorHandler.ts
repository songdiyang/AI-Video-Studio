/**
 * 统一错误处理工具
 * 
 * 提供一致的错误处理模式，减少重复的 try-catch 代码
 */

/** 错误处理结果 */
export interface ErrorResult<T> {
  success: boolean;
  data?: T;
  error?: Error;
  message?: string;
}

/**
 * 包装异步函数，统一错误处理
 * 
 * @example
 * ```typescript
 * const result = await withErrorHandling(
 *   () => fetchData(),
 *   '获取数据失败'
 * );
 * if (result.success) {
 *   console.log(result.data);
 * } else {
 *   console.error(result.message);
 * }
 * ```
 */
export async function withErrorHandling<T>(
  fn: () => Promise<T>,
  errorMessage = '操作失败',
  options?: {
    /** 是否打印错误日志 */
    logError?: boolean;
    /** 自定义错误转换 */
    transformError?: (err: unknown) => Error;
  }
): Promise<ErrorResult<T>> {
  try {
    const data = await fn();
    return { success: true, data };
  } catch (err) {
    const error = options?.transformError 
      ? options.transformError(err)
      : err instanceof Error ? err : new Error(String(err));
    
    if (options?.logError !== false) {
      console.error(`[Error] ${errorMessage}:`, error);
    }
    
    return {
      success: false,
      error,
      message: error.message || errorMessage,
    };
  }
}

/**
 * 包装同步函数，统一错误处理
 */
export function withErrorHandlingSync<T>(
  fn: () => T,
  errorMessage = '操作失败',
  options?: {
    logError?: boolean;
    transformError?: (err: unknown) => Error;
  }
): ErrorResult<T> {
  try {
    const data = fn();
    return { success: true, data };
  } catch (err) {
    const error = options?.transformError
      ? options.transformError(err)
      : err instanceof Error ? err : new Error(String(err));
    
    if (options?.logError !== false) {
      console.error(`[Error] ${errorMessage}:`, error);
    }
    
    return {
      success: false,
      error,
      message: error.message || errorMessage,
    };
  }
}

/**
 * 带重试的错误处理
 * 
 * @example
 * ```typescript
 * const result = await withRetry(
 *   () => fetchData(),
 *   { maxRetries: 3, delayMs: 1000 }
 * );
 * ```
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  options?: {
    maxRetries?: number;
    delayMs?: number;
    backoff?: boolean;
    onRetry?: (attempt: number, error: Error) => void;
  }
): Promise<T> {
  const maxRetries = options?.maxRetries ?? 3;
  const baseDelay = options?.delayMs ?? 1000;
  const backoff = options?.backoff ?? true;
  
  let lastError: Error;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      
      if (attempt < maxRetries) {
        options?.onRetry?.(attempt, lastError);
        const delay = backoff ? baseDelay * attempt : baseDelay;
        await sleep(delay);
      }
    }
  }
  
  throw lastError!;
}

/**
 * 带超时的错误处理
 */
export async function withTimeout<T>(
  fn: () => Promise<T>,
  timeoutMs: number,
  timeoutMessage = '操作超时'
): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  
  try {
    return await fn();
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      throw new Error(timeoutMessage);
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * 安全执行：不抛出错误，返回默认值
 */
export async function safeExecute<T>(
  fn: () => Promise<T>,
  defaultValue: T
): Promise<T> {
  try {
    return await fn();
  } catch {
    return defaultValue;
  }
}

/**
 * 安全执行同步函数
 */
export function safeExecuteSync<T>(fn: () => T, defaultValue: T): T {
  try {
    return fn();
  } catch {
    return defaultValue;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * 从错误对象提取用户友好的消息
 */
export function extractErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === 'string') return err;
  if (err && typeof err === 'object') {
    const obj = err as Record<string, unknown>;
    if (typeof obj.message === 'string') return obj.message;
    if (typeof obj.error === 'string') return obj.error;
    if (typeof obj.msg === 'string') return obj.msg;
  }
  return '未知错误';
}

/**
 * 创建标准化的错误对象
 */
export function createError(message: string, code?: string, details?: unknown): Error {
  const error = new Error(message);
  if (code) (error as any).code = code;
  if (details) (error as any).details = details;
  return error;
}
