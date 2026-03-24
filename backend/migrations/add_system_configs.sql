-- system_configs 系统配置表
-- 用于存储全局系统配置，如注册开关、站点设置等

CREATE TABLE IF NOT EXISTS system_configs (
  id INT AUTO_INCREMENT PRIMARY KEY,
  config_key VARCHAR(100) NOT NULL UNIQUE COMMENT '配置键名（唯一）',
  config_name VARCHAR(255) NOT NULL COMMENT '配置显示名称',
  config_type ENUM('key_value', 'options', 'text', 'number', 'boolean') DEFAULT 'key_value' COMMENT '配置类型',
  config_value TEXT NOT NULL COMMENT '配置值（JSON格式存储）',
  description TEXT COMMENT '配置说明',
  is_active TINYINT(1) DEFAULT 1 COMMENT '是否激活：1=激活, 0=停用',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_config_key (config_key),
  INDEX idx_is_active (is_active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 插入默认配置：注册功能开关（默认开启）
INSERT INTO system_configs (config_key, config_name, config_type, config_value, description, is_active)
VALUES ('enable_registration', '开放用户注册', 'boolean', 'true', '控制是否允许新用户注册。关闭后注册页面将不可用。', 1)
ON DUPLICATE KEY UPDATE config_name = VALUES(config_name);
