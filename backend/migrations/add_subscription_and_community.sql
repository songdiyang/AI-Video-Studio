-- 订阅计费、创作者社区和模板库功能数据库迁移
-- 幂等设计：使用 CREATE TABLE IF NOT EXISTS
-- 执行日期：2026-03-23

-- =============================================
-- 1. subscription_plans - 订阅计划表
-- =============================================
CREATE TABLE IF NOT EXISTS subscription_plans (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  display_name VARCHAR(255) NOT NULL,
  price_monthly DECIMAL(10,2) NOT NULL,
  price_yearly DECIMAL(10,2),
  max_projects INT DEFAULT -1,
  max_api_calls_monthly INT DEFAULT 0,
  max_team_members INT DEFAULT 1,
  features_json JSON,
  is_active TINYINT(1) DEFAULT 1,
  sort_order INT DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =============================================
-- 2. user_subscriptions - 用户订阅表
-- =============================================
CREATE TABLE IF NOT EXISTS user_subscriptions (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  plan_id INT NOT NULL,
  status ENUM('active','expired','cancelled','trial') DEFAULT 'trial',
  billing_cycle ENUM('monthly','yearly') DEFAULT 'monthly',
  current_period_start DATETIME,
  current_period_end DATETIME,
  api_calls_used INT DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (plan_id) REFERENCES subscription_plans(id),
  INDEX idx_user_id (user_id),
  INDEX idx_plan_id (plan_id),
  INDEX idx_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =============================================
-- 3. templates - 创作模板表
-- =============================================
CREATE TABLE IF NOT EXISTS templates (
  id INT AUTO_INCREMENT PRIMARY KEY,
  creator_id INT,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  category VARCHAR(100),
  thumbnail_url TEXT,
  template_data JSON NOT NULL,
  tags TEXT,
  use_count INT DEFAULT 0,
  is_official TINYINT(1) DEFAULT 0,
  is_public TINYINT(1) DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (creator_id) REFERENCES users(id) ON DELETE SET NULL,
  INDEX idx_creator_id (creator_id),
  INDEX idx_category (category),
  INDEX idx_is_official (is_official),
  INDEX idx_is_public (is_public)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =============================================
-- 4. creator_profiles - 创作者档案表
-- =============================================
CREATE TABLE IF NOT EXISTS creator_profiles (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL UNIQUE,
  display_name VARCHAR(255),
  avatar_url TEXT,
  bio TEXT,
  social_links JSON,
  total_works INT DEFAULT 0,
  total_views INT DEFAULT 0,
  total_likes INT DEFAULT 0,
  badge VARCHAR(50) DEFAULT 'newcomer',
  is_public TINYINT(1) DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_user_id (user_id),
  INDEX idx_badge (badge)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =============================================
-- 5. showcases - 作品展示表
-- =============================================
CREATE TABLE IF NOT EXISTS showcases (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  project_id INT NOT NULL,
  title VARCHAR(255) NOT NULL,
  description TEXT,
  cover_url TEXT,
  preview_url TEXT,
  tags TEXT,
  view_count INT DEFAULT 0,
  like_count INT DEFAULT 0,
  is_featured TINYINT(1) DEFAULT 0,
  status ENUM('draft','published','hidden') DEFAULT 'draft',
  published_at DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
  INDEX idx_user_id (user_id),
  INDEX idx_project_id (project_id),
  INDEX idx_status (status),
  INDEX idx_is_featured (is_featured)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =============================================
-- 初始化默认订阅套餐数据
-- =============================================
INSERT INTO subscription_plans (name, display_name, price_monthly, price_yearly, max_projects, max_api_calls_monthly, max_team_members, features_json, sort_order) VALUES
('starter', 'Starter', 99.00, 999.00, 1, 10, 1, '["基础工具全开放","单部作品管理","10次/月 API调用","社区浏览"]', 1),
('creator', 'Creator', 499.00, 4999.00, 5, 500, 3, '["完整工作流","5个项目","500次/月 API调用","社区排行榜","模板库访问"]', 2),
('studio', 'Studio', 1999.00, 19999.00, -1, 5000, 10, '["无限项目","5000次/月 API调用","团队协作","版本控制","优先支持"]', 3),
('enterprise', 'Enterprise', 0.00, 0.00, -1, -1, -1, '["定制化接入","私有部署选项","优先技术支持","行业数据反馈","专属客户经理"]', 4)
ON DUPLICATE KEY UPDATE display_name=VALUES(display_name);
