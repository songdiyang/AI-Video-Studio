/**
 * 全局错误捕获中间件
 * 捕获未处理的异常、Promise 拒绝和 Express 错误
 */

const { logSystemError } = require('./systemErrorService');

/**
 * Express 错误处理中间件
 * 必须放在所有路由之后
 */
function errorHandlerMiddleware(err, req, res, next) {
  // 记录错误到数据库
  logSystemError({
    errorType: 'api_error',
    errorSource: `${req.method} ${req.path}`,
    error: err,
    request: req,
    userId: req.user?.id,
    userEmail: req.user?.email
  });

  // 返回错误响应
  const statusCode = err.statusCode || err.status || 500;
  res.status(statusCode).json({
    message: err.message || '服务器内部错误',
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  });
}

/**
 * 初始化全局错误捕获
 * 应在应用启动时调用
 */
function initGlobalErrorHandlers() {
  // 捕获未处理的 Promise 拒绝
  process.on('unhandledRejection', (reason, promise) => {
    console.error('[GlobalError] Unhandled Rejection:', reason);
    
    const error = reason instanceof Error ? reason : new Error(String(reason));
    logSystemError({
      errorType: 'unhandled_rejection',
      errorSource: 'process.unhandledRejection',
      error,
      extraContext: {
        promiseInfo: promise?.toString?.() || 'unknown'
      }
    });
  });

  // 捕获未捕获的异常
  process.on('uncaughtException', (error, origin) => {
    console.error('[GlobalError] Uncaught Exception:', error);
    
    logSystemError({
      errorType: 'uncaught_exception',
      errorSource: origin || 'process.uncaughtException',
      error
    });

    // 对于未捕获的异常，记录后继续运行（生产环境可能需要重启）
    // 如果是严重错误，可以选择退出进程
    // process.exit(1);
  });

  console.log('[GlobalError] 全局错误处理器已初始化');
}

/**
 * 包装异步路由处理器，自动捕获错误
 */
function asyncHandler(fn) {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

/**
 * 手动记录系统错误的便捷方法
 */
function logEventError(source, error, extraContext = {}) {
  return logSystemError({
    errorType: 'event_error',
    errorSource: source,
    error,
    extraContext
  });
}

module.exports = {
  errorHandlerMiddleware,
  initGlobalErrorHandlers,
  asyncHandler,
  logEventError
};
