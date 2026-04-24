-- 添加密码提示字段（MySQL 5.x 不支持 ADD COLUMN IF NOT EXISTS，需先检查）
-- 执行前请确认 password_hint 列不存在：SHOW COLUMNS FROM users LIKE 'password_hint';
ALTER TABLE users ADD COLUMN password_hint VARCHAR(255) DEFAULT NULL COMMENT '密码提示' AFTER password_hash;
