-- 系统错误日志表
-- 用于记录非任务相关的系统错误，如事件触发错误、异常捕获等

CREATE TABLE IF NOT EXISTS system_error_logs (
  id INT AUTO_INCREMENT PRIMARY KEY,
  error_type VARCHAR(50) NOT NULL COMMENT '错误类型：event_error(事件错误), unhandled_rejection(未捕获Promise), uncaught_exception(未捕获异常), api_error(API错误), middleware_error(中间件错误)',
  error_source VARCHAR(255) COMMENT '错误来源（模块/文件/函数名）',
  error_message TEXT NOT NULL COMMENT '错误信息',
  error_stack TEXT COMMENT '错误堆栈',
  request_method VARCHAR(10) COMMENT 'HTTP方法（如果是请求相关）',
  request_url TEXT COMMENT '请求URL（如果是请求相关）',
  request_body JSON COMMENT '请求体（脱敏后）',
  user_id INT DEFAULT NULL COMMENT '关联用户ID（如果有）',
  user_email VARCHAR(255) COMMENT '用户邮箱（如果有）',
  extra_context JSON COMMENT '额外上下文信息',
  is_resolved TINYINT(1) DEFAULT 0 COMMENT '是否已解决：0=待处理, 1=已解决',
  resolved_at DATETIME DEFAULT NULL COMMENT '解决时间',
  resolved_by VARCHAR(255) COMMENT '解决人',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_error_type (error_type),
  INDEX idx_error_source (error_source),
  INDEX idx_user_id (user_id),
  INDEX idx_is_resolved (is_resolved),
  INDEX idx_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
