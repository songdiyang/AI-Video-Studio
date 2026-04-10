-- 添加新用户首次订阅优惠价格字段
-- 用于显示新用户第一次订阅时的优惠价格

-- 添加首月优惠价格字段（月付）
ALTER TABLE subscription_plans
ADD COLUMN IF NOT EXISTS first_month_price DECIMAL(10,2) DEFAULT NULL
COMMENT '新用户首月优惠价格（月付），NULL 表示无优惠';

-- 添加首年优惠价格字段（年付）
ALTER TABLE subscription_plans
ADD COLUMN IF NOT EXISTS first_year_price DECIMAL(10,2) DEFAULT NULL
COMMENT '新用户首年优惠价格（年付），NULL 表示无优惠';
