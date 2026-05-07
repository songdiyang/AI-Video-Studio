-- ============================================
-- 扩展市场表结构迁移（幂等）
-- 如果表已存在则跳过
-- ============================================

-- 扩展主表
CREATE TABLE IF NOT EXISTS extensions (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(100) NOT NULL UNIQUE COMMENT '扩展标识名（英文）',
  display_name VARCHAR(200) NOT NULL COMMENT '显示名称',
  description TEXT COMMENT '扩展描述',
  version VARCHAR(50) NOT NULL DEFAULT '0.0.0' COMMENT '当前版本',
  author_id INT DEFAULT NULL COMMENT '作者用户ID',
  author VARCHAR(100) DEFAULT NULL COMMENT '作者显示名',
  category VARCHAR(50) DEFAULT 'other' COMMENT '分类',
  icon_url TEXT DEFAULT NULL COMMENT '图标URL',
  readme TEXT DEFAULT NULL COMMENT 'README 文档',
  manifest_json TEXT DEFAULT NULL COMMENT 'manifest.json 内容',
  source_url TEXT DEFAULT NULL COMMENT '源码地址',
  download_count INT DEFAULT 0 COMMENT '下载次数',
  rating DECIMAL(3,2) DEFAULT 5.00 COMMENT '评分 0-5',
  status ENUM('pending', 'approved', 'rejected', 'delisted') DEFAULT 'pending' COMMENT '审核状态',
  is_active TINYINT(1) DEFAULT 1 COMMENT '是否上架',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_category (category),
  INDEX idx_status (status),
  INDEX idx_is_active (is_active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='扩展市场主表';

-- 扩展版本历史表
CREATE TABLE IF NOT EXISTS extension_versions (
  id INT AUTO_INCREMENT PRIMARY KEY,
  extension_id INT NOT NULL COMMENT '关联扩展ID',
  version VARCHAR(50) NOT NULL COMMENT '版本号',
  changelog TEXT DEFAULT NULL COMMENT '更新日志',
  package_url TEXT DEFAULT NULL COMMENT 'ZIP 包下载地址',
  manifest_json TEXT DEFAULT NULL COMMENT '该版本 manifest',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (extension_id) REFERENCES extensions(id) ON DELETE CASCADE,
  INDEX idx_extension_id (extension_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='扩展版本历史';

-- 用户已安装扩展表
CREATE TABLE IF NOT EXISTS user_extensions (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL COMMENT '用户ID',
  extension_id INT NOT NULL COMMENT '扩展ID',
  installed_version VARCHAR(50) DEFAULT NULL COMMENT '安装的版本',
  is_enabled TINYINT(1) DEFAULT 1 COMMENT '是否启用',
  settings_json TEXT DEFAULT NULL COMMENT '用户配置JSON',
  installed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (extension_id) REFERENCES extensions(id) ON DELETE CASCADE,
  UNIQUE KEY uk_user_extension (user_id, extension_id),
  INDEX idx_user_id (user_id),
  INDEX idx_extension_id (extension_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='用户已安装扩展';
