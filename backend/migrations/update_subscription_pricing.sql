-- =============================================
-- 更新订阅套餐定价
-- 日期: 2026-04-06
-- 说明: 重新定价所有套餐，重命名套餐标识
-- =============================================

-- 1. 更新免费版（如果存在）
UPDATE subscription_plans SET
  display_name = '免费版',
  price_monthly = 0.00,
  price_yearly = 0.00,
  first_month_price = NULL,
  first_year_price = NULL,
  max_projects = 3,
  max_api_calls_monthly = 2000,
  max_team_members = 1,
  features_json = '["基础AI工具","3个项目","2,000积分/月","社区浏览"]'
WHERE name = 'free';

-- 如果免费版不存在则插入
INSERT INTO subscription_plans (name, display_name, price_monthly, price_yearly, first_month_price, first_year_price, max_projects, max_api_calls_monthly, max_team_members, features_json, sort_order, is_active)
SELECT 'free', '免费版', 0.00, 0.00, NULL, NULL, 3, 2000, 1, '["基础AI工具","3个项目","2,000积分/月","社区浏览"]', 0, 1
FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM subscription_plans WHERE name = 'free');

-- 2. 更新 starter → basic（先改名再更新）
UPDATE subscription_plans SET
  name = 'basic',
  display_name = '基础版',
  price_monthly = 99.00,
  price_yearly = 990.00,
  first_month_price = 49.90,
  first_year_price = NULL,
  max_projects = 20,
  max_api_calls_monthly = 10000,
  max_team_members = 5,
  features_json = '["完整工作流","20个项目","10,000积分/月","模板库访问","社区排行榜"]'
WHERE name = 'starter';

-- 如果已经叫 basic，直接更新价格
UPDATE subscription_plans SET
  display_name = '基础版',
  price_monthly = 99.00,
  price_yearly = 990.00,
  first_month_price = 49.90,
  first_year_price = NULL,
  max_projects = 20,
  max_api_calls_monthly = 10000,
  max_team_members = 5,
  features_json = '["完整工作流","20个项目","10,000积分/月","模板库访问","社区排行榜"]'
WHERE name = 'basic';

-- 3. 更新 creator → pro
UPDATE subscription_plans SET
  name = 'pro',
  display_name = '专业版',
  price_monthly = 299.00,
  price_yearly = 2990.00,
  first_month_price = NULL,
  first_year_price = NULL,
  max_projects = -1,
  max_api_calls_monthly = 30000,
  max_team_members = 15,
  features_json = '["无限项目","30,000积分/月","团队协作","高级AI模型","优先支持"]'
WHERE name = 'creator';

-- 如果已经叫 pro，直接更新价格
UPDATE subscription_plans SET
  display_name = '专业版',
  price_monthly = 299.00,
  price_yearly = 2990.00,
  first_month_price = NULL,
  first_year_price = NULL,
  max_projects = -1,
  max_api_calls_monthly = 30000,
  max_team_members = 15,
  features_json = '["无限项目","30,000积分/月","团队协作","高级AI模型","优先支持"]'
WHERE name = 'pro';

-- 4. 更新 studio → premium
UPDATE subscription_plans SET
  name = 'premium',
  display_name = '旗舰版',
  price_monthly = 888.00,
  price_yearly = 8880.00,
  first_month_price = NULL,
  first_year_price = NULL,
  max_projects = -1,
  max_api_calls_monthly = 90000,
  max_team_members = -1,
  features_json = '["无限项目","90,000积分/月","无限团队成员","全部AI模型","API访问权限","专属客服"]'
WHERE name = 'studio';

-- 如果已经叫 premium，直接更新价格
UPDATE subscription_plans SET
  display_name = '旗舰版',
  price_monthly = 888.00,
  price_yearly = 8880.00,
  first_month_price = NULL,
  first_year_price = NULL,
  max_projects = -1,
  max_api_calls_monthly = 90000,
  max_team_members = -1,
  features_json = '["无限项目","90,000积分/月","无限团队成员","全部AI模型","API访问权限","专属客服"]'
WHERE name = 'premium';

-- 5. 更新排序（确保顺序正确）
UPDATE subscription_plans SET sort_order = 0 WHERE name = 'free';
UPDATE subscription_plans SET sort_order = 1 WHERE name = 'basic';
UPDATE subscription_plans SET sort_order = 2 WHERE name = 'pro';
UPDATE subscription_plans SET sort_order = 3 WHERE name = 'premium';
UPDATE subscription_plans SET sort_order = 4 WHERE name = 'enterprise';

-- 验证
SELECT id, name, display_name, price_monthly, price_yearly, first_month_price, first_year_price, max_projects, max_api_calls_monthly, max_team_members, sort_order
FROM subscription_plans
ORDER BY sort_order ASC;
