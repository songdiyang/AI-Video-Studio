-- 添加积分预警阈值字段到 users 表
ALTER TABLE users ADD COLUMN points_warning_threshold INT DEFAULT NULL COMMENT '积分预警阈值，余额低于此值时自动发送站内信警告，NULL表示不启用';
