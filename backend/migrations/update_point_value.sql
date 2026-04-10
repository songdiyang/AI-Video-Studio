-- 积分单价调整：¥0.02 → ¥0.01（1积分=1分钱，方便用户直观理解消费金额）
-- 执行时间：2026-04-06

-- 1. 更新积分单价配置
UPDATE system_configs 
SET config_value = '0.01',
    description = '1积分对应的人民币金额(元)，1积分=¥0.01=1分钱'
WHERE config_key = 'point_value_cny' 
AND is_active = 1;

-- 2. 订阅套餐积分翻倍（因单价减半，需翻倍保持同等价值）
UPDATE subscription_plans 
SET monthly_points = monthly_points * 2
WHERE is_active = 1;

-- 3. 充值包积分翻倍（如果有 recharge_packages 表的话）
-- UPDATE recharge_packages SET points = points * 2 WHERE is_active = 1;

-- 4. 验证
SELECT config_key, config_value FROM system_configs WHERE config_key = 'point_value_cny';
SELECT id, name, monthly_points FROM subscription_plans WHERE is_active = 1;
